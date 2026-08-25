// `SocialPost.lastError` TEM MAIS DE UM ESCRITOR — e agora tem régua.
//
// ═══════════════════════════════════════════════════════════════════════════
// O ACHADO (Auditor, 6ª rodada, 25/08/2026) — item 5
// ═══════════════════════════════════════════════════════════════════════════
//
// `[titulo ilegivel]` passou a ser gravado no MESMO campo que
// `contarTentativas` interpreta. Inofensivo HOJE — o contador exige o prefixo
// `^[arte N/` — mas o campo acumulou significados **sem declaração**, e um
// campo com dois donos e nenhum contrato é onde o terceiro escritor entra sem
// saber que existe um leitor.
//
// A declaração está em `artes.ts`, ao lado de `contarTentativas`. Esta é a
// trava dela: prompt é aviso, código é trava.
//
// O que estes testes prendem: **o contador é um PREFIXO exclusivo.** Nenhuma
// nota de degradação pode ser lida como tentativa, e nenhuma tentativa pode
// ser perdida por causa de uma nota colada depois.

import { describe, it, expect } from "vitest";
import {
  contarTentativas,
  tituloSaiuIlegivel,
  pecaSaiuSemTitulo,
  MARCA_DE_TITULO_ILEGIVEL,
} from "@/lib/agency/execution/artes";

describe("lastError: um campo, vários significados, nenhum atropelando o outro", () => {
  it("a marca de título ilegível NÃO é lida como tentativa de arte", () => {
    const nota = `${MARCA_DE_TITULO_ILEGIVEL} contraste 2,1:1 sobre a foto`;
    // Se um dia a marca virar prefixo com formato `[arte …`, esta linha cai —
    // e é exatamente por isso que ela existe: o contador decidiria desistir de
    // uma peça que nunca falhou, ou nunca desistir de uma que falhou sempre.
    expect(contarTentativas(nota)).toBe(0);
    expect(tituloSaiuIlegivel(nota)).toBe(true);
  });

  it("a nota do molde não conta tentativa — e continua legível para quem a procura", () => {
    const soFoto = "[molde] peça entregue só com a foto";
    expect(contarTentativas(soFoto)).toBe(0);
    expect(pecaSaiuSemTitulo(soFoto)).toBe(true);
    expect(contarTentativas("[molde] texto barrado pela trava — assinatura")).toBe(0);
  });

  it("contador e nota CONVIVEM: a tentativa é lida e a marca continua achável", () => {
    // O caso que o campo compartilhado torna possível: a peça falhou duas
    // vezes E saiu com o título abaixo do piso. Os dois leitores respondem.
    const misto = `[arte 2/3] o gerador recusou · ${MARCA_DE_TITULO_ILEGIVEL} contraste 2,4:1`;
    expect(contarTentativas(misto)).toBe(2);
    expect(tituloSaiuIlegivel(misto)).toBe(true);
  });

  it("campo vazio e nulo: ninguém inventa significado onde não há dado", () => {
    // Guardrail 1: ausência de informação não é informação. `lastError` vazio
    // não quer dizer "zero falhas provadas" nem "título legível provado" — mas
    // os leitores não podem responder SIM sem fato.
    for (const vazio of [null, "", undefined]) {
      expect(contarTentativas((vazio ?? null) as string | null)).toBe(0);
      expect(tituloSaiuIlegivel(vazio)).toBe(false);
      expect(pecaSaiuSemTitulo(vazio)).toBe(false);
    }
  });
});
