import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { buildTicketEmail, emailProvider, qrCid, ticketEmailHtml, ticketEmailText } = await import("./email");

describe("email", () => {
  it("prioriza Gmail, depois Resend", () => {
    expect(emailProvider({ GMAIL_USER: "a@gmail.com", GMAIL_APP_PASSWORD: "x", RESEND_API: "r" })).toBe("gmail");
    expect(emailProvider({ GMAIL_USER: "a@gmail.com", RESEND_API: "r" })).toBe("resend");
    expect(emailProvider({})).toBeNull();
  });

  it("escapa dados do comprador no HTML", () => {
    const html = ticketEmailHtml({
      buyerName: "<script>Ana",
      orderUrl: "https://x/pedido/1?k=a&b",
      paymentMethod: "pix",
      totalCents: 1000,
      tickets: [{ holderName: "Bia <b>", ticketType: "Sábado", eventDate: "2026-11-14", shortCode: "ABCD1234", token: "t" }],
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;b&gt;");
    expect(html).toContain("k=a&amp;b");
  });

  const sample = {
    to: "ana@exemplo.com",
    buyerName: "Ana Souza",
    orderUrl: "https://hibridoingressos.vercel.app/pedido/1?k=abc",
    paymentMethod: "cartao" as const,
    totalCents: 2105,
    tickets: [
      { holderName: "Ana Souza", ticketType: "Ingresso Sábado", eventDate: "2026-11-14", shortCode: "AAAA1111", token: "tok1" },
      { holderName: "Bia Lima", ticketType: "Ingresso Sábado", eventDate: "2026-11-14", shortCode: "BBBB2222", token: "tok2" },
    ],
  };

  it("um cartão por ingresso com QR anexado (cid)", async () => {
    const msg = await buildTicketEmail(sample);
    expect(msg.inline).toHaveLength(2);
    expect(msg.inline[0].cid).toBe(qrCid(0));
    expect(msg.inline[0].content.subarray(1, 4).toString()).toBe("PNG");
    expect(msg.html).toContain(`cid:${qrCid(0)}`);
    expect(msg.html).toContain(`cid:${qrCid(1)}`);
    expect(msg.html).toContain("1 de 2");
    expect(msg.html).toContain("Pedido confirmado · Cartão · R$");
    expect(msg.html).toContain("Sábado, 14/11/2026");
  });

  it("texto puro com códigos e link", () => {
    const text = ticketEmailText(sample);
    expect(text).toContain("Olá, Ana!");
    expect(text).toContain("código BBBB2222");
    expect(text).toContain(sample.orderUrl);
  });
});
