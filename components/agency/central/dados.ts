// ─── A LEITURA REAL QUE ALIMENTA A CENTRAL DE TRABALHO ───────────────────────
//
// Funções PURAS: entram os dados do store (que vêm do banco via
// `useHydrateFromDb`) e sai a leitura da tela. Nenhum `Math.random`, nenhuma
// constante de demonstração, nenhum nome de cliente escrito à mão.
//
// ── A regra que governa este arquivo ────────────────────────────────────────
//
//   Não sabemos ≠ zero.
//
// Cliente sem projeto não tem "saúde 0%" — tem saúde NÃO MEDIDA, e a tela
// mostra isso com outra tipografia e outro texto. Escrever 0 onde a resposta é
// "ainda não há o que medir" ensina o dono a não confiar no painel, e a partir
// daí a tela existe e não serve. Por isso `Medida` é uma união de três casos e
// não um `number | null` — `null` vira `?? 0` no primeiro `.tsx` distraído.
//
// O tipo vem da Sala dos Agentes (`lib/agency/sala-dos-agentes/tipos.ts`), que
// resolveu exatamente este problema em 07/08/2026. Reaproveitar em vez de
// inventar um segundo é a regra da casa.

import type {
  ActivityEvent,
  Client,
  Deliverable,
  Project,
  StrategyRoom,
  Task,
} from "@/lib/agency/mock-data";
import type { MaterialRequest } from "@/lib/agency/workspace";
import type { BrandUpdate } from "@/store/agency-store";
import { getProjectProgress } from "@/lib/agency/reporting";
import { generateAllAutoTasks, type AutoTask } from "@/lib/agency/orchestration/auto-tasks";
import { DEPARTMENT_DEFS, TASK_OWNER_DEPT_MAP } from "@/lib/agency/departments";
import {
  DEPARTAMENTOS,
  getDepartamento,
  type Departamento,
  type DepartamentoId,
} from "@/lib/agency/organizacao/departamentos";
import { medido, naoMedido, type Medida } from "@/lib/agency/sala-dos-agentes/tipos";
import {
  capacidadesEm,
  departamentosQueEscreve,
  type PerfilOrganizacional,
} from "@/lib/agency/organizacao/autoridade";

export type { Medida };

// ─── Entrada ─────────────────────────────────────────────────────────────────

export interface DadosDaCentral {
  clients: Client[];
  projects: Project[];
  tasks: Task[];
  deliverables: Deliverable[];
  materialRequests: MaterialRequest[];
  strategyRooms: StrategyRoom[];
  brandUpdates: BrandUpdate[];
  activity: ActivityEvent[];
}

// ─── Saída ───────────────────────────────────────────────────────────────────

export interface AreaDoCliente {
  id: DepartamentoId;
  nome: string;
  cor: string;
  icone: Departamento["icone"];
  /** Frase curta: o que está acontecendo nesta área, para este cliente. */
  situacao: string;
  /** 0–100 quando há entrega registrada; `naoMedido` quando não há. */
  progresso: Medida;
  /** Este perfil opera esta área, ou só consulta? */
  podeEditar: boolean;
}

export interface CartaoDeCliente {
  id: string;
  nome: string;
  segmento: string;
  iniciais: string;
  cor: string;
  tinta: string;
  saude: Medida;
  /** O que define o momento do cliente. Derivado, nunca escrito à mão. */
  manchete: string;
  statusRotulo: string;
  statusTom: "good" | "great" | "warning";
  proximoMarco: string | null;
  areas: AreaDoCliente[];
  areasComTrabalho: number;
}

export interface Prioridade {
  id: string;
  titulo: string;
  motivo: string;
  /**
   * Onde isto acontece, já resolvido: "Cliente · Projeto", ou só o projeto
   * quando o nome dele já carrega o do cliente.
   *
   * Vem pronto do dado, e não montado na tela, porque montar lá produziu
   * "City Jobs · City Jobs · Lançamento" — o nome do projeto já começava com o
   * do cliente. Repetição em linha de prioridade rouba o espaço do que importa.
   */
  contexto: string;
  /** Só o cliente. O herói tem uma linha curta e não comporta o projeto. */
  clienteNome: string;
  urgencia: "alta" | "media" | "normal";
  situacao: "andamento" | "revisao" | "espera";
  rota: string;
}

export interface Metrica {
  chave: string;
  rotulo: string;
  valor: Medida;
  nota: string | null;
  notaPositiva: boolean;
  tom: "cyan" | "blue" | "orange" | "violet";
}

export interface Handoff {
  id: string;
  texto: string;
  de: string;
  para: string;
  quandoIso: string;
}

export interface LeituraDaCentral {
  metricas: Metrica[];
  prioridades: Prioridade[];
  clientes: CartaoDeCliente[];
  handoffs: Handoff[];
  /** Departamentos com quantos clientes cada um toca — o mapa da agência. */
  mapa: Array<{ dep: Departamento; clientesAtendidos: number; podeEditar: boolean }>;
  totalDeClientes: number;
}

// ─── Cor do cartão: derivada do nome, estável ────────────────────────────────
//
// O protótipo trazia cor e iniciais escritas para quatro clientes. Cliente novo
// nasceria sem cor. Aqui a cor sai de um hash do id — mesma marca, mesma cor,
// sempre, sem cadastro e sem inventar identidade visual de ninguém.

const PALETA: Array<[string, string]> = [
  ["#71E4E2", "#070A1F"],
  ["#1A66FF", "#FFFFFF"],
  ["#E6D7C7", "#312B27"],
  ["#111111", "#FFFFFF"],
  ["#7967EE", "#FFFFFF"],
  ["#FF7B55", "#FFFFFF"],
  ["#12B5AC", "#04211F"],
  ["#0E7490", "#FFFFFF"],
];

export function corDoCliente(id: string): [string, string] {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETA[h % PALETA.length];
}

export function iniciaisDe(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[1][0]).toUpperCase();
}

// ─── Departamento de uma entrega ─────────────────────────────────────────────
//
// `ownedDeliverableTypes` já existe em `DEPARTMENT_DEFS` e é a definição de
// quem é dono de qual tipo. Reaproveitar em vez de escrever um segundo mapa —
// dois mapas divergem, e o que diverge silenciosamente é o pior tipo de erro.

const DEPT_POR_TIPO_DE_ENTREGA: Record<string, DepartamentoId> = (() => {
  const m: Record<string, DepartamentoId> = {};
  for (const def of DEPARTMENT_DEFS) {
    for (const tipo of def.ownedDeliverableTypes) {
      // O primeiro dono declarado ganha. "document" aparece em vários — nesses
      // casos a entrega conta para o departamento mais específico que a declara
      // primeiro na lista, que é a ordem de leitura da casa.
      if (!m[tipo]) m[tipo] = def.id;
    }
  }
  return m;
})();

function departamentoDaEntrega(d: Deliverable): DepartamentoId | null {
  return DEPT_POR_TIPO_DE_ENTREGA[d.type] ?? null;
}

// ─── Saúde do cliente ────────────────────────────────────────────────────────
//
// ⚠️ NÃO é uma fórmula nova. É a média do `readinessScore` que o produto já
// calcula por projeto (`lib/agency/reporting.ts`) — a mesma régua que a página
// do projeto mostra. Inventar um índice só para esta tela produziria dois
// números diferentes para a mesma pergunta, e o dono acabaria não acreditando
// em nenhum dos dois.

function saudeDoCliente(clientId: string, dados: DadosDaCentral): Medida {
  const projetos = dados.projects.filter((p) => p.clientId === clientId && p.stage !== "completed");
  if (projetos.length === 0) {
    return naoMedido("Nenhum projeto ativo — não há operação para medir ainda.");
  }
  const notas = projetos.map(
    (p) =>
      getProjectProgress(p, dados.deliverables, dados.tasks, dados.materialRequests, dados.strategyRooms)
        .readinessScore,
  );
  return medido(Math.round(notas.reduce((a, b) => a + b, 0) / notas.length));
}

// ─── Cartão de cliente ───────────────────────────────────────────────────────

export function montarCartaoDeCliente(
  client: Client,
  dados: DadosDaCentral,
  perfil: PerfilOrganizacional,
): CartaoDeCliente {
  const projetos = dados.projects.filter((p) => p.clientId === client.id);
  const idsDeProjeto = new Set(projetos.map((p) => p.id));
  const entregas = dados.deliverables.filter((d) => idsDeProjeto.has(d.projectId));
  const editaveis = new Set(departamentosQueEscreve(perfil));

  const areas: AreaDoCliente[] = DEPARTAMENTOS.map((dep) => {
    const daArea = entregas.filter((d) => departamentoDaEntrega(d) === dep.id);
    const concluidas = daArea.filter((d) => d.status === "approved" || d.status === "delivered").length;
    const emRevisao = daArea.filter((d) => d.status === "in_review").length;

    let situacao: string;
    if (daArea.length === 0) situacao = "Sem trabalho registrado";
    else if (emRevisao > 0) situacao = `${emRevisao} em revisão`;
    else if (concluidas === daArea.length) situacao = `${concluidas} entregue${concluidas > 1 ? "s" : ""}`;
    else situacao = `${daArea.length - concluidas} em produção`;

    return {
      id: dep.id,
      nome: dep.nome,
      cor: dep.cor,
      icone: dep.icone,
      situacao,
      progresso:
        daArea.length === 0
          ? naoMedido("Nenhuma entrega registrada nesta área para este cliente.")
          : medido(Math.round((concluidas / daArea.length) * 100)),
      podeEditar: editaveis.has(dep.id),
    };
  });

  const saude = saudeDoCliente(client.id, dados);
  const emRevisaoTotal = entregas.filter((d) => d.status === "in_review").length;
  const ativos = projetos.filter((p) => p.stage !== "completed");

  // A manchete DESCREVE o que os dados dizem. Nada de frase de marketing.
  let manchete: string;
  if (projetos.length === 0) manchete = "Cliente cadastrado, ainda sem projeto";
  else if (ativos.length === 0) manchete = "Todos os projetos concluídos";
  else if (emRevisaoTotal > 0) manchete = `${emRevisaoTotal} entrega${emRevisaoTotal > 1 ? "s" : ""} aguardando revisão`;
  else if (entregas.length === 0) manchete = "Projeto aberto, produção ainda não começou";
  else manchete = `${ativos.length} projeto${ativos.length > 1 ? "s" : ""} em andamento`;

  let statusRotulo = "Sem operação";
  let statusTom: CartaoDeCliente["statusTom"] = "warning";
  if (saude.estado === "medido") {
    if (saude.valor >= 80) { statusRotulo = "Excelente"; statusTom = "great"; }
    else if (saude.valor >= 55) { statusRotulo = "Em dia"; statusTom = "good"; }
    else { statusRotulo = "Atenção"; statusTom = "warning"; }
  } else if (saude.estado === "zeroMedido") {
    statusRotulo = "Atenção"; statusTom = "warning";
  }

  // O próximo marco é o prazo mais próximo entre os projetos ativos. Sem
  // projeto ativo, ele NÃO EXISTE — e a tela diz isso, em vez de inventar uma
  // data ou repetir a de outro cliente.
  const prazos = ativos.map((p) => p.deadline).filter(Boolean).sort();
  const proximoMarco = prazos.length > 0
    ? `${nomeDoProjetoComPrazo(ativos, prazos[0])} · ${formatarData(prazos[0])}`
    : null;

  const [cor, tinta] = corDoCliente(client.id);

  return {
    id: client.id,
    nome: client.name,
    segmento: client.industry || "Segmento não informado",
    iniciais: iniciaisDe(client.name),
    cor,
    tinta,
    saude,
    manchete,
    statusRotulo,
    statusTom,
    proximoMarco,
    areas,
    areasComTrabalho: areas.filter((a) => a.progresso.estado !== "naoMedido").length,
  };
}

function nomeDoProjetoComPrazo(projetos: Project[], prazo: string): string {
  return projetos.find((p) => p.deadline === prazo)?.name ?? "Próxima entrega";
}

export function formatarData(iso: string): string {
  const partes = iso.slice(0, 10).split("-");
  if (partes.length !== 3) return iso;
  const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${Number(partes[2])} ${meses[Number(partes[1]) - 1] ?? ""}`;
}

// ─── Prioridades do dia ──────────────────────────────────────────────────────
//
// Vêm de `generateAllAutoTasks`, o motor que a casa já usa — não de uma
// segunda régua de urgência inventada para esta tela.

const URGENCIA: Record<string, Prioridade["urgencia"]> = {
  critical: "alta", high: "alta", medium: "media", low: "normal",
};

function prioridadeDeAutoTask(t: AutoTask, clientes: Client[]): Prioridade {
  const cliente = clientes.find((c) => c.id === t.clientId)?.name ?? "Sem cliente";
  const projeto = t.projectName ?? "";
  const contexto = !projeto
    ? cliente
    : projeto.toLowerCase().includes(cliente.toLowerCase())
      ? projeto
      : `${cliente} · ${projeto}`;
  return {
    id: t.id,
    titulo: t.title,
    contexto,
    motivo: t.description,
    clienteNome: cliente,
    // `clienteNome` continua existindo separado de `contexto`: o herói mostra só
    // o cliente (a linha é curta), a lista mostra cliente + projeto.
    urgencia: URGENCIA[t.priority] ?? "normal",
    situacao: t.priority === "critical" || t.priority === "high" ? "andamento" : "espera",
    rota: t.route,
  };
}

export function montarPrioridades(
  dados: DadosDaCentral,
  perfil: PerfilOrganizacional,
  limite = 5,
): Prioridade[] {
  const auto = generateAllAutoTasks({
    projects: dados.projects,
    clients: dados.clients,
    deliverables: dados.deliverables,
    tasks: dados.tasks,
    materialRequests: dados.materialRequests,
    strategyRooms: dados.strategyRooms,
  });

  const meus = new Set(departamentosQueEscreve(perfil));
  // O filtro é por DEPARTAMENTO, nunca por "é IA ou é pessoa". Quem edita a
  // área vê a fila da área; quem só consulta vê a fila da casa, porque a
  // alternativa — tela vazia — não ajuda ninguém a trabalhar.
  const doMeuTime = auto.filter((t) => {
    const dept = TASK_OWNER_DEPT_MAP[t.owner];
    return dept ? meus.has(dept) : false;
  });
  const fila = doMeuTime.length > 0 ? doMeuTime : auto;

  const peso: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return [...fila]
    .sort((a, b) => (peso[a.priority] ?? 9) - (peso[b.priority] ?? 9))
    .slice(0, limite)
    .map((t) => prioridadeDeAutoTask(t, dados.clients));
}

// ─── Métricas ────────────────────────────────────────────────────────────────

const UMA_SEMANA = 7 * 86400000;

export function montarMetricas(
  dados: DadosDaCentral,
  perfil: PerfilOrganizacional,
  prioridades: Prioridade[],
  agora: number,
): Metrica[] {
  const emAberto = dados.tasks.filter((t) => t.status !== "done");
  const daSemana = dados.deliverables.filter((d) => {
    const t = new Date(d.updatedAt ?? d.createdAt).getTime();
    return Number.isFinite(t) && agora - t <= UMA_SEMANA;
  });
  const concluidasNaSemana = daSemana.filter(
    (d) => d.status === "approved" || d.status === "delivered",
  ).length;
  const aguardando =
    dados.deliverables.filter((d) => d.status === "in_review").length +
    dados.brandUpdates.filter((u) => u.status === "pending").length +
    dados.materialRequests.filter((r) => r.status === "pending").length;

  return [
    {
      chave: "tarefas",
      rotulo: "MINHAS TAREFAS",
      valor: emAberto.length === 0 && dados.tasks.length === 0
        ? naoMedido("Nenhuma tarefa registrada ainda.")
        : medido(emAberto.length),
      nota: prioridades.length > 0 ? `${prioridades.length} na sua fila` : "fila vazia",
      notaPositiva: prioridades.length === 0,
      tom: "cyan",
    },
    {
      chave: "entregas",
      rotulo: "ENTREGAS DA SEMANA",
      valor: dados.deliverables.length === 0
        ? naoMedido("Nenhuma entrega registrada ainda.")
        : medido(daSemana.length),
      nota: concluidasNaSemana > 0 ? `${concluidasNaSemana} concluída${concluidasNaSemana > 1 ? "s" : ""}` : null,
      notaPositiva: concluidasNaSemana > 0,
      tom: "blue",
    },
    {
      chave: "revisao",
      rotulo: "AGUARDANDO REVISÃO",
      valor: medido(aguardando),
      nota: aguardando === 0 ? "nada parado" : "precisa de aval",
      notaPositiva: aguardando === 0,
      tom: "orange",
    },
    {
      chave: "clientes",
      rotulo: "CLIENTES VISÍVEIS",
      valor: medido(dados.clients.length),
      // A frase muda com a permissão real — ela não pode prometer "acesso
      // completo" para quem não tem.
      nota: capacidadesEm(perfil, "project-management").has("editar")
        ? "leitura e operação"
        : "leitura de todas as áreas",
      notaPositiva: true,
      tom: "violet",
    },
  ];
}

// ─── Handoffs ────────────────────────────────────────────────────────────────
//
// Lidos do fluxo de atividade real. Sem evento, a faixa mostra estado vazio —
// nunca a conversa fictícia de duas marcas que o protótipo trazia.

const HANDOFF_POR_EVENTO: Record<string, { de: string; para: string; verbo: string }> = {
  deliverable_updated:   { de: "Produção",  para: "Gestão de Projetos", verbo: "atualizou uma entrega de" },
  deliverable_approved:  { de: "Gestão de Projetos", para: "Cliente",   verbo: "aprovou a entrega de" },
  change_requested:      { de: "Cliente",   para: "Produção",           verbo: "pediu alteração em" },
  revision_resolved:     { de: "Produção",  para: "Gestão de Projetos", verbo: "resolveu a revisão de" },
  proposal_sent:         { de: "Atendimento", para: "Cliente",          verbo: "enviou a proposta de" },
  proposal_approved:     { de: "Cliente",   para: "Gestão de Projetos", verbo: "aprovou a proposta de" },
  project_stage_changed: { de: "Gestão de Projetos", para: "Produção",  verbo: "moveu a etapa de" },
  orchestrator_approved: { de: "Estratégia", para: "Produção",          verbo: "liberou a estratégia de" },
};

export function montarHandoffs(dados: DadosDaCentral, limite = 2): Handoff[] {
  return dados.activity
    .filter((e) => HANDOFF_POR_EVENTO[e.type])
    .slice(0, limite)
    .map((e) => {
      const m = HANDOFF_POR_EVENTO[e.type];
      return {
        id: e.id,
        de: m.de,
        para: m.para,
        texto: `${m.verbo} ${e.message || "um item"}`,
        quandoIso: e.timestamp,
      };
    });
}

// ─── A leitura inteira ───────────────────────────────────────────────────────

export function montarLeitura(
  dados: DadosDaCentral,
  perfil: PerfilOrganizacional,
  agora: number,
): LeituraDaCentral {
  const prioridades = montarPrioridades(dados, perfil);
  const clientes = dados.clients.map((c) => montarCartaoDeCliente(c, dados, perfil));
  const editaveis = new Set(departamentosQueEscreve(perfil));

  return {
    metricas: montarMetricas(dados, perfil, prioridades, agora),
    prioridades,
    clientes,
    handoffs: montarHandoffs(dados),
    // O mapa cresce sozinho: ele percorre o registro canônico. Nenhum número de
    // departamento está fixado neste componente — era o item 2 do contrato.
    mapa: DEPARTAMENTOS.map((dep) => ({
      dep,
      clientesAtendidos: clientes.filter(
        (c) => c.areas.find((a) => a.id === dep.id)?.progresso.estado !== "naoMedido",
      ).length,
      podeEditar: editaveis.has(dep.id),
    })),
    totalDeClientes: dados.clients.length,
  };
}

export { getDepartamento };
