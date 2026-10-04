export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3 sm:gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-balance font-display text-[1.625rem] font-bold leading-[1.29] tracking-[-0.5px] sm:text-[28px]">
          {title}
        </h1>
        {description && <p className="text-sm text-cool-gray">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-2xl border border-line bg-surface p-4 shadow-whisper sm:p-5">
      <span className="text-sm text-cool-gray">{label}</span>
      <span className="font-display text-2xl font-bold leading-tight tracking-[-0.5px] tabular-nums sm:text-[28px]">
        {value}
      </span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-10 text-center text-sm text-muted">{children}</p>;
}

/** `table-stack`: no celular cada linha vira um bloco (ver globals.css); células secundárias levam data-label. */
export const tableCls = "table-stack w-full text-left text-sm";
export const thCls = "px-5 py-3 text-xs font-medium uppercase tracking-wide text-muted";
export const tdCls = "px-5 py-3 align-middle";
export const trCls = "border-t border-line";
