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

// ── AS 11 ABAS, E O QUE NÃO PODE SUMIR NA MUDANÇA ──────────────────────────
//
// A história desta suíte, porque ela já mudou duas vezes e o motivo importa
// mais que o número de abas:
//
//   07/08/2026 — o CEO separou Conta de Integrações, e o teste travou a
//                separação numa ABA.
//   08/08/2026 — auditando o portal no ar, ele viu a consequência: com 7 abas,
//                MEDIDO a 375px, 4 nasciam fora da tela. As duas viraram seções
//                rotuladas dentro de "Sua conta", e o teste passou a travar isso.
//   14/08/2026 — o CEO aprovou o dashboard do cliente com **11 abas em
//                navegação horizontal**, e as duas voltam a ser abas próprias.
//                O problema de 08/08 não era o número de abas: era a barra que
//                se enfileirava e cortava sem avisar. A referência resolve isso
//                com uma barra rolável COM SETAS nas pontas e a aba ativa
//                trazida para o centro — o gesto deixa de ser adivinhação.
//
// O que sobreviveu às três versões, e é o que este bloco trava: **cada assunto
// com nome próprio, e nenhum conteúdo perdido na mudança.**
describe("as 11 abas do portal, e nada perdido na mudança", () => {
  const src = ler("app/portal/access/[token]/page.tsx");
  const nav = src.slice(src.indexOf("const ABAS:"), src.indexOf("const DESTINO_ANTIGO"));

  it("são exatamente as 11 abas do handoff, nesta ordem, sem menu lateral", () => {
    const rotulos = [...nav.matchAll(/label: "([^"]+)"/g)].map((m) => m[1]);
    expect(rotulos).toEqual([
      "Visão Geral", "Social Media", "Tráfego Pago", "Resultados", "Projetos",
      "Aprovações", "Entregas", "Brand Hub", "Solicitações", "Integrações", "Minha conta",
    ]);
    // Navegação HORIZONTAL: a barra é um <nav> rolável com setas, não uma
    // coluna lateral. `aside` de navegação aqui seria o menu que o handoff proíbe.
    expect(src).toContain("cp-nav-shell");
    expect(src).toContain("Ver próximas abas");
  });

  it("o checklist de conexões NÃO foi apagado — voltou a ter aba própria", () => {
    expect(src).toContain("<ConexoesDoCliente");
    const integracoes = src.slice(src.indexOf('aba === "integracoes"'));
    expect(integracoes).toContain("<ConexoesDoCliente");
  });

  it("os dados do cliente continuam lá — nenhum campo foi eliminado para esconder o furo", () => {
    const conta = ler("components/portal/cliente/abas.tsx");
    for (const campo of ["E-mail", "Telefone", "Site", "Cliente desde", "O que você contratou"]) {
      expect(conta).toContain(campo);
    }
    // Campo sem dado diz "Não informado" — nunca some da tela.
    expect(conta).toContain("Não informado");
  });

  it("Resultados voltou a ser aba, e o componente que a alimenta é o mesmo", () => {
    expect(nav).toContain('label: "Resultados"');
    expect(src).toContain("<ResultadosDoCliente");
  });

  it("endereço antigo não vira beco: ?secao=arquivos, =integracoes e =resultados ainda chegam", () => {
    const mapa = src.slice(src.indexOf("const DESTINO_ANTIGO"), src.indexOf("// ── Tipos das rotas"));
    expect(mapa).toContain('arquivos: "entregas"');
    expect(mapa).toContain('integracoes: "integracoes"');
    expect(mapa).toContain('resultados: "resultados"');
    // E o parâmetro antigo continua sendo lido, ao lado do novo.
    expect(src).toContain('sp.get("aba") ?? sp.get("secao")');
  });

  it("o que existia antes continua montado — nenhum componente foi perdido", () => {
    for (const componente of [
      "<AprovacoesDoCliente", "<ResultadosDoCliente", "<ConexoesDoCliente",
      "<MateriaisDaMarca", "<CalendarioDoMes", "<EsteiraDoCliente",
      "<SolicitarAlgo", "<MeusPedidos", "<ChatDrawer",
    ]) {
      expect(src, `sumiu do portal: ${componente}`).toContain(componente);
    }
  });

  // ── 15/08/2026: O ENVIO MUDOU DE CASA, E A GUARDA MUDOU COM ELE ───────────
  //
  // `<EnvioDeMaterial` saiu do arquivo da página: ele agora é montado dentro de
  // `MateriaisDaMarca`, no Brand Hub — que é onde a documentação sempre mandou
  // o material de marca morar.
  //
  // A guarda NÃO foi afrouxada por causa disso. Ela segue o componente até a
  // casa nova: continua sendo impossível apagar o envio sem reprovar a rodada,
  // e passa a ser impossível fazer o Brand Hub deixar de montá-lo.
  it("o envio de material continua existindo — agora no Brand Hub, seu lugar", () => {
    const secao = ler("components/portal/cliente/MateriaisDaMarca.tsx");
    expect(secao, "o envio sumiu do Brand Hub").toContain("<EnvioDeMaterial");
    // E a aba de Marca é quem monta a seção.
    expect(src).toContain("materiais={<MateriaisDaMarca");
  });

  it("Entregas aponta para o Brand Hub em vez de manter um segundo formulário", () => {
    const abas = ler("components/portal/cliente/abas.tsx");
    // Duas telas para a mesma coisa é como nasce a próxima "duas verdades" —
    // e aqui as duas verdades seriam sobre onde o arquivo do cliente foi parar.
    const entregas = abas.slice(abas.indexOf("export function AbaEntregas"), abas.indexOf("export function AbaBrandHub"));
    expect(entregas.includes("<EnvioDeMaterial"), "voltou um segundo formulário de envio na aba Entregas").toBe(false);
    expect(entregas).toContain("aoIrParaMarca");
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
