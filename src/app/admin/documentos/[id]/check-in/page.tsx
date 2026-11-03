import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CheckinWizard } from "@/app/check-in/[id]/CheckinWizard";
import { requireRole } from "@/lib/auth";
import { isUuid } from "@/lib/checkin/code";
import { getAthleteRecord } from "@/lib/checkin/documents";
import { getAthlete } from "@/lib/checkin/service";
import { supabasePublishableKey } from "@/lib/env";
import { prepareAdminCertificateUpload, sendAdminCheckin } from "./actions";

export const metadata: Metadata = { title: "Check-in presencial — Dashboard" };
export const dynamic = "force-dynamic";

/** Check-in presencial (Story 4.5): o atleta preenche e assina no aparelho da organização. */
export default async function CheckinPresencialPage({ params }: PageProps<"/admin/documentos/[id]/check-in">) {
  const profile = await requireRole(["admin"]);
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const [athlete, record] = await Promise.all([getAthlete(id), getAthleteRecord(id)]);
  if (!record) notFound();
  // Já assinado, inscrição cancelada ou banco sem a migration: volta para a página do atleta.
  if (!athlete || athlete.signedAt || record.adminCreatePending) redirect(`/admin/documentos/${id}`);

  return (
    <>
      <nav className="text-sm text-muted" aria-label="Navegação">
        <Link href="/admin/documentos" className="inline-flex min-h-11 items-center hover:text-brand pointer-fine:min-h-0">
          Documentos
        </Link>{" "}
        ›{" "}
        <Link href={`/admin/documentos/${id}`} className="inline-flex min-h-11 items-center hover:text-brand pointer-fine:min-h-0">
          {athlete.name}
        </Link>{" "}
        › <span className="text-ink">Check-in presencial</span>
      </nav>
      <p className="max-w-xl rounded-xl bg-brand-subtle px-4 py-3 text-sm text-ink">
        Entregue o aparelho ao atleta para ele conferir os dados, responder o PAR-Q, ler o termo e assinar. O termo fica registrado
        como check-in presencial feito por você, sem o código do e-mail.
      </p>
      <div className="flex flex-col">
        <CheckinWizard
          athlete={{
            id: athlete.id,
            name: athlete.name,
            teamName: athlete.teamName,
            kind: athlete.kind,
            category: athlete.category,
            competition: athlete.competition,
            prefillEmail: athlete.position === 1 ? athlete.registrationEmail : "",
            prefillPhone: athlete.position === 1 ? (athlete.registrationPhone ?? "") : "",
          }}
          badge={`Check-in presencial · ${profile.name}`}
          storageKey={supabasePublishableKey()}
          draftKey={`hg-checkin-admin:${athlete.id}`}
          successHref={`/admin/documentos/${athlete.id}?presencial=1`}
          prepare={prepareAdminCertificateUpload}
          send={sendAdminCheckin}
        />
      </div>
    </>
  );
}
