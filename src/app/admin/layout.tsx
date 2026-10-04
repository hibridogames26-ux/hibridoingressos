import Image from "next/image";
import Link from "next/link";
import { AdminNav } from "@/components/admin/AdminNav";
import { btnSecondary } from "@/components/ui/styles";
import { requireRole } from "@/lib/auth";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const profile = await requireRole(["admin"]);

  return (
    <div className="flex min-h-full flex-1 flex-col md:flex-row">
      {/* Celular: barra fixa no topo com atalhos e abas roláveis. Desktop: menu lateral. */}
      <aside className="sticky top-0 z-20 flex flex-col gap-2 border-b border-line bg-surface/95 px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 backdrop-blur md:h-screen md:w-60 md:gap-4 md:border-b-0 md:border-r md:bg-surface md:p-4 md:backdrop-blur-none">
        <div className="flex items-center justify-between gap-2">
          <Link href="/admin" className="flex min-h-11 items-center gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-brand">
            <Image src="/logo-hibrido-games.png" alt="" width={32} height={36} />
            <span className="text-sm font-semibold leading-tight">
              Híbrido Games
              <span className="block text-xs font-normal text-muted">Dashboard</span>
            </span>
          </Link>
          <div className="flex items-center gap-1 md:hidden">
            <Link href="/portaria" className={btnSecondary}>
              Portaria
            </Link>
            <form action="/auth/sair" method="post">
              <button className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm text-brand active:opacity-70">
                Sair
              </button>
            </form>
          </div>
        </div>
        <AdminNav />
        <div className="mt-auto hidden flex-col gap-2 md:flex">
          <Link href="/portaria" className={btnSecondary}>
            Abrir portaria
          </Link>
          <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
            <span className="truncate text-sm text-cool-gray" title={profile.email}>
              {profile.name}
            </span>
            <form action="/auth/sair" method="post">
              <button className="text-sm text-brand hover:underline">Sair</button>
            </form>
          </div>
        </div>
      </aside>
      <div className="min-w-0 flex-1 bg-muted/8">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 pt-6 pb-[max(2rem,env(safe-area-inset-bottom))] sm:gap-6 md:px-8 md:py-8">
          {children}
        </div>
      </div>
    </div>
  );
}
