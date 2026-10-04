// menu-principal.ts — O MENU DE 9 ITENS EM TORNO DO CLIENTE (CEO, 03 e 04/10/2026).
//
// Aprovado pelo CEO: Início, Clientes, Entrada, Aprovações, Conversas,
// Oportunidades, Agenda geral, Gestão, Agência por dentro. Nove ENTRADAS — não
// cinco itens mais quatro grupos abertos (que davam 18 links na tela).
//
// Entrada, Conversas, Gestão e Agência por dentro são PORTAS: cada uma abre
// uma página-índice com as telas de dentro (`filhos`). Nenhuma tela foi
// apagada; o item fica aceso em qualquer tela de dentro dele.
//
// ⚠️ "Desempenho pago" e "WhatsApp" continuam com porta na interface (dentro de
// Gestão e de Conversas): a análise do app da Meta precisa ver onde
// ads_management/ads_read e o WhatsApp são usados.
//
// Fonte ÚNICA: o menu lateral e as páginas-índice leem daqui.

export interface FilhoDoMenu {
  rotulo: string;
  href: string;
  /** Uma linha, para leigo: o que se faz lá. */
  descricao: string;
}

export interface ItemDoMenu {
  rotulo: string;
  href: string;
  /** Contador do item (chave resolvida no menu lateral). */
  contador?: "pendencias" | "solicitacoes" | "caixa";
  /** Só nas portas: as telas de dentro. */
  filhos?: FilhoDoMenu[];
}

export const MENU_PRINCIPAL: ItemDoMenu[] = [
  { rotulo: "Início", href: "/agency/dashboard" },
  { rotulo: "Clientes", href: "/agency/clients" },
  {
    rotulo: "Entrada",
    href: "/agency/entrada",
    contador: "solicitacoes",
    filhos: [
      { rotulo: "Quem procurou", href: "/agency/leads", descricao: "Quem chegou pelo site e ainda espera resposta." },
      { rotulo: "Solicitações", href: "/agency/requests", descricao: "Briefings recebidos, para virar projeto." },
      { rotulo: "Avisos de orçamento", href: "/agency/avisos-de-orcamento", descricao: "Orçamentos que não chegaram ao cliente e precisam de reenvio." },
    ],
  },
  { rotulo: "Aprovações", href: "/agency/approvals", contador: "pendencias" },
  {
    rotulo: "Conversas",
    href: "/agency/conversas",
    contador: "caixa",
    filhos: [
      { rotulo: "Caixa de entrada", href: "/agency/inbox", descricao: "Mensagens e pedidos dos clientes pelo portal." },
      { rotulo: "WhatsApp", href: "/agency/whatsapp", descricao: "Conversas do WhatsApp da agência." },
    ],
  },
  { rotulo: "Oportunidades", href: "/agency/oportunidades" },
  { rotulo: "Agenda geral", href: "/agency/planner" },
  {
    rotulo: "Gestão",
    href: "/agency/gestao",
    filhos: [
      { rotulo: "DRE & custos", href: "/agency/financeiro", descricao: "Receita, custos e resultado da agência." },
      { rotulo: "Planos & Preços", href: "/agency/catalog", descricao: "O que a agência vende e por quanto." },
      { rotulo: "Desempenho pago", href: "/agency/desempenho-pago", descricao: "Resultado dos anúncios de todos os clientes." },
      { rotulo: "Integrações", href: "/agency/integrations", descricao: "Ferramentas e chaves da agência." },
      { rotulo: "Google", href: "/agency/google", descricao: "Contas do Google ligadas à agência." },
      { rotulo: "Configurações", href: "/agency/settings", descricao: "Ajustes e diagnóstico do sistema." },
    ],
  },
  {
    rotulo: "Agência por dentro",
    href: "/agency/por-dentro",
    filhos: [
      { rotulo: "Sala dos Agentes", href: "/agency/agents", descricao: "Quem trabalha na agência e em quê." },
      { rotulo: "Dioli Brain", href: "/agency/brain", descricao: "As regras e o raciocínio da casa." },
    ],
  },
];

/** O item do menu que fica aceso nesta rota (o próprio ou a porta que a contém). */
export function itemAtivo(caminho: string): ItemDoMenu | null {
  const dentro = (href: string) => caminho === href || caminho.startsWith(href + "/");
  for (const item of MENU_PRINCIPAL) {
    if (item.href === "/agency/dashboard" ? caminho === item.href : dentro(item.href)) return item;
    if (item.filhos?.some((f) => dentro(f.href))) return item;
  }
  return null;
}

export function portaDoMenu(href: string): ItemDoMenu | null {
  return MENU_PRINCIPAL.find((i) => i.href === href && i.filhos) ?? null;
}
