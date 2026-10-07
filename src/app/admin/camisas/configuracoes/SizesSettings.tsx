"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { FormMessage } from "@/components/AuthShell";
import { badgeNeutral, badgeSuccess, btnPrimary, card, input } from "@/components/ui/styles";
import { Switch } from "@/components/ui/Switch";
import { DEFAULT_DISABLED_MESSAGE } from "@/lib/shirts";
import { setSizeEnabledAction, updateSettingsAction, updateSizeSettingsAction } from "../actions";

export type SizeSettingsRow = {
  size: string;
  enabled: boolean;
  paid: number;
  pending: number;
  limit: number | null;
  message: string;
};

type Notice = { tone: "success" | "error"; text: string } | null;

/** Interruptor de cada tamanho + limite de camisas e mensagem ao cliente por tamanho. */
export function SizesSettings({ rows, sizesText }: { rows: SizeSettingsRow[]; sizesText: string }) {
  const [limits, setLimits] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((r) => [r.size, r.limit === null ? "" : String(r.limit)])),
  );
  const [messages, setMessages] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((r) => [r.size, r.message])));
  const [grade, setGrade] = useState(sizesText);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [toggleNotice, setToggleNotice] = useState<Notice>(null);
  const [saveNotice, setSaveNotice] = useState<Notice>(null);
  const [gradeNotice, setGradeNotice] = useState<Notice>(null);

  const dirty = rows.some(
    (r) => (limits[r.size] ?? "") !== (r.limit === null ? "" : String(r.limit)) || (messages[r.size] ?? "") !== r.message,
  );

  const toggle = (row: SizeSettingsRow, enabled: boolean) => {
    setBusy(row.size);
    setToggleNotice(null);
    start(async () => {
      const result = await setSizeEnabledAction(row.size, enabled);
      setBusy(null);
      setToggleNotice(
        result.ok
          ? {
              tone: "success",
              text: enabled ? `Tamanho ${row.size} habilitado.` : `Tamanho ${row.size} desabilitado. Novas compras neste tamanho estão bloqueadas.`,
            }
          : { tone: "error", text: result.message },
      );
    });
  };

  const saveSizes = () =>
    start(async () => {
      setSaveNotice(null);
      const result = await updateSizeSettingsAction({ limits, messages });
      setSaveNotice(result.ok ? { tone: "success", text: result.message ?? "Salvo." } : { tone: "error", text: result.message });
    });

  const saveGrade = () =>
    start(async () => {
      setGradeNotice(null);
      const result = await updateSettingsAction({ sizes: grade });
      setGradeNotice(result.ok ? { tone: "success", text: "Grade salva." } : { tone: "error", text: result.message });
    });

  const cautions = rows.filter((r) => !r.enabled && r.paid > 0);
  const saving = pending && busy === null;

  return (
    <>
      <section className={`${card} flex flex-col gap-3 py-4 sm:py-5`} aria-labelledby="cfg-tamanhos">
        <div className="flex flex-col gap-1 px-4 sm:px-5">
          <h2 id="cfg-tamanhos" className="text-[22px] font-semibold leading-tight">
            Tamanhos
          </h2>
          <p className="text-sm text-cool-gray">
            Desligue um tamanho quando o fornecedor deixar de atender. Quem já comprou continua com a encomenda. O limite conta
            camisas pagas mais reservas e fecha o tamanho sozinho quando for atingido.
          </p>
        </div>

        {rows.length === 0 ? (
          <p className="px-4 text-sm text-muted sm:px-5">A grade de tamanhos ainda não foi definida. Use o campo abaixo.</p>
        ) : (
          <>
            <div
              aria-hidden="true"
              className="hidden grid-cols-[4.5rem_9rem_8rem_8rem_1fr] gap-x-4 px-4 text-xs font-medium uppercase tracking-wide text-muted sm:px-5 md:grid"
            >
              <span>Aceitar</span>
              <span>Tamanho</span>
              <span>Usadas</span>
              <span>Limite</span>
              <span>Mensagem ao cliente</span>
            </div>
            <ul className="flex flex-col">
              {rows.map((r) => {
                const used = r.paid + r.pending;
                const typed = (limits[r.size] ?? "").trim();
                const limitNumber = /^\d{1,6}$/.test(typed) ? Number(typed) : null;
                return (
                  <li
                    key={r.size}
                    className="grid grid-cols-[auto_1fr] items-start gap-x-4 gap-y-2 border-t border-line px-4 py-3 sm:px-5 md:grid-cols-[4.5rem_9rem_8rem_8rem_1fr]"
                  >
                    <Switch
                      checked={r.enabled}
                      label={`Aceitar encomendas no tamanho ${r.size}`}
                      busy={pending && busy === r.size}
                      disabled={pending}
                      onChange={(next) => toggle(r, next)}
                    />
                    <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-base font-semibold">{r.size}</span>
                      <span className={r.enabled ? badgeSuccess : badgeNeutral}>{r.enabled ? "Aceitando" : "Desabilitado"}</span>
                    </div>
                    <div className="col-span-2 flex min-h-11 items-center text-sm text-cool-gray md:col-span-1">
                      <span>
                        <strong className="font-semibold tabular-nums text-ink">{used}</strong>{" "}
                        <span className="text-xs text-muted">
                          ({r.paid} {r.paid === 1 ? "paga" : "pagas"} · {r.pending} {r.pending === 1 ? "reserva" : "reservas"})
                        </span>
                      </span>
                    </div>
                    <div className="col-span-2 flex flex-col gap-1 md:col-span-1">
                      <label htmlFor={`lim-${r.size}`} className="text-xs font-medium text-muted md:sr-only">
                        Limite de camisas
                      </label>
                      <input
                        id={`lim-${r.size}`}
                        className={input}
                        inputMode="numeric"
                        placeholder="Sem limite"
                        value={limits[r.size] ?? ""}
                        onChange={(e) => {
                          setSaveNotice(null);
                          setLimits((v) => ({ ...v, [r.size]: e.target.value }));
                        }}
                      />
                      {limitNumber !== null && limitNumber <= used && (
                        <span className="text-xs text-danger-ink">
                          {limitNumber < used ? `Já há ${used} camisas: o tamanho fica esgotado.` : "O tamanho fica esgotado."}
                        </span>
                      )}
                    </div>
                    <div className="col-span-2 flex flex-col gap-1 md:col-span-1">
                      <label htmlFor={`msg-${r.size}`} className="text-xs font-medium text-muted md:sr-only">
                        Mensagem quando desabilitado
                      </label>
                      <input
                        id={`msg-${r.size}`}
                        className={input}
                        maxLength={200}
                        placeholder={DEFAULT_DISABLED_MESSAGE}
                        value={messages[r.size] ?? ""}
                        onChange={(e) => {
                          setSaveNotice(null);
                          setMessages((v) => ({ ...v, [r.size]: e.target.value }));
                        }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {cautions.length > 0 && (
          <div role="status" className="mx-4 flex flex-col gap-1.5 rounded-xl bg-cool-gray/12 px-4 py-3 text-sm leading-snug sm:mx-5">
            <strong className="font-semibold">Atenção: há encomendas pagas em tamanho desabilitado.</strong>
            {cautions.map((c) => (
              <span key={c.size}>
                {c.size}: {c.paid} {c.paid === 1 ? "encomenda paga continua válida" : "encomendas pagas continuam válidas"}. Novas
                compras ficam bloqueadas.{" "}
                <Link
                  href={`/admin/camisas/encomendas?tamanho=${encodeURIComponent(c.size)}`}
                  className="font-semibold text-brand-dark underline-offset-4 hover:underline"
                >
                  Ver encomendas {c.size}
                </Link>
              </span>
            ))}
          </div>
        )}

        {toggleNotice && (
          <div className="px-4 sm:px-5">
            <FormMessage tone={toggleNotice.tone}>{toggleNotice.text}</FormMessage>
          </div>
        )}

        {rows.length > 0 && (
          <div className="flex flex-col gap-3 px-4 sm:px-5">
            {saveNotice && <FormMessage tone={saveNotice.tone}>{saveNotice.text}</FormMessage>}
            <div>
              <button type="button" className={btnPrimary} disabled={pending || !dirty} onClick={saveSizes}>
                {saving ? "Salvando…" : dirty ? "Salvar limites e mensagens" : "Sem alterações"}
              </button>
            </div>
            <p className="text-xs text-muted">
              Limite vazio = sem limite. A mensagem aparece na vitrine quando o tamanho está desabilitado; se ficar vazia, o cliente
              vê o texto padrão.
            </p>
          </div>
        )}
      </section>

      <section className={`${card} flex flex-col gap-3 p-4 sm:p-5`} aria-labelledby="cfg-grade">
        <div className="flex flex-col gap-1">
          <h2 id="cfg-grade" className="text-[22px] font-semibold leading-tight">
            Grade de tamanhos
          </h2>
          <p className="text-sm text-cool-gray">
            Separe por vírgula. Um tamanho que já tem encomendas não sai da grade: desabilite-o acima.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="grade" className="text-sm font-medium">
            Tamanhos
          </label>
          <input
            id="grade"
            className={input}
            value={grade}
            autoCapitalize="characters"
            onChange={(e) => {
              setGradeNotice(null);
              setGrade(e.target.value);
            }}
          />
        </div>
        {gradeNotice && <FormMessage tone={gradeNotice.tone}>{gradeNotice.text}</FormMessage>}
        <div>
          <button type="button" className={btnPrimary} disabled={pending || grade === sizesText} onClick={saveGrade}>
            {saving ? "Salvando…" : grade === sizesText ? "Sem alterações" : "Salvar grade"}
          </button>
        </div>
      </section>
    </>
  );
}
