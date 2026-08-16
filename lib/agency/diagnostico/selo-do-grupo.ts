// A COR E O SELO DE UM GRUPO DO DIAGNÓSTICO — e por que "não sei" não é verde.
//
// ── O bloqueante (16/08/2026, terceira passada, `qualidade`) ────────────────
//
// `app/agency/settings/page.tsx` calculava a cor do cabeçalho do grupo assim:
//
//     groupFail > 0 ? "fail" : groupWarn > 0 ? "warning" : "pass"
//
// `info` — o estado que significa **"não consegui conferir"** — caía no `else`
// e virava **"pass"**. Medido: com o `fetch` de `/api/capacidades` falhando, a
// checagem do canal de e-mail vira `info` e o grupo aparecia com **bolinha
// verde e selo "0 ok"**, colapsado. A frase que explica que ninguém mediu
// ficava atrás de um clique, sob um verde.
//
// É a própria regra da casa violada na tela que existe para aplicá-la:
// **"não sei" pintado de aprovado**. Ausência de informação não é informação —
// e um selo dizendo "0 ok" em verde é a forma mais eficiente possível de dizer
// "está tudo bem" sobre coisa nenhuma.
//
// ── POR QUE ISTO É UM MÓDULO, E NÃO UM TERNÁRIO NA TELA ─────────────────────
//
// Porque o portão precisa poder perguntar. O teste anterior desta frente
// **reimplementava** o recorte da tela em vez de afirmar que a tela o usa —
// apagar o bloco de render deixava o teste verde. Regra que mora só dentro do
// JSX só pode ser testada por leitura de texto; regra em módulo é executável.

export type StatusDaChecagem = "pass" | "warning" | "fail" | "info";

export interface SeloDoGrupo {
  /** A cor do cabeçalho. `info` NUNCA vira `pass`. */
  status: StatusDaChecagem;
  fail: number;
  warning: number;
  pass: number;
  /** Quantas checagens deste grupo ninguém conseguiu conferir. */
  naoConferidas: number;
  /** Os selos, na ordem em que aparecem no cabeçalho. */
  selos: { tom: StatusDaChecagem; texto: string }[];
}

/**
 * A leitura honesta de um grupo de checagens.
 *
 * A ordem de precedência é: **falha > atenção > não conferido > ok**. O único
 * caminho para o verde é não haver nada de outro tipo — e um grupo VAZIO não é
 * verde nem vermelho: ele não tem selo nenhum, porque não há o que dizer.
 */
export function seloDoGrupo(checks: { status: StatusDaChecagem }[]): SeloDoGrupo {
  const conta = (s: StatusDaChecagem) => checks.filter((c) => c.status === s).length;
  const fail = conta("fail");
  const warning = conta("warning");
  const pass = conta("pass");
  const naoConferidas = conta("info");

  const status: StatusDaChecagem =
    fail > 0 ? "fail" : warning > 0 ? "warning" : naoConferidas > 0 ? "info" : "pass";

  const selos: SeloDoGrupo["selos"] = [];
  if (fail > 0) selos.push({ tom: "fail", texto: `${fail} falha${fail > 1 ? "s" : ""}` });
  if (warning > 0) selos.push({ tom: "warning", texto: `${warning} atenção` });
  if (naoConferidas > 0)
    selos.push({ tom: "info", texto: `${naoConferidas} não conferido${naoConferidas > 1 ? "s" : ""}` });
  // ⚠️ `pass > 0` NÃO É DETALHE DE ESTILO. Era daqui que saía o selo **"0 ok"**,
  // em verde, num grupo em que nada tinha sido medido.
  if (fail === 0 && warning === 0 && pass > 0) selos.push({ tom: "pass", texto: `${pass} ok` });

  return { status, fail, warning, pass, naoConferidas, selos };
}
