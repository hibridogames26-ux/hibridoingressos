import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** Check-in do atleta num Postgres em memória (PGlite) com as migrations reais. */
const MIGRATIONS = path.resolve(__dirname, "../../supabase/migrations");

const INFRA = `
  create schema extensions; create schema auth;
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  grant usage on schema public, extensions, auth to anon, authenticated, service_role;
  create table auth.users (id uuid primary key default gen_random_uuid());
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
  create function extensions.gen_random_bytes(n int) returns bytea language sql volatile as $$
    select decode(substr(replace(gen_random_uuid()::text || gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, n * 2), 'hex') $$;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`;

let db: PGlite;
let admin: string;
let staff: string;
let athleteA: string;
let athleteB: string;
const q = async <T = Record<string, unknown>>(sql: string, params?: unknown[]) => (await db.query<T>(sql, params)).rows;
const rpc = async (fn: string, ...args: unknown[]) =>
  (await q<{ r: Record<string, unknown> }>(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(",")}) as r`, args))[0].r;

async function asRole<T>(role: "anon" | "authenticated", uid: string | null, sql: string) {
  await db.exec(`set role ${role}; set app.uid = '${uid ?? ""}'`);
  try {
    return await q<T>(sql);
  } finally {
    await db.exec("reset role; set app.uid = ''");
  }
}

const checkinRow = (athleteId: string, extra = "") => `
  insert into public.athlete_checkins (athlete_id, terms_version, terms_text, full_name, birth_date, phone, email,
    emergency_name, emergency_phone, competition, category, parq, parq_any_yes, image_consent, is_minor, place,
    signature_path, certificate_path, verified_email ${extra ? ", guardian_name" : ""})
  values ('${athleteId}', 'v1', 'texto', 'Ana Souza', '2000-01-01', '83999990000', 'ana@e.com', 'Mãe', '83988880000',
    'Híbrido Games', 'Dupla', '[false,false,false,false,false,false,false,false,false,false]', false, true, ${extra ? "true" : "false"},
    'João Pessoa', 'a/assinatura.png', 'a/atestado.pdf', 'ana@e.com' ${extra ? `, '${extra}'` : ""})`;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(INFRA);
  for (const file of fs.readdirSync(MIGRATIONS).sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8").replace(/create extension if not exists pgcrypto[^;]*;/i, ""));
  }
  [{ id: admin }] = await q<{ id: string }>("insert into auth.users default values returning id");
  [{ id: staff }] = await q<{ id: string }>("insert into auth.users default values returning id");
  await db.exec(`insert into public.profiles (user_id, name, email, role) values
    ('${admin}','Adm','adm@e.com','admin'), ('${staff}','Stf','stf@e.com','staff')`);

  const [{ id: reg }] = await q<{ id: string }>(`insert into public.athlete_registrations
    (source_key, competition, category, team_name, kind, email) values
    ('k1', 'hibrido-games', 'Dupla Rx Masculino', 'Equipe A', 'dupla', 'capitao@e.com') returning id`);
  [{ id: athleteA }] = await q<{ id: string }>(`insert into public.athletes (registration_id, source_key, full_name, position)
    values ('${reg}', 'k1|a', 'Atleta A', 1) returning id`);
  [{ id: athleteB }] = await q<{ id: string }>(`insert into public.athletes (registration_id, source_key, full_name, position)
    values ('${reg}', 'k1|b', 'Atleta B', 2) returning id`);
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("código de confirmação", () => {
  it("vai para o e-mail da inscrição e exige 60 s entre envios", async () => {
    expect(await rpc("issue_checkin_code", athleteB, "h1")).toEqual({ status: "ok", email: "capitao@e.com" });
    const again = await rpc("issue_checkin_code", athleteB, "h2");
    expect(again.status).toBe("cooldown");
    expect(again.wait).toBeGreaterThan(0);
  });

  it("um novo código invalida o anterior; até 5 por hora", async () => {
    await db.exec(`update public.athlete_checkin_codes set created_at = now() - interval '2 minutes' where athlete_id = '${athleteB}'`);
    expect((await rpc("issue_checkin_code", athleteB, "h2")).status).toBe("ok");
    const [old] = await q<{ expired: boolean }>(
      `select expires_at <= now() as expired from public.athlete_checkin_codes where athlete_id = $1 and code_hash = 'h1'`,
      [athleteB],
    );
    expect(old.expired).toBe(true);

    for (const h of ["h3", "h4", "h5"]) {
      await db.exec(`update public.athlete_checkin_codes set created_at = created_at - interval '2 minutes' where athlete_id = '${athleteB}'`);
      expect((await rpc("issue_checkin_code", athleteB, h)).status).toBe("ok");
    }
    await db.exec(`update public.athlete_checkin_codes set created_at = created_at - interval '2 minutes' where athlete_id = '${athleteB}'`);
    expect((await rpc("issue_checkin_code", athleteB, "h6")).status).toBe("limit");
  });

  it("código errado conta tentativas e bloqueia na quinta", async () => {
    expect(await rpc("verify_checkin_code", athleteB, "errado", "s")).toEqual({ status: "invalid", remaining: 4 });
    for (let i = 0; i < 3; i++) await rpc("verify_checkin_code", athleteB, "errado", "s");
    expect(await rpc("verify_checkin_code", athleteB, "errado", "s")).toEqual({ status: "locked" });
    // Bloqueado: nem o código certo passa.
    expect(await rpc("verify_checkin_code", athleteB, "h5", "s")).toEqual({ status: "locked" });
  });

  it("código certo abre sessão de 2 h, uma única vez", async () => {
    expect((await rpc("issue_checkin_code", athleteA, "codeA")).status).toBe("ok");
    expect(await rpc("verify_checkin_code", athleteA, "codeA", "sessA")).toEqual({ status: "ok", email: "capitao@e.com" });
    const [row] = await q<{ ok: boolean }>(
      `select session_expires_at between now() + interval '119 minutes' and now() + interval '121 minutes' as ok
         from public.athlete_checkin_codes where session_hash = 'sessA'`,
    );
    expect(row.ok).toBe(true);
    expect(await rpc("verify_checkin_code", athleteA, "codeA", "outra")).toEqual({ status: "none" });
  });

  it("código vencido é recusado", async () => {
    await db.exec(`update public.athlete_checkin_codes set created_at = created_at - interval '2 hours' where athlete_id = '${athleteA}'`);
    expect((await rpc("issue_checkin_code", athleteA, "codeA2")).status).toBe("ok");
    await db.exec(`update public.athlete_checkin_codes set expires_at = now() - interval '1 second' where code_hash = 'codeA2'`);
    expect(await rpc("verify_checkin_code", athleteA, "codeA2", "s2")).toEqual({ status: "expired" });
  });

  it("atleta de inscrição cancelada ou inexistente não recebe código", async () => {
    expect(await rpc("issue_checkin_code", "00000000-0000-0000-0000-000000000000", "x")).toEqual({ status: "not_found" });
    await db.exec(`update public.athlete_registrations set status = 'cancelado'`);
    expect(await rpc("issue_checkin_code", athleteA, "x")).toEqual({ status: "not_found" });
    await db.exec(`update public.athlete_registrations set status = 'aprovado'`);
  });
});

describe("termo assinado", () => {
  it("menor de idade exige dados e assinatura do responsável", async () => {
    await expect(db.query(checkinRow(athleteA, "Maria"))).rejects.toThrow("athlete_checkins_guardian_when_minor");
  });

  it("um check-in por atleta; depois dele não sai mais código", async () => {
    await db.query(checkinRow(athleteA));
    await expect(db.query(checkinRow(athleteA))).rejects.toThrow(/duplicate key/);
    await db.exec(`update public.athlete_checkin_codes set created_at = created_at - interval '2 hours' where athlete_id = '${athleteA}'`);
    expect(await rpc("issue_checkin_code", athleteA, "y")).toEqual({ status: "done" });
  });

  it("PAR-Q precisa ter as 10 respostas", async () => {
    await expect(
      db.query(checkinRow(athleteB).replace("'[false,false,false,false,false,false,false,false,false,false]'", "'[false]'")),
    ).rejects.toThrow(/athlete_checkins_parq_check/);
  });
});

describe("acesso", () => {
  it("visitante não lê nada nem chama as funções", async () => {
    await expect(asRole("anon", null, "select * from public.athletes")).rejects.toThrow(/permission denied/);
    await expect(asRole("anon", null, "select * from public.athlete_checkins")).rejects.toThrow(/permission denied/);
    await expect(asRole("anon", null, "select * from public.athlete_checkin_codes")).rejects.toThrow(/permission denied/);
    await expect(asRole("anon", null, `select public.issue_checkin_code('${athleteB}', 'z')`)).rejects.toThrow(/permission denied/);
    await expect(asRole("authenticated", staff, `select public.verify_checkin_code('${athleteB}', 'z', 'z')`)).rejects.toThrow(/permission denied/);
  });

  it("staff não vê check-ins; admin vê", async () => {
    expect(await asRole("authenticated", staff, "select id from public.athlete_checkins")).toHaveLength(0);
    expect(await asRole("authenticated", admin, "select id from public.athlete_checkins")).toHaveLength(1);
    await expect(asRole("authenticated", admin, "select * from public.athlete_checkin_codes")).rejects.toThrow(/permission denied/);
  });
});
