// ═══════════════════════════════════════════════════════════════════════════
//  /agency/clients/[id] — o DASHBOARD INTERNO DO CLIENTE.
//
//  Substitui a página anterior (1.126 linhas, cards empilhados, sem navegação)
//  pelo workspace de doze abas do contrato de 15/08/2026.
//
//  ── A MUDANÇA ESTRUTURAL, E ELA NÃO É DE ESTILO ─────────────────────────
//
//  A página deixou de ser CLIENTE e virou SERVIDOR. A anterior era
//  `"use client"` inteira e lia tudo do `useAgencyStore` — inclusive
//  `MOCK_AGENTS` e `MOCK_BRAND_ASSETS`, dados de exemplo de clientes fictícios
//  importados dentro da página de um cliente REAL. Para alguns clientes isso
//  resolvia em lista vazia por acaso, porque nenhum id batia; um id de agente
//  que coincidisse teria pintado nome e função inventados na ficha de um
//  cliente pagante.
//
//  Agora o dado vem do Prisma, com posse de workspace
//  (`lib/agency/clients/workspace/carregar-cliente.ts`). Nada de mock entra.
//
//  ── AS TRÊS CAMADAS DE PERMISSÃO ────────────────────────────────────────
//   1. UI       → `perms` desce do servidor e desabilita com motivo.
//   2. API      → `exigirEscritaNaArea` devolve 403 nas rotas de escrita.
//   3. Consulta → a leitura é sempre `{ id, workspaceId }`. Papel não amplia
//                 inquilino: um Master só é master DA CASA DELE.
//  Nenhuma substitui a outra. Guardrail 4: prompt é aviso, código é trava.
//
//  ── OS ESTADOS ───────────────────────────────────────────────────────────
//  · carregando   → `loading.tsx` (esqueleto com a altura do conteúdo real)
//  · vazio        → cada aba tem `EmptyBlock` com o motivo e o próximo passo
//  · erro         → `loadError` desenha `ErrorBlock` com a evidência
//  · sem permissão→ controle desabilitado com o motivo, nunca sumido
//  E o cliente que não existe (ou é de outro workspace) cai em `notFound()` —
//  404, nunca 403: responder "proibido" confirmaria que aquele id existe.
// ═══════════════════════════════════════════════════════════════════════════

import { notFound } from "next/navigation";
import { verifySession } from "@/lib/auth/dal";
import { carregarCliente } from "@/lib/agency/clients/workspace/carregar-cliente";
import { permissoesDoWorkspace, podeVerClienteInterno } from "@/lib/agency/clients/workspace/permissoes";
import { PaginaDoCliente } from "@/components/agency/clients/workspace/PaginaDoCliente";
import {
  CLIENT_WORKSPACE_TAB_IDS,
  CLIENT_WORKSPACE_TAB_PARAM,
  abaDaQuery,
} from "@/components/agency/clients/workspace/client-workspace-tabs";
import "@/components/agency/clients/workspace/workspace.css";

export const dynamic = "force-dynamic";

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const session = await verifySession();

  // TODO papel interno VÊ todo cliente e toda aba — é o contrato. Quem não é
  // papel interno (o `client` do portal) não chega aqui: cai em 404, pelo mesmo
  // motivo do id inexistente.
  if (!podeVerClienteInterno(session.role)) return notFound();

  const { view, sheet, error, encontrado } = await carregarCliente(id, session.workspaceId);
  if (!encontrado) return notFound();

  const bruto = sp[CLIENT_WORKSPACE_TAB_PARAM];
  const abaInicial = abaDaQuery(Array.isArray(bruto) ? bruto[0] : bruto);

  return (
    <PaginaDoCliente
      view={view}
      sheet={sheet}
      perms={permissoesDoWorkspace(session.role, CLIENT_WORKSPACE_TAB_IDS)}
      loadError={error}
      ehMaster={session.role === "master"}
      abaInicial={abaInicial}
    />
  );
}
