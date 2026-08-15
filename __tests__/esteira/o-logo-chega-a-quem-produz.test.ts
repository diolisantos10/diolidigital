// O LOGO DO CLIENTE CHEGA A QUEM PRODUZ A PEÇA — a volta inteira, sem mock.
//
// ── POR QUE ESTE ARQUIVO, SE JÁ HAVIA DOIS TESTES DESTE CAMINHO ────────────
//
// Porque os dois existentes NUNCA SE TOCAM, e o vão entre eles é exatamente a
// pergunta do CEO ("o arquivo enviado aparece do outro lado?"):
//
//   • `__tests__/esteira/origem-do-material.test.ts` prova, contra banco real,
//     que o envio do portal vira material e que `logoDoCliente()` o devolve.
//     Ele PARA em `logoDoCliente`.
//   • `__tests__/execution/material-do-drive-chega-na-peca.test.ts` prova que
//     `produzirArtesPendentes` chama `logoDoCliente`. Ele MOCKA `logoDoCliente`
//     (`const logoDoCliente = vi.fn()`), então nunca toca no banco nem no disco.
//
// Dois testes verdes, um de cada lado da junta, e ninguém atravessando. É a
// mesma forma da "peça verde, junta rompida" que esta casa já pagou. O próprio
// `docs/pendencias.md` registra a lacuna com todas as letras: *"a prova aqui vai
// até `logoDoCliente()` devolver os bytes certos — o elo seguinte (`artes.ts`
// desenhar o arquivo na peça) não foi exercitado com material de origem
// `envio_direto`"*.
//
// ── O QUE ESTE TESTE FAZ, E É LITERAL ──────────────────────────────────────
//
// Um cliente DE TESTE envia um arquivo, DECLARA que ele é o logo, e a prova é
// que quem produz a peça recebe **os mesmos bytes**. Sem mock em nenhum elo:
// banco SQLite de verdade, arquivo gravado no disco de verdade, e `lerMarca` —
// a função que `artes.ts` usa para montar o molde de toda peça — lida como o
// código de produção a lê.
//
// A metade negativa importa tanto quanto: SEM logo declarado, a peça NÃO sai
// com um logo inventado — ela sai declarando a falta em `molde.lacunas`, que é
// o que faz o nome do cliente aparecer em fonte comum de forma DECLARADA, não
// silenciosa.

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";

// O caminho do banco e a raiz da mídia precisam existir no ambiente ANTES de
// qualquer import ser avaliado — o cliente Prisma lê DATABASE_URL na criação, e
// `raizDaMidia()` lê RAILWAY_VOLUME_MOUNT_PATH.
const DB_PATH = vi.hoisted(() => {
  const caminho = `${process.cwd()}/prisma/logo-ate-a-peca-e2e.db`;
  process.env.DATABASE_URL = `file:${caminho}`;
  return caminho;
});
const VOLUME = vi.hoisted(() => {
  // Sem `import` aqui de propósito: `vi.hoisted` corre ANTES dos imports do
  // módulo, e usar `path`/`os` daqui explode com "cannot access before
  // initialization". Caminho montado à mão, dentro do repositório.
  const dir = `${process.cwd()}/prisma/logo-ate-a-peca-midia`;
  process.env.RAILWAY_VOLUME_MOUNT_PATH = dir;
  return dir;
});

import { prisma } from "@/lib/db/client";
import { guardarArquivo } from "@/lib/agency/media/armazenamento";
import { registrarMaterialEnviado, logoDoCliente } from "@/lib/agency/esteira/material-do-drive";
import { lerMarca } from "@/lib/agency/execution/artes";
import { LACUNA_DO_LOGO } from "@/lib/agency/design/molde";

let workspaceId = "";
/** O cliente de TESTE. Nunca um cliente real — regra da casa. */
let clientId = "";
let clientIdSemLogo = "";

/** Um PNG mínimo, mas de verdade: cabeçalho PNG + carga reconhecível. O que
 *  importa é que os MESMOS bytes tenham de reaparecer do outro lado. */
const BYTES_DO_LOGO = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from("LOGO-OFICIAL-DO-CLIENTE-DE-TESTE-15-08-2026"),
]);

beforeAll(async () => {
  if (existsSync(DB_PATH)) rmSync(DB_PATH);
  execSync("npx prisma db push --accept-data-loss", {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: `file:${DB_PATH}` },
    stdio: "pipe",
  });

  const ws = await prisma.agencyWorkspace.create({
    data: { name: "Dioli Agência (teste)", slug: `logo-e2e-${Date.now()}` },
  });
  workspaceId = ws.id;

  const cliente = await prisma.client.create({
    data: { workspaceId, name: "Cliente De Teste", industry: "Tecnologia" },
  });
  clientId = cliente.id;

  const semLogo = await prisma.client.create({
    data: { workspaceId, name: "Cliente Sem Logo", industry: "Tecnologia" },
  });
  clientIdSemLogo = semLogo.id;
}, 120_000);

afterAll(async () => {
  await prisma.$disconnect().catch(() => {});
  if (existsSync(DB_PATH)) rmSync(DB_PATH);
  if (existsSync(VOLUME)) rmSync(VOLUME, { recursive: true, force: true });
});

describe("a seta que o CEO diz faltar: do envio até quem produz a peça", () => {
  it("✅ o cliente envia, DECLARA que é o logo, e o produtor recebe OS MESMOS BYTES", async () => {
    // ── 1. O ENVIO. É o que `POST /api/media` faz com o arquivo arrastado no
    // portal: grava os bytes no volume e cria o `MediaAsset`.
    const guardado = await guardarArquivo({
      bytes: BYTES_DO_LOGO,
      fileName: "logo-oficial.png",
      mimeType: "image/png",
      workspaceId,
      clientId,
      kind: "inbound",
      uploadedBy: "cliente (portal)",
    });
    expect(guardado.ok, `o arquivo não foi guardado: ${!guardado.ok ? guardado.motivo : ""}`).toBe(true);
    if (!guardado.ok) return;

    // ── 2. A DECLARAÇÃO. "o que é este arquivo?" — respondida por quem enviou,
    // no seletor de papel da própria tela de envio. Sem ela não há material.
    const registro = await registrarMaterialEnviado({
      workspaceId,
      clientId,
      mediaAssetId: guardado.arquivo.id,
      fileName: guardado.arquivo.fileName,
      mimeType: guardado.arquivo.mimeType,
      tamanhoBytes: BYTES_DO_LOGO.length,
      papel: "logo",
    });
    expect(registro.ok, registro.erro ?? "").toBe(true);

    // ── 3. O ELO JÁ PROVADO por `origem-do-material.test.ts` — repetido aqui
    // como âncora: se ele quebrar, o teste seguinte quebra por outro motivo e
    // o diagnóstico fica ambíguo.
    const oficial = await logoDoCliente(clientId);
    expect(oficial?.mediaAssetId).toBe(guardado.arquivo.id);

    // ── 4. O ELO QUE NUNCA TINHA SIDO EXERCITADO ──────────────────────────
    // `lerMarca` é a função que `artes.ts` chama para montar o molde de TODA
    // peça. É literalmente "quem produz a peça".
    const marca = await lerMarca(clientId);

    expect(marca.molde.logo, "o produtor da peça NÃO recebeu o logo — a seta está rompida").not.toBeNull();

    // A prova por BYTES, não por "veio alguma coisa": o data URL que entra no
    // documento tem de carregar exatamente o arquivo que o cliente mandou. Um
    // logo trocado passaria por qualquer asserção mais fraca que esta.
    const esperado = `data:image/png;base64,${BYTES_DO_LOGO.toString("base64")}`;
    expect(marca.molde.logo!.dataUrl).toBe(esperado);

    // E a falta do logo NÃO pode continuar declarada quando o logo existe —
    // era assim que a peça saía com o nome em fonte comum tendo o arquivo.
    expect(marca.molde.lacunas).not.toContain(LACUNA_DO_LOGO);
  }, 60_000);

  it("⛔ a outra metade: SEM logo declarado, nada é inventado — a falta é DECLARADA", async () => {
    const marca = await lerMarca(clientIdSemLogo);

    expect(marca.molde.logo, "apareceu um logo para um cliente que nunca mandou nenhum").toBeNull();
    // Silencioso seria o defeito. `LACUNA_DO_LOGO` é o que faz a ausência ser
    // um fato registrado na peça, e não uma peça que "ficou assim".
    expect(marca.molde.lacunas).toContain(LACUNA_DO_LOGO);
  }, 30_000);

  it("⛔ arquivo SEM papel declarado não vira logo de ninguém", async () => {
    const guardado = await guardarArquivo({
      bytes: Buffer.from("IMG_2831-sem-historia"),
      fileName: "IMG_2831.jpg",
      mimeType: "image/jpeg",
      workspaceId,
      clientId: clientIdSemLogo,
      kind: "inbound",
      uploadedBy: "cliente (portal)",
    });
    expect(guardado.ok).toBe(true);
    if (!guardado.ok) return;

    const registro = await registrarMaterialEnviado({
      workspaceId,
      clientId: clientIdSemLogo,
      mediaAssetId: guardado.arquivo.id,
      fileName: guardado.arquivo.fileName,
      mimeType: guardado.arquivo.mimeType,
      papel: null,
    });
    expect(registro.ok).toBe(false);

    // E o produtor continua sem logo: o arquivo existe no disco e NÃO entra em
    // peça nenhuma. "Ausência de informação não é informação."
    const marca = await lerMarca(clientIdSemLogo);
    expect(marca.molde.logo).toBeNull();
  }, 30_000);
});
