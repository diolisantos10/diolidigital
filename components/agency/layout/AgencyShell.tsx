"use client";

import { useState } from "react";
import AgencySidebar from "./AgencySidebar";
import { AgencyTopBar } from "./AgencyTopBar";
import { useHydrateFromDb } from "@/lib/hooks/useHydrateFromDb";

interface UserInfo {
  name: string;
  role: string;
  workspaceId: string;
}

// O botão da barra aponta para a gaveta por `aria-controls`.
const NAV_ID = "agency-nav";

export function AgencyShell({
  userInfo,
  children,
}: {
  userInfo: UserInfo;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  // Pull DB-backed entities into the store so the panel shows the same data in
  // any browser / device, not just where it was created.
  useHydrateFromDb();

  // `.agency-shell` é quem SABE que existe barra fixa no celular: ele declara a
  // altura e a safe-area (app/globals.css) e `.agency-conteudo` reserva o espaço
  // a partir das mesmas variáveis. Remendo de `pt-` tela a tela sempre esquece
  // uma — ver DESIGN.md §6.1.
  return (
    <div className="agency-shell flex min-h-screen" style={{ background: "var(--bg)" }}>
      <AgencySidebar
        id={NAV_ID}
        userInfo={userInfo}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
      <AgencyTopBar aberto={mobileOpen} navId={NAV_ID} onAbrir={() => setMobileOpen(true)} />
      <main className="flex-1 md:ml-[224px] min-h-screen overflow-x-hidden">
        <div className="agency-conteudo max-w-[1240px] mx-auto px-4 md:px-8 pb-8 md:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
