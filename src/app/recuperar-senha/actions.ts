"use server";

import { sendAuthLink } from "@/lib/auth-links";
import type { FormState } from "@/app/login/actions";

const SENT = "Se o e-mail tiver acesso, você vai receber um link em instantes.";

export async function requestReset(_: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { error: "Informe seu e-mail." };

  try {
    const result = await sendAuthLink({ kind: "recovery", email });
    // Mesma resposta quando o e-mail não tem conta, para não revelar quem tem acesso.
    if (!result.ok && result.code !== "user_not_found") {
      console.error(`Falha ao gerar link de redefinição: ${result.error}`);
    }
  } catch (error) {
    console.error("Falha ao enviar link de redefinição:", error);
    return { error: "Não foi possível enviar o e-mail agora. Tente novamente em alguns minutos." };
  }
  return { success: SENT };
}
