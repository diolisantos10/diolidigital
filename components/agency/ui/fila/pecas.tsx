"use client";

// AS PEÇAS COMUNS DAS TELAS DE FILA — uma implementação, não duas.
//
// ── O DRIFT QUE ESTE ARQUIVO MATA (16/08/2026) ─────────────────────────────
//
// Duas telas nasceram no mesmo dia contando duas filas diferentes com o MESMO
// desenho: `/agency/leads` (quem bateu na porta) e a faixa de `/agency/approvals`
// (esperando o cliente). O componente `Numero` era **byte a byte idêntico** nos
// dois arquivos, o cartão de erro foi copiado, `dias()` foi escrito duas vezes,
// e um `Selo` refazia à mão o que o `Badge` da casa já faz.
//
// Cópia não é só dívida de linha: **copiar o componente não sincroniza a
// semântica**. Medido no mesmo dia — `--danger` e `--warning` queriam dizer
// coisas OPOSTAS nas duas telas. Na de aprovações havia três degraus (dívida
// nossa = vermelho · espera do cliente = neutro · passou do prazo = âmbar); na
// de leads, dois deles estavam achatados num só. O leitor que aprende a cor
// numa tela lê a outra errado, e ninguém percebe porque as duas "estão certas"
// isoladamente.
//
// ── OS TRÊS DEGRAUS, DECLARADOS UMA VEZ ───────────────────────────────────
//
//   • `nossa`   (vermelho)  — a bola é da CASA. O conserto é alguém daqui agir.
//   • `deles`   (neutro)    — a bola é do cliente. Esperar é legítimo.
//   • `atencao` (âmbar)     — passou do prazo, ou é buraco de dado. Ninguém
//                             está errado; alguém precisa olhar.
//
// A cor sai do TOM, e o tom sai de quem tem a bola. Escolher `--danger` "porque
// fica mais visível" é o que produziu a divergência.

import type { ReactNode } from "react";
import Badge from "@/components/agency/ui/Badge";
import Button from "@/components/agency/ui/Button";

/** De quem é a bola. É isto que decide a cor — nunca a vontade de destacar.
 *  `ok` é o quarto degrau e só existe em selo: "isto aqui está resolvido". */
export type Tom = "nossa" | "deles" | "atencao";
export type TomDeSelo = Tom | "ok";

const TEXTO: Record<Tom, string> = {
  nossa: "text-[var(--danger)]",
  atencao: "text-[var(--warning)]",
  deles: "text-[var(--text-primary)]",
};

const BORDA: Record<Tom, string> = {
  nossa: "border-[var(--danger)]",
  atencao: "border-[var(--warning)]",
  deles: "border-[var(--border)]",
};

/**
 * Plural que não sai com parêntese. "1 card(s)" e "parada há 0 dias" são as
 * duas frases que denunciam que ninguém leu a tela em voz alta.
 */
export function contagem(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** "3 dias" · "1 dia". Sem parêntese, sem `(s)`. */
export function dias(n: number): string {
  return contagem(n, "dia", "dias");
}

/**
 * Há quanto tempo espera, dito como gente fala.
 *
 * "parada há 0 dias" é a frase que ninguém fala: quem entrou hoje entrou hoje, e
 * a diferença entre hoje e ontem é a diferença entre tudo certo e alguém
 * começando a esperar.
 */
export function esperaHa(n: number): string {
  return n === 0 ? "chegou hoje" : `há ${dias(n)}`;
}

/**
 * Um número do placar.
 *
 * `nota` explica o que o número NÃO é — é onde mora o aviso de não-soma, e ele
 * precisa estar no número certo. Em 16/08 a faixa de aprovações trazia o aviso
 * entre `abandonadas` e `paradas` e **não** entre `bolaConosco` e `paradas`, que
 * era justamente o par que se sobrepunha.
 */
export function Numero({
  valor, rotulo, nota, tom,
}: { valor: number; rotulo: string; nota: string; tom: Tom }) {
  return (
    // No celular o placar é uma LINHA por número — três blocos altos empurram o
    // primeiro item real para longe da dobra, e quem abre estas telas vem ver
    // gente, não contador.
    //
    // ⚠️ O corte é `lg`, e não `sm`. A 768px a barra lateral da agência come
    // 224px: sobram ~544px para três colunas, e o rótulo quebra em quatro
    // linhas. `sm:` mediu a janela e esqueceu a sidebar.
    <div className={`rounded-[12px] border ${BORDA[tom]} bg-[var(--card)] px-4 py-3`}>
      <div className="flex items-baseline gap-2.5 lg:block">
        <p className={`text-[24px] lg:text-[26px] font-semibold leading-none tabular-nums shrink-0 ${TEXTO[tom]}`}>
          {valor}
        </p>
        <p className="text-[13px] font-medium text-[var(--text-primary)] lg:mt-1.5 leading-snug">{rotulo}</p>
      </div>
      <p className="text-[12px] text-[var(--text-muted)] mt-1 leading-relaxed">{nota}</p>
    </div>
  );
}

/**
 * O selo de estado de um cartão.
 *
 * **É o `Badge` da casa**, e isso é o conserto: a tela de leads trazia um `Selo`
 * escrito à mão que refazia pill, altura, raio e tint que o `Badge` já fazia —
 * com o agravante de que ele nunca herdaria um ajuste feito no componente
 * comum. O que fica aqui é só a TRADUÇÃO de "de quem é a bola" para a variante
 * do `Badge`, num lugar só: as duas telas não podem chegar a respostas
 * diferentes para a mesma pergunta.
 */
export function Selo({ tom, children }: { tom: TomDeSelo; children: ReactNode }) {
  const variante =
    tom === "nossa" ? "high" : tom === "atencao" ? "medium" : tom === "ok" ? "active" : "low";
  return <Badge variant={variante} size="md">{children}</Badge>;
}

/** A grade do placar. Três colunas só a partir de `lg` — ver o comentário acima. */
export function Placar({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 lg:grid-cols-3 gap-2.5">{children}</div>;
}

/**
 * "Não consegui ler esta fila" — o cartão que separa vazio de desconhecido.
 *
 * `role="alert"` é exigência literal do §7.3 do `DESIGN.md`, e as duas telas de
 * 16/08 tinham **zero** ocorrências dele. Sem isso, quem usa leitor de tela
 * aperta "atualizar", nada é anunciado, e a conclusão razoável é que a fila
 * está vazia — que é exatamente a confusão que este cartão existe para impedir.
 */
export function CartaoDeErro({
  titulo, motivo, aoTentarDeNovo,
}: { titulo: string; motivo: string; aoTentarDeNovo: () => void }) {
  return (
    <div
      role="alert"
      className="mb-5 rounded-[12px] border border-[var(--danger)] bg-[var(--danger-bg)] px-4 sm:px-5 py-4"
    >
      <p className="text-[13px] font-semibold text-[var(--danger)]">{titulo}</p>
      <p className="text-[13px] text-[var(--text-secondary)] mt-1 leading-relaxed">{motivo}</p>
      <p className="text-[12px] text-[var(--text-muted)] mt-2 leading-relaxed">
        Isto <strong>não</strong> quer dizer que a fila está vazia. Quer dizer que ela não foi medida agora.
      </p>
      <div className="mt-3">
        <Button variant="secondary" size="lg" onClick={aoTentarDeNovo}>
          Tentar de novo
        </Button>
      </div>
    </div>
  );
}

/**
 * O esqueleto de carregando.
 *
 * `role="status"` + `aria-live="polite"` é o §7.1 do `DESIGN.md`. O texto dentro
 * é para leitor de tela: uma barra cinza pulsando não anuncia nada, e a pessoa
 * fica sem saber se a tela está trabalhando ou se acabou vazia.
 */
export function Carregando({ blocos = 3, etiqueta }: { blocos?: number; etiqueta: string }) {
  return (
    <div role="status" aria-live="polite" className="space-y-3 mb-5">
      <span className="sr-only">{etiqueta}</span>
      {Array.from({ length: blocos }, (_, i) => (
        <div
          key={i}
          aria-hidden="true"
          className="h-[104px] rounded-[12px] border border-[var(--border)] bg-[var(--bg)] animate-pulse"
        />
      ))}
    </div>
  );
}

/**
 * O rótulo de uma seção de fila.
 *
 * É `<h2>` porque as telas vizinhas usam `<h2>` para a mesma coisa, e as duas
 * telas novas de 16/08 não tinham **nenhum**: numa página com `<h1>` no
 * cabeçalho e `<h2>` nas quatro filas antigas, a fila mais cara de todas era a
 * única sem nível semântico — quem navega por títulos passava direto por ela.
 *
 * 12px, e não 11px: o piso da §3 do `DESIGN.md` é 12px.
 */
export function TituloDeFila({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-[12px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-1.5">
      {children}
    </h2>
  );
}
