import "server-only";
import nodemailer from "nodemailer";
import { Resend } from "resend";
import { event } from "@/config/event";
import QRCode from "qrcode";
import { formatBRL, formatDateTime, formatEventDateLong } from "@/lib/format";
import { paymentMethodLabel, type PaymentMethod } from "@/lib/labels";

export type TicketEmailData = {
  to: string;
  buyerName: string;
  orderUrl: string;
  paymentMethod: PaymentMethod | null;
  totalCents: number;
  tickets: { holderName: string; ticketType: string; eventDate: string; shortCode: string; token: string }[];
};

type InlineImage = { cid: string; filename: string; content: Buffer };
type EmailMessage = { to: string; subject: string; html: string; text: string; inline: InlineImage[] };

const ACCENT = "#7132f5";
const FONT = "Helvetica,Arial,sans-serif";

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "";

/** Identificador do QR anexado ao e-mail (referenciado como cid:...). */
export const qrCid = (index: number) => `qr-ingresso-${index + 1}@hibridogames`;

/**
 * Modelo "Ingresso dentro do e-mail" (opção 2): cabeçalho roxo e um cartão por ingresso com QR.
 * Layout em tabelas e estilos inline, como os programas de e-mail exigem.
 */
export function ticketEmailHtml(data: Omit<TicketEmailData, "to">, qrSrc: (index: number) => string = (i) => `cid:${qrCid(i)}`) {
  const total = data.tickets.length;
  const paidLine = [
    "Pedido confirmado",
    data.paymentMethod ? paymentMethodLabel[data.paymentMethod] : null,
    formatBRL(data.totalCents),
  ]
    .filter(Boolean)
    .join(" · ");

  const cards = data.tickets
    .map(
      (t, i) => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #dedee5;border-radius:16px;border-collapse:separate;overflow:hidden;margin:0 0 16px">
  <tr>
    <td style="background:${ACCENT};padding:12px 18px;border-radius:15px 15px 0 0">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="font-family:${FONT};font-size:15px;font-weight:700;color:#ffffff">${escapeHtml(t.ticketType)}</td>
        <td align="right" style="font-family:${FONT};font-size:12px;font-weight:600;color:#ffffff">${i + 1} de ${total}</td>
      </tr></table>
    </td>
  </tr>
  <tr>
    <td style="padding:18px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td width="168" valign="middle" style="padding-right:18px">
          <img src="${escapeHtml(qrSrc(i))}" width="160" height="160" alt="QR Code do ingresso de ${escapeHtml(t.holderName)}" style="display:block;width:160px;height:160px;border:1px solid #dedee5;border-radius:12px;padding:6px;background:#ffffff">
        </td>
        <td valign="middle" style="font-family:${FONT};color:#101114">
          <div style="font-size:12px;color:#686b82">Titular</div>
          <div style="font-size:16px;font-weight:600;margin:0 0 12px">${escapeHtml(t.holderName)}</div>
          <div style="font-size:12px;color:#686b82">Válido em</div>
          <div style="font-size:16px;font-weight:600;margin:0 0 12px">${escapeHtml(formatEventDateLong(t.eventDate))}</div>
          <div style="font-size:12px;color:#686b82">Código</div>
          <div style="font-family:'Courier New',monospace;font-size:17px;font-weight:700;letter-spacing:2px">${escapeHtml(t.shortCode)}</div>
        </td>
      </tr></table>
    </td>
  </tr>
</table>`,
    )
    .join("");

  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Seus ingressos</title></head>
<body style="margin:0;padding:0;background:#f4f4f7">
<div style="display:none;max-height:0;overflow:hidden">Seus ingressos com QR Code para o ${escapeHtml(event.name)} ${event.year}.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #dedee5;border-radius:16px;border-collapse:separate">
    <tr>
      <td style="background:${ACCENT};padding:26px 32px;border-radius:15px 15px 0 0">
        <div style="font-family:${FONT};font-size:22px;font-weight:700;color:#ffffff">Seus ingressos chegaram</div>
        <div style="font-family:${FONT};font-size:14px;color:#ffffff;opacity:0.9;margin-top:4px">${escapeHtml(paidLine)}</div>
      </td>
    </tr>
    <tr>
      <td style="padding:26px 32px 30px;font-family:${FONT};color:#101114">
        <p style="margin:0 0 20px;font-size:16px;line-height:1.5;color:#484b5e">Olá, ${escapeHtml(firstName(data.buyerName))}! Aqui estão seus ingressos para o ${escapeHtml(event.name)} ${event.year}. Na entrada, mostre o QR Code direto deste e-mail ou pela página do pedido.</p>
        ${cards}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:4px 0 20px">
          <a href="${escapeHtml(data.orderUrl)}" style="display:inline-block;border:1px solid #5741d8;color:#5741d8;font-family:${FONT};font-size:15px;font-weight:600;text-decoration:none;border-radius:12px;padding:13px 24px">Ver na página do pedido</a>
        </td></tr></table>
        <div style="background:#f4f4f7;border-radius:12px;padding:14px 16px;font-size:14px;line-height:1.6;color:#484b5e">Mostre o QR Code na entrada e receba sua pulseira. Cada ingresso é lido uma única vez — depois de lido, o QR não vale mais. Não encaminhe este e-mail.</div>
      </td>
    </tr>
  </table>
  <div style="font-family:${FONT};font-size:12px;color:#686b82;padding:16px 20px 0;text-align:center">${escapeHtml(event.name)} ${event.year} · ${escapeHtml(event.tagline)} · ${escapeHtml(event.endorsement)}</div>
</td></tr></table>
</body>
</html>`;
}

/** Versão em texto puro (melhora a entrega e serve para leitores de tela). */
export function ticketEmailText(data: Omit<TicketEmailData, "to">) {
  const lines = data.tickets.map(
    (t, i) => `${i + 1}. ${t.holderName} — ${t.ticketType} — ${formatEventDateLong(t.eventDate)} — código ${t.shortCode}`,
  );
  return [
    `Olá, ${firstName(data.buyerName)}! Seus ingressos para o ${event.name} ${event.year} estão confirmados.`,
    "",
    ...lines,
    "",
    `Abra seus ingressos com QR Code: ${data.orderUrl}`,
    "",
    "Mostre o QR Code na entrada e receba sua pulseira. Cada ingresso é lido uma única vez.",
  ].join("\n");
}

/** Monta assunto, HTML, texto e os QR em PNG para anexar inline. */
export async function buildTicketEmail(data: TicketEmailData): Promise<EmailMessage> {
  const inline = await Promise.all(
    data.tickets.map(async (t, i) => ({
      cid: qrCid(i),
      filename: `ingresso-${i + 1}-${t.shortCode}.png`,
      content: await QRCode.toBuffer(t.token, { margin: 1, width: 320, errorCorrectionLevel: "M" }),
    })),
  );
  return {
    to: data.to,
    subject: `Seus ingressos — ${event.name} ${event.year}`,
    html: ticketEmailHtml(data),
    text: ticketEmailText(data),
    inline,
  };
}

export type EmailProvider = "resend" | "gmail";

/**
 * Provedores na ordem de uso: Resend é o principal; Gmail (senha de app) só entra
 * como reserva se estiver configurado e o Resend falhar ou não estiver configurado.
 */
export function emailProviders(env: Record<string, string | undefined> = process.env): EmailProvider[] {
  const providers: EmailProvider[] = [];
  if (env.RESEND_API_KEY || env.RESEND_API) providers.push("resend");
  if (env.GMAIL_USER && env.GMAIL_APP_PASSWORD) providers.push("gmail");
  return providers;
}

async function sendViaGmail(message: EmailMessage) {
  const user = process.env.GMAIL_USER!;
  // A senha de app do Google é exibida com espaços; o SMTP aceita sem eles.
  const pass = process.env.GMAIL_APP_PASSWORD!.replace(/\s+/g, "");
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
  });
  await transporter.sendMail({
    from: { name: process.env.EMAIL_FROM_NAME ?? `${event.name} ${event.year}`, address: user },
    to: message.to,
    subject: message.subject,
    html: message.html,
    text: message.text,
    attachments: message.inline.map((img) => ({
      filename: img.filename,
      content: img.content,
      cid: img.cid,
      contentType: "image/png",
    })),
  });
}

async function sendViaResend(message: EmailMessage) {
  // Aceita também o nome RESEND_API, usado no .env do projeto.
  const apiKey = (process.env.RESEND_API_KEY ?? process.env.RESEND_API)!;
  const from = process.env.EMAIL_FROM ?? "Híbrido Games <onboarding@resend.dev>";
  const { error } = await new Resend(apiKey).emails.send({
    from,
    to: message.to,
    subject: message.subject,
    html: message.html,
    text: message.text,
    attachments: message.inline.map((img) => ({
      filename: img.filename,
      content: img.content,
      contentId: img.cid,
    })),
  });
  if (error) throw new Error(error.message);
}

/**
 * Monta e entrega a mensagem pelo Resend (com o Gmail como reserva, se configurado).
 * Retorna false se nenhum provedor estiver configurado; lança erro se todos falharem.
 */
async function deliver(build: () => EmailMessage | Promise<EmailMessage>) {
  const providers = emailProviders();
  if (providers.length === 0) {
    console.warn("Nenhum provedor de e-mail configurado (RESEND_API_KEY): e-mail não enviado.");
    return false;
  }
  const message = await build();
  const failures: string[] = [];
  for (const provider of providers) {
    try {
      if (provider === "resend") await sendViaResend(message);
      else await sendViaGmail(message);
      return true;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.error(`Falha ao enviar e-mail via ${provider}: ${reason}`);
      failures.push(`${provider}: ${reason}`);
    }
  }
  throw new Error(`Falha ao enviar e-mail (${failures.join("; ")})`);
}

/** Envia o e-mail de ingressos; retorna false se nenhum provedor estiver configurado. */
export const sendTicketsEmail = (data: TicketEmailData) => deliver(() => buildTicketEmail(data));

// ---------------------------------------------------------------------------
// Camisa oficial sob encomenda
// ---------------------------------------------------------------------------
export type ShirtEmailData = {
  to: string;
  buyerName: string;
  orderUrl: string;
  code: string;
  productName: string;
  size: string;
  quantity: number;
  paymentMethod: PaymentMethod | null;
  totalCents: number;
  /** Condições aceitas na compra (snapshot da encomenda). */
  leadTime: string;
  receiptDetails: string;
};

/** Confirma o pagamento e deixa claro que a camisa é sob encomenda: ainda não está pronta. */
export function shirtEmailHtml(data: Omit<ShirtEmailData, "to">) {
  // Total zero = cupom de 100%: não houve pagamento.
  const free = data.totalCents === 0;
  const paidLine = free
    ? "Sem pagamento · cupom de 100%"
    : [
        "Pagamento confirmado",
        data.paymentMethod ? paymentMethodLabel[data.paymentMethod] : null,
        formatBRL(data.totalCents),
      ]
        .filter(Boolean)
        .join(" · ");
  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 0;font-family:${FONT};font-size:12px;color:#686b82;width:130px;vertical-align:top">${escapeHtml(label)}</td><td style="padding:6px 0;font-family:${FONT};font-size:15px;font-weight:600;color:#101114">${escapeHtml(value)}</td></tr>`;

  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Encomenda confirmada</title></head>
<body style="margin:0;padding:0;background:#f4f4f7">
<div style="display:none;max-height:0;overflow:hidden">${free ? "Encomenda confirmada" : "Pagamento confirmado"} da sua camisa oficial. Ela é feita sob encomenda e ainda não está pronta.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #dedee5;border-radius:16px;border-collapse:separate">
    <tr>
      <td style="background:${ACCENT};padding:26px 32px;border-radius:15px 15px 0 0">
        <div style="font-family:${FONT};font-size:22px;font-weight:700;color:#ffffff">Encomenda confirmada</div>
        <div style="font-family:${FONT};font-size:14px;color:#ffffff;opacity:0.9;margin-top:4px">${escapeHtml(paidLine)}</div>
      </td>
    </tr>
    <tr>
      <td style="padding:26px 32px 30px;font-family:${FONT};color:#101114">
        <p style="margin:0 0 20px;font-size:16px;line-height:1.5;color:#484b5e">Olá, ${escapeHtml(firstName(data.buyerName))}! ${free ? "Confirmamos a encomenda" : "Recebemos o pagamento"} da sua camisa oficial do ${escapeHtml(event.name)} ${event.year}.</p>
        <div style="background:rgba(133,91,251,0.16);border-radius:12px;padding:14px 16px;font-size:14px;line-height:1.6;color:#101114;margin:0 0 20px"><strong>Sob encomenda.</strong> A camisa ainda não está pronta. Você acompanha cada etapa da produção e do recebimento na página do pedido.</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #dedee5;border-bottom:1px solid #dedee5;margin:0 0 20px">
          ${row("Pedido", data.code)}
          ${row("Produto", data.productName)}
          ${row("Tamanho", data.size)}
          ${row("Quantidade", String(data.quantity))}
          ${row("Prazo de produção", data.leadTime)}
          ${row("Recebimento", data.receiptDetails)}
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:4px 0 8px">
          <a href="${escapeHtml(data.orderUrl)}" style="display:inline-block;border:1px solid #5741d8;color:#5741d8;font-family:${FONT};font-size:15px;font-weight:600;text-decoration:none;border-radius:12px;padding:13px 24px">Acompanhar minha encomenda</a>
        </td></tr></table>
      </td>
    </tr>
  </table>
  <div style="font-family:${FONT};font-size:12px;color:#686b82;padding:16px 20px 0;text-align:center">${escapeHtml(event.name)} ${event.year} · ${escapeHtml(event.tagline)} · ${escapeHtml(event.endorsement)}</div>
</td></tr></table>
</body>
</html>`;
}

export function shirtEmailText(data: Omit<ShirtEmailData, "to">) {
  return [
    `Olá, ${firstName(data.buyerName)}! ${data.totalCents === 0 ? "Confirmamos a encomenda" : "Recebemos o pagamento"} da sua camisa oficial do ${event.name} ${event.year}.`,
    "",
    "Sob encomenda: a camisa ainda não está pronta. Acompanhe a produção e o recebimento na página do pedido.",
    "",
    `Pedido: ${data.code}`,
    `Produto: ${data.productName}`,
    `Tamanho: ${data.size}`,
    `Quantidade: ${data.quantity}`,
    `Prazo de produção: ${data.leadTime}`,
    `Recebimento: ${data.receiptDetails}`,
    "",
    `Acompanhe sua encomenda: ${data.orderUrl}`,
  ].join("\n");
}

export function buildShirtEmail(data: ShirtEmailData): EmailMessage {
  return {
    to: data.to,
    subject: `Encomenda confirmada: camisa oficial — ${event.name} ${event.year}`,
    html: shirtEmailHtml(data),
    text: shirtEmailText(data),
    inline: [],
  };
}

/** Envia a confirmação da encomenda; retorna false se nenhum provedor estiver configurado. */
export const sendShirtOrderEmail = (data: ShirtEmailData) => deliver(() => buildShirtEmail(data));

// ---------------------------------------------------------------------------
// Check-in do atleta: código de confirmação (enviado ao e-mail da inscrição)
// ---------------------------------------------------------------------------
export type CheckinCodeEmailData = {
  to: string;
  /** Atletas das inscrições deste e-mail, ex.: ["Mariana Alves", "Rafael Costa"]. */
  athletes: string[];
  code: string;
  checkinUrl: string;
};

/** "A", "A e B", "A, B e C". */
const listNames = (names: string[]) =>
  names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;

const emailShell = (title: string, preheader: string, eyebrow: string, body: string) => `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f7">
<div style="display:none;max-height:0;overflow:hidden">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #dedee5;border-radius:16px;border-collapse:separate">
    <tr>
      <td style="padding:28px 32px 8px;font-family:${FONT};color:#101114">
        <div style="font-size:14px;color:#686b82">${escapeHtml(eyebrow)}</div>
        <div style="font-size:22px;font-weight:700;margin-top:6px">${escapeHtml(title)}</div>
      </td>
    </tr>
${body}
  </table>
  <div style="font-family:${FONT};font-size:12px;color:#686b82;padding:16px 20px 0;text-align:center">${escapeHtml(event.name)} ${event.year} · ${escapeHtml(event.tagline)} · ${escapeHtml(event.endorsement)}</div>
</td></tr></table>
</body>
</html>`;

export function checkinCodeEmailHtml(data: Omit<CheckinCodeEmailData, "to">) {
  const digits = data.code.split("").join("&#8202;");
  const names = data.athletes.map((n) => `<strong style="color:#101114">${escapeHtml(n)}</strong>`);
  const who = names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
  return emailShell(
    "Seu código de confirmação",
    `Seu código do check-in: ${data.code}. Vale por 10 minutos.`,
    `Check-in do atleta · ${event.name} ${event.year}`,
    `    <tr>
      <td style="padding:12px 32px 4px;font-family:${FONT};color:#484b5e;font-size:16px;line-height:1.5">
        Olá! Alguém iniciou o check-in com este e-mail de inscrição${who ? ` (${who})` : ""}. Digite este código na tela do check-in:
      </td>
    </tr>
    <tr>
      <td align="center" style="padding:20px 32px">
        <div style="display:inline-block;background:rgba(133,91,251,0.16);border-radius:14px;padding:16px 28px;font-family:'Courier New',monospace;font-size:34px;font-weight:700;letter-spacing:8px;color:${ACCENT}">${digits}</div>
        <div style="font-family:${FONT};font-size:13px;color:#686b82;margin-top:10px">Vale por 10 minutos.</div>
      </td>
    </tr>
    <tr>
      <td style="padding:0 32px 28px;font-family:${FONT};font-size:14px;line-height:1.6;color:#484b5e">
        Nas duplas, o código vale para os dois integrantes. Se o check-in é do seu parceiro ou parceira, repasse o código só para essa pessoa.
        <br><br>Não pediu este código? Ignore este e-mail: sem ele, ninguém conclui o check-in.
        <br><br><a href="${escapeHtml(data.checkinUrl)}" style="color:#5741d8">Abrir o check-in</a>
      </td>
    </tr>`,
  );
}

export function checkinCodeEmailText(data: Omit<CheckinCodeEmailData, "to">) {
  const who = listNames(data.athletes);
  return [
    `Check-in do atleta · ${event.name} ${event.year}`,
    "",
    `Código de confirmação do check-in${who ? ` (${who})` : ""}: ${data.code}`,
    "Vale por 10 minutos.",
    "",
    "Nas duplas, o código vale para os dois integrantes. Repasse só para o seu parceiro ou parceira.",
    "Não pediu este código? Ignore este e-mail.",
    "",
    `Abrir o check-in: ${data.checkinUrl}`,
  ].join("\n");
}

export function buildCheckinCodeEmail(data: CheckinCodeEmailData): EmailMessage {
  return {
    to: data.to,
    subject: `${data.code} é seu código do check-in — ${event.name} ${event.year}`,
    html: checkinCodeEmailHtml(data),
    text: checkinCodeEmailText(data),
    inline: [],
  };
}

/** Envia o código do check-in; retorna false se nenhum provedor estiver configurado. */
export const sendCheckinCodeEmail = (data: CheckinCodeEmailData) => deliver(() => buildCheckinCodeEmail(data));

// ---------------------------------------------------------------------------
// Check-in reaberto pela organização (Story 4.4)
// ---------------------------------------------------------------------------
export type CheckinReopenedEmailData = {
  to: string;
  athleteName: string;
  competition: string;
  /** Motivo em português, ex.: "Atestado ilegível ou inválido". */
  reason: string;
  checkinUrl: string;
};

export function checkinReopenedEmailHtml(data: Omit<CheckinReopenedEmailData, "to">) {
  return emailShell(
    "Faça o check-in de novo",
    `A organização reabriu o check-in de ${data.athleteName}.`,
    `Check-in do atleta · ${data.competition}`,
    `    <tr>
      <td style="padding:12px 32px 4px;font-family:${FONT};color:#484b5e;font-size:16px;line-height:1.5">
        Olá! A organização reabriu o check-in de <strong style="color:#101114">${escapeHtml(data.athleteName)}</strong>. O termo enviado antes foi arquivado e é preciso fazer o check-in de novo: código, PAR-Q, termo e atestado médico.
      </td>
    </tr>
    <tr>
      <td style="padding:16px 32px 0">
        <div style="background:#f4f4f7;border-radius:12px;padding:14px 16px;font-family:${FONT};font-size:14px;line-height:1.5;color:#484b5e"><strong style="color:#101114">Motivo:</strong> ${escapeHtml(data.reason)}</div>
      </td>
    </tr>
    <tr>
      <td align="center" style="padding:24px 32px">
        <a href="${escapeHtml(data.checkinUrl)}" style="display:inline-block;background:${ACCENT};color:#ffffff;font-family:${FONT};font-size:15px;font-weight:600;text-decoration:none;border-radius:12px;padding:14px 28px">Fazer o check-in</a>
      </td>
    </tr>
    <tr>
      <td style="padding:0 32px 28px;font-family:${FONT};font-size:14px;line-height:1.6;color:#484b5e">
        Use este mesmo e-mail da inscrição para receber o código. Dúvidas? Fale com a organização do evento.
      </td>
    </tr>`,
  );
}

export function checkinReopenedEmailText(data: Omit<CheckinReopenedEmailData, "to">) {
  return [
    `Check-in do atleta · ${data.competition}`,
    "",
    `A organização reabriu o check-in de ${data.athleteName}. O termo enviado antes foi arquivado e é preciso fazer o check-in de novo: código, PAR-Q, termo e atestado médico.`,
    "",
    `Motivo: ${data.reason}`,
    "",
    `Fazer o check-in: ${data.checkinUrl}`,
    "Use este mesmo e-mail da inscrição para receber o código. Dúvidas? Fale com a organização do evento.",
  ].join("\n");
}

export function buildCheckinReopenedEmail(data: CheckinReopenedEmailData): EmailMessage {
  return {
    to: data.to,
    subject: `Faça o check-in de novo — ${data.athleteName}`,
    html: checkinReopenedEmailHtml(data),
    text: checkinReopenedEmailText(data),
    inline: [],
  };
}

/** Avisa que o check-in foi reaberto; retorna false se nenhum provedor estiver configurado. */
export const sendCheckinReopenedEmail = (data: CheckinReopenedEmailData) => deliver(() => buildCheckinReopenedEmail(data));

// ---------------------------------------------------------------------------
// Cadastro feito pela organização: check-in liberado (Story 4.5)
// ---------------------------------------------------------------------------
export type CheckinAvailableEmailData = {
  to: string;
  athletes: string[];
  competition: string;
  checkinUrl: string;
};

export function checkinAvailableEmailHtml(data: Omit<CheckinAvailableEmailData, "to">) {
  const names = data.athletes.map((n) => `<strong style="color:#101114">${escapeHtml(n)}</strong>`);
  const who = names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
  return emailShell(
    "Seu check-in está liberado",
    `A organização cadastrou ${listNames(data.athletes)}. Faça o check-in pelo link.`,
    `Check-in do atleta · ${data.competition}`,
    `    <tr>
      <td style="padding:12px 32px 4px;font-family:${FONT};color:#484b5e;font-size:16px;line-height:1.5">
        Olá! A organização cadastrou ${who} com este e-mail. Para confirmar a presença, faça o check-in: código no e-mail, PAR-Q, termo de responsabilidade e atestado médico.
      </td>
    </tr>
    <tr>
      <td align="center" style="padding:24px 32px">
        <a href="${escapeHtml(data.checkinUrl)}" style="display:inline-block;background:${ACCENT};color:#ffffff;font-family:${FONT};font-size:15px;font-weight:600;text-decoration:none;border-radius:12px;padding:14px 28px">Fazer o check-in</a>
      </td>
    </tr>
    <tr>
      <td style="padding:0 32px 28px;font-family:${FONT};font-size:14px;line-height:1.6;color:#484b5e">
        Use este mesmo e-mail para receber o código.${data.athletes.length > 1 ? " Cada integrante assina o próprio termo e anexa o próprio atestado." : ""} Dúvidas? Fale com a organização do evento.
      </td>
    </tr>`,
  );
}

export function checkinAvailableEmailText(data: Omit<CheckinAvailableEmailData, "to">) {
  return [
    `Check-in do atleta · ${data.competition}`,
    "",
    `A organização cadastrou ${listNames(data.athletes)} com este e-mail. Para confirmar a presença, faça o check-in: código no e-mail, PAR-Q, termo de responsabilidade e atestado médico.`,
    "",
    `Fazer o check-in: ${data.checkinUrl}`,
    "Use este mesmo e-mail para receber o código. Dúvidas? Fale com a organização do evento.",
  ].join("\n");
}

export function buildCheckinAvailableEmail(data: CheckinAvailableEmailData): EmailMessage {
  return {
    to: data.to,
    subject: `Seu check-in está liberado — ${data.competition}`,
    html: checkinAvailableEmailHtml(data),
    text: checkinAvailableEmailText(data),
    inline: [],
  };
}

/** Avisa que o check-in está liberado; retorna false se nenhum provedor estiver configurado. */
export const sendCheckinAvailableEmail = (data: CheckinAvailableEmailData) => deliver(() => buildCheckinAvailableEmail(data));

// ---------------------------------------------------------------------------
// Acesso da organização: convite e redefinição de senha
// ---------------------------------------------------------------------------
export type AuthLinkKind = "invite" | "recovery";

export type AuthLinkEmailData = {
  to: string;
  kind: AuthLinkKind;
  /** Link de uso único para definir a senha. */
  actionUrl: string;
  name?: string;
};

const authLinkCopy: Record<AuthLinkKind, { subject: string; title: string; intro: string; cta: string; ignore: string }> = {
  invite: {
    subject: "Seu acesso à organização",
    title: "Você foi convidado",
    intro: "Você recebeu acesso à área da organização. Crie sua senha para entrar.",
    cta: "Criar minha senha",
    ignore: "Não esperava este convite? Ignore este e-mail.",
  },
  recovery: {
    subject: "Redefinir sua senha",
    title: "Redefinir senha",
    intro: "Recebemos um pedido para redefinir a senha da sua conta. Use o botão abaixo para criar uma nova.",
    cta: "Criar nova senha",
    ignore: "Não pediu? Ignore este e-mail: sua senha atual continua valendo.",
  },
};

export function authLinkEmailHtml(data: Omit<AuthLinkEmailData, "to">) {
  const copy = authLinkCopy[data.kind];
  const greeting = data.name ? `Olá, ${escapeHtml(firstName(data.name))}! ` : "Olá! ";
  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(copy.title)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f7">
<div style="display:none;max-height:0;overflow:hidden">${escapeHtml(copy.intro)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #dedee5;border-radius:16px;border-collapse:separate">
    <tr>
      <td style="padding:28px 32px 8px;font-family:${FONT};color:#101114">
        <div style="font-size:14px;color:#686b82">${escapeHtml(event.name)} ${event.year} · Organização</div>
        <div style="font-size:22px;font-weight:700;margin-top:6px">${escapeHtml(copy.title)}</div>
      </td>
    </tr>
    <tr>
      <td style="padding:12px 32px 4px;font-family:${FONT};color:#484b5e;font-size:16px;line-height:1.5">${greeting}${escapeHtml(copy.intro)}</td>
    </tr>
    <tr>
      <td align="center" style="padding:24px 32px">
        <a href="${escapeHtml(data.actionUrl)}" style="display:inline-block;background:${ACCENT};color:#ffffff;font-family:${FONT};font-size:15px;font-weight:600;text-decoration:none;border-radius:12px;padding:14px 28px">${escapeHtml(copy.cta)}</a>
      </td>
    </tr>
    <tr>
      <td style="padding:0 32px 28px;font-family:${FONT};font-size:14px;line-height:1.6;color:#484b5e">
        O link vale por tempo limitado e pode ser usado uma única vez. Não encaminhe este e-mail.
        <br><br>${escapeHtml(copy.ignore)}
      </td>
    </tr>
  </table>
  <div style="font-family:${FONT};font-size:12px;color:#686b82;padding:16px 20px 0;text-align:center">${escapeHtml(event.name)} ${event.year} · ${escapeHtml(event.tagline)} · ${escapeHtml(event.endorsement)}</div>
</td></tr></table>
</body>
</html>`;
}

export function authLinkEmailText(data: Omit<AuthLinkEmailData, "to">) {
  const copy = authLinkCopy[data.kind];
  return [
    `${data.name ? `Olá, ${firstName(data.name)}!` : "Olá!"} ${copy.intro}`,
    "",
    `${copy.cta}: ${data.actionUrl}`,
    "",
    "O link vale por tempo limitado e pode ser usado uma única vez. Não encaminhe este e-mail.",
    copy.ignore,
  ].join("\n");
}

export function buildAuthLinkEmail(data: AuthLinkEmailData): EmailMessage {
  return {
    to: data.to,
    subject: `${authLinkCopy[data.kind].subject} — ${event.name} ${event.year}`,
    html: authLinkEmailHtml(data),
    text: authLinkEmailText(data),
    inline: [],
  };
}

/** Envia convite ou link de redefinição de senha; retorna false se nenhum provedor estiver configurado. */
export const sendAuthLinkEmail = (data: AuthLinkEmailData) => deliver(() => buildAuthLinkEmail(data));

// ---------------------------------------------------------------------------
// Retirada de camisa do atleta (Story 4.6)
// ---------------------------------------------------------------------------
/** Quem retirou, em relação aos atletas citados no e-mail. */
export type ShirtPickupRole = "atleta" | "integrante" | "terceiro";

export type ShirtPickupEmailData = {
  to: string;
  /** Ex.: "Híbrido Games 2026". */
  competition: string;
  /** Camisas entregues aos atletas deste e-mail. `teamName` nulo = inscrição individual. */
  items: { athleteName: string; teamName: string | null; size: string }[];
  pickedByName: string;
  pickedByRole: ShirtPickupRole;
  /** Documento informado quando outra pessoa retira. */
  document: string | null;
  /** Instante da retirada (ISO). */
  pickedAt: string;
  /** Administrador que entregou. */
  deliveredByName: string | null;
  note: string | null;
};

const pickupRoleText: Record<ShirtPickupRole, string> = {
  atleta: " (o próprio atleta)",
  integrante: " (integrante da inscrição)",
  terceiro: "",
};

/** Linhas "rótulo: valor" comuns ao HTML e ao texto. */
function pickupFacts(data: Omit<ShirtPickupEmailData, "to">): [string, string][] {
  const facts: [string, string][] = [["Retirado por", `${data.pickedByName}${pickupRoleText[data.pickedByRole]}`]];
  if (data.document) facts.push(["Documento", data.document]);
  facts.push(["Data e hora", formatDateTime(data.pickedAt)]);
  if (data.deliveredByName) facts.push(["Entregue por", data.deliveredByName]);
  if (data.note) facts.push(["Observação", data.note]);
  return facts;
}

const pickupIntro = (data: Omit<ShirtPickupEmailData, "to">, names: string) =>
  data.items.length > 1 ? `Registramos a retirada das camisas de ${names}.` : `Registramos a retirada da camisa de ${names}.`;

export function shirtPickupEmailHtml(data: Omit<ShirtPickupEmailData, "to">) {
  const names = data.items.map((i) => `<strong style="color:#101114">${escapeHtml(i.athleteName)}</strong>`);
  const who = names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
  const items = data.items
    .map(
      (i, n) =>
        `<tr><td style="padding:10px 0;font-family:${FONT};font-size:15px;color:#101114;vertical-align:top${n ? ";border-top:1px solid #dedee5" : ""}">${escapeHtml(i.athleteName)}${i.teamName ? `<div style="font-size:12px;color:#686b82">${escapeHtml(i.teamName)}</div>` : ""}</td><td align="right" style="padding:10px 0 10px 12px;font-family:${FONT};font-size:15px;font-weight:700;color:#101114;white-space:nowrap;vertical-align:top${n ? ";border-top:1px solid #dedee5" : ""}">1 camisa · ${escapeHtml(i.size)}</td></tr>`,
    )
    .join("");
  const facts = pickupFacts(data)
    .map(
      ([label, value]) =>
        `<tr><td style="padding:5px 0;font-family:${FONT};font-size:12px;color:#686b82;width:110px;vertical-align:top">${escapeHtml(label)}</td><td style="padding:5px 0;font-family:${FONT};font-size:15px;font-weight:600;color:#101114">${escapeHtml(value)}</td></tr>`,
    )
    .join("");

  return emailShell(
    "Camisa retirada",
    `${pickupIntro(data, listNames(data.items.map((i) => i.athleteName)))} Retirado por ${data.pickedByName}.`,
    `Retirada de camisa · ${data.competition}`,
    `    <tr>
      <td style="padding:12px 32px 4px;font-family:${FONT};color:#484b5e;font-size:16px;line-height:1.5">
        Olá! ${pickupIntro(data, who)}
      </td>
    </tr>
    <tr>
      <td style="padding:16px 32px 0">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #dedee5;border-bottom:1px solid #dedee5">${items}</table>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 32px 0">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${facts}</table>
      </td>
    </tr>
    <tr>
      <td style="padding:20px 32px 28px">
        <div style="background:#f4f4f7;border-radius:12px;padding:14px 16px;font-family:${FONT};font-size:14px;line-height:1.6;color:#484b5e">Não reconhece esta retirada? Fale com a organização do evento.</div>
      </td>
    </tr>`,
  );
}

export function shirtPickupEmailText(data: Omit<ShirtPickupEmailData, "to">) {
  return [
    `Retirada de camisa · ${data.competition}`,
    "",
    `Olá! ${pickupIntro(data, listNames(data.items.map((i) => i.athleteName)))}`,
    "",
    ...data.items.map((i) => `- ${i.athleteName}${i.teamName ? ` (${i.teamName})` : ""}: 1 camisa, tamanho ${i.size}`),
    "",
    ...pickupFacts(data).map(([label, value]) => `${label}: ${value}`),
    "",
    "Não reconhece esta retirada? Fale com a organização do evento.",
  ].join("\n");
}

export function buildShirtPickupEmail(data: ShirtPickupEmailData): EmailMessage {
  return {
    to: data.to,
    subject: `Camisa retirada — ${data.competition}`,
    html: shirtPickupEmailHtml(data),
    text: shirtPickupEmailText(data),
    inline: [],
  };
}

/** Avisa que a camisa foi retirada; retorna false se nenhum provedor estiver configurado. */
export const sendShirtPickupEmail = (data: ShirtPickupEmailData) => deliver(() => buildShirtPickupEmail(data));
