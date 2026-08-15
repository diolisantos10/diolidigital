// HOMOLOGAÇÃO DAS 62 — todas as funções, todos os golden sets, dado fictício.
//
// Ordem do CEO (15/08/2026): "execute a homologação completa com dados
// fictícios e apresente o relatório de prontidão antes da ativação do
// primeiro piloto". Este arquivo É a homologação: passa as 69 funções pelo
// motor real (`executor.ts`) com as specs reais das fichas, nos três casos do
// golden set (normal, recusa, escalada), e PROVA que produção recusa as 62
// enquanto estiverem desligadas — a trava dupla em funcionamento.
//
// O registro de execução e o fluxo de handoff rodam num SQLite descartável
// com as migrations completas — banco real, dado sintético, zero produção.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { FUNCOES_V2 } from "@/lib/agency/catalogo-v2/catalogo";
import { specDaFuncao } from "@/lib/agency/catalogo-v2/specs";
import { PERFIL_DO_PAPEL } from "@/lib/agency/roles";
import {
  executarFuncao,
  type AtorDaExecucao,
  type ContextoDeExecucao,
  type DependenciasDoExecutor,
} from "@/lib/agency/execucao-v2/executor";
import type { RegistroDeExecucao } from "@/lib/agency/execucao-v2/registro";
import { criarHandoff, aceitarHandoff, type ArmazemDeHandoffs } from "@/lib/agency/handoff-v2/handoff";
import { armazemDeHandoffsNoBanco } from "@/lib/agency/handoff-v2/armazem-prisma";

const CAMINHO_DB = "/tmp/v2-homologacao.db";
let prisma: PrismaClient;

beforeAll(() => {
  rmSync(CAMINHO_DB, { force: true });
  execSync(`npx prisma migrate deploy`, {
    env: { ...process.env, DATABASE_URL: `file:${CAMINHO_DB}` },
    stdio: "pipe",
    timeout: 240_000,
  });
  prisma = new PrismaClient({ adapter: new PrismaLibSql({ url: `file:${CAMINHO_DB}` }) });
}, 300_000);

afterAll(async () => {
  await prisma.$disconnect();
  rmSync(CAMINHO_DB, { force: true });
});

// ---- utilidades do ensaio ------------------------------------------------

const PERFIL = PERFIL_DO_PAPEL.master; // a homologação roda com autoridade total; o recorte fino tem teste próprio (capacidades)
const ATOR_IA: AtorDaExecucao = { ator: "ia", modelo: "homologacao-sintetica", versaoModelo: "v1" };
const relogio = { agora: new Date("2026-08-15T12:00:00Z") };

function depsEmMemoria(opcoes?: {
  flagsLigadas?: string[];
  custoRealUsd?: (teto: number) => number;
  gravadas?: RegistroDeExecucao[];
}): DependenciasDoExecutor {
  return {
    async flagLigada(chave) {
      return (opcoes?.flagsLigadas ?? []).includes(chave);
    },
    async gravarExecucao(registro) {
      opcoes?.gravadas?.push(registro);
    },
    async realizar(spec) {
      // A validação estrutural é real: ficha que pede JSON recebe JSON.
      const saida = /json/i.test(spec.saida.formato)
        ? JSON.stringify({ marca: "[SINTÉTICO]", corpo: `saída de ensaio no formato ${spec.saida.formato}` })
        : `[SINTÉTICO] saída de ensaio no formato ${spec.saida.formato}`;
      return {
        saida,
        custoUsd: opcoes?.custoRealUsd?.(spec.teto_custo_usd_execucao) ?? spec.teto_custo_usd_execucao / 2,
      };
    },
    agora: () => relogio.agora,
  };
}

function contextoSintetico(funcaoId: string, sobrescrever?: Partial<ContextoDeExecucao>): ContextoDeExecucao {
  const spec = specDaFuncao(funcaoId);
  if (!spec.ok) throw new Error(spec.motivo);
  const entradas: Record<string, string> = {};
  for (const nome of spec.spec.entradas_obrigatorias) {
    entradas[nome] = `[SINTÉTICO] ${spec.spec.golden_set.find((c) => c.tipo === "normal")?.entrada ?? nome}`;
  }
  return {
    modo: "homologacao",
    sintetico: true,
    entradas,
    ferramentasPrevistas: [spec.spec.ferramentas_permitidas[0]!],
    custoPrevistoUsd: spec.spec.teto_custo_usd_execucao / 2,
    correlationId: `homologacao:${funcaoId}`,
    escopos: ["workspace-sintetico"],
    ...sobrescrever,
  };
}

// ---- 1. a trava de produção ----------------------------------------------

// A allowlist do piloto assistido (decisão do CEO, 15/08/2026) — as mesmas 6
// do teste de fichas; se as fichas divergirem desta lista, um dos dois reprova.
const CADEIA_DO_PILOTO = new Set([
  "pm-orchestrator",
  "brand-architect",
  "social-strategist",
  "editorial-planner",
  "copywriter",
  "graphic-designer",
]);

describe("homologação — produção respeita a trava dupla: só a cadeia do piloto, e só com flag", () => {
  it("as funções FORA da cadeia recusam em produção mesmo com a flag v2_execucao ligada", async () => {
    const deps = depsEmMemoria({ flagsLigadas: ["v2_execucao"] });
    for (const f of FUNCOES_V2) {
      if (CADEIA_DO_PILOTO.has(f.id)) continue;
      const resultado = await executarFuncao(f.id, PERFIL, contextoSintetico(f.id, { modo: "producao" }), ATOR_IA, deps);
      expect(resultado.decisao, f.id).toBe("recusado");
      if (resultado.decisao === "recusado") {
        expect(resultado.motivo, f.id).toContain("DESLIGADA");
      }
    }
  });

  it("as 6 da cadeia recusam em produção SEM a flag no escopo — a segunda chave segura sozinha", async () => {
    const deps = depsEmMemoria(); // nenhuma flag ligada
    for (const id of CADEIA_DO_PILOTO) {
      const resultado = await executarFuncao(id, PERFIL, contextoSintetico(id, { modo: "producao" }), ATOR_IA, deps);
      expect(resultado.decisao, id).toBe("recusado");
      if (resultado.decisao === "recusado") expect(resultado.motivo, id).toContain("v2_execucao");
    }
  });

  it("as 6 da cadeia EXECUTAM em produção com a flag ligada no escopo — as duas chaves juntas abrem", async () => {
    const deps = depsEmMemoria({ flagsLigadas: ["v2_execucao"] });
    for (const id of CADEIA_DO_PILOTO) {
      const resultado = await executarFuncao(id, PERFIL, contextoSintetico(id, { modo: "producao" }), ATOR_IA, deps);
      expect(resultado.decisao, id).toBe("executado");
    }
  });

  it("a segunda chave também tranca sozinha: spec ativa mas flag desligada → recusa", async () => {
    const deps = depsEmMemoria(); // nenhuma flag ligada
    const specReal = specDaFuncao("copywriter");
    expect(specReal.ok).toBe(true);
    if (!specReal.ok) return;
    // Spec forjada ligada SÓ dentro do teste — prova que a flag segura sozinha.
    deps.specDe = () => ({ ok: true, spec: { ...specReal.spec, ativa: true } });
    const resultado = await executarFuncao("copywriter", PERFIL, contextoSintetico("copywriter", { modo: "producao" }), ATOR_IA, deps);
    expect(resultado.decisao).toBe("recusado");
    if (resultado.decisao === "recusado") expect(resultado.motivo).toContain("v2_execucao");
  });

  it("homologação sem contexto marcado sintético recusa — dado real não entra em ensaio", async () => {
    const deps = depsEmMemoria();
    for (const f of FUNCOES_V2) {
      const resultado = await executarFuncao(f.id, PERFIL, contextoSintetico(f.id, { sintetico: false }), ATOR_IA, deps);
      expect(resultado.decisao, f.id).toBe("recusado");
    }
  });
});

// ---- 2. o golden set das 69 ----------------------------------------------

describe("homologação — as 69 funções passam pelos três casos do golden set", () => {
  it("caso NORMAL: executa, registra no banco real e fica dentro do teto", async () => {
    const deps: DependenciasDoExecutor = {
      ...depsEmMemoria(),
      async gravarExecucao(registro) {
        await prisma.execucaoV2.create({
          data: {
            ator: registro.ator,
            usuarioId: registro.usuarioId,
            modelo: registro.modelo,
            versaoModelo: registro.versaoModelo,
            custoUsd: registro.custoUsd,
            funcaoId: registro.funcaoId,
            departamentoId: registro.departamentoId,
            ferramentas: JSON.stringify(registro.ferramentas),
            correlationId: registro.correlationId,
            inicio: registro.inicio,
            fim: registro.fim,
            resultado: registro.resultado,
          },
        });
      },
    };
    for (const f of FUNCOES_V2) {
      const resultado = await executarFuncao(f.id, PERFIL, contextoSintetico(f.id), ATOR_IA, deps);
      expect(resultado.decisao, f.id).toBe("executado");
      if (resultado.decisao === "executado") {
        const spec = specDaFuncao(f.id);
        expect(spec.ok && resultado.custoUsd <= spec.spec.teto_custo_usd_execucao, `${f.id}: custo dentro do teto`).toBe(true);
        expect(resultado.saida).toContain("[SINTÉTICO]");
      }
    }
    const gravadas = await prisma.execucaoV2.findMany();
    expect(gravadas.length).toBe(FUNCOES_V2.length);
    for (const g of gravadas) {
      expect(g.ator).toBe("ia");
      expect(g.modelo).toBe("homologacao-sintetica");
      expect(g.custoUsd ?? -1).toBeGreaterThanOrEqual(0);
      expect(g.correlationId.startsWith("homologacao:")).toBe(true);
    }
  });

  it("caso RECUSA: entrada obrigatória faltando recusa com o nome da falta", async () => {
    const deps = depsEmMemoria();
    for (const f of FUNCOES_V2) {
      const contexto = contextoSintetico(f.id);
      const primeira = Object.keys(contexto.entradas)[0]!;
      delete contexto.entradas[primeira];
      const resultado = await executarFuncao(f.id, PERFIL, contexto, ATOR_IA, deps);
      expect(resultado.decisao, f.id).toBe("recusado");
      if (resultado.decisao === "recusado") expect(resultado.motivo, f.id).toContain(primeira);
    }
  });

  it("caso RECUSA: ferramenta proibida pela ficha barra antes de qualquer trabalho", async () => {
    const gravadas: RegistroDeExecucao[] = [];
    const deps = depsEmMemoria({ gravadas });
    for (const f of FUNCOES_V2) {
      const spec = specDaFuncao(f.id);
      expect(spec.ok, f.id).toBe(true);
      if (!spec.ok) continue;
      const contexto = contextoSintetico(f.id, { ferramentasPrevistas: [spec.spec.ferramentas_proibidas[0]!] });
      const resultado = await executarFuncao(f.id, PERFIL, contexto, ATOR_IA, deps);
      expect(resultado.decisao, f.id).toBe("recusado");
      if (resultado.decisao === "recusado") expect(resultado.motivo, f.id).toContain("proibida");
    }
    expect(gravadas.length, "recusa não gera execução nem registro").toBe(0);
  });

  it("caso ESCALADA: gatilho humano da ficha detectado sobe com pacote completo, sem executar", async () => {
    const gravadas: RegistroDeExecucao[] = [];
    const deps = depsEmMemoria({ gravadas });
    for (const f of FUNCOES_V2) {
      const spec = specDaFuncao(f.id);
      expect(spec.ok, f.id).toBe(true);
      if (!spec.ok) continue;
      const gatilho = spec.spec.gatilhos_humanos[0]!;
      const resultado = await executarFuncao(f.id, PERFIL, contextoSintetico(f.id, { gatilhosDetectados: [gatilho] }), ATOR_IA, deps);
      expect(resultado.decisao, f.id).toBe("escalado");
      if (resultado.decisao === "escalado") {
        expect(resultado.pacote.gatilhos).toContain(gatilho);
        expect(resultado.pacote.funcaoId).toBe(f.id);
        expect(resultado.pacote.correlationId).toBe(`homologacao:${f.id}`);
        expect(Object.keys(resultado.pacote.entradas).length).toBeGreaterThan(0);
      }
    }
    expect(gravadas.length, "escalada por gatilho não executa nada").toBe(0);
  });
});

// ---- 3. as outras travas do motor ----------------------------------------

describe("homologação — teto de custo, timeout e rastro obrigatório", () => {
  it("custo previsto acima do teto da ficha recusa antes de gastar", async () => {
    const deps = depsEmMemoria();
    const resultado = await executarFuncao("copywriter", PERFIL, contextoSintetico("copywriter", { custoPrevistoUsd: 999 }), ATOR_IA, deps);
    expect(resultado.decisao).toBe("recusado");
    if (resultado.decisao === "recusado") expect(resultado.motivo).toContain("teto");
  });

  it("custo REAL estourando o teto registra a execução e escala — estouro não se esconde", async () => {
    const gravadas: RegistroDeExecucao[] = [];
    const deps = depsEmMemoria({ gravadas, custoRealUsd: (teto) => teto * 2 });
    const resultado = await executarFuncao("copywriter", PERFIL, contextoSintetico("copywriter"), ATOR_IA, deps);
    expect(resultado.decisao).toBe("escalado");
    if (resultado.decisao === "escalado") expect(resultado.pacote.motivo).toContain("estourou o teto");
    expect(gravadas.length, "o gasto aconteceu, então o registro existe").toBe(1);
  });

  it("execução por IA sem modelo declarado recusa ANTES de realizar qualquer trabalho", async () => {
    let realizou = false;
    const deps = depsEmMemoria();
    const realizarOriginal = deps.realizar;
    deps.realizar = async (spec, ctx) => {
      realizou = true;
      return realizarOriginal(spec, ctx);
    };
    const resultado = await executarFuncao("copywriter", PERFIL, contextoSintetico("copywriter"), { ator: "ia" }, deps);
    expect(resultado.decisao).toBe("recusado");
    expect(realizou).toBe(false);
  });

  it("função fora do catálogo recusa nomeando o desconhecido", async () => {
    const deps = depsEmMemoria();
    const resultado = await executarFuncao("funcao-inventada", PERFIL, contextoSintetico("copywriter"), ATOR_IA, deps);
    expect(resultado.decisao).toBe("recusado");
    if (resultado.decisao === "recusado") expect(resultado.motivo).toContain("funcao-inventada");
  });
});

// ---- 4. handoff no banco real --------------------------------------------

describe("homologação — handoff entre departamentos na tabela HandoffV2 real", () => {
  const agora = () => relogio.agora;
  let armazem: ArmazemDeHandoffs;
  let idDoHandoff: string;

  beforeAll(() => {
    armazem = armazemDeHandoffsNoBanco(prisma);
  });

  it("criar com o contrato completo do 03 nasce aguardando_recebimento", async () => {
    const resultado = await criarHandoff(
      {
        deDepartamento: "social-media",
        paraDepartamento: "analytics",
        responsavelEntrega: "copywriter",
        entrada: "[SINTÉTICO] calendário aprovado do ciclo de ensaio",
        saida: "[SINTÉTICO] posts publicados do ciclo com ids de rastreio",
        versaoArtefato: "v1-homologacao",
        criterios: "métricas coletáveis por post; nenhum dado real de cliente",
        correlationId: "homologacao:handoff-1",
      },
      armazem,
      agora,
    );
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.status).toBe("aguardando_recebimento");
    idDoHandoff = resultado.id;
    const linha = await prisma.handoffV2.findUnique({ where: { id: idDoHandoff } });
    expect(linha?.status).toBe("aguardando_recebimento");
  });

  it("sem aceite, a linha continua na fila anterior — e recebedor de outro departamento não aceita", async () => {
    const negado = await aceitarHandoff(idDoHandoff, "designer-intruso", ["design"], armazem, agora);
    expect(negado.ok).toBe(false);
    const linha = await prisma.handoffV2.findUnique({ where: { id: idDoHandoff } });
    expect(linha?.status).toBe("aguardando_recebimento");
  });

  it("aceite pelo departamento destino fecha o handoff — e aceitar de novo é idempotente", async () => {
    const aceite = await aceitarHandoff(idDoHandoff, "performance-analyst", ["analytics"], armazem, agora);
    expect(aceite.ok).toBe(true);
    const linha = await prisma.handoffV2.findUnique({ where: { id: idDoHandoff } });
    expect(linha?.status).toBe("aceito");
    expect(linha?.responsavelRecebe).toBe("performance-analyst");
    const deNovo = await aceitarHandoff(idDoHandoff, "performance-analyst", ["analytics"], armazem, agora);
    expect(deNovo.ok && deNovo.idempotente).toBe(true);
  });

  it("contrato incompleto ou departamento desconhecido não cria linha nenhuma", async () => {
    const antes = await prisma.handoffV2.count();
    const semCriterios = await criarHandoff(
      {
        deDepartamento: "social-media",
        paraDepartamento: "analytics",
        responsavelEntrega: "copywriter",
        entrada: "[SINTÉTICO] algo",
        saida: "[SINTÉTICO] algo",
        versaoArtefato: "v1",
        criterios: "  ",
        correlationId: "homologacao:handoff-2",
      },
      armazem,
      agora,
    );
    expect(semCriterios.ok).toBe(false);
    const depFalso = await criarHandoff(
      {
        deDepartamento: "departamento-inventado",
        paraDepartamento: "analytics",
        responsavelEntrega: "alguem",
        entrada: "[SINTÉTICO] x",
        saida: "[SINTÉTICO] y",
        versaoArtefato: "v1",
        criterios: "z de verdade",
        correlationId: "homologacao:handoff-3",
      },
      armazem,
      agora,
    );
    expect(depFalso.ok).toBe(false);
    const paraSiMesmo = await criarHandoff(
      {
        deDepartamento: "analytics",
        paraDepartamento: "analytics",
        responsavelEntrega: "alguem",
        entrada: "[SINTÉTICO] x",
        saida: "[SINTÉTICO] y",
        versaoArtefato: "v1",
        criterios: "z de verdade",
        correlationId: "homologacao:handoff-4",
      },
      armazem,
      agora,
    );
    expect(paraSiMesmo.ok).toBe(false);
    expect(await prisma.handoffV2.count()).toBe(antes);
  });

  it("as specs das 69 fecham um grafo de handoff sem ponta solta (recebe_de/entrega_para conhecidos)", () => {
    // A validação fina de alvo já roda em fichas-da-linha.test.ts; aqui a
    // homologação confirma que TODA função declara os dois lados do bastão.
    for (const f of FUNCOES_V2) {
      const spec = specDaFuncao(f.id);
      expect(spec.ok, f.id).toBe(true);
      if (!spec.ok) continue;
      expect(spec.spec.handoff.recebe_de.trim().length, f.id).toBeGreaterThan(2);
      expect(spec.spec.handoff.entrega_para.trim().length, f.id).toBeGreaterThan(2);
    }
  });
});
