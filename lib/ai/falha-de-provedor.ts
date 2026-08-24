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

export type MotivoDaFalha = "sem_saldo" | "sem_chave" | "teto_de_ritmo" | "indisponivel";

/** O rótulo humano de cada motivo — para painel e alarme. */
export const ROTULO_DA_FALHA: Record<MotivoDaFalha, string> = {
  sem_saldo: "SEM SALDO na conta do provedor — só uma pessoa resolve, e a casa está servindo pela reserva",
  sem_chave: "sem chave conectada",
  teto_de_ritmo: "teto de ritmo do provedor (passa sozinho)",
  indisponivel: "provedor indisponível",
};

/**
 * Lê o motivo da MENSAGEM do provedor. Nunca do status sozinho — foi
 * exatamente o status sozinho que mandou a investigação para o lado errado.
 *
 * Devolve `null` quando não reconhece: dizer "não sei" é honesto, e é melhor
 * que encaixar à força numa categoria e fazer o painel mentir.
 */
export function classificarFalhaDeProvedor(mensagem: string | null | undefined): MotivoDaFalha | null {
  const m = (mensagem ?? "").toLowerCase();
  if (!m) return null;

  // Saldo primeiro: é o mais caro de confundir, e o texto é bem específico nos
  // provedores que a casa usa.
  if (/credit balance is too low|insufficient[_ ]?(quota|credit|balance|funds)|billing|quota exceeded|payment required|exceeded your current quota/.test(m)) {
    return "sem_saldo";
  }
  if (/\b(401|403)\b|invalid[_ ]?api[_ ]?key|unauthorized|authentication|api key not valid|não tem chave|sem chave|not_configured/.test(m)) {
    return "sem_chave";
  }
  if (/\b429\b|rate[_ ]?limit|too many requests|overloaded/.test(m)) {
    return "teto_de_ritmo";
  }
  if (/\b(500|502|503|504)\b|timeout|abort|network|fetch failed|erro de rede|indispon/.test(m)) {
    return "indisponivel";
  }
  return null;
}

/** O motivo já legível, para quem só vai mostrar. `null` vira o texto cru. */
export function motivoLegivel(mensagem: string | null | undefined): string {
  const c = classificarFalhaDeProvedor(mensagem);
  return c ? ROTULO_DA_FALHA[c] : (mensagem ?? "motivo não informado");
}

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
};

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
      select: { provider: true, fallbackReason: true, outputSummary: true, createdAt: true },
    });

    const porProvedor = new Map<string, ProvedorCaido>();
    for (const l of linhas) {
      const texto = l.fallbackReason ?? l.outputSummary ?? "";
      const motivo = classificarFalhaDeProvedor(texto);
      // A chave junta provedor E motivo: o mesmo provedor pode cair por dois
      // motivos na mesma hora, e somá-los apagaria o mais grave dos dois.
      const chave = `${l.provider}|${motivo ?? "?"}`;
      const atual = porProvedor.get(chave);
      if (atual) {
        atual.quantas++;
      } else {
        porProvedor.set(chave, {
          provider: l.provider, motivo, quantas: 1,
          exemplo: texto.slice(0, 200), ultimaEm: l.createdAt,
        });
      }
    }
    return [...porProvedor.values()].sort((a, b) => b.quantas - a.quantas);
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
