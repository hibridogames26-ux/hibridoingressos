import type { Metadata } from "next";
import { EmptyState, PageHeader, Stat } from "@/components/admin/PageHeader";
import { btnPrimary, card, input } from "@/components/ui/styles";
import { percent } from "@/lib/format";
import { listLinkOptions, listPickups } from "@/lib/pickups/list";
import { filterPickups, parsePickupFilters, pickupFiltersQuery, pickupStats } from "@/lib/pickups/rows";
import { RetiradasView } from "./RetiradasView";

export const metadata: Metadata = { title: "Retiradas — Dashboard" };

export default async function RetiradasPage({ searchParams }: PageProps<"/admin/retiradas">) {
  const filters = parsePickupFilters(await searchParams);
  const [all, linkOptions] = await Promise.all([listPickups(), listLinkOptions()]);

  if (all === "unavailable") {
    return (
      <>
        <PageHeader title="Retiradas" />
        <div className={card}>
          <EmptyState>A tabela da retirada de camisas ainda não foi criada. Aplique as migrations do Supabase (npm run db:push).</EmptyState>
        </div>
      </>
    );
  }

  const rows = filterPickups(all, filters);
  const stats = pickupStats(all);

  return (
    <RetiradasView rows={rows} all={all} linkOptions={linkOptions} exportHref={`/admin/retiradas/exportar${pickupFiltersQuery(filters)}`}>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Camisas retiradas" value={`${stats.picked} de ${stats.total}`} hint={`${percent(stats.picked, stats.total)} da lista`} />
        <Stat label="Pendentes" value={String(stats.pending)} />
        <Stat label="Aguardando check-in" value={String(stats.blocked)} hint="Pendentes que ainda não podem retirar" />
        <div className="flex min-w-0 flex-col gap-1 rounded-2xl border border-line bg-surface p-4 shadow-whisper sm:p-5">
          <span className="text-sm text-cool-gray">Pendentes por tamanho</span>
          {stats.pendingBySize.length ? (
            <ul className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-base font-semibold tabular-nums">
              {stats.pendingBySize.map((s) => (
                <li key={s.size}>
                  {s.size} <span className="font-normal text-cool-gray">{s.count}</span>
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-sm text-muted">Nenhuma camisa pendente.</span>
          )}
        </div>
      </section>

      <form className="grid gap-2 sm:flex" role="search">
        <input
          className={input}
          type="search"
          name="q"
          defaultValue={filters.q}
          placeholder="Atleta, equipe, box ou e-mail"
          aria-label="Buscar atletas"
          enterKeyHint="search"
        />
        <select name="competicao" defaultValue={filters.competition ?? ""} className={`${input} sm:w-48`} aria-label="Competição">
          <option value="">Todas as competições</option>
          <option value="hibrido-games">Híbrido Games</option>
          <option value="hibrido-race">Híbrido Race</option>
        </select>
        <select name="situacao" defaultValue={filters.status ?? ""} className={`${input} sm:w-48`} aria-label="Situação">
          <option value="">Todas as situações</option>
          <option value="pendente">Pendentes</option>
          <option value="sem-checkin">Aguardando check-in</option>
          <option value="retirada">Retiradas</option>
        </select>
        <select name="tamanho" defaultValue={filters.size ?? ""} className={`${input} sm:w-36`} aria-label="Tamanho">
          <option value="">Tamanhos</option>
          {stats.sizes.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button className={btnPrimary}>Filtrar</button>
      </form>
    </RetiradasView>
  );
}
