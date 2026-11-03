import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** Story 4.5: novo cadastro, excluir cadastro manual e check-in presencial (PGlite + migrations reais). */
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

const q = async <T = Record<string, unknown>>(sql: string, params?: unknown[]) => (await db.query<T>(sql, params)).rows;

/** Executa como um papel (e usuário) e volta ao superusuário. */
async function asRole<T = Record<string, unknown>>(role: "anon" | "authenticated", uid: string | null, sql: string, params?: unknown[]) {
  await db.exec(`set role ${role}; set app.uid = '${uid ?? ""}'`);
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec("reset role; set app.uid = ''");
  }
}

type Result = { status: string; registration_id?: string; athlete_ids?: string[]; athlete_id?: string; athletes?: string[] };

const create = async (uid: string | null, registration: Record<string, unknown>, athletes: Record<string, unknown>[]) =>
  (
    await asRole<{ r: Result }>("authenticated", uid, "select public.admin_create_registration($1, $2) as r", [
      JSON.stringify(registration),
      JSON.stringify(athletes),
    ])
  )[0].r;

const remove = async (uid: string | null, registration: string) =>
  (await asRole<{ r: Result }>("authenticated", uid, "select public.admin_delete_registration($1) as r", [registration]))[0].r;

const solo = {
  competition: "hibrido-race",
  category: " Individual  Feminino ",
  team_name: "Ana Souza",
  kind: "individual",
  email: " Ana@E.com ",
  phone: "",
  box: "CT  249",
};

const checkinRow = (athleteId: string) => `
  insert into public.athlete_checkins (athlete_id, terms_version, terms_text, full_name, birth_date, phone, email,
    emergency_name, emergency_phone, competition, category, parq, parq_any_yes, image_consent, is_minor, place,
    signature_path, certificate_path, verified_email, recorded_by, recorded_by_name)
  values ('${athleteId}', 'v1', 'texto', 'Ana Souza', '2000-01-01', '83999990000', 'ana@e.com', 'Mãe', '83988880000',
    'Híbrido Race', 'Individual', '[false,false,false,false,false,false,false,false,false,false]', false, true, false,
    'João Pessoa', '${athleteId}/assinatura.png', '${athleteId}/atestado.pdf', 'adm@e.com', '${admin}', 'Adm Teste')`;

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
  // Inscrição da planilha, para conferir que ela não é excluída.
  await db.exec(`insert into public.athlete_registrations (source_key, competition, category, team_name, kind, email)
    values ('k1', 'hibrido-games', 'Dupla Rx', 'Equipe A', 'dupla', 'cap@e.com')`);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe("novo cadastro", () => {
  it("staff e visitante não criam", async () => {
    await expect(create(staff, solo, [{ full_name: "Ana Souza" }])).rejects.toThrow(/not_authorized/);
    await expect(
      asRole("anon", null, "select public.admin_create_registration('{}'::jsonb, '[]'::jsonb)"),
    ).rejects.toThrow(/permission denied/);
  });

  it("individual: cria a inscrição manual normalizada e o atleta", async () => {
    const r = await create(admin, solo, [{ full_name: "  Ana   Souza ", instagram: "@ana", shirt_size: "p" }]);
    expect(r.status).toBe("ok");
    expect(r.athlete_ids).toHaveLength(1);
    const [reg] = await q(`select * from public.athlete_registrations where id = $1`, [r.registration_id]);
    expect(reg).toMatchObject({
      origin: "manual",
      source_key: `manual|${r.registration_id}`,
      category: "Individual Feminino",
      email: "ana@e.com",
      phone: null,
      box: "CT 249",
      status: "aprovado",
    });
    const [athlete] = await q(`select * from public.athletes where id = $1`, [r.athlete_ids![0]]);
    expect(athlete).toMatchObject({ full_name: "Ana Souza", instagram: "@ana", shirt_size: "P", position: 1 });
  });

  it("inscrições da planilha continuam com origem planilha", async () => {
    const [reg] = await q<{ origin: string }>(`select origin from public.athlete_registrations where source_key = 'k1'`);
    expect(reg.origin).toBe("planilha");
  });

  it("dupla: cria os dois atletas na ordem", async () => {
    const r = await create(admin, { ...solo, competition: "hibrido-games", kind: "dupla", team_name: "Equipe B", email: "dupla@e.com" }, [
      { full_name: "Bia" },
      { full_name: "Caio" },
    ]);
    expect(r.status).toBe("ok");
    const rows = await q<{ full_name: string; position: number }>(
      `select full_name, position from public.athletes where registration_id = $1 order by position`,
      [r.registration_id],
    );
    expect(rows).toEqual([
      { full_name: "Bia", position: 1 },
      { full_name: "Caio", position: 2 },
    ]);
  });

  it("recusa número de atletas que não bate com o tipo", async () => {
    await expect(create(admin, { ...solo, kind: "dupla" }, [{ full_name: "Só Um" }])).rejects.toThrow(/invalid_athletes/);
    await expect(create(admin, solo, [{ full_name: "A" }, { full_name: "B" }])).rejects.toThrow(/invalid_athletes/);
    await expect(create(admin, solo, [{ full_name: "  " }])).rejects.toThrow(/invalid_athletes/);
  });

  it("mesmo nome e mesmo e-mail na mesma competição é duplicidade; em outra competição, não", async () => {
    const dup = await create(admin, { ...solo, email: "ANA@e.com" }, [{ full_name: "ana  souza" }]);
    expect(dup.status).toBe("duplicate");
    expect(dup.athlete_id).toBeTruthy();
    const other = await create(admin, { ...solo, competition: "hibrido-games" }, [{ full_name: "Ana Souza" }]);
    expect(other.status).toBe("ok");
  });

  it("valores fora do permitido são recusados pelo banco", async () => {
    await expect(create(admin, { ...solo, competition: "outra", email: "x@e.com" }, [{ full_name: "Zé" }])).rejects.toThrow();
    await expect(create(admin, { ...solo, email: "sem-arroba" }, [{ full_name: "Zé" }])).rejects.toThrow();
  });

  it("registra a criação no histórico com quem fez", async () => {
    const r = await create(admin, { ...solo, email: "hist@e.com" }, [{ full_name: "Dora Lima" }]);
    const [row] = await q<{ actor_name: string; kind: string; athlete_id: string; detail: { athletes: string[] } }>(
      `select actor_name, kind, athlete_id, detail from public.athlete_audit_log where registration_id = $1`,
      [r.registration_id],
    );
    expect(row).toMatchObject({ actor_name: "Adm Teste", kind: "create", athlete_id: r.athlete_ids![0] });
    expect(row.detail.athletes).toEqual(["Dora Lima"]);
  });
});

describe("excluir cadastro", () => {
  it("só admin exclui", async () => {
    const r = await create(admin, { ...solo, email: "del1@e.com" }, [{ full_name: "Eva" }]);
    await expect(remove(staff, r.registration_id!)).rejects.toThrow(/not_authorized/);
  });

  it("exclui a inscrição manual inteira e registra no histórico", async () => {
    const r = await create(admin, { ...solo, competition: "hibrido-games", kind: "dupla", team_name: "Equipe X", email: "del2@e.com" }, [
      { full_name: "Fê" },
      { full_name: "Gil" },
    ]);
    expect(await remove(admin, r.registration_id!)).toEqual({ status: "ok", athletes: ["Fê", "Gil"] });
    expect(await q(`select 1 from public.athletes where registration_id = $1`, [r.registration_id])).toHaveLength(0);
    expect(await q(`select 1 from public.athlete_registrations where id = $1`, [r.registration_id])).toHaveLength(0);
    const [log] = await q<{ kind: string; actor_name: string; detail: { registration_id: string; athletes: string[] } }>(
      `select kind, actor_name, detail from public.athlete_audit_log where kind = 'delete' and detail ->> 'registration_id' = $1`,
      [r.registration_id],
    );
    expect(log).toMatchObject({ kind: "delete", actor_name: "Adm Teste", detail: { athletes: ["Fê", "Gil"] } });
    // O histórico da criação continua, sem o vínculo com a inscrição apagada.
    const create_logs = await q(`select 1 from public.athlete_audit_log where kind = 'create' and detail -> 'athletes' = '["Fê","Gil"]'::jsonb`);
    expect(create_logs).toHaveLength(1);
  });

  it("não exclui inscrição da planilha", async () => {
    const [{ id }] = await q<{ id: string }>(`select id from public.athlete_registrations where source_key = 'k1'`);
    expect((await remove(admin, id)).status).toBe("not_manual");
  });

  it("não exclui com check-in ou termo arquivado", async () => {
    const r = await create(admin, { ...solo, email: "del3@e.com" }, [{ full_name: "Hugo" }]);
    await db.exec(checkinRow(r.athlete_ids![0]));
    expect((await remove(admin, r.registration_id!)).status).toBe("has_documents");

    // Check-in refeito: o termo vai para o arquivo e a exclusão continua bloqueada.
    await asRole("authenticated", admin, "select public.admin_reset_athlete_checkin($1, 'dados', null)", [r.athlete_ids![0]]);
    expect((await remove(admin, r.registration_id!)).status).toBe("has_documents");
  });

  it("inscrição inexistente responde not_found", async () => {
    expect((await remove(admin, "00000000-0000-0000-0000-000000000000")).status).toBe("not_found");
  });
});

describe("check-in presencial", () => {
  it("guarda quem registrou e aceita o tipo checkin no histórico", async () => {
    const r = await create(admin, { ...solo, email: "pres@e.com" }, [{ full_name: "Iris" }]);
    await db.exec(checkinRow(r.athlete_ids![0]));
    const [row] = await q(`select recorded_by, recorded_by_name from public.athlete_checkins where athlete_id = $1`, [r.athlete_ids![0]]);
    expect(row).toEqual({ recorded_by: admin, recorded_by_name: "Adm Teste" });
    await db.exec(`insert into public.athlete_audit_log (actor_id, actor_name, athlete_id, kind) values ('${admin}', 'Adm Teste', '${r.athlete_ids![0]}', 'checkin')`);
    await expect(db.exec(`insert into public.athlete_audit_log (kind) values ('outro')`)).rejects.toThrow();
  });
});
