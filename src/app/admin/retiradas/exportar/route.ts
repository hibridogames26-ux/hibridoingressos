import { NextResponse, type NextRequest } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { listPickups } from "@/lib/pickups/list";
import { filterPickups, parsePickupFilters } from "@/lib/pickups/rows";
import { buildPickupWorkbook } from "@/lib/pickups/xlsx";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const fail = (message: string, status: number) =>
  new NextResponse(message, { status, headers: { "Cache-Control": "no-store" } });

/** Exporta a lista de retirada em .xlsx, com os mesmos filtros da tela (Story 4.6). */
export async function GET(request: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile?.active || profile.role !== "admin") return fail("Não autorizado", 403);

  try {
    const filters = parsePickupFilters(Object.fromEntries(request.nextUrl.searchParams));
    const all = await listPickups();
    if (all === "unavailable") return fail("A tabela da retirada de camisas ainda não foi criada. Aplique as migrations.", 409);

    const buffer = await buildPickupWorkbook({ rows: filterPickups(all, filters), all });
    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": XLSX,
        "Content-Disposition": `attachment; filename="retirada-de-camisas-${stamp}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Error in exportar retiradas de camisa:", error);
    return fail("Falha ao exportar a lista de retirada. Tente de novo.", 500);
  }
}
