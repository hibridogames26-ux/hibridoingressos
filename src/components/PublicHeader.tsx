import Image from "next/image";
import Link from "next/link";
import { event } from "@/config/event";

export function PublicHeader() {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-2 sm:py-3">
        <Link
          href="/"
          className="flex min-h-11 items-center gap-2 rounded-lg transition-opacity active:opacity-70 focus-visible:outline-2 focus-visible:outline-brand"
        >
          <Image src="/logo-hibrido-games.png" alt="" width={28} height={31} />
          <span className="text-sm font-semibold">
            {event.name} {event.year}
          </span>
        </Link>
      </div>
    </header>
  );
}

function Check() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5">
      <path
        d="M3.5 8.5 6.5 11.5 12.5 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Steps({
  current,
  steps = ["Ingressos", "Seus dados", "Pagamento"],
}: {
  current: 1 | 2 | 3;
  steps?: readonly [string, string, string];
}) {
  return (
    <ol className="flex items-center gap-2 text-xs font-medium" aria-label="Etapas da compra">
      {steps.map((label, i) => {
        const n = i + 1;
        const state = n < current ? "done" : n === current ? "current" : "next";
        return (
          <li key={label} className="flex items-center gap-2" aria-current={state === "current" ? "step" : undefined}>
            <span
              className={`flex size-6 items-center justify-center rounded-full ${
                state === "next" ? "bg-muted/16 text-cool-gray" : "bg-brand text-white"
              }`}
            >
              {state === "done" ? <Check /> : n}
              {state === "done" && <span className="sr-only">Concluída: </span>}
            </span>
            {/* No celular só a etapa atual mostra o nome; as outras ficam para leitores de tela. */}
            <span
              className={`${state === "current" ? "text-ink" : "max-sm:sr-only"} ${
                state === "next" ? "text-muted" : "text-ink"
              }`}
            >
              {label}
            </span>
            {n < steps.length && (
              <span aria-hidden="true" className="relative h-px w-5 overflow-hidden bg-line sm:w-6">
                {n < current && (
                  // O trecho que leva à etapa atual se completa ao chegar nela.
                  <span
                    className={`absolute inset-0 origin-left bg-brand ${n === current - 1 ? "animate-fill" : ""}`}
                  />
                )}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
