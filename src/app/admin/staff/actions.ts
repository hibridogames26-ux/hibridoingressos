"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile, type Role } from "@/lib/auth";
import { siteUrl } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/server";

export type StaffFormState = { error?: string; success?: string } | undefined;

const BAN_FOREVER = "876000h"; // ~100 anos

/** Server Actions são endpoints públicos: revalida o admin em toda chamada. */
async function assertAdmin() {
  const profile = await getCurrentProfile();
  if (!profile?.active || profile.role !== "admin") {
    throw new Error("Não autorizado");
  }
  return profile;
}

const inviteRedirect = () => `${siteUrl()}/auth/confirm?next=/definir-senha`;

export async function inviteStaff(_: StaffFormState, formData: FormData): Promise<StaffFormState> {
  await assertAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role: Role = formData.get("role") === "admin" ? "admin" : "staff";
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Informe nome e um e-mail válido." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { name },
    redirectTo: inviteRedirect(),
  });
  if (error || !data.user) {
    const exists = error?.message?.toLowerCase().includes("already");
    return {
      error: exists
        ? "Este e-mail já tem uma conta. Use “Reenviar acesso” na lista."
        : `Não foi possível enviar o convite: ${error?.message ?? "erro desconhecido"}`,
    };
  }

  const { error: profileError } = await admin
    .from("profiles")
    .upsert({ user_id: data.user.id, name, email, role, active: true });
  if (profileError) {
    return { error: `Convite enviado, mas o perfil não foi salvo: ${profileError.message}` };
  }

  revalidatePath("/admin/staff");
  return { success: `Convite enviado para ${email}.` };
}

export async function setStaffActive(userId: string, active: boolean) {
  const me = await assertAdmin();
  if (userId === me.user_id) throw new Error("Você não pode desativar a própria conta.");

  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ active }).eq("user_id", userId);
  if (error) throw new Error(`Falha ao atualizar o perfil: ${error.message}`);

  // Bloqueia também no Auth, para encerrar o acesso mesmo com sessão aberta.
  const { error: banError } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: active ? "none" : BAN_FOREVER,
  });
  if (banError) throw new Error(`Perfil atualizado, mas o bloqueio falhou: ${banError.message}`);

  revalidatePath("/admin/staff");
}

/** Reenvia o convite (conta não confirmada) ou um link de redefinição de senha. */
export async function resendAccess(userId: string): Promise<string> {
  await assertAdmin();

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user?.email) throw new Error("Usuário não encontrado.");
  const { email, email_confirmed_at } = data.user;

  if (!email_confirmed_at) {
    const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: inviteRedirect(),
    });
    if (inviteError) throw new Error(`Falha ao reenviar convite: ${inviteError.message}`);
    return `Convite reenviado para ${email}.`;
  }

  const { error: resetError } = await admin.auth.resetPasswordForEmail(email, {
    redirectTo: inviteRedirect(),
  });
  if (resetError) throw new Error(`Falha ao enviar o link: ${resetError.message}`);
  return `Link para definir senha enviado para ${email}.`;
}
