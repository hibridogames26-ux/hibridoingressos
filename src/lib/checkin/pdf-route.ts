import "server-only";
import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { deliverPdf, ExportTooLargeError } from "./documents";

export const fail = (message: string, status: number) =>
  new NextResponse(message, { status, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" } });

/** Rotas de exportação: revalida o admin em toda chamada. */
export async function isAdmin() {
  const profile = await getCurrentProfile();
  return !!profile?.active && profile.role === "admin";
}

/** Responde com o PDF (download) ou redireciona para o link temporário quando ele é grande. */
export async function pdfResponse(bytes: Uint8Array, fileName: string) {
  try {
    const delivery = await deliverPdf(bytes, fileName);
    if (delivery.kind === "redirect") {
      return NextResponse.redirect(delivery.url, { status: 303, headers: { "Cache-Control": "no-store" } });
    }
    return new NextResponse(new Uint8Array(delivery.bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof ExportTooLargeError) {
      return fail("O PDF ficou grande demais. Filtre por competição ou exporte sem os atestados.", 413);
    }
    throw error;
  }
}
