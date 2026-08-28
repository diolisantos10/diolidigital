// ⛔ A REIVINDICAÇÃO EMPURRA O COMMIT DELA — NUNCA O BRANCH INTEIRO.
//
// ═══ O INCIDENTE, MEDIDO EM 28/08/2026 ═════════════════════════════════════
//
// `npm run reivindicar -- encerrar` levou **quatro commits de um PR aberto**
// direto para a branch de deploy — sem PR, sem CI, sem revisão. O trabalho era
// bom (testes e documentos) e nada quebrou. **Isso foi sorte, não desenho.**
//
// A causa é uma linha:
//
//   git push --no-verify origin HEAD:<branch>
//
// `HEAD:<branch>` não empurra o commit da reivindicação. Empurra **tudo o que o
// HEAD tem e o remoto não** — e o `--no-verify` desliga o gancho que seria a
// última defesa. *A ferramenta oficial da casa violava a regra número um da
// casa, em silêncio, e ninguém tinha medido.*
//
// ═══ A PREMISSA ORIGINAL CONTINUA LEGÍTIMA ═════════════════════════════════
//
// O desenho assumia worktree de agente, em branch privada, cujo HEAD só carrega
// o commit da reivindicação. **Nessa situação `HEAD:` e "só o commit" são a
// mesma coisa**, e o comando estava certo.
//
// O defeito não é a premissa — é ela **nunca ser conferida antes de agir**.
// Premissa não conferida é suposição, e suposição que empurra para o deploy é
// exatamente o que este módulo existe para impedir.
//
// ═══ FAIL-CLOSED, E É A METADE QUE IMPORTA ═════════════════════════════════
//
// Na dúvida sobre o que seria empurrado — `git` falhou, o remoto não foi lido,
// a contagem não deu — **NÃO EMPURRA**. "Não sei o que iria junto" nunca pode
// virar "então vai". *Recusa barata, dano caro.*

/** O que a régua precisa saber. Nenhum acesso a git aqui: quem chama mede. */
export type EstadoDoPush = {
  /** Commits que o HEAD tem e o remoto não — SEM contar o da reivindicação. */
  commitsAlemDaReivindicacao: number;
  /** Uma linha por commit extra, para a recusa dizer o que teria ido junto. */
  titulos?: string[];
  /** `false` quando a contagem não pôde ser feita (git falhou, remoto ilegível). */
  mediu: boolean;
};

export type VereditoDoPush =
  | { pode: true }
  | { pode: false; motivo: string };

/**
 * ESTE PUSH LEVA SÓ A REIVINDICAÇÃO?
 *
 * `pode: true` apenas quando a medição foi feita E não há nada além. Todo o
 * resto é recusa — inclusive "não consegui medir".
 */
export function soLevaAReivindicacao(estado: EstadoDoPush): VereditoDoPush {
  if (!estado.mediu) {
    return {
      pode: false,
      motivo:
        "não consegui medir o que este push levaria para o deploy, então não empurro. " +
        "Rode a reivindicação de um branch alinhado com a base " +
        "(git checkout -B <novo> origin/<base>) e tente de novo.",
    };
  }

  if (estado.commitsAlemDaReivindicacao > 0) {
    const n = estado.commitsAlemDaReivindicacao;
    const lista = (estado.titulos ?? []).slice(0, 5).map((t) => `     • ${t}`).join("\n");
    return {
      pode: false,
      motivo:
        `este branch tem ${n} commit${n > 1 ? "s" : ""} que o deploy não tem, além da reivindicação — ` +
        `e empurrá-la daqui levaria ${n > 1 ? "todos eles" : "ele"} junto, sem PR e sem CI.\n` +
        (lista ? `   O que teria ido junto:\n${lista}\n` : "") +
        "   Rode a reivindicação de um branch alinhado com a base:\n" +
        "     git checkout -B <nome-novo> origin/<base>\n" +
        "   e depois volte ao seu branch. O seu trabalho fica onde está — nada foi tocado.",
    };
  }

  return { pode: true };
}
