import Image from "next/image";
import Link from "next/link";
import { Countdown } from "@/components/Countdown";
import { LinkButton } from "@/components/LinkButton";
import { event, links, ticketsHref } from "@/config/event";

/** Atraso de cada peça do hero, depois que o escudo entra em foco. */
const step = (i: number) => ({ animationDelay: `${120 + i * 60}ms` });

export default function Home() {
  const details = [event.dateLabel, event.venue].filter(Boolean);

  return (
    <main className="flex flex-1 flex-col">
      <section className="border-b border-line bg-gradient-to-b from-brand-subtle/50 to-surface">
        <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 px-4 pb-8 pt-8 text-center sm:gap-5 sm:pb-10 sm:pt-12">
          <Image
            src="/logo-hibrido-games.png"
            alt={`Logo ${event.name} ${event.year}`}
            width={148}
            height={166}
            priority
            className="h-auto w-28 animate-shield sm:w-[148px]"
          />
          <span
            style={step(0)}
            className="inline-flex animate-rise items-center gap-1.5 rounded-md bg-success/16 px-2 py-0.5 text-xs font-medium text-success-ink"
          >
            <span aria-hidden="true" className="size-1.5 rounded-full bg-success" />
            Canal oficial de ingressos
          </span>
          <div style={step(1)} className="flex animate-rise flex-col gap-2">
            <h1 className="font-display text-balance text-[2rem] font-bold leading-[1.17] tracking-[-1px] sm:text-5xl">
              {event.name} {event.year}
            </h1>
            <p className="text-pretty text-base text-cool-gray">
              {event.tagline} · {event.endorsement}
            </p>
            {details.length > 0 && (
              <p className="text-base font-medium">{details.join(" · ")}</p>
            )}
          </div>

          {event.startsAt && (
            <div style={step(2)} className="flex w-full animate-rise justify-center">
              <Countdown target={event.startsAt} />
            </div>
          )}

          <Link
            href={ticketsHref}
            style={step(3)}
            className="flex min-h-12 w-full max-w-md animate-rise items-center justify-center rounded-xl bg-brand px-4 py-[13px] text-base font-semibold text-white transition duration-150 hover:bg-brand-dark active:scale-[0.98] active:bg-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Comprar ingresso
          </Link>
        </div>
      </section>

      <section className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-8">
        <h2 className="font-display text-[22px] font-semibold leading-tight">
          Links oficiais
        </h2>
        <nav aria-label="Links do evento" className="flex flex-col gap-3">
          {links.map((link) => (
            <LinkButton key={link.label} {...link} />
          ))}
        </nav>
      </section>

      <footer className="mt-auto border-t border-line pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center text-xs text-muted">
        © {event.year} {event.name} · {event.endorsement}
      </footer>
    </main>
  );
}
