"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AuthShell, FormMessage } from "@/components/AuthShell";
import { btnPrimary, input, label, textLink } from "@/components/ui/styles";
import { requestReset } from "./actions";

export default function RecuperarSenhaPage() {
  const [state, action, pending] = useActionState(requestReset, undefined);

  return (
    <AuthShell title="Recuperar senha" subtitle="Enviaremos um link para criar uma nova senha.">
      <form action={action} className="flex flex-col gap-4">
        {state?.error && <FormMessage tone="error">{state.error}</FormMessage>}
        {state?.success && <FormMessage tone="success">{state.success}</FormMessage>}
        <label className="flex flex-col gap-1.5">
          <span className={label}>E-mail</span>
          <input className={input} type="email" name="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required />
        </label>
        <button type="submit" className={btnPrimary} disabled={pending}>
          {pending ? "Enviando…" : "Enviar link"}
        </button>
        <Link href="/login" className={textLink}>
          Voltar para o login
        </Link>
      </form>
    </AuthShell>
  );
}
