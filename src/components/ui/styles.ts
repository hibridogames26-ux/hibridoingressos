// Classes do design system (DESIGN-kraken.md) reutilizadas entre telas.

/** Resposta ao toque: o botão cede levemente enquanto pressionado. */
const press = "active:scale-[0.98] disabled:active:scale-100";

export const btnPrimary =
  `inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand px-4 py-[13px] text-base font-semibold text-white transition duration-150 hover:bg-brand-dark active:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${press}`;

export const btnOutline =
  `inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-brand-dark bg-surface px-4 py-[11px] text-base font-medium text-brand-dark transition duration-150 hover:bg-brand-subtle active:bg-brand-subtle disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${press}`;

export const btnSecondary =
  `inline-flex min-h-9 items-center justify-center gap-2 rounded-xl bg-muted/8 px-3 py-2 text-sm font-medium text-ink transition duration-150 hover:bg-muted/16 active:bg-muted/16 pointer-coarse:min-h-11 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${press}`;

/** Link de texto com área de toque confortável sem mudar o desenho. */
export const textLink =
  "inline-flex min-h-11 items-center justify-center rounded-lg text-sm text-brand underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-brand pointer-fine:min-h-0";

export const input =
  "w-full rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink placeholder:text-muted transition-[border-color,box-shadow] duration-150 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand-subtle";

export const label = "text-sm font-medium text-ink";

export const card = "rounded-2xl border border-line bg-surface shadow-whisper";

export const badgeNeutral =
  "inline-flex items-center rounded-lg bg-cool-gray/12 px-2 py-0.5 text-xs font-medium text-[#484b5e]";

export const badgeSuccess =
  "inline-flex items-center rounded-md bg-success/16 px-2 py-0.5 text-xs font-medium text-success-ink";

export const badgeDanger =
  "inline-flex items-center rounded-md bg-danger/12 px-2 py-0.5 text-xs font-medium text-danger-ink";

export const badgeBrand =
  "inline-flex items-center rounded-md bg-brand-subtle px-2 py-0.5 text-xs font-medium text-brand";
