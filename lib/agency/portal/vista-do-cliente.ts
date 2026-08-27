// ── A FRONTEIRA DO PORTAL — a vista do cliente, campo a campo ───────────────
//
// Este módulo existe para uma regra do handoff (14/08/2026), e ela não é de
// tela:
//
//   > O cliente NÃO vê custo interno, margem, prompt, log, tarefa interna nem a
//   > coordenação entre departamentos. Isso não é só esconder na tela: **o dado
//   > não pode sair do servidor**.
//
// Esconder no componente é `display:none` com outro nome — o dado continua no
// JSON, no DOM, no cache do navegador e no primeiro "ver código-fonte" que o
// cliente (ou qualquer um com o link dele) abrir.
//
// Então a vista é montada aqui, por ALLOWLIST: a função recebe registros crus
// do banco — que podem carregar qualquer coluna, hoje e depois da próxima
// migration — e devolve APENAS os campos nomeados abaixo. Coluna nova nasce do
// lado de fora por construção; ninguém precisa lembrar de excluí-la.
//
// O teste que trava isto é `__tests__/portal/vista-sem-vazamento.test.ts`: ele
// envenena os registros crus com custo, margem, prompt, log e tarefa interna, e
// falha apontando **o caminho do campo** se qualquer um sair vivo do outro lado.
//
// ── O QUE ESTE MÓDULO NÃO FAZ, E POR QUÊ ───────────────────────────────────
//
// Ele não devolve projetos, aprovações, pedidos, conexões nem números de rede.
// Essas cinco JÁ têm rota própria no portal (`/api/portal/projetos`,
// `/api/brain/portal-data`, `/api/portal/pedidos`, `/api/portal/conexoes`,
// `/api/portal/metricas`), todas com a mesma fronteira aplicada na origem.
// Reimplementá-las aqui criaria uma SEGUNDA verdade sobre os mesmos fatos — e
// duas contagens que discordam é o defeito que este portal já pagou caro.
// O que entra aqui é o que ainda não tinha casa: marca, conta, entregas,
// campanhas e a leitura por departamento.
//
// Guardrail 4 do CLAUDE.md aplicado: prompt é aviso, código é trava.

/** Um registro cru do banco. Pode ter QUALQUER coluna — é esse o ponto. */
export type RegistroBruto = Record<string, unknown>;

// ── Leitores defensivos ─────────────────────────────────────────────────────
// Nada de `as string`. Campo ausente ou de tipo errado vira o vazio honesto —
// nunca "undefined" impresso na tela de quem paga.

function texto(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function textoOuNulo(v: unknown): string | null {
  const t = texto(v);
  return t || null;
}
function numeroOuNulo(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function dataIso(v: unknown): string | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  const t = texto(v);
  if (!t) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// ── Os departamentos (regra 5 do handoff) ───────────────────────────────────

export type ChaveDeDepartamento = "social" | "trafego" | "branding" | "design" | "pm";

export const DEPARTAMENTOS: { chave: ChaveDeDepartamento; nome: string; oQueFaz: string }[] = [
  { chave: "social",   nome: "Social Media",    oQueFaz: "Conteúdo, publicação e crescimento das suas redes." },
  { chave: "trafego",  nome: "Tráfego Pago",    oQueFaz: "Anúncios, público e geração de novos contatos." },
  { chave: "branding", nome: "Branding",        oQueFaz: "A identidade da marca: essência, voz e regras de uso." },
  { chave: "design",   nome: "Design",          oQueFaz: "As peças: campanhas, materiais e aplicações da marca." },
  { chave: "pm",       nome: "Project Manager", oQueFaz: "Seu ponto único de contato — organiza e acompanha tudo." },
];

export interface DepartamentoView {
  chave: ChaveDeDepartamento;
  nome: string;
  oQueFaz: string;
  /** Uma frase do estado ATUAL, medida. Sem dado, diz que não há — nunca um número. */
  situacao: string;
  /** `true` só quando existe trabalho real medido. A tela usa para o estado vazio. */
  ativo: boolean;
}

// ── O que sai daqui ─────────────────────────────────────────────────────────

export interface MarcaView {
  /** O nome do cadastro, cru. Nenhuma preposição, nenhum "Portal da". */
  nome: string;
  /** A inicial da marca — o símbolo do cabeçalho, derivado do cadastro. */
  simbolo: string;
  segmento: string | null;
  site: string | null;
  clienteDesde: string | null;
}

export interface EntregaView {
  id: string;
  nome: string;
  tipo: string;
  versao: number;
  situacao: string;
  atualizadaEm: string | null;
  /** O projeto a que ela pertence, para a tela agrupar por assunto. */
  projeto: string | null;
}

export interface CampanhaView {
  id: string;
  nome: string;
  objetivo: string;
  publico: string | null;
  /** O TETO que o cliente aprovou por escrito. É dinheiro dele, não custo nosso. */
  tetoAprovadoBRL: number | null;
  verbaDiariaBRL: number | null;
  situacao: string;
}

export interface BrandHubView {
  respondidas: number;
  total: number;
  percentual: number;
  /** As próximas perguntas que ele pode responder. Vazio = não falta nada. */
  perguntas: { campo: string; pergunta: string; rotulo: string }[];
  /** O mapa do que já está definido — o "o que já sabemos da sua marca". */
  definicoes: { rotulo: string; definido: boolean }[];
}

export interface ContaView {
  email: string | null;
  telefone: string | null;
  site: string | null;
  segmento: string | null;
  clienteDesde: string | null;
  servicos: string[];
}

export interface VistaDoCliente {
  marca: MarcaView;
  departamentos: DepartamentoView[];
  entregas: EntregaView[];
  campanhas: CampanhaView[];
  brandHub: BrandHubView;
  conta: ContaView;
  /**
   * O aviso de que a publicação automática no Instagram ainda não existe, e de
   * que a equipe agenda à mão por enquanto. `null` quando ela JÁ existe.
   *
   * Ordem do CEO em 27/08/2026, e ele fica no topo da vista de propósito:
   * *coluna gravada não é cliente informado* — o aviso tem de estar onde o
   * cliente olha, junto do calendário, não escondido num campo.
   */
  avisoDeAgendamento: string | null;
}

export interface BrutosDoPortal {
  cliente: RegistroBruto | null;
  /** Só para a leitura por departamento — projeto tem rota própria. */
  projetos: RegistroBruto[];
  entregas: RegistroBruto[];
  /** Só para a leitura por departamento — o calendário tem rota própria. */
  posts: RegistroBruto[];
  campanhas: RegistroBruto[];
  servicos: string[];
  marca: { respondidas?: unknown; total?: unknown; perguntas?: unknown; campos?: unknown } | null;
  /** Vem PRONTO de `avisoDeAgendamentoManual()`. Esta função é pura e não
   *  pergunta o estado do canal — uma segunda leitura dele divergiria da
   *  primeira no dia da virada. */
  avisoDeAgendamento?: string | null;
}

// ── Traduções: banco → português de gente ───────────────────────────────────
// Nenhuma repassa a string crua. Status desconhecido cai num rótulo honesto e
// genérico — nunca "waiting_social" na tela do cliente.

function situacaoDaEntrega(status: string, revisao: string | null): string {
  if (revisao === "revision_requested") return "Em ajuste, a seu pedido";
  switch (status) {
    case "approved":  return "Aprovado por você";
    case "delivered": return "Entregue";
    case "in_review": return "Esperando você";
    default:          return "Em produção";
  }
}

function situacaoDaCampanha(status: string): string {
  switch (status) {
    case "active": return "No ar";
    case "paused": return "Pausada";
    case "ended":  return "Encerrada";
    default:       return "Em preparação";
  }
}

/** O símbolo do cliente: a inicial da marca, do cadastro. Nome vazio nunca vira
 *  quadrado em branco — quadrado em branco é a tela parecendo quebrada. */
export function simboloDaMarca(nomeDoCliente: string): string {
  const limpo = (nomeDoCliente ?? "").trim();
  for (const ch of limpo) {
    if (/[\p{L}\p{N}]/u.test(ch)) return ch.toLocaleUpperCase("pt-BR");
  }
  return "•";
}

// ── O montador ──────────────────────────────────────────────────────────────

export function montarVistaDoCliente(brutos: BrutosDoPortal): VistaDoCliente {
  const cliente = brutos.cliente ?? {};
  const nome = texto(cliente.name);

  // ── ENTREGAS ────────────────────────────────────────────────────────────
  // `visibility` decide, e o padrão é FECHADO: entrega sem o carimbo
  // "compartilhado" não sai daqui. Mesma regra do calendário e da rota de
  // projetos — a auditoria do Hub provou que o padrão fail-open ("o que a rota
  // esquecer de filtrar, vaza") é o maior risco deste portal.
  //
  // NÃO saem, mesmo em entrega compartilhada: `content` (o corpo produzido, que
  // carrega rascunho e nota de produção), `ownerAgentId` (quem/qual agente fez),
  // `revisionHistory` (a memória interna da refação) e `cycleId`.
  const entregas: EntregaView[] = brutos.entregas
    .filter((d) => texto(d.visibility) === "compartilhado")
    .map((d) => ({
      id: texto(d.id),
      nome: texto(d.name) || "Entrega",
      tipo: texto(d.type) || "Material",
      versao: numeroOuNulo(d.version) ?? 1,
      situacao: situacaoDaEntrega(texto(d.status), textoOuNulo(d.revisionStatus)),
      atualizadaEm: dataIso(d.updatedAt),
      projeto: textoOuNulo(d.projetoNome),
    }));

  // ── CAMPANHAS ───────────────────────────────────────────────────────────
  // Sai o teto que ELE aprovou por escrito e a verba diária — dinheiro dele.
  // NÃO sai: `connectionId`, `adAccountId`, `externalId`, `adSetId`, `adId`
  // (as chaves da conta de anúncio), `pausedReason`, `pausedByGuardAt` e
  // `lastError` — o freio interno e a falha da nossa máquina.
  const campanhas: CampanhaView[] = brutos.campanhas.map((c) => ({
    id: texto(c.id),
    nome: texto(c.name) || "Campanha",
    objetivo: texto(c.objective) || "Novos contatos",
    publico: textoOuNulo(c.audience),
    tetoAprovadoBRL: numeroOuNulo(c.approvedCapBRL),
    verbaDiariaBRL: numeroOuNulo(c.dailyBudgetBRL),
    situacao: situacaoDaCampanha(texto(c.status)),
  }));

  const brandHub = montarBrandHub(brutos.marca);

  return {
    marca: {
      nome,
      simbolo: simboloDaMarca(nome),
      segmento: textoOuNulo(cliente.industry),
      site: textoOuNulo(cliente.website),
      clienteDesde: dataIso(cliente.createdAt),
    },
    departamentos: montarDepartamentos({
      posts: brutos.posts,
      campanhas,
      brandHub,
      entregas,
      projetos: brutos.projetos.length,
    }),
    entregas,
    campanhas,
    brandHub,
    conta: {
      email: textoOuNulo(cliente.email),
      telefone: textoOuNulo(cliente.phone),
      site: textoOuNulo(cliente.website),
      segmento: textoOuNulo(cliente.industry),
      clienteDesde: dataIso(cliente.createdAt),
      servicos: brutos.servicos.filter((s) => typeof s === "string" && s.trim()).map((s) => s.trim()),
    },
    // `?? null` e não `?? AVISO`: quem sabe o estado do canal é quem chama. Um
    // default com texto aqui faria a vista MENTIR quando o canal já estivesse
    // liberado e o chamador simplesmente não tivesse passado o campo.
    avisoDeAgendamento: brutos.avisoDeAgendamento ?? null,
  };
}

function montarBrandHub(marca: BrutosDoPortal["marca"]): BrandHubView {
  const respondidas = numeroOuNulo(marca?.respondidas) ?? 0;
  const total = numeroOuNulo(marca?.total) ?? 0;
  const perguntasBrutas = Array.isArray(marca?.perguntas) ? marca.perguntas : [];
  const camposBrutos = Array.isArray(marca?.campos) ? marca.campos : [];
  return {
    respondidas,
    total,
    // Total zero não vira 100% nem NaN — vira zero, que é a verdade.
    percentual: total > 0 ? Math.round((respondidas / total) * 100) : 0,
    perguntas: perguntasBrutas
      .map((p) => {
        const r = (p ?? {}) as RegistroBruto;
        return { campo: texto(r.campo), pergunta: texto(r.pergunta), rotulo: texto(r.rotulo) };
      })
      .filter((p) => p.campo && p.pergunta),
    definicoes: camposBrutos
      .map((c) => {
        const r = (c ?? {}) as RegistroBruto;
        // Só o RÓTULO e o estado. O VALOR da resposta não precisa trafegar para
        // desenhar uma barra de progresso — e o que não trafega não vaza.
        return { rotulo: texto(r.rotulo) || texto(r.campo), definido: texto(r.estado) === "definido" };
      })
      .filter((c) => c.rotulo),
  };
}

/**
 * A operação apresentada POR DEPARTAMENTO (regra 5 do handoff).
 *
 * O que cada departamento diz vem do trabalho MEDIDO — nunca de um texto fixo
 * igual para todo cliente. Sem trabalho medido, `ativo:false` e a frase diz
 * exatamente isso: o portal é molde único, e cliente sem Social Media
 * contratado tem de abrir uma tela que faz sentido, não uma tela quebrada.
 *
 * ⚠️ O que NÃO entra aqui: quem fez, com qual agente, quanto custou, quanto
 * demorou por dentro, nem qual departamento espera qual. A COORDENAÇÃO entre
 * departamentos é trabalho nosso — o cliente vê o ESTADO, nunca a fila.
 */
function montarDepartamentos(dados: {
  posts: RegistroBruto[];
  campanhas: CampanhaView[];
  brandHub: BrandHubView;
  entregas: EntregaView[];
  projetos: number;
}): DepartamentoView[] {
  const compartilhados = dados.posts.filter((p) => texto(p.visibility) === "compartilhado");
  const noAr = compartilhados.filter((p) => texto(p.status) === "published").length;
  const programados = compartilhados.filter((p) => texto(p.status) === "scheduled").length;
  const campanhasNoAr = dados.campanhas.filter((c) => c.situacao === "No ar").length;

  const plural = (n: number, um: string, muitos: string) => (n === 1 ? um : muitos);

  const frase: Record<ChaveDeDepartamento, { ativo: boolean; situacao: string }> = {
    social: compartilhados.length > 0
      ? {
          ativo: true,
          situacao: `${noAr} ${plural(noAr, "publicação no ar", "publicações no ar")} e ${programados} ${plural(programados, "programada", "programadas")}.`,
        }
      : { ativo: false, situacao: "Nenhuma publicação no seu calendário ainda." },
    trafego: dados.campanhas.length > 0
      ? {
          ativo: campanhasNoAr > 0,
          situacao: `${campanhasNoAr} de ${dados.campanhas.length} ${plural(dados.campanhas.length, "campanha", "campanhas")} no ar.`,
        }
      : { ativo: false, situacao: "Nenhuma campanha de anúncio montada ainda." },
    branding: dados.brandHub.total > 0
      ? {
          ativo: dados.brandHub.respondidas > 0,
          situacao: `${dados.brandHub.percentual}% da sua marca documentada.`,
        }
      : { ativo: false, situacao: "A entrevista de marca ainda não começou." },
    design: dados.entregas.length > 0
      ? {
          ativo: true,
          situacao: `${dados.entregas.length} ${plural(dados.entregas.length, "entrega disponível", "entregas disponíveis")} para você.`,
        }
      : { ativo: false, situacao: "Nenhuma peça entregue ainda." },
    // O PM está sempre disponível — é a ponte, não um serviço contratado à parte.
    pm: dados.projetos > 0
      ? { ativo: true, situacao: `Acompanhando ${dados.projetos} ${plural(dados.projetos, "projeto seu", "projetos seus")}.` }
      : { ativo: true, situacao: "Disponível para receber o que você precisar." },
  };

  return DEPARTAMENTOS.map((d) => ({ chave: d.chave, nome: d.nome, oQueFaz: d.oQueFaz, ...frase[d.chave] }));
}
