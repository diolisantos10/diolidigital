"use client";

// /agency/financeiro — O DEPARTAMENTO FINANCEIRO DA AGÊNCIA.
//
// ── POR QUE ESTA TELA EXISTE (decisão do CEO, 07/08/2026) ───────────────────
//
//   "Você precisa ter um departamento de finanças […] que vai ter que ter o
//    DRE, vai ter que ter toda uma estrutura de finanças de uma empresa, lá no
//    admin. Por quê? Em tese todos os projetos são de autoria da Dioli Digital.
//    Então todos os custos de todos os projetos, e também o faturamento, tudo,
//    eu vou colocar dentro do financeiro da agência. […] quem mede tudo em
//    relação a dinheiro vai ser o departamento de finanças — inclusive quem vai
//    medir quanto cada IA gasta."
//
// ── AS DUAS PERGUNTAS, AO MESMO TEMPO ───────────────────────────────────────
//
// "Como está a agência?" (o DRE, em cima) e "este projeto se paga?" (a lista
// por centro de custo, logo abaixo — e ordenada do PIOR para o melhor). As duas
// juntas de propósito: um projeto que consome mais IA do que fatura tem que
// aparecer, não sumir na média. Por isso o consolidado nunca aparece sozinho.
//
// ── A REGRA QUE MANDA NESTA TELA ────────────────────────────────────────────
//
// **Nunca escrever zero quando a resposta é "não sei".** Todo valor chega do
// servidor como `Dinheiro`, com três estados — `medido`, `nao_medido`,
// `nao_lancado` — e cada um tem palavra própria na tela. Toda linha carrega
// PROCEDÊNCIA (de onde veio o número). Estimado aparece em linha separada do
// realizado, com rótulo. É o que separa um DRE de uma decoração cara.
//
// ── CELULAR PRIMEIRO ────────────────────────────────────────────────────────
// A lista por projeto e a de lançamentos viram CARTÕES abaixo de `lg` e tabela
// de `lg` para cima — DESIGN.md §6.3. Tabela de 6 colunas a 375px não é
// apertada, é cortada.

import { useCallback, useEffect, useState } from "react";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import Button from "@/components/agency/ui/Button";

// ─── O contrato com o servidor (espelha lib/agency/financeiro/dre.ts) ────────

type Dinheiro =
  | { estado: "medido"; centavos: number; moeda: "BRL" | "USD"; origem: string }
  | { estado: "nao_medido"; motivo: string }
  | { estado: "nao_lancado"; motivo: string };

interface LinhaDoDre { id: string; label: string; valor: Dinheiro; procedencia: string }
interface LinhaDeCusto { id: string; label: string; valor: Dinheiro; chamadas: number; chamadasSemPreco: number }
interface LinhaDeProjeto {
  id: string; label: string;
  receita: Dinheiro; custo: Dinheiro; custoDeIaUsd: Dinheiro;
  chamadasDeIa: number; resultado: Dinheiro;
  /** Presente = parceria com isenção viva. Ausente = NÃO é parceria. */
  parceria?: { autorizadaPor: string; validaAte: string; escopo: string };
}

/** O selo da parceria — ordem do CEO (D-0B9): *"tudo tem que ser medido,
 *  inclusive as parcerias"*. Sem ele, R$ 0,00 na coluna "Faturou" lê-se como
 *  calote ou descuido. Com ele, lê-se como o que é: investimento autorizado,
 *  com dono e prazo, e a margem negativa ao lado é o preço declarado dele. */
function SeloDeParceria({ p }: { p: NonNullable<LinhaDeProjeto["parceria"]> }) {
  const ate = new Date(p.validaAte);
  const legivel = Number.isNaN(ate.getTime()) ? p.validaAte : ate.toLocaleDateString("pt-BR");
  return (
    <span
      className="ml-2 inline-flex items-center h-[18px] px-1.5 rounded-[4px] bg-[var(--accent-light)] text-[var(--navy)] text-[10px] font-semibold align-middle"
      title={`Parceria autorizada por ${p.autorizadaPor} — vale até ${legivel}. Escopo: ${p.escopo}`}
    >
      parceria · até {legivel}
    </span>
  );
}
interface Resposta {
  referencia: string;
  dre: {
    receita: LinhaDoDre; receitaEstimada: LinhaDoDre; custoDireto: LinhaDoDre;
    despesa: LinhaDoDre; resultado: LinhaDoDre;
    custoDeIa: {
      total: Dinheiro; chamadas: number; chamadasSemPreco: number; chamadasSemDono: number;
      periodoParcial: boolean;
      porAgente: LinhaDeCusto[]; porCliente: LinhaDeCusto[]; porDepartamento: LinhaDeCusto[];
    };
    ressalvas: string[];
  };
  projetos: LinhaDeProjeto[];
  lancamentos: Array<{
    id: string; tipo: string; categoria: string; descricao: string; valorCentavos: number;
    moeda: string; origem: string; natureza: string; competencia: string;
    cliente: string | null; centroDeCusto: string | null; criadoPor: string | null;
  }> | null;
}

// ─── Apresentação do Dinheiro ────────────────────────────────────────────────

/** A palavra na tela. "não medido" e "nada lançado" NUNCA viram "R$ 0,00". */
function valorEmTexto(d: Dinheiro): string {
  if (d.estado === "nao_medido") return "não medido";
  if (d.estado === "nao_lancado") return "nada lançado";
  const v = (Math.abs(d.centavos) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sinal = d.centavos < 0 ? "−" : "";
  return d.moeda === "USD" ? `${sinal}US$ ${v}` : `${sinal}R$ ${v}`;
}

const ROTULO_DA_ORIGEM: Record<string, string> = {
  registro_de_ia: "registro de chamada de IA",
  manual: "lançamento manual",
  contrato: "contrato",
  extrato: "extrato bancário",
  importado: "rotina automática",
  derivado: "calculado a partir das linhas acima",
};

/** Cor + palavra. Cor nunca é o único sinal (DESIGN.md §2.4). */
function Valor({ d, tamanho = "md" }: { d: Dinheiro; tamanho?: "md" | "lg" }) {
  const naoSabe = d.estado !== "medido";
  const negativo = d.estado === "medido" && d.centavos < 0;
  const cor = naoSabe
    ? "text-[var(--text-muted)]"
    : negativo ? "text-[var(--danger)]" : "text-[var(--text-primary)]";
  const classe = tamanho === "lg" ? "text-[22px] font-semibold tracking-[-0.02em]" : "text-[14px] font-medium";
  return (
    <span className={`${classe} ${cor} tabular-nums`} title={d.estado !== "medido" ? d.motivo : ROTULO_DA_ORIGEM[d.origem] ?? d.origem}>
      {valorEmTexto(d)}
    </span>
  );
}

function Cartao({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-[10px] border border-[var(--border)] bg-[var(--bg-elevated)] shadow-[var(--shadow-sm)] ${className}`}>
      {children}
    </div>
  );
}

function TituloDeSecao({ children, apoio }: { children: React.ReactNode; apoio?: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-[15px] font-semibold text-[var(--text-primary)] tracking-[-0.01em]">{children}</h2>
      {apoio && <p className="text-[12px] text-[var(--text-muted)] mt-0.5 leading-relaxed">{apoio}</p>}
    </div>
  );
}

// ─── A tela ──────────────────────────────────────────────────────────────────

function referenciaDeHoje(): string {
  const h = new Date();
  return `${h.getUTCFullYear()}-${String(h.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default function FinanceiroPage() {
  const [ref, setRef] = useState(referenciaDeHoje());
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async (referencia: string) => {
    setCarregando(true);
    setErro(null);
    try {
      const r = await fetch(`/api/financeiro?ref=${referencia}`, { cache: "no-store" });
      if (!r.ok) {
        // Falha de leitura NÃO pode virar uma tela de zeros. Ela vira erro
        // nomeado — a lição dos três `.catch(() => null)` de 07/08.
        setDados(null);
        setErro(r.status === 403 ? "Este painel é do Master e do PM." : `Não consegui ler o financeiro (HTTP ${r.status}). Os números NÃO são zero — eles são desconhecidos agora.`);
        return;
      }
      setDados((await r.json()) as Resposta);
    } catch {
      setDados(null);
      setErro("Não consegui falar com o servidor. Nada aqui foi medido nesta tentativa.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { void carregar(ref); }, [ref, carregar]);

  const dre = dados?.dre;

  return (
    <div className="pt-6 md:pt-0">
      <AgencyHeader
        eyebrow="Departamento Financeiro"
        title="DRE da agência"
        subtitle="Todos os projetos são de autoria da Dioli Digital — faturamento e custo de todos eles sobem para cá."
      />

      {/* O seletor de mês fica em BARRA PRÓPRIA, não no `actions` do cabeçalho.
          Medido a 375px: o `actions` é `shrink-0`, então ele espremia o título
          em uma coluna de ~90px e "DRE da agência" quebrava em quatro linhas.
          Controle que não cabe ao lado do título desce — DESIGN.md §6.0. */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <label className="text-[12px] text-[var(--text-muted)]" htmlFor="competencia">Mês</label>
        <input
          id="competencia"
          type="month"
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          className="h-9 min-w-0 flex-1 sm:flex-none rounded-[8px] border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 text-[13px] text-[var(--text-primary)]"
        />
        <Button variant="secondary" onClick={() => void carregar(ref)}>Atualizar</Button>
      </div>

      {erro && (
        <div role="alert" className="mb-5 rounded-[10px] border border-[var(--danger)] bg-[var(--danger-bg)] p-3.5">
          <p className="text-[13px] font-medium text-[var(--danger)]">{erro}</p>
        </div>
      )}

      {carregando && !dados && (
        <p className="text-[13px] text-[var(--text-muted)]">Lendo o livro de lançamentos e o registro de chamadas de IA…</p>
      )}

      {dre && (
        <div className="space-y-7">
          {/* ── AS RESSALVAS VÊM PRIMEIRO ─────────────────────────────────────
              Antes do número, e não depois. Ressalva de dinheiro embaixo da
              tabela é ressalva que ninguém lê. */}
          {dre.ressalvas.length > 0 && (
            <section aria-label="O que esta tela não sabe">
              <ul className="rounded-[10px] border border-[var(--warning)] bg-[var(--warning-bg)] p-3.5 space-y-2">
                {dre.ressalvas.map((r, i) => (
                  <li key={i} className="text-[12.5px] leading-relaxed text-[var(--warning)] flex gap-2">
                    <span aria-hidden className="shrink-0 font-bold">!</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ── O DRE ───────────────────────────────────────────────────────── */}
          <section>
            <TituloDeSecao apoio="Regime de competência. Cada linha diz de onde veio o número.">
              Resultado do mês — {dados?.referencia}
            </TituloDeSecao>
            <Cartao>
              <ul className="divide-y divide-[var(--border)]">
                {[dre.receita, dre.custoDireto, dre.despesa].map((l) => (
                  <li key={l.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-medium text-[var(--text-primary)]">{l.label}</p>
                      <p className="text-[11.5px] text-[var(--text-muted)] leading-relaxed">{l.procedencia}</p>
                    </div>
                    <Valor d={l.valor} />
                  </li>
                ))}
                <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 bg-[var(--accent)] px-4 py-4">
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-[var(--text-primary)]">{dre.resultado.label}</p>
                    <p className="text-[11.5px] text-[var(--text-muted)] leading-relaxed">{dre.resultado.procedencia}</p>
                  </div>
                  <Valor d={dre.resultado.valor} tamanho="lg" />
                </li>
                <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-medium text-[var(--text-muted)]">{dre.receitaEstimada.label}</p>
                    <p className="text-[11.5px] text-[var(--text-muted)] leading-relaxed">{dre.receitaEstimada.procedencia}</p>
                  </div>
                  <Valor d={dre.receitaEstimada.valor} />
                </li>
              </ul>
            </Cartao>
          </section>

          {/* ── CUSTO DE IA POR AGENTE E POR CLIENTE ────────────────────────── */}
          <section>
            <TituloDeSecao apoio={`Medido no registro de cada chamada. ${dre.custoDeIa.chamadas} chamadas neste mês${dre.custoDeIa.chamadasSemPreco ? `, ${dre.custoDeIa.chamadasSemPreco} sem preço estimável` : ""}. Medição completa desde 07/08/2026 — o histórico anterior não foi recalculado.`}>
              Custo de IA — {valorEmTexto(dre.custoDeIa.total)}
            </TituloDeSecao>
            {/* Duas colunas só a partir de `lg`. A 768px a barra lateral volta a ocupar
                224px e sobram 544px — menos do que o celular tinha de sobra. Medido:
                em `md:grid-cols-2` o nome do agente truncava e "US$ 0,14" quebrava
                em duas linhas. Mesma aritmética da §6.3 do DESIGN.md. */}
            <div className="grid gap-4 lg:grid-cols-2 items-start">
              {([["Por agente", dre.custoDeIa.porAgente], ["Por cliente", dre.custoDeIa.porCliente]] as const).map(([titulo, linhas]) => (
                <Cartao key={titulo}>
                  <p className="px-4 pt-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{titulo}</p>
                  {linhas.length === 0 ? (
                    <p className="px-4 pb-4 text-[13px] text-[var(--text-muted)]">Nenhuma chamada de IA neste mês. Isto é zero de verdade, não falta de medição.</p>
                  ) : (
                    <ul className="divide-y divide-[var(--border)]">
                      {linhas.map((l) => (
                        <li key={l.id} className="flex items-baseline justify-between gap-3 px-4 py-2.5">
                          <div className="min-w-0">
                            <p className="text-[13px] text-[var(--text-primary)] truncate">{l.label}</p>
                            <p className="text-[11px] text-[var(--text-muted)]">
                              {l.chamadas} {l.chamadas === 1 ? "chamada" : "chamadas"}
                              {l.chamadasSemPreco > 0 && ` · ${l.chamadasSemPreco} sem preço`}
                            </p>
                          </div>
                          <Valor d={l.valor} />
                        </li>
                      ))}
                    </ul>
                  )}
                </Cartao>
              ))}
            </div>
          </section>

          {/* ── ESTE PROJETO SE PAGA? ───────────────────────────────────────── */}
          <section>
            <TituloDeSecao apoio="Ordenado do pior resultado para o melhor: quem dá prejuízo aparece primeiro, nunca no rodapé.">
              Por projeto
            </TituloDeSecao>
            {dados!.projetos.length === 0 ? (
              <Cartao>
                <p className="p-4 text-[13px] text-[var(--text-muted)]">
                  Nenhum lançamento e nenhuma chamada de IA com centro de custo neste mês.
                </p>
              </Cartao>
            ) : (
              <>
                {/* Celular e tablet: cartões (DESIGN.md §6.3) */}
                <ul className="space-y-2.5 lg:hidden">
                  {dados!.projetos.map((p) => (
                    <li key={p.id}>
                      <Cartao className="p-3.5">
                        <div className="flex items-baseline justify-between gap-3 mb-2">
                          <p className="text-[14px] font-medium text-[var(--text-primary)] truncate">
                            {p.label}{p.parceria ? <SeloDeParceria p={p.parceria} /> : null}
                          </p>
                          <Valor d={p.resultado} />
                        </div>
                        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                          {([["Faturou", p.receita], ["Custou", p.custo], ["IA (US$)", p.custoDeIaUsd]] as const).map(([k, v]) => (
                            <div key={k} className="min-w-0">
                              <dt className="text-[11px] text-[var(--text-muted)]">{k}</dt>
                              <dd><Valor d={v} /></dd>
                            </div>
                          ))}
                          <div>
                            <dt className="text-[11px] text-[var(--text-muted)]">Chamadas de IA</dt>
                            <dd className="text-[14px] font-medium text-[var(--text-primary)] tabular-nums">{p.chamadasDeIa}</dd>
                          </div>
                        </dl>
                      </Cartao>
                    </li>
                  ))}
                </ul>
                {/* Desktop: tabela, em container que rola (nunca overflow-hidden) */}
                <Cartao className="hidden lg:block overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left">
                    <thead>
                      <tr className="border-b border-[var(--border)]">
                        {["Projeto / cliente", "Faturou", "Custou", "Custo de IA (US$)", "Chamadas", "Resultado"].map((h, i) => (
                          <th key={h} className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] ${i > 0 ? "text-right" : ""}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {dados!.projetos.map((p) => (
                        <tr key={p.id}>
                          <td className="px-4 py-3 text-[13.5px] text-[var(--text-primary)]">
                            {p.label}{p.parceria ? <SeloDeParceria p={p.parceria} /> : null}
                          </td>
                          <td className="px-4 py-3 text-right"><Valor d={p.receita} /></td>
                          <td className="px-4 py-3 text-right"><Valor d={p.custo} /></td>
                          <td className="px-4 py-3 text-right"><Valor d={p.custoDeIaUsd} /></td>
                          <td className="px-4 py-3 text-right text-[14px] tabular-nums text-[var(--text-primary)]">{p.chamadasDeIa}</td>
                          <td className="px-4 py-3 text-right"><Valor d={p.resultado} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Cartao>
              </>
            )}
          </section>

          {/* ── FATURAMENTO E CUSTOS LANÇADOS ───────────────────────────────── */}
          <section>
            <TituloDeSecao apoio="Cada linha declara a procedência do número e se é realizado ou estimativa.">
              Lançamentos do mês
            </TituloDeSecao>
            <Cartao>
              {dados!.lancamentos === null ? (
                <p className="p-4 text-[13px] text-[var(--danger)]">
                  Não consegui ler os lançamentos. Isto NÃO quer dizer que não há nenhum.
                </p>
              ) : dados!.lancamentos.length === 0 ? (
                <div className="p-4">
                  <p className="text-[13px] text-[var(--text-primary)] font-medium">Nenhum lançamento neste mês.</p>
                  <p className="text-[12.5px] text-[var(--text-muted)] mt-1 leading-relaxed">
                    Faturamento e custos em reais ainda entram à mão (ou por rotina). O único número que a casa mede
                    sozinha hoje é o custo de IA, acima.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {dados!.lancamentos.map((l) => (
                    <li key={l.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-[13.5px] text-[var(--text-primary)]">{l.descricao}</p>
                        <p className="text-[11.5px] text-[var(--text-muted)]">
                          {l.tipo === "receita" ? "Receita" : "Custo"} · {l.categoria}
                          {l.cliente && ` · ${l.cliente}`}
                          {l.centroDeCusto && ` · ${l.centroDeCusto}`}
                          {" · origem: "}{ROTULO_DA_ORIGEM[l.origem] ?? l.origem}
                          {l.natureza === "estimado" && " · ESTIMATIVA"}
                        </p>
                      </div>
                      <Valor d={{ estado: "medido", centavos: l.tipo === "custo" ? -l.valorCentavos : l.valorCentavos, moeda: "BRL", origem: l.origem }} />
                    </li>
                  ))}
                </ul>
              )}
            </Cartao>
          </section>
        </div>
      )}
    </div>
  );
}
