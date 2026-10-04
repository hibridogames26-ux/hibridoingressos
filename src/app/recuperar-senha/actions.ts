"use server";

import { siteUrl } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/app/login/actions";

export async function requestReset(_: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Informe seu e-mail." };

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl()}/auth/confirm?next=/definir-senha`,
  });
  // Mesma resposta sempre, para não revelar quais e-mails têm conta.
  return { success: "Se o e-mail tiver acesso, você vai receber um link em instantes." };
}
