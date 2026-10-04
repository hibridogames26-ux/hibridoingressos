"use client";

import QrScanner from "qr-scanner";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { btnPrimary, input } from "@/components/ui/styles";
import { formatDateTime, formatEventDate } from "@/lib/format";
import type { RedeemResult } from "@/lib/redeem";
import { redeem } from "./actions";

type View =
  | { kind: "scanning" }
  | { kind: "checking" }
  | { kind: "result"; data: RedeemResult };

const SAME_CODE_COOLDOWN_MS = 4000;
const OK_AUTO_RESUME_MS = 2500;

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

function feedback(ok: boolean) {
  navigator.vibrate?.(ok ? 120 : [250, 100, 250]);
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = ok ? 880 : 220;
    gain.gain.value = 0.15;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (ok ? 0.15 : 0.45));
    osc.onended = () => ctx.close();
  } catch {
    // Sem áudio disponível: a vibração e a cor já sinalizam.
  }
}

export function Scanner({ initialCount }: { initialCount: number }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const lastRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const busyRef = useRef(false);

  const [view, setView] = useState<View>({ kind: "scanning" });
  const [count, setCount] = useState(initialCount);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);

  const resume = useCallback(() => {
    busyRef.current = false;
    setView({ kind: "scanning" });
    scannerRef.current?.start().catch(() => undefined);
  }, []);

  const check = useCallback(async (code: string) => {
    const now = Date.now();
    if (busyRef.current) return;
    if (code === lastRef.current.code && now - lastRef.current.at < SAME_CODE_COOLDOWN_MS) return;
    lastRef.current = { code, at: now };
    busyRef.current = true;

    scannerRef.current?.pause();
    setView({ kind: "checking" });

    let data: RedeemResult;
    try {
      data = await redeem(code);
    } catch {
      data = {
        result: "erro",
        message: "Sem conexão com o servidor. A leitura NÃO foi registrada — tente novamente.",
      };
    }

    feedback(data.result === "ok");
    if (data.result === "ok") setCount((c) => c + 1);
    setView({ kind: "result", data });
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const scanner = new QrScanner(video, (r) => void check(r.data), {
      returnDetailedScanResult: true,
      preferredCamera: "environment",
      highlightScanRegion: true,
      maxScansPerSecond: 8,
    });
    scannerRef.current = scanner;
    scanner.start().catch(() =>
      setCameraError("Não foi possível abrir a câmera. Permita o acesso ou digite o código."),
    );

    return () => {
      scanner.destroy();
      scannerRef.current = null;
    };
  }, [check]);

  // Entrada liberada volta sozinha para a câmera; erros exigem toque.
  useEffect(() => {
    if (view.kind !== "result" || view.data.result !== "ok") return;
    const id = setTimeout(resume, OK_AUTO_RESUME_MS);
    return () => clearTimeout(id);
  }, [view, resume]);

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden="true"
            className={`size-2.5 rounded-full transition-colors duration-300 ${online ? "bg-success" : "animate-pulse bg-danger"}`}
          />
          {online ? "Online" : "Sem internet — leituras não serão registradas"}
        </span>
        <span className="text-cool-gray">
          Liberados por você hoje: <strong className="text-ink tabular-nums">{count}</strong>
        </span>
      </div>

      <div className="relative aspect-square max-h-[60svh] w-full overflow-hidden rounded-2xl bg-ink">
        <video ref={videoRef} className="size-full object-cover" muted playsInline />
        {cameraError && (
          <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-white/80">
            {cameraError}
          </p>
        )}
        {view.kind === "checking" && (
          <div className="absolute inset-0 flex animate-fade items-center justify-center bg-ink/70 text-lg font-semibold text-white backdrop-blur-sm">
            Validando…
          </div>
        )}
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (manual.trim()) void check(manual);
          setManual("");
        }}
      >
        <input
          className={`${input} font-mono uppercase tracking-widest`}
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder="Código do ingresso"
          aria-label="Digitar código do ingresso"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          maxLength={20}
        />
        <button className={`${btnPrimary} shrink-0`} disabled={view.kind !== "scanning"}>
          Validar
        </button>
      </form>

      {view.kind === "result" && <ResultOverlay data={view.data} onNext={resume} />}
    </div>
  );
}

function ResultOverlay({ data, onNext }: { data: RedeemResult; onNext: () => void }) {
  const ok = data.result === "ok";
  const content = (() => {
    switch (data.result) {
      case "ok":
        return {
          title: "Entrada liberada",
          lead: "Entregar pulseira",
          holder: data,
        };
      case "ja_utilizado":
        return {
          title: "Ingresso já utilizado",
          lead: `Lido em ${formatDateTime(data.redeemed_at)}${data.redeemed_by ? ` por ${data.redeemed_by}` : ""}`,
          holder: data,
        };
      case "cancelado":
        return { title: "Ingresso cancelado", lead: "Pedido estornado ou cancelado.", holder: data };
      case "data_errada":
        return {
          title: "Ingresso de outro dia",
          lead: `Válido somente em ${formatEventDate(data.event_date)}. Não foi rasgado.`,
          holder: data,
        };
      case "invalido":
        return { title: "Código inválido", lead: "Este código não corresponde a nenhum ingresso." };
      case "erro":
        return { title: "Falha na leitura", lead: data.message };
    }
  })();

  return (
    <div
      role="alert"
      className={`fixed inset-0 z-50 flex animate-fade flex-col items-center justify-center gap-6 overflow-y-auto px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center text-white [@media(max-height:30rem)]:gap-3 ${
        ok ? "bg-success" : "bg-danger"
      }`}
      onClick={onNext}
    >
      <ResultIcon ok={ok} />
      <div className="flex flex-col gap-2">
        <h2 className="text-balance font-display text-4xl font-bold uppercase leading-[1.17] tracking-[-1px] [@media(max-height:30rem)]:text-3xl">
          {content.title}
        </h2>
        <p className="text-lg font-medium text-white/90">{content.lead}</p>
      </div>
      {"holder" in content && content.holder && (
        <div className="flex flex-col gap-1 rounded-2xl bg-white/15 px-6 py-4">
          <span className="text-2xl font-semibold">{content.holder.holder_name}</span>
          <span className="text-base text-white/85">
            {content.holder.ticket_type} · {formatEventDate(content.holder.event_date)}
          </span>
          <span className="font-mono text-sm text-white/75">{content.holder.short_code}</span>
        </div>
      )}
      <button
        type="button"
        onClick={onNext}
        className="mt-4 min-h-12 w-full max-w-xs rounded-xl bg-white px-6 py-[13px] text-base font-semibold text-ink transition duration-150 active:scale-[0.98] active:bg-white/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white [@media(max-height:30rem)]:mt-0"
      >
        Próxima leitura
      </button>
    </div>
  );
}

/** Liberado: o visto se desenha. Recusado: o X se desenha e o selo balança em negação. */
function ResultIcon({ ok }: { ok: boolean }) {
  const stroke = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 4.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    pathLength: 1,
    strokeDasharray: 1,
  };
  return (
    <div aria-hidden="true" style={{ animationDelay: "220ms" }} className={ok ? "" : "animate-shake"}>
      <div className="flex size-24 animate-pop items-center justify-center rounded-full bg-white/20 [@media(max-height:30rem)]:size-16">
        <svg viewBox="0 0 48 48" className="size-14 [@media(max-height:30rem)]:size-10">
          {ok ? (
            <path d="M12 25 20 33 36 16" className="animate-draw" {...stroke} />
          ) : (
            <>
              <path d="M15 15 33 33" className="animate-draw" {...stroke} />
              <path d="M33 15 15 33" className="animate-draw" style={{ animationDelay: "160ms" }} {...stroke} />
            </>
          )}
        </svg>
      </div>
    </div>
  );
}
