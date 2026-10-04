import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import { siteUrl } from "@/lib/env";
import "./globals.css";

const plex = IBM_Plex_Sans({
  variable: "--font-plex",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const title = "Híbrido Games 2026 — Ingressos oficiais";
const description =
  "Canal oficial do Híbrido Games 2026, evento de funcional fitness chancelado pela FPF3. Compre seu ingresso e acompanhe as novidades.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title,
  description,
  openGraph: {
    title,
    description,
    locale: "pt_BR",
    type: "website",
    images: [{ url: "/logo-hibrido-games.png", width: 1271, height: 1426 }],
  },
  twitter: { card: "summary", title, description },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  // Ocupa a tela inteira no iPhone; as áreas seguras são tratadas no CSS.
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${plex.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">{children}</body>
    </html>
  );
}
