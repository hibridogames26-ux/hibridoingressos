"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { SHIRT_PHOTOS, SHIRT_PHOTO_SIZE } from "@/config/shirts";

/** Galeria frente/costas com miniaturas e ampliação em diálogo modal (teclado, Esc e retorno de foco). */
export function ShirtGallery() {
  const [index, setIndex] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const photo = SHIRT_PHOTOS[index];

  // Trava a rolagem da página enquanto o diálogo está aberto.
  useEffect(() => {
    if (!zoomed) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [zoomed]);

  // Esc dispara "cancel" na hora; "close" chega depois. Os dois levam ao mesmo fechamento,
  // que também devolve o foco a quem abriu o diálogo.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const finish = () => {
      setZoomed(false);
      openerRef.current?.focus();
    };
    dialog.addEventListener("cancel", finish);
    dialog.addEventListener("close", finish);
    return () => {
      dialog.removeEventListener("cancel", finish);
      dialog.removeEventListener("close", finish);
    };
  }, []);

  const closeZoom = () => {
    dialogRef.current?.close();
    setZoomed(false);
    openerRef.current?.focus();
  };

  const openZoom = (opener: HTMLElement) => {
    openerRef.current = opener;
    setZoomed(true);
    dialogRef.current?.showModal();
  };

  const step = (delta: 1 | -1) => setIndex((i) => (i + delta + SHIRT_PHOTOS.length) % SHIRT_PHOTOS.length);

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={(e) => openZoom(e.currentTarget)}
        aria-label={`Ampliar foto: ${photo.label}`}
        className="group relative block w-full overflow-hidden rounded-2xl border border-line bg-muted/8 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <Image
          key={photo.key}
          src={photo.src}
          alt={photo.alt}
          width={SHIRT_PHOTO_SIZE.width}
          height={SHIRT_PHOTO_SIZE.height}
          priority
          sizes="(min-width: 1024px) 520px, (min-width: 640px) 448px, 100vw"
          className="mx-auto h-auto w-full max-w-md animate-fade"
        />
        <span
          aria-hidden="true"
          className="absolute bottom-3 right-3 rounded-lg bg-surface/95 px-2.5 py-1 text-xs font-medium text-ink shadow-micro transition duration-150 group-hover:text-brand"
        >
          Ampliar
        </span>
      </button>

      <div role="group" aria-label="Fotos da camisa" className="flex gap-3">
        {SHIRT_PHOTOS.map((p, i) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setIndex(i)}
            aria-pressed={i === index}
            aria-label={`Ver ${p.label.toLowerCase()}`}
            className={`relative w-[72px] overflow-hidden rounded-xl border-2 bg-muted/8 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
              i === index ? "border-brand-dark" : "border-line hover:border-muted"
            }`}
          >
            <Image src={p.src} alt="" width={SHIRT_PHOTO_SIZE.width} height={SHIRT_PHOTO_SIZE.height} sizes="72px" className="h-auto w-full" />
          </button>
        ))}
      </div>

      <dialog
        ref={dialogRef}
        aria-label={`Foto ampliada: ${photo.label}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) closeZoom();
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") step(1);
          if (e.key === "ArrowLeft") step(-1);
        }}
        className="m-auto max-h-dvh w-[min(100vw,46rem)] overflow-hidden bg-surface p-0 text-ink backdrop:bg-ink/70 sm:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2">
          <span className="text-sm font-medium" aria-live="polite">
            {photo.label} · {index + 1} de {SHIRT_PHOTOS.length}
          </span>
          <button
            type="button"
            onClick={closeZoom}
            className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-medium text-brand-dark hover:bg-brand-subtle focus-visible:outline-2 focus-visible:outline-brand"
          >
            Fechar
          </button>
        </div>
        <div className="relative h-[min(72dvh,44rem)] bg-muted/8">
          {zoomed && (
            <Image
              key={photo.key}
              src={photo.src}
              alt={photo.alt}
              fill
              loading="eager"
              sizes="(min-width: 768px) 1122px, 200vw"
              className="animate-fade object-contain"
            />
          )}
        </div>
        <div className="flex justify-center gap-2 border-t border-line p-3">
          {SHIRT_PHOTOS.map((p, i) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setIndex(i)}
              aria-pressed={i === index}
              className={`min-h-11 rounded-xl border px-4 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                i === index ? "border-brand-dark bg-brand-subtle text-brand-dark" : "border-line hover:border-muted"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </dialog>
    </div>
  );
}
