// ─── ANEXO NÃO É RESPOSTA · NENHUM ASTERISCO NA TELA ─────────────────────────
//
// POR QUE ESTES TESTES EXISTEM — 16/08/2026, piloto ao vivo do CEO em /briefing.
//
// O cliente anexou dois PDFs no meio da conversa e o painel de escopo, ao vivo,
// na frente do CEO, mostrou o nome dos arquivos como se fossem as respostas dele:
//
//     Objetivos:  Enviei meu briefing: **CityJobs_Resumo_Executivo_v1.pdf**, ...
//     Orçamento:  Enviei meu briefing: **CityJobs_Brand_Book_v1.pdf**
//
// Dois defeitos no mesmo print, e os dois são guardados aqui:
//
//  1. o recado automático de anexo seguia pelo caminho de uma frase digitada e
//     virava a resposta da pergunta aberta. No campo Orçamento ele ocupou tudo —
//     `budget_range.parse` guarda a frase inteira — e ainda tirou a pergunta da
//     fila, então o SDR nunca mais perguntou o orçamento. O que desce para o
//     dossiê e para a proposta do cliente vira nome de arquivo;
//  2. o `**` chegou cru na tela. O balão de chat converte markdown; o painel de
//     escopo não converte, e nenhum cliente pode ver asterisco.
//
// Estes testes existem para que o defeito não volte por uma tela nova: a trava é
// verificada nos MOTORES e na função de limpeza, não na tela onde ela apareceu.

import { describe, it, expect } from "vitest";
import { initProspectConvState, processProspectMessage } from "@/lib/agency/prospect-engine";
import { initConvState, processClientMessage } from "@/lib/agency/question-engine";
import { montarAvisoDeAnexo, ehAvisoDeAnexo } from "@/lib/agency/anexo-nao-e-resposta";
import { semMarcacao } from "@/lib/agency/texto-sem-marcacao";

// Os dois arquivos exatos do print do CEO.
const RESUMO = "CityJobs_Resumo_Executivo_v1.pdf";
const BRAND  = "CityJobs_Brand_Book_v1.pdf";

// Leva a conversa até a pergunta de ORÇAMENTO estar ABERTA — é a pergunta que o
// anexo destruiu no piloto, e a única forma honesta de testar é chegar até ela.
//
// A parada é pelo ESTADO (`budget_range` ainda na fila), não por contagem de
// turnos nem pelo texto da pergunta: a ordem muda conforme o escopo e o texto
// que o SDR fala é montado em `buildSDRQuestionText`. Teste amarrado em
// contagem ou em frase quebra sozinho na próxima pergunta inserida no meio.
function conversaAteOrcamento() {
  let s = initProspectConvState();
  const respostas = [
    "Dioli", "CityJobs", "dioli@cityjobs.com.br", "11999998888",
    "Quero gestão de redes sociais", "Instagram", "3 por semana",
  ];
  for (let i = 0; i < 25; i++) {
    const feitas = s.conv.answeredQIds;
    if (feitas.includes("competitors_refs") && !feitas.includes("budget_range")) return s;
    s = processProspectMessage(respostas[i] ?? "Não", s);
  }
  throw new Error("a conversa nunca chegou na pergunta de orçamento — o cenário do print mudou");
}

describe("mensagem de anexo NÃO preenche campo de escopo", () => {
  it("o recado de anexo não vira o campo Orçamento — o defeito literal do print", () => {
    let s = conversaAteOrcamento();
    const orcamentoAntes = s.conv.scope.budgetRange;

    s = processProspectMessage(montarAvisoDeAnexo(BRAND), s);

    // O nome do PDF ocupava o campo inteiro. Nunca mais.
    expect(s.conv.scope.budgetRange ?? "").not.toContain(BRAND);
    expect(s.conv.scope.budgetRange ?? "").not.toContain("Enviei meu briefing");
    expect(s.conv.scope.budgetRange).toBe(orcamentoAntes);
  });

  it("o recado de anexo não vira Objetivo", () => {
    let s = initProspectConvState();
    s = processProspectMessage("Dioli", s);
    s = processProspectMessage(montarAvisoDeAnexo(RESUMO), s);

    for (const obj of s.conv.scope.objectives) {
      expect(obj).not.toContain("Enviei meu briefing");
      expect(obj).not.toContain(".pdf");
    }
  });

  it("anexar NÃO tira a pergunta da fila — senão o SDR nunca mais pergunta", () => {
    const antes  = conversaAteOrcamento();
    const depois = processProspectMessage(montarAvisoDeAnexo(BRAND), antes);

    expect(depois.conv.answeredQIds).not.toContain("budget_range");
    expect(depois.conv.answeredQIds).toEqual(antes.conv.answeredQIds);
    expect(depois.conv.scope).toEqual(antes.conv.scope);
  });

  it("anexar antes de falar não consome a apresentação do visitante", () => {
    // Quem sobe o briefing como primeira ação ainda precisa se apresentar: a
    // primeira fala de verdade é a que traz nome e negócio.
    let s = initProspectConvState();
    s = processProspectMessage(montarAvisoDeAnexo(RESUMO), s);
    expect(s.conv.isFirstMessage).toBe(true);

    s = processProspectMessage("Dioli, da CityJobs, quero gestão de redes sociais", s);
    expect(s.conv.scope.prospectName || s.conv.scope.businessName).toBeTruthy();
    expect(s.conv.scope.wantsSocialMedia).toBe(true);
  });

  it("o nome do arquivo não é lido como verba do cliente — `_v1.pdf` tem número dentro", () => {
    const s = processProspectMessage(
      montarAvisoDeAnexo("orcamento_2500_reais_v1.pdf"),
      conversaAteOrcamento(),
    );
    expect(s.sdr.budgetSignal.amount).toBeUndefined();
  });

  it("a mesma trava vale no motor da sala V2 — defeito não escolhe a porta", () => {
    let s = initConvState();
    s = processClientMessage("Quero redes sociais para a CityJobs", s);
    const antes = s.scope;

    s = processClientMessage(montarAvisoDeAnexo(BRAND), s);
    expect(s.scope).toEqual(antes);
  });

  it("recado gravado ANTES de 16/08 (com `**`) continua sendo reconhecido", () => {
    // Transcript antigo reprocessado não pode ressuscitar o defeito.
    expect(ehAvisoDeAnexo(`📎 Enviei meu briefing: **${BRAND}**`)).toBe(true);
    expect(ehAvisoDeAnexo(montarAvisoDeAnexo(BRAND))).toBe(true);
  });

  it("frase digitada de verdade continua respondendo a pergunta", () => {
    // A trava não pode virar mordaça: quem digita é respondido.
    const s = processProspectMessage("Entre 2 e 3 mil por mês", conversaAteOrcamento());
    expect(s.conv.scope.budgetRange).toContain("mil");
  });
});

describe("nenhum `**` chega à tela do cliente", () => {
  it("o recado de anexo nasce sem asterisco", () => {
    expect(montarAvisoDeAnexo(BRAND)).not.toContain("*");
    expect(montarAvisoDeAnexo(BRAND)).toContain(BRAND);
  });

  it("`semMarcacao` tira a marcação e preserva a palavra", () => {
    expect(semMarcacao(`Enviei meu briefing: **${BRAND}**`)).toBe(`Enviei meu briefing: ${BRAND}`);
    expect(semMarcacao("**Plano Pro**")).toBe("Plano Pro");
    expect(semMarcacao("Objetivo *principal* do cliente")).toBe("Objetivo principal do cliente");
    expect(semMarcacao("R$ 2.500 por `mes`")).toBe("R$ 2.500 por mes");
  });

  it("asterisco solto, que não fechou par, também não fica na tela", () => {
    expect(semMarcacao("**Mais vendas")).not.toContain("*");
    expect(semMarcacao("Objetivos: **a, b")).not.toContain("*");
  });

  it("texto limpo passa intacto", () => {
    expect(semMarcacao("Mais vendas, mais clientes")).toBe("Mais vendas, mais clientes");
  });
});
