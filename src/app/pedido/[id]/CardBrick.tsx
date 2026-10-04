"use client";

import { CardPayment, initMercadoPago } from "@mercadopago/sdk-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { CardInput } from "./actions";

let initializedKey: string | null = null;

/** O SDK do Mercado Pago deve ser inicializado uma única vez por chave pública. */
function ensureMercadoPago(publicKey: string) {
  if (initializedKey === publicKey) return;
  initMercadoPago(publicKey, { locale: "pt-BR" });
  initializedKey = publicKey;
}

type Props = {
  publicKey: string;
  amountCents: number;
  email: string;
  cpf: string;
  onSubmit: (data: CardInput) => Promise<void>;
};

/**
 * O Brick é recriado sempre que suas props mudam de identidade; por isso
 * o componente é memoizado e as props passadas ao Brick são estáveis.
 */
function CardBrick({ publicKey, amountCents, email, cpf, onSubmit }: Props) {
  const [error, setError] = useState<string | null>(null);
  useState(() => ensureMercadoPago(publicKey));

  const submitRef = useRef(onSubmit);
  useEffect(() => {
    submitRef.current = onSubmit;
  }, [onSubmit]);

  const initialization = useMemo(
    () => ({ amount: amountCents / 100, payer: { email, identification: { type: "CPF", number: cpf } } }),
    [amountCents, email, cpf],
  );

  const customization = useMemo(
    () => ({
      paymentMethods: { maxInstallments: 12, types: { included: ["credit_card" as const] } },
      visual: {
        texts: { formTitle: "Cartão de crédito" },
        style: { theme: "default", customVariables: { baseColor: "#7132f5", borderRadiusLarge: "12px" } },
      },
    }),
    [],
  );

  const handlers = useMemo(
    () => ({
      onSubmit: (data: Parameters<NonNullable<React.ComponentProps<typeof CardPayment>["onSubmit"]>>[0]) =>
        submitRef.current({
          token: data.token,
          installments: Number(data.installments),
          payment_method_id: data.payment_method_id,
          issuer_id: data.issuer_id,
          payer: data.payer as CardInput["payer"],
        }),
      onError: (e: { type: string; message: string }) => {
        console.error("Error in CardPayment brick:", e);
        if (e.type === "critical") setError("Não foi possível carregar o formulário de cartão. Recarregue a página.");
      },
    }),
    [],
  );

  return (
    <div>
      {error && <p className="mb-2 text-sm text-danger-ink">{error}</p>}
      <CardPayment
        locale="pt-BR"
        initialization={initialization}
        customization={customization}
        onSubmit={handlers.onSubmit}
        onError={handlers.onError}
      />
    </div>
  );
}

export default memo(CardBrick);
