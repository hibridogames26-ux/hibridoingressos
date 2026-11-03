"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

type Point = { x: number; y: number; p: number };
type Stroke = Point[];

/** Proporção do quadro (largura ÷ altura) e tamanho do PNG exportado. */
const RATIO = 2.6;
const EXPORT_WIDTH = 1200;
const INK = "#101114";

function drawStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[], width: number, height: number, scale: number) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  for (const stroke of strokes) {
    if (!stroke.length) continue;
    const pts = stroke.map((pt) => ({ x: pt.x * width, y: pt.y * height, w: (1.6 + pt.p * 1.8) * scale }));
    if (pts.length === 1) {
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, pts[0].w / 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    // Curvas pelos pontos médios: traço contínuo e sem quinas.
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const prevMid = i > 1 ? { x: (pts[i - 2].x + a.x) / 2, y: (pts[i - 2].y + a.y) / 2 } : a;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      ctx.beginPath();
      ctx.lineWidth = (a.w + b.w) / 2;
      ctx.moveTo(prevMid.x, prevMid.y);
      ctx.quadraticCurveTo(a.x, a.y, mid.x, mid.y);
      if (i === pts.length - 1) ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
}

/** Comprimento total, em proporção da largura: rabiscos minúsculos não contam como assinatura. */
const inkLength = (strokes: Stroke[]) =>
  strokes.reduce((sum, s) => sum + s.slice(1).reduce((acc, pt, i) => acc + Math.hypot(pt.x - s[i].x, (pt.y - s[i].y) / RATIO), 0), 0);

export function exportSignature(strokes: Stroke[]) {
  const canvas = document.createElement("canvas");
  canvas.width = EXPORT_WIDTH;
  canvas.height = Math.round(EXPORT_WIDTH / RATIO);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawStrokes(ctx, strokes, canvas.width, canvas.height, EXPORT_WIDTH / 360);
  return canvas.toDataURL("image/png");
}

export function SignaturePad({
  label,
  signer,
  value,
  onChange,
  error,
}: {
  label: string;
  /** Nome exibido sob a linha, como num papel assinado. */
  signer: string;
  /** Traços salvos (rascunho); null = vazio. */
  value: Stroke[] | null;
  onChange: (strokes: Stroke[] | null, dataUrl: string | null) => void;
  error?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const strokes = useRef<Stroke[]>(value ?? []);
  const drawing = useRef<number | null>(null);
  const [hasInk, setHasInk] = useState(!!value?.length);
  const id = useId();

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const box = boxRef.current;
    if (!canvas || !box) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const { width, height } = box.getBoundingClientRect();
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    drawStrokes(ctx, strokes.current, width, height, Math.max(1, width / 360));
  }, []);

  // Girar o celular ou redimensionar a janela redesenha a assinatura no novo tamanho.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const observer = new ResizeObserver(() => redraw());
    observer.observe(box);
    return () => observer.disconnect();
  }, [redraw]);

  const pointFrom = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect();
    // Caneta informa pressão; dedo e mouse ficam no meio-termo.
    const pressure = e.pointerType === "pen" && e.pressure > 0 ? e.pressure : 0.5;
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
      p: pressure,
    };
  };

  const finish = () => {
    if (drawing.current === null) return;
    drawing.current = null;
    const ok = inkLength(strokes.current) > 0.25;
    setHasInk(strokes.current.length > 0);
    onChange(ok ? strokes.current.map((s) => [...s]) : null, ok ? exportSignature(strokes.current) : null);
  };

  const clear = () => {
    strokes.current = [];
    setHasInk(false);
    redraw();
    onChange(null, null);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end justify-between gap-3">
        <span id={id} className="text-sm font-medium text-ink">
          {label}
        </span>
        <button
          type="button"
          onClick={clear}
          disabled={!hasInk}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-brand-dark transition duration-150 hover:bg-brand-subtle disabled:text-muted disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-brand pointer-fine:min-h-8"
        >
          <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4">
            <path d="M4 10a6 6 0 1 0 1.8-4.3M4 4v3.5h3.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Limpar
        </button>
      </div>
      <div
        ref={boxRef}
        style={{ aspectRatio: `${RATIO}` }}
        className={`relative w-full overflow-hidden rounded-xl border bg-surface transition-[border-color] duration-150 ${
          error ? "border-danger" : hasInk ? "border-cool-gray/60" : "border-line"
        }`}
      >
        {/* Linha de assinatura e nome, como no papel. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-5 bottom-[26%] flex flex-col items-start gap-1">
          <span className="text-lg leading-none text-muted">×</span>
          <span className="h-px w-full bg-line" />
          <span className="max-w-full truncate text-xs text-cool-gray">{signer}</span>
        </div>
        {!hasInk && (
          <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-[22%] text-center text-sm text-cool-gray">
            Assine aqui com o dedo
          </span>
        )}
        <canvas
          ref={canvasRef}
          role="img"
          aria-labelledby={id}
          aria-describedby={error ? `${id}-error` : undefined}
          className="absolute inset-0 size-full cursor-crosshair touch-none select-none outline-none"
          onPointerDown={(e) => {
            if (e.button !== 0 && e.pointerType === "mouse") return;
            e.currentTarget.setPointerCapture(e.pointerId);
            drawing.current = e.pointerId;
            strokes.current.push([pointFrom(e)]);
            setHasInk(true);
            redraw();
          }}
          onPointerMove={(e) => {
            if (drawing.current !== e.pointerId) return;
            const stroke = strokes.current[strokes.current.length - 1];
            // Eventos agrupados (até 120 Hz no iPhone) deixam o traço mais fiel ao dedo.
            const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
            const rect = e.currentTarget.getBoundingClientRect();
            for (const ev of events) {
              stroke.push({
                x: Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width)),
                y: Math.min(1, Math.max(0, (ev.clientY - rect.top) / rect.height)),
                p: ev.pointerType === "pen" && ev.pressure > 0 ? ev.pressure : 0.5,
              });
            }
            redraw();
          }}
          onPointerUp={finish}
          onPointerCancel={finish}
          onLostPointerCapture={finish}
        />
      </div>
      {error && (
        <span id={`${id}-error`} className="animate-message text-xs text-danger-ink">
          {error}
        </span>
      )}
    </div>
  );
}

export type SignatureStrokes = Stroke[];
