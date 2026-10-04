import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { emailProvider, ticketEmailHtml } = await import("./email");

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
      tickets: [{ holderName: "Bia <b>", ticketType: "Sábado", eventDate: "2026-11-14", shortCode: "ABCD1234" }],
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;b&gt;");
    expect(html).toContain("k=a&amp;b");
  });
});
