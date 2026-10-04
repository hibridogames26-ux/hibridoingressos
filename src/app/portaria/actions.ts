"use server";

import { getCurrentProfile } from "@/lib/auth";
import { normalizeCode, type RedeemResult } from "@/lib/redeem";
import { createClient } from "@/lib/supabase/server";

export async function redeem(rawCode: string): Promise<RedeemResult> {
  const profile = await getCurrentProfile();
  if (!profile?.active) {
    return { result: "erro", message: "Sessão expirada ou acesso desativado. Entre novamente." };
  }

  const code = normalizeCode(String(rawCode ?? ""));
  if (!code) return { result: "invalido" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("redeem_ticket", { p_code: code });
  if (error) {
    console.error("Error in redeem_ticket:", error);
    return {
      result: "erro",
      message:
        error.code === "42501"
          ? "Sua conta não tem permissão para ler ingressos."
          : "Não foi possível validar. Tente novamente.",
    };
  }
  return data as RedeemResult;
}
