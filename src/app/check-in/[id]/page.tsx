import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { PublicHeader } from "@/components/PublicHeader";
import { CHECKIN_COOKIE, isUuid, readSessionCookie } from "@/lib/checkin/code";
import { maskEmail } from "@/lib/checkin/form";
import { getAthlete, getSession } from "@/lib/checkin/service";
import { COMPETITION_LABEL } from "@/lib/checkin/terms";
import { supabasePublishableKey } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { prepareCertificateUpload, sendCheckin } from "./actions";
import { CheckinWizard } from "./CheckinWizard";

export const metadata: Metadata = { title: "Check-in do atleta", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AthleteCheckinPage({ params, searchParams }: PageProps<"/check-in/[id]">) {
  const { id } = await params;
  const { ok } = await searchParams;
  if (!isUuid(id)) notFound();
  const athlete = await getAthlete(id);
  if (!athlete) notFound();

  const store = await cookies();
  const session = await getSession(athlete, readSessionCookie(store.get(CHECKIN_COOKIE)?.value));
  // Sem a confirmação do e-mail da inscrição, o check-in começa em /check-in (Story 4.3).
  if (!athlete.signedAt && !session) redirect("/check-in");

  return (
    <>
      <PublicHeader />
      <main className="flex flex-1 flex-col">
        <div className="mx-auto w-full max-w-xl px-4 pt-4">
          <Link
            href="/check-in"
            className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-medium text-cool-gray transition duration-150 hover:text-ink focus-visible:outline-2 focus-visible:outline-brand"
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4">
              <path d="M12.5 4.5 7 10l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {session ? "Atletas da inscrição" : "Check-in"}
          </Link>
        </div>

        {athlete.signedAt ? (
          <Confirmed
            name={athlete.name}
            competition={COMPETITION_LABEL[athlete.competition]}
            signedAt={athlete.signedAt}
            justNow={ok === "1"}
            partners={athlete.partners}
          />
        ) : session ? (
          <CheckinWizard
            athlete={{
              id: athlete.id,
              name: athlete.name,
              teamName: athlete.teamName,
              kind: athlete.kind,
              category: athlete.category,
              competition: athlete.competition,
              // Dados da inscrição só ajudam quem a fez (responsável ou individual).
              prefillEmail: athlete.position === 1 ? athlete.registrationEmail : "",
              prefillPhone: athlete.position === 1 ? (athlete.registrationPhone ?? "") : "",
            }}
            badge={`E-mail confirmado (${maskEmail(session.email)})`}
            storageKey={supabasePublishableKey()}
            draftKey={`hg-checkin:${athlete.id}`}
            successHref={`/check-in/${athlete.id}?ok=1`}
            prepare={prepareCertificateUpload}
            send={sendCheckin}
          />
        ) : null}
      </main>
    </>
  );
}

function Confirmed({
  name,
  competition,
  signedAt,
  justNow,
  partners,
}: {
  name: string;
  competition: string;
  signedAt: string;
  justNow: boolean;
  partners: { id: string; name: string; confirmed: boolean }[];
}) {
  const first = name.split(" ")[0];
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 pt-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <div className="flex flex-col items-start gap-4">
        <span className={`flex size-16 items-center justify-center rounded-full bg-success text-white ${justNow ? "animate-pop" : ""}`}>
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-8">
            <path
              d="M5 12.5 10 17.5 19 7.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              strokeDasharray={1}
              className={justNow ? "animate-draw" : ""}
            />
          </svg>
        </span>
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-[28px] leading-[1.2] font-bold tracking-[-0.5px]">
            {justNow ? `Pronto, ${first}! Check-in confirmado.` : "Check-in confirmado"}
          </h1>
          <p className="text-base text-cool-gray">
            {name} está com presença confirmada no {competition}. Termo assinado e atestado recebidos em {formatDateTime(signedAt)}.
          </p>
        </div>
      </div>

      {partners.length > 0 && (
        <ul className="flex flex-col gap-2">
          {partners.map((p) =>
            p.confirmed ? (
              <li key={p.id} className="flex items-center gap-3 rounded-xl bg-success/8 px-4 py-3 text-sm text-success-ink">
                <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4 shrink-0">
                  <path d="M3.5 8.5 6.5 11.5 12.5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {p.name} também já fez o check-in. A dupla está completa.
              </li>
            ) : (
              <li key={p.id}>
                <Link
                  href={`/check-in/${p.id}`}
                  className="group flex items-center gap-3 rounded-xl border border-line px-4 py-3 transition duration-150 hover:border-brand-dark active:bg-brand-subtle/40 focus-visible:outline-2 focus-visible:outline-brand"
                >
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block font-semibold">Falta {p.name}</span>
                    <span className="text-cool-gray">Cada integrante assina o próprio termo e anexa o próprio atestado.</span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-brand-dark">Fazer check-in</span>
                </Link>
              </li>
            ),
          )}
        </ul>
      )}

      <p className="text-sm text-cool-gray">
        Precisa corrigir algo no termo ou trocar o atestado? Fale com a organização do evento.
      </p>
      <Link
        href="/check-in"
        className="inline-flex min-h-12 items-center justify-center rounded-xl border border-brand-dark px-4 text-base font-medium text-brand-dark transition duration-150 hover:bg-brand-subtle active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        Voltar ao check-in
      </Link>
    </div>
  );
}
