/**
 * ⭐⭐ O NÚCLEO DE MENTIRA — e por que ele agora RECUSA.
 *
 * ─── O DEFEITO DE CLASSE, MEDIDO EM 30/08/2026 ──────────────────────────────
 *
 * O Foocci foi medido contra o núcleo REAL e reprovou em dois campos. A suíte
 * dele estava verde. A suíte da Dioli Digital também estava — e a Dioli Digital
 * mandava `desconto`, `preco`, `prazo`, `escopo`, `cancelamento` e `contrato`,
 * **zero interseção** com o vocabulário fechado do núcleo.
 *
 * ⚠️ Nenhuma das duas suítes pegou nada, e o motivo é este arquivo: o núcleo de
 * mentira aceitava QUALQUER `assunto` e QUALQUER remetente. Ele respondia 200
 * para o certo e para o errado.
 *
 * **Interlocutor complacente não mede nada.** O verde que ele produzia era
 * sobre a educação dele, não sobre o nosso contrato — e um duplo mais fácil que
 * o real transforma a suíte inteira numa cerimônia.
 *
 * ─── O QUE ESTE DUPLO PASSA A FAZER ────────────────────────────────────────
 *
 *   1. **Vocabulário fechado.** `assuntos[].assunto` fora da lista do núcleo →
 *      recusa com `{"codigo":"assunto_fora_do_vocabulario"}`.
 *   2. **Remetente resolvido.** `produto`/`agente` que não existem no diretório
 *      → recusa com `{"codigo":"remetente_desconhecido"}`.
 *
 * ⚠️ HONESTIDADE SOBRE O QUE FOI MEDIDO E O QUE NÃO FOI. Os dois `codigo` são
 * literais do núcleo real, ditados pelo operador que o mediu. O **status HTTP**
 * de cada recusa NÃO foi medido daqui (o núcleo exige credencial de produção,
 * que esta sessão não possui): 400 é a escolha deste duplo, não um fato
 * observado. Isso é suficiente para o que importa — o conector trata qualquer
 * não-2xx como "não abriu" —, mas quem um dia medir o status deve corrigir
 * AQUI, e não afrouxar o teste que depender dele.
 */

import { vi } from "vitest";
import { CABECALHO_DO_SEGREDO } from "@/lib/agency/connect/porta";
import { ASSUNTOS_DO_NUCLEO } from "@/lib/agency/connect/vocabulario-do-nucleo";

export interface ChamadaAoNucleo {
  url: string;
  corpo: Record<string, unknown>;
  segredo: string | null;
}

/**
 * O diretório corporativo, recortado por produto — como o núcleo o resolve.
 *
 * ⛔ ATENÇÃO, E ISTO NÃO É DETALHE: a linha do Foocci (`diretor`) é FATO —
 * medida contra o núcleo real pelo operador, que registrou que `diretor-foocci`
 * era recusado e `diretor` passava. A linha da **Dioli Digital NÃO é fato**: é
 * o que o produto manda hoje (`AGENTE` de `conector/dioli-digital/
 * ligacaoLocal.ts`), e ninguém verificou se o núcleo a conhece — esta sessão
 * não tem a credencial de produção para perguntar.
 *
 * ⚠️ Ou seja: este duplo prova a metade do VOCABULÁRIO (que é fato medido) e
 * NÃO prova a metade do REMETENTE para a Dioli Digital. Escrever aqui uma linha
 * que faz a suíte passar não torna o núcleo real de acordo — seria trocar um
 * duplo complacente por um duplo crédulo, que é o mesmo defeito com outro nome.
 * Quem tiver a credencial mede e corrige AQUI.
 */
export const DIRETORIO_DO_NUCLEO: Readonly<Record<string, readonly string[]>> = {
  // ⚠️ NÃO VERIFICADO contra o núcleo real — ver o aviso acima.
  "dioli-digital": ["pm-responde"],
  // ✅ Verificado pelo operador em 30/08/2026.
  foocci: ["diretor"],
};

function resposta(corpo: unknown, ok: boolean, status: number): Response {
  return { ok, status, json: async () => corpo } as unknown as Response;
}

export interface OpcoesDoNucleo {
  /** O que a consulta de política devolve, quando ela passa nas travas. */
  politica: unknown;
  fio?: string | null;
  /** Deixe `false` para voltar ao duplo complacente — só para PROVAR que ele
   *  não pega nada. Nenhum teste de comportamento deve usar isto. */
  estrito?: boolean;
}

/**
 * O núcleo de mentira. Guarda as chamadas em `chamadas` e aplica as travas.
 */
export function nucleoDeMentira(chamadas: ChamadaAoNucleo[], opcoes: OpcoesDoNucleo) {
  const { politica, fio = "fio-1", estrito = true } = opcoes;

  return vi.fn(async (url: string, init: RequestInit) => {
    const corpo = JSON.parse(String(init.body)) as Record<string, unknown>;
    chamadas.push({
      url,
      corpo,
      segredo: (init.headers as Record<string, string>)[CABECALHO_DO_SEGREDO] ?? null,
    });

    if (estrito) {
      // ── Trava 2: o remetente existe no diretório, recortado pelo produto? ──
      const produto = String(corpo.produto ?? "");
      const agente = String(corpo.agente ?? "");
      const conhecidos = DIRETORIO_DO_NUCLEO[produto];
      if (!conhecidos || !conhecidos.includes(agente)) {
        return resposta({ codigo: "remetente_desconhecido" }, false, 400);
      }

      // ── Trava 1: todo assunto está no vocabulário fechado? ────────────────
      const assuntos = Array.isArray(corpo.assuntos) ? corpo.assuntos : [];
      for (const a of assuntos as Array<{ assunto?: unknown }>) {
        const nome = String(a?.assunto ?? "");
        if (!(ASSUNTOS_DO_NUCLEO as readonly string[]).includes(nome)) {
          return resposta({ codigo: "assunto_fora_do_vocabulario" }, false, 400);
        }
      }
    }

    if (url.endsWith("/api/connect/politicas/consulta")) return resposta(politica, true, 200);
    if (url.endsWith("/api/connect/despacho")) {
      return resposta({ aberta: true, fio }, true, 200);
    }
    throw new Error(`o produto chamou uma porta que não existe: ${url}`);
  });
}
