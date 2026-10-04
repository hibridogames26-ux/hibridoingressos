import Image from "next/image";
import Link from "next/link";
import { card } from "@/components/ui/styles";

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="flex flex-1 items-center justify-center bg-muted/8 px-4 pt-8 pb-[max(2rem,env(safe-area-inset-bottom))] sm:py-12">
      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        <Link href="/" aria-label="Início" className="animate-shield rounded-lg focus-visible:outline-2 focus-visible:outline-brand">
          <Image src="/logo-hibrido-games.png" alt="" width={64} height={72} priority />
        </Link>
        <div style={{ animationDelay: "120ms" }} className={`${card} flex w-full animate-rise flex-col gap-6 p-5 sm:p-6`}>
          <div className="flex flex-col gap-1">
            <h1 className="font-display text-[28px] font-bold leading-[1.29] tracking-[-0.5px]">
              {title}
            </h1>
            {subtitle && <p className="text-sm text-cool-gray">{subtitle}</p>}
          </div>
          {children}
        </div>
      </div>
    </main>
  );
}

export function FormMessage({
  tone,
  children,
}: {
  tone: "error" | "success";
  children: React.ReactNode;
}) {
  const styles =
    tone === "error"
      ? "bg-danger/8 text-danger-ink"
      : "bg-success/16 text-success-ink";
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`animate-message rounded-xl px-4 py-3 text-sm ${styles}`}>
      {children}
    </p>
  );
}
