import "server-only";
import { createHmac, randomBytes, randomInt } from "node:crypto";

/** Sessão aberta pelo código enviado ao e-mail da inscrição (Story 4.3). */
export const CHECKIN_COOKIE = "hg_checkin_email";
export const SESSION_MAX_AGE = 2 * 60 * 60;

/** Segredo do HMAC: CHECKIN_SECRET, ou a service role (já secreta) como padrão. */
function secret() {
  const value = process.env.CHECKIN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!value) throw new Error("Variável de ambiente ausente: CHECKIN_SECRET (ou SUPABASE_SERVICE_ROLE_KEY).");
  return value;
}

const hmac = (value: string) => createHmac("sha256", secret()).update(value).digest("hex");

/** E-mail como o banco compara: sem espaços nas pontas e em minúsculas. */
export const normalizeEmail = (value: string) => value.trim().toLowerCase();

/** Código de 6 dígitos (pode começar com zero). */
export const generateCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

export const hashEmailCode = (email: string, code: string) => hmac(`email-code:${normalizeEmail(email)}:${code}`);

export const newSessionKey = () => randomBytes(32).toString("base64url");

export const hashEmailSession = (key: string) => hmac(`email-session:${key}`);

/** Valor do cookie: só a chave da sessão. */
export function readSessionCookie(value: string | undefined) {
  return value && /^[A-Za-z0-9_-]{40,60}$/.test(value) ? value : null;
}

export const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
