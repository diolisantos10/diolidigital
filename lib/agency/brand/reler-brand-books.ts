// reler-brand-books.ts — RELÊ os brand books que já estão guardados.
//
// ── POR QUE EXISTE (CEO, 04/10/2026) ─────────────────────────────────────────
// Os brand books chegaram antes da IA: ficaram guardados com a leitura em
// "aguardando a IA da Control Room". Quando o cofre liga, ninguém vai
// reenviar arquivo — o botão relê o que JÁ está no disco, pelo mesmo caminho
// do envio (`lerBrandBookRecebido`). Nada novo é gravado na ficha: a leitura
// continua sendo SUGESTÃO para revisar.
//
// Relê só o que precisa: leitura com erro, ou nunca lida. O que está
// "analisando" ou "aguardando revisão" fica como está — reler isso pagaria de
// novo por uma resposta que já existe.

import { prisma } from "@/lib/db/client";
import { lerArquivo } from "@/lib/agency/media/armazenamento";
import { lerBrandBookRecebido } from "@/lib/agency/brand/brand-book-recebido";
import { DEPARTAMENTO_DO_BRAND_BOOK } from "@/lib/agency/brand/materiais-da-marca";

export interface PlanoDeReleitura {
  relidos: string[];
  pulados: Array<{ arquivo: string; motivo: string }>;
}

/**
 * Monta a lista e DISPARA as leituras em fila (uma de cada vez, sem segurar
 * quem chamou: cada leitura leva até 90 s). Devolve o que vai ser relido e o
 * que foi pulado, com o porquê.
 */
export async function relerBrandBooksGuardados(entrada: {
  workspaceId: string;
  clientId: string;
}): Promise<PlanoDeReleitura> {
  const materiais = await prisma.driveMaterial.findMany({
    where: { clientId: entrada.clientId, workspaceId: entrada.workspaceId, papel: "manual_de_marca", mediaAssetId: { not: null } },
    select: { id: true, nome: true, mediaAssetId: true },
  });

  const plano: PlanoDeReleitura = { relidos: [], pulados: [] };
  const fila: Array<{ materialId: string; arquivo: string; bytes: Buffer; mimeType: string }> = [];

  for (const m of materiais) {
    const ultima = await prisma.brainArtifact.findFirst({
      where: { clientId: entrada.clientId, department: DEPARTAMENTO_DO_BRAND_BOOK, canvasId: m.id },
      orderBy: { createdAt: "desc" },
      select: { status: true },
    });
    const nome = m.nome || "brand book";
    if (ultima && ultima.status !== "erro") {
      plano.pulados.push({ arquivo: nome, motivo: ultima.status === "analisando" ? "já está sendo lido" : "já foi lido — sugestões esperando revisão" });
      continue;
    }
    const asset = await prisma.mediaAsset.findFirst({
      where: { id: m.mediaAssetId!, clientId: entrada.clientId },
      select: { storagePath: true, mimeType: true, fileName: true },
    });
    const bytes = asset ? await lerArquivo(asset.storagePath) : null;
    if (!asset || !bytes) {
      plano.pulados.push({ arquivo: nome, motivo: "o arquivo não está mais no disco — precisa ser enviado de novo" });
      continue;
    }
    fila.push({ materialId: m.id, arquivo: asset.fileName || nome, bytes, mimeType: asset.mimeType });
    plano.relidos.push(asset.fileName || nome);
  }

  // Uma de cada vez: N leituras em paralelo seriam N chamadas pagas ao mesmo
  // tempo no gateway, por um clique.
  void (async () => {
    for (const f of fila) {
      await lerBrandBookRecebido({ workspaceId: entrada.workspaceId, clientId: entrada.clientId, ...f })
        .catch((e) => console.error("[reler-brand-books] leitura falhou", e instanceof Error ? e.message : e));
    }
  })();

  return plano;
}
