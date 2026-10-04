import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Valida o cabeçalho x-signature do webhook do Mercado Pago.
 * Manifesto: "id:{data.id};request-id:{x-request-id};ts:{ts};" (HMAC-SHA256 com a assinatura secreta).
 */
export function isValidMpSignature(params: {
  signature: string | null;
  requestId: string | null;
  dataId: string | null;
  secret: string;
  /** Tolerância de relógio em segundos (0 = sem checagem). */
  maxAgeSeconds?: number;
  now?: number;
}) {
  const { signature, requestId, dataId, secret, maxAgeSeconds = 0, now = Date.now() } = params;
  if (!signature || !dataId || !secret) return false;

  const parts = Object.fromEntries(
    signature.split(",").map((kv) => {
      const [k, ...v] = kv.trim().split("=");
      return [k, v.join("=")];
    }),
  );
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;

  if (maxAgeSeconds > 0) {
    const tsMs = ts.length > 10 ? Number(ts) : Number(ts) * 1000;
    if (!Number.isFinite(tsMs) || Math.abs(now - tsMs) > maxAgeSeconds * 1000) return false;
  }

  // IDs alfanuméricos vêm em minúsculas no manifesto.
  const id = /^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId;
  let manifest = `id:${id};`;
  if (requestId) manifest += `request-id:${requestId};`;
  manifest += `ts:${ts};`;

  const expected = createHmac("sha256", secret).update(manifest).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(v1, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
