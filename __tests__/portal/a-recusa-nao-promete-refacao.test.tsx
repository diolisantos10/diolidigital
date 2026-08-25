// A RECUSA NÃO PODE PROMETER O QUE A MÁQUINA NÃO FAZ.
//
// ═══════════════════════════════════════════════════════════════════════════
// O DEFEITO, MEDIDO NO PILOTO (26/08/2026)
// ═══════════════════════════════════════════════════════════════════════════
//
// O cliente apertava "Recusar e pedir refação", lia *"A equipe refaz do zero a
// partir da sua justificativa"* — e **nada refazia**.
//
// E o silêncio não era bug: a recusa é TERMINAL por desenho, e está certa
// assim. `STATUS_DA_PECA_RECUSADA = "rejected"` tira a peça do caminho do
// relógio; `recusarPorPedidoDoCliente` não chama IA nenhuma; a próxima ação
// registrada é *"falar com o cliente e decidir se refaz com direção nova, se
// muda o escopo ou se devolve"*. Quem quer a mesma peça corrigida tem o botão
// de AJUSTE, que refaz de verdade.
//
// Então o conserto é na MENSAGEM, não na máquina. **Prompt é aviso; código é
// trava — e o aviso não pode prometer o que a trava não faz.**
//
// ── POR QUE A RÉGUA MEDE O HTML, E NÃO A CONSTANTE ────────────────────────
//
// Porque foi exatamente assim que as três frases divergiram do código ao mesmo
// tempo: elas eram literais soltos dentro da tela, e nenhum teste as alcançava.
// Uma régua sobre a constante ficaria verde com a tela mostrando outra coisa —
// o componente errado outra vez. Aqui a tela é renderizada e o texto é lido do
// HTML que o cliente recebe.

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DetalheDaAprovacao } from "@/components/portal/AprovacoesDoCliente";
import { TEXTOS_DA_RECUSA, STATUS_DA_PECA_RECUSADA } from "@/lib/agency/portal/decisoes-do-portal";

/** Um card decidível, com corpo — sem corpo o portal não pede decisão. */
const CARD = {
  id: "apr-1",
  department: "criacao",
  status: "pending",
  reviewedAt: null,
  reviewNote: "**1. Pão quentinho às sete**\n- Texto da peça: sai do forno às 7h.",
  version: 1,
  questionOpen: false,
  expiresAt: null,
  pecas: [],
  semConteudo: false,
  comments: [],
} as const;

/** O card como ele nasce: nenhum painel aberto — é aqui que mora o botão. */
function telaFechada(): string {
  return renderToStaticMarkup(
    <DetalheDaAprovacao
      ap={CARD as never}
      token="tok"
      enviando={false}
      erro={null}
      onDecidir={async () => true}
      onVoltar={() => {}}
    />,
  );
}

function telaDaRecusa(): string {
  return renderToStaticMarkup(
    <DetalheDaAprovacao
      ap={CARD as never}
      token="tok"
      enviando={false}
      erro={null}
      onDecidir={async () => true}
      onVoltar={() => {}}
      modoInicial="refazer"
    />,
  );
}

describe("a tela da recusa diz a verdade sobre o que acontece", () => {
  it("🔴 não promete refação automática em lugar nenhum da tela", () => {
    const html = telaDaRecusa();
    // As três frases exatas que estavam em produção.
    expect(html, "o campo prometia refação do zero").not.toContain("A equipe refaz do zero");
    expect(html, "o aviso de campo vazio prometia refação").not.toContain("a equipe refaz a partir");
    // O botão vive no card FECHADO — é o primeiro texto que ele lê sobre a
    // recusa, e era o primeiro a mentir.
    expect(telaFechada(), "o botão prometia refação").not.toContain("Recusar e pedir refação");
  });

  it("diz o que a máquina FAZ: para, não publica, e chama gente", () => {
    const html = telaDaRecusa();
    expect(html, "motivo").toContain("não vai ao ar");
    expect(html, "dono").toContain("Quem assume: a equipe de atendimento");
    expect(html, "próxima ação").toContain("Próxima ação:");
    // E aponta o caminho que REFAZ de verdade — sem isso a tela só tira uma
    // esperança e não devolve nenhuma.
    expect(html, "quem quer a peça corrigida precisa saber para onde ir").toContain("Pedir ajuste");
  });

  it("as frases da tela são as do CONTRATO das quatro decisões, não literais soltos", () => {
    const html = telaDaRecusa();
    expect(telaFechada()).toContain(TEXTOS_DA_RECUSA.botao);
    expect(html).toContain(TEXTOS_DA_RECUSA.titulo);
    expect(html).toContain(TEXTOS_DA_RECUSA.nota);
  });

  it("a máquina continua terminal — a mensagem mudou, o efeito não", () => {
    // Se algum dia isto virar "revision_requested", a mensagem acima passa a
    // ser a mentira, e este teste é quem avisa.
    expect(STATUS_DA_PECA_RECUSADA).toBe("rejected");
  });

  it("o texto do AJUSTE continua prometendo refação — porque o ajuste refaz mesmo", () => {
    // A régua acima, aplicada sem esta, empurraria a casa a apagar a promessa
    // verdadeira junto com a falsa.
    const html = renderToStaticMarkup(
      <DetalheDaAprovacao
        ap={CARD as never}
        token="tok"
        enviando={false}
        erro={null}
        onDecidir={async () => true}
        onVoltar={() => {}}
        modoInicial="ajuste"
      />,
    );
    expect(html).toContain("a equipe refaz a partir disto");
  });
});
