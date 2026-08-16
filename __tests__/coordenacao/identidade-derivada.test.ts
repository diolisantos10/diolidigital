// ─────────────────────────────────────────────────────────────────────────
// O INCIDENTE QUE ESTE TESTE GUARDA (16/08/2026, RODADA 4)
//
// Três sessões nesta mesma máquina rodavam em worktrees isolados, mas todas
// escreviam identidade numa ÚNICA chave global de repositório
// ("git config dioli.quem"). A terceira sessão a gravar SOBRESCREVIA a
// identidade das outras duas — sem aviso, sem erro. O estrago só apareceu
// depois: uma sessão rodou "conferir" e a trava, lendo a identidade que
// tinha sido sobrescrita por OUTRA sessão, enxergou uma reivindicação alheia
// como "minha" e APROVOU uma colisão real. Falso negativo: silencioso e
// caro — o oposto de "barrar demais", que é barulhento e barato.
//
// A saída (ver o bloco "RODADA 4" em scripts/reivindicar.mts): a identidade
// deixa de ser DECLARADA (digitada, gravada em arquivo ou em git config, e
// por isso compartilhável/sobrescrevível) e passa a ser DERIVADA — calculada
// sempre a partir do caminho absoluto do próprio worktree. Caminho de
// worktree é, por definição, único por sessão isolada nesta máquina: não há
// campo global para uma sessão pisar no valor da outra.
//
// Este teste exercita a exigência do CEO — "três identidades diferentes na
// mesma máquina, que é o estado real desta casa hoje, medido três vezes" —
// usando os QUATRO caminhos REAIS medidos com "git worktree list" no
// instante em que este teste foi escrito: o worktree principal e os três
// worktrees de agente isolados que motivaram o incidente.
// ─────────────────────────────────────────────────────────────────────────

import { describe, expect, it } from "vitest";

import { derivarIdentidade } from "@/lib/coordenacao/reivindicacoes";

/** Os QUATRO caminhos REAIS desta máquina, medidos com "git worktree list"
 *  no momento em que este teste foi escrito (16/08/2026). */
const WORKTREE_PRINCIPAL = "/home/user/diolidigital";
const WORKTREE_AGENTE_1 = "/home/user/diolidigital/.claude/worktrees/agent-a27b5772c791e9e52";
const WORKTREE_AGENTE_2 = "/home/user/diolidigital/.claude/worktrees/agent-a6e16be27699e1a26";
const WORKTREE_AGENTE_3 = "/home/user/diolidigital/.claude/worktrees/agent-acfc667df56f5f091";

/** Formato ANTIGO de "quem" — DECLARADO à mão, de antes da RODADA 4. Nunca
 *  deve colidir com uma identidade DERIVADA: são espaços de valores
 *  disjuntos por construção (prefixo diferente, comprimento diferente). */
const IDS_FORMATO_ANTIGO = ["pm-a27b5772", "pm-a6e16be", "pm-9ab49074"];

describe("⛔ BARRA O PROBLEMA PLANTADO — o falso negativo de 16/08/2026 não pode voltar", () => {
  it("os quatro worktrees reais desta máquina produzem quatro identidades TODAS distintas entre si", () => {
    const identidades = [
      derivarIdentidade(WORKTREE_PRINCIPAL),
      derivarIdentidade(WORKTREE_AGENTE_1),
      derivarIdentidade(WORKTREE_AGENTE_2),
      derivarIdentidade(WORKTREE_AGENTE_3),
    ];

    // Nenhuma sessão pode ser confundida com outra na mesma máquina: o
    // conjunto de identidades tem que ter o MESMO tamanho da lista — ou
    // seja, zero duplicata.
    const semDuplicata = new Set(identidades);
    expect(semDuplicata.size).toBe(identidades.length);
  });

  it("o worktree PRINCIPAL tem identidade própria, diferente de TODOS os isolados — foi exatamente onde a chave global quebrou três sessões", () => {
    const doPrincipal = derivarIdentidade(WORKTREE_PRINCIPAL);

    expect(doPrincipal).not.toBe(derivarIdentidade(WORKTREE_AGENTE_1));
    expect(doPrincipal).not.toBe(derivarIdentidade(WORKTREE_AGENTE_2));
    expect(doPrincipal).not.toBe(derivarIdentidade(WORKTREE_AGENTE_3));
  });

  it("nenhuma identidade derivada dos quatro caminhos reais é igual a um id do formato ANTIGO declarado — os dois espaços nunca colidem", () => {
    const identidadesDerivadas = [
      derivarIdentidade(WORKTREE_PRINCIPAL),
      derivarIdentidade(WORKTREE_AGENTE_1),
      derivarIdentidade(WORKTREE_AGENTE_2),
      derivarIdentidade(WORKTREE_AGENTE_3),
    ];

    for (const derivada of identidadesDerivadas) {
      for (const antiga of IDS_FORMATO_ANTIGO) {
        expect(derivada).not.toBe(antiga);
      }
    }
  });
});

describe("✅ NÃO INVENTA PROBLEMA — a derivação continua confiável para quem depende dela", () => {
  it("é DETERMINÍSTICA: o mesmo caminho, chamado duas vezes, dá sempre a mesma identidade", () => {
    // Se não fosse assim, a sessão perderia a posse das próprias
    // reivindicações entre um comando e outro — "abrir" gravaria um "quem"
    // e "conferir", rodado em seguida, calcularia outro, e a trava deixaria
    // de reconhecer como "minhas" as reivindicações que a própria sessão
    // abriu.
    expect(derivarIdentidade(WORKTREE_AGENTE_1)).toBe(derivarIdentidade(WORKTREE_AGENTE_1));
    expect(derivarIdentidade(WORKTREE_AGENTE_2)).toBe(derivarIdentidade(WORKTREE_AGENTE_2));
    expect(derivarIdentidade(WORKTREE_PRINCIPAL)).toBe(derivarIdentidade(WORKTREE_PRINCIPAL));
  });

  it("o formato é estável e legível: prefixo previsível \"wt-\" e comprimento fixo", () => {
    for (const caminho of [WORKTREE_PRINCIPAL, WORKTREE_AGENTE_1, WORKTREE_AGENTE_2, WORKTREE_AGENTE_3]) {
      const identidade = derivarIdentidade(caminho);
      expect(identidade.startsWith("wt-")).toBe(true);
      expect(identidade.length).toBe(13); // "wt-" (3) + 10 caracteres de hash hexadecimal
    }
  });

  it("caminho com barra final e sem barra final NÃO dão a mesma identidade em \"derivarIdentidade\" — e isso não morde, porque quem chama de verdade nunca passa string crua", () => {
    // Comportamento REAL medido, não o desejado: "derivarIdentidade" é uma
    // função PURA que apenas faz hash da string recebida — ela mesma NÃO
    // normaliza barra final. "/a/b" e "/a/b/" produzem hashes diferentes
    // porque são strings diferentes.
    //
    // Isso não morde ninguém na prática porque a única chamada real do
    // sistema ("identidadeDaSessao()", dentro de scripts/reivindicar.mts)
    // nunca entrega uma string crua: ela entrega "RAIZ", que é sempre o
    // resultado de "resolve(...)" — e "path.resolve" do Node já remove barra
    // final por definição. A normalização acontece ANTES de chegar em
    // "derivarIdentidade", na fronteira que produz "RAIZ", não dentro da
    // função pura.
    const semBarra = "/home/user/diolidigital/.claude/worktrees/agent-a27b5772c791e9e52";
    const comBarra = `${semBarra}/`;

    expect(derivarIdentidade(comBarra)).not.toBe(derivarIdentidade(semBarra));
  });
});
