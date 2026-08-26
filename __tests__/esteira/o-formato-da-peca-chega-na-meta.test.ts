// A CORRENTE DO FORMATO: O QUE A PRODUÇÃO GRAVA × O QUE A PUBLICAÇÃO ACEITA.
//
// ── POR QUE ESTE ARQUIVO EXISTE (08/08/2026) ────────────────────────────────
//
// A casa tinha as duas pontas testadas e nenhuma prova de que elas se
// encontravam:
//
//   • `__tests__/meta/formato-de-midia.test.ts` provava que a trava barra PNG e
//     aceita JPEG — com MIMEs escritos à mão no próprio teste;
//   • `__tests__/execution/artes.test.ts` provava a fiação da produção — com
//     `montarPeca` mockado, devolvendo bytes de mentira;
//   • `__tests__/esteira/corrente-do-calendario.test.ts` fixava
//     `mimeType: "image/jpeg"` no fixture do banco (linhas 33-36), ou seja,
//     PRESUMIA exatamente o fato que estava quebrado em produção.
//
// Resultado medido: a esteira rasterizava PNG, gravava `image/png`, e a trava
// da publicação recusava 100% das peças ANTES de falar com a Meta. Publicação
// = 0 por construção, com a suíte inteira verde.
//
// ── O QUE ESTE TESTE FAZ E OS OUTROS NÃO FAZEM ─────────────────────────────
//
// Ele anda a corrente inteira, sem mockar o meio:
//
//   1. roda `produzirArtesPendentes()` com o CHROMIUM DE VERDADE — o mesmo
//      `montarPeca` → `renderizarHtml` → `page.screenshot` da produção;
//   2. captura o que a produção mandaria gravar (`guardarArquivo`): nome, MIME
//      e BYTES;
//   3. lê do post o `mediaUrl` / `mediaUrlsJson`, e extrai os ids EXATAMENTE
//      como `esteira/publicacao.ts` extrai antes de conferir o formato;
//   4. entrega esses MIMEs à trava REAL (`conferirFormatoDeMidia`) e exige
//      `aceita: true`.
//
// E confere os BYTES, não só a etiqueta. É a metade que impede a próxima
// mentira: um `mimeType: "image/jpeg"` gravado sobre bytes de PNG passaria pela
// trava da casa e morreria na Meta — que é um defeito PIOR que o de hoje,
// porque a rajada de tentativas recusadas volta a bater na conta do cliente.
//
// Portanto este arquivo reprova por DOIS caminhos independentes:
//   • a produção gravar um MIME que a trava recusa;
//   • os bytes não serem o que o MIME diz que são.

import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const db = vi.hoisted(() => ({
  // O portão de pagamento deriva o pedido pelo projeto do cliente quando a
  // peça vem sem `clientRequestId` (cliente DIRETO).
  project: { findFirst: vi.fn(async () => ({ clientRequestId: "cr-pago", id: "proj-pago", clientId: "cli-1" })), },
  // O PORTÃO DE PAGAMENTO (lib/agency/financeiro/portao-de-pagamento.ts) roda
  // antes de qualquer produção. Estes testes são sobre o que acontece DEPOIS de
  // o cliente pagar, então a testemunha diz "pago". Quem testa a trava em si é
  // __tests__/financeiro/portao-de-pagamento.test.ts.
  pagamentoConfirmado: {
    findUnique: vi.fn(async () => ({
      valorCentavos: 7900,
      origem: "mercadopago",
      confirmadoEm: new Date("2026-08-25T00:00:00.000Z"),
    })),
  },
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
// ── O PORTÃO DE PIXEL (15/08/2026) ──────────────────────────────────────────
// `conferirFundoDaPeca` entrou no caminho vivo de `artes.ts` e mede PIXEL. As
// fixtures deste arquivo são imagens mínimas, feitas para exercitar a FIAÇÃO —
// e um PNG de poucos pixels é, corretamente, reprovado por um portão que exige
// riqueza de fotografia. A régua dele roda contra ARQUIVO DE VERDADE (as peças
// que o CEO reprovou e as fotos que entraram nas refeitas), e o caminho vivo é
// provado, em `__tests__/design/portao-do-fundo.test.ts`. Mockar aqui separa
// fiação de régua; não afrouxa nenhuma das duas.
vi.mock("@/lib/agency/design/portao-do-fundo", () => ({
  conferirFundoDaPeca: async () => ({ ok: true }),
  motivoDoFundoEmUmaLinha: () => "",
}));
// Sem Drive nesta prova: o assunto aqui é FORMATO DE ARQUIVO, e material do
// cliente tem teste próprio. O que NÃO se mocka é o motor de molde.
vi.mock("@/lib/agency/esteira/material-do-drive", () => ({
  logoDoCliente: async () => null,
  fotosReaisDoCliente: async () => [],
}));

import { produzirArtesPendentes } from "@/lib/agency/execution/artes";
import { renderizadorDisponivel } from "@/lib/agency/design/renderizar";
import { conferirFormatoDeMidia, type MidiaConferida } from "@/lib/integrations/meta/formato-de-midia";

// ── O ARMAZENAMENTO DE MENTIRA COM A REGRA DE VERDADE ───────────────────────
// Ele guarda o que a produção mandou guardar (nome, MIME e bytes) e devolve um
// id, do mesmo jeito que `guardarArquivo` faz. É o "banco de mídia" que a
// publicação vai consultar mais adiante nesta prova.
const guardados = new Map<string, { fileName: string; mimeType: string; bytes: Buffer }>();

/** As assinaturas de arquivo, lidas dos BYTES. Etiqueta não é evidência. */
const MAGICO_JPEG = Buffer.from([0xff, 0xd8, 0xff]);
const MAGICO_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

// ── POR QUE A "FOTO GERADA" AQUI É UMA FOTO DE VERDADE (26/08/2026) ─────────
//
// Até esta data, `fotoGerada` devolvia uma STRING codificada em base64 e
// carimbada `data:image/png`. Servia para exercitar a fiação — e passou a não
// servir mais: `regua-da-peca-final.ts` mede o ARQUIVO COMPOSTO, e o molde
// rasterizado sobre uma "foto" que não é imagem produz exatamente o defeito que
// aquela régua existe para pegar (campo chapado no lugar da foto). O teste
// falhava com razão: o fixture fabricava o incidente.
//
// A foto é a fotografia REAL que entrou nas peças refeitas do CityJobs, e cada
// chamada devolve bytes DIFERENTES (a trava de storyboard reprova duas telas
// com os mesmos bytes, e com razão) — variando a qualidade do JPEG, que muda os
// bytes sem mudar a fotografia.
const FOTO_REAL = readFileSync(
  join(process.cwd(), "docs/entregas/cityjobs-08-08/fotos/p1-recorte.jpg"),
);
const fotosVariadas = new Map<number, string>();
async function prepararFotos(quantas: number): Promise<void> {
  const { default: sharp } = await import("sharp");
  for (let n = 1; n <= quantas; n++) {
    const bytes = await sharp(FOTO_REAL).jpeg({ quality: 96 - n }).toBuffer();
    fotosVariadas.set(n, `data:image/jpeg;base64,${bytes.toString("base64")}`);
  }
}
function fotoGerada(n: number): string {
  const url = fotosVariadas.get(n);
  if (!url) throw new Error(`foto ${n} não foi preparada — aumente o argumento de prepararFotos`);
  return url;
}

const POST = {
  id: "sp1", workspaceId: "ws1", clientId: "c1", clientRequestId: "cr1",
  caption: "Pão saindo do forno às 6 da manhã, ainda fumegando",
  pillar: "Produto", format: "feed", mediaUrl: null, mediaUrlsJson: null,
  scenesJson: null, lastError: null,
};

/** As telas com o PAPEL declarado — é o que `conferirStoryboard` exige antes de
 *  deixar a produção gastar uma imagem por tela. */
const CENAS = [
  "[gancho] O forno aceso às quatro da manhã com o padeiro sozinho na cozinha",
  "[tensao] A massa descansando sem ninguém para assar quando o dia começa",
  "[acao] O pão saindo quentinho para o balcão da manhã",
];

beforeAll(async () => { await prepararFotos(12); });

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

/**
 * Os ids que `esteira/publicacao.ts` extrai da peça antes de conferir o
 * formato. Copiado de lá de propósito: se a produção mudar o formato do
 * `mediaUrl`, esta prova tem de sentir do mesmo jeito que a publicação sente.
 */
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
function oQueOPostRecebeu(): { mediaUrl?: string | null; mediaUrlsJson?: string | null } {
  const chamada = db.socialPost.update.mock.calls.at(-1);
  if (!chamada) throw new Error("a produção não gravou nada no post");
  return (chamada[0] as { data: { mediaUrl?: string | null; mediaUrlsJson?: string | null } }).data;
}

// ── S5 DA CASA: GATE QUE NÃO REGISTRA RESULTADO REPROVA ─────────────────────
// Esta prova precisa do Chromium — é o rasterizador de verdade que decide o
// formato do arquivo. Sem ele a prova NÃO foi feita, e "não medi" não pode
// passar por "está certo". Ou o navegador está aqui, ou a ausência é declarada.
const NAVEGADOR = await renderizadorDisponivel();
const DECLARADO_SEM_NAVEGADOR = process.env.MOLDE_SEM_NAVEGADOR === "1";
const prova = NAVEGADOR.disponivel ? it : it.skip;

describe("a prova do formato REGISTRA resultado — não some em silêncio", () => {
  it("ou o Chromium está aqui, ou a ausência dele está declarada", () => {
    expect(
      NAVEGADOR.disponivel || DECLARADO_SEM_NAVEGADOR,
      "Sem Chromium não dá para saber em que formato a peça sai, e é o formato que a Meta recusa. " +
        "Instale o navegador (`npx playwright install chromium`) ou declare a lacuna com MOLDE_SEM_NAVEGADOR=1.",
    ).toBe(true);
  });
});

describe("a peça que a esteira grava é a peça que a Meta aceita", () => {
  prova(
    "POST ÚNICO: o MIME gravado passa pela trava real da publicação",
    async () => {
      const r = await produzirArtesPendentes();
      expect(r.falhas, JSON.stringify(r.falhas)).toEqual([]);
      expect(r.produzidas).toBe(1);

      const ids = idsDaPeca(oQueOPostRecebeu(), false);
      expect(ids).toHaveLength(1);

      const veredito = conferirFormatoDeMidia(comoAPublicacaoVe(ids), false);
      expect(
        veredito.aceita,
        veredito.aceita ? "" : `a própria casa recusaria a peça que acabou de produzir: ${veredito.motivo}`,
      ).toBe(true);
    },
    120_000,
  );

  prova(
    "POST ÚNICO: os BYTES são JPEG de verdade — etiqueta não é evidência",
    async () => {
      await produzirArtesPendentes();
      const [id] = idsDaPeca(oQueOPostRecebeu(), false);
      const arquivo = guardados.get(id!)!;
      expect(arquivo.mimeType).toBe("image/jpeg");
      expect(
        arquivo.bytes.subarray(0, 3).equals(MAGICO_JPEG),
        `o arquivo gravado como ${arquivo.mimeType} NÃO começa com a assinatura de JPEG — ` +
          `MIME que mente passa pela trava da casa e morre na Meta, que é pior que ser barrado aqui.`,
      ).toBe(true);
      expect(arquivo.bytes.subarray(0, 4).equals(MAGICO_PNG)).toBe(false);
    },
    120_000,
  );

  prova(
    "POST ÚNICO: o NOME do arquivo termina na extensão do MIME que ele tem",
    async () => {
      await produzirArtesPendentes();
      const [id] = idsDaPeca(oQueOPostRecebeu(), false);
      const arquivo = guardados.get(id!)!;
      // Extensão que não bate com o MIME é a próxima mentira: o operador abre
      // a lista de arquivos, lê ".png" e vai procurar o defeito no lugar errado.
      expect(arquivo.fileName).toMatch(/\.jpe?g$/i);
    },
    120_000,
  );

  prova(
    "CARROSSEL: as SEIS telas — todas — passam pela trava; nenhuma vai como PNG",
    async () => {
      db.socialPost.findMany.mockResolvedValue([
        { ...POST, id: "sp3", format: "carousel", scenesJson: JSON.stringify(CENAS) },
      ]);

      const r = await produzirArtesPendentes();
      expect(r.falhas, JSON.stringify(r.falhas)).toEqual([]);

      const ids = idsDaPeca(oQueOPostRecebeu(), true);
      expect(ids).toHaveLength(CENAS.length);

      const veredito = conferirFormatoDeMidia(comoAPublicacaoVe(ids), false);
      expect(
        veredito.aceita,
        veredito.aceita ? "" : `a casa recusaria o carrossel que acabou de produzir: ${veredito.motivo}`,
      ).toBe(true);

      for (const id of ids) {
        const arquivo = guardados.get(id)!;
        expect(arquivo.bytes.subarray(0, 3).equals(MAGICO_JPEG), `tela ${arquivo.fileName}`).toBe(true);
        expect(arquivo.fileName).toMatch(/\.jpe?g$/i);
      }
    },
    240_000,
  );

  prova(
    "o FUNDO continua PNG — o que muda é a peça final, não o arquivo intermediário",
    async () => {
      await produzirArtesPendentes();
      // `fundo-<postId>.png` é a foto paga guardada para o re-render barato. Ela
      // NÃO é publicada: nunca vira `mediaUrl`. Convertê-la seria custo sem
      // ganho — e recomprimir uma foto que ainda vai ser recomposta é perda de
      // qualidade de graça.
      const fundos = [...guardados.values()].filter((a) => a.fileName.startsWith("fundo-"));
      expect(fundos).toHaveLength(1);
      expect(fundos[0]!.mimeType).toBe("image/png");
      expect(fundos[0]!.fileName).toMatch(/\.png$/);

      const publicados = idsDaPeca(oQueOPostRecebeu(), false).map((id) => guardados.get(id)!.fileName);
      expect(publicados.some((n) => n.startsWith("fundo-"))).toBe(false);
    },
    120_000,
  );
});
