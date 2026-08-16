// A CADEIA TÉCNICA — o teste de que o 12º departamento tem mãos, e mãos amarradas.
//
// POR QUE ELE EXISTE: as sete fichas de Produto & Tecnologia existiam desde
// 15/08/2026 com sala, permissões e formato de saída declarado — e nada no
// sistema convertia a saída delas em trabalho. Em 16/08 o CEO mandou consertar.
// O risco de consertar errado é maior que o de não consertar: um departamento
// com mãos e sem trava mexe em banco vivo do piloto.
//
// Este arquivo cobra as duas metades:
//   • a cadeia RODA (ponta a ponta, com dublê no lugar do provedor de IA);
//   • a cadeia PARA nos lugares certos — cliente, ordem que contraria a ficha,
//     entrada faltando, gatilho humano, patch perigoso.

import { describe, it, expect } from "vitest";
import {
  CADEIA_TECNICA_MINIMA,
  ORDEM_TECNICA,
  executarCadeiaTecnica,
  idsDeHandoff,
  ordemRespeitaAsFichas,
  type DependenciasDaCadeiaTecnica,
} from "@/lib/agency/produto-tecnologia/cadeia-tecnica";
import { specDaFuncao } from "@/lib/agency/catalogo-v2/specs";
import type { RegistroDeExecucao } from "@/lib/agency/execucao-v2/registro";
import type { PerfilOrganizacional } from "@/lib/agency/organizacao/autoridade";

const PERFIL: PerfilOrganizacional = { autoridade: "director", departamentos: [] } as PerfilOrganizacional;

const DEMANDA = {
  demanda: "O diário do piloto não mostra as execuções da cadeia técnica.",
  contexto: "app/api/piloto/diario/route.ts lê cinco tabelas e nenhuma delas é ExecucaoV2.",
  criteriosDeAceite: "A linha do tempo passa a incluir execução técnica, com teste.",
  correlationId: "tecnica:teste:1",
};

/** Um patch bem-comportado — é o que um engenheiro entregaria num dia bom. */
const PATCH_LIMPO = [
  "diff --git a/lib/agency/pulso.ts b/lib/agency/pulso.ts",
  "--- a/lib/agency/pulso.ts",
  "+++ b/lib/agency/pulso.ts",
  "@@ -1,2 +1,3 @@",
  " export const pulso = 1;",
  "+export const batida = 2;",
].join("\n");

interface Espiao {
  gravadas: RegistroDeExecucao[];
  recusas: string[];
  chamadas: string[];
}

/**
 * Monta as dependências com dublês. `realizar` devolve o que o teste mandar,
 * por função — é assim que se ensaia o dia ruim (patch destrutivo) sem precisar
 * de provedor de IA nem de repositório de verdade.
 */
function deps(saidaPorFuncao: Record<string, string>, espiao: Espiao): DependenciasDaCadeiaTecnica {
  let relogio = 0;
  const agora = () => new Date(1_760_000_000_000 + relogio++ * 1000);
  return {
    perfil: PERFIL,
    agora,
    executor: {
      // Homologação não consulta flag. Se um dia consultar, o teste enxerga:
      // `false` faria a produção recusar, então a cadeia denunciaria o desvio.
      flagLigada: async () => false,
      async gravarExecucao(registro) {
        espiao.gravadas.push(registro);
      },
      async gravarRecusa(recusa) {
        espiao.recusas.push(`${recusa.funcaoId}: ${recusa.motivo}`);
      },
      async realizar(spec) {
        espiao.chamadas.push(spec.funcao);
        const saida = saidaPorFuncao[spec.funcao];
        if (saida) return { saida, custoUsd: 0.01 };
        // Saída genérica válida: o executor exige corpo e, em ficha JSON, JSON.
        return {
          saida: JSON.stringify({ funcao: spec.funcao, conteudo: "plano completo o suficiente para passar" }),
          custoUsd: 0.01,
        };
      },
      agora,
    },
  };
}

const espiaoNovo = (): Espiao => ({ gravadas: [], recusas: [], chamadas: [] });

describe("a ordem da cadeia é a das fichas, não a que alguém digitou", () => {
  it("a cadeia mínima respeita todo `recebe_de` das fichas", () => {
    expect(ordemRespeitaAsFichas(CADEIA_TECNICA_MINIMA)).toEqual({ ok: true });
  });

  it("a ordem canônica das sete também respeita", () => {
    expect(ordemRespeitaAsFichas(ORDEM_TECNICA)).toEqual({ ok: true });
  });

  it("reprova uma ordem invertida — o teste é o que impede a cadeia de envelhecer calada", () => {
    const invertida = ["backend-engineer", "software-architect"];
    const conferencia = ordemRespeitaAsFichas(invertida);
    expect(conferencia.ok).toBe(false);
    if (!conferencia.ok) expect(conferencia.motivo).toContain("contraria a ficha");
  });

  it("todas as sete funções da ordem canônica têm ficha legível e são do departamento", () => {
    for (const funcaoId of ORDEM_TECNICA) {
      const r = specDaFuncao(funcaoId);
      expect(r.ok, funcaoId).toBe(true);
      if (r.ok) expect(r.spec.departamento, funcaoId).toBe("product-technology");
    }
  });

  it("sabe quebrar a lista de handoff escrita em português", () => {
    expect(idsDeHandoff("frontend-engineer, fullstack-engineer, quality e operations")).toEqual([
      "frontend-engineer",
      "fullstack-engineer",
      "quality",
      "operations",
    ]);
  });
});

describe("a cadeia técnica roda de ponta a ponta", () => {
  it("executa os três passos e guarda o patch como PROPOSTA, não como aplicação", async () => {
    const espiao = espiaoNovo();
    const resultado = await executarCadeiaTecnica(DEMANDA, deps({ "backend-engineer": PATCH_LIMPO }, espiao));

    expect(resultado.ok).toBe(true);
    expect(espiao.chamadas).toEqual([...CADEIA_TECNICA_MINIMA]);
    expect(resultado.propostas).toHaveLength(1);
    expect(resultado.propostas[0]!.funcaoId).toBe("backend-engineer");
    expect(resultado.propostas[0]!.guarda.veredito).toBe("aceito");
  });

  it("deixa rastro de TODA execução — trabalho que ninguém enxerga foi o defeito de 15/08", async () => {
    const espiao = espiaoNovo();
    await executarCadeiaTecnica(DEMANDA, deps({ "backend-engineer": PATCH_LIMPO }, espiao));

    expect(espiao.gravadas.map((r) => r.funcaoId)).toEqual([...CADEIA_TECNICA_MINIMA]);
    for (const registro of espiao.gravadas) {
      expect(registro.correlationId).toBe(DEMANDA.correlationId);
      expect(registro.departamentoId).toBe("product-technology");
      expect(registro.ator).toBe("ia");
      expect(registro.resultado).toBeTruthy();
    }
  });

  it("não paga duas vezes pelo mesmo passo — retomada usa o que já foi gravado", async () => {
    const espiao = espiaoNovo();
    const resultado = await executarCadeiaTecnica(
      { ...DEMANDA, jaFeitos: { "technology-orchestrator": '{"plano":"já feito antes, veio do registro"}' } },
      deps({ "backend-engineer": PATCH_LIMPO }, espiao),
    );

    expect(resultado.ok).toBe(true);
    expect(espiao.chamadas).not.toContain("technology-orchestrator");
    expect(resultado.passos[0]).toMatchObject({ funcaoId: "technology-orchestrator", decisao: "reaproveitado" });
  });

  it("o dossiê cresce: o engenheiro vê o que o arquiteto decidiu", async () => {
    const espiao = espiaoNovo();
    const vistoPeloBackend: Record<string, string>[] = [];
    const base = deps({ "backend-engineer": PATCH_LIMPO }, espiao);
    const resultado = await executarCadeiaTecnica(DEMANDA, {
      ...base,
      executor: {
        ...base.executor,
        async realizar(spec, contexto) {
          if (spec.funcao === "backend-engineer") vistoPeloBackend.push(contexto.entradas);
          return spec.funcao === "backend-engineer"
            ? { saida: PATCH_LIMPO, custoUsd: 0 }
            : { saida: JSON.stringify({ decisao: `saída de ${spec.funcao} com corpo suficiente` }), custoUsd: 0 };
        },
      },
    });

    expect(resultado.ok).toBe(true);
    const texto = Object.values(vistoPeloBackend[0]!).join("\n");
    expect(texto).toContain("software-architect");
    expect(texto).toContain("technology-orchestrator");
  });
});

describe("a cadeia técnica para onde tem que parar", () => {
  it("toda parada da cadeia deixa rastro — parar calado é parar num lugar que o CEO não enxerga", async () => {
    // O executor grava as recusas DELE. As paradas da cadeia (cliente, ordem
    // inválida, guarda de patch, não-entrega) são recusas da cadeia, e sem
    // gravação não apareceriam no diário do piloto — a mesma cegueira que
    // custou a noite de 15/08, só que com a agência decidindo sozinha.
    const paradas: Array<[string, Record<string, string>]> = [
      ["cliente", { clienteId: "cli_1" }],
      ["ordem inválida", { cadeia: ["backend-engineer", "software-architect"] } as unknown as Record<string, string>],
    ];
    for (const [nome, extra] of paradas) {
      const espiao = espiaoNovo();
      await executarCadeiaTecnica({ ...DEMANDA, ...extra }, deps({}, espiao));
      expect(espiao.recusas, nome).toHaveLength(1);
      expect(espiao.recusas[0], nome).toContain("cadeia-tecnica");
    }
  });

  it("a parada na guarda de patch também é gravada, com o motivo da guarda", async () => {
    const espiao = espiaoNovo();
    const comSegredo = [
      "diff --git a/.env b/.env",
      "+++ b/.env",
      "@@ -0,0 +1 @@",
      "+CHAVE=123",
    ].join("\n");
    await executarCadeiaTecnica(DEMANDA, deps({ "backend-engineer": comSegredo }, espiao));

    expect(espiao.recusas.join(" ")).toContain("backend-engineer");
    expect(espiao.recusas.join(" ")).toContain("segredo não entra em patch de agente");
  });

  it("recusa em código qualquer pedido com cliente — a engenharia não encosta no material do cliente", async () => {
    const espiao = espiaoNovo();
    const resultado = await executarCadeiaTecnica({ ...DEMANDA, clienteId: "cli_123" }, deps({}, espiao));

    expect(resultado.ok).toBe(false);
    expect(resultado.parouEm?.motivo).toContain("não roda sobre cliente");
    expect(espiao.chamadas).toHaveLength(0); // parou ANTES de gastar
  });

  it("para quando o patch traz migração destrutiva, e não usa a saída como insumo do passo seguinte", async () => {
    const espiao = espiaoNovo();
    const destrutivo = [
      "diff --git a/prisma/migrations/x/migration.sql b/prisma/migrations/x/migration.sql",
      "+++ b/prisma/migrations/x/migration.sql",
      "@@ -0,0 +1 @@",
      "+DROP TABLE Client;",
    ].join("\n");
    const resultado = await executarCadeiaTecnica(DEMANDA, deps({ "backend-engineer": destrutivo }, espiao));

    expect(resultado.ok).toBe(false);
    expect(resultado.parouEm?.decisao).toBe("escalado");
    expect(resultado.propostas).toHaveLength(0);
  });

  it("para no primeiro passo que declara não-entrega, em vez de marchar produzindo nada", async () => {
    // O CASO REAL, 16/08/2026, primeira rodada de verdade desta cadeia: sem
    // provedor de IA o adaptador devolveu a falta declarada nos três passos. O
    // engenheiro parou na guarda (que exige diff), mas o orquestrador e o
    // arquiteto saíram marcados "executado" carregando `entregue: false`. A
    // guarda de patch cobria uma ficha em três; este contrato cobre as sete.
    const espiao = espiaoNovo();
    const falta = JSON.stringify({ entregue: false, motivo: "nenhum provedor de IA configurado no ambiente" });
    const resultado = await executarCadeiaTecnica(DEMANDA, deps({ "technology-orchestrator": falta }, espiao));

    expect(resultado.ok).toBe(false);
    expect(resultado.parouEm?.funcaoId).toBe("technology-orchestrator");
    expect(resultado.parouEm?.motivo).toContain("nenhum provedor de IA");
    // Parou de verdade: o arquiteto nem foi chamado.
    expect(espiao.chamadas).toEqual(["technology-orchestrator"]);
  });

  it("a não-entrega sem motivo também para — e diz que o motivo faltou", async () => {
    const espiao = espiaoNovo();
    const resultado = await executarCadeiaTecnica(
      DEMANDA,
      deps({ "technology-orchestrator": JSON.stringify({ entregue: false, conteudo: "algo" }) }, espiao),
    );
    expect(resultado.ok).toBe(false);
    expect(resultado.parouEm?.motivo).toContain("sem dizer o motivo");
  });

  it("`entregue: true` e saída sem o campo seguem em frente — o contrato não é armadilha", async () => {
    const espiao = espiaoNovo();
    const resultado = await executarCadeiaTecnica(
      DEMANDA,
      deps(
        {
          "technology-orchestrator": JSON.stringify({ entregue: true, plano: "plano de verdade, com corpo" }),
          "backend-engineer": PATCH_LIMPO,
        },
        espiao,
      ),
    );
    expect(resultado.ok).toBe(true);
    expect(espiao.chamadas).toEqual([...CADEIA_TECNICA_MINIMA]);
  });

  it("recusa a cadeia inteira quando a ordem pedida contraria as fichas", async () => {
    const espiao = espiaoNovo();
    const resultado = await executarCadeiaTecnica(
      { ...DEMANDA, cadeia: ["backend-engineer", "software-architect"] },
      deps({}, espiao),
    );

    expect(resultado.ok).toBe(false);
    expect(espiao.chamadas).toHaveLength(0);
  });

  it("recusa função de outro departamento — esta cadeia despacha só a própria casa", async () => {
    const espiao = espiaoNovo();
    const resultado = await executarCadeiaTecnica({ ...DEMANDA, cadeia: ["copywriter"] }, deps({}, espiao));

    expect(resultado.ok).toBe(false);
    expect(espiao.chamadas).toHaveLength(0);
  });

  it("para quando falta critério de aceite — ausência de informação não é informação", async () => {
    // A conferência é da CADEIA, não da ficha: as `entradas_obrigatorias` são
    // frases em prosa e o dossiê preenche todas, o que faria a checagem do
    // executor virar carimbo. Sem esta trava, demanda vazia atravessaria os
    // três passos produzindo artefato sobre nada — e cobrando por isso.
    const espiao = espiaoNovo();
    const resultado = await executarCadeiaTecnica({ ...DEMANDA, criteriosDeAceite: "  " }, deps({}, espiao));

    expect(resultado.ok).toBe(false);
    expect(resultado.parouEm?.decisao).toBe("recusado");
    expect(resultado.parouEm?.motivo).toContain("criteriosDeAceite");
    expect(espiao.chamadas).toHaveLength(0); // parou ANTES de gastar
  });
});
