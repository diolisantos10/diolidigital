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

// ── "Integrações" continua sendo um ASSUNTO; deixou de ser uma ABA ──────────
//
// Em 07/08/2026 o CEO separou Conta de Integrações e esta suíte travou a
// separação numa ABA ("a navegação tem uma aba Integrações"). Em 08/08/2026,
// auditando o portal no ar, ele viu a consequência: com 7 abas, MEDIDO a 375px,
// 4 delas nasciam fora da tela — Integrações e Conta entre elas. Aba que não
// aparece não separa nada; ela só esconde.
//
// A regra sobreviveu, o mecanismo mudou: as duas são SEÇÕES ROTULADAS dentro de
// "Sua conta". O que estes testes travam agora é o que sempre importou — cada
// assunto com nome próprio, nenhum bloco misturado, e nenhum conteúdo perdido
// na mudança.
describe("Integrações e dados do cliente: dois assuntos, nomes próprios, nada perdido", () => {
  const src = ler("app/portal/access/[token]/page.tsx");

  it("a barra cabe em 375px: são 5 itens, e nenhum deles se chama Integrações", () => {
    const nav = src.slice(src.indexOf("const NAV:"), src.indexOf("const SECAO_DO_DESTINO"));
    expect(nav.match(/\{ id: "/g) ?? []).toHaveLength(5);
    expect(nav).not.toContain('label: "Integrações"');
  });

  it("o checklist de conexões NÃO foi apagado — mora na seção Integrações de Sua conta", () => {
    const conta = src.slice(src.indexOf('secao === "conta"'));
    expect(conta).toContain("<ConexoesDoCliente");
    expect(conta).toContain("INTEGRACOES_FUTURAS");
    // E com nome próprio: o assunto não se dissolve dentro do outro.
    expect(conta).toContain('id="integracoes"');
    expect(conta).toContain("Seus dados");
  });

  it("os dados do cliente continuam lá — a aba não foi eliminada para esconder o furo", () => {
    const conta = src.slice(src.indexOf('secao === "conta"'));
    for (const campo of ["Segmento", "Público-alvo", "Objetivos", "O que você contratou", "Seu acesso"]) {
      expect(conta).toContain(campo);
    }
  });

  it("Resultados não é mais aba, mas o componente não foi apagado", () => {
    const nav = src.slice(src.indexOf("const NAV:"), src.indexOf("const SECAO_DO_DESTINO"));
    expect(nav).not.toContain('label: "Resultados"');
    expect(src).toContain("<ResultadosDoCliente");
    // E só entra quando existe número — bloco vazio no portal é o cliente
    // achando que não recebeu nada.
    expect(src).toContain("somenteComNumeros");
  });

  it("endereço antigo não vira beco: ?secao=integracoes e ?secao=resultados ainda chegam", () => {
    const mapa = src.slice(src.indexOf("const SECAO_DO_DESTINO"), src.indexOf("const MODULOS_DE_SERVICO"));
    expect(mapa).toContain('integracoes: "conta"');
    expect(mapa).toContain('resultados: "inicio"');
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

// ── AUSÊNCIA BENIGNA NÃO VIRA FALHA INVENTADA (08/08/2026) ──────────────────
//
// O painel de esteira colapsava todo `!ok` em "Não consegui carregar agora.
// Tente atualizar a página." — inclusive o 404 que o servidor usa para dizer
// "ainda não há projeto para acompanhar". Atualizar nunca resolvia, e este é o
// estado do PRIMEIRO DIA de todo cliente pagante, em DUAS telas do percurso.
describe("o painel de esteira distingue ausência de falha", () => {
  const src = ler("components/agency/portal/EsteiraDoCliente.tsx");

  it("lê o status HTTP em vez de colapsar tudo em erro", () => {
    expect(src).toContain("r.status === 404");
    expect(src).toContain('fase: "vazio"');
    expect(src).toContain('fase: "erro"');
  });

  it("o estado vazio nomeia o próximo passo e NÃO manda atualizar a página", () => {
    const vazio = src.slice(src.indexOf("const VAZIO_PADRAO"), src.indexOf("export default function"));
    expect(vazio).toContain("está sendo montado");
    expect(vazio).not.toMatch(/atualizar a página/i);
  });

  it("os três estados obrigatórios existem, cada um com o seu papel", () => {
    expect(src).toContain('fase === "carregando"'); // esqueleto
    expect(src).toContain('role="alert"');          // só o erro alerta
    expect(src).toContain("Tentar de novo");        // só o erro tem o que tentar
  });
});
