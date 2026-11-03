"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth";
import { isUuid } from "@/lib/checkin/code";
import { createCertificateUpload, getAthlete, submitCheckin, type SubmitInput, type SubmitResult } from "@/lib/checkin/service";

const FAIL = "Não foi possível concluir agora. Verifique a conexão e tente de novo.";
const DENIED = "Sem permissão para esta ação. Entre com a conta de administrador.";

/** Server Actions são endpoints públicos: confere o admin em toda chamada. */
async function currentAdmin() {
  const profile = await getCurrentProfile();
  return profile?.active && profile.role === "admin" ? profile : null;
}

async function loadAthlete(athleteId: string) {
  if (typeof athleteId !== "string" || !isUuid(athleteId)) return null;
  return getAthlete(athleteId);
}

export type AdminUploadTicket = { ok: true; path: string; signedUrl: string } | { ok: false; message: string };

/** Atestado do check-in presencial (Story 4.5): mesmo upload do atleta, autorizado pelo admin. */
export async function prepareAdminCertificateUpload(athleteId: string, file: { type: string; size: number }): Promise<AdminUploadTicket> {
  try {
    if (!(await currentAdmin())) return { ok: false, message: DENIED };
    const athlete = await loadAthlete(athleteId);
    if (!athlete || athlete.signedAt) return { ok: false, message: "Este check-in não está aberto." };
    const type = typeof file?.type === "string" ? file.type : "";
    const size = typeof file?.size === "number" ? file.size : 0;
    return await createCertificateUpload(athlete.id, { type, size });
  } catch (error) {
    console.error("Error in prepareAdminCertificateUpload:", error);
    return { ok: false, message: FAIL };
  }
}

/** Envia o termo assinado no aparelho da organização, sem código por e-mail. */
export async function sendAdminCheckin(athleteId: string, input: SubmitInput): Promise<SubmitResult> {
  try {
    const admin = await currentAdmin();
    if (!admin) return { ok: false, message: DENIED };
    const athlete = await loadAthlete(athleteId);
    if (!athlete) return { ok: false, message: "Atleta não encontrado ou inscrição cancelada." };
    if (athlete.signedAt) return { ok: false, message: "O check-in deste atleta já foi confirmado.", reason: "done" };

    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
    const result = await submitCheckin(athlete, admin.email, input, {
      ip,
      userAgent: h.get("user-agent"),
      recordedBy: { id: admin.user_id, name: admin.name },
    });
    if (result.ok) {
      revalidatePath(`/admin/documentos/${athlete.id}`);
      revalidatePath("/admin/documentos");
      revalidatePath("/check-in");
    }
    return result;
  } catch (error) {
    console.error("Error in sendAdminCheckin:", error);
    return { ok: false, message: FAIL };
  }
}
