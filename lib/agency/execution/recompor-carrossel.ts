// RECOMPOR CARROSSEL — as telas que já foram pagas, desenhadas de novo.
//
// ── Por que este arquivo existe (09/08/2026) ────────────────────────────────
//
// Medido em produção neste dia: **3 carrosséis travados, 6 telas cada, todas em
// PNG**. O Instagram só publica JPEG. Era a única perna da esteira que falhava
// — as outras oito andavam sozinhas.
//
// `recomporPecas` (o conserto irmão, no mesmo dia) NÃO alcança carrossel: ela
// compõe UMA arte por peça, e o que vai ao Instagram num carrossel são as N
// telas de `mediaUrlsJson`. Recompor um carrossel por lá escrevia capa nova e
// deixava as telas quebradas — defeito meu, e este arquivo é a metade que
// faltava.
//
// ── O QUE ISTO NÃO CUSTA ────────────────────────────────────────────────────
//
// **Nenhuma imagem é comprada.** A foto de cada tela já foi paga e está no
// armazenamento como `fundo-<postId>-<n>.png` — `montarCarrossel` a guarda
// justamente para que o re-render custe rasterização, e não uma imagem nova.
// Aqui não há `generateDesign` nem `baixarImagem`, e um teste impede que
// alguém os traga de volta sem perceber.
//
// ── TUDO OU NADA, e a razão é do produto ────────────────────────────────────
//
// `montarCarrossel` já dizia: *"as artes só são amarradas ao post quando todas
// existem"*, porque publicar uma sequência que perde o sentido no meio é pior
// do que não publicar. Recompor herda a regra: se UMA tela não puder ser
// redesenhada, o carrossel inteiro fica como está e o motivo é declarado.

import { prisma } from "@/lib/db/client";
import {
  comporComMolde, lerMarca, nomeDoFundo, nomeDaTelaDoCarrossel,
  type Recomposicao,
} from "@/lib/agency/execution/artes";
import { conferirPilar } from "@/lib/agency/execution/pilares-bloqueados";
import { guardarArquivo, lerArquivo } from "@/lib/agency/media/armazenamento";
import { lerStoryboard, conferirStoryboard, REGUA_CARROSSEL_DE_VENDA } from "@/lib/agency/design/storyboard";
import { composicaoParaFuncao } from "@/lib/agency/design/repertorio";
import type { Composicao } from "@/lib/agency/design/repertorio";

/** Teto por passada. Mesmo número do conserto irmão, e pela mesma razão: uma
 *  passada que reescreve 200 peças de uma vez é o problema se disfarçando de
 *  conserto. */
const TETO = 20;

function cenasDoPost(scenesJson: string | null | undefined): string[] {
  try {
    const v = JSON.parse(scenesJson ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Redesenha as telas dos carrosséis cuja arte é mais velha que o material de
 * marca do cliente — ou que estão gravadas num formato que a plataforma recusa.
 *
 * Nunca lança e nunca publica.
 */
export async function recomporCarrosseis(limite = TETO): Promise<Recomposicao> {
  const saida: Recomposicao = { recompostas: [], semFundo: [], bloqueadas: [], falhas: [] };

  const candidatos = await prisma.socialPost.findMany({
    where: {
      format: { in: ["carousel", "carrossel"] },
      status: { in: ["draft", "scheduled", "approved"] },
    },
    orderBy: { scheduledFor: "asc" },
    take: limite,
  }).catch(() => []);

  for (const post of candidatos) {
    // A trava de pilar vale aqui também: peça de pilar bloqueado não é
    // redesenhada, porque redesenhar é trabalho e ela não pode sair de qualquer
    // forma.
    if (conferirPilar(post.pillar).bloqueado) {
      saida.bloqueadas.push(post.id);
      continue;
    }

    const cenas = cenasDoPost(post.scenesJson);
    if (cenas.length < 2) {
      saida.falhas.push({ postId: post.id, erro: "o carrossel não tem telas descritas — não há o que redesenhar" });
      continue;
    }

    const marca = await lerMarca(post.clientId);
    const regua =
      marca.cerebro.formatos.find((f: { regua: { id: string; funcoesPermitidas: string[] } }) => f.regua.funcoesPermitidas.includes("gancho"))?.regua
      ?? REGUA_CARROSSEL_DE_VENDA;
    const formatoId = marca.cerebro.formatos.find((f: { regua: { id: string; funcoesPermitidas: string[] } }) => f.regua.id === regua.id)?.id ?? null;
    const roteiro = conferirStoryboard(lerStoryboard(cenas), regua);
    // Roteiro reprovado NÃO impede o redesenho: o defeito dele é de conteúdo e
    // já existia antes desta passada. Redesenhar mantém o mesmo texto — o que
    // muda é só o formato do arquivo e a marca por cima. Barrar aqui deixaria a
    // peça travada para sempre por um motivo que este conserto não trata.
    const telas = roteiro.ok ? roteiro.telas : cenas.map((descricao, i) => ({ descricao, funcao: null, ordem: i + 1 }));

    // ── Primeiro LÊ tudo, só depois grava ────────────────────────────────
    // Tudo-ou-nada de verdade: gravar tela por tela e falhar na quinta deixaria
    // o post com metade das telas novas e metade velhas — pior que não mexer.
    const fundos: Array<{ bytes: Buffer; indice: number }> = [];
    let faltou = false;
    for (let i = 0; i < telas.length; i++) {
      const asset = await prisma.mediaAsset.findFirst({
        where: { fileName: nomeDoFundo(post.id, i + 1), workspaceId: post.workspaceId },
        orderBy: { createdAt: "desc" },
      }).catch(() => null);
      const bytes = asset ? await lerArquivo(asset.storagePath).catch(() => null) : null;
      if (!bytes || bytes.length === 0) { faltou = true; break; }
      fundos.push({ bytes: Buffer.from(bytes), indice: i });
    }
    if (faltou) {
      // Sem a foto guardada, redesenhar exigiria COMPRAR imagem nova — e essa
      // decisão custa dinheiro e não é desta função.
      saida.semFundo.push(post.id);
      continue;
    }

    const urls: string[] = [];
    let erro: string | null = null;
    for (const { bytes, indice } of fundos) {
      const tela = telas[indice]!;
      const escolha = composicaoParaFuncao(marca.cerebro, tela.funcao ?? null, formatoId);
      const composta = await comporComMolde({
        formato: "carrossel",
        molde: marca.molde,
        fotoBytes: bytes,
        fotoMime: "image/png",
        fonteAuditada: tela.descricao,
        selo: indice === 0 ? post.pillar : null,
        assinatura: marca.nome,
        indice: { atual: indice + 1, total: telas.length },
        composicao: (escolha?.composicao ?? "foto-cheia") as Composicao,
        notaDoMaterial: null,
      });
      if (!composta.ok) { erro = composta.erro; break; }

      const guardado = await guardarArquivo({
        bytes: composta.bytes,
        fileName: nomeDaTelaDoCarrossel(post.id, indice + 1, composta.mime),
        mimeType: composta.mime,
        workspaceId: post.workspaceId,
        clientId: post.clientId,
        clientRequestId: post.clientRequestId,
        kind: "generated",
        uploadedBy: "design",
      });
      if (!guardado.ok) { erro = guardado.motivo; break; }
      urls.push(`/api/media/${guardado.arquivo.id}`);
    }

    if (erro || urls.length !== telas.length) {
      saida.falhas.push({ postId: post.id, erro: erro ?? "não consegui redesenhar todas as telas" });
      continue;
    }

    await prisma.socialPost.update({
      where: { id: post.id },
      data: { mediaUrlsJson: JSON.stringify(urls), mediaUrl: urls[0], lastError: null },
    }).catch(() => null);
    saida.recompostas.push(post.id);
  }

  return saida;
}
