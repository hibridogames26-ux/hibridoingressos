import { afterEach, describe, expect, it, vi } from "vitest";
import { mercadoPagoPublicKey, siteUrl } from "./env";

afterEach(() => vi.unstubAllEnvs());

describe("env", () => {
  it("siteUrl: variável explícita > domínio de produção da Vercel > localhost", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    expect(siteUrl()).toBe("http://localhost:3000");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "hibridoingressos.vercel.app");
    expect(siteUrl()).toBe("https://hibridoingressos.vercel.app");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://hibridogames.com.br/");
    expect(siteUrl()).toBe("https://hibridogames.com.br");
  });

  it("chave pública aceita o nome usado na Vercel", () => {
    vi.stubEnv("NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY", "");
    vi.stubEnv("MERCADOPAGO_PUBLIC_KEY", "APP_USR-pub");
    expect(mercadoPagoPublicKey()).toBe("APP_USR-pub");
  });
});
