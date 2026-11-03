import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { buildCheckinAvailableEmail, buildCheckinCodeEmail, buildCheckinReopenedEmail, buildShirtEmail, buildTicketEmail, authLinkEmailHtml, authLinkEmailText, buildAuthLinkEmail, emailProviders, qrCid, shirtEmailHtml, shirtEmailText, ticketEmailHtml, ticketEmailText } = await import("./email");

describe("email", () => {
  it("usa o Resend como principal e o Gmail só como reserva", () => {
    expect(emailProviders({ GMAIL_USER: "a@gmail.com", GMAIL_APP_PASSWORD: "x", RESEND_API: "r" })).toEqual(["resend", "gmail"]);
    expect(emailProviders({ RESEND_API_KEY: "r" })).toEqual(["resend"]);
    expect(emailProviders({ GMAIL_USER: "a@gmail.com", RESEND_API: "r" })).toEqual(["resend"]);
    expect(emailProviders({ GMAIL_USER: "a@gmail.com", GMAIL_APP_PASSWORD: "x" })).toEqual(["gmail"]);
    expect(emailProviders({})).toEqual([]);
  });

  describe("convite e redefinição de senha", () => {
    const url = "https://site/auth/confirm?token_hash=abc&type=recovery&next=/definir-senha";

    it("monta o e-mail de redefinição com o link e escapa o nome", () => {
      const message = buildAuthLinkEmail({ to: "a@b.com", kind: "recovery", actionUrl: url, name: "<b>Ana Souza" });
      expect(message.subject).toContain("Redefinir sua senha");
      expect(message.html).toContain("token_hash=abc&amp;type=recovery");
      expect(message.html).toContain("&lt;b&gt;Ana");
      expect(message.html).not.toContain("<b>Ana");
      expect(message.text).toContain(url);
    });

    it("usa o texto de convite para novos acessos", () => {
      expect(authLinkEmailHtml({ kind: "invite", actionUrl: url })).toContain("Criar minha senha");
      expect(authLinkEmailText({ kind: "invite", actionUrl: url })).toContain("Criar minha senha");
    });
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

  describe("camisa sob encomenda", () => {
    const shirt = {
      to: "ana@exemplo.com",
      buyerName: "Ana <Souza>",
      orderUrl: "https://hibridoingressos.vercel.app/loja/pedido/1?k=a&b",
      code: "K7M2P9QA",
      productName: "Camisa oficial Híbrido Games",
      size: "M",
      quantity: 2,
      paymentMethod: "pix" as const,
      totalCents: 16000,
      leadTime: "30 dias após o fim das encomendas",
      receiptDetails: "Retirada no evento",
    };

    it("deixa claro que é sob encomenda e ainda não está pronta", () => {
      const html = shirtEmailHtml(shirt);
      expect(html).toContain("Sob encomenda");
      expect(html).toContain("ainda não está pronta");
      expect(shirtEmailText(shirt)).toContain("ainda não está pronta");
    });

    it("mostra tamanho, quantidade e as condições aceitas", () => {
      const text = shirtEmailText(shirt);
      expect(text).toContain("Tamanho: M");
      expect(text).toContain("Quantidade: 2");
      expect(text).toContain("Prazo de produção: 30 dias após o fim das encomendas");
      expect(text).toContain("Recebimento: Retirada no evento");
    });

    it("cupom de 100%: confirma a encomenda sem falar de pagamento nem de valor", () => {
      const free = { ...shirt, paymentMethod: null, totalCents: 0 };
      const html = shirtEmailHtml(free);
      expect(html).toContain("Sem pagamento · cupom de 100%");
      expect(html).toContain("Confirmamos a encomenda");
      expect(html).not.toContain("Recebemos o pagamento");
      expect(html).not.toContain("R$");
      expect(html).toContain("ainda não está pronta");
      const text = shirtEmailText(free);
      expect(text).toContain("Confirmamos a encomenda");
      expect(text).not.toContain("Recebemos o pagamento");
    });

    it("escapa dados do comprador e não anexa QR de ingresso", () => {
      const msg = buildShirtEmail(shirt);
      expect(msg.html).not.toContain("<Souza>");
      expect(msg.html).toContain("k=a&amp;b");
      expect(msg.inline).toHaveLength(0);
      expect(msg.subject).toContain("Encomenda confirmada");
      expect(msg.html).not.toContain("QR Code");
    });
  });

  describe("check-in do atleta", () => {
    it("código cita os atletas do e-mail, escapa nomes e aponta para o check-in", () => {
      const msg = buildCheckinCodeEmail({
        to: "cap@e.com",
        athletes: ["Mariana <b>", "Rafael Costa"],
        code: "048213",
        checkinUrl: "https://site/check-in",
      });
      expect(msg.subject).toBe("048213 é seu código do check-in — Híbrido Games 2026");
      expect(msg.html).toContain("Mariana &lt;b&gt;");
      expect(msg.html).not.toContain("Mariana <b>");
      expect(msg.html).toContain("https://site/check-in");
      expect(msg.text).toContain("(Mariana <b> e Rafael Costa): 048213");
    });

    it("check-in reaberto informa o motivo e o link", () => {
      const msg = buildCheckinReopenedEmail({
        to: "cap@e.com",
        athleteName: "Mariana Alves",
        competition: "Híbrido Games 2026",
        reason: "Atestado ilegível ou inválido",
        checkinUrl: "https://site/check-in",
      });
      expect(msg.subject).toBe("Faça o check-in de novo — Mariana Alves");
      expect(msg.html).toContain("Atestado ilegível ou inválido");
      expect(msg.html).toContain('href="https://site/check-in"');
      expect(msg.text).toContain("Motivo: Atestado ilegível ou inválido");
    });

    it("check-in liberado cita os atletas e o link, escapando o HTML", () => {
      const msg = buildCheckinAvailableEmail({
        to: "cap@e.com",
        athletes: ["Mariana Alves", "Bia <b>"],
        competition: "Híbrido Race 2026",
        checkinUrl: "https://site/check-in",
      });
      expect(msg.subject).toBe("Seu check-in está liberado — Híbrido Race 2026");
      expect(msg.html).toContain("Bia &lt;b&gt;");
      expect(msg.html).toContain('href="https://site/check-in"');
      expect(msg.html).toContain("Cada integrante assina o próprio termo");
      expect(msg.text).toContain("A organização cadastrou Mariana Alves e Bia <b> com este e-mail.");
    });
  });
});
