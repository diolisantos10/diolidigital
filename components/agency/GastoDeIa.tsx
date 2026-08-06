"use client";

// QUANTO A AGÊNCIA GASTOU COM IA — o leitor do `AIRunLog` na tela.
//
// Existe para que a instrumentação do log não vire o defeito que ela consertou:
// estado gravado que ninguém lê.
//
// Regra desta tela: **nenhum número de dinheiro sem o aviso de estimativa ao
// lado, e sem quantas chamadas ficaram de fora da conta.** Um total limpo diria
// "gastamos US$ X"; a frase honesta é "gastamos pelo menos US$ X, e N chamadas
// não tinham preço na tabela".

import { useEffect, useState } from "react";

interface Linha {
  chave: string; rotulo: string; chamadas: number; sucessos: number; falhas: number;
  tokensEntrada: number; tokensSaida: number; custoUsd: number; chamadasSemPreco: number;
}
interface Relatorio {
  desde: string; totalChamadas: number; totalSucessos: number; totalFalhas: number;
  totalTokensEntrada: number; totalTokensSaida: number; totalUsd: number;
  chamadasSemPreco: number; chamadasSemToken: number;
  porCliente: Linha[]; porProvedor: Linha[]; porDepartamento: Linha[];
  tabelasUsadas: string[]; tabelaAtual: string; aviso: string; vazio: boolean;
}

/**
 * Duas casas quando dá, quatro quando não dá.
 *
 * Não é capricho: uma chamada barata custa US$ 0,0014 e `toFixed(2)` a
 * transformaria em "US$ 0,00" — a tela afirmaria que aquele cliente não custou
 * nada. As casas são escolhidas por TABELA, não por linha, para não misturar
 * duas precisões na mesma coluna.
 */
function formatador(linhas: { custoUsd: number }[]): (v: number) => string {
  const precisaDeQuatro = linhas.some((l) => l.custoUsd > 0 && l.custoUsd < 0.01);
  return (v) => `US$ ${v.toFixed(precisaDeQuatro ? 4 : 2)}`;
}

function usd(v: number): string {
  return v >= 0.01 ? `US$ ${v.toFixed(2)}` : `US$ ${v.toFixed(4)}`;
}

function Tabela({ titulo, linhas }: { titulo: string; linhas: Linha[] }) {
  if (linhas.length === 0) return null;
  const fmt = formatador(linhas);
  return (
    <div>
      <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1.5">{titulo}</div>
      <div className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-[8px] overflow-hidden">
        {linhas.map((l) => (
          <div key={l.chave} className="flex items-center gap-3 px-3 py-2 bg-white">
            <div className="min-w-0 flex-1">
              <div className="text-[12px] text-[var(--text-primary)] truncate">{l.rotulo}</div>
              <div className="text-[10.5px] text-[var(--text-muted)]">
                {l.chamadas} chamada(s){l.falhas > 0 ? ` · ${l.falhas} falha(s)` : ""}
                {l.chamadasSemPreco > 0 ? ` · ${l.chamadasSemPreco} sem preço na tabela` : ""}
              </div>
            </div>
            <div className="shrink-0 text-[12px] font-semibold mono-num text-[var(--text-primary)]">
              {fmt(l.custoUsd)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function GastoDeIa() {
  const [r, setR] = useState<Relatorio | null>(null);
  const [estado, setEstado] = useState<"carregando" | "ok" | "sem_permissao" | "erro">("carregando");

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/agency/gasto-de-ia?dias=30");
        if (res.status === 401 || res.status === 403) { setEstado("sem_permissao"); return; }
        if (!res.ok) { setEstado("erro"); return; }
        setR(await res.json());
        setEstado("ok");
      } catch { setEstado("erro"); }
    })();
  }, []);

  if (estado === "sem_permissao") return null;

  return (
    <div id="gasto-de-ia" className="bg-white border border-[var(--border)] rounded-[10px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden mb-6">
      <div className="px-5 py-3.5 border-b border-[var(--border)]">
        <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">Gasto com IA · últimos 30 dias</h2>
        <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
          Medido chamada a chamada, desde 06/08/2026. Antes dessa data não há registro — e ausência de registro não é gasto zero.
        </p>
      </div>

      {estado === "carregando" && <div className="px-5 py-6 text-[12px] text-[var(--text-muted)]">Carregando…</div>}
      {estado === "erro" && <div className="px-5 py-6 text-[12px] text-[var(--danger)]">Não consegui ler o registro de gasto.</div>}

      {estado === "ok" && r && r.vazio && (
        <div className="px-5 py-6">
          <div className="text-[13px] font-semibold text-[var(--text-primary)]">Nada medido ainda</div>
          <p className="text-[11.5px] text-[var(--text-secondary)] mt-1">
            Nenhuma chamada de IA registrada na janela. Isto <strong>não</strong> quer dizer que a
            agência não gastou — quer dizer que o registro começou agora e ainda não houve produção.
          </p>
        </div>
      )}

      {estado === "ok" && r && !r.vazio && (
        <>
          <div className="px-5 py-4 flex flex-wrap items-start gap-6 border-b border-[var(--border)]">
            <div>
              <div className="text-[22px] font-bold text-[var(--navy)] mono-num">{usd(r.totalUsd)}</div>
              <div className="text-[11px] text-[var(--text-muted)] mt-0.5">estimado no período</div>
            </div>
            <div>
              <div className="text-[22px] font-bold text-[var(--text-primary)] mono-num">{r.totalChamadas}</div>
              <div className="text-[11px] text-[var(--text-muted)] mt-0.5">chamadas · {r.totalFalhas} falha(s)</div>
            </div>
            <div>
              <div className="text-[22px] font-bold text-[var(--text-primary)] mono-num">
                {(r.totalTokensEntrada + r.totalTokensSaida).toLocaleString("pt-BR")}
              </div>
              <div className="text-[11px] text-[var(--text-muted)] mt-0.5">tokens (entrada + saída)</div>
            </div>
          </div>

          {(r.chamadasSemPreco > 0 || r.chamadasSemToken > 0 || r.tabelasUsadas.length > 1) && (
            <div className="px-5 py-2.5 bg-[#FFFBEB] border-b border-[#FDE68A] text-[11px] text-[var(--warning)]">
              {r.chamadasSemPreco > 0 && <div>⚠ {r.chamadasSemPreco} chamada(s) ficaram FORA do total: modelo sem preço na tabela.</div>}
              {r.chamadasSemToken > 0 && <div>⚠ {r.chamadasSemToken} chamada(s) sem contagem de token devolvida pelo provedor.</div>}
              {r.tabelasUsadas.length > 1 && <div>⚠ O período mistura {r.tabelasUsadas.length} versões da tabela de preço ({r.tabelasUsadas.join(", ")}).</div>}
            </div>
          )}

          <div className="px-5 py-4 grid grid-cols-1 gap-4">
            <Tabela titulo="Por cliente" linhas={r.porCliente} />
            <Tabela titulo="Por provedor e modelo" linhas={r.porProvedor} />
            <Tabela titulo="Por departamento" linhas={r.porDepartamento} />
          </div>

          <div className="px-5 py-3 border-t border-[var(--border)] bg-[var(--bg-elevated)]">
            <p className="text-[10.5px] leading-relaxed text-[var(--text-muted)]">{r.aviso}</p>
            <p className="text-[10.5px] text-[var(--text-muted)] mt-1">
              A tabela de preço mora em <span className="font-mono">lib/ai/precos.ts</span> e envelhece —
              atualizar exige abrir a página de preços de cada provedor e subir a versão da tabela.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
