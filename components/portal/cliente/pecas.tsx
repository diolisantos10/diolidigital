"use client";

// As peças da referência aprovada (CLAUDE_HANDOFF_2, 14/08/2026), portadas sem
// redesenho: mesmas classes `cp-*`, mesma estrutura de marcação, mesma folha de
// estilo (`app/portal/portal-cliente.css`).
//
// O que foi ACRESCENTADO — e não trocado — são os três estados obrigatórios do
// DESIGN.md §6.1 (carregando · vazio · erro). A referência é uma demonstração
// com dados fixos: ela nunca precisou desenhar "você ainda não tem entrega".
// Um portal real precisa disso em toda aba, e o guardrail do papel é explícito:
// estado vazio no portal do cliente não é detalhe de UI — é o cliente achando
// que não recebeu nada.

import type { ReactNode } from "react";
import { carimbar, FUSO_DA_CASA } from "@/lib/carimbo-de-tempo";

export type Tom = "cyan" | "green" | "amber" | "muted";

export function Icone({ children }: { children: ReactNode }) {
  return <i className="cp-icon">{children}</i>;
}

export function Etiqueta({ children, tom = "cyan" }: { children: ReactNode; tom?: Tom }) {
  return <span className={`cp-tag ${tom}`}>{children}</span>;
}

export function TituloDeSecao({ sobretitulo, titulo, acao }: { sobretitulo: string; titulo: string; acao?: ReactNode }) {
  return (
    <header className="cp-section-head">
      <div><small>{sobretitulo}</small><h3>{titulo}</h3></div>
      {acao}
    </header>
  );
}

export function CapaDaAba({
  sobretitulo, titulo, descricao, simbolo, children,
}: {
  sobretitulo: string; titulo: string; descricao: string;
  /** O símbolo da marca DO CLIENTE — vem do cadastro, nunca uma letra fixa. */
  simbolo: string;
  children?: ReactNode;
}) {
  return (
    <section className="cp-page-hero">
      <div><Etiqueta>{sobretitulo}</Etiqueta><h2>{titulo}</h2><p>{descricao}</p></div>
      <div className="cp-hero-actions">{children}</div>
      <div className="cp-orbit"><i /><i /><b>{simbolo}</b></div>
    </section>
  );
}

/**
 * Os números do topo. Recebe já formatado — formatar aqui esconderia de quem
 * chama a diferença entre "medimos zero" e "não medimos", que é a diferença
 * que o handoff chama de o pior erro possível (regra 9: número inventado).
 *
 * Lista vazia não renderiza moldura: título sem conteúdo é buraco.
 */
export function Numeros({ itens }: { itens: { rotulo: string; valor: string; nota: string }[] }) {
  if (itens.length === 0) return null;
  return (
    <div className="cp-kpis">
      {itens.map((x) => (
        <div key={x.rotulo}><small>{x.rotulo}</small><b>{x.valor}</b><span>{x.nota}</span></div>
      ))}
    </div>
  );
}

/** O estado VAZIO — honesto, com a saída na mão. Nunca um card em branco. */
export function Vazio({
  icone = "○", titulo, texto, acao,
}: {
  icone?: string; titulo: string; texto: string;
  acao?: { rotulo: string; aoClicar: () => void };
}) {
  return (
    <div className="cp-vazio">
      <i aria-hidden>{icone}</i>
      <b>{titulo}</b>
      <p>{texto}</p>
      {acao && <button onClick={acao.aoClicar} style={{ touchAction: "manipulation" }}>{acao.rotulo}</button>}
    </div>
  );
}

export function Carregando({ texto = "Abrindo seu portal…" }: { texto?: string }) {
  return (
    <div className="cp-carregando" role="status">
      <i aria-hidden />
      <span>{texto}</span>
    </div>
  );
}

export function Erro({ titulo, texto, aoTentarDeNovo }: { titulo: string; texto: string; aoTentarDeNovo?: () => void }) {
  return (
    <div className="cp-erro" role="alert">
      <b>{titulo}</b>
      <p>{texto}</p>
      {aoTentarDeNovo && (
        <button onClick={aoTentarDeNovo} style={{ touchAction: "manipulation" }}>Tentar de novo</button>
      )}
    </div>
  );
}

/**
 * dd/mm a partir de um ISO. Sem data, sem frase — nunca "Invalid Date".
 *
 * ⚠️ **Isto NÃO é um carimbo.** Serve para a AGENDA (a data em que uma peça vai
 * ao ar, dentro de um calendário que já diz o mês). Para dizer *quando algo
 * aconteceu* use `<Carimbo>` (`components/ui/carimbo.tsx`) — com hora, ano e
 * idade, como manda a regra de 15/08/2026. A formatação por baixo agora é a
 * mesma da casa, com fuso fixo: sem isso, o servidor da Railway (UTC) escrevia
 * um dia e o navegador do cliente escrevia outro.
 */
export function dataCurta(iso: string | null | undefined): string | null {
  return carimbar(iso)?.curto ?? null;
}

/** "agosto de 2026" — para datas de arquivo, onde o ano importa e o dia não. */
export function mesEAno(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("pt-BR", { timeZone: FUSO_DA_CASA, month: "long", year: "numeric" });
}

/**
 * As etapas do projeto, DERIVADAS da etapa legível que o servidor já calcula a
 * partir dos carimbos (`presentedAt`, `clientApprovedAt`). Nunca de um campo de
 * status escrito à mão — status digitado mente, e a barra de progresso seria a
 * primeira a repetir a mentira.
 *
 * Mora aqui, e não na aba, porque a Visão Geral desenha a MESMA barra no resumo
 * de projetos: duas contas separadas para o mesmo projeto dariam dois números
 * diferentes na mesma tela.
 */
export function passosDoProjeto(etapa: string): { passos: [string, string][]; progresso: number } {
  const e = etapa.toLowerCase();
  if (e.includes("aprovado por você")) {
    return { passos: [["Produção", "done"], ["Aprovação", "done"], ["No ar", "active"]], progresso: 100 };
  }
  if (e.includes("esperando a sua aprovação") || e.includes("esperando sua aprovação")) {
    return { passos: [["Produção", "done"], ["Aprovação", "active"], ["No ar", ""]], progresso: 66 };
  }
  return { passos: [["Produção", "active"], ["Aprovação", ""], ["No ar", ""]], progresso: 33 };
}

export function emReais(valor: number | null | undefined): string | null {
  if (valor == null || !Number.isFinite(valor)) return null;
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
