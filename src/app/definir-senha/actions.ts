"use server";

import { redirect } from "next/navigation";
import { getCurrentProfile, homeFor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/app/login/actions";

export async function setPassword(_: FormState, formData: FormData): Promise<FormState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 8) return { error: "A senha precisa ter pelo menos 8 caracteres." };
  if (password !== confirm) return { error: "As senhas não conferem." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "Não foi possível salvar a senha. Tente abrir o link novamente." };

  const profile = await getCurrentProfile();
  if (!profile?.active) redirect("/login?erro=sem-acesso");
  redirect(homeFor(profile.role));
}
