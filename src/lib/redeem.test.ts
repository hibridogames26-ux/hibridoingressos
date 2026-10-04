import { describe, expect, it } from "vitest";
import { normalizeCode } from "./redeem";

describe("normalizeCode", () => {
  it("mantém token e código curto", () => {
    expect(normalizeCode("  abc123def  ")).toBe("abc123def");
    expect(normalizeCode("K7QX-M2PA")).toBe("K7QXM2PA");
  });

  it("extrai o token de uma URL", () => {
    expect(normalizeCode("https://hibridogames.com.br/i/abcdef0123")).toBe("abcdef0123");
    expect(normalizeCode("https://x.com/ingresso?t=abcdef0123")).toBe("abcdef0123");
  });

  it("limita o tamanho", () => {
    expect(normalizeCode("a".repeat(500))).toHaveLength(128);
  });
});
