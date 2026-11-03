// Importa os atletas inscritos para o check-in, a partir das planilhas da plataforma de inscrição.
// Idempotente: atualiza inscrições e atletas pela chave da planilha e nunca apaga check-ins.
// Inscrições que sumiram da planilha (nas competições importadas) ficam como canceladas.
//
// Uso:
//   npm run athletes:import                       # lê camisas-hibrido-games.xls e camisas-h-birdo-race.xls
//   npm run athletes:import -- arquivo.xls ...    # outras planilhas
//   npm run athletes:import -- --dry-run          # só mostra o resumo, sem gravar
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { groupRegistrations, parseRegistrationSheet, type ParsedRegistration } from "../src/lib/checkin/sheet.ts";

const DEFAULT_FILES = ["camisas-hibrido-games.xls", "camisas-h-birdo-race.xls"];

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { "dry-run": { type: "boolean" } },
});

const files = positionals.length ? positionals : DEFAULT_FILES;
const registrations: ParsedRegistration[] = [];
for (const file of files) {
  try {
    const regs = groupRegistrations(parseRegistrationSheet(readFileSync(file, "utf8")));
    registrations.push(...regs);
    const approved = regs.filter((r) => r.status === "aprovado");
    console.log(
      `${file}: ${approved.length} inscrições aprovadas (${approved.reduce((n, r) => n + r.athletes.length, 0)} atletas), ${regs.length - approved.length} canceladas`,
    );
  } catch (error) {
    console.error(`Erro ao ler ${file}:`, error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

if (values["dry-run"]) {
  for (const r of registrations.filter((r) => r.status === "aprovado")) {
    console.log(`  [${r.competition}] ${r.category} — ${r.teamName}: ${r.athletes.map((a) => a.fullName).join(" / ")}`);
  }
  console.log("\n--dry-run: nada foi gravado.");
  process.exit(0);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Defina NEXT_PUBLIC_SUPABASE_URL (ou SUPABASE_URL) e SUPABASE_SERVICE_ROLE_KEY no .env.local.");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

type Row = Record<string, unknown> & { source_key: string };

/**
 * Campos corrigidos no painel (Story 4.4) mantêm o valor do banco. Sem a migration da 4.4,
 * a coluna não existe e nada é preservado.
 */
async function editedRows(table: "athlete_registrations" | "athletes", keys: string[]) {
  const map = new Map<string, Row & { admin_edited_fields: string[] }>();
  for (let i = 0; i < keys.length; i += 200) {
    const { data, error } = await supabase.from(table).select("*").in("source_key", keys.slice(i, i + 200)).neq("admin_edited_fields", "{}");
    if (error?.code === "42703") return map;
    if (error) throw new Error(`Falha ao ler correções de ${table}: ${error.message}`);
    for (const row of (data ?? []) as (Row & { admin_edited_fields: string[] })[]) map.set(row.source_key, row);
  }
  return map;
}

const preserved: string[] = [];
function keepEdits<T extends Row>(rows: T[], edited: Map<string, Row & { admin_edited_fields: string[] }>, label: (row: T) => string): T[] {
  return rows.map((row) => {
    const current = edited.get(row.source_key);
    if (!current) return row;
    const next: Row = { ...row };
    const kept = current.admin_edited_fields.filter((f) => f in next && next[f] !== current[f]);
    for (const f of current.admin_edited_fields) if (f in next) next[f] = current[f];
    if (kept.length) preserved.push(`${label(row)}: ${kept.join(", ")}`);
    return next as T;
  });
}

async function main() {
  const regPayload = registrations.map((r) => ({
    source_key: r.sourceKey,
    competition: r.competition,
    category: r.category,
    team_name: r.teamName,
    kind: r.kind,
    email: r.email,
    phone: r.phone || null,
    box: r.box || null,
    status: r.status,
    registered_on: r.registeredOn,
  }));
  const editedRegs = await editedRows("athlete_registrations", regPayload.map((r) => r.source_key));
  const { data: regRows, error: regError } = await supabase
    .from("athlete_registrations")
    .upsert(keepEdits(regPayload, editedRegs, (r) => String(r.team_name)), { onConflict: "source_key" })
    .select("id, source_key");
  if (regError) throw new Error(`Falha ao gravar inscrições: ${regError.message}`);

  const idByKey = new Map((regRows ?? []).map((r) => [r.source_key as string, r.id as string]));
  const athletes = registrations.flatMap((r) =>
    r.athletes.map((a) => ({
      registration_id: idByKey.get(r.sourceKey)!,
      source_key: a.sourceKey,
      full_name: a.fullName,
      instagram: a.instagram || null,
      shirt_size: a.shirtSize || null,
      position: a.position,
    })),
  );
  const editedAthletes = await editedRows("athletes", athletes.map((a) => a.source_key));
  const { error: athleteError } = await supabase
    .from("athletes")
    .upsert(keepEdits(athletes, editedAthletes, (a) => String(a.full_name)), { onConflict: "source_key" });
  if (athleteError) throw new Error(`Falha ao gravar atletas: ${athleteError.message}`);

  // Inscrições aprovadas no banco que não estão mais nas planilhas importadas.
  const competitions = [...new Set(registrations.map((r) => r.competition))];
  const keys = new Set(registrations.map((r) => r.sourceKey));
  const { data: existing, error: existingError } = await supabase
    .from("athlete_registrations")
    .select("*")
    .in("competition", competitions)
    .eq("status", "aprovado");
  if (existingError) throw new Error(`Falha ao conferir inscrições: ${existingError.message}`);
  // Situação corrigida no painel e cadastros feitos no painel (Story 4.5) não mudam por esta regra.
  const gone = ((existing ?? []) as (Row & { id: string; team_name: string; admin_edited_fields?: string[]; origin?: string })[]).filter(
    (r) => !keys.has(r.source_key) && !r.admin_edited_fields?.includes("status") && r.origin !== "manual",
  );
  if (gone.length) {
    const { error } = await supabase
      .from("athlete_registrations")
      .update({ status: "cancelado" })
      .in("id", gone.map((r) => r.id));
    if (error) throw new Error(`Falha ao marcar inscrições removidas: ${error.message}`);
    console.log(`Marcadas como canceladas (não estão mais na planilha): ${gone.map((r) => r.team_name).join(", ")}`);
  }

  const { count } = await supabase.from("athlete_checkins").select("id", { count: "exact", head: true });
  if (preserved.length) {
    console.log(`\nCorreções do painel preservadas (${preserved.length}):`);
    for (const line of preserved) console.log(`  - ${line}`);
  }
  console.log(`\nPronto: ${registrations.length} inscrições e ${athletes.length} atletas sincronizados. Check-ins já feitos: ${count ?? 0}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
