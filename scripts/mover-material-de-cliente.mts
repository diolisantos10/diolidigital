// mover-material-de-cliente.mts — DEVOLVE ao cliente certo o material que caiu
// no cliente errado. NÃO APAGA NADA.
//
// ── POR QUE EXISTE (03/10/2026) ──────────────────────────────────────────────
// O cookie do portal do Sushi Cazza passava na frente do login da agência no
// envio de arquivo (ver `tokenDoPortalSemPassarNaFrenteDaEquipe`). Os brand
// books enviados pela tela Ativos de Marca escolhendo DDF, FOOCCI, City Jobs e
// Dioli Digital foram gravados no SUSHI CAZZA, como se ele mesmo tivesse
// mandado.
//
// ── O QUE MUDA, POR ARQUIVO ─────────────────────────────────────────────────
//   • `MediaAsset.clientId` → o cliente certo; `uploadedBy` → "equipe" (foi a
//     equipe que mandou, não o cliente);
//   • `DriveMaterial.clientId` → o cliente certo (a linha que faz o arquivo
//     aparecer em "Ativos de Marca");
//   • `BrainArtifact` da leitura do brand book (canvasId = id do material) →
//     o cliente certo.
// Arquivo, bytes e histórico ficam onde estão. Nada é apagado.
//
// ── USO ─────────────────────────────────────────────────────────────────────
//   npx tsx --env-file=.env scripts/mover-material-de-cliente.mts            (ENSAIO: só mostra)
//   npx tsx --env-file=.env scripts/mover-material-de-cliente.mts --confirmar (aplica)
//
// A lista abaixo é a dos envios de 03/10/2026. Arquivo que não for achado no
// cliente de origem é PULADO e relatado — nunca adivinhado.

import { prisma } from "@/lib/db/client";

const ORIGEM = "Sushi Cazza";

/** arquivo enviado → nome do cliente escolhido na tela. */
const DESTINOS: Array<{ arquivo: string; cliente: string }> = [
  { arquivo: "DDF_Branding_Book.pdf", cliente: "DDF" },
  { arquivo: "CityJobs_Brand_Book_v1.pdf", cliente: "City Jobs" },
  { arquivo: "Dioli_Digital_Brand_Book_v1_10_slides_com_capa.pdf", cliente: "Dioli Digital" },
  { arquivo: "Foocci_Master_Brand_Book_v1_FINAL_PPTX.pdf", cliente: "FOOCCI" },
  // "Brand_Book_Sushi_Cazza_v0_2.pdf" é do próprio Sushi Cazza: fica onde está.
];

const confirmar = process.argv.includes("--confirmar");

function mesmoNome(a: string, b: string): boolean {
  const n = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  return n(a) === n(b);
}

async function main(): Promise<void> {
  const clientes = await prisma.client.findMany({ select: { id: true, name: true, workspaceId: true } });
  const origens = clientes.filter((c) => mesmoNome(c.name, ORIGEM));
  if (origens.length !== 1) {
    console.log(`⛔ Esperava 1 cliente "${ORIGEM}", achei ${origens.length}. Nada feito.`);
    return;
  }
  const origem = origens[0]!;
  console.log(`${confirmar ? "APLICANDO" : "ENSAIO (nada é gravado)"} — origem: ${origem.name} (${origem.id})\n`);

  for (const d of DESTINOS) {
    const destinos = clientes.filter((c) => c.workspaceId === origem.workspaceId && mesmoNome(c.name, d.cliente));
    if (destinos.length !== 1) {
      console.log(`⏭  ${d.arquivo}: esperava 1 cliente "${d.cliente}", achei ${destinos.length} — pulado.`);
      continue;
    }
    const destino = destinos[0]!;
    const assets = await prisma.mediaAsset.findMany({
      where: { clientId: origem.id, fileName: d.arquivo },
      select: { id: true, createdAt: true },
    });
    if (assets.length === 0) {
      console.log(`⏭  ${d.arquivo}: não está no ${origem.name} — pulado.`);
      continue;
    }
    for (const a of assets) {
      const materiais = await prisma.driveMaterial.findMany({
        where: { clientId: origem.id, mediaAssetId: a.id },
        select: { id: true },
      });
      const artefatos = await prisma.brainArtifact.count({
        where: { clientId: origem.id, canvasId: { in: materiais.map((m) => m.id) } },
      });
      console.log(
        `→ ${d.arquivo} (${a.id}, ${a.createdAt.toISOString()}): ${origem.name} → ${destino.name} · ` +
          `${materiais.length} material(is) · ${artefatos} leitura(s) de brand book`,
      );
      if (!confirmar) continue;
      await prisma.$transaction([
        prisma.mediaAsset.update({ where: { id: a.id }, data: { clientId: destino.id, uploadedBy: "equipe" } }),
        prisma.driveMaterial.updateMany({
          where: { clientId: origem.id, mediaAssetId: a.id },
          data: { clientId: destino.id },
        }),
        prisma.brainArtifact.updateMany({
          where: { clientId: origem.id, canvasId: { in: materiais.map((m) => m.id) } },
          data: { clientId: destino.id },
        }),
      ]);
    }
  }
  if (!confirmar) console.log("\nNada foi gravado. Rode de novo com --confirmar para aplicar.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
