import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#070A1F",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://diolidigital.com.br"),
  title: {
    default: "Dioli Digital — Estúdio digital com IA",
    template: "%s · Dioli Digital",
  },
  description: "Estratégia humana. Execução inteligente. Estúdio digital com IA: marketing, automações, agentes e sistemas para crescer no digital.",
  applicationName: "Dioli Digital",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Dioli Digital — Estúdio digital com IA",
    description: "Estratégia humana. Execução inteligente.",
    type: "website",
    locale: "pt_BR",
    siteName: "Dioli Digital",
    url: "https://diolidigital.com.br",
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
