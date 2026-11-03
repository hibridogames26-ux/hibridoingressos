import type { NextRequest } from "next/server";
import {
  competitionLabel,
  convertImageToJpeg,
  filterDocuments,
  getAthleteDocuments,
  listDocuments,
  loadPdfDocuments,
  parseDocumentFilters,
} from "@/lib/checkin/documents";
import { buildCheckinPdf, pdfFileName } from "@/lib/checkin/pdf";
import { fail, isAdmin, pdfResponse } from "@/lib/checkin/pdf-route";

export const maxDuration = 300;

const MAX_ATHLETES = 200;

/** PDF único com os termos dos atletas confirmados no filtro atual (`?atestados=1` anexa os atestados). */
export async function GET(request: NextRequest) {
  if (!(await isAdmin())) return fail("Não autorizado", 403);

  const params = Object.fromEntries(request.nextUrl.searchParams);
  const filters = parseDocumentFilters(params);
  const withCertificates = params.atestados === "1";

  try {
    const rows = await listDocuments();
    if (rows === "unavailable") return fail("As tabelas do check-in ainda não foram criadas. Aplique as migrations.", 409);
    const confirmed = filterDocuments(rows, filters).filter((r) => r.checkin);
    if (!confirmed.length) return fail("Nenhum check-in confirmado neste filtro.", 404);
    if (confirmed.length > MAX_ATHLETES) {
      return fail(`Muitos atletas (${confirmed.length}). Filtre para exportar até ${MAX_ATHLETES} por vez.`, 422);
    }

    const docs = await getAthleteDocuments(confirmed.map((r) => r.athleteId));
    const pdfDocs = await loadPdfDocuments(docs, withCertificates);
    const scope = filters.competition ? competitionLabel(filters.competition) : "Todas as competições";
    const bytes = await buildCheckinPdf(pdfDocs, {
      title: `Check-in dos atletas — ${scope}`,
      convertImage: convertImageToJpeg,
    });
    const stamp = new Date().toISOString().slice(0, 10);
    const name = `check-in ${filters.competition ?? "todos"} ${withCertificates ? "termos e atestados" : "termos"} ${stamp}`;
    return await pdfResponse(bytes, pdfFileName(name));
  } catch (error) {
    console.error("Error in exportar documentos do check-in:", error);
    return fail(`Falha ao gerar o PDF: ${error instanceof Error ? error.message : error}`, 500);
  }
}
