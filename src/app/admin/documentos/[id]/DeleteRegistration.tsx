"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { FormMessage } from "@/components/AuthShell";
import { btnDanger, btnDangerOutline, btnSecondary } from "@/components/ui/styles";
import { deleteRegistrationAction } from "./actions";

/** “Excluir cadastro”: só para cadastros feitos no painel, sem check-in nem termo arquivado (Story 4.5). */
export function DeleteRegistration({ registrationId, names }: { registrationId: string; names: string[] }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const who = names.length > 1 ? `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}` : (names[0] ?? "");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const back = () => openerRef.current?.focus();
    dialog.addEventListener("close", back);
    return () => dialog.removeEventListener("close", back);
  }, []);

  const open = (e: React.MouseEvent<HTMLElement>) => {
    openerRef.current = e.currentTarget;
    setError(null);
    dialogRef.current?.showModal();
  };

  const confirm = () => {
    setError(null);
    start(async () => {
      const result = await deleteRegistrationAction(registrationId);
      if (result.ok) {
        dialogRef.current?.close();
        router.replace(`/admin/documentos?excluido=${encodeURIComponent(result.names.join(" e "))}`);
        return;
      }
      setError(result.message);
    });
  };

  return (
    <section aria-labelledby="excluir" className="flex flex-col gap-3 rounded-2xl border border-danger/40 bg-danger/4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex max-w-prose flex-col gap-1">
          <h2 id="excluir" className="text-lg font-semibold text-danger-ink">
            Excluir cadastro
          </h2>
          <p className="text-sm text-cool-gray">
            Remove esta inscrição feita no painel{names.length > 1 ? `, com os dois atletas da dupla` : ""}. Disponível enquanto ninguém fez o
            check-in.
          </p>
        </div>
        <button type="button" className={btnDangerOutline} onClick={open}>
          Excluir cadastro
        </button>
      </div>

      <dialog
        ref={dialogRef}
        aria-labelledby="excluir-title"
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
        >
          <h2 id="excluir-title" className="text-[22px] leading-tight font-semibold text-balance">
            Excluir o cadastro de {who}?
          </h2>
          <ul className="flex flex-col gap-2 text-sm text-cool-gray">
            <li>A inscrição sai da lista de Documentos, do check-in e da barra de progresso.</li>
            {names.length > 1 && <li>Os dois atletas da dupla são excluídos juntos.</li>}
            <li>Não dá para desfazer. O histórico do sistema guarda quem excluiu e quando.</li>
          </ul>
          {error && <FormMessage tone="error">{error}</FormMessage>}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className={btnSecondary} disabled={pending} onClick={() => dialogRef.current?.close()}>
              Cancelar
            </button>
            <button type="submit" className={btnDanger} disabled={pending}>
              {pending ? "Excluindo…" : "Excluir cadastro"}
            </button>
          </div>
        </form>
      </dialog>
    </section>
  );
}
