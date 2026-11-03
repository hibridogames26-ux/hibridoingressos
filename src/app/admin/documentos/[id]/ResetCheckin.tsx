"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { FormMessage } from "@/components/AuthShell";
import { btnDanger, btnDangerOutline, btnSecondary, input } from "@/components/ui/styles";
import { RESET_REASONS, type ResetReason } from "@/lib/checkin/admin";
import { resetCheckinAction } from "./actions";

const REASONS = Object.entries(RESET_REASONS) as [ResetReason, string][];

/** “Refazer check-in”: confirmação com motivo; o termo vai para o arquivo (Story 4.4). */
export function ResetCheckin({ athleteId, name, maskedEmail }: { athleteId: string; name: string; maskedEmail: string }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [pending, start] = useTransition();
  const [reason, setReason] = useState<ResetReason | "">("");
  const [note, setNote] = useState("");
  const [notify, setNotify] = useState(true);
  const [error, setError] = useState<{ text: string; field?: "reason" | "note" } | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const back = () => openerRef.current?.focus();
    dialog.addEventListener("close", back);
    return () => dialog.removeEventListener("close", back);
  }, []);

  const open = (e: React.MouseEvent<HTMLElement>) => {
    openerRef.current = e.currentTarget;
    setReason("");
    setNote("");
    setNotify(true);
    setError(null);
    dialogRef.current?.showModal();
  };

  const confirm = () => {
    setError(null);
    start(async () => {
      const result = await resetCheckinAction(athleteId, { reason, note, notify });
      if (result.ok) {
        dialogRef.current?.close();
        router.replace(`/admin/documentos/${athleteId}?reaberto=${result.notice}`);
        return;
      }
      setError({ text: result.message, field: "field" in result ? result.field : undefined });
    });
  };

  return (
    <section aria-labelledby="refazer" className="flex flex-col gap-3 rounded-2xl border border-danger/40 bg-danger/4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex max-w-prose flex-col gap-1">
          <h2 id="refazer" className="text-lg font-semibold text-danger-ink">
            Refazer check-in
          </h2>
          <p className="text-sm text-cool-gray">
            Arquiva o termo, a assinatura e o atestado atuais e libera o atleta para fazer o check-in de novo. Nada é apagado.
          </p>
        </div>
        <button type="button" className={btnDangerOutline} onClick={open}>
          Refazer check-in
        </button>
      </div>

      <dialog
        ref={dialogRef}
        aria-labelledby="refazer-title"
        onClick={(e) => {
          if (e.target === e.currentTarget && !pending) dialogRef.current?.close();
        }}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl bg-surface p-0 text-ink shadow-whisper backdrop:bg-ink/40"
      >
        <form
          className="flex flex-col gap-5 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            confirm();
          }}
          noValidate
        >
          <h2 id="refazer-title" className="text-[22px] leading-tight font-semibold text-balance">
            Refazer o check-in de {name}?
          </h2>
          <ul className="flex flex-col gap-2 text-sm text-cool-gray">
            <li>O termo, as respostas do PAR-Q, a assinatura e o atestado atuais vão para o histórico desta página.</li>
            <li>
              O atleta volta para <strong className="font-semibold text-ink">Pendente</strong> e a barra pública do check-in diminui em 1.
            </li>
            <li>Ele faz o fluxo completo de novo: código, PAR-Q, termo e atestado.</li>
          </ul>

          <fieldset className="flex flex-col gap-2" aria-describedby={error?.field === "reason" ? "motivo-erro" : undefined}>
            <legend className="mb-1 text-sm font-medium">Motivo</legend>
            {REASONS.map(([value, text]) => (
              <label
                key={value}
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-line px-3 py-2 text-sm transition-colors duration-150 has-checked:border-brand has-checked:bg-brand-subtle has-focus-visible:outline-2 has-focus-visible:outline-brand"
              >
                <input
                  type="radio"
                  name="motivo"
                  value={value}
                  checked={reason === value}
                  onChange={() => {
                    setReason(value);
                    if (error?.field === "reason") setError(null);
                  }}
                  className="size-4 accent-brand"
                />
                {text}
              </label>
            ))}
            {error?.field === "reason" && (
              <span id="motivo-erro" className="text-xs font-medium text-danger-ink">
                {error.text}
              </span>
            )}
          </fieldset>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="r-nota" className="text-sm font-medium">
              {reason === "outro" ? "Qual o motivo?" : "Observação (opcional)"}
            </label>
            <textarea
              id="r-nota"
              rows={2}
              maxLength={500}
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                if (error?.field === "note") setError(null);
              }}
              aria-invalid={error?.field === "note"}
              aria-describedby={error?.field === "note" ? "nota-erro" : "nota-dica"}
              className={input}
            />
            {error?.field === "note" ? (
              <span id="nota-erro" className="text-xs font-medium text-danger-ink">
                {error.text}
              </span>
            ) : (
              <span id="nota-dica" className="text-xs text-muted">
                Vai no e-mail para o atleta junto com o motivo.
              </span>
            )}
          </div>

          <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="mt-0.5 size-4 accent-brand" />
            <span>
              Avisar o atleta por e-mail com o link do check-in
              <span className="block text-cool-gray">Vai para o e-mail da inscrição: {maskedEmail}</span>
            </span>
          </label>

          {error && !error.field && <FormMessage tone="error">{error.text}</FormMessage>}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className={btnSecondary} disabled={pending} onClick={() => dialogRef.current?.close()}>
              Cancelar
            </button>
            <button type="submit" className={btnDanger} disabled={pending}>
              {pending ? "Refazendo…" : "Refazer check-in"}
            </button>
          </div>
        </form>
      </dialog>
    </section>
  );
}
