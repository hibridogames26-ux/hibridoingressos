"use server";

import { cookies, headers } from "next/headers";
import { CHECKIN_COOKIE, isUuid, readSessionCookie } from "@/lib/checkin/code";
import {
  createCertificateUpload,
  getAthlete,
  getSession,
  submitCheckin,
  type CheckinAthlete,
  type SubmitInput,
  type SubmitResult,
} from "@/lib/checkin/service";

const FAIL = "Não foi possível concluir agora. Verifique a conexão e tente de novo.";

async function loadAthlete(athleteId: string) {
  if (typeof athleteId !== "string" || !isUuid(athleteId)) return null;
  return getAthlete(athleteId);
}

/** Sessão do e-mail da inscrição deste atleta (Story 4.3). */
async function currentSession(athlete: CheckinAthlete) {
  const store = await cookies();
  return getSession(athlete, readSessionCookie(store.get(CHECKIN_COOKIE)?.value));
}

export type UploadTicket = { ok: true; path: string; signedUrl: string } | { ok: false; message: string; session?: boolean };

export async function prepareCertificateUpload(athleteId: string, file: { type: string; size: number }): Promise<UploadTicket> {
  try {
    const athlete = await loadAthlete(athleteId);
    if (!athlete || athlete.signedAt) return { ok: false, message: "Este check-in não está aberto." };
    if (!(await currentSession(athlete))) {
      return { ok: false, message: "Sua confirmação por e-mail expirou. Confirme de novo para continuar.", session: true };
    }
    const type = typeof file?.type === "string" ? file.type : "";
    const size = typeof file?.size === "number" ? file.size : 0;
    return await createCertificateUpload(athlete.id, { type, size });
  } catch (error) {
    console.error("Error in prepareCertificateUpload:", error);
    return { ok: false, message: FAIL };
  }
}

export async function sendCheckin(athleteId: string, input: SubmitInput): Promise<SubmitResult> {
  try {
    const athlete = await loadAthlete(athleteId);
    if (!athlete) return { ok: false, message: "Atleta não encontrado na lista de inscritos." };
    if (athlete.signedAt) return { ok: false, message: "O check-in deste atleta já foi confirmado.", reason: "done" };
    const session = await currentSession(athlete);
    if (!session) {
      return { ok: false, message: "Sua confirmação por e-mail expirou. Confirme de novo; o que você preencheu continua salvo neste aparelho.", reason: "session" };
    }

    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
    // A sessão continua depois do envio: o outro integrante da dupla segue no mesmo aparelho.
    return await submitCheckin(athlete, session.email, input, { ip, userAgent: h.get("user-agent") });
  } catch (error) {
    console.error("Error in sendCheckin:", error);
    return { ok: false, message: FAIL };
  }
}
