import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** Story 4.6: retirada de camisas dos atletas (PGlite + migrations reais). */
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

type Result = { status: string; id?: string; batch?: string; count?: number; name?: string; fields?: string[]; items?: Record<string, unknown>[] };

const rpc = async (uid: string | null, sql: string, params: unknown[]) => (await asRole<{ r: Result }>("authenticated", uid, `select ${sql} as r`, params))[0].r;

const save = (uid: string | null, id: string | null, fields: Record<string, unknown>) =>
  rpc(uid, "public.admin_save_shirt_pickup($1, $2)", [id, JSON.stringify(fields)]);
const confirm = (uid: string | null, ids: string[], pickup: Record<string, unknown>) =>
  rpc(uid, "public.admin_confirm_shirt_pickup($1::uuid[], $2)", [ids, JSON.stringify(pickup)]);
const undo = (uid: string | null, id: string) => rpc(uid, "public.admin_undo_shirt_pickup($1)", [id]);
const remove = (uid: string | null, id: string) => rpc(uid, "public.admin_delete_shirt_pickup($1)", [id]);

const base = { competition: "hibrido-games", team_name: "Equipe A", shirt_size: "m", box: "CT  249", email: " Cap@E.com ", phone: "" };

/** Inscrição aprovada em "Documentos" com os atletas dados; devolve os ids na ordem. */
async function registration(key: string, competition: string, email: string, names: string[]) {
  const [{ id: reg }] = await q<{ id: string }>(
    `insert into public.athlete_registrations (source_key, competition, category, team_name, kind, email)
     values ($1, $2, 'Dupla Rx', $1, $3, $4) returning id`,
    [key, competition, names.length > 1 ? "dupla" : "individual", email],
  );
  const ids: string[] = [];
  for (const [i, name] of names.entries()) {
    const [{ id }] = await q<{ id: string }>(
      `insert into public.athletes (registration_id, source_key, full_name, position) values ($1, $2, $3, $4) returning id`,
      [reg, `${key}|${i}`, name, i + 1],
    );
    ids.push(id);
  }
  return ids;
}

const checkin = (athleteId: string) =>
  db.exec(`
  insert into public.athlete_checkins (athlete_id, terms_version, terms_text, full_name, birth_date, phone, email,
    emergency_name, emergency_phone, competition, category, parq, parq_any_yes, image_consent, is_minor, place,
    signature_path, certificate_path, verified_email)
  values ('${athleteId}', 'v1', 'texto', 'Atleta', '2000-01-01', '83999990000', 'a@e.com', 'Mãe', '83988880000',
    'Híbrido Games', 'Dupla Rx', '[false,false,false,false,false,false,false,false,false,false]', false, true, false,
    'João Pessoa', '${athleteId}/assinatura.png', '${athleteId}/atestado.pdf', 'a@e.com')`);

const row = async (id: string) => (await q<Record<string, unknown>>(`select * from public.athlete_shirt_pickups where id = $1`, [id]))[0];
const view = async (id: string) =>
  (await q<{ linked_athlete_id: string | null; checkin_signed_at: string | null }>(
    `select linked_athlete_id, checkin_signed_at from public.v_athlete_shirt_pickups where id = $1`,
    [id],
  ))[0];

/** Cria uma linha de retirada já vinculada a um atleta com check-in feito. */
async function ready(name: string, fields: Record<string, unknown> = {}) {
  const key = `ok-${name}`;
  const [athlete] = await registration(key, String(fields.competition ?? base.competition), `${key}@e.com`.toLowerCase().replace(/\s/g, ""), [name]);
  await checkin(athlete);
  const r = await save(admin, null, { ...base, full_name: name, ...fields });
  return { id: r.id!, athlete };
}

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
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe("acesso", () => {
  it("staff e visitante não gravam nem leem a lista", async () => {
    await expect(save(staff, null, { ...base, full_name: "Ana" })).rejects.toThrow(/not_authorized/);
    await expect(confirm(staff, ["00000000-0000-0000-0000-000000000001"], { primary_id: "00000000-0000-0000-0000-000000000001" })).rejects.toThrow(
      /not_authorized/,
    );
    await expect(asRole("anon", null, "select public.admin_save_shirt_pickup(null, '{}'::jsonb)")).rejects.toThrow(/permission denied/);
    await expect(asRole("anon", null, "select * from public.v_athlete_shirt_pickups")).rejects.toThrow(/permission denied/);

    const r = await save(admin, null, { ...base, full_name: "Visível Só Para Admin" });
    expect(await asRole("authenticated", staff, "select id from public.athlete_shirt_pickups")).toHaveLength(0);
    expect(await asRole("authenticated", staff, "select id from public.v_athlete_shirt_pickups")).toHaveLength(0);
    expect((await asRole("authenticated", admin, "select id from public.v_athlete_shirt_pickups where id = $1", [r.id])).length).toBe(1);
  });
});

describe("novo atleta e edição", () => {
  it("cria normalizado, como cadastro manual, e registra no histórico", async () => {
    const r = await save(admin, null, { ...base, full_name: "  Ana   Souza ", team_name: "  " });
    expect(r.status).toBe("ok");
    expect(await row(r.id!)).toMatchObject({
      origin: "manual",
      source_key: `manual|${r.id}`,
      full_name: "Ana Souza",
      // Equipe em branco: individual, leva o nome do atleta.
      team_name: "Ana Souza",
      shirt_size: "M",
      box: "CT 249",
      email: "cap@e.com",
      phone: null,
      picked_up_at: null,
    });
    const [log] = await q<{ kind: string; actor_name: string }>(`select kind, actor_name from public.athlete_shirt_pickup_log where pickup_id = $1`, [r.id]);
    expect(log).toEqual({ kind: "create", actor_name: "Adm Teste" });
  });

  it("recusa nome ou tamanho vazios e valores fora do permitido", async () => {
    await expect(save(admin, null, { ...base, full_name: " " })).rejects.toThrow(/invalid_fields/);
    await expect(save(admin, null, { ...base, full_name: "Zé", shirt_size: "" })).rejects.toThrow(/invalid_fields/);
    await expect(save(admin, null, { ...base, full_name: "Zé", competition: "outra" })).rejects.toThrow();
    await expect(save(admin, null, { ...base, full_name: "Zé", email: "sem-arroba" })).rejects.toThrow();
    await expect(save(admin, null, { ...base, full_name: "Zé", athlete_id: "00000000-0000-0000-0000-000000000009" })).rejects.toThrow(/invalid_athlete/);
  });

  it("edição grava o que mudou, marca os campos e responde unchanged quando nada muda", async () => {
    const r = await save(admin, null, { ...base, full_name: "Bia Lima" });
    const same = await save(admin, r.id!, { ...base, full_name: "Bia Lima" });
    expect(same.status).toBe("unchanged");

    const edited = await save(admin, r.id!, { ...base, full_name: "Bia Lima", shirt_size: "G", phone: "83999990000" });
    expect(edited.status).toBe("ok");
    expect(edited.fields?.sort()).toEqual(["phone", "shirt_size"]);
    expect(await row(r.id!)).toMatchObject({ shirt_size: "G", phone: "83999990000", admin_edited_fields: ["phone", "shirt_size"] });
    const [log] = await q<{ detail: { changes: Record<string, { from: unknown; to: unknown }> } }>(
      `select detail from public.athlete_shirt_pickup_log where pickup_id = $1 and kind = 'edit'`,
      [r.id],
    );
    expect(log.detail.changes.shirt_size).toEqual({ from: "M", to: "G" });

    expect((await save(admin, "00000000-0000-0000-0000-000000000000", { ...base, full_name: "X" })).status).toBe("not_found");
  });
});

describe("vínculo com o check-in", () => {
  it("automático pelo nome, ignorando acentos, caixa e espaços", async () => {
    const [athlete] = await registration("vinc-1", "hibrido-games", "outro@e.com", ["JOÃO  Mauricio de Araújo"]);
    const r = await save(admin, null, { ...base, full_name: "joao maurício de araujo" });
    expect(await view(r.id!)).toEqual({ linked_athlete_id: athlete, checkin_signed_at: null });
    await checkin(athlete);
    expect((await view(r.id!)).checkin_signed_at).toBeTruthy();
  });

  it("não vincula em outra competição nem inscrição cancelada", async () => {
    await registration("vinc-2", "hibrido-race", "r@e.com", ["Carla Dias"]);
    const [cancelled] = await registration("vinc-3", "hibrido-games", "c@e.com", ["Dora Reis"]);
    await db.exec(`update public.athlete_registrations set status = 'cancelado' where source_key = 'vinc-3'`);
    const a = await save(admin, null, { ...base, full_name: "Carla Dias" });
    const b = await save(admin, null, { ...base, full_name: "Dora Reis" });
    expect((await view(a.id!)).linked_athlete_id).toBeNull();
    expect((await view(b.id!)).linked_athlete_id).toBeNull();
    expect(cancelled).toBeTruthy();
  });

  it("homônimos: desempata pelo e-mail; sem desempate, fica sem vínculo", async () => {
    const [one] = await registration("vinc-4", "hibrido-games", "um@e.com", ["Edu Silva"]);
    await registration("vinc-5", "hibrido-games", "dois@e.com", ["Edu Silva"]);
    const byEmail = await save(admin, null, { ...base, full_name: "Edu Silva", email: "UM@e.com" });
    const unknown = await save(admin, null, { ...base, full_name: "Edu Silva", email: "tres@e.com" });
    expect((await view(byEmail.id!)).linked_athlete_id).toBe(one);
    expect((await view(unknown.id!)).linked_athlete_id).toBeNull();
  });

  it("vínculo escolhido no painel vale mais que o nome", async () => {
    const [athlete] = await registration("vinc-6", "hibrido-games", "f@e.com", ["Fabiana Completa de Souza"]);
    const r = await save(admin, null, { ...base, full_name: "Fabi Souza" });
    expect((await view(r.id!)).linked_athlete_id).toBeNull();
    await save(admin, r.id!, { ...base, full_name: "Fabi Souza", athlete_id: athlete });
    expect((await view(r.id!)).linked_athlete_id).toBe(athlete);
    // Voltar para automático limpa a escolha.
    await save(admin, r.id!, { ...base, full_name: "Fabi Souza", athlete_id: "" });
    expect((await row(r.id!)).athlete_id).toBeNull();
  });
});

describe("confirmar retirada", () => {
  it("bloqueia quem não tem cadastro em Documentos e quem não fez o check-in", async () => {
    const none = await save(admin, null, { ...base, full_name: "Sem Cadastro Nenhum" });
    const r1 = await confirm(admin, [none.id!], { primary_id: none.id, self: true });
    expect(r1).toMatchObject({ status: "blocked", items: [{ name: "Sem Cadastro Nenhum", reason: "sem_cadastro" }] });

    await registration("bloq-1", "hibrido-games", "g@e.com", ["Gil Pendente"]);
    const pending = await save(admin, null, { ...base, full_name: "Gil Pendente" });
    const r2 = await confirm(admin, [pending.id!], { primary_id: pending.id, self: true });
    expect(r2).toMatchObject({ status: "blocked", items: [{ name: "Gil Pendente", reason: "sem_checkin" }] });
    expect((await row(pending.id!)).picked_up_at).toBeNull();
  });

  it("o próprio atleta retira: grava tamanho, quem retirou, quem entregou e o histórico", async () => {
    const { id } = await ready("Hugo Pronto");
    const r = await confirm(admin, [id], { primary_id: id, self: true, name: "ignorado", document: "123", delivered_size: "g", note: " trocou o tamanho " });
    expect(r).toMatchObject({ status: "ok", count: 1 });
    expect(await row(id)).toMatchObject({
      delivered_size: "G",
      picked_by_name: "Hugo Pronto",
      picked_by_self: true,
      picked_by_document: null,
      pickup_note: "trocou o tamanho",
      delivered_by: admin,
      delivered_by_name: "Adm Teste",
      pickup_batch: r.batch,
      email_sent_at: null,
    });
    expect((await row(id)).picked_up_at).toBeTruthy();
    const [log] = await q<{ kind: string; actor_name: string }>(`select kind, actor_name from public.athlete_shirt_pickup_log where pickup_id = $1 and kind = 'pickup'`, [id]);
    expect(log).toEqual({ kind: "pickup", actor_name: "Adm Teste" });
  });

  it("outra pessoa retira: nome obrigatório e documento opcional", async () => {
    const { id } = await ready("Iris Atleta");
    await expect(confirm(admin, [id], { primary_id: id, self: false, name: "  " })).rejects.toThrow(/name_required/);
    expect((await row(id)).picked_up_at).toBeNull();

    const r = await confirm(admin, [id], { primary_id: id, self: false, name: " Maria   Souza ", document: " 123.456.789-00 " });
    expect(r.status).toBe("ok");
    expect(await row(id)).toMatchObject({
      picked_by_name: "Maria Souza",
      picked_by_self: false,
      picked_by_document: "123.456.789-00",
      // Sem tamanho informado, vale o da inscrição.
      delivered_size: "M",
    });
  });

  it("dupla: o parceiro sai na mesma confirmação, com o próprio tamanho", async () => {
    const team = { team_name: "Dupla Dinâmica" };
    const a = await ready("Jô Capitã", team);
    const b = await ready("Kaká Parceiro", { ...team, shirt_size: "GG" });
    const r = await confirm(admin, [a.id, b.id], { primary_id: a.id, self: true, delivered_size: "P" });
    expect(r).toMatchObject({ status: "ok", count: 2 });
    expect(await row(a.id)).toMatchObject({ delivered_size: "P", picked_by_self: true, picked_by_name: "Jô Capitã", pickup_batch: r.batch });
    expect(await row(b.id)).toMatchObject({ delivered_size: "GG", picked_by_self: false, picked_by_name: "Jô Capitã", pickup_batch: r.batch });
  });

  it("só confirma juntas as camisas da mesma inscrição", async () => {
    const a = await ready("Lia Uma", { team_name: "Equipe L" });
    const b = await ready("Mel Outra", { team_name: "Equipe M" });
    await expect(confirm(admin, [a.id, b.id], { primary_id: a.id, self: true })).rejects.toThrow(/invalid_batch/);
    await expect(confirm(admin, [a.id], { primary_id: b.id, self: true })).rejects.toThrow(/invalid_batch/);
    await expect(confirm(admin, [], { primary_id: a.id, self: true })).rejects.toThrow(/invalid_batch/);
    expect((await row(a.id)).picked_up_at).toBeNull();
  });

  it("camisa já retirada não é confirmada de novo e nada muda no lote", async () => {
    const team = { team_name: "Equipe N" };
    const a = await ready("Nina Primeira", team);
    const b = await ready("Otto Segundo", team);
    await confirm(admin, [a.id], { primary_id: a.id, self: true });
    const again = await confirm(admin, [b.id, a.id], { primary_id: b.id, self: true });
    expect(again).toMatchObject({ status: "already", items: [{ name: "Nina Primeira", by: "Adm Teste" }] });
    expect((await row(b.id)).picked_up_at).toBeNull();
  });

  it("linha inexistente ou excluída responde not_found", async () => {
    const r = await confirm(admin, ["00000000-0000-0000-0000-000000000000"], { primary_id: "00000000-0000-0000-0000-000000000000", self: true });
    expect(r.status).toBe("not_found");
  });
});

describe("desfazer, e-mail e excluir", () => {
  it("marca o e-mail como enviado só em camisa retirada", async () => {
    const { id } = await ready("Paula Email");
    const mark = () => asRole<{ n: number }>("authenticated", admin, "select public.admin_mark_shirt_pickup_emailed($1::uuid[]) as n", [[id]]);
    expect((await mark())[0].n).toBe(0);
    await confirm(admin, [id], { primary_id: id, self: true });
    expect((await mark())[0].n).toBe(1);
    expect((await row(id)).email_sent_at).toBeTruthy();
    await expect(asRole("authenticated", staff, "select public.admin_mark_shirt_pickup_emailed($1::uuid[])", [[id]])).rejects.toThrow(/not_authorized/);
  });

  it("desfazer devolve para pendente, guarda o histórico e permite nova retirada", async () => {
    const { id } = await ready("Quim Volta");
    expect((await undo(admin, id)).status).toBe("none");
    await confirm(admin, [id], { primary_id: id, self: false, name: "Rui Amigo" });
    expect(await undo(admin, id)).toEqual({ status: "ok", name: "Quim Volta" });
    expect(await row(id)).toMatchObject({
      picked_up_at: null,
      delivered_size: null,
      picked_by_name: null,
      picked_by_self: null,
      delivered_by_name: null,
      pickup_batch: null,
    });
    const [log] = await q<{ detail: { picked_by_name: string } }>(`select detail from public.athlete_shirt_pickup_log where pickup_id = $1 and kind = 'undo'`, [id]);
    expect(log.detail.picked_by_name).toBe("Rui Amigo");
    expect((await confirm(admin, [id], { primary_id: id, self: true })).status).toBe("ok");
    await expect(undo(staff, id)).rejects.toThrow(/not_authorized/);
  });

  it("excluir só vale para camisa pendente; a linha some da lista e fica no histórico", async () => {
    const { id } = await ready("Sara Sai");
    await confirm(admin, [id], { primary_id: id, self: true });
    expect((await remove(admin, id)).status).toBe("picked_up");

    await undo(admin, id);
    await expect(remove(staff, id)).rejects.toThrow(/not_authorized/);
    expect(await remove(admin, id)).toEqual({ status: "ok", name: "Sara Sai" });
    expect(await q(`select 1 from public.v_athlete_shirt_pickups where id = $1`, [id])).toHaveLength(0);
    // A linha continua no banco, marcada: a importação da planilha não a recria.
    expect((await row(id)).deleted_at).toBeTruthy();
    const [log] = await q<{ actor_name: string; detail: { full_name: string } }>(
      `select actor_name, detail from public.athlete_shirt_pickup_log where pickup_id = $1 and kind = 'delete'`,
      [id],
    );
    expect(log).toMatchObject({ actor_name: "Adm Teste", detail: { full_name: "Sara Sai" } });

    expect((await remove(admin, id)).status).toBe("not_found");
    expect((await save(admin, id, { ...base, full_name: "Sara Sai" })).status).toBe("not_found");
    expect((await confirm(admin, [id], { primary_id: id, self: true })).status).toBe("not_found");
  });

  it("o banco recusa retirada incompleta e tipo de histórico desconhecido", async () => {
    await expect(
      db.exec(`insert into public.athlete_shirt_pickups (source_key, competition, team_name, full_name, shirt_size, email, picked_up_at)
        values ('x1', 'hibrido-games', 'T', 'N', 'M', 'a@e.com', now())`),
    ).rejects.toThrow();
    await expect(db.exec(`insert into public.athlete_shirt_pickup_log (kind) values ('outro')`)).rejects.toThrow();
  });
});
