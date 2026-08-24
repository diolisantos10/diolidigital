// ─── A CASA NÃO PERGUNTA A MESMA COISA DE NOVO ───────────────────────────────
//
// ─── O QUE FOI MEDIDO (24/08/2026, sobre o caso Farol 27) ────────────────────
//
// À pergunta "redes sociais, tráfego pago ou identidade visual?", a cliente
// respondeu *"Quero lançar um clube de assinatura para os clientes fiéis."* A
// casa não tem esse produto. Nada casou — e a fila perguntou de novo. A MESMA
// frase, palavra por palavra, SEIS turnos seguidos. No caminho engoliu o
// objetivo, o público, a verba de R$ 8.000 e o prazo: cada um foi lido como
// tentativa de responder à pergunta do serviço, não encaixou, e foi descartado
// em silêncio. O escopo terminou com `objectives: []`, sem público, sem verba.
//
// Isto é pior que os quatro defeitos de escopo consertados no commit anterior,
// e por um motivo simples: aqueles produzem um orçamento errado, que alguém
// ainda corrige. Este produz um **cliente que desiste**. Ninguém responde seis
// vezes a mesma pergunta — ele fecha a aba e vai embora, e a casa nunca fica
// sabendo por quê. Não há erro, não há log, não há reclamação.
//
// ─── A DOENÇA NÃO ERA O VOCABULÁRIO ──────────────────────────────────────────
//
// O primeiro conserto (radical `\w*` em vez de `\breposicion\b`) fez o loop
// sumir PARA AQUELE TEXTO. Este teste existe porque isso não responde a
// pergunta que importa: some para a FAMÍLIA? Não somia. Basta um pedido que a
// casa realmente não tenha na prateleira — e sempre haverá um — para a fila
// voltar a repetir. O vocabulário era sintoma; a doença era a fila.
//
// ─── O INVARIANTE QUE ESTE ARQUIVO GUARDA ────────────────────────────────────
//
//   Nenhuma pergunta é feita duas vezes na mesma conversa sem que a resposta
//   anterior tenha sido GRAVADA em algum lugar — e nenhuma é feita três vezes,
//   nem duas vezes com a mesma frase.
//
// É a doutrina da casa aplicada inteira: **toda proibição precisa da instrução
// gêmea**. Não basta proibir a repetição; a casa precisa saber o que fazer no
// lugar. O caminho é este — a resposta que não encaixou vira lacuna registrada
// com as palavras do cliente, a lacuna segura a confiança do orçamento, e a
// conversa AVANÇA.

import { describe, it, expect } from "vitest";
import { initProspectConvState, processProspectMessage, type ProspectConvState } from "@/lib/agency/prospect-engine";
import { LIMITE_DE_INSISTENCIA } from "@/lib/agency/comercial/pergunta-sem-encaixe";

// ── Instrumento ───────────────────────────────────────────────────────────────

interface Turno { cliente: string; casa: string }

function conversar(falas: string[], contato = { nome: "Ana" }): { estado: ProspectConvState; turnos: Turno[] } {
  let estado = initProspectConvState(contato);
  const turnos: Turno[] = [];
  for (const cliente of falas) {
    estado = processProspectMessage(cliente, estado);
    const ultima = estado.conv.messages[estado.conv.messages.length - 1];
    turnos.push({ cliente, casa: ultima?.text ?? "" });
  }
  return { estado, turnos };
}

/** O corpo da pergunta, sem os prefixos de cortesia que variam de turno a turno
 *  ("Ótimo! Agora me conta…", recados de anexo). É o corpo que o cliente
 *  reconhece como "isso eu já li". */
function corpoDaPergunta(texto: string): string {
  return texto.split("\n\n").pop()!.trim();
}

// ── A FAMÍLIA ─────────────────────────────────────────────────────────────────
// Pedidos legítimos que a casa NÃO tem na prateleira. Nenhum deles é um erro do
// cliente: são negócios reais pedindo coisas reais que este catálogo não cobre.
// A casa pode não saber fazer — o que ela não pode é fingir que não ouviu.
const PEDIDOS_QUE_A_CASA_NAO_TEM = [
  "Quero lançar um clube de assinatura para os clientes fiéis.",
  "Preciso de assessoria de imprensa e relacionamento com jornalistas.",
  "Queria montar um programa de fidelidade com cartão carimbado.",
  "O que eu preciso é de consultoria de precificação do cardápio.",
  "Estou atrás de treinamento de atendimento para a minha equipe de balcão.",
];

describe("pedido que a casa não tem na prateleira", () => {
  for (const pedido of PEDIDOS_QUE_A_CASA_NAO_TEM) {
    describe(`"${pedido.slice(0, 46)}…"`, () => {
      const falas = [
        "Meu negócio é a Farol 27, uma padaria com 3 lojas.",
        pedido,
        "É isso mesmo que eu preciso, vocês fazem?",
        "Então me explica como funciona.",
        "Tá, e quanto custa?",
        "Entendi.",
      ];
      const { estado, turnos } = conversar(falas);

      it("nunca faz a mesma pergunta duas vezes com a mesma frase", () => {
        const vistas = new Set<string>();
        for (const t of turnos) {
          const corpo = corpoDaPergunta(t.casa);
          expect(vistas.has(corpo), `a casa repetiu, palavra por palavra:\n${corpo}`).toBe(false);
          vistas.add(corpo);
        }
      });

      it(`nunca faz a mesma pergunta mais de ${LIMITE_DE_INSISTENCIA} vezes`, () => {
        const feitas = estado.conv.perguntasFeitas ?? {};
        for (const [id, n] of Object.entries(feitas)) {
          expect(n, `a pergunta "${id}" foi feita ${n} vezes`).toBeLessThanOrEqual(LIMITE_DE_INSISTENCIA);
        }
      });

      it("a resposta que a casa não entendeu fica GRAVADA, com as palavras do cliente", () => {
        // A instrução gêmea da proibição. Sem isto, "não repetir" seria só
        // descartar mais rápido — o cliente perderia a fala em vez de perder a
        // paciência, o que é pior porque ninguém percebe.
        const lacunas = estado.conv.scope.lacunasDeEscopo ?? [];
        const tudoQueFoiGravado = lacunas.map((l) => l.oQueOClienteDisse).join(" ⧉ ");
        expect(tudoQueFoiGravado).toContain(pedido);
      });

      it("a conversa AVANÇA — a casa não fica parada na mesma pergunta", () => {
        // Seis turnos, seis perguntas diferentes. É o oposto exato do que foi
        // medido: seis turnos, uma pergunta só.
        const corpos = new Set(turnos.map((t) => corpoDaPergunta(t.casa)));
        expect(corpos.size).toBe(turnos.length);
      });

      it("o portão de envio NÃO foi afrouxado", () => {
        // ⚠️ Este é o teste que impede o conserto de virar o defeito de
        // 16/08/2026 outra vez. Avançar a conversa NUNCA pode significar deixar
        // passar um pedido sem serviço: quem chega ao fim sem dizer o que quer
        // continua sem botão de enviar — só que agora chega tendo sido ouvido.
        expect(estado.conv.canSubmit).toBe(false);
      });
    });
  }
});

// ── O outro lado da régua ─────────────────────────────────────────────────────
describe("quem responde o que foi perguntado não é punido", () => {
  it("não abre lacuna de resposta sem encaixe", () => {
    const { estado } = conversar([
      "Meu negócio é a Farol 27, uma padaria com 3 lojas.",
      "Quero gestão de redes sociais, uns 3 posts por semana no Instagram.",
      "O objetivo é vender mais.",
    ]);
    const semEncaixe = (estado.conv.scope.lacunasDeEscopo ?? []).filter((l) => l.id.startsWith("sem_encaixe:"));
    expect(semEncaixe).toEqual([]);
    expect(estado.conv.scope.wantsSocialMedia).toBe(true);
  });

  it("uma pergunta respondida de primeira é feita UMA vez só", () => {
    const { estado } = conversar([
      "Meu negócio é a Farol 27, uma padaria com 3 lojas.",
      "Quero gestão de redes sociais, uns 3 posts por semana no Instagram.",
    ]);
    expect(estado.conv.perguntasFeitas?.detect_service ?? 0).toBeLessThanOrEqual(1);
  });
});

// ── Duas respostas sem encaixe são DUAS falas, não uma ────────────────────────
describe("cada fala descartada é registrada, não só a primeira", () => {
  it("acumula as falas na mesma lacuna", () => {
    const { estado } = conversar([
      "Meu negócio é a Farol 27, uma padaria com 3 lojas.",
      "Quero lançar um clube de assinatura.",
      "É um clube mensal, o cliente paga e retira pão todo dia.",
    ]);
    const l = (estado.conv.scope.lacunasDeEscopo ?? []).find((x) => x.id === "sem_encaixe:detect_service");
    expect(l).toBeDefined();
    // Guardar só a primeira faria a segunda ser descartada em silêncio — o
    // defeito sobrevivendo dentro do próprio conserto.
    expect(l!.oQueOClienteDisse).toContain("clube de assinatura");
    expect(l!.oQueOClienteDisse).toContain("retira pão todo dia");
  });
});

// ── A lacuna faz efeito onde dói: no número ───────────────────────────────────
describe("escopo com resposta não entendida não vira número firme", () => {
  it("a confiança do orçamento não é alta", () => {
    const { estado } = conversar([
      "Meu negócio é a Farol 27, uma padaria com 3 lojas.",
      "Quero lançar um clube de assinatura.",
      "Quero também 3 posts por semana no Instagram.",
      "O objetivo é vender mais.",
      "Famílias do bairro, 25 a 55 anos.",
    ]);
    expect(estado.conv.estimate.confidence).not.toBe("high");
  });
});
