"use client";

import Image from "next/image";
import { useState, type CSSProperties } from "react";
import { sponsors } from "@/config/sponsors";

/**
 * Faixa contínua de apoiadores, logo abaixo do hero.
 * - Fundo escuro igual ao do hero: logos claras sobre transparente.
 * - Passa da direita para a esquerda em loop (duas cópias da lista, -50% fecha o ciclo).
 * - Para com o mouse por cima e pelo botão de pausa (44 px).
 * - Movimento reduzido: sem animação, as logos ficam paradas e centralizadas em linhas.
 * Escala: --u multiplica a largura de cada logo; a partir de `sm` as logos crescem 35%.
 */
function Logos({ hidden = false }: { hidden?: boolean }) {
  return (
    <div
      aria-hidden={hidden || undefined}
      className={`flex shrink-0 items-center gap-(--gap) pr-(--gap) motion-reduce:w-full motion-reduce:shrink motion-reduce:flex-wrap motion-reduce:justify-center motion-reduce:gap-y-5 motion-reduce:px-4 motion-reduce:pt-1.5 ${hidden ? "motion-reduce:hidden" : ""}`}
    >
      {sponsors.map((s) => {
        const bounds = s.visibleBounds ?? { x: 0, y: 0, width: s.width, height: s.height };
        const imageWidth = s.displayWidth * s.width / bounds.width;

        return (
          <div
            key={s.src}
            style={{ "--w": s.displayWidth, aspectRatio: `${bounds.width} / ${bounds.height}` } as CSSProperties}
            className="relative w-[calc(var(--w)*var(--u)*1px)] shrink-0 overflow-hidden"
          >
            <Image
              src={s.src}
              alt={hidden ? "" : s.name}
              width={s.width}
              height={s.height}
              sizes={`(min-width: 640px) ${Math.ceil(imageWidth * 1.35)}px, ${Math.ceil(imageWidth)}px`}
              style={{
                width: `${s.width / bounds.width * 100}%`,
                left: `${-bounds.x / bounds.width * 100}%`,
                top: `${-bounds.y / bounds.height * 100}%`,
              }}
              className="absolute h-auto max-w-none select-none"
            />
          </div>
        );
      })}
    </div>
  );
}

export function SponsorsBand() {
  const [paused, setPaused] = useState(false);

  return (
    <section
      aria-labelledby="apoiadores-titulo"
      className="group border-t border-white/15 bg-ink pt-2.5 pb-[18px] text-white [--gap:44px] [--u:1] sm:[--gap:64px] sm:[--u:1.35]"
    >
      <div className="mx-auto flex min-h-11 w-full max-w-xl items-center justify-between gap-3 px-4">
        <h2 id="apoiadores-titulo" className="text-[13px] font-semibold leading-tight tracking-[0.01em] text-white/72">
          Apoiadores
        </h2>
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-label={paused ? "Retomar movimento das logos" : "Pausar movimento das logos"}
          className="grid size-11 shrink-0 place-items-center rounded-xl border border-white/15 text-white transition duration-150 hover:bg-white/10 active:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:hidden"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="size-5 fill-none stroke-current stroke-2 [stroke-linecap:round] [stroke-linejoin:round]"
          >
            {paused ? <path d="M8 5.5v13l11-6.5z" /> : <path d="M9 5v14M15 5v14" />}
          </svg>
        </button>
      </div>

      <div className="sponsors-fade mt-1.5 overflow-hidden">
        <div
          data-paused={paused}
          style={{ animationDuration: "calc(44s * var(--u))" }}
          className="flex w-max animate-marquee group-hover:[animation-play-state:paused] data-[paused=true]:[animation-play-state:paused] motion-reduce:w-full motion-reduce:animate-none"
        >
          <Logos />
          <Logos hidden />
        </div>
      </div>
    </section>
  );
}
