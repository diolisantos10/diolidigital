// A DIREÇÃO REPROVADA VOLTA A QUEM A ESCREVEU — E VOLTA COM O MOTIVO NA MÃO.
//
// ═══════════════════════════════════════════════════════════════════════════
// O DEFEITO, MEDIDO EM PRODUÇÃO (25/08/2026, cliente oculto)
// ═══════════════════════════════════════════════════════════════════════════
//
// A corrente do Instagram Story: homologada em 7 auditorias, 0 arquivos
// entregues. 4 peças, 4 rodadas do despertador, `mediaUrl: null` nas quatro,
// `status: draft`, US$ 0,00 em geração de imagem.
//
// O pré-portão da direção reprovou 4 de 4 e gravou "reescreva a direção".
// Ninguém reescrevia: não existia caminho automático, e a única rota de operador
// diz na porta que NÃO inventa direção de arte.
//
// ── A MEDIÇÃO QUE DECIDIU DE QUE LADO ESTAVA O ERRO ────────────────────────
//
// A régua rodada contra três famílias de direção, ANTES do conserto:
//
//   família 1 — cena de ambiente com pessoa ......... 8 de 8 passam
//   família 2 — close-up de produto ................. 0 de 5 passam
//   família 3 — conceito abstrato (deve barrar) ..... 0 de 5 passam
//
// A linha do meio é o veredito: a régua reprovava close-up de produto MESMO
// quando a direção nomeava a luz com todas as letras. Ela nasceu de um corpus só
// (CityJobs — vaga, pessoa, bairro) e nunca viu a família em que a câmera chega
// perto de uma COISA. Os dois lados estavam errados, e este arquivo prende os
// dois consertos:
//
//   1. a régua passou a ENTENDER a tomada controlada — sem baixar exigência
//      nenhuma (ela custa MAIS palavras, e a LUZ continua obrigatória);
//   2. a direção reprovada passou a ter caminho de volta, com teto e parada
//      declarada.

import { describe, it, expect, vi } from "vitest";
import { conferirDirecaoFotografavel } from "@/lib/agency/design/direcao-fotografavel";
import {
  reescreverDirecao, contarReescritasDaDirecao, MAX_REESCRITAS_DA_DIRECAO,
} from "@/lib/agency/design/reescrever-direcao";
import { contarTentativas } from "@/lib/agency/execution/artes";

const PECA = {
  direcaoOriginal: "disco de freio desgastado, fundo desfocado cinza escuro",
  legenda: "Freio que range não é manha: é aviso.",
  pilar: "educativo — manutenção",
  negocio: "Oficina Farol",
  segmento: "oficina mecânica",
  formato: "story",
};

// ═══════════════════════════════════════════════════════════════════════════
// LADO 1 — A RÉGUA ERA ESTREITA, E O CONSERTO NÃO A AFROUXOU
// ═══════════════════════════════════════════════════════════════════════════

describe("a régua entende a tomada controlada — por entender a família, não por baixar a exigência", () => {
  it("close-up de produto COMPLETO passa: enquadramento, fundo e luz", () => {
    for (const d of [
      "close-up do disco de freio desgastado, fundo desfocado cinza escuro, luz fria de fluorescente",
      "macro da pastilha de freio nova sobre superfície escura, fundo desfocado, luz lateral dura",
      "detalhe do filtro de óleo sujo, fundo neutro desfocado, luz de estúdio",
      "primeiro plano do pneu careca, fundo desfocado, contraluz",
    ]) {
      expect(conferirDirecaoFotografavel(d).fotografavel, d).toBe(true);
    }
  });

  it("A LUZ NÃO GANHOU FOLGA — é a família que custa dinheiro quando falta", () => {
    // Direção de close-up perfeita em tudo, MENOS a luz. Continua reprovando,
    // e é a metade do portão que garante a economia: direção sem luz o gerador
    // resolve com cor chapada, e quem descobre é o portão do pixel, DEPOIS de
    // a imagem ter sido paga.
    const v = conferirDirecaoFotografavel(
      "macro do disco de freio desgastado sobre a bancada, fundo desfocado cinza escuro",
    );
    expect(v.fotografavel).toBe(false);
    expect(v.faltou).toEqual(["luz"]);
  });

  it("a porta nova exige AS DUAS declarações — meia declaração não abre nada", () => {
    // Enquadramento sem fundo, e fundo sem enquadramento. Nenhum dos dois é uma
    // tomada controlada: "fundo desfocado" sozinho descreve qualquer fotografia
    // do mundo, e "close-up" sozinho não diz o que a câmera vê atrás.
    expect(conferirDirecaoFotografavel("close-up do disco de freio, luz de fluorescente").fotografavel).toBe(false);
    expect(conferirDirecaoFotografavel("o disco de freio, fundo desfocado, luz de fluorescente").fotografavel).toBe(false);
  });

  it("O CONCEITO CONTINUA BARRADO — inclusive quando tenta vestir a roupa nova", () => {
    // As duas últimas são adversariais: nasceram para tentar atravessar pela
    // porta da tomada controlada usando as palavras dela sem a foto.
    for (const d of [
      "a confiança de quem encontra uma vaga validada",
      "estilo moderno, cores vibrantes, transmitindo profissionalismo",
      "imagem bonita do produto, visual limpo e premium",
      "close-up premium do produto, visual sofisticado",
      "fundo desfocado elegante, sensação de cuidado",
      "close-up de qualidade, fundo de confiança, luz de excelência",
    ]) {
      expect(conferirDirecaoFotografavel(d).fotografavel, d).toBe(false);
    }
  });

  it("A FAMÍLIA ANTIGA NÃO REGREDIU: as 8 direções que já passavam continuam passando", () => {
    // Régua que conserta uma família quebrando outra não consertou nada.
    for (const d of [
      "galpão em Suzano no fim da tarde, operador conferindo caixas",
      "Plataforma da estação da CPTM em Mogi das Cruzes no fim da tarde, com passageiros descendo do trem, luz baixa e a fachada da estação ao fundo.",
      "Em Poá, servindo o pão ainda quente sob luz de janela",
      "cozinha de restaurante no meio-dia, cozinheira montando o prato na bancada",
      "canteiro de obra ao amanhecer, pedreiro assentando bloco",
      "balcão de padaria em Ferraz de Vasconcelos de manhã, atendente entregando o pão",
      "cabine do caminhão à noite, motorista conferindo a rota sob a luz do painel",
      "galpão de logística em Suzano no fim da tarde, operador de empilhadeira conferindo caixas, luz baixa entrando pelo portão",
    ]) {
      expect(conferirDirecaoFotografavel(d).fotografavel, d).toBe(true);
    }
  });

  it("o motivo ENSINA a família nova — quem lê é quem vai reescrever", () => {
    const v = conferirDirecaoFotografavel(PECA.direcaoOriginal);
    expect(v.fotografavel).toBe(false);
    expect(v.motivo).toMatch(/CLOSE-UP DE PRODUTO/i);
    expect(v.motivo).toMatch(/enquadramento e o fundo/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// LADO 2 — O CAMINHO DE VOLTA. É ISTO QUE FALTAVA.
// ═══════════════════════════════════════════════════════════════════════════

describe("a direção reprovada volta a quem a escreveu, e é reescrita", () => {
  const BOA = "macro do disco de freio desgastado sobre a bancada, fundo desfocado cinza escuro, luz fria de fluorescente da oficina";

  it("reescreve, confere pela MESMA régua e devolve a direção boa", async () => {
    const chamar = vi.fn().mockResolvedValue({ ok: true, texto: JSON.stringify({ direction: BOA }) });
    const r = await reescreverDirecao(PECA, conferirDirecaoFotografavel(PECA.direcaoOriginal), async (p) => {
      const x = await chamar(p);
      return { ok: true as const, texto: (JSON.parse(x.texto) as { direction: string }).direction };
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.direcao).toBe(BOA);
    expect(r.reescritas).toBe(1);
    // A régua que aprovou é a MESMA função, sem tolerância e sem segunda opinião.
    expect(conferirDirecaoFotografavel(r.direcao).fotografavel).toBe(true);
  });

  it("O PEDIDO LEVA O MOTIVO DA RECUSA — sem ele o especialista chuta a mesma coisa", async () => {
    let userVisto = "";
    await reescreverDirecao(PECA, conferirDirecaoFotografavel(PECA.direcaoOriginal), async (p) => {
      userVisto = p.user;
      return { ok: true as const, texto: BOA };
    });
    expect(userVisto).toContain(PECA.direcaoOriginal);      // a direção recusada
    expect(userVisto).toMatch(/O QUE FALTOU/);              // quais famílias
    expect(userVisto).toContain(PECA.legenda);              // o lastro: o texto da peça
    expect(userVisto).toMatch(/TOMADA CONTROLADA/);         // a família que serve a esta peça
    expect(userVisto).toMatch(/NÃO INVENTE FATO DO CLIENTE/); // e o que ela não pode fazer
  });

  it("A RÉGUA NÃO AFROUXOU NO CAMINHO DE VOLTA: reescrita ruim NÃO é aceita", async () => {
    // O risco óbvio de um caminho de volta automático é ele virar a porta dos
    // fundos do portão. Aqui o especialista devolve lixo duas vezes, e nada passa.
    const r = await reescreverDirecao(PECA, conferirDirecaoFotografavel(PECA.direcaoOriginal), async () => ({
      ok: true as const, texto: "visual moderno e premium, muito bonito",
    }));
    expect(r.ok).toBe(false);
  });

  it("O TETO É REAL: para em 2 e não chama o especialista uma terceira vez", async () => {
    const chamar = vi.fn().mockResolvedValue({ ok: true as const, texto: "conceito abstrato de confiança" });
    const r = await reescreverDirecao(PECA, conferirDirecaoFotografavel(PECA.direcaoOriginal), chamar);
    expect(chamar).toHaveBeenCalledTimes(MAX_REESCRITAS_DA_DIRECAO);
    expect(MAX_REESCRITAS_DA_DIRECAO).toBe(2);
    expect(r.ok).toBe(false);
  });

  it("A PARADA É DECLARADA: motivo, dono e próxima ação — nunca fila morta", async () => {
    const r = await reescreverDirecao(PECA, conferirDirecaoFotografavel(PECA.direcaoOriginal), async () => ({
      ok: true as const, texto: "conceito abstrato de confiança",
    }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toMatch(/Dono:/);
    expect(r.motivo).toMatch(/Próxima ação:/);
    expect(r.motivo).toMatch(/uma pessoa escreve a direção à mão/i);
    // E diz que NÃO volta sozinha: é a diferença entre parar e sumir.
    expect(r.motivo).toMatch(/NÃO volta sozinha/i);
    expect(r.motivo).toMatch(/NADA foi gasto em imagem/i);
  });

  it("O CONTADOR ATRAVESSA RODADAS: o teto já gasto não recomeça a cada despertador", async () => {
    // Sem isto, a fila morta de graça viraria uma fila morta que CUSTA: duas
    // chamadas de texto por peça a cada 5 minutos, para sempre.
    const chamar = vi.fn();
    const r = await reescreverDirecao(
      PECA, conferirDirecaoFotografavel(PECA.direcaoOriginal), chamar, MAX_REESCRITAS_DA_DIRECAO,
    );
    expect(chamar).not.toHaveBeenCalled();
    expect(r.ok).toBe(false);
  });

  it("provedor fora do ar NÃO é direção ruim — o dono do problema é outro", async () => {
    const r = await reescreverDirecao(PECA, conferirDirecaoFotografavel(PECA.direcaoOriginal), async () => ({
      ok: false as const, error: "429 rate limit",
    }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toMatch(/infraestrutura de IA/);
    expect(r.motivo).toMatch(/quando o provedor voltar/);
  });

  it("a resposta suja do modelo não envenena o prompt da imagem", async () => {
    for (const sujo of [`"${BOA}"`, "```\n" + BOA + "\n```", `direção de arte: ${BOA}`]) {
      const r = await reescreverDirecao(PECA, conferirDirecaoFotografavel(PECA.direcaoOriginal), async () => ({
        ok: true as const, texto: sujo,
      }));
      expect(r.ok, sujo).toBe(true);
      if (r.ok) expect(r.direcao).toBe(BOA);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// O CAMPO COMPARTILHADO — o contador novo não pisa no contador de arte
// ═══════════════════════════════════════════════════════════════════════════

describe("`lastError` continua com um significado por marcador", () => {
  it("a marca de reescrita NÃO é lida como tentativa de arte", async () => {
    const r = await reescreverDirecao(PECA, conferirDirecaoFotografavel(PECA.direcaoOriginal), async () => ({
      ok: true as const, texto: "conceito abstrato",
    }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    // Se um dia esta marca virar prefixo `[arte …`, esta linha cai — e é para
    // isso que ela existe: a peça desistiria por uma falha de ARTE que nunca
    // aconteceu, e o teto de imagem seria consumido por texto.
    expect(contarTentativas(r.motivo)).toBe(0);
    expect(contarReescritasDaDirecao(r.motivo)).toBe(MAX_REESCRITAS_DA_DIRECAO);
  });

  it("e a tentativa de arte NÃO é lida como reescrita", () => {
    expect(contarReescritasDaDirecao("[arte 2/3] o gerador recusou")).toBe(0);
    expect(contarTentativas("[arte 2/3] o gerador recusou")).toBe(2);
  });

  it("campo vazio não vira informação (guardrail 1)", () => {
    for (const v of [null, "", undefined]) expect(contarReescritasDaDirecao(v)).toBe(0);
  });
});
