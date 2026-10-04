function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Variável de ambiente ausente: ${name}. Veja .env.local.example.`);
  }
  return value;
}

// O Supabase só é usado no servidor, então aceitamos também os nomes já
// existentes no .env do projeto (SUPABASE_URL / SUPABASE_ANON_KEY).
export const supabaseUrl = () =>
  required(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL,
  );

export const supabasePublishableKey = () =>
  required(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY,
  );

/**
 * URL pública do site. Em produção na Vercel, sem NEXT_PUBLIC_SITE_URL,
 * usa o domínio de produção do projeto (variável de sistema da Vercel).
 */
export const siteUrl = () => {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercelHost) return `https://${vercelHost}`;
  return "http://localhost:3000";
};

/**
 * Chave pública do Mercado Pago. Lida no servidor e repassada à página;
 * aceita também MERCADOPAGO_PUBLIC_KEY (nome usado nas variáveis da Vercel).
 */
export const mercadoPagoPublicKey = () =>
  process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY || process.env.MERCADOPAGO_PUBLIC_KEY || "";
