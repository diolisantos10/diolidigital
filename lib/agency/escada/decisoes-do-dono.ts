// A SEGUNDA PORTA DA ESCADA: a decisão do dono — declarada, datada e aplicada
// sozinha.
//
// ─── POR QUE ELA EXISTE (08/08/2026) ─────────────────────────────────────────
//
// A escada tinha UM caminho para subir: evidência (`subirDegrau`), e ele está
// certo. O que faltava era o caso em que quem manda na casa MANDA, com todas as
// letras — e a casa não tinha onde escrever isso a não ser num campo de texto
// preenchido à mão por alguém logado em produção.
//
// O CEO, em 08/08/2026: *"Solta, óbvio, tem que soltar tudo, tem que dar
// autonomia pra essa agência funcionar, gente. (...) Você tem vinte e seis
// agentes pra fazer um monte de coisa e dois posts não estão saindo."*
//
// Duas peças do CityJobs ficaram um dia inteiro presas em `interno` porque
// `social-media` estava em `allowlist` sem o CityJobs na lista. Nenhum agente
// conseguiu soltar: soltar exigia uma **sessão de admin em produção**, que não
// existe dentro de uma rodada de agente. A decisão existia; o caminho, não.
//
// ─── O DESENHO, E O QUE ELE RECUSA ───────────────────────────────────────────
//
// A decisão do dono é **código versionado**, não um clique. Ela mora nesta
// lista, é aplicada pelo relógio da agência (`despertador.ts`) a cada rodada, e
// é idempotente. Consequência prática, que é o ponto inteiro: **deploy = a
// escada solta.** Não há humano no meio do caminho, não há segredo para
// carregar, não há sessão para conseguir.
//
// O que ela NÃO faz, e cada recusa tem motivo:
//
//   • **Nunca leva a `wide`.** O alvo é SEMPRE `allowlist` com clientes
//     nomeados. "Chega a todos, inclusive aos que ainda não existem" não é o que
//     ninguém disse — e allowlist deixa cada cliente auditável e revogável um a
//     um. `wide` continua se conquistando só com número.
//   • **Nunca desce ninguém.** Departamento em degrau mais alto fica onde está.
//   • **Nunca publica nada.** Soltar a escada faz a peça chegar ao CARD DE
//     APROVAÇÃO do cliente. O clique de publicar continua sendo dele, e a trava
//     de publicação orgânica não é tocada aqui — foi um lote de escrita em ritmo
//     de máquina que custou a conta de anúncios da agência em 03/08.
//   • **Não aceita decisão sem procedência.** Sem data, sem quem, e sem a FALA
//     literal, a entrada é recusada e registrada como recusada. "O CEO mandou"
//     sem a frase é memória de alguém, e memória não é registro.
//
// Não há `process.env`, não há `{ forcar: true }` e não há parâmetro de degrau.
// Há teste que reprova este arquivo se ganhar qualquer um dos três.

import { prisma } from "@/lib/db/client";
import { degrauDeclarado, alturaDo, departamentosDaCasa, type Degrau } from "./degraus";

// ── O QUE UMA DECISÃO É ──────────────────────────────────────────────────────

/**
 * Quem recebe. Não existe "todos": existe um recorte que se resolve em ids
 * concretos na hora de aplicar, e a lista resolvida fica gravada na prova.
 */
export type EscopoDeClientes =
  /**
   * Os clientes que a casa de fato atende — medido por "tem projeto".
   *
   * ⚠️ **FURO DE DADO DECLARADO:** não existe coluna `status` em `Client`.
   * "Cliente ativo" não é um fato guardado nesta casa; o mais próximo que o
   * banco sabe dizer é "tem ao menos um projeto". O nome do tipo diz exatamente
   * isso, e não "ativo", porque batizar o proxy com o nome do fato é como se
   * inventa dado. Quem quiser precisão: crie a coluna.
   */
  | { tipo: "clientes_com_projeto" }
  /** Clientes nomeados. Nome ambíguo (duas fichas) NÃO é resolvido por palpite. */
  | { tipo: "nomes"; nomes: string[] };

export interface DecisaoDoDono {
  /** Estável e único. É por ele que a decisão é reconhecível no registro. */
  id: string;
  /** Data da decisão (ISO). Data no futuro é recusada. */
  em: string;
  /** Quem decidiu. */
  quem: string;
  /** A FALA LITERAL. É a procedência — sem ela a decisão não existe. */
  fala: string;
  /** Departamentos que sobem. Id desconhecido é recusado, não ignorado. */
  departamentos: string[];
  /** Quem passa a receber. */
  escopo: EscopoDeClientes;
}

/** Mínimo de caracteres da fala. "ok" não é procedência de nada. */
export const MINIMO_DA_FALA = 20;

// ── AS DECISÕES DESTA CASA ───────────────────────────────────────────────────

/**
 * Ordem cronológica. Uma decisão nunca é apagada: ela é história, e a linha do
 * banco carrega o id da que a produziu. Para reverter, o caminho é
 * `descerDegrau` — que é livre, imediato e também fica registrado.
 */
export const DECISOES_DO_DONO: readonly DecisaoDoDono[] = [
  {
    id: "2026-08-08-solta-a-producao-de-peca",
    em: "2026-08-08",
    quem: "Dioli (CEO)",
    fala:
      "Solta, óbvio, tem que soltar tudo, tem que dar autonomia pra essa agência " +
      "funcionar, gente. O fluxo eu já te dei completo de como deve funcionar. Eu te " +
      "dei os agentes, te dei interface, te dei autonomia só pra comandar. Você tem " +
      "vinte e seis agentes pra fazer um monte de coisa e dois posts não estão saindo.",
    // A fala é sobre PEÇA que não sai. Os dois departamentos que fazem uma peça
    // de feed chegar ao cliente são estes: `social-media` escreve, `design`
    // desenha. Um em sombra segura a entrega do outro — foi o que prendeu as
    // duas peças do CityJobs.
    //
    // O que NÃO entrou aqui, e não entrou de propósito: `paid-traffic` (escreve
    // em Meta/Google e depende do parecer do especialista da plataforma),
    // `prospeccao` (sai em nome da agência para terceiros, não é peça de
    // cliente) e `analytics`/`strategy`/`financeiro` (relatório, plano e
    // proposta não são "peça" — vão ao Diretor como pergunta, não como
    // suposição).
    departamentos: ["social-media", "design"],
    escopo: { tipo: "clientes_com_projeto" },
  },
];

// ── VALIDAÇÃO: procedência é obrigatória ─────────────────────────────────────

export interface RecusaDeDecisao { id: string; motivo: string }

/**
 * `null` quando a decisão é válida; o motivo da recusa quando não é.
 *
 * Roda em tempo de execução e não só em tempo de tipo porque o tipo não protege
 * contra a entrada escrita às pressas com `fala: "ok"`.
 */
export function recusarDecisao(d: DecisaoDoDono): string | null {
  if (!d.id?.trim()) return "decisão sem id";
  if (!d.quem?.trim()) return "decisão sem quem decidiu";
  if ((d.fala ?? "").trim().length < MINIMO_DA_FALA) {
    return `decisão sem a fala literal (mínimo ${MINIMO_DA_FALA} caracteres) — "o CEO mandou" sem a frase é memória, não registro`;
  }
  const em = new Date(d.em);
  if (Number.isNaN(em.getTime())) return `data inválida: ${d.em}`;
  // Data no futuro: alguém pré-datou uma decisão que ainda não foi tomada.
  if (em.getTime() > Date.now() + 24 * 60 * 60_000) return `data no futuro: ${d.em}`;
  if (!Array.isArray(d.departamentos) || d.departamentos.length === 0) return "decisão sem departamento";
  const conhecidos = new Set(departamentosDaCasa());
  const desconhecidos = d.departamentos.filter((x) => !conhecidos.has(x));
  if (desconhecidos.length > 0) {
    // Recusa a decisão INTEIRA, e não só o departamento errado: um id com typo
    // aplicado "parcialmente com sucesso" é a pior das saídas — parece que
    // funcionou.
    return `departamento desconhecido: ${desconhecidos.join(", ")}`;
  }
  if (d.escopo.tipo === "nomes" && d.escopo.nomes.filter((n) => n.trim()).length === 0) {
    return "escopo por nomes sem nenhum nome";
  }
  return null;
}

// ── RESOLUÇÃO DE CLIENTE ─────────────────────────────────────────────────────

/** Sem acento, sem caixa, sem espaço sobrando. Comparação de nome, não parsing. */
function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

export interface ClientesResolvidos {
  ids: string[];
  /** Nomes que não resolveram, com o motivo. Nunca vira silêncio. */
  naoResolvidos: string[];
}

export async function resolverClientes(
  workspaceId: string,
  escopo: EscopoDeClientes,
): Promise<ClientesResolvidos> {
  if (escopo.tipo === "clientes_com_projeto") {
    const clientes = await prisma.client.findMany({
      where: { workspaceId, projects: { some: {} } },
      select: { id: true },
    });
    return { ids: clientes.map((c) => c.id), naoResolvidos: [] };
  }

  const todos = await prisma.client.findMany({ where: { workspaceId }, select: { id: true, name: true } });
  const ids: string[] = [];
  const naoResolvidos: string[] = [];
  for (const nome of escopo.nomes) {
    const casam = todos.filter((c) => normalizar(c.name) === normalizar(nome));
    if (casam.length === 1) ids.push(casam[0].id);
    else if (casam.length === 0) naoResolvidos.push(`"${nome}": nenhum cliente com esse nome`);
    // Duas fichas com o mesmo nome (o caso "Camila Pereira") não se resolve por
    // palpite: escolher uma é afirmar que aquela é o negócio, e é exatamente o
    // que a lei da casa proíbe.
    else naoResolvidos.push(`"${nome}": ${casam.length} fichas com esse nome — não escolho por palpite`);
  }
  return { ids, naoResolvidos };
}

// ── A MESMA REGRA, PARA QUEM PERGUNTA ANTES ──────────────────────────────────
//
// ═══════════════════════════════════════════════════════════════════════════
// DUAS PORTAS DISCORDAVAM, E A ESCADA VIRAVA ENFEITE PELA SEGUNDA (25/08/2026)
// ═══════════════════════════════════════════════════════════════════════════
//
// Medido em produção com cliente oculto, com um minuto entre os dois fatos:
//
//   13:47 — um pedido de Story foi RETIDO pela escada: "design está em
//           ALLOWLIST e o cliente não está na lista";
//   13:48 — o despertador aplicou `DECISOES_DO_DONO` e incluiu sozinho o mesmo
//           cliente novo em `design` e `social-media`.
//
// E quando o MESMO pedido foi feito pela porta manual — `POST /api/agency/escada`,
// ação `liberar_cliente` → `registro.liberarCliente` — o sistema recusou com
// 409: "evidência insuficiente para liberar mais um cliente".
//
// Uma porta exigia evidência; a outra liberava sozinha em um minuto.
//
// ── QUAL DAS DUAS ERA A REGRA ───────────────────────────────────────────────
//
// A automática. E não por ser a mais permissiva — por ser a que tem
// PROCEDÊNCIA: uma decisão datada, assinada, com a fala literal do dono,
// versionada em código, validada por `recusarDecisao` e com escopo resolvido em
// ids concretos. É a exceção declarada que este arquivo inteiro existe para
// carregar. A régua de evidência continua sendo a regra para todo o resto.
//
// ── O QUE **NÃO** FOI FEITO ─────────────────────────────────────────────────
//
// Afrouxar `liberarCliente`. Ela continua exigindo evidência — byte por byte a
// mesma régua — para todo cliente que a decisão do dono NÃO cobre. O que mudou
// é que ela **passou a conhecer a decisão**: quando o cliente está dentro do
// escopo de uma decisão válida para aquele departamento, a liberação acontece
// EM NOME DA DECISÃO, com a mesma prova e a mesma assinatura que o despertador
// gravaria — porque é literalmente o que o despertador faria na rodada
// seguinte. Recusar aqui o que a casa concede sozinha em cinco minutos não é
// rigor: é uma das duas verdades estar errada, e ninguém saber qual.
//
// A porta manual continua sem poder INVENTAR liberação: ela não aceita
// departamento e cliente fora do que está declarado, e quem não é coberto ouve
// o mesmo 409 de sempre.

export interface CoberturaDaDecisao {
  decisao: DecisaoDoDono;
  /** Por extenso, para o registro e para a resposta da rota. */
  motivo: string;
}

/**
 * A decisão do dono que cobre ESTE cliente NESTE departamento — ou `null`.
 *
 * `null` é ausência de cobertura, e ausência NUNCA vira liberação: quem chama
 * cai de volta na régua de evidência. Decisão malformada (`recusarDecisao`) não
 * cobre ninguém, pelo mesmo motivo de sempre — sem procedência, não existe.
 *
 * NUNCA lança: um erro de leitura devolve `null`, que é o lado seguro
 * (fail-closed) — a evidência volta a ser exigida.
 */
export async function decisaoQueCobre(p: {
  workspaceId: string;
  departmentId: string;
  clientId: string;
  decisoes?: readonly DecisaoDoDono[];
}): Promise<CoberturaDaDecisao | null> {
  for (const d of p.decisoes ?? DECISOES_DO_DONO) {
    if (recusarDecisao(d)) continue;
    if (!d.departamentos.includes(p.departmentId)) continue;
    let alvo: ClientesResolvidos;
    try {
      alvo = await resolverClientes(p.workspaceId, d.escopo);
    } catch {
      // Não consegui ler os clientes = não sei se cobre = não cobre.
      continue;
    }
    if (!alvo.ids.includes(p.clientId)) continue;
    return {
      decisao: d,
      motivo:
        `liberado por DECISÃO DO DONO (${d.quem}, ${d.em}) — não por evidência. ` +
        `Este cliente está no escopo declarado da decisão "${d.id}", e o relógio da agência o incluiria ` +
        "sozinho na próxima rodada. A peça chega ao card de aprovação do cliente; publicar continua sendo clique dele.",
    };
  }
  return null;
}

/** A prova que fica gravada na linha quando a liberação sai pela decisão. É a
 *  MESMA forma que `aplicarDecisoesDoDono` grava — uma só, para que quem
 *  auditar o banco não precise saber por qual porta a liberação entrou. */
export function provaDaDecisao(p: {
  decisao: DecisaoDoDono;
  de: Degrau;
  para: Degrau;
  clientes: string[];
  porQuem: string;
}): string {
  return JSON.stringify({
    origem: "decisao-do-dono",
    decisao: p.decisao.id,
    decididaEm: p.decisao.em,
    quem: p.decisao.quem,
    fala: p.decisao.fala,
    escopo: p.decisao.escopo,
    aplicadaEm: new Date().toISOString(),
    de: p.de,
    para: p.para,
    clientes: p.clientes,
    // QUEM pediu pela porta manual. O despertador não tem isto, e é a única
    // diferença entre as duas provas — ela é informação a mais, não a menos.
    pedidaPor: p.porQuem,
  });
}

// ── A APLICAÇÃO ──────────────────────────────────────────────────────────────

export interface MudancaDaDecisao {
  decisao: string;
  departmentId: string;
  de: Degrau;
  para: Degrau;
  clientesAdicionados: number;
}

export interface RelatorioDasDecisoes {
  /** Decisões que rodaram sem recusa (mesmo as que não mudaram nada). */
  aplicadas: number;
  /** O que efetivamente mudou nesta passada. Vazio na segunda rodada. */
  mudancas: MudancaDaDecisao[];
  /** Decisão malformada — recusada por inteiro, com motivo. */
  recusadas: RecusaDeDecisao[];
  /** Defeito de verdade: nome de cliente que NÃO resolveu (decisão órfã),
   *  erro de escrita no banco. Sobe como FALHA da rodada. */
  avisos: string[];
  /**
   * ESTADO, e não falha (24/08/2026).
   *
   * A decisão está válida, armada, e simplesmente não há a quem liberar ainda:
   * o escopo é DINÂMICO (`clientes_com_projeto`) e a casa não tem nenhum
   * cliente com projeto. Nada foi retido, ninguém está esperando peça, e no
   * minuto em que o primeiro cliente entrar a decisão se aplica sozinha, na
   * rodada seguinte.
   *
   * POR QUE ISTO SAIU DE `avisos` — o achado de 24/08/2026: entre 08/08 e
   * 24/08 esta linha subiu como FALHA a cada 5 minutos — mais de 4.600 vezes —
   * dizendo "falhou" sobre uma casa que só ainda não tinha cliente. Nada tinha
   * quebrado. Alarme que grita todo dia sobre um estado normal é o alarme que
   * quem lê aprende a pular, e aí ele deixa de proteger o caso real (uma
   * decisão órfã, que continua em `avisos`).
   *
   * O fato NÃO some: ele continua sendo dito — em `/api/pulso` como estado
   * contínuo, e no log quando o estado COMEÇA e quando TERMINA.
   */
  semAQuemLiberar: RecusaDeDecisao[];
}

function lerClientes(json: string | null | undefined): string[] {
  try {
    const v = JSON.parse(json ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    // JSON quebrado não é "todos liberados": é lista vazia. Fail-closed.
    return [];
  }
}

/**
 * Aplica as decisões declaradas neste workspace. Idempotente: a segunda passada
 * não escreve nada e devolve `mudancas: []`.
 *
 * NUNCA lança. Ela roda dentro do relógio da agência, e um erro aqui não pode
 * derrubar a rodada que produz peça. O que falha vira aviso — e aviso que
 * ninguém vê é o defeito que este arquivo existe para não repetir, então ele
 * sobe no `/api/health` pela perna do despertador.
 */
export async function aplicarDecisoesDoDono(
  workspaceId: string,
  decisoes: readonly DecisaoDoDono[] = DECISOES_DO_DONO,
): Promise<RelatorioDasDecisoes> {
  const r: RelatorioDasDecisoes = { aplicadas: 0, mudancas: [], recusadas: [], avisos: [], semAQuemLiberar: [] };

  for (const d of decisoes) {
    const recusa = recusarDecisao(d);
    if (recusa) {
      r.recusadas.push({ id: d.id ?? "(sem id)", motivo: recusa });
      continue;
    }

    let alvo: ClientesResolvidos;
    try {
      alvo = await resolverClientes(workspaceId, d.escopo);
    } catch (e) {
      r.recusadas.push({ id: d.id, motivo: `não consegui ler os clientes: ${e instanceof Error ? e.message : "erro"}` });
      continue;
    }
    for (const n of alvo.naoResolvidos) r.avisos.push(`${d.id}: ${n}`);
    if (alvo.ids.length === 0) {
      // Zero cliente resolvido não é "aplicada com sucesso" em nenhum dos dois
      // casos — mas os dois casos NÃO são a mesma coisa, e tratá-los igual foi
      // o defeito de 08/08 a 24/08/2026.
      //
      //   • escopo por NOMES → a decisão aponta para gente que não existe no
      //     banco. É decisão ÓRFÃ: alguém escreveu um nome e ninguém recebeu.
      //     Isso é DEFEITO, e continua subindo como falha da rodada.
      //   • escopo DINÂMICO → "os clientes que a casa atende" resolveu para
      //     zero porque a casa ainda não atende ninguém. Não há trabalho
      //     retido, não há peça presa, não há quem esperar. É ESTADO.
      const msg =
        d.escopo.tipo === "nomes"
          ? `${d.id}: nenhum dos nomes do escopo existe no banco — decisão órfã, nada foi liberado`
          : `${d.id}: a casa ainda não tem nenhum cliente com projeto — não há a quem liberar. ` +
            `A decisão continua armada e se aplica sozinha na primeira rodada depois que o primeiro cliente entrar.`;
      if (d.escopo.tipo === "nomes") r.avisos.push(msg);
      else r.semAQuemLiberar.push({ id: d.id, motivo: msg });
      continue;
    }
    r.aplicadas++;

    for (const departmentId of d.departamentos) {
      try {
        const linha = await prisma.departmentLadder.findUnique({
          where: { workspaceId_departmentId: { workspaceId, departmentId } },
        });
        const atual = degrauDeclarado(linha?.degrau);

        // Já está acima: a decisão do dono não desce ninguém, e em `wide` a
        // lista de clientes não tem efeito nenhum — mexer nela seria escrita sem
        // leitor.
        if (alturaDo(atual) > alturaDo("allowlist")) continue;

        const lista = new Set(lerClientes(linha?.clientesLiberados));
        const antes = lista.size;
        for (const id of alvo.ids) lista.add(id);
        const adicionados = lista.size - antes;
        const para: Degrau = "allowlist";

        // Idempotência: nada novo, nada escrito.
        if (adicionados === 0 && atual === para && linha) continue;

        const prova = {
          origem: "decisao-do-dono",
          decisao: d.id,
          decididaEm: d.em,
          quem: d.quem,
          // A fala inteira fica gravada na linha. É a procedência, e ela precisa
          // sobreviver ao arquivo — quem auditar o banco daqui a um ano lê a
          // frase que soltou o departamento sem precisar do repositório.
          fala: d.fala,
          escopo: d.escopo,
          aplicadaEm: new Date().toISOString(),
          de: atual,
          para,
          clientes: [...lista],
        };
        const motivo =
          `solto por DECISÃO DO DONO (${d.quem}, ${d.em}) — não por evidência. ` +
          `${lista.size} cliente(s) na lista. A peça chega ao card de aprovação do cliente; ` +
          `publicar continua sendo clique dele.`;

        if (linha) {
          await prisma.departmentLadder.update({
            where: { workspaceId_departmentId: { workspaceId, departmentId } },
            data: {
              degrau: para,
              clientesLiberados: JSON.stringify([...lista]),
              motivo,
              decididoPor: `decisao-do-dono:${d.id}`,
              provaJson: JSON.stringify(prova),
            },
          });
        } else {
          await prisma.departmentLadder.create({
            data: {
              workspaceId, departmentId,
              degrau: para,
              clientesLiberados: JSON.stringify([...lista]),
              motivo,
              decididoPor: `decisao-do-dono:${d.id}`,
              provaJson: JSON.stringify(prova),
            },
          });
        }
        r.mudancas.push({ decisao: d.id, departmentId, de: atual, para, clientesAdicionados: adicionados });
      } catch (e) {
        r.avisos.push(`${d.id}/${departmentId}: ${e instanceof Error ? e.message : "erro"}`);
      }
    }
  }

  return r;
}

/**
 * Roda em TODOS os workspaces. É esta que o relógio chama — a decisão do dono
 * vale para a casa, e uma casa com dois inquilinos não pode ter um deles solto
 * porque alguém lembrou de rodar a rota logado nele.
 */
export async function aplicarDecisoesDoDonoNaCasa(): Promise<RelatorioDasDecisoes> {
  const geral: RelatorioDasDecisoes = { aplicadas: 0, mudancas: [], recusadas: [], avisos: [], semAQuemLiberar: [] };
  let workspaces: Array<{ id: string }>;
  try {
    workspaces = await prisma.agencyWorkspace.findMany({ select: { id: true } });
  } catch (e) {
    geral.avisos.push(`não consegui listar os workspaces: ${e instanceof Error ? e.message : "erro"}`);
    return geral;
  }
  for (const w of workspaces) {
    const r = await aplicarDecisoesDoDono(w.id);
    geral.aplicadas += r.aplicadas;
    geral.mudancas.push(...r.mudancas);
    geral.recusadas.push(...r.recusadas);
    geral.avisos.push(...r.avisos);
    geral.semAQuemLiberar.push(...r.semAQuemLiberar);
  }
  return geral;
}
