import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { event } from "@/config/event";

export const metadata: Metadata = { title: "Ingressos — Híbrido Games 2026" };

export default function Ingressos() {
  return (
    <main className="flex flex-1 flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-brand"
          >
            <Image
              src="/logo-hibrido-games.png"
              alt=""
              width={28}
              height={31}
            />
            <span className="text-sm font-semibold">
              {event.name} {event.year}
            </span>
          </Link>
        </div>
      </header>

      <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
        <nav aria-label="Navegação" className="text-sm text-muted">
          <Link href="/" className="hover:text-brand">
            Início
          </Link>{" "}
          <span aria-hidden="true">›</span>{" "}
          <span className="text-ink">Ingressos</span>
        </nav>

        <h1 className="font-display text-4xl font-bold leading-[1.22] tracking-[-0.5px]">
          Ingressos
        </h1>

        <div className="flex flex-col items-center gap-4 rounded-2xl border border-line bg-surface px-6 py-12 text-center shadow-whisper">
          <span className="rounded-lg bg-cool-gray/12 px-2 py-0.5 text-xs font-medium text-[#484b5e]">
            Em breve
          </span>
          <h2 className="font-display text-[22px] font-semibold leading-tight">
            A venda oficial abre em breve
          </h2>
          <p className="max-w-sm text-base text-cool-gray">
            Os ingressos serão vendidos somente por este canal. Volte aqui
            para garantir o seu.
          </p>
          <Link
            href="/"
            className="rounded-xl border border-brand-dark px-4 py-[13px] text-base font-medium text-brand-dark transition hover:bg-brand-subtle"
          >
            Voltar ao início
          </Link>
        </div>
      </section>
    </main>
  );
}
