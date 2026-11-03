"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { FormMessage } from "@/components/AuthShell";
import { btnOutline, btnPrimary, btnSecondary, input, label } from "@/components/ui/styles";
import type { EditErrors, EditFormInput } from "@/lib/checkin/admin";
import { updateAthleteAction } from "./actions";

type Props = {
  athleteId: string;
  initial: EditFormInput;
  kind: "dupla" | "individual";
  /** Nome do outro integrante, para avisar que a inscrição é compartilhada. */
  partner: string | null;
  signed: boolean;
  categories: Record<string, string[]>;
};

function Field({
  id,
  text,
  hint,
  error,
  children,
}: {
  id: string;
  text: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
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

/** “Editar cadastro”: painel lateral com os dados do atleta e da inscrição (Story 4.4). */
export function EditDrawer({ athleteId, initial, kind, partner, signed, categories }: Props) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [pending, start] = useTransition();
  const [values, setValues] = useState<EditFormInput>(initial);
  const [errors, setErrors] = useState<EditErrors>({});
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const back = () => openerRef.current?.focus();
    dialog.addEventListener("close", back);
    return () => dialog.removeEventListener("close", back);
  }, []);

  const open = (e: React.MouseEvent<HTMLElement>) => {
    openerRef.current = e.currentTarget;
    setValues(initial);
    setErrors({});
    setMessage(null);
    dialogRef.current?.showModal();
  };

  const set = (key: keyof EditFormInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const value = e.target.value;
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key]) setErrors((x) => ({ ...x, [key]: undefined }));
  };

  const save = () => {
    setMessage(null);
    start(async () => {
      const result = await updateAthleteAction(athleteId, values);
      if (result.ok) {
        dialogRef.current?.close();
        router.refresh();
        return;
      }
      setErrors(result.errors ?? {});
      setMessage({ tone: "error", text: result.message });
      const first = result.errors && Object.keys(result.errors)[0];
      if (first) document.getElementById(`e-${first}`)?.focus();
    });
  };

  const fieldProps = (key: keyof EditFormInput) => ({
    id: `e-${key}`,
    value: values[key],
    onChange: set(key),
    "aria-invalid": !!errors[key],
    "aria-describedby": errors[key] ? `e-${key}-erro` : undefined,
    className: input,
  });

  const shared = kind === "dupla" ? `Vale para a dupla${partner ? ` (também para ${partner})` : ""}.` : null;
  const categoryList = categories[values.competition] ?? [];

  return (
    <>
      <button type="button" className={btnOutline} onClick={open}>
        Editar cadastro
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby="editar-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) dialogRef.current?.close();
        }}
        className="m-0 ml-auto h-dvh max-h-dvh w-[min(34rem,100vw)] overflow-y-auto bg-surface p-0 text-ink shadow-whisper backdrop:bg-ink/40"
      >
        <form
          className="flex flex-col gap-5 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          noValidate
        >
          <div className="flex items-center justify-between gap-3">
            <h2 id="editar-title" className="text-[22px] leading-tight font-semibold">
              Editar cadastro
            </h2>
            <button type="button" className={btnSecondary} onClick={() => dialogRef.current?.close()}>
              Fechar
            </button>
          </div>
          <p className="text-sm text-cool-gray">
            Corrija erros vindos da planilha. Campos salvos aqui não são sobrescritos quando a planilha for importada de novo.
          </p>

          {signed && (
            <p className="rounded-xl bg-brand-subtle px-4 py-3 text-sm text-ink">
              Este atleta já fez o check-in. O termo assinado guarda os dados do momento da assinatura; para o PDF refletir a
              correção, refaça o check-in depois de salvar.
            </p>
          )}

          <fieldset className="flex flex-col gap-4">
            <legend className="mb-3 text-base font-semibold">Atleta</legend>
            <Field id="e-fullName" text="Nome completo" error={errors.fullName}>
              <input {...fieldProps("fullName")} autoComplete="off" maxLength={120} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="e-instagram" text="Instagram" hint="Opcional." error={errors.instagram}>
                <input {...fieldProps("instagram")} autoComplete="off" autoCapitalize="none" maxLength={60} />
              </Field>
              <Field id="e-shirtSize" text="Tamanho da camisa" hint="Opcional." error={errors.shirtSize}>
                <input {...fieldProps("shirtSize")} autoComplete="off" autoCapitalize="characters" maxLength={12} />
              </Field>
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-4 border-t border-line pt-5">
            <legend className="sr-only">Inscrição</legend>
            <div className="flex flex-col gap-0.5">
              <span className="text-base font-semibold">Inscrição</span>
              {shared && <span className="text-sm text-cool-gray">{shared}</span>}
            </div>
            <Field
              id="e-email"
              text="E-mail da inscrição"
              hint="O código do check-in vai para este e-mail. Trocar encerra o acesso do e-mail antigo."
              error={errors.email}
            >
              <input {...fieldProps("email")} type="email" inputMode="email" autoComplete="off" autoCapitalize="none" maxLength={160} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="e-phone" text="Telefone" hint="Opcional." error={errors.phone}>
                <input {...fieldProps("phone")} type="tel" inputMode="tel" autoComplete="off" maxLength={30} />
              </Field>
              <Field id="e-box" text="Box" hint="Opcional." error={errors.box}>
                <input {...fieldProps("box")} autoComplete="off" maxLength={120} />
              </Field>
            </div>
            <Field id="e-teamName" text={kind === "dupla" ? "Nome da equipe" : "Nome da inscrição"} error={errors.teamName}>
              <input {...fieldProps("teamName")} autoComplete="off" maxLength={120} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="e-competition" text="Competição" error={errors.competition}>
                <select {...fieldProps("competition")}>
                  <option value="hibrido-games">Híbrido Games</option>
                  <option value="hibrido-race">Híbrido Race</option>
                </select>
              </Field>
              <Field id="e-category" text="Categoria" hint="Escolha da lista ou digite." error={errors.category}>
                <input {...fieldProps("category")} list="e-categorias" autoComplete="off" maxLength={80} />
              </Field>
            </div>
            <datalist id="e-categorias">
              {categoryList.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <Field id="e-status" text="Situação" hint="Inscrição cancelada sai do check-in e da barra de progresso." error={errors.status}>
              <select {...fieldProps("status")}>
                <option value="aprovado">Aprovada</option>
                <option value="cancelado">Cancelada</option>
              </select>
            </Field>
            <p className="text-xs text-muted">O tipo da inscrição (dupla ou individual) não muda por aqui.</p>
          </fieldset>

          {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}
          <div className="sticky bottom-0 -mx-5 flex flex-wrap gap-2 border-t border-line bg-surface px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <button type="submit" className={btnPrimary} disabled={pending}>
              {pending ? "Salvando…" : "Salvar alterações"}
            </button>
            <button type="button" className={btnSecondary} onClick={() => dialogRef.current?.close()}>
              Cancelar
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
