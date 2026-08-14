// ═══════════════════════════════════════════════════════════════════════════
//  /agency/clients/[id] — o Client Command Center.
//
//  Substitui a página anterior (1.126 linhas, cliente por cliente empilhado em
//  cards) pelo layout aprovado no `CLAUDE_HANDOFF.md` de 14/08/2026. A regra do
//  handoff é "não redesenhar": a referência é a fonte visual de verdade, e o
//  porte preserva hierarquia, espaçamento, tipografia, componentes e o padrão
//  azul-marinho dos cabeçalhos.
//
//  ── A MUDANÇA ESTRUTURAL, E ELA NÃO É DE ESTILO ─────────────────────────
//
//  A página deixou de ser CLIENTE e virou SERVIDOR. A anterior era
//  `"use client"` inteira e lia tudo do `useAgencyStore` — inclusive
//  `MOCK_AGENTS` e `MOCK_BRAND_ASSETS`, dados de exemplo de clientes fictícios
//  (Sushikasa, Santioh) importados dentro da página de um cliente REAL. Para o
//  CityJobs isso resolvia em lista vazia por acaso, porque nenhum id batia; um
//  id de agente que coincidisse teria pintado nome e função inventados na ficha
//  de um cliente pagante.
//
//  Agora o dado vem do Prisma, com posse de workspace, em
//  `lib/agency/command-center/carregar-cliente.ts`. Nada de mock entra.
//
//  ── OS TRÊS ESTADOS ──────────────────────────────────────────────────────
//  · carregando → `loading.tsx` (esqueleto com a altura do conteúdo real)
//  · vazio      → cada aba tem `EmptyBlock` com o motivo e o próximo passo
//  · erro       → `loadError` desenha `ErrorBlock` com a evidência e "tentar de novo"
//  E o cliente que não existe (ou é de outro workspace) cai em `notFound()` —
//  404, nunca 403: responder "proibido" confirmaria que aquele id existe.
// ═══════════════════════════════════════════════════════════════════════════

import { notFound } from "next/navigation";
import { verifySession } from "@/lib/auth/dal";
import { carregarCliente } from "@/lib/agency/command-center/carregar-cliente";
import { PaginaDoCliente } from "@/components/agency/command-center/PaginaDoCliente";
import "@/components/agency/command-center/dioli.css";

export const dynamic = "force-dynamic";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await verifySession();

  const { view, sheet, error, encontrado } = await carregarCliente(id, session.workspaceId);
  if (!encontrado) return notFound();

  return (
    <PaginaDoCliente
      view={view}
      sheet={sheet}
      loadError={error}
      ehMaster={session.role === "master"}
    />
  );
}
