import Link from "next/link";
import type { SessionRegistration } from "@/lib/checkin/service";
import { COMPETITION_LABEL } from "@/lib/checkin/terms";
import { textLink } from "@/components/ui/styles";
import { leaveSession } from "./actions";

function Chevron() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5 shrink-0 transition duration-200 ease-out-expo group-hover:translate-x-0.5">
      <path d="M7.5 4.5 13 10l-5.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Depois do código: os atletas das inscrições deste e-mail. */
export function AthletePicker({ registrations, maskedEmail }: { registrations: SessionRegistration[]; maskedEmail: string }) {
  const pending = registrations.flatMap((r) => r.athletes).filter((a) => !a.confirmed).length;

  return (
    <section aria-labelledby="escolher" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="escolher" className="text-[22px] leading-tight font-semibold">
          {pending ? "Quem vai fazer o check-in?" : "Check-in completo"}
        </h2>
        <p className="text-base text-pretty text-cool-gray">
          {pending
            ? "Inscrição confirmada. Cada atleta assina o próprio termo e anexa o próprio atestado."
            : "Todos os atletas deste e-mail já fizeram o check-in. Nos vemos no evento!"}
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        {registrations.map((r) => {
          const done = r.athletes.filter((a) => a.confirmed).length;
          return (
            <li key={r.id} className="overflow-hidden rounded-2xl border border-line bg-surface shadow-whisper">
              <div className="flex items-start justify-between gap-3 border-b border-line bg-muted/8 px-4 py-2.5">
                <div className="min-w-0">
                  <h3 className="text-[15px] leading-snug font-semibold break-words">{r.kind === "dupla" ? r.teamName : r.category}</h3>
                  <p className="text-xs text-cool-gray">
                    {r.kind === "dupla" ? `${r.category} · ` : ""}
                    {COMPETITION_LABEL[r.competition]}
                  </p>
                </div>
                {r.athletes.length > 1 && (
                  <span className={`mt-0.5 shrink-0 text-xs font-medium tabular-nums ${done === r.athletes.length ? "text-success-ink" : "text-cool-gray"}`}>
                    {done}/{r.athletes.length}
                    <span className="sr-only"> com check-in</span>
                  </span>
                )}
              </div>
              <ul className="divide-y divide-line">
                {r.athletes.map((a) => (
                  <li key={a.id}>
                    <Link
                      href={`/check-in/${a.id}`}
                      className="group flex min-h-14 items-center gap-3 px-4 py-3 transition duration-150 hover:bg-brand-subtle/30 active:bg-brand-subtle/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
                    >
                      <span className="min-w-0 flex-1 text-base leading-snug font-medium break-words">{a.name}</span>
                      {a.confirmed ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-success/16 px-2 py-1 text-xs font-medium text-success-ink">
                          <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5">
                            <path d="M3.5 8.5 6.5 11.5 12.5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          Confirmado
                        </span>
                      ) : (
                        <span className="inline-flex shrink-0 items-center gap-0.5 text-sm font-semibold text-brand-dark">
                          <span className="max-[360px]:sr-only">Fazer check-in</span>
                          <Chevron />
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>

      <form action={leaveSession} className="flex flex-wrap items-center justify-center gap-x-1 text-center text-sm text-cool-gray">
        <span>Confirmado como {maskedEmail}.</span>
        <button type="submit" className={textLink}>
          Usar outro e-mail
        </button>
      </form>
    </section>
  );
}
