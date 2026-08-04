"use client";

// CalendarioDoMes — o cliente passa a VER o mês inteiro montado.
//
// O que existia: uma lista de 12 itens de texto, escondida dentro da aba de
// Social, e um "Seu calendário está sendo montado" quando vazia. O cliente
// aprovava peça por peça sem nunca enxergar o conjunto — e o conjunto é
// justamente o que ele comprou. É a diferença entre "recebi uns posts" e "a
// minha agência tem um plano para o meu mês".
//
// ── AS TRÊS DECISÕES DE DESENHO ────────────────────────────────────────────
//
// 1. MINIATURA. Um calendário sem imagem é uma planilha. A peça é visual, e o
//    cliente decide se gostou olhando — não lendo a legenda.
// 2. AGRUPADO POR MÊS, não uma lista corrida. "Agosto: 12 posts" responde a
//    pergunta que ele realmente faz; uma lista de datas soltas, não.
// 3. O ESTADO EM PORTUGUÊS DE GENTE. "Programado" e não "scheduled";
//    "Esperando sua aprovação" e não "draft" — que é o estado em que a peça
//    mais precisa dele e o único que ele pode destravar.

import { useMemo } from "react";
import { urlDeMidiaDoPortal } from "@/lib/agency/portal/midia";

export interface PecaDoCalendario {
  id: string;
  caption: string;
  format: string;
  pillar: string | null;
  mediaUrl: string | null;
  scheduledFor: string | null;
  status: string;
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** O estado como o CLIENTE entende. O nome técnico não diz a ele o que fazer. */
function estado(s: string, temAprovacaoPendente: boolean): { texto: string; fundo: string; cor: string } {
  switch (s) {
    case "published": return { texto: "No ar", fundo: "#DCFCE7", cor: "#16A34A" };
    case "scheduled": return { texto: "Programado", fundo: "#DBEAFE", cor: "#1D4ED8" };
    case "failed":    return { texto: "Com problema", fundo: "#FEE2E2", cor: "#B91C1C" };
    // A decisão do cliente propaga ao post (card de calendário) — e a tela
    // devolve a decisão a ele, em vez de continuar dizendo "esperando você".
    case "approved":  return { texto: "Aprovado por você", fundo: "#DCFCE7", cor: "#16A34A" };
    case "revision_requested": return { texto: "Em ajuste", fundo: "#EFF6FF", cor: "#1D4ED8" };
    // "draft" só diz "esperando você" quando existe uma APROVAÇÃO PENDENTE de
    // verdade — a mesma fonte do Início. Rascunho sem card aberto está com a
    // AGÊNCIA: dizer "esperando você" aqui era a contradição do lançamento da
    // Foocci (a tela cobrava o cliente por algo que ele não tinha como decidir).
    default: return temAprovacaoPendente
      ? { texto: "Esperando você", fundo: "#FEF3C7", cor: "#B45309" }
      : { texto: "Em preparação", fundo: "#F2F2EF", cor: "#6B7280" };
  }
}

function maiuscula(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function rotuloDeFormato(f: string): string {
  if (f === "carousel" || f === "carrossel") return "Carrossel";
  if (f === "reel" || f === "video") return "Reels";
  if (f === "story") return "Story";
  return "Feed";
}

export function CalendarioDoMes({
  pecas,
  token,
  aprovacoesPendentes = 0,
}: {
  pecas: PecaDoCalendario[];
  /** Vazio em modo cookie: a miniatura sai SEM ?token= no DOM (A4) — a rota de
   *  mídia autentica pelo cookie httpOnly. */
  token: string;
  /** Quantas APROVAÇÕES reais aguardam o cliente — a MESMA fonte da pendência
   *  do Início (`portal-data.approvals` pendentes). O banner deriva daqui:
   *  sem aprovação criada, ele não promete uma aba de Aprovações vazia. */
  aprovacoesPendentes?: number;
}) {
  const porMes = useMemo(() => {
    const mapa = new Map<string, PecaDoCalendario[]>();
    for (const p of [...pecas].sort((a, b) => (a.scheduledFor ?? "").localeCompare(b.scheduledFor ?? ""))) {
      // Peça sem data ainda não tem lugar no mês — mas não pode sumir da tela,
      // senão o cliente acha que a agência entregou menos do que entregou.
      const chave = p.scheduledFor ? p.scheduledFor.slice(0, 7) : "sem-data";
      mapa.set(chave, [...(mapa.get(chave) ?? []), p]);
    }
    return [...mapa.entries()];
  }, [pecas]);

  if (pecas.length === 0) {
    return (
      <div className="bg-white rounded-[14px] border border-[var(--border)] px-5 py-8 text-center">
        <p className="text-[14px] font-semibold text-[var(--text-primary)]">Seu calendário está sendo montado</p>
        <p className="mt-1 text-[12.5px] text-[var(--text-secondary)]">
          Assim que as peças ficarem prontas, o mês inteiro aparece aqui — com data, imagem e formato.
        </p>
      </div>
    );
  }

  // A MESMA fonte do Início: aprovações pendentes REAIS, não a contagem de
  // rascunhos. Contar rascunho aqui fazia o banner prometer uma aba de
  // Aprovações vazia enquanto o Início dizia "nada depende de você".
  const esperando = aprovacoesPendentes;

  return (
    <div className="space-y-5">
      {esperando > 0 && (
        <div className="rounded-[12px] bg-[#FFFBEB] border border-[#FDE68A] px-4 py-3">
          <p className="text-[13px] font-semibold text-[#92400E]">
            {esperando === 1 ? "1 aprovação espera" : `${esperando} aprovações esperam`} por você
          </p>
          <p className="mt-0.5 text-[12px] text-[#B45309]">
            Nada vai ao ar antes de você aprovar. É só dar uma olhada na aba de aprovações.
          </p>
        </div>
      )}

      {porMes.map(([chave, doMes]) => {
        // Maiúscula só na PRIMEIRA letra, e não via `capitalize` do CSS: ele
        // capitaliza toda palavra e escreve "Julho De 2026", que está errado
        // em português e é o tipo de detalhe que o cliente lê como desleixo.
        const titulo = chave === "sem-data"
          ? "Ainda sem data"
          : maiuscula(`${MESES[Number(chave.slice(5, 7)) - 1]} de ${chave.slice(0, 4)}`);
        return (
          <section key={chave}>
            <div className="mb-2.5 flex items-baseline justify-between gap-3">
              <h3 className="text-[14px] font-bold text-[var(--text-primary)]">{titulo}</h3>
              <span className="text-[12px] text-[var(--text-muted)]">
                {doMes.length} {doMes.length === 1 ? "peça" : "peças"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
              {doMes.map((p) => {
                const e = estado(p.status, aprovacoesPendentes > 0);
                const d = p.scheduledFor ? new Date(p.scheduledFor) : null;
                const capa = urlDeMidiaDoPortal(p.mediaUrl, token);
                return (
                  <article
                    key={p.id}
                    className="overflow-hidden rounded-[12px] border border-[var(--border)] bg-white shadow-[0_1px_2px_rgba(7,10,31,0.03)]"
                  >
                    <div className="relative aspect-square bg-[#F2F2EF]">
                      {capa ? (
                        // A miniatura passa pelo mesmo endereço protegido do
                        // resto da mídia. Em modo cookie a URL sai SEM token —
                        // credencial não fica no DOM (A4, urlDeMidiaDoPortal).
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={capa}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center px-3 text-center">
                          <span className="text-[11px] leading-snug text-[var(--text-muted)]">
                            arte em produção
                          </span>
                        </div>
                      )}

                      {d && (
                        <div className="absolute left-2 top-2 rounded-[8px] bg-white/95 px-2 py-1 text-center shadow-sm backdrop-blur">
                          <div className="text-[14px] font-bold leading-none text-[var(--text-primary)]">{d.getDate()}</div>
                          <div className="mt-0.5 text-[9px] uppercase tracking-wide text-[var(--text-muted)]">{DIAS[d.getDay()]}</div>
                        </div>
                      )}

                      <span
                        className="absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{ background: e.fundo, color: e.cor }}
                      >
                        {e.texto}
                      </span>
                    </div>

                    <div className="p-3">
                      <div className="flex items-center gap-1.5">
                        <span className="rounded-[6px] bg-[#F2F2EF] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">
                          {rotuloDeFormato(p.format)}
                        </span>
                        {p.pillar && (
                          <span className="truncate text-[10.5px] text-[var(--text-muted)]">{p.pillar}</span>
                        )}
                      </div>
                      <p className="mt-1.5 line-clamp-3 text-[12.5px] leading-snug text-[var(--text-primary)]">
                        {p.caption || <span className="italic text-[var(--text-muted)]">Legenda em produção</span>}
                      </p>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
