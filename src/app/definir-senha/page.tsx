"use client";

import { useActionState } from "react";
import { AuthShell, FormMessage } from "@/components/AuthShell";
import { btnPrimary, input, label } from "@/components/ui/styles";
import { setPassword } from "./actions";

export default function DefinirSenhaPage() {
  const [state, action, pending] = useActionState(setPassword, undefined);

  return (
    <AuthShell title="Definir senha" subtitle="Crie a senha que você vai usar para entrar.">
      <form action={action} className="flex flex-col gap-4">
        {state?.error && <FormMessage tone="error">{state.error}</FormMessage>}
        <label className="flex flex-col gap-1.5">
          <span className={label}>Nova senha</span>
          <input
            className={input}
            type="password"
            name="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={label}>Confirmar senha</span>
          <input
            className={input}
            type="password"
            name="confirm"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>
        <button type="submit" className={btnPrimary} disabled={pending}>
          {pending ? "Salvando…" : "Salvar e entrar"}
        </button>
      </form>
    </AuthShell>
  );
}
