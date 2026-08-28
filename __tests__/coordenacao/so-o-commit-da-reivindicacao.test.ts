// A REIVINDICAÇÃO EMPURRA SÓ O COMMIT DELA — e a RECUSA é o mecanismo.
//
// ═══ O INCIDENTE (28/08/2026) ══════════════════════════════════════════════
//
// `npm run reivindicar -- encerrar` levou QUATRO commits de um PR aberto direto
// para a branch de deploy — sem PR, sem CI, sem revisão. A linha culpada:
//
//   git push --no-verify origin HEAD:<branch>
//
// `HEAD:` empurra tudo o que o HEAD tem e o remoto não. O trabalho era bom e
// nada quebrou — **foi sorte, não desenho.**
//
// ⚠️ ESTES TESTES EXERCITAM A RECUSA, NÃO O CAMINHO FELIZ. Uma trava só existe
// se ela recusa: um teste que só prova "quando está tudo certo, passa" descreve
// o comportamento normal e não mede a trava nenhuma vez. Foi por isso que uma
// mutação sobreviveu nesta casa hoje de manhã, e a lição está aplicada aqui.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { soLevaAReivindicacao } from "@/lib/coordenacao/so-o-commit-da-reivindicacao";

describe("o portão do push da reivindicação", () => {
  it("🔒 RECUSA quando há commits além da reivindicação — o incidente de 28/08", () => {
    const v = soLevaAReivindicacao({
      commitsAlemDaReivindicacao: 4,
      titulos: [
        "a1b2c3 O fio entre a rota e a sala ganha teste",
        "d4e5f6 O parceiro para de ser perguntado sobre verba",
        "789abc reivindica: Ligar a parceria à sala",
        "def012 tsc pegou o SocialScope sem platforms",
      ],
      mediu: true,
    });
    expect(v.pode, "o portão deixou passar exatamente o caso que ele existe para barrar").toBe(false);
    if (v.pode) return;
    // A recusa DIZ o que teria acontecido — recusa muda não ensina ninguém.
    expect(v.motivo).toContain("4 commits");
    expect(v.motivo).toContain("sem PR e sem CI");
    // E diz a saída, em comando colável.
    expect(v.motivo).toContain("git checkout -B");
    // E promete o que importa para quem foi barrado: nada do trabalho se perde.
    expect(v.motivo).toMatch(/nada foi tocado|fica onde está/i);
  });

  it("🔒 RECUSA por UM commit só — não há limiar de tolerância", () => {
    const v = soLevaAReivindicacao({ commitsAlemDaReivindicacao: 1, titulos: ["a1 qualquer coisa"], mediu: true });
    expect(v.pode).toBe(false);
    // Singular, não "1 commits": a recusa é lida por gente.
    if (!v.pode) expect(v.motivo).toContain("1 commit que");
  });

  it("⛔ RECUSA quando NÃO CONSEGUIU MEDIR — 'não sei' nunca vira 'então vai'", () => {
    const v = soLevaAReivindicacao({ commitsAlemDaReivindicacao: 0, mediu: false });
    expect(
      v.pode,
      "a leitura falhou e o portão liberou assim mesmo — fail-OPEN é o pior desenho possível numa trava",
    ).toBe(false);
    if (!v.pode) expect(v.motivo).toContain("não consegui medir");
  });

  it("⛔ e RECUSA mesmo com contagem zero, se a medição não aconteceu", () => {
    // O caso traiçoeiro: zero por padrão de struct, não por medição. Se o
    // portão olhasse só o número, este passaria.
    const v = soLevaAReivindicacao({ commitsAlemDaReivindicacao: 0, titulos: [], mediu: false });
    expect(v.pode).toBe(false);
  });

  it("✅ LIBERA no caso legítimo: worktree de agente, nada além da reivindicação", () => {
    // A premissa original do comando, e ela continua valendo: branch privada
    // cujo HEAD só carrega o commit da reivindicação.
    const v = soLevaAReivindicacao({ commitsAlemDaReivindicacao: 0, titulos: [], mediu: true });
    expect(v.pode, "o portão barrou o uso normal — a trava virou parede").toBe(true);
  });

  it("a recusa cita no máximo 5 commits — mensagem que ninguém lê não protege", () => {
    const muitos = Array.from({ length: 40 }, (_, i) => `sha${i} commit número ${i}`);
    const v = soLevaAReivindicacao({ commitsAlemDaReivindicacao: 40, titulos: muitos, mediu: true });
    expect(v.pode).toBe(false);
    if (v.pode) return;
    expect(v.motivo).toContain("40 commits");
    expect(v.motivo).toContain("commit número 4");
    expect(v.motivo, "despejou os 40 na tela").not.toContain("commit número 6");
  });

  it("sem títulos, ainda recusa e ainda explica", () => {
    // `titulos` é opcional: quem chama pode não ter conseguido a lista, e a
    // recusa não pode depender dela.
    const v = soLevaAReivindicacao({ commitsAlemDaReivindicacao: 2, mediu: true });
    expect(v.pode).toBe(false);
    if (!v.pode) expect(v.motivo).toContain("2 commits");
  });
});

// ── QUEM CHAMA ISTO? — o elo, e por que ele é guarda de texto ───────────────
//
// 🚩 DECLARADO: isto é GUARDA ESTRUTURAL, não execução. `scripts/reivindicar.mts`
// é um executável que opera sobre o repositório REAL (`RAIZ` é a raiz deste
// repo) e faz `git push` de verdade. Não há como exercitá-lo numa suíte sem
// apontá-lo para um repo de mentira — refatoração maior do que o conserto que
// ele está recebendo, e não é hora.
//
// O que este bloco garante é o que a noite de 28/08 ensinou: a régua existir e
// **ninguém chamar** é o defeito, não a exceção. Ele falha se alguém remover a
// chamada, inverter a ordem, ou trazer o `HEAD:` de volta.
describe("o script CHAMA o portão — e na ordem certa", () => {
  const fonte = fs.readFileSync(path.join(process.cwd(), "scripts/reivindicar.mts"), "utf8");

  it("importa e chama `soLevaAReivindicacao`", () => {
    expect(fonte).toContain("so-o-commit-da-reivindicacao");
    expect(
      /const veredito = soLevaAReivindicacao\(estado\)/.test(fonte),
      "o portão foi escrito e ninguém o chama — exatamente o defeito que ele conserta",
    ).toBe(true);
  });

  it("⛔ o `HEAD:<branch>` NÃO voltou — é a linha que causou o incidente", () => {
    expect(
      /push[^\n]*HEAD:\$\{branch\}/.test(fonte),
      "`HEAD:${branch}` está de volta no push: ele empurra tudo o que o HEAD tiver",
    ).toBe(false);
    // E o push nomeia o SHA.
    expect(fonte).toContain("`${sha}:${branch}`");
  });

  it("⚠️ o portão roda ANTES do commit — recusar depois deixa commit órfão", () => {
    const ondePortao = fonte.indexOf("const veredito = soLevaAReivindicacao(estado)");
    const ondeCommit = fonte.indexOf('git(["commit", "-m", mensagem])');
    expect(ondePortao).toBeGreaterThan(-1);
    expect(ondeCommit).toBeGreaterThan(-1);
    expect(
      ondePortao,
      "o portão passou para depois do commit — quem for barrado fica com um commit local para limpar",
    ).toBeLessThan(ondeCommit);
  });

  it("a recusa INTERROMPE — não é aviso impresso", () => {
    const trecho = fonte.slice(
      fonte.indexOf("const veredito = soLevaAReivindicacao(estado)"),
      fonte.indexOf('git(["add", caminhoRelativo])'),
    );
    expect(
      /throw new Error/.test(trecho),
      "a recusa virou console.log: aviso não trava nada, e prompt é sugestão",
    ).toBe(true);
  });

  it("o `--no-verify` que ficou tem justificativa escrita ao lado", () => {
    // O Diretor Geral autorizou tirá-lo OU justificá-lo no código. Ele fica: o
    // deadlock de 16/08 é real (o gancho chama `conferir`, que barra o push
    // pela própria reivindicação). A justificativa tem de estar no arquivo.
    const trecho = fonte.slice(fonte.indexOf("const tentarPush"), fonte.indexOf("const tentarPush") + 200);
    expect(fonte).toContain("--no-verify");
    expect(
      /deadlock|gancho pre-push chama|16\/08/.test(fonte),
      "o --no-verify ficou sem a justificativa escrita que o autoriza",
    ).toBe(true);
    expect(trecho).toContain("no-verify");
  });
});
