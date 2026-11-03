// Regras do formulário de check-in, usadas no aparelho (etapa a etapa) e no servidor (envio final).
import { cleanName, isFullName, isValidEmail, isValidPhone, onlyDigits } from "@/lib/checkout";
import { PARQ_QUESTIONS } from "./terms";

export type ParqAnswer = "sim" | "nao" | "";

export type CheckinDraft = {
  fullName: string;
  birthDate: string;
  phone: string;
  email: string;
  emergencyName: string;
  emergencyPhone: string;
  parq: ParqAnswer[];
  imageConsent: boolean;
  guardianName: string;
  guardianRelation: string;
  guardianPhone: string;
  place: string;
  agree: boolean;
};

export type CheckinField = keyof CheckinDraft | `parq.${number}` | "signature" | "guardianSignature" | "certificate";
export type FieldErrors = Partial<Record<CheckinField, string>>;

export const STEPS = ["Seus dados", "PAR-Q", "Termo", "Atestado e assinatura"] as const;
export type StepIndex = 0 | 1 | 2 | 3;

export const emptyDraft = (init: Partial<CheckinDraft> = {}): CheckinDraft => ({
  fullName: "",
  birthDate: "",
  phone: "",
  email: "",
  emergencyName: "",
  emergencyPhone: "",
  parq: PARQ_QUESTIONS.map(() => ""),
  imageConsent: false,
  guardianName: "",
  guardianRelation: "",
  guardianPhone: "",
  place: "",
  agree: false,
  ...init,
});

/** Data de hoje em São Paulo, "aaaa-mm-dd". */
export function todaySaoPaulo(now = Date.now()) {
  return new Date(now - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Idade completa em `on` ("aaaa-mm-dd"); null se a data for inválida. */
export function ageOn(birthDate: string, on: string) {
  const b = birthDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const t = on.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!b || !t) return null;
  const [by, bm, bd] = b.slice(1).map(Number);
  const check = new Date(Date.UTC(by, bm - 1, bd));
  if (check.getUTCFullYear() !== by || check.getUTCMonth() !== bm - 1 || check.getUTCDate() !== bd) return null;
  const [ty, tm, td] = t.slice(1).map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

export function isMinor(birthDate: string, on = todaySaoPaulo()) {
  const age = ageOn(birthDate, on);
  return age !== null && age < 18;
}

/** Erros da etapa informada (0 a 3). A etapa 3 não confere arquivos: o componente cuida disso. */
export function stepErrors(step: StepIndex, d: CheckinDraft, today = todaySaoPaulo()): FieldErrors {
  const e: FieldErrors = {};
  if (step === 0) {
    if (!isFullName(d.fullName)) e.fullName = "Informe nome e sobrenome.";
    const age = ageOn(d.birthDate, today);
    if (age === null) e.birthDate = "Informe a data de nascimento.";
    else if (age < 10 || age > 100) e.birthDate = "Confira a data de nascimento.";
    if (!isValidPhone(d.phone)) e.phone = "Informe o celular com DDD.";
    if (!isValidEmail(d.email)) e.email = "Informe um e-mail válido.";
    if (cleanName(d.emergencyName).length < 2) e.emergencyName = "Informe quem devemos chamar numa emergência.";
    if (!isValidPhone(d.emergencyPhone)) e.emergencyPhone = "Informe o telefone de emergência com DDD.";
    else if (onlyDigits(d.emergencyPhone) === onlyDigits(d.phone)) e.emergencyPhone = "Use um telefone diferente do seu.";
    if (age !== null && age < 18) {
      if (!isFullName(d.guardianName)) e.guardianName = "Informe o nome completo do responsável.";
      if (cleanName(d.guardianRelation).length < 2) e.guardianRelation = "Informe o parentesco (ex.: mãe, pai).";
      if (!isValidPhone(d.guardianPhone)) e.guardianPhone = "Informe o telefone do responsável com DDD.";
    }
  }
  if (step === 1) {
    d.parq.forEach((answer, i) => {
      if (answer !== "sim" && answer !== "nao") e[`parq.${i}`] = "Responda Sim ou Não.";
    });
  }
  if (step === 3) {
    if (cleanName(d.place).length < 2) e.place = "Informe a cidade onde você está assinando.";
    if (!d.agree) e.agree = "Confirme a declaração final para assinar.";
  }
  return e;
}

/** Primeira etapa com erro (para levar o atleta até ela). */
export function firstErrorStep(errors: FieldErrors): StepIndex | null {
  const keys = Object.keys(errors);
  if (!keys.length) return null;
  const step0: string[] = ["fullName", "birthDate", "phone", "email", "emergencyName", "emergencyPhone", "guardianName", "guardianRelation", "guardianPhone"];
  if (keys.some((k) => step0.includes(k))) return 0;
  if (keys.some((k) => k.startsWith("parq."))) return 1;
  return 3;
}

export type CleanCheckin = {
  fullName: string;
  birthDate: string;
  phone: string;
  email: string;
  emergencyName: string;
  emergencyPhone: string;
  parq: boolean[];
  parqAnyYes: boolean;
  imageConsent: boolean;
  isMinor: boolean;
  guardianName: string | null;
  guardianRelation: string | null;
  guardianPhone: string | null;
  place: string;
};

const str = (v: unknown, max = 120) => (typeof v === "string" ? v.slice(0, max) : "");

/** Valida tudo no servidor a partir de dados não confiáveis. */
export function parseCheckin(input: unknown, today = todaySaoPaulo()):
  | { ok: true; data: CleanCheckin }
  | { ok: false; errors: FieldErrors } {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const parqRaw = Array.isArray(raw.parq) ? raw.parq : [];
  const draft = emptyDraft({
    fullName: str(raw.fullName),
    birthDate: str(raw.birthDate, 10),
    phone: str(raw.phone, 30),
    email: str(raw.email, 120).trim().toLowerCase(),
    emergencyName: str(raw.emergencyName),
    emergencyPhone: str(raw.emergencyPhone, 30),
    parq: PARQ_QUESTIONS.map((_, i) => (parqRaw[i] === "sim" || parqRaw[i] === "nao" ? parqRaw[i] : "")) as ParqAnswer[],
    imageConsent: raw.imageConsent === true,
    guardianName: str(raw.guardianName),
    guardianRelation: str(raw.guardianRelation, 60),
    guardianPhone: str(raw.guardianPhone, 30),
    place: str(raw.place, 80),
    agree: raw.agree === true,
  });

  const errors = ([0, 1, 3] as const).reduce<FieldErrors>((acc, s) => ({ ...acc, ...stepErrors(s, draft, today) }), {});
  if (Object.keys(errors).length) return { ok: false, errors };

  const minor = isMinor(draft.birthDate, today);
  const parq = draft.parq.map((a) => a === "sim");
  return {
    ok: true,
    data: {
      fullName: cleanName(draft.fullName),
      birthDate: draft.birthDate,
      phone: onlyDigits(draft.phone),
      email: draft.email,
      emergencyName: cleanName(draft.emergencyName),
      emergencyPhone: onlyDigits(draft.emergencyPhone),
      parq,
      parqAnyYes: parq.some(Boolean),
      imageConsent: draft.imageConsent,
      isMinor: minor,
      guardianName: minor ? cleanName(draft.guardianName) : null,
      guardianRelation: minor ? cleanName(draft.guardianRelation) : null,
      guardianPhone: minor ? onlyDigits(draft.guardianPhone) : null,
      place: cleanName(draft.place),
    },
  };
}

// ---------------------------------------------------------------------------
// Arquivos
// ---------------------------------------------------------------------------
export const CERTIFICATE_MAX_BYTES = 10 * 1024 * 1024;
export const CERTIFICATE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
};

export function certificateProblem(file: { type: string; size: number }) {
  if (!CERTIFICATE_TYPES[file.type]) return "Envie uma foto (JPG, PNG, WEBP ou HEIC) ou um PDF.";
  if (file.size <= 0) return "O arquivo está vazio.";
  if (file.size > CERTIFICATE_MAX_BYTES) return "O arquivo passa de 10 MB. Tire uma foto do atestado ou envie um PDF menor.";
  return null;
}

/** "antonio.s.jr@live.com" → "an•••@live.com". */
export function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!domain) return "•••";
  const keep = local.length <= 3 ? 1 : 2;
  return `${local.slice(0, keep)}•••@${domain}`;
}
