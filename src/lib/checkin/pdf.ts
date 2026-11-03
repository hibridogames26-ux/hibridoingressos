// PDF dos documentos do check-in: termo assinado (texto aceito, respostas do PAR-Q,
// assinaturas e registro da assinatura eletrônica) seguido do atestado médico.
// Sem dependência do servidor: recebe os dados e os arquivos já carregados.

import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { formatDateTime } from "@/lib/format";
import { PARQ_QUESTIONS } from "./terms";

export type CheckinRecord = {
  id: string;
  terms_version: string;
  terms_text: string;
  full_name: string;
  birth_date: string;
  phone: string;
  email: string;
  emergency_name: string;
  emergency_phone: string;
  competition: string;
  category: string;
  parq: boolean[];
  parq_any_yes: boolean;
  image_consent: boolean;
  is_minor: boolean;
  guardian_name: string | null;
  guardian_relation: string | null;
  guardian_phone: string | null;
  place: string;
  certificate_name: string | null;
  certificate_type: string | null;
  certificate_size: number | null;
  verified_email: string;
  ip: string | null;
  user_agent: string | null;
  signed_at: string;
};

export type CheckinDocument = {
  athleteId: string;
  athleteName: string;
  teamName: string;
  kind: "dupla" | "individual";
  box: string | null;
  checkin: CheckinRecord;
  signature: Uint8Array | null;
  guardianSignature: Uint8Array | null;
  /** Atestado original; `null` = não foi possível baixar. Omitido = não incluir. */
  certificate?: Uint8Array | null;
};

export type PdfOptions = {
  /** Título da capa (só quando há mais de um documento). */
  title?: string;
  generatedAt?: Date;
  /** Converte imagens que o PDF não aceita (WEBP/HEIC) para JPEG. */
  convertImage?: (bytes: Uint8Array) => Promise<Uint8Array | null>;
};

// ---------------------------------------------------------------------------
// Texto: as fontes padrão do PDF usam WinAnsi (Latin-1 + alguns símbolos).
// ---------------------------------------------------------------------------
const WIN_ANSI_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");

/** Troca o que a fonte não consegue desenhar por "?" (emoji, outros alfabetos). */
export function pdfSafe(value: string) {
  let out = "";
  for (const ch of value.normalize("NFC").replace(/\t/g, " ")) {
    const code = ch.codePointAt(0)!;
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WIN_ANSI_EXTRA.has(ch)) out += ch;
    else if (ch === "\n") out += ch;
    else if (code < 0x20 || (code >= 0x7f && code < 0xa0)) continue;
    else out += "?";
  }
  return out;
}

/** Quebra o texto em linhas que cabem na largura (palavras longas são cortadas). */
export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of pdfSafe(text).split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }
    let line = "";
    for (let word of words) {
      while (font.widthOfTextAtSize(word, size) > maxWidth) {
        let cut = word.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(word.slice(0, cut), size) > maxWidth) cut--;
        if (line) {
          lines.push(line);
          line = "";
        }
        lines.push(word.slice(0, cut));
        word = word.slice(cut);
      }
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate;
      else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

/** Tipo real do arquivo pelos primeiros bytes. */
export function sniffType(bytes: Uint8Array): "pdf" | "jpg" | "png" | "other" {
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "pdf";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  return "other";
}

const formatBirthDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
};

/** Perguntas do PAR-Q como estavam no texto aceito (cai no texto atual se não achar). */
export function parqQuestionsFrom(termsText: string): string[] {
  const lines = termsText.split("\n");
  const start = lines.findIndex((l) => /PAR-Q/.test(l) && l === l.toUpperCase());
  const found: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const m = line.match(/^(\d+)\. (.+)$/);
    if (m && Number(m[1]) === found.length + 1) found.push(m[2]);
    else if (found.length) break;
  }
  return found.length === 10 ? found : [...PARQ_QUESTIONS];
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------
const A4: [number, number] = [595.28, 841.89];
const MARGIN = 50;
const FOOTER = 36;
const INK = rgb(0.06, 0.07, 0.08);
const MUTED = rgb(0.41, 0.42, 0.51);
const ACCENT = rgb(0.443, 0.196, 0.961);
const LINE = rgb(0.87, 0.87, 0.9);

class Writer {
  page!: PDFPage;
  y = 0;
  readonly width = A4[0] - MARGIN * 2;

  constructor(
    readonly doc: PDFDocument,
    readonly font: PDFFont,
    readonly bold: PDFFont,
  ) {}

  newPage() {
    this.page = this.doc.addPage(A4);
    this.y = A4[1] - MARGIN;
  }

  ensure(height: number) {
    if (this.y - height < MARGIN + FOOTER) this.newPage();
  }

  gap(h: number) {
    this.y -= h;
  }

  text(value: string, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; indent?: number; leading?: number } = {}) {
    const size = opts.size ?? 9.5;
    const font = opts.bold ? this.bold : this.font;
    const indent = opts.indent ?? 0;
    const leading = opts.leading ?? size * 1.38;
    for (const line of wrapText(value, font, size, this.width - indent)) {
      this.ensure(leading);
      this.y -= leading;
      if (line) this.page.drawText(line, { x: MARGIN + indent, y: this.y + leading - size, size, font, color: opts.color ?? INK });
    }
  }

  heading(value: string) {
    this.ensure(40);
    this.gap(10);
    this.text(value, { size: 12, bold: true, color: ACCENT });
    this.rule();
    this.gap(4);
  }

  rule() {
    this.y -= 4;
    this.page.drawLine({ start: { x: MARGIN, y: this.y }, end: { x: MARGIN + this.width, y: this.y }, thickness: 0.6, color: LINE });
  }

  /** Pares rótulo/valor em duas colunas. */
  facts(pairs: [string, string][]) {
    const colW = (this.width - 16) / 2;
    for (let i = 0; i < pairs.length; i += 2) {
      const row = pairs.slice(i, i + 2).map(([k, v]) => ({
        k: pdfSafe(k),
        v: wrapText(v || "—", this.bold, 9.5, colW),
      }));
      const h = 12 + Math.max(...row.map((c) => c.v.length)) * 13 + 6;
      this.ensure(h);
      row.forEach((cell, col) => {
        const x = MARGIN + col * (colW + 16);
        this.page.drawText(cell.k, { x, y: this.y - 9, size: 7.5, font: this.font, color: MUTED });
        cell.v.forEach((line, j) =>
          this.page.drawText(line, { x, y: this.y - 22 - j * 13, size: 9.5, font: this.bold, color: INK }),
        );
      });
      this.y -= h;
    }
  }

  image(img: PDFImage, maxW: number, maxH: number, opts: { border?: boolean } = {}) {
    const scale = Math.min(maxW / img.width, maxH / img.height, 1);
    const w = img.width * scale;
    const h = img.height * scale;
    const pad = opts.border ? 8 : 0;
    this.ensure(h + 8 + pad);
    this.y -= h + pad;
    if (opts.border) {
      this.page.drawRectangle({ x: MARGIN - 4, y: this.y - 4, width: maxW + 8, height: h + 8, borderColor: LINE, borderWidth: 0.6 });
    }
    this.page.drawImage(img, { x: MARGIN, y: this.y, width: w, height: h });
    this.y -= 8;
  }
}

async function embedImage(doc: PDFDocument, bytes: Uint8Array) {
  const type = sniffType(bytes);
  if (type === "png") return doc.embedPng(bytes);
  if (type === "jpg") return doc.embedJpg(bytes);
  return null;
}

// ---------------------------------------------------------------------------
// Documento de um atleta
// ---------------------------------------------------------------------------
async function writeTerm(w: Writer, d: CheckinDocument) {
  const c = d.checkin;
  w.newPage();
  const titleLine = c.terms_text.split("\n")[0] || "PAR-Q E TERMO DE RESPONSABILIDADE";
  w.text(titleLine, { size: 14, bold: true });
  w.text(`${c.competition} · ${c.category} · Versão do termo ${c.terms_version}`, { size: 9, color: MUTED });
  w.gap(6);

  w.heading("Identificação");
  w.facts([
    ["Nome completo", c.full_name],
    ["Data de nascimento", formatBirthDate(c.birth_date)],
    ["Telefone", c.phone],
    ["E-mail", c.email],
    ["Contato de emergência", c.emergency_name],
    ["Telefone de emergência", c.emergency_phone],
    ["Equipe / inscrição", `${d.teamName} (${d.kind === "dupla" ? "dupla" : "individual"})`],
    ["Box", d.box ?? "—"],
    ["Competição", c.competition],
    ["Categoria", c.category],
    ...(c.is_minor
      ? ([
          ["Responsável legal", c.guardian_name ?? "—"],
          ["Parentesco / telefone", `${c.guardian_relation ?? "—"} · ${c.guardian_phone ?? "—"}`],
        ] as [string, string][])
      : []),
  ]);

  w.heading("PAR-Q — respostas");
  if (c.parq_any_yes) {
    w.text("Atenção: há resposta “Sim” no PAR-Q.", { bold: true, color: rgb(0.75, 0.1, 0.1) });
    w.gap(2);
  }
  parqQuestionsFrom(c.terms_text).forEach((q, i) => {
    w.text(`${i + 1}. ${q}`, { size: 9 });
    w.text(`Resposta: ${c.parq[i] ? "Sim" : "Não"}`, { size: 9, bold: true, indent: 12 });
    w.gap(3);
  });

  w.heading(`Termo aceito — texto integral (versão ${c.terms_version})`);
  for (const line of c.terms_text.split("\n")) {
    const isTitle = /[A-ZÀ-Ý]/.test(line) && line === line.toUpperCase();
    if (!line.trim()) w.gap(5);
    else w.text(line, { size: isTitle ? 9.5 : 8.5, bold: isTitle });
  }

  w.heading("Autorização de uso de imagem");
  w.text(c.image_consent ? "Sim — autorizou o uso de imagem, voz e nome (Arts. 14º e 15º)." : "Não autorizou o uso de imagem.", {
    bold: true,
  });

  w.heading("Assinaturas");
  const signatureBlock = async (bytes: Uint8Array | null, label: string, name: string) => {
    w.ensure(130);
    w.text(label, { size: 8, color: MUTED });
    const img = bytes ? await embedImage(w.doc, bytes).catch(() => null) : null;
    if (img) w.image(img, 240, 90, { border: true });
    else w.text("(assinatura indisponível)", { color: MUTED });
    w.text(name, { bold: true });
    w.gap(8);
  };
  await signatureBlock(d.signature, "Assinatura do participante", c.full_name);
  if (c.is_minor) await signatureBlock(d.guardianSignature, "Assinatura do responsável legal", c.guardian_name ?? "Responsável");
  w.text(`${c.place}, ${formatDateTime(c.signed_at)}`, { size: 9 });

  w.ensure(130); // mantém o registro inteiro na mesma página
  w.heading("Registro da assinatura eletrônica");
  w.facts([
    ["E-mail confirmado por código", c.verified_email],
    ["Data e hora (Brasília)", formatDateTime(c.signed_at)],
    ["Endereço IP", c.ip ?? "—"],
    ["ID do check-in", c.id],
  ]);
  w.text(`Navegador: ${c.user_agent ?? "—"}`, { size: 7.5, color: MUTED });
}

async function writeCertificate(w: Writer, d: CheckinDocument, opts: PdfOptions) {
  const c = d.checkin;
  const label = `Atestado médico — ${c.full_name}`;
  const note = (message: string) => {
    w.newPage();
    w.text(label, { size: 14, bold: true });
    w.gap(8);
    w.text(message);
    w.text(`Arquivo: ${c.certificate_name ?? "—"} (${c.certificate_type ?? "tipo desconhecido"})`, { size: 9, color: MUTED });
  };

  const bytes = d.certificate;
  if (!bytes) return note("Não foi possível carregar o atestado. Baixe o arquivo original pelo dashboard.");

  const type = sniffType(bytes);
  if (type === "pdf") {
    try {
      const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const pages = await w.doc.copyPages(src, src.getPageIndices());
      pages.forEach((p) => w.doc.addPage(p));
      return;
    } catch {
      return note("O atestado é um PDF que não pôde ser incorporado (protegido ou corrompido). Baixe o arquivo original pelo dashboard.");
    }
  }

  let img: PDFImage | null = null;
  try {
    img = await embedImage(w.doc, bytes);
    if (!img && opts.convertImage) {
      const jpg = await opts.convertImage(bytes);
      if (jpg) img = await embedImage(w.doc, jpg);
    }
  } catch {
    img = null;
  }
  if (!img) return note("O formato do atestado não pode ser exibido no PDF. Baixe o arquivo original pelo dashboard.");

  w.newPage();
  w.text(label, { size: 12, bold: true });
  w.gap(6);
  w.image(img, w.width, w.y - MARGIN - FOOTER - 10);
}

// ---------------------------------------------------------------------------
// Montagem final: capa (vários atletas), documentos e rodapé com paginação
// ---------------------------------------------------------------------------
export async function buildCheckinPdf(docs: CheckinDocument[], opts: PdfOptions = {}): Promise<Uint8Array> {
  const generatedAt = opts.generatedAt ?? new Date();
  const body = await PDFDocument.create();
  const font = await body.embedFont(StandardFonts.Helvetica);
  const bold = await body.embedFont(StandardFonts.HelveticaBold);
  const w = new Writer(body, font, bold);

  const starts: number[] = [];
  for (const d of docs) {
    starts.push(body.getPageCount());
    await writeTerm(w, d);
    if (d.certificate !== undefined) await writeCertificate(w, d, opts);
  }

  let out = body;
  let offset = 0;
  if (docs.length > 1) {
    // Capa com índice. Duas passadas: a primeira descobre quantas páginas a capa ocupa,
    // a segunda escreve os números de página definitivos.
    const renderCover = async (coverPages: number) => {
      const doc = await PDFDocument.create();
      const cover = new Writer(doc, await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold));
      cover.newPage();
      cover.text(opts.title ?? "Documentos do check-in", { size: 16, bold: true });
      cover.text(`${docs.length} atletas · gerado em ${formatDateTime(generatedAt)}`, { size: 9, color: MUTED });
      cover.gap(10);
      docs.forEach((d, i) => {
        cover.ensure(14);
        const y = cover.y - 10;
        const pageLabel = `pág. ${starts[i] + coverPages + 1}`;
        const name = `${d.checkin.full_name} — ${d.teamName} · ${d.checkin.competition} · ${d.checkin.category}`;
        const line = wrapText(name, cover.font, 9, cover.width - 60)[0] ?? "";
        cover.page.drawText(line, { x: MARGIN, y, size: 9, font: cover.font, color: INK });
        cover.page.drawText(pageLabel, {
          x: MARGIN + cover.width - cover.font.widthOfTextAtSize(pageLabel, 9),
          y,
          size: 9,
          font: cover.font,
          color: MUTED,
        });
        cover.y -= 14;
      });
      return doc;
    };
    const draft = await renderCover(1);
    offset = draft.getPageCount();
    out = offset === 1 ? draft : await renderCover(offset);
    const copied = await out.copyPages(body, body.getPageIndices());
    copied.forEach((p) => out.addPage(p));
  }

  const footerFont = await out.embedFont(StandardFonts.Helvetica);
  const pages = out.getPages();
  const owners = docs.map((d, i) => ({ start: starts[i] + offset, name: d.checkin.full_name }));
  pages.forEach((page, index) => {
    const owner = [...owners].reverse().find((o) => o.start <= index);
    const left = pdfSafe(owner && index >= offset ? `Check-in · ${owner.name}` : "Check-in do atleta");
    const right = `Gerado em ${formatDateTime(generatedAt)} · página ${index + 1} de ${pages.length}`;
    const { width } = page.getSize();
    // Fundo branco: nas páginas do atestado (PDF do atleta) o rodapé fica sobre o conteúdo original.
    page.drawRectangle({ x: 0, y: 12, width, height: 22, color: rgb(1, 1, 1) });
    page.drawText(wrapText(left, footerFont, 7.5, width / 2 - MARGIN)[0] ?? "", { x: MARGIN, y: 22, size: 7.5, font: footerFont, color: MUTED });
    page.drawText(right, { x: width - MARGIN - footerFont.widthOfTextAtSize(right, 7.5), y: 22, size: 7.5, font: footerFont, color: MUTED });
  });

  out.setTitle(pdfSafe(docs.length === 1 ? `Check-in — ${docs[0].checkin.full_name}` : (opts.title ?? "Documentos do check-in")));
  out.setCreator("Híbrido Games — Dashboard");
  out.setCreationDate(generatedAt);
  return out.save();
}

/** Nome de arquivo seguro: sem acentos, minúsculo, com hífens. */
export function pdfFileName(base: string) {
  const slug = base
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${slug || "documento"}.pdf`;
}
