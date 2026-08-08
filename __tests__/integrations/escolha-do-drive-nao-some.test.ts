// A ESCOLHA DO CLIENTE NÃO SOME EM SILÊNCIO — AS DUAS METADES.
//
// ── O INCIDENTE (08/08/2026) ────────────────────────────────────────────────
//
// O CEO abriu o portal da Foocci, clicou em "Escolher arquivos", passou pelo
// seletor do Google e escolheu o material. Medido em produção: **1 arquivo ao
// alcance do app no Google, 0 linhas em `DriveMaterial`.** O Google concedeu, a
// casa perdeu a escolha, e a tela devolveu ao cliente a afirmação de que ele não
// tinha escolhido nada ("a Dioli não alcança NENHUM arquivo seu").
//
// O que produzia o silêncio: a rota devolvia **HTTP 200** com zero gravados, e o
// campo `proximoPasso` — que a tela mostra em VERDE — dizia "Você escolheu
// apenas pastas". Sucesso verde por cima de uma escrita que não aconteceu.
//
// ── AS DUAS METADES QUE ESTE ARQUIVO PROVA ──────────────────────────────────
//
//   1. escolha feita → entra, e a tela pede o próximo passo;
//   2. gravação impedida → a resposta é ERRO, com todas as letras, e **em
//      nenhuma hipótese** diz ao cliente que ele não escolheu nada.
//
// Sem a metade 2, o teste passaria com a rota velha — que é o mesmo que não ter
// teste.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const db = vi.hoisted(() => ({
  googleDriveConnection: { findUnique: vi.fn() },
  driveMaterial: { findMany: vi.fn(), create: vi.fn() },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

const google = vi.hoisted(() => ({ exercitarDrive: vi.fn() }));
vi.mock("@/lib/integrations/google/verificacao-do-drive", () => google);

import {
  vereditoDaEscolha,
  FRASE_ESCOLHA_PERDIDA,
} from "@/lib/integrations/google/escolha-de-material";
import { reconciliarDrive } from "@/lib/integrations/google/reconciliacao-do-drive";

const ARQUIVO = { ehPasta: false };
const PASTA = { ehPasta: true };

describe("o veredito da escolha — zero gravado nunca é sucesso", () => {
  it("METADE 1: a escolha que ENTRA devolve 200 e pede o próximo passo", () => {
    const v = vereditoDaEscolha([ARQUIVO], []);
    expect(v.status).toBe(200);
    expect(v.ok).toBe(true);
    expect(v.erro).toBeNull();
    expect(v.aviso).toBeNull();
    expect(v.proximoPasso).toContain("diga o que é cada arquivo");
  });

  it("METADE 2: gravação IMPEDIDA devolve 502, declara o erro e NÃO diz que o cliente não escolheu nada", () => {
    const v = vereditoDaEscolha([], [{ nome: "logo.png", motivo: "não consegui guardar a escolha aqui do nosso lado" }]);

    expect(v.status).toBe(502);
    expect(v.ok).toBe(false);
    // A tela do cliente NUNCA recebe frase verde quando nada foi gravado.
    expect(v.proximoPasso).toBeNull();
    expect(v.erro).toContain(FRASE_ESCOLHA_PERDIDA);
    // O arquivo perdido é nomeado — senão o cliente não sabe o que refazer.
    expect(v.erro).toContain("logo.png");
    // E o texto exato do bug: "apenas pastas" era o que aparecia, em verde,
    // para um PNG que nunca foi gravado.
    expect(v.erro).not.toContain("apenas pastas");
  });

  it("nada gravado e nenhuma recusa nomeada AINDA É FALHA — fail-closed", () => {
    const v = vereditoDaEscolha([], []);
    expect(v.status).toBe(502);
    expect(v.ok).toBe(false);
    expect(v.proximoPasso).toBeNull();
    expect(v.erro).toBe(FRASE_ESCOLHA_PERDIDA);
  });

  it("gravação PARCIAL não passa em branco: nomeia o que ficou de fora", () => {
    const v = vereditoDaEscolha([ARQUIVO], [{ nome: "manual.pdf", motivo: "o Google recusou" }]);
    expect(v.status).toBe(200);
    expect(v.ok).toBe(true);
    expect(v.aviso).toContain("manual.pdf");
    expect(v.aviso).toContain("1 arquivo(s)");
  });

  it("'apenas pastas' só é dito quando pasta foi o que REALMENTE entrou", () => {
    expect(vereditoDaEscolha([PASTA], []).proximoPasso).toContain("apenas pastas");
    expect(vereditoDaEscolha([PASTA, ARQUIVO], []).proximoPasso).toContain("diga o que é cada arquivo");
  });
});

// ─── A METADE DO NAVEGADOR ──────────────────────────────────────────────────
//
// A outra causa do silêncio de 08/08 estava no cliente: o callback do seletor do
// Google fazia `await fetch(...)` e `await res.json()` SEM try/catch. Rede
// oscilando, servidor reiniciando num deploy, ou 502 do proxy devolvendo HTML —
// a promessa rejeitava e morria ali: nenhuma linha no banco, nenhuma palavra na
// tela. É defeito de arquivo, não de função pura, e por isso o portão é sobre o
// ARQUIVO. Portão que não roda não protege nada.

describe("o callback do seletor no navegador nunca morre calado", () => {
  const fonte = readFileSync(
    join(process.cwd(), "components/portal/DriveDoCliente.tsx"),
    "utf8",
  );

  it("nenhum `res.json()` solto: todo corpo passa pelo leitor que não lança", () => {
    // Só CÓDIGO: as linhas de comentário citam `res.json()` de propósito, para
    // contar o incidente, e não podem reprovar o portão.
    const codigo = fonte
      .split("\n")
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join("\n");
    const ocorrencias = codigo.match(/res\.json\(\)/g) ?? [];
    expect(ocorrencias).toHaveLength(1);
    // E a única está dentro do helper `corpo`, que tem try/catch.
    const helper = fonte.slice(fonte.indexOf("async function corpo"), fonte.indexOf("function carregarScript"));
    expect(helper).toContain("res.json()");
    expect(helper).toContain("catch");
  });

  it("o callback do Picker tem captura de falha e frase para o cliente", () => {
    const inicio = fonte.indexOf(".setCallback(");
    expect(inicio).toBeGreaterThan(-1);
    const bloco = fonte.slice(inicio, fonte.indexOf(".build()", inicio));

    expect(bloco).toContain("try {");
    expect(bloco).toContain("} catch {");
    // O caminho de falha termina numa frase, e a frase não culpa o cliente nem
    // afirma que ele não escolheu nada.
    expect(bloco).toContain("NÃO foi registrada");
    expect(bloco).not.toMatch(/você não escolheu/i);
  });

  it("o aviso de gravação PARCIAL vai em vermelho, não em verde", () => {
    const inicio = fonte.indexOf(".setCallback(");
    const bloco = fonte.slice(inicio, fonte.indexOf(".build()", inicio));
    // `j.aviso` só existe quando algo se perdeu — e ele nunca pode cair no ramo
    // `ok: true`, que é o que pinta a faixa de verde.
    const ramoDoAviso = bloco.slice(bloco.indexOf("j.aviso"), bloco.indexOf("j.aviso") + 260);
    expect(ramoDoAviso).toContain("ok: false");
  });
});

describe("a reconciliação — trazer para dentro sem inventar o papel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.googleDriveConnection.findUnique.mockResolvedValue({ id: "cx1", workspaceId: "w1", clientId: "foocci" });
    db.driveMaterial.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: "m1", ...data }));
  });

  it("traz o arquivo que o Google concede e a casa não tem — PENDENTE DE TRIAGEM", async () => {
    google.exercitarDrive.mockResolvedValue({
      ok: true,
      alcancadosNoGoogle: 1,
      arquivos: [{ id: "f1", nome: "ChatGPT Image 7_08_2026.png", mimeType: "image/png", tamanhoBytes: 1736894 }],
    });
    db.driveMaterial.findMany.mockResolvedValue([]);

    const r = await reconciliarDrive("cx1");

    expect(r.indisponivel).toBeNull();
    expect(r.trazidos).toHaveLength(1);
    expect(r.trazidos[0].fileId).toBe("f1");

    // ── O PONTO: a linha nasce SEM papel. Um PNG de nome opaco não vira logo
    // porque seria conveniente — quem declara continua sendo o cliente.
    const data = db.driveMaterial.create.mock.calls[0][0].data;
    expect(data.papel).toBeUndefined();
    expect(data.papelConfirmadoEm).toBeUndefined();
    expect(data.papelSugerido).toBeNull(); // o nome não diz nada, e a casa não chuta
    expect(data.origem).toBe("drive");
  });

  it("NÃO duplica o que já está guardado", async () => {
    google.exercitarDrive.mockResolvedValue({
      ok: true, alcancadosNoGoogle: 1,
      arquivos: [{ id: "f1", nome: "logo.png", mimeType: "image/png", tamanhoBytes: 10 }],
    });
    db.driveMaterial.findMany.mockResolvedValue([{ fileId: "f1" }]);

    const r = await reconciliarDrive("cx1");
    expect(r.trazidos).toHaveLength(0);
    expect(r.jaTinha).toBe(1);
    expect(db.driveMaterial.create).not.toHaveBeenCalled();
  });

  it("Google indisponível NÃO vira 'não havia nada a trazer'", async () => {
    google.exercitarDrive.mockResolvedValue({ ok: false, codigo: 401, mensagem: "invalid_grant" });
    const r = await reconciliarDrive("cx1");

    expect(r.indisponivel).toContain("invalid_grant");
    expect(r.trazidos).toHaveLength(0);
    expect(db.driveMaterial.create).not.toHaveBeenCalled();
  });

  it("não consigo ler o que já existe → não gravo nada (senão duplicaria às cegas)", async () => {
    google.exercitarDrive.mockResolvedValue({
      ok: true, alcancadosNoGoogle: 1,
      arquivos: [{ id: "f1", nome: "logo.png", mimeType: "image/png", tamanhoBytes: 10 }],
    });
    db.driveMaterial.findMany.mockRejectedValue(new Error("sem tabela"));

    const r = await reconciliarDrive("cx1");
    expect(r.indisponivel).toContain("já guardado");
    expect(db.driveMaterial.create).not.toHaveBeenCalled();
  });

  it("a escrita que falha vira FALHA NOMEADA, não linha inventada", async () => {
    google.exercitarDrive.mockResolvedValue({
      ok: true, alcancadosNoGoogle: 1,
      arquivos: [{ id: "f1", nome: "logo.png", mimeType: "image/png", tamanhoBytes: 10 }],
    });
    db.driveMaterial.findMany.mockResolvedValue([]);
    db.driveMaterial.create.mockRejectedValue(new Error("volume cheio"));

    const r = await reconciliarDrive("cx1");
    expect(r.trazidos).toHaveLength(0);
    expect(r.falhas).toHaveLength(1);
    expect(r.falhas[0].nome).toBe("logo.png");
  });
});
