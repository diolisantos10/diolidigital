// ─────────────────────────────────────────────────────────────────────────
// O INCIDENTE QUE ESTE TESTE GUARDA (16/08/2026, RODADA 5)
//
// A rodada 4 (ver "__tests__/coordenacao/identidade-derivada.test.ts")
// consertou "dois worktrees não se confundem". Mas esta casa roda VÁRIAS
// SESSÕES no MESMO worktree — o worktree principal, "/home/user/diolidigital",
// é compartilhado por várias conversas ao mesmo tempo — e a identidade da
// rodada 4 era função só do CAMINHO do worktree, não da SESSÃO. Duas
// consequências, medidas em disco no MESMO dia:
//
//   (a) FALSO NEGATIVO — duas sessões DISTINTAS, mesmo worktree, calcularam
//       a MESMA identidade: "reivindicacoes/seguranca-reset-habilitado-
//       denuncia.json" (aberta 19:46) e "reivindicacoes/coordenacao-
//       identidade-por-sessao.json" (aberta 20:03) — ambas com
//       quem = "wt-09f81bb764", embora fossem sessões diferentes. Se elas
//       tivessem tocado o mesmo arquivo ou a mesma responsabilidade, a trava
//       NÃO teria enxergado a colisão — o próprio cabeçalho de
//       "scripts/reivindicar.mts" já descreve este caso como o "pior caso".
//
//   (b) O ESPELHO DO MESMO DEFEITO — às 19:37, a sessão "pm-defeitos-do-ceo"
//       foi BARRADA pela PRÓPRIA reivindicação ("PublicBriefingRoom.tsx" já
//       reivindicado por "pm-defeitos-do-ceo", sendo ela mesma
//       "pm-defeitos-do-ceo") porque ".dioli-quem" — arquivo ÚNICO dentro do
//       worktree — foi sobrescrito por OUTRA sessão no mesmo disco antes de
//       ela conferir. Duas sessões, um arquivo de identidade só: a segunda
//       apaga o rótulo da primeira.
//
// As duas faces são o MESMO defeito raiz: a identidade enxergava o
// WORKTREE, não a SESSÃO. A saída (RODADA 5, ver "derivarIdentidade" em
// "lib/coordenacao/reivindicacoes.ts" e "descobrirAncoraDeSessao" em
// "scripts/reivindicar.mts") soma à derivação uma ÂNCORA DE SESSÃO
// descoberta no ambiente (CLAUDE_CODE_SESSION_ID, ou PID+starttime como
// reserva) — nunca digitada por ninguém, exatamente como a rodada 4 já
// fazia com o caminho do worktree.
//
// Este arquivo cobre as DUAS metades que a definição de pronto exige:
//   • caso SUJO — duas sessões distintas no MESMO worktree, tocando o
//     MESMO arquivo → tem que BARRAR (a proteção que faltava);
//   • caso LIMPO — a MESMA sessão reencontrando a PRÓPRIA reivindicação,
//     em invocações diferentes do comando (abrir, depois conferir) → tem
//     que PASSAR, nunca se barrar sozinha (o problema do item (b) acima).
// ─────────────────────────────────────────────────────────────────────────

import { describe, expect, it } from "vitest";

import { conferirColisao, derivarIdentidade, type Reivindicacao } from "@/lib/coordenacao/reivindicacoes";

const AGORA = new Date("2026-08-16T20:30:00Z");

/** O MESMO worktree para todos os testes deste arquivo — de propósito: o
 *  que está sob teste é a distinção entre SESSÕES, não entre worktrees (isso
 *  já é responsabilidade de "identidade-derivada.test.ts"). */
const WORKTREE_PRINCIPAL = "/home/user/diolidigital";

/** Duas âncoras de sessão distintas, no formato que
 *  "descobrirAncoraDeSessao" produz a partir de CLAUDE_CODE_SESSION_ID —
 *  dois uuids diferentes, como duas conversas separadas teriam de verdade. */
const ANCORA_SESSAO_A = "dd73bb03-9fd0-59a6-a2f1-f61292854b92";
const ANCORA_SESSAO_B = "6c2f9e14-88b1-4a4a-a0b3-9a6f4b1d7e22";

function reivindicacao(parcial: Partial<Reivindicacao> & Pick<Reivindicacao, "quem" | "responsabilidade" | "arquivos">): Reivindicacao {
  return {
    id: parcial.id ?? parcial.responsabilidade,
    quem: parcial.quem,
    frente: parcial.frente ?? "(frente de teste)",
    responsabilidade: parcial.responsabilidade,
    arquivos: parcial.arquivos,
    abertaEm: parcial.abertaEm ?? "2026-08-16T20:00:00Z",
    encerradaEm: parcial.encerradaEm ?? null,
  };
}

describe("⛔ CASO SUJO — duas sessões distintas, mesmo worktree, mesmo arquivo: tem que BARRAR", () => {
  it("com a âncora de sessão, duas sessões no MESMO worktree calculam identidades DIFERENTES", () => {
    const quemA = derivarIdentidade(WORKTREE_PRINCIPAL, ANCORA_SESSAO_A);
    const quemB = derivarIdentidade(WORKTREE_PRINCIPAL, ANCORA_SESSAO_B);

    // Esta é a propriedade que a rodada 4 NÃO tinha: mesmo worktree, mesmo
    // "RAIZ", e ainda assim identidades diferentes — porque a sessão importa.
    expect(quemA).not.toBe(quemB);
  });

  it("a colisão REAL entre duas sessões no mesmo worktree é detectada — a proteção que faltava na rodada 4", () => {
    const quemA = derivarIdentidade(WORKTREE_PRINCIPAL, ANCORA_SESSAO_A);
    const quemB = derivarIdentidade(WORKTREE_PRINCIPAL, ANCORA_SESSAO_B);

    const jaExiste = reivindicacao({
      quem: quemA,
      frente: "sessão A mexendo no cofre de credenciais",
      responsabilidade: "plataforma/cofre-de-credenciais",
      arquivos: ["lib/security/crypto.ts"],
    });

    // Sessão B, no MESMO worktree, tenta tocar o MESMO arquivo — sem saber
    // que a sessão A já está nele. Com a identidade da rodada 4 (sem
    // âncora), quemA === quemB neste worktree, e "conferirColisao" teria
    // pulado a checagem ("nunca colide consigo mesma") mesmo sendo DUAS
    // sessões de verdade — o falso negativo medido em disco. Com a âncora
    // de sessão, quemA !== quemB, e a colisão aparece.
    const resultado = conferirColisao(
      { quem: quemB, responsabilidade: "plataforma/rotacao-de-chave", arquivos: ["lib/security/crypto.ts"] },
      [jaExiste],
      AGORA,
    );

    expect(resultado.colide).toBe(true);
    expect(resultado.motivos.join(" ")).toContain("lib/security/crypto.ts");
    expect(resultado.motivos.join(" ")).toContain(quemA);
  });

  it("a mesma colisão passaria DESPERCEBIDA se a âncora fosse ignorada (documenta o falso negativo que este teste mata)", () => {
    // Este teste fixa o COMPORTAMENTO ANTIGO (rodada 4: sem âncora) como
    // contraste explícito — para deixar claro, lendo o arquivo, qual era o
    // defeito. Não é uma afirmação de que o sistema deve se comportar assim
    // hoje: é o "antes" do "antes/depois".
    const semAncoraA = derivarIdentidade(WORKTREE_PRINCIPAL); // rodada 4: sem 2º argumento
    const semAncoraB = derivarIdentidade(WORKTREE_PRINCIPAL); // outra "sessão", mesma chamada

    expect(semAncoraA).toBe(semAncoraB); // era EXATAMENTE isto que causava o falso negativo
  });
});

describe("✅ CASO LIMPO — a própria sessão reencontrando a própria reivindicação: NÃO pode se barrar sozinha", () => {
  it("a mesma sessão, chamando \"abrir\" e depois \"conferir\" (duas invocações do comando), calcula a MESMA identidade", () => {
    // "descobrirAncoraDeSessao" lê CLAUDE_CODE_SESSION_ID do ambiente — o
    // mesmo valor em toda invocação da mesma sessão (é isto que a garante
    // estável entre comandos). Aqui simulamos isso passando a MESMA âncora
    // duas vezes, como duas chamadas de "identidadeDaSessao()" fariam.
    const naAbertura = derivarIdentidade(WORKTREE_PRINCIPAL, ANCORA_SESSAO_A);
    const naConferencia = derivarIdentidade(WORKTREE_PRINCIPAL, ANCORA_SESSAO_A);

    expect(naConferencia).toBe(naAbertura);
  });

  it("a própria reivindicação, revisitada pela mesma sessão, NUNCA colide consigo mesma", () => {
    const quem = derivarIdentidade(WORKTREE_PRINCIPAL, ANCORA_SESSAO_A);

    const minhaPropriaReivindicacao = reivindicacao({
      quem,
      frente: "terminar a identidade por sessão",
      responsabilidade: "coordenacao/identidade-por-sessao",
      arquivos: ["scripts/reivindicar.mts", "lib/coordenacao/reivindicacoes.ts"],
    });

    // A mesma sessão, mais tarde, confere de novo o mesmo arquivo — como o
    // gancho pre-push faz antes de cada push. Isto é exatamente o caso que
    // barrou "pm-defeitos-do-ceo" pela própria reivindicação em 16/08/2026:
    // aqui tem que PASSAR.
    const resultado = conferirColisao(
      { quem, responsabilidade: "coordenacao/identidade-por-sessao", arquivos: ["scripts/reivindicar.mts"] },
      [minhaPropriaReivindicacao],
      AGORA,
    );

    expect(resultado.colide).toBe(false);
  });

  it("duas sessões DIFERENTES, cada uma revisitando a PRÓPRIA reivindicação em arquivos distintos, também não colidem entre si", () => {
    const quemA = derivarIdentidade(WORKTREE_PRINCIPAL, ANCORA_SESSAO_A);
    const quemB = derivarIdentidade(WORKTREE_PRINCIPAL, ANCORA_SESSAO_B);

    const deA = reivindicacao({ quem: quemA, responsabilidade: "comercial/verba-declarada", arquivos: ["lib/agency/comercial/verba-declarada.ts"] });
    const deB = reivindicacao({ quem: quemB, responsabilidade: "seguranca/csrf-faixa1", arquivos: ["lib/security/csrf.ts"] });

    // A sessão A confere o próprio arquivo, com a reivindicação de B (de
    // outro arquivo, outra responsabilidade) também no registro — não pode
    // acender alarme nenhum, é trabalho paralelo legítimo.
    const resultado = conferirColisao({ quem: quemA, responsabilidade: "comercial/verba-declarada", arquivos: ["lib/agency/comercial/verba-declarada.ts"] }, [deA, deB], AGORA);

    expect(resultado.colide).toBe(false);
  });
});

describe("O modo DEGRADADO (sem âncora) continua existindo, de propósito — mas nunca em silêncio (ver scripts/reivindicar.mts)", () => {
  it("sem âncora, a identidade é a mesma da rodada 4 — prefixo \"wt-\", só o caminho do worktree", () => {
    const semAncora = derivarIdentidade(WORKTREE_PRINCIPAL);
    expect(semAncora.startsWith("wt-")).toBe(true);
    expect(semAncora).toBe(derivarIdentidade(WORKTREE_PRINCIPAL, null));
    expect(semAncora).toBe(derivarIdentidade(WORKTREE_PRINCIPAL, ""));
  });

  it("com âncora, o prefixo muda para \"ses-\" — os dois espaços de identidade nunca se confundem", () => {
    const comAncora = derivarIdentidade(WORKTREE_PRINCIPAL, ANCORA_SESSAO_A);
    const semAncora = derivarIdentidade(WORKTREE_PRINCIPAL);

    expect(comAncora.startsWith("ses-")).toBe(true);
    expect(comAncora).not.toBe(semAncora);
  });

  it("uma identidade \"wt-\" antiga (rodada 4, ou o modo degradado de hoje) nunca colide, por acaso, com uma \"ses-\" nova", () => {
    const antigaOuDegradada = derivarIdentidade(WORKTREE_PRINCIPAL); // "wt-..."
    const novaComSessao = derivarIdentidade(WORKTREE_PRINCIPAL, ANCORA_SESSAO_A); // "ses-..."

    const deOutraSessaoAntiga = reivindicacao({
      quem: antigaOuDegradada,
      responsabilidade: "plataforma/algo-antigo",
      arquivos: ["lib/algo.ts"],
    });

    // Mesmo arquivo, "quem" no formato antigo/degradado × identidade nova
    // com sessão: os prefixos diferentes já garantem que os valores nunca
    // batem por acaso — então isto AINDA colide pelo canal de ARQUIVO (o
    // que é correto: sobreposição de arquivo é sobreposição de arquivo,
    // não importa o formato do "quem" de quem chegou primeiro).
    const resultado = conferirColisao({ quem: novaComSessao, responsabilidade: "plataforma/algo-novo", arquivos: ["lib/algo.ts"] }, [deOutraSessaoAntiga], AGORA);

    expect(resultado.colide).toBe(true);
  });
});
