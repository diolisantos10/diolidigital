// brand-book-recebido.ts — O QUE ACONTECE QUANDO UM BRAND BOOK CHEGA.
//
// A ordem é obrigatória e é esta: **ARMAZENAR PRIMEIRO, ANALISAR DEPOIS.**
//
// Não é preferência de estilo. Analisar antes de guardar significa que uma falha
// do modelo, um timeout ou uma chave sem crédito fazem o arquivo do cliente
// desaparecer junto com a análise — e ele já foi embora da tela. Guardado
// primeiro, o pior caso é um arquivo com a leitura pendente, que é um estado do
// qual dá para sair. `POST /api/media` já grava o `MediaAsset` e a linha de
// material antes de chamar qualquer coisa daqui.
//
// ── A EXTRAÇÃO PROPÕE. NUNCA SOBRESCREVE. ──────────────────────────────────
//
// O que sai da leitura NÃO vai para a ficha de marca. Ele vira uma SUGESTÃO
// guardada, presa ao cliente certo, esperando revisão humana — e quem aplica é
// `POST /api/agency/clients/[id]/marca/do-brand-book`, que já existe e já tem a
// trava que importa: campo que o DONO respondeu entra em `jaDefinidos` e não é
// tocado. Trocar a palavra do cliente pelo palpite de um modelo lendo um PDF, em
// silêncio, é o defeito que aquela rota existe para impedir.
//
// Aqui não se cria um segundo caminho de escrita na ficha. Nenhum.
//
// ── E O ESTADO É VISÍVEL O TEMPO TODO ──────────────────────────────────────
//
// recebido → analisando → aguardando revisão → aplicado, e `erro` de qualquer
// ponto. O estado mora em `BrainArtifact` (department `brand-book-extraido`),
// que já é onde a casa guarda o que concluiu sobre um cliente. Tabela nova para
// isto seria mais uma porta onde o arquivo do cliente some.

import { prisma } from "@/lib/db/client";
import { analisarBrandBook } from "@/lib/ai/leitura-de-marca";
import { DEPARTAMENTO_DO_BRAND_BOOK } from "@/lib/agency/brand/materiais-da-marca";

/** Os estados que esta máquina grava. `aplicado` é gravado pela rota que
 *  aplica — não aqui: quem aplica é quem revisou. */
export type EstadoDaAnalise = "analisando" | "aguardando_revisao" | "erro";

/**
 * Marca o começo da leitura, ANTES de ela começar.
 *
 * Gravar "analisando" só depois de a chamada voltar deixaria uma janela de até
 * 90 segundos em que o cliente recarrega a página e vê apenas "recebido" — sem
 * nada indicando que alguma coisa está acontecendo com o arquivo dele. Quem não
 * vê movimento reenvia.
 */
export async function marcarAnaliseComecou(entrada: {
  clientId: string;
  materialId: string;
  arquivo: string;
}): Promise<string | null> {
  const artefato = await prisma.brainArtifact.create({
    data: {
      clientId: entrada.clientId,
      department: DEPARTAMENTO_DO_BRAND_BOOK,
      // O `canvasId` é o id do MATERIAL. É o que liga a análise ao arquivo
      // exato de onde ela saiu — e é por ele que a lista do portal casa os dois.
      canvasId: entrada.materialId,
      canvasJson: JSON.stringify({ arquivo: entrada.arquivo, em: new Date().toISOString() }),
      status: "analisando",
    },
  }).catch((e) => {
    console.error("[brand-book] não consegui marcar o início da análise:", e instanceof Error ? e.message : e);
    return null;
  });
  return artefato?.id ?? null;
}

/** Guarda o resultado — a extração como SUGESTÃO, ou o erro com todas as letras. */
export async function guardarResultado(
  artefatoId: string,
  resultado:
    | { ok: true; extracao: unknown; arquivo: string }
    | { ok: false; erro: string; arquivo: string },
): Promise<void> {
  await prisma.brainArtifact.update({
    where: { id: artefatoId },
    data: {
      status: resultado.ok ? "aguardando_revisao" : "erro",
      canvasJson: JSON.stringify(
        resultado.ok
          ? { arquivo: resultado.arquivo, extracao: resultado.extracao, em: new Date().toISOString() }
          // O ERRO CARREGA O CASO CONCRETO. "Algo falhou" é ruído que ninguém
          // investiga; o nome do arquivo e o motivo são o que permite agir.
          : { arquivo: resultado.arquivo, erro: resultado.erro, em: new Date().toISOString() },
      ),
    },
  }).catch((e) => {
    console.error("[brand-book] não consegui guardar o resultado da análise:", e instanceof Error ? e.message : e);
  });
}

/**
 * O ciclo inteiro, para quem acabou de guardar um brand book.
 *
 * ── NUNCA DERRUBA O ENVIO ─────────────────────────────────────────────────
 *
 * Quem chama isto já guardou os bytes e já respondeu (ou vai responder) ao
 * cliente que o arquivo chegou — porque chegou. Uma falha de leitura não pode
 * virar "não consegui enviar": mandaria o cliente reenviar um arquivo que já
 * está no disco, e a segunda cópia é o começo de "qual das duas é a boa?".
 */
export async function lerBrandBookRecebido(entrada: {
  workspaceId: string;
  clientId: string;
  materialId: string;
  arquivo: string;
  bytes: Buffer;
  mimeType: string;
}): Promise<void> {
  const artefatoId = await marcarAnaliseComecou({
    clientId: entrada.clientId,
    materialId: entrada.materialId,
    arquivo: entrada.arquivo,
  });
  if (!artefatoId) return;

  try {
    const r = await analisarBrandBook({
      bytes: entrada.bytes,
      mimeType: entrada.mimeType,
      fileName: entrada.arquivo,
      workspaceId: entrada.workspaceId,
    });

    await guardarResultado(
      artefatoId,
      r.ok
        ? { ok: true, extracao: r.extraction, arquivo: entrada.arquivo }
        : { ok: false, erro: r.erro, arquivo: entrada.arquivo },
    );

    if (r.ok) {
      // A equipe precisa saber que há sugestão esperando revisão. Sem este
      // aviso, a extração fica correta e parada — que é o estado em que ela
      // já morreu uma vez (15/08, extração renderizada e nunca gravada).
      await prisma.activityEvent.create({
        data: {
          workspaceId: entrada.workspaceId,
          clientId: entrada.clientId,
          type: "brand_book_aguardando_revisao",
          message: `Brand book recebido e lido: "${entrada.arquivo}". Há sugestões de ficha de marca esperando revisão — nada foi aplicado ainda.`,
        },
      }).catch(() => { /* best-effort: o aviso não pode derrubar o resultado */ });
    }
  } catch (e) {
    // Exceção inesperada também vira estado visível. Um `catch` mudo deixaria
    // o arquivo girando em "analisando" até o prazo estourar.
    await guardarResultado(artefatoId, {
      ok: false,
      erro: `A leitura falhou de forma inesperada: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300),
      arquivo: entrada.arquivo,
    });
  }
}
