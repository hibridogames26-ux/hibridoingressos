import "server-only";
import nodemailer from "nodemailer";
import { Resend } from "resend";
import { event } from "@/config/event";
import QRCode from "qrcode";
import { formatBRL, formatEventDateLong } from "@/lib/format";
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

export type EmailProvider = "gmail" | "resend" | null;

/** Gmail (senha de app) tem prioridade; Resend fica como alternativa. */
export function emailProvider(env: Record<string, string | undefined> = process.env): EmailProvider {
  if (env.GMAIL_USER && env.GMAIL_APP_PASSWORD) return "gmail";
  if (env.RESEND_API_KEY || env.RESEND_API) return "resend";
  return null;
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

/** Envia o e-mail de ingressos; retorna false se nenhum provedor estiver configurado. */
export async function sendTicketsEmail(data: TicketEmailData) {
  const provider = emailProvider();
  if (!provider) {
    console.warn("Nenhum provedor de e-mail configurado (GMAIL_USER/GMAIL_APP_PASSWORD): e-mail não enviado.");
    return false;
  }
  const message = await buildTicketEmail(data);
  try {
    if (provider === "gmail") await sendViaGmail(message);
    else await sendViaResend(message);
  } catch (error) {
    throw new Error(`Falha ao enviar e-mail via ${provider}: ${error instanceof Error ? error.message : error}`);
  }
  return true;
}
