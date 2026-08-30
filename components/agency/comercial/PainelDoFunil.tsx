"use client";

// ─── O PAINEL DO FUNIL — o que o Radar não mostrava ────────────────────────
//
// Item obrigatório do CEO: "na oportunidade individual: ... próxima ação,
// responsável, HISTÓRICO COMPLETO". A rota do funil existe desde 30/08, mas até
// agora quem quisesse ver o estado e a trilha precisava de `curl`.
//
// ── POR QUE A TRILHA É O CORPO DESTA TELA, E NÃO UM RODAPÉ ────────────────
// Porque a pergunta que o gerente faz não é "em que estado está?" — é "por que
// está aqui, e quem decidiu isso?". O estado atual cabe numa palavra; a
// justificativa de cada passo é o que permite discordar de uma decisão. Mostrar
// só o estado seria mostrar a conclusão e esconder o argumento.
//
// ── OS TRÊS ESTADOS OBRIGATÓRIOS ──────────────────────────────────────────
// Carregando, vazio e erro, os três desenhados. O "vazio" aqui tem significado
// próprio e não é um erro: oportunidade sem trilha é oportunidade que ninguém
// moveu ainda, e o texto diz isso em vez de deixar um branco que parece falha.

import { useCallback, useEffect, useState } from "react";

interface Transicao {
  estadoAnterior: string;
  estadoNovo: string;
  autor: string;
  origem: string | null;
  justificativa: string;
  criadoEm: string;
}

interface Resposta {
  oportunidadeId: string;
  estado: string;
  trilha: Transicao[];
}

/** Os 22 estados em português de gente. Um `slug` cru na tela obriga quem lê a
 *  traduzir de cabeça, e quem traduz de cabeça erra. */
const ROTULO: Record<string, string> = {
  encontrada: "Encontrada",
  duplicada: "Duplicada",
  recusada_pela_qualificacao: "Recusada na qualificação",
  qualificada: "Qualificada",
  abordagem_preparada: "Abordagem preparada",
  aguardando_autorizacao: "Aguardando autorização",
  abordada: "Abordada",
  respondeu: "Respondeu",
  briefing_em_coleta: "Briefing em coleta",
  briefing_completo: "Briefing completo",
  proposta_preparada: "Proposta preparada",
  proposta_enviada: "Proposta enviada",
  negociacao: "Em negociação",
  contratada: "Contratada",
  em_producao: "Em produção",
  entrega_enviada: "Entrega enviada",
  ajuste_solicitado: "Ajuste solicitado",
  aprovada: "Aprovada",
  ganha: "Ganha",
  perdida: "Perdida",
  retomar: "Retomar",
  excecao_operacional: "Exceção operacional",
};

/** Estado desconhecido aparece COMO VEIO, marcado. Inventar um rótulo bonito
 *  para um slug que o código não conhece esconderia um defeito de dados. */
function rotulo(e: string): string {
  return ROTULO[e] ?? `${e} (desconhecido)`;
}

const CORES: Record<string, string> = {
  ganha: "bg-[var(--success-bg,#ECFDF5)] text-[var(--success-text,#065F46)] border-[var(--success-border,#A7F3D0)]",
  perdida: "bg-[var(--bg)] text-[var(--text-secondary)] border-[var(--border)]",
  duplicada: "bg-[var(--bg)] text-[var(--text-secondary)] border-[var(--border)]",
  recusada_pela_qualificacao: "bg-[var(--bg)] text-[var(--text-secondary)] border-[var(--border)]",
  excecao_operacional:
    "bg-[var(--danger-bg,#FEF2F2)] text-[var(--danger-text,#991B1B)] border-[var(--danger-border,#FECACA)]",
};
const COR_PADRAO = "bg-white text-[var(--text-primary)] border-[var(--border-strong)]";

function dataCurta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "data inválida";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function PainelDoFunil({ oportunidadeId }: { oportunidadeId: string }) {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const r = await fetch(`/api/agency/oportunidades/${oportunidadeId}/funil`, { cache: "no-store" });
      if (!r.ok) {
        // A mensagem do servidor é mostrada como veio quando existe: ela sabe
        // POR QUE barrou (posse, papel), e trocá-la por "erro ao carregar"
        // apagaria justamente a informação que resolve o problema.
        const corpo = (await r.json().catch(() => null)) as { error?: string } | null;
        setErro(corpo?.error ?? `não consegui carregar o funil (HTTP ${r.status}).`);
        return;
      }
      setDados((await r.json()) as Resposta);
    } catch {
      setErro("não consegui falar com o servidor. Verifique a conexão e tente de novo.");
    } finally {
      setCarregando(false);
    }
  }, [oportunidadeId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (carregando) {
    return (
      <div className="px-4 py-4" aria-busy="true">
        <div className="h-5 w-40 rounded-[6px] bg-[var(--bg)] animate-pulse" />
        <div className="mt-3 space-y-2">
          <div className="h-12 rounded-[8px] bg-[var(--bg)] animate-pulse" />
          <div className="h-12 rounded-[8px] bg-[var(--bg)] animate-pulse" />
        </div>
      </div>
    );
  }

  if (erro) {
    return (
      <div className="px-4 py-4">
        <p className="text-[13px] leading-relaxed text-[var(--danger-text,#991B1B)]">{erro}</p>
        <button
          type="button"
          onClick={() => void carregar()}
          className="mt-3 h-8 px-3 rounded-[7px] border border-[var(--border-strong)] bg-white text-[12px] font-semibold text-[var(--text-primary)] hover:bg-[var(--bg)] transition-colors"
        >
          Tentar de novo
        </button>
      </div>
    );
  }

  if (!dados) return null;

  const cor = CORES[dados.estado] ?? COR_PADRAO;

  return (
    <div className="px-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
          Estado no funil
        </span>
        <span className={`inline-flex items-center rounded-[7px] border px-2.5 py-1 text-[13px] font-semibold ${cor}`}>
          {rotulo(dados.estado)}
        </span>
      </div>

      {dados.trilha.length === 0 ? (
        <p className="mt-3 text-[13px] leading-relaxed text-[var(--text-secondary)]">
          Ninguém moveu esta oportunidade ainda — ela está no estado inicial. O
          histórico aparece aqui a partir da primeira decisão.
        </p>
      ) : (
        <ol className="mt-4 space-y-0">
          {dados.trilha.map((t, i) => (
            <li key={`${t.criadoEm}-${i}`} className="relative pl-5 pb-4 last:pb-0">
              <span
                aria-hidden="true"
                className="absolute left-0 top-[6px] h-2 w-2 rounded-full bg-[var(--border-strong)]"
              />
              {i < dados.trilha.length - 1 && (
                <span aria-hidden="true" className="absolute left-[3px] top-[14px] bottom-0 w-px bg-[var(--border)]" />
              )}
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-[13px] font-semibold text-[var(--text-primary)]">
                  {rotulo(t.estadoAnterior)} → {rotulo(t.estadoNovo)}
                </span>
                <span className="text-[12px] text-[var(--text-secondary)]">{dataCurta(t.criadoEm)}</span>
              </div>
              {/* A justificativa é o corpo, não a nota de rodapé: é ela que
                  permite discordar da decisão. */}
              <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-primary)] break-words">
                {t.justificativa}
              </p>
              <p className="mt-0.5 text-[12px] text-[var(--text-secondary)]">
                por {t.autor}
                {t.origem ? ` · ${t.origem}` : " · origem não registrada"}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
