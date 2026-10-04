import Image from "next/image";
import Link from "next/link";
import { event } from "@/config/event";

export function PublicHeader() {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-brand">
          <Image src="/logo-hibrido-games.png" alt="" width={28} height={31} />
          <span className="text-sm font-semibold">
            {event.name} {event.year}
          </span>
        </Link>
      </div>
    </header>
  );
}

export function Steps({ current }: { current: 1 | 2 | 3 }) {
  const steps = ["Ingressos", "Seus dados", "Pagamento"];
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
              {state === "done" ? "✓" : n}
            </span>
            <span className={state === "next" ? "text-muted" : "text-ink"}>{label}</span>
            {n < steps.length && <span aria-hidden="true" className="h-px w-6 bg-line" />}
          </li>
        );
      })}
    </ol>
  );
}
