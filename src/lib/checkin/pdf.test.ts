import { PDFDocument, StandardFonts } from "pdf-lib";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { buildCheckinPdf, parqQuestionsFrom, pdfFileName, pdfSafe, sniffType, wrapText, type CheckinDocument } from "./pdf";
import { PARQ_QUESTIONS, termsSnapshot } from "./terms";

const png = (w = 300, h = 100) =>
  sharp({ create: { width: w, height: h, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).png().toBuffer().then((b) => new Uint8Array(b));
const jpg = () =>
  sharp({ create: { width: 800, height: 1100, channels: 3, background: { r: 240, g: 240, b: 240 } } }).jpeg().toBuffer().then((b) => new Uint8Array(b));
const webp = () =>
  sharp({ create: { width: 400, height: 500, channels: 3, background: { r: 200, g: 200, b: 200 } } }).webp().toBuffer().then((b) => new Uint8Array(b));

async function pdfWithPages(n: number) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < n; i++) doc.addPage();
  return doc.save();
}

function makeDoc(overrides: Partial<CheckinDocument["checkin"]> = {}, rest: Partial<CheckinDocument> = {}): CheckinDocument {
  return {
    athleteId: "a1",
    athleteName: "Ana Souza",
    teamName: "Equipe Ágil",
    kind: "dupla",
    box: "Box Centro",
    signature: null,
    guardianSignature: null,
    ...rest,
    checkin: {
      id: "c1",
      terms_version: "2026-11-02.1",
      terms_text: termsSnapshot("hibrido-games", "Dupla Mista"),
      full_name: "Ana Souza 💪",
      birth_date: "2000-05-09",
      phone: "(11) 99999-0000",
      email: "ana@example.com",
      emergency_name: "João Souza",
      emergency_phone: "(11) 98888-0000",
      competition: "Híbrido Games",
      category: "Dupla Mista",
      parq: [false, false, true, false, false, false, false, false, false, false],
      parq_any_yes: true,
      image_consent: true,
      is_minor: false,
      guardian_name: null,
      guardian_relation: null,
      guardian_phone: null,
      place: "São Paulo",
      certificate_name: "atestado.pdf",
      certificate_type: "application/pdf",
      certificate_size: 1234,
      verified_email: "ana@example.com",
      ip: "200.1.2.3",
      user_agent: "Mozilla/5.0 (iPhone)",
      signed_at: "2026-11-02T15:30:00Z",
      ...overrides,
    },
  };
}

const pageCount = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPageCount();

describe("PDF do check-in", () => {
  it("mantém acentos e troca o que a fonte não desenha", () => {
    expect(pdfSafe("São João — “ok” 💪 ✓")).toBe("São João — “ok” ? ?");
    expect(pdfSafe("linha\u0007\tfim")).toBe("linha fim");
  });

  it("quebra linhas dentro da largura, inclusive palavras enormes", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const lines = wrapText(`${"palavra ".repeat(40)}${"x".repeat(300)}`, font, 10, 200);
    expect(lines.length).toBeGreaterThan(5);
    for (const l of lines) expect(font.widthOfTextAtSize(l, 10)).toBeLessThanOrEqual(200);
  });

  it("identifica o tipo do arquivo pelos bytes", async () => {
    expect(sniffType(await png())).toBe("png");
    expect(sniffType(await jpg())).toBe("jpg");
    expect(sniffType(await pdfWithPages(1))).toBe("pdf");
    expect(sniffType(await webp())).toBe("other");
  });

  it("usa as perguntas do PAR-Q do texto aceito", () => {
    expect(parqQuestionsFrom(termsSnapshot("hibrido-race", "Individual"))).toEqual([...PARQ_QUESTIONS]);
    expect(parqQuestionsFrom("texto sem perguntas")).toEqual([...PARQ_QUESTIONS]);
  });

  it("gera o termo com assinatura e anexa as páginas do atestado em PDF", async () => {
    const withoutCert = await buildCheckinPdf([makeDoc({}, { signature: await png() })]);
    const termPages = await pageCount(withoutCert);
    expect(termPages).toBeGreaterThanOrEqual(2);

    const withCert = await buildCheckinPdf([makeDoc({}, { signature: await png(), certificate: await pdfWithPages(3) })]);
    expect(await pageCount(withCert)).toBe(termPages + 3);
  });

  it("anexa atestado em imagem, converte WEBP e avisa quando não consegue", async () => {
    const base = await pageCount(await buildCheckinPdf([makeDoc()]));
    expect(await pageCount(await buildCheckinPdf([makeDoc({}, { certificate: await jpg() })]))).toBe(base + 1);

    const converted = await buildCheckinPdf([makeDoc({}, { certificate: await webp() })], {
      convertImage: async (b) => new Uint8Array(await sharp(b).jpeg().toBuffer()),
    });
    expect(await pageCount(converted)).toBe(base + 1);

    // Sem conversão, arquivo ausente ou PDF corrompido: página de aviso no lugar do atestado.
    expect(await pageCount(await buildCheckinPdf([makeDoc({}, { certificate: await webp() })]))).toBe(base + 1);
    expect(await pageCount(await buildCheckinPdf([makeDoc({}, { certificate: null })]))).toBe(base + 1);
    const broken = new TextEncoder().encode("%PDF-1.7 quebrado");
    expect(await pageCount(await buildCheckinPdf([makeDoc({}, { certificate: broken })]))).toBe(base + 1);
  });

  it("inclui o responsável quando o atleta é menor", async () => {
    const bytes = await buildCheckinPdf([
      makeDoc(
        { is_minor: true, guardian_name: "Maria Souza", guardian_relation: "Mãe", guardian_phone: "(11) 97777-0000" },
        { signature: await png(), guardianSignature: await png() },
      ),
    ]);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getTitle()).toBe("Check-in — Ana Souza ?");
  });

  it("vários atletas: capa com índice antes dos termos", async () => {
    const one = await pageCount(await buildCheckinPdf([makeDoc()]));
    const docs = Array.from({ length: 3 }, (_, i) => makeDoc({ id: `c${i}`, full_name: `Atleta ${i}` }));
    const bytes = await buildCheckinPdf(docs, { title: "Check-in — Híbrido Games" });
    expect(await pageCount(bytes)).toBe(1 + one * 3);

    // Índice longo ocupa mais de uma página de capa.
    const many = Array.from({ length: 60 }, (_, i) => makeDoc({ id: `m${i}`, full_name: `Atleta ${i}` }));
    expect(await pageCount(await buildCheckinPdf(many))).toBe(2 + one * 60);
  }, 30_000);

  it("gera nomes de arquivo seguros", () => {
    expect(pdfFileName("check-in Ana Souza Ávila")).toBe("check-in-ana-souza-avila.pdf");
    expect(pdfFileName("💪")).toBe("documento.pdf");
  });
});
