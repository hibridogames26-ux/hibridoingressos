"use server";

import { redirect } from "next/navigation";
import { homeFor, type Role } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; success?: string } | undefined;

/** Só permite redirecionar para caminhos internos. */
function safeNext(next: FormDataEntryValue | null) {
  const value = typeof next === "string" ? next : "";
  return value.startsWith("/") && !value.startsWith("//") ? value : null;
}

export async function login(_: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Informe e-mail e senha." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { error: "E-mail ou senha incorretos." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, active")
    .eq("user_id", data.user.id)
    .maybeSingle<{ role: Role; active: boolean }>();

  if (!profile?.active) {
    await supabase.auth.signOut();
    return { error: "Sua conta não tem acesso ativo. Fale com a organização." };
  }

  const next = safeNext(formData.get("next"));
  const allowed = next && (profile.role === "admin" || !next.startsWith("/admin"));
  redirect(allowed ? next : homeFor(profile.role));
}
