import Image from "next/image";
import Link from "next/link";
import { AdminNav } from "@/components/admin/AdminNav";
import { btnSecondary } from "@/components/ui/styles";
import { requireRole } from "@/lib/auth";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const profile = await requireRole(["admin"]);

  return (
    <div className="flex min-h-full flex-1 flex-col md:flex-row">
      <aside className="flex flex-col gap-4 border-b border-line bg-surface p-4 md:sticky md:top-0 md:h-screen md:w-60 md:border-b-0 md:border-r">
        <Link href="/admin" className="flex items-center gap-2">
          <Image src="/logo-hibrido-games.png" alt="" width={32} height={36} />
          <span className="text-sm font-semibold leading-tight">
            Híbrido Games
            <span className="block text-xs font-normal text-muted">Dashboard</span>
          </span>
        </Link>
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
      <div className="flex-1 bg-muted/8">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-8">
          {children}
        </div>
      </div>
    </div>
  );
}
