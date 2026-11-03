import "server-only";
import { sendAuthLinkEmail, type AuthLinkKind } from "@/lib/email";
import { siteUrl } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/server";

/** Destino do link: /auth/confirm valida o token_hash e leva para /definir-senha. */
export function authConfirmUrl(hashedToken: string, kind: AuthLinkKind, base = siteUrl()) {
  const params = new URLSearchParams({ token_hash: hashedToken, type: kind, next: "/definir-senha" });
  return `${base}/auth/confirm?${params.toString()}`;
}

export type AuthLinkResult =
  | { ok: true; userId: string }
  | { ok: false; error: string; code?: string };

/**
 * Gera o link de convite/redefinição pelo Supabase (sem o e-mail do Supabase)
 * e envia pelo nosso provedor (Resend). Erros de geração voltam em `error`;
 * falhas de envio lançam exceção.
 */
export async function sendAuthLink(params: { kind: AuthLinkKind; email: string; name?: string }): Promise<AuthLinkResult> {
  const { kind, email, name } = params;
  const admin = createAdminClient();
  const { data, error } =
    kind === "invite"
      ? await admin.auth.admin.generateLink({ type: "invite", email, options: name ? { data: { name } } : undefined })
      : await admin.auth.admin.generateLink({ type: "recovery", email });

  const hashedToken = data?.properties?.hashed_token;
  if (error || !hashedToken || !data.user) {
    return { ok: false, error: error?.message ?? "Link não gerado", code: error?.code };
  }

  const sent = await sendAuthLinkEmail({ to: email, kind, name, actionUrl: authConfirmUrl(hashedToken, kind) });
  if (!sent) throw new Error("Nenhum provedor de e-mail configurado (RESEND_API_KEY).");
  return { ok: true, userId: data.user.id };
}
