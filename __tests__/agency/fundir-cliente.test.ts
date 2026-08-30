// Fundir e apagar cliente — a operação que faltava, e a trava que a torna segura.
//
// A duplicata ("City Jobs" e "CityJobs", "Camila Pereira" duas vezes) ficou
// horas na tela do CEO por um motivo simples: o sistema nunca teve como tirar
// cliente da lista. Ao construir, o risco vira o oposto — apagar de menos passa
// a ser apagar de mais.
//
// A metade que importa aqui é a segunda de cada par: não basta provar que fundir
// move; é preciso provar que apagar RECUSA quando há trabalho pendurado, e que
// campo preenchido NÃO é sobrescrito.

import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

import {
  completarCampos,
  moverVinculos,
  inventarioDoCliente,
  traduzirConflitoDeFusao,
  VINCULOS_SOLTOS,
  VINCULOS_EM_CASCATA,
} from "@/lib/agency/persistence/cliente-vinculos";

describe("completarCampos — junta informação, não substitui", () => {
  const vazio = { industry: null, email: null, phone: null, website: null };

  it("preenche o buraco do sobrevivente com o dado do absorvido", () => {
    // O caso literal do City Jobs: quem sobrevive tem projeto mas o setor está
    // vazio; quem é absorvido tem o setor.
    const dados = completarCampos(vazio, { ...vazio, industry: "Plataforma de vagas" });
    expect(dados.industry).toBe("Plataforma de vagas");
  });

  it("NUNCA sobrescreve campo que já tem valor", () => {
    const dados = completarCampos(
      { ...vazio, industry: "Tecnologia para restaurantes" },
      { ...vazio, industry: "Outra coisa" },
    );
    expect(dados.industry).toBeUndefined();
  });

  it("trata espaço em branco como vazio dos dois lados", () => {
    expect(completarCampos({ ...vazio, email: "   " }, { ...vazio, email: "a@b.com" }).email).toBe("a@b.com");
    expect(completarCampos(vazio, { ...vazio, email: "   " }).email).toBeUndefined();
  });
});

describe("inventarioDoCliente — o que a confirmação mostra", () => {
  function dbCom(contagens: Record<string, number>) {
    const db: Record<string, { count: (a: unknown) => Promise<number> }> = {};
    for (const [chave, total] of Object.entries(contagens)) {
      db[chave] = { count: vi.fn().mockResolvedValue(total) };
    }
    return db as never;
  }

  it("cliente vazio pode ser apagado", async () => {
    const inv = await inventarioDoCliente(dbCom({ project: 0, approvalRequest: 0 }), "c1");
    expect(inv.total).toBe(0);
    expect(inv.podeApagar).toBe(true);
    expect(inv.itens).toEqual([]);
  });

  it("cliente com QUALQUER vínculo não pode ser apagado — nem por um só", async () => {
    const inv = await inventarioDoCliente(dbCom({ project: 0, approvalRequest: 1 }), "c1");
    expect(inv.podeApagar).toBe(false);
    expect(inv.total).toBe(1);
    expect(inv.itens).toEqual([{ chave: "approvalRequest", rotulo: "aprovações", total: 1 }]);
  });

  it("modelo ausente do client do Prisma não derruba a conferência", async () => {
    // Schema muda. Uma tela de confirmação que quebra é pior que uma contagem a
    // menos — mas o inventário inteiro não pode sumir por causa disso.
    const inv = await inventarioDoCliente(dbCom({ project: 2 }), "c1");
    expect(inv.total).toBe(2);
  });
});

describe("moverVinculos — a fusão move, e respeita unicidade", () => {
  function txCom(porChave: Record<string, { existentes?: number; movidos?: number; noSobrevivente?: number }>) {
    const tx: Record<string, unknown> = {};
    const chamadas: Record<string, unknown[]> = {};
    for (const [chave, cfg] of Object.entries(porChave)) {
      chamadas[chave] = [];
      tx[chave] = {
        count: vi.fn(async ({ where }: { where: { clientId: string } }) =>
          where.clientId === "sobrevivente" ? (cfg.noSobrevivente ?? 0) : (cfg.existentes ?? 0)),
        updateMany: vi.fn(async (a: unknown) => {
          chamadas[chave].push(a);
          return { count: cfg.movidos ?? 0 };
        }),
        deleteMany: vi.fn(async (a: unknown) => {
          chamadas[chave].push(a);
          return { count: cfg.existentes ?? 0 };
        }),
      };
    }
    return { tx: tx as never, chamadas };
  }

  it("move o que está pendurado para o sobrevivente", async () => {
    const { tx } = txCom({ project: { movidos: 1 }, approvalRequest: { movidos: 2 } });
    const r = await moverVinculos(tx, "absorvido", "sobrevivente");
    expect(r.movidos).toEqual([
      { chave: "project", rotulo: "projetos", total: 1 },
      { chave: "approvalRequest", rotulo: "aprovações", total: 2 },
    ]);
    expect(r.descartados).toEqual([]);
  });

  it("com unicidade por cliente, o do sobrevivente vence e o do absorvido é descartado", async () => {
    // googleDriveConnection tem @@unique([workspaceId, clientId]): mover a linha
    // do absorvido violaria a restrição e derrubaria a transação inteira.
    const { tx, chamadas } = txCom({
      googleDriveConnection: { existentes: 1, noSobrevivente: 1 },
    });
    const r = await moverVinculos(tx, "absorvido", "sobrevivente");
    expect(r.descartados).toEqual([
      { chave: "googleDriveConnection", rotulo: "conexões do Drive", total: 1 },
    ]);
    expect(r.movidos).toEqual([]);
    // Descartou, não tentou mover.
    expect(chamadas.googleDriveConnection.every((c) => !("data" in (c as object)))).toBe(true);
  });

  it("com unicidade e o sobrevivente SEM linha, move normalmente", async () => {
    const { tx } = txCom({ clientAiProvider: { existentes: 1, noSobrevivente: 0, movidos: 1 } });
    const r = await moverVinculos(tx, "absorvido", "sobrevivente");
    expect(r.movidos).toEqual([{ chave: "clientAiProvider", rotulo: "provedores de IA", total: 1 }]);
    expect(r.descartados).toEqual([]);
  });
});

describe("a lista de vínculos não pode ficar para trás do schema", () => {
  // Esta é a trava de verdade. Um `clientId` novo no schema que ninguém
  // adicionar aqui vira órfão silencioso na primeira fusão — some da tela e
  // continua no banco. O teste falha NOMEANDO o modelo esquecido.
  it("todo modelo com clientId no schema está declarado", () => {
    const schema = fs.readFileSync(
      path.join(process.cwd(), "prisma/schema.prisma"),
      "utf8",
    );

    const doSchema = new Set<string>();
    let modelo = "";
    for (const linha of schema.split("\n")) {
      const m = /^model\s+(\w+)/.exec(linha);
      if (m) { modelo = m[1]; continue; }
      // Só a declaração do campo: "clientId String" / "clientId String?".
      if (modelo && /^\s*clientId\s+String/.test(linha)) doSchema.add(modelo);
    }

    // Client é o próprio dono; AgencyWorkspace não tem clientId.
    doSchema.delete("Client");

    const declarados = new Set(
      [...VINCULOS_SOLTOS, ...VINCULOS_EM_CASCATA].map((v) =>
        // delegate do Prisma → nome do model: "aIRunLog" → "AIRunLog".
        v.chave.charAt(0).toUpperCase() + v.chave.slice(1),
      ),
    );

    const esquecidos = [...doSchema].filter((m) => {
      const alternativas = [m, m.charAt(0).toLowerCase() + m.slice(1)];
      return !alternativas.some((a) =>
        declarados.has(a.charAt(0).toUpperCase() + a.slice(1)),
      );
    });

    expect(esquecidos, `modelos com clientId fora da lista de vínculos: ${esquecidos.join(", ")}`)
      .toEqual([]);
  });
});

describe("todo modelo com clientId ÚNICO no schema declara unicoPorCliente", () => {
  // O DEFEITO REAL (28/08/2026): ParceriaDoCliente e BrandBrain têm
  // `clientId String @unique` no schema (prisma/schema.prisma:2764 e :815)
  // mas não carregavam a flag. Numa fusão em que os DOIS cadastros tinham a
  // mesma linha (o caso real da FOOCCI), `moverVinculos` tentava mover as
  // duas para o mesmo `clientId` — violação de unicidade (P2002),
  // `$transaction` aborta, e a rota devolvia 500 cru. O guarda anterior
  // (acima) só confere PRESENÇA na lista; este confere UNICIDADE — é o que
  // faltava para pegar esta classe de defeito, e pega o PRÓXIMO campo que
  // entrar `@unique` sem a flag, não só os dois já corrigidos.
  //
  // COBERTURA DECLARADA: unicidade de CAMPO (`clientId String @unique` /
  // `clientId String? @unique`) e a forma composta EXATA
  // `@@unique([workspaceId, clientId])` (nas duas ordens) — o padrão real já
  // usado em GoogleDriveConnection (schema.prisma:341) e ClientAiProvider
  // (schema.prisma:1024). Outras formas compostas — ex.:
  // `@@unique([clientId, mediaAssetId])` em DriveMaterial (schema.prisma:412)
  // — NÃO implicam "uma linha por cliente" (um cliente pode ter várias
  // linhas, uma por mediaAsset) e ficam FORA deste guarda DE PROPÓSITO, não
  // por omissão: recusa declarada vale mais que cobertura inventada.
  it("todo model com unicidade de clientId no schema tem unicoPorCliente: true", () => {
    const schema = fs.readFileSync(
      path.join(process.cwd(), "prisma/schema.prisma"),
      "utf8",
    );

    const exigemFlag = new Set<string>();
    let modelo = "";
    for (const linha of schema.split("\n")) {
      const m = /^model\s+(\w+)/.exec(linha);
      if (m) { modelo = m[1]; continue; }
      if (/^}/.test(linha)) { modelo = ""; continue; }
      if (!modelo) continue;

      // Unicidade de campo: `clientId String @unique` / `clientId String? @unique`.
      if (/^\s*clientId\s+String\??\s+@unique\b/.test(linha)) {
        exigemFlag.add(modelo);
      }

      // Unicidade composta EXATA `[workspaceId, clientId]`, nas duas ordens.
      if (
        /^\s*@@unique\(\[\s*workspaceId\s*,\s*clientId\s*\]\)/.test(linha) ||
        /^\s*@@unique\(\[\s*clientId\s*,\s*workspaceId\s*\]\)/.test(linha)
      ) {
        exigemFlag.add(modelo);
      }
    }

    const flagados = new Set(
      [...VINCULOS_SOLTOS, ...VINCULOS_EM_CASCATA]
        .filter((v) => "unicoPorCliente" in v && v.unicoPorCliente)
        .map((v) => v.chave.charAt(0).toUpperCase() + v.chave.slice(1)),
    );

    const semFlag = [...exigemFlag].filter((m) => !flagados.has(m));

    expect(
      semFlag,
      `modelos com clientId único no schema sem unicoPorCliente: true: ${semFlag.join(", ")}`,
    ).toEqual([]);
  });
});

describe("traduzirConflitoDeFusao — P2002 vira mensagem legível, nunca 500 mudo", () => {
  it("com meta.modelName conhecido, cita o rótulo em português", () => {
    const r = traduzirConflitoDeFusao({ code: "P2002", meta: { modelName: "ParceriaDoCliente" } });
    expect(r?.status).toBe(409);
    expect(r?.mensagem).toContain("parcerias do cliente");
  });

  it("com meta.modelName desconhecido, cai para o fallback genérico (não inventa rótulo)", () => {
    const r = traduzirConflitoDeFusao({ code: "P2002", meta: { modelName: "ModeloNovoQualquer" } });
    expect(r?.status).toBe(409);
    expect(r?.mensagem).not.toContain("ModeloNovoQualquer");
  });

  it("sem modelName, usa meta.target (array) para nomear o campo", () => {
    const r = traduzirConflitoDeFusao({ code: "P2002", meta: { target: ["clientId"] } });
    expect(r?.status).toBe(409);
    expect(r?.mensagem).toContain("clientId");
  });

  it("sem modelName, usa meta.target (string) para nomear o campo", () => {
    const r = traduzirConflitoDeFusao({ code: "P2002", meta: { target: "clientId" } });
    expect(r?.mensagem).toContain("clientId");
  });

  it("sem meta nenhum, ainda devolve 409 com mensagem genérica — nunca null", () => {
    const r = traduzirConflitoDeFusao({ code: "P2002" });
    expect(r?.status).toBe(409);
    expect(r?.mensagem.length).toBeGreaterThan(0);
  });

  it("erro que NÃO é P2002 devolve null — quem chama trata como falha real, não conflito", () => {
    expect(traduzirConflitoDeFusao({ code: "P2025", meta: {} })).toBeNull();
    expect(traduzirConflitoDeFusao(new Error("qualquer coisa"))).toBeNull();
    expect(traduzirConflitoDeFusao(null)).toBeNull();
    expect(traduzirConflitoDeFusao(undefined)).toBeNull();
    expect(traduzirConflitoDeFusao("string qualquer")).toBeNull();
  });
});
