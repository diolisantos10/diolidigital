// A ORIGEM DO MATERIAL — o arquivo enviado pelo portal CHEGA NA PEÇA.
//
// ── O DEFEITO QUE ESTE ARQUIVO TRAVA (08/08/2026) ──────────────────────────
//
// O portal tinha, desde 02/08, uma tela de arrastar e soltar que funcionava:
// guardava o `MediaAsset`, fechava o `MaterialRequest`, destravava a esteira e
// avisava a equipe. E o arquivo NUNCA chegava na peça — `materiaisDeMarca()`, a
// única porta de material para dentro de uma arte, só enxergava o que veio do
// Picker do Google, exigindo conexão viva.
//
// Resultado prático: o CEO arrastava o logo, o sistema dizia "recebido", e a
// peça continuava saindo com o nome do cliente escrito em fonte comum — com o
// arquivo real já gravado no volume.
//
// ── AS TRÊS METADES ────────────────────────────────────────────────────────
//
//  ✅ COM arquivo enviado e papel declarado → ele aparece em `materiaisDeMarca()`
//     e `logoDoCliente()` o devolve. Provado contra BANCO REAL, não mock.
//  ⛔ SEM papel declarado → NADA é gravado e NENHUM material fantasma aparece.
//     O arquivo não se perde; ele só não entra em peça sem alguém dizer o que é.
//  🔑 E A QUE QUASE NINGUÉM TESTA: material `envio_direto` continua valendo com
//     o Google DESCONECTADO — sem conexão nenhuma, com conexão revogada e com
//     conexão expirada. É o ponto inteiro da mudança. No mesmo banco, no mesmo
//     instante, o material de origem `drive` é RECUSADO — que prova que a trava
//     do Google não foi afrouxada de carona.

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";

// O caminho do banco precisa estar no ambiente ANTES de qualquer import ser
// avaliado — o cliente Prisma lê DATABASE_URL na criação.
const DB_PATH = vi.hoisted(() => {
  const caminho = `${process.cwd()}/prisma/origem-material-e2e.db`;
  process.env.DATABASE_URL = `file:${caminho}`;
  return caminho;
});

import { prisma } from "@/lib/db/client";
import {
  registrarMaterialEnviado,
  materiaisDeMarca,
  logoDoCliente,
  fotosReaisDoCliente,
} from "@/lib/agency/esteira/material-do-drive";
import {
  materialAutorizado,
  ESCOPO_DRIVE,
  origemValida,
} from "@/lib/integrations/google/escolha-de-material";

let workspaceId = "";
let clientId = "";

/** Os bytes REAIS do logo que o cliente arrastou no portal. */
const BYTES_DO_LOGO = Buffer.from("PNG-DO-LOGO-QUE-O-CLIENTE-ARRASTOU-NO-PORTAL");

async function guardarAsset(fileName: string, mimeType: string, bytes: Buffer) {
  return prisma.mediaAsset.create({
    data: {
      workspaceId, clientId, kind: "inbound",
      fileName, mimeType, sizeBytes: bytes.length,
      sha256: `sha-${fileName}`, storagePath: `/vol/media/${fileName}`,
      uploadedBy: "cliente",
    },
  });
}

beforeAll(async () => {
  if (existsSync(DB_PATH)) rmSync(DB_PATH);
  execSync("npx prisma db push --accept-data-loss", {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: `file:${DB_PATH}` },
    stdio: "pipe",
  });

  const ws = await prisma.agencyWorkspace.create({
    data: { name: "Dioli Agência", slug: `origem-${Date.now()}` },
  });
  workspaceId = ws.id;

  const cliente = await prisma.client.create({
    data: { workspaceId, name: "Foocci", industry: "Tecnologia" },
  });
  clientId = cliente.id;
});

afterAll(async () => {
  await prisma.$disconnect().catch(() => {});
  if (existsSync(DB_PATH)) rmSync(DB_PATH);
});

describe("a trava, sem banco: a origem decide de quem depende o acesso", () => {
  const SEM_PAPEL = { fileId: "f1", nome: "IMG_2831.jpg", ehPasta: false, papel: null, papelConfirmadoEm: null };
  const COM_PAPEL = { fileId: "f1", nome: "logo.png", ehPasta: false, papel: "logo", papelConfirmadoEm: new Date() };

  it("🔑 envio_direto é autorizado SEM conexão nenhuma com o Google", () => {
    const v = materialAutorizado(null, { ...COM_PAPEL, origem: "envio_direto" });
    expect(v.pode).toBe(true);
    expect(v.papel).toBe("logo");
  });

  it("🔑 envio_direto sobrevive à conexão REVOGADA e à EXPIRADA", () => {
    const revogada = { status: "revoked", escopos: ESCOPO_DRIVE, tokenExpiresAt: null, temRefresh: false };
    const expirada = { status: "expired", escopos: ESCOPO_DRIVE, tokenExpiresAt: new Date(0), temRefresh: false };
    expect(materialAutorizado(revogada, { ...COM_PAPEL, origem: "envio_direto" }).pode).toBe(true);
    expect(materialAutorizado(expirada, { ...COM_PAPEL, origem: "envio_direto" }).pode).toBe(true);
  });

  it("⛔ a OUTRA metade: a trava do Google NÃO foi afrouxada — origem drive continua recusada", () => {
    // Mesmo material, mesmo papel, mesma conexão morta. Só a origem muda.
    expect(materialAutorizado(null, { ...COM_PAPEL, origem: "drive" }).motivo).toBe("sem_conexao");
    expect(materialAutorizado(null, COM_PAPEL).motivo).toBe("sem_conexao"); // origem ausente = drive
    const semEscopo = { status: "connected", escopos: "", tokenExpiresAt: null, temRefresh: true };
    expect(materialAutorizado(semEscopo, { ...COM_PAPEL, origem: "drive" }).motivo).toBe("escopo_insuficiente");
  });

  it("⛔ papel não declarado é recusado NAS DUAS origens — envio direto não compra isenção", () => {
    expect(materialAutorizado(null, { ...SEM_PAPEL, origem: "envio_direto" }).motivo).toBe("papel_nao_declarado");
    const viva = { status: "connected", escopos: ESCOPO_DRIVE, tokenExpiresAt: new Date(Date.now() + 3.6e6), temRefresh: true };
    expect(materialAutorizado(viva, { ...SEM_PAPEL, origem: "drive" }).motivo).toBe("papel_nao_declarado");
  });

  it("origem desconhecida cai no lado ESTRITO (drive), nunca no permissivo", () => {
    expect(origemValida("qualquer_coisa")).toBe("drive");
    expect(origemValida(null)).toBe("drive");
    expect(origemValida("envio_direto")).toBe("envio_direto");
    // A prova que importa: uma origem inventada NÃO dispensa a conexão.
    expect(materialAutorizado(null, { ...COM_PAPEL, origem: "hackeado" }).motivo).toBe("sem_conexao");
  });
});

describe("contra BANCO REAL: o arquivo do portal chega na peça", () => {
  it("⛔ sem papel declarado NÃO grava material e NENHUM fantasma aparece", async () => {
    const asset = await guardarAsset("IMG_2831.jpg", "image/jpeg", Buffer.from("foto-sem-historia"));

    const r = await registrarMaterialEnviado({
      workspaceId, clientId, mediaAssetId: asset.id,
      fileName: asset.fileName, mimeType: asset.mimeType,
      papel: null,
    });

    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/não sabemos o que é/i);

    // NADA foi gravado — nem uma linha "pendente" que alguém pudesse confundir
    // com material.
    expect(await prisma.driveMaterial.count({ where: { clientId } })).toBe(0);
    // E a peça continua sem enxergar nada. Ausência de informação não virou
    // informação.
    expect(await materiaisDeMarca(clientId)).toEqual([]);
    expect(await logoDoCliente(clientId)).toBeNull();

    // O ARQUIVO NÃO SE PERDEU: ele continua guardado, esperando alguém dizer o
    // que é. Recusar o material não pode apagar o que o cliente mandou.
    expect(await prisma.mediaAsset.findUnique({ where: { id: asset.id } })).not.toBeNull();
  });

  it("✅ com papel declarado, o logo enviado pelo portal ENTRA na peça — e o Google está DESCONECTADO", async () => {
    // Nenhuma GoogleDriveConnection existe para este cliente. É o caso real da
    // maioria: cliente que nunca conectou o Drive.
    expect(await prisma.googleDriveConnection.count({ where: { clientId } })).toBe(0);

    const asset = await guardarAsset("logo-foocci.png", "image/png", BYTES_DO_LOGO);
    const r = await registrarMaterialEnviado({
      workspaceId, clientId, mediaAssetId: asset.id,
      fileName: asset.fileName, mimeType: asset.mimeType,
      tamanhoBytes: BYTES_DO_LOGO.length,
      papel: "logo",
    });
    expect(r.ok).toBe(true);
    expect(r.papel).toBe("logo");

    // A linha nasceu com a origem CERTA e SEM conexão — o modelo não foi
    // escondido dentro de uma string.
    const linha = await prisma.driveMaterial.findFirstOrThrow({ where: { mediaAssetId: asset.id } });
    expect(linha.origem).toBe("envio_direto");
    expect(linha.connectionId).toBeNull();
    expect(linha.papelConfirmadoEm).not.toBeNull();

    // ── A PROVA QUE INTERESSA: a porta da peça se abre ────────────────────
    const logo = await logoDoCliente(clientId);
    expect(logo).not.toBeNull();
    expect(logo!.mediaAssetId).toBe(asset.id);
    expect(logo!.nome).toBe("logo-foocci.png");
    // A URL que `artes.ts` usa para buscar os bytes reais no volume.
    expect(logo!.url).toBe(`/api/media/${asset.id}`);
  });

  it("✅ a foto de produto enviada pelo portal entra em fotosReaisDoCliente", async () => {
    const asset = await guardarAsset("IMG_9001.jpg", "image/jpeg", Buffer.from("foto-do-produto-real"));
    // O nome NÃO diz o que é — quem disse foi o cliente, na tela de envio.
    const r = await registrarMaterialEnviado({
      workspaceId, clientId, mediaAssetId: asset.id,
      fileName: asset.fileName, mimeType: asset.mimeType,
      papel: "foto_produto",
    });
    expect(r.ok).toBe(true);

    const fotos = await fotosReaisDoCliente(clientId);
    expect(fotos.map((f) => f.mediaAssetId)).toContain(asset.id);
  });

  it("🔑 o material do portal SOBREVIVE a uma conexão do Google revogada", async () => {
    // O cliente conecta o Drive e depois revoga. O logo que ele ARRASTOU não
    // tem nada a ver com o Google — e não pode sumir da peça por causa disso.
    await prisma.googleDriveConnection.create({
      data: {
        workspaceId, clientId, accessTokenEncrypted: "x",
        escopos: ESCOPO_DRIVE, status: "revoked",
      },
    });

    const logo = await logoDoCliente(clientId);
    expect(logo).not.toBeNull();
    expect(logo!.nome).toBe("logo-foocci.png");
  });

  it("⛔ no MESMO banco e na MESMA hora, material de origem drive É recusado pela conexão revogada", async () => {
    // Esta é a metade que impede o conserto de virar um buraco: se a trava do
    // Google tivesse sido afrouxada em vez de escopada por origem, este material
    // apareceria — e o cliente que revogou o acesso continuaria tendo os
    // arquivos dele lidos.
    const asset = await guardarAsset("do-drive.png", "image/png", Buffer.from("veio-do-google"));
    const conexao = await prisma.googleDriveConnection.findFirstOrThrow({ where: { clientId } });
    await prisma.driveMaterial.create({
      data: {
        workspaceId, clientId,
        origem: "drive",
        connectionId: conexao.id,
        fileId: "id-do-arquivo-no-google",
        nome: "do-drive.png", mimeType: "image/png",
        papel: "foto_local", papelConfirmadoEm: new Date(),
        mediaAssetId: asset.id, importadoEm: new Date(),
      },
    });

    const todos = await materiaisDeMarca(clientId);
    expect(todos.map((m) => m.nome)).not.toContain("do-drive.png");
    // …e o do portal continua lá, no mesmo resultado. As duas origens convivem
    // com réguas diferentes, que é o desenho.
    expect(todos.map((m) => m.nome)).toContain("logo-foocci.png");
  });

  it("reenviar o mesmo arquivo NÃO duplica o material da peça", async () => {
    const antes = await materiaisDeMarca(clientId);
    const asset = await prisma.mediaAsset.findFirstOrThrow({ where: { fileName: "logo-foocci.png" } });

    const r = await registrarMaterialEnviado({
      workspaceId, clientId, mediaAssetId: asset.id,
      fileName: "logo-foocci.png", mimeType: "image/png",
      papel: "logo",
    });
    expect(r.ok).toBe(true);

    const depois = await materiaisDeMarca(clientId);
    expect(depois.length).toBe(antes.length);
    expect(depois.filter((m) => m.papel === "logo").length).toBe(1);
  });

  it("⛔ arquivo sem cliente dono não vira material — não há peça em que entrar", async () => {
    const r = await registrarMaterialEnviado({
      workspaceId, clientId: null, mediaAssetId: "qualquer",
      fileName: "solto.png", mimeType: "image/png", papel: "logo",
    });
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/sem cliente dono/i);
  });
});

// ── EXISTE CHAMADOR? ────────────────────────────────────────────────────────
//
// Esta casa já pagou DUAS VEZES pelo mesmo padrão: a peça verde e a junta
// rompida. `fotosReaisDoCliente` teve teste passando por dias sem um único
// chamador em produção (07/08), e o 99Freelas tinha 113 testes verdes sobre
// código que o app nunca executava (08/08).
//
// O defeito consertado aqui é EXATAMENTE esse: `registrarMaterialEnviado` pode
// estar perfeita e o logo continuar não chegando na peça se ninguém a chamar, ou
// se a tela nunca perguntar o papel. Por isso estes testes leem o CÓDIGO-FONTE
// do caminho vivo — testar a função de novo não protegeria nada, ela já é verde.
describe("o caminho vivo, lido no fonte", () => {
  const ler = async (p: string) =>
    (await import("node:fs/promises")).readFile(`${process.cwd()}/${p}`, "utf8");

  it("POST /api/media LÊ o papel do formulário e CHAMA registrarMaterialEnviado", async () => {
    const fonte = await ler("app/api/media/route.ts");
    expect(fonte).toContain('form.get("papel")');
    expect(fonte).toContain("registrarMaterialEnviado");
  });

  it("a tela do PORTAL pergunta o papel e o MANDA junto dos bytes", async () => {
    const fonte = await ler("components/portal/EnvioDeMaterial.tsx");
    // Pergunta: existe um seletor alimentado pela lista fechada de papéis.
    expect(fonte).toContain("PAPEIS_VALIDOS");
    expect(fonte).toContain("<select");
    // E manda: sem esta linha a pergunta seria decoração.
    expect(fonte).toContain('form.append("papel"');
  });

  it("a tela do ADMIN faz o mesmo, pelo MESMO endpoint — uma implementação, não duas", async () => {
    const fonte = await ler("components/agency/clients/MaterialDeMarca.tsx");
    expect(fonte).toContain("PAPEIS_VALIDOS");
    expect(fonte).toContain('form.append("papel"');
    expect(fonte).toContain('fetch("/api/media"');
  });

  it("o cartão do Drive continua contando SÓ a origem drive", async () => {
    // Sem este filtro, um logo enviado pelo portal apagaria a frase que avisa o
    // cliente de que a Dioli não alcança nenhum arquivo do Drive dele.
    const fonte = await ler("app/api/portal/drive/route.ts");
    expect(fonte).toContain('origem: "drive"');
  });

  it("o censo NÃO se abre sozinho quando CRON_SECRET some do ambiente", async () => {
    // Rota administrativa que vira pública ao faltar a variável não tem trava —
    // é o padrão que `diagnostico-de-conexoes` já protege, e o censo lista nome
    // de arquivo de cliente pagante.
    const fonte = await ler("app/api/agency/material-de-marca/route.ts");
    expect(fonte).toContain("if (!cronSecret) return false;");
    // Comparação em tempo constante, nunca `===` com a string do segredo.
    expect(fonte).toContain("segredoConfere");
    // A porta do segredo vale SÓ para o censo; o resto exige sessão.
    expect(fonte).toContain("pediuCenso && segredoDeCronConfere(request)");
    expect(fonte).toContain("requireSession");
  });

  it("o censo é SOMENTE LEITURA — não migra, não carimba, não apaga", async () => {
    const fonte = await ler("app/api/agency/material-de-marca/route.ts");
    // Papel não declarado não se adivinha: a rota não pode gravar material por
    // conta própria a partir de um palpite de nome de arquivo.
    expect(fonte).not.toContain("driveMaterial.create");
    expect(fonte).not.toContain("driveMaterial.upsert");
    expect(fonte).not.toContain("driveMaterial.update");
    expect(fonte).not.toContain("registrarMaterialEnviado");
    // E não exporta verbo de escrita nenhum.
    expect(fonte).not.toMatch(/export async function (POST|PUT|PATCH|DELETE)/);
  });

  it("o schema guarda a origem como COLUNA, e a conexão é opcional", async () => {
    const schema = await ler("prisma/schema.prisma");
    // A origem é campo do modelo — não um prefixo escondido dentro de
    // `connectionId`, que é o atalho que a casa paga em três meses.
    expect(schema).toMatch(/origem\s+String\s+@default\("drive"\)/);
    // E `connectionId` é opcional: é o que permite material sem Google.
    expect(schema).toMatch(/connectionId\s+String\?/);
  });
});
