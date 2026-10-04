"use client";

// A costura entre o servidor e a tela. Existe por um motivo só: o `page.tsx` é
// servidor (lê o Prisma com a posse do workspace) e o workspace precisa de
// estado — abas, modais, gaveta do chat. É aqui que os blocos REAIS desta casa
// são montados dentro das abas certas, para que nada do que a página anterior
// mostrava se perca na migração.

import { AnalistaDeSocial } from "@/components/agency/social/AnalistaDeSocial";
import { useState } from "react";
import { ClientWorkspaceShell } from "./ClientWorkspaceShell";
import { AtividadeDoCliente, EditarClienteModal, LinkDoPortalModal } from "./blocos-da-casa";
import FonteExternaCityJobs from "@/components/agency/clients/FonteExternaCityJobs";
import FaltaParaPublicar from "@/components/agency/clients/FaltaParaPublicar";
import { FichaUnicaDeMarca } from "@/components/agency/clients/FichaUnicaDeMarca";
import MaterialDeMarca from "@/components/agency/clients/MaterialDeMarca";
import RedesDoCliente from "@/components/agency/clients/RedesDoCliente";
import ReconciliarCarrosseis from "@/components/agency/clients/ReconciliarCarrosseis";
import PacoteDaMarca from "@/components/agency/clients/PacoteDaMarca";
import ModoDeAprovacao from "@/components/agency/clients/ModoDeAprovacao";
import RefacoesDoMes from "@/components/agency/clients/RefacoesDoMes";
import Acervo from "@/components/agency/clients/Acervo";
import DnaDaMarca from "@/components/agency/clients/DnaDaMarca";
import PastaDoDrive from "@/components/agency/clients/PastaDoDrive";
import EntradaDeMaterial from "@/components/agency/clients/EntradaDeMaterial";
import { escritaDaAba } from "./props-da-aba";
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
  // Mesmo gate de escrita da aba Social (SocialMediaTab) — quem sobe material
  // é quem produz o conteúdo, não só quem é master.
  const escritaSocial = escritaDaAba(perms, "social");
  // O bloco "Fonte externa" (CJ-J2) só existe para a marca City Jobs. Hoje não
  // há campo no schema marcando um cliente como "fonte externa" — a
  // plataforma (CJ-J1) ainda não criou isso — então a detecção é pelo nome,
  // que é como o resto da casa já identifica este cliente em teste e registro
  // (`__tests__/design/vazamento-entre-marcas.test.ts` usa as duas grafias:
  // "City Jobs" e "CityJobs"). Trocar para um campo de verdade é trabalho da
  // plataforma, não desta tela.
  const ehCityJobs = /city\s*jobs/i.test(view.client.name);

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
        // UMA ficha (04/10/2026): substitui Ficha de Marca + Brand Hub, que
        // gravavam em lugares diferentes e o Brand Hub descartava 7 campos.
        fichaDeMarca:    <FichaUnicaDeMarca clientId={id} podeEditar={escritaDaAba(perms, "branding").pode} />,
        materialDeMarca: <MaterialDeMarca clientId={id} />,
        redes:           <RedesDoCliente clientId={id} />,
        reconciliar:     ehMaster ? <ReconciliarCarrosseis clientId={id} /> : null,
        fonteExterna:    ehCityJobs ? <FonteExternaCityJobs clientId={id} /> : null,
        faltaParaPublicar: <FaltaParaPublicar clientId={id} />,
        pacoteDaMarca:   <PacoteDaMarca clientId={id} podeEditar={ehMaster} />,
        modoDeAprovacao: <ModoDeAprovacao clientId={id} podeEditar={ehMaster} />,
        refacoesDoMes:   <RefacoesDoMes clientId={id} podeEditar={ehMaster} />,
        acervo:          <Acervo clientId={id} podeEditar={ehMaster} />,
        analista:        <AnalistaDeSocial ehMaster={ehMaster} clientId={id} />,
        dna:             <DnaDaMarca clientId={id} podeEditar={ehMaster} />,
        pastaDoDrive:    <PastaDoDrive clientId={id} podeEditar={ehMaster} />,
        entradaDeMaterial: (
          <EntradaDeMaterial clientId={id} podeEnviar={escritaSocial.pode} motivoSemPermissao={escritaSocial.motivo} />
        ),
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
