import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** Stories 4.3 e 4.4: código por e-mail, edição de cadastro e refazer check-in (PGlite + migrations reais). */
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
let reg: string;
let regRace: string;
let athleteA: string;
let athleteB: string;
let athleteC: string;

const q = async <T = Record<string, unknown>>(sql: string, params?: unknown[]) => (await db.query<T>(sql, params)).rows;
const rpc = async (fn: string, ...args: unknown[]) =>
  (await q<{ r: Record<string, unknown> }>(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(",")}) as r`, args))[0].r;

/** Executa como um papel (e usuário) e volta ao superusuário. */
async function asRole<T = Record<string, unknown>>(role: "anon" | "authenticated", uid: string | null, sql: string, params?: unknown[]) {
  await db.exec(`set role ${role}; set app.uid = '${uid ?? ""}'`);
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec("reset role; set app.uid = ''");
  }
}
const adminRpc = async (fn: string, ...args: unknown[]) =>
  (await asRole<{ r: Record<string, unknown> }>("authenticated", admin, `select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(",")}) as r`, args))[0].r;

const checkinRow = (athleteId: string) => `
  insert into public.athlete_checkins (athlete_id, terms_version, terms_text, full_name, birth_date, phone, email,
    emergency_name, emergency_phone, competition, category, parq, parq_any_yes, image_consent, is_minor, place,
    signature_path, certificate_path, verified_email)
  values ('${athleteId}', 'v1', 'texto', 'Ana Souza', '2000-01-01', '83999990000', 'ana@e.com', 'Mãe', '83988880000',
    'Híbrido Games', 'Dupla', '[false,false,false,false,false,false,false,false,false,false]', false, true, false,
    'João Pessoa', '${athleteId}/assinatura.png', '${athleteId}/atestado.pdf', 'capitao@e.com')`;

/** Faz o último código do e-mail parecer antigo, para passar do intervalo de 60 s. */
const age = (email: string, interval = "2 minutes") =>
  db.exec(`update public.athlete_email_codes set created_at = created_at - interval '${interval}' where email = '${email}'`);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(INFRA);
  for (const file of fs.readdirSync(MIGRATIONS).sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8").replace(/create extension if not exists pgcrypto[^;]*;/i, ""));
  }
  [{ id: admin }] = await q<{ id: string }>("insert into auth.users default values returning id");
  [{ id: staff }] = await q<{ id: string }>("insert into auth.users default values returning id");
  await db.exec(`insert into public.profiles (user_id, name, email, role) values
    ('${admin}','Adm Teste','adm@e.com','admin'), ('${staff}','Stf','stf@e.com','staff')`);

  [{ id: reg }] = await q<{ id: string }>(`insert into public.athlete_registrations
    (source_key, competition, category, team_name, kind, email) values
    ('k1', 'hibrido-games', 'Dupla Rx Masculino', 'Equipe A', 'dupla', 'capitao@e.com') returning id`);
  [{ id: regRace }] = await q<{ id: string }>(`insert into public.athlete_registrations
    (source_key, competition, category, team_name, kind, email) values
    ('k2', 'hibrido-race', 'Individual Masculino', 'Atleta C', 'individual', 'solo@e.com') returning id`);
  [{ id: athleteA }] = await q<{ id: string }>(`insert into public.athletes (registration_id, source_key, full_name, position)
    values ('${reg}', 'k1|a', 'Atleta A', 1) returning id`);
  [{ id: athleteB }] = await q<{ id: string }>(`insert into public.athletes (registration_id, source_key, full_name, position)
    values ('${reg}', 'k1|b', 'Atleta B', 2) returning id`);
  [{ id: athleteC }] = await q<{ id: string }>(`insert into public.athletes (registration_id, source_key, full_name, position)
    values ('${regRace}', 'k2|c', 'Atleta C', 1) returning id`);
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("código pelo e-mail da inscrição", () => {
  it("aceita o e-mail com maiúsculas e espaços e exige 60 s entre envios", async () => {
    expect(await rpc("issue_checkin_email_code", "  Capitao@E.com ", "h1", "1.1.1.1")).toEqual({ status: "ok", email: "capitao@e.com" });
    const again = await rpc("issue_checkin_email_code", "capitao@e.com", "h2", "1.1.1.1");
    expect(again.status).toBe("cooldown");
    expect(again.wait).toBeGreaterThan(0);
  });

  it("um novo código invalida o anterior; até 5 por hora por e-mail", async () => {
    await age("capitao@e.com");
    expect((await rpc("issue_checkin_email_code", "capitao@e.com", "h2", null)).status).toBe("ok");
    const [old] = await q<{ expired: boolean }>(`select expires_at <= now() as expired from public.athlete_email_codes where code_hash = 'h1'`);
    expect(old.expired).toBe(true);
    for (const h of ["h3", "h4", "h5"]) {
      await age("capitao@e.com");
      expect((await rpc("issue_checkin_email_code", "capitao@e.com", h, null)).status).toBe("ok");
    }
    await age("capitao@e.com");
    expect((await rpc("issue_checkin_email_code", "capitao@e.com", "h6", null)).status).toBe("limit");
  });

  it("código errado conta tentativas; o certo abre sessão de 2 h", async () => {
    await age("capitao@e.com", "2 hours");
    expect((await rpc("issue_checkin_email_code", "capitao@e.com", "certo", null)).status).toBe("ok");
    expect(await rpc("verify_checkin_email_code", "capitao@e.com", "errado", "s")).toEqual({ status: "invalid", remaining: 4 });
    expect(await rpc("verify_checkin_email_code", "CAPITAO@e.com", "certo", "sess1")).toEqual({ status: "ok", email: "capitao@e.com" });
    const [row] = await q<{ ok: boolean }>(
      `select session_expires_at between now() + interval '119 minutes' and now() + interval '121 minutes' as ok
         from public.athlete_email_codes where session_hash = 'sess1'`,
    );
    expect(row.ok).toBe(true);
    // O código já usado não abre outra sessão (o mais recente pendente é um anterior, já vencido).
    expect((await rpc("verify_checkin_email_code", "capitao@e.com", "certo", "outra")).status).not.toBe("ok");
  });

  it("bloqueia na quinta tentativa errada", async () => {
    await age("solo@e.com", "2 hours");
    expect((await rpc("issue_checkin_email_code", "solo@e.com", "c1", null)).status).toBe("ok");
    for (let i = 0; i < 4; i++) await rpc("verify_checkin_email_code", "solo@e.com", "x", "s");
    expect(await rpc("verify_checkin_email_code", "solo@e.com", "x", "s")).toEqual({ status: "locked" });
    expect(await rpc("verify_checkin_email_code", "solo@e.com", "c1", "s")).toEqual({ status: "locked" });
  });

  it("e-mail sem inscrição aprovada responde not_found e conta para o limite do IP", async () => {
    expect(await rpc("issue_checkin_email_code", "ninguem@e.com", "x", "9.9.9.9")).toEqual({ status: "not_found" });
    await db.exec(`update public.athlete_registrations set status = 'cancelado' where id = '${regRace}'`);
    expect(await rpc("issue_checkin_email_code", "solo@e.com", "x", "9.9.9.9")).toEqual({ status: "not_found" });
    await db.exec(`update public.athlete_registrations set status = 'aprovado' where id = '${regRace}'`);

    for (let i = 0; i < 8; i++) await rpc("issue_checkin_email_code", `n${i}@e.com`, "x", "9.9.9.9");
    // Dez e-mails não encontrados na última hora: o IP fica bloqueado, até para e-mail válido.
    expect(await rpc("issue_checkin_email_code", "solo@e.com", "x", "9.9.9.9")).toEqual({ status: "ip_limit" });
    // Outro IP segue normal; e-mails encontrados não contam.
    await age("solo@e.com", "2 hours");
    expect((await rpc("issue_checkin_email_code", "solo@e.com", "x2", "8.8.8.8")).status).toBe("ok");
    const [{ n }] = await q<{ n: number }>(`select count(*)::int as n from public.athlete_email_misses where ip = '8.8.8.8'`);
    expect(n).toBe(0);
  });

  it("e-mail com todos os atletas confirmados responde done", async () => {
    await db.query(checkinRow(athleteC));
    await age("solo@e.com", "2 hours");
    expect(await rpc("issue_checkin_email_code", "solo@e.com", "x", null)).toEqual({ status: "done" });
    await db.exec(`delete from public.athlete_checkins where athlete_id = '${athleteC}'`);
  });

  it("visitante e usuário logado não acessam códigos nem as funções", async () => {
    await expect(asRole("anon", null, "select * from public.athlete_email_codes")).rejects.toThrow(/permission denied/);
    await expect(asRole("authenticated", admin, "select * from public.athlete_email_misses")).rejects.toThrow(/permission denied/);
    await expect(asRole("anon", null, `select public.issue_checkin_email_code('capitao@e.com', 'z', null)`)).rejects.toThrow(/permission denied/);
    await expect(asRole("authenticated", admin, `select public.verify_checkin_email_code('capitao@e.com', 'z', 'z')`)).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("editar cadastro", () => {
  it("staff e visitante não editam", async () => {
    await expect(
      asRole("authenticated", staff, `select public.admin_update_athlete('${athleteA}', '{"full_name":"X"}', '{}')`),
    ).rejects.toThrow(/not_authorized/);
    await expect(asRole("anon", null, `select public.admin_update_athlete('${athleteA}', '{"full_name":"X"}', '{}')`)).rejects.toThrow(
      /permission denied/,
    );
  });

  it("grava só o que mudou, normaliza e marca os campos editados", async () => {
    const result = await adminRpc(
      "admin_update_athlete",
      athleteA,
      { full_name: "  Atleta   Alfa ", instagram: "", shirt_size: null },
      { email: " Novo@E.com ", team_name: "Equipe A", category: "Dupla Scale Masculino", box: "" },
    );
    expect(result.status).toBe("ok");
    expect([...(result.fields as string[])].sort()).toEqual(["category", "email", "full_name"]);

    const [a] = await q<{ full_name: string; instagram: string | null; admin_edited_fields: string[] }>(
      `select full_name, instagram, admin_edited_fields from public.athletes where id = $1`,
      [athleteA],
    );
    expect(a).toEqual({ full_name: "Atleta Alfa", instagram: null, admin_edited_fields: ["full_name"] });
    const [r] = await q<{ email: string; category: string; admin_edited_fields: string[] }>(
      `select email, category, admin_edited_fields from public.athlete_registrations where id = $1`,
      [reg],
    );
    expect(r).toEqual({ email: "novo@e.com", category: "Dupla Scale Masculino", admin_edited_fields: ["category", "email"] });
  });

  it("registra no histórico quem fez e o antes/depois", async () => {
    const [log] = await q<{ actor_name: string; kind: string; detail: { changes: Record<string, { from: string; to: string }> } }>(
      `select actor_name, kind, detail from public.athlete_audit_log where athlete_id = $1 order by id desc limit 1`,
      [athleteA],
    );
    expect(log.actor_name).toBe("Adm Teste");
    expect(log.kind).toBe("edit");
    expect(log.detail.changes.email).toEqual({ from: "capitao@e.com", to: "novo@e.com" });
    expect(log.detail.changes.full_name).toEqual({ from: "Atleta A", to: "Atleta Alfa" });
  });

  it("sem mudança não grava nada", async () => {
    const before = await q(`select id from public.athlete_audit_log`);
    expect(await adminRpc("admin_update_athlete", athleteA, { full_name: "Atleta Alfa" }, { email: "novo@e.com" })).toEqual({
      status: "unchanged",
    });
    expect(await q(`select id from public.athlete_audit_log`)).toHaveLength(before.length);
  });

  it("valores inválidos são recusados pelo banco", async () => {
    await expect(adminRpc("admin_update_athlete", athleteA, {}, { competition: "outra" })).rejects.toThrow(/check/);
    await expect(adminRpc("admin_update_athlete", athleteA, { full_name: "  " }, {})).rejects.toThrow(/null|check/);
  });

  it("com o e-mail trocado, o antigo não recebe mais código desta inscrição", async () => {
    await age("capitao@e.com", "2 hours");
    expect(await rpc("issue_checkin_email_code", "capitao@e.com", "x", null)).toEqual({ status: "not_found" });
    await age("novo@e.com", "2 hours");
    expect((await rpc("issue_checkin_email_code", "novo@e.com", "x", null)).status).toBe("ok");
  });

  it("admin lê o histórico; staff não", async () => {
    expect((await asRole("authenticated", admin, "select id from public.athlete_audit_log")).length).toBeGreaterThan(0);
    expect(await asRole("authenticated", staff, "select id from public.athlete_audit_log")).toHaveLength(0);
  });
});

describe("refazer check-in", () => {
  it("arquiva o termo, libera o atleta e registra o motivo", async () => {
    await db.query(checkinRow(athleteB));
    const result = await adminRpc("admin_reset_athlete_checkin", athleteB, "atestado", "  Foto cortada ");
    expect(result.status).toBe("ok");

    expect(await q(`select id from public.athlete_checkins where athlete_id = $1`, [athleteB])).toHaveLength(0);
    const [archived] = await q<{ reason: string; reason_note: string; archived_by_name: string; path: string }>(
      `select reason, reason_note, archived_by_name, checkin ->> 'certificate_path' as path
         from public.athlete_checkins_archive where athlete_id = $1`,
      [athleteB],
    );
    expect(archived).toEqual({ reason: "atestado", reason_note: "Foto cortada", archived_by_name: "Adm Teste", path: `${athleteB}/atestado.pdf` });

    const [log] = await q<{ kind: string; reason: string }>(
      `select kind, detail ->> 'reason' as reason from public.athlete_audit_log where athlete_id = $1 order by id desc limit 1`,
      [athleteB],
    );
    expect(log).toEqual({ kind: "reset", reason: "atestado" });
  });

  it("o atleta pode assinar de novo", async () => {
    await db.query(checkinRow(athleteB));
    expect(await q(`select id from public.athlete_checkins where athlete_id = $1`, [athleteB])).toHaveLength(1);
  });

  it("motivo “outro” exige texto; motivo desconhecido é recusado", async () => {
    await expect(adminRpc("admin_reset_athlete_checkin", athleteB, "outro", " ")).rejects.toThrow(/note_required/);
    await expect(adminRpc("admin_reset_athlete_checkin", athleteB, "qualquer", null)).rejects.toThrow(/invalid_reason/);
  });

  it("atleta sem check-in responde none", async () => {
    expect(await adminRpc("admin_reset_athlete_checkin", athleteC, "dados", null)).toEqual({ status: "none" });
  });

  it("só admin refaz; admin lê o arquivo, staff não", async () => {
    await expect(
      asRole("authenticated", staff, `select public.admin_reset_athlete_checkin('${athleteB}', 'dados', null)`),
    ).rejects.toThrow(/not_authorized/);
    expect(await asRole("authenticated", admin, "select id from public.athlete_checkins_archive")).toHaveLength(1);
    expect(await asRole("authenticated", staff, "select id from public.athlete_checkins_archive")).toHaveLength(0);
    await expect(asRole("anon", null, "select id from public.athlete_checkins_archive")).rejects.toThrow(/permission denied/);
  });
});
