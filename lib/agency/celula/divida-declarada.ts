// A DÍVIDA DA ENTRADA DO M14 — REGISTRO TIPADO, COM DONO E PRAZO.
//
// Ver docs/celula-prospeccao/despachos/ONDA-4A-C-divida-do-m14.md.
//
// ── O ACHADO ─────────────────────────────────────────────────────────────
// "Nada alimenta `acompanhamentosJaEnviados` sozinho. O mecanismo existe; a
// entrada dele, não." DOIS módulos já esperam essa entrada —
// `lib/agency/celula/mensagens/acompanhamento.ts` e
// `lib/marketplaces/99freelas/follow-up.ts` — e nenhum dos dois alimenta a
// contagem sozinho porque o chat do 99Freelas fica atrás do login, e login é
// BLOCK nesta rodada.
//
// ── A ORDEM DO DIRETOR, LITERAL ──────────────────────────────────────────
// "Isto é a doença crônica desta casa — trava sem fechadura — e agora são
// DOIS mecanismos esperando a mesma entrada inexistente. Não conserte
// (depende do login, que é BLOCK). Torne impossível de ignorar. Teste
// vermelho declarado é honesto; comentário no topo do arquivo é esquecível."
//
// ── O DESENHO — DÍVIDA COMO DADO, NÃO COMO COMENTÁRIO ────────────────────
// Este arquivo NÃO conserta a ausência. Ele a declara, como registro tipado
// e fechado, no mesmo espírito de `lib/agency/celula/excecoes/tipos.ts`: sem
// `any`, sem string solta, com dono e prazo. `lib/agency/celula/excecoes/fila.ts`
// já tinha o mecanismo certo, com outro nome — `excecoesVencidas` /
// `gritoDaFila`, "exceção vencida GRITA". Este arquivo o ESPELHA:
// `dividasVencidas` / `gritoDasDividas`.
//
// ⚠️ INTERPRETAÇÃO DO PM SOBRE A ORDEM DO DIRETOR (declarada, não escondida):
// esta casa não tem mecanismo para segurar um teste PERMANENTEMENTE vermelho
// (não há `it.fails`, não há registro de dívida no `vitest`, e
// `lib/agency/escada/` é sobre exposição de departamento, não sobre dívida
// de construção). Um vermelho permanente ensinaria a casa a ignorar o CI —
// exatamente a doença que esta ficha combate. Por isso o vermelho aqui é
// DATADO: verde até o prazo, vermelho sozinho depois dele
// (`__tests__/celula/divida-da-entrada-do-m14.test.ts`, teste "🔴 O relógio
// real"). O Diretor pode mandar o contrário.
//
// ── COMO SE FECHA ESTA DÍVIDA DE VERDADE ─────────────────────────────────
// Construir a entrada (depende do login) E remover esta entrada do
// `REGISTRO_DE_DIVIDAS` E limpar a referência a ela nos dois cabeçalhos.
// Fazer só uma das três é dívida fechada em silêncio — e os testes desta
// ficha existem para pegar exatamente isso, dos dois lados: quem apaga o
// registro sem construir a entrada, e quem constrói a entrada sem fechar o
// registro.

import type { Responsavel } from "@/lib/agency/celula/excecoes/tipos";

/** Uma dívida declarada: o que falta, quem depende, por que não foi feito
 *  ainda, quem são os donos (tipados por `Responsavel` — o CEO não opera
 *  esta fila, a mesma trava de `excecoes/tipos.ts` vale aqui), o prazo (ISO)
 *  e o comportamento de hoje, sem a entrada. */
export interface DividaDeclarada {
  readonly id: string;
  /** Uma frase: quem produz o dado que falta, e não existe hoje. */
  readonly oQueFalta: string;
  /** Os caminhos de arquivo reais que esperam essa entrada. Confira no
   *  disco antes de declarar — ver o teste "não fica esquecida". */
  readonly quemDependeDisso: readonly string[];
  /** Por que a entrada não foi construída ainda. */
  readonly porQueNaoFoiFeito: string;
  /** Os donos, tipados — nunca redigitados como string solta. */
  readonly donos: readonly Responsavel[];
  /** ISO 8601. A partir deste instante, `dividasVencidas` passa a listar
   *  esta dívida e o teste do relógio real GRITA sozinho. */
  readonly prazo: string;
  /** O que acontece HOJE, sem a entrada — literal, conferido contra o
   *  código real do dependente (nunca suposto). */
  readonly comportamentoHojeSemAEntrada: string;
}

/** O id desta dívida específica — exportado para quem quiser referenciá-lo
 *  sem redigitar a string (testes, relatórios, o próximo despacho que for
 *  fechar isto). */
export const ID_DIVIDA_ENTRADA_ACOMPANHAMENTOS_JA_ENVIADOS =
  "entrada-de-acompanhamentos-ja-enviados" as const;

/**
 * O REGISTRO — conjunto fechado das dívidas declaradas desta casa. Toda
 * ausência de entrada que dois ou mais mecanismos já esperam, e que não
 * pode ser construída nesta rodada, entra aqui como dado — nunca só como
 * comentário no topo de um arquivo.
 */
export const REGISTRO_DE_DIVIDAS: readonly DividaDeclarada[] = [
  {
    id: ID_DIVIDA_ENTRADA_ACOMPANHAMENTOS_JA_ENVIADOS,
    oQueFalta:
      "Quem produz `acompanhamentosJaEnviados` (quantos acompanhamentos automáticos já saíram para uma " +
      "oportunidade) não existe. O mecanismo que CONSOME esse número (`podeAcompanhar`) está pronto; a " +
      "entrada que o ALIMENTA, não.",
    quemDependeDisso: [
      "lib/agency/celula/mensagens/acompanhamento.ts",
      "lib/marketplaces/99freelas/follow-up.ts",
    ],
    porQueNaoFoiFeito:
      "O chat do 99Freelas fica atrás do login, e login é BLOCK nesta rodada — não dá para ler a conversa " +
      "real da plataforma e contar quantos acompanhamentos automáticos já saíram.",
    donos: ["gerente_de_atendimento", "sdr"],
    // Proposta do PM — confirmar com o Diretor (ver relatório da Ficha C,
    // ONDA-4A-C). Não é data operacional real, é palpite declarado como
    // palpite.
    prazo: "2026-09-15T00:00:00.000Z",
    comportamentoHojeSemAEntrada:
      "`acompanhamentosJaEnviados = null` BLOQUEIA todo acompanhamento automático — `podeAcompanhar` é " +
      'fail-closed e nomeia o campo ("acompanhamentosJaEnviados") no motivo. Não há falso positivo (nenhum ' +
      "acompanhamento indevido sai), mas também não sai NENHUM acompanhamento automático enquanto esta " +
      "entrada não existir de verdade.",
  },
];

// ── Leitura, pura, com `agora` injetado (nunca `new Date()` aqui dentro) ────
// Mesma régua de `avaliarAberturaDeExcecao` em `excecoes/fila.ts`: o cálculo
// de vencimento precisa ser determinístico e testável.

/** Todas as dívidas hoje declaradas — abertas por definição: uma dívida só
 *  sai deste registro quando alguém a remove ao fechá-la de verdade (entrada
 *  construída E cabeçalho dos dependentes limpo). */
export function dividasAbertas(): readonly DividaDeclarada[] {
  return REGISTRO_DE_DIVIDAS;
}

/** As dívidas cujo `prazo` já passou, em relação a `agora`. `agora` no
 *  próprio instante do prazo já conta como vencida (`>=`), mesma régua de
 *  "pelo menos" usada em `podeAcompanhar` para o intervalo mínimo. */
export function dividasVencidas(agora: Date): DividaDeclarada[] {
  return REGISTRO_DE_DIVIDAS.filter((divida) => new Date(divida.prazo).getTime() <= agora.getTime());
}

/**
 * O texto para o humano — nomeando id, dono(s), há quantos dias venceu, o
 * que falta e quem depende. Nunca string vazia quando há dívida vencida;
 * sem nenhuma vencida, diz isso explicitamente (mesmo espírito de
 * `gritoDaFila`: silêncio é proibido, nos dois sentidos).
 */
export function gritoDasDividas(agora: Date): string {
  const vencidas = dividasVencidas(agora);

  if (vencidas.length === 0) {
    return "Nenhuma dívida declarada está vencida.";
  }

  return vencidas
    .map((divida) => {
      const diasVencida = Math.floor(
        (agora.getTime() - new Date(divida.prazo).getTime()) / 86_400_000,
      );
      return (
        `DÍVIDA VENCIDA: "${divida.id}" — vencida há ${diasVencida} dia(s) (prazo era ${divida.prazo}). ` +
        `O que falta: ${divida.oQueFalta} ` +
        `Donos: ${divida.donos.join(" e ")}. ` +
        `Depende disso: ${divida.quemDependeDisso.join(", ")}.`
      );
    })
    .join("\n");
}
