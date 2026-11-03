"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { FormMessage } from "@/components/AuthShell";
import { btnPrimary, btnSecondary, input, label } from "@/components/ui/styles";
import type { CreateAthleteInput, CreateErrorKey, CreateErrors, CreateFormInput } from "@/lib/checkin/admin";
import { createRegistrationAction } from "./actions";

type Props = { categories: Record<string, string[]> };

const emptyAthlete = (): CreateAthleteInput => ({ fullName: "", instagram: "", shirtSize: "" });

const emptyForm = (): CreateFormInput => ({
  competition: "hibrido-games",
  category: "",
  kind: "individual",
  teamName: "",
  email: "",
  phone: "",
  box: "",
  athletes: [emptyAthlete(), emptyAthlete()],
});

/** id do campo no DOM: `n-email`, `n-athletes-0-fullName`. */
const domId = (key: CreateErrorKey) => `n-${key.replace(/\./g, "-")}`;

function Field({ id, text, hint, error, children }: { id: string; text: string; hint?: string; error?: string; children: React.ReactNode }) {
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

/** “Novo cadastro”: painel lateral para criar uma inscrição individual ou dupla (Story 4.5). */
export function CreateDrawer({ categories }: Props) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [pending, start] = useTransition();
  const [values, setValues] = useState<CreateFormInput>(emptyForm);
  const [notify, setNotify] = useState(false);
  const [errors, setErrors] = useState<CreateErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{ athleteId: string; name: string } | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const back = () => openerRef.current?.focus();
    dialog.addEventListener("close", back);
    return () => dialog.removeEventListener("close", back);
  }, []);

  const open = (e: React.MouseEvent<HTMLElement>) => {
    openerRef.current = e.currentTarget;
    setValues(emptyForm());
    setNotify(false);
    setErrors({});
    setMessage(null);
    setDuplicate(null);
    dialogRef.current?.showModal();
  };

  const clearError = (key: CreateErrorKey) => {
    setDuplicate(null);
    if (errors[key]) setErrors((x) => ({ ...x, [key]: undefined }));
  };

  const set = (key: Exclude<keyof CreateFormInput, "athletes">) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const value = e.target.value;
    setValues((v) => ({ ...v, [key]: value }));
    clearError(key);
  };

  const setAthlete = (i: number, key: keyof CreateAthleteInput) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setValues((v) => ({ ...v, athletes: v.athletes.map((a, k) => (k === i ? { ...a, [key]: value } : a)) }));
    clearError(`athletes.${i}.${key}`);
  };

  const save = () => {
    setMessage(null);
    setDuplicate(null);
    start(async () => {
      const count = values.kind === "dupla" ? 2 : 1;
      const result = await createRegistrationAction({ ...values, athletes: values.athletes.slice(0, count), notify });
      if (result.ok) {
        dialogRef.current?.close();
        router.push(`/admin/documentos/${result.athleteId}?criado=${result.notice}`);
        return;
      }
      setErrors(result.errors ?? {});
      setMessage(result.message);
      setDuplicate(result.duplicate ?? null);
      const first = result.errors && (Object.keys(result.errors)[0] as CreateErrorKey | undefined);
      if (first) document.getElementById(domId(first))?.focus();
    });
  };

  const fieldProps = (key: CreateErrorKey) => ({
    id: domId(key),
    "aria-invalid": !!errors[key],
    "aria-describedby": errors[key] ? `${domId(key)}-erro` : undefined,
    className: input,
  });

  const dupla = values.kind === "dupla";
  const categoryList = categories[values.competition] ?? [];

  return (
    <>
      <button type="button" className={btnPrimary} onClick={open}>
        Novo cadastro
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby="novo-title"
        onClick={(e) => {
          if (e.target === e.currentTarget && !pending) dialogRef.current?.close();
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
            <h2 id="novo-title" className="text-[22px] leading-tight font-semibold">
              Novo cadastro
            </h2>
            <button type="button" className={btnSecondary} onClick={() => dialogRef.current?.close()}>
              Fechar
            </button>
          </div>
          <p className="text-sm text-cool-gray">
            Para quem não veio da planilha de inscrições. O atleta entra como Pendente e faz o check-in com o e-mail informado.
          </p>

          <fieldset className="flex flex-col gap-4">
            <legend className="mb-3 text-base font-semibold">Inscrição</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id={domId("competition")} text="Competição" error={errors.competition}>
                <select {...fieldProps("competition")} value={values.competition} onChange={set("competition")}>
                  <option value="hibrido-games">Híbrido Games</option>
                  <option value="hibrido-race">Híbrido Race</option>
                </select>
              </Field>
              <Field id={domId("kind")} text="Tipo" error={errors.kind}>
                <select {...fieldProps("kind")} value={values.kind} onChange={set("kind")}>
                  <option value="individual">Individual</option>
                  <option value="dupla">Dupla</option>
                </select>
              </Field>
            </div>
            <Field id={domId("category")} text="Categoria" hint="Escolha da lista ou digite." error={errors.category}>
              <input {...fieldProps("category")} value={values.category} onChange={set("category")} list="n-categorias" autoComplete="off" maxLength={80} />
            </Field>
            <datalist id="n-categorias">
              {categoryList.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <Field
              id={domId("teamName")}
              text={dupla ? "Nome da equipe" : "Nome da inscrição"}
              hint={dupla ? undefined : "Opcional. Em branco, usa o nome do atleta."}
              error={errors.teamName}
            >
              <input {...fieldProps("teamName")} value={values.teamName} onChange={set("teamName")} autoComplete="off" maxLength={120} />
            </Field>
            <Field
              id={domId("email")}
              text="E-mail da inscrição"
              hint={dupla ? "O código do check-in vai para este e-mail, para os dois atletas." : "O código do check-in vai para este e-mail."}
              error={errors.email}
            >
              <input
                {...fieldProps("email")}
                value={values.email}
                onChange={set("email")}
                type="email"
                inputMode="email"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={160}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id={domId("phone")} text="Telefone" hint="Opcional." error={errors.phone}>
                <input {...fieldProps("phone")} value={values.phone} onChange={set("phone")} type="tel" inputMode="tel" autoComplete="off" maxLength={30} />
              </Field>
              <Field id={domId("box")} text="Box" hint="Opcional." error={errors.box}>
                <input {...fieldProps("box")} value={values.box} onChange={set("box")} autoComplete="off" maxLength={120} />
              </Field>
            </div>
          </fieldset>

          {values.athletes.slice(0, dupla ? 2 : 1).map((a, i) => (
            <fieldset key={i} className="flex flex-col gap-4 border-t border-line pt-5">
              <legend className="sr-only">{dupla ? `Atleta ${i + 1}` : "Atleta"}</legend>
              <span aria-hidden="true" className="text-base font-semibold">
                {dupla ? `Atleta ${i + 1}` : "Atleta"}
              </span>
              <Field id={domId(`athletes.${i}.fullName`)} text="Nome completo" error={errors[`athletes.${i}.fullName`]}>
                <input
                  {...fieldProps(`athletes.${i}.fullName`)}
                  value={a.fullName}
                  onChange={setAthlete(i, "fullName")}
                  autoComplete="off"
                  autoCapitalize="words"
                  maxLength={120}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id={domId(`athletes.${i}.instagram`)} text="Instagram" hint="Opcional." error={errors[`athletes.${i}.instagram`]}>
                  <input
                    {...fieldProps(`athletes.${i}.instagram`)}
                    value={a.instagram}
                    onChange={setAthlete(i, "instagram")}
                    autoComplete="off"
                    autoCapitalize="none"
                    maxLength={60}
                  />
                </Field>
                <Field id={domId(`athletes.${i}.shirtSize`)} text="Tamanho da camisa" hint="Opcional." error={errors[`athletes.${i}.shirtSize`]}>
                  <input
                    {...fieldProps(`athletes.${i}.shirtSize`)}
                    value={a.shirtSize}
                    onChange={setAthlete(i, "shirtSize")}
                    autoComplete="off"
                    autoCapitalize="characters"
                    maxLength={12}
                  />
                </Field>
              </div>
            </fieldset>
          ))}

          <label className="flex min-h-11 cursor-pointer items-start gap-3 border-t border-line pt-5 text-sm">
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="mt-0.5 size-4 accent-brand" />
            <span>
              Enviar e-mail avisando que o check-in está liberado
              <span className="block text-cool-gray">Vai para o e-mail da inscrição, com o link do check-in.</span>
            </span>
          </label>

          {message && (
            <FormMessage tone="error">
              {message}
              {duplicate && (
                <>
                  {" "}
                  <Link href={`/admin/documentos/${duplicate.athleteId}`} className="font-semibold underline">
                    Abrir o cadastro existente
                  </Link>
                </>
              )}
            </FormMessage>
          )}
          <div className="sticky bottom-0 -mx-5 flex flex-wrap gap-2 border-t border-line bg-surface px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <button type="submit" className={btnPrimary} disabled={pending}>
              {pending ? "Salvando…" : dupla ? "Cadastrar dupla" : "Cadastrar atleta"}
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
