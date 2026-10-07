"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { FormMessage } from "@/components/AuthShell";
import { btnOutline, btnPrimary, btnSecondary, input, label } from "@/components/ui/styles";
import { generateCouponCode, MAX_BATCH } from "@/lib/shirt-coupons";
import { createBatchCouponsAction, createCouponAction, createTestCouponAction } from "../actions";

type Use = "campanha" | "teste";

function Field({ id, text, hint, children }: { id: string; text: string; hint?: string; children: React.ReactNode }) {
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

/** Painel lateral nativo (<dialog>): Esc fecha e o foco volta para quem abriu. */
function Sheet({
  dialogRef,
  title,
  titleId,
  children,
}: {
  dialogRef: React.RefObject<HTMLDialogElement | null>;
  title: string;
  titleId: string;
  children: React.ReactNode;
}) {
  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClick={(e) => {
        if (e.target === e.currentTarget) dialogRef.current?.close();
      }}
      className="m-0 ml-auto h-dvh max-h-dvh w-[min(30rem,100vw)] overflow-y-auto bg-surface p-0 text-ink shadow-whisper backdrop:bg-ink/40"
    >
      <div className="flex flex-col gap-5 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 id={titleId} className="text-[22px] font-semibold leading-tight">
            {title}
          </h2>
          <button type="button" className={btnSecondary} onClick={() => dialogRef.current?.close()}>
            Fechar
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

function useReturnFocus(ref: React.RefObject<HTMLDialogElement | null>, opener: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const back = () => opener.current?.focus();
    dialog.addEventListener("close", back);
    return () => dialog.removeEventListener("close", back);
  }, [ref, opener]);
}

/** Botões "Gerar vários códigos" e "Novo cupom" (campanha ou teste de pagamento). */
export function CouponsToolbar() {
  const newRef = useRef<HTMLDialogElement>(null);
  const batchRef = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  useReturnFocus(newRef, opener);
  useReturnFocus(batchRef, opener);

  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);

  // Novo cupom
  const [use, setUse] = useState<Use>("campanha");
  const [campaign, setCampaign] = useState("");
  const [code, setCode] = useState("");
  const [kind, setKind] = useState("percent");
  const [value, setValue] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [perBuyer, setPerBuyer] = useState("1");
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Vários códigos
  const [prefix, setPrefix] = useState("");
  const [count, setCount] = useState("10");
  const [bKind, setBKind] = useState("percent");
  const [bValue, setBValue] = useState("");
  const [bUses, setBUses] = useState("1");
  const [bBuyer, setBBuyer] = useState("");
  const [bUntil, setBUntil] = useState("");
  const [bCampaign, setBCampaign] = useState("");
  const [bError, setBError] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  const openNew = (e: React.MouseEvent<HTMLElement>) => {
    opener.current = e.currentTarget;
    setError(null);
    newRef.current?.showModal();
  };
  const openBatch = (e: React.MouseEvent<HTMLElement>) => {
    opener.current = e.currentTarget;
    setBError(null);
    setCodes([]);
    setCopied(null);
    batchRef.current?.showModal();
  };

  const createCampaign = () => {
    setError(null);
    start(async () => {
      const result = await createCouponAction({
        code,
        kind,
        value,
        maxUses,
        maxPerBuyer: perBuyer,
        validFrom,
        validUntil,
        campaign,
      });
      if (!result.ok) return setError(result.message);
      setNotice(result.message ?? "Cupom criado.");
      newRef.current?.close();
      setCode("");
      setValue("");
      setMaxUses("");
      setCampaign("");
      setValidFrom("");
      setValidUntil("");
    });
  };

  const createTest = () => {
    setError(null);
    start(async () => {
      const result = await createTestCouponAction();
      if (!result.ok) return setError(result.message);
      setNotice(`Cupom de teste ${result.code} criado. Vale por 24 horas e 2 usos.`);
      newRef.current?.close();
    });
  };

  const createBatch = () => {
    setBError(null);
    start(async () => {
      const result = await createBatchCouponsAction({
        prefix,
        count,
        kind: bKind,
        value: bValue,
        maxUses: bUses,
        maxPerBuyer: bBuyer,
        validUntil: bUntil,
        campaign: bCampaign,
      });
      if (!result.ok) return setBError(result.message);
      setCodes(result.codes ?? []);
      setNotice(result.message ?? null);
    });
  };

  const copyCodes = async () => {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied("Códigos copiados.");
    } catch {
      setCopied("Não foi possível copiar. Selecione os códigos e copie.");
    }
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btnOutline} onClick={openBatch}>
          Gerar vários códigos
        </button>
        <button type="button" className={btnPrimary} onClick={openNew}>
          Novo cupom
        </button>
      </div>

      {notice && (
        <div className="basis-full">
          <FormMessage tone="success">{notice}</FormMessage>
        </div>
      )}

      <Sheet dialogRef={newRef} title="Novo cupom" titleId="novo-cupom">
        <fieldset className="flex flex-col gap-2.5">
          <legend className="pb-2 text-sm font-medium">O que você quer fazer?</legend>
          {(
            [
              ["campanha", "Campanha de marketing", "Desconto para divulgar com redes sociais, parceiros e academias."],
              ["teste", "Teste de pagamento", "Compra real de valor mínimo para conferir Pix e cartão antes de abrir ao público."],
            ] as const
          ).map(([id, title, text]) => (
            <label
              key={id}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 ${use === id ? "border-brand-dark bg-brand-subtle" : "border-line bg-surface"}`}
            >
              <input type="radio" name="uso" value={id} checked={use === id} onChange={() => setUse(id)} className="mt-0.5 size-5 shrink-0" />
              <span className="flex flex-col gap-0.5">
                <strong className="text-[15px] font-semibold">{title}</strong>
                <span className="text-[13px] text-cool-gray">{text}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {use === "teste" ? (
          <div className="flex flex-col gap-4">
            <dl className="flex flex-col gap-1.5 rounded-xl bg-brand-subtle p-3.5 text-sm">
              {[
                ["Código", "Gerado automaticamente (TESTE-XXXX)"],
                ["Valor final", "R$ 1,00"],
                ["Limite de usos", "2 (Pix e cartão)"],
                ["Validade", "24 horas"],
                ["Venda fechada", "Libera a compra no modo Somente com cupom"],
                ["Relatórios", "Fica de fora de receita, lote e Excel"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt>{k}</dt>
                  <dd className="text-right font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
            {error && <FormMessage tone="error">{error}</FormMessage>}
            <button type="button" className={btnPrimary} disabled={pending} onClick={createTest}>
              {pending ? "Criando…" : "Criar cupom de teste"}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <Field id="n-camp" text="Nome da campanha">
              <input id="n-camp" className={input} placeholder="Ex.: Parceria com academias" value={campaign} onChange={(e) => setCampaign(e.target.value)} />
            </Field>
            <Field id="n-cod" text="Código">
              <div className="flex gap-2">
                <input id="n-cod" className={`${input} min-w-0 uppercase`} autoComplete="off" autoCapitalize="characters" spellCheck={false} value={code} onChange={(e) => setCode(e.target.value)} />
                <button type="button" className={btnSecondary} onClick={() => setCode(generateCouponCode("CUPOM"))}>
                  Gerar
                </button>
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field id="n-tipo" text="Desconto">
                <select id="n-tipo" className={input} value={kind} onChange={(e) => setKind(e.target.value)}>
                  <option value="percent">Percentual</option>
                  <option value="amount">Valor (R$)</option>
                </select>
              </Field>
              <Field
                id="n-val"
                text={kind === "percent" ? "Percentual (1 a 100)" : "Valor (R$)"}
                hint={kind === "percent" && value.trim() === "100" ? "Cupom de 100%: a encomenda é confirmada sem pagamento. Cada uso é uma camisa grátis; informe o limite de usos." : undefined}
              >
                <input id="n-val" className={input} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field id="n-max" text="Limite de usos">
                <input id="n-max" className={input} inputMode="numeric" placeholder="Sem limite" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} />
              </Field>
              <Field id="n-cpf" text="Por comprador">
                <select id="n-cpf" className={input} value={perBuyer} onChange={(e) => setPerBuyer(e.target.value)}>
                  <option value="1">1 uso por CPF</option>
                  <option value="">Sem limite por CPF</option>
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field id="n-de" text="Válido de">
                <input id="n-de" type="datetime-local" className={input} value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
              </Field>
              <Field id="n-ate" text="Válido até">
                <input id="n-ate" type="datetime-local" className={input} value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
              </Field>
            </div>
            <p className="text-xs text-muted">Horário de Brasília. Vazio = sem prazo. O total da encomenda nunca fica abaixo de R$ 1,00.</p>
            {error && <FormMessage tone="error">{error}</FormMessage>}
            <button type="button" className={btnPrimary} disabled={pending} onClick={createCampaign}>
              {pending ? "Criando…" : "Criar cupom"}
            </button>
          </div>
        )}
      </Sheet>

      <Sheet dialogRef={batchRef} title="Gerar vários códigos" titleId="varios-codigos">
        <p className="text-sm text-cool-gray">
          Cria códigos únicos com o mesmo desconto, por exemplo para entregar um a cada parceiro. Cada código vale uma vez, a menos
          que você mude o limite.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field id="b-pre" text="Prefixo" hint="Ex.: PARCEIRO gera PARCEIRO-7K2P.">
            <input id="b-pre" className={`${input} uppercase`} autoComplete="off" autoCapitalize="characters" value={prefix} onChange={(e) => setPrefix(e.target.value)} />
          </Field>
          <Field id="b-qtd" text="Quantidade" hint={`De 1 a ${MAX_BATCH}.`}>
            <input id="b-qtd" className={input} inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field id="b-tipo" text="Desconto">
            <select id="b-tipo" className={input} value={bKind} onChange={(e) => setBKind(e.target.value)}>
              <option value="percent">Percentual</option>
              <option value="amount">Valor (R$)</option>
            </select>
          </Field>
          <Field
            id="b-val"
            text={bKind === "percent" ? "Percentual (1 a 100)" : "Valor (R$)"}
            hint={bKind === "percent" && bValue.trim() === "100" ? "Cupom de 100%: a encomenda é confirmada sem pagamento. Cada uso é uma camisa grátis; informe o limite de usos." : undefined}
          >
            <input id="b-val" className={input} inputMode="decimal" value={bValue} onChange={(e) => setBValue(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field id="b-usos" text="Usos por código">
            <input id="b-usos" className={input} inputMode="numeric" value={bUses} onChange={(e) => setBUses(e.target.value)} />
          </Field>
          <Field id="b-cpf" text="Limite por CPF" hint="Vazio = sem limite.">
            <input id="b-cpf" className={input} inputMode="numeric" value={bBuyer} onChange={(e) => setBBuyer(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field id="b-ate" text="Válido até">
            <input id="b-ate" type="datetime-local" className={input} value={bUntil} onChange={(e) => setBUntil(e.target.value)} />
          </Field>
          <Field id="b-camp" text="Campanha">
            <input id="b-camp" className={input} value={bCampaign} onChange={(e) => setBCampaign(e.target.value)} />
          </Field>
        </div>
        {bError && <FormMessage tone="error">{bError}</FormMessage>}
        <button type="button" className={btnPrimary} disabled={pending} onClick={createBatch}>
          {pending ? "Gerando…" : "Gerar códigos"}
        </button>

        {codes.length > 0 && (
          <div className="flex flex-col gap-2">
            <label htmlFor="b-lista" className={label}>
              {codes.length} códigos criados
            </label>
            <textarea id="b-lista" readOnly rows={Math.min(10, codes.length)} className={`${input} font-mono text-sm`} value={codes.join("\n")} />
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={btnOutline} onClick={copyCodes}>
                Copiar todos
              </button>
              {copied && (
                <span role="status" className="text-xs text-cool-gray">
                  {copied}
                </span>
              )}
            </div>
          </div>
        )}
      </Sheet>
    </>
  );
}
