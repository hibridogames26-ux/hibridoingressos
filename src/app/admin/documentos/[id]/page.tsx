import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FormMessage } from "@/components/AuthShell";
import { PageHeader } from "@/components/admin/PageHeader";
import { badgeBrand, badgeDanger, badgeNeutral, badgeSuccess, btnOutline, btnPrimary, card } from "@/components/ui/styles";
import { auditActor, describeAthleteAudit, FIELD_LABEL, RESET_REASONS, STATUS_LABEL } from "@/lib/checkin/admin";
import { competitionLabel, getAthleteDocuments, getAthleteRecord, signedFileUrls, type AthleteRecord } from "@/lib/checkin/documents";
import { maskEmail } from "@/lib/checkin/form";
import { parqQuestionsFrom } from "@/lib/checkin/pdf";
import { displayName } from "@/lib/checkin/sheet";
import { formatDateTime } from "@/lib/format";
import { DeleteRegistration } from "./DeleteRegistration";
import { EditDrawer } from "./EditDrawer";
import { ResetCheckin } from "./ResetCheckin";

export const metadata: Metadata = { title: "Documentos do atleta — Dashboard" };

const birth = (iso: string) => iso.split("-").reverse().join("/");

const sizeLabel = (bytes: number | null) =>
  bytes == null ? "" : bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

function Facts({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map(([k, v]) => (
        <div key={k} className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted">{k}</dt>
          <dd className="break-words text-sm font-medium [overflow-wrap:anywhere]">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

const RESET_NOTICE: Record<string, string> = {
  avisado: "Check-in reaberto. O termo anterior foi arquivado e avisamos o atleta no e-mail da inscrição.",
  "sem-aviso": "Check-in reaberto. O termo anterior foi arquivado. O atleta não foi avisado por e-mail.",
  "sem-provedor": "Check-in reaberto e termo arquivado, mas nenhum provedor de e-mail está configurado: avise o atleta por outro canal.",
  falhou: "Check-in reaberto e termo arquivado, mas o e-mail de aviso não foi enviado: avise o atleta por outro canal.",
};

const CREATE_NOTICE: Record<string, string> = {
  avisado: "Cadastro criado. Avisamos no e-mail da inscrição que o check-in está liberado.",
  "sem-aviso": "Cadastro criado. O atleta já pode fazer o check-in com o e-mail da inscrição.",
  "sem-provedor": "Cadastro criado, mas nenhum provedor de e-mail está configurado: avise o atleta por outro canal.",
  falhou: "Cadastro criado, mas o e-mail de aviso não foi enviado: avise o atleta por outro canal.",
};

export default async function DocumentoAtletaPage({ params, searchParams }: PageProps<"/admin/documentos/[id]">) {
  const { id } = await params;
  const { reaberto, criado, presencial } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [[doc], record] = await Promise.all([getAthleteDocuments([id]), getAthleteRecord(id)]);
  if (!doc || !record) notFound();
  const notice =
    (typeof reaberto === "string" ? RESET_NOTICE[reaberto] : undefined) ??
    (typeof criado === "string" ? CREATE_NOTICE[criado] : undefined) ??
    (presencial === "1" ? "Check-in presencial registrado. O termo assinado e o atestado estão abaixo." : undefined);
  const canCheckin = !doc.checkin && record.status === "aprovado" && !record.adminCreatePending;
  const canDelete = record.origin === "manual" && !doc.checkin && !record.archive.length && !record.adminCreatePending;
  const c = doc.checkin;
  const files = c ? await signedFileUrls(c) : null;
  const certIsImage = !!c?.certificate_type && /^image\/(jpeg|png|webp)$/.test(c.certificate_type);

  return (
    <>
      <nav className="text-sm text-muted" aria-label="Navegação">
        <Link href="/admin/documentos" className="inline-flex min-h-11 items-center hover:text-brand pointer-fine:min-h-0">
          Documentos
        </Link>{" "}
        › <span className="text-ink">{doc.name}</span>
      </nav>
      <PageHeader
        title={doc.name}
        description={`${doc.teamName} · ${competitionLabel(doc.competition)} · ${doc.category}`}
        actions={
          <>
            {!record.migrationPending && (
              <EditDrawer
                athleteId={record.athleteId}
                kind={record.kind}
                partner={record.partners[0]?.name ?? null}
                signed={!!c}
                categories={record.categories}
                initial={{
                  fullName: record.fullName,
                  instagram: record.instagram ?? "",
                  shirtSize: record.shirtSize ?? "",
                  email: record.email,
                  phone: record.phone ?? "",
                  teamName: record.teamName,
                  box: record.box ?? "",
                  competition: record.competition,
                  category: record.category,
                  status: record.status,
                }}
              />
            )}
            {canCheckin && (
              <Link href={`/admin/documentos/${doc.athleteId}/check-in`} className={btnPrimary}>
                Registrar check-in presencial
              </Link>
            )}
            {c && (
              <a href={`/admin/documentos/${doc.athleteId}/pdf`} className={btnPrimary}>
                Baixar PDF
              </a>
            )}
          </>
        }
      />

      {notice && <FormMessage tone="success">{notice}</FormMessage>}
      {record.migrationPending && (
        <p className={`${card} p-4 text-sm text-cool-gray sm:p-5`} role="status">
          Editar cadastro e refazer check-in ficam disponíveis depois de aplicar as migrations do Supabase:{" "}
          <code className="rounded-md bg-muted/8 px-1.5 py-0.5">npm run db:push</code>
        </p>
      )}

      <Registration record={record} />

      {!c ? (
        <section className={`${card} p-5 text-sm text-cool-gray`}>
          <span className={badgeNeutral}>Pendente</span>
          <p className="mt-3">Este atleta ainda não fez o check-in: não há termo assinado nem atestado.</p>
          {canCheckin && (
            <p className="mt-2">
              Se ele está no local sem acesso ao e-mail, use <strong className="font-semibold text-ink">Registrar check-in presencial</strong>{" "}
              e entregue o aparelho para ele preencher e assinar.
            </p>
          )}
        </section>
      ) : (
        <>
          <section className={`${card} flex flex-wrap items-center gap-2 p-4 sm:p-5`}>
            <span className={badgeSuccess}>Confirmado em {formatDateTime(c.signed_at)}</span>
            {c.parq_any_yes && <span className={badgeDanger}>PAR-Q com resposta “Sim”</span>}
            {c.is_minor && <span className={badgeNeutral}>Menor de 18 — assinado pelo responsável</span>}
            <span className={badgeNeutral}>{c.image_consent ? "Autorizou uso de imagem" : "Não autorizou uso de imagem"}</span>
          </section>

          <section className={`${card} flex flex-col gap-4 p-4 sm:p-5`}>
            <h2 className="text-lg font-semibold">Identificação</h2>
            <Facts
              items={[
                ["Nome completo", c.full_name],
                ["Nascimento", birth(c.birth_date)],
                ["Telefone", c.phone],
                ["E-mail", c.email],
                ["Contato de emergência", c.emergency_name],
                ["Telefone de emergência", c.emergency_phone],
                ["Box", doc.box ?? "—"],
                ["Inscrição", doc.kind === "dupla" ? "Dupla" : "Individual"],
                ["Local", c.place],
                ...(c.is_minor
                  ? ([
                      ["Responsável legal", c.guardian_name ?? "—"],
                      ["Parentesco", c.guardian_relation ?? "—"],
                      ["Telefone do responsável", c.guardian_phone ?? "—"],
                    ] as [string, React.ReactNode][])
                  : []),
              ]}
            />
          </section>

          <section className={`${card} flex flex-col gap-3 p-4 sm:p-5`}>
            <h2 className="text-lg font-semibold">Atestado médico</h2>
            {files?.certificate ? (
              <>
                {certIsImage && (
                  // eslint-disable-next-line @next/next/no-img-element -- URL assinada e temporária do Storage privado
                  <img src={files.certificate} alt={`Atestado médico de ${c.full_name}`} className="max-h-[480px] w-auto max-w-full self-start rounded-xl border border-line" />
                )}
                <p className="text-sm text-cool-gray">
                  {c.certificate_name ?? "Atestado"} · {c.certificate_type ?? "tipo desconhecido"} {sizeLabel(c.certificate_size) && `· ${sizeLabel(c.certificate_size)}`}
                </p>
                <div className="flex flex-wrap gap-2">
                  <a href={files.certificate} target="_blank" rel="noopener noreferrer" className={btnOutline}>
                    Abrir atestado
                  </a>
                  {files.certificateDownload && (
                    <a href={files.certificateDownload} className={btnOutline}>
                      Baixar original
                    </a>
                  )}
                </div>
                <p className="text-xs text-muted">Os links valem por 10 minutos. Recarregue a página para gerar novos.</p>
              </>
            ) : (
              <p className="text-sm text-cool-gray">Arquivo não encontrado no Storage.</p>
            )}
          </section>

          <section className={`${card} flex flex-col gap-3 p-4 sm:p-5`}>
            <h2 className="text-lg font-semibold">PAR-Q</h2>
            <ol className="flex flex-col divide-y divide-line">
              {parqQuestionsFrom(c.terms_text).map((q, i) => (
                <li key={i} className="flex items-start justify-between gap-4 py-2.5 text-sm">
                  <span>
                    {i + 1}. {q}
                  </span>
                  <span className={c.parq[i] ? badgeDanger : badgeNeutral}>{c.parq[i] ? "Sim" : "Não"}</span>
                </li>
              ))}
            </ol>
          </section>

          <section className={`${card} flex flex-col gap-4 p-4 sm:p-5`}>
            <h2 className="text-lg font-semibold">Assinaturas</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                { label: "Participante", name: c.full_name, url: files?.signature },
                ...(c.is_minor ? [{ label: "Responsável legal", name: c.guardian_name ?? "—", url: files?.guardianSignature }] : []),
              ].map((s) => (
                <figure key={s.label} className="flex flex-col gap-2">
                  <figcaption className="text-xs text-muted">{s.label}</figcaption>
                  {s.url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- URL assinada e temporária do Storage privado
                    <img src={s.url} alt={`Assinatura de ${s.name}`} className="h-28 w-full rounded-xl border border-line bg-white object-contain p-2" />
                  ) : (
                    <p className="text-sm text-cool-gray">Assinatura indisponível.</p>
                  )}
                  <span className="text-sm font-medium">{s.name}</span>
                </figure>
              ))}
            </div>
            <Facts
              items={[
                c.recorded_by_name
                  ? ["Registrado presencialmente por", `${c.recorded_by_name} (${c.verified_email})`]
                  : ["E-mail confirmado por código", c.verified_email],
                ["Assinado em", formatDateTime(c.signed_at)],
                ["IP", c.ip ?? "—"],
                ["Navegador", <span key="ua" className="font-normal text-cool-gray">{c.user_agent ?? "—"}</span>],
              ]}
            />
          </section>

          <section className={`${card} flex flex-col gap-3 p-4 sm:p-5`}>
            <details>
              <summary className="cursor-pointer text-lg font-semibold">Termo aceito — texto integral (versão {c.terms_version})</summary>
              <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-relaxed text-cool-gray">{c.terms_text}</pre>
            </details>
          </section>

          {!record.migrationPending && <ResetCheckin athleteId={doc.athleteId} name={doc.name} maskedEmail={maskEmail(record.email)} />}
        </>
      )}

      {canDelete && (
        <DeleteRegistration
          registrationId={record.registrationId}
          names={[displayName(record.fullName), ...record.partners.map((p) => p.name)]}
        />
      )}

      <History record={record} />
    </>
  );
}

/** Cadastro vindo da planilha ou feito no painel (e corrigido no painel). */
function Registration({ record }: { record: AthleteRecord }) {
  const edited = new Set(record.editedFields);
  const value = (field: string, v: React.ReactNode) => (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {v || "—"}
      {edited.has(field) && <span className={badgeBrand}>Corrigido no painel</span>}
    </span>
  );
  return (
    <section className={`${card} flex flex-col gap-4 p-4 sm:p-5`} aria-labelledby="cadastro">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="cadastro" className="text-lg font-semibold">
          Cadastro
        </h2>
        <span className="flex flex-wrap gap-1">
          {record.origin === "manual" && <span className={badgeNeutral}>Cadastro manual</span>}
          {record.status === "cancelado" && <span className={badgeDanger}>Inscrição cancelada</span>}
        </span>
      </div>
      <Facts
        items={[
          [FIELD_LABEL.full_name, value("full_name", displayName(record.fullName))],
          [FIELD_LABEL.email, value("email", record.email)],
          [FIELD_LABEL.phone, value("phone", record.phone)],
          [record.kind === "dupla" ? "Equipe" : "Inscrição", value("team_name", record.teamName)],
          [FIELD_LABEL.box, value("box", record.box)],
          [FIELD_LABEL.competition, value("competition", competitionLabel(record.competition))],
          [FIELD_LABEL.category, value("category", record.category)],
          [FIELD_LABEL.status, value("status", STATUS_LABEL[record.status])],
          ["Tipo", record.kind === "dupla" ? `Dupla${record.partners[0] ? ` com ${record.partners[0].name}` : ""}` : "Individual"],
          [FIELD_LABEL.instagram, value("instagram", record.instagram)],
          [FIELD_LABEL.shirt_size, value("shirt_size", record.shirtSize)],
        ]}
      />
    </section>
  );
}

/** Termos arquivados e alterações feitas no painel. */
function History({ record }: { record: AthleteRecord }) {
  if (!record.archive.length && !record.audit.length) return null;
  return (
    <section className={`${card} flex flex-col gap-4 p-4 sm:p-5`} aria-labelledby="historico">
      <h2 id="historico" className="text-lg font-semibold">
        Histórico
      </h2>

      {record.archive.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Termos arquivados</h3>
          <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
            {record.archive.map((a) => (
              <li key={a.id} className="flex flex-col gap-0.5 px-4 py-3 text-sm">
                <span className="font-medium">
                  Assinado em {formatDateTime(a.signedAt)} · arquivado em {formatDateTime(a.archivedAt)}
                </span>
                <span className="text-cool-gray">
                  {RESET_REASONS[a.reason] ?? a.reason}
                  {a.reasonNote ? `: ${a.reasonNote}` : ""} · por {a.archivedByName ?? "Linha de comando"}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">Assinaturas e atestados dos termos arquivados continuam guardados no Storage privado.</p>
        </div>
      )}

      {record.audit.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Alterações</h3>
          <ol className="flex flex-col divide-y divide-line rounded-xl border border-line">
            {record.audit.map((row) => {
              const d = describeAthleteAudit(row);
              return (
                <li key={row.id} className="flex flex-col gap-1 px-4 py-3 text-sm">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="font-medium">{d.title}</span>
                    <span className="text-xs text-muted tabular-nums">
                      {formatDateTime(row.at)} · {auditActor(row)}
                    </span>
                  </span>
                  {d.lines.map((line) => (
                    <span key={line} className="break-words text-cool-gray [overflow-wrap:anywhere]">
                      {line}
                    </span>
                  ))}
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </section>
  );
}
