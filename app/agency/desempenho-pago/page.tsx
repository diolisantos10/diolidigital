"use client";

// /agency/desempenho-pago — A TELA DE DESEMPENHO DE TRÁFEGO PAGO DA META.
//
// ── POR QUE ESTA TELA EXISTE (06/08/2026) ───────────────────────────────────
//
// Ela não nasceu de um pedido de design: nasceu de um requisito de APROVAÇÃO.
// A referência oficial de permissões da Meta manda, com estas palavras, para
// `ads_management`, `ads_read` E `business_management` (as três repetem o mesmo
// bloco de screencast):
//
//   "Demonstre como uma empresa pode acessar dados de desempenho de anúncios na
//    plataforma do app depois de conceder a permissão."
//   "Mostre que os dados de desempenho dos anúncios (como impressões,
//    conversões, gastos, cliques e alcance) são exibidos na plataforma do app."
//
//   (fonte: docs/plataformas/meta/fontes/permissoes-referencia.md)
//
// Até hoje a casa tinha a LEITURA pronta (`/api/meta/desempenho`, que devolve
// gasto, impressões, alcance, cliques, CPM, CPC, CTR e resultados) e NENHUMA
// tela que a exibisse — `/agency/ads-agent` diz no próprio cabeçalho "no Meta
// Ads API, no real campaigns, no metrics". Endpoint sem tela é, para a análise
// do app, funcionalidade inexistente: a Meta reprova a permissão que não
// consegue exercitar (fonte: fontes/app-review-processo.md).
//
// ── AS REGRAS DA CASA QUE ESTA TELA OBEDECE ─────────────────────────────────
//
// 1. SÓ LEITURA. Nenhum botão aqui cria, pausa, edita ou ativa nada na Meta.
//    A rota que ela chama não exporta POST.
// 2. "NÃO MEDI" É DIFERENTE DE "DEU ZERO". Métrica que a Meta não devolveu
//    aparece como "—" com o motivo na seção de lacunas, nunca como 0.
// 3. RITMO. Uma leitura por clique, sob demanda. Nada de polling — foi rajada
//    que restringiu a conta da agência em 03/08/2026.

import { useCallback, useEffect, useState } from "react";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import EmptyState from "@/components/agency/ui/EmptyState";
import Button from "@/components/agency/ui/Button";
import { mensagemDeErro, type ErroHumano } from "@/components/agency/ui/mensagemDeErro";

// ─── Os tipos que a rota devolve (espelho de lib/integrations/meta/ads-leitura) ──

interface Desempenho {
  campanhaId: string;
  nome: string;
  objetivo: string | null;
  gasto: number | null;
  impressoes: number | null;
  alcance: number | null;
  frequencia: number | null;
  cliques: number | null;
  cpm: number | null;
  cpc: number | null;
  ctrPct: number | null;
  resultado: { tipo: string; quantidade: number } | null;
  custoPorResultado: number | null;
  naoMedido?: string[];
}

interface Achado {
  tipo: "queima" | "escala" | "ativo_indevido" | "lacuna";
  frase: string;
  numero: number | null;
  emJogo: number | null;
}

interface Conta {
  /** Espelha `ContaDeAnuncioLida`: o identificador é `id` ("act_123…"). */
  conta: { id: string; nome: string; moeda: string; statusTexto?: string; ativa?: boolean };
  periodo: { desde: string; ate: string };
  semCampanhaAtiva: boolean;
  desempenho: Desempenho[];
  totais: { gasto: number | null; impressoes: number | null; alcance: number | null; cliques: number | null };
  achados: Achado[];
  recomendacao: string;
  lacunas: string[];
}

interface Panorama {
  ok: boolean;
  periodo?: { desde: string; ate: string };
  totalDeContas?: number;
  contasAtivas?: number;
  contasComCampanhaAtiva?: number;
  contas?: Conta[];
  naoLidas?: Array<{ conta: string; nome: string; motivo: string }>;
  pontosGastos?: number;
  semConexao?: boolean;
  semAutorizacao?: boolean;
  motivo?: string;
  error?: string;
}

// ─── Formatação: o traço é uma AFIRMAÇÃO, não um vazio ──────────────────────

/** `null` vira "—". Nunca 0. Um zero inventado num relatório de mídia paga faz
 *  o operador desligar uma campanha que estava funcionando. */
function num(v: number | null | undefined, casas = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

function dinheiro(v: number | null | undefined, moeda = "BRL"): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  try {
    return v.toLocaleString("pt-BR", { style: "currency", currency: moeda });
  } catch {
    return `${moeda} ${num(v, 2)}`;
  }
}

function pct(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${num(v, 2)}%`;
}

const TOM_DO_ACHADO: Record<Achado["tipo"], { rotulo: string; classe: string }> = {
  queima: { rotulo: "Queima", classe: "bg-[#FEE2E2] text-[var(--danger)] border-[#FECACA]" },
  escala: { rotulo: "Escala", classe: "bg-[#DCFCE7] text-[#166534] border-[#BBF7D0]" },
  ativo_indevido: { rotulo: "Ligado sem dever", classe: "bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]" },
  lacuna: { rotulo: "Não medido", classe: "bg-[var(--accent)] text-[var(--text-secondary)] border-[var(--border)]" },
};

// ─── Sub-componentes ────────────────────────────────────────────────────────

function Numero({ rotulo, valor, ajuda }: { rotulo: string; valor: string; ajuda?: string }) {
  return (
    <div className="rounded-[10px] border border-[var(--border)] bg-white px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
        {rotulo}
      </p>
      <p className="mt-1 text-[19px] font-semibold tracking-[-0.02em] text-[var(--text-primary)] tabular-nums">
        {valor}
      </p>
      {ajuda && <p className="mt-0.5 text-[11.5px] text-[var(--text-muted)]">{ajuda}</p>}
    </div>
  );
}

function CartaoDaConta({ c }: { c: Conta }) {
  const moeda = c.conta.moeda || "BRL";
  const id = c.conta.id;

  return (
    <section className="rounded-[12px] border border-[var(--border)] bg-[var(--bg)] p-4 sm:p-5">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-semibold tracking-[-0.02em] text-[var(--text-primary)]">
            {c.conta.nome || id || "Conta de anúncios"}
          </h2>
          <p className="mt-0.5 font-mono text-[11.5px] text-[var(--text-muted)]">{id}</p>
        </div>
        <p className="text-[11.5px] text-[var(--text-muted)]">
          {c.periodo.desde} a {c.periodo.ate}
        </p>
      </header>

      {/* Os quatro números que a Meta exige ver na tela para aprovar
          ads_management / ads_read / business_management. */}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Numero rotulo="Gasto" valor={dinheiro(c.totais.gasto, moeda)} />
        <Numero rotulo="Impressões" valor={num(c.totais.impressoes)} />
        <Numero rotulo="Alcance" valor={num(c.totais.alcance)} ajuda="pessoas únicas" />
        <Numero rotulo="Cliques" valor={num(c.totais.cliques)} />
      </div>

      {c.semCampanhaAtiva ? (
        <p className="mt-4 rounded-[10px] border border-[var(--border)] bg-white px-4 py-3 text-[12.5px] text-[var(--text-secondary)]">
          Nenhuma campanha no ar nesta conta no período.{" "}
          <strong className="font-medium">Isso não é gasto zero</strong> — é ausência de veiculação.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-[10px] border border-[var(--border)] bg-white">
          <table className="w-full min-w-[720px] border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-[11px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
                <th className="px-3 py-2 font-semibold">Campanha</th>
                <th className="px-3 py-2 text-right font-semibold">Gasto</th>
                <th className="px-3 py-2 text-right font-semibold">Impressões</th>
                <th className="px-3 py-2 text-right font-semibold">Alcance</th>
                <th className="px-3 py-2 text-right font-semibold">Cliques</th>
                <th className="px-3 py-2 text-right font-semibold">CTR</th>
                <th className="px-3 py-2 text-right font-semibold">CPC</th>
                <th className="px-3 py-2 text-right font-semibold">CPM</th>
                <th className="px-3 py-2 text-right font-semibold">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {c.desempenho.map((d) => (
                <tr key={d.campanhaId} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-3 py-2.5">
                    <span className="block max-w-[240px] truncate font-medium text-[var(--text-primary)]">
                      {d.nome}
                    </span>
                    {d.objetivo && (
                      <span className="text-[11px] text-[var(--text-muted)]">{d.objetivo}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{dinheiro(d.gasto, moeda)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{num(d.impressoes)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{num(d.alcance)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{num(d.cliques)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{pct(d.ctrPct)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{dinheiro(d.cpc, moeda)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{dinheiro(d.cpm, moeda)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {d.resultado ? (
                      <>
                        {num(d.resultado.quantidade)}{" "}
                        <span className="text-[11px] text-[var(--text-muted)]">{d.resultado.tipo}</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {c.achados.length > 0 && (
        <ul className="mt-4 space-y-2">
          {c.achados.map((a, i) => {
            const tom = TOM_DO_ACHADO[a.tipo] ?? TOM_DO_ACHADO.lacuna;
            return (
              <li
                key={i}
                className={`flex flex-wrap items-center gap-2 rounded-[9px] border px-3 py-2 text-[12.5px] ${tom.classe}`}
              >
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em]">
                  {tom.rotulo}
                </span>
                <span className="min-w-0 flex-1">{a.frase}</span>
                {a.emJogo !== null && (
                  <span className="font-semibold tabular-nums">{dinheiro(a.emJogo, moeda)}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {c.recomendacao && (
        <p className="mt-4 rounded-[10px] border border-[var(--border)] bg-white px-4 py-3 text-[12.5px] leading-relaxed text-[var(--text-secondary)]">
          <strong className="font-semibold text-[var(--text-primary)]">Recomendação: </strong>
          {c.recomendacao}
        </p>
      )}

      {c.lacunas.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
            O que não deu para ler
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[12px] text-[var(--text-muted)]">
            {c.lacunas.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

// ─── A tela ─────────────────────────────────────────────────────────────────

export default function DesempenhoPagoPage() {
  const [dados, setDados] = useState<Panorama | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<ErroHumano | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const res = await fetch("/api/meta/desempenho");
      const json = (await res.json()) as Panorama;
      if (!res.ok && res.status >= 500) throw new Error(json.error ?? `HTTP ${res.status}`);
      setDados(json);
    } catch (e) {
      setErro(mensagemDeErro(e, "ler o desempenho das campanhas na Meta"));
    } finally {
      setCarregando(false);
    }
  }, []);

  // Uma leitura ao abrir. Sem intervalo, sem repetição automática: cada
  // atualização é um clique consciente, e cada clique custa cota da Meta.
  useEffect(() => {
    void carregar();
  }, [carregar]);

  const contas = dados?.contas ?? [];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <AgencyHeader
        eyebrow="Tráfego pago"
        title="Desempenho na Meta"
        subtitle="Gasto, impressões, alcance, cliques e resultados das campanhas conectadas. Só leitura — nada aqui altera campanha."
        meta={
          dados?.periodo ? (
            <p className="text-[12px] text-[var(--text-muted)]">
              Período: {dados.periodo.desde} a {dados.periodo.ate}
              {typeof dados.pontosGastos === "number" && (
                <> · {dados.pontosGastos} pontos de cota nesta leitura</>
              )}
            </p>
          ) : undefined
        }
        actions={
          <Button onClick={() => void carregar()} disabled={carregando}>
            {carregando ? "Lendo…" : "Atualizar"}
          </Button>
        }
      />

      {carregando && !dados && (
        <p className="py-16 text-center text-[13px] text-[var(--text-muted)]">
          Lendo as contas de anúncio na Meta…
        </p>
      )}

      {erro && (
        <div className="rounded-[10px] border border-[#FECACA] bg-[#FEE2E2] px-4 py-3 text-[12.5px] text-[var(--danger)]">
          {erro.mensagem}
          {erro.detalhe ? ` — ${erro.detalhe}` : ""}
        </div>
      )}

      {/* Estado, não falha: sem conexão a tela manda conectar, não grita erro. */}
      {dados && dados.ok === false && dados.semConexao && (
        <EmptyState
          title="Nenhuma conta da Meta conectada"
          description="A Marketing API exige um acesso de usuário. Conecte em Ferramentas & Integrações → Meta."
          action={
            <a href="/agency/integrations">
              <Button variant="primary">Ir para Integrações</Button>
            </a>
          }
        />
      )}

      {dados && dados.ok === false && dados.semAutorizacao && (
        <EmptyState
          title="Falta autorizar quais contas podemos ler"
          description="A conexão existe, mas nenhuma conta de anúncios foi liberada para este app ainda."
          action={
            <a href="/agency/integrations">
              <Button variant="primary">Escolher contas</Button>
            </a>
          }
        />
      )}

      {dados && dados.ok === false && dados.motivo === "ritmo" && (
        <div className="rounded-[10px] border border-[#FDE68A] bg-[#FEF3C7] px-4 py-3 text-[12.5px] text-[#92400E]">
          O freio de ritmo desta casa segurou a leitura para não estourar a cota da Meta.
          Tente de novo em alguns minutos. {dados.error}
        </div>
      )}

      {dados?.ok && contas.length === 0 && (
        <EmptyState
          title="Nenhuma conta de anúncios legível"
          description="A conexão está de pé, mas não há conta de anúncios ativa para ler no período."
        />
      )}

      {dados?.ok && contas.length > 0 && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            <Numero rotulo="Contas" valor={num(dados.totalDeContas)} />
            <Numero rotulo="Contas ativas" valor={num(dados.contasAtivas)} />
            <Numero rotulo="Com campanha no ar" valor={num(dados.contasComCampanhaAtiva)} />
            <Numero rotulo="Contas lidas" valor={num(contas.length)} />
          </div>

          {contas.map((c) => (
            <CartaoDaConta key={c.conta.id} c={c} />
          ))}

          {dados.naoLidas && dados.naoLidas.length > 0 && (
            <section className="rounded-[12px] border border-[var(--border)] bg-[var(--bg)] p-4">
              <h2 className="text-[13px] font-semibold text-[var(--text-primary)]">
                Contas que existem e não foram lidas
              </h2>
              <ul className="mt-2 space-y-1 text-[12.5px] text-[var(--text-secondary)]">
                {dados.naoLidas.map((n) => (
                  <li key={n.conta}>
                    <span className="font-medium">{n.nome || n.conta}</span> — {n.motivo}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
