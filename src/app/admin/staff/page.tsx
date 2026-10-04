import type { Metadata } from "next";
import { EmptyState, PageHeader, tableCls, tdCls, thCls, trCls } from "@/components/admin/PageHeader";
import { badgeBrand, badgeDanger, badgeNeutral, badgeSuccess, card } from "@/components/ui/styles";
import { getCurrentProfile, type Profile } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { InviteForm } from "./InviteForm";
import { StaffActions } from "./StaffActions";

export const metadata: Metadata = { title: "Staff — Dashboard" };

type Activity = { user_id: string; redeemed: number; scans: number; last_scan_at: string | null };

export default async function StaffPage() {
  const me = await getCurrentProfile();
  const supabase = await createClient();

  const [profilesRes, activityRes, usersRes] = await Promise.all([
    supabase.from("profiles").select("user_id, name, email, role, active").order("name").returns<Profile[]>(),
    supabase.from("v_staff_activity").select("*").returns<Activity[]>(),
    createAdminClient().auth.admin.listUsers({ perPage: 1000 }),
  ]);
  if (profilesRes.error) throw new Error(`Falha ao carregar a equipe: ${profilesRes.error.message}`);

  const activity = new Map((activityRes.data ?? []).map((a) => [a.user_id, a]));
  const users = new Map((usersRes.data?.users ?? []).map((u) => [u.id, u]));
  const people = profilesRes.data ?? [];

  return (
    <>
      <PageHeader title="Staff" description="Quem pode acessar o dashboard e a portaria." />
      <InviteForm />

      <div className={`${card} overflow-hidden`}>
        {people.length ? (
          <div className="overflow-x-auto">
            <table className={tableCls}>
              <thead>
                <tr>
                  <th className={thCls}>Pessoa</th>
                  <th className={thCls}>Perfil</th>
                  <th className={thCls}>Situação</th>
                  <th className={thCls}>Último acesso</th>
                  <th className={`${thCls} text-right`}>Entradas liberadas</th>
                  <th className={thCls}>
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => {
                  const user = users.get(p.user_id);
                  const act = activity.get(p.user_id);
                  const pendingInvite = user && !user.email_confirmed_at;
                  return (
                    <tr key={p.user_id} className={trCls}>
                      <td className={tdCls}>
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-muted">{p.email}</div>
                      </td>
                      <td data-label="Perfil" className={tdCls}>
                        <span className={p.role === "admin" ? badgeBrand : badgeNeutral}>
                          {p.role === "admin" ? "Admin" : "Staff"}
                        </span>
                      </td>
                      <td data-label="Situação" className={tdCls}>
                        {!p.active ? (
                          <span className={badgeDanger}>Desativado</span>
                        ) : pendingInvite ? (
                          <span className={badgeNeutral}>Convite pendente</span>
                        ) : (
                          <span className={badgeSuccess}>Ativo</span>
                        )}
                      </td>
                      <td data-label="Último acesso" className={`${tdCls} whitespace-nowrap text-cool-gray`}>
                        {formatDateTime(user?.last_sign_in_at)}
                      </td>
                      <td data-label="Entradas liberadas" className={`${tdCls} text-right tabular-nums`}>{act?.redeemed ?? 0}</td>
                      <td className={tdCls}>
                        <StaffActions userId={p.user_id} active={p.active} isSelf={p.user_id === me?.user_id} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState>Ninguém cadastrado ainda.</EmptyState>
        )}
      </div>
    </>
  );
}
