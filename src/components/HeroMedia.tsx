"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/** Vídeo curto da abertura: toca uma vez por sessão e assenta na arte oficial (a imagem). */
const VIDEO = { wide: "/videos/hero-1280.mp4", narrow: "/videos/hero-854.mp4" };
const PLAYED_KEY = "hg-hero-played";
/** Se o vídeo não estiver pronto até aqui, a imagem segue sozinha: nada de entrada atrasada. */
const READY_TIMEOUT_MS = 3500;
const FADE_IN_MS = 300;
const FADE_OUT_MS = 700;

type Phase = "off" | "loading" | "playing" | "leaving";

type NetworkInformation = { saveData?: boolean; effectiveType?: string };

const noop = () => () => {};

/** Fonte do vídeo para este aparelho, ou null se for melhor ficar só com a imagem. */
function chooseSource(): string | null {
  if (!canPlay()) return null;
  return window.matchMedia("(max-width: 767px)").matches
    ? VIDEO.narrow
    : VIDEO.wide;
}

/** Só toca se a pessoa aceita movimento, não economiza dados e ainda não viu nesta sessão. */
function canPlay() {
  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      return false;
    const connection = (
      navigator as Navigator & { connection?: NetworkInformation }
    ).connection;
    if (
      connection?.saveData ||
      connection?.effectiveType === "slow-2g" ||
      connection?.effectiveType === "2g"
    )
      return false;
    if (sessionStorage.getItem(PLAYED_KEY)) return false;
  } catch {
    // Sem acesso ao armazenamento ou às preferências: segue com a imagem.
    return false;
  }
  return true;
}

/**
 * Fundo do hero. A imagem fica sempre embaixo e aparece primeiro; o vídeo entra por cima quando
 * consegue tocar e sai com um fade no fim. Se falhar, a página fica como era: só a imagem.
 */
export function HeroMedia({ className = "" }: { className?: string }) {
  // No servidor e na hidratação só a imagem; o vídeo é decidido no aparelho, depois disso.
  const hydrated = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  return (
    <>
      <Image
        src="/images/hero-podio.webp"
        alt=""
        fill
        priority
        sizes="100vw"
        className={`-z-20 object-cover object-[50%_20%] ${className}`}
      />
      {hydrated && <HeroVideo />}
    </>
  );
}

function HeroVideo() {
  const [src] = useState(chooseSource);
  const [phase, setPhase] = useState<Phase>(src ? "loading" : "off");
  const videoRef = useRef<HTMLVideoElement>(null);

  // Vídeo que não ficou pronto a tempo é descartado.
  useEffect(() => {
    if (phase !== "loading") return;
    const timer = window.setTimeout(() => setPhase("off"), READY_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  // Termina a saída mesmo se o navegador não disparar o fim da transição.
  useEffect(() => {
    if (phase !== "leaving") return;
    const timer = window.setTimeout(() => setPhase("off"), FADE_OUT_MS + 100);
    return () => window.clearTimeout(timer);
  }, [phase]);

  // Aba em segundo plano: pausa e retoma ao voltar.
  useEffect(() => {
    if (phase !== "playing") return;
    const onVisibility = () => {
      const video = videoRef.current;
      if (!video || video.ended) return;
      if (document.hidden) video.pause();
      else void video.play().catch(() => setPhase("off"));
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [phase]);

  const start = () => {
    const video = videoRef.current;
    if (!video || phase !== "loading") return;
    video
      .play()
      .then(() => {
        try {
          sessionStorage.setItem(PLAYED_KEY, "1");
        } catch {
          // Sem armazenamento: o vídeo pode tocar de novo na próxima visita.
        }
        setPhase("playing");
      })
      // Modo de economia de energia ou política do navegador bloqueou: fica a imagem.
      .catch(() => setPhase("off"));
  };

  if (phase === "off" || !src) return null;
  return (
    <video
      ref={videoRef}
      src={src}
      muted
      playsInline
      preload="auto"
      aria-hidden="true"
      tabIndex={-1}
      disablePictureInPicture
      onCanPlay={start}
      onEnded={() => setPhase("leaving")}
      onError={() => setPhase("off")}
      style={{
        transitionDuration: `${phase === "leaving" ? FADE_OUT_MS : FADE_IN_MS}ms`,
      }}
      className={`pointer-events-none absolute inset-0 -z-[15] size-full object-cover object-[50%_20%] transition-opacity ease-out ${
        phase === "playing" ? "opacity-100" : "opacity-0"
      }`}
    />
  );
}
