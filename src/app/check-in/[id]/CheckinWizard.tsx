"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { FormMessage } from "@/components/AuthShell";
import { CertificateUpload, type UploadedCertificate } from "@/components/checkin/CertificateUpload";
import { SignaturePad, type SignatureStrokes } from "@/components/checkin/SignaturePad";
import { btnOutline, btnPrimary, input as inputBase, label } from "@/components/ui/styles";

/** Campo com borda de erro quando inválido. */
const input = `${inputBase} placeholder:text-cool-gray aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/12`;
import {
  emptyDraft,
  firstErrorStep,
  isMinor,
  stepErrors,
  STEPS,
  todaySaoPaulo,
  type CheckinDraft,
  type FieldErrors,
  type ParqAnswer,
  type StepIndex,
} from "@/lib/checkin/form";
import type { Competition } from "@/lib/checkin/sheet";
import {
  COMPETITION_LABEL,
  FINAL_DECLARATION,
  IMAGE_CONSENT_TEXT,
  MEDICAL_CERTIFICATE_NOTE,
  PARQ_INTRO,
  PARQ_QUESTIONS,
  SIGNATURE_NOTE,
  competitionTitle,
  termsSections,
} from "@/lib/checkin/terms";
import { formatPhone } from "@/lib/checkout";
import { prepareCertificateUpload, sendCheckin } from "./actions";

type Athlete = {
  id: string;
  name: string;
  teamName: string;
  kind: "dupla" | "individual";
  category: string;
  competition: Competition;
  prefillEmail: string;
  prefillPhone: string;
};

type Signature = { strokes: SignatureStrokes; dataUrl: string } | null;

type Saved = {
  v: 1;
  step: StepIndex;
  draft: CheckinDraft;
  certificate: UploadedCertificate | null;
  signature: Signature;
  guardianSignature: Signature;
};

const storageKeyFor = (id: string) => `hg-checkin:${id}`;

function Field({
  label: text,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: (props: { id: string; "aria-invalid": boolean; "aria-describedby"?: string }) => React.ReactNode;
}) {
  const id = useId();
  const describedBy = [error ? `${id}-e` : null, hint ? `${id}-h` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={label}>
        {text}
      </label>
      {children({ id, "aria-invalid": !!error, "aria-describedby": describedBy })}
      {hint && !error && (
        <span id={`${id}-h`} className="text-xs text-cool-gray">
          {hint}
        </span>
      )}
      {error && (
        <span id={`${id}-e`} className="animate-message text-xs text-danger-ink">
          {error}
        </span>
      )}
    </div>
  );
}

function Check({ className = "size-3.5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className={className}>
      <path d="M3.5 8.5 6.5 11.5 12.5 5" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Caixa de marcação do sistema, com o desenho do produto. */
function Checkbox({
  checked,
  onChange,
  invalid,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  invalid?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-xl p-3 text-sm leading-relaxed transition duration-150 ${
        invalid ? "bg-danger/8" : "bg-brand-subtle/60 hover:bg-brand-subtle"
      }`}
    >
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-invalid={invalid} className="peer sr-only" />
      <span
        aria-hidden="true"
        className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border-2 transition duration-150 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand ${
          checked ? "border-brand bg-brand text-white" : invalid ? "border-danger bg-surface" : "border-cool-gray/60 bg-surface"
        }`}
      >
        {checked && <Check />}
      </span>
      <span>{children}</span>
    </label>
  );
}

function readSaved(athleteId: string): Saved | null {
  try {
    const raw = localStorage.getItem(storageKeyFor(athleteId));
    const saved = raw ? (JSON.parse(raw) as Saved) : null;
    return saved?.v === 1 ? saved : null;
  } catch {
    // Sem armazenamento local (aba anônima) ou rascunho corrompido: começa do zero.
    return null;
  }
}

const noop = () => () => {};

type WizardProps = { athlete: Athlete; verifiedEmail: string; storageKey: string };

/**
 * Rascunho no aparelho: abrir a câmera para fotografar o atestado pode recarregar a página no Android.
 * Depois da hidratação o formulário remonta uma vez com o rascunho salvo.
 */
export function CheckinWizard(props: WizardProps) {
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  const saved = useMemo(() => (hydrated ? readSaved(props.athlete.id) : null), [hydrated, props.athlete.id]);
  return <WizardForm key={hydrated ? "client" : "server"} {...props} saved={saved} persist={hydrated} />;
}

function WizardForm({ athlete, verifiedEmail, storageKey, saved, persist }: WizardProps & { saved: Saved | null; persist: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<StepIndex>(saved?.step ?? 0);
  const [draft, setDraft] = useState<CheckinDraft>(() =>
    saved
      ? emptyDraft(saved.draft)
      : emptyDraft({ fullName: athlete.name, email: athlete.prefillEmail, phone: formatPhone(athlete.prefillPhone) }),
  );
  const [certificate, setCertificate] = useState<UploadedCertificate | null>(saved?.certificate ?? null);
  const [signature, setSignature] = useState<Signature>(saved?.signature ?? null);
  const [guardianSignature, setGuardianSignature] = useState<Signature>(saved?.guardianSignature ?? null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [submitting, startSubmit] = useTransition();
  const topRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const today = todaySaoPaulo();
  const minor = isMinor(draft.birthDate, today);

  useEffect(() => {
    if (!persist) return;
    try {
      const data: Saved = { v: 1, step, draft, certificate, signature, guardianSignature };
      localStorage.setItem(storageKeyFor(athlete.id), JSON.stringify(data));
    } catch {
      // Cota cheia ou armazenamento bloqueado: o formulário continua funcionando.
    }
  }, [persist, athlete.id, step, draft, certificate, signature, guardianSignature]);

  const set = <K extends keyof CheckinDraft>(key: K, value: CheckinDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setMessage(null);
    setErrors((e) => {
      if (!e[key]) return e;
      const next = { ...e };
      delete next[key];
      return next;
    });
  };

  const setParq = (i: number, value: ParqAnswer) => {
    setDraft((d) => ({ ...d, parq: d.parq.map((a, k) => (k === i ? value : a)) }));
    setMessage(null);
    setErrors((e) => {
      const next = { ...e };
      delete next[`parq.${i}`];
      return next;
    });
  };

  const focusFirstError = () =>
    requestAnimationFrame(() => {
      const el = bodyRef.current?.querySelector<HTMLElement>("[aria-invalid='true'], [data-invalid='true']");
      if (!el) return;
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      // Os rádios e caixas ficam escondidos: o foco vai para o primeiro controle da pergunta.
      el.focus({ preventScroll: true });
    });

  const goTo = (next: StepIndex) => {
    setStep(next);
    setMessage(null);
    requestAnimationFrame(() => {
      topRef.current?.scrollIntoView({ block: "start" });
      topRef.current?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
    });
  };

  const fileErrors = (): FieldErrors => {
    const e: FieldErrors = {};
    if (!certificate) e.certificate = "Anexe o atestado médico.";
    if (!signature) e.signature = "Assine no quadro.";
    if (minor && !guardianSignature) e.guardianSignature = "O responsável legal precisa assinar.";
    return e;
  };

  const next = () => {
    const e = { ...stepErrors(step, draft, today), ...(step === 3 ? fileErrors() : {}) };
    setErrors(e);
    if (Object.keys(e).length) {
      setMessage(step === 1 ? "Responda todas as perguntas." : "Confira os campos destacados.");
      focusFirstError();
      return;
    }
    if (step < 3) return goTo((step + 1) as StepIndex);
    submit();
  };

  const submit = () =>
    startSubmit(async () => {
      setMessage(null);
      const result = await sendCheckin(athlete.id, {
        draft,
        signature: signature?.dataUrl ?? null,
        guardianSignature: minor ? (guardianSignature?.dataUrl ?? null) : null,
        certificate: { path: certificate?.path ?? null, name: certificate?.name ?? null },
      });
      if (result.ok) {
        try {
          localStorage.removeItem(storageKeyFor(athlete.id));
        } catch {}
        router.replace(`/check-in/${athlete.id}?ok=1`);
        return;
      }
      if (result.reason === "done") return router.refresh();
      if (result.reason === "session") setSessionExpired(true);
      setMessage(result.message);
      if (result.errors) {
        setErrors(result.errors);
        const target = firstErrorStep(result.errors);
        if (target !== null && target !== step) goTo(target);
        else focusFirstError();
      }
    });

  const anyYes = draft.parq.includes("sim");
  const answered = draft.parq.filter(Boolean).length;
  const ev = competitionTitle(athlete.competition);

  if (sessionExpired) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 pt-2 pb-8">
        <h1 className="text-[22px] leading-tight font-semibold">Confirme seu e-mail de novo</h1>
        <p className="text-base text-cool-gray">
          A confirmação vale por 2 horas e expirou. O que você preencheu ficou salvo neste aparelho, inclusive o atestado anexado.
        </p>
        <button type="button" className={btnPrimary} onClick={() => router.refresh()}>
          Receber novo código
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col">
      <div ref={topRef} className="flex scroll-mt-2 flex-col gap-4 px-4 pt-2 pb-5">
        <div className="flex flex-col gap-1">
          <p className="text-base leading-snug font-semibold break-words">{athlete.name}</p>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-cool-gray">
            <span>{[athlete.kind === "dupla" ? athlete.teamName : null, athlete.category].filter(Boolean).join(" · ")}</span>
            <span className="inline-flex items-center gap-1 rounded-md bg-success/16 px-1.5 py-0.5 text-xs font-medium text-success-ink">
              <Check className="size-3" />
              E-mail confirmado ({verifiedEmail})
            </span>
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <ol className="grid grid-cols-4 gap-1.5" aria-label="Etapas do check-in">
            {STEPS.map((s, i) => (
              <li key={s} aria-current={i === step ? "step" : undefined} className="h-1.5 overflow-hidden rounded-full bg-muted/16">
                <span className="sr-only">
                  {s}
                  {i < step ? " (concluída)" : ""}
                </span>
                <span
                  aria-hidden="true"
                  className={`block h-full origin-left rounded-full bg-brand transition-transform duration-300 ease-out-expo ${i <= step ? "scale-x-100" : "scale-x-0"}`}
                />
              </li>
            ))}
          </ol>
          <div className="flex items-baseline justify-between gap-3">
            <h2 tabIndex={-1} className="font-display text-[26px] leading-tight font-bold tracking-[-0.5px] outline-none">
              {STEPS[step]}
            </h2>
            <span className="shrink-0 text-sm text-cool-gray tabular-nums">Etapa {step + 1} de 4</span>
          </div>
        </div>
      </div>

      <div ref={bodyRef} key={step} className="flex animate-panel flex-col gap-6 px-4 pb-6">
        {step === 0 && (
          <>
            <div className="flex flex-col gap-4">
              <Field label="Nome completo" error={errors.fullName}>
                {(p) => (
                  <input {...p} className={input} value={draft.fullName} onChange={(e) => set("fullName", e.target.value)} autoComplete="name" autoCapitalize="words" enterKeyHint="next" />
                )}
              </Field>
              <Field label="Data de nascimento" error={errors.birthDate}>
                {(p) => (
                  <input
                    {...p}
                    type="date"
                    className={`${input} min-h-[50px] appearance-none`}
                    value={draft.birthDate}
                    max={today}
                    min="1920-01-01"
                    onChange={(e) => set("birthDate", e.target.value)}
                    autoComplete="bday"
                  />
                )}
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Celular com DDD" error={errors.phone}>
                  {(p) => (
                    <input
                      {...p}
                      type="tel"
                      inputMode="tel"
                      className={input}
                      value={draft.phone}
                      onChange={(e) => set("phone", e.target.value)}
                      onBlur={(e) => set("phone", formatPhone(e.target.value))}
                      autoComplete="tel"
                      placeholder="(83) 99999-0000"
                      enterKeyHint="next"
                    />
                  )}
                </Field>
                <Field label="E-mail" error={errors.email}>
                  {(p) => (
                    <input
                      {...p}
                      type="email"
                      className={input}
                      value={draft.email}
                      onChange={(e) => set("email", e.target.value)}
                      autoComplete="email"
                      autoCapitalize="none"
                      spellCheck={false}
                      enterKeyHint="next"
                    />
                  )}
                </Field>
              </div>
            </div>

            <fieldset className="flex flex-col gap-4">
              <legend className="mb-1 text-lg font-semibold">Em caso de emergência</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nome do contato" error={errors.emergencyName} hint="Quem avisamos se algo acontecer">
                  {(p) => (
                    <input {...p} className={input} value={draft.emergencyName} onChange={(e) => set("emergencyName", e.target.value)} autoCapitalize="words" enterKeyHint="next" />
                  )}
                </Field>
                <Field label="Telefone do contato" error={errors.emergencyPhone}>
                  {(p) => (
                    <input
                      {...p}
                      type="tel"
                      inputMode="tel"
                      className={input}
                      value={draft.emergencyPhone}
                      onChange={(e) => set("emergencyPhone", e.target.value)}
                      onBlur={(e) => set("emergencyPhone", formatPhone(e.target.value))}
                      placeholder="(83) 99999-0000"
                      enterKeyHint="done"
                    />
                  )}
                </Field>
              </div>
            </fieldset>

            {minor && (
              <fieldset className="flex animate-panel flex-col gap-4 rounded-2xl border border-brand/30 bg-brand-subtle/40 p-4">
                <legend className="sr-only">Responsável legal</legend>
                <div className="flex flex-col gap-1">
                  <p className="text-lg font-semibold">Responsável legal</p>
                  <p className="text-sm text-cool-gray">Participante menor de 18 anos: o pai, a mãe ou o responsável também assina o termo no final.</p>
                </div>
                <Field label="Nome completo do responsável" error={errors.guardianName}>
                  {(p) => <input {...p} className={input} value={draft.guardianName} onChange={(e) => set("guardianName", e.target.value)} autoCapitalize="words" />}
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Parentesco" error={errors.guardianRelation} hint="Ex.: mãe, pai, tutor legal">
                    {(p) => <input {...p} className={input} value={draft.guardianRelation} onChange={(e) => set("guardianRelation", e.target.value)} />}
                  </Field>
                  <Field label="Telefone do responsável" error={errors.guardianPhone}>
                    {(p) => (
                      <input
                        {...p}
                        type="tel"
                        inputMode="tel"
                        className={input}
                        value={draft.guardianPhone}
                        onChange={(e) => set("guardianPhone", e.target.value)}
                        onBlur={(e) => set("guardianPhone", formatPhone(e.target.value))}
                        placeholder="(83) 99999-0000"
                      />
                    )}
                  </Field>
                </div>
              </fieldset>
            )}

            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-2xl bg-muted/8 p-4 text-sm">
              <dt className="text-cool-gray">Competição</dt>
              <dt className="text-cool-gray">Categoria</dt>
              <dd className="font-semibold">{COMPETITION_LABEL[athlete.competition]}</dd>
              <dd className="font-semibold">{athlete.category}</dd>
            </dl>
          </>
        )}

        {step === 1 && (
          <>
            <p className="text-base text-pretty text-cool-gray">{PARQ_INTRO}</p>
            <ol className="flex flex-col gap-3">
              {PARQ_QUESTIONS.map((q, i) => {
                const value = draft.parq[i];
                const error = errors[`parq.${i}`];
                return (
                  <li key={i}>
                    <fieldset
                      className={`flex flex-col gap-3 rounded-2xl border p-4 transition-colors duration-150 ${
                        error ? "border-danger/60 bg-danger/4" : value ? "border-line" : "border-line"
                      }`}
                    >
                      <legend className="sr-only">
                        Pergunta {i + 1}: {q}
                      </legend>
                      <p aria-hidden="true" className="flex gap-3 text-[15px] leading-relaxed">
                        <span className="w-5 shrink-0 font-semibold text-cool-gray tabular-nums">{i + 1}</span>
                        <span>{q}</span>
                      </p>
                      <div className="grid grid-cols-2 gap-2 pl-8">
                        {(["sim", "nao"] as const).map((opt, k) => (
                          <label key={opt} className="relative">
                            <input
                              type="radio"
                              name={`parq-${i}`}
                              value={opt}
                              checked={value === opt}
                              onChange={() => setParq(i, opt)}
                              data-invalid={k === 0 && !!error}
                              aria-describedby={error ? `parq-${i}-e` : undefined}
                              className="peer sr-only"
                            />
                            <span
                              className={`flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl border text-base font-medium transition duration-150 active:scale-[0.98] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand ${
                                value === opt
                                  ? "border-brand bg-brand text-white"
                                  : error
                                    ? "border-danger/50 bg-surface text-ink"
                                    : "border-line bg-surface text-ink hover:border-brand-dark"
                              }`}
                            >
                              {value === opt && <Check />}
                              {opt === "sim" ? "Sim" : "Não"}
                            </span>
                          </label>
                        ))}
                      </div>
                      {error && (
                        <span id={`parq-${i}-e`} className="animate-message pl-8 text-xs text-danger-ink">
                          {error}
                        </span>
                      )}
                    </fieldset>
                  </li>
                );
              })}
            </ol>
            <p className="text-sm text-cool-gray" aria-live="polite">
              {answered} de {PARQ_QUESTIONS.length} respondidas
            </p>
            {anyYes && (
              <p className="animate-message rounded-xl bg-brand-subtle px-4 py-3 text-sm text-ink">
                Você respondeu “Sim” a alguma pergunta. O atestado médico de aptidão que você vai anexar na última etapa é indispensável para
                participar.
              </p>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <p className="text-base text-pretty text-cool-gray">
              Termo de responsabilidade do {ev}, categoria {athlete.category}. Leia com atenção: você vai assinar na próxima etapa.
            </p>
            <article className="flex flex-col gap-6 text-[15px] leading-relaxed text-ink">
              {termsSections(athlete.competition).map((section) => (
                <section key={section.title} className="flex flex-col gap-2.5">
                  <h3 className="text-lg font-semibold">{section.title}</h3>
                  {section.articles.map((a) => (
                    <p key={a.n} className="text-pretty">
                      <strong className="font-semibold">Art. {a.n}</strong> {a.text}
                    </p>
                  ))}
                  {section.title === "Uso de imagem e voz" && (
                    <Checkbox checked={draft.imageConsent} onChange={(v) => set("imageConsent", v)}>
                      <strong className="font-semibold">Li e autorizo</strong> {IMAGE_CONSENT_TEXT.replace(/^Li e autorizo /, "")}
                    </Checkbox>
                  )}
                </section>
              ))}
            </article>
          </>
        )}

        {step === 3 && (
          <>
            <section className="flex flex-col gap-3" aria-labelledby="atestado">
              <div className="flex flex-col gap-1">
                <h3 id="atestado" className="text-lg font-semibold">
                  Atestado médico
                </h3>
                <p className="text-sm text-cool-gray">{MEDICAL_CERTIFICATE_NOTE}</p>
              </div>
              <CertificateUpload
                value={certificate}
                onChange={(c) => {
                  setCertificate(c);
                  setErrors((e) => ({ ...e, certificate: undefined }));
                }}
                prepare={(file) => prepareCertificateUpload(athlete.id, file)}
                apiKey={storageKey}
                onSessionExpired={() => setSessionExpired(true)}
                error={errors.certificate}
              />
            </section>

            <section className="flex flex-col gap-4 border-t border-line pt-6" aria-labelledby="assinatura">
              <h3 id="assinatura" className="text-lg font-semibold">
                Declaração e assinatura
              </h3>
              <Field label="Local" error={errors.place} hint={`Data: ${today.split("-").reverse().join("/")} (registrada automaticamente)`}>
                {(p) => (
                  <input
                    {...p}
                    className={input}
                    value={draft.place}
                    onChange={(e) => set("place", e.target.value)}
                    placeholder="Cidade – UF"
                    autoComplete="address-level2"
                    autoCapitalize="words"
                    enterKeyHint="done"
                  />
                )}
              </Field>
              <Checkbox checked={draft.agree} onChange={(v) => set("agree", v)} invalid={!!errors.agree}>
                {FINAL_DECLARATION}
              </Checkbox>
              {errors.agree && <span className="-mt-2 animate-message text-xs text-danger-ink">{errors.agree}</span>}
              <SignaturePad
                label="Assinatura do participante"
                signer={draft.fullName || athlete.name}
                value={signature?.strokes ?? null}
                error={errors.signature}
                onChange={(strokes, dataUrl) => {
                  setSignature(strokes && dataUrl ? { strokes, dataUrl } : null);
                  if (dataUrl) setErrors((e) => ({ ...e, signature: undefined }));
                }}
              />
              {minor && (
                <SignaturePad
                  label="Assinatura do responsável legal"
                  signer={draft.guardianName || "Responsável legal"}
                  value={guardianSignature?.strokes ?? null}
                  error={errors.guardianSignature}
                  onChange={(strokes, dataUrl) => {
                    setGuardianSignature(strokes && dataUrl ? { strokes, dataUrl } : null);
                    if (dataUrl) setErrors((e) => ({ ...e, guardianSignature: undefined }));
                  }}
                />
              )}
              <p className="text-xs leading-relaxed text-cool-gray">{SIGNATURE_NOTE}</p>
            </section>
          </>
        )}
      </div>

      <div className="sticky bottom-0 z-10 mt-auto border-t border-line bg-surface px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex flex-col gap-2">
          {message && <FormMessage tone="error">{message}</FormMessage>}
          <div className="flex gap-2">
            {step > 0 && (
              <button type="button" className={`${btnOutline} px-5`} onClick={() => goTo((step - 1) as StepIndex)} disabled={submitting}>
                Voltar
              </button>
            )}
            <button type="button" className={`${btnPrimary} flex-1`} onClick={next} disabled={submitting}>
              {step === 3 ? (
                submitting ? (
                  "Enviando…"
                ) : (
                  <>
                    Assinar e confirmar<span className="max-[400px]:hidden">&nbsp;check-in</span>
                  </>
                )
              ) : step === 2 ? (
                "Li o termo, continuar"
              ) : (
                "Continuar"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
