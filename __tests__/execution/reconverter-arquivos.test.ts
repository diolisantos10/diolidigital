// A PASSADA QUE TROCA SÓ O CONTÊINER — e o que ela tem PROIBIDO de tocar.
//
// ── POR QUE ESTE ARQUIVO EXISTE (14/08/2026) ────────────────────────────────
//
// Duas passadas contra produção pelo botão à mão:
//
//   • `?modo=formato-recusado` → 0. As 6 peças do CityJobs são CARROSSÉIS, e
//     aquele modo lê `mediaUrl` (peça única).
//   • `?modo=carrossel&limite=6` → achou as 6 e FALHOU nas 6, sem `semFundo`.
//
// O modo `carrossel` REDESENHA cada tela, e redesenhar cobra em duas moedas:
// precisa do roteiro (`scenesJson`) e troca os pixels de uma peça cuja
// aprovação está presa ao POST, não ao arquivo (`esteira/aprovacao-da-peca.ts`,
// ordem do CEO de 14/08). O cliente passaria a ter aprovado uma imagem que
// nunca viu — que é um problema pior que o formato.
//
// Esta passada faz o mínimo que resolve o medido: mesmos pixels, contêiner
// novo. E "o mínimo" é uma afirmação que só vale medida — por isso os testes
// abaixo cobram tanto o que ela FAZ quanto o que ela tem de NÃO tocar.

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  socialPost: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
  mediaAsset: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  client: { findUnique: vi.fn() },
  driveMaterial: { findMany: vi.fn() },
}));
const guardarArquivo = vi.hoisted(() => vi.fn());
const lerArquivo = vi.hoisted(() => vi.fn());
const generateDesign = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/agency/media/armazenamento", () => ({ guardarArquivo, lerArquivo }));
vi.mock("@/lib/ai/design-engine", () => ({ generateDesign }));
vi.mock("@/lib/agency/esteira/material-do-drive", () => ({
  logoDoCliente: async () => null,
  fotosReaisDoCliente: async () => [],
}));

import fs from "node:fs";
import path from "node:path";

import { reconverterArquivosParaJpeg } from "@/lib/agency/execution/reconverter-arquivos";
import { ehJpeg, ehPng } from "@/lib/agency/media/para-jpeg";

/** Um PNG REAL de 12×9. É o que o rasterizador antigo deixou nos posts. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAwAAAAJCAIAAACJ2loDAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAFElEQVR4nGM4oWFDEDGMKmIgJggAkdN+kQD3XuYAAAAASUVORK5CYII=",
  "base64",
);
const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a" +
    "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA" +
    "AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
  "base64",
);

const TELAS = ["m1", "m2", "m3", "m4", "m5", "m6"];

const CARROSSEL = {
  id: "sp_cj",
  workspaceId: "ws1",
  clientId: "cli_cityjobs",
  clientRequestId: null,
  caption: "Vaga validada por gente da região",
  pillar: "Comunidade",
  format: "carousel",
  mediaUrl: "/api/media/m1",
  mediaUrlsJson: JSON.stringify(TELAS.map((id) => `/api/media/${id}`)),
  // O ponto do despacho: NENHUM roteiro. É o que faz `recomporCarrosseis`
  // parar antes de tocar em arquivo — e o que esta passada não precisa ter.
  scenesJson: null,
  scheduledFor: new Date("2026-08-20T12:00:00.000Z"),
  status: "scheduled",
  lastError: "algo que aconteceu antes e continua sendo verdade",
};

/** O banco de mídia de mentira. */
const banco = new Map<string, { mimeType: string; storagePath: string; workspaceId: string }>();
/** O disco de mentira. */
const disco = new Map<string, Buffer>();
/** O que a passada MANDOU guardar. */
const guardados = new Map<string, { fileName: string; mimeType: string; bytes: Buffer }>();

function povoarTelas(mime = "image/png", bytes = PNG): void {
  for (const id of TELAS) {
    banco.set(id, { mimeType: mime, storagePath: `/disco/${id}`, workspaceId: "ws1" });
    disco.set(`/disco/${id}`, bytes);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  banco.clear();
  disco.clear();
  guardados.clear();
  povoarTelas();

  db.socialPost.findMany.mockImplementation(async (args: { where?: { format?: { in?: string[]; notIn?: string[] } } }) => {
    // A seleção pergunta duas vezes: os carrosséis (`in`) e as peças únicas
    // (`notIn`). Responder a mesma coisa às duas faria o teste provar o que não
    // é — um carrossel entrando também pela porta da peça única.
    const f = args?.where?.format;
    if (f?.in) return [{ ...CARROSSEL }];
    return [];
  });
  db.socialPost.findUnique.mockResolvedValue({ ...CARROSSEL });
  db.socialPost.update.mockResolvedValue({});
  db.mediaAsset.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const l = banco.get(where.id);
    return l ? { id: where.id, ...l } : null;
  });
  db.mediaAsset.findFirst.mockResolvedValue(null);
  db.client.findUnique.mockResolvedValue({ name: "CityJobs", industry: "Vagas", brandBrain: null });
  db.driveMaterial.findMany.mockResolvedValue([]);

  lerArquivo.mockImplementation(async (caminho: string) => disco.get(caminho) ?? null);

  let n = 0;
  guardarArquivo.mockImplementation(async (i: { bytes: Buffer; fileName: string; mimeType: string }) => {
    const id = `novo_${++n}`;
    guardados.set(id, { fileName: i.fileName, mimeType: i.mimeType, bytes: Buffer.from(i.bytes) });
    banco.set(id, { mimeType: i.mimeType, storagePath: `/disco/${id}`, workspaceId: "ws1" });
    return {
      ok: true,
      arquivo: { id, fileName: i.fileName, mimeType: i.mimeType, sizeBytes: i.bytes.length, url: `/api/media/${id}` },
    };
  });
});

/** O que o post recebeu na última escrita. */
function escritaNoPost(): Record<string, unknown> {
  const chamada = db.socialPost.update.mock.calls.at(-1);
  if (!chamada) throw new Error("a passada não gravou nada no post");
  return (chamada[0] as { data: Record<string, unknown> }).data;
}

describe("o carrossel de 6 telas em PNG — sem roteiro, e mesmo assim consertado", () => {
  it("converte as SEIS telas, mesmo com `scenesJson` vazio", async () => {
    const r = await reconverterArquivosParaJpeg(20);

    expect(r.falhas, JSON.stringify(r.falhas)).toEqual([]);
    expect(r.convertidas).toEqual(["sp_cj"]);
    expect(r.arquivosNovos).toBe(6);
    // A evidência de qual ferramenta atendeu — é ela que diz, em produção, se
    // o `sharp` transitivo chegou ao contêiner ou se o rasterizador assumiu.
    expect(r.caminhos.length).toBe(1);
  });

  it("as seis viram JPEG DE VERDADE, e o nome do arquivo não mente", async () => {
    await reconverterArquivosParaJpeg(20);
    expect(guardados.size).toBe(6);
    let n = 0;
    for (const [, arq] of guardados) {
      n++;
      expect(arq.mimeType).toBe("image/jpeg");
      expect(ehJpeg(arq.bytes), `tela ${arq.fileName} não é JPEG nos bytes`).toBe(true);
      expect(ehPng(arq.bytes)).toBe(false);
      expect(arq.fileName).toBe(`carrossel-sp_cj-${n}.jpg`);
    }
  });

  it("a ORDEM das telas é preservada — carrossel fora de ordem é outra peça", async () => {
    await reconverterArquivosParaJpeg(20);
    const data = escritaNoPost();
    const urls = JSON.parse(String(data.mediaUrlsJson)) as string[];
    expect(urls).toHaveLength(6);
    // A tela N do post tem de ser a tela N do arquivo novo.
    urls.forEach((u, i) => {
      const id = u.replace("/api/media/", "");
      expect(guardados.get(id)!.fileName).toBe(`carrossel-sp_cj-${i + 1}.jpg`);
    });
    expect(data.mediaUrl).toBe(urls[0]);
  });
});

describe("a escrita é MÍNIMA — reconverter não é reagendar, e muito menos publicar", () => {
  it("o post recebe EXATAMENTE `mediaUrlsJson` e `mediaUrl`, e nada mais", async () => {
    await reconverterArquivosParaJpeg(20);
    expect(Object.keys(escritaNoPost()).sort()).toEqual(["mediaUrl", "mediaUrlsJson"]);
  });

  it("`scheduledFor` e `status` não aparecem: a data marcada não é tocada", async () => {
    await reconverterArquivosParaJpeg(20);
    const data = escritaNoPost();
    expect(data).not.toHaveProperty("scheduledFor");
    expect(data).not.toHaveProperty("status");
  });

  it("`lastError` NÃO é apagado — ele é a única testemunha de um defeito que esta passada não trata", async () => {
    await reconverterArquivosParaJpeg(20);
    expect(escritaNoPost()).not.toHaveProperty("lastError");
  });
});

describe("idempotência: apertar o botão duas vezes não pode sujar nada", () => {
  it("tela que JÁ é JPEG mantém o arquivo que está lá — nenhum id novo, nenhuma cota gasta", async () => {
    banco.set("m3", { mimeType: "image/jpeg", storagePath: "/disco/m3", workspaceId: "ws1" });
    disco.set("/disco/m3", JPEG);

    const r = await reconverterArquivosParaJpeg(20);
    expect(r.arquivosNovos).toBe(5);

    const urls = JSON.parse(String(escritaNoPost().mediaUrlsJson)) as string[];
    expect(urls[2], "a tela que já estava certa foi regravada à toa").toBe("/api/media/m3");
  });
});

describe("tudo ou nada — meia sequência é pior que nenhuma", () => {
  it("uma tela ilegível trava o post inteiro, e NADA é gravado", async () => {
    disco.delete("/disco/m5");

    const r = await reconverterArquivosParaJpeg(20);
    expect(r.convertidas).toEqual([]);
    expect(r.semArquivo).toEqual(["sp_cj"]);
    expect(db.socialPost.update).not.toHaveBeenCalled();
  });

  it("tela de OUTRO workspace não é convertida — conserto não atravessa inquilino", async () => {
    banco.set("m2", { mimeType: "image/png", storagePath: "/disco/m2", workspaceId: "ws_de_outro" });

    const r = await reconverterArquivosParaJpeg(20);
    expect(r.convertidas).toEqual([]);
    expect(r.falhas[0]?.erro).toContain("outro workspace");
    expect(db.socialPost.update).not.toHaveBeenCalled();
  });
});

describe("as travas da casa continuam valendo nesta porta", () => {
  it("pilar bloqueado não recebe trabalho — não se dá acabamento no que não pode sair", async () => {
    db.socialPost.findUnique.mockResolvedValue({ ...CARROSSEL, pillar: "Salário e remuneração" });

    const r = await reconverterArquivosParaJpeg(20);
    expect(r.bloqueadas).toEqual(["sp_cj"]);
    expect(r.convertidas).toEqual([]);
    expect(db.socialPost.update).not.toHaveBeenCalled();
  });
});

describe("nada aqui redesenha, compra ou publica — lido no código", () => {
  const SRC = fs
    .readFileSync(path.join(process.cwd(), "lib/agency/execution/reconverter-arquivos.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("não redesenha: nenhuma chamada a `comporComMolde` nem ao molde", async () => {
    for (const desenho of ["comporComMolde", "montarPeca", "lerMarca"]) {
      expect(SRC.includes(desenho), `a conversão passou a ${desenho} — isso muda a peça que o cliente aprovou`).toBe(false);
    }
  });

  it("não compra imagem: nenhum gerador, nenhum download", async () => {
    for (const pago of ["generateDesign", "baixarImagem"]) {
      expect(SRC.includes(pago), `passou a usar ${pago} — isso custa`).toBe(false);
    }
    await reconverterArquivosParaJpeg(20);
    expect(generateDesign).not.toHaveBeenCalled();
  });

  it("não publica e não mexe na trava do CEO", () => {
    for (const proibido of ["publishPost", "publicarAgendados", "PUBLICACAO_ORGANICA", "graph.facebook"]) {
      expect(SRC.includes(proibido), `${proibido} apareceu na conversão`).toBe(false);
    }
  });

  it("mede o resultado pela régua da publicação ANTES de gravar", () => {
    // Conserto que se declara pronto sem se medir é o portão de decoração que
    // esta casa já nomeou: existe, não roda, e cria confiança falsa.
    const iMede = SRC.indexOf("conferirFormatoDeMidia");
    const iGrava = SRC.indexOf("prisma.socialPost\n    .update") >= 0
      ? SRC.indexOf("prisma.socialPost\n    .update")
      : SRC.indexOf(".update({ where: { id: post.id }");
    expect(iMede).toBeGreaterThan(-1);
    expect(iGrava).toBeGreaterThan(-1);
    expect(iMede, "grava antes de medir").toBeLessThan(iGrava);
  });
});
