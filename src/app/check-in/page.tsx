import type { Metadata } from "next";
import { cookies } from "next/headers";
import { AutoRefresh } from "@/components/AutoRefresh";
import { PublicHeader } from "@/components/PublicHeader";
import { event } from "@/config/event";
import { CHECKIN_COOKIE, readSessionCookie } from "@/lib/checkin/code";
import { maskEmail } from "@/lib/checkin/form";
import { getEmailSession, getProgress, listSessionAthletes } from "@/lib/checkin/service";
import { AthletePicker } from "./AthletePicker";
import { CheckinProgress } from "./CheckinProgress";
import { EmailStep } from "./EmailStep";

export const metadata: Metadata = {
  title: `Check-in do atleta — ${event.name} ${event.year}`,
  description: "Confirme pelo e-mail da inscrição, responda o PAR-Q, assine o termo e anexe o atestado médico.",
};
export const dynamic = "force-dynamic";

export default async function CheckinPage() {
  const progress = await getProgress().catch((error) => {
    console.error("Error loading check-in progress:", error);
    return "error" as const;
  });

  const store = await cookies();
  const session = await getEmailSession(readSessionCookie(store.get(CHECKIN_COOKIE)?.value)).catch((error) => {
    console.error("Error loading check-in session:", error);
    return null;
  });
  const registrations = session
    ? await listSessionAthletes(session.email).catch((error) => {
        console.error("Error loading session athletes:", error);
        return null;
      })
    : null;

  const open = progress !== "unavailable" && progress !== "error" && progress.total > 0;

  return (
    <>
      <PublicHeader />
      <main className="flex flex-1 flex-col pb-[max(2rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 pt-6 sm:pt-10">
          <div className="flex flex-col gap-2">
            <h1 className="font-display text-[28px] leading-[1.2] font-bold tracking-[-0.5px] sm:text-4xl">Check-in do atleta</h1>
            <p className="text-base text-pretty text-cool-gray">
              Confirme pelo e-mail da inscrição, responda o PAR-Q, assine o termo e anexe o atestado médico. Leva uns 5 minutos.
            </p>
          </div>

          {progress === "error" ? (
            <p className="rounded-2xl border border-line bg-muted/8 p-5 text-base text-cool-gray">
              O check-in não carregou. Atualize a página em instantes.
            </p>
          ) : !open ? (
            <p className="rounded-2xl border border-line bg-muted/8 p-5 text-base text-cool-gray">
              O check-in abre assim que a lista de atletas inscritos for publicada. Volte mais tarde.
            </p>
          ) : (
            <>
              <CheckinProgress progress={progress} />
              {session && registrations?.length ? (
                <AthletePicker registrations={registrations} maskedEmail={maskEmail(session.email)} />
              ) : (
                <EmailStep
                  notice={
                    session && registrations && !registrations.length
                      ? "Não há mais inscrição ativa com o e-mail confirmado. Confira o e-mail e tente de novo."
                      : undefined
                  }
                />
              )}
              <AutoRefresh seconds={60} />
            </>
          )}
        </div>
      </main>
    </>
  );
}
