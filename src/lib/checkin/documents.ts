import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { auditForAthlete, type AthleteAuditRow, type RegistrationOrigin, type RegistrationStatus, type ResetReason } from "./admin";
import type { CheckinDocument, CheckinRecord } from "./pdf";
import { CHECKIN_BUCKET } from "./service";
import { displayName, fold, type Competition } from "./sheet";
import { COMPETITION_LABEL } from "./terms";

// ---------------------------------------------------------------------------
// Lista do dashboard (leitura com a sessão do admin: RLS "admin lê ...")
// ---------------------------------------------------------------------------
export type DocumentStatus = "confirmado" | "pendente";

export type DocumentFilters = {
  q: string;
  competition: Competition | null;
  status: DocumentStatus | null;
};

export function parseDocumentFilters(params: Record<string, string | string[] | undefined>): DocumentFilters {
  const get = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : "");
  const competition = get("competicao");
  const status = get("situacao");
  return {
    q: get("q").trim().slice(0, 100),
    competition: competition === "hibrido-games" || competition === "hibrido-race" ? competition : null,
    status: status === "confirmado" || status === "pendente" ? status : null,
  };
}

export function filtersQuery(filters: DocumentFilters, extra: Record<string, string> = {}) {
  const sp = new URLSearchParams();
  if (filters.q) sp.set("q", filters.q);
  if (filters.competition) sp.set("competicao", filters.competition);
  if (filters.status) sp.set("situacao", filters.status);
  for (const [k, v] of Object.entries(extra)) sp.set(k, v);
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export type DocumentRow = {
  athleteId: string;
  name: string;
  teamName: string;
  kind: "dupla" | "individual";
  box: string | null;
  competition: Competition;
  category: string;
  checkin: { id: string; signedAt: string; parqAnyYes: boolean; isMinor: boolean; certificateType: string | null } | null;
  /** Check-in refeito pela organização: há termo arquivado (Story 4.4). */
  reopened: boolean;
  /** Cadastro feito no painel (Story 4.5). */
  origin: RegistrationOrigin;
};

type Embedded<T> = T | T[] | null;
const one = <T,>(value: Embedded<T>) => (Array.isArray(value) ? (value[0] ?? null) : value);

const isMissingTable = (error: { code?: string } | null) => error?.code === "42P01" || error?.code === "PGRST205";
/** Coluna ausente: migration mais nova ainda não aplicada. */
const isMissingColumn = (error: { code?: string } | null) => error?.code === "42703" || error?.code === "PGRST204";

const LIST_ATHLETES = "athletes(id, full_name, position, athlete_checkins(id, signed_at, parq_any_yes, is_minor, certificate_type)";

type ListRow = {
  competition: string;
  category: string;
  team_name: string;
  kind: string;
  box: string | null;
  origin?: string;
  athletes:
    | {
        id: string;
        full_name: string;
        position: number;
        athlete_checkins: Embedded<{ id: string; signed_at: string; parq_any_yes: boolean; is_minor: boolean; certificate_type: string | null }>;
        athlete_checkins_archive?: unknown[];
      }[]
    | null;
};

export async function listDocuments(): Promise<DocumentRow[] | "unavailable"> {
  const supabase = await createClient();
  // full: colunas e tabelas das Stories 4.4 e 4.5 (termo arquivado e origem do cadastro).
  // As colunas variam com as migrations aplicadas: o resultado é tipado à mão.
  const query = async (full: boolean) => {
    const columns: string = `id, competition, category, team_name, kind, box${full ? ", origin" : ""}, ${LIST_ATHLETES}${full ? ", athlete_checkins_archive(id)" : ""})`;
    const { data, error } = await supabase
      .from("athlete_registrations")
      .select(columns)
      .eq("status", "aprovado")
      .order("competition")
      .order("category")
      .order("team_name");
    return { data: data as unknown as ListRow[] | null, error };
  };
  let { data, error } = await query(true);
  // Banco sem as migrations das Stories 4.4/4.5: lista sem os selos de check-in reaberto e cadastro manual.
  if (isMissingTable(error) || isMissingColumn(error) || error?.code === "PGRST200") ({ data, error } = await query(false));
  if (isMissingTable(error)) return "unavailable";
  if (error) throw new Error(`Falha ao carregar documentos: ${error.message}`);

  return (data ?? []).flatMap((r) =>
    [...(r.athletes ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((a) => {
        const c = one(a.athlete_checkins);
        return {
          athleteId: a.id,
          name: displayName(a.full_name),
          teamName: r.team_name,
          kind: r.kind as DocumentRow["kind"],
          box: r.box?.trim() || null,
          competition: r.competition as Competition,
          category: r.category,
          checkin: c
            ? {
                id: c.id,
                signedAt: c.signed_at,
                parqAnyYes: c.parq_any_yes,
                isMinor: c.is_minor,
                certificateType: c.certificate_type,
              }
            : null,
          reopened: (a.athlete_checkins_archive ?? []).length > 0,
          origin: (r.origin === "manual" ? "manual" : "planilha") as RegistrationOrigin,
        };
      }),
  );
}

export function filterDocuments(rows: DocumentRow[], filters: DocumentFilters) {
  const q = fold(filters.q);
  return rows.filter((r) => {
    if (filters.competition && r.competition !== filters.competition) return false;
    if (filters.status === "confirmado" && !r.checkin) return false;
    if (filters.status === "pendente" && r.checkin) return false;
    if (q && !fold(`${r.name} ${r.teamName} ${r.box ?? ""} ${r.category}`).includes(q)) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Documento completo de um atleta
// ---------------------------------------------------------------------------
const CHECKIN_COLUMNS_BASE =
  "id, terms_version, terms_text, full_name, birth_date, phone, email, emergency_name, emergency_phone, competition, category, parq, parq_any_yes, image_consent, is_minor, guardian_name, guardian_relation, guardian_phone, place, signature_path, guardian_signature_path, certificate_path, certificate_name, certificate_type, certificate_size, verified_email, ip, user_agent, signed_at";
const CHECKIN_COLUMNS = `${CHECKIN_COLUMNS_BASE}, recorded_by_name`;

export type CheckinRow = CheckinRecord & {
  signature_path: string;
  guardian_signature_path: string | null;
  certificate_path: string;
};

export type AthleteDocument = Omit<DocumentRow, "checkin" | "reopened" | "origin"> & { checkin: CheckinRow | null };

export async function getAthleteDocuments(athleteIds: string[]): Promise<AthleteDocument[]> {
  if (!athleteIds.length) return [];
  const supabase = await createClient();
  type Row = {
    id: string;
    full_name: string;
    athlete_registrations: Embedded<{ competition: string; category: string; team_name: string; kind: string; box: string | null }>;
    athlete_checkins: Embedded<CheckinRow>;
  };
  const select = async (checkinColumns: string) => {
    const columns: string = `id, full_name, athlete_registrations!inner(competition, category, team_name, kind, box), athlete_checkins(${checkinColumns})`;
    const { data, error } = await supabase.from("athletes").select(columns).in("id", athleteIds);
    return { data: data as unknown as Row[] | null, error };
  };
  let { data, error } = await select(CHECKIN_COLUMNS);
  // Banco sem a migration da Story 4.5: sem o registro do check-in presencial.
  if (isMissingColumn(error)) ({ data, error } = await select(CHECKIN_COLUMNS_BASE));
  if (error) throw new Error(`Falha ao carregar o check-in: ${error.message}`);

  const byId = new Map(
    (data ?? []).map((a) => {
      const reg = one(a.athlete_registrations)!;
      const doc: AthleteDocument = {
        athleteId: a.id,
        name: displayName(a.full_name),
        teamName: reg.team_name,
        kind: reg.kind as DocumentRow["kind"],
        box: reg.box?.trim() || null,
        competition: reg.competition as Competition,
        category: reg.category,
        checkin: one(a.athlete_checkins),
      };
      return [a.id, doc];
    }),
  );
  // Mantém a ordem pedida.
  return athleteIds.map((id) => byId.get(id)).filter((d): d is AthleteDocument => !!d);
}

// ---------------------------------------------------------------------------
// Cadastro, histórico e termos arquivados (Story 4.4)
// ---------------------------------------------------------------------------
export type ArchivedCheckin = {
  id: string;
  signedAt: string;
  reason: ResetReason;
  reasonNote: string | null;
  archivedAt: string;
  archivedByName: string | null;
};

export type AthleteRecord = {
  athleteId: string;
  registrationId: string;
  fullName: string;
  instagram: string | null;
  shirtSize: string | null;
  email: string;
  phone: string | null;
  teamName: string;
  box: string | null;
  competition: Competition;
  category: string;
  status: RegistrationStatus;
  kind: "dupla" | "individual";
  origin: RegistrationOrigin;
  /** Campos corrigidos no painel (a importação não os sobrescreve). */
  editedFields: string[];
  partners: { id: string; name: string }[];
  /** Categorias já usadas, para sugerir no formulário. */
  categories: Record<Competition, string[]>;
  audit: AthleteAuditRow[];
  archive: ArchivedCheckin[];
  /** Migration da Story 4.4 ainda não aplicada: edição e reset indisponíveis. */
  migrationPending: boolean;
  /** Migration da Story 4.5 ainda não aplicada: exclusão e check-in presencial indisponíveis. */
  adminCreatePending: boolean;
};

export async function getAthleteRecord(athleteId: string): Promise<AthleteRecord | null> {
  const supabase = await createClient();
  // level 2: colunas das Stories 4.4 e 4.5; 1: só 4.4; 0: nenhuma.
  const select = (level: 0 | 1 | 2) =>
    supabase
      .from("athletes")
      .select(
        `id, full_name, instagram, shirt_size${level ? ", admin_edited_fields" : ""}, athlete_registrations!inner(id, competition, category, team_name, kind, email, phone, box, status${level ? ", admin_edited_fields" : ""}${level === 2 ? ", origin" : ""}, athletes(id, full_name, position))`,
      )
      .eq("id", athleteId)
      .maybeSingle();
  let migrationPending = false;
  let adminCreatePending = false;
  let { data, error } = await select(2);
  if (isMissingColumn(error)) {
    adminCreatePending = true;
    ({ data, error } = await select(1));
  }
  if (isMissingColumn(error)) {
    migrationPending = true;
    ({ data, error } = await select(0));
  }
  if (error) throw new Error(`Falha ao carregar o cadastro: ${error.message}`);
  if (!data) return null;

  type Reg = {
    id: string;
    competition: string;
    category: string;
    team_name: string;
    kind: string;
    email: string;
    phone: string | null;
    box: string | null;
    status: string;
    admin_edited_fields?: string[];
    origin?: string;
    athletes: { id: string; full_name: string; position: number }[];
  };
  const a = data as unknown as {
    id: string;
    full_name: string;
    instagram: string | null;
    shirt_size: string | null;
    admin_edited_fields?: string[];
    athlete_registrations: Embedded<Reg>;
  };
  const reg = one(a.athlete_registrations)!;

  const [cats, audit, archive] = await Promise.all([
    supabase.from("athlete_registrations").select("competition, category"),
    migrationPending
      ? null
      : supabase
          .from("athlete_audit_log")
          .select("id, at, actor_name, kind, detail, athlete_id")
          .or(`athlete_id.eq.${a.id},registration_id.eq.${reg.id}`)
          .order("at", { ascending: false })
          .limit(50),
    migrationPending
      ? null
      : supabase
          .from("athlete_checkins_archive")
          .select("id, signed_at, reason, reason_note, archived_at, archived_by_name")
          .eq("athlete_id", a.id)
          .order("archived_at", { ascending: false }),
  ]);
  if (audit?.error && !isMissingTable(audit.error)) throw new Error(`Falha ao carregar o histórico: ${audit.error.message}`);
  if (archive?.error && !isMissingTable(archive.error)) throw new Error(`Falha ao carregar termos arquivados: ${archive.error.message}`);
  if (isMissingTable(audit?.error ?? null) || isMissingTable(archive?.error ?? null)) migrationPending = true;

  const categories: Record<Competition, string[]> = { "hibrido-games": [], "hibrido-race": [] };
  for (const row of cats.data ?? []) {
    const list = categories[row.competition as Competition];
    if (list && !list.includes(row.category)) list.push(row.category);
  }
  for (const list of Object.values(categories)) list.sort((x, y) => x.localeCompare(y, "pt-BR"));

  return {
    athleteId: a.id,
    registrationId: reg.id,
    fullName: a.full_name,
    instagram: a.instagram,
    shirtSize: a.shirt_size,
    email: reg.email,
    phone: reg.phone,
    teamName: reg.team_name,
    box: reg.box,
    competition: reg.competition as Competition,
    category: reg.category,
    status: reg.status as RegistrationStatus,
    kind: reg.kind as AthleteRecord["kind"],
    origin: reg.origin === "manual" ? "manual" : "planilha",
    editedFields: [...(a.admin_edited_fields ?? []), ...(reg.admin_edited_fields ?? [])],
    partners: [...(reg.athletes ?? [])]
      .filter((p) => p.id !== a.id)
      .sort((x, y) => x.position - y.position)
      .map((p) => ({ id: p.id, name: displayName(p.full_name) })),
    categories,
    audit: migrationPending ? [] : auditForAthlete((audit?.data ?? []) as (AthleteAuditRow & { athlete_id: string | null })[], a.id),
    archive: migrationPending
      ? []
      : (archive?.data ?? []).map((r) => ({
          id: r.id,
          signedAt: r.signed_at,
          reason: r.reason as ResetReason,
          reasonNote: r.reason_note,
          archivedAt: r.archived_at,
          archivedByName: r.archived_by_name,
        })),
    migrationPending,
    adminCreatePending: adminCreatePending || migrationPending,
  };
}

// ---------------------------------------------------------------------------
// Arquivos no Storage privado (service role, chamado só depois de checar o admin)
// ---------------------------------------------------------------------------
const storage = () => createAdminClient().storage.from(CHECKIN_BUCKET);

/** URLs temporárias para ver assinaturas e o atestado no dashboard. */
export async function signedFileUrls(checkin: CheckinRow, expiresIn = 600) {
  const paths = [checkin.signature_path, checkin.guardian_signature_path, checkin.certificate_path].filter(
    (p): p is string => !!p,
  );
  const { data, error } = await storage().createSignedUrls(paths, expiresIn);
  if (error) throw new Error(`Falha ao gerar links dos arquivos: ${error.message}`);
  const url = (path: string | null) => (path ? (data?.find((d) => d.path === path)?.signedUrl ?? null) : null);
  const { data: download } = await storage().createSignedUrl(checkin.certificate_path, expiresIn, {
    download: checkin.certificate_name || true,
  });
  return {
    signature: url(checkin.signature_path),
    guardianSignature: url(checkin.guardian_signature_path),
    certificate: url(checkin.certificate_path),
    certificateDownload: download?.signedUrl ?? null,
  };
}

async function download(path: string | null): Promise<Uint8Array | null> {
  if (!path) return null;
  const { data, error } = await storage().download(path);
  if (error || !data) {
    console.error(`Falha ao baixar ${path}:`, error?.message);
    return null;
  }
  return new Uint8Array(await data.arrayBuffer());
}

/** Dados + arquivos prontos para o PDF. Só atletas com check-in. */
export async function loadPdfDocuments(docs: AthleteDocument[], withCertificates: boolean): Promise<CheckinDocument[]> {
  const confirmed = docs.filter((d): d is AthleteDocument & { checkin: CheckinRow } => !!d.checkin);
  const out: CheckinDocument[] = [];
  // Em lotes pequenos, para não abrir dezenas de downloads ao mesmo tempo.
  for (let i = 0; i < confirmed.length; i += 6) {
    const batch = await Promise.all(
      confirmed.slice(i, i + 6).map(async (d) => {
        const [signature, guardianSignature, certificate] = await Promise.all([
          download(d.checkin.signature_path),
          download(d.checkin.guardian_signature_path),
          withCertificates ? download(d.checkin.certificate_path) : Promise.resolve(undefined),
        ]);
        return {
          athleteId: d.athleteId,
          athleteName: d.name,
          teamName: d.teamName,
          kind: d.kind,
          box: d.box,
          checkin: { ...d.checkin, parq: (d.checkin.parq ?? []).map(Boolean) },
          signature,
          guardianSignature,
          ...(withCertificates ? { certificate: certificate ?? null } : {}),
        } satisfies CheckinDocument;
      }),
    );
    out.push(...batch);
  }
  return out;
}

/** WEBP (e outros formatos que o sharp entende) → JPEG para entrar no PDF. HEIC costuma não ser suportado. */
export async function convertImageToJpeg(bytes: Uint8Array): Promise<Uint8Array | null> {
  try {
    const { default: sharp } = await import("sharp");
    const out = await sharp(bytes).rotate().jpeg({ quality: 85 }).toBuffer();
    return new Uint8Array(out);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Entrega do PDF. Respostas grandes vão pelo Storage (limite de resposta das funções da Vercel).
// ---------------------------------------------------------------------------
const DIRECT_LIMIT = 4 * 1024 * 1024;
const EXPORT_BUCKET = "admin-exports";
const EXPORT_LIMIT = 50 * 1024 * 1024;

export class ExportTooLargeError extends Error {}

async function ensureExportBucket() {
  const admin = createAdminClient();
  const { data } = await admin.storage.getBucket(EXPORT_BUCKET);
  if (data) return;
  const { error } = await admin.storage.createBucket(EXPORT_BUCKET, {
    public: false,
    fileSizeLimit: EXPORT_LIMIT,
    allowedMimeTypes: ["application/pdf"],
  });
  if (error && !/exists/i.test(error.message)) throw new Error(`Falha ao criar o bucket de exportação: ${error.message}`);
}

/** Apaga exportações com mais de 1 hora: o PDF tem dados pessoais e de saúde. */
async function purgeOldExports() {
  const bucket = createAdminClient().storage.from(EXPORT_BUCKET);
  const { data } = await bucket.list("", { limit: 1000 });
  const cutoff = Date.now() - 60 * 60 * 1000;
  const old = (data ?? []).filter((f) => f.created_at && new Date(f.created_at).getTime() < cutoff).map((f) => f.name);
  if (old.length) await bucket.remove(old);
}

export type PdfDelivery = { kind: "inline"; bytes: Uint8Array } | { kind: "redirect"; url: string };

export async function deliverPdf(bytes: Uint8Array, fileName: string): Promise<PdfDelivery> {
  if (bytes.length <= DIRECT_LIMIT) return { kind: "inline", bytes };
  if (bytes.length > EXPORT_LIMIT) throw new ExportTooLargeError("PDF grande demais");

  await ensureExportBucket();
  await purgeOldExports().catch((e) => console.error("Falha ao limpar exportações antigas:", e));
  const bucket = createAdminClient().storage.from(EXPORT_BUCKET);
  const path = `${Date.now()}-${randomUUID()}.pdf`;
  const { error } = await bucket.upload(path, bytes, { contentType: "application/pdf", upsert: false });
  if (error) throw new Error(`Falha ao salvar a exportação: ${error.message}`);
  const { data, error: urlError } = await bucket.createSignedUrl(path, 600, { download: fileName });
  if (urlError || !data) throw new Error(`Falha ao gerar o link da exportação: ${urlError?.message}`);
  return { kind: "redirect", url: data.signedUrl };
}

export const competitionLabel = (c: Competition) => COMPETITION_LABEL[c];
