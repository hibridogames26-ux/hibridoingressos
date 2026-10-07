"use client";

import { useState, useTransition } from "react";
import { FormMessage } from "@/components/AuthShell";
import { btnPrimary, card, input } from "@/components/ui/styles";
import { SETTINGS_SECTIONS, type SettingsFormInput, type SettingsSection as Section } from "@/lib/shirt-settings";
import { updateSettingsAction } from "../actions";
import { Field } from "../SettingsDrawer";

type Props = {
  /** Qual aba é dona dos campos: só eles são enviados ao salvar. */
  section: Exclude<Section, "tamanhos">;
  initial: SettingsFormInput;
  title: string;
  description: string;
};

/** Formulário de uma aba (Venda ou Textos e medidas). Salva só os campos da própria aba. */
export function SettingsSection({ section, initial, title, description }: Props) {
  const keys = SETTINGS_SECTIONS[section] as readonly (keyof SettingsFormInput)[];
  const [values, setValues] = useState<SettingsFormInput>(initial);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const dirty = keys.some((k) => values[k] !== initial[k]);
  const set = (key: keyof SettingsFormInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setMessage(null);
    setValues((v) => ({ ...v, [key]: e.target.value }));
  };

  const save = () =>
    start(async () => {
      setMessage(null);
      const result = await updateSettingsAction(Object.fromEntries(keys.map((k) => [k, values[k]])));
      setMessage(result.ok ? { tone: "success", text: result.message ?? "Configurações salvas." } : { tone: "error", text: result.message });
    });

  return (
    <section className={`${card} flex flex-col gap-4 p-4 sm:p-5`} aria-labelledby={`cfg-${section}`}>
      <div className="flex flex-col gap-1">
        <h2 id={`cfg-${section}`} className="text-[22px] font-semibold leading-tight">
          {title}
        </h2>
        <p className="text-sm text-cool-gray">{description}</p>
      </div>

      {section === "venda" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field id="c-preco" text="Preço (R$)" hint="Vale só para novas encomendas.">
            <input id="c-preco" className={input} inputMode="decimal" value={values.price} onChange={set("price")} />
          </Field>
          <Field id="c-lote" text="Limite do lote" hint="Camisas pagas mais reservas.">
            <input id="c-lote" className={input} inputMode="numeric" value={values.batchLimit} onChange={set("batchLimit")} />
          </Field>
          <Field id="c-max" text="Máximo por compra" hint="De 1 a 10.">
            <input id="c-max" className={input} inputMode="numeric" value={values.maxPerOrder} onChange={set("maxPerOrder")} />
          </Field>
          <Field id="c-ate" text="Encomendas até" hint="Horário de Brasília. Vale para todos os modos.">
            <input id="c-ate" type="datetime-local" className={input} value={values.salesEnd} onChange={set("salesEnd")} />
          </Field>
          <Field id="c-abre" text="Abre ao público em (opcional)" hint="Vale só no modo Aberta.">
            <input id="c-abre" type="datetime-local" className={input} value={values.salesStart} onChange={set("salesStart")} />
          </Field>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <Field id="c-desc" text="Descrição">
            <textarea id="c-desc" rows={2} className={input} value={values.description} onChange={set("description")} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="c-comp" text="Composição">
              <input id="c-comp" className={input} value={values.composition} onChange={set("composition")} />
            </Field>
            <Field id="c-fit" text="Modelagem">
              <input id="c-fit" className={input} value={values.fit} onChange={set("fit")} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="c-prazo" text="Prazo de produção">
              <textarea id="c-prazo" rows={2} className={input} value={values.leadTime} onChange={set("leadTime")} />
            </Field>
            <Field id="c-receb" text="Forma de recebimento">
              <textarea id="c-receb" rows={2} className={input} value={values.receipt} onChange={set("receipt")} />
            </Field>
          </div>
          <Field id="c-pol" text="Trocas, cancelamento e atendimento">
            <textarea id="c-pol" rows={3} className={input} value={values.policy} onChange={set("policy")} />
          </Field>
          <Field id="c-guia" text="Guia de medidas" hint="Aparece na vitrine ao lado da escolha do tamanho.">
            <textarea id="c-guia" rows={5} className={input} value={values.sizeGuide} onChange={set("sizeGuide")} />
          </Field>
        </div>
      )}

      {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}
      <div>
        <button type="button" className={btnPrimary} disabled={pending || !dirty} onClick={save}>
          {pending ? "Salvando…" : dirty ? "Salvar alterações" : "Sem alterações"}
        </button>
      </div>
    </section>
  );
}
