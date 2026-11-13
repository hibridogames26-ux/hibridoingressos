import "server-only";
import { displayName, type Competition } from "@/lib/checkin/sheet";
import { createClient } from "@/lib/supabase/server";
import { sortPickups, toPickupRow, type PickupDbRow, type PickupRow } from "./rows";

type DbError = { code?: string } | null;

/** Tabela, visão ou função ausente: a migration da Story 4.6 ainda não foi aplicada. */
export const isPickupMigrationMissing = (error: DbError) =>
  error?.code === "42P01" || error?.code === "PGRST205" || error?.code === "PGRST202" || error?.code === "42883";

/** Lista de retirada, com a sessão do admin (RLS "admin lê retiradas de camisa"). */
export async function listPickups(): Promise<PickupRow[] | "unavailable"> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("v_athlete_shirt_pickups").select("*").returns<PickupDbRow[]>();
  if (isPickupMigrationMissing(error)) return "unavailable";
  if (error) throw new Error(`Falha ao carregar as retiradas: ${error.message}`);
  return sortPickups((data ?? []).map(toPickupRow));
}

/** Atleta de “Documentos” que pode ser vinculado a uma linha da retirada. */
export type LinkOption = { id: string; name: string; teamName: string; competition: Competition; checkedIn: boolean };

type Embedded<T> = T | T[] | null;

/** Atletas com inscrição aprovada, para o seletor “Cadastro do check-in”. */
export async function listLinkOptions(): Promise<LinkOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("athlete_registrations")
    .select("competition, team_name, athletes(id, full_name, athlete_checkins(id))")
    .eq("status", "aprovado");
  if (isPickupMigrationMissing(error)) return [];
  if (error) throw new Error(`Falha ao carregar os atletas do check-in: ${error.message}`);

  type Row = {
    competition: string;
    team_name: string;
    athletes: { id: string; full_name: string; athlete_checkins: Embedded<{ id: string }> }[] | null;
  };
  return ((data ?? []) as unknown as Row[])
    .flatMap((r) =>
      (r.athletes ?? []).map((a) => ({
        id: a.id,
        name: displayName(a.full_name),
        teamName: r.team_name,
        competition: r.competition as Competition,
        checkedIn: Array.isArray(a.athlete_checkins) ? a.athlete_checkins.length > 0 : !!a.athlete_checkins,
      })),
    )
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}
