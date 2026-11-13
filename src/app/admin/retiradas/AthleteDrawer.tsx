"use client";

import { useRef, useState, useTransition } from "react";
import { FormMessage } from "@/components/AuthShell";
import { btnPrimary, btnSecondary, input } from "@/components/ui/styles";
import { sizeOptions, type AthleteFormErrors, type AthleteFormInput } from "@/lib/pickups/form";
import type { LinkOption } from "@/lib/pickups/list";
import { isSolo, type PickupRow } from "@/lib/pickups/rows";
import { savePickupAthleteAction } from "./actions";
import { Drawer, Field } from "./Drawer";

const initialValues = (row: PickupRow | null): AthleteFormInput =>
  row
    ? {
        competition: row.competition,
        fullName: row.fullName,
        teamName: isSolo(row) ? "" : row.teamName,
        shirtSize: row.shirtSize,
        box: row.box ?? "",
        email: row.email,
        phone: row.phone ?? "",
        athleteId: row.athleteId ?? "",
      }
    : { competition: "hibrido-games", fullName: "", teamName: "", shirtSize: "M", box: "", email: "", phone: "", athleteId: "" };

/** “Novo atleta” e “Editar”: os mesmos campos da planilha de retirada, mais o vínculo com o check-in. */
export function AthleteDrawer({
  row,
  linkOptions,
  onClose,
  onDone,
}: {
  /** Nulo = novo atleta. */
  row: PickupRow | null;
  linkOptions: LinkOption[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const close = () => dialogRef.current?.close();
  const [pending, start] = useTransition();
  const [values, setValues] = useState<AthleteFormInput>(() => initialValues(row));
  const [errors, setErrors] = useState<AthleteFormErrors>({});
  const [message, setMessage] = useState<string | null>(null);

  const set = (key: keyof AthleteFormInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const value = e.target.value;
    setValues((v) => {
      const next = { ...v, [key]: value };
      // O vínculo escolhido só vale dentro da mesma competição.
      if (key === "competition" && !linkOptions.some((o) => o.id === v.athleteId && o.competition === value)) next.athleteId = "";
      return next;
    });
    if (errors[key]) setErrors((x) => ({ ...x, [key]: undefined }));
  };

  const fieldProps = (key: keyof AthleteFormInput) => ({
    id: `r-${key}`,
    value: values[key],
    onChange: set(key),
    "aria-invalid": !!errors[key],
    "aria-describedby": errors[key] ? `r-${key}-erro` : undefined,
    className: input,
  });

  const options = linkOptions.filter((o) => o.competition === values.competition);
  const automatic = row && !row.athleteId && row.linkedAthleteId ? linkOptions.find((o) => o.id === row.linkedAthleteId) : null;
  const linkHint = values.athleteId
    ? "A retirada é liberada quando este atleta fizer o check-in."
    : automatic
      ? `Hoje o vínculo automático aponta para ${automatic.name}.`
      : "Automático: procura em Documentos um atleta com o mesmo nome nesta competição. Se não achar, escolha na lista.";

  const save = () => {
    setMessage(null);
    start(async () => {
      const result = await savePickupAthleteAction(row?.id ?? null, values);
      if (result.ok) {
        close();
        onDone(result.message);
        return;
      }
      setErrors(result.errors ?? {});
      setMessage(result.message);
      const first = result.errors && Object.keys(result.errors)[0];
      if (first) document.getElementById(`r-${first}`)?.focus();
    });
  };

  return (
    <Drawer dialogRef={dialogRef} titleId="atleta-title" busy={pending} onClose={onClose}>
      <form
        className="flex flex-col gap-5 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        noValidate
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="atleta-title" className="text-[22px] leading-tight font-semibold">
            {row ? "Editar atleta" : "Novo atleta"}
          </h2>
          <button type="button" className={btnSecondary} onClick={close}>
            Fechar
          </button>
        </div>
        <p className="text-sm text-cool-gray">
          {row
            ? "Corrija os dados da lista de retirada. O que for salvo aqui não é sobrescrito quando a planilha for importada de novo, e o cadastro em Documentos não muda."
            : "Para quem tem camisa a retirar e não veio na planilha. O atleta entra como Pendente."}
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="r-competition" text="Competição" error={errors.competition}>
            <select {...fieldProps("competition")}>
              <option value="hibrido-games">Híbrido Games</option>
              <option value="hibrido-race">Híbrido Race</option>
            </select>
          </Field>
          <Field id="r-shirtSize" text="Tamanho da camisa" error={errors.shirtSize}>
            <select {...fieldProps("shirtSize")}>
              {sizeOptions(values.shirtSize).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field id="r-fullName" text="Atleta" error={errors.fullName}>
          <input {...fieldProps("fullName")} autoComplete="off" autoCapitalize="words" maxLength={120} />
        </Field>
        <Field id="r-teamName" text="Inscrição ou equipe" hint="Em branco, o atleta entra como individual." error={errors.teamName}>
          <input {...fieldProps("teamName")} autoComplete="off" maxLength={120} />
        </Field>
        <Field id="r-email" text="E-mail" hint="O aviso da retirada vai para este e-mail." error={errors.email}>
          <input
            {...fieldProps("email")}
            type="email"
            inputMode="email"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={160}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="r-phone" text="Telefone" hint="Opcional." error={errors.phone}>
            <input {...fieldProps("phone")} type="tel" inputMode="tel" autoComplete="off" maxLength={30} />
          </Field>
          <Field id="r-box" text="Box ou academia" hint="Opcional." error={errors.box}>
            <input {...fieldProps("box")} autoComplete="off" maxLength={120} />
          </Field>
        </div>

        <div className="border-t border-line pt-5">
          <Field id="r-athleteId" text="Cadastro do check-in (Documentos)" hint={linkHint} error={errors.athleteId}>
            <select {...fieldProps("athleteId")}>
              <option value="">Automático, pelo nome</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} · {o.teamName}
                  {o.checkedIn ? "" : " (check-in pendente)"}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {message && <FormMessage tone="error">{message}</FormMessage>}
        <div className="sticky bottom-0 -mx-5 flex flex-wrap gap-2 border-t border-line bg-surface px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <button type="submit" className={btnPrimary} disabled={pending}>
            {pending ? "Salvando…" : row ? "Salvar alterações" : "Adicionar à lista"}
          </button>
          <button type="button" className={btnSecondary} onClick={close} disabled={pending}>
            Cancelar
          </button>
        </div>
      </form>
    </Drawer>
  );
}
