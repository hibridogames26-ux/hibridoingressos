import "server-only";
import nodemailer from "nodemailer";
import { Resend } from "resend";
import { event } from "@/config/event";
import { formatEventDate } from "@/lib/format";

export type TicketEmailData = {
  to: string;
  buyerName: string;
  orderUrl: string;
  tickets: { holderName: string; ticketType: string; eventDate: string; shortCode: string }[];
};

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function ticketEmailHtml({ buyerName, orderUrl, tickets }: Omit<TicketEmailData, "to">) {
  const rows = tickets
    .map(
      (t) => `<tr>
        <td style="padding:12px 0;border-top:1px solid #dedee5">
          <strong>${escapeHtml(t.holderName)}</strong><br>
          <span style="color:#686b82">${escapeHtml(t.ticketType)} · ${escapeHtml(formatEventDate(t.eventDate))}</span>
        </td>
        <td style="padding:12px 0;border-top:1px solid #dedee5;text-align:right;font-family:monospace;font-size:16px;letter-spacing:2px">${escapeHtml(t.shortCode)}</td>
      </tr>`,
    )
    .join("");

  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f7f7f9;font-family:Helvetica,Arial,sans-serif;color:#101114">
  <div style="max-width:520px;margin:0 auto;padding:32px 16px">
    <div style="background:#fff;border:1px solid #dedee5;border-radius:16px;padding:28px">
      <h1 style="margin:0 0 8px;font-size:24px">Seus ingressos estão confirmados</h1>
      <p style="margin:0 0 20px;color:#686b82">Olá, ${escapeHtml(buyerName.split(" ")[0] ?? "")}! Pagamento aprovado para o ${escapeHtml(event.name)} ${event.year}.</p>
      <p style="margin:0 0 24px"><a href="${escapeHtml(orderUrl)}" style="display:inline-block;background:#7132f5;color:#fff;text-decoration:none;font-weight:600;padding:13px 20px;border-radius:12px">Abrir meus ingressos (QR code)</a></p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table>
      <p style="margin:24px 0 0;font-size:13px;color:#686b82">Apresente o QR code na entrada para receber sua pulseira. Cada ingresso só pode ser lido uma vez — não compartilhe o link nem prints.</p>
    </div>
  </div></body></html>`;
}

export type EmailProvider = "gmail" | "resend" | null;

/** Gmail (senha de app) tem prioridade; Resend fica como alternativa. */
export function emailProvider(env: Record<string, string | undefined> = process.env): EmailProvider {
  if (env.GMAIL_USER && env.GMAIL_APP_PASSWORD) return "gmail";
  if (env.RESEND_API_KEY || env.RESEND_API) return "resend";
  return null;
}

async function sendViaGmail(message: { to: string; subject: string; html: string }) {
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
  });
}

async function sendViaResend(message: { to: string; subject: string; html: string }) {
  // Aceita também o nome RESEND_API, usado no .env do projeto.
  const apiKey = (process.env.RESEND_API_KEY ?? process.env.RESEND_API)!;
  const from = process.env.EMAIL_FROM ?? "Híbrido Games <onboarding@resend.dev>";
  const { error } = await new Resend(apiKey).emails.send({ from, ...message });
  if (error) throw new Error(error.message);
}

/** Envia o e-mail de ingressos; retorna false se nenhum provedor estiver configurado. */
export async function sendTicketsEmail(data: TicketEmailData) {
  const provider = emailProvider();
  if (!provider) {
    console.warn("Nenhum provedor de e-mail configurado (GMAIL_USER/GMAIL_APP_PASSWORD): e-mail não enviado.");
    return false;
  }
  const message = {
    to: data.to,
    subject: `Seus ingressos — ${event.name} ${event.year}`,
    html: ticketEmailHtml(data),
  };
  try {
    if (provider === "gmail") await sendViaGmail(message);
    else await sendViaResend(message);
  } catch (error) {
    throw new Error(`Falha ao enviar e-mail via ${provider}: ${error instanceof Error ? error.message : error}`);
  }
  return true;
}
