"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { FormMessage } from "@/components/AuthShell";
import { btnPrimary, input, textLink } from "@/components/ui/styles";
import { checkEmailCode, sendEmailCode } from "./actions";

type Message = { tone: "error" | "success"; text: string; contact?: boolean };

/** Entrada do check-in: e-mail da inscrição → código de 6 números. */
export function EmailStep({ notice }: { notice?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<{ to: string; devCode?: string } | null>(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<Message | null>(notice ? { tone: "error", text: notice } : null);
  const [wait, setWait] = useState(0);
  const [sending, startSending] = useTransition();
  const [checking, startChecking] = useTransition();
  const emailRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const lastTried = useRef("");

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const request = () =>
    startSending(async () => {
      setMessage(null);
      const result = await sendEmailCode(email);
      if (result.ok) {
        setMessage(sent ? { tone: "success", text: "Enviamos um novo código. Use o mais recente." } : null);
        setSent({ to: result.maskedEmail, devCode: result.devCode });
        setCode("");
        lastTried.current = "";
        setWait(60);
        requestAnimationFrame(() => codeRef.current?.focus());
      } else {
        setMessage({ tone: "error", text: result.message, contact: result.notFound });
        if (result.wait) setWait(result.wait);
        if (!sent) emailRef.current?.focus();
      }
    });

  const verify = (value: string) => {
    if (value.length !== 6 || checking) return;
    lastTried.current = value;
    startChecking(async () => {
      setMessage(null);
      const result = await checkEmailCode(email, value);
      if (result.ok) {
        router.refresh();
        return;
      }
      setMessage({ tone: "error", text: result.message });
      if (result.expired) setWait(0);
      setCode("");
      codeRef.current?.focus();
    });
  };

  const changeEmail = () => {
    setSent(null);
    setCode("");
    setMessage(null);
    setWait(0);
    requestAnimationFrame(() => emailRef.current?.focus());
  };

  const feedback = message && (
    <FormMessage tone={message.tone}>
      {message.text}
      {message.contact && (
        <span className="mt-1 block font-semibold">Se o problema continuar, fale com a organização do evento.</span>
      )}
    </FormMessage>
  );

  return (
    <section aria-labelledby="entrar" className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-4 shadow-whisper sm:p-6">
      <div className="flex flex-col gap-2">
        <h2 id="entrar" className="text-[22px] leading-tight font-semibold">
          {sent ? "Digite o código" : "Comece pelo e-mail da inscrição"}
        </h2>
        <p className="text-base text-pretty text-cool-gray">
          {sent ? (
            <>
              Enviamos 6 números para <strong className="font-semibold break-words text-ink">{sent.to}</strong>. Vale por 10 minutos.
            </>
          ) : (
            "Vamos enviar um código para confirmar que é você. Depois, você escolhe o atleta e faz o check-in."
          )}
        </p>
      </div>

      {sent ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            verify(code);
          }}
        >
          {feedback}
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Código de confirmação</span>
            <input
              ref={codeRef}
              value={code}
              onChange={(e) => {
                const next = e.target.value.replace(/\D/g, "").slice(0, 6);
                setCode(next);
                // Seis números digitados (ou colados do e-mail): confere sem precisar tocar no botão.
                if (next.length === 6 && next !== lastTried.current) verify(next);
              }}
              inputMode="numeric"
              autoComplete="one-time-code"
              enterKeyHint="go"
              pattern="\d{6}"
              maxLength={6}
              aria-invalid={message?.tone === "error"}
              disabled={checking}
              placeholder="000000"
              className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-center font-mono text-[28px] font-semibold tracking-[0.4em] text-ink tabular-nums placeholder:font-normal placeholder:text-cool-gray transition-[border-color,box-shadow] duration-150 focus:border-brand focus:ring-4 focus:ring-brand-subtle focus:outline-none disabled:opacity-60"
            />
          </label>
          {sent.devCode && (
            <p className="rounded-xl border border-dashed border-line px-3 py-2 text-xs text-cool-gray">
              Desenvolvimento sem provedor de e-mail: o código é <span className="font-mono font-semibold text-ink">{sent.devCode}</span>.
            </p>
          )}
          <button type="submit" className={btnPrimary} disabled={code.length !== 6 || checking}>
            {checking ? "Conferindo…" : "Confirmar código"}
          </button>
          <div className="flex flex-col items-center gap-1 text-center text-sm text-cool-gray">
            <span>Não chegou? Veja também o spam e as promoções.</span>
            <div className="flex flex-wrap items-center justify-center gap-x-4">
              <button type="button" onClick={request} disabled={wait > 0 || sending} className={`${textLink} disabled:text-muted disabled:no-underline`}>
                {sending ? "Enviando…" : wait > 0 ? `Reenviar código em ${wait} s` : "Reenviar código"}
              </button>
              <button type="button" onClick={changeEmail} className={textLink}>
                Trocar e-mail
              </button>
            </div>
          </div>
        </form>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            request();
          }}
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">E-mail da inscrição</span>
            <input
              ref={emailRef}
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="send"
              required
              maxLength={160}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={message?.tone === "error"}
              aria-describedby="email-hint"
              placeholder="nome@gmail.com"
              className={input}
            />
            <span id="email-hint" className="text-sm text-cool-gray">
              Nas duplas, use o e-mail de quem fez a inscrição.
            </span>
          </label>
          {feedback}
          <button type="submit" className={btnPrimary} disabled={sending || wait > 0 || !email.trim()}>
            {sending ? "Enviando código…" : wait > 0 ? `Aguarde ${wait} s` : "Receber código"}
          </button>
        </form>
      )}
    </section>
  );
}
