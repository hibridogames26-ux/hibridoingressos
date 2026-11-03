import Image from "next/image";
import { Countdown } from "@/components/Countdown";
import { HeroMedia } from "@/components/HeroMedia";
import { LinkButton } from "@/components/LinkButton";
import { SponsorsBand } from "@/components/SponsorsBand";
import { event, links } from "@/config/event";

/** Atraso de cada peça do hero, depois que o escudo entra em foco. */
const step = (i: number) => ({ animationDelay: `${120 + i * 60}ms` });

export default function Home() {
  const details = [event.dateLabel, event.venue].filter(Boolean);

  return (
    <main className="flex flex-1 flex-col">
      <section className="relative isolate overflow-hidden bg-ink text-white">
        {/* Vídeo de abertura que assenta na arte oficial do evento; a parte de baixo escurece para o texto ficar legível. */}
        <HeroMedia />
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-gradient-to-b from-ink/10 via-ink/30 to-ink/95"
        />
        <div className="mx-auto flex min-h-[30rem] w-full max-w-xl flex-col items-center justify-end gap-4 px-4 pb-8 pt-16 text-center sm:min-h-[36rem] sm:gap-5 sm:pb-10">
          <Image
            src="/logo-hibrido-games.png"
            alt={`Logo ${event.name} ${event.year}`}
            width={148}
            height={166}
            priority
            className="h-auto w-24 animate-shield drop-shadow-lg sm:w-32"
          />
          <span
            style={step(0)}
            className="inline-flex animate-rise items-center gap-1.5 rounded-md bg-white/15 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-sm"
          >
            <span aria-hidden="true" className="size-1.5 rounded-full bg-success" />
            Canal oficial do evento
          </span>
          <div style={step(1)} className="flex animate-rise flex-col gap-2">
            <h1 className="font-display text-balance text-[2rem] font-bold leading-[1.17] tracking-[-1px] sm:text-5xl">
              {event.name} {event.year}
            </h1>
            <p className="text-pretty text-base text-white/80">
              {event.tagline} · {event.endorsement}
            </p>
            {details.length > 0 && (
              <p className="text-base font-medium">{details.join(" · ")}</p>
            )}
          </div>

          {event.startsAt && (
            <div
              style={step(2)}
              className="flex w-full max-w-md animate-rise justify-center rounded-2xl bg-surface p-2 text-ink"
            >
              <Countdown target={event.startsAt} />
            </div>
          )}
        </div>
      </section>

      <SponsorsBand />

      <section className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-8">
        <h2 className="font-display text-[22px] font-semibold leading-tight">
          Links oficiais
        </h2>
        <nav aria-label="Links do evento" className="flex flex-col gap-3">
          {links.map((link, i) => (
            <div key={link.label} style={step(3 + i)} className="animate-rise">
              <LinkButton {...link} />
            </div>
          ))}
        </nav>
      </section>

      <footer className="mt-auto border-t border-line pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center text-xs text-muted">
        © {event.year} {event.name} · {event.endorsement}
      </footer>
    </main>
  );
}
