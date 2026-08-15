// O ARQUIVO DECLARADO QUE NUNCA CHEGOU — E O RECADO QUE NÃO ENVELHECIA.
//
// ── O QUE O CEO VIU, 15/08/2026 ────────────────────────────────────────────
//
// No portal do CityJobs, ao lado de dois logos em SVG:
//   "Não aceitamos arquivo SVG enviado de fora. Mande em PNG, JPG ou PDF."
//
// Essa frase saiu do código em 09/08/2026 — `git log -S` não a encontra em
// nenhuma linha viva, e `MIMES_SO_INTERNOS`, que a produzia, não existe mais.
// A produção roda `5849727`, que JÁ higieniza SVG (`limparSvg`). O que estava
// na tela era um `DriveMaterial.erro` gravado numa tentativa antiga e
// renderizado desde então como se fosse o estado de hoje.
//
// Dois defeitos, e os dois são de VERDADE na tela, não de segurança:
//
//   1. o retrato contava como "pronto para a equipe usar" o arquivo autorizado
//      pela trava que NUNCA chegou ao disco — enquanto `materiaisDeMarca` exige
//      `mediaAssetId` para entregar qualquer coisa a uma peça;
//   2. nada retentava: a única chamada de importação no repositório inteiro
//      dependia de o cliente declarar o papel de algum arquivo de novo.

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  driveMaterial: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), upsert: vi.fn() },
  googleDriveConnection: { findUnique: vi.fn(), findFirst: vi.fn() },
  mediaAsset: { findMany: vi.fn(), findFirst: vi.fn(), aggregate: vi.fn(), create: vi.fn() },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

const baixar = vi.hoisted(() => ({ baixarMaterial: vi.fn() }));
vi.mock("@/lib/integrations/google/drive", () => baixar);
vi.mock("@/lib/agency/esteira/materiais", () => ({ materialEnviadoPeloCliente: vi.fn(async () => null) }));

import {
  retratoDaEscolha, type ConexaoParaDecidir, type MaterialNoRetrato,
} from "@/lib/integrations/google/escolha-de-material";
import {
  reimportarFalhados, TETO_POR_RODADA, INTERVALO_ENTRE_TENTATIVAS_MS,
} from "@/lib/agency/esteira/material-do-drive";

const AGORA = new Date("2026-08-15T12:00:00Z");
const CONEXAO: ConexaoParaDecidir = {
  status: "connected",
  escopos: "https://www.googleapis.com/auth/drive.file",
  tokenExpiresAt: new Date("2026-08-15T13:00:00Z"),
  temRefresh: true,
};

function logoDeclarado(over: Partial<MaterialNoRetrato> = {}): MaterialNoRetrato {
  return {
    fileId: "f1", nome: "03_city_jobs_circular_principal.svg",
    ehPasta: false, papel: "logo", papelConfirmadoEm: AGORA,
    importado: true, ...over,
  };
}

describe("a tela não pode dizer 'pronto' para arquivo que a peça não recebe", () => {
  it("declarado e NÃO importado não conta como pronto — e a frase diz a verdade", () => {
    const r = retratoDaEscolha(CONEXAO, [logoDeclarado({ importado: false })], AGORA);

    // Este era o defeito: a trava dizia `pode: true` e o retrato somava.
    expect(r.utilizavel, "arquivo sem bytes no disco não é utilizável").toBe(false);
    expect(r.porPapel.logo ?? 0).toBe(0);
    expect(r.naoChegaram).toBe(1);
    expect(r.frase).not.toMatch(/prontos? para a equipe usar/);
    // A falha é da casa, e a frase não pode culpar quem já fez a parte dele.
    expect(r.frase).toContain("a falha é nossa");
  });

  it("com um importado e um preso, a conta separa os dois", () => {
    const r = retratoDaEscolha(CONEXAO, [
      logoDeclarado({ importado: true }),
      logoDeclarado({ fileId: "f2", nome: "02_quadrado_invertido.svg", papel: "logo", importado: false }),
    ], AGORA);
    expect(r.porPapel.logo).toBe(1);
    expect(r.naoChegaram).toBe(1);
    expect(r.utilizavel).toBe(true);
    expect(r.frase).toContain("ainda não chegaram");
  });

  it("tudo importado volta a ser a frase boa — o conserto não estragou o caminho feliz", () => {
    const r = retratoDaEscolha(CONEXAO, [logoDeclarado()], AGORA);
    expect(r.naoChegaram).toBe(0);
    expect(r.frase).toMatch(/prontos para a equipe usar/);
  });
});

describe("nenhum estado prende um arquivo para sempre — retentativa com prazo e teto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.driveMaterial.update.mockResolvedValue({});
  });

  it("o TETO existe: uma rodada não varre a conta inteira", async () => {
    db.driveMaterial.findMany.mockResolvedValue([]);
    await reimportarFalhados("cli-1", AGORA);
    expect(db.driveMaterial.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: TETO_POR_RODADA }),
    );
    // E só olha o que o cliente JÁ declarou: material sem papel é pergunta
    // aberta, não falha a retentar.
    const args = db.driveMaterial.findMany.mock.calls[0]![0] as { where: Record<string, unknown> };
    expect(args.where.mediaAssetId).toBeNull();
    expect(args.where.papelConfirmadoEm).toEqual({ not: null });
  });

  it("o PRAZO existe: falha recente não é retentada em laço", async () => {
    db.driveMaterial.findMany.mockResolvedValue([{
      id: "dm1", nome: "logo.svg", erro: "falhou agora há pouco",
      updatedAt: new Date(AGORA.getTime() - 60_000), // 1 min atrás
    }]);

    const r = await reimportarFalhados("cli-1", AGORA);

    expect(r.adiados).toBe(1);
    expect(r.recuperados).toBe(0);
    // A prova de que é PRAZO e não aviso: nenhuma busca saiu.
    expect(db.driveMaterial.findUnique).not.toHaveBeenCalled();
    expect(baixar.baixarMaterial).not.toHaveBeenCalled();
  });

  it("passado o prazo, ele TENTA DE NOVO sem o cliente clicar em nada", async () => {
    db.driveMaterial.findMany.mockResolvedValue([{
      id: "dm1", nome: "03_city_jobs_circular_principal.svg", erro: "recado velho",
      updatedAt: new Date(AGORA.getTime() - INTERVALO_ENTRE_TENTATIVAS_MS - 1),
    }]);
    // A importação encontra o material e o dá por já resolvido.
    db.driveMaterial.findUnique.mockResolvedValue({ id: "dm1", mediaAssetId: "med_ok" });

    const r = await reimportarFalhados("cli-1", AGORA);

    expect(r.recuperados).toBe(1);
    expect(r.aindaFalhando).toHaveLength(0);
  });

  it("se falhar de novo, o recado ENVELHECE — nunca fica o de uma versão morta", async () => {
    db.driveMaterial.findMany.mockResolvedValue([{
      id: "dm1", nome: "logo.svg",
      erro: "Não aceitamos arquivo SVG enviado de fora. Mande em PNG, JPG ou PDF.",
      updatedAt: new Date(AGORA.getTime() - INTERVALO_ENTRE_TENTATIVAS_MS - 1),
    }]);
    db.driveMaterial.findUnique.mockResolvedValue({
      id: "dm1", mediaAssetId: null, connectionId: "c1", origem: "drive",
      fileId: "f1", nome: "logo.svg", ehPasta: false, papel: "logo", papelConfirmadoEm: AGORA,
    });
    baixar.baixarMaterial.mockResolvedValue({ ok: false, erro: "o Google não respondeu" });

    const r = await reimportarFalhados("cli-1", AGORA);

    expect(r.aindaFalhando).toHaveLength(1);
    // O motivo devolvido é o de AGORA, não o gravado em agosto.
    expect(r.aindaFalhando[0]!.erro).toBe("o Google não respondeu");

    // E o que fica gravado carrega a data da última tentativa — é isso que
    // impede o portal de mostrar para sempre a frase de um sistema que não
    // existe mais.
    const ultimaGravacao = db.driveMaterial.update.mock.calls.at(-1)![0] as { data: { erro: string } };
    expect(ultimaGravacao.data.erro).toContain("o Google não respondeu");
    expect(ultimaGravacao.data.erro).toContain("última tentativa");
    expect(ultimaGravacao.data.erro).not.toContain("Não aceitamos arquivo SVG");
  });

  it("banco fora do ar devolve rodada vazia, não explode a batida do relógio", async () => {
    db.driveMaterial.findMany.mockRejectedValue(new Error("db down"));
    const r = await reimportarFalhados("cli-1", AGORA);
    expect(r).toEqual({ recuperados: 0, aindaFalhando: [], adiados: 0 });
  });
});
