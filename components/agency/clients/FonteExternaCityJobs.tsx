"use client";

// FonteExternaCityJobs — a saúde da integração do City Jobs como FONTE EXTERNA
// (CJ-J2, ficha `.despacho/J2-telas.md`, 28/09/2026).
//
// O City Jobs continua dono de vaga, seleção, pagamento e arte; a Dioli só
// publica e cuida de token, renovação e alarme (ordem do CEO, contrato em
// `docs/integracoes/cityjobs-contrato.md`). Este bloco não decide nada — é
// leitura de saúde da conexão para a equipe/CEO, na aba Social Media da
// marca City Jobs: segredo HMAC configurado, webhook configurado, último post
// recebido, últimos erros de webhook.
//
// ⚠️ ESTADO REAL EM 28/09/2026: a rota de status ainda NÃO EXISTE. `CJ-J1`
// (plataforma) desenhou o contrato (schema `PostExterno`/`EventoDeWebhook`,
// endpoints `POST/GET /api/integracoes/cityjobs/posts...`) mas a saída em
// `.despacho/J1-cityjobs.out` está vazia e nada disso está no disco — nem
// schema, nem `lib/integracoes/cityjobs/`, nem `app/api/integracoes/`.
// O contrato (`docs/integracoes/cityjobs-contrato.md`) também não previa um
// endpoint agregado de SAÚDE — só `POST /posts` e `GET /posts/{idExterno}`
// (um post por vez). Por isso este bloco não inventa dado nem chama uma rota
// que não existe silenciosamente: ele tenta
// `GET /api/agency/clients/{id}/integracoes/cityjobs` — o contrato que este
// bloco PRECISA que a plataforma entregue — e, enquanto ela devolver 404,
// mostra o estado "indisponivel" nomeando exatamente o que falta. Ver o
// registro de oficina para o contrato completo proposto.
//
// Guardrail 1 da casa: ausência de informação não é informação. Nenhum campo
// aqui é estimado — "Configurado"/"Não configurado" só aparece quando o
// servidor disser, nunca por suposição.

import { useCallback, useEffect, useState } from "react";

interface SaudeCityJobs {
  segredoConfigurado: boolean;
  webhookConfigurado: boolean;
  ultimoPostRecebidoEm: string | null;
  ultimosErrosWebhook: { ocorridoEm: string; motivo: string }[];
}

type Estado =
  | { fase: "carregando" }
  /** A rota de status respondeu 404 — ainda não foi construída. Não é erro
   *  de rede: é o trabalho da plataforma (CJ-J1) que falta. */
  | { fase: "indisponivel" }
  | { fase: "erro"; mensagem: string }
  | { fase: "ok"; dados: SaudeCityJobs };

function dataCurta(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function FonteExternaCityJobs({ clientId }: { clientId: string }) {
  const [estado, setEstado] = useState<Estado>({ fase: "carregando" });
  const [tentativa, setTentativa] = useState(0);

  const buscar = useCallback(async () => {
    setEstado({ fase: "carregando" });
    try {
      const r = await fetch(`/api/agency/clients/${clientId}/integracoes/cityjobs`, { cache: "no-store" });
      if (r.status === 404) {
        setEstado({ fase: "indisponivel" });
        return;
      }
      const j = await r.json().catch(() => null);
      if (!r.ok || !j) {
        setEstado({ fase: "erro", mensagem: "Não consegui carregar a saúde da integração agora." });
        return;
      }
      setEstado({
        fase: "ok",
        dados: {
          segredoConfigurado: !!j.segredoConfigurado,
          webhookConfigurado: !!j.webhookConfigurado,
          ultimoPostRecebidoEm: typeof j.ultimoPostRecebidoEm === "string" ? j.ultimoPostRecebidoEm : null,
          ultimosErrosWebhook: Array.isArray(j.ultimosErrosWebhook) ? j.ultimosErrosWebhook : [],
        },
      });
    } catch {
      setEstado({ fase: "erro", mensagem: "Sem conexão com o servidor. Tente de novo." });
    }
  }, [clientId]);

  useEffect(() => { void buscar(); }, [buscar, tentativa]);

  return (
    <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--border)] flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">Fonte externa: City Jobs</h2>
          <p className="text-[12px] text-[var(--text-muted)] mt-0.5 max-w-[46ch]">
            As vagas chegam prontas pela API do City Jobs — a Dioli só publica, com token,
            renovação e alarme. Este bloco mostra a saúde da conexão, não o conteúdo da vaga.
          </p>
        </div>
        <span className="shrink-0 text-[11px] font-medium px-2 py-1 rounded-full bg-[var(--accent)] text-[var(--text-secondary)]">
          SERVIDOR-A-SERVIDOR
        </span>
      </div>

      {estado.fase === "carregando" && (
        <div role="status" aria-live="polite" className="px-5 py-4 space-y-2">
          <div className="h-9 rounded-[8px] bg-[var(--accent)] animate-pulse" />
          <div className="h-9 rounded-[8px] bg-[var(--accent)] animate-pulse" />
          <span className="sr-only">Carregando a saúde da integração…</span>
        </div>
      )}

      {estado.fase === "indisponivel" && (
        <div className="px-5 py-6">
          <p className="text-[13px] font-medium text-[var(--text-primary)]">Sem status de integração ainda.</p>
          <p className="text-[12px] text-[var(--text-subtle)] mt-1.5 leading-relaxed max-w-[52ch]">
            A rota que informa segredo HMAC configurado, webhook configurado, último post
            recebido e últimos erros de webhook ainda não existe no servidor — é trabalho da
            <span className="font-medium text-[var(--text-secondary)]"> plataforma</span> (frente
            CJ-J1), não desta tela. Nenhum dado é estimado aqui enquanto ela não existir.
          </p>
          <button
            onClick={() => setTentativa((t) => t + 1)}
            className="mt-3 h-11 sm:h-8 px-3.5 rounded-[7px] border border-[var(--border-strong)] text-[12px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
          >
            Conferir de novo →
          </button>
        </div>
      )}

      {estado.fase === "erro" && (
        <div role="alert" className="px-5 py-6 text-center">
          <p className="text-[13px] font-medium text-[var(--text-primary)]">{estado.mensagem}</p>
          <button
            onClick={() => setTentativa((t) => t + 1)}
            className="mt-3 h-11 sm:h-8 px-3.5 rounded-[7px] border border-[var(--border-strong)] text-[12px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
          >
            Tentar de novo →
          </button>
        </div>
      )}

      {estado.fase === "ok" && (
        <div className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-elevated)] px-3.5 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)]">
                Segredo HMAC
              </div>
              <div
                className={
                  "text-[14px] font-semibold mt-0.5 " +
                  (estado.dados.segredoConfigurado ? "text-[var(--success)]" : "text-[var(--danger)]")
                }
              >
                {estado.dados.segredoConfigurado ? "Configurado" : "Não configurado"}
              </div>
            </div>
            <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-elevated)] px-3.5 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)]">
                Webhook de volta
              </div>
              <div
                className={
                  "text-[14px] font-semibold mt-0.5 " +
                  (estado.dados.webhookConfigurado ? "text-[var(--success)]" : "text-[var(--danger)]")
                }
              >
                {estado.dados.webhookConfigurado ? "Configurado" : "Não configurado"}
              </div>
            </div>
          </div>

          <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-elevated)] px-3.5 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)]">
              Último post recebido
            </div>
            <div
              className={
                "text-[14px] font-semibold mt-0.5 " +
                (dataCurta(estado.dados.ultimoPostRecebidoEm) ? "text-[var(--text-primary)]" : "text-[var(--text-subtle)]")
              }
            >
              {dataCurta(estado.dados.ultimoPostRecebidoEm) ?? "— nenhum recebido ainda"}
            </div>
          </div>

          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)] mb-1.5">
              Últimos erros de webhook
            </div>
            {estado.dados.ultimosErrosWebhook.length === 0 ? (
              <p className="text-[12px] text-[var(--text-subtle)]">Nenhum erro registrado.</p>
            ) : (
              <ul className="space-y-1.5">
                {estado.dados.ultimosErrosWebhook.slice(0, 5).map((e, i) => (
                  <li
                    key={i}
                    className="text-[12px] text-[var(--danger)] bg-[var(--danger-bg)] rounded-[8px] px-3 py-2"
                  >
                    <span className="font-medium">{dataCurta(e.ocorridoEm) ?? "—"}</span> · {e.motivo}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
