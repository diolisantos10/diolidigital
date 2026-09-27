// A PASTA DA MARCA NO DRIVE, POR CONTA DE SERVIÇO — as travas antes da rede.
//
// Quatro coisas provadas aqui:
//   1. SEM `GOOGLE_SA_JSON` tudo recusa com a MESMA frase, e nada bate na rede.
//   2. `idDaPasta` reconhece os formatos reais de link de pasta do Drive.
//   3. Sem a autorização escrita do cliente, `conferirPastaDaMarca` recusa
//      antes de qualquer chamada ao Google — mesma disciplina de
//      `materialAutorizado` em `escolha-de-material.ts`.
//   4. `importarMaterialDaPasta` deduplica por sha256: dois arquivos com o
//      mesmo conteúdo no lote não viram dois `MediaAsset`.

import { generateKeyPairSync } from "node:crypto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const db = vi.hoisted(() => ({
  client: {
    findFirst: vi.fn(async (): Promise<{ pastaDriveUrl: string | null; autorizacaoDriveEm: Date | null } | null> => null),
    update: vi.fn(async (): Promise<{ id: string }> => ({ id: "c1" })),
  },
  mediaAsset: {
    findFirst: vi.fn(async (): Promise<{ id: string } | null> => null),
  },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

const guardarArquivo = vi.hoisted(() =>
  vi.fn(async (): Promise<{ ok: true; arquivo: { id: string; fileName: string; mimeType: string; sizeBytes: number; url: string } }> => ({
    ok: true,
    arquivo: { id: "med_x", fileName: "a.png", mimeType: "image/png", sizeBytes: 4, url: "/api/media/med_x" },
  })),
);
vi.mock("@/lib/agency/media/armazenamento", () => ({
  guardarArquivo,
  MAX_BYTES_POR_ARQUIVO: 120 * 1024 * 1024,
}));

import {
  credencialDaContaDeServico,
  idDaPasta,
  conferirPastaDaMarca,
  importarMaterialDaPasta,
  avisoDeOnboarding,
  FRASE_SEM_CREDENCIAL,
} from "@/lib/integrations/google/drive-conta-de-servico";

const SA_JSON_VALIDO = JSON.stringify({
  client_email: "conta-dioli@projeto.iam.gserviceaccount.com",
  // Chave RSA DE VERDADE, gerada aqui: o JWT é assinado com `node:crypto`
  // antes de qualquer fetch, e uma chave "fake" estoura no decoder.
  private_key: generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. SEM CREDENCIAL — a mesma frase, e nenhuma rede.
// ═══════════════════════════════════════════════════════════════════════════

describe("sem GOOGLE_SA_JSON", () => {
  it("credencialDaContaDeServico recusa com a frase exata", () => {
    vi.stubEnv("GOOGLE_SA_JSON", "");
    const r = credencialDaContaDeServico();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe(FRASE_SEM_CREDENCIAL);
  });

  it("JSON malformado recusa com a MESMA frase — não é erro genérico, é ausência", () => {
    vi.stubEnv("GOOGLE_SA_JSON", "{ isto não é json");
    const r = credencialDaContaDeServico();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe(FRASE_SEM_CREDENCIAL);
  });

  it("conferirPastaDaMarca recusa SEM CHAMAR A REDE", async () => {
    vi.stubEnv("GOOGLE_SA_JSON", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const r = await conferirPastaDaMarca({ workspaceId: "w1", clientId: "c1" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe(FRASE_SEM_CREDENCIAL);
    expect(fetchSpy).not.toHaveBeenCalled();
    // Nem o banco foi consultado: a trava é a primeira coisa que roda.
    expect(db.client.findFirst).not.toHaveBeenCalled();
  });

  it("importarMaterialDaPasta recusa SEM CHAMAR A REDE", async () => {
    vi.stubEnv("GOOGLE_SA_JSON", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const r = await importarMaterialDaPasta({ workspaceId: "w1", clientId: "c1", subpasta: "Logos" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe(FRASE_SEM_CREDENCIAL);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. idDaPasta — os formatos reais de link de pasta do Drive.
// ═══════════════════════════════════════════════════════════════════════════

describe("idDaPasta", () => {
  const ID = "1AbCdEfGhIjKlMnOpQrSt";

  it("aceita /drive/folders/<id>", () => {
    expect(idDaPasta(`https://drive.google.com/drive/folders/${ID}`)).toBe(ID);
  });

  it("aceita /drive/folders/<id>?usp=sharing", () => {
    expect(idDaPasta(`https://drive.google.com/drive/folders/${ID}?usp=sharing`)).toBe(ID);
  });

  it("aceita /drive/u/<n>/folders/<id>", () => {
    expect(idDaPasta(`https://drive.google.com/drive/u/0/folders/${ID}`)).toBe(ID);
  });

  it("aceita open?id=<id>", () => {
    expect(idDaPasta(`https://drive.google.com/open?id=${ID}`)).toBe(ID);
  });

  it("RECUSA link inválido — link de arquivo, domínio errado, texto solto", () => {
    expect(idDaPasta(`https://drive.google.com/file/d/${ID}/view`)).toBeNull();
    expect(idDaPasta("https://exemplo.com/pasta-qualquer")).toBeNull();
    expect(idDaPasta("isto não é um link")).toBeNull();
    expect(idDaPasta("")).toBeNull();
  });
});

describe("avisoDeOnboarding", () => {
  it("interpola o e-mail da conta e diz para compartilhar a RAIZ, não as subpastas", () => {
    const texto = avisoDeOnboarding("conta-dioli@projeto.iam.gserviceaccount.com");
    expect(texto).toContain("conta-dioli@projeto.iam.gserviceaccount.com");
    expect(texto).toMatch(/RAIZ/);
    expect(texto).toMatch(/não restrinja/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. SEM AUTORIZAÇÃO ESCRITA — recusa antes da rede.
// ═══════════════════════════════════════════════════════════════════════════

describe("conferirPastaDaMarca sem autorização do cliente", () => {
  it("recusa sem bater na rede quando falta autorizacaoDriveEm", async () => {
    vi.stubEnv("GOOGLE_SA_JSON", SA_JSON_VALIDO);
    db.client.findFirst.mockResolvedValue({
      pastaDriveUrl: "https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrSt",
      autorizacaoDriveEm: null,
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const r = await conferirPastaDaMarca({ workspaceId: "w1", clientId: "c1" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/autorização/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("recusa quando falta o link da pasta", async () => {
    vi.stubEnv("GOOGLE_SA_JSON", SA_JSON_VALIDO);
    db.client.findFirst.mockResolvedValue({ pastaDriveUrl: null, autorizacaoDriveEm: new Date() });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const r = await conferirPastaDaMarca({ workspaceId: "w1", clientId: "c1" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/pasta do Drive/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. importarMaterialDaPasta — dedupe por sha256.
// ═══════════════════════════════════════════════════════════════════════════

describe("importarMaterialDaPasta — dedupe por sha256", () => {
  beforeEach(() => {
    vi.stubEnv("GOOGLE_SA_JSON", SA_JSON_VALIDO);
    db.client.findFirst.mockResolvedValue({
      pastaDriveUrl: "https://drive.google.com/drive/folders/PASTA1XXXXX",
      autorizacaoDriveEm: new Date("2026-09-20T10:00:00Z"),
    });
  });

  function driveFalso() {
    return vi.fn(async (input: string | URL) => {
      const u = String(input);
      if (u.includes("oauth2.googleapis.com/token")) {
        return new Response(JSON.stringify({ access_token: "tok-123", expires_in: 3600 }), { status: 200 });
      }
      if (u.includes("/files?q=") && u.includes("PASTA1XXXXX")) {
        return new Response(
          JSON.stringify({ files: [{ id: "SUBLOGOS", name: "Logos", mimeType: "application/vnd.google-apps.folder" }] }),
          { status: 200 },
        );
      }
      if (u.includes("/files?q=") && u.includes("SUBLOGOS")) {
        return new Response(
          JSON.stringify({
            files: [
              { id: "f1", name: "a.png", mimeType: "image/png", size: "4" },
              { id: "f2", name: "b.png", mimeType: "image/png", size: "4" },
            ],
          }),
          { status: 200 },
        );
      }
      if (u.includes("alt=media")) {
        // As DUAS baixam o MESMO conteúdo — mesmo sha256, arquivos diferentes.
        return new Response("AAAA", { status: 200, headers: { "content-length": "4" } });
      }
      return new Response("{}", { status: 404 });
    });
  }

  it("dois arquivos com o mesmo conteúdo: 1 importado, 1 já existia — e guardarArquivo só roda uma vez", async () => {
    vi.stubGlobal("fetch", driveFalso());

    const r = await importarMaterialDaPasta({ workspaceId: "w1", clientId: "c1", subpasta: "Logos" });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.importados).toBe(1);
      expect(r.jaExistiam).toBe(1);
    }
    expect(guardarArquivo).toHaveBeenCalledTimes(1);
    // Carimba a sincronização — a esteira precisa saber quando foi a última.
    expect(db.client.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ driveSincronizadoEm: expect.any(Date) }) }),
    );
  });

  it("arquivo já importado em uma rodada ANTERIOR (achado no banco) conta como jaExistiam, sem chamar guardarArquivo", async () => {
    vi.stubGlobal("fetch", driveFalso());
    db.mediaAsset.findFirst.mockResolvedValue({ id: "med_ja_existe" });

    const r = await importarMaterialDaPasta({ workspaceId: "w1", clientId: "c1", subpasta: "Logos" });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.importados).toBe(0);
      expect(r.jaExistiam).toBe(2);
    }
    expect(guardarArquivo).not.toHaveBeenCalled();
  });

  it("subpasta desconhecida no lote recusa sem tentar nada", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const r = await importarMaterialDaPasta({
      workspaceId: "w1",
      clientId: "c1",
      // @ts-expect-error — propositalmente fora da lista fechada, para provar a recusa.
      subpasta: "Vídeos",
    });
    expect(r.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
