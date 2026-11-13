// Importa a lista de retirada de camisas dos atletas a partir da planilha (Story 4.6).
// Idempotente: inclui linhas novas e atualiza as existentes pela chave da planilha. Nunca apaga
// retiradas, não sobrescreve campos corrigidos no painel e não traz de volta atletas excluídos no painel.
//
// Uso:
//   npm run pickups:import                     # lê retirada-dos-atletas.xlsx
//   npm run pickups:import -- outra.xlsx       # outra planilha
//   npm run pickups:import -- --dry-run        # só mostra o resumo e a situação do check-in, sem gravar
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { displayName, fold } from "../src/lib/checkin/sheet.ts";
import { parsePickupWorkbook, type PickupSheetRow } from "../src/lib/pickups/sheet.ts";

const DEFAULT_FILE = "retirada-dos-atletas.xlsx";
const LABEL = { "hibrido-games": "Híbrido Games", "hibrido-race": "Híbrido Race" } as const;
const FIELDS = ["competition", "team_name", "full_name", "shirt_size", "box", "email", "phone"] as const;
const SIZE_ORDER = ["PP", "P", "M", "G", "GG", "XG"];

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { "dry-run": { type: "boolean" } },
});

const file = positionals[0] ?? DEFAULT_FILE;
let rows: PickupSheetRow[];
try {
  const parsed = await parsePickupWorkbook(readFileSync(file));
  rows = parsed.rows;
  for (const competition of Object.keys(LABEL) as (keyof typeof LABEL)[]) {
    const list = rows.filter((r) => r.competition === competition);
    const sizes = new Map<string, number>();
    for (const r of list) sizes.set(r.shirtSize, (sizes.get(r.shirtSize) ?? 0) + 1);
    const teams = new Set(list.map((r) => fold(r.teamName))).size;
    const bySize = [...sizes].sort(([a], [b]) => SIZE_ORDER.indexOf(a) - SIZE_ORDER.indexOf(b) || a.localeCompare(b));
    console.log(`${LABEL[competition]}: ${list.length} camisas em ${teams} inscrições (${bySize.map(([s, n]) => `${s} ${n}`).join(", ") || "nenhuma"})`);
  }
  if (parsed.warnings.length) {
    console.log(`\nAvisos (${parsed.warnings.length}):`);
    for (const w of parsed.warnings) console.log(`  - ${w}`);
  }
} catch (error) {
  console.error(`Erro ao ler ${file}:`, error instanceof Error ? error.message : error);
  process.exit(1);
}
if (!rows.length) {
  console.error("Nenhum atleta encontrado na planilha. Nada foi gravado.");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  if (values["dry-run"]) {
    console.log("\n--dry-run: nada foi gravado. (Sem credenciais do Supabase: a situação do check-in não foi consultada.)");
    process.exit(0);
  }
  console.error("Defina NEXT_PUBLIC_SUPABASE_URL (ou SUPABASE_URL) e SUPABASE_SERVICE_ROLE_KEY no .env.local.");
  process.exit(1);
}
const supabase: SupabaseClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

type Gate = "liberado" | "sem_checkin" | "sem_cadastro";

function printGates(gates: { name: string; team: string; gate: Gate }[]) {
  const count = (g: Gate) => gates.filter((x) => x.gate === g).length;
  console.log(
    `\nCheck-in: ${count("liberado")} já podem retirar, ${count("sem_checkin")} com check-in pendente, ${count("sem_cadastro")} sem cadastro em Documentos.`,
  );
  const list = (g: Gate, title: string) => {
    const items = gates.filter((x) => x.gate === g);
    if (!items.length) return;
    console.log(`${title}:`);
    for (const x of items) console.log(`  - ${x.name} (${x.team})`);
  };
  list("sem_cadastro", "Sem cadastro em Documentos (vincule em Retiradas > Editar, ou cadastre em Documentos)");
  list("sem_checkin", "Check-in pendente");
}

/**
 * Simulação: situação do check-in calculada aqui, só com leitura (a função do banco ainda pode não existir).
 * Mesma regra de public.shirt_pickup_match_athlete: mesmo nome na mesma competição; homônimos desempatam pelo e-mail.
 */
async function dryRunGates() {
  const { data, error } = await supabase
    .from("athlete_registrations")
    .select("competition, email, athletes(id, full_name, athlete_checkins(id))")
    .eq("status", "aprovado");
  if (error) throw new Error(`Falha ao consultar os atletas do check-in: ${error.message}`);
  type Reg = { competition: string; email: string; athletes: { id: string; full_name: string; athlete_checkins: unknown }[] | null };
  const athletes = ((data ?? []) as unknown as Reg[]).flatMap((r) =>
    (r.athletes ?? []).map((a) => ({
      competition: r.competition,
      email: r.email.trim().toLowerCase(),
      nameKey: fold(a.full_name),
      checkedIn: Array.isArray(a.athlete_checkins) ? a.athlete_checkins.length > 0 : !!a.athlete_checkins,
    })),
  );
  printGates(
    rows.map((r) => {
      const candidates = athletes.filter((a) => a.competition === r.competition && a.nameKey === fold(r.fullName));
      const sameEmail = candidates.filter((a) => a.email === r.email);
      const match = candidates.length === 1 ? candidates[0] : sameEmail.length === 1 ? sameEmail[0] : null;
      return {
        name: displayName(r.fullName),
        team: r.teamName,
        gate: !match ? "sem_cadastro" : match.checkedIn ? "liberado" : "sem_checkin",
      };
    }),
  );
}

type Existing = { id: string; source_key: string; admin_edited_fields: string[]; deleted_at: string | null } & Record<(typeof FIELDS)[number], string | null>;

async function main() {
  if (values["dry-run"]) {
    await dryRunGates();
    console.log("\n--dry-run: nada foi gravado.");
    return;
  }

  const { data: existing, error: readError } = await supabase
    .from("athlete_shirt_pickups")
    .select(`id, source_key, admin_edited_fields, deleted_at, ${FIELDS.join(", ")}`)
    .eq("origin", "planilha");
  if (readError?.code === "42P01" || readError?.code === "PGRST205") {
    throw new Error("A tabela athlete_shirt_pickups não existe neste banco. Aplique a migration antes: npm run db:push");
  }
  if (readError) throw new Error(`Falha ao ler a lista de retirada: ${readError.message}`);
  const byKey = new Map(((existing ?? []) as unknown as Existing[]).map((r) => [r.source_key, r]));

  const inserts: Record<string, string | null>[] = [];
  const updates: { id: string; name: string; changes: Record<string, string | null> }[] = [];
  const preserved: string[] = [];
  const skippedDeleted: string[] = [];

  for (const r of rows) {
    const payload: Record<(typeof FIELDS)[number], string | null> = {
      competition: r.competition,
      team_name: r.teamName,
      full_name: r.fullName,
      shirt_size: r.shirtSize,
      box: r.box || null,
      email: r.email,
      phone: r.phone || null,
    };
    const current = byKey.get(r.sourceKey);
    if (!current) {
      inserts.push({ source_key: r.sourceKey, origin: "planilha", ...payload });
      continue;
    }
    if (current.deleted_at) {
      skippedDeleted.push(displayName(r.fullName));
      continue;
    }
    const changes: Record<string, string | null> = {};
    const kept: string[] = [];
    for (const field of FIELDS) {
      if (current[field] === payload[field]) continue;
      // Campos corrigidos no painel mantêm o valor do banco.
      if (current.admin_edited_fields.includes(field)) kept.push(field);
      else changes[field] = payload[field];
    }
    if (kept.length) preserved.push(`${displayName(r.fullName)}: ${kept.join(", ")}`);
    if (Object.keys(changes).length) updates.push({ id: current.id, name: displayName(r.fullName), changes });
  }

  if (inserts.length) {
    const { error } = await supabase.from("athlete_shirt_pickups").insert(inserts);
    if (error) throw new Error(`Falha ao incluir atletas: ${error.message}`);
  }
  for (const u of updates) {
    const { error } = await supabase.from("athlete_shirt_pickups").update(u.changes).eq("id", u.id);
    if (error) throw new Error(`Falha ao atualizar ${u.name}: ${error.message}`);
  }

  console.log(`\nIncluídos: ${inserts.length}. Atualizados: ${updates.length}. Sem mudança: ${rows.length - inserts.length - updates.length - skippedDeleted.length}.`);
  if (updates.length) for (const u of updates) console.log(`  - ${u.name}: ${Object.keys(u.changes).join(", ")}`);
  if (preserved.length) {
    console.log(`Correções do painel preservadas (${preserved.length}):`);
    for (const line of preserved) console.log(`  - ${line}`);
  }
  if (skippedDeleted.length) console.log(`Excluídos no painel, não reincluídos: ${skippedDeleted.join(", ")}`);

  const keys = new Set(rows.map((r) => r.sourceKey));
  const gone = ((existing ?? []) as unknown as Existing[]).filter((r) => !r.deleted_at && !keys.has(r.source_key));
  if (gone.length) {
    console.log(`Na lista de retirada, mas fora desta planilha (mantidos; exclua no painel se for o caso): ${gone.map((r) => displayName(r.full_name ?? "")).join(", ")}`);
  }

  const { data: view, error: viewError } = await supabase
    .from("v_athlete_shirt_pickups")
    .select("full_name, team_name, linked_athlete_id, checkin_signed_at, picked_up_at");
  if (viewError) throw new Error(`Falha ao conferir o check-in: ${viewError.message}`);
  type ViewRow = { full_name: string; team_name: string; linked_athlete_id: string | null; checkin_signed_at: string | null; picked_up_at: string | null };
  const list = (view ?? []) as ViewRow[];
  printGates(
    list
      .filter((r) => !r.picked_up_at)
      .map((r) => ({
        name: displayName(r.full_name),
        team: r.team_name,
        gate: r.checkin_signed_at ? "liberado" : r.linked_athlete_id ? "sem_checkin" : "sem_cadastro",
      })),
  );
  console.log(`\nPronto: ${list.length} camisas na lista de retirada, ${list.filter((r) => r.picked_up_at).length} já retiradas.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
