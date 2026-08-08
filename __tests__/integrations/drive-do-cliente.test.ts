// O DRIVE DO CLIENTE — AS DUAS METADES.
//
// A metade que todo mundo testa: o arquivo autorizado é lido.
// A metade que decide se a trava é trava: o arquivo NÃO autorizado é recusado
// **sem que uma única requisição saia**. Se a recusa acontecesse depois do
// fetch, a proteção dependeria de o Google dizer não por nós — e um dia ele
// diria sim.
//
// Por isso o `fetch` global é espionado e a asserção é `expect(fetch).not
// .toHaveBeenCalled()`. É a diferença entre trava e aviso.

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  driveMaterial: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  googleDriveConnection: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  mediaAsset: { findMany: vi.fn() },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/security/crypto", () => ({
  encryptSecret: (s: string) => `enc:${s}`,
  decryptSecret: (s: string) => (s.startsWith("enc:") ? s.slice(4) : null),
}));

import { baixarMaterial } from "@/lib/integrations/google/drive";
import {
  materialAutorizado,
  retratoDaEscolha,
  FRASE_ZERO_MATERIAL,
  sugerirPapel,
  papelValido,
  ESCOPO_DRIVE,
  type ConexaoParaDecidir,
  type MaterialParaDecidir,
} from "@/lib/integrations/google/escolha-de-material";

const AGORA = new Date("2026-08-07T12:00:00Z");
const DAQUI_A_UMA_HORA = new Date("2026-08-07T13:00:00Z");

const CONEXAO_BOA: ConexaoParaDecidir = {
  status: "connected",
  escopos: ESCOPO_DRIVE,
  tokenExpiresAt: DAQUI_A_UMA_HORA,
  temRefresh: true,
};

function material(over: Partial<MaterialParaDecidir> = {}): MaterialParaDecidir {
  return {
    fileId: "file-1",
    nome: "logo-foocci.png",
    ehPasta: false,
    papel: "logo",
    papelConfirmadoEm: AGORA,
    ...over,
  };
}

describe("a trava do material do Drive", () => {
  it("AUTORIZA o arquivo que o cliente escolheu E declarou", () => {
    const v = materialAutorizado(CONEXAO_BOA, material(), AGORA);
    expect(v.pode).toBe(true);
    expect(v.papel).toBe("logo");
  });

  it("RECUSA o arquivo que o cliente escolheu mas NÃO declarou — o caso IMG_2831.jpg", () => {
    const v = materialAutorizado(CONEXAO_BOA, material({ nome: "IMG_2831.jpg", papel: null, papelConfirmadoEm: null }), AGORA);
    expect(v.pode).toBe(false);
    expect(v.motivo).toBe("papel_nao_declarado");
    // A frase vai para a tela do cliente: tem que dizer que FALTA, não "erro".
    expect(v.recado).toContain("falta material");
  });

  it("RECUSA quando o cliente entregou uma PASTA em vez dos arquivos", () => {
    const v = materialAutorizado(CONEXAO_BOA, material({ nome: "Campanha Junho", ehPasta: true }), AGORA);
    expect(v.pode).toBe(false);
    expect(v.motivo).toBe("e_uma_pasta");
    expect(v.recado).toContain("escolher os arquivos");
  });

  it("RECUSA sem conexão nenhuma — e nunca devolve neutro", () => {
    const v = materialAutorizado(null, material(), AGORA);
    expect(v.pode).toBe(false);
    expect(v.motivo).toBe("sem_conexao");
  });

  it("RECUSA quando o Google não concedeu o escopo drive.file", () => {
    const v = materialAutorizado({ ...CONEXAO_BOA, escopos: "https://www.googleapis.com/auth/business.manage" }, material(), AGORA);
    expect(v.pode).toBe(false);
    expect(v.motivo).toBe("escopo_insuficiente");
  });

  it("RECUSA quando o token venceu e não há refresh — o app em 'Teste' no 8º dia", () => {
    const v = materialAutorizado(
      { ...CONEXAO_BOA, tokenExpiresAt: new Date("2026-08-07T11:00:00Z"), temRefresh: false },
      material(),
      AGORA,
    );
    expect(v.pode).toBe(false);
    expect(v.motivo).toBe("conexao_expirada");
    // Verdade, não erro genérico.
    expect(v.recado).toContain("reconectar");
  });

  it("NÃO recusa token vencido quando existe refresh — quem renova é a camada de baixo", () => {
    const v = materialAutorizado(
      { ...CONEXAO_BOA, tokenExpiresAt: new Date("2026-08-07T11:00:00Z"), temRefresh: true },
      material(),
      AGORA,
    );
    expect(v.pode).toBe(true);
  });

  it("RECUSA papel que não está na lista fechada", () => {
    const v = materialAutorizado(CONEXAO_BOA, material({ papel: "foto_do_cachorro" }), AGORA);
    expect(v.pode).toBe(false);
    expect(v.motivo).toBe("papel_invalido");
    expect(papelValido("foto_do_cachorro")).toBeNull();
  });
});

describe("o palpite do papel — sugestão, nunca autorização", () => {
  it("reconhece o que o nome diz", () => {
    expect(sugerirPapel("logo-foocci.png", "image/png")).toBe("logo");
    expect(sugerirPapel("manual-de-marca.pdf", "application/pdf")).toBe("manual_de_marca");
    expect(sugerirPapel("print-do-app.png", "image/png")).toBe("captura_de_tela");
    expect(sugerirPapel("fachada-da-loja.jpg", "image/jpeg")).toBe("foto_local");
    expect(sugerirPapel("anuncio-que-funcionou.png", "image/png")).toBe("referencia");
  });

  it("devolve NULO quando o nome não diz nada — e é a resposta certa", () => {
    // Adivinhar aqui produz peça com a foto errada, que é pior que peça sem foto.
    expect(sugerirPapel("IMG_2831.jpg", "image/jpeg")).toBeNull();
    expect(sugerirPapel("DSC00042.JPG", "image/jpeg")).toBeNull();
    expect(sugerirPapel("Sem título.png", "image/png")).toBeNull();
  });
});

describe("o retrato da tela — nunca diz 'pronto' enquanto falta", () => {
  it("diz FALTA ESCOLHER enquanto houver arquivo sem declaração", () => {
    const r = retratoDaEscolha(
      CONEXAO_BOA,
      [material(), material({ fileId: "f2", nome: "IMG_1.jpg", papel: null, papelConfirmadoEm: null })],
      AGORA,
    );
    expect(r.faltaDizerOQueE).toBe(1);
    expect(r.frase).toContain("Falta dizer o que é");
    // Existe UM utilizável — mas o estado ainda não é "pronto".
    expect(r.utilizavel).toBe(true);
    expect(r.frase).not.toContain("prontos para a equipe");
  });

  // ⚠️ TRAVA REESCRITA EM 08/08/2026, com o motivo declarado.
  //
  // A letra antiga era `expect(r.frase).toContain("nenhum arquivo escolhido")`
  // — ela congelava a frase "Conectado, mas nenhum arquivo escolhido ainda.".
  // Essa frase descreve o ESTADO e esconde a CONSEQUÊNCIA, e o CEO leu "Drive
  // conectado" no portal do CityJobs concluindo que já tinha mandado o logo da
  // Foocci por ali. Medido em produção no mesmo dia: 3 clientes com Drive
  // conectado e **0 arquivos escolhidos na agência inteira**.
  //
  // O invariante nunca foi a frase: é "conectado sem material não pode passar
  // por pronto". É isso que esta trava passa a exigir — e agora ela também
  // exige que a consequência esteja escrita, que é a metade que faltava.
  it("conectado e sem nada escolhido NÃO é 'conectado ✓' — e a tela diz a consequência", () => {
    const r = retratoDaEscolha(CONEXAO_BOA, [], AGORA);
    expect(r.utilizavel).toBe(false);
    expect(r.frase).toBe(FRASE_ZERO_MATERIAL);
    // Não basta descrever o estado: tem que dizer que a agência não tem nada.
    expect(r.frase).toMatch(/não alcança NENHUM arquivo/);
    expect(r.frase).not.toMatch(/prontos? para a equipe/);
  });

  it("só pasta escolhida = a casa não tem material", () => {
    const r = retratoDaEscolha(CONEXAO_BOA, [material({ ehPasta: true, nome: "Marca" })], AGORA);
    expect(r.utilizavel).toBe(false);
    expect(r.pastas).toBe(1);
    expect(r.frase).toContain("arquivos de dentro");
  });

  it("conexão expirada diz a verdade em vez de erro genérico", () => {
    const r = retratoDaEscolha({ ...CONEXAO_BOA, status: "expired" }, [material()], AGORA);
    expect(r.frase).toContain("expirou");
    expect(r.frase).toContain("Reconecte");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// A METADE QUE IMPORTA: a recusa não gasta rede.
// ═══════════════════════════════════════════════════════════════════════════

describe("baixarMaterial — as duas metades, com a rede espionada", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  it("LÊ o arquivo autorizado — e só então chama o Google", async () => {
    db.driveMaterial.findUnique.mockResolvedValue({
      id: "dm1", connectionId: "cx1", fileId: "file-1",
      nome: "logo-foocci.png", mimeType: "image/png", ehPasta: false,
      papel: "logo", papelConfirmadoEm: AGORA,
    });
    db.googleDriveConnection.findUnique.mockResolvedValue({
      id: "cx1", workspaceId: "w1", clientId: "c1", status: "connected",
      escopos: ESCOPO_DRIVE, tokenExpiresAt: new Date(Date.now() + 3600_000),
      accessTokenEncrypted: "enc:token-vivo", refreshTokenEncrypted: "enc:refresh",
    });
    fetchSpy.mockResolvedValue({
      ok: true, status: 200,
      headers: new Headers({ "content-length": "12" }),
      arrayBuffer: async () => new TextEncoder().encode("bytes do png").buffer,
    });

    const r = await baixarMaterial("dm1");
    expect(r.ok).toBe(true);
    expect(r.dados?.nome).toBe("logo-foocci.png");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    // Sem escrita: só GET com alt=media.
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toContain("alt=media");
    expect((init as RequestInit | undefined)?.method ?? "GET").toBe("GET");
  });

  it("RECUSA o arquivo não declarado SEM CHAMAR A REDE — a trava é trava", async () => {
    db.driveMaterial.findUnique.mockResolvedValue({
      id: "dm2", connectionId: "cx1", fileId: "file-2",
      nome: "IMG_2831.jpg", mimeType: "image/jpeg", ehPasta: false,
      papel: null, papelConfirmadoEm: null,
    });
    db.googleDriveConnection.findUnique.mockResolvedValue({
      id: "cx1", workspaceId: "w1", clientId: "c1", status: "connected",
      escopos: ESCOPO_DRIVE, tokenExpiresAt: new Date(Date.now() + 3600_000),
      accessTokenEncrypted: "enc:token-vivo", refreshTokenEncrypted: "enc:refresh",
    });

    const r = await baixarMaterial("dm2");
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe("papel_nao_declarado");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("RECUSA pasta SEM CHAMAR A REDE", async () => {
    db.driveMaterial.findUnique.mockResolvedValue({
      id: "dm3", connectionId: "cx1", fileId: "folder-1",
      nome: "Campanhas", mimeType: "application/vnd.google-apps.folder", ehPasta: true,
      papel: "foto_produto", papelConfirmadoEm: AGORA,
    });
    db.googleDriveConnection.findUnique.mockResolvedValue({
      id: "cx1", workspaceId: "w1", clientId: "c1", status: "connected",
      escopos: ESCOPO_DRIVE, tokenExpiresAt: new Date(Date.now() + 3600_000),
      accessTokenEncrypted: "enc:token-vivo", refreshTokenEncrypted: "enc:refresh",
    });

    const r = await baixarMaterial("dm3");
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe("e_uma_pasta");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("RECUSA sem conexão SEM CHAMAR A REDE", async () => {
    db.driveMaterial.findUnique.mockResolvedValue({
      id: "dm4", connectionId: "cx-morta", fileId: "file-4",
      nome: "logo.png", mimeType: "image/png", ehPasta: false,
      papel: "logo", papelConfirmadoEm: AGORA,
    });
    db.googleDriveConnection.findUnique.mockResolvedValue(null);

    const r = await baixarMaterial("dm4");
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe("sem_conexao");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
