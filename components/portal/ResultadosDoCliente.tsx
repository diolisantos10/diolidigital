"use client";

// ResultadosDoCliente — os números REAIS do Instagram do cliente, no portal.
//
// Substitui o placeholder "resultados chegam no fechamento do 1º ciclo": o
// CEO pediu (04/08/2026) um dashboard com as métricas reais das redes. A fonte
// é /api/portal/metricas (leitura pura da Meta, autenticada pelo token/cookie
// do portal).
//
// Regras que esta tela cumpre:
//  • número sem meta definida sai COM O PERÍODO ao lado — nunca com uma
//    comparação inventada ("+12% vs…") que a fonte não deu;
//  • `null` da Meta = "não medido" com todas as letras (contas pequenas não
//    recebem seguidores/algumas métricas) — jamais um zero;
//  • os três estados de conexão são tela, não erro: sem rede conectada,
//    token vencido (reconectar) e medição parcial (aviso visível).

import { useEffect, useRef, useState } from "react";
import { GraficoDeAlcance } from "@/components/portal/GraficoDeAlcance";
import {
  formatarNumeroCompacto,
  formatarPeriodo,
  type PontoDeAlcance,
} from "@/lib/agency/portal/resultados";

interface ContaMedida {
  perfil: { seguidores: number | null; totalDePosts: number | null };
  periodo: { desde: string; ate: string };
  totais: {
    alcance: number | null;
    visualizacoes: number | null;
    contasComEngajamento: number | null;
    interacoes: number | null;
  };
  aviso?: string;
}

type Estado =
  | { fase: "carregando" }
  | { fase: "sem-conexao" }
  | { fase: "reconectar" }
  | { fase: "erro"; mensagem: string }
  | { fase: "ok"; conta: ContaMedida; serie: PontoDeAlcance[] };

const METRICAS: { chave: keyof ContaMedida["totais"]; rotulo: string; explicacao: string }[] = [
  { chave: "alcance",              rotulo: "Alcance",           explicacao: "contas alcançadas" },
  { chave: "visualizacoes",        rotulo: "Visualizações",     explicacao: "vezes que seu conteúdo foi visto" },
  { chave: "contasComEngajamento", rotulo: "Contas engajadas",  explicacao: "pessoas que interagiram" },
  { chave: "interacoes",           rotulo: "Interações",        explicacao: "curtidas, comentários, salvos…" },
];

export function ResultadosDoCliente({
  token,
  onIrParaIntegracoes,
  somenteComNumeros = false,
  aoMedir,
}: {
  /** Token de query (compatibilidade) — vazio em modo cookie. */
  token: string;
  /** Leva o cliente à seção Integrações, onde a conexão se resolve. */
  onIrParaIntegracoes: () => void;
  /**
   * ── QUANDO ISTO NÃO É UMA TELA, É UM BLOCO (08/08/2026) ───────────────────
   * Como aba própria, "Resultados" tinha que explicar a própria ausência —
   * daí os estados "nenhuma rede conectada" e "a conexão venceu". Como BLOCO
   * do Início, ausência não se explica: não se renderiza. Sem número não há
   * título, moldura nem convite — o convite a conectar já mora em Integrações,
   * e a conexão quebrada já é pendência no topo da tela.
   * Ligado, o componente devolve `null` em tudo que não for número real.
   */
  somenteComNumeros?: boolean;
  /** Avisa o pai se há número — é o que permite a seção inteira (com o título)
   *  aparecer junto do conteúdo, em vez de deixar um cabeçalho órfão. */
  aoMedir?: (temNumeros: boolean) => void;
}) {
  const [estado, setEstado] = useState<Estado>({ fase: "carregando" });
  // O retry incrementa e o effect re-busca — o estado já nasce "carregando",
  // então o effect nunca precisa setar estado de forma síncrona.
  const [tentativa, setTentativa] = useState(0);
  // Guardado em ref para o callback do pai não entrar nas dependências do
  // effect de busca — senão uma função nova a cada render vira laço de fetch.
  const aoMedirRef = useRef(aoMedir);
  aoMedirRef.current = aoMedir;

  useEffect(() => {
    if (estado.fase === "carregando") return;
    // "Tem número" é a fase `ok` com pelo menos um total medido. Perfil só com
    // seguidores, sem nenhum total, não é resultado do trabalho — é cadastro.
    const temNumeros =
      estado.fase === "ok" && Object.values(estado.conta.totais).some((v) => v != null);
    aoMedirRef.current?.(temNumeros);
  }, [estado]);

  useEffect(() => {
    let ativo = true;
    const q = token ? `?token=${encodeURIComponent(token)}` : "";
    void (async () => {
      try {
        const res = await fetch(`/api/portal/metricas${q}`, { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!ativo) return;
        if (!res.ok || !json) {
          setEstado({ fase: "erro", mensagem: "Não consegui carregar os números agora." });
          return;
        }
        if (!json.ok) {
          if (json.semConexao) setEstado({ fase: "sem-conexao" });
          else if (json.precisaReconectar) setEstado({ fase: "reconectar" });
          else setEstado({ fase: "erro", mensagem: json.error ?? "Não consegui carregar os números agora." });
          return;
        }
        setEstado({ fase: "ok", conta: json.conta, serie: Array.isArray(json.serie) ? json.serie : [] });
      } catch {
        if (ativo) setEstado({ fase: "erro", mensagem: "Sem conexão com o servidor. Tente novamente." });
      }
    })();
    return () => { ativo = false; };
  }, [token, tentativa]);

  const tentarDeNovo = () => {
    setEstado({ fase: "carregando" });
    setTentativa((t) => t + 1);
  };

  // Modo bloco: tudo que não é número real sai da tela em silêncio.
  if (somenteComNumeros && estado.fase !== "ok") return null;

  // ── Carregando: esqueleto no formato do conteúdo ──────────────────────────
  if (estado.fase === "carregando") {
    return (
      <div role="status" aria-live="polite" aria-label="Carregando resultados" className="space-y-3">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-[12px] border border-[var(--border)] bg-white p-4">
              <div className="h-3 w-16 animate-pulse rounded bg-[var(--accent)]" />
              <div className="mt-3 h-6 w-12 animate-pulse rounded bg-[var(--accent)]" />
            </div>
          ))}
        </div>
        <div className="h-36 animate-pulse rounded-[12px] border border-[var(--border)] bg-white" />
        <span className="sr-only">Carregando…</span>
      </div>
    );
  }

  // ── Sem rede conectada: o caminho está a um toque ─────────────────────────
  if (estado.fase === "sem-conexao") {
    return (
      <div className="rounded-[14px] border border-[var(--border)] bg-white p-7 text-center shadow-[0_1px_3px_rgba(7,10,31,0.04)]">
        <div aria-hidden className="mx-auto mb-2.5 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent)] text-lg">🔌</div>
        <p className="text-[14px] font-semibold text-[var(--text-primary)]">Nenhuma rede conectada ainda</p>
        <p className="mx-auto mt-1.5 max-w-[42ch] text-[13px] leading-relaxed text-[var(--text-secondary)]">
          Conectando o Instagram do seu negócio, os números aparecem aqui — alcance,
          visualizações e engajamento, direto da Meta.
        </p>
        <button
          onClick={onIrParaIntegracoes}
          style={{ touchAction: "manipulation" }}
          className="mt-4 h-10 rounded-[10px] bg-[var(--navy)] px-5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
        >
          Conectar em Integrações
        </button>
      </div>
    );
  }

  // ── Token vencido: reconectar ─────────────────────────────────────────────
  if (estado.fase === "reconectar") {
    return (
      <div className="rounded-[14px] border border-[var(--border)] bg-[var(--warning-bg)] p-6 text-center">
        <p className="text-[14px] font-semibold text-[var(--warning)]">A conexão com o Instagram venceu</p>
        <p className="mx-auto mt-1.5 max-w-[42ch] text-[13px] leading-relaxed text-[var(--warning)]">
          É normal de tempos em tempos — a Meta pede uma nova autorização.
          Reconecte em Integrações e os números voltam sozinhos.
        </p>
        <button
          onClick={onIrParaIntegracoes}
          style={{ touchAction: "manipulation" }}
          className="mt-4 h-10 rounded-[10px] bg-[var(--navy)] px-5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
        >
          Reconectar em Integrações
        </button>
      </div>
    );
  }

  // ── Erro de leitura: dizer e oferecer o retry ─────────────────────────────
  if (estado.fase === "erro") {
    return (
      <div role="alert" className="rounded-[14px] border border-[var(--border)] bg-white p-6 text-center">
        <p className="text-[14px] font-semibold text-[var(--text-primary)]">{estado.mensagem}</p>
        <p className="mt-1 text-[12px] text-[var(--text-muted)]">Pode ser instabilidade da Meta — costuma resolver em minutos.</p>
        <button
          onClick={tentarDeNovo}
          style={{ touchAction: "manipulation" }}
          className="mt-3.5 h-9 rounded-[9px] border border-[var(--border-strong)] bg-white px-4 text-[13px] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)]"
        >
          Tentar de novo
        </button>
      </div>
    );
  }

  const { conta, serie } = estado;
  const periodo = formatarPeriodo(conta.periodo.desde, conta.periodo.ate);
  const seguidores = formatarNumeroCompacto(conta.perfil.seguidores);

  return (
    <div className="space-y-3">
      {/* Medição parcial não fica em nota de rodapé — fica na cara da tela. */}
      {conta.aviso && (
        <div className="rounded-[12px] border border-[var(--border)] bg-[var(--warning-bg)] px-4 py-2.5 text-[12px] text-[var(--warning)]">
          <b>Medição parcial:</b> {conta.aviso}
        </div>
      )}

      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[12px] text-[var(--text-secondary)]">
          Instagram · período <b className="text-[var(--text-primary)]">{periodo}</b>
        </p>
        {seguidores && (
          <p className="text-[12px] text-[var(--text-secondary)]">
            <b className="text-[var(--text-primary)]">{seguidores}</b> seguidores
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {METRICAS.map(({ chave, rotulo, explicacao }) => {
          const valor = formatarNumeroCompacto(conta.totais[chave]);
          return (
            <div key={chave} className="rounded-[12px] border border-[var(--border)] bg-white p-4 shadow-[0_1px_2px_rgba(7,10,31,0.03)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)]">{rotulo}</p>
              {valor != null ? (
                <p className="mono-num mt-1.5 text-[24px] font-bold leading-none text-[var(--text-primary)]">{valor}</p>
              ) : (
                <p className="mt-1.5 text-[13px] font-medium text-[var(--text-muted)]">não medido</p>
              )}
              <p className="mt-1.5 text-[11px] leading-snug text-[var(--text-muted)]">{explicacao}</p>
            </div>
          );
        })}
      </div>

      <div className="rounded-[12px] border border-[var(--border)] bg-white p-4 shadow-[0_1px_2px_rgba(7,10,31,0.03)]">
        <GraficoDeAlcance serie={serie} />
      </div>

      <p className="text-[11px] text-[var(--text-subtle)]">
        Fonte: Meta (Instagram), leitura direta. Números sem meta definida aparecem com o
        período — quando o seu ciclo tiver meta, a comparação entra aqui.
      </p>
    </div>
  );
}
