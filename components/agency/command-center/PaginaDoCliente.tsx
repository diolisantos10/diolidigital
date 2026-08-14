"use client";

// A casca de cliente da página. Existe por um motivo só: o `page.tsx` é
// servidor (lê o Prisma com a posse do workspace) e o Command Center precisa de
// estado — abas, modais, gaveta do chat. Este arquivo é a costura entre os
// dois, e é onde os blocos da casa são montados dentro das abas certas.

import { useState } from "react";
import { ClientCommandCenter } from "./ClientCommandCenter";
import { BrandHub, AtividadeDoCliente, EditarClienteModal, LinkDoPortalModal } from "./blocos-da-casa";
import { FichaDeMarca } from "@/components/agency/clients/FichaDeMarca";
import MaterialDeMarca from "@/components/agency/clients/MaterialDeMarca";
import RedesDoCliente from "@/components/agency/clients/RedesDoCliente";
import ReconciliarCarrosseis from "@/components/agency/clients/ReconciliarCarrosseis";
import type { AgencyClientView } from "@/lib/agency/command-center/vista";
import type { ClientSheetData } from "@/lib/agency/command-center/ficha";

export function PaginaDoCliente({
  view,
  sheet,
  loadError,
  ehMaster,
}: {
  view: AgencyClientView;
  sheet: ClientSheetData;
  loadError: string | null;
  /** `ReconciliarCarrosseis` é só para master — a ROTA também exige, e é ela
   *  que vale. Aqui é só não desenhar botão que o servidor vai recusar. */
  ehMaster: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [portalAberto, setPortalAberto] = useState(false);
  const id = view.client.id;

  return (
    <ClientCommandCenter
      view={view}
      sheet={sheet}
      loadError={loadError}
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
