import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Vitrine de Serviços · Dioli Digital",
  description: "Serviços de social media, vídeo e design com entrega rápida. Compre direto, sem contratos longos.",
};

export default function VitrineLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--bg)] flex flex-col">
      {children}
    </div>
  );
}
