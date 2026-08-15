// ─── O INVENTÁRIO DAS PÁGINAS INTERNAS ───────────────────────────────────────
//
// Toda rota de `/agency/**` que existe no produto está declarada aqui, com
// dono e nível de acesso. Este arquivo é o registro; a navegação, o guarda de
// página e o guarda de API leem os três a partir dele.
//
// ── Por que o inventário existe ─────────────────────────────────────────────
//
// Antes, "quem vê o quê" era uma tabela de URLs escrita à mão por papel
// (`ROLE_NAV_ALLOWLIST`). Tela nova nascia invisível para todo mundo menos
// master e PM, e ninguém percebia — porque esquecer de acrescentar a URL em
// seis listas não quebra teste nenhum. O WhatsApp e o Radar do mercado ficaram
// meses no ar sem um único link na interface por causa disso.
//
// Aqui a omissão é ruidosa: `__tests__/agency/organizacao/inventario.test.ts`
// varre `app/agency/**` e reprova página que exista em disco e não esteja
// nesta lista. Portão que ninguém pode esquecer de abrir.
//
// ── A REGRA DE FECHAMENTO ───────────────────────────────────────────────────
//
//   Rota desconhecida é NEGADA para quem não é direção.
//
// É o guardrail 2 da companhia aplicado a acesso: esquecer de registrar uma
// tela nunca pode significar "liberada para todos". Master e Diretor seguem
// alcançando tudo — inclusive o que ainda não foi registrado — porque o
// contrato diz "todas as rotas atuais e futuras" com todas as letras.
// ─────────────────────────────────────────────────────────────────────────────

import type { DepartamentoId } from "./departamentos";
import {
  eDirecao,
  eGestao,
  eInterno,
  type PerfilOrganizacional,
} from "./autoridade";

/**
 * Quem pode ABRIR a página. Note que abrir ≠ editar: a maior parte das telas é
 * `todos_internos` e renderiza em modo de consulta para quem não é dono.
 */
export type NivelDeAcesso =
  /** Qualquer pessoa da casa abre. Edição continua presa ao dono. */
  | "todos_internos"
  /** O departamento dono + master, diretor e PM. */
  | "dono_e_gestao"
  /** Master, diretor e PM — a leitura transversal da casa. */
  | "gestao";

export interface PaginaInterna {
  /** Caminho canônico. Segmento dinâmico entra como o pai (`/agency/clients`). */
  href: string;
  /** Como a página se chama para quem usa. */
  titulo: string;
  /** Departamento responsável. `"casa"` = transversal, sem autoria de área. */
  dono: DepartamentoId | "casa";
  acesso: NivelDeAcesso;
  /**
   * A página mexe em segredo, configuração global ou dado de todos os clientes?
   *
   * ⚠️ Isto NÃO fecha a porta da página — fecha o botão de dentro dela.
   * Foi decisão consciente: o contrato proíbe esconder tela desta entrega, e o
   * PM abre hoje todas as telas do painel. Tirar `/agency/settings` do menu
   * dele seria remover funcionalidade em cima de preferência presumida.
   * O que muda é a AÇÃO: rotacionar chave de IA, disparar backup, resetar a
   * base e ligar integração exigem `podeAdministrar()`, que é só direção.
   * Guardrail 4 da companhia: prompt é aviso, código é trava — a trava fica
   * na API (`guarda.ts`), não no menu.
   */
  administrativa?: boolean;
  /**
   * A página aparece no menu lateral?
   *
   * `false` NÃO esconde a página de ninguém — apenas diz que ela é alcançada
   * por dentro de outra (detalhe de cliente, escopo de solicitação). A
   * permissão continua valendo igual.
   */
  noMenu: boolean;
}

export const PAGINAS: PaginaInterna[] = [
  // ── Entrada ────────────────────────────────────────────────────────────────
  { href: "/agency",                       titulo: "Entrada da agência",      dono: "casa",               acesso: "todos_internos", noMenu: false },
  { href: "/agency/dashboard",             titulo: "Central de Trabalho",     dono: "casa",               acesso: "todos_internos", noMenu: true  },
  { href: "/agency/dashboard/operacao",    titulo: "Painel de operação",      dono: "casa",               acesso: "todos_internos", noMenu: true  },
  // A tela que EXPLICA o barramento precisa ser alcançável por quem foi
  // barrado — senão o guarda barra a explicação e a pessoa vê um laço.
  { href: "/agency/sem-permissao",         titulo: "Sem permissão",           dono: "casa",               acesso: "todos_internos", noMenu: false },

  // ── Porta da frente — Atendimento ─────────────────────────────────────────
  { href: "/agency/requests",              titulo: "Solicitações",            dono: "client-service-sdr", acesso: "dono_e_gestao",  noMenu: true  },
  { href: "/agency/leads",                 titulo: "Quem procurou",           dono: "client-service-sdr", acesso: "dono_e_gestao",  noMenu: true  },
  { href: "/agency/oportunidades",         titulo: "Oportunidades",           dono: "client-service-sdr", acesso: "dono_e_gestao",  noMenu: true  },
  { href: "/agency/inbox",                 titulo: "Caixa de entrada",        dono: "client-service-sdr", acesso: "dono_e_gestao",  noMenu: true  },
  { href: "/agency/whatsapp",              titulo: "WhatsApp",                dono: "client-service-sdr", acesso: "dono_e_gestao",  noMenu: true  },

  // ── Trabalho — transversal de propósito ───────────────────────────────────
  // Estas são as telas onde a casa inteira se enxerga. Fechá-las por
  // departamento é como a agência vira silo: o Design descobre a promessa do
  // Tráfego pelo cliente reclamando.
  { href: "/agency/approvals",             titulo: "Aprovações",              dono: "project-management", acesso: "todos_internos", noMenu: true  },
  { href: "/agency/projects",              titulo: "Projetos",                dono: "project-management", acesso: "todos_internos", noMenu: true  },
  { href: "/agency/pipeline",              titulo: "Pipeline",                dono: "project-management", acesso: "todos_internos", noMenu: true  },
  { href: "/agency/planner",               titulo: "Planner",                 dono: "project-management", acesso: "todos_internos", noMenu: true  },
  { href: "/agency/tasks",                 titulo: "Tarefas",                 dono: "project-management", acesso: "todos_internos", noMenu: true  },
  { href: "/agency/deliverables",          titulo: "Entregas",                dono: "project-management", acesso: "todos_internos", noMenu: true  },
  { href: "/agency/execution",             titulo: "Execução do projeto",     dono: "project-management", acesso: "todos_internos", noMenu: false },
  { href: "/agency/desempenho-pago",       titulo: "Desempenho pago",         dono: "paid-traffic",       acesso: "todos_internos", noMenu: true  },

  // ── Clientes — a leitura global que o CEO mandou preservar ────────────────
  { href: "/agency/clients",               titulo: "Clientes",                dono: "casa",               acesso: "todos_internos", noMenu: true  },

  // ── Financeiro ────────────────────────────────────────────────────────────
  { href: "/agency/financeiro",            titulo: "DRE & custos",            dono: "financeiro",         acesso: "dono_e_gestao",  noMenu: true  },
  { href: "/agency/catalog",               titulo: "Planos & Preços",         dono: "financeiro",         acesso: "dono_e_gestao",  noMenu: true  },

  // ── Ferramentas de departamento ───────────────────────────────────────────
  // Aqui a régua muda: são as mesas de trabalho onde a peça é PRODUZIDA. Ler o
  // resultado do outro é livre (está nas telas de cliente e de entregas); usar
  // a mesa do outro, não.
  { href: "/agency/brand-assets",          titulo: "Ativos de Marca",         dono: "brand-hub",          acesso: "dono_e_gestao",  noMenu: true  },
  { href: "/agency/brand-hub-agent",       titulo: "Brand Hub",               dono: "brand-hub",          acesso: "dono_e_gestao",  noMenu: false },
  { href: "/agency/social-media-agent",    titulo: "Social Media",            dono: "social-media",       acesso: "dono_e_gestao",  noMenu: true  },
  { href: "/agency/design-agent",          titulo: "Design",                  dono: "design",             acesso: "dono_e_gestao",  noMenu: true  },
  { href: "/agency/ads-agent",             titulo: "Tráfego Pago",            dono: "paid-traffic",       acesso: "dono_e_gestao",  noMenu: true  },
  { href: "/agency/google",                titulo: "Google",                  dono: "paid-traffic",       acesso: "dono_e_gestao",  noMenu: true  },
  { href: "/agency/strategy-agent",        titulo: "Estratégia",              dono: "strategy",           acesso: "dono_e_gestao",  noMenu: false },
  { href: "/agency/orchestrator",          titulo: "Strategy Room",           dono: "strategy",           acesso: "dono_e_gestao",  noMenu: false },
  { href: "/agency/pm-agent",              titulo: "Gestão de Projetos",      dono: "project-management", acesso: "dono_e_gestao",  noMenu: false },
  { href: "/agency/operations-agent",      titulo: "Operações",               dono: "operations",         acesso: "dono_e_gestao",  noMenu: false },
  { href: "/agency/radar",                 titulo: "Radar do mercado",        dono: "analytics",          acesso: "dono_e_gestao",  noMenu: true  },

  // ── Casa e sistema ────────────────────────────────────────────────────────
  { href: "/agency/agents",                titulo: "Sala dos Agentes",        dono: "casa",               acesso: "gestao",         noMenu: true  },
  { href: "/agency/brain",                 titulo: "Dioli Brain",             dono: "operations",         acesso: "gestao",         noMenu: true,  administrativa: true },
  { href: "/agency/control-room",          titulo: "Sala de comando",         dono: "operations",         acesso: "gestao",         noMenu: false, administrativa: true },
  { href: "/agency/escada",                titulo: "Escada de liberação",     dono: "quality",            acesso: "gestao",         noMenu: false, administrativa: true },
  { href: "/agency/simulations/training",  titulo: "Centro de treinamento",   dono: "quality",            acesso: "gestao",         noMenu: false, administrativa: true },
  { href: "/agency/integrations",          titulo: "Ferramentas & Integrações", dono: "operations",       acesso: "gestao",         noMenu: true,  administrativa: true },
  { href: "/agency/settings",              titulo: "Configurações",           dono: "operations",         acesso: "gestao",         noMenu: true,  administrativa: true },
];

// ─── Resolução de rota ───────────────────────────────────────────────────────

/**
 * Da URL para a página registrada. Casa por prefixo, do mais específico para o
 * menos — `/agency/dashboard/operacao` NÃO pode cair em `/agency/dashboard`,
 * senão herdaria a permissão errada.
 *
 * Segmento dinâmico resolve no pai: `/agency/clients/abc123` → `/agency/clients`.
 */
export function resolverPagina(href: string): PaginaInterna | null {
  const caminho = (href.split("?")[0] ?? "").split("#")[0]?.replace(/\/+$/, "") || "/agency";
  let melhor: PaginaInterna | null = null;
  for (const p of PAGINAS) {
    if (caminho === p.href || caminho.startsWith(p.href + "/")) {
      if (!melhor || p.href.length > melhor.href.length) melhor = p;
    }
  }
  return melhor;
}

export function donoDaRota(href: string): DepartamentoId | "casa" | null {
  return resolverPagina(href)?.dono ?? null;
}

// ─── A decisão ───────────────────────────────────────────────────────────────

/**
 * Este perfil pode ABRIR esta rota?
 *
 * Usada nas três camadas — menu, página e API. É de propósito: três cópias da
 * mesma regra é como o menu esconde e a URL direta entrega.
 */
export function podeAbrirRota(perfil: PerfilOrganizacional, href: string): boolean {
  // Camada 0: quem não é da casa não entra em `/agency/**`. Nem com URL na mão.
  if (!eInterno(perfil.autoridade)) return false;

  // Master e Diretor: tudo, inclusive rota que ainda não foi registrada.
  if (eDirecao(perfil.autoridade)) return true;

  const pagina = resolverPagina(href);
  // Fechamento: rota fora do inventário não é liberada por omissão.
  if (!pagina) return false;

  switch (pagina.acesso) {
    case "todos_internos":
      return true;
    case "gestao":
      return eGestao(perfil.autoridade);
    case "dono_e_gestao":
      if (eGestao(perfil.autoridade)) return true;
      return pagina.dono !== "casa" && perfil.departamentos.includes(pagina.dono);
  }
}

/**
 * A rota abre, mas só para consulta?
 *
 * Existe porque a interface tem TRÊS respostas, não duas: "opera", "só olha" e
 * "não entra". Devolver booleano de acesso e deixar a tela adivinhar a segunda
 * é como nasce a tela sem botão que parece quebrada.
 */
export function rotaEmModoDeConsulta(perfil: PerfilOrganizacional, href: string): boolean {
  if (!podeAbrirRota(perfil, href)) return false;
  if (eDirecao(perfil.autoridade)) return false;
  const pagina = resolverPagina(href);
  if (!pagina || pagina.dono === "casa") return false;
  if (perfil.autoridade === "project_manager") return false;
  return !perfil.departamentos.includes(pagina.dono);
}

/** As rotas que este perfil enxerga. Base da navegação — derivada, nunca escrita. */
export function rotasVisiveis(perfil: PerfilOrganizacional): string[] {
  if (eDirecao(perfil.autoridade)) return PAGINAS.map((p) => p.href);
  return PAGINAS.filter((p) => podeAbrirRota(perfil, p.href)).map((p) => p.href);
}
