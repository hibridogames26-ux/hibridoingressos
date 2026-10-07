"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { FormMessage } from "@/components/AuthShell";
import { btnOutline, btnPrimary, btnSecondary, input, label } from "@/components/ui/styles";
import type { SettingsFormInput } from "@/lib/shirt-settings";
import { updateSettingsAction } from "./actions";

export function Field({ id, text, hint, children }: { id: string; text: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className={label}>
        {text}
      </label>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}

/** "Editar configurações": painel lateral com preço, lote, janela, grade e textos da venda. */
export function SettingsDrawer({ initial, buttonClassName }: { initial: SettingsFormInput; buttonClassName?: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [pending, start] = useTransition();
  const [values, setValues] = useState<SettingsFormInput>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const back = () => openerRef.current?.focus();
    dialog.addEventListener("close", back);
    return () => dialog.removeEventListener("close", back);
  }, []);

  const set = (key: keyof SettingsFormInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  const open = (e: React.MouseEvent<HTMLElement>) => {
    openerRef.current = e.currentTarget;
    setValues(initial);
    setError(null);
    setSaved(false);
    dialogRef.current?.showModal();
  };

  const save = () => {
    setError(null);
    setSaved(false);
    start(async () => {
      const result = await updateSettingsAction(values);
      if (result.ok) {
        setSaved(true);
        dialogRef.current?.close();
      } else {
        setError(result.message);
      }
    });
  };

  return (
    <>
      <button type="button" className={buttonClassName ?? btnOutline} onClick={open}>
        Editar configurações
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby="settings-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) dialogRef.current?.close();
        }}
        className="m-0 ml-auto h-dvh max-h-dvh w-[min(34rem,100vw)] overflow-y-auto bg-surface p-0 text-ink shadow-whisper backdrop:bg-ink/40"
      >
        <div className="flex flex-col gap-5 p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 id="settings-title" className="text-[22px] font-semibold leading-tight">
              Configurações da venda
            </h2>
            <button type="button" className={btnSecondary} onClick={() => dialogRef.current?.close()}>
              Fechar
            </button>
          </div>
          <p className="text-sm text-cool-gray">
            Com a venda aberta ou só com cupom, nenhuma condição pode ficar em branco. O preço vale só para novas encomendas:
            as já feitas guardam o preço da compra.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="s-preco" text="Preço (R$)">
              <input id="s-preco" className={input} inputMode="decimal" value={values.price} onChange={set("price")} />
            </Field>
            <Field id="s-lote" text="Limite do lote" hint="Camisas pagas mais reservas.">
              <input id="s-lote" className={input} inputMode="numeric" value={values.batchLimit} onChange={set("batchLimit")} />
            </Field>
            <Field id="s-max" text="Máximo por compra" hint="De 1 a 10.">
              <input id="s-max" className={input} inputMode="numeric" value={values.maxPerOrder} onChange={set("maxPerOrder")} />
            </Field>
            <Field id="s-ate" text="Encomendas até" hint="Horário de Brasília. Vale para todos os modos.">
              <input id="s-ate" type="datetime-local" className={input} value={values.salesEnd} onChange={set("salesEnd")} />
            </Field>
            <Field id="s-abre" text="Abre ao público em (opcional)" hint="Vale só no modo Aberta.">
              <input id="s-abre" type="datetime-local" className={input} value={values.salesStart} onChange={set("salesStart")} />
            </Field>
            <Field id="s-grade" text="Grade de tamanhos" hint="Separe por vírgula. Tamanho com encomendas não sai: desabilite.">
              <input id="s-grade" className={input} value={values.sizes} onChange={set("sizes")} autoCapitalize="characters" />
            </Field>
          </div>

          <Field id="s-desc" text="Descrição">
            <textarea id="s-desc" rows={2} className={input} value={values.description} onChange={set("description")} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="s-comp" text="Composição">
              <input id="s-comp" className={input} value={values.composition} onChange={set("composition")} />
            </Field>
            <Field id="s-fit" text="Modelagem">
              <input id="s-fit" className={input} value={values.fit} onChange={set("fit")} />
            </Field>
          </div>
          <Field id="s-prazo" text="Prazo de produção">
            <textarea id="s-prazo" rows={2} className={input} value={values.leadTime} onChange={set("leadTime")} />
          </Field>
          <Field id="s-receb" text="Forma de recebimento">
            <textarea id="s-receb" rows={2} className={input} value={values.receipt} onChange={set("receipt")} />
          </Field>
          <Field id="s-pol" text="Trocas, cancelamento e atendimento">
            <textarea id="s-pol" rows={3} className={input} value={values.policy} onChange={set("policy")} />
          </Field>
          <Field id="s-guia" text="Guia de medidas">
            <textarea id="s-guia" rows={4} className={input} value={values.sizeGuide} onChange={set("sizeGuide")} />
          </Field>

          {error && <FormMessage tone="error">{error}</FormMessage>}
          {saved && <FormMessage tone="success">Configurações salvas.</FormMessage>}
          <div className="flex flex-wrap gap-2 pb-2">
            <button type="button" className={btnPrimary} disabled={pending} onClick={save}>
              {pending ? "Salvando…" : "Salvar configurações"}
            </button>
            <button type="button" className={btnSecondary} onClick={() => dialogRef.current?.close()}>
              Cancelar
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
