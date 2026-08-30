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

// ─── O DEFEITO QUE ESTE TETO CAUSOU, MEDIDO EM PRODUÇÃO (25/08/2026) ────────
//
// O cliente oculto bateu na porta pública de `www.diolidigital.com.br` e levou
// `{"ok":false,"reason":"teto_de_custo"}` em NOVE turnos seguidos. A porta da
// frente da agência — a única entrada de receita — estava fechada para todo
// visitante da internet.
//
// A causa não foi ataque nem laço de requisições. Foi ESTE ARQUIVO contando a
// coisa errada. `gastoNaJanelaUsd` somava **todo** o `AIRunLog` do workspace na
// janela, e o relatório de gasto das últimas 24 h dizia:
//
//     total ............................ US$ 7,67   (teto: US$ 5,00)
//     openai/gpt-image-1 ...............  US$ 6,09  ← 79%, 28 chamadas
//     claude/claude-haiku-4-5 ..........  US$ 1,49
//
// `gpt-image-1` é **produção de arte** — trabalho interno, autenticado, de
// clientes que já pagaram. Ou seja: a casa produzia as peças da manhã e, com
// isso, fechava a própria porta da frente à tarde. Quanto melhor a agência
// trabalha, menos clientes novos ela consegue atender. É o incentivo invertido.
//
// O cabeçalho acima já dizia o que este teto queria ser — *"o teto de GASTO da
// porta da rua"*, *"o gasto da porta pública"*, *"um chão embaixo do laço de
// requisições"*. A implementação media outra coisa. Régua verde sobre o
// componente errado é pior que régua nenhuma.
//
// ─── DOIS TETOS, PORQUE SÃO DOIS RISCOS ─────────────────────────────────────
//
// Estreitar o teto para a porta pública, e só isso, abriria um buraco: o gasto
// TOTAL da casa deixaria de ter qualquer limite. Então são dois, com motivos
// diferentes e números diferentes:
//
//   1. **O teto da porta** (US$ 5 / 24 h) — conta só o que o agente
//      `comercial-sdr` gastou. É o freio contra o desconhecido da internet.
//   2. **O teto do workspace** (US$ 25 / 24 h) — conta tudo. É o freio contra
//      a casa se sangrando sozinha (um laço de produção, um modelo caro novo).
//      Ele NÃO é o freio da porta: quando ele estoura, o problema é interno.
//
// ⚠️ **O NÚMERO 25 PRECISA DO CEO.** Ele não saiu de uma medição de negócio —
// saiu de "cinco vezes o teto da porta, e acima do pico real medido de US$ 7,67
// num dia de produção". É um chão para impedir sangria, não um orçamento. Quem
// decide quanto a agência pode gastar por dia é o CEO; até ele dizer, este
// número está declarado aqui e sobrescrevível por `TETO_DIARIO_WORKSPACE_USD`.

/** O agente que atende a porta da rua. É o mesmo `agentId` que
 *  `app/api/sdr/chat/route.ts` carimba nas duas chamadas pagas dela — e é o
 *  que separa "a internet gastou" de "a casa produziu". */
export const AGENTE_DA_PORTA_PUBLICA = "comercial-sdr";

/** O padrão da casa: US$ por workspace, por janela de 24 h, na porta pública. */
export const TETO_DIARIO_PADRAO_USD = 5;

/** O teto de TUDO que o workspace gasta na janela. Ver o aviso acima: o
 *  número é provisório e é do CEO. */
export const TETO_DIARIO_WORKSPACE_PADRAO_USD = 25;

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
  | {
      pode: false;
      /** `teto_estourado` é a PORTA; `teto_do_workspace_estourado` é a casa.
       *  Achatar os dois num motivo só foi exatamente o que fez a auditoria de
       *  25/08 levar meia hora para descobrir que ninguém estava atacando
       *  nada. Dois fatos, dois motivos. */
      motivo: "sem_workspace" | "sem_teto" | "contador_fora_do_ar" | "teto_estourado" | "teto_do_workspace_estourado";
      gastoUsd: number | null;
      tetoUsd: number | null;
    };

/**
 * O teto configurado, em USD — ou `null` quando a configuração é ilegível.
 *
 * `null` é "não sei", e "não sei" não gasta. `0` é um teto válido e significa
 * zero. Os dois NUNCA caem no mesmo `if` — ver o cabeçalho.
 */
export function tetoConfiguradoUsd(env: NodeJS.ProcessEnv = process.env): number | null {
  return lerTeto(env.TETO_DIARIO_SDR_USD, TETO_DIARIO_PADRAO_USD, "TETO_DIARIO_SDR_USD");
}

/** O teto de TUDO no workspace. Mesma regra de leitura, outro número. */
export function tetoDoWorkspaceUsd(env: NodeJS.ProcessEnv = process.env): number | null {
  return lerTeto(env.TETO_DIARIO_WORKSPACE_USD, TETO_DIARIO_WORKSPACE_PADRAO_USD, "TETO_DIARIO_WORKSPACE_USD");
}

function lerTeto(cru: string | undefined, padrao: number, nome: string): number | null {
  if (cru === undefined || cru === null || cru.trim() === "") return padrao;
  const n = Number(cru.trim());
  // `Number("")` é 0 e `Number("abc")` é NaN: o vazio já saiu acima, e o
  // ilegível vira `null` (não gasta), nunca o padrão.
  if (!Number.isFinite(n) || n < 0) {
    console.error(`[teto-de-custo] ${nome} ilegível ("${cru}") — a porta pública NÃO gasta até isto ser corrigido`);
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
export async function gastoNaJanelaUsd(
  workspaceId: string,
  agora = Date.now(),
  /** `undefined` = tudo do workspace. Um `agentId` = só o que ELE gastou.
   *  É este parâmetro que separa "a internet gastou" de "a casa produziu". */
  agentId?: string,
): Promise<number | null> {
  const desde = new Date(agora - JANELA_DO_TETO_MS);
  try {
    const linhas = await prisma.aIRunLog.findMany({
      where: { workspaceId, createdAt: { gte: desde }, ...(agentId ? { agentId } : {}) },
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

  const tetoDaCasa = tetoDoWorkspaceUsd();
  if (tetoDaCasa === null) return { pode: false, motivo: "sem_teto", gastoUsd: null, tetoUsd: null };

  // 1. O FREIO DA CASA. Conta tudo. Estourar aqui é problema INTERNO — um laço
  //    de produção, um modelo caro novo — e não um visitante na porta.
  const gastoDaCasa = await gastoNaJanelaUsd(workspaceId, agora);
  if (gastoDaCasa === null) return { pode: false, motivo: "contador_fora_do_ar", gastoUsd: null, tetoUsd: tetoDaCasa };
  if (gastoDaCasa >= tetoDaCasa) {
    console.warn(`[teto-de-custo] TETO DA CASA estourado — workspace=${workspaceId} gasto=US$${gastoDaCasa.toFixed(4)} teto=US$${tetoDaCasa.toFixed(2)}`);
    return { pode: false, motivo: "teto_do_workspace_estourado", gastoUsd: gastoDaCasa, tetoUsd: tetoDaCasa };
  }

  // 2. O FREIO DA PORTA. Conta SÓ o que a porta pública gastou. Era isto que
  //    este arquivo sempre disse que fazia, e não fazia.
  const gasto = await gastoNaJanelaUsd(workspaceId, agora, AGENTE_DA_PORTA_PUBLICA);
  if (gasto === null) return { pode: false, motivo: "contador_fora_do_ar", gastoUsd: null, tetoUsd: teto };

  // `>=` e não `>`: com teto 0 e gasto 0, `0 > 0` é falso e a porta abriria —
  // é assim que "teto 0" vira "sem limite". Com `>=`, zero é zero.
  if (gasto >= teto) {
    console.warn(`[teto-de-custo] teto DA PORTA estourado — workspace=${workspaceId} gasto=US$${gasto.toFixed(4)} teto=US$${teto.toFixed(2)}`);
    return { pode: false, motivo: "teto_estourado", gastoUsd: gasto, tetoUsd: teto };
  }
  return { pode: true, gastoUsd: gasto, tetoUsd: teto };
}
