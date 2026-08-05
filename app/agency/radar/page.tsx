"use client";

// /agency/radar — A FILA DE VALIDAÇÃO DO RADAR DIOLI.
//
// O Radar tinha serviço (`lib/agency/radar/`, 322 linhas), rotina de cron e
// três rotas de API — e NENHUM link na interface. Ou seja: o robô varria o
// mercado, gravava tendências como `pending` à espera de um humano, e nenhum
// humano tinha por onde chegar nelas. Trabalho feito que o destinatário não vê
// é o quarto estado da §7.4 do DESIGN.md.
//
// Esta tela é a porta que faltava: o que o Radar propôs, quem propôs, e os dois
// botões que decidem. Aprovar coloca a diretriz EM VIGOR para os agentes (e
// arquiva a versão anterior do mesmo tópico); recusar descarta.

import { useCallback, useEffect, useState } from "react";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import EmptyState from "@/components/agency/ui/EmptyState";
import Button from "@/components/agency/ui/Button";
import { mensagemDeErro, type ErroHumano } from "@/components/agency/ui/mensagemDeErro";

interface Insight {
  id: string;
  domain: string;
  topic: string;
  title: string;
  guidance: string;
  source: string;
  sourceName: string | null;
  sourceUrl: string | null;
  createdAt: string;
}

const DOMINIO: Record<string, string> = {
  social: "Social",
  design: "Design",
  "paid-traffic": "Tráfego pago",
  analytics: "Analytics",
  seo: "SEO",
  general: "Geral",
};

export default function RadarPage() {
  const [pendentes, setPendentes] = useState<Insight[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<ErroHumano | null>(null);
  const [decidindo, setDecidindo] = useState<string | null>(null);
  const [varrendo, setVarrendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const res = await fetch("/api/radar/insights");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { pending?: Insight[] };
      setPendentes(json.pending ?? []);
    } catch (e) {
      setErro(mensagemDeErro(e, "carregar a fila do Radar"));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  async function decidir(id: string, action: "approve" | "reject") {
    setDecidindo(id);
    setErro(null);
    try {
      const res = await fetch(`/api/radar/insights/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      setPendentes((ps) => ps.filter((p) => p.id !== id));
      setAviso(action === "approve" ? "Diretriz em vigor — os agentes já usam." : "Tendência recusada.");
    } catch (e) {
      setErro(mensagemDeErro(e, "registrar sua decisão"));
    } finally {
      setDecidindo(null);
    }
  }

  async function varrer() {
    setVarrendo(true);
    setErro(null);
    setAviso(null);
    try {
      const res = await fetch("/api/radar/scan", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await carregar();
      setAviso("Varredura concluída. O que ele achou entra aqui como pendente.");
    } catch (e) {
      setErro(mensagemDeErro(e, "rodar a varredura do Radar"));
    } finally {
      setVarrendo(false);
    }
  }

  return (
    <>
      <AgencyHeader
        title="Radar do mercado"
        eyebrow="Inteligência"
        subtitle="O que o Radar encontrou e ainda depende de você. Aprovado vira diretriz que os agentes seguem."
        actions={
          // Com a fila vazia, o botão da vez é o do estado vazio — dois iguais
          // na mesma tela é ruído, não conveniência.
          pendentes.length > 0 ? (
            <Button variant="primary" onClick={varrer} disabled={varrendo}>
              {varrendo ? "Buscando…" : "Buscar agora"}
            </Button>
          ) : undefined
        }
      />

      {aviso && (
        <div role="status" className="mb-4 rounded-[8px] bg-[var(--success-bg)] border border-[#BBF7D0] px-4 py-2.5">
          <p className="text-[13px] text-[#15803D]">{aviso}</p>
        </div>
      )}

      {erro && (
        <div role="alert" className="mb-4 rounded-[8px] bg-[var(--danger-bg)] border border-[#FCA5A5] px-4 py-3">
          <p className="text-[13px] text-[#991B1B]">{erro.mensagem}</p>
          {erro.detalhe && (
            <p className="text-[11px] text-[#991B1B]/70 mt-1 break-words">Detalhe técnico: {erro.detalhe}</p>
          )}
          <button
            onClick={() => { setCarregando(true); void carregar(); }}
            className="mt-2 h-8 px-3 rounded-[6px] border border-[#FCA5A5] text-[12px] font-medium text-[#991B1B] hover:bg-white/60 transition-colors"
          >
            Tentar de novo
          </button>
        </div>
      )}

      {carregando ? (
        <ul className="space-y-2 list-none p-0 m-0" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <li key={i} className="bg-white rounded-[12px] border border-[var(--border)] p-4">
              <div className="h-3 w-24 rounded bg-[var(--accent)] animate-pulse" />
              <div className="h-4 w-3/4 rounded bg-[var(--accent)] animate-pulse mt-3" />
              <div className="h-3 w-full rounded bg-[var(--accent)] animate-pulse mt-2" />
            </li>
          ))}
        </ul>
      ) : pendentes.length === 0 && !erro ? (
        <EmptyState
          title="Nada esperando por você"
          description="O Radar varre as fontes oficiais e as tendências do mercado. Quando encontra algo que muda como a agência trabalha, a proposta aparece aqui para você aprovar ou recusar."
          action={<Button variant="primary" onClick={varrer} disabled={varrendo}>{varrendo ? "Buscando…" : "Buscar agora"}</Button>}
        />
      ) : (
        <ul className="space-y-2 list-none p-0 m-0">
          {pendentes.map((i) => (
            <li key={i.id} className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="inline-flex h-5 px-2 items-center rounded-full bg-[var(--accent)] text-[11px] font-semibold text-[var(--text-secondary)]">
                  {DOMINIO[i.domain] ?? i.domain}
                </span>
                <span className={`inline-flex h-5 px-2 items-center rounded-full text-[11px] font-semibold ${
                  i.source === "official"
                    ? "bg-[var(--info-bg)] text-[var(--info)]"
                    : "bg-[var(--warning-bg)] text-[var(--warning)]"
                }`}>
                  {i.source === "official" ? "Fonte oficial" : "Tendência"}
                </span>
                <span className="text-[12px] text-[var(--text-muted)]">· {i.topic}</span>
              </div>

              <h3 className="text-[15px] font-semibold text-[var(--text-primary)] mt-2 leading-snug">{i.title}</h3>
              <p className="text-[13px] text-[var(--text-secondary)] mt-1.5 leading-relaxed">{i.guidance}</p>

              {(i.sourceName || i.sourceUrl) && (
                <p className="text-[12px] text-[var(--text-muted)] mt-2 break-words">
                  Origem: {i.sourceName ?? "não informada"}
                  {i.sourceUrl && (
                    <>
                      {" · "}
                      <a href={i.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline text-[var(--text-secondary)]">
                        abrir a fonte
                      </a>
                    </>
                  )}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-[var(--border)]">
                <button
                  onClick={() => decidir(i.id, "approve")}
                  disabled={decidindo === i.id}
                  className="h-9 px-4 rounded-[7px] bg-[var(--navy)] text-white text-[13px] font-semibold disabled:opacity-50 transition-colors"
                >
                  {decidindo === i.id ? "…" : "Colocar em vigor"}
                </button>
                <button
                  onClick={() => decidir(i.id, "reject")}
                  disabled={decidindo === i.id}
                  className="h-9 px-4 rounded-[7px] border border-[var(--border)] text-[var(--text-secondary)] text-[13px] font-medium disabled:opacity-50 hover:bg-[var(--accent)] transition-colors"
                >
                  Recusar
                </button>
                <span className="text-[12px] text-[var(--text-muted)] ml-auto">
                  Encontrado em {new Date(i.createdAt).toLocaleDateString("pt-BR")}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
