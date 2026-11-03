import type { CheckinProgress as Progress } from "@/lib/checkin/progress";
import { ratio, remaining } from "@/lib/checkin/progress";
import { COMPETITION_LABEL } from "@/lib/checkin/terms";

const atletas = (n: number) => (n === 1 ? "1 atleta" : `${n} atletas`);

/** Barra pública: quantos atletas já fizeram check-in e quantos faltam. Só números agregados. */
export function CheckinProgress({ progress }: { progress: Progress }) {
  const left = remaining(progress);
  const complete = progress.total > 0 && left === 0;
  const summary = complete
    ? `Todos os ${progress.total} atletas fizeram check-in.`
    : `${progress.confirmed} de ${progress.total} atletas com check-in. Faltam ${atletas(left)}.`;

  return (
    <section aria-label="Progresso do check-in" className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-whisper sm:p-5">
      <p className="sr-only" aria-live="polite">
        {summary}
      </p>
      <div aria-hidden="true" className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="font-display text-[32px] leading-none font-bold tracking-[-0.5px] tabular-nums">{progress.confirmed}</span>
        <span className="text-base text-cool-gray">
          de <span className="tabular-nums">{progress.total}</span> atletas com check-in
        </span>
      </div>
      <span aria-hidden="true" className="block h-2 overflow-hidden rounded-full bg-muted/16">
        <span
          className="block h-full origin-left animate-fill rounded-full bg-success"
          style={{ transform: `scaleX(${ratio(progress)})` }}
        />
      </span>
      <p aria-hidden="true" className="text-sm text-cool-gray">
        {complete ? (
          <strong className="font-semibold text-success-ink">Todos os atletas fizeram check-in. Nos vemos no evento!</strong>
        ) : (
          <>
            Faltam <strong className="font-semibold text-ink tabular-nums">{atletas(left)}</strong> para fechar o check-in.
          </>
        )}
      </p>
      {progress.byCompetition.length > 1 && (
        <ul className="flex flex-wrap gap-x-5 gap-y-1 border-t border-line pt-3 text-sm text-cool-gray">
          {progress.byCompetition.map((c) => (
            <li key={c.competition}>
              {COMPETITION_LABEL[c.competition]}{" "}
              <strong className="font-semibold text-ink tabular-nums">
                {c.confirmed}/{c.total}
              </strong>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
