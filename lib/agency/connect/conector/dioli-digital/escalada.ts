/**
 * ⭐ A ESCALADA DA DIOLI DIGITAL — a consulta ao gerente sobe pelo Dioli Connect.
 *
 * ─── LIGAÇÃO LOCAL, E A ÚNICA COISA QUE O ORQUESTRADOR DELEGA ───────────────
 *
 * `atendimento.ts` (comum) sabe QUANDO escalar; ele não sabe COMO, e é de
 * propósito: no Foocci a escalada é `consultarGerente`; aqui é este arquivo. O
 * que o conector exige de volta são duas informações e nada mais — **abriu?** e
 * **qual fio?**.
 *
 * ─── ⛔ E ELA NÃO DECIDE NADA ───────────────────────────────────────────────
 *
 * Este arquivo abre a consulta e devolve o fio. Ele não lê a resposta do
 * gerente, não a interpreta e não a entrega: a resposta volta pela porta
 * `/api/connect/retorno`, empurrada pelo núcleo, e quem a entrega é
 * `receberRetorno` (comum). Se um dia aparecer aqui um `await` esperando
 * decisão, alguém transformou o turno de um cliente em sala de espera de
 * reunião.
 *
 * ─── FAIL-CLOSED, NOS DOIS SENTIDOS ─────────────────────────────────────────
 *
 * Sem `DIOLI_CONNECT_URL` + `DIOLI_CONNECT_SECRET`, esta função não tenta nada e
 * devolve `aberta: false` com o motivo escrito. Isso não é uma falha: é o
 * conector **fechado por construção**, e o produto segue para a fila humana
 * exatamente como seguia antes de existir Connect nenhum. Nada quebra, e nada
 * abre por omissão.
 *
 * ⛔ O segredo aparece em UM lugar — o cabeçalho — e em nenhum log, motivo ou
 * texto de cliente.
 */

import { CAMINHO_DO_DESPACHO, VARIAVEL_DA_URL_DO_NUCLEO } from "../contrato";
import { CABECALHO_DO_SEGREDO, VARIAVEL_DO_SEGREDO, segredoDaPorta } from "../../porta";
import type { Escalar } from "../atendimento";

/**
 * O teto da consulta ao gerente: 8 s.
 *
 * ⚠️ É MAIOR que os 3 s da consulta de política, e a diferença é o desenho. A
 * consulta de política roda no turno do cliente, que está olhando a tela. Esta
 * roda depois — o cliente já vai receber o aviso de pendência de qualquer jeito,
 * e o que importa aqui é a consulta REALMENTE abrir, não abrir rápido.
 */
export const TETO_DO_DESPACHO_MS = 8_000;

export interface DependenciasDaEscalada {
  buscar?: typeof fetch;
  env?: NodeJS.ProcessEnv;
}

/**
 * Monta a escalada desta casa.
 *
 * `pergunta` e `referenciaDoCliente` entram por fora porque o `Escalar` comum só
 * carrega protocolo, assuntos e a política recusada — o resto é contexto do
 * produto, e é o produto que sabe montá-lo.
 *
 * ⚠️ `referenciaDoCliente` é o `Client.id`. **Nunca** nome, e-mail ou telefone:
 * o núcleo precisa saber QUEM pergunta para distinguir exceção de regra, e não
 * precisa de mais nada sobre a pessoa para isso.
 */
export function escaladaDaDioliDigital(
  contexto: { referenciaDoCliente: string; pergunta: string; canal: string; agente: string },
  deps: DependenciasDaEscalada = {},
): Escalar {
  return async ({ protocolo, assuntos, politicaRecusada }) => {
    const env = deps.env ?? process.env;
    const buscar = deps.buscar ?? fetch;

    const segredo = segredoDaPorta(env);
    const base = env[VARIAVEL_DA_URL_DO_NUCLEO]?.trim().replace(/\/$/, "");
    if (!segredo || !base) {
      return {
        aberta: false,
        fio: null,
        detalhe:
          `O Dioli Connect não está configurado neste ambiente (${VARIAVEL_DA_URL_DO_NUCLEO} e ` +
          `${VARIAVEL_DO_SEGREDO} precisam existir). Nenhuma consulta foi tentada, e o assunto segue ` +
          "para a fila humana como seguia antes.",
      };
    }

    const controle = new AbortController();
    const relogio = setTimeout(() => controle.abort(), TETO_DO_DESPACHO_MS);

    let resposta: Response;
    try {
      resposta = await buscar(`${base}${CAMINHO_DO_DESPACHO}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          // ⛔ O único lugar em que o segredo aparece.
          [CABECALHO_DO_SEGREDO]: segredo,
        },
        body: JSON.stringify({
          produto: "dioli-digital",
          protocolo,
          agente: contexto.agente,
          canal: contexto.canal,
          referenciaDoCliente: contexto.referenciaDoCliente,
          assuntos,
          pergunta: contexto.pergunta,
          // ⭐ Quem vai decidir precisa saber que JÁ HOUVE decisão sobre isto e
          // que ela não valeu para este caso. Sem esta linha o gerente responde
          // a pergunta errada — ele acha que é a primeira vez.
          politicaRecusada,
        }),
        signal: controle.signal,
      });
    } catch (e) {
      const abortou = e instanceof Error && e.name === "AbortError";
      return {
        aberta: false,
        fio: null,
        detalhe: abortou
          ? `A consulta ao gerente não abriu em ${TETO_DO_DESPACHO_MS} ms.`
          : `Não deu para falar com o núcleo: ${e instanceof Error ? e.message : String(e)}.`,
      };
    } finally {
      clearTimeout(relogio);
    }

    if (!resposta.ok) {
      return {
        aberta: false,
        fio: null,
        detalhe: `O núcleo respondeu HTTP ${resposta.status} à consulta ao gerente.`,
      };
    }

    let corpo: { fio?: unknown; aberta?: unknown } | null = null;
    try {
      corpo = (await resposta.json()) as { fio?: unknown; aberta?: unknown };
    } catch {
      // ⚠️ 200 com corpo ilegível NÃO é consulta aberta. Ausência de informação
      // não é informação: dar por aberta uma consulta que não se sabe se abriu
      // gravaria uma pendência esperando um retorno que nunca vem.
      return {
        aberta: false,
        fio: null,
        detalhe: "O núcleo respondeu 200 com um corpo que não é JSON; a consulta não pode ser dada por aberta.",
      };
    }

    const fio = typeof corpo?.fio === "string" && corpo.fio.trim() ? corpo.fio.trim() : null;
    return {
      aberta: true,
      fio,
      detalhe: fio
        ? "A consulta ao gerente foi aberta no Dioli Connect."
        : "A consulta ao gerente foi aberta no Dioli Connect (o núcleo não devolveu fio).",
    };
  };
}
