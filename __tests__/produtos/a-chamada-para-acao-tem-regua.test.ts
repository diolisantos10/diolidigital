// O PORTÃO DA CHAMADA PARA AÇÃO — medido nos DOIS lados.
//
// ═══════════════════════════════════════════════════════════════════════════
// O DEFEITO (Auditor, 4ª rodada, 25/08/2026)
// ═══════════════════════════════════════════════════════════════════════════
//
// O portão procurava RAÍZES com `includes` sobre o texto cru. O Auditor provou
// com teste próprio: de 8 frases **sem** chamada para ação, **4 passaram**.
//
//     "quero divulgar a nossa marca no bairro"  → passou pela raiz `marc`
//     "somos uma marca de bairro"               → passou pela raiz `marc`
//     "o pedido é falar do nosso pão"           → passou pela raiz `pedi`
//
// **A palavra mais frequente de um briefing de marca desarmava o portão.**
// "marca" e "pedido" são substantivos; a régua os lia como os verbos "marcar"
// e "pedir". Portão que aprova por omissão é pior que portão nenhum: a peça
// sai sem ação, e peça sem ação manda o seguidor do cliente para lugar nenhum.
//
// ── POR QUE ESTE ARQUIVO TEM DUAS METADES, E A SEGUNDA É OBRIGATÓRIA ───────
//
// Apertar a régua até tudo barrar é fácil e é o outro jeito de errar: pararia
// o pedido de quem escreveu a chamada com todas as letras. Então metade das
// frases aqui TEM de passar, e é essa metade que impede o conserto de virar
// um freio de mão puxado.
//
// A régua conta ausência como "não achei" e o efeito é PERGUNTAR — nunca
// concluir que o cliente não quer ação nenhuma. Ver `briefing-minimo.ts`.

import { describe, it, expect } from "vitest";
import { temChamadaParaAcao } from "@/lib/agency/produtos/briefing-minimo";

/** As frases da sonda do Auditor, mais as que a casa vê todo dia. */
const SEM_CHAMADA = [
  "quero divulgar a nossa marca no bairro",
  "somos uma marca de bairro",
  "o pedido é falar do nosso pão",
  "aumentar a presença digital da padaria",
  "mostrar o nosso trabalho",
  "contar a história da padaria",
  "falar do pão de fermentação natural",
  "divulgar a inauguração",
  "fortalecer a marca no bairro",
  "o pedido do cliente é sobre pão",
  "reforçar o posicionamento da marca",
  "quero que as pessoas vejam a qualidade do nosso produto",
];

/** Chamadas de verdade, do jeito que o cliente escreve. */
const COM_CHAMADA = [
  "chamar no WhatsApp",
  "vir na loja",
  "pedir pelo link da bio",
  "encomendar pelo direct",
  "marque um horário",
  "venha conhecer a padaria",
  "clique no link",
  "peça pelo WhatsApp",
  "fale com a gente",
  "arraste para cima",
  "siga a gente",
  "solicite um orçamento",
  "agende sua visita",
  "compre no site",
  "saiba mais no link da bio",
  "manda no direct que a gente responde",
  "reserve a sua fornada",
  "passa lá na loja de manhã",
];

describe("frase SEM chamada para ação é barrada — o portão não aprova por omissão", () => {
  it.each(SEM_CHAMADA)('não há ação em "%s"', (frase) => {
    expect(
      temChamadaParaAcao(frase),
      "esta frase não diz o que a pessoa deve FAZER — deixá-la passar produz uma peça " +
      "que manda o seguidor do cliente para lugar nenhum",
    ).toBe(false);
  });
});

describe("frase COM chamada para ação passa — a régua não é freio de mão puxado", () => {
  it.each(COM_CHAMADA)('a ação está escrita em "%s"', (frase) => {
    expect(
      temChamadaParaAcao(frase),
      "barrar aqui é parar o pedido de quem já respondeu — e fazer o cliente repetir " +
      "o que ele acabou de dizer é a mesma falta de pedir de novo o material que já chegou",
    ).toBe(true);
  });
});

describe("controles", () => {
  it("texto vazio ou ausente não é chamada — e não é erro", () => {
    expect(temChamadaParaAcao("")).toBe(false);
    expect(temChamadaParaAcao(null)).toBe(false);
    expect(temChamadaParaAcao(undefined)).toBe(false);
  });

  it("acento não muda o veredito — o cliente escreve dos dois jeitos", () => {
    expect(temChamadaParaAcao("peça pelo whatsapp")).toBe(true);
    expect(temChamadaParaAcao("peca pelo whatsapp")).toBe(true);
    expect(temChamadaParaAcao("agende sua visita")).toBe(true);
    expect(temChamadaParaAcao("AGENDE SUA VISITA")).toBe(true);
  });

  it("⚠️ MUTAÇÃO DECLARADA: 'marca' e 'pedido' sozinhos não bastam", () => {
    // As duas palavras que derrubavam o portão. Se alguém voltar a casar por
    // raiz, estas duas linhas ficam vermelhas antes de qualquer cliente ver.
    expect(temChamadaParaAcao("marca")).toBe(false);
    expect(temChamadaParaAcao("pedido")).toBe(false);
    // E as formas VERBAIS delas continuam contando — é a distinção inteira.
    expect(temChamadaParaAcao("marque um horário")).toBe(true);
    expect(temChamadaParaAcao("peça pelo link")).toBe(true);
  });
});
