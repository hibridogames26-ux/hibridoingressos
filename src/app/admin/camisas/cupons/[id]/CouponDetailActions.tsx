"use client";

import { useState, useTransition } from "react";
import { FormMessage } from "@/components/AuthShell";
import { btnOutline, btnPrimary, card, input, label } from "@/components/ui/styles";
import { toBrasiliaLocalInput } from "@/lib/shirt-coupons";
import { setCouponActiveAction, updateCouponAction } from "../../actions";

/** Ativa ou desativa o cupom (cupom desativado nunca vale, mesmo dentro da validade). */
export function CouponActiveButton({ id, active }: { id: string; active: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        className={active ? btnOutline : btnPrimary}
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const result = await setCouponActiveAction(id, !active);
            if (!result.ok) setError(result.message);
          })
        }
      >
        {pending ? "Salvando…" : active ? "Desativar cupom" : "Ativar cupom"}
      </button>
      {error && <FormMessage tone="error">{error}</FormMessage>}
    </div>
  );
}

type Props = {
  id: string;
  maxUses: number | null;
  maxPerBuyer: number | null;
  validFrom: string | null;
  validUntil: string | null;
  campaign: string | null;
  notes: string | null;
  usedNow: number;
};

/** Limites, validade e campanha. Código, tipo e valor do desconto não mudam depois de criado. */
export function CouponEditForm(props: Props) {
  const [pending, start] = useTransition();
  const [maxUses, setMaxUses] = useState(props.maxUses === null ? "" : String(props.maxUses));
  const [maxPerBuyer, setMaxPerBuyer] = useState(props.maxPerBuyer === null ? "" : String(props.maxPerBuyer));
  const [validFrom, setValidFrom] = useState(toBrasiliaLocalInput(props.validFrom));
  const [validUntil, setValidUntil] = useState(toBrasiliaLocalInput(props.validUntil));
  const [campaign, setCampaign] = useState(props.campaign ?? "");
  const [notes, setNotes] = useState(props.notes ?? "");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const lowered = maxUses.trim() !== "" && Number(maxUses) < props.usedNow;

  const save = () =>
    start(async () => {
      setMessage(null);
      const result = await updateCouponAction(props.id, { maxUses, maxPerBuyer, validFrom, validUntil, campaign, notes });
      setMessage(result.ok ? { tone: "success", text: result.message ?? "Cupom atualizado." } : { tone: "error", text: result.message });
    });

  return (
    <section className={`${card} flex flex-col gap-4 p-4 sm:p-5`} aria-labelledby="editar-cupom">
      <div className="flex flex-col gap-1">
        <h2 id="editar-cupom" className="text-[22px] font-semibold leading-tight">
          Limites e validade
        </h2>
        <p className="text-sm text-cool-gray">Vale para novas compras. As encomendas já feitas guardam o desconto que tiveram.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="e-max" className={label}>
            Limite de usos
          </label>
          <input id="e-max" className={input} inputMode="numeric" placeholder="Sem limite" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} />
          {lowered && <span className="text-xs text-danger-ink">Já houve {props.usedNow} usos: o cupom passa a constar como esgotado.</span>}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="e-cpf" className={label}>
            Usos por CPF
          </label>
          <input id="e-cpf" className={input} inputMode="numeric" placeholder="Sem limite" value={maxPerBuyer} onChange={(e) => setMaxPerBuyer(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="e-camp" className={label}>
            Campanha
          </label>
          <input id="e-camp" className={input} value={campaign} onChange={(e) => setCampaign(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="e-de" className={label}>
            Válido de
          </label>
          <input id="e-de" type="datetime-local" className={input} value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="e-ate" className={label}>
            Válido até
          </label>
          <input id="e-ate" type="datetime-local" className={input} value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          <span className="text-xs text-muted">Horário de Brasília. Vazio = sem prazo.</span>
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-3">
          <label htmlFor="e-notas" className={label}>
            Observações (só você vê)
          </label>
          <textarea id="e-notas" rows={2} className={input} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
      {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}
      <div>
        <button type="button" className={btnPrimary} disabled={pending} onClick={save}>
          {pending ? "Salvando…" : "Salvar alterações"}
        </button>
      </div>
    </section>
  );
}
