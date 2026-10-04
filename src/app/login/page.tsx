import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { getCurrentProfile, homeFor } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Entrar — Híbrido Games" };

const notices: Record<string, string> = {
  "sem-acesso": "Sua conta não tem acesso ativo. Fale com a organização.",
  "link-invalido": "O link expirou ou já foi usado. Peça um novo convite ou recupere a senha.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, erro } = await searchParams;
  const profile = await getCurrentProfile();
  if (profile?.active && !erro) redirect(homeFor(profile.role));

  return (
    <AuthShell title="Entrar" subtitle="Acesso da organização e do staff.">
      <LoginForm
        next={typeof next === "string" ? next : undefined}
        notice={typeof erro === "string" ? notices[erro] : undefined}
      />
    </AuthShell>
  );
}
