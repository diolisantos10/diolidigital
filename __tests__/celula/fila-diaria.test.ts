// A FILA DIÁRIA — "as entregas do dia num lugar só, revisa e libera em bloco,
// uma vez por dia, não uma interrupção por oportunidade" (CEO, D-0D1).
//
// O teste que mais importa não é o do caminho feliz. É o do BLOCO SUJO: um
// item quebrado no meio de bons. A implementação preguiçosa de "liberar em
// bloco" — marcar todos de uma vez — carimbaria o quebrado como entregue junto
// com o resto, e ninguém saberia até o cliente reclamar.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "@/lib/generated/prisma/client";
import type { Credencial } from "@/lib/agency/celula/papeis";

const estado = vi.hoisted(() => ({ prisma: null as unknown as PrismaClient }));
vi.mock("@/lib/db/client", () => ({
  get prisma() {
    return estado.prisma;
  },
}));

let pasta = "";
let raiz = "";

beforeEach(async () => {
  pasta = await mkdtemp(path.join(tmpdir(), "fila-"));
  process.env.RAILWAY_VOLUME_MOUNT_PATH = pasta;
  raiz = path.join(pasta, "media");
  const db = path.join(pasta, "f.db");
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: `file:${db}` },
    stdio: "pipe",
  });
  estado.prisma = new PrismaClient({ adapter: new PrismaLibSql({ url: `file:${db}` }) });
}, 120_000);

afterEach(async () => {
  await estado.prisma?.$disconnect().catch(() => {});
  await rm(pasta, { recursive: true, force: true });
  delete process.env.RAILWAY_VOLUME_MOUNT_PATH;
});

const W = "ws-fila";
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("peca de teste".repeat(6))]);

const GERENTE: Credencial = {
  autoridade: "department_member",
  departamentos: ["client-service-sdr"],
  papelDeclaradoNaCelula: "gerente_de_atendimento",
};
const SDR: Credencial = { ...GERENTE, papelDeclaradoNaCelula: "sdr" };
const CEO_SEM_PAPEL: Credencial = { autoridade: "master", departamentos: [] };

async function entrega(op: string, nome: string) {
  const { registrarArquivoParaCliente, aprovarParaEnvio } = await import("@/lib/agency/celula/ponte/armazem");
  const r = await registrarArquivoParaCliente({
    workspaceId: W, oportunidadeId: op, clienteId: `cli-${op}`, projetoId: `proj-${op}`,
    linhagemId: `l-${nome}`, nomeOriginal: nome, extensao: "jpg", mimeType: "image/jpeg",
    bytes: JPEG, destinatarioDeclarado: op, autor: "design",
  });
  if (!r.ok) throw new Error(`registro falhou: ${r.motivo}`);
  const a = await aprovarParaEnvio({ workspaceId: W, arquivoId: r.arquivoId, autor: "qualidade" });
  expect(a.ok).toBe(true);
  return r.arquivoId;
}

describe("a fila é DERIVADA — nenhuma tabela nova", () => {
  it("junta as entregas aprovadas de várias oportunidades num lugar só", async () => {
    const { montarFilaDoDia } = await import("@/lib/agency/celula/fila-diaria");
    await entrega("op-a", "a1.jpg");
    await entrega("op-a", "a2.jpg");
    await entrega("op-b", "b1.jpg");

    const f = await montarFilaDoDia({ workspaceId: W, agora: new Date("2026-09-01T09:00:00Z") }, estado.prisma);
    expect(f.dia).toBe("2026-09-01");
    expect(f.itens.length).toBe(3);
    expect(f.prontos).toBe(3);
    expect(f.impedidos).toBe(0);
  }, 90_000);

  it("o que já foi enviado SAI da fila — aprovou entra, enviou sai", async () => {
    const { montarFilaDoDia, liberarEmBloco } = await import("@/lib/agency/celula/fila-diaria");
    const id = await entrega("op-a", "a1.jpg");
    await liberarEmBloco({ workspaceId: W, arquivoIds: [id], credencial: GERENTE, autor: "gerente" }, estado.prisma);
    const f = await montarFilaDoDia({ workspaceId: W }, estado.prisma);
    expect(f.itens.length).toBe(0);
  }, 90_000);

  it("arquivo do CLIENTE não entra na fila de entregas", async () => {
    const { registrarArquivoDoCliente } = await import("@/lib/agency/celula/ponte/armazem");
    const { montarFilaDoDia } = await import("@/lib/agency/celula/fila-diaria");
    await registrarArquivoDoCliente({
      workspaceId: W, oportunidadeId: "op-a", linhagemId: "recebido",
      nomeOriginal: "do-cliente.jpg", extensaoDeclarada: "jpg", mimeType: "image/jpeg",
      bytes: JPEG, destinatarioDeclarado: "op-a", autor: "operador",
    });
    const f = await montarFilaDoDia({ workspaceId: W }, estado.prisma);
    expect(f.itens.length).toBe(0);
  }, 90_000);
});

describe("🔴 O BLOCO SUJO — um item ruim não contamina nem some", () => {
  it("libera os bons, RECUSA o quebrado, e diz qual e por quê", async () => {
    const { montarFilaDoDia, liberarEmBloco } = await import("@/lib/agency/celula/fila-diaria");
    const bom1 = await entrega("op-a", "bom1.jpg");
    const ruim = await entrega("op-b", "ruim.jpg");
    const bom2 = await entrega("op-c", "bom2.jpg");

    // O corpo do item do meio é trocado no volume, com o registro intacto.
    const linha = await estado.prisma.arquivoDaCelula.findUniqueOrThrow({ where: { id: ruim } });
    await writeFile(path.join(raiz, linha.caminhoInterno), Buffer.from("TROCADO"));

    // A fila MOSTRA o impedido — não o esconde para ficar bonita.
    const f = await montarFilaDoDia({ workspaceId: W }, estado.prisma);
    expect(f.prontos).toBe(2);
    expect(f.impedidos).toBe(1);
    const impedido = f.itens.find((i) => !i.pronto)!;
    expect(impedido.arquivoId).toBe(ruim);
    expect(impedido.impedimento).toMatch(/não é o que foi registrado/i);

    const r = await liberarEmBloco(
      { workspaceId: W, arquivoIds: [bom1, ruim, bom2], credencial: GERENTE, autor: "gerente" },
      estado.prisma,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.liberados.map((x) => x.arquivoId).sort()).toEqual([bom1, bom2].sort());
    expect(r.recusados.length).toBe(1);
    expect(r.recusados[0]!.arquivoId).toBe(ruim);

    // E o quebrado NÃO foi carimbado como enviado.
    const depois = await estado.prisma.arquivoDaCelula.findUniqueOrThrow({ where: { id: ruim } });
    expect(depois.estado).toBe("aprovado_para_envio");
  }, 120_000);

  it("liberar duas vezes NÃO envia nada duas vezes", async () => {
    const { liberarEmBloco } = await import("@/lib/agency/celula/fila-diaria");
    const id = await entrega("op-a", "a1.jpg");
    const um = await liberarEmBloco({ workspaceId: W, arquivoIds: [id], credencial: GERENTE, autor: "g" }, estado.prisma);
    expect(um.ok && um.liberados.length).toBe(1);

    const dois = await liberarEmBloco({ workspaceId: W, arquivoIds: [id], credencial: GERENTE, autor: "g" }, estado.prisma);
    expect(dois.ok).toBe(true);
    if (dois.ok) {
      expect(dois.liberados.length).toBe(0);
      expect(dois.recusados.length).toBe(1);
    }
    // um único evento de envio
    const eventos = await estado.prisma.eventoDoArquivoDaCelula.count({ where: { arquivoId: id, tipo: "enviado" } });
    expect(eventos).toBe(1);
  }, 90_000);

  it("arquivo de OUTRO workspace é recusado, não liberado", async () => {
    const { liberarEmBloco } = await import("@/lib/agency/celula/fila-diaria");
    const id = await entrega("op-a", "a1.jpg");
    const r = await liberarEmBloco(
      { workspaceId: "outro-ws", arquivoIds: [id], credencial: GERENTE, autor: "g" },
      estado.prisma,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.recusados.length).toBe(1);
    const depois = await estado.prisma.arquivoDaCelula.findUniqueOrThrow({ where: { id } });
    expect(depois.estado).toBe("aprovado_para_envio");
  }, 90_000);
});

describe("🔴 quem pode liberar", () => {
  it("o SDR NÃO libera a fila", async () => {
    const { liberarEmBloco } = await import("@/lib/agency/celula/fila-diaria");
    const id = await entrega("op-a", "a1.jpg");
    const r = await liberarEmBloco({ workspaceId: W, arquivoIds: [id], credencial: SDR, autor: "sdr" }, estado.prisma);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.regra).toBe("sem_permissao");
  }, 90_000);

  it("o CEO SEM o papel declarado não libera — o registro precisa dizer QUEM liberou", async () => {
    const { liberarEmBloco } = await import("@/lib/agency/celula/fila-diaria");
    const id = await entrega("op-a", "a1.jpg");
    const r = await liberarEmBloco({ workspaceId: W, arquivoIds: [id], credencial: CEO_SEM_PAPEL, autor: "ceo" }, estado.prisma);
    expect(r.ok).toBe(false);
  }, 90_000);

  it("lista vazia é recusada, não vira 'liberou tudo'", async () => {
    const { liberarEmBloco } = await import("@/lib/agency/celula/fila-diaria");
    const r = await liberarEmBloco({ workspaceId: W, arquivoIds: [], credencial: GERENTE, autor: "g" }, estado.prisma);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.regra).toBe("lista_vazia");
  }, 60_000);
});

describe("🔴 A MEDIÇÃO QUE DECIDE O CAMINHO B", () => {
  // Sem este número, quinta-feira chega sem evidência: sabe-se o que saiu e o
  // que a máquina recusou, mas não o que o CEO viu e deixou de fora. E é
  // exatamente isso que se perde quando a pessoa sai do meio.

  it("registra os itens PRONTOS que o operador não selecionou", async () => {
    const { montarFilaDoDia, liberarEmBloco } = await import("@/lib/agency/celula/fila-diaria");
    const a = await entrega("op-a", "a.jpg");
    const b = await entrega("op-b", "b.jpg");
    const c = await entrega("op-c", "c.jpg");

    const fila = await montarFilaDoDia({ workspaceId: W }, estado.prisma);
    const prontos = fila.itens.filter((i) => i.pronto).map((i) => i.arquivoId);
    expect(prontos.length).toBe(3);

    // O operador olha os três e envia só dois. O terceiro é a correção humana.
    const r = await liberarEmBloco(
      { workspaceId: W, arquivoIds: [a, b], prontosApresentados: prontos, credencial: GERENTE, autor: "gerente" },
      estado.prisma,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.naoSelecionados).toEqual([c]);

    // E o número SOBREVIVE ao processo: está no banco, não na memória.
    const evento = await estado.prisma.eventoDoArquivoDaCelula.findFirst({
      where: { arquivoId: c, tipo: "nao_selecionado_pelo_operador" },
    });
    expect(evento).not.toBeNull();
    expect(evento!.detalhe).toMatch(/caminho B/i);

    // O não selecionado NÃO foi enviado — continua na fila de amanhã.
    const depois = await estado.prisma.arquivoDaCelula.findUniqueOrThrow({ where: { id: c } });
    expect(depois.estado).toBe("aprovado_para_envio");
  }, 120_000);

  it("operador que envia TUDO gera medição vazia — o caso que sustenta B", async () => {
    const { montarFilaDoDia, liberarEmBloco } = await import("@/lib/agency/celula/fila-diaria");
    const a = await entrega("op-a", "a.jpg");
    const b = await entrega("op-b", "b.jpg");
    const fila = await montarFilaDoDia({ workspaceId: W }, estado.prisma);
    const prontos = fila.itens.map((i) => i.arquivoId);

    const r = await liberarEmBloco(
      { workspaceId: W, arquivoIds: [a, b], prontosApresentados: prontos, credencial: GERENTE, autor: "g" },
      estado.prisma,
    );
    expect(r.ok && r.naoSelecionados).toEqual([]);
    expect(await estado.prisma.eventoDoArquivoDaCelula.count({ where: { tipo: "nao_selecionado_pelo_operador" } })).toBe(0);
  }, 120_000);

  it("sem `prontosApresentados` a medição fica VAZIA, não zero fingido", async () => {
    const { liberarEmBloco } = await import("@/lib/agency/celula/fila-diaria");
    const a = await entrega("op-a", "a.jpg");
    await entrega("op-b", "b.jpg");
    // Quem chamar sem dizer o que apresentou não pode produzir a evidência de
    // que "nada foi descartado" — porque ninguém sabe o que ele mostrou.
    const r = await liberarEmBloco({ workspaceId: W, arquivoIds: [a], credencial: GERENTE, autor: "g" }, estado.prisma);
    expect(r.ok && r.naoSelecionados).toEqual([]);
    expect(await estado.prisma.eventoDoArquivoDaCelula.count({ where: { tipo: "nao_selecionado_pelo_operador" } })).toBe(0);
  }, 120_000);
});
