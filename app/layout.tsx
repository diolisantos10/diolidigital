import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#070A1F",
};

export const metadata: Metadata = {
  title: {
    default: "Dioli Digital — Agência Digital com IA",
    template: "%s · Dioli Digital",
  },
  description: "Estratégia humana. Execução inteligente. Social media, tráfego pago e identidade visual potencializados por IA.",
  applicationName: "Dioli Digital",
  openGraph: {
    title: "Dioli Digital — Agência Digital com IA",
    description: "Estratégia humana. Execução inteligente.",
    type: "website",
    locale: "pt_BR",
    siteName: "Dioli Digital",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <head>
        {/* HUMANTECH typography — Sora (títulos) + Inter (textos) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Sora:wght@500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
