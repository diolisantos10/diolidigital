// ─── A FONTE CANÔNICA DE DEPARTAMENTOS DA DIOLI ──────────────────────────────
//
// ⚠️ ANTES DE ACRESCENTAR QUALQUER LISTA DE DEPARTAMENTO EM OUTRO ARQUIVO, LEIA.
//
// O repositório tinha DUAS listas de departamento crescendo em paralelo:
//
//   • `lib/agency/departments.ts`      → 7 entradas, carga operacional pesada
//     (prompt do agente, ferramentas conectadas, tipos de entrega, rota do
//     gerador). É o que a interface do produto consome.
//   • `lib/dioli-brain/departments.ts` → 9 entradas, carga de governança
//     (portões de qualidade, fontes de conhecimento, gatilhos de aprovação
//     humana). É o que o Cérebro consome.
//
// As duas se sobrepunham em 6 ids e divergiam em 5: `brand-hub` e `operations`
// só existiam na primeira; `client-service-sdr`, `analytics`, `quality` e
// `financeiro` só existiam na segunda. Nenhuma das duas era a lista da casa —
// e "quantos departamentos temos?" tinha duas respostas erradas.
//
// ── A REGRA ─────────────────────────────────────────────────────────────────
//
//   Identidade de departamento mora AQUI. Os outros arquivos carregam a carga
//   deles e tipam o `id` por `DepartamentoId`.
//
// Isto não apaga nada: `DEPARTMENT_DEFS` e `BRAIN_DEPARTMENTS` continuam
// existindo com o conteúdo deles. O que muda é que os dois passaram a ser
// VISTAS de uma identidade única, e o TypeScript reprova id que não exista
// aqui. `__tests__/agency/organizacao/taxonomia-unica.test.ts` é a trava:
// ele reprova id órfão nas duas pontas e reprova departamento canônico que
// nenhuma das duas conheça.
//
// ── COMO ENTRA UM DEPARTAMENTO NOVO ─────────────────────────────────────────
//
// Acrescente uma entrada em `DEPARTAMENTOS`. Nada mais. A navegação, a matriz
// de permissão, o mapa da agência na Central de Trabalho e a gaveta do cliente
// leem daqui e crescem sozinhos. NENHUM componente fixa a quantidade.
// ─────────────────────────────────────────────────────────────────────────────

/** Um departamento da casa. A ordem do array é a ordem de leitura na tela. */
export interface Departamento {
  id: DepartamentoId;
  /** Como aparece para quem usa. Linguagem de dono, não de sistema. */
  nome: string;
  /** Uma linha: o que este departamento entrega. Aparece no mapa da agência. */
  resumo: string;
  /** Chave do ícone. O componente resolve; o dado não conhece SVG. */
  icone: IconeDeDepartamento;
  /** Cor de acento — usada em ponto, selo e símbolo, nunca como fundo de texto. */
  cor: string;
  // ⚠️ QUAIS ROTAS SÃO DESTE DEPARTAMENTO **NÃO** MORA AQUI.
  //
  // Mora em `paginas.ts`, no campo `dono` de cada página. Uma lista de rotas
  // aqui + uma lista de páginas lá seriam duas listas da mesma coisa, que é o
  // defeito que este módulo existe para fechar. `donoDaRota()` deriva o mapa
  // a partir do registro de páginas.
  /**
   * O departamento já tem superfície própria no produto?
   *
   * `false` NÃO quer dizer "não existe": quer dizer "existe na organização e
   * ainda não tem tela dedicada". A Central de Trabalho mostra os dois estados
   * com rótulos diferentes — esconder o segundo seria a tela mentindo sobre o
   * tamanho da casa.
   */
  temSuperficie: boolean;
}

export type DepartamentoId =
  | "client-service-sdr"
  | "project-management"
  | "strategy"
  | "brand-hub"
  | "social-media"
  | "design"
  | "paid-traffic"
  | "analytics"
  | "quality"
  | "financeiro"
  | "operations"
  | "product-technology";

export type IconeDeDepartamento =
  | "atendimento"
  | "pm"
  | "strategy"
  | "brand"
  | "social"
  | "design"
  | "ads"
  | "analytics"
  | "quality"
  | "financeiro"
  | "system"
  | "product";

export const DEPARTAMENTOS: Departamento[] = [
  {
    id: "client-service-sdr",
    nome: "Atendimento",
    resumo: "Primeira conversa, qualificação e passagem para a operação",
    icone: "atendimento",
    cor: "#0F766E",
    temSuperficie: true,
  },
  {
    id: "project-management",
    nome: "Gestão de Projetos",
    resumo: "Prioriza, distribui, conecta e cobra a entrega",
    icone: "pm",
    cor: "#12B5AC",
    temSuperficie: true,
  },
  {
    id: "strategy",
    nome: "Estratégia",
    resumo: "Direção, posicionamento e o plano que guia a execução",
    icone: "strategy",
    cor: "#0057FF",
    temSuperficie: true,
  },
  {
    id: "brand-hub",
    nome: "Branding",
    resumo: "Marca viva, consistência e guarda da identidade",
    icone: "brand",
    cor: "#7967EE",
    temSuperficie: true,
  },
  {
    id: "social-media",
    nome: "Social Media",
    resumo: "Conteúdo, calendário e presença nas redes",
    icone: "social",
    cor: "#16B8C8",
    temSuperficie: true,
  },
  {
    id: "design",
    nome: "Design",
    resumo: "Sistema visual e produção das peças",
    icone: "design",
    cor: "#FF7B55",
    temSuperficie: true,
  },
  {
    id: "paid-traffic",
    nome: "Tráfego Pago",
    resumo: "Aquisição, campanhas e eficiência de verba",
    icone: "ads",
    cor: "#0E7490",
    temSuperficie: true,
  },
  {
    id: "analytics",
    nome: "Analytics",
    resumo: "Dados, medição e leitura de resultado",
    icone: "analytics",
    cor: "#2667D9",
    temSuperficie: true,
  },
  {
    id: "quality",
    nome: "Qualidade",
    resumo: "Auditoria do que sai e padrão que não se negocia",
    icone: "quality",
    cor: "#15803D",
    temSuperficie: false,
  },
  {
    id: "financeiro",
    nome: "Financeiro",
    resumo: "Receita, custo e a margem de cada cliente",
    icone: "financeiro",
    cor: "#A45A05",
    temSuperficie: true,
  },
  {
    id: "operations",
    nome: "Operações & Sistema",
    resumo: "Saúde do sistema, integrações e desbloqueio",
    icone: "system",
    cor: "#4B5563",
    temSuperficie: true,
  },
  {
    id: "product-technology",
    nome: "Produto & Tecnologia",
    resumo: "UX/UI, arquitetura e engenharia da plataforma",
    icone: "product",
    cor: "#4F46E5",
    temSuperficie: true,
  },
];

/** Índice por id. Construído uma vez — `find` em laço de render é desperdício. */
const POR_ID = new Map<DepartamentoId, Departamento>(DEPARTAMENTOS.map((d) => [d.id, d]));

export function getDepartamento(id: DepartamentoId): Departamento {
  const d = POR_ID.get(id);
  // Impossível pelo tipo. O `throw` existe para o caso de um `id` vindo de dado
  // externo (banco, querystring) atravessar um `as DepartamentoId` — melhor
  // estourar do que devolver `undefined` e a tela renderizar em branco.
  if (!d) throw new Error(`Departamento desconhecido: ${id}`);
  return d;
}

export function existeDepartamento(id: string): id is DepartamentoId {
  return POR_ID.has(id as DepartamentoId);
}

export const DEPARTAMENTO_IDS: DepartamentoId[] = DEPARTAMENTOS.map((d) => d.id);
