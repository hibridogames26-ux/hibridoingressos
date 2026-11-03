import "server-only";
import { randomUUID } from "node:crypto";
import { siteUrl } from "@/lib/env";
import { sendCheckinCodeEmail } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/server";
import { generateCode, hashEmailCode, hashEmailSession, newSessionKey, normalizeEmail } from "./code";
import { CERTIFICATE_TYPES, certificateProblem, maskEmail, parseCheckin, type FieldErrors } from "./form";
import { displayName, type Competition } from "./sheet";
import { summarizeProgress, type CheckinProgress } from "./progress";
import { COMPETITION_LABEL, TERMS_VERSION, termsSnapshot } from "./terms";

export const CHECKIN_BUCKET = "checkin-docs";

/** Tabela ausente: migration ainda não aplicada. */
const isMissingTable = (error: { code?: string } | null) => error?.code === "42P01" || error?.code === "PGRST205";

// ---------------------------------------------------------------------------
// Progresso público: só números agregados (Story 4.3)
// ---------------------------------------------------------------------------
export type BoardAthlete = { id: string; name: string; confirmed: boolean };

type Embedded<T> = T | T[] | null;
const one = <T,>(value: Embedded<T>) => (Array.isArray(value) ? (value[0] ?? null) : value);

export async function getProgress(): Promise<CheckinProgress | "unavailable"> {
  const { data, error } = await createAdminClient()
    .from("athlete_registrations")
    .select("competition, athletes(id, athlete_checkins(id))")
    .eq("status", "aprovado");
  if (isMissingTable(error)) return "unavailable";
  if (error) throw new Error(`Failed to load check-in progress: ${error.message}`);
  return summarizeProgress(
    (data ?? []).map((r) => ({
      competition: r.competition as Competition,
      athletes: (r.athletes ?? []).map((a) => ({ confirmed: !!one(a.athlete_checkins as Embedded<{ id: string }>) })),
    })),
  );
}

// ---------------------------------------------------------------------------
// Atletas das inscrições de um e-mail (depois do código)
// ---------------------------------------------------------------------------
export type SessionRegistration = {
  id: string;
  competition: Competition;
  category: string;
  teamName: string;
  kind: "dupla" | "individual";
  athletes: BoardAthlete[];
};

async function registrationsFor(email: string) {
  const { data, error } = await createAdminClient()
    .from("athlete_registrations")
    .select("id, competition, category, team_name, kind, email, athletes(id, full_name, position, athlete_checkins(signed_at))")
    .eq("status", "aprovado")
    .ilike("email", email.replace(/[\\%_]/g, (c) => `\\${c}`))
    .order("competition")
    .order("team_name");
  if (error) throw new Error(`Failed to load registrations: ${error.message}`);
  // ilike ignora caixa; a comparação final segue a regra do banco (sem espaços, minúsculas).
  return (data ?? []).filter((r) => normalizeEmail(r.email) === email);
}

export async function listSessionAthletes(email: string): Promise<SessionRegistration[]> {
  const rows = await registrationsFor(normalizeEmail(email));
  return rows.map((r) => ({
    id: r.id,
    competition: r.competition as Competition,
    category: r.category,
    teamName: r.team_name,
    kind: r.kind as SessionRegistration["kind"],
    athletes: [...(r.athletes ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((a) => ({
        id: a.id,
        name: displayName(a.full_name),
        confirmed: !!one(a.athlete_checkins as Embedded<{ signed_at: string }>),
      })),
  }));
}

// ---------------------------------------------------------------------------
// Atleta
// ---------------------------------------------------------------------------
export type CheckinAthlete = {
  id: string;
  name: string;
  position: number;
  competition: Competition;
  category: string;
  teamName: string;
  kind: "dupla" | "individual";
  registrationEmail: string;
  registrationPhone: string | null;
  partners: BoardAthlete[];
  signedAt: string | null;
};

export async function getAthlete(id: string): Promise<CheckinAthlete | null> {
  const { data, error } = await createAdminClient()
    .from("athletes")
    .select(
      "id, full_name, position, athlete_checkins(signed_at), athlete_registrations!inner(competition, category, team_name, kind, email, phone, status, athletes(id, full_name, athlete_checkins(signed_at)))",
    )
    .eq("id", id)
    .maybeSingle();
  if (isMissingTable(error)) return null;
  if (error) throw new Error(`Failed to load athlete: ${error.message}`);
  if (!data) return null;

  const reg = one(data.athlete_registrations as Embedded<{
    competition: string;
    category: string;
    team_name: string;
    kind: string;
    email: string;
    phone: string | null;
    status: string;
    athletes: { id: string; full_name: string; athlete_checkins: Embedded<{ signed_at: string }> }[];
  }>);
  if (!reg || reg.status !== "aprovado") return null;

  return {
    id: data.id,
    name: displayName(data.full_name),
    position: data.position,
    competition: reg.competition as Competition,
    category: reg.category,
    teamName: reg.team_name,
    kind: reg.kind as CheckinAthlete["kind"],
    registrationEmail: reg.email,
    registrationPhone: reg.phone,
    partners: (reg.athletes ?? [])
      .filter((a) => a.id !== data.id)
      .map((a) => ({ id: a.id, name: displayName(a.full_name), confirmed: !!one(a.athlete_checkins) })),
    signedAt: one(data.athlete_checkins as Embedded<{ signed_at: string }>)?.signed_at ?? null,
  };
}

// ---------------------------------------------------------------------------
// Código pelo e-mail da inscrição e sessão (Story 4.3)
// ---------------------------------------------------------------------------
export type CodeRequestResult =
  | { ok: true; maskedEmail: string; devCode?: string }
  | { ok: false; reason: "not_found" | "done" | "cooldown" | "limit" | "ip_limit" | "send_failed"; wait?: number };

export async function requestEmailCode(rawEmail: string, ip: string | null): Promise<CodeRequestResult> {
  const supabase = createAdminClient();
  const email = normalizeEmail(rawEmail);
  const code = generateCode();
  const { data, error } = await supabase.rpc("issue_checkin_email_code", {
    p_email: email,
    p_code_hash: hashEmailCode(email, code),
    p_ip: ip,
  });
  if (error) throw new Error(`Failed to issue check-in code: ${error.message}`);

  const result = data as { status: string; email?: string; wait?: number };
  if (result.status !== "ok" || !result.email) {
    const reason = (["not_found", "done", "cooldown", "limit", "ip_limit"] as const).find((r) => r === result.status) ?? "not_found";
    return { ok: false, reason, wait: result.wait };
  }

  try {
    const athletes = (await listSessionAthletes(email)).flatMap((r) => r.athletes.filter((a) => !a.confirmed).map((a) => a.name));
    const sent = await sendCheckinCodeEmail({ to: email, athletes, code, checkinUrl: `${siteUrl()}/check-in` });
    if (!sent) {
      if (process.env.NODE_ENV === "production") throw new Error("Nenhum provedor de e-mail configurado.");
      // Desenvolvimento sem provedor: o código fica no log do servidor.
      console.info(`[check-in] código para ${email}: ${code}`);
      return { ok: true, maskedEmail: maskEmail(email), devCode: code };
    }
  } catch (error) {
    console.error("Error sending check-in code:", error);
    // Libera o reenvio imediato: o código que não chegou não conta para a espera.
    await supabase
      .from("athlete_email_codes")
      .delete()
      .eq("email", email)
      .is("verified_at", null)
      .gt("created_at", new Date(Date.now() - 120_000).toISOString());
    return { ok: false, reason: "send_failed" };
  }
  return { ok: true, maskedEmail: maskEmail(email) };
}

export type VerifyResult =
  | { ok: true; sessionKey: string }
  | { ok: false; reason: "none" | "expired" | "locked" | "invalid"; remaining?: number };

export async function verifyEmailCode(rawEmail: string, code: string): Promise<VerifyResult> {
  const email = normalizeEmail(rawEmail);
  const sessionKey = newSessionKey();
  const { data, error } = await createAdminClient().rpc("verify_checkin_email_code", {
    p_email: email,
    p_code_hash: hashEmailCode(email, code),
    p_session_hash: hashEmailSession(sessionKey),
  });
  if (error) throw new Error(`Failed to verify check-in code: ${error.message}`);
  const result = data as { status: string; remaining?: number };
  if (result.status === "ok") return { ok: true, sessionKey };
  const reason = (["none", "expired", "locked", "invalid"] as const).find((r) => r === result.status) ?? "invalid";
  return { ok: false, reason, remaining: result.remaining };
}

export type EmailSession = { email: string; expiresAt: string };

/** Sessão aberta pelo código: devolve o e-mail confirmado, ou null. */
export async function getEmailSession(sessionKey: string | null): Promise<EmailSession | null> {
  if (!sessionKey) return null;
  const { data, error } = await createAdminClient()
    .from("athlete_email_codes")
    .select("email, session_expires_at")
    .eq("session_hash", hashEmailSession(sessionKey))
    .gt("session_expires_at", new Date().toISOString())
    .maybeSingle();
  if (isMissingTable(error)) return null;
  if (error) throw new Error(`Failed to load check-in session: ${error.message}`);
  return data ? { email: data.email as string, expiresAt: data.session_expires_at as string } : null;
}

/** A sessão vale para o atleta só se o e-mail confirmado for o e-mail atual da inscrição dele. */
export async function getSession(athlete: CheckinAthlete, sessionKey: string | null): Promise<EmailSession | null> {
  const session = await getEmailSession(sessionKey);
  return session && normalizeEmail(athlete.registrationEmail) === session.email ? session : null;
}

export async function endEmailSession(sessionKey: string | null) {
  if (!sessionKey) return;
  const { error } = await createAdminClient()
    .from("athlete_email_codes")
    .update({ session_expires_at: new Date().toISOString() })
    .eq("session_hash", hashEmailSession(sessionKey));
  if (error) throw new Error(`Failed to end check-in session: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Atestado: upload direto do aparelho para o Storage, com URL assinada
// ---------------------------------------------------------------------------
export async function createCertificateUpload(athleteId: string, file: { type: string; size: number }) {
  const problem = certificateProblem(file);
  if (problem) return { ok: false as const, message: problem };
  const path = `${athleteId}/atestado-${randomUUID()}.${CERTIFICATE_TYPES[file.type]}`;
  const { data, error } = await createAdminClient().storage.from(CHECKIN_BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error(`Failed to create upload URL: ${error?.message}`);
  return { ok: true as const, path, signedUrl: data.signedUrl };
}

// ---------------------------------------------------------------------------
// Envio do termo
// ---------------------------------------------------------------------------
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Assinatura: PNG em data URL, até ~600 KB. Devolve os bytes ou null. */
export function decodeSignature(value: unknown): Buffer | null {
  if (typeof value !== "string") return null;
  const m = value.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  if (!m || m[1].length > 800_000) return null;
  const bytes = Buffer.from(m[1], "base64");
  return bytes.length > 500 && bytes.subarray(0, 8).equals(PNG_MAGIC) ? bytes : null;
}

export type SubmitInput = {
  draft: unknown;
  signature: unknown;
  guardianSignature: unknown;
  certificate: { path: unknown; name: unknown };
};

export type SubmitResult =
  | { ok: true }
  | { ok: false; message: string; errors?: FieldErrors; reason?: "session" | "done" };

export async function submitCheckin(
  athlete: CheckinAthlete,
  sessionEmail: string,
  input: SubmitInput,
  meta: {
    ip: string | null;
    userAgent: string | null;
    /** Check-in presencial: admin que registrou no próprio aparelho (Story 4.5). */
    recordedBy?: { id: string; name: string | null };
  },
): Promise<SubmitResult> {
  const parsed = parseCheckin(input.draft);
  if (!parsed.ok) return { ok: false, message: "Confira os campos destacados.", errors: parsed.errors };
  const data = parsed.data;

  const errors: FieldErrors = {};
  const signature = decodeSignature(input.signature);
  if (!signature) errors.signature = "Assine no quadro antes de enviar.";
  const guardianSignature = data.isMinor ? decodeSignature(input.guardianSignature) : null;
  if (data.isMinor && !guardianSignature) errors.guardianSignature = "O responsável legal precisa assinar.";

  const certPath = typeof input.certificate?.path === "string" ? input.certificate.path : "";
  const certOk = certPath.startsWith(`${athlete.id}/atestado-`) && /^[0-9a-f-]+\/atestado-[0-9a-f-]+\.(jpg|png|webp|heic|heif|pdf)$/.test(certPath);
  if (!certOk) errors.certificate = "Anexe o atestado médico.";
  if (Object.keys(errors).length) return { ok: false, message: "Faltam itens para concluir.", errors };

  const supabase = createAdminClient();
  const storage = supabase.storage.from(CHECKIN_BUCKET);

  const { data: info, error: infoError } = await storage.info(certPath);
  if (infoError || !info) {
    return { ok: false, message: "Não encontramos o atestado enviado. Anexe o arquivo de novo.", errors: { certificate: "Anexe o atestado de novo." } };
  }

  const upload = async (bytes: Buffer, kind: string) => {
    const path = `${athlete.id}/${kind}-${randomUUID()}.png`;
    const { error } = await storage.upload(path, bytes, { contentType: "image/png", upsert: false });
    if (error) throw new Error(`Failed to store ${kind}: ${error.message}`);
    return path;
  };
  const signaturePath = await upload(signature!, "assinatura");
  const guardianPath = guardianSignature ? await upload(guardianSignature, "assinatura-responsavel") : null;

  const { error } = await supabase.from("athlete_checkins").insert({
    athlete_id: athlete.id,
    terms_version: TERMS_VERSION,
    terms_text: termsSnapshot(athlete.competition, athlete.category),
    full_name: data.fullName,
    birth_date: data.birthDate,
    phone: data.phone,
    email: data.email,
    emergency_name: data.emergencyName,
    emergency_phone: data.emergencyPhone,
    competition: COMPETITION_LABEL[athlete.competition],
    category: athlete.category,
    parq: data.parq,
    parq_any_yes: data.parqAnyYes,
    image_consent: data.imageConsent,
    is_minor: data.isMinor,
    guardian_name: data.guardianName,
    guardian_relation: data.guardianRelation,
    guardian_phone: data.guardianPhone,
    place: data.place,
    signature_path: signaturePath,
    guardian_signature_path: guardianPath,
    certificate_path: certPath,
    certificate_name: typeof input.certificate.name === "string" ? input.certificate.name.slice(0, 160) : null,
    certificate_type: (info as { contentType?: string }).contentType ?? null,
    certificate_size: (info as { size?: number }).size ?? null,
    verified_email: sessionEmail,
    ip: meta.ip,
    user_agent: meta.userAgent?.slice(0, 300) ?? null,
    ...(meta.recordedBy ? { recorded_by: meta.recordedBy.id, recorded_by_name: meta.recordedBy.name } : {}),
  });

  if (error) {
    await storage.remove([signaturePath, ...(guardianPath ? [guardianPath] : [])]);
    if (error.code === "23505") return { ok: false, message: "O check-in deste atleta já foi confirmado.", reason: "done" };
    throw new Error(`Failed to save check-in: ${error.message}`);
  }

  if (meta.recordedBy) {
    const { error: auditError } = await supabase.from("athlete_audit_log").insert({
      actor_id: meta.recordedBy.id,
      actor_name: meta.recordedBy.name,
      athlete_id: athlete.id,
      kind: "checkin",
      detail: {},
    });
    // O termo já está salvo: falha no histórico só vai para o log.
    if (auditError) console.error("Error writing presencial check-in audit:", auditError);
  }

  // A sessão do e-mail continua: o outro integrante da dupla pode seguir no mesmo aparelho.
  // O termo não é reenviado porque o banco aceita um check-in por atleta.
  return { ok: true };
}
