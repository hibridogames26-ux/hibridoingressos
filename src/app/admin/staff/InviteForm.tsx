"use client";

import { useActionState, useEffect, useRef } from "react";
import { FormMessage } from "@/components/AuthShell";
import { btnPrimary, card, input, label } from "@/components/ui/styles";
import { inviteStaff } from "./actions";

export function InviteForm() {
  const [state, action, pending] = useActionState(inviteStaff, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className={`${card} flex flex-col gap-4 p-4 sm:p-5`}>
      <div className="flex flex-col gap-1">
        <h2 className="text-[22px] font-semibold leading-tight">Convidar pessoa</h2>
        <p className="text-sm text-cool-gray">
          Ela recebe um e-mail para criar a senha. Staff acessa só a portaria.
        </p>
      </div>
      {state?.error && <FormMessage tone="error">{state.error}</FormMessage>}
      {state?.success && <FormMessage tone="success">{state.success}</FormMessage>}
      <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto_auto] md:items-end">
        <label className="flex flex-col gap-1.5">
          <span className={label}>Nome</span>
          <input className={input} name="name" autoCapitalize="words" required maxLength={80} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={label}>E-mail</span>
          <input className={input} type="email" name="email" autoCapitalize="none" spellCheck={false} required />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={label}>Perfil</span>
          <select className={input} name="role" defaultValue="staff">
            <option value="staff">Staff (portaria)</option>
            <option value="admin">Admin (tudo)</option>
          </select>
        </label>
        <button className={btnPrimary} disabled={pending}>
          {pending ? "Enviando…" : "Enviar convite"}
        </button>
      </div>
    </form>
  );
}
