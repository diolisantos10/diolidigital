// POR QUE UM PROVEDOR CAIU — a diferença entre "sem dinheiro" e "corpo errado".
//
// ═══ O ACHADO QUE ORIGINOU ESTE ARQUIVO (24/08/2026) ═════════════════════════
//
// A ronda encontrou `Claude HTTP 400` em produção, no departamento do SDR. Um
// 400 diz "requisição inválida", então a investigação inteira começou olhando
// para o corpo: ferramenta forçada, bloco de cache, ordem dos campos. Nada
// disso era. Perguntando à API o que ela recusou, a resposta foi:
//
//   "Your credit balance is too low to access the Anthropic API."
//
// A Anthropic devolve **400 `invalid_request_error` para falta de saldo** — o
// mesmo status e a mesma família de erro de um corpo malformado. Sem ler a
// mensagem, os dois são indistinguíveis, e um manda o investigador para o lado
// errado com toda a confiança do mundo.
//
// ═══ POR QUE CLASSIFICAR, E NÃO SÓ REGISTRAR O TEXTO ════════════════════════
//
// Porque as três respostas da casa são DIFERENTES:
//
//   • sem_saldo    → ninguém consegue consertar em código. É recado para gente,
//                    e é urgente: o provedor preferido está fora, a casa está
//                    servindo pela reserva, e a conta não vai se pagar sozinha.
//   • sem_chave    → configuração. Alguém conecta a chave e volta.
//   • teto_de_ritmo→ passa sozinho. Não acorda ninguém.
//   • indisponivel → pode ser passageiro; vira alarme se insistir.
//
// Tratar todas como "erro de IA" é o que deixou um provedor cair em produção e
// só aparecer numa linha de diário que alguém precisaria ir ler.

export {
  ROTULO_DA_FALHA, classificarFalhaDeProvedor, motivoLegivel, type MotivoDaFalha,
} from "./motivo-da-falha";
import { classificarFalhaDeProvedor, type MotivoDaFalha } from "./motivo-da-falha";

// ─── O ALARME: PROVEDOR CAÍDO TEM DE APARECER, NÃO FICAR NO DIÁRIO ──────────
//
// ── O buraco que isto fecha (24/08/2026) ───────────────────────────────────
// O Claude caiu em produção às 07:29 e a casa se comportou bem: a camada
// reservou, o cliente foi atendido, e a queda foi REGISTRADA. Mas registrada
// numa linha de diário que só existe se alguém for lê-la. Ninguém foi avisado.
//
// A queda já está gravada em `AIRunLog` (status "error", com a mensagem) desde
// que a conta de custo nasceu — não falta DADO, falta LEITURA. Por isso isto é
// uma consulta, e não mais um caminho de escrita: dado que já existe e ninguém
// olha é o modo mais barato de uma casa ficar cega.

import { prisma } from "@/lib/db/client";

export type ProvedorCaido = {
  provider: string;
  motivo: MotivoDaFalha | null;
  /** O texto do provedor, cortado. É a prova; o rótulo é a interpretação. */
  exemplo: string;
  quantas: number;
  ultimaEm: Date;
  /** A falha MAIS ANTIGA desta janela. Com `ultimaEm`, dá o TEMPO da queda. */
  desdeEm: Date;
  /**
   * Está quebrado HÁ HORAS, ou acabou de gaguejar?
   *
   * ── Por que o alarme precisa dessa diferença (27/08/2026) ────────────────
   * Medido em produção: 27 batidas idênticas de 5 em 5 minutos, das 13:38 às
   * 15:48, todas *"credit balance is too low"*. O alarme dava a cada uma delas
   * exatamente o mesmo peso que daria a um erro isolado. Erro isolado é notícia;
   * a 27ª repetição idêntica em duas horas é ruído — e ruído a cada 5 min é o
   * jeito mais barato de ensinar uma casa a ignorar alarme. Pior: este grita
   * sobre o QUEBRADO, então acostuma justamente com a linha vermelha.
   *
   * A resposta não é calar (a conta continua zerada e continua doendo): é
   * DIZER O QUE É. Uma porta fechada há duas horas pede uma pessoa e um cartão
   * de crédito; um soluço de agora não pede nada.
   */
  persistente: boolean;
};

/** Repetições e duração a partir das quais uma queda deixa de ser soluço. */
export const REPETICOES_PARA_PERSISTENTE = 3;
export const DURACAO_PARA_PERSISTENTE_MS = 15 * 60_000;

/** "há 2h11" — o número que separa a porta fechada do soluço, para gente ler. */
export function haQuantoTempo(c: ProvedorCaido): string {
  const ms = Math.max(0, c.ultimaEm.getTime() - c.desdeEm.getTime());
  const min = Math.round(ms / 60_000);
  if (min < 60) return `há ${min}min`;
  return `há ${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`;
}

/**
 * Quais provedores falharam na janela, e POR QUÊ — lido do que já se grava.
 *
 * Não julga gravidade: devolve o fato classificado e deixa quem chama decidir o
 * que acorda gente. `sem_saldo` e `sem_chave` são os que ninguém conserta
 * sozinho; `teto_de_ritmo` passa e não deve virar alarme.
 */
export async function provedoresCaidos(minutos = 60): Promise<ProvedorCaido[]> {
  const desde = new Date(Date.now() - Math.max(1, minutos) * 60_000);
  try {
    const linhas = await prisma.aIRunLog.findMany({
      where: { status: "error", createdAt: { gte: desde } },
      orderBy: { createdAt: "desc" },
      take: 200,
      // ⚠️ `erro` ENTROU DEPOIS, E A AUSÊNCIA DELE CEGAVA O ALARME INTEIRO.
      //
      // MEDIDO EM PRODUÇÃO (26/08/2026, `GET /api/pulso`): o estado saiu como
      // **"openai:  (21x na última hora)"** — o provedor nomeado e o motivo
      // VAZIO, com a conta da OpenAI e a da Anthropic as duas zeradas.
      //
      // A causa: a mensagem do provedor é gravada na coluna **`erro`**
      // (`registrarChamadaDeIa`), e esta consulta lia `fallbackReason` e
      // `outputSummary`. `fallbackReason` só existe quando houve reserva;
      // `outputSummary` é nulo numa chamada que falhou. Logo `texto` era `""`
      // em TODA linha de erro, `classificarFalhaDeProvedor("")` devolvia `null`
      // e **nada nunca chegava a `precisamDeGente`**.
      //
      // Ou seja: o alarme de SEM SALDO — o único que existe para acordar quem
      // põe crédito na conta — **nunca pôde disparar, para provedor nenhum,
      // desde que foi escrito em 24/08**. O dado estava lá o tempo todo, uma
      // coluna ao lado. É a mesma lição do próprio arquivo, uma camada abaixo:
      // não faltava escrita, faltava LEITURA — e desta vez a leitura apontava
      // para o campo errado.
      select: { provider: true, erro: true, fallbackReason: true, outputSummary: true, createdAt: true },
    });

    const porProvedor = new Map<string, ProvedorCaido>();
    for (const l of linhas) {
      // `erro` primeiro: é onde a mensagem do provedor realmente mora.
      const texto = l.erro ?? l.fallbackReason ?? l.outputSummary ?? "";
      const motivo = classificarFalhaDeProvedor(texto);
      // A chave junta provedor E motivo: o mesmo provedor pode cair por dois
      // motivos na mesma hora, e somá-los apagaria o mais grave dos dois.
      const chave = `${l.provider}|${motivo ?? "?"}`;
      const atual = porProvedor.get(chave);
      if (atual) {
        atual.quantas++;
        // As linhas vêm em ordem DECRESCENTE, então cada nova é mais antiga que
        // a anterior: a última que chega é o começo da queda. `Math.min` em vez
        // de atribuição direta para não depender dessa ordem — quem trocar o
        // `orderBy` amanhã não deve poder quebrar o alarme em silêncio.
        if (l.createdAt < atual.desdeEm) atual.desdeEm = l.createdAt;
      } else {
        porProvedor.set(chave, {
          provider: l.provider, motivo, quantas: 1,
          exemplo: texto.slice(0, 200), ultimaEm: l.createdAt, desdeEm: l.createdAt,
          persistente: false,
        });
      }
    }
    const todos = [...porProvedor.values()];
    // O carimbo só pode ser posto DEPOIS de contar a janela inteira — na
    // primeira linha toda queda parece um soluço.
    for (const c of todos) {
      c.persistente =
        c.quantas >= REPETICOES_PARA_PERSISTENTE &&
        c.ultimaEm.getTime() - c.desdeEm.getTime() >= DURACAO_PARA_PERSISTENTE_MS;
    }
    return todos.sort((a, b) => b.quantas - a.quantas);
  } catch {
    // Banco fora do ar não pode derrubar o relógio. A próxima rodada olha de
    // novo — e a ausência de alarme aqui nunca é dita como "está tudo bem".
    return [];
  }
}

/** Os que precisam de gente. Passageiro não acorda ninguém. */
export function precisamDeGente(caidos: readonly ProvedorCaido[]): ProvedorCaido[] {
  return caidos.filter((c) => c.motivo === "sem_saldo" || c.motivo === "sem_chave");
}
