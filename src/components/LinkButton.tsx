import type { EventLink } from "@/config/event";

const base =
  "flex min-h-14 w-full items-center justify-between gap-4 rounded-xl px-4 py-[13px] text-left transition duration-150";

function Chevron() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="size-5 shrink-0 text-muted transition duration-200 ease-out-expo group-hover:translate-x-0.5 group-hover:text-brand group-active:translate-x-1 group-active:text-brand"
    >
      <path
        d="M7.5 4.5 13 10l-5.5 5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LinkButton({ label, description, href }: EventLink) {
  const text = (
    <span className="flex flex-col">
      <span className="text-base font-semibold">{label}</span>
      {description && (
        <span className="text-sm text-cool-gray">{description}</span>
      )}
    </span>
  );

  if (!href) {
    return (
      <div
        aria-disabled="true"
        className={`${base} cursor-not-allowed bg-muted/8 text-ink/60`}
      >
        {text}
        <span className="shrink-0 rounded-lg bg-cool-gray/12 px-2 py-0.5 text-xs font-medium text-[#484b5e]">
          Em breve
        </span>
      </div>
    );
  }

  const external = /^https?:\/\//.test(href);
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={`${base} group border border-line bg-surface shadow-whisper hover:border-brand-dark active:scale-[0.99] active:border-brand-dark active:bg-brand-subtle/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand`}
    >
      {text}
      <Chevron />
    </a>
  );
}
