import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isValidMpSignature } from "./mp-signature";

const secret = "segredo";
const sign = (manifest: string) => createHmac("sha256", secret).update(manifest).digest("hex");

describe("isValidMpSignature", () => {
  const ts = "1760000000";
  const v1 = sign(`id:123456;request-id:req-1;ts:${ts};`);

  it("aceita assinatura correta", () => {
    expect(
      isValidMpSignature({ signature: `ts=${ts},v1=${v1}`, requestId: "req-1", dataId: "123456", secret }),
    ).toBe(true);
  });

  it("recusa assinatura, id ou request-id adulterados", () => {
    expect(isValidMpSignature({ signature: `ts=${ts},v1=${v1}`, requestId: "req-2", dataId: "123456", secret })).toBe(false);
    expect(isValidMpSignature({ signature: `ts=${ts},v1=${v1}`, requestId: "req-1", dataId: "999", secret })).toBe(false);
    expect(isValidMpSignature({ signature: `ts=${ts},v1=${"0".repeat(64)}`, requestId: "req-1", dataId: "123456", secret })).toBe(false);
    expect(isValidMpSignature({ signature: null, requestId: "req-1", dataId: "123456", secret })).toBe(false);
  });

  it("recusa timestamp antigo quando configurado", () => {
    expect(
      isValidMpSignature({
        signature: `ts=${ts},v1=${v1}`,
        requestId: "req-1",
        dataId: "123456",
        secret,
        maxAgeSeconds: 300,
        now: Number(ts) * 1000 + 3600_000,
      }),
    ).toBe(false);
  });
});
