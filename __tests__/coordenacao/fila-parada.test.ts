// A régua da fila parada — entradas de mentira com datas conhecidas, saída
// certa. Sem mock: `retratoDaFila` é pura (zero I/O, zero rede), então o
// teste também é — a régua geral desta casa depois do TS2322/TS2493 que
// mordeu três PRs seguidos: "melhor: esta régua é pura, teste sem mock
// nenhum" (ver DESPACHO-fila-parada.md).

import { describe, expect, it } from "vitest";

import {
  DIAS_ATE_PR_PARADO,
  estacionadoDePropOsito,
  retratoDaFila,
  type PullRequestAberto,
} from "@/lib/coordenacao/fila-parada";
import type { Reivindicacao } from "@/lib/coordenacao/reivindicacoes";

const AGORA = new Date("2026-08-29T12:00:00Z");

function horasAtras(h: number): string {
  return new Date(AGORA.getTime() - h * 60 * 60 * 1000).toISOString();
}

function diasAtras(d: number): string {
  return new Date(AGORA.getTime() - d * 24 * 60 * 60 * 1000).toISOString();
}

function reivindicacao(parcial: Partial<Reivindicacao> & Pick<Reivindicacao, "quem" | "responsabilidade" | "arquivos" | "abertaEm">): Reivindicacao {
  return {
    id: parcial.id ?? parcial.responsabilidade,
    quem: parcial.quem,
    frente: parcial.frente ?? "(frente de teste)",
    responsabilidade: parcial.responsabilidade,
    arquivos: parcial.arquivos,
    abertaEm: parcial.abertaEm,
    encerradaEm: parcial.encerradaEm ?? null,
    rotulo: parcial.rotulo,
  };
}

function pr(parcial: Partial<PullRequestAberto> & Pick<PullRequestAberto, "numero" | "titulo" | "criadoEm">): PullRequestAberto {
  // `"ultimoCommitEm" in parcial` (não `??`): `null` é um valor explícito e
  // válido aqui ("não deu para saber a data do último commit"), e `??` trata
  // `null` como ausência — sobrescreveria o `null` passado de propósito pelo
  // teste com `criadoEm`, quebrando todo caso que testa esse `null`.
  const temUltimoCommitEm = Object.prototype.hasOwnProperty.call(parcial, "ultimoCommitEm");
  return {
    numero: parcial.numero,
    titulo: parcial.titulo,
    autor: parcial.autor ?? "alguem",
    rascunho: parcial.rascunho ?? false,
    criadoEm: parcial.criadoEm,
    ultimoCommitEm: temUltimoCommitEm ? (parcial.ultimoCommitEm as string | null) : parcial.criadoEm,
    vereditos: parcial.vereditos ?? 0,
    comentarios: parcial.comentarios ?? 0,
  };
}

describe("estacionadoDePropOsito — marcador de parada de propósito, sem acento e em minúsculas", () => {
  it("pega o caso real do #10", () => {
    expect(estacionadoDePropOsito("📮 CANAL DOS DIRETORES — não mergear, não fechar")).toBe(true);
  });

  it("pega o caso real do #387", () => {
    expect(estacionadoDePropOsito("NÃO MESCLAR — aguarda palavra do CEO")).toBe(true);
  });

  it("pega WIP", () => {
    expect(estacionadoDePropOsito("WIP: rascunho da tela de convite")).toBe(true);
  });

  it("título comum não é estacionado", () => {
    expect(estacionadoDePropOsito("Corrige parse_error do SDR")).toBe(false);
  });

  it("marcador precisa ser palavra inteira — barra o problema plantado", () => {
    expect(estacionadoDePropOsito("WIP: rascunho")).toBe(true);
    expect(estacionadoDePropOsito("wip: rascunho")).toBe(true);
    expect(estacionadoDePropOsito("[WIP] tela")).toBe(true);
  });

  it("marcador precisa ser palavra inteira — não inventa problema no caso limpo (substring dentro de outra palavra)", () => {
    expect(estacionadoDePropOsito("Portal: gesto de swipe no carrossel")).toBe(false);
    expect(estacionadoDePropOsito("Corrige o wiper")).toBe(false);
    expect(estacionadoDePropOsito("Nova tela de wipe")).toBe(false);
  });

  it("os dois casos reais continuam true", () => {
    expect(estacionadoDePropOsito("📮 CANAL DOS DIRETORES — não mergear, não fechar")).toBe(true);
    expect(estacionadoDePropOsito("NÃO MESCLAR — aguarda palavra do CEO")).toBe(true);
  });

  it("'nao fechar'/'nao mesclar'/'nao mergear' também exigem palavra inteira, sem quebrar os casos reais", () => {
    expect(estacionadoDePropOsito("Reabertura do fechar-negocio automático")).toBe(false);
    expect(estacionadoDePropOsito("Ajusta mesclarConfig no build")).toBe(false);
    expect(estacionadoDePropOsito("Corrige mergearTudo()")).toBe(false);
    // e os dois casos reais continuam pegando:
    expect(estacionadoDePropOsito("📮 CANAL DOS DIRETORES — não mergear, não fechar")).toBe(true);
    expect(estacionadoDePropOsito("NÃO MESCLAR — aguarda palavra do CEO")).toBe(true);
  });
});

describe("retratoDaFila — reivindicações vencidas", () => {
  it("25h vencida", () => {
    const r = reivindicacao({ quem: "a", responsabilidade: "x/y", arquivos: ["a.ts"], abertaEm: horasAtras(25) });
    const retrato = retratoDaFila([r], [], AGORA);
    expect(retrato.reivindicacoesVencidas).toHaveLength(1);
    expect(retrato.reivindicacoesVencidas[0]!.de_quem).toBe("a");
    expect(retrato.totalCobravel).toBe(1);
  });

  it("23h NÃO vencida", () => {
    const r = reivindicacao({ quem: "a", responsabilidade: "x/y", arquivos: ["a.ts"], abertaEm: horasAtras(23) });
    const retrato = retratoDaFila([r], [], AGORA);
    expect(retrato.reivindicacoesVencidas).toHaveLength(0);
    expect(retrato.totalCobravel).toBe(0);
  });

  it("encerrada há 40 dias NÃO vencida (encerrada nunca entra)", () => {
    const r = reivindicacao({
      quem: "a",
      responsabilidade: "x/y",
      arquivos: ["a.ts"],
      abertaEm: diasAtras(41),
      encerradaEm: diasAtras(40),
    });
    const retrato = retratoDaFila([r], [], AGORA);
    expect(retrato.reivindicacoesVencidas).toHaveLength(0);
    expect(retrato.totalCobravel).toBe(0);
  });

  it("de_quem usa o rótulo quando presente", () => {
    const r = reivindicacao({ quem: "ses-abc", rotulo: "pm do bloco X", responsabilidade: "x/y", arquivos: ["a.ts"], abertaEm: horasAtras(30) });
    const retrato = retratoDaFila([r], [], AGORA);
    expect(retrato.reivindicacoesVencidas[0]!.de_quem).toBe("pm do bloco X");
  });
});

describe("retratoDaFila — PR parado (por último commit, ou por abertura na ausência)", () => {
  it("commit há 8 dias → parado", () => {
    const p = pr({ numero: 1, titulo: "Corrige X", criadoEm: diasAtras(20), ultimoCommitEm: diasAtras(8) });
    const retrato = retratoDaFila([], [p], AGORA);
    expect(retrato.prsParados).toHaveLength(1);
    expect(retrato.prsParados[0]!.o_que).toContain("#1");
    expect(retrato.totalCobravel).toBe(1);
  });

  it("commit há 6 dias → NÃO parado (mas aberto há 20 dias sem review nem comentário → sem veredito, conta 1)", () => {
    const p = pr({ numero: 2, titulo: "Corrige Y", criadoEm: diasAtras(20), ultimoCommitEm: diasAtras(6) });
    const retrato = retratoDaFila([], [p], AGORA);
    expect(retrato.prsParados).toHaveLength(0);
    expect(retrato.prsSemVeredito).toHaveLength(1);
    expect(retrato.totalCobravel).toBe(1);
  });

  it("commit há 8 dias mas título NÃO MESCLAR → estacionado, fora do totalCobravel", () => {
    const p = pr({ numero: 10, titulo: "📮 CANAL — não mergear, não fechar", criadoEm: diasAtras(20), ultimoCommitEm: diasAtras(8) });
    const retrato = retratoDaFila([], [p], AGORA);
    expect(retrato.prsParados).toHaveLength(0);
    expect(retrato.prsSemVeredito).toHaveLength(0);
    expect(retrato.estacionados).toHaveLength(1);
    expect(retrato.estacionados[0]!.o_que).toContain("#10");
    expect(retrato.totalCobravel).toBe(0);
  });

  it("ultimoCommitEm null cai para criadoEm e anota o detalhe", () => {
    const p = pr({ numero: 3, titulo: "Corrige Z", criadoEm: diasAtras(9), ultimoCommitEm: null });
    const retrato = retratoDaFila([], [p], AGORA);
    expect(retrato.prsParados).toHaveLength(1);
    expect(retrato.prsParados[0]!.detalhe).toMatch(/não obtida/);
  });
});

describe("retratoDaFila — PR sem veredito (comentário conta como veredito)", () => {
  it("aberto há 10 dias, 0 review e 0 comentário → sem veredito", () => {
    const p = pr({ numero: 4, titulo: "Ajusta W", criadoEm: diasAtras(10), vereditos: 0, comentarios: 0 });
    const retrato = retratoDaFila([], [p], AGORA);
    expect(retrato.prsSemVeredito).toHaveLength(1);
    expect(retrato.totalCobravel).toBe(1);
  });

  it("o mesmo PR com 1 comentário → NÃO entra em prsSemVeredito (mas ainda é PR parado por commit, conta 1)", () => {
    const p = pr({ numero: 4, titulo: "Ajusta W", criadoEm: diasAtras(10), vereditos: 0, comentarios: 1 });
    const retrato = retratoDaFila([], [p], AGORA);
    expect(retrato.prsSemVeredito).toHaveLength(0);
    expect(retrato.prsParados).toHaveLength(1);
    expect(retrato.totalCobravel).toBe(1);
  });

  it("PR velho e nunca julgado entra nas DUAS listas (prsParados e prsSemVeredito) e conta 1 em totalCobravel", () => {
    const p = pr({ numero: 42, titulo: "Ajusta V", criadoEm: diasAtras(10), vereditos: 0, comentarios: 0 });
    const retrato = retratoDaFila([], [p], AGORA);
    expect(retrato.prsParados).toHaveLength(1);
    expect(retrato.prsParados[0]!.o_que).toContain("#42");
    expect(retrato.prsSemVeredito).toHaveLength(1);
    expect(retrato.prsSemVeredito[0]!.o_que).toContain("#42");
    expect(retrato.totalCobravel).toBe(1);
  });

  it("PR aberto há 2h com 0/0 → NÃO entra (idade é obrigatória)", () => {
    const p = pr({ numero: 5, titulo: "Novo PR", criadoEm: horasAtras(2), vereditos: 0, comentarios: 0 });
    const retrato = retratoDaFila([], [p], AGORA);
    expect(retrato.prsSemVeredito).toHaveLength(0);
    expect(retrato.totalCobravel).toBe(0);
  });

  it("respeita o limiar (DIAS_ATE_PR_PARADO), não outro número mudo", () => {
    expect(DIAS_ATE_PR_PARADO).toBe(7);
  });
});

describe("retratoDaFila — fila limpa", () => {
  it("nenhuma reivindicação vencida e nenhum PR problemático → totalCobravel 0 e as quatro listas vazias", () => {
    const r = reivindicacao({ quem: "a", responsabilidade: "x/y", arquivos: ["a.ts"], abertaEm: horasAtras(1) });
    const p1 = pr({ numero: 6, titulo: "Em dia", criadoEm: diasAtras(1), ultimoCommitEm: diasAtras(1), vereditos: 1, comentarios: 0 });
    const p2 = pr({ numero: 7, titulo: "Rascunho novo", criadoEm: horasAtras(3), vereditos: 0, comentarios: 0 });

    const retrato = retratoDaFila([r], [p1, p2], AGORA);

    expect(retrato.reivindicacoesVencidas).toHaveLength(0);
    expect(retrato.prsParados).toHaveLength(0);
    expect(retrato.prsSemVeredito).toHaveLength(0);
    expect(retrato.estacionados).toHaveLength(0);
    expect(retrato.totalCobravel).toBe(0);
  });
});
