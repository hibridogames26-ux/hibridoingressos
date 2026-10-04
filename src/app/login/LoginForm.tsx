"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormMessage } from "@/components/AuthShell";
import { btnPrimary, input, label, textLink } from "@/components/ui/styles";
import { login } from "./actions";

export function LoginForm({ next, notice }: { next?: string; notice?: string }) {
  const [state, action, pending] = useActionState(login, undefined);

  return (
    <form action={action} className="flex flex-col gap-4">
      {state?.error ? (
        <FormMessage tone="error">{state.error}</FormMessage>
      ) : (
        notice && <FormMessage tone="error">{notice}</FormMessage>
      )}
      <input type="hidden" name="next" value={next ?? ""} />
      <label className="flex flex-col gap-1.5">
        <span className={label}>E-mail</span>
        <input className={input} type="email" name="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={label}>Senha</span>
        <input
          className={input}
          type="password"
          name="password"
          autoComplete="current-password"
          required
        />
      </label>
      <button type="submit" className={btnPrimary} disabled={pending}>
        {pending ? "Entrando…" : "Entrar"}
      </button>
      <Link href="/recuperar-senha" className={textLink}>
        Esqueci minha senha
      </Link>
    </form>
  );
}
