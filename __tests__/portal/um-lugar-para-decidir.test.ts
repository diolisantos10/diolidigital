// ── UM ÚNICO LUGAR PARA DECIDIR (CEO, 07/08/2026) ───────────────────────────
//
// "Projeto pra aprovar em uma tela, é projeto pra aprovar em outra tela, tem um
// monte de coisa pra aprovar em outra tela. Está uma confusão."
//
// Estava mesmo. O botão de decidir o ORÇAMENTO ("Aprovar e fazer / Agora não")
// vivia dentro de `MeusPedidos`, que renderizava no Início E em Projetos —
// duas telas, nenhuma chamada "Aprovações". E a decisão de andamento
// ("Aprovar tudo") vivia dentro do painel de esteira, que renderiza nas mesmas
// duas telas. Três lugares para decidir, e Aprovações não era nenhum deles.
//
// O que estes testes travam é a REGRA, não o pixel:
//   • quem define "orçamento esperando decisão" é uma função só, usada por
//     todas as contagens da tela (senão o selo diz 4 e a lista mostra 5);
//   • os componentes que MOSTRAM (MeusPedidos, EsteiraDoCliente) não podem
//     conter a ação de decidir — eles apontam para Aprovações.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  orcamentoEsperandoDecisao,
  idDeOrcamento,
  ehIdDeOrcamento,
  pedidoDoId,
} from "@/components/portal/AprovacoesDoCliente";
import type { PedidoDoCliente } from "@/components/portal/SolicitarAlgo";

const pedido = (p: Partial<PedidoDoCliente>): PedidoDoCliente => ({
  id: "p1", titulo: "Vídeo institucional", descricao: "", objetivo: "",
  para: null, status: "triado", statusLegivel: "Em análise", motivo: null,
  criadoEm: new Date().toISOString(), ...p,
});

describe("orçamento esperando decisão — uma regra só para todas as contagens", () => {
  it("com preço e sem resposta do cliente, espera decisão", () => {
    expect(orcamentoEsperandoDecisao(pedido({ preco: 297, orcamento: "pendente" }))).toBe(true);
  });

  it("preço sem campo de decisão conta como pendente — o default é esperar por ele", () => {
    expect(orcamentoEsperandoDecisao(pedido({ preco: 297, orcamento: null }))).toBe(true);
  });

  it("já aceito ou já recusado NÃO espera mais nada", () => {
    expect(orcamentoEsperandoDecisao(pedido({ preco: 297, orcamento: "aceito" }))).toBe(false);
    expect(orcamentoEsperandoDecisao(pedido({ preco: 297, orcamento: "recusado" }))).toBe(false);
  });

  it("SEM preço não é decisão — botão de aprovar o nada não entra na conta", () => {
    expect(orcamentoEsperandoDecisao(pedido({ preco: null }))).toBe(false);
    expect(orcamentoEsperandoDecisao(pedido({ preco: 0, orcamento: "pendente" }))).toBe(false);
    expect(orcamentoEsperandoDecisao(pedido({}))).toBe(false);
  });
});

describe("deep-link: entrega e orçamento convivem no mesmo endereço de card", () => {
  it("ida e volta do id do orçamento", () => {
    const id = idDeOrcamento("ped-42");
    expect(ehIdDeOrcamento(id)).toBe(true);
    expect(pedidoDoId(id)).toBe("ped-42");
  });

  it("id de aprovação não é confundido com orçamento", () => {
    expect(ehIdDeOrcamento("cmsemcpbx00068b7dqaj00r3l")).toBe(false);
    expect(ehIdDeOrcamento(null)).toBe(false);
  });
});

// ── A trava estrutural: quem MOSTRA não DECIDE ──────────────────────────────
// Um teste de comportamento aqui exigiria montar a árvore inteira do portal.
// O que precisa ser impedido é mais simples e mais durável: a chamada que
// grava a decisão não pode voltar a existir dentro dos componentes de
// acompanhamento. Se alguém recolocar, isto quebra — e o motivo fica escrito.
const raiz = process.cwd();
const ler = (p: string) => readFileSync(join(raiz, p), "utf8");

describe("a decisão não volta para as telas de acompanhamento", () => {
  it("MeusPedidos não chama a rota que grava a decisão do orçamento", () => {
    const src = ler("components/portal/SolicitarAlgo.tsx");
    const meusPedidos = src.slice(src.indexOf("export function MeusPedidos"));
    expect(meusPedidos).not.toContain("/api/portal/pedidos/orcamento");
    // E oferece o caminho, para a tela não virar um beco.
    expect(meusPedidos).toContain("Decidir em Aprovações");
  });

  it("o painel de esteira, em modo caminho, aponta para Aprovações em vez de decidir", () => {
    const src = ler("components/agency/portal/EsteiraDoCliente.tsx");
    expect(src).toContain("aoIrParaAprovacoes");
    expect(src).toContain("Ver e decidir em Aprovações");
  });

  it("Início e Projetos usam o painel de esteira SEMPRE em modo caminho", () => {
    const src = ler("app/portal/access/[token]/page.tsx");
    const usos = src.match(/<EsteiraDoCliente[^>]*>/g) ?? [];
    expect(usos.length).toBeGreaterThan(0);
    for (const uso of usos) expect(uso).toContain("aoIrParaAprovacoes");
  });

  it("Aprovações é a única seção que recebe as funções de decidir", () => {
    const src = ler("app/portal/access/[token]/page.tsx");
    expect(src).toContain("onDecidirOrcamento={decidirOrcamento}");
    expect(src).toContain("decisaoDaEsteira={decisaoDaEsteira}");
  });
});

describe("Conta é sobre o cliente; Integrações é sobre aplicativos", () => {
  const src = ler("app/portal/access/[token]/page.tsx");

  it("a navegação tem uma aba Integrações", () => {
    expect(src).toContain('{ id: "integracoes", label: "Integrações" }');
  });

  it("o checklist de conexões saiu de Conta e mora em Integrações", () => {
    const integracoes = src.slice(src.indexOf('secao === "integracoes"'), src.indexOf('secao === "conta"'));
    expect(integracoes).toContain("<ConexoesDoCliente");
    expect(integracoes).toContain("INTEGRACOES_FUTURAS");

    const conta = src.slice(src.indexOf('secao === "conta"'));
    expect(conta).not.toContain("<ConexoesDoCliente");
    expect(conta).not.toContain("INTEGRACOES_FUTURAS");
  });

  it("conexão quebrada manda o cliente para Integrações, não para Conta", () => {
    expect(src).toContain("Resolver em Integrações");
    expect(src).not.toContain("Resolver em Conta");
  });

  it("Resultados também aponta para Integrações — um nome só para a mesma coisa", () => {
    const resultados = ler("components/portal/ResultadosDoCliente.tsx");
    expect(resultados).toContain("Conectar em Integrações");
    expect(resultados).toContain("Reconectar em Integrações");
    expect(resultados).not.toContain("em Conta");
  });
});
