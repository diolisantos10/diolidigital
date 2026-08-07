"use client";

// A SALA DOS AGENTES — a tela.
//
// Doutrina 20 do `dioli-brain-kit`. A pergunta do CEO, nas palavras dele:
// *"quais os agentes cada projeto tem, quem está sendo usado, quem não está."*
//
// ─── A REGRA QUE NÃO PODE SER QUEBRADA AQUI ──────────────────────────────────
//
// O cartão NUNCA escreve zero quando a resposta é "não sei". Os três casos de
// `Medida` são desenhados diferentes, sempre:
//
//   medido      → o valor, em numeral tabular
//   zeroMedido  → um traço, com `title` explicando que zero é a medida
//   naoMedido   → itálico, cor secundária, com o motivo no `title`
//
// Um painel que confunde "não medido" com "trabalhou zero" ensina o dono a não
// confiar nele — e a partir daí a tela existe e não serve. Três telas desta casa
// mentiram assim nesta semana, e nenhuma delas era feia.

import { useState } from "react";
import type {
  CartaoDeAgente,
  CartaoDeProvedor,
  Medida,
  SalaDosAgentes as Dados,
} from "@/lib/agency/sala-dos-agentes/tipos";

// ─── A MEDIDA, na tela ───────────────────────────────────────────────────────

function Numero({ m, sufixo }: { m: Medida; sufixo?: string }) {
  if (m.estado === "medido") {
    return (
      <span className="text-[14px] font-semibold text-[var(--text-primary)] tabular-nums">
        {m.valor.toLocaleString("pt-BR")}
        {sufixo ? <span className="text-[12px] font-normal text-[var(--text-muted)]"> {sufixo}</span> : null}
      </span>
    );
  }
  if (m.estado === "zeroMedido") {
    return (
      <span
        className="text-[14px] font-semibold text-[var(--text-muted)] tabular-nums"
        title="Medido, e o valor é zero. Este agente não trabalhou na janela."
      >
        —
      </span>
    );
  }
  return (
    <span
      className="text-[12px] italic text-[var(--text-subtle)] cursor-help underline decoration-dotted underline-offset-2"
      title={m.porque}
    >
      não medido
    </span>
  );
}

function Linha({ rotulo, m, sufixo }: { rotulo: string; m: Medida; sufixo?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[12px] text-[var(--text-muted)]">{rotulo}</span>
      <Numero m={m} sufixo={sufixo} />
    </div>
  );
}

// ─── Estado do agente — cor NUNCA é o único sinal (DESIGN.md §7) ─────────────

const ESTADO: Record<CartaoDeAgente["estado"], { cor: string; texto: string; dica: string }> = {
  trabalhando: {
    cor: "bg-[var(--success)]",
    texto: "Trabalhando",
    dica: "Há trabalho registrado para este agente.",
  },
  atencao: {
    cor: "bg-[var(--warning)]",
    texto: "Atenção",
    dica: "Há sinal de problema no trabalho deste agente.",
  },
  desligado: {
    cor: "bg-[var(--border-strong)]",
    texto: "Sem uso",
    dica: "Medido: nenhum trabalho registrado na janela de 30 dias.",
  },
  nao_medido: {
    cor: "bg-[var(--border-strong)] ring-1 ring-dashed ring-[var(--text-subtle)]",
    texto: "Não medido",
    dica: "Não existe instrumentação para dizer se este agente trabalhou. Não é o mesmo que 'não trabalhou'.",
  },
};

function CartaoAgente({ a, onAbrir }: { a: CartaoDeAgente; onAbrir: () => void }) {
  const e = ESTADO[a.estado];
  return (
    <button
      type="button"
      onClick={onAbrir}
      className="text-left w-full bg-[var(--card)] rounded-[12px] border border-[var(--border)] px-4 py-4 shadow-[var(--shadow-sm)] hover:border-[var(--border-strong)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--teal)]"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full shrink-0 ${e.cor}`} aria-hidden />
            <span className="text-[14px] font-semibold text-[var(--text-primary)] truncate">{a.nome}</span>
          </div>
          <div className="font-mono text-[11px] text-[var(--text-subtle)] mt-0.5 truncate">{a.slug}</div>
        </div>
        <span className="text-[10px] font-medium text-[var(--text-muted)] whitespace-nowrap mt-0.5" title={e.dica}>
          {e.texto}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-2.5">
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-[6px] bg-[var(--accent)] text-[var(--text-secondary)]">
          {a.area}
        </span>
        {a.vinculo === "essencial" && (
          <span
            className="text-[10px] font-medium px-1.5 py-0.5 rounded-[6px] bg-[var(--accent-light)] text-[var(--teal-text)]"
            title="Essencial: vem com todo projeto e não pode ser apagado."
          >
            Essencial
          </span>
        )}
        {a.somenteLeitura && (
          <span
            className="text-[10px] font-medium px-1.5 py-0.5 rounded-[6px] bg-[var(--info-bg)] text-[var(--info)]"
            title="Sem ferramenta de escrita, por construção. Quem duvida do trabalho não é quem o conserta."
          >
            Só leitura
          </span>
        )}
      </div>

      <p className="text-[12px] leading-[1.45] text-[var(--text-secondary)] mb-3">{a.funcao}</p>

      <div className="space-y-1 pt-2.5 border-t border-[var(--border)]">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[12px] text-[var(--text-muted)]">No ar desde</span>
          {a.noArDesde ? (
            <span className="text-[12px] text-[var(--text-primary)] tabular-nums">
              {new Date(a.noArDesde).toLocaleDateString("pt-BR")}
            </span>
          ) : (
            <span
              className="text-[12px] italic text-[var(--text-subtle)] cursor-help"
              title="A data de entrada deste agente no projeto não está registrada."
            >
              não registrado
            </span>
          )}
        </div>
        {a.populacao === "constroi_o_produto" ? (
          <Linha rotulo="Blocos entregues" m={a.blocos} />
        ) : (
          <>
            <Linha rotulo="Chamadas (30 d)" m={a.chamadas} />
            <Linha rotulo="Custo estimado" m={a.custoUsd} sufixo="USD" />
          </>
        )}
      </div>
    </button>
  );
}

// ─── A ficha completa ────────────────────────────────────────────────────────

function Ficha({ a, onFechar }: { a: CartaoDeAgente; onFechar: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onClick={onFechar}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Ficha de ${a.nome}`}
        className="bg-[var(--card)] w-full sm:max-w-lg rounded-t-[14px] sm:rounded-[14px] shadow-[var(--shadow-xl)] max-h-[88vh] overflow-y-auto"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-[var(--border)] flex items-start justify-between gap-3 sticky top-0 bg-[var(--card)]">
          <div className="min-w-0">
            <h2 className="text-[16px] font-semibold text-[var(--text-primary)]">{a.nome}</h2>
            <div className="font-mono text-[11px] text-[var(--text-subtle)]">{a.slug}</div>
          </div>
          <button
            type="button"
            onClick={onFechar}
            className="text-[13px] text-[var(--text-muted)] hover:text-[var(--text-primary)] px-2 py-1 rounded-[6px] shrink-0"
          >
            Fechar
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <p className="text-[13px] leading-[1.5] text-[var(--text-secondary)]">{a.funcao}</p>

          <div className="space-y-1.5">
            <Linha rotulo="Blocos entregues" m={a.blocos} />
            <Linha rotulo="Chamadas de IA (30 d)" m={a.chamadas} />
            <Linha rotulo="Tokens (30 d)" m={a.tokens} />
            <Linha rotulo="Custo estimado (30 d)" m={a.custoUsd} sufixo="USD" />
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[12px] text-[var(--text-muted)]">Último trabalho</span>
              {a.ultimoTrabalho ? (
                <span className="text-[12px] text-[var(--text-primary)] tabular-nums">
                  {new Date(a.ultimoTrabalho).toLocaleString("pt-BR")}
                </span>
              ) : (
                <span className="text-[12px] italic text-[var(--text-subtle)]">nunca registrado</span>
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-[var(--border)] space-y-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[12px] text-[var(--text-muted)]">Perfil</span>
              <span className="font-mono text-[11px] text-[var(--text-secondary)] text-right break-all">{a.perfil}</span>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[12px] text-[var(--text-muted)]">Pode escrever?</span>
              <span className="text-[12px] text-[var(--text-primary)]">
                {a.somenteLeitura ? "Não — só leitura, por construção" : "Sim"}
              </span>
            </div>
            {a.vinculo === "essencial" && (
              <p className="text-[12px] leading-[1.5] text-[var(--text-secondary)] bg-[var(--accent-light)] rounded-[8px] px-3 py-2 mt-2">
                <strong className="text-[var(--teal-text)]">Essencial.</strong> Vem com todo projeto da casa e não
                pode ser apagado. A constituição dele é única e mora no Dioli Brain Kit —
                <span className="font-mono text-[11px]"> docs/23-constituicao-dos-essenciais.md</span>.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Aba de provedores ───────────────────────────────────────────────────────

function CartaoProvedor({ p }: { p: CartaoDeProvedor }) {
  return (
    <div className="bg-[var(--card)] rounded-[12px] border border-[var(--border)] px-4 py-4 shadow-[var(--shadow-sm)]">
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-[14px] font-semibold text-[var(--text-primary)]">{p.nome}</span>
        {p.ligado === null ? (
          <span
            className="text-[10px] italic text-[var(--text-subtle)] cursor-help whitespace-nowrap"
            title="Não conseguimos verificar se está ligada. Não é o mesmo que desligada."
          >
            não verificado
          </span>
        ) : (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-[6px] bg-[var(--success-bg)] text-[var(--success)] whitespace-nowrap">
            Em uso
          </span>
        )}
      </div>
      <p className="text-[12px] text-[var(--text-secondary)] mb-3">{p.paraQue}</p>
      <div className="space-y-1 pt-2.5 border-t border-[var(--border)]">
        <Linha rotulo="Chamadas (30 d)" m={p.chamadas30d} />
        <Linha rotulo="Custo estimado (30 d)" m={p.custo30dUsd} sufixo="USD" />
      </div>
      {p.modelosSemPreco.length > 0 && (
        <p className="mt-2.5 text-[11px] leading-[1.45] text-[var(--warning)] bg-[var(--warning-bg)] rounded-[6px] px-2.5 py-2">
          Modelo fora da tabela de preço: <span className="font-mono">{p.modelosSemPreco.join(", ")}</span>. O custo
          acima não os inclui — ele está subestimado, e por isso não é apresentado como total.
        </p>
      )}
      {p.usadoPor.length > 0 && (
        <div className="mt-2.5">
          <div className="text-[11px] text-[var(--text-muted)] mb-1">Quem usa</div>
          <div className="flex flex-wrap gap-1">
            {p.usadoPor.map((u) => (
              <span key={u} className="font-mono text-[10px] px-1.5 py-0.5 rounded-[6px] bg-[var(--accent)] text-[var(--text-secondary)]">
                {u}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── A sala ──────────────────────────────────────────────────────────────────

function Secao({
  titulo,
  explicacao,
  agentes,
  onAbrir,
}: {
  titulo: string;
  explicacao: string;
  agentes: CartaoDeAgente[];
  onAbrir: (a: CartaoDeAgente) => void;
}) {
  if (agentes.length === 0) return null;
  return (
    <section className="mb-8">
      <h2 className="text-[12px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">
        {titulo} <span className="tabular-nums font-normal">({agentes.length})</span>
      </h2>
      <p className="text-[12px] text-[var(--text-subtle)] mt-0.5 mb-3 max-w-[60ch]">{explicacao}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {agentes.map((a) => (
          <CartaoAgente key={`${a.populacao}-${a.slug}`} a={a} onAbrir={() => onAbrir(a)} />
        ))}
      </div>
    </section>
  );
}

// ─── "+ Novo agente" ─────────────────────────────────────────────────────────
//
// Ele NÃO abre um formulário, e isso é decisão declarada: agente desta casa
// nasce como PERFIL versionado em `.claude/agents/`, revisado por diff — não
// como linha de banco criada por um clique. Um formulário aqui criaria agentes
// que o código não conhece.
//
// E ele não podia ser um botão morto: botão que promete o que não faz é o
// defeito que esta casa pagou caro nesta semana. Então ele explica o caminho.

function ComoNasceUmAgente({ onFechar }: { onFechar: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onFechar} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Como nasce um agente"
        className="bg-[var(--card)] w-full sm:max-w-lg rounded-t-[14px] sm:rounded-[14px] shadow-[var(--shadow-xl)] max-h-[88vh] overflow-y-auto"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-[var(--border)] flex items-start justify-between gap-3">
          <h2 className="text-[16px] font-semibold text-[var(--text-primary)]">Como nasce um agente</h2>
          <button type="button" onClick={onFechar} className="text-[13px] text-[var(--text-muted)] hover:text-[var(--text-primary)] px-2 py-1 rounded-[6px] shrink-0">
            Fechar
          </button>
        </div>
        <div className="px-5 py-4 space-y-3 text-[13px] leading-[1.55] text-[var(--text-secondary)]">
          <p>
            Agente não se cria por formulário nesta casa. Ele nasce como <strong>perfil versionado</strong>, revisado
            por diff como qualquer outra regra — um formulário criaria agentes que o código não conhece.
          </p>
          <ol className="space-y-2 list-decimal pl-4">
            <li>
              O perfil vira um arquivo em <span className="font-mono text-[11px]">.claude/agents/&lt;slug&gt;.md</span>,
              com a pergunta que ele responde e as ferramentas que ele pode usar. Quem só audita não recebe ferramenta de
              escrita — isso é trava, não promessa.
            </li>
            <li>
              A memória dele vira <span className="font-mono text-[11px]">docs/agents/&lt;slug&gt;/</span>, com vitrine
              (curada) e oficina (o caderno dele).
            </li>
            <li>
              Se for um dos cinco <strong>Essenciais</strong>, ele aponta para a constituição única no Dioli Brain Kit.
              Regra não se copia, se aponta.
            </li>
          </ol>
          <p className="text-[12px] text-[var(--text-muted)] pt-1">
            Peça ao Diretor. É ele quem decide qual papel falta — e o elenco desta sala é a régua do que já existe.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SalaDosAgentes({ dados }: { dados: Dados }) {
  const [aba, setAba] = useState<"agentes" | "configuracoes">("agentes");
  const [aberto, setAberto] = useState<CartaoDeAgente | null>(null);
  const [comoNasce, setComoNasce] = useState(false);

  const constroem = dados.agentes.filter((a) => a.populacao === "constroi_o_produto");
  const falam = dados.agentes.filter((a) => a.populacao === "fala_com_cliente");
  const semUso = falam.filter((a) => a.estado === "desligado").length;
  const naoMedidos = dados.agentes.filter((a) => a.estado === "nao_medido").length;

  return (
    <div>
      {/* Abas — duas perguntas de dono diferentes, por ordem do CEO */}
      <div className="flex gap-1 border-b border-[var(--border)] mb-5 -mt-1 overflow-x-auto">
        {(
          [
            ["agentes", "Agentes"],
            ["configuracoes", "Configurações"],
          ] as const
        ).map(([id, rotulo]) => (
          <button
            key={id}
            type="button"
            onClick={() => setAba(id)}
            className={`px-3 py-2 text-[13px] font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
              aba === id
                ? "border-[var(--teal)] text-[var(--text-primary)]"
                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {aba === "agentes" ? (
        <>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-6 text-[12px]">
            <span className="text-[var(--text-secondary)]">
              <strong className="text-[var(--text-primary)] tabular-nums">{dados.agentes.length}</strong> no elenco
            </span>
            <span className="text-[var(--text-secondary)]">
              <strong className="text-[var(--text-primary)] tabular-nums">
                {dados.agentes.filter((a) => a.vinculo === "essencial").length} de 5
              </strong>{" "}
              Essenciais
            </span>
            <span className="text-[var(--text-secondary)]">
              <strong className="text-[var(--text-primary)] tabular-nums">{semUso}</strong> sem uso em 30 dias
            </span>
            <span className="text-[var(--text-subtle)] italic">{naoMedidos} não medidos</span>
            <button
              type="button"
              onClick={() => setComoNasce(true)}
              className="ml-auto text-[12px] font-medium px-2.5 py-1.5 rounded-[7px] border border-[var(--border)] bg-[var(--card)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] transition-colors"
            >
              + Novo agente
            </button>
          </div>

          {dados.agentes.length === 0 ? (
            <div className="bg-[var(--card)] rounded-[12px] border border-[var(--border)] px-6 py-10 text-center">
              <p className="text-[14px] font-semibold text-[var(--text-primary)] mb-1">Nenhum agente no elenco</p>
              <p className="text-[13px] text-[var(--text-secondary)] max-w-[46ch] mx-auto">
                Esta sala mostra quem trabalha neste projeto e quem não está sendo usado. Nenhum agente foi encontrado
                — isso não deveria acontecer, porque os cinco Essenciais vêm com todo projeto. Avise o Diretor.
              </p>
            </div>
          ) : (
            <>
              <Secao
                titulo="Constroem o produto"
                explicacao="Os especialistas despachados nas sessões de trabalho. A medida deles é bloco entregue e registrado na oficina — não token, porque eles não rodam no produto."
                agentes={constroem}
                onAbrir={setAberto}
              />
              <Secao
                titulo="Falam com o cliente"
                explicacao="Rodam em produção e consomem IA paga. A medida deles é a conta que chega: chamada, token e custo estimado."
                agentes={falam}
                onAbrir={setAberto}
              />
            </>
          )}

          {dados.lacunas.length > 0 && (
            <section className="mt-8 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-[12px] px-4 py-4">
              <h3 className="text-[12px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-2">
                O que esta sala não sabe
              </h3>
              <ul className="space-y-1.5">
                {dados.lacunas.map((l) => (
                  <li key={l} className="text-[12px] leading-[1.5] text-[var(--text-secondary)] flex gap-2">
                    <span className="text-[var(--text-subtle)] shrink-0">•</span>
                    <span>{l}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      ) : (
        <>
          {dados.provedores.length === 0 ? (
            <div className="bg-[var(--card)] rounded-[12px] border border-[var(--border)] px-6 py-10 text-center">
              <p className="text-[14px] font-semibold text-[var(--text-primary)] mb-1">
                Nenhuma chamada de IA nos últimos 30 dias
              </p>
              <p className="text-[13px] text-[var(--text-secondary)] max-w-[48ch] mx-auto">
                Esta aba lista as IAs contratadas, quanto custaram e quem as usa. Ela é montada a partir das chamadas
                registradas — sem chamada, não há o que listar. Se a agência deveria estar produzindo, o problema é a
                fila vazia, não esta tela.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {dados.provedores.map((p) => (
                <CartaoProvedor key={p.id} p={p} />
              ))}
            </div>
          )}
          <p className="mt-5 text-[12px] leading-[1.5] text-[var(--text-muted)] max-w-[70ch]">
            Todo valor em dólar é <strong>estimativa</strong>, calculada com a tabela de preço público dos provedores
            (versão <span className="font-mono">{dados.tabelaDePrecoVersao}</span>). Não é a fatura: a fatura tem
            desconto de contrato, crédito, cache de prompt e arredondamento que nenhum código nosso enxerga.
          </p>
        </>
      )}

      {aberto && <Ficha a={aberto} onFechar={() => setAberto(null)} />}
      {comoNasce && <ComoNasceUmAgente onFechar={() => setComoNasce(false)} />}
    </div>
  );
}
