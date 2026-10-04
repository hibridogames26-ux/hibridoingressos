import type { Metadata } from "next";
import { EmptyState, PageHeader, Stat, tableCls, tdCls, thCls, trCls } from "@/components/admin/PageHeader";
import { ScanResultBadge } from "@/components/admin/StatusBadges";
import { AutoRefresh } from "@/components/AutoRefresh";
import { card } from "@/components/ui/styles";
import { formatDateTime, formatTime } from "@/lib/format";
import type { ScanResult } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";
import { hoursAgoIso } from "@/lib/time";

export const metadata: Metadata = { title: "Entradas — Dashboard" };

type ScanRow = {
  id: number;
  code: string;
  result: ScanResult;
  created_at: string;
  ticket: { holder_name: string; short_code: string; ticket_types: { name: string } | null } | null;
  scanner: { name: string } | null;
};

export default async function EntradasPage() {
  const supabase = await createClient();
  const since = hoursAgoIso(24);

  const [scansRes, okRes, refusedRes] = await Promise.all([
    supabase
      .from("ticket_scans")
      .select(
        "id, code, result, created_at, ticket:tickets(holder_name, short_code, ticket_types(name)), scanner:profiles(name)",
      )
      .order("created_at", { ascending: false })
      .limit(100)
      .returns<ScanRow[]>(),
    supabase.from("ticket_scans").select("id", { count: "exact", head: true }).eq("result", "ok").gte("created_at", since),
    supabase.from("ticket_scans").select("id", { count: "exact", head: true }).neq("result", "ok").gte("created_at", since),
  ]);
  if (scansRes.error) throw new Error(`Falha ao carregar entradas: ${scansRes.error.message}`);

  const scans = scansRes.data ?? [];

  return (
    <>
      <AutoRefresh seconds={5} />
      <PageHeader title="Entradas" description="Leituras da portaria, atualizadas a cada 5 segundos." />

      <section className="grid gap-4 sm:grid-cols-2">
        <Stat label="Entradas liberadas (24h)" value={String(okRes.count ?? 0)} />
        <Stat
          label="Leituras recusadas (24h)"
          value={String(refusedRes.count ?? 0)}
          hint="Já utilizados, cancelados ou códigos inválidos"
        />
      </section>

      <div className={`${card} overflow-hidden`}>
        {scans.length ? (
          <div className="overflow-x-auto">
            <table className={tableCls}>
              <thead>
                <tr>
                  <th className={thCls}>Hora</th>
                  <th className={thCls}>Resultado</th>
                  <th className={thCls}>Titular</th>
                  <th className={thCls}>Código</th>
                  <th className={thCls}>Staff</th>
                </tr>
              </thead>
              <tbody>
                {scans.map((s) => (
                  <tr key={s.id} className={trCls}>
                    <td className={`${tdCls} whitespace-nowrap tabular-nums`} title={formatDateTime(s.created_at)}>
                      {formatTime(s.created_at)}
                    </td>
                    <td className={tdCls}>
                      <ScanResultBadge result={s.result} />
                    </td>
                    <td className={tdCls}>
                      {s.ticket ? (
                        <>
                          <div className="font-medium">{s.ticket.holder_name}</div>
                          <div className="text-xs text-muted">{s.ticket.ticket_types?.name}</div>
                        </>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className={`${tdCls} font-mono text-xs`}>
                      {s.ticket?.short_code ?? s.code.slice(0, 16)}
                    </td>
                    <td className={tdCls}>{s.scanner?.name ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState>Nenhuma leitura ainda.</EmptyState>
        )}
      </div>
    </>
  );
}
