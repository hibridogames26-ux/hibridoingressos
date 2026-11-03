import type { NextRequest } from "next/server";
import { convertImageToJpeg, getAthleteDocuments, loadPdfDocuments } from "@/lib/checkin/documents";
import { buildCheckinPdf, pdfFileName } from "@/lib/checkin/pdf";
import { fail, isAdmin, pdfResponse } from "@/lib/checkin/pdf-route";

export const maxDuration = 60;

/** PDF do termo assinado de um atleta, com o atestado anexado. */
export async function GET(_: NextRequest, { params }: RouteContext<"/admin/documentos/[id]/pdf">) {
  if (!(await isAdmin())) return fail("Não autorizado", 403);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail("Atleta não encontrado", 404);

  try {
    const [doc] = await getAthleteDocuments([id]);
    if (!doc?.checkin) return fail("Este atleta ainda não fez o check-in.", 404);
    const [pdfDoc] = await loadPdfDocuments([doc], true);
    const bytes = await buildCheckinPdf([pdfDoc], { convertImage: convertImageToJpeg });
    return await pdfResponse(bytes, pdfFileName(`check-in ${doc.checkin.full_name}`));
  } catch (error) {
    console.error("Error in PDF do check-in:", error);
    return fail(`Falha ao gerar o PDF: ${error instanceof Error ? error.message : error}`, 500);
  }
}
