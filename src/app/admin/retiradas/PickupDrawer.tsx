"use client";

import { useRef, useState, useTransition } from "react";
import { FormMessage } from "@/components/AuthShell";
import { btnPrimary, btnSecondary, input, label } from "@/components/ui/styles";
import { COMPETITION_LABEL } from "@/lib/checkin/terms";
import { joinNames, sizeOptions, type ConfirmFormErrors } from "@/lib/pickups/form";
import { GATE_LABEL, pickupGate, teamLabel, teammates, type PickupRow } from "@/lib/pickups/rows";
import { confirmPickupAction } from "./actions";
import { AthleteCard, Drawer, Field } from "./Drawer";

const choice =
  "flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-line px-4 py-3 text-sm has-checked:border-brand has-checked:bg-brand-subtle has-disabled:cursor-not-allowed has-disabled:opacity-60";

/** “Confirmar retirada”: quem retira, o tamanho entregue e, nas equipes, as camisas dos parceiros. */
export function PickupDrawer({
  row,
  all,
  onClose,
  onDone,
  onStale,
}: {
  row: PickupRow;
  /** Lista inteira, para achar os parceiros mesmo com filtro na tela. */
  all: PickupRow[];
  onClose: () => void;
  onDone: (message: string, warn: boolean) => void;
  /** A lista mudou no servidor (camisa já retirada, check-in pendente): recarregar. */
  onStale: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const close = () => dialogRef.current?.close();
  const [pending, start] = useTransition();
  const [self, setSelf] = useState(true);
  const [name, setName] = useState("");
  const [doc, setDoc] = useState("");
  const [size, setSize] = useState(row.shirtSize);
  const [note, setNote] = useState("");
  const [mateIds, setMateIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<ConfirmFormErrors>({});
  const [message, setMessage] = useState<string | null>(null);

  const mates = teammates(row, all).filter((m) => !m.pickup);
  const selected = [row, ...mates.filter((m) => mateIds.includes(m.id))];
  const emails = [...new Set(selected.map((r) => r.email.toLowerCase()))];

  const toggleMate = (id: string) => setMateIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const confirm = () => {
    setMessage(null);
    start(async () => {
      const result = await confirmPickupAction({ primaryId: row.id, mateIds, self, name, document: doc, deliveredSize: size, note });
      if (result.ok) {
        close();
        onDone(result.message, result.warn);
        return;
      }
      setErrors(result.errors ?? {});
      setMessage(result.message);
      if (result.refresh) onStale();
      if (result.errors?.name) document.getElementById("p-name")?.focus();
    });
  };

  return (
    <Drawer dialogRef={dialogRef} titleId="retirada-title" busy={pending} onClose={onClose}>
      <form
        className="flex flex-col gap-5 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          confirm();
        }}
        noValidate
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="retirada-title" className="text-[22px] leading-tight font-semibold">
            Confirmar retirada
          </h2>
          <button type="button" className={btnSecondary} onClick={close}>
            Fechar
          </button>
        </div>
        <AthleteCard name={row.name} detail={`${teamLabel(row)} · ${COMPETITION_LABEL[row.competition]} · camisa ${row.shirtSize}`} />

        <fieldset className="flex flex-col gap-2">
          <legend className={`${label} mb-2`}>Quem está retirando?</legend>
          <label className={choice}>
            <input type="radio" name="quem" className="mt-0.5 size-4 accent-brand" checked={self} onChange={() => setSelf(true)} />
            <span>O próprio atleta</span>
          </label>
          <label className={choice}>
            <input type="radio" name="quem" className="mt-0.5 size-4 accent-brand" checked={!self} onChange={() => setSelf(false)} />
            <span>Outra pessoa</span>
          </label>
        </fieldset>

        {!self && (
          <div className="flex flex-col gap-4">
            <Field id="p-name" text="Nome completo de quem retira" error={errors.name}>
              <input
                id="p-name"
                className={input}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (errors.name) setErrors((x) => ({ ...x, name: undefined }));
                }}
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? "p-name-erro" : undefined}
                autoComplete="off"
                autoCapitalize="words"
                maxLength={120}
              />
            </Field>
            <Field id="p-document" text="Documento" hint="Opcional. CPF ou RG de quem retira." error={errors.document}>
              <input
                id="p-document"
                className={input}
                value={doc}
                onChange={(e) => setDoc(e.target.value)}
                aria-invalid={!!errors.document}
                autoComplete="off"
                maxLength={40}
              />
            </Field>
          </div>
        )}

        <Field
          id="p-size"
          text="Tamanho entregue"
          hint={`Tamanho da inscrição: ${row.shirtSize}. Mude só se a camisa entregue for outra.`}
          error={errors.deliveredSize}
        >
          <select id="p-size" className={input} value={size} onChange={(e) => setSize(e.target.value)}>
            {sizeOptions(row.shirtSize).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>

        {mates.length > 0 && (
          <fieldset className="flex flex-col gap-2">
            <legend className={`${label} mb-2`}>Mesma inscrição</legend>
            {mates.map((m) => {
              const gate = pickupGate(m);
              return (
                <label key={m.id} className={choice}>
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 accent-brand"
                    checked={mateIds.includes(m.id)}
                    disabled={gate !== "liberado"}
                    onChange={() => toggleMate(m.id)}
                  />
                  <span>
                    Levar também a camisa de {m.name} ({m.shirtSize})
                    {gate !== "liberado" && <span className="block text-cool-gray">{GATE_LABEL[gate]}: ainda não pode ser retirada.</span>}
                  </span>
                </label>
              );
            })}
          </fieldset>
        )}

        <Field id="p-note" text="Observação" hint="Opcional. Aparece no e-mail." error={errors.note}>
          <input id="p-note" className={input} value={note} onChange={(e) => setNote(e.target.value)} autoComplete="off" maxLength={300} />
        </Field>

        <p className="text-sm text-cool-gray">
          {emails.length > 1 ? "Um e-mail de confirmação para cada endereço: " : "O e-mail de confirmação vai para "}
          <span className="break-all text-ink">{joinNames(emails)}</span>.
        </p>

        {message && <FormMessage tone="error">{message}</FormMessage>}
        <div className="sticky bottom-0 -mx-5 flex flex-wrap gap-2 border-t border-line bg-surface px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <button type="submit" className={btnPrimary} disabled={pending}>
            {pending ? "Confirmando…" : "Confirmar retirada e enviar e-mail"}
          </button>
          <button type="button" className={btnSecondary} onClick={close} disabled={pending}>
            Cancelar
          </button>
        </div>
      </form>
    </Drawer>
  );
}
