import Image from "next/image";
import Link from "next/link";
import { Countdown } from "@/components/Countdown";
import { LinkButton } from "@/components/LinkButton";
import { event, links, ticketsHref } from "@/config/event";

export default function Home() {
  const details = [event.dateLabel, event.venue].filter(Boolean);

  return (
    <main className="flex flex-1 flex-col">
      <section className="border-b border-line bg-gradient-to-b from-brand-subtle/50 to-surface">
        <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-5 px-4 pb-10 pt-12 text-center">
          <Image
            src="/logo-hibrido-games.png"
            alt={`Logo ${event.name} ${event.year}`}
            width={148}
            height={166}
            priority
          />
          <span className="inline-flex items-center gap-1.5 rounded-md bg-success/16 px-2 py-0.5 text-xs font-medium text-success-ink">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-success" />
            Canal oficial de ingressos
          </span>
          <div className="flex flex-col gap-2">
            <h1 className="font-display text-balance text-4xl font-bold leading-[1.17] tracking-[-1px] sm:text-5xl">
              {event.name} {event.year}
            </h1>
            <p className="text-base text-cool-gray">
              {event.tagline} · {event.endorsement}
            </p>
            {details.length > 0 && (
              <p className="text-base font-medium">{details.join(" · ")}</p>
            )}
          </div>

          {event.startsAt && <Countdown target={event.startsAt} />}

          <Link
            href={ticketsHref}
            className="flex w-full max-w-md items-center justify-center rounded-xl bg-brand px-4 py-[13px] text-base font-semibold text-white transition hover:bg-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
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

      <footer className="mt-auto border-t border-line py-6 text-center text-xs text-muted">
        © {event.year} {event.name} · {event.endorsement}
      </footer>
    </main>
  );
}
