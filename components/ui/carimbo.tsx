"use client";

// ─────────────────────────────────────────────────────────────────────────────
// <Carimbo> — o ÚNICO jeito de mostrar quando algo aconteceu
// ─────────────────────────────────────────────────────────────────────────────
//
// Regra do CEO, 15/08/2026: "Tudo precisa ter hora e data." Toda tela que mostra
// um estado — aguardando você, em produção, decidido, pronto — mostra também
// **quando aquilo aconteceu**, com data absoluta E idade relativa.
//
// Este componente existe para que a regra não dependa de cada tela lembrar do
// formato. Ele resolve, de uma vez, as quatro coisas que as telas erravam:
//
//   • **fuso e formato** — pt-BR, 24h, `America/Sao_Paulo` fixo (ver
//     `lib/carimbo-de-tempo.ts`);
//   • **as duas leituras juntas** — "14/08/2026 às 21:47 · há 15 h";
//   • **`title` sempre presente**, com o carimbo completo, mesmo quando o modo
//     mostra só a idade;
//   • **a ausência dita, nunca inventada** — sem campo no banco, sai "sem
//     registro de quando" em itálico discreto, e o `title` explica a falta.
//
// Semântica: `<time dateTime>` — é o elemento que a web tem para instante, e é
// o que leitor de tela e robô entendem.
//
// ⚠️ Hidratação: a parte relativa depende de `Date.now()`, logo o servidor e o
// navegador podem cair em minutos diferentes. `suppressHydrationWarning` cobre
// essa divergência de UM elemento de texto. A parte ABSOLUTA não diverge, de
// propósito: o fuso é fixo no formatador, então servidor e cliente escrevem o
// mesmo dia e a mesma hora.

import { carimbar, SEM_CARIMBO, SEM_CARIMBO_DETALHE } from "@/lib/carimbo-de-tempo";

export type ModoDoCarimbo =
  /** "14/08/2026 às 21:47 · há 15 h" — o padrão. Use sempre que couber. */
  | "completo"
  /** "há 15 h" — só onde a largura não permite. O `title` guarda a prova. */
  | "relativo"
  /** "14/08/2026 às 21:47" — quando a idade já está dita ao lado. */
  | "absoluto";

export function Carimbo({
  quando,
  modo = "completo",
  prefixo,
  className = "",
  semRegistro = SEM_CARIMBO,
}: {
  /** O instante. `null`/`undefined` = o registro não tem o campo — e isso é dito. */
  quando: string | Date | number | null | undefined;
  modo?: ModoDoCarimbo;
  /** Texto colado antes, dentro do mesmo `title` ("aguardando você desde "). */
  prefixo?: string;
  className?: string;
  /** Sobrescreve a frase de ausência quando a tela sabe dizer melhor. */
  semRegistro?: string;
}) {
  const c = carimbar(quando);

  if (!c) {
    // ⚠️ O PREFIXO SOME AQUI, DE PROPÓSITO. "aguardando você desde sem registro
    // de quando" não é português — e frase quebrada faz o leitor achar que a
    // tela bugou, quando na verdade ela está sendo honesta. Sem carimbo, a
    // frase é só a ausência, dita inteira.
    return (
      <span
        className={`italic text-[var(--text-muted)] ${className}`}
        title={SEM_CARIMBO_DETALHE}
      >
        {semRegistro}
      </span>
    );
  }

  const visivel = modo === "relativo" ? c.relativo : modo === "absoluto" ? c.absoluto : c.completo;

  return (
    <time
      dateTime={c.iso}
      title={`${prefixo ?? ""}${c.completo}`}
      className={className || undefined}
      suppressHydrationWarning
    >
      {prefixo}
      {visivel}
    </time>
  );
}
