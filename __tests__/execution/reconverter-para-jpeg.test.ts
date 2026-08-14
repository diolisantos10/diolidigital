// A RECONVERSÃO DAS PEÇAS VELHAS EM PNG — MEDIDA, NÃO PROMETIDA.
//
// ── POR QUE ESTE ARQUIVO EXISTE (14/08/2026) ────────────────────────────────
//
// `/api/meta/prontidao` rodou contra produção às 21h43 de 14/08: 6 posts do
// CityJobs agendados, os 6 com `pronto:false`, e o primeiro portão que barra
// nos seis é o **Formato do arquivo** — as artes estão gravadas como
// `image/png`. A causa já estava consertada no código desde 08/08 (o
// rasterizador saiu de PNG para JPEG), e mesmo assim a esteira seguia parada:
// o defeito não era mais o motor, era o ESTOQUE.
//
// A lição da casa é que peça testada isoladamente não pega corrente arrebentada.
// Por isso este arquivo tem DUAS camadas, e a segunda é a que importa:
//
//   1. a SELEÇÃO, determinística e sem navegador: quem entra na lista, quem não
//      entra, e — a metade que quase sempre falta — quem NÃO pode entrar;
//   2. a CORRENTE INTEIRA, com o Chromium de verdade: a peça em PNG entra, o
//      rasterizador de hoje roda, o arquivo novo é gravado, o post passa a
//      apontar para ele, e a MESMA trava que recusou o PNG é chamada de novo
//      sobre o resultado. Sem esta camada, "agora sai JPEG" seria uma leitura
//      de código, não uma medição.
//
// E confere os BYTES, não só a etiqueta: um `mimeType: "image/jpeg"` gravado
// sobre bytes de PNG passaria pela trava da casa e morreria na Meta — defeito
// PIOR que o de hoje, porque a rajada de tentativas recusadas volta a bater na
// conta do cliente.

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  socialPost: { findMany: vi.fn(), update: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn() },
  mediaAsset: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  client: { findUnique: vi.fn() },
  driveMaterial: { findMany: vi.fn() },
}));
const guardarArquivo = vi.hoisted(() => vi.fn());
const lerArquivo = vi.hoisted(() => vi.fn());
const generateDesign = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/agency/media/armazenamento", () => ({ guardarArquivo, lerArquivo }));
// O gerador de imagem entra MOCKADO e é proibido de ser chamado: reconverter é
// rasterização local sobre a foto JÁ PAGA. Se alguém o trouxer de volta sem
// perceber, a fatura dobra em silêncio — e o teste abaixo fica vermelho.
vi.mock("@/lib/ai/design-engine", () => ({ generateDesign }));
vi.mock("@/lib/agency/esteira/material-do-drive", () => ({
  logoDoCliente: async () => null,
  fotosReaisDoCliente: async () => [],
}));

import fs from "node:fs";
import path from "node:path";

import { recomporPecas } from "@/lib/agency/execution/artes";
import {
  postsComFormatoRecusado,
  carrosseisComFormatoRecusado,
  idDaMidiaGuardada,
  telasDoCarrossel,
  retratoDoFormato,
  FORMATOS_FORA_DA_RECONVERSAO,
} from "@/lib/agency/execution/reconversao-de-formato";
import { conferirFormatoDeMidia, type MidiaConferida } from "@/lib/integrations/meta/formato-de-midia";
import { renderizadorDisponivel } from "@/lib/agency/design/renderizar";

const MAGICO_JPEG = Buffer.from([0xff, 0xd8, 0xff]);
const MAGICO_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

/** A peça de 08/08 como ela está no banco hoje: composta, agendada, e em PNG. */
const POST_PNG = {
  id: "sp_png",
  workspaceId: "ws1",
  clientId: "c1",
  clientRequestId: "cr1",
  caption: "Vaga validada por gente da região, conferida antes de entrar no ar",
  pillar: "Comunidade",
  format: "feed",
  mediaUrl: "/api/media/med_velha",
  mediaUrlsJson: null,
  scenesJson: null,
  scheduledFor: new Date("2026-08-20T12:00:00.000Z"),
  status: "scheduled",
  lastError: null,
};

/** O banco de mídia de mentira, com a regra de verdade. */
const banco = new Map<string, { mimeType: string }>();
/** O que a produção MANDOU guardar — nome, MIME e bytes. */
const guardados = new Map<string, { fileName: string; mimeType: string; bytes: Buffer }>();

beforeEach(() => {
  vi.clearAllMocks();
  banco.clear();
  guardados.clear();

  banco.set("med_velha", { mimeType: "image/png" });

  db.socialPost.findMany.mockResolvedValue([{ ...POST_PNG }]);
  db.socialPost.update.mockResolvedValue({});
  db.mediaAsset.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const linha = banco.get(where.id);
    return linha ? { id: where.id, mimeType: linha.mimeType } : null;
  });
  // O FUNDO já pago, guardado desde o dia da produção.
  db.mediaAsset.findFirst.mockResolvedValue({
    id: "med_fundo",
    storagePath: "/fake/fundo-sp_png.png",
    mimeType: "image/png",
    workspaceId: "ws1",
    createdAt: new Date("2026-08-08T10:00:00.000Z"),
  });
  db.client.findUnique.mockResolvedValue({
    name: "CityJobs",
    industry: "Vagas de emprego",
    brandBrain: { primaryColor: "#0D2B4D", secondaryColor: "#16A34A", tone: "direto" },
  });
  db.driveMaterial.findMany.mockResolvedValue([]);
  db.mediaAsset.count.mockResolvedValue(0);

  lerArquivo.mockResolvedValue(Buffer.from("os-bytes-da-foto-ja-paga-de-08-08"));

  let n = 0;
  guardarArquivo.mockImplementation(async (i: { bytes: Buffer; fileName: string; mimeType: string }) => {
    const id = `med_novo_${++n}`;
    guardados.set(id, { fileName: i.fileName, mimeType: i.mimeType, bytes: Buffer.from(i.bytes) });
    banco.set(id, { mimeType: i.mimeType });
    return {
      ok: true,
      arquivo: { id, fileName: i.fileName, mimeType: i.mimeType, sizeBytes: i.bytes.length, url: `/api/media/${id}` },
    };
  });
});

// ── 1. A SELEÇÃO ────────────────────────────────────────────────────────────

describe("a seleção acha a peça em PNG — e as DUAS metades são provadas", () => {
  it("metade 1 — a peça agendada em PNG entra na lista, com a evidência junto", async () => {
    const achadas = await postsComFormatoRecusado(20);
    expect(achadas).toHaveLength(1);
    expect(achadas[0]!.diagnostico.postId).toBe("sp_png");
    expect(achadas[0]!.diagnostico.midias).toEqual([{ id: "med_velha", mime: "image/png" }]);
    // Guardrail 6: o alerta carrega a própria evidência. "Algo falhou" não serve.
    expect(achadas[0]!.diagnostico.motivo).toContain("med_velha é image/png");
    expect(achadas[0]!.diagnostico.motivo).toContain("image/jpeg");
  });

  it("metade 2 — a peça que JÁ está em JPEG não entra: reconverter o certo é reescrever trabalho entregue", async () => {
    banco.set("med_velha", { mimeType: "image/jpeg" });
    expect(await postsComFormatoRecusado(20)).toHaveLength(0);
  });

  it("mídia que não é desta casa não é medida nem tocada — não sabemos o formato dela", async () => {
    db.socialPost.findMany.mockResolvedValue([{ ...POST_PNG, mediaUrl: "https://cdn.de-fora.com/arte.png" }]);
    expect(await postsComFormatoRecusado(20)).toHaveLength(0);
    expect(idDaMidiaGuardada("https://cdn.de-fora.com/arte.png")).toBeNull();
    expect(idDaMidiaGuardada("/api/media/med_x?assinatura=abc")).toBe("med_x");
  });

  it("mídia que sumiu do banco é RECUSADA, nunca aprovada por silêncio", async () => {
    banco.delete("med_velha");
    const achadas = await postsComFormatoRecusado(20);
    expect(achadas).toHaveLength(1);
    expect(achadas[0]!.diagnostico.motivo).toContain("não está no banco de mídia");
  });

  it("carrossel, reel e vídeo NÃO entram nesta passada — o conserto deles é de outra mão", async () => {
    const consulta = db.socialPost.findMany.mock.calls;
    await postsComFormatoRecusado(20);
    const where = (consulta.at(-1)?.[0] as { where: { format: { notIn: string[] } } }).where;
    for (const fora of FORMATOS_FORA_DA_RECONVERSAO) {
      expect(where.format.notIn).toContain(fora);
    }
  });

  it("o teto da passada é respeitado — reescrever 200 peças de uma vez é o problema fantasiado de conserto", async () => {
    db.socialPost.findMany.mockResolvedValue(
      Array.from({ length: 12 }, (_, i) => ({ ...POST_PNG, id: `sp_${i}` })),
    );
    expect(await postsComFormatoRecusado(3)).toHaveLength(3);
  });
});

describe("o carrossel aparece no relatório mesmo sem ser consertado aqui", () => {
  it("carrossel com telas em PNG é listado — esconder viraria falsa liberação", async () => {
    db.socialPost.findMany.mockResolvedValue([
      {
        ...POST_PNG,
        id: "sp_carrossel",
        format: "carousel",
        mediaUrlsJson: JSON.stringify(["/api/media/med_t1", "/api/media/med_t2"]),
      },
    ]);
    banco.set("med_t1", { mimeType: "image/png" });
    banco.set("med_t2", { mimeType: "image/jpeg" });

    const achados = await carrosseisComFormatoRecusado(20);
    expect(achados).toHaveLength(1);
    expect(achados[0]!.motivo).toContain("med_t1 é image/png");
    expect(telasDoCarrossel(JSON.stringify(["/api/media/med_t1", "lixo"]))).toEqual(["med_t1"]);
  });

  it("o veredito do retrato nunca diz 'está tudo certo' por causa do formato sozinho", async () => {
    banco.set("med_velha", { mimeType: "image/jpeg" });
    const r = await retratoDoFormato(20);
    expect(r.posts).toHaveLength(0);
    // O formato é 1 portão de 12. Um relatório que parasse em "nenhuma peça
    // recusada" treinaria o operador a ler isso como "vai publicar".
    expect(r.veredito).toContain("portão de doze");
  });
});

// ── 2. A CORRENTE INTEIRA, COM O RASTERIZADOR DE VERDADE ────────────────────

// S5 da casa: gate que não registra resultado reprova. Esta prova precisa do
// Chromium — é ele que decide o formato do arquivo. "Não medi" nunca vira
// "está certo".
const NAVEGADOR = await renderizadorDisponivel();
const DECLARADO_SEM_NAVEGADOR = process.env.MOLDE_SEM_NAVEGADOR === "1";
const prova = NAVEGADOR.disponivel ? it : it.skip;

describe("a prova da reconversão REGISTRA resultado — não some em silêncio", () => {
  it("ou o Chromium está aqui, ou a ausência dele está declarada", () => {
    expect(
      NAVEGADOR.disponivel || DECLARADO_SEM_NAVEGADOR,
      "Sem Chromium não dá para saber em que formato a peça reconvertida sai, e é o formato que a Meta recusa. " +
        "Instale o navegador (`npx playwright install chromium`) ou declare a lacuna com MOLDE_SEM_NAVEGADOR=1.",
    ).toBe(true);
  });
});

/** O que o post recebeu na última escrita — é o único lugar de onde a
 *  publicação parte. */
function oQueOPostRecebeu(): { mediaUrl?: string | null; lastError?: string | null } {
  const chamada = db.socialPost.update.mock.calls.at(-1);
  if (!chamada) throw new Error("a reconversão não gravou nada no post");
  return (chamada[0] as { data: { mediaUrl?: string | null; lastError?: string | null } }).data;
}

/** O que a publicação veria no banco de mídia, para esses ids. */
function comoAPublicacaoVe(ids: string[]): MidiaConferida[] {
  return ids.map((id) => ({ id, mime: banco.get(id)?.mimeType ?? null }));
}

describe("a peça reconvertida é a peça que a Meta aceita", () => {
  prova(
    "a mesma trava que recusou o PNG aprova o arquivo novo",
    async () => {
      // ANTES: a casa recusa a peça, com a régua real.
      expect(conferirFormatoDeMidia(comoAPublicacaoVe(["med_velha"]), false).aceita).toBe(false);

      const r = await recomporPecas(20, "formato-recusado");
      expect(r.falhas, JSON.stringify(r.falhas)).toEqual([]);
      expect(r.recompostas).toEqual(["sp_png"]);

      const nova = oQueOPostRecebeu().mediaUrl;
      expect(nova, "o post continuou apontando para o arquivo velho").not.toBe("/api/media/med_velha");

      const id = idDaMidiaGuardada(nova)!;
      const veredito = conferirFormatoDeMidia(comoAPublicacaoVe([id]), false);
      expect(
        veredito.aceita,
        veredito.aceita ? "" : `a própria casa recusaria a peça que acabou de reconverter: ${veredito.motivo}`,
      ).toBe(true);
    },
    120_000,
  );

  prova(
    "os BYTES são JPEG de verdade, e o nome do arquivo não mente",
    async () => {
      await recomporPecas(20, "formato-recusado");
      const id = idDaMidiaGuardada(oQueOPostRecebeu().mediaUrl)!;
      const arquivo = guardados.get(id)!;
      expect(arquivo.mimeType).toBe("image/jpeg");
      expect(
        arquivo.bytes.subarray(0, 3).equals(MAGICO_JPEG),
        "o arquivo gravado como image/jpeg NÃO começa com a assinatura de JPEG — " +
          "MIME que mente passa pela trava da casa e morre na Meta, que é pior que ser barrado aqui.",
      ).toBe(true);
      expect(arquivo.bytes.subarray(0, 4).equals(MAGICO_PNG)).toBe(false);
      expect(arquivo.fileName).toMatch(/\.jpe?g$/i);
    },
    120_000,
  );

  prova(
    "nenhuma imagem é COMPRADA: o re-render sai da foto já paga",
    async () => {
      await recomporPecas(20, "formato-recusado");
      expect(generateDesign).not.toHaveBeenCalled();
      expect(lerArquivo).toHaveBeenCalled();
    },
    120_000,
  );

  prova(
    "a DATA MARCADA não é tocada: reconverter não é reagendar, e muito menos publicar",
    async () => {
      await recomporPecas(20, "formato-recusado");
      for (const chamada of db.socialPost.update.mock.calls) {
        const data = (chamada[0] as { data: Record<string, unknown> }).data;
        expect(Object.keys(data).sort()).toEqual(["lastError", "mediaUrl"]);
        expect(data).not.toHaveProperty("scheduledFor");
        expect(data).not.toHaveProperty("status");
      }
    },
    120_000,
  );
});

// ── 3. O QUE ESTE CAMINHO NÃO PODE PASSAR A FAZER ───────────────────────────

describe("nada aqui publica — e isso é lido no código, não prometido no comentário", () => {
  const RAIZ = process.cwd();
  const MODULO = fs.readFileSync(path.join(RAIZ, "lib/agency/execution/reconversao-de-formato.ts"), "utf8");
  const SCRIPT = fs.readFileSync(path.join(RAIZ, "scripts/reconverter-pecas-para-jpeg.mts"), "utf8");

  it("o módulo de medição não escreve no banco nem fala com plataforma nenhuma", () => {
    for (const escrita of [".update(", ".create(", ".delete(", ".upsert("]) {
      expect(MODULO.includes(escrita), `o módulo de medição passou a usar ${escrita}`).toBe(false);
    }
    for (const plataforma of ["graph.facebook", "publicarAgendados", "publishPost", "googleapis"]) {
      expect(MODULO.includes(plataforma), `${plataforma} apareceu na medição`).toBe(false);
    }
  });

  it("o script de operação não chama publicação nem mexe na trava do CEO", () => {
    /** As linhas de CÓDIGO do script — comentário não é comportamento. */
    const codigo = SCRIPT.split("\n").filter((l) => !l.trimStart().startsWith("//"));
    for (const proibido of [
      "publicarAgendados",
      "publishPost",
      "graph.facebook",
      "googleapis",
      // A trava de publicação é decisão declarada do CEO. Um script de conserto
      // que a LÊ já está perto demais de virar um script que a contorna — por
      // isso o proibido é a leitura, não a palavra: a frase final do relatório
      // NOMEIA a trava para o operador, e nomear é o oposto de contornar.
      "process.env.PUBLICACAO_ORGANICA",
      "publicacaoOrganicaLiberada",
      "trava-de-publicacao",
    ]) {
      expect(
        codigo.some((l) => l.includes(proibido)),
        `${proibido} apareceu em código no script de reconversão`,
      ).toBe(false);
    }
    // E a única escrita que ele provoca é a das duas recomposições — nenhuma
    // outra chamada de banco sai daqui.
    expect(codigo.some((l) => l.includes("prisma.socialPost"))).toBe(false);
  });

  it("o script MEDE antes e DEPOIS — conserto que não remede é portão de decoração", () => {
    expect(SCRIPT.includes("retratoDoFormato")).toBe(true);
    const primeira = SCRIPT.indexOf("retratoDoFormato(limite)");
    const segunda = SCRIPT.indexOf("retratoDoFormato(limite)", primeira + 1);
    expect(segunda, "o script aplica e não volta a medir").toBeGreaterThan(primeira);
  });

  it("sem --aplicar o script não escreve: o padrão é medir", () => {
    const iAplicar = SCRIPT.indexOf("if (!aplicar)");
    expect(iAplicar).toBeGreaterThan(-1);
    // TODA chamada que escreve tem de vir depois da porteira, não só a primeira
    // que alguém lembrou de conferir.
    for (const escreve of ["await reconverterArquivosParaJpeg(", "await recomporPecas(", "await recomporCarrosseis("]) {
      const i = SCRIPT.indexOf(escreve);
      expect(i, `${escreve} sumiu do script`).toBeGreaterThan(-1);
      expect(iAplicar, `${escreve} é alcançável sem --aplicar`).toBeLessThan(i);
    }
  });

  it("o padrão de --aplicar é o gesto MÍNIMO; redesenhar tem de ser pedido", () => {
    // Redesenhar troca os pixels de uma peça cuja aprovação está presa ao post
    // (`aprovacao-da-peca.ts`) — a aprovação não percebe a troca. Isso é decisão
    // sobre o trabalho do cliente, e decisão não pode ser o comportamento padrão
    // de uma flag chamada "--aplicar".
    expect(SCRIPT.includes('process.argv.includes("--redesenhar")')).toBe(true);
    const iConversao = SCRIPT.indexOf("await reconverterArquivosParaJpeg(");
    const iRedesenho = SCRIPT.indexOf("await recomporPecas(");
    expect(iConversao, "o redesenho vem antes da conversão — o caminho caro virou o padrão").toBeLessThan(iRedesenho);
  });
});
