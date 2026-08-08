// por-cliente.ts — O RETRATO DA PRODUÇÃO, CLIENTE POR CLIENTE. Somente leitura.
//
// ── Por que este arquivo existe ─────────────────────────────────────────────
// Em 08/08/2026 o CEO cobrou *"hoje eu preciso de todos os posts dos clientes —
// sem falta"*, e a agência tinha um número agregado para responder: **12 posts,
// 6 agendados, 6 rascunho**. Aquilo é a resposta certa para outra pergunta. Não
// dá para saber se **um** cliente está com tudo em dia e **quatro** parados; e
// "12 no total" numa casa de 5 clientes tem cara de completo justamente quando
// não é.
//
// Pior: agregado esconde o caso que mais dói — o cliente que contratou 2 peças
// por dia e recebeu zero hoje some dentro da média de quem recebeu quatro.
//
// ── A regra que este arquivo obedece: ZERO E "NÃO SEI" NUNCA DIVIDEM PIXEL ──
// É a lição dos três `.catch(() => null)` de 07/08, repetida na tela do Google e
// no DRE: **falha de leitura não vira zero.** Zero é uma afirmação sobre o
// cliente ("nada foi produzido para ele hoje"); "não consegui olhar" é uma
// afirmação sobre nós. Quem confunde as duas manda o Diretor cobrar o
// departamento errado.
//
// ── O que este arquivo NÃO faz ──────────────────────────────────────────────
// Não escreve, não chama IA, não fala com plataforma nenhuma. Ele NÃO afirma o
// ritmo contratado de ninguém: esse dado não existe em coluna nenhuma do banco,
// e inferi-lo do volume produzido seria transformar o resultado na meta — a peça
// que faltou provaria que ela não era devida. `ritmoContratado` fica
// declaradamente ausente e o Diretor pergunta ao CEO.

import { prisma } from "@/lib/db/client";

/** O fuso da casa. Publicação, calendário e "hoje" são de São Paulo — contar o
 *  dia em UTC atrasaria a virada em 3 horas e diria "nada saiu hoje" às 21h. */
const FUSO = "America/Sao_Paulo";

function inicioDoDiaEmSaoPaulo(agora: Date): Date {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(agora);
  const p = (t: string) => partes.find((x) => x.type === t)?.value ?? "00";
  // O deslocamento de São Paulo é fixo (-03:00) desde o fim do horário de verão
  // em 2019 — declarado aqui porque uma constante sem procedência é a que
  // ninguém revisa quando a regra muda.
  return new Date(`${p("year")}-${p("month")}-${p("day")}T00:00:00.000-03:00`);
}

/**
 * Uma contagem que sabe a diferença entre "é zero" e "não consegui olhar".
 * Mesma forma de `Contagem` em `/agency/google` e de `Dinheiro` no DRE — a casa
 * já tem essa gramática e criar uma quarta seria dividir a regra em quatro.
 */
export type Contagem =
  | { estado: "medido"; valor: number }
  | { estado: "nao_medido"; motivo: string };

export interface RetratoDeCliente {
  clientId: string;
  nome: string;
  /** Quantos projetos ele tem, no total. */
  projetos: Contagem;
  /**
   * Quantos já receberam o aval final do cliente (`clientApprovedAt`).
   *
   * Não existe "projeto ativo" nesta casa e não se inventa um: `Project.stage` é
   * campo escrito à mão, e `lib/agency/esteira/fases.ts` diz por extenso que a
   * fase é DERIVADA do dado real porque *"campo de status escrito à mão mente em
   * duas semanas"*. O que é fato datado é o aval — e é ele que autoriza a casa a
   * publicar em nome do cliente.
   */
  projetosComAvalDoCliente: Contagem;
  /** Peças com data de HOJE (fuso de São Paulo), em qualquer estado. */
  pecasDeHoje: Contagem;
  /** Dessas, as que já saíram de rascunho. */
  agendadasHoje: Contagem;
  publicadasHoje: Contagem;
  /** Marcadas para o passado e ainda não publicadas — a hora que não aconteceu. */
  atrasadas: Contagem;
  /** Cards de decisão abertos no portal dele. */
  aprovacoesPendentes: Contagem;
  /** Pedidos de material travando a produção dele. */
  materiaisPendentes: Contagem;
  /**
   * O ritmo que ele contratou.
   *
   * SEMPRE ausente hoje, e de propósito: não existe coluna que o guarde. Ver o
   * cabeçalho. Preencher por inferência seria o erro que custou 3 peças no
   * CityJobs — ausência de informação não é informação.
   */
  ritmoContratado: null;
}

export interface RetratoPorCliente {
  em: string;
  /** O dia contado, em São Paulo — para ninguém discutir a virada depois. */
  diaDeReferencia: string;
  clientes: RetratoDeCliente[];
  /** Preenchido quando nem a LISTA de clientes pôde ser lida. Sem isto, um banco
   *  fora do ar devolveria `clientes: []` e o Diretor leria "a agência não tem
   *  cliente" — que é a falha inventada do portal, invertida. */
  cego?: string;
}

async function contar(promessa: Promise<number>): Promise<Contagem> {
  try {
    return { estado: "medido", valor: await promessa };
  } catch (e) {
    return { estado: "nao_medido", motivo: e instanceof Error ? e.message : String(e) };
  }
}

/** Quem está em produção HOJE, cliente por cliente. */
export async function varrerPorCliente(agora: Date = new Date()): Promise<RetratoPorCliente> {
  const inicio = inicioDoDiaEmSaoPaulo(agora);
  const fim = new Date(inicio.getTime() + 24 * 60 * 60 * 1000);
  const base: Omit<RetratoPorCliente, "clientes"> = {
    em: agora.toISOString(),
    diaDeReferencia: new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(agora),
  };

  let clientes: Array<{ id: string; name: string }>;
  try {
    clientes = await prisma.client.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  } catch (e) {
    return { ...base, clientes: [], cego: e instanceof Error ? e.message : String(e) };
  }

  const retratos: RetratoDeCliente[] = [];
  for (const c of clientes) {
    const doDia = { clientId: c.id, scheduledFor: { gte: inicio, lt: fim } };
    retratos.push({
      clientId: c.id,
      nome: c.name,
      projetos: await contar(prisma.project.count({ where: { clientId: c.id } })),
      projetosComAvalDoCliente: await contar(
        prisma.project.count({ where: { clientId: c.id, clientApprovedAt: { not: null } } }),
      ),
      pecasDeHoje: await contar(prisma.socialPost.count({ where: doDia })),
      agendadasHoje: await contar(prisma.socialPost.count({ where: { ...doDia, status: "scheduled" } })),
      publicadasHoje: await contar(prisma.socialPost.count({ where: { ...doDia, status: "published" } })),
      atrasadas: await contar(
        prisma.socialPost.count({ where: { clientId: c.id, status: "scheduled", scheduledFor: { lt: agora } } }),
      ),
      aprovacoesPendentes: await contar(
        prisma.approvalRequest.count({ where: { clientId: c.id, status: "pending" } }),
      ),
      materiaisPendentes: await contar(
        prisma.materialRequest.count({ where: { status: "pending", project: { clientId: c.id } } }),
      ),
      ritmoContratado: null,
    });
  }

  return { ...base, clientes: retratos };
}
