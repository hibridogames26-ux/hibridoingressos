import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type Role = "admin" | "staff";

export type Profile = {
  user_id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
};

/** Perfil do usuário logado, ou null. Memoizado por requisição. */
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return null;

  const { data } = await supabase
    .from("profiles")
    .select("user_id, name, email, role, active")
    .eq("user_id", userId)
    .maybeSingle<Profile>();
  return data;
});

export function homeFor(role: Role) {
  return role === "admin" ? "/admin" : "/portaria";
}

/** Exige perfil ativo com um dos papéis; senão redireciona. */
export async function requireRole(roles: Role[]): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile || !profile.active) redirect("/login?erro=sem-acesso");
  if (!roles.includes(profile.role)) redirect(homeFor(profile.role));
  return profile;
}
