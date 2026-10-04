import type { Metadata, Viewport } from "next";
import Image from "next/image";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { startOfTodaySaoPaulo } from "@/lib/time";
import { Scanner } from "./Scanner";

export const metadata: Metadata = { title: "Portaria — Híbrido Games" };
export const viewport: Viewport = { themeColor: "#101114" };

export default async function PortariaPage() {
  const profile = await requireRole(["admin", "staff"]);
  const supabase = await createClient();
  const { count } = await supabase
    .from("ticket_scans")
    .select("id", { count: "exact", head: true })
    .eq("scanned_by", profile.user_id)
    .eq("result", "ok")
    .gte("created_at", startOfTodaySaoPaulo());

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Image src="/logo-hibrido-games.png" alt="" width={32} height={36} />
          <div className="leading-tight">
            <h1 className="text-base font-semibold">Portaria</h1>
            <p className="text-xs text-muted">{profile.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 text-sm">
          {profile.role === "admin" && (
            <Link href="/admin" className="inline-flex min-h-11 items-center rounded-lg px-2 text-brand underline-offset-4 hover:underline active:opacity-70">
              Dashboard
            </Link>
          )}
          <form action="/auth/sair" method="post">
            <button className="inline-flex min-h-11 items-center rounded-lg px-2 text-cool-gray transition-colors hover:text-ink active:text-ink">Sair</button>
          </form>
        </div>
      </header>
      <Scanner initialCount={count ?? 0} />
    </main>
  );
}
