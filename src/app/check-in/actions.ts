"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { CHECKIN_COOKIE, SESSION_MAX_AGE, readSessionCookie } from "@/lib/checkin/code";
import { endEmailSession, requestEmailCode, verifyEmailCode } from "@/lib/checkin/service";

const FAIL = "Não foi possível concluir agora. Verifique a conexão e tente de novo.";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SendCodeResult =
  | { ok: true; maskedEmail: string; devCode?: string }
  | { ok: false; message: string; wait?: number; notFound?: boolean };

export async function sendEmailCode(email: string): Promise<SendCodeResult> {
  try {
    const value = typeof email === "string" ? email.trim().slice(0, 160) : "";
    if (!EMAIL.test(value)) return { ok: false, message: "Digite um e-mail válido, como nome@gmail.com." };

    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
    const result = await requestEmailCode(value, ip);
    if (result.ok) return result;
    switch (result.reason) {
      case "not_found":
        return {
          ok: false,
          notFound: true,
          message:
            "Não encontramos inscrição com este e-mail. Confira se é o mesmo e-mail usado na inscrição (nas duplas, o de quem inscreveu a dupla).",
        };
      case "done":
        return { ok: false, message: "Todos os atletas deste e-mail já fizeram o check-in. Nos vemos no evento!" };
      case "cooldown":
        return { ok: false, message: `Aguarde ${result.wait ?? 60} s para pedir um novo código.`, wait: result.wait };
      case "limit":
        return { ok: false, message: "Muitos códigos pedidos para este e-mail na última hora. Tente de novo mais tarde." };
      case "ip_limit":
        return {
          ok: false,
          notFound: true,
          message: "Muitas tentativas com e-mails não encontrados a partir desta conexão. Aguarde uma hora para tentar de novo.",
        };
      default:
        return { ok: false, message: "Não conseguimos enviar o e-mail agora. Tente de novo em instantes." };
    }
  } catch (error) {
    console.error("Error in sendEmailCode:", error);
    return { ok: false, message: FAIL };
  }
}

export type CheckCodeResult = { ok: true } | { ok: false; message: string; expired?: boolean };

export async function checkEmailCode(email: string, code: string): Promise<CheckCodeResult> {
  try {
    const digits = typeof code === "string" ? code.replace(/\D/g, "") : "";
    if (digits.length !== 6) return { ok: false, message: "Digite os 6 números do código." };
    if (typeof email !== "string" || !EMAIL.test(email.trim())) return { ok: false, message: "Peça um código primeiro.", expired: true };

    const result = await verifyEmailCode(email, digits);
    if (result.ok) {
      (await cookies()).set(CHECKIN_COOKIE, result.sessionKey, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/check-in",
        maxAge: SESSION_MAX_AGE,
      });
      return { ok: true };
    }
    switch (result.reason) {
      case "invalid":
        return {
          ok: false,
          message: `Código incorreto. ${result.remaining === 1 ? "Resta 1 tentativa." : `Restam ${result.remaining} tentativas.`}`,
        };
      case "locked":
        return { ok: false, message: "Tentativas esgotadas. Peça um novo código.", expired: true };
      case "expired":
        return { ok: false, message: "Este código venceu. Peça um novo.", expired: true };
      default:
        return { ok: false, message: "Peça um código primeiro.", expired: true };
    }
  } catch (error) {
    console.error("Error in checkEmailCode:", error);
    return { ok: false, message: FAIL };
  }
}

/** “Usar outro e-mail”: encerra a sessão deste aparelho. */
export async function leaveSession() {
  const store = await cookies();
  try {
    await endEmailSession(readSessionCookie(store.get(CHECKIN_COOKIE)?.value));
  } catch (error) {
    console.error("Error in leaveSession:", error);
  }
  store.delete({ name: CHECKIN_COOKIE, path: "/check-in" });
  redirect("/check-in");
}
