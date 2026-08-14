// AS DUAS METADES DO FORMATO — o acerto E a falha que ele conserta.
//
// ── POR QUE ESTE ARQUIVO EXISTE (14/08/2026) ────────────────────────────────
//
// O conserto do formato (a peça final sai em JPEG, `design/renderizar.ts`) tem
// uma consequência que NÃO pode se perder de vista: **ele remove uma trava de
// segurança acidental.** Enquanto a casa gravava PNG, a trava de formato
// (`lib/integrations/meta/formato-de-midia.ts`) recusava 100% das peças antes
// de qualquer byte sair — e era ISSO, e não uma decisão, que impedia a casa de
// publicar sozinha na conta de um cliente com o app sem App Review.
//
// Um teste que só prova o acerto ("a peça sai JPEG") mede a metade otimista e
// deixa a casa sem prova nenhuma de que a rede de proteção continua de pé.
// `__tests__/esteira/o-formato-da-peca-chega-na-meta.test.ts` faz essa metade,
// e faz bem. Este arquivo põe as DUAS no mesmo lugar:
//
//   METADE 1 — O ACERTO. A peça que a produção grava é JPEG de verdade (bytes,
//     não etiqueta) e a trava REAL a aceita.
//   METADE 2 — A FALHA REPRODUZIDA. Uma peça que sai em PNG — e ela ainda
//     existe, pelo caminho de degradação por conteúdo — é RECUSADA, com motivo
//     legível: nomeia o arquivo, o formato que ele tem, o que a Meta exige, e
//     diz que o que falta NÃO é conexão nem autorização.
//   METADE 3 — O QUE SOBROU SEGURANDO. Consertar o formato não liga a
//     publicação: `PUBLICACAO_ORGANICA` continua sendo o interruptor, e ele é
//     fail-closed.
//
// ── O CAMINHO PELO QUAL UMA PEÇA AINDA SAI EM PNG ──────────────────────────
//
// Não é um bug: é a degradação declarada de `comporComMolde`. Quando o conteúdo
// não tem uma frase utilizável como chamada, a peça sai como a FOTO CRUA — e o
// formato dela é o da foto que entrou (PNG, quando veio do gerador de imagem).
// Trocar esse `mime` por `"image/jpeg"` fixo seria o defeito PIOR: bytes de PNG
// rotulados de JPEG passariam pela trava da casa e morreriam na Meta, que é a
// rajada de tentativas recusadas contra a conta do cliente que a trava veio
// impedir. Por isso a metade 2 não é um caso hipotético — é o caminho vivo.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  socialPost: { findMany: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
  mediaAsset: { findFirst: vi.fn(), findUnique: vi.fn(), count: vi.fn(), findMany: vi.fn() },
  client: { findUnique: vi.fn() },
}));
const generateDesign = vi.hoisted(() => vi.fn());
const guardarArquivo = vi.hoisted(() => vi.fn());
const lerArquivo = vi.hoisted(() => vi.fn());
const estiloVisualPersistido = vi.hoisted(() => vi.fn());
const estiloVistoPersistido = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/ai/design-engine", () => ({ generateDesign }));
vi.mock("@/lib/agency/media/armazenamento", () => ({ guardarArquivo, lerArquivo }));
vi.mock("@/lib/agency/execution/leitura-do-cliente", () => ({ estiloVisualPersistido, estiloVistoPersistido }));
// O assunto aqui é FORMATO DE ARQUIVO. Material do cliente tem teste próprio, e
// o que NÃO se mocka, de propósito, é o motor de molde: é ele que decide o
// formato de saída, e mockar o motor seria testar a intenção.
vi.mock("@/lib/agency/esteira/material-do-drive", () => ({
  logoDoCliente: async () => null,
  fotosReaisDoCliente: async () => [],
}));

import { produzirArtesPendentes, comporComMolde } from "@/lib/agency/execution/artes";
import { renderizadorDisponivel } from "@/lib/agency/design/renderizar";
import { moldeDoCliente } from "@/lib/agency/design/molde";
import { conferirFormatoDeMidia, type MidiaConferida } from "@/lib/integrations/meta/formato-de-midia";
import {
  publicacaoOrganicaLiberada,
  CHAVE_DA_DECISAO,
  VALOR_QUE_LIBERA,
} from "@/lib/integrations/meta/trava-de-publicacao";

/** As assinaturas de arquivo, lidas dos BYTES. Etiqueta não é evidência. */
const MAGICO_JPEG = Buffer.from([0xff, 0xd8, 0xff]);

/** O banco de mídia de mentira com a regra de verdade: guarda o que a produção
 *  mandou guardar e devolve um id, como `guardarArquivo`. É daqui que a
 *  publicação leria o MIME de cada arquivo. */
const guardados = new Map<string, { fileName: string; mimeType: string; bytes: Buffer }>();

/** Uma "foto gerada" diferente a cada chamada — a trava de storyboard reprova
 *  duas telas com os mesmos bytes, e com razão. */
function fotoGerada(n: number): string {
  return `data:image/png;base64,${Buffer.from(`foto-gerada-${n}-${"x".repeat(n)}`).toString("base64")}`;
}

/** A legenda que TEM uma chamada utilizável — o caminho bom, que rasteriza. */
const LEGENDA_COM_FRASE = "Pão saindo do forno às 6 da manhã, ainda fumegando";

/**
 * A legenda que NÃO tem chamada utilizável.
 *
 * `tituloDaFonte` devolve vazio para uma legenda que é só hashtag: uma palavra
 * sozinha é rótulo, não chamada. É o gatilho da degradação por CONTEÚDO — a
 * peça sai como a foto crua, e a foto crua do gerador é PNG.
 */
const LEGENDA_SEM_FRASE = "#vagas #altotiete";

const POST = {
  id: "sp1", workspaceId: "ws1", clientId: "c1", clientRequestId: "cr1",
  caption: LEGENDA_COM_FRASE,
  pillar: "Produto", format: "feed", mediaUrl: null, mediaUrlsJson: null,
  scenesJson: null, lastError: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  guardados.clear();
  db.socialPost.findMany.mockResolvedValue([{ ...POST }]);
  db.socialPost.update.mockResolvedValue({});
  db.mediaAsset.findFirst.mockResolvedValue(null);
  db.mediaAsset.findUnique.mockResolvedValue(null);
  db.mediaAsset.count.mockResolvedValue(0);
  db.client.findUnique.mockResolvedValue({
    name: "Padaria do João", industry: "Padaria",
    brandBrain: { primaryColor: "#8B4513", secondaryColor: "#F5DEB3", tone: "acolhedor" },
  });
  estiloVisualPersistido.mockResolvedValue("");
  estiloVistoPersistido.mockResolvedValue("");

  let geradas = 0;
  generateDesign.mockImplementation(async () => ({ ok: true, url: fotoGerada(++geradas), model: "gpt-image-1" }));

  let n = 0;
  guardarArquivo.mockImplementation(async (i: { bytes: Buffer; fileName: string; mimeType: string }) => {
    const id = `med_${++n}`;
    guardados.set(id, { fileName: i.fileName, mimeType: i.mimeType, bytes: Buffer.from(i.bytes) });
    return { ok: true, arquivo: { id, fileName: i.fileName, mimeType: i.mimeType, sizeBytes: i.bytes.length, url: `/api/media/${id}` } };
  });
});

/** Os ids que `esteira/publicacao.ts` extrai da peça antes de conferir o
 *  formato. Copiado de lá de propósito: se a produção mudar o formato do
 *  `mediaUrl`, esta prova sente do mesmo jeito que a publicação sente. */
function idsDaPeca(data: { mediaUrl?: string | null; mediaUrlsJson?: string | null }, carrossel: boolean): string[] {
  const brutas = carrossel
    ? (JSON.parse(data.mediaUrlsJson ?? "[]") as string[])
    : [data.mediaUrl ?? null];
  return brutas
    .filter((u): u is string => !!u && u.startsWith("/api/media/"))
    .map((u) => u.split("/api/media/")[1]?.split("?")[0] ?? "")
    .filter((id) => id.length > 0);
}

/** O que a publicação veria no banco de mídia, para esses ids. */
function comoAPublicacaoVe(ids: string[]): MidiaConferida[] {
  return ids.map((id) => ({ id, mime: guardados.get(id)?.mimeType ?? null }));
}

/** O que o post recebeu — é o único lugar de onde a publicação parte. */
function oQueOPostRecebeu(): { mediaUrl?: string | null; mediaUrlsJson?: string | null; lastError?: string | null } {
  const chamada = db.socialPost.update.mock.calls.at(-1);
  if (!chamada) throw new Error("a produção não gravou nada no post");
  return (chamada[0] as { data: { mediaUrl?: string | null; mediaUrlsJson?: string | null; lastError?: string | null } }).data;
}

// ── S5 DA CASA: GATE QUE NÃO REGISTRA RESULTADO REPROVA ─────────────────────
// A metade 1 e a segunda parte da metade 2 andam a corrente inteira, e isso
// exige o rasterizador de verdade — é ele que decide o formato do arquivo. Sem
// navegador a prova NÃO foi feita, e "não medi" não pode passar por "está
// certo": ou o navegador está aqui, ou a ausência é declarada em voz alta.
const NAVEGADOR = await renderizadorDisponivel();
const DECLARADO_SEM_NAVEGADOR = process.env.MOLDE_SEM_NAVEGADOR === "1";
const naCorrente = NAVEGADOR.disponivel ? it : it.skip;

describe("a prova das duas metades REGISTRA resultado — não some em silêncio", () => {
  it("ou o Chromium está aqui, ou a ausência dele está declarada", () => {
    expect(
      NAVEGADOR.disponivel || DECLARADO_SEM_NAVEGADOR,
      "Sem Chromium não dá para saber em que formato a peça sai, e é o formato que a Meta recusa. " +
        "Instale o navegador (`npx playwright install chromium`) ou declare a lacuna com MOLDE_SEM_NAVEGADOR=1.",
    ).toBe(true);
  });
});

describe("METADE 1 — o acerto: a peça composta sai em JPEG e a trava real a aceita", () => {
  naCorrente(
    "os BYTES são JPEG, o MIME diz JPEG, o nome termina em .jpg e a trava aceita",
    async () => {
      const r = await produzirArtesPendentes();
      expect(r.falhas, JSON.stringify(r.falhas)).toEqual([]);

      const ids = idsDaPeca(oQueOPostRecebeu(), false);
      expect(ids).toHaveLength(1);
      const arquivo = guardados.get(ids[0]!)!;

      // A etiqueta…
      expect(arquivo.mimeType).toBe("image/jpeg");
      expect(arquivo.fileName).toMatch(/\.jpe?g$/i);
      // …e a evidência. Um `image/jpeg` gravado sobre bytes de PNG passaria pela
      // trava da casa e morreria na Meta — pior que ser barrado aqui.
      expect(
        arquivo.bytes.subarray(0, 3).equals(MAGICO_JPEG),
        `o arquivo gravado como ${arquivo.mimeType} não começa com a assinatura de JPEG`,
      ).toBe(true);

      const veredito = conferirFormatoDeMidia(comoAPublicacaoVe(ids), false);
      expect(
        veredito.aceita,
        veredito.aceita ? "" : `a própria casa recusaria a peça que acabou de produzir: ${veredito.motivo}`,
      ).toBe(true);
    },
    120_000,
  );
});

describe("METADE 2 — a falha reproduzida: peça em PNG é recusada, com motivo legível", () => {
  // Esta parte NÃO depende do navegador de propósito: a degradação por conteúdo
  // acontece ANTES de rasterizar. A rede de proteção tem de ser mensurável
  // mesmo numa máquina onde o rasterizador não existe.
  it("a degradação por conteúdo devolve a foto CRUA, e ela se declara PNG", async () => {
    const composta = await comporComMolde({
      formato: "feed",
      molde: moldeDoCliente(null),
      fotoBytes: Buffer.from("uma foto qualquer vinda do gerador de imagem"),
      fotoMime: "image/png",
      fonteAuditada: LEGENDA_SEM_FRASE,
      selo: null,
      assinatura: "Padaria do João",
      indice: null,
    });

    expect(composta.ok).toBe(true);
    if (!composta.ok) return;
    // O resultado DIZ o que ele é. Trocar isto por "image/jpeg" fixo faria a
    // peça passar pela trava da casa e morrer na Meta.
    expect(composta.mime).toBe("image/png");
    expect(composta.nota ?? "").toContain("[molde]");
  });

  it("a trava recusa o PNG e o motivo NOMEIA as duas metades", () => {
    const veredito = conferirFormatoDeMidia([{ id: "med_arte", mime: "image/png" }], false);
    expect(veredito.aceita).toBe(false);
    if (veredito.aceita) return;

    const motivo = veredito.motivo;
    // Quem lê tem de conseguir achar o arquivo…
    expect(motivo).toContain("med_arte");
    // …saber o que ele é…
    expect(motivo).toContain("image/png");
    // …saber o que a Meta exige…
    expect(motivo).toContain("JPEG");
    // …e de onde essa regra vem, para não a tratar como limite desta casa.
    expect(motivo).toContain("instagram-publicacao-de-conteudo.md");
    // A frase que impede o operador de procurar defeito no lugar errado: em
    // 08/08 o interruptor foi virado e o problema não era ele.
    expect(motivo).toContain("NÃO é conexão nem autorização");
    expect(motivo.toLowerCase()).not.toContain("reconect");
  });

  naCorrente(
    "na corrente inteira: a peça degradada chega ao post como .png e a publicação a recusa",
    async () => {
      db.socialPost.findMany.mockResolvedValue([{ ...POST, id: "sp2", caption: LEGENDA_SEM_FRASE }]);

      const r = await produzirArtesPendentes();
      expect(r.falhas, JSON.stringify(r.falhas)).toEqual([]);

      const gravado = oQueOPostRecebeu();
      const ids = idsDaPeca(gravado, false);
      expect(ids).toHaveLength(1);

      const arquivo = guardados.get(ids[0]!)!;
      // O nome não mente sobre os bytes — é o que impede quem investiga de
      // procurar o defeito no lugar errado, como se perdeu o dia 08/08.
      expect(arquivo.mimeType).toBe("image/png");
      expect(arquivo.fileName).toMatch(/\.png$/);

      // E a peça sai do forno já declarando, no post, que veio sem a camada de
      // texto. Peça que degrada em silêncio é pior que peça recusada.
      expect(gravado.lastError ?? "").toContain("[molde]");

      const veredito = conferirFormatoDeMidia(comoAPublicacaoVe(ids), false);
      expect(
        veredito.aceita,
        "a peça saiu em PNG e a casa a aceitou — a rede de proteção que segurava 08/08 caiu junto com o conserto do formato",
      ).toBe(false);
    },
    120_000,
  );
});

describe("METADE 3 — consertar o formato NÃO liga a publicação", () => {
  // O conserto do JPEG remove uma trava acidental. O que sobra segurando é uma
  // decisão declarada do CEO, e ela é fail-closed: ausência de decisão nunca
  // vira permissão.
  const original = process.env[CHAVE_DA_DECISAO];

  // Teste que vaza variável de ambiente contamina o arquivo seguinte, e o
  // sintoma aparece longe da causa. O valor volta ao que era depois de cada caso.
  afterEach(() => {
    if (original === undefined) delete process.env[CHAVE_DA_DECISAO];
    else process.env[CHAVE_DA_DECISAO] = original;
  });

  it("variável ausente = NÃO publica", () => {
    delete process.env[CHAVE_DA_DECISAO];
    expect(publicacaoOrganicaLiberada()).toBe(false);
  });

  it("`travada` — o valor que está no ar hoje — = NÃO publica", () => {
    process.env[CHAVE_DA_DECISAO] = "travada";
    expect(publicacaoOrganicaLiberada()).toBe(false);
  });

  it("só o valor literal do CEO libera, e ele é um ato humano", () => {
    process.env[CHAVE_DA_DECISAO] = VALOR_QUE_LIBERA;
    expect(publicacaoOrganicaLiberada()).toBe(true);
  });
});
