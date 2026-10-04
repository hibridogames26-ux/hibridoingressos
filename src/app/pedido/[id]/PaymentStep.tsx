"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { FormMessage } from "@/components/AuthShell";
import { btnOutline, btnPrimary, card } from "@/components/ui/styles";
import { formatBRL } from "@/lib/format";
import { checkOrder, payWithCard, startPix, type CardInput } from "./actions";
import { formatRemaining, useNow } from "./useTicker";

const CardBrick = dynamic(() => import("./CardBrick"), {
  ssr: false,
  loading: () => <p className="py-8 text-center text-sm text-muted">Carregando formulário seguro do Mercado Pago…</p>,
});

type Props = {
  orderId: string;
  accessKey: string;
  pixCents: number;
  cardCents: number;
  surchargeCents: number;
  expiresAt: string | null;
  inAnalysis: boolean;
  buyerEmail: string;
  buyerCpf: string;
  publicKey: string;
};

const POLL_MS = 5000;

export function PaymentStep(props: Props) {
  const router = useRouter();
  const now = useNow();
  const [method, setMethod] = useState<"pix" | "cartao">("pix");
  const [pix, setPix] = useState<{ qrCode: string; qrBase64: string; expiresAt: string } | null>(null);
  const [pixLoading, setPixLoading] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [polling, setPolling] = useState(props.inAnalysis);
  const [copied, setCopied] = useState(false);
  const [brickKey, setBrickKey] = useState(0);

  const refreshIfDone = useCallback(async () => {
    const status = await checkOrder(props.orderId, props.accessKey);
    if (status && status !== "pendente") router.refresh();
  }, [props.orderId, props.accessKey, router]);

  useEffect(() => {
    if (!polling) return;
    const id = setInterval(refreshIfDone, POLL_MS);
    return () => clearInterval(id);
  }, [polling, refreshIfDone]);

  const reservationLeft = props.expiresAt && now !== null ? Date.parse(props.expiresAt) - now : null;
  const expired = reservationLeft !== null && reservationLeft <= 0 && !props.inAnalysis;

  useEffect(() => {
    if (expired) router.refresh();
  }, [expired, router]);

  const generatePix = async () => {
    setPixLoading(true);
    setMessage(null);
    const result = await startPix(props.orderId, props.accessKey);
    setPixLoading(false);
    if (result.ok) {
      setPix(result);
      setPolling(true);
    } else if (result.status && result.status !== "pendente") {
      router.refresh();
    } else {
      setMessage({ tone: "error", text: result.message });
    }
  };

  const submitCard = useCallback(async (data: CardInput) => {
    setMessage(null);
    const result = await payWithCard(props.orderId, props.accessKey, data);
    if (result.status && result.status !== "pendente") {
      router.refresh();
      return;
    }
    if (result.mpStatus === "in_process" || result.mpStatus === "authorized") {
      setPolling(true);
      setMessage({ tone: "success", text: result.message ?? "Pagamento em análise." });
      return;
    }
    setMessage({ tone: "error", text: result.message ?? "Pagamento não aprovado." });
    setBrickKey((k) => k + 1); // novo formulário para tentar de novo
  }, [props.orderId, props.accessKey, router]);

  const copy = async () => {
    if (!pix) return;
    await navigator.clipboard.writeText(pix.qrCode).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (props.inAnalysis) {
    return (
      <div className={`${card} flex flex-col items-center gap-3 p-5 text-center sm:p-6`}>
        <h2 className="text-[22px] font-semibold leading-tight">Pagamento em análise</h2>
        <p className="text-sm text-cool-gray">
          O Mercado Pago está analisando seu pagamento com cartão. Esta página atualiza sozinha e você também
          receberá os ingressos por e-mail quando for aprovado.
        </p>
      </div>
    );
  }

  const tab = (value: "pix" | "cartao", title: string, amount: number) => (
    <button
      type="button"
      role="tab"
      aria-selected={method === value}
      onClick={() => {
        setMethod(value);
        setMessage(null);
      }}
      className={`flex min-h-12 items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition duration-200 active:scale-[0.98] sm:flex-col sm:items-start sm:justify-start sm:gap-0.5 ${
        method === value ? "border-brand bg-brand-subtle/40" : "border-line hover:border-brand-dark"
      }`}
    >
      <span className="text-sm font-semibold">{title}</span>
      <span className="text-base font-bold tabular-nums sm:text-lg">{formatBRL(amount)}</span>
    </button>
  );

  return (
    <div className={`${card} flex flex-col gap-5 p-4 sm:p-5`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[22px] font-semibold leading-tight">Forma de pagamento</h2>
        {reservationLeft !== null && reservationLeft > 0 && (
          <span className="rounded-lg bg-cool-gray/12 px-2 py-0.5 text-xs font-medium text-[#484b5e]">
            Reserva expira em <span className="tabular-nums">{formatRemaining(reservationLeft)}</span>
          </span>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 sm:gap-3" role="tablist" aria-label="Forma de pagamento">
        {tab("pix", "Pix", props.pixCents)}
        {tab("cartao", "Cartão de crédito", props.cardCents)}
      </div>

      {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}

      {method === "pix" ? (
        <div key="pix" className="flex animate-panel flex-col items-center gap-4 text-center" role="tabpanel">
          {!pix ? (
            <>
              <p className="text-sm text-cool-gray">
                Pague com o app do seu banco. A confirmação é automática e leva poucos segundos.
              </p>
              <button className={btnPrimary} onClick={generatePix} disabled={pixLoading}>
                {pixLoading ? "Gerando…" : `Gerar Pix de ${formatBRL(props.pixCents)}`}
              </button>
            </>
          ) : (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- QR gerado pelo Mercado Pago */}
              <img
                src={`data:image/png;base64,${pix.qrBase64}`}
                alt="QR Code Pix"
                width={220}
                height={220}
                className="aspect-square w-[220px] max-w-full animate-wipe rounded-xl border border-line"
              />
              <div style={{ animationDelay: "150ms" }} className="flex w-full animate-rise flex-col gap-2">
                <span className="text-sm font-medium">Pix copia e cola</span>
                <code className="block max-h-20 overflow-y-auto break-all rounded-xl bg-muted/8 p-3 text-left text-xs">
                  {pix.qrCode}
                </code>
                <button className={btnOutline} onClick={copy}>
                  <span key={String(copied)} className="animate-message">
                    {copied ? "Copiado!" : "Copiar código Pix"}
                  </span>
                </button>
              </div>
              <p className="flex items-center gap-2 text-sm text-cool-gray" aria-live="polite">
                <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-brand" />
                Aguardando pagamento
                {now !== null && ` · vence em ${formatRemaining(Date.parse(pix.expiresAt) - now)}`}
              </p>
            </>
          )}
        </div>
      ) : (
        <div key="cartao" className="flex animate-panel flex-col gap-4" role="tabpanel">
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-xl bg-muted/8 p-4 text-sm">
            <dt className="text-cool-gray">Ingressos</dt>
            <dd className="text-right tabular-nums">{formatBRL(props.pixCents)}</dd>
            <dt className="text-cool-gray">Taxa da operadora do cartão</dt>
            <dd className="text-right tabular-nums">{formatBRL(props.surchargeCents)}</dd>
            <dt className="font-semibold">Total no cartão</dt>
            <dd className="text-right font-semibold tabular-nums">{formatBRL(props.cardCents)}</dd>
          </dl>
          <p className="text-xs text-muted">
            Pagamento processado pelo Mercado Pago. Os dados do cartão não passam pelos nossos servidores.
          </p>
          {!props.publicKey ? (
            <FormMessage tone="error">
              Pagamento com cartão indisponível no momento. Use o Pix ou tente novamente mais tarde.
            </FormMessage>
          ) : (
          <CardBrick
            key={brickKey}
            publicKey={props.publicKey}
            amountCents={props.cardCents}
            email={props.buyerEmail}
            cpf={props.buyerCpf}
            onSubmit={submitCard}
          />
          )}
        </div>
      )}
    </div>
  );
}
