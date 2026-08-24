// teto-de-custo.ts — o teto de GASTO da porta da rua.
//
// ─── O ACHADO (medido em produção, 24/08/2026) ──────────────────────────────
//
// Toda chamada de `/api/sdr/chat` — a rota PÚBLICA, sem login e sem token —
// logava:
//
//     [custo-de-ia] chamada SEM workspace, fora da conta — <provider>/<model>
//
// Duas coisas de uma vez, e a segunda é a grave:
//
//  1. o gasto da porta pública não entrava na conta de ninguém (o relatório de
//     custo da casa contava uma história mais barata que a fatura);
//  2. **não havia teto de gasto nenhum.** Os dois freios da rota
//     (`limite-no-banco.ts`, por IP e por sessão) são freios de RITMO — quantas
//     chamadas por janela de tempo. Ritmo não é dinheiro: 30 chamadas por
//     minuto de um prompt de ~10.700 tokens custam o que custam, e o teto de
//     ritmo continua verde a fatura inteira. Qualquer pessoa na internet queima
//     a chave paga da casa, devagar e dentro das regras.
//
// A causa mecânica do item 1 é `lib/ai/generate.ts`: sem `workspaceId` ele não
// tem a quem atribuir e avisa em vez de gravar (fail-open declarado, e certo —
// contabilidade não segura entrega). Só que a rota TINHA o workspace à mão o
// tempo todo: `chaveDeRotaPublica` já o resolvia por dentro para achar a chave,
// e o descartava. Era a "seta faltando" de sempre — o dado existe, o consumidor
// existe, e ninguém ligou os dois.
//
// ─── FALHA FECHADA, E ZERO SIGNIFICA ZERO ───────────────────────────────────
//
// Aqui não vale o fail-open da contabilidade. Contabilidade que falha custa um
// relatório; teto que falha aberto custa a fatura. Então:
//
//   • sem workspace resolvido → NÃO GASTA. Sem dono não há conta, sem conta não
//     há teto, e um gasto sem teto é o defeito que este arquivo existe para
//     matar. (Dinheiro não tem adoção posterior — mesma regra de
//     `lib/ai/chave-publica.ts`.)
//   • sem teto configurado → NÃO GASTA.
//   • o contador fora do ar → NÃO GASTA. Igual a `limite-no-banco.ts`: contador
//     indisponível recusa, não libera. Um teto que se desliga sozinho quando o
//     banco tosse é um teto que o atacante desliga derrubando o banco.
//
// ⚠️ **ZERO É ZERO.** Esta casa já pagou por isso em outro produto: um "teto 0"
// foi lido como "sem limite", porque `if (!teto)` trata `0` e `undefined` como
// a mesma coisa. São fatos opostos — `0` é uma ordem ("não gaste nada"),
// `undefined` é uma ausência. Aqui os dois nunca compartilham um `if`: a
// leitura devolve `number | null`, o `null` é a ausência, e `0` percorre o
// mesmo caminho de qualquer outro número. Um teto de zero barra tudo, que é
// exatamente o que quem escreveu zero pediu.
//
// ─── O NÚMERO, E POR QUE ELE MORA NO CÓDIGO ─────────────────────────────────
//
// O padrão da casa é US$ 5,00 por workspace a cada 24 horas na porta pública.
// A conta: um briefing real tem 8 a 12 turnos; com o prompt cacheado, um
// briefing inteiro fica na casa dos centavos. US$ 5/dia comporta dezenas de
// briefings de verdade e ainda assim põe um chão embaixo do laço de
// requisições — que é o que faltava. O número é conservador de propósito: teto
// que estoura numa segunda-feira movimentada se descobre e se sobe; fatura que
// ninguém viu, não.
//
// Ele mora no CÓDIGO e não só numa variável de ambiente porque "sem teto
// configurado não gasta" só é uma regra viável se houver sempre um teto
// configurado — do contrário o primeiro deploy sem a variável derruba a porta
// da frente e alguém conserta desligando a regra. `TETO_DIARIO_SDR_USD`
// sobrepõe o padrão quando existe; quando existe e é ilegível, NÃO se cai no
// padrão em silêncio: não gasta. Configuração escrita errada é ordem que
// ninguém entendeu, não licença.

import { prisma } from "@/lib/db/client";

/** O padrão da casa: US$ por workspace, por janela de 24 h, na porta pública. */
export const TETO_DIARIO_PADRAO_USD = 5;

/** A janela do teto. Rolante, não "meia-noite": um atacante que espera o
 *  virar do dia ganharia a cota inteira de novo às 00h01. */
export const JANELA_DO_TETO_MS = 24 * 60 * 60 * 1000;

/**
 * O que se cobra de uma chamada que a tabela de preço não soube precificar.
 *
 * `custoEstimadoUsd` é NULO quando o modelo está fora da tabela ou o provedor
 * não devolveu `usage` — e ler nulo como zero faria um modelo novo aparecer
 * como chamada de graça: o teto ficaria eternamente verde justamente enquanto
 * a casa gasta com o que ainda não sabe medir. Nulo aqui custa um valor de
 * substituição, deliberadamente pessimista para o tamanho de prompt desta
 * rota. Não é a fatura; é a recusa de contar dinheiro desconhecido como zero.
 */
export const CUSTO_DE_CHAMADA_SEM_PRECO_USD = 0.05;

export type VeredictoDeTeto =
  | { pode: true; gastoUsd: number; tetoUsd: number }
  | { pode: false; motivo: "sem_workspace" | "sem_teto" | "contador_fora_do_ar" | "teto_estourado"; gastoUsd: number | null; tetoUsd: number | null };

/**
 * O teto configurado, em USD — ou `null` quando a configuração é ilegível.
 *
 * `null` é "não sei", e "não sei" não gasta. `0` é um teto válido e significa
 * zero. Os dois NUNCA caem no mesmo `if` — ver o cabeçalho.
 */
export function tetoConfiguradoUsd(env: NodeJS.ProcessEnv = process.env): number | null {
  const cru = env.TETO_DIARIO_SDR_USD;
  if (cru === undefined || cru === null || cru.trim() === "") return TETO_DIARIO_PADRAO_USD;
  const n = Number(cru.trim());
  // `Number("")` é 0 e `Number("abc")` é NaN: o vazio já saiu acima, e o
  // ilegível vira `null` (não gasta), nunca o padrão.
  if (!Number.isFinite(n) || n < 0) {
    console.error(`[teto-de-custo] TETO_DIARIO_SDR_USD ilegível ("${cru}") — a porta pública NÃO gasta até isto ser corrigido`);
    return null;
  }
  return n;
}

/**
 * Quanto este workspace já gastou de IA na janela — nunca lendo nulo como zero.
 *
 * `null` = o contador não respondeu. Quem chama não gasta: contador fora do ar
 * recusa, não libera.
 */
export async function gastoNaJanelaUsd(workspaceId: string, agora = Date.now()): Promise<number | null> {
  const desde = new Date(agora - JANELA_DO_TETO_MS);
  try {
    const linhas = await prisma.aIRunLog.findMany({
      where: { workspaceId, createdAt: { gte: desde } },
      select: { custoEstimadoUsd: true },
    });
    let soma = 0;
    for (const l of linhas) {
      soma += typeof l.custoEstimadoUsd === "number" ? l.custoEstimadoUsd : CUSTO_DE_CHAMADA_SEM_PRECO_USD;
    }
    return soma;
  } catch (e) {
    console.error(`[teto-de-custo] contador fora do ar: ${e instanceof Error ? e.message : "erro desconhecido"}`);
    return null;
  }
}

/**
 * Pode gastar a chave paga nesta chamada?
 *
 * Fail-closed em todos os caminhos que não sejam "há dono, há teto, e o gasto
 * medido está abaixo dele".
 */
export async function podeGastarNaPortaPublica(
  workspaceId: string | null | undefined,
  agora = Date.now(),
): Promise<VeredictoDeTeto> {
  if (!workspaceId) {
    console.warn("[teto-de-custo] sem workspace resolvido — a porta pública não gasta chave paga sem dono");
    return { pode: false, motivo: "sem_workspace", gastoUsd: null, tetoUsd: null };
  }

  const teto = tetoConfiguradoUsd();
  if (teto === null) return { pode: false, motivo: "sem_teto", gastoUsd: null, tetoUsd: null };

  const gasto = await gastoNaJanelaUsd(workspaceId, agora);
  if (gasto === null) return { pode: false, motivo: "contador_fora_do_ar", gastoUsd: null, tetoUsd: teto };

  // `>=` e não `>`: com teto 0 e gasto 0, `0 > 0` é falso e a porta abriria —
  // é assim que "teto 0" vira "sem limite". Com `>=`, zero é zero.
  if (gasto >= teto) {
    console.warn(`[teto-de-custo] teto estourado — workspace=${workspaceId} gasto=US$${gasto.toFixed(4)} teto=US$${teto.toFixed(2)}`);
    return { pode: false, motivo: "teto_estourado", gastoUsd: gasto, tetoUsd: teto };
  }
  return { pode: true, gastoUsd: gasto, tetoUsd: teto };
}
