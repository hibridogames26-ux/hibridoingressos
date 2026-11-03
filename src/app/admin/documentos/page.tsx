import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader, Stat, tableCls, tdCls, thCls, trCls } from "@/components/admin/PageHeader";
import { badgeBrand, badgeDanger, badgeNeutral, badgeSuccess, btnOutline, btnPrimary, card, input } from "@/components/ui/styles";
import {
  competitionLabel,
  filterDocuments,
  filtersQuery,
  listDocuments,
  parseDocumentFilters,
} from "@/lib/checkin/documents";
import { formatDateTime, percent } from "@/lib/format";
import { FormMessage } from "@/components/AuthShell";
import { CreateDrawer } from "./CreateDrawer";

export const metadata: Metadata = { title: "Documentos — Dashboard" };

export default async function DocumentosPage({ searchParams }: PageProps<"/admin/documentos">) {
  const params = await searchParams;
  const filters = parseDocumentFilters(params);
  const deleted = typeof params.excluido === "string" ? params.excluido.slice(0, 200) : null;
  const all = await listDocuments();

  if (all === "unavailable") {
    return (
      <>
        <PageHeader title="Documentos" />
        <div className={card}>
          <EmptyState>As tabelas do check-in ainda não foram criadas. Aplique as migrations do Supabase.</EmptyState>
        </div>
      </>
    );
  }

  const rows = filterDocuments(all, filters);
  const confirmedAll = all.filter((r) => r.checkin).length;
  const confirmedHere = rows.filter((r) => r.checkin).length;
  const parqYes = all.filter((r) => r.checkin?.parqAnyYes).length;
  const minors = all.filter((r) => r.checkin?.isMinor).length;

  // Categorias já usadas, para sugerir no novo cadastro.
  const categories: Record<string, string[]> = { "hibrido-games": [], "hibrido-race": [] };
  for (const r of all) if (categories[r.competition] && !categories[r.competition].includes(r.category)) categories[r.competition].push(r.category);
  for (const list of Object.values(categories)) list.sort((x, y) => x.localeCompare(y, "pt-BR"));

  return (
    <>
      <PageHeader
        title="Documentos"
        description="Termos de responsabilidade, PAR-Q, assinaturas e atestados do check-in dos atletas."
        actions={
          <>
            {confirmedHere > 0 && (
              <>
                <a href={`/admin/documentos/exportar${filtersQuery(filters)}`} className={btnOutline}>
                  PDF dos termos ({confirmedHere})
                </a>
                <a href={`/admin/documentos/exportar${filtersQuery(filters, { atestados: "1" })}`} className={btnOutline}>
                  PDF com atestados
                </a>
              </>
            )}
            <CreateDrawer categories={categories} />
          </>
        }
      />

      {deleted && <FormMessage tone="success">Cadastro excluído: {deleted}.</FormMessage>}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Check-ins confirmados" value={`${confirmedAll} de ${all.length}`} hint={`${percent(confirmedAll, all.length)} dos atletas`} />
        <Stat label="Pendentes" value={String(all.length - confirmedAll)} />
        <Stat label="PAR-Q com “Sim”" value={String(parqYes)} hint="Revisar o atestado" />
        <Stat label="Menores de 18" value={String(minors)} hint="Com assinatura do responsável" />
      </section>

      <form className="grid gap-2 sm:flex" role="search">
        <input
          className={input}
          type="search"
          name="q"
          defaultValue={filters.q}
          placeholder="Atleta, equipe, box ou categoria"
          aria-label="Buscar atletas"
          enterKeyHint="search"
        />
        <select name="competicao" defaultValue={filters.competition ?? ""} className={`${input} sm:w-48`} aria-label="Competição">
          <option value="">Todas as competições</option>
          <option value="hibrido-games">{competitionLabel("hibrido-games")}</option>
          <option value="hibrido-race">{competitionLabel("hibrido-race")}</option>
        </select>
        <select name="situacao" defaultValue={filters.status ?? ""} className={`${input} sm:w-44`} aria-label="Situação">
          <option value="">Todas as situações</option>
          <option value="confirmado">Confirmados</option>
          <option value="pendente">Pendentes</option>
        </select>
        <button className={btnPrimary}>Filtrar</button>
      </form>

      <div className={`${card} overflow-hidden`}>
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className={tableCls}>
              <thead>
                <tr>
                  <th className={thCls}>Atleta</th>
                  <th className={thCls}>Competição</th>
                  <th className={thCls}>Situação</th>
                  <th className={thCls}>Alertas</th>
                  <th className={thCls}>Assinado em</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.athleteId} className={`${trCls} relative transition-colors hover:bg-muted/8 active:bg-muted/8`}>
                    <td className={tdCls}>
                      <Link
                        href={`/admin/documentos/${r.athleteId}`}
                        className="font-medium after:absolute after:inset-0 hover:text-brand focus-visible:outline-2 focus-visible:outline-brand"
                      >
                        {r.name}
                      </Link>
                      <div className="text-xs text-muted">
                        {r.teamName}
                        {r.box ? ` · ${r.box}` : ""}
                      </div>
                    </td>
                    <td data-label="Competição" className={tdCls}>
                      {competitionLabel(r.competition)}
                      <div className="text-xs text-muted">{r.category}</div>
                    </td>
                    <td data-label="Situação" className={tdCls}>
                      <div className="flex flex-wrap gap-1">
                        <span className={r.checkin ? badgeSuccess : badgeNeutral}>{r.checkin ? "Confirmado" : "Pendente"}</span>
                        {!r.checkin && r.reopened && <span className={badgeBrand}>Check-in reaberto</span>}
                        {r.origin === "manual" && <span className={badgeNeutral}>Cadastro manual</span>}
                      </div>
                    </td>
                    <td data-label="Alertas" className={tdCls}>
                      <div className="flex flex-wrap gap-1">
                        {r.checkin?.parqAnyYes && <span className={badgeDanger}>PAR-Q “Sim”</span>}
                        {r.checkin?.isMinor && <span className={badgeNeutral}>Menor</span>}
                        {!r.checkin?.parqAnyYes && !r.checkin?.isMinor && <span className="text-muted">—</span>}
                      </div>
                    </td>
                    <td data-label="Assinado em" className={`${tdCls} whitespace-nowrap text-cool-gray`}>
                      {r.checkin ? formatDateTime(r.checkin.signedAt) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState>Nenhum atleta encontrado.</EmptyState>
        )}
      </div>
    </>
  );
}
