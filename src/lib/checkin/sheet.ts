// Leitura das planilhas exportadas pela plataforma de inscrição (.xls que na verdade é uma tabela HTML).
// Sem imports com "@/": este arquivo também é usado pelo script de importação (Node puro).

export type Competition = "hibrido-games" | "hibrido-race";

export type SheetRow = {
  competition: Competition;
  category: string;
  /** Texto da coluna "Inscrição/Equipe", como veio da planilha. */
  registrationRaw: string;
  type: string;
  athleteName: string;
  shirtSize: string;
  instagram: string;
  box: string;
  email: string;
  phone: string;
  status: "aprovado" | "cancelado";
  /** "dd/mm/aaaa" → "aaaa-mm-dd"; vazio se ausente. */
  registeredOn: string;
};

export type ParsedRegistration = {
  sourceKey: string;
  competition: Competition;
  category: string;
  teamName: string;
  kind: "dupla" | "individual";
  email: string;
  phone: string;
  box: string;
  status: "aprovado" | "cancelado";
  registeredOn: string | null;
  athletes: { sourceKey: string; fullName: string; instagram: string; shirtSize: string; position: number }[];
};

const HEADERS = [
  "Evento",
  "Categoria",
  "Inscrição/Equipe",
  "Tipo",
  "Atleta/Integrante",
  "Tamanho da Camisa",
  "Instagram",
  "Box/Academia",
  "E-mail",
  "Telefone",
  "Status",
  "Data",
] as const;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeEntities(text: string) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

const cellText = (html: string) => decodeEntities(html.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();

/** Sem acentos e em minúsculas: para chaves e buscas. */
export const fold = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const PARTICLES = new Set(["da", "das", "de", "di", "do", "dos", "du", "e", "y"]);

/**
 * Nome para exibição: palavras todas em maiúsculas ou minúsculas ganham inicial maiúscula
 * ("FELIPE LIMA" / "antonio do nascimento" → "Felipe Lima" / "Antonio do Nascimento").
 * Palavras já com caixa mista ficam como estão.
 */
export function displayName(name: string) {
  return name
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((word, i) => {
      const lower = word.toLocaleLowerCase("pt-BR");
      const mixed = word !== lower && word !== word.toLocaleUpperCase("pt-BR");
      if (mixed) return word;
      if (i > 0 && PARTICLES.has(lower)) return lower;
      return lower.charAt(0).toLocaleUpperCase("pt-BR") + lower.slice(1);
    })
    .join(" ");
}

/** "Hibrido Games" / "Híbirdo Race" (grafia da planilha) → competição. */
export function parseCompetition(value: string): Competition | null {
  const v = fold(value).replace(/[^a-z ]/g, "");
  if (/\bgames\b/.test(v)) return "hibrido-games";
  if (/\brace\b/.test(v)) return "hibrido-race";
  return null;
}

/** Corrige a grafia vinda da plataforma ("Individidual") sem mudar o nome da categoria. */
export const cleanCategory = (value: string) => value.replace(/individid?ual/gi, "Individual").replace(/\s+/g, " ").trim();

/** "TEAM CNBOX (Adson / Carlos)" → "TEAM CNBOX". Individual: o próprio nome. */
export function teamNameFrom(raw: string) {
  const match = raw.match(/^(.*\S)\s*\([^()]*\)\s*$/);
  return (match ? match[1] : raw).trim();
}

function isoDate(value: string) {
  const m = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

/** Linhas de atletas da primeira tabela; ignora linhas vazias e o resumo de camisas. */
export function parseRegistrationSheet(html: string): SheetRow[] {
  const table = html.match(/<table[\s\S]*?<\/table>/i)?.[0];
  if (!table) throw new Error("Planilha sem tabela.");

  const rows = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((r) =>
    [...r[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => cellText(c[1])),
  );
  const header = rows.shift() ?? [];
  const index = Object.fromEntries(HEADERS.map((h) => [h, header.indexOf(h)])) as Record<(typeof HEADERS)[number], number>;
  const missing = HEADERS.filter((h) => index[h] < 0);
  if (missing.length) throw new Error(`Colunas ausentes na planilha: ${missing.join(", ")}.`);

  const out: SheetRow[] = [];
  for (const cells of rows) {
    if (cells.length < header.length - 2) continue;
    const get = (h: (typeof HEADERS)[number]) => cells[index[h]] ?? "";
    const competition = parseCompetition(get("Evento"));
    const athleteName = get("Atleta/Integrante");
    if (!competition || !athleteName) continue;
    out.push({
      competition,
      category: cleanCategory(get("Categoria")),
      registrationRaw: get("Inscrição/Equipe") || athleteName,
      type: get("Tipo"),
      athleteName,
      shirtSize: get("Tamanho da Camisa"),
      instagram: get("Instagram").replace(/^@/, ""),
      box: get("Box/Academia"),
      email: get("E-mail").toLowerCase(),
      phone: get("Telefone"),
      status: fold(get("Status")) === "aprovado" ? "aprovado" : "cancelado",
      registeredOn: isoDate(get("Data")),
    });
  }
  return out;
}

/**
 * Agrupa as linhas por inscrição. Linhas duplicadas da mesma inscrição (a plataforma repete
 * inscrições canceladas) viram uma só; se houver uma aprovada, a inscrição fica aprovada.
 */
export function groupRegistrations(rows: SheetRow[]): ParsedRegistration[] {
  const map = new Map<string, ParsedRegistration>();
  for (const row of rows) {
    const sourceKey = [row.competition, fold(row.registrationRaw), row.email].join("|");
    let reg = map.get(sourceKey);
    if (!reg) {
      reg = {
        sourceKey,
        competition: row.competition,
        category: row.category,
        teamName: teamNameFrom(row.registrationRaw),
        kind: "individual",
        email: row.email,
        phone: row.phone,
        box: row.box,
        status: row.status,
        registeredOn: row.registeredOn || null,
        athletes: [],
      };
      map.set(sourceKey, reg);
    }
    if (row.status === "aprovado") reg.status = "aprovado";
    const athleteKey = `${sourceKey}|${fold(row.athleteName)}`;
    if (!reg.athletes.some((a) => a.sourceKey === athleteKey)) {
      reg.athletes.push({
        sourceKey: athleteKey,
        fullName: row.athleteName.replace(/\s+/g, " ").trim(),
        instagram: row.instagram,
        shirtSize: row.shirtSize,
        position: reg.athletes.length + 1,
      });
    }
    if (!reg.box && row.box) reg.box = row.box;
  }
  for (const reg of map.values()) {
    reg.kind = reg.athletes.length > 1 || /dupla/i.test(reg.category) ? "dupla" : "individual";
  }
  return [...map.values()];
}
