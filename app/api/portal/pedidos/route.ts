// /api/portal/pedidos — o cliente PEDE uma peça nova.
//
// ── O buraco que esta rota abre pela primeira vez ────────────────────────────
// Toda a esteira era agência → cliente. Nenhum modelo tinha o cliente como
// origem: quem quisesse pedir conteúdo novo escrevia no chat — que ninguém lia.
// O CEO tentou pedir conteúdo pelo portal e não achou onde.
//
// ── O mínimo, e por que é esse mínimo ───────────────────────────────────────
// O especialista precisa de três coisas para produzir sem inventar: O QUE,
// PARA QUANDO e PARA QUAL OBJETIVO. As duas primeiras perguntas o cliente
// responde em uma frase; a data é opcional porque obrigar a chutar produz prazo
// falso dentro do sistema — e prazo falso é pior que prazo ausente.
//
// ── Vazio é vazio ───────────────────────────────────────────────────────────
// Pedido sem descrição NÃO vira tarefa muda: a rota devolve 422 com a pergunta
// que falta, em português de gente, e a tela mostra essa pergunta. É a regra da
// casa aplicada na porta de entrada: ausência de informação não é informação.
//
// O dono vem SEMPRE do token (derivação, nunca comparação — 03/08/2026).

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { resolvePortalClient } from "@/lib/agency/persistence/portal-access-service";
import { tokenDoPortal } from "@/lib/agency/persistence/portal-cookie";
import { lerPergunta } from "@/lib/agency/esteira/porta-da-pergunta";

/** O menor texto que ainda é um pedido. "oi" e "?" não são. */
const MINIMO_DE_DESCRICAO = 8;
const MINIMO_DE_OBJETIVO = 3;

// Todo estado que a esteira grava aparece AQUI, em português de gente. Estado
// sem tradução é estado que o cliente vê como código — e estado que ninguém lê
// é o balde de onde este arquivo acabou de sair.
export const STATUS_PARA_O_CLIENTE: Record<string, string> = {
  novo:            "Recebido — já estou avaliando",
  em_triagem:      "Estou vendo o seu pedido agora",
  triado:          "Aceito — entrou na produção",
  em_producao:     "Produzindo agora",
  entregue:        "Pronto — está nas suas aprovações",
  // A terceira família: OPERAÇÃO sobre o trabalho que já existe (mudar data,
  // remarcar horário). Não vira peça nem orçamento — vira mudança já feita. O
  // estado é novo e tem leitor nos DOIS lados (aqui e na caixa de entrada da
  // agência); estado gravado que ninguém lê é vazamento.
  executado:       "Feito — já ajustei para você",
  precisa_decisao: "Preciso confirmar uma coisa com você",
  recusado:        "Não vamos seguir com este",
};

function texto(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Título curto para a lista da caixa de entrada — derivado, nunca pedido ao
 *  cliente (mais um campo é mais um motivo para ele desistir do formulário). */
export function tituloDoPedido(descricao: string): string {
  const primeira = descricao.split(/[\n.!?]/)[0]?.trim() || descricao.trim();
  return primeira.length > 70 ? primeira.slice(0, 69) + "…" : primeira;
}

/**
 * O título que o CLIENTE lê no cartão — e por que ele não pode ser `title`.
 *
 * ── O QUE O CEO VIU EM PRODUÇÃO (07/08/2026) ────────────────────────────────
 * O cartão de orçamento dele se chamava:
 *
 *   "para de óleo digital eu preciso de dois carrosseis por semana uma seg…"
 *
 * É a transcrição CRUA do áudio que ele ditou: "para de óleo digital" é o
 * reconhecedor errando "para a Dioli Digital", não há pontuação, e o corte em
 * 70 caracteres deixou a frase pela metade. É a primeira coisa que ele lê no
 * cartão, e ela não diz o que aquilo é.
 *
 * ── A REGRA: DERIVAR, NUNCA INVENTAR ────────────────────────────────────────
 * A tentação é "resumir com IA". Não. Um resumo gerado afirma sobre o pedido do
 * cliente algo que o cliente não escreveu — e num piloto sem revisão humana
 * isso é exatamente a alucinação que a casa proíbe. Ausência de informação não
 * é informação.
 *
 * Então o corte é MECÂNICO e conservador:
 *   • se a descrição começa com uma frase de verdade — curta e terminada em
 *     pontuação real — ela vira o título. Isso é derivação, não interpretação;
 *   • se NÃO dá para cortar com segurança (texto corrido de ditado, sem
 *     pontuação, que só truncaria no meio de uma palavra), o título passa a ser
 *     um rótulo HONESTO: o tipo do item + a data. Ele não afirma nada sobre o
 *     conteúdo, e o conteúdo continua logo abaixo, íntegro, em "O QUE VOCÊ
 *     PEDIU" — que é onde o cliente confere se foi entendido.
 */
export function tituloParaOCliente(input: {
  descricao: string;
  criadoEm: Date | string;
  temOrcamento: boolean;
}): string {
  const texto = (input.descricao ?? "").trim();
  // Onde a primeira frase termina de VERDADE (pontuação ou quebra de linha).
  const corte = texto.search(/[\n.!?]/);
  const primeira = corte > 0 ? texto.slice(0, corte).trim() : "";

  // Uma frase só vira título se ela realmente terminou e é curta o bastante
  // para caber num cartão. `corte <= 0` é o texto corrido do ditado.
  if (primeira.length >= 8 && primeira.length <= 60) return primeira;

  // Sem corte seguro: rótulo honesto. Diz o QUE É e QUANDO — dois fatos.
  const d = new Date(input.criadoEm);
  const data = Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const tipo = input.temOrcamento ? "Orçamento" : "Pedido";
  return data ? `${tipo} · ${data}` : tipo;
}

function anexos(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, 20);
}

// ── GET: os pedidos DELE ────────────────────────────────────────────────────
export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = tokenDoPortal(request, new URL(request.url).searchParams.get("token"));
  if (!token) return NextResponse.json({ error: "token é obrigatório" }, { status: 400 });

  const dono = await resolvePortalClient(token);
  if (!dono) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

  try {
    const pedidos = await prisma.contentRequest.findMany({
      where: { clientId: dono.clientId },
      orderBy: { createdAt: "desc" },
      take: 50,
      // Select explícito — o que não entra aqui não tem COMO vazar. `triagedBy`
      // (nome de quem triou dentro da agência) e `scopeDecision` (a conversa
      // comercial) ficam de fora: o cliente lê a DECISÃO pela proposta, não
      // pelo campo cru.
      select: {
        id: true, title: true, description: true, objective: true,
        desiredFor: true, status: true, declineReason: true, createdAt: true,
        // O PRAZO PROMETIDO pela agência (≠ a data que ele pediu). Entra por
        // propósito: a devolutiva que o CEO pediu é "prazo E valor" — mostrar
        // só o valor deixa metade da resposta de fora.
        promisedFor: true,
        // O ORÇAMENTO. Entra na lista de propósito: a devolutiva do pedido tem
        // de vir com preço, ou o cliente sai do portal para perguntar quanto
        // custa — e a venda vai junto com ele.
        quotedPrice: true, quoteNote: true, quoteStatus: true,
        // ── A PORTA DA PERGUNTA ─────────────────────────────────────────────
        // `declineReason` diz POR QUE parou. Isto diz COMO responder. Sem ele o
        // cartão mostra um selo amarelo e prosa, e a resposta do cliente cai no
        // chat livre, onde ninguém pode decidir escopo — foi assim que "pode ser
        // o pacote de 4" virou cinco mensagens sem resposta.
        pendingQuestionJson: true,
      },
    });
    return NextResponse.json({
      ok: true,
      pedidos: pedidos.map((p) => ({
        id: p.id,
        // Derivado da DESCRIÇÃO na leitura, e não o `title` gravado. Os pedidos
        // que já estão no banco nasceram com a transcrição crua do áudio no
        // título (foi o que o CEO abriu em produção) — corrigir só na escrita
        // deixaria os antigos torto para sempre. O texto original continua
        // íntegro logo abaixo, em "O QUE VOCÊ PEDIU".
        titulo: tituloParaOCliente({
          descricao: p.description,
          criadoEm: p.createdAt,
          temOrcamento: !!p.quotedPrice,
        }),
        descricao: p.description,
        objetivo: p.objective,
        para: p.desiredFor ? p.desiredFor.toISOString() : null,
        prometidoPara: p.promisedFor ? p.promisedFor.toISOString() : null,
        status: p.status,
        statusLegivel: STATUS_PARA_O_CLIENTE[p.status] ?? "Recebido",
        motivo: p.declineReason,
        criadoEm: p.createdAt.toISOString(),
        preco: p.quotedPrice,
        precoNota: p.quoteNote,
        // Sem preço não existe orçamento na mesa — e "pendente" sem número
        // seria botão de aprovar o nada.
        orcamento: p.quotedPrice ? (p.quoteStatus ?? "pendente") : null,
        // A pergunta aberta, quando existe. Só o que o cliente precisa para
        // responder — id, rótulo e se aceita número. O EFEITO de cada opção
        // (quantidade, escalar, dono) fica no servidor: o cliente escolhe o
        // rótulo, nunca a consequência.
        pergunta: (() => {
          const q = lerPergunta(p.pendingQuestionJson);
          if (!q) return null;
          return {
            texto: q.pergunta,
            aceitaNumero: q.aceitaNumero === true,
            opcoes: q.opcoes.map((o) => ({ id: o.id, rotulo: o.rotulo })),
          };
        })(),
      })),
    });
  } catch {
    return NextResponse.json({ error: "Não consegui carregar seus pedidos agora" }, { status: 503 });
  }
}

// ── POST: abrir um pedido ───────────────────────────────────────────────────
export async function POST(request: NextRequest): Promise<NextResponse> {
  let corpo: Record<string, unknown>;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const token = tokenDoPortal(request, texto(corpo.token) || null);
  if (!token) return NextResponse.json({ error: "token é obrigatório" }, { status: 400 });

  const dono = await resolvePortalClient(token);
  if (!dono) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

  const descricao = texto(corpo.descricao);
  const objetivo  = texto(corpo.objetivo);

  // Vazio é vazio: o sistema PERGUNTA em vez de gravar um pedido mudo.
  if (descricao.length < MINIMO_DE_DESCRICAO) {
    return NextResponse.json(
      {
        error: "faltou_descricao",
        campo: "descricao",
        pergunta: "Me conta o que você quer — pode ser em uma frase. Ex.: “um reels mostrando o corte degradê”.",
      },
      { status: 422 },
    );
  }
  if (objetivo.length < MINIMO_DE_OBJETIVO) {
    return NextResponse.json(
      {
        error: "faltou_objetivo",
        campo: "objetivo",
        pergunta: "E para quê? Saber o objetivo muda a peça inteira — sem ele a equipe escolheria o ângulo no chute.",
      },
      { status: 422 },
    );
  }

  // Data: só entra se for uma data de verdade e no futuro razoável. Data
  // impossível é dado inventado entrando pelo formulário.
  let desiredFor: Date | null = null;
  const bruta = texto(corpo.para);
  if (bruta) {
    const d = new Date(bruta.length === 10 ? `${bruta}T12:00:00` : bruta);
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json(
        { error: "data_invalida", campo: "para", pergunta: "Não entendi essa data. Pode escolher no calendário?" },
        { status: 422 },
      );
    }
    desiredFor = d;
  }

  try {
    // A solicitação de briefing, quando o cliente veio por lá — é o que liga o
    // pedido ao histórico dele sem exigir que ela exista.
    const solicitacao = await prisma.clientRequestDb.findFirst({
      where: { clientId: dono.clientId },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    const criado = await prisma.contentRequest.create({
      data: {
        clientId: dono.clientId,
        clientRequestId: solicitacao?.id ?? null,
        title: tituloDoPedido(descricao),
        description: descricao.slice(0, 4000),
        objective: objetivo.slice(0, 500),
        desiredFor,
        attachmentsJson: JSON.stringify(anexos(corpo.anexos)),
        status: "novo",
      },
      select: { id: true, title: true, status: true, createdAt: true },
    });

    // ── AQUI A ESTEIRA ANDA ──────────────────────────────────────────────────
    //
    // Até 06/08/2026 o pedido terminava aqui, com `status: "novo"` — e "novo"
    // não aciona ninguém. O formulário gravava, o departamento produzia, e não
    // existia a passagem entre os dois: o pedido caía num balde e esperava
    // alguém olhar. Um roteiro de vídeo esperou dois dias.
    //
    // A triagem é AGUARDADA de propósito. É dela que saem o departamento, o
    // prazo e o preço — e a devolutiva sem número manda o cliente perguntar
    // quanto custa fora do portal, levando a venda junto. Ela nunca lança: o
    // que não dá para resolver vira `precisa_decisao` com o motivo, que o
    // cliente lê na resposta e a agência vê na caixa de entrada.
    const { atenderPedido } = await import("@/lib/agency/esteira/producao-de-pedido");
    const atendimento = await atenderPedido(criado.id).catch((e: unknown) => {
      console.error("[portal/pedidos] a esteira falhou", e);
      return null;
    });

    return NextResponse.json(
      {
        ok: true,
        pedido: {
          id: criado.id,
          titulo: criado.title,
          status: atendimento?.status ?? criado.status,
          statusLegivel: STATUS_PARA_O_CLIENTE[atendimento?.status ?? criado.status] ?? "Recebido",
          criadoEm: criado.createdAt.toISOString(),
          preco: atendimento?.preco ?? null,
          prazo: atendimento?.prazo ?? null,
        },
        // A devolutiva de verdade: o que vai ser feito, para quando e por
        // quanto — decidido antes de esta resposta sair.
        recado: atendimento?.recado ?? "Recebemos. A equipe avalia e te responde por aqui.",
      },
      { status: 201 },
    );
  } catch (e) {
    console.error("[portal/pedidos] POST error", e);
    return NextResponse.json({ error: "Não consegui registrar seu pedido agora. Tente de novo." }, { status: 503 });
  }
}
