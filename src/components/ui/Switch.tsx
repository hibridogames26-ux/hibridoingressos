"use client";

/** Interruptor acessível (role="switch") com área de toque de 44 px. */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
  busy,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Nome acessível da ação, ex.: "Aceitar encomendas no tamanho M". */
  label: string;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled || busy}
      onClick={() => onChange(!checked)}
      className="inline-flex min-h-11 w-14 shrink-0 items-center justify-center rounded-xl px-1 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-brand"
    >
      <span
        className={`flex h-7 w-12 items-center rounded-full p-0.5 transition-colors duration-200 motion-reduce:transition-none ${
          checked ? "bg-brand" : "bg-muted"
        }`}
      >
        <span
          className={`block size-6 rounded-full bg-white shadow-micro transition-transform duration-200 motion-reduce:transition-none ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </span>
    </button>
  );
}
