"use client";

// Primitivos da referência Dioli — `Pill`, `Ring`, `Head`, `TabTitle` — portados
// com o MESMO DOM e as MESMAS classes de `app/page.tsx`. Não trocar por
// primitivo genérico do kit `@/components/ui`: esta superfície tem folha de
// estilo própria, e o kit do painel Foocci desenharia outra coisa.
//
// O que foi acrescentado — e só isto: os três estados obrigatórios da casa
// (carregando / vazio / erro) e o `Metric`, que desenha "—" quando não existe
// fonte de dado ligada, no MESMO slot e com a MESMA classe do número real.
// Guardrail 1: ausência de informação não é informação.

import Link from "next/link";
import type { Metric } from "@/lib/agency/clients/workspace/vista";

// ═══════════════════════════════════════════════════════════════════════════
//  `Acao` — O PRIMITIVO QUE TORNA O BOTÃO DECORATIVO IMPOSSÍVEL DE ESCREVER.
//
//  O contrato: "todos os botões devem funcionar, abrir uma interação real ou
//  aparecer desabilitados com motivo. Nenhum botão decorativo."
//
//  Escrever isso num comentário já falhou — o porte de 14/08 tinha dezenove
//  `<button type="button">` sem `onClick` ("Capacidade da equipe", "＋ Nova
//  peça", "Gerar análise"). Nenhum era feio; todos eram mentira, porque o
//  operador clica, nada acontece, e ele conclui que o sistema travou.
//
//  Aqui a regra virou TIPO: a união abaixo não tem um quarto membro. Ou existe
//  `onClick`, ou existe `href`, ou existe `indisponivel` — e nesse caso o botão
//  sai `disabled`, com o motivo no `title` E visível no `aria-describedby`.
//  Não há como compilar um `<Acao>` que não faz nada.
//
//  ⚠️ O guardrail 4 da casa é "prompt é aviso; código é trava". Este tipo é a
//  trava; `__tests__/agency/workspace-do-cliente/sem-botao-decorativo.test.ts`
//  é o segundo cinto, porque `<button>` cru continua existindo no JSX.
// ═══════════════════════════════════════════════════════════════════════════

type AcaoBase = {
  children: React.ReactNode;
  className?: string;
  /** Rótulo acessível quando o conteúdo é um glifo ("→"). */
  ariaLabel?: string;
};

export type AcaoProps =
  | (AcaoBase & { onClick: () => void; href?: never; indisponivel?: never })
  | (AcaoBase & { href: string; onClick?: never; indisponivel?: never })
  /** O terceiro caminho honesto: existe, está desligado, e diz por quê. */
  | (AcaoBase & { indisponivel: string; onClick?: never; href?: never });

export function Acao(props: AcaoProps) {
  const { children, className = "", ariaLabel } = props;

  if ("href" in props && props.href) {
    return (
      <Link className={className} href={props.href} aria-label={ariaLabel}>
        {children}
      </Link>
    );
  }

  if ("indisponivel" in props && props.indisponivel) {
    return (
      <button
        type="button"
        className={(className + " indisponivel").trim()}
        disabled
        title={props.indisponivel}
        aria-label={ariaLabel}
      >
        {children}
        {/* O motivo não fica só no `title`: tooltip não existe no celular e não
            é lido por leitor de tela em todo navegador. */}
        <em className="motivoIndisponivel">{props.indisponivel}</em>
      </button>
    );
  }

  return (
    <button type="button" className={className} onClick={props.onClick} aria-label={ariaLabel}>
      {children}
    </button>
  );
}

export function Pill({ children, t = "" }: { children: React.ReactNode; t?: string }) {
  return (
    <span className={"pill " + t}>
      <i />
      {children}
    </span>
  );
}

export function Ring({ n }: { n: number | null }) {
  const pct = n ?? 0;
  return (
    <div className="ring" style={{ "--p": `${pct * 3.6}deg` } as React.CSSProperties}>
      <div>
        <b>{n === null ? "—" : n}</b>
        <small>/100</small>
      </div>
    </div>
  );
}

/**
 * O cabeçalho azul-marinho padronizado de todo card (estrutura obrigatória do
 * contrato). O `action` é opcional — mas quando existe, ele é um `Acao`, e por
 * isso NÃO pode ser um rótulo sem destino. Era assim que o botão decorativo
 * entrava: `action="Ver analytics"` sem `onAction` desenhava o botão inteiro.
 */
export function Head({ over, title, action }: {
  over: string;
  title: string;
  action?: Omit<AcaoProps, "children"> & { rotulo: string };
}) {
  return (
    <div className="head">
      <div>
        <small>{over}</small>
        <h3>{title}</h3>
      </div>
      {action && (
        <Acao {...({ ...action, children: `${action.rotulo} →` } as AcaoProps)} />
      )}
    </div>
  );
}

export function TabTitle({ status, title, desc, children }: {
  status: string;
  title: string;
  desc: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="tabTitle">
      <div>
        <Pill>{status}</Pill>
        <h2>{title}</h2>
        <p>{desc}</p>
      </div>
      <div>{children}</div>
    </div>
  );
}

/** A faixa de KPIs. Cada célula é a mesma da referência; quando `value` é
 *  `null`, ela desenha o traço e a razão em vez de um número inventado. */
export function Kpis({ items, className = "" }: { items: Metric[]; className?: string }) {
  // A grade segue a QUANTIDADE de métricas, não um número fixo. A folha da
  // referência crava seis (ou cinco) colunas; com quatro métricas sobrava
  // caixa branca à direita, e caixa vazia numa faixa de números se lê como
  // "faltou carregar", não como "só existem quatro". Medido a 768 e 1280.
  return (
    <div className={"kpis " + className} style={{ "--kpiN": items.length } as React.CSSProperties}>
      {items.map((m) => (
        <div key={m.label}>
          <small>{m.label}</small>
          <b className={m.value === null ? "noData" : ""}>{m.value ?? "—"}</b>
          <span>{m.hint ?? "sem dado conectado"}</span>
        </div>
      ))}
    </div>
  );
}

/** Estado VAZIO — dentro de um card, sem quebrar a grade.
 *
 *  O estado vazio da casa não é só uma frase: é a frase MAIS o próximo passo.
 *  Por isso a ação aceita as duas formas — `onAction` quando o próximo passo
 *  está nesta tela, `href` quando ele está em outra. O que não existe é ação
 *  sem destino. */
export function EmptyBlock({ title, hint, action, onAction, href, acaoIndisponivel }: {
  title: string;
  hint: string;
  action?: string;
  onAction?: () => void;
  href?: string;
  /**
   * O PRÓXIMO PASSO QUE ESTE PAPEL NÃO PODE DAR.
   *
   * O contrato manda "estado vazio honesto, com explicação e PRÓXIMA AÇÃO
   * COMPATÍVEL COM A PERMISSÃO do usuário". Sem este campo só havia duas
   * saídas para quem não pode escrever: mostrar o botão e deixar quebrar no
   * 403, ou sumir com ele. Sumir é pior — ensina que a função não existe, e a
   * pessoa vai pedir por fora do sistema. Aqui o botão aparece desligado com o
   * nome de quem pode.
   */
  acaoIndisponivel?: string;
}) {
  return (
    <div className="emptyBlock">
      <i>◇</i>
      <b>{title}</b>
      <small>{hint}</small>
      {action && acaoIndisponivel && <Acao indisponivel={acaoIndisponivel}>{action}</Acao>}
      {action && !acaoIndisponivel && href && <Link href={href}>{action} →</Link>}
      {action && !acaoIndisponivel && !href && onAction && (
        <Acao onClick={onAction}>{action} →</Acao>
      )}
    </div>
  );
}

/** Estado de ERRO — carrega a própria evidência (guardrail 6). */
export function ErrorBlock({ detail, onRetry }: { detail: string; onRetry?: () => void }) {
  return (
    <div className="errorBlock" role="alert">
      <i>!</i>
      <span>
        <b>Não foi possível carregar</b>
        <small>{detail}</small>
      </span>
      {onRetry && <button type="button" onClick={onRetry}>Tentar de novo →</button>}
    </div>
  );
}

/** Estado CARREGANDO — esqueleto com a altura do conteúdo real, para a página
 *  não pular quando o dado chega. */
export function LoadingBlock({ rows = 3 }: { rows?: number }) {
  return (
    <div className="loadingBlock" aria-busy="true" aria-live="polite">
      <span className="srOnly">Carregando…</span>
      {Array.from({ length: rows }).map((_, i) => (
        <i key={i} />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  A navegação entre SUB-MÓDULOS de um Command Center.
//
//  Cada aba de departamento tem submódulos obrigatórios pelo contrato (Social
//  tem oito, Branding tem dez, Design tem sete, Tráfego tem sete). Eles são
//  estado local da aba — não entram na URL, porque o deep-link que o time cola
//  em ticket é o da ÁREA ("olha o Branding deste cliente"), não o do painel
//  interno de um submódulo.
// ═══════════════════════════════════════════════════════════════════════════

export function SubNav({
  itens,
  atual,
  onEscolher,
  className = "deptNav",
  contadores = {},
  children,
}: {
  itens: readonly string[];
  atual: string;
  onEscolher: (v: string) => void;
  className?: string;
  /** Selo numérico por item. Só desenha quando > 0. */
  contadores?: Record<string, number>;
  /** Ação à direita da trilha (ex.: "＋ Criar conteúdo"). */
  children?: React.ReactNode;
}) {
  return (
    <nav className={className} aria-label="Submódulos desta área">
      {itens.map((x) => (
        <button
          key={x}
          type="button"
          className={atual === x ? "active" : ""}
          aria-current={atual === x ? "true" : undefined}
          onClick={() => onEscolher(x)}
        >
          {x}
          {(contadores[x] ?? 0) > 0 && <em>{contadores[x]}</em>}
        </button>
      ))}
      {children}
    </nav>
  );
}

/**
 * O submódulo que EXISTE no contrato e ainda não tem fonte de dado nesta casa.
 *
 * ⚠️ Ele não é um "card genérico" no sentido que o contrato proíbe — o proibido
 * é a ABA virar card genérico. Aqui o que se declara é outra coisa, e mais
 * honesta: o submódulo está na lista obrigatória, a tela reconhece o nome dele,
 * e diz **exatamente qual tabela falta** para ele deixar de estar vazio. Some
 * com isto e o operador conclui que a agência não faz Listening; deixe um
 * número inventado e ele decide em cima de ficção.
 */
export function DepartmentModule({
  title,
  kind,
  oQueFalta,
  capacidades,
}: {
  title: string;
  kind: string;
  /** A frase que nomeia a fonte ausente. Obrigatória — sem ela isto vira o
   *  card genérico que o contrato proíbe. */
  oQueFalta: string;
  /** O que este submódulo controlaria. Vem do contrato, não de invenção. */
  capacidades?: readonly string[];
}) {
  return (
    <div className="departmentModule">
      <div>
        <Pill>{kind.toUpperCase()} OS</Pill>
        <h2>{title}</h2>
        <p>{oQueFalta}</p>
      </div>
      {capacidades && capacidades.length > 0 && (
        <section>
          {capacidades.map((label, i) => (
            <article className="card" key={label}>
              <i>{["▦", "✦", "↗", "✓", "◷", "◎"][i % 6]}</i>
              <span>
                <b>{label}</b>
                <small className="noData">sem fonte conectada</small>
              </span>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
