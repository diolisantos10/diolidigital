"use client";

// /agency/oportunidades — RADAR DE OPORTUNIDADES.
//
// A mesa onde o Diretor decide, uma a uma, se a agência vai atrás de um projeto
// que apareceu numa plataforma de freelas. Três perguntas, nesta ordem:
//
//   1. "Vale a pena?"  → a nota, o serviço sugerido, o valor e o porquê em uma
//                        linha. Isso é a lista, ordenada pela nota: o que vale
//                        mais fica em cima, porque tempo de triagem é escasso.
//   2. "O que eu mando?" → o cartão aberto, com o texto original de um lado e a
//                        proposta pronta do outro.
//   3. "Mandei?"       → o status, que é o que impede a mesma oportunidade de
//                        ser trabalhada duas vezes ou nenhuma.
//
// POR QUE a tela termina em COPIAR e não em ENVIAR: nas plataformas de freela,
// envio por robô é conta banida. O envio é da mão do operador, dentro do site
// deles. Então o entregável desta tela é a proposta na área de transferência —
// e por isso o "Copiado ✓" não é enfeite, é a confirmação do produto.
//
// O backend vive em `lib/agency/comercial/oportunidade.ts` e em
// `/api/agency/oportunidades` (GET lista · POST analisa · PATCH [id] decide).
// A leitura é tolerante (ver `contratoDeOportunidade.ts`) e, se a rota ainda não
// existir, a tela cai no estado vazio — nunca numa tela de erro em branco.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import EmptyState from "@/components/agency/ui/EmptyState";
import Button from "@/components/agency/ui/Button";
import { mensagemDeErro, type ErroHumano } from "@/components/agency/ui/mensagemDeErro";
import CartaoDeOportunidade from "@/components/agency/comercial/CartaoDeOportunidade";
import {
  ABAS,
  PLATAFORMAS,
  normalizarLista,
  normalizarOportunidade,
  urlSolta,
  type Oportunidade,
  type StatusDaOportunidade,
} from "@/components/agency/comercial/contratoDeOportunidade";

const ROTA = "/api/agency/oportunidades";

export default function OportunidadesPage() {
  const [lista, setLista] = useState<Oportunidade[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<ErroHumano | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [aba, setAba] = useState<StatusDaOportunidade | "todas">("nova");
  const [abertaId, setAbertaId] = useState<string | null>(null);
  const [decidindoId, setDecidindoId] = useState<string | null>(null);

  // ── Caixa de colar ────────────────────────────────────────────────────────
  const [colado, setColado] = useState("");
  const [plataforma, setPlataforma] = useState(PLATAFORMAS[0].id);
  const [analisando, setAnalisando] = useState(false);
  const [erroAoAnalisar, setErroAoAnalisar] = useState<ErroHumano | null>(null);
  const campoRef = useRef<HTMLTextAreaElement>(null);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const res = await fetch(ROTA, { cache: "no-store" });
      // 404 aqui significa "a rota ainda não subiu", não "o dado sumiu". Mostrar
      // erro vermelho nesse caso ensina o operador a ignorar o vermelho.
      if (res.status === 404) {
        setLista([]);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setLista(normalizarLista(await res.json()));
    } catch (e) {
      setErro(mensagemDeErro(e, "carregar as oportunidades"));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function analisar() {
    const texto = colado.trim();
    if (!texto || analisando) return;
    setAnalisando(true);
    setErroAoAnalisar(null);
    setAviso(null);
    try {
      const res = await fetch(ROTA, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Quando o que foi colado é só um link, ele vai TAMBÉM no campo `url`:
        // é assim que o backend deduz a plataforma e guarda o endereço do
        // anúncio para o time abrir depois.
        body: JSON.stringify({ texto, plataforma, url: urlSolta(texto) }),
      });
      if (res.status === 404) {
        throw new Error("A análise ainda não está disponível neste ambiente. Tente de novo em instantes.");
      }
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as Record<string, unknown>;
      const nova = normalizarOportunidade(json.oportunidade ?? json.item ?? json);
      setColado("");
      if (nova) {
        // Entra na lista já ordenada e ABERTA: quem acabou de colar quer ler a
        // proposta agora, não caçar o cartão no meio da fila.
        setLista((atual) => normalizarLista([nova, ...atual.filter((o) => o.id !== nova.id)]));
        setAba(nova.status);
        setAbertaId(nova.id);
        // `jaExistia` vem do backend por causa da dedup. Fingir que registrou de
        // novo faria o operador achar que tem duas oportunidades quando tem uma.
        setAviso(
          json.jaExistia === true
            ? "Esse projeto já estava na fila — abrimos o cartão que já existe, sem duplicar."
            : "Oportunidade registrada. Abra o cartão para ver a proposta."
        );
      } else {
        await carregar();
      }
    } catch (e) {
      setErroAoAnalisar(mensagemDeErro(e, "analisar esta oportunidade"));
    } finally {
      setAnalisando(false);
    }
  }

  async function decidir(id: string, status: StatusDaOportunidade) {
    const anterior = lista;
    setDecidindoId(id);
    setErro(null);
    // Atualização otimista: a decisão é do operador e ele já sabe o resultado.
    // Se o servidor recusar, a lista volta ao estado anterior e o erro aparece.
    setLista((atual) => atual.map((o) => (o.id === id ? { ...o, status } : o)));
    try {
      const res = await fetch(`${ROTA}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      // O servidor devolve a linha depois da escrita. Adotar a versão dele
      // fecha a diferença entre o que a tela supôs e o que ficou gravado.
      const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const confirmada = normalizarOportunidade(j.oportunidade);
      if (confirmada) {
        setLista((atual) => atual.map((o) => (o.id === id ? confirmada : o)));
      }
      // O cartão sai da aba atual quando o status muda. Dizer PARA ONDE ele foi
      // evita a sensação de "sumiu" — o quarto estado da §7.4 em miniatura.
      setAviso(
        status === "aprovada"
          ? "Aprovada e copiada. Ela está em “Aprovadas” — cole na plataforma e depois marque como enviada."
          : status === "enviada"
            ? "Marcada como enviada. Ela está em “Enviadas”."
            : "Recusada. Ela fica em “Recusadas”, caso você mude de ideia."
      );
    } catch (e) {
      setLista(anterior);
      setErro(mensagemDeErro(e, "registrar sua decisão"));
    } finally {
      setDecidindoId(null);
    }
  }

  const contagem = useMemo(() => {
    const base: Record<string, number> = { todas: lista.length };
    for (const o of lista) base[o.status] = (base[o.status] ?? 0) + 1;
    return base;
  }, [lista]);

  const visiveis = useMemo(
    () => (aba === "todas" ? lista : lista.filter((o) => o.status === aba)),
    [lista, aba]
  );

  function focarCaixa() {
    campoRef.current?.focus();
    campoRef.current?.scrollIntoView({ block: "center", behavior: "instant" });
  }

  return (
    <>
      <AgencyHeader
        title="Radar de oportunidades"
        eyebrow="Comercial"
        subtitle="Cole o projeto que apareceu na plataforma. A análise dá a nota, o serviço e o valor — e devolve a proposta pronta para você colar lá dentro."
      />

      {/* ── Caixa de colar ───────────────────────────────────────────────────
          É o primeiro bloco da tela porque é a primeira coisa que se faz aqui:
          chegou uma oportunidade, cola. */}
      <section className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4 md:p-5">
        <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Colar a oportunidade</h2>
        <p className="text-[13px] text-[var(--text-secondary)] mt-1 leading-relaxed max-w-[62ch]">
          O link do projeto ou o texto inteiro dele — os dois servem. Nada é enviado por aqui:
          quem manda a proposta é você, dentro da plataforma.
        </p>

        <label htmlFor="colar-oportunidade" className="block text-[12px] font-medium text-[var(--text-secondary)] mt-4 mb-1.5">
          Link ou texto do projeto
        </label>
        <textarea
          id="colar-oportunidade"
          ref={campoRef}
          value={colado}
          onChange={(e) => setColado(e.target.value)}
          rows={5}
          placeholder={"Cole aqui…\n\nex.: https://www.99freelas.com.br/project/… ou o texto completo do projeto"}
          // 16px no celular por decisão da §3 do DESIGN.md: abaixo disso o iOS dá
          // zoom sozinho ao focar o campo — e este é O campo da tela.
          className="w-full px-3 py-2.5 text-[16px] md:text-[14px] leading-relaxed bg-[var(--bg)] border border-[var(--border)] rounded-[8px] outline-none focus:border-[var(--navy)] focus:bg-white resize-y min-h-[120px]"
        />

        <div className="flex flex-col sm:flex-row sm:items-end gap-3 mt-3">
          <div className="sm:w-[240px]">
            <label htmlFor="plataforma-oportunidade" className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">
              Plataforma
            </label>
            <select
              id="plataforma-oportunidade"
              value={plataforma}
              onChange={(e) => setPlataforma(e.target.value)}
              className="w-full h-9 px-3 text-[16px] md:text-[14px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white"
            >
              {PLATAFORMAS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:ml-auto">
            <Button
              variant="primary"
              size="lg"
              onClick={() => void analisar()}
              disabled={!colado.trim() || analisando}
              className="w-full sm:w-auto"
            >
              {analisando ? "Analisando…" : "Analisar"}
            </Button>
          </div>
        </div>

        {analisando && (
          <p role="status" aria-live="polite" className="text-[12px] text-[var(--text-muted)] mt-2.5">
            Lendo o projeto, comparando com o que a agência entrega e escrevendo a proposta…
          </p>
        )}

        {erroAoAnalisar && (
          <div role="alert" className="mt-3 rounded-[8px] bg-[var(--danger-bg)] border border-[#FCA5A5] px-3 py-2.5">
            <p className="text-[13px] text-[var(--danger)]">{erroAoAnalisar.mensagem}</p>
            {erroAoAnalisar.detalhe && (
              <p className="text-[12px] text-[var(--danger)]/70 mt-1 break-words">
                Detalhe técnico: {erroAoAnalisar.detalhe}
              </p>
            )}
            <button
              onClick={() => void analisar()}
              className="mt-2 h-8 px-3 rounded-[6px] border border-[#FCA5A5] text-[12px] font-medium text-[var(--danger)] hover:bg-white/60 transition-colors"
            >
              Tentar de novo
            </button>
          </div>
        )}
      </section>

      {/* ── Avisos e erros da lista ──────────────────────────────────────────── */}
      {aviso && (
        <div role="status" className="mt-4 rounded-[8px] bg-[var(--success-bg)] border border-[#BBF7D0] px-4 py-2.5">
          <p className="text-[13px] text-[var(--success)]">{aviso}</p>
        </div>
      )}

      {erro && (
        <div role="alert" className="mt-4 rounded-[8px] bg-[var(--danger-bg)] border border-[#FCA5A5] px-4 py-3">
          <p className="text-[13px] text-[var(--danger)]">{erro.mensagem}</p>
          {erro.detalhe && (
            <p className="text-[12px] text-[var(--danger)]/70 mt-1 break-words">Detalhe técnico: {erro.detalhe}</p>
          )}
          <button
            onClick={() => {
              setCarregando(true);
              void carregar();
            }}
            className="mt-2 h-8 px-3 rounded-[6px] border border-[#FCA5A5] text-[12px] font-medium text-[var(--danger)] hover:bg-white/60 transition-colors"
          >
            Tentar de novo
          </button>
        </div>
      )}

      {/* ── Abas de triagem ──────────────────────────────────────────────────
          O cartão decidido não some do produto: ele muda de aba. Some é o que
          faz o operador desconfiar da ferramenta. */}
      {/* Fila vazia (ou erro ao carregar) não mostra cinco filtros zerados: são
          cinco controles que não fazem nada, logo acima da mensagem que
          realmente importa. */}
      {lista.length > 0 && (
      <nav aria-label="Filtrar por situação" className="flex flex-wrap gap-1.5 mt-6 mb-3">
        {ABAS.map((a) => {
          const ativa = aba === a.id;
          const n = contagem[a.id] ?? 0;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => setAba(a.id)}
              aria-current={ativa ? "true" : undefined}
              className={`h-8 px-3 rounded-[7px] text-[13px] font-medium transition-colors ${
                ativa
                  ? "bg-[var(--navy)] text-white"
                  : "bg-white border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--accent)]"
              }`}
            >
              {a.label}
              <span className={`mono-num ml-1.5 ${ativa ? "text-white/70" : "text-[var(--text-muted)]"}`}>{n}</span>
            </button>
          );
        })}
      </nav>
      )}

      {/* ── Os três estados obrigatórios + a lista ─────────────────────────────
          Sem as abas na tela, o espaço que elas davam some junto — por isso a
          margem vem daqui quando elas não existem. */}
      <div className={lista.length > 0 ? "" : "mt-5"}>
      {carregando ? (
        <ul className="space-y-2 list-none p-0 m-0" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <li key={i} className="bg-white rounded-[12px] border border-[var(--border)] p-4 flex gap-3">
              <div className="w-[46px] sm:w-[54px] h-[46px] rounded-[10px] bg-[var(--accent)] animate-pulse shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="h-3 w-24 rounded bg-[var(--accent)] animate-pulse" />
                <div className="h-4 w-3/4 rounded bg-[var(--accent)] animate-pulse mt-2.5" />
                <div className="h-3 w-full rounded bg-[var(--accent)] animate-pulse mt-2" />
              </div>
            </li>
          ))}
        </ul>
      ) : lista.length === 0 && !erro ? (
        <EmptyState
          icon={
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none" aria-hidden>
              <circle cx="7" cy="7" r="4.6" stroke="currentColor" strokeWidth="1.3" />
              <path d="M10.4 10.4L14 14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          }
          title="Nenhuma oportunidade no radar"
          description="Achou um projeto no 99Freelas, Workana ou Upwork? Cole aqui em cima. A análise diz se vale a pena, com qual serviço e por quanto — e já escreve a proposta."
          action={
            <Button variant="primary" onClick={focarCaixa}>
              Colar a primeira
            </Button>
          }
        />
      ) : visiveis.length === 0 && !erro ? (
        <EmptyState
          icon={
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M2.5 3.5h11l-4.2 5v4.2l-2.6 1.3V8.5l-4.2-5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
            </svg>
          }
          title={aba === "nova" ? "Nada esperando por você" : "Nada nesta situação"}
          description={
            aba === "nova"
              ? "Todas as oportunidades coladas já foram decididas. As outras abas mostram o que foi aprovado, enviado e recusado."
              : "Nenhuma oportunidade está nesta situação agora."
          }
          action={
            <Button variant="secondary" onClick={() => setAba("todas")}>
              Ver todas
            </Button>
          }
        />
      ) : (
        <ul className="space-y-2 list-none p-0 m-0">
          {visiveis.map((o) => (
            <CartaoDeOportunidade
              key={o.id}
              oportunidade={o}
              aberta={abertaId === o.id}
              onAlternar={() => setAbertaId((atual) => (atual === o.id ? null : o.id))}
              onDecidir={(status) => void decidir(o.id, status)}
              decidindo={decidindoId === o.id}
            />
          ))}
        </ul>
      )}
      </div>
    </>
  );
}
