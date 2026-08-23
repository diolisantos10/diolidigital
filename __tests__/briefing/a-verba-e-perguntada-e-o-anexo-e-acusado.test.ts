import { describe, it, expect } from "vitest";
import { initProspectConvState, processProspectMessage, type ProspectConvState } from "@/lib/agency/prospect-engine";
import { canSubmitProposal } from "@/lib/agency/sdr-agent";
import { ehOfertaDeDocumento, montarAvisoDeAnexo } from "@/lib/agency/anexo-nao-e-resposta";

// ─────────────────────────────────────────────────────────────────────────────
// POR QUE ESTE ARQUIVO EXISTE — 23/08/2026, primeira rodada do cliente falso
//
// Quatro defeitos de uma vez, e três deles com a mesma raiz comercial: a casa
// mandou preço a quem nunca foi perguntado quanto podia gastar.
//
//   1. À pergunta "quem é o seu público-alvo?" o cliente respondeu *"Posso te
//      mandar nosso briefing em PDF, ajuda?"* — e a frase foi gravada INTEIRA
//      no campo `targetAudience` do pedido. O arquivo nem tinha chegado e o
//      público-alvo do cliente já era uma pergunta que ele fez.
//
//   2. Depois de ele ANEXAR o briefing, a casa repetiu a pergunta anterior
//      palavra por palavra, sem uma sílaba sobre o arquivo que chegou.
//
//   3. A pergunta da verba (`budget_range`) existia no sistema, era
//      enfileirada, era marcada como feita — e NUNCA perguntava a verba: no
//      lugar dela saía um fechamento ("Acho que já tenho o essencial!").
//
//   4. Consequência direta do item 3: R$ 4.500–7.700/mês entregues, em
//      silêncio, a um cliente com R$ 500/mês. Sem verba no escopo, o confronto
//      verba × estimativa não nasce. É o caso CityJobs de 16/08 (R$ 500
//      declarados, R$ 1.800–3.400 entregues) repetido por outra porta.
//
// O que se trava aqui é o comportamento, não a redação: as asserções perguntam
// "a verba foi pedida?", "o arquivo foi acusado?", "a frase voltou idêntica?" —
// nunca "o texto é exatamente este". Teste que quebra por ajuste de redação é
// teste que o time aprende a ignorar.
// ─────────────────────────────────────────────────────────────────────────────

const PORTA = { nome: "Marina Prova", email: "marina@exemplo.invalid", whatsapp: "5511900000001" };

/** Roda um roteiro e devolve o estado + tudo que a casa disse, na ordem. */
function conversar(falas: (string | { texto: string; anexos: string[] })[]) {
  let estado: ProspectConvState = initProspectConvState(PORTA);
  const daCasa: string[] = [];
  for (const f of falas) {
    const texto = typeof f === "string" ? f : f.texto;
    const anexos = typeof f === "string" ? undefined : f.anexos;
    estado = processProspectMessage(texto, estado, anexos);
    daCasa.push(estado.conv.messages[estado.conv.messages.length - 1]?.text ?? "");
  }
  return { estado, daCasa, ultima: daCasa[daCasa.length - 1] ?? "" };
}

/** Como o placar do cliente falso compara falas: sem o que não muda o sentido. */
const mesmaFala = (a: string, b: string) => {
  const n = (s: string) => s.toLowerCase().replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
  return n(a) === n(b) && n(a).length > 0;
};

const ATE_O_PUBLICO = [
  "Oi! Somos a Cantina da Prova, um restaurante italiano em Pinheiros.",
  "O restaurante se chama Cantina da Prova.",
  "Quero gestão de redes sociais para o Instagram.",
  "Vender mais no almoço de segunda a sexta.",
];

describe("oferecer documento não responde pergunta nenhuma", () => {
  it("reconhece a oferta pelo par verbo-de-mandar + coisa-que-se-manda", () => {
    expect(ehOfertaDeDocumento("Posso te mandar nosso briefing em PDF, ajuda?")).toBe(true);
    expect(ehOfertaDeDocumento("Vou enviar a apresentação da empresa")).toBe(true);
    expect(ehOfertaDeDocumento("quer que eu passe o manual de marca?")).toBe(true);
  });

  it("NÃO engole resposta de verdade — barrar resposta boa custa igual", () => {
    // Um guarda largo aqui repetiria a pergunta para sempre, que é o defeito
    // com o sinal trocado. Por isso ele exige as duas metades juntas.
    expect(ehOfertaDeDocumento("Temos fotos boas dos pratos, tiradas por um fotógrafo.")).toBe(false);
    expect(ehOfertaDeDocumento("Famílias do bairro, gente que almoça fora durante a semana.")).toBe(false);
    expect(ehOfertaDeDocumento("Preciso que vocês escrevam os textos.")).toBe(false);
  });

  it("a oferta não vira o público-alvo do cliente", () => {
    // A asserção do defeito, na fala exata que o produziu.
    const { estado } = conversar([...ATE_O_PUBLICO, "Posso te mandar nosso briefing em PDF, ajuda?"]);
    expect(estado.conv.scope.targetAudience).toBeUndefined();
  });

  it("a pergunta continua na fila, e o cliente ainda consegue respondê-la", () => {
    // Proteger o campo não pode custar a resposta: depois da oferta, a resposta
    // de verdade tem de entrar normalmente.
    const { estado } = conversar([
      ...ATE_O_PUBLICO,
      "Posso te mandar nosso briefing em PDF, ajuda?",
      "Famílias do bairro, gente que almoça fora durante a semana.",
    ]);
    expect(estado.conv.scope.targetAudience).toMatch(/fam[íi]lias do bairro/i);
  });
});

describe("quem manda arquivo ouve que ele chegou", () => {
  const roteiro = [
    ...ATE_O_PUBLICO,
    "Posso te mandar nosso briefing em PDF, ajuda?",
    { texto: montarAvisoDeAnexo("briefing-cantina-da-prova.pdf"), anexos: ["briefing-cantina-da-prova.pdf"] },
  ];

  it("a casa não devolve a mesma frase duas vezes seguidas", () => {
    // O sinal mais barato de que ninguém está ouvindo: o cliente fala e a mesma
    // frase volta. Ele conclui, com razão, que falou com uma parede.
    const { daCasa } = conversar(roteiro);
    for (let i = 1; i < daCasa.length; i++) {
      expect(mesmaFala(daCasa[i - 1], daCasa[i]), `turnos ${i} e ${i + 1} idênticos`).toBe(false);
    }
  });

  it("o nome do arquivo que chegou aparece na resposta", () => {
    const { ultima } = conversar(roteiro);
    expect(ultima).toContain("briefing-cantina-da-prova.pdf");
  });

  it("à oferta se responde 'pode mandar' — não 'recebi' um arquivo que não existe", () => {
    const { ultima } = conversar([...ATE_O_PUBLICO, "Posso te mandar nosso briefing em PDF, ajuda?"]);
    expect(ultima).toMatch(/pode mandar/i);
    expect(ultima).not.toMatch(/recebi/i);
  });
});

describe("a casa não manda preço a quem nunca foi perguntado quanto pode gastar", () => {
  // O percurso do cliente falso, do primeiro "oi" até o fim da entrevista.
  const ENTREVISTA = [
    ...ATE_O_PUBLICO,
    "Famílias do bairro, gente que almoça fora durante a semana.",
    "É contrato mensal mesmo, gestão contínua.",
    "2 posts por dia",
    "Stories sim, uns 5 por semana.",
    "Reels não, por enquanto só post e stories.",
    "Temos fotos boas dos pratos, tiradas por um fotógrafo.",
    "Preciso que vocês escrevam os textos.",
    "Anúncios não, agora não.",
    "Gosto do perfil do Bráz e do Carlos Pizza.",
  ];

  it("a pergunta da verba PERGUNTA a verba, em vez de anunciar o fim", () => {
    // Ela existia e saía como fechamento. Uma pergunta que não pergunta é pior
    // que pergunta nenhuma: ela some da fila marcada como feita.
    const { ultima } = conversar(ENTREVISTA);
    expect(ultima).toMatch(/or[çc]amento mensal|faixa de or[çc]amento|quanto.{0,20}investir/i);
    expect(ultima).not.toMatch(/j[áa] tenho o essencial/i);
  });

  it("o portão NÃO abre enquanto a verba não foi respondida", () => {
    // Era por aqui que o preço escapava: o portão abria antes da verba, o
    // cliente clicava em enviar, e a pergunta virava despedida.
    const { estado } = conversar(ENTREVISTA);
    expect(canSubmitProposal(estado.conv, estado.sdr)).toBe(false);
  });

  it("respondida a verba, ela chega ao escopo e o portão abre", () => {
    const { estado } = conversar([...ENTREVISTA, "Nosso orçamento é de R$ 500 por mês."]);
    expect(estado.conv.scope.budgetRange).toMatch(/500/);
    expect(canSubmitProposal(estado.conv, estado.sdr)).toBe(true);
  });

  it("a estimativa sai com o confronto de verba junto — nunca calada", () => {
    // A trava do dano: com R$ 500 declarados e a conta acima disso, a diferença
    // viaja GRAVADA na estimativa. É ela que faz o texto entregue nomear os
    // R$ 500 do cliente, em vez de mandar o número e calar.
    const { estado } = conversar([...ENTREVISTA, "Nosso orçamento é de R$ 500 por mês."]);
    const e = estado.conv.estimate;
    expect(e.totalMin).toBeGreaterThan(500);
    expect(e.confrontoDeVerba).toBeTruthy();
    expect(e.confrontoDeVerba!.teto).toBe(500);
  });

  it("'Anúncios não' é um não — a casa não insiste em vender o que ele recusou", () => {
    // O `parse` antigo procurava a palavra "anúncio" no texto, achava dentro do
    // próprio "Anúncios não", e ligava tráfego pago. A casa então perguntava a
    // plataforma e a verba dos anúncios — duas perguntas depois de um não.
    const { estado } = conversar(ENTREVISTA);
    expect(estado.conv.scope.wantsPaidTraffic).toBe(false);
  });
});
