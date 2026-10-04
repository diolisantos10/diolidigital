// mover-material.ts — DEVOLVE ao cliente certo um arquivo que caiu no errado.
// NÃO APAGA NADA.
//
// ── POR QUE EXISTE (04/10/2026) ──────────────────────────────────────────────
// Em 03/10 quatro brand books foram gravados no Sushi Cazza por causa de um
// defeito de sessão (já consertado). Devolver cada um ao dono pedia rodar um
// script no banco de produção — e ninguém deveria precisar rodar comando para
// corrigir um arquivo no cliente errado. Esta é a mesma lógica do script
// (`scripts/mover-material-de-cliente.mts`, que agora chama daqui), atrás de
// um botão "Mover para outro cliente" na tela de Material de marca, só para
// Master.
//
// ── O QUE MUDA, NUMA TRANSAÇÃO SÓ ───────────────────────────────────────────
//   • `MediaAsset.clientId` → o destino. Se estava como enviado pelo
//     "cliente", passa a "equipe": o cliente de DESTINO não mandou o arquivo;
//   • `DriveMaterial.clientId` → o destino (é a linha que faz o arquivo
//     aparecer no Material de marca);
//   • `BrainArtifact` das leituras de brand book desse material → o destino.
// Bytes, papel, histórico: ficam. E fica o RASTRO: um evento de atividade no
// cliente de origem e outro no de destino, dizendo quem moveu o quê.

import { prisma } from "@/lib/db/client";

export type ResultadoDoMover =
  | { ok: true; arquivo: string; de: string; para: string; materiais: number; leituras: number }
  | { ok: false; status: number; erro: string };

export async function moverMaterialDeCliente(entrada: {
  workspaceId: string;
  mediaAssetId: string;
  deClientId: string;
  paraClientId: string;
  /** Quem moveu (nome ou e-mail), para o rastro. */
  quem: string;
  /** Ensaio: confere tudo e conta, sem gravar. */
  ensaio?: boolean;
}): Promise<ResultadoDoMover> {
  if (entrada.deClientId === entrada.paraClientId) {
    return { ok: false, status: 400, erro: "O arquivo já está neste cliente." };
  }
  // Os dois clientes TÊM de ser do mesmo workspace de quem pede — mover para
  // fora seria entregar o arquivo de um inquilino a outro.
  const clientes = await prisma.client.findMany({
    where: { id: { in: [entrada.deClientId, entrada.paraClientId] }, workspaceId: entrada.workspaceId },
    select: { id: true, name: true },
  });
  const de = clientes.find((c) => c.id === entrada.deClientId);
  const para = clientes.find((c) => c.id === entrada.paraClientId);
  if (!de || !para) return { ok: false, status: 404, erro: "Cliente não encontrado." };

  const asset = await prisma.mediaAsset.findFirst({
    where: { id: entrada.mediaAssetId, clientId: de.id, workspaceId: entrada.workspaceId },
    select: { id: true, fileName: true, uploadedBy: true },
  });
  if (!asset) return { ok: false, status: 404, erro: `O arquivo não está em ${de.name}.` };

  const materiais = await prisma.driveMaterial.findMany({
    where: { clientId: de.id, mediaAssetId: asset.id },
    select: { id: true },
  });
  // O destino já tem este mesmo arquivo como material? A chave única
  // (clientId, mediaAssetId) recusaria — e é sinal de algo já movido.
  const jaNoDestino = await prisma.driveMaterial.count({ where: { clientId: para.id, mediaAssetId: asset.id } });
  if (jaNoDestino > 0) return { ok: false, status: 409, erro: `${para.name} já tem este arquivo.` };

  const idsDosMateriais = materiais.map((m) => m.id);
  const leituras = idsDosMateriais.length
    ? await prisma.brainArtifact.count({ where: { clientId: de.id, canvasId: { in: idsDosMateriais } } })
    : 0;

  const resumo = { ok: true as const, arquivo: asset.fileName, de: de.name, para: para.name, materiais: materiais.length, leituras };
  if (entrada.ensaio) return resumo;

  const recado = `"${asset.fileName}" movido de ${de.name} para ${para.name} por ${entrada.quem}.`;
  await prisma.$transaction([
    prisma.mediaAsset.update({
      where: { id: asset.id },
      data: { clientId: para.id, ...(asset.uploadedBy === "cliente" ? { uploadedBy: "equipe" } : {}) },
    }),
    prisma.driveMaterial.updateMany({ where: { clientId: de.id, mediaAssetId: asset.id }, data: { clientId: para.id } }),
    prisma.brainArtifact.updateMany({
      where: { clientId: de.id, canvasId: { in: idsDosMateriais } },
      data: { clientId: para.id },
    }),
    prisma.activityEvent.create({
      data: { workspaceId: entrada.workspaceId, clientId: de.id, type: "material_movido", message: recado },
    }),
    prisma.activityEvent.create({
      data: { workspaceId: entrada.workspaceId, clientId: para.id, type: "material_movido", message: recado },
    }),
  ]);
  return resumo;
}
