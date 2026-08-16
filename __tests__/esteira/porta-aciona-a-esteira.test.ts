// O BRIEFING SAI DA PORTA E ANDA — e quando não anda, DIZ POR QUÊ.
//
// O caso real: briefing do CityJobs enviado com dois PDFs, tela prometendo
// "em breve você saberá o orçamento", uma linha em `ClientRequestDb` e
// silêncio. Não havia bug — havia um elo que não existia entre a porta
// pública e o ciclo assistido.
//
// As metades que importam:
//   ✅ autorizado → a cadeia roda e termina em card de aprovação HUMANA;
//   ⛔ não autorizado → a cadeia NÃO roda (não gasta) e a recusa vira LINHA
//      com motivo em português;
//   🔑 recusa repetida NÃO regrava — regravar zeraria a idade e esconderia
//      há quanto tempo aquilo está parado, que é a informação inteira.

import { describe, it, expect, vi } from "vitest";
import {
  varrerAPorta, MAX_POR_RODADA, JANELA_DE_CANDIDATOS, correlationDaPorta,
  type DependenciasDaVarredura, type SolicitacaoNaPorta,
} from "@/lib/agency/esteira-assistida/varredura";
import { AUTORIZACAO_DA_ESTEIRA, PORTA_DA_ESTEIRA } from "@/lib/agency/esteira-assistida/recusa-visivel";
import { FLAGS_V2, type LinhaDeFlag } from "@/lib/agency/flags-v2/flags";

const AGORA = new Date("2026-08-16T12:00:00Z");
const AGENCIA = "ws_dioli";
const CLIENTE = "cli_cityjobs";

function briefing(over: Partial<SolicitacaoNaPorta> = {}): SolicitacaoNaPorta {
  return {
    id: "req_cityjobs",
    workspaceId: AGENCIA,
    clientId: null,
    businessName: "CityJobs",
    rawContext: "Plataforma de vagas do Alto Tietê. Preciso de social media e identidade.",
    status: "new",
    createdAt: new Date("2026-08-16T01:12:00Z"),
    temComoFalar: true,
    porQueNaoDaParaFalar: null,
    ...over,
  };
}

function montar(over: Partial<DependenciasDaVarredura> = {}, flags: LinhaDeFlag[] = [{ chave: FLAGS_V2.execucao, escopo: AGENCIA, ligada: true }]) {
  const recusas: Array<{ funcaoId: string; motivo: string; correlationId: string }> = [];
  const aprovacoes: Array<{ clienteId: string; solicitacaoId: string }> = [];
  const status: Array<[string, string]> = [];
  const deps: DependenciasDaVarredura = {
    solicitacoesNaPorta: vi.fn(async (limite: number) => [briefing()].slice(0, limite)),
    resolverCliente: vi.fn(async () => ({ id: CLIENTE, workspaceId: AGENCIA, name: "CityJobs" })),
    flags: { async buscar(chave, escopos) { return flags.filter((f) => f.chave === chave && escopos.includes(f.escopo)); } },
    recusaRecente: vi.fn(async () => false),
    registrarRecusa: vi.fn(async (d) => { recusas.push(d); }),
    jaFeitos: vi.fn(async () => ({})),
    reservar: vi.fn(async () => true),
    marcarStatus: vi.fn(async (id: string, s: string) => { status.push([id, s]); }),
    rodarCiclo: vi.fn(async () => ({
      ok: true,
      passos: [{ funcaoId: "pm-orchestrator", departamentoId: "pm", decisao: "executado" as const, custoUsd: 0.01, duracaoMs: 10 }],
      artefatos: { "pm-orchestrator": "{}" },
      custoTotalUsd: 0.01,
    })),
    abrirAprovacao: vi.fn(async (d) => { aprovacoes.push(d); return { id: "ap1" }; }),
    agora: () => AGORA,
    ...over,
  };
  return { deps, recusas, aprovacoes, status };
}

describe("✅ o briefing autorizado ANDA até o card de aprovação", () => {
  it("roda a cadeia e abre aprovação HUMANA — nada é publicado", async () => {
    const { deps, aprovacoes } = montar();
    const r = await varrerAPorta(deps);
    expect(r.andaram).toBe(1);
    expect(r.recusadas).toBe(0);
    expect(aprovacoes).toEqual([{ clienteId: CLIENTE, solicitacaoId: "req_cityjobs", resumo: expect.any(String) }]);
  });

  it("o que entra no motor é o TEXTO DO CLIENTE, não um resumo inventado", async () => {
    const { deps } = montar();
    await varrerAPorta(deps);
    const pedido = (deps.rodarCiclo as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(pedido.solicitacao).toContain("Alto Tietê");
    expect(pedido.correlationId).toBe(correlationDaPorta(CLIENTE, "req_cityjobs"));
  });

  it("briefing sem texto NÃO é preenchido por inferência — escreve 'preciso confirmar'", async () => {
    const { deps } = montar({
      solicitacoesNaPorta: async () => [briefing({ rawContext: "   " })],
    });
    await varrerAPorta(deps);
    const pedido = (deps.rodarCiclo as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(pedido.solicitacao).toContain("preciso confirmar");
  });
});

describe("⛔ sem autorização a esteira NÃO gasta, e a recusa é VISÍVEL", () => {
  it("não chama a cadeia, não reserva, e grava o motivo em português", async () => {
    const { deps, recusas } = montar({}, []); // nenhuma chave virada
    const r = await varrerAPorta(deps);

    expect(deps.rodarCiclo).not.toHaveBeenCalled();   // não gastou um centavo
    expect(deps.reservar).not.toHaveBeenCalled();     // nem tirou da fila
    expect(r.recusadas).toBe(1);
    expect(recusas).toHaveLength(1);
    expect(recusas[0]!.funcaoId).toBe(AUTORIZACAO_DA_ESTEIRA);
    expect(recusas[0]!.motivo).toContain("CityJobs");
    expect(recusas[0]!.motivo).toContain("DESLIGADA");
  });

  it("🔑 recusa REPETIDA não regrava — a idade da linha antiga é a informação", async () => {
    const { deps, recusas } = montar({ recusaRecente: vi.fn(async () => true) }, []);
    const r = await varrerAPorta(deps);
    expect(r.recusadas).toBe(1);       // continua contando como recusada
    expect(recusas).toHaveLength(0);   // e NÃO cria linha nova
  });

  // 🔴 ESTE ACHADO SAIU DA TELA, NÃO DA LEITURA. Na primeira prova ao vivo, a
  // varredura processou uma linha antiga em `new` SEM CONTATO — pagou seis
  // funções de IA para produzir uma proposta sem para onde ir. É o caso real
  // do Sushi Cazza, 51 dias na porta e nenhum canal.
  it("⛔ lead SEM CONTATO não gasta cadeia — a proposta não teria para onde ir", async () => {
    const { deps, recusas } = montar({
      solicitacoesNaPorta: async () => [briefing({
        businessName: "Sushi Cazza", temComoFalar: false,
        porQueNaoDaParaFalar: "o briefing foi enviado sem nome de contato e sem canal (WhatsApp ou e-mail)",
      })],
    });
    const r = await varrerAPorta(deps);
    expect(deps.rodarCiclo).not.toHaveBeenCalled();
    expect(deps.reservar).not.toHaveBeenCalled();
    expect(r.recusadas).toBe(1);
    expect(recusas[0]!.funcaoId).toBe(PORTA_DA_ESTEIRA);
    expect(recusas[0]!.motivo).toContain("Sushi Cazza");
    expect(recusas[0]!.motivo).toMatch(/sem canal|não há como falar/i);
  });

  it("✅ a metade limpa: COM contato a mesma fila anda normalmente", async () => {
    const { deps } = montar({ solicitacoesNaPorta: async () => [briefing({ temComoFalar: true })] });
    const r = await varrerAPorta(deps);
    expect(r.andaram).toBe(1);
    expect(r.recusadas).toBe(0);
  });

  it("solicitação sem agência recusa pela porta, com o motivo do que falta", async () => {
    const { deps, recusas } = montar({
      resolverCliente: async () => ({ erro: "O briefing de \"CityJobs\" entrou sem agência definida." }),
    });
    await varrerAPorta(deps);
    expect(recusas[0]!.funcaoId).toBe(PORTA_DA_ESTEIRA);
    expect(recusas[0]!.motivo).toMatch(/agência/i);
  });
});

describe("🔒 as travas de dinheiro e de concorrência", () => {
  it("a reserva acontece ANTES do ciclo — perdeu a corrida, não gasta", async () => {
    const ordem: string[] = [];
    const { deps } = montar({
      reservar: vi.fn(async () => { ordem.push("reservar"); return false; }),
      rodarCiclo: vi.fn(async () => { ordem.push("ciclo"); throw new Error("não devia rodar"); }),
    });
    const r = await varrerAPorta(deps);
    expect(ordem).toEqual(["reservar"]);
    expect(r.andaram).toBe(0);
    expect(r.detalhe[0]!.desfecho).toBe("reservada-por-outro");
  });

  // ⚠️ ESTE TESTE ESTAVA ERRADO, e o erro dele É o defeito G-2. Ele exigia
  // que a passada BUSCASSE só `MAX_POR_RODADA` linhas — que é exatamente o que
  // deixava dois leads velhos entupindo a fila para sempre. O teto certo é o
  // de cadeias INICIADAS; ver `__tests__/esteira/a-fila-nao-entope.test.ts`.
  it("o teto de GASTO é real — 40 briefings não viram 40 cadeias de IA", async () => {
    const pedidos = Array.from({ length: 40 }, (_, i) => briefing({ id: `req${i}` }));
    const { deps } = montar({ solicitacoesNaPorta: vi.fn(async (limite: number) => pedidos.slice(0, limite)) });
    const r = await varrerAPorta(deps);
    expect(deps.solicitacoesNaPorta).toHaveBeenCalledWith(JANELA_DE_CANDIDATOS);
    expect(r.andaram).toBeLessThanOrEqual(MAX_POR_RODADA);
    expect((deps.rodarCiclo as ReturnType<typeof vi.fn>).mock.calls.length).toBe(MAX_POR_RODADA);
  });

  it("o trabalho já pago volta do registro, não do provedor", async () => {
    const { deps } = montar({ jaFeitos: vi.fn(async () => ({ "pm-orchestrator": "{já feito}" })) });
    await varrerAPorta(deps);
    const pedido = (deps.rodarCiclo as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(pedido.jaFeitos["pm-orchestrator"]).toBe("{já feito}");
  });
});

describe("🟠 ciclo que PARA no meio pede decisão numa tela — não volta ao limbo", () => {
  it("a solicitação vira `precisa_decisao`, com o motivo no detalhe da rodada", async () => {
    const { deps, status } = montar({
      rodarCiclo: vi.fn(async () => ({
        ok: false,
        passos: [],
        artefatos: {},
        custoTotalUsd: 0,
        parouEm: { funcaoId: "brand-architect", decisao: "escalado", motivo: "gatilho humano da ficha detectado" },
      })),
    });
    const r = await varrerAPorta(deps);
    expect(r.pararamNoMeio).toBe(1);
    expect(status).toEqual([["req_cityjobs", "precisa_decisao"]]);
    expect(r.detalhe[0]!.motivo).toContain("gatilho humano");
    // E NUNCA volta para "new": voltar faria a rodada seguinte pagar de novo.
    expect(status.some(([, s]) => s === "new")).toBe(false);
  });
});
