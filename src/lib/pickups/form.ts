// Retirada de camisas dos atletas (Story 4.6): validação dos formulários do painel.
import type { Competition } from "@/lib/checkin/sheet";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isPickupId = (value: unknown): value is string => typeof value === "string" && UUID.test(value);

const clean = (value: unknown) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");

/** Tamanhos da planilha de retirada; o campo aceita também o valor já gravado na linha. */
export const PICKUP_SIZES = ["P", "M", "G", "GG"] as const;

/** Opções do seletor de tamanho, incluindo o valor atual quando ele está fora da grade. */
export const sizeOptions = (current?: string | null) => {
  const value = (current ?? "").trim().toUpperCase();
  return value && !(PICKUP_SIZES as readonly string[]).includes(value) ? [...PICKUP_SIZES, value] : [...PICKUP_SIZES];
};

// ---------------------------------------------------------------------------
// Novo atleta e edição
// ---------------------------------------------------------------------------
export type AthleteFormInput = {
  competition: string;
  fullName: string;
  teamName: string;
  shirtSize: string;
  box: string;
  email: string;
  phone: string;
  /** Atleta de “Documentos” escolhido no painel; vazio = vínculo automático pelo nome. */
  athleteId: string;
};

export type AthleteFormErrors = Partial<Record<keyof AthleteFormInput, string>>;

/** Campos como a função do banco recebe. */
export type PickupFields = {
  competition: Competition;
  full_name: string;
  team_name: string;
  shirt_size: string;
  box: string | null;
  email: string;
  phone: string | null;
  athlete_id: string | null;
};

export type ParsedAthlete = { ok: true; fields: PickupFields } | { ok: false; errors: AthleteFormErrors };

export function parseAthleteForm(input: unknown): ParsedAthlete {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const v = (k: keyof AthleteFormInput) => clean(raw[k]);
  const errors: AthleteFormErrors = {};

  const competition = v("competition");
  if (competition !== "hibrido-games" && competition !== "hibrido-race") errors.competition = "Escolha a competição.";

  const fullName = v("fullName");
  if (!fullName) errors.fullName = "Informe o nome do atleta.";
  else if (fullName.length > 120) errors.fullName = "Use até 120 caracteres.";

  const teamName = v("teamName");
  if (teamName.length > 120) errors.teamName = "Use até 120 caracteres.";

  const shirtSize = v("shirtSize").toUpperCase();
  if (!shirtSize) errors.shirtSize = "Escolha o tamanho da camisa.";
  else if (shirtSize.length > 12) errors.shirtSize = "Use até 12 caracteres.";

  const box = v("box");
  if (box.length > 120) errors.box = "Use até 120 caracteres.";

  const email = v("email").toLowerCase();
  if (!email) errors.email = "Informe o e-mail. É para ele que vai o aviso da retirada.";
  else if (!EMAIL.test(email) || email.length > 160) errors.email = "E-mail inválido. Confira se tem @ e domínio, como nome@gmail.com.";

  const phone = v("phone");
  if (phone.length > 30) errors.phone = "Use até 30 caracteres.";

  const athleteId = v("athleteId");
  if (athleteId && !UUID.test(athleteId)) errors.athleteId = "Escolha um atleta da lista.";

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    fields: {
      competition: competition as Competition,
      full_name: fullName,
      // Em branco, a inscrição leva o nome do atleta (individual).
      team_name: teamName || fullName,
      shirt_size: shirtSize,
      box: box || null,
      email,
      phone: phone || null,
      athlete_id: athleteId || null,
    },
  };
}

// ---------------------------------------------------------------------------
// Confirmar retirada
// ---------------------------------------------------------------------------
export type ConfirmFormInput = {
  /** Atleta cuja retirada está sendo confirmada. */
  primaryId: string;
  /** Outros atletas da mesma inscrição levados juntos. */
  mateIds: string[];
  /** true: o próprio atleta retira. */
  self: boolean;
  name: string;
  document: string;
  deliveredSize: string;
  note: string;
};

export type ConfirmFormErrors = Partial<Record<"name" | "document" | "deliveredSize" | "note", string>>;

export type ParsedConfirm =
  | {
      ok: true;
      ids: string[];
      pickup: { primary_id: string; self: boolean; name: string; document: string; delivered_size: string; note: string };
    }
  | { ok: false; errors: ConfirmFormErrors; message?: string };

export const MAX_BATCH = 20;

export function parseConfirmForm(input: unknown): ParsedConfirm {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const errors: ConfirmFormErrors = {};

  if (!isPickupId(raw.primaryId)) return { ok: false, errors, message: "Atleta não encontrado. Atualize a página." };
  const mates = Array.isArray(raw.mateIds) ? raw.mateIds : [];
  if (!mates.every(isPickupId)) return { ok: false, errors, message: "Atleta não encontrado. Atualize a página." };
  const ids = [...new Set([raw.primaryId, ...(mates as string[])])];
  if (ids.length > MAX_BATCH) return { ok: false, errors, message: `Confirme até ${MAX_BATCH} camisas por vez.` };

  const self = raw.self === true;
  const name = clean(raw.name);
  const document = clean(raw.document);
  if (!self) {
    if (!name) errors.name = "Informe o nome de quem está retirando.";
    else if (name.length > 120) errors.name = "Use até 120 caracteres.";
    if (document.length > 40) errors.document = "Use até 40 caracteres.";
  }

  const deliveredSize = clean(raw.deliveredSize).toUpperCase();
  if (!deliveredSize) errors.deliveredSize = "Escolha o tamanho entregue.";
  else if (deliveredSize.length > 12) errors.deliveredSize = "Use até 12 caracteres.";

  const note = typeof raw.note === "string" ? raw.note.trim() : "";
  if (note.length > 300) errors.note = "Use até 300 caracteres.";

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    ids,
    pickup: {
      primary_id: raw.primaryId,
      self,
      name: self ? "" : name,
      document: self ? "" : document,
      delivered_size: deliveredSize,
      note,
    },
  };
}

/** "A", "A e B", "A, B e C". */
export const joinNames = (names: string[]) =>
  names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
