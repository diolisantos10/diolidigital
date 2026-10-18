import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dioli Agency OS — Central de Trabalho",
  description: "Mockup da Central de Trabalho da Dioli Digital.",
  other: { "codex-preview": "development" },
  icons: { icon: "/brand/dioli-mark-navy.svg", shortcut: "/brand/dioli-mark-navy.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
