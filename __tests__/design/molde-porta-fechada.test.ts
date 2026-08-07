// A PORTA FECHADA DO MOLDE — as duas metades.
//
// O incidente: até 07/08/2026 o `playwright` morava em `devDependencies`. Em
// produção o pacote NUNCA foi instalado, então `renderizarHtml` devolvia
// `sem_navegador` em toda peça de todo cliente. E `comporComMolde` tratava isso
// como "degradação declarada": gravava a FOTO CRUA da IA, punha a explicação em
// `lastError` — campo que ninguém lê antes de publicar — e relatava sucesso.
//
// O resultado é o pior formato possível de falha: silenciosa, universal e
// disfarçada de entrega. O cliente pagante recebeu foto de IA sem tipografia,
// sem selo e sem assinatura, e o sistema disse que estava tudo certo.
//
// Regra da casa: CONFIGURAÇÃO FALTANDO = PORTA FECHADA. Ferramenta que falta é
// problema da agência, não um entregável de qualidade menor.
//
// As duas metades, que é o que impede este teste de virar decoração:
//   ⛔ METADE 1 — sem navegador, a peça NÃO é gravada e a causa sobe nomeada;
//   ✅ METADE 2 — com navegador, a peça É gravada, com o molde aplicado. Sem
//      esta metade, "fechar a porta" poderia ser implementado como "reprovar
//      sempre", que passa na metade 1 e não entrega nada.

import { describe, it, expect, vi, beforeEach } from "vitest";

const montarPeca = vi.fn();
const guardarArquivo = vi.fn();
const lerArquivo = vi.fn();
const atualizarPost = vi.fn();

vi.mock("@/lib/agency/design/peca", () => ({ montarPeca }));
vi.mock("@/lib/agency/media/armazenamento", () => ({ guardarArquivo, lerArquivo }));
vi.mock("@/lib/ai/design-engine", () => ({ generateDesign: vi.fn() }));
vi.mock("@/lib/agency/execution/leitura-do-cliente", () => ({
  estiloVisualPersistido: vi.fn().mockResolvedValue(null),
  estiloVistoPersistido: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/db/client", () => ({
  prisma: {
    socialPost: {
      findUnique: vi.fn(async () => ({
        id: "sp-1", workspaceId: "ws-1", clientId: "cli-1", clientRequestId: null,
        format: "feed", caption: "Promoção de inverno na loja toda", pillar: "oferta",
      })),
      update: atualizarPost,
    },
    mediaAsset: {
      findUnique: vi.fn(async () => ({
        id: "ma-1", workspaceId: "ws-1", mimeType: "image/png", storagePath: "/x/foto.png",
      })),
    },
    client: { findUnique: vi.fn(async () => ({ id: "cli-1", name: "Loja Teste" })) },
  },
}));

const { montarArteComFotoDoCliente } = await import("@/lib/agency/execution/artes");

const FOTO_CRUA = Buffer.from("FOTO-CRUA-DA-IA");
const PECA_COM_MOLDE = Buffer.from("PECA-COM-TIPOGRAFIA-SELO-E-ASSINATURA");

beforeEach(() => {
  vi.clearAllMocks();
  lerArquivo.mockResolvedValue(FOTO_CRUA);
  guardarArquivo.mockResolvedValue({ ok: true, arquivo: { id: "arq-1" } });
});

describe("⛔ METADE 1 — sem navegador, a porta FECHA", () => {
  it("não grava a peça, não publica, e diz a causa com todas as letras", async () => {
    montarPeca.mockResolvedValue({
      ok: false, motivo: "sem_navegador", erro: "Playwright não está instalado neste ambiente.",
    });

    const r = await montarArteComFotoDoCliente("sp-1", "ma-1");

    expect(r.ok, "peça sem molde NÃO pode ser entregue").toBe(false);
    expect(r.mediaUrl, "nada de link de mídia para uma peça que não existe").toBeUndefined();
    // A causa tem de ser acionável: quem lê o erro precisa saber o que consertar.
    expect(r.erro).toMatch(/Chromium/i);
    expect(r.erro).toMatch(/dependencies/);
    expect(r.erro).toMatch(/railpack/i);

    // O CORAÇÃO DA PROVA: a foto crua não chegou nem ao armazenamento nem ao
    // post. Era exatamente isto que acontecia antes — e passava por sucesso.
    expect(guardarArquivo, "a foto crua NÃO pode ser guardada como peça").not.toHaveBeenCalled();
    expect(atualizarPost, "o post NÃO pode receber mediaUrl").not.toHaveBeenCalled();
  });

  it("navegador quebrado e timeout fecham a porta pelo mesmo motivo", async () => {
    for (const motivo of ["erro_do_navegador", "timeout"] as const) {
      vi.clearAllMocks();
      lerArquivo.mockResolvedValue(FOTO_CRUA);
      guardarArquivo.mockResolvedValue({ ok: true, arquivo: { id: "arq-1" } });
      montarPeca.mockResolvedValue({ ok: false, motivo, erro: "falhou" });

      const r = await montarArteComFotoDoCliente("sp-1", "ma-1");

      expect(r.ok, motivo).toBe(false);
      expect(r.erro, motivo).toContain(motivo);
      expect(guardarArquivo, motivo).not.toHaveBeenCalled();
      expect(atualizarPost, motivo).not.toHaveBeenCalled();
    }
  });
});

describe("✅ METADE 2 — com navegador, a peça SAI com o molde", () => {
  it("grava os bytes DO MOLDE, não os da foto crua, e publica o link", async () => {
    montarPeca.mockResolvedValue({
      ok: true,
      bytes: PECA_COM_MOLDE,
      largura: 1080, altura: 1350,
      textosPintados: ["Promoção de inverno na loja toda"],
      textoRecusado: [],
      encolheu: false,
      origemDoMolde: "marca",
      lacunasDoMolde: [],
    });

    const r = await montarArteComFotoDoCliente("sp-1", "ma-1");

    expect(r.ok).toBe(true);
    expect(r.mediaUrl).toBe("/api/media/arq-1");

    // Comparação de BYTES, não olhômetro: o que foi guardado é o resultado do
    // molde, e comprovadamente NÃO é a foto que entrou.
    const guardado = guardarArquivo.mock.calls[0]![0] as { bytes: Buffer };
    expect(guardado.bytes.equals(PECA_COM_MOLDE)).toBe(true);
    expect(guardado.bytes.equals(FOTO_CRUA), "a foto crua não é a peça").toBe(false);

    expect(atualizarPost).toHaveBeenCalledTimes(1);
    const escrita = atualizarPost.mock.calls[0]![0] as { data: { mediaUrl: string; lastError: string | null } };
    expect(escrita.data.mediaUrl).toBe("/api/media/arq-1");
    // Peça boa não carrega recado de FALHA DE MOLDE. (Ela ainda pode carregar o
    // aviso de molde NEUTRO — este cliente de teste não tem marca cadastrada —
    // e esse aviso é sobre a identidade que falta no cadastro, não sobre o
    // rasterizador. São coisas diferentes e não podem ser confundidas.)
    expect(escrita.data.lastError ?? "").not.toMatch(/sem_navegador|só com a foto|sem camada de texto/);
  });

  it("falha de CONTEÚDO (o texto não coube) continua degradando declarado — a porta é só para a FERRAMENTA", async () => {
    // A distinção que evita o exagero: "texto_cortado" é característica do
    // material, não ausência de infraestrutura. A peça sai como foto, com o
    // motivo dito — e o texto reprovado nunca chega à arte.
    montarPeca.mockResolvedValue({ ok: false, motivo: "texto_cortado", erro: "o título não coube" });

    const r = await montarArteComFotoDoCliente("sp-1", "ma-1");

    expect(r.ok).toBe(true);
    expect(guardarArquivo).toHaveBeenCalledTimes(1);
    const escrita = atualizarPost.mock.calls[0]![0] as { data: { lastError: string | null } };
    expect(escrita.data.lastError).toContain("texto_cortado");
  });
});
