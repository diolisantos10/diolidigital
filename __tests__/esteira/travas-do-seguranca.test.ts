// AS TRAVAS QUE O `seguranca` E O `experiencia` EXIGIRAM NA PR #166.
//
// Cada bloco guarda um achado. Todos com as DUAS metades: barra o caso
// plantado E deixa passar o caso limpo — foi exatamente a metade limpa que
// faltou no G-2 e deixou a fila entupida sem ninguém perceber.

import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { varrerAPorta, type DependenciasDaVarredura, type SolicitacaoNaPorta } from "@/lib/agency/esteira-assistida/varredura";
import { montarFilaDaSala, leituraDaSala } from "@/lib/agency/esteira-assistida/fila-da-sala";
import { linhaDeRecusa } from "@/lib/agency/esteira-assistida/recusa-visivel";
import { AINDA_NA_PORTA } from "@/lib/agency/comercial/quem-bateu-na-porta";
import { FLAGS_V2, type LinhaDeFlag } from "@/lib/agency/flags-v2/flags";

const AGORA = new Date("2026-08-16T12:00:00Z");
const AGENCIA = "ws_dioli";
const LIGADA: LinhaDeFlag[] = [{ chave: FLAGS_V2.execucao, escopo: AGENCIA, ligada: true }];

function lead(over: Partial<SolicitacaoNaPorta> = {}): SolicitacaoNaPorta {
  return {
    id: "req1", workspaceId: AGENCIA, clientId: null, businessName: "CityJobs",
    rawContext: "quero social media", status: "new", createdAt: AGORA,
    temComoFalar: true, porQueNaoDaParaFalar: null, ...over,
  };
}

function montar(over: Partial<DependenciasDaVarredura> = {}, flags = LIGADA) {
  const deps: DependenciasDaVarredura = {
    solicitacoesNaPorta: async (n) => [lead()].slice(0, n),
    resolverCliente: vi.fn(async () => ({ id: "cli1", workspaceId: AGENCIA, name: "CityJobs" })),
    flags: { async buscar(chave, escopos) { return flags.filter((f) => f.chave === chave && escopos.includes(f.escopo)); } },
    recusaRecente: async () => false,
    registrarRecusa: vi.fn(async () => undefined),
    jaFeitos: async () => ({}),
    reservar: vi.fn(async () => true),
    marcarStatus: vi.fn(async () => undefined),
    rodarCiclo: vi.fn(async () => ({
      ok: true, passos: [{ funcaoId: "pm-orchestrator", departamentoId: "pm", decisao: "executado" as const, custoUsd: 0.01, duracaoMs: 1 }],
      artefatos: {}, custoTotalUsd: 0.01,
    })),
    abrirAprovacao: vi.fn(async () => ({ id: "ap" })),
    agora: () => AGORA,
    ...over,
  };
  return deps;
}

describe("G-3 — a autorização vem ANTES de qualquer escrita", () => {
  it("⛔ esteira DESLIGADA: não resolve, não cria ficha de cliente, não reserva", async () => {
    const deps = montar({}, []); // nenhuma chave
    await varrerAPorta(deps);
    // Era aqui que um anônimo da internet criava `Client` na base com a
    // esteira desligada. Portão que fecha depois da porta usada não é portão.
    expect(deps.resolverCliente).not.toHaveBeenCalled();
    expect(deps.reservar).not.toHaveBeenCalled();
    expect(deps.rodarCiclo).not.toHaveBeenCalled();
  });

  it("✅ esteira LIGADA: resolve normalmente — a trava não travou o caminho bom", async () => {
    const deps = montar();
    const r = await varrerAPorta(deps);
    expect(deps.resolverCliente).toHaveBeenCalled();
    expect(r.andaram).toBe(1);
  });

  it("🔑 o `false` no cliente resolvido ainda vence o `true` da agência", async () => {
    const deps = montar({}, [...LIGADA, { chave: FLAGS_V2.execucao, escopo: "cli1", ligada: false }]);
    await varrerAPorta(deps);
    expect(deps.resolverCliente).toHaveBeenCalled(); // passou pela prévia
    expect(deps.rodarCiclo).not.toHaveBeenCalled();  // e parou na segunda
  });
});

describe("G-6 — provedor de IA fora do ar NEGA; não vira entregável", () => {
  const fonte = fs.readFileSync(path.join(process.cwd(), "lib/agency/esteira-assistida/adaptador-de-ia.ts"), "utf8");

  it("⛔ nenhum caminho de produção devolve rascunho no lugar de trabalho", () => {
    // A função continua existindo (é usada em ensaio), mas `realizarComIA` não
    // pode mais RETORNÁ-LA: sem chave, a cadeia marcava seis passos
    // "executado", custo zero, e abria card com o eco do briefing do cliente.
    const corpoDaFabrica = fonte.slice(fonte.indexOf("export function realizarComIA"));
    expect(corpoDaFabrica).not.toMatch(/return rascunhoRuleBased/);
    expect(corpoDaFabrica).toMatch(/throw new IaIndisponivel/);
  });

  it("✅ a metade limpa: com provedor, o caminho normal continua devolvendo saída", () => {
    const corpoDaFabrica = fonte.slice(fonte.indexOf("export function realizarComIA"));
    expect(corpoDaFabrica).toMatch(/return \{ saida:/);
  });

  it("ciclo que para vira LINHA VISÍVEL — inclusive quando ESCALA (o executor não grava escalada)", async () => {
    const registrarRecusa = vi.fn(async () => undefined);
    const deps = montar({
      registrarRecusa,
      marcarStatus: vi.fn(async () => undefined),
      rodarCiclo: async () => ({
        ok: false, passos: [], artefatos: {}, custoTotalUsd: 0,
        parouEm: { funcaoId: "brand-architect", decisao: "escalado", motivo: "nenhum provedor de IA configurado nesta agência" },
      }),
    });
    const r = await varrerAPorta(deps);
    expect(r.pararamNoMeio).toBe(1);
    expect(r.recusadas).toBe(0); // conta como "parou", não duas vezes
    expect(registrarRecusa).toHaveBeenCalledTimes(1);
    expect(registrarRecusa.mock.calls[0]![0]).toMatchObject({ funcaoId: "brand-architect", workspaceId: AGENCIA });
    expect((registrarRecusa.mock.calls[0]![0] as { motivo: string }).motivo).toMatch(/provedor de IA/);
    expect(deps.marcarStatus).toHaveBeenCalledWith("req1", "precisa_decisao");
  });
});

describe("G-5 — toda recusa nasce com dono de AGÊNCIA", () => {
  it("⛔ o motivo carrega o nome do negócio: sem workspaceId ele vaza para a outra casa", async () => {
    const registrarRecusa = vi.fn(async () => undefined);
    const deps = montar({ registrarRecusa, solicitacoesNaPorta: async () => [lead({ temComoFalar: false, porQueNaoDaParaFalar: "sem canal" })] });
    await varrerAPorta(deps);
    const gravada = registrarRecusa.mock.calls[0]![0] as { workspaceId?: string | null; motivo: string };
    expect(gravada.workspaceId).toBe(AGENCIA);
    expect(gravada.motivo).toContain("CityJobs"); // é este dado que precisa de dono
  });

  it("✅ a sala do PM filtra por agência em TODA leitura", () => {
    const pagina = fs.readFileSync(path.join(process.cwd(), "app/agency/pm-command/page.tsx"), "utf8");
    for (const tabela of ["recusaV2", "handoffV2", "clientRequestDb", "flagV2"]) {
      const trecho = pagina.slice(pagina.indexOf(`prisma.${tabela}`));
      expect(trecho.slice(0, 220)).toMatch(/workspaceId|escopo: ws/);
    }
  });
});

describe("EXPERIÊNCIA — a sala tem porta, e a fila é uma lista só", () => {
  it("🔴 `/agency/pm-command` está NO MENU (era o achado-mãe: 23 links, nenhum era ele)", () => {
    const barra = fs.readFileSync(path.join(process.cwd(), "components/agency/layout/AgencySidebar.tsx"), "utf8");
    expect(barra).toContain('href: "/agency/pm-command"');
  });

  it("a fila é UMA linha por lead — recusa é atributo, não segunda lista", () => {
    const fila = montarFilaDaSala({
      leads: [{ id: "s1", negocio: "Sushi Cazza", diasEsperando: 58, temComoFalar: false, porQueNaoDaParaFalar: "sem canal", desleixo: false }],
      travados: [],
      recusas: [linhaDeRecusa({ id: "r1", funcaoId: "esteira/porta-de-entrada", motivo: "sem canal declarado", correlationId: "porta:s1", clienteId: null, em: new Date("2026-08-16T11:43:00Z") }, AGORA)],
      agora: AGORA,
    });
    expect(fila).toHaveLength(1); // ⬅️ e não duas entradas para a mesma pessoa
    expect(fila[0]!.negocio).toBe("Sushi Cazza"); // o TÍTULO é o cliente, não o dono
    expect(fila[0]!.recusadoHa).toBe("há 17 min");
    expect(fila[0]!.href).toContain("s1"); // recusa sem próximo passo é beco
    // ⛔ e o motivo NÃO repete o atributo — foi o defeito achado renderizando.
    expect(fila[0]!.atributos[0]).toMatch(/sem contato/);
    expect(fila[0]!.motivo).toBeNull();
  });

  it("✅ a metade limpa: sem atributo, o motivo APARECE (senão a linha vira beco)", () => {
    const fila = montarFilaDaSala({
      leads: [{ id: "s2", negocio: "CityJobs", diasEsperando: 0, temComoFalar: true, porQueNaoDaParaFalar: null, desleixo: false }],
      travados: [],
      recusas: [linhaDeRecusa({ id: "r2", funcaoId: "esteira/porta-de-entrada", motivo: "ficou preso em processamento e voltou para a fila", correlationId: "porta:s2", clienteId: null, em: AGORA }, AGORA)],
      agora: AGORA,
    });
    expect(fila[0]!.atributos).toHaveLength(0);
    expect(fila[0]!.motivo).toMatch(/preso em processamento/);
  });

  it("quem parou no meio vem PRIMEIRO — a bola é da agência", () => {
    const fila = montarFilaDaSala({
      leads: [{ id: "s1", negocio: "Sushi Cazza", diasEsperando: 58, temComoFalar: false, porQueNaoDaParaFalar: "sem canal", desleixo: false }],
      travados: [{ id: "t1", businessName: "CityJobs", createdAt: new Date("2026-08-16T04:00:00Z") }],
      recusas: [],
      agora: AGORA,
    });
    expect(fila[0]!.negocio).toBe("CityJobs");
    expect(fila[0]!.tipo).toBe("decisao");
  });

  it("a esteira desligada EXPLICA a fila inteira, antes de qualquer número", () => {
    const fila = montarFilaDaSala({
      leads: [{ id: "s1", negocio: "X", diasEsperando: 2, temComoFalar: true, porQueNaoDaParaFalar: null, desleixo: true }],
      travados: [], recusas: [], agora: AGORA,
    });
    expect(leituraDaSala(fila, false)).toMatch(/DESLIGADA/);
    expect(leituraDaSala(fila, true)).not.toMatch(/DESLIGADA/);
    expect(leituraDaSala([], true)).toMatch(/fluindo/);
  });

  it("o botão que gasta DIZ QUANTO — e diz o que ainda não existe", () => {
    const botao = fs.readFileSync(path.join(process.cwd(), "components/agency/LigarAEsteira.tsx"), "utf8");
    expect(botao).toContain("gastoUsd");
    expect(botao).toMatch(/US\$/);
    expect(botao).toMatch(/teto diário agregado/i);
  });
});

describe("A FILA DA PORTA TEM UMA LISTA DE STATUS SÓ", () => {
  it("`lead_incompleto` entrou — ele nunca aparecia na sala do PM", () => {
    expect(AINDA_NA_PORTA).toContain("lead_incompleto");
    expect(AINDA_NA_PORTA).toContain("triaged");
  });

  it("⛔ `/api/agency/leads` não redigita a lista — importa a única", () => {
    const rota = fs.readFileSync(path.join(process.cwd(), "app/api/agency/leads/route.ts"), "utf8");
    expect(rota).toContain("AINDA_NA_PORTA");
    expect(rota).not.toContain('"new,lead_incompleto"');
  });
});

describe("B-1/G-1 — o pacote para num humano DA AGÊNCIA", () => {
  it("⛔ nenhum caminho abre card visível ao cliente com o resumo da esteira", () => {
    for (const arquivo of [
      "lib/agency/esteira-assistida/varredura-no-banco.ts",
      "app/api/v2/assistido/route.ts",
    ]) {
      const fonte = fs.readFileSync(path.join(process.cwd(), arquivo), "utf8");
      // Linha de CÓDIGO, não prosa: os comentários destes arquivos citam
      // `clientVisible: true` para explicar o defeito que foi consertado.
      const linhasDeCodigo = fonte
        .split("\n")
        .filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*"));
      expect(linhasDeCodigo.some((l) => /clientVisible: false/.test(l))).toBe(true);
      expect(linhasDeCodigo.some((l) => /clientVisible: true/.test(l))).toBe(false);
    }
  });
});
