// Regras do painel: editar cadastro do atleta e refazer check-in (Story 4.4).
import { formatDateTime } from "@/lib/format";
import type { Competition } from "./sheet";
import { COMPETITION_LABEL } from "./terms";

// ---------------------------------------------------------------------------
// Editar cadastro
// ---------------------------------------------------------------------------
export type RegistrationStatus = "aprovado" | "cancelado";

export const STATUS_LABEL: Record<RegistrationStatus, string> = { aprovado: "Aprovada", cancelado: "Cancelada" };

export type EditFormInput = {
  fullName: string;
  instagram: string;
  shirtSize: string;
  email: string;
  phone: string;
  teamName: string;
  box: string;
  competition: string;
  category: string;
  status: string;
};

export type EditErrors = Partial<Record<keyof EditFormInput, string>>;

/** Campos como o banco guarda (nomes das colunas). */
export type AthleteFields = { full_name: string; instagram: string | null; shirt_size: string | null };
export type RegistrationFields = {
  email: string;
  phone: string | null;
  team_name: string;
  box: string | null;
  competition: Competition;
  category: string;
  status: RegistrationStatus;
};

export type ParsedEdit =
  | { ok: true; athlete: AthleteFields; registration: RegistrationFields }
  | { ok: false; errors: EditErrors };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const clean = (value: unknown) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");

export function parseEditForm(input: unknown): ParsedEdit {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const v = (k: keyof EditFormInput) => clean(raw[k]);
  const errors: EditErrors = {};

  const fullName = v("fullName");
  if (!fullName) errors.fullName = "Informe o nome do atleta.";
  else if (fullName.length > 120) errors.fullName = "Use até 120 caracteres.";

  const instagram = v("instagram");
  if (instagram.length > 60) errors.instagram = "Use até 60 caracteres.";

  const shirtSize = v("shirtSize").toUpperCase();
  if (shirtSize.length > 12) errors.shirtSize = "Use até 12 caracteres.";

  const email = v("email").toLowerCase();
  if (!email) errors.email = "Informe o e-mail da inscrição.";
  else if (!EMAIL.test(email) || email.length > 160) errors.email = "E-mail inválido. Confira se tem @ e domínio, como nome@gmail.com.";

  const phone = v("phone");
  if (phone.length > 30) errors.phone = "Use até 30 caracteres.";

  const teamName = v("teamName");
  if (!teamName) errors.teamName = "Informe a equipe. No individual, use o nome do atleta.";
  else if (teamName.length > 120) errors.teamName = "Use até 120 caracteres.";

  const box = v("box");
  if (box.length > 120) errors.box = "Use até 120 caracteres.";

  const competition = v("competition");
  if (competition !== "hibrido-games" && competition !== "hibrido-race") errors.competition = "Escolha a competição.";

  const category = v("category");
  if (!category) errors.category = "Informe a categoria.";
  else if (category.length > 80) errors.category = "Use até 80 caracteres.";

  const status = v("status");
  if (status !== "aprovado" && status !== "cancelado") errors.status = "Escolha a situação da inscrição.";

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    athlete: { full_name: fullName, instagram: instagram || null, shirt_size: shirtSize || null },
    registration: {
      email,
      phone: phone || null,
      team_name: teamName,
      box: box || null,
      competition: competition as Competition,
      category,
      status: status as RegistrationStatus,
    },
  };
}

// ---------------------------------------------------------------------------
// Novo cadastro (Story 4.5)
// ---------------------------------------------------------------------------
export type RegistrationKind = "dupla" | "individual";
export type RegistrationOrigin = "planilha" | "manual";

export type CreateAthleteInput = { fullName: string; instagram: string; shirtSize: string };

export type CreateFormInput = {
  competition: string;
  category: string;
  kind: string;
  teamName: string;
  email: string;
  phone: string;
  box: string;
  athletes: CreateAthleteInput[];
};

/** Chaves dos erros: campos da inscrição e `athletes.<índice>.<campo>`. */
export type CreateErrorKey = Exclude<keyof CreateFormInput, "athletes"> | `athletes.${number}.${keyof CreateAthleteInput}`;
export type CreateErrors = Partial<Record<CreateErrorKey, string>>;

export type NewRegistration = {
  competition: Competition;
  category: string;
  team_name: string;
  kind: RegistrationKind;
  email: string;
  phone: string | null;
  box: string | null;
};
export type NewAthlete = AthleteFields;

export type ParsedCreate = { ok: true; registration: NewRegistration; athletes: NewAthlete[] } | { ok: false; errors: CreateErrors };

export const athleteCount = (kind: RegistrationKind) => (kind === "dupla" ? 2 : 1);

export function parseCreateForm(input: unknown): ParsedCreate {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const v = (k: Exclude<keyof CreateFormInput, "athletes">) => clean(raw[k]);
  const errors: CreateErrors = {};

  const competition = v("competition");
  if (competition !== "hibrido-games" && competition !== "hibrido-race") errors.competition = "Escolha a competição.";

  const category = v("category");
  if (!category) errors.category = "Informe a categoria.";
  else if (category.length > 80) errors.category = "Use até 80 caracteres.";

  const kind = v("kind");
  if (kind !== "dupla" && kind !== "individual") errors.kind = "Escolha o tipo da inscrição.";

  const email = v("email").toLowerCase();
  if (!email) errors.email = "Informe o e-mail da inscrição.";
  else if (!EMAIL.test(email) || email.length > 160) errors.email = "E-mail inválido. Confira se tem @ e domínio, como nome@gmail.com.";

  const phone = v("phone");
  if (phone.length > 30) errors.phone = "Use até 30 caracteres.";

  const box = v("box");
  if (box.length > 120) errors.box = "Use até 120 caracteres.";

  const list = Array.isArray(raw.athletes) ? raw.athletes : [];
  const count = kind === "dupla" ? 2 : 1;
  const athletes: NewAthlete[] = [];
  for (let i = 0; i < count; i++) {
    const a = (list[i] && typeof list[i] === "object" ? list[i] : {}) as Record<string, unknown>;
    const fullName = clean(a.fullName);
    const instagram = clean(a.instagram);
    const shirtSize = clean(a.shirtSize).toUpperCase();
    if (!fullName) errors[`athletes.${i}.fullName`] = count === 2 ? `Informe o nome do ${i + 1}º atleta.` : "Informe o nome do atleta.";
    else if (fullName.length > 120) errors[`athletes.${i}.fullName`] = "Use até 120 caracteres.";
    if (instagram.length > 60) errors[`athletes.${i}.instagram`] = "Use até 60 caracteres.";
    if (shirtSize.length > 12) errors[`athletes.${i}.shirtSize`] = "Use até 12 caracteres.";
    athletes.push({ full_name: fullName, instagram: instagram || null, shirt_size: shirtSize || null });
  }
  if (count === 2 && athletes[0].full_name && athletes[0].full_name.toLowerCase() === athletes[1].full_name.toLowerCase()) {
    errors["athletes.1.fullName"] = "Os dois atletas estão com o mesmo nome.";
  }

  // No individual, a inscrição leva o nome do atleta quando a equipe fica em branco.
  const teamName = v("teamName") || (kind === "individual" ? athletes[0]?.full_name ?? "" : "");
  if (!teamName) errors.teamName = "Informe o nome da equipe.";
  else if (teamName.length > 120) errors.teamName = "Use até 120 caracteres.";

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    registration: {
      competition: competition as Competition,
      category,
      team_name: teamName,
      kind: kind as RegistrationKind,
      email,
      phone: phone || null,
      box: box || null,
    },
    athletes,
  };
}

// ---------------------------------------------------------------------------
// Refazer check-in
// ---------------------------------------------------------------------------
export type ResetReason = "dados" | "atestado" | "assinatura" | "outro";

export const RESET_REASONS: Record<ResetReason, string> = {
  dados: "Dados do cadastro estavam errados",
  atestado: "Atestado ilegível ou inválido",
  assinatura: "Assinatura ou PAR-Q com problema",
  outro: "Outro motivo",
};

export type ParsedReset =
  | { ok: true; reason: ResetReason; note: string | null; notify: boolean }
  | { ok: false; message: string; field: "reason" | "note" };

export function parseResetForm(input: unknown): ParsedReset {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const reason = clean(raw.reason);
  if (!(reason in RESET_REASONS)) return { ok: false, message: "Escolha o motivo.", field: "reason" };
  const note = typeof raw.note === "string" ? raw.note.trim().slice(0, 500) : "";
  if (reason === "outro" && !note) return { ok: false, message: "Escreva o motivo.", field: "note" };
  return { ok: true, reason: reason as ResetReason, note: note || null, notify: raw.notify !== false };
}

/** Motivo para o atleta ler no e-mail. */
export function resetReasonText(reason: ResetReason, note: string | null) {
  return reason === "outro" ? (note ?? RESET_REASONS.outro) : `${RESET_REASONS[reason]}${note ? `: ${note}` : ""}`;
}

// ---------------------------------------------------------------------------
// Histórico
// ---------------------------------------------------------------------------
export type AthleteAuditRow = {
  id: number;
  at: string;
  actor_name: string | null;
  kind: "edit" | "reset" | "create" | "delete" | "checkin" | string;
  detail: Record<string, unknown>;
};

export const FIELD_LABEL: Record<string, string> = {
  full_name: "Nome",
  instagram: "Instagram",
  shirt_size: "Camisa",
  email: "E-mail da inscrição",
  phone: "Telefone da inscrição",
  team_name: "Equipe",
  box: "Box",
  competition: "Competição",
  category: "Categoria",
  status: "Situação",
};

const FIELD_ORDER = Object.keys(FIELD_LABEL);

function fieldValue(field: string, value: unknown) {
  if (value === null || value === undefined || value === "") return "vazio";
  const text = String(value);
  if (field === "competition") return COMPETITION_LABEL[text as Competition] ?? text;
  if (field === "status") return STATUS_LABEL[text as RegistrationStatus] ?? text;
  return text;
}

/** Linhas em português para uma entrada do histórico. */
export function describeAthleteAudit(row: Pick<AthleteAuditRow, "kind" | "detail">): { title: string; lines: string[] } {
  const d = row.detail ?? {};
  if (row.kind === "reset") {
    const reason = RESET_REASONS[d.reason as ResetReason] ?? String(d.reason ?? "");
    const signed = typeof d.signed_at === "string" ? ` O termo assinado em ${formatDateTime(d.signed_at)} foi arquivado.` : "";
    return { title: "Check-in refeito", lines: [`Motivo: ${reason}${d.note ? ` (${String(d.note)})` : ""}.${signed}`] };
  }
  if (row.kind === "edit") {
    const changes = (d.changes ?? {}) as Record<string, { from?: unknown; to?: unknown }>;
    const lines = Object.keys(changes)
      .sort((a, b) => FIELD_ORDER.indexOf(a) - FIELD_ORDER.indexOf(b))
      .map((f) => `${FIELD_LABEL[f] ?? f}: ${fieldValue(f, changes[f]?.from)} → ${fieldValue(f, changes[f]?.to)}`);
    return { title: "Cadastro editado", lines };
  }
  const names = Array.isArray(d.athletes) ? (d.athletes as unknown[]).map(String) : [];
  const who = names.length > 1 ? `Atletas: ${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}.` : names.length ? `Atleta: ${names[0]}.` : null;
  if (row.kind === "create") return { title: "Cadastro criado no painel", lines: who ? [who] : [] };
  if (row.kind === "delete") return { title: "Cadastro excluído", lines: who ? [who] : [] };
  if (row.kind === "checkin") return { title: "Check-in presencial registrado", lines: ["Termo assinado no aparelho da organização, sem código por e-mail."] };
  return { title: row.kind, lines: [] };
}

export const auditActor = (row: Pick<AthleteAuditRow, "actor_name">) => row.actor_name ?? "Linha de comando";

const ATHLETE_FIELDS = new Set(["full_name", "instagram", "shirt_size"]);

/** Histórico relevante para este atleta: o dele e as mudanças da inscrição feitas na página do parceiro. */
export function auditForAthlete(rows: (AthleteAuditRow & { athlete_id: string | null })[], athleteId: string): AthleteAuditRow[] {
  return rows.flatMap((row) => {
    if (row.athlete_id === athleteId) return [row];
    // A criação vale para os dois integrantes da dupla.
    if (row.kind === "create") return [row];
    if (row.kind !== "edit") return [];
    const changes = (row.detail?.changes ?? {}) as Record<string, unknown>;
    const shared = Object.fromEntries(Object.entries(changes).filter(([k]) => !ATHLETE_FIELDS.has(k)));
    return Object.keys(shared).length ? [{ ...row, detail: { ...row.detail, changes: shared } }] : [];
  });
}
