"use client";

// A costura entre o servidor e a tela. Existe por um motivo só: o `page.tsx` é
// servidor (lê o Prisma com a posse do workspace) e o workspace precisa de
// estado — abas, modais, gaveta do chat. É aqui que os blocos REAIS desta casa
// são montados dentro das abas certas, para que nada do que a página anterior
// mostrava se perca na migração.

import { useState } from "react";
import { ClientWorkspaceShell } from "./ClientWorkspaceShell";
import { BrandHub, AtividadeDoCliente, EditarClienteModal, LinkDoPortalModal } from "./blocos-da-casa";
import { FichaDeMarca } from "@/components/agency/clients/FichaDeMarca";
import MaterialDeMarca from "@/components/agency/clients/MaterialDeMarca";
import RedesDoCliente from "@/components/agency/clients/RedesDoCliente";
import ReconciliarCarrosseis from "@/components/agency/clients/ReconciliarCarrosseis";
import type { AgencyClientView } from "@/lib/agency/clients/workspace/vista";
import type { ClientSheetData } from "@/lib/agency/clients/workspace/ficha";
import type { PermissoesDoWorkspace } from "@/lib/agency/clients/workspace/permissoes";
import type { ClientWorkspaceTabId } from "./client-workspace-tabs";

export function PaginaDoCliente({
  view,
  sheet,
  perms,
  loadError,
  ehMaster,
  abaInicial,
}: {
  view: AgencyClientView;
  sheet: ClientSheetData;
  perms: PermissoesDoWorkspace;
  loadError: string | null;
  /** `ReconciliarCarrosseis` é só para master — a ROTA também exige, e é ela
   *  que vale. Aqui é só não desenhar botão que o servidor vai recusar. */
  ehMaster: boolean;
  /** A aba lida do `?tab=` no servidor: evita o pisca de abrir na Visão Geral
   *  e saltar para a aba do deep-link depois da hidratação. */
  abaInicial?: ClientWorkspaceTabId;
}) {
  const [editando, setEditando] = useState(false);
  const [portalAberto, setPortalAberto] = useState(false);
  const id = view.client.id;

  return (
    <ClientWorkspaceShell
      view={view}
      sheet={sheet}
      perms={perms}
      loadError={loadError}
      abaInicial={abaInicial}
      onEditar={() => setEditando(true)}
      onPortal={() => setPortalAberto(true)}
      blocos={{
        fichaDeMarca:    <FichaDeMarca clientId={id} />,
        materialDeMarca: <MaterialDeMarca clientId={id} />,
        brandHub:        <BrandHub clientId={id} />,
        redes:           <RedesDoCliente clientId={id} />,
        reconciliar:     ehMaster ? <ReconciliarCarrosseis clientId={id} /> : null,
        atividade:       <AtividadeDoCliente clientId={id} />,
        editar:          <EditarClienteModal clientId={id} open={editando} onClose={() => setEditando(false)} />,
        portal:          (
          <LinkDoPortalModal
            clientId={id}
            clientName={view.client.name}
            open={portalAberto}
            onClose={() => setPortalAberto(false)}
          />
        ),
      }}
    />
  );
}
