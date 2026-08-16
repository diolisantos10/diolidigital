"use client";

// /agency/avisos-de-orcamento — A FILA DA PORTA DE TRÁS.
//
// ── POR QUE ESTA TELA EXISTE (16/08/2026) ────────────────────────────────────
//
// Prospects preencheram o briefing público, o orçamento ficou pronto no
// portal e ninguém foi avisado — medido em produção: 51, 29 e 28 dias. O
// aviso sai por e-mail, mas `RESEND_FROM` não estava configurado no Railway,
// então ele falhava para todo mundo. Isso agora é GRAVADO e REENVIÁVEL
// (`app/api/agency/avisos-de-orcamento/route.ts`, commit `f8355075`) — mas
// uma rota que só se aciona por `curl` não vai ser acionada. No dia em que
// `RESEND_FROM` for setado, alguém tem de fazer a fila represada sair, e esse
// alguém não vai abrir um terminal. Esta tela é o botão.
//
// ── OS QUATRO BALDES, E POR QUE NÃO SE MISTURAM ──────────────────────────────
//
//   falhou   — o Resend recusou o envio. Há o que consertar. REENVIÁVEL.
//   skipped  — falta RESEND_API_KEY. É configuração, não defeito do pedido.
//              REENVIÁVEL (o mesmo botão dos dois — o servidor já os trata
//              como a mesma fila de reenvio).
//   sem_canal — o prospect não deixou e-mail. NÃO é falha, é fato: o portal
//              já entregou o orçamento, só não há para onde mandar o aviso
//              por fora. Aparece como CONTEXTO. Nunca ganha botão.
//   legado (avisoOrcamentoStatus NULL) — processado por uma versão do
//              relógio anterior a esta coluna existir: "não sabemos" se o
//              e-mail saiu. Reenviar aqui pode duplicar quem já recebeu — o
//              defeito OPOSTO e pior. Ação SEPARADA, NOMEADA, com
//              confirmação explícita — nunca uma caixinha ao lado do botão
//              normal.
//
// Custou um dia de auditoria para estes quatro ficarem distintos no dado
// (`lib/agency/esteira/orcamento-do-briefing.ts`). Tela que os junta desfaz
// isso — por isso cada um tem o próprio bloco visual e a própria ação (ou a
// ausência dela).

import { useCallback, useEffect, useState } from "react";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import EmptyState from "@/components/agency/ui/EmptyState";
import { NEGOCIO_NAO_INFORMADO } from "@/lib/agency/comercial/negocio-do-lead";

export type PendenteAviso = {
  id: string;
  negocio: string | null;
  status: "falhou" | "skipped";
  motivo: string | null;
  contatoEmail: string | null;
  desde: string | null;
  horasEsperando: number | null;
  tentativas: number;
};

export type BaldeLegados = {
  medido: boolean;
  total: number;
  itens: { id: string; businessName: string | null; contatoEmail: string }[];
  ambiguidade: string;
  motivo?: string;
};

export type BaldeSemCanal = { medido: boolean; total: number; ambiguidade: string; motivo?: string };

export type Dados = { total: number; pendentes: PendenteAviso[]; legados: BaldeLegados; semCanal: BaldeSemCanal };

export type Resposta =
  | { estado: "carregando" }
  /** "não consegui medir" tem tela própria — nunca vira "0 presos". Foi
   *  confundir os dois que deixou a fila da porta da frente invisível por
   *  sete semanas nesta casa (ver `docs/agents/interface/vitrine.md`). */
  | { estado: "erro"; motivo: string }
  | { estado: "ok"; dados: Dados };

export type ResultadoDoReenvio = { reenviados: number; aindaFalhando: number; falhas: string[] };

export type EstadoReenvio =
  | { fase: "idle" }
  | { fase: "enviando" }
  | { fase: "feito"; resultado: ResultadoDoReenvio }
  | { fase: "erro"; motivo: string };

export type EstadoReenvioLegados =
  | { fase: "idle" }
  | { fase: "confirmando" }
  | { fase: "enviando" }
  | { fase: "feito"; normal: ResultadoDoReenvio; legados: ResultadoDoReenvio }
  | { fase: "erro"; motivo: string };

/**
 * A CASCA QUE FALA COM O SERVIDOR — fetch, estado, nada de layout.
 *
 * Toda a aparência mora em `AvisosDeOrcamentoView`, que só recebe props e
 * nunca chama `fetch`. Foi assim que o resto da casa manteve a UI testável
 * sem servidor de verdade (ver `__tests__/agency/workspace-do-cliente/`,
 * modelo `ClientWorkspaceShell`): `useEffect` não roda em
 * `renderToStaticMarkup`, então um componente que busca o próprio dado só
 * seria testável de ponta a ponta, nunca por estado.
 */
export default function AvisosDeOrcamentoPage() {
  const [r, setR] = useState<Resposta>({ estado: "carregando" });
  const [reenvio, setReenvio] = useState<EstadoReenvio>({ fase: "idle" });
  const [reenvioLegados, setReenvioLegados] = useState<EstadoReenvioLegados>({ fase: "idle" });

  const carregar = useCallback(async () => {
    setR({ estado: "carregando" });
    try {
      const resp = await fetch("/api/agency/avisos-de-orcamento");
      const body = await resp.json();
      if (!resp.ok || body?.medido !== true) {
        setR({ estado: "erro", motivo: body?.motivo ?? "não consegui medir a fila de avisos agora" });
        return;
      }
      setR({
        estado: "ok",
        dados: {
          total: body.total ?? 0,
          pendentes: body.pendentes ?? [],
          legados: body.legados,
          semCanal: body.semCanal,
        },
      });
    } catch {
      setR({ estado: "erro", motivo: "não consegui falar com o servidor — esta fila não é zero, é desconhecida" });
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const reenviarPendentes = useCallback(async () => {
    setReenvio({ fase: "enviando" });
    try {
      const resp = await fetch("/api/agency/avisos-de-orcamento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await resp.json();
      if (!resp.ok || body?.ok !== true) {
        setReenvio({ fase: "erro", motivo: body?.motivo ?? "o servidor não confirmou o reenvio" });
      } else {
        setReenvio({
          fase: "feito",
          resultado: { reenviados: body.reenviados ?? 0, aindaFalhando: body.aindaFalhando ?? 0, falhas: body.falhas ?? [] },
        });
      }
    } catch {
      setReenvio({ fase: "erro", motivo: "não consegui falar com o servidor — não sei se algo saiu" });
    } finally {
      // Números sempre conferidos de novo — nunca um sucesso otimista que
      // não foi verificado contra o banco.
      void carregar();
    }
  }, [carregar]);

  const reenviarLegados = useCallback(async () => {
    setReenvioLegados({ fase: "enviando" });
    try {
      const resp = await fetch("/api/agency/avisos-de-orcamento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incluirLegados: true }),
      });
      const body = await resp.json();
      if (!resp.ok || body?.ok !== true) {
        setReenvioLegados({ fase: "erro", motivo: body?.motivo ?? "o servidor não confirmou o reenvio" });
      } else {
        setReenvioLegados({
          fase: "feito",
          normal: { reenviados: body.reenviados ?? 0, aindaFalhando: body.aindaFalhando ?? 0, falhas: body.falhas ?? [] },
          legados: {
            reenviados: body.legados?.reenviados ?? 0,
            aindaFalhando: body.legados?.aindaFalhando ?? 0,
            falhas: body.legados?.falhas ?? [],
          },
        });
      }
    } catch {
      setReenvioLegados({ fase: "erro", motivo: "não consegui falar com o servidor — não sei se algo saiu" });
    } finally {
      void carregar();
    }
  }, [carregar]);

  return (
    <AvisosDeOrcamentoView
      r={r}
      reenvio={reenvio}
      reenvioLegados={reenvioLegados}
      aoRecarregar={carregar}
      aoReenviarPendentes={reenviarPendentes}
      aoIniciarConfirmacaoLegados={() => setReenvioLegados({ fase: "confirmando" })}
      aoCancelarConfirmacaoLegados={() => setReenvioLegados({ fase: "idle" })}
      aoConfirmarReenvioLegados={reenviarLegados}
    />
  );
}

/**
 * A APARÊNCIA — puramente de props, nunca chama `fetch`. É o que
 * `__tests__/agency/avisos-de-orcamento/tela.test.tsx` renderiza direto,
 * com `renderToStaticMarkup`, passando cada um dos quatro estados à mão.
 */
export function AvisosDeOrcamentoView({
  r,
  reenvio,
  reenvioLegados,
  aoRecarregar,
  aoReenviarPendentes,
  aoIniciarConfirmacaoLegados,
  aoCancelarConfirmacaoLegados,
  aoConfirmarReenvioLegados,
}: {
  r: Resposta;
  reenvio: EstadoReenvio;
  reenvioLegados: EstadoReenvioLegados;
  aoRecarregar: () => void;
  aoReenviarPendentes: () => void;
  aoIniciarConfirmacaoLegados: () => void;
  aoCancelarConfirmacaoLegados: () => void;
  aoConfirmarReenvioLegados: () => void;
}) {
  const dados = r.estado === "ok" ? r.dados : null;
  const totalFalhou = dados ? dados.pendentes.filter((p) => p.status === "falhou").length : 0;
  const totalSkipped = dados ? dados.pendentes.filter((p) => p.status === "skipped").length : 0;

  return (
    <div className="max-w-[900px]">
      <AgencyHeader
        eyebrow="Comercial"
        title="Avisos de orçamento presos"
        subtitle="Prospects cujo orçamento ficou pronto no portal, mas o e-mail que avisa disso não saiu. O mais antigo em cima."
        meta={
          dados && dados.total > 0 ? (
            <Selo tom="danger">{dados.total} preso{dados.total === 1 ? "" : "s"}, esperando reenvio</Selo>
          ) : undefined
        }
      />

      {r.estado === "carregando" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-[76px] rounded-[12px] border border-[var(--border)] bg-[var(--bg)] animate-pulse" />
            ))}
          </div>
          {[0, 1].map((i) => (
            <div key={i} className="h-[100px] rounded-[12px] border border-[var(--border)] bg-[var(--bg)] animate-pulse" />
          ))}
        </div>
      )}

      {r.estado === "erro" && (
        <div role="alert" className="rounded-[12px] border border-[var(--danger)] bg-[var(--danger-bg)] px-5 py-4">
          <p className="text-[13px] font-semibold text-[var(--danger)]">Não consegui medir a fila</p>
          <p className="text-[13px] text-[var(--text-secondary)] mt-1 leading-relaxed">{r.motivo}</p>
          {/* ⚠️ Isto NUNCA vira "0 presos". "Não consegui contar" e "não há
              nada" são fatos opostos — confundi-los foi o que deixou a fila
              da porta da frente invisível por sete semanas nesta casa. */}
          <button
            onClick={() => aoRecarregar()}
            style={{ touchAction: "manipulation" }}
            className="mt-3 h-9 px-4 rounded-[8px] border border-[var(--border)] bg-white text-[13px] font-medium text-[var(--text-primary)]"
          >
            Tentar de novo
          </button>
        </div>
      )}

      {dados && (
        <div className="space-y-5">
          {/* ── OS QUATRO BALDES, DE RELANCE ────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Bucket rotulo="Falharam" valor={totalFalhou} tom={totalFalhou > 0 ? "danger" : "neutro"} />
            <Bucket rotulo="Sem configuração" valor={totalSkipped} tom={totalSkipped > 0 ? "warning" : "neutro"} />
            <Bucket
              rotulo="Sem e-mail"
              valor={dados.semCanal.medido ? dados.semCanal.total : null}
              tom="neutro"
              nota={!dados.semCanal.medido ? "não medido agora" : "não é falha — contexto"}
            />
            <Bucket
              rotulo="Legados (ambíguo)"
              valor={dados.legados.medido ? dados.legados.total : null}
              tom="neutro"
              nota={!dados.legados.medido ? "não medido agora" : "\"não sabemos\" se saiu"}
            />
          </div>

          {/* ── AÇÃO PRINCIPAL: OS PRESOS DE VERDADE ────────────────────── */}
          {dados.pendentes.length === 0 ? (
            // Fila vazia é o estado NORMAL desta tela — nada de vermelho,
            // nada de "erro". Todo orçamento entregue teve o aviso enviado
            // (ou ainda não há ninguém para avisar).
            <EmptyState
              title="Nenhum aviso preso"
              description="Todo orçamento entregue no portal teve o e-mail de aviso confirmado. Quando um envio falhar, ele aparece aqui."
            />
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-[var(--border)] bg-white px-4 sm:px-5 py-3.5">
                <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
                  Reenvia só o que está em <strong>falhou</strong> ou <strong>sem configuração</strong> — a
                  mesma lista mostrada abaixo. Quem já recebeu não é tocado.
                </p>
                <button
                  onClick={() => aoReenviarPendentes()}
                  disabled={reenvio.fase === "enviando"}
                  style={{ touchAction: "manipulation" }}
                  className="h-9 px-4 rounded-[8px] bg-[var(--sidebar)] text-white text-[13px] font-medium disabled:opacity-50 shrink-0"
                >
                  {reenvio.fase === "enviando" ? "Reenviando…" : `Reenviar ${dados.pendentes.length} pendente${dados.pendentes.length === 1 ? "" : "s"}`}
                </button>
              </div>

              {reenvio.fase === "feito" && (
                <ResultadoBox resultado={reenvio.resultado} />
              )}
              {reenvio.fase === "erro" && (
                <div role="alert" className="rounded-[12px] border border-[var(--danger)] bg-[var(--danger-bg)] px-4 py-3">
                  <p className="text-[13px] font-medium text-[var(--danger)]">O reenvio não foi confirmado</p>
                  <p className="text-[13px] text-[var(--text-secondary)] mt-1 leading-relaxed">{reenvio.motivo}</p>
                </div>
              )}

              <div className="space-y-2.5">
                {dados.pendentes.map((p) => (
                  <CartaoPendente key={p.id} p={p} />
                ))}
              </div>
            </div>
          )}

          {/* ── SEM E-MAIL — CONTEXTO, NUNCA BOTÃO ──────────────────────── */}
          {/* O texto abaixo é escrito aqui na tela, em português, e não
              repete o campo `ambiguidade` que a rota devolve (esse fica só
              como comentário de apoio para quem lê o código — ver
              `app/api/agency/avisos-de-orcamento/route.ts`, `avisoOrcamentoStatus
              = 'sem_canal'`). Quem opera não precisa saber o nome da coluna
              para entender que isto não é falha. */}
          {dados.semCanal.medido && dados.semCanal.total > 0 && (
            <div className="rounded-[12px] border border-[var(--border)] bg-[var(--bg)] px-4 sm:px-5 py-3.5">
              <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
                <strong className="text-[var(--text-primary)]">
                  {dados.semCanal.total} prospect{dados.semCanal.total === 1 ? "" : "s"}
                </strong>{" "}
                teve o orçamento entregue no portal sem deixar e-mail. Isso não é uma falha de envio — é
                só um fato: sem e-mail, não há para onde mandar o aviso. Por isso este bloco não tem
                botão de reenviar.
              </p>
            </div>
          )}

          {/* ── LEGADOS — AÇÃO SEPARADA, NOMEADA, COM CONFIRMAÇÃO ───────── */}
          {/* Mesma regra do bloco de sem e-mail acima: o texto é escrito
              aqui, em português, e não repete o campo `ambiguidade` da rota
              (que fica só como comentário de apoio no código — ver
              `avisoOrcamentoStatus NULL` em
              `app/api/agency/avisos-de-orcamento/route.ts`). */}
          <div className="rounded-[12px] border border-[var(--border-strong)] bg-white px-4 sm:px-5 py-4">
            <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-2">
              Balde dos legados — não sabemos se já saiu
            </p>
            <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
              Estes pedidos foram entregues no portal antes de a casa começar a registrar se o aviso de
              orçamento saiu ou não. Por isso não contam como &quot;falharam&quot; — contam como
              &quot;não sabemos&quot;. Eles nunca entram no reenvio principal; só saem daqui com uma
              confirmação separada, porque podem já ter sido recebidos.
            </p>

            {!dados.legados.medido && (
              <p className="text-[13px] text-[var(--danger)] mt-2">Não consegui medir este balde agora: {dados.legados.motivo}</p>
            )}

            {dados.legados.medido && dados.legados.total === 0 && (
              <p className="text-[13px] text-[var(--text-muted)] mt-2">Nenhum legado pendente agora.</p>
            )}

            {dados.legados.medido && dados.legados.total > 0 && (
              <div className="mt-3 space-y-3">
                <ul className="space-y-1.5">
                  {dados.legados.itens.map((it) => (
                    <li key={it.id} className="text-[13px] text-[var(--text-primary)]">
                      {it.businessName ? it.businessName : <span className="text-[var(--text-subtle)] italic">{NEGOCIO_NAO_INFORMADO}</span>}
                      <span className="text-[var(--text-muted)]"> · {it.contatoEmail}</span>
                    </li>
                  ))}
                </ul>

                {reenvioLegados.fase === "idle" && (
                  <button
                    onClick={() => aoIniciarConfirmacaoLegados()}
                    style={{ touchAction: "manipulation" }}
                    className="h-9 px-4 rounded-[8px] border border-[var(--warning)] text-[var(--warning)] bg-white text-[13px] font-medium"
                  >
                    Reenviar também os legados — talvez já tenham recebido
                  </button>
                )}

                {reenvioLegados.fase === "confirmando" && (
                  <div role="alert" className="rounded-[10px] border border-[var(--warning)] bg-[var(--warning-bg)] px-4 py-3.5">
                    <p className="text-[13px] font-semibold text-[var(--text-primary)]">
                      Tem certeza? Estas {dados.legados.total} pessoas podem já ter recebido o aviso.
                    </p>
                    <p className="text-[13px] text-[var(--text-secondary)] mt-1 leading-relaxed">
                      Não há como saber ao certo — a casa só passou a registrar o resultado do envio depois
                      que estes pedidos foram processados. Reenviar pode significar mandar o mesmo aviso
                      duas vezes. Isto também reenvia, de novo, os pendentes normais listados acima.
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => aoConfirmarReenvioLegados()}
                        style={{ touchAction: "manipulation" }}
                        className="h-9 px-4 rounded-[8px] bg-[var(--danger)] text-white text-[13px] font-medium"
                      >
                        Sim, reenviar mesmo assim
                      </button>
                      <button
                        onClick={() => aoCancelarConfirmacaoLegados()}
                        style={{ touchAction: "manipulation" }}
                        className="h-9 px-4 rounded-[8px] border border-[var(--border)] bg-white text-[13px] font-medium text-[var(--text-primary)]"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}

                {reenvioLegados.fase === "enviando" && (
                  <p className="text-[13px] text-[var(--text-muted)]" role="status" aria-live="polite">
                    Reenviando…
                  </p>
                )}

                {reenvioLegados.fase === "feito" && (
                  <div className="space-y-2">
                    <div>
                      <p className="text-[12px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-1">Pendentes normais</p>
                      <ResultadoBox resultado={reenvioLegados.normal} />
                    </div>
                    <div>
                      <p className="text-[12px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-1">Legados</p>
                      <ResultadoBox resultado={reenvioLegados.legados} />
                    </div>
                  </div>
                )}

                {reenvioLegados.fase === "erro" && (
                  <div role="alert" className="rounded-[10px] border border-[var(--danger)] bg-[var(--danger-bg)] px-4 py-3">
                    <p className="text-[13px] font-medium text-[var(--danger)]">O reenvio não foi confirmado</p>
                    <p className="text-[13px] text-[var(--text-secondary)] mt-1 leading-relaxed">{reenvioLegados.motivo}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CartaoPendente({ p }: { p: PendenteAviso }) {
  const dias = p.horasEsperando !== null ? Math.floor(p.horasEsperando / 24) : null;
  const tempo =
    dias !== null
      ? dias >= 1
        ? `há ${dias} dia${dias === 1 ? "" : "s"}`
        : `há ${p.horasEsperando}h`
      : "tempo não registrado";

  return (
    <div className="rounded-[12px] border border-[var(--border)] bg-white px-4 sm:px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {/* Ausência declarada, nunca buraco branco — mesma forma que o
              resto da casa usa para "não informado" (ver `app/agency/leads/page.tsx`):
              13px, `--text-subtle`, itálico, sem `font-semibold`. */}
          {p.negocio ? (
            <p className="text-[15px] font-semibold text-[var(--text-primary)] truncate">{p.negocio}</p>
          ) : (
            <p className="text-[13px] text-[var(--text-subtle)] italic truncate">{NEGOCIO_NAO_INFORMADO}</p>
          )}
          {/* DECISÃO DO DIRETOR (16/08/2026), registrada aqui porque é aqui
              que a lista monta e-mail de prospect. Histórico do dia: o
              Essencial `seguranca` mediu que esta TELA (`proxy.ts` +
              `paginas.ts`, `acesso: "dono_e_gestao"` — só gestão e
              `client-service-sdr` chegam aqui) sempre foi mais estreita que a
              API que a alimenta (`app/api/agency/avisos-de-orcamento/route.ts`,
              então em `requireSession()` sem `allowedRoles`, aceitando
              QUALQUER papel interno). O Diretor primeiro decidiu MANTER a API
              mais aberta por ora, para não apertar papel de equipe no meio de
              um piloto ao vivo sem medir o custo. Ele reabriu a decisão NO
              MESMO DIA, com o custo medido: ZERO — a única porta para a API é
              esta tela, e esta tela já era restrita; manter a API mais aberta
              não protegia operação nenhuma, só deixava porta lateral para a
              próxima auditoria reencontrar. A API foi FECHADA na mesma sessão:
              `autenticar()` agora chama
              `exigirApiInterna("/agency/avisos-de-orcamento")`
              (`lib/agency/organizacao/guarda.ts`), a MESMA `podeAbrirRota`
              que esta página já usava — TELA e API dizem a mesma coisa agora,
              e não têm como voltar a divergir sem alguém mudar as duas de
              propósito. */}
          <p className="text-[13px] text-[var(--text-muted)] mt-0.5">
            {p.contatoEmail ?? "e-mail não lido"} · {tempo} · tentado {p.tentativas}×
          </p>
        </div>
        <Selo tom={p.status === "falhou" ? "danger" : "warning"}>
          {p.status === "falhou" ? "Falhou o envio" : "Sem configuração"}
        </Selo>
      </div>
      <p className="text-[13px] text-[var(--text-secondary)] mt-2.5 leading-relaxed">
        {p.motivo ?? "motivo não registrado"}
      </p>
    </div>
  );
}

function ResultadoBox({ resultado }: { resultado: ResultadoDoReenvio }) {
  const nada = resultado.reenviados === 0 && resultado.aindaFalhando === 0 && resultado.falhas.length === 0;
  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-[10px] border border-[var(--border)] bg-[var(--bg)] px-4 py-3 space-y-1"
    >
      {nada ? (
        <p className="text-[13px] text-[var(--text-muted)]">Nada para reenviar neste balde.</p>
      ) : (
        <>
          <p className="text-[13px] text-[var(--text-primary)]">
            <strong className="text-[var(--success)]">{resultado.reenviados}</strong> saíram agora ·{" "}
            <strong className={resultado.aindaFalhando > 0 ? "text-[var(--danger)]" : "text-[var(--text-muted)]"}>
              {resultado.aindaFalhando}
            </strong>{" "}
            ainda falhando
          </p>
          {resultado.falhas.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {resultado.falhas.map((f, i) => (
                <li key={i} className="text-[12px] text-[var(--danger)]">{f}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function Bucket({
  rotulo,
  valor,
  tom,
  nota,
}: {
  rotulo: string;
  valor: number | null;
  tom: "danger" | "warning" | "neutro";
  nota?: string;
}) {
  const cor =
    tom === "danger" ? "text-[var(--danger)]" : tom === "warning" ? "text-[var(--warning)]" : "text-[var(--text-primary)]";
  return (
    <div className="rounded-[12px] border border-[var(--border)] bg-white px-3.5 py-3">
      <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em]">{rotulo}</p>
      <p className={`text-[22px] font-semibold tracking-[-0.02em] mt-0.5 ${cor}`}>{valor === null ? "—" : valor}</p>
      {nota && <p className="text-[11px] text-[var(--text-subtle)] mt-0.5">{nota}</p>}
    </div>
  );
}

function Selo({ tom, children }: { tom: "danger" | "warning" | "success" | "info"; children: React.ReactNode }) {
  const cor = {
    danger: "bg-[var(--danger-bg)] text-[var(--danger)]",
    warning: "bg-[var(--warning-bg)] text-[var(--warning)]",
    success: "bg-[var(--success-bg)] text-[var(--success)]",
    info: "bg-[var(--info-bg)] text-[var(--info)]",
  }[tom];
  return (
    <span
      className={`inline-flex items-center gap-1.5 min-h-6 max-w-full px-2.5 py-1 rounded-[6px] text-[12px] font-semibold leading-tight shrink-0 ${cor}`}
    >
      {children}
    </span>
  );
}
