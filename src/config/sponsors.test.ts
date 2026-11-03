import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { sponsors } from "./sponsors";

/** Largura e altura gravadas no cabeçalho IHDR de um PNG. */
function pngSize(file: string) {
  const buf = readFileSync(file);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe("apoiadores", () => {
  it("mantém a ordem apresentada e aprovada", () => {
    expect(sponsors.map((s) => s.name)).toEqual([
      "Fuego Glasses",
      "FitBlock Training",
      "VUPT Gráfica Rápida",
      "Roval Farmácia de Manipulação",
      "BSCross",
      "Sidore",
    ]);
  });

  it("não repete nome nem arquivo", () => {
    expect(new Set(sponsors.map((s) => s.name)).size).toBe(sponsors.length);
    expect(new Set(sponsors.map((s) => s.src)).size).toBe(sponsors.length);
  });

  it("aponta para PNGs que existem em public/ com as dimensões declaradas", () => {
    for (const s of sponsors) {
      const file = path.join(process.cwd(), "public", s.src);
      expect(pngSize(file), s.name).toEqual({ width: s.width, height: s.height });
    }
  });

  it("dá a cada logo uma largura positiva", () => {
    for (const s of sponsors) expect(s.displayWidth, s.name).toBeGreaterThan(0);
  });
});
