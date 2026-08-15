// ═══════════════════════════════════════════════════════════════════════════
//  A PERMISSÃO DO WORKSPACE DO CLIENTE — uma política, três camadas.
//
//  A regra do contrato, em uma frase: **todo mundo de dentro VÊ tudo; cada um
//  ESCREVE só na sua área.** O time inteiro precisa consultar o que as outras
//  áreas produziram — o Design lê o Brand Hub, o Social lê a Estratégia, o
//  Comercial lê a operação antes de falar com o cliente. Esconder aba de quem
//  precisa consultar não protege nada: produz cópia de informação por WhatsApp.
//
//  ── POR QUE ESTE ARQUIVO EXISTE, SE JÁ EXISTE `lib/agency/roles.ts` ──────
//  Porque `roles.ts` responde "esta pessoa vê este item de menu?" e aqui a
//  pergunta é outra: "esta pessoa pode ESCREVER neste objeto deste cliente?".
//  A primeira é navegação; a segunda é efeito. Misturá-las foi o que produziu
//  `canViewAllClients: false` para o Social — que escondia a lista de clientes
//  de quem produz para eles.
//
//  ── AS TRÊS CAMADAS, E NENHUMA SUBSTITUI A OUTRA ────────────────────────
//   1. UI      — `podeEscreverNaArea` decide botão habilitado × desabilitado
//                com motivo. NUNCA some com o controle: sumir ensina que a
//                função não existe; desabilitado com motivo ensina de quem é.
//   2. API     — `exigirEscritaNaArea` devolve 403 nas rotas de escrita.
//   3. Consulta— a leitura é sempre `{ id, workspaceId }` (posse-de-workspace).
//                Papel não amplia inquilino: um Master só é master DA CASA DELE.
//
//  ── INTEGRAÇÕES: NINGUÉM DE DENTRO ESCREVE ──────────────────────────────
//  Nem Master. A área "somente-leitura" não tem papel autorizado — é lista
//  vazia, não `["master"]`. Conectar, reconectar, trocar conta, alterar escopo
//  e remover são atos do CLIENTE, no portal dele, porque é a conta dele e o
//  consentimento é dele. A agência que "reconecta para ajudar" está pedindo
//  credencial por fora, e é assim que se perde acesso e confiança de uma vez.
// ═══════════════════════════════════════════════════════════════════════════

import type { AgencyRole } from "@/lib/agency/roles";
import type { ClientWorkspaceArea, ClientWorkspaceTabId } from "@/components/agency/clients/workspace/client-workspace-tabs";
import { areaDaAba } from "@/components/agency/clients/workspace/client-workspace-tabs";

/** Todo papel interno. `client` não está aqui — ele é do portal, e o portal
 *  não monta nenhuma tela deste diretório. */
export const PAPEIS_INTERNOS: readonly AgencyRole[] = [
  "master",
  "project_manager",
  "executivo_comercial",
  "social_staff",
  "design_staff",
  "ads_staff",
] as const;

/**
 * Quem escreve em cada área.
 *
 * Master e PM aparecem em quase todas porque o contrato lhes dá "gestão
 * operacional do cliente". O que eles NÃO têm é `somente-leitura`: a lista é
 * vazia ali, e vazia é o ponto.
 */
const ESCRITA_POR_AREA: Record<ClientWorkspaceArea, readonly AgencyRole[]> = {
  // Cadastro, solicitações e a conversa com o cliente. O Comercial entra
  // porque intake, proposta e onboarding são dele.
  relacionamento: ["master", "project_manager", "executivo_comercial"],
  estrategia:     ["master", "project_manager"],
  social:         ["master", "project_manager", "social_staff"],
  // Branding e Design se consultam (Brand Hub, Brand Book, moodboard, Creative
  // Review) — mas consultar é leitura, e leitura é de todos. A escrita da
  // marca é do Branding; nesta casa o papel que a carrega é o PM.
  branding:       ["master", "project_manager", "design_staff"],
  design:         ["master", "project_manager", "design_staff"],
  trafego:        ["master", "project_manager", "ads_staff"],
  operacao:       ["master", "project_manager"],
  "somente-leitura": [],
};

/** Por que a área está fechada para este papel — vira `title` do botão
 *  desabilitado. Botão desabilitado sem motivo é a mesma frustração de um
 *  botão que não faz nada, com um passo a mais. */
export const MOTIVO_SEM_ESCRITA: Record<ClientWorkspaceArea, string> = {
  relacionamento: "Só Master, Project Manager e Comercial alteram o cadastro e o relacionamento deste cliente.",
  estrategia:     "A estratégia do cliente é escrita por Master ou Project Manager.",
  social:         "A escrita em Social Media é do time de Social, do PM ou do Master.",
  branding:       "A escrita da marca é do time de Design/Branding, do PM ou do Master.",
  design:         "A escrita em Design é do time de Design, do PM ou do Master.",
  trafego:        "A escrita em Tráfego Pago é do time de Ads, do PM ou do Master.",
  operacao:       "Projetos, aprovações e entregas são operados por Master ou Project Manager.",
  "somente-leitura":
    "Integrações são da conta do cliente: só ele conecta, reconecta, troca de conta, altera escopos ou remove — pelo portal dele. O painel interno é somente leitura para todos os papéis, inclusive Master.",
};

/** TODO papel interno vê TODO cliente e TODA aba. O contrato é explícito, e
 *  a função existe para o teste poder afirmar isso sem ler o mapa. */
export function podeVerClienteInterno(role: AgencyRole): boolean {
  return (PAPEIS_INTERNOS as readonly string[]).includes(role);
}

export function podeVerAba(role: AgencyRole, _aba: ClientWorkspaceTabId): boolean {
  return podeVerClienteInterno(role);
}

export function podeEscreverNaArea(role: AgencyRole, area: ClientWorkspaceArea): boolean {
  return (ESCRITA_POR_AREA[area] as readonly string[]).includes(role);
}

export function podeEscreverNaAba(role: AgencyRole, aba: ClientWorkspaceTabId): boolean {
  return podeEscreverNaArea(role, areaDaAba(aba));
}

/** Nenhum papel interno escreve integração. Existe como função para a UI e o
 *  servidor perguntarem a mesma coisa ao mesmo lugar. */
export function podeAlterarIntegracoes(_role: AgencyRole): false {
  return false;
}

export type PermissoesDoWorkspace = {
  role: AgencyRole;
  /** Por aba: pode escrever? Serializável — atravessa servidor → cliente. */
  escrita: Record<ClientWorkspaceTabId, boolean>;
  /** Por aba: o motivo, quando não pode. */
  motivo: Record<ClientWorkspaceTabId, string | null>;
};

/** Monta o pacote que o servidor entrega à tela. A tela NUNCA recalcula
 *  permissão a partir do papel: ela só lê este objeto. Assim existe um lugar
 *  só onde a regra é aplicada, e o teste mira nele. */
export function permissoesDoWorkspace(
  role: AgencyRole,
  abas: readonly ClientWorkspaceTabId[],
): PermissoesDoWorkspace {
  const escrita = {} as Record<ClientWorkspaceTabId, boolean>;
  const motivo = {} as Record<ClientWorkspaceTabId, string | null>;
  for (const aba of abas) {
    const area = areaDaAba(aba);
    const pode = podeEscreverNaArea(role, area);
    escrita[aba] = pode;
    motivo[aba] = pode ? null : MOTIVO_SEM_ESCRITA[area];
  }
  return { role, escrita, motivo };
}
