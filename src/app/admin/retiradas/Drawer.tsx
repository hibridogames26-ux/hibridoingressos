"use client";

import { useEffect } from "react";
import { label } from "@/components/ui/styles";

const SIDE = "m-0 ml-auto h-dvh max-h-dvh w-[min(34rem,100vw)] overflow-y-auto bg-surface p-0 text-ink shadow-whisper backdrop:bg-ink/40";
const CENTER = "m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl bg-surface p-0 text-ink shadow-whisper backdrop:bg-ink/40";

/**
 * Painel modal que abre ao ser montado. Feche sempre por `dialogRef.current?.close()` (ou Esc / clique fora):
 * o navegador devolve o foco ao botão que abriu e `onClose` avisa a tela para desmontar.
 */
export function Drawer({
  dialogRef,
  titleId,
  variant = "side",
  busy = false,
  onClose,
  children,
}: {
  dialogRef: React.RefObject<HTMLDialogElement | null>;
  titleId: string;
  /** `side`: painel lateral (formulários). `center`: confirmação curta. */
  variant?: "side" | "center";
  /** Ação em andamento: Esc e clique fora não fecham. */
  busy?: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, [dialogRef]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(e) => {
        if (busy) e.preventDefault();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) e.currentTarget.close();
      }}
      className={variant === "side" ? SIDE : CENTER}
    >
      {children}
    </dialog>
  );
}

export function Field({ id, text, hint, error, children }: { id: string; text: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className={label}>
        {text}
      </label>
      {children}
      {error ? (
        <span id={`${id}-erro`} className="text-xs font-medium text-danger-ink">
          {error}
        </span>
      ) : (
        hint && <span className="text-xs text-muted">{hint}</span>
      )}
    </div>
  );
}

/** Resumo do atleta no topo dos painéis. */
export function AthleteCard({ name, detail }: { name: string; detail: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-line px-4 py-3">
      <span className="font-semibold break-words">{name}</span>
      <span className="text-sm text-cool-gray break-words">{detail}</span>
    </div>
  );
}
