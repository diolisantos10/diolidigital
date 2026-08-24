import { describe, it, expect, beforeEach, vi } from "vitest";

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
  mediaAsset: { findFirst: vi.fn(), findUnique: vi.fn(), count: vi.fn() },
  // O PORTÃO DE PAGAMENTO, chegando peça de cliente DIRETO (sem
  // `clientRequestId`), procura o pedido do cliente e, não achando, cai na
  // anistia pela IDADE do cadastro. Daí `findFirst` e o `createdAt` abaixo.
  clientRequestDb: { findUnique: vi.fn(async () => null), findFirst: vi.fn(async () => null) },
  client: { findUnique: vi.fn() },
}));
const generateDesign = vi.hoisted(() => vi.fn());
const guardarArquivo = vi.hoisted(() => vi.fn());
const lerArquivo = vi.hoisted(() => vi.fn());
const editarParaReel = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/ai/design-engine", () => ({ generateDesign }));
vi.mock("@/lib/agency/media/armazenamento", () => ({ guardarArquivo, lerArquivo }));
vi.mock("@/lib/agency/media/video", () => ({ editarParaReel }));
// O estilo do feed real vem SÓ da síntese persistida — esta rodada dispara a
// cada 5 min e nunca pode falar com a Graph. A leitura em si é testada em
// leitura-do-cliente.test.ts; aqui, o contrato com o prompt da arte.
const estiloVisualPersistido = vi.hoisted(() => vi.fn());
const estiloVistoPersistido = vi.hoisted(() => vi.fn());
vi.mock("@/lib/agency/execution/leitura-do-cliente", () => ({ estiloVisualPersistido, estiloVistoPersistido }));
// O MOLDE (a camada de texto por código) tem testes próprios, com Chromium de
// verdade, em __tests__/design/. Aqui o que se testa é a FIAÇÃO: quem chama
// quem, com o quê, e o que acontece quando o molde não pode ser aplicado.
const montarPeca = vi.hoisted(() => vi.fn());
vi.mock("@/lib/agency/design/peca", () => ({ montarPeca }));
// ── O PORTÃO DE PIXEL (15/08/2026) ───────────────────────────────────────────
// `conferirFundoDaPeca` entrou no caminho vivo e mede PIXEL. As fixtures deste
// arquivo são PNGs de 1×1 inventados para exercitar a FIAÇÃO — e um PNG de 1×1
// é, corretamente, reprovado por um portão que exige riqueza de fotografia.
// Aqui ele é mockado como aprovado, e a régua dele é exercitada contra os
// ARQUIVOS DE VERDADE (as peças que o CEO reprovou e as fotos que entraram nas
// refeitas) em `__tests__/design/portao-do-fundo.test.ts`, que também prova que
// ele está no caminho vivo. Mockar aqui é separar fiação de régua, não afrouxar.
const conferirFundoDaPeca = vi.hoisted(() => vi.fn());
vi.mock("@/lib/agency/design/portao-do-fundo", () => ({
  conferirFundoDaPeca,
  motivoDoFundoEmUmaLinha: (v: { ok: boolean; motivo?: string; detalhe?: string }) =>
    v.ok ? "" : `fundo reprovado (${v.motivo}) — ${v.detalhe}`,
}));

import { produzirArtesPendentes, montarPrompt, nomeDoFundo, reRenderizarTexto, montarArteComFotoDoCliente } from "@/lib/agency/execution/artes";

// 1x1 png em base64 — o suficiente para o caminho de bytes.
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/**
 * Uma imagem DIFERENTE a cada chamada.
 *
 * Existe desde 07/08/2026, quando a trava de storyboard passou a conferir a
 * identidade (hash) da imagem de cada tela: um gerador que devolve sempre os
 * mesmos bytes é, para a trava, um carrossel com a mesma foto repetida — e ela
 * reprova, corretamente. O mock antigo devolvia `PNG` sempre, então o caminho
 * feliz do carrossel virava o caso de falha. Aqui cada chamada devolve bytes
 * distintos, que é o que um gerador real faz.
 */
function pngUnico(n: number): string {
  return `data:image/png;base64,${Buffer.from(`tela-${n}-${"x".repeat(n)}`).toString("base64")}`;
}

const POST = {
  id: "sp1", workspaceId: "ws1", clientId: "c1", clientRequestId: "cr1",
  caption: "Pão saindo do forno às 6 da manhã, ainda fumegando.",
  pillar: "Produto", format: "feed", mediaUrl: null, lastError: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  db.socialPost.findMany.mockResolvedValue([{ ...POST }]);
  db.socialPost.update.mockResolvedValue({});
  db.client.findUnique.mockResolvedValue({
    // ANTERIOR ao corte do portão de pagamento: nas peças de cliente DIRETO
    // (sem `clientRequestId`) é a anistia pela idade do cadastro que libera.
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    name: "Padaria do João", industry: "Padaria",
    brandBrain: { primaryColor: "#8B4513", secondaryColor: "#F5DEB3", tone: "acolhedor" },
  });
  let geradas = 0;
  generateDesign.mockImplementation(async () => ({ ok: true, url: pngUnico(++geradas), model: "gpt-image-1" }));
  guardarArquivo.mockResolvedValue({ ok: true, arquivo: { id: "m1", fileName: "arte.png", sizeBytes: 100, url: "/api/media/m1" } });
  db.mediaAsset.findFirst.mockResolvedValue(null);
  // O teto diário de imagens por cliente: por padrão, o cliente ainda não gerou
  // nada hoje. Os testes que exercitam o teto ajustam este contador.
  db.mediaAsset.count.mockResolvedValue(0);
  estiloVisualPersistido.mockResolvedValue("");
  estiloVistoPersistido.mockResolvedValue("");
  conferirFundoDaPeca.mockResolvedValue({ ok: true });
  montarPeca.mockResolvedValue({
    ok: true, bytes: Buffer.from("peca-com-texto"), largura: 1080, altura: 1350,
    textosPintados: ["PRODUTO", "Pão saindo do forno às 6 da manhã"], textoRecusado: [],
    encolheu: false, origemDoMolde: "marca",
  });
});

describe("o Design passa a produzir imagem, não descrição de imagem", () => {
  it("gera a arte e amarra ao post", async () => {
    const r = await produzirArtesPendentes();
    expect(r.produzidas).toBe(1);
    expect(db.socialPost.update.mock.calls[0]![0].data.mediaUrl).toBe("/api/media/m1");
  });

  it("guarda no mesmo armazenamento do material do cliente — uma cota só", async () => {
    await produzirArtesPendentes();
    const arg = guardarArquivo.mock.calls[0]![0];
    expect(arg.kind).toBe("generated");
    expect(arg.workspaceId).toBe("ws1");
    expect(arg.mimeType).toBe("image/png");
  });

  it("só olha post SEM mídia — a foto real do cliente nunca é sobrescrita", async () => {
    await produzirArtesPendentes();
    expect(db.socialPost.findMany.mock.calls[0]![0].where.mediaUrl).toBeNull();
  });

  it("reel não vira imagem parada — o cliente não comprou isso", async () => {
    // Reel agora É produzido, mas EDITANDO o vídeo do cliente (ver o bloco de
    // reel abaixo). O que continua proibido é gerar imagem estática e publicar
    // como reel.
    db.socialPost.findMany.mockResolvedValue([{ ...POST, format: "reel" }]);
    db.mediaAsset.findFirst.mockResolvedValue(null);
    const r = await produzirArtesPendentes();
    expect(generateDesign).not.toHaveBeenCalled();
    expect(r.desistiram).toEqual(["sp1"]);
  });

  it("peça que já falhou 3 vezes para de tentar — insistir não melhora e custa", async () => {
    db.socialPost.findMany.mockResolvedValue([{ ...POST, lastError: "[arte 3/3] recusado" }]);
    const r = await produzirArtesPendentes();
    expect(generateDesign).not.toHaveBeenCalled();
    expect(r.desistiram).toEqual(["sp1"]);
  });

  it("falha do gerador conta tentativa e fica legível, em vez de sumir no log", async () => {
    generateDesign.mockResolvedValue({ ok: false, error: "conta sem acesso ao modelo" });
    const r = await produzirArtesPendentes();
    expect(r.produzidas).toBe(0);
    expect(db.socialPost.update.mock.calls[0]![0].data.lastError).toMatch(/^\[arte 1\/3\]/);
  });

  it("cota estourada não vira post sem imagem silencioso", async () => {
    guardarArquivo.mockResolvedValue({ ok: false, erro: "cota", motivo: "Sem espaço no armazenamento." });
    const r = await produzirArtesPendentes();
    expect(r.produzidas).toBe(0);
    expect(r.falhas[0]!.erro).toMatch(/Sem espaço/);
  });
});

describe("o prompt da arte", () => {
  const base = { legenda: "Pão quentinho saindo do forno", pilar: "Produto", negocio: "Padaria do João", segmento: "Padaria", cores: ["#8B4513"], tom: "acolhedor" };

  it("proíbe texto LEGÍVEL na imagem — modelo erra letra, e letra errada vai para o perfil do cliente", () => {
    // Pior ainda: preço e telefone dentro de um pixel escapam do piso de
    // verdade, que lê texto e não enxerga imagem. Em 15/08/2026 a frase deixou
    // de proibir "placa ou etiqueta" — rua de comércio sem placa não existe, e
    // pedir um mundo impossível empurrava o gerador para a ilustração. O que
    // ela protege continua protegido: nada LEGÍVEL, porque letra ilegível não
    // afirma fato nenhum. Ver `__tests__/design/prompt-que-pede-foto.test.ts`.
    const p = montarPrompt(base);
    expect(p).toMatch(/SEM TEXTO LEGÍVEL/);
    expect(p).toMatch(/nada que dê para LER na imagem/);
    expect(p).toContain("preço");
    expect(p).toContain("telefone");
  });

  it("a legenda entra como CENA, nunca como texto a desenhar", () => {
    expect(montarPrompt(base)).toContain("Cena a retratar: Pão quentinho saindo do forno");
  });

  it("a paleta da marca NÃO é pedida à câmera — ela é aplicada no molde HTML", () => {
    // Prender o croma de uma foto à paleta da marca é a receita medida da
    // reprovação no portão do pixel: 2.844 → 462 cores distintas, piso 600.
    const p = montarPrompt(base);
    expect(p).not.toContain("#8B4513");
    expect(p).toMatch(/paleta da marca NÃO é aplicada na foto/i);
  });

  it("marca sem paleta não fala de paleta nenhuma — vazio é vazio", () => {
    const p = montarPrompt({ ...base, cores: [] });
    expect(p).not.toMatch(/paleta da marca/i);
  });

  it("o estilo do feed real entra no prompt quando foi observado", () => {
    const p = montarPrompt({ ...base, estiloDoFeed: "close de produto com luz quente de forno" });
    expect(p).toContain("close de produto com luz quente de forno");
    expect(p).toMatch(/feed real deste cliente/);
  });

  it("sem feed lido, o prompt NÃO menciona feed — estilo não se inventa", () => {
    const p = montarPrompt({ ...base, estiloDoFeed: "" });
    expect(p).not.toMatch(/feed/i);
  });
});

// O pedido do CEO chegando à ARTE: "os nossos carrosséis têm a ver com os que
// eles fizeram lá?" — a peça nova precisa pertencer à família visual do perfil.
describe("a arte segue o estilo OBSERVADO no feed real do cliente", () => {
  it("lê o estilo da síntese PERSISTIDA (pelo CLIENTE) e o põe no prompt", async () => {
    estiloVisualPersistido.mockResolvedValue("bastidor real com luz natural");
    await produzirArtesPendentes();
    expect(estiloVisualPersistido).toHaveBeenCalledWith("c1");
    expect(generateDesign.mock.calls[0]![0].prompt as string).toContain("bastidor real com luz natural");
  });

  it("sem síntese persistida → prompt sem bloco de feed, e a produção segue", async () => {
    estiloVisualPersistido.mockResolvedValue("");
    const r = await produzirArtesPendentes();
    expect(r.produzidas).toBe(1);
    expect(generateDesign.mock.calls[0]![0].prompt as string).not.toMatch(/feed real/i);
  });

  // O FURO: a chave era `clientRequestId`, e o post de cliente DIRETO nasce com
  // ele NULO (publicacao.ts). No cliente-piloto — o único criado direto — a
  // Onda 2a inteira devolvia "" em silêncio. Nenhum teste pegava: todos usavam
  // "cr1". A chave passa a ser o cliente, que existe nos dois mundos.
  it("cliente DIRETO (clientRequestId nulo) continua consultando a síntese pelo clientId", async () => {
    db.socialPost.findMany.mockResolvedValue([{ ...POST, clientRequestId: null }]);
    estiloVisualPersistido.mockResolvedValue("bastidor real com luz natural");
    await produzirArtesPendentes();
    expect(estiloVisualPersistido).toHaveBeenCalledWith("c1");
    expect(generateDesign.mock.calls[0]![0].prompt as string).toContain("bastidor real com luz natural");
  });

  it("post órfão (sem cliente) não consulta a síntese", async () => {
    db.socialPost.findMany.mockResolvedValue([{ ...POST, clientId: null, clientRequestId: null }]);
    await produzirArtesPendentes();
    expect(estiloVisualPersistido).not.toHaveBeenCalled();
  });

  it("o carrossel também herda o estilo do feed em TODAS as telas", async () => {
    estiloVisualPersistido.mockResolvedValue("paleta quente e produto em close");
    db.socialPost.findMany.mockResolvedValue([{
      ...POST, id: "sp9", format: "carousel",
      scenesJson: JSON.stringify(["[gancho] O forno aceso às quatro da manhã", "[acao] A porta da padaria abrindo para o primeiro cliente"]),
    }]);
    let n = 0;
    guardarArquivo.mockImplementation(async () => ({ ok: true, arquivo: { id: `m${++n}`, fileName: "a.png", sizeBytes: 10, url: `/api/media/m${n}` } }));
    await produzirArtesPendentes();
    for (const call of generateDesign.mock.calls) {
      expect(call[0].prompt as string).toContain("paleta quente e produto em close");
    }
  });
});

describe("o reel: o vídeo do CLIENTE, editado — não uma imagem parada", () => {
  const POST_REEL = { ...POST, id: "sp2", format: "reel" };

  beforeEach(() => {
    db.socialPost.findMany.mockResolvedValue([{ ...POST_REEL }]);
    db.mediaAsset.findFirst.mockResolvedValue({ id: "mv1", storagePath: "a/b.mp4" });
    lerArquivo.mockResolvedValue(Buffer.from("bytes-do-video"));
    editarParaReel.mockResolvedValue({ ok: true, bytes: Buffer.from("reel"), duracaoSegundos: 20 });
  });

  it("edita o material bruto do cliente e amarra ao post", async () => {
    const r = await produzirArtesPendentes();
    expect(editarParaReel).toHaveBeenCalled();
    expect(r.produzidas).toBe(1);
    expect(db.socialPost.update.mock.calls[0]![0].data.mediaUrl).toBe("/api/media/m1");
  });

  it("reel NÃO é gerado por modelo de imagem — o cliente não comprou imagem parada", async () => {
    await produzirArtesPendentes();
    expect(generateDesign).not.toHaveBeenCalled();
  });

  it("cliente sem vídeo enviado não gasta tentativa — só ele pode resolver isso", async () => {
    db.mediaAsset.findFirst.mockResolvedValue(null);
    const r = await produzirArtesPendentes();
    expect(r.desistiram).toEqual(["sp2"]);
    // Sem contador: a próxima rodada tenta de novo assim que o vídeo chegar.
    expect(db.socialPost.update.mock.calls[0]![0].data.lastError).not.toMatch(/^\[arte/);
    expect(db.socialPost.update.mock.calls[0]![0].data.lastError).toMatch(/ainda não enviou/);
  });

  it("vídeo que o ffmpeg recusa GASTA tentativa — aí o problema é do arquivo", async () => {
    editarParaReel.mockResolvedValue({ ok: false, erro: "não consegui ler esse arquivo de vídeo" });
    await produzirArtesPendentes();
    expect(db.socialPost.update.mock.calls[0]![0].data.lastError).toMatch(/^\[arte 1\/3\]/);
  });

  it("o reel é guardado como mp4, não como imagem", async () => {
    await produzirArtesPendentes();
    expect(guardarArquivo.mock.calls[0]![0].mimeType).toBe("video/mp4");
  });
});

describe("carrossel: uma arte POR TELA — repetir a mesma imagem 5x não é carrossel", () => {
  const POST_CARROSSEL = {
    ...POST, id: "sp3", format: "carousel",
    scenesJson: JSON.stringify(["[gancho] O forno aceso às 4h", "[tensao] A massa descansando sem ninguém para assar", "[acao] O pão saindo quentinho para o balcão"]),
  };

  beforeEach(() => {
    db.socialPost.findMany.mockResolvedValue([{ ...POST_CARROSSEL }]);
    let n = 0;
    guardarArquivo.mockImplementation(async (i: { fileName: string }) => ({
      ok: true, arquivo: { id: `m${++n}`, fileName: i.fileName, sizeBytes: 10, url: `/api/media/m${n}` },
    }));
  });

  it("gera uma imagem para cada tela", async () => {
    const r = await produzirArtesPendentes();
    expect(generateDesign).toHaveBeenCalledTimes(3);
    expect(r.produzidas).toBe(1);
  });

  it("cada tela vira o ASSUNTO da sua imagem — não a legenda repetida", async () => {
    await produzirArtesPendentes();
    const prompts = generateDesign.mock.calls.map((c) => c[0].prompt as string);
    expect(prompts[0]).toContain("O forno aceso às 4h");
    expect(prompts[1]).toContain("A massa descansando");
    expect(prompts[2]).toContain("O pão saindo");
  });

  it("as telas são gravadas em ordem, e a capa vira a miniatura do portal", async () => {
    await produzirArtesPendentes();
    const d = db.socialPost.update.mock.calls[0]![0].data;
    // Cada tela guarda DOIS arquivos: a foto (fundo-, para o re-render barato)
    // e a arte composta. O que vai para o post é a arte.
    const artes = guardarArquivo.mock.calls
      .filter((c) => (c[0] as { fileName: string }).fileName.startsWith("carrossel-"))
      .map((c) => (c[0] as { fileName: string }).fileName);
    // `.jpg` desde 08/08/2026: a tela é PEÇA FINAL, vai ao Instagram, e o
    // Instagram só aceita JPEG. A extensão do nome segue o MIME de verdade —
    // ver `nomeDaTelaDoCarrossel` em artes.ts.
    expect(artes).toEqual(["carrossel-sp3-1.jpg", "carrossel-sp3-2.jpg", "carrossel-sp3-3.jpg"]);
    expect(JSON.parse(d.mediaUrlsJson)).toHaveLength(3);
    expect(d.mediaUrl).toBe(JSON.parse(d.mediaUrlsJson)[0]);
  });

  it("uma tela falhou → NADA é gravado. Carrossel com buraco perde o sentido no meio", async () => {
    generateDesign
      .mockResolvedValueOnce({ ok: true, url: PNG })
      .mockResolvedValueOnce({ ok: false, error: "recusado" });
    const r = await produzirArtesPendentes();
    expect(r.produzidas).toBe(0);
    expect(r.falhas[0]!.erro).toMatch(/tela 2 de 3/);
    expect(db.socialPost.update.mock.calls[0]![0].data.mediaUrlsJson).toBeUndefined();
  });

  it("sem telas descritas não vira carrossel", async () => {
    db.socialPost.findMany.mockResolvedValue([{ ...POST_CARROSSEL, scenesJson: "[]" }]);
    const r = await produzirArtesPendentes();
    expect(generateDesign).not.toHaveBeenCalled();
    expect(r.falhas[0]!.erro).toMatch(/telas descritas/);
  });
});

describe("story é VERTICAL — quadrado publicado como story corta a peça no meio", () => {
  beforeEach(() => {
    db.socialPost.findMany.mockResolvedValue([{ ...POST, id: "sp4", format: "story" }]);
  });

  it("pede a imagem em retrato", async () => {
    await produzirArtesPendentes();
    expect(generateDesign.mock.calls[0]![0].size).toBe("portrait");
  });

  it("o prompt sabe que é story e protege as bordas da interface do Instagram", async () => {
    await produzirArtesPendentes();
    const p = generateDesign.mock.calls[0]![0].prompt as string;
    expect(p).toContain("vertical 9:16");
    expect(p).toMatch(/margem generosa/);
  });

  it("feed continua quadrado", async () => {
    db.socialPost.findMany.mockResolvedValue([{ ...POST }]);
    await produzirArtesPendentes();
    expect(generateDesign.mock.calls[0]![0].size).toBe("square");
  });
});

// ── O MOTOR DE MOLDE NA PRODUÇÃO (05/08/2026) ───────────────────────────────
// O modelo faz FOTO; o layout é código. Aqui se testa a fiação: a foto vai para
// o molde, o molde devolve a peça, e a peça é o que o post recebe.
describe("a peça sai do MOLDE — foto da IA + texto por código", () => {
  it("a foto gerada entra no molde, e o post recebe a peça COMPOSTA", async () => {
    await produzirArtesPendentes();
    expect(montarPeca).toHaveBeenCalledTimes(1);
    const pedido = montarPeca.mock.calls[0]![0];
    expect(pedido.formato).toBe("feed");
    // O texto é derivado da legenda AUDITADA, e a fonte vai junto para a trava.
    expect(pedido.fonteAuditada).toBe(POST.caption);
    expect(pedido.titulo).toContain("Pão saindo do forno");
    // A arte gravada é a do molde, não a foto crua.
    const arte = guardarArquivo.mock.calls.find((c) => (c[0] as { fileName: string }).fileName.startsWith("arte-"));
    expect((arte![0] as { bytes: Buffer }).bytes.toString()).toBe("peca-com-texto");
  });

  it("o molde vem da MARCA do cliente — mesma cara em toda peça", async () => {
    await produzirArtesPendentes();
    expect(montarPeca.mock.calls[0]![0].molde).toMatchObject({ origem: "marca", primaria: "#8B4513" });
  });

  it("cliente SEM marca cadastrada recebe o molde NEUTRO, nunca uma cor inventada", async () => {
    db.client.findUnique.mockResolvedValue({ createdAt: new Date("2026-07-01T00:00:00.000Z"), name: "Cliente Novo", industry: "Pet shop", brandBrain: null });
    await produzirArtesPendentes();
    expect(montarPeca.mock.calls[0]![0].molde.origem).toBe("neutro");
  });

  it("a FOTO é guardada à parte — é o que faz o re-render de texto ser barato", async () => {
    await produzirArtesPendentes();
    const nomes = guardarArquivo.mock.calls.map((c) => (c[0] as { fileName: string }).fileName);
    // O FUNDO continua `.png` (intermediário, nunca publicado) e a PEÇA FINAL
    // sai `.jpg` (é ela que a Meta vai buscar). Os dois formatos convivendo
    // nesta linha são o desenho, não um resíduo.
    expect(nomes).toContain(nomeDoFundo("sp1"));
    expect(nomes).toContain("arte-sp1.jpg");
  });

  // ── ESTE TESTE MUDOU DE LADO EM 07/08/2026 ────────────────────────────────
  //
  // Ele afirmava o contrário: "sem navegador para rasterizar, a peça sai SÓ COM
  // A FOTO e o motivo fica escrito", e conferia `mediaUrl` verdadeiro. Estava
  // codificando o fail-open — o teste protegia justamente o comportamento que
  // fazia mal ao cliente.
  //
  // O que ele não sabia: `playwright` morava em `devDependencies`, então em
  // produção `sem_navegador` não era o caso raro, era o caso ÚNICO. Toda peça de
  // todo cliente saiu como foto crua de IA, e este teste chamava isso de
  // "degradação declarada" — verde, o tempo todo.
  //
  // Degradação só é declarada se alguém lê a declaração. `lastError` não é lido
  // por ninguém antes de a peça ir ao portal. Configuração faltando = porta
  // FECHADA.
  it("sem navegador para rasterizar, a peça NÃO é gravada — porta fechada, causa nomeada", async () => {
    montarPeca.mockResolvedValue({ ok: false, motivo: "sem_navegador", erro: "Playwright não está instalado" });
    const r = await produzirArtesPendentes();

    // Peça sem molde não é peça entregue.
    expect(r.produzidas).toBe(0);
    expect(r.falhas).toHaveLength(1);
    expect(r.falhas[0]!.postId).toBe("sp1");
    // A causa sobe acionável: quem lê sabe o que consertar.
    expect(r.falhas[0]!.erro).toMatch(/Chromium/i);
    expect(r.falhas[0]!.erro).toMatch(/dependencies/);

    // E o post NUNCA recebe mediaUrl da foto crua — o coração do conserto.
    const escritas = db.socialPost.update.mock.calls.map((c) => c[0].data as { mediaUrl?: string });
    expect(escritas.some((d) => d.mediaUrl), "foto crua não vira peça publicável").toBeFalsy();
  });

  it("texto barrado pela trava não derruba a peça — ela sai, e o barrado fica dito", async () => {
    montarPeca.mockResolvedValue({
      ok: true, bytes: Buffer.from("so-foto"), largura: 1080, altura: 1350,
      textosPintados: [], encolheu: false, origemDoMolde: "marca",
      textoRecusado: [{ papel: "titulo", motivo: "classe_de_fato_proibida", detalhe: "preço — fica na legenda" }],
    });
    const r = await produzirArtesPendentes();
    expect(r.produzidas).toBe(1);
    expect(db.socialPost.update.mock.calls[0]![0].data.lastError).toMatch(/trava/);
  });

  it("o carrossel monta TODAS as telas com o MESMO molde, e cada tela leva o seu índice", async () => {
    db.socialPost.findMany.mockResolvedValue([{
      ...POST, id: "sp7", format: "carousel",
      scenesJson: JSON.stringify(["[gancho] O forno aceso às 4h", "[tensao] A massa descansando sem ninguém para assar", "[acao] O pão saindo quentinho para o balcão"]),
    }]);
    let n = 0;
    guardarArquivo.mockImplementation(async (i: { fileName: string }) => ({
      ok: true, arquivo: { id: `m${++n}`, fileName: i.fileName, sizeBytes: 10, url: `/api/media/m${n}` },
    }));
    await produzirArtesPendentes();
    expect(montarPeca).toHaveBeenCalledTimes(3);
    const pedidos = montarPeca.mock.calls.map((c) => c[0]);
    // Mesmo molde nas três — é isto que faz a tela 3 ter a cara da tela 1.
    expect(pedidos[1]!.molde).toEqual(pedidos[0]!.molde);
    expect(pedidos[2]!.molde).toEqual(pedidos[0]!.molde);
    expect(pedidos.map((p) => p.indice)).toEqual([
      { atual: 1, total: 3 }, { atual: 2, total: 3 }, { atual: 3, total: 3 },
    ]);
    // Cada tela é auditada contra a PRÓPRIA cena, não contra a legenda do post.
    // E o marcador de PAPEL ("[gancho]") NÃO entra na fonte auditada: ele é
    // declaração de storyboard, não texto do cliente. Se entrasse, a trava de
    // texto passaria a aceitar "[gancho]" como trecho literal da cena.
    expect(pedidos[0]!.fonteAuditada).toBe("O forno aceso às 4h");
    expect(pedidos[1]!.fonteAuditada).toBe("A massa descansando sem ninguém para assar");
    for (const p of pedidos) expect(p.fonteAuditada).not.toMatch(/\[/);
  });
});

describe("re-render de texto: barato por construção", () => {
  const POST_DB = { ...POST, format: "feed" };

  beforeEach(() => {
    db.socialPost.findUnique.mockResolvedValue(POST_DB);
    db.mediaAsset.findFirst.mockResolvedValue({ id: "f1", storagePath: "a/fundo.png" });
    lerArquivo.mockResolvedValue(Buffer.from("foto-original"));
  });

  it("troca a frase SEM chamar o gerador de imagem de novo", async () => {
    const r = await reRenderizarTexto("sp1", "Pão saindo do forno");
    expect(r.ok).toBe(true);
    expect(generateDesign).not.toHaveBeenCalled();
    // Reusa a MESMA foto que já estava no armazenamento.
    expect(montarPeca.mock.calls[0]![0].fundoBytes.toString()).toBe("foto-original");
  });

  it("sem a foto guardada, NÃO gera outra por conta própria — isso custa e não é decisão desta função", async () => {
    db.mediaAsset.findFirst.mockResolvedValue(null);
    const r = await reRenderizarTexto("sp1", "Pão saindo do forno");
    expect(r.ok).toBe(false);
    expect(generateDesign).not.toHaveBeenCalled();
    expect(r.erro).toMatch(/foto original/);
  });

  it("o texto novo continua passando pela trava — o re-render não é porta dos fundos", async () => {
    montarPeca.mockResolvedValue({
      ok: true, bytes: Buffer.from("x"), largura: 1080, altura: 1350, textosPintados: [],
      encolheu: false, origemDoMolde: "marca",
      textoRecusado: [{ papel: "titulo", motivo: "sem_lastro_no_conteudo_auditado", detalhe: "não é trecho literal" }],
    });
    const r = await reRenderizarTexto("sp1", "Frase que ninguém auditou");
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/trava/);
    // E a legenda auditada é que serve de fonte — não o texto que chegou.
    expect(montarPeca.mock.calls[0]![0].fonteAuditada).toBe(POST.caption);
  });
});

describe("a foto do CLIENTE ganha da imagem gerada — mas quem escolhe é gente", () => {
  beforeEach(() => {
    db.socialPost.findUnique.mockResolvedValue({ ...POST });
    db.mediaAsset.findUnique.mockResolvedValue({
      id: "ma1", workspaceId: "ws1", mimeType: "image/jpeg", storagePath: "a/foto.jpg",
    });
    lerArquivo.mockResolvedValue(Buffer.from("foto-do-cliente"));
  });

  it("monta a peça com a foto real dele, sem gastar modelo de imagem", async () => {
    const r = await montarArteComFotoDoCliente("sp1", "ma1");
    expect(r.ok).toBe(true);
    expect(generateDesign).not.toHaveBeenCalled();
    expect(montarPeca.mock.calls[0]![0].fundoBytes.toString()).toBe("foto-do-cliente");
    expect(montarPeca.mock.calls[0]![0].fotoMime ?? montarPeca.mock.calls[0]![0].fundoMime).toBe("image/jpeg");
  });

  it("arquivo de OUTRO workspace não vira peça deste — posse é conferida no servidor", async () => {
    db.mediaAsset.findUnique.mockResolvedValue({
      id: "ma1", workspaceId: "outro", mimeType: "image/jpeg", storagePath: "a/foto.jpg",
    });
    const r = await montarArteComFotoDoCliente("sp1", "ma1");
    expect(r.ok).toBe(false);
    expect(montarPeca).not.toHaveBeenCalled();
  });

  it("a rodada AUTOMÁTICA não sai casando foto do cliente com post — sobra não é evidência de correspondência", async () => {
    // Lição da auditoria de 04/08: o passe posicional montou carrossel com o
    // logo dentro. Enquanto não houver vínculo explícito post↔arquivo, o
    // automático GERA a foto, e a foto do cliente entra por decisão de gente.
    db.mediaAsset.findFirst.mockResolvedValue({ id: "ma9", storagePath: "a/qualquer.jpg", mimeType: "image/jpeg" });
    await produzirArtesPendentes();
    expect(generateDesign).toHaveBeenCalledTimes(1);
    expect(montarPeca.mock.calls[0]![0].fundoBytes.toString()).not.toBe("foto-do-cliente");
  });
});

// ── O VAZAMENTO DE DINHEIRO DE 05/08/2026 ───────────────────────────────────
//
// `baixarImagem` falhando fazia `continue` SEM `marcarErro`. O contador de
// tentativas mora no `lastError`, então ele nunca subia, `MAX_TENTATIVAS_POR_PECA`
// nunca era atingido e a peça voltava na rodada seguinte — a cada 5 minutos,
// para sempre. Um único post com URL inacessível gerava 288 imagens pagas por
// dia e nunca entregava nada.
describe("imagem paga que não vira peça PARA de tentar", () => {
  /** Simula N rodadas seguidas, carregando o `lastError` de uma para a outra —
   *  que é exatamente como o despertador roda na vida real. */
  async function rodadasSeguidas(quantas: number, quebrar: () => void): Promise<{ chamadasDeImagem: number }> {
    let lastError: string | null = null;
    db.socialPost.findMany.mockImplementation(async () => [{ ...POST, lastError }]);
    db.socialPost.update.mockImplementation(async (args: { data: { lastError?: string | null } }) => {
      if ("lastError" in args.data) lastError = args.data.lastError ?? null;
      return {};
    });
    quebrar();
    for (let i = 0; i < quantas; i++) await produzirArtesPendentes();
    return { chamadasDeImagem: generateDesign.mock.calls.length };
  }

  it("download falhando: para de tentar depois de 3 rodadas — não gera para sempre", async () => {
    // A URL responde 404: a imagem foi PAGA e não virou arquivo.
    const r = await rodadasSeguidas(10, () => {
      generateDesign.mockResolvedValue({ ok: true, url: "https://exemplo.invalido/arte.png" });
      vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
    });
    vi.unstubAllGlobals();
    // 3 tentativas, não 10. Sem o conserto seriam 10 — e 288 por dia.
    expect(r.chamadasDeImagem).toBe(3);
  });

  it("a peça que desistiu aparece como desistiu, não como falha silenciosa", async () => {
    db.socialPost.findMany.mockResolvedValue([{ ...POST, lastError: "[arte 3/3] não consegui baixar a imagem gerada" }]);
    const r = await produzirArtesPendentes();
    expect(r.desistiram).toContain("sp1");
    expect(generateDesign).not.toHaveBeenCalled();
  });

  it("falha ao GUARDAR também gasta tentativa — a imagem já foi paga", async () => {
    guardarArquivo.mockResolvedValue({ ok: false, motivo: "cota do workspace estourada" });
    await produzirArtesPendentes();
    const gravado = db.socialPost.update.mock.calls.at(-1)?.[0].data.lastError as string;
    expect(gravado).toMatch(/^\[arte 1\/3\]/);
  });
});

// ── O TETO DIÁRIO DE IMAGENS POR CLIENTE ────────────────────────────────────
// O teto por rodada (6) não é teto de gasto: a rodada dispara a cada 5 minutos.
describe("teto diário de imagens por cliente", () => {
  it("cliente que já bateu o teto do dia não gera mais nenhuma imagem", async () => {
    db.mediaAsset.count.mockResolvedValue(40);
    const r = await produzirArtesPendentes();
    expect(generateDesign).not.toHaveBeenCalled();
    expect(r.semOrcamento).toContain("sp1");
    // Não é falha da peça: não gasta tentativa.
    expect(db.socialPost.update).not.toHaveBeenCalled();
  });

  it("conta as gerações do DIA, por cliente, pelos fundos guardados", async () => {
    db.mediaAsset.count.mockResolvedValue(0);
    await produzirArtesPendentes();
    const where = db.mediaAsset.count.mock.calls[0]![0].where;
    expect(where.clientId).toBe("c1");
    expect(where.fileName).toEqual({ startsWith: "fundo-" });
    expect(where.createdAt.gte.getHours()).toBe(0);
  });

  it("contador ilegível → fail-CLOSED: não gera. Teto que se desliga sozinho não é teto", async () => {
    db.mediaAsset.count.mockRejectedValue(new Error("banco fora"));
    const r = await produzirArtesPendentes();
    expect(generateDesign).not.toHaveBeenCalled();
    expect(r.falhas[0]!.erro).toMatch(/teto di[áa]rio/i);
  });

  it("carrossel que não cabe no que sobrou hoje NÃO começa pela metade", async () => {
    // Cada tela é uma imagem paga: 5 telas com 2 de saldo seria pagar 2 e jogar fora.
    db.mediaAsset.count.mockResolvedValue(38);
    db.socialPost.findMany.mockResolvedValue([{
      ...POST, format: "carousel",
      scenesJson: JSON.stringify(["[gancho] uma", "[tensao] duas", "[prova] tres", "[mecanismo] quatro", "[acao] cinco"]),
    }]);
    const r = await produzirArtesPendentes();
    expect(generateDesign).not.toHaveBeenCalled();
    expect(r.semOrcamento).toContain("sp1");
  });

  it("carrossel acima do teto de telas é recusado ANTES da primeira chamada paga", async () => {
    db.socialPost.findMany.mockResolvedValue([{
      ...POST, format: "carousel",
      scenesJson: JSON.stringify(Array.from({ length: 12 }, (_, i) => `${i + 1}) tela`)),
    }]);
    const r = await produzirArtesPendentes();
    expect(generateDesign).not.toHaveBeenCalled();
    expect(r.falhas[0]!.erro).toMatch(/12 telas/);
  });
});
