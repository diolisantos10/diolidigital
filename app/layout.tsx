import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#070A1F",
  // ⛔ A TRAVA CONTRA O TEMA ESCURO QUE NÃO É NOSSO. 16/08/2026: o CEO abriu a
  // confirmação do briefing no celular e não conseguiu ler o botão do WhatsApp
  // — *"está preto sobre preto."*
  //
  // Página que não declara `color-scheme` autoriza o Chrome do Android a
  // escurecê-la por conta própria: ele inverte o que é claro e deixa quieto o
  // que já é escuro, e o resultado é botão escuro sobre fundo que virou escuro.
  // Some SÓ no celular — que é onde está a maioria dos visitantes e onde
  // nenhum de nós olha antes de subir.
  //
  // Isto vira `<meta name="color-scheme">`, que é o que o navegador lê. A regra
  // equivalente em CSS mora em `globals.css`; as duas dizem a mesma coisa de
  // propósito, porque o CSS pode ser reescrito pelo compilador e a meta não.
  colorScheme: "light",
};

export const metadata: Metadata = {
  // O ENDEREÇO DA CASA É `www`. Ordem do CEO em 16/08/2026: *"está tudo ainda
  // com o domínio, é pra estar diolidigital.com.br."* O `metadataBase` é o que
  // o Next usa para transformar caminho relativo em URL absoluta — canônica,
  // Open Graph, imagem de compartilhamento. Errar aqui não quebra tela nenhuma:
  // vaza calado para o Google e para o card que o cliente vê no WhatsApp.
  metadataBase: new URL("https://www.diolidigital.com.br"),
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
    url: "https://www.diolidigital.com.br",
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
