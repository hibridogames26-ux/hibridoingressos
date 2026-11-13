"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { FormMessage } from "@/components/AuthShell";
import { EmptyState, PageHeader, tableCls, tdCls, thCls, trCls } from "@/components/admin/PageHeader";
import {
  badgeDanger,
  badgeNeutral,
  badgeSuccess,
  btnDanger,
  btnOutline,
  btnPrimary,
  btnSecondary,
  card,
} from "@/components/ui/styles";
import { COMPETITION_LABEL } from "@/lib/checkin/terms";
import { formatDateTime } from "@/lib/format";
import type { LinkOption } from "@/lib/pickups/list";
import { GATE_LABEL, pickedByText, pickupGate, teamLabel, type PickupRow } from "@/lib/pickups/rows";
import { deletePickupAction, resendPickupEmailAction, undoPickupAction } from "./actions";
import { AthleteDrawer } from "./AthleteDrawer";
import { AthleteCard, Drawer } from "./Drawer";
import { PickupDrawer } from "./PickupDrawer";

type Active =
  | { kind: "new" }
  | { kind: "edit" | "pickup" | "delete" | "undo"; row: PickupRow }
  | null;

type Notice = { text: string; tone: "success" | "error" } | null;

/** Ação principal da linha: compacta, para caber ao lado de Editar e Excluir. */
const btnRow =
  "inline-flex min-h-9 items-center justify-center rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-white transition duration-150 hover:bg-brand-dark active:scale-[0.98] active:bg-brand-deep pointer-coarse:min-h-11 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

/** Lista de retirada de camisas: confirmar, desfazer, editar, excluir e incluir atletas (Story 4.6). */
export function RetiradasView({
  rows,
  all,
  linkOptions,
  exportHref,
  children,
}: {
  /** Linhas depois dos filtros da tela. */
  rows: PickupRow[];
  all: PickupRow[];
  linkOptions: LinkOption[];
  exportHref: string;
  /** Totais e filtros, renderizados no servidor. */
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [active, setActive] = useState<Active>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, start] = useTransition();
  const [resendingId, setResendingId] = useState<string | null>(null);

  const closed = () => setActive(null);
  const done = (text: string, warn = false) => {
    setNotice({ text, tone: warn ? "error" : "success" });
    router.refresh();
  };

  const resend = (row: PickupRow) => {
    setResendingId(row.id);
    start(async () => {
      const result = await resendPickupEmailAction(row.id);
      setNotice({ text: result.message, tone: result.ok ? "success" : "error" });
      setResendingId(null);
      router.refresh();
    });
  };

  return (
    <>
      <PageHeader
        title="Retiradas"
        description="Entrega das camisas dos atletas do Híbrido Games e do Híbrido Race. A retirada só é liberada depois do check-in."
        actions={
          <>
            {all.length > 0 && (
              <a href={exportHref} className={btnOutline}>
                Exportar planilha ({rows.length})
              </a>
            )}
            <button type="button" className={btnPrimary} onClick={() => setActive({ kind: "new" })}>
              Novo atleta
            </button>
          </>
        }
      />

      {notice && <FormMessage tone={notice.tone}>{notice.text}</FormMessage>}

      {children}

      <div className={`${card} overflow-hidden`}>
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className={tableCls}>
              <thead>
                <tr>
                  <th className={thCls}>Atleta</th>
                  <th className={thCls}>Competição</th>
                  <th className={thCls}>Camisa</th>
                  <th className={thCls}>Check-in</th>
                  <th className={thCls}>Situação</th>
                  <th className={thCls}>
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const gate = pickupGate(r);
                  const p = r.pickup;
                  return (
                    <tr key={r.id} className={trCls}>
                      <td className={tdCls}>
                        <div className="font-medium">{r.name}</div>
                        <div className="text-xs text-muted">
                          {teamLabel(r)}
                          {r.box ? ` · ${r.box}` : ""}
                        </div>
                      </td>
                      <td data-label="Competição" className={tdCls}>
                        {COMPETITION_LABEL[r.competition]}
                      </td>
                      <td data-label="Camisa" className={tdCls}>
                        <div className="flex flex-col items-end gap-0.5 sm:items-start">
                          <span className="font-semibold tabular-nums">{p?.deliveredSize ?? r.shirtSize}</span>
                          {p && p.deliveredSize !== r.shirtSize && <span className="text-xs text-muted">inscrição: {r.shirtSize}</span>}
                        </div>
                      </td>
                      <td data-label="Check-in" className={tdCls}>
                        {gate === "liberado" ? (
                          <span className={badgeSuccess}>{GATE_LABEL.liberado}</span>
                        ) : gate === "sem_checkin" ? (
                          <span className={badgeDanger}>{GATE_LABEL.sem_checkin}</span>
                        ) : (
                          <span className={badgeNeutral}>{GATE_LABEL.sem_cadastro}</span>
                        )}
                      </td>
                      <td data-label="Situação" className={tdCls}>
                        <div className="flex flex-col items-end gap-1 text-right sm:items-start sm:text-left">
                          <span className={p ? badgeSuccess : badgeNeutral}>{p ? "Retirada" : "Pendente"}</span>
                          {p && (
                            <span className="text-xs text-cool-gray">
                              {pickedByText(p)} · {formatDateTime(p.at)}
                              {p.deliveredByName ? ` · entregue por ${p.deliveredByName}` : ""}
                            </span>
                          )}
                          {p && !p.emailSentAt && (
                            <span className="flex flex-wrap items-center justify-end gap-2 sm:justify-start">
                              <span className={badgeDanger}>E-mail não enviado</span>
                              <button type="button" className={btnSecondary} disabled={busy} onClick={() => resend(r)}>
                                {resendingId === r.id ? "Enviando…" : "Reenviar e-mail"}
                              </button>
                            </span>
                          )}
                        </div>
                      </td>
                      <td className={tdCls}>
                        <div className="flex flex-wrap gap-2 sm:justify-end">
                          {p ? (
                            <button type="button" className={btnSecondary} onClick={() => setActive({ kind: "undo", row: r })}>
                              Desfazer
                            </button>
                          ) : gate === "liberado" ? (
                            <button type="button" className={btnRow} onClick={() => setActive({ kind: "pickup", row: r })}>
                              Confirmar retirada
                            </button>
                          ) : gate === "sem_checkin" ? (
                            <Link href={`/admin/documentos/${r.linkedAthleteId}`} className={btnSecondary}>
                              Abrir check-in
                            </Link>
                          ) : (
                            <button type="button" className={btnSecondary} onClick={() => setActive({ kind: "edit", row: r })}>
                              Vincular cadastro
                            </button>
                          )}
                          <button type="button" className={btnSecondary} onClick={() => setActive({ kind: "edit", row: r })}>
                            Editar
                          </button>
                          <button
                            type="button"
                            className={`${btnSecondary} text-danger-ink`}
                            onClick={() => setActive({ kind: "delete", row: r })}
                          >
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState>
            {all.length ? "Nenhum atleta encontrado com estes filtros." : "A lista de retirada está vazia. Importe a planilha (npm run pickups:import) ou use “Novo atleta”."}
          </EmptyState>
        )}
      </div>

      {active?.kind === "new" && <AthleteDrawer row={null} linkOptions={linkOptions} onClose={closed} onDone={done} />}
      {active?.kind === "edit" && <AthleteDrawer key={active.row.id} row={active.row} linkOptions={linkOptions} onClose={closed} onDone={done} />}
      {active?.kind === "pickup" && (
        <PickupDrawer key={active.row.id} row={active.row} all={all} onClose={closed} onDone={done} onStale={() => router.refresh()} />
      )}
      {(active?.kind === "delete" || active?.kind === "undo") && (
        <ConfirmDialog key={`${active.kind}-${active.row.id}`} kind={active.kind} row={active.row} onClose={closed} onDone={done} />
      )}
    </>
  );
}

/** Confirmação de “Excluir da lista” e “Desfazer retirada”. */
function ConfirmDialog({
  kind,
  row,
  onClose,
  onDone,
}: {
  kind: "delete" | "undo";
  row: PickupRow;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const close = () => dialogRef.current?.close();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const blocked = kind === "delete" && !!row.pickup;

  const run = () => {
    setError(null);
    start(async () => {
      const result = kind === "delete" ? await deletePickupAction(row.id) : await undoPickupAction(row.id);
      if (result.ok) {
        close();
        onDone(result.message);
        return;
      }
      setError(result.message);
    });
  };

  const title = kind === "delete" ? `Excluir ${row.name} da lista de retirada?` : `Desfazer a retirada de ${row.name}?`;

  return (
    <Drawer dialogRef={dialogRef} titleId="confirmar-title" variant="center" busy={pending} onClose={onClose}>
      <form
        className="flex flex-col gap-5 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!blocked) run();
        }}
      >
        <h2 id="confirmar-title" className="text-[22px] leading-tight font-semibold text-balance">
          {title}
        </h2>
        <AthleteCard name={row.name} detail={`${teamLabel(row)} · ${COMPETITION_LABEL[row.competition]} · camisa ${row.shirtSize}`} />
        {blocked ? (
          <p className="text-sm text-cool-gray">Esta camisa já foi retirada. Para excluir o atleta da lista, desfaça a retirada antes.</p>
        ) : kind === "delete" ? (
          <ul className="flex flex-col gap-2 text-sm text-cool-gray">
            <li>O atleta sai da lista de retirada e não volta quando a planilha for importada de novo.</li>
            <li>O cadastro dele em Documentos não muda.</li>
            <li>O histórico guarda quem excluiu e quando.</li>
          </ul>
        ) : (
          <ul className="flex flex-col gap-2 text-sm text-cool-gray">
            <li>A camisa volta para Pendente e pode ser entregue de novo.</li>
            <li>Nenhum e-mail é enviado.</li>
            <li>O histórico guarda quem desfez e quando.</li>
          </ul>
        )}
        {error && <FormMessage tone="error">{error}</FormMessage>}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className={btnSecondary} disabled={pending} onClick={close}>
            {blocked ? "Entendi" : "Cancelar"}
          </button>
          {!blocked && (
            <button type="submit" className={btnDanger} disabled={pending}>
              {pending ? "Aguarde…" : kind === "delete" ? "Excluir da lista" : "Desfazer retirada"}
            </button>
          )}
        </div>
      </form>
    </Drawer>
  );
}
