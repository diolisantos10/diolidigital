"use client";

// CaixaDeEntrada — onde a agência finalmente LÊ.
//
// ── O defeito ────────────────────────────────────────────────────────────────
// Não existia caixa de entrada, badge nem lista. Os dois únicos pontos de
// leitura de conversa estavam enterrados dentro da tela de UM projeto, e um
// deles atrás de `{data.clientRequestId && …}` — null em projeto de cliente
// direto, então nem renderizava. `readByTeam` era escrito em 11 lugares e lido
// em nenhum. A mensagem do cliente gravava e morria.
//
// ── O desenho ───────────────────────────────────────────────────────────────
// Duas abas, uma pergunta cada:
//   Conversas → "quem está falando comigo e eu não respondi?"
//   Pedidos   → "quem pediu peça nova e eu não decidi?"
// Lista à esquerda, item aberto à direita. No celular a lista é a tela e o item
// abre por cima com voltar — a maioria da equipe abre isto do telefone.
//
// Ordem: não-lidas primeiro, depois mais recente. É a ordem de quem precisa
// RESPONDER, não a de cadastro.

import { useCallback, useEffect, useState } from "react";
import { PortalChat } from "./PortalChat";

interface ConversaDaCaixa {
  chave: string;
  clientId: string | null;
  clientRequestId: string | null;
  nome: string;
  naoLidas: number;
  total: number;
  ultimaEm: string | null;
  ultimaPor: "client" | "team" | null;
  previa: string | null;
  pedidosNovos: number;
}

interface PedidoDaCaixa {
  id: string;
  clientId: string;
  cliente: string;
  titulo: string;
  descricao: string;
  objetivo: string;
  para: string | null;
  anexos: string[];
  status: string;
  escopo: string | null;
  taskId: string | null;
  projectId: string | null;
  triadoPor: string | null;
  triadoEm: string | null;
  motivo: string | null;
  criadoEm: string;
}

interface Destino { departamento: string; agentId: string; label: string }

type Aba = "conversas" | "pedidos";

function quando(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const agora = new Date();
  const mesmoDia = d.toDateString() === agora.toDateString();
  return mesmoDia
    ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function iniciais(nome: string): string {
  return nome.trim().split(/\s+/).slice(0, 2).map((p) => p[0] ?? "").join("").toUpperCase() || "?";
}

export default function CaixaDeEntrada() {
  const [aba, setAba] = useState<Aba>("conversas");
  const [conversas, setConversas] = useState<ConversaDaCaixa[]>([]);
  const [pedidos, setPedidos] = useState<PedidoDaCaixa[]>([]);
  const [destinos, setDestinos] = useState<Destino[]>([]);
  const [abertaChave, setAbertaChave] = useState<string | null>(null);
  const [pedidoAberto, setPedidoAberto] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const [c, p] = await Promise.all([
        fetch("/api/messages", { cache: "no-store" }),
        fetch("/api/messages/pedidos", { cache: "no-store" }),
      ]);
      if (!c.ok) { setErro("Não consegui carregar a caixa de entrada."); return; }
      const jc = await c.json();
      setConversas(Array.isArray(jc.conversas) ? jc.conversas : []);
      if (p.ok) {
        const jp = await p.json();
        setPedidos(Array.isArray(jp.pedidos) ? jp.pedidos : []);
        setDestinos(Array.isArray(jp.destinos) ? jp.destinos : []);
      }
      setErro(null);
    } catch {
      setErro("Não consegui carregar a caixa de entrada.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
    const t = setInterval(carregar, 20_000);
    return () => clearInterval(t);
  }, [carregar]);

  const aberta = conversas.find((c) => c.chave === abertaChave) ?? null;
  const pedido = pedidos.find((p) => p.id === pedidoAberto) ?? null;
  // O QUE PRECISA DE GENTE. Desde 06/08/2026 a triagem é automática, então
  // "novo" praticamente não existe mais — o que sobra para a equipe é o que a
  // máquina PAROU e declarou (`precisa_decisao`). Ele entra no mesmo balde e no
  // mesmo badge: se ficasse de fora, o fail-closed viraria um esconderijo mais
  // silencioso que o balde que ele substituiu.
  const novos = pedidos.filter((p) => p.status === "novo" || p.status === "precisa_decisao");
  const jaTriados = pedidos.filter((p) => p.status !== "novo" && p.status !== "precisa_decisao");
  const totalNaoLidas = conversas.reduce((s, c) => s + c.naoLidas, 0);

  function abrirConversa(c: ConversaDaCaixa) {
    setAbertaChave(c.chave);
    // Ao abrir, o GET marca como lidas no servidor — o número local acompanha
    // na hora, senão o badge fica mentindo até o próximo poll.
    setConversas((atual) => atual.map((x) => (x.chave === c.chave ? { ...x, naoLidas: 0 } : x)));
  }

  return (
    <div>
      {/* Abas */}
      <div className="flex items-center gap-1 mb-5 border-b border-[var(--border)]">
        {([
          { id: "conversas" as Aba, label: "Conversas", badge: totalNaoLidas },
          { id: "pedidos"  as Aba, label: "Pedidos de conteúdo", badge: novos.length },
        ]).map((t) => (
          <button
            key={t.id}
            onClick={() => setAba(t.id)}
            className={`relative h-10 px-3.5 text-[13px] font-semibold transition-colors flex items-center gap-2 ${
              aba === t.id
                ? "text-[var(--text-primary)] after:absolute after:left-0 after:right-0 after:-bottom-px after:h-[2px] after:bg-[var(--text-primary)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            {t.label}
            {t.badge > 0 && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold bg-[#F59E0B] text-white">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {erro && (
        <p className="mb-4 rounded-[8px] bg-[var(--danger-bg,#FEF2F2)] px-3 py-2 text-[12px] text-[#B91C1C]">{erro}</p>
      )}

      {aba === "conversas" ? (
        <div className="grid md:grid-cols-[300px_1fr] gap-4 items-start">
          {/* Lista */}
          <div className={`bg-white rounded-[12px] border border-[var(--border)] overflow-hidden ${aberta ? "hidden md:block" : ""}`}>
            {carregando ? (
              <p className="text-[12px] text-[var(--text-muted)] text-center py-10">Carregando…</p>
            ) : conversas.length === 0 ? (
              <div className="py-10 px-5 text-center">
                <p className="text-[13px] font-medium text-[var(--text-primary)]">Nenhuma conversa ainda</p>
                <p className="text-[12px] text-[var(--text-muted)] mt-1 leading-relaxed">
                  Quando um cliente escrever pelo portal, ele aparece aqui — com o número de não-lidas.
                </p>
              </div>
            ) : (
              conversas.map((c) => (
                <button
                  key={c.chave}
                  onClick={() => abrirConversa(c)}
                  className={`w-full flex items-start gap-3 px-3.5 py-3 text-left border-t border-[var(--border)] first:border-t-0 transition-colors ${
                    abertaChave === c.chave ? "bg-[var(--accent)]" : "hover:bg-[var(--bg-elevated)]"
                  }`}
                >
                  <span
                    aria-hidden
                    className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[10.5px] font-bold text-white"
                    style={{ background: c.naoLidas > 0 ? "#12B5AC" : "#B9B7B0" }}
                  >
                    {iniciais(c.nome)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className={`truncate text-[13px] ${c.naoLidas > 0 ? "font-bold text-[var(--text-primary)]" : "font-medium text-[var(--text-secondary)]"}`}>
                        {c.nome}
                      </span>
                      <span className="shrink-0 text-[10.5px] text-[var(--text-muted)]">{quando(c.ultimaEm)}</span>
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5">
                      <span className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--text-muted)]">
                        {c.previa ? `${c.ultimaPor === "team" ? "Você: " : ""}${c.previa}` : "Sem mensagens"}
                      </span>
                      {c.naoLidas > 0 && (
                        <span className="shrink-0 inline-flex items-center justify-center min-w-[17px] h-[17px] px-1 rounded-full text-[10px] font-bold bg-[#F59E0B] text-white">
                          {c.naoLidas}
                        </span>
                      )}
                    </span>
                    {c.pedidosNovos > 0 && (
                      <span className="mt-1 inline-flex items-center h-[17px] px-1.5 rounded-full text-[10px] font-semibold bg-[#EFF6FF] text-[#1D4ED8]">
                        {c.pedidosNovos} {c.pedidosNovos === 1 ? "pedido novo" : "pedidos novos"}
                      </span>
                    )}
                  </span>
                </button>
              ))
            )}
          </div>

          {/* Conversa aberta */}
          <div className={aberta ? "" : "hidden md:block"}>
            {aberta ? (
              <div>
                <div className="flex items-center gap-2 mb-2.5">
                  <button
                    onClick={() => setAbertaChave(null)}
                    className="md:hidden h-8 px-2.5 rounded-[8px] text-[12px] font-semibold text-[var(--text-secondary)] bg-[var(--accent)]"
                  >
                    ← Voltar
                  </button>
                  <p className="text-[14px] font-semibold text-[var(--text-primary)] truncate">{aberta.nome}</p>
                </div>
                <PortalChat
                  key={aberta.chave}
                  clientId={aberta.clientId ?? undefined}
                  clientRequestId={aberta.clientId ? undefined : aberta.clientRequestId ?? undefined}
                  height={460}
                />
              </div>
            ) : (
              <div className="bg-white rounded-[12px] border border-[var(--border)] py-16 text-center">
                <p className="text-[13px] font-medium text-[var(--text-primary)]">Escolha uma conversa</p>
                <p className="text-[12px] text-[var(--text-muted)] mt-1">A resposta sai daqui mesmo.</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="grid md:grid-cols-[320px_1fr] gap-4 items-start">
          <div className={`bg-white rounded-[12px] border border-[var(--border)] overflow-hidden ${pedido ? "hidden md:block" : ""}`}>
            {carregando ? (
              <p className="text-[12px] text-[var(--text-muted)] text-center py-10">Carregando…</p>
            ) : pedidos.length === 0 ? (
              <div className="py-10 px-5 text-center">
                <p className="text-[13px] font-medium text-[var(--text-primary)]">Nenhum pedido ainda</p>
                <p className="text-[12px] text-[var(--text-muted)] mt-1 leading-relaxed">
                  O cliente pede peça nova pelo portal, em “Pedir conteúdo”. O pedido cai aqui.
                </p>
              </div>
            ) : (
              [...novos, ...jaTriados].map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPedidoAberto(p.id)}
                  className={`w-full flex items-start gap-3 px-3.5 py-3 text-left border-t border-[var(--border)] first:border-t-0 transition-colors ${
                    pedidoAberto === p.id ? "bg-[var(--accent)]" : "hover:bg-[var(--bg-elevated)]"
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className={`truncate text-[13px] ${precisaDeGente(p.status) ? "font-bold text-[var(--text-primary)]" : "font-medium text-[var(--text-secondary)]"}`}>
                        {p.cliente}
                      </span>
                      <span className="shrink-0 text-[10.5px] text-[var(--text-muted)]">{quando(p.criadoEm)}</span>
                    </span>
                    <span className="block mt-0.5 truncate text-[12px] text-[var(--text-secondary)]">{p.titulo}</span>
                    <span className={`mt-1 inline-flex items-center h-[18px] px-2 rounded-full text-[10px] font-semibold ${
                      p.status === "precisa_decisao" ? "bg-[#FEE2E2] text-[#B91C1C]"
                      : precisaDeGente(p.status) ? "bg-[#FEF3C7] text-[#9B7B2D]"
                      : p.status === "entregue" ? "bg-[#DCFCE7] text-[var(--success)]"
                      : p.status === "triado" || p.status === "em_producao" || p.status === "em_triagem" ? "bg-[#DBEAFE] text-[#1D4ED8]"
                      : "bg-[#F3F4F6] text-[#6B7280]"
                    }`}>
                      {rotuloDoStatus(p)}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>

          <div className={pedido ? "" : "hidden md:block"}>
            {pedido ? (
              <DetalheDoPedido
                pedido={pedido}
                destinos={destinos}
                onVoltar={() => setPedidoAberto(null)}
                onTriado={() => { setPedidoAberto(null); void carregar(); }}
              />
            ) : (
              <div className="bg-white rounded-[12px] border border-[var(--border)] py-16 text-center">
                <p className="text-[13px] font-medium text-[var(--text-primary)]">Escolha um pedido</p>
                <p className="text-[12px] text-[var(--text-muted)] mt-1">Aceitar cria a tarefa e avisa o cliente.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Este pedido está esperando um humano? Só dois estados esperam: o que a
 *  triagem automática ainda não pegou e o que ela PAROU declarando o motivo. */
function precisaDeGente(status: string): boolean {
  return status === "novo" || status === "precisa_decisao";
}

/** Todo estado que a esteira grava tem rótulo AQUI. Estado sem rótulo é estado
 *  que ninguém lê — e estado que ninguém lê é o balde de volta. */
function rotuloDoStatus(p: PedidoDaCaixa): string {
  switch (p.status) {
    case "novo":            return "Esperando triagem";
    case "em_triagem":      return "Triando agora";
    case "triado":          return `Aceito · ${p.escopo === "extra" ? "orçamento na mesa" : "no ciclo"}`;
    case "em_producao":     return "Produzindo";
    case "entregue":        return "Entregue ao cliente";
    case "precisa_decisao": return "PRECISA DE DECISÃO";
    case "recusado":        return "Recusado";
    default:                return p.status;
  }
}

// ── O detalhe + a triagem ───────────────────────────────────────────────────
// A decisão de ESCOPO é obrigatória e explícita: não há botão "aceitar" solto.
// Preço e prazo não se inventam — quem decide se cabe no ciclo é gente.

function DetalheDoPedido({
  pedido, destinos, onVoltar, onTriado,
}: {
  pedido: PedidoDaCaixa;
  destinos: Destino[];
  onVoltar: () => void;
  onTriado: () => void;
}) {
  const [departamento, setDepartamento] = useState(destinos[0]?.departamento ?? "social-media");
  const [prazo, setPrazo] = useState(pedido.para ? pedido.para.slice(0, 10) : "");
  const [motivo, setMotivo] = useState("");
  const [recusando, setRecusando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function decidir(decisao: "ciclo" | "extra" | "recusar") {
    if (enviando) return;
    setEnviando(true);
    setErro(null);
    try {
      const res = await fetch("/api/messages/pedidos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pedidoId: pedido.id, decisao, departamento, prazo, motivo }),
      });
      const j = await res.json().catch(() => ({} as Record<string, string>));
      if (!res.ok) { setErro(j.mensagem ?? j.error ?? "Não consegui registrar a triagem."); return; }
      onTriado();
    } catch {
      setErro("Falha de rede. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  // A triagem MANUAL continua valendo para o que a máquina parou: é a saída de
  // `precisa_decisao`. Sem isto, o fail-closed viraria um beco — o pedido sairia
  // do balde para um limbo sem botão.
  const jaDecidido = !precisaDeGente(pedido.status);

  return (
    <div className="bg-white rounded-[12px] border border-[var(--border)] p-5">
      <button onClick={onVoltar} className="md:hidden mb-3 h-8 px-2.5 rounded-[8px] text-[12px] font-semibold text-[var(--text-secondary)] bg-[var(--accent)]">
        ← Voltar
      </button>

      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">{pedido.cliente}</p>
      <h3 className="text-[16px] font-semibold text-[var(--text-primary)] mt-0.5 leading-snug">{pedido.titulo}</h3>

      <dl className="mt-4 space-y-3">
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">O que ele quer</dt>
          <dd className="text-[13px] text-[var(--text-primary)] mt-0.5 whitespace-pre-wrap leading-relaxed">{pedido.descricao}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">Para qual objetivo</dt>
          <dd className="text-[13px] text-[var(--text-primary)] mt-0.5">{pedido.objetivo}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">Para quando</dt>
          <dd className="text-[13px] text-[var(--text-primary)] mt-0.5">
            {pedido.para ? new Date(pedido.para).toLocaleDateString("pt-BR") : "Não informado pelo cliente"}
          </dd>
        </div>
        {pedido.anexos.length > 0 && (
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">Material que ele mandou</dt>
            <dd className="mt-1 flex flex-wrap gap-1.5">
              {pedido.anexos.map((a, i) => (
                <a key={i} href={a} target="_blank" rel="noopener noreferrer"
                   className="h-7 px-2.5 rounded-[8px] bg-[var(--accent)] text-[11.5px] font-medium text-[var(--text-secondary)] flex items-center hover:bg-[var(--border)]">
                  Anexo {i + 1}
                </a>
              ))}
            </dd>
          </div>
        )}
      </dl>

      {jaDecidido ? (
        <div className="mt-5 rounded-[10px] bg-[var(--bg)] px-4 py-3">
          <p className="text-[12.5px] font-semibold text-[var(--text-primary)]">
            {pedido.status === "triado"
              ? `Aceito ${pedido.escopo === "extra" ? "como escopo extra a combinar" : "no ciclo corrente"}`
              : "Recusado"}
          </p>
          <p className="text-[11.5px] text-[var(--text-muted)] mt-0.5">
            {pedido.triadoPor ? `Por ${pedido.triadoPor}` : ""}
            {pedido.triadoEm ? ` em ${new Date(pedido.triadoEm).toLocaleDateString("pt-BR")}` : ""}
            {pedido.taskId ? " · tarefa criada" : ""}
          </p>
          {pedido.motivo && <p className="text-[12px] text-[var(--text-secondary)] mt-1.5">{pedido.motivo}</p>}
        </div>
      ) : recusando ? (
        <div className="mt-5 border-t border-[var(--border)] pt-4">
          <label className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
            Por que não vamos seguir
          </label>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            placeholder="O cliente lê exatamente isto."
            className="mt-1.5 w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-[8px] outline-none focus:border-[var(--text-primary)] text-[13px] resize-none"
          />
          <div className="mt-3 flex gap-2">
            <button onClick={() => decidir("recusar")} disabled={enviando || motivo.trim().length < 5}
                    className="h-9 px-4 rounded-[8px] bg-[#B91C1C] disabled:opacity-40 text-white text-[12.5px] font-semibold">
              Recusar e avisar
            </button>
            <button onClick={() => setRecusando(false)} className="h-9 px-3 text-[12.5px] text-[var(--text-muted)]">Cancelar</button>
          </div>
        </div>
      ) : (
        <div className="mt-5 border-t border-[var(--border)] pt-4 space-y-3.5">
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">Quem produz</span>
              <select
                value={departamento}
                onChange={(e) => setDepartamento(e.target.value)}
                className="mt-1.5 w-full h-9 px-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-[8px] text-[13px] outline-none focus:border-[var(--text-primary)]"
              >
                {destinos.map((d) => <option key={d.departamento} value={d.departamento}>{d.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">Entrega em</span>
              <input
                type="date"
                value={prazo}
                onChange={(e) => setPrazo(e.target.value)}
                className="mt-1.5 w-full h-9 px-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-[8px] text-[13px] outline-none focus:border-[var(--text-primary)]"
              />
            </label>
          </div>
          <p className="text-[11.5px] text-[var(--text-muted)] leading-snug">
            Tarefa sem prazo trava calada — por isso a data é obrigatória para aceitar.
          </p>

          {erro && <p className="rounded-[8px] bg-[#FEF2F2] px-3 py-2 text-[12px] text-[#B91C1C]">{erro}</p>}

          {/* No celular as três decisões empilham em largura cheia: numa linha só
              elas quebravam torto e a decisão mais importante ficava sozinha. */}
          <div className="grid grid-cols-1 sm:flex sm:flex-wrap gap-2">
            <button onClick={() => decidir("ciclo")} disabled={enviando || !prazo}
                    className="h-10 sm:h-9 px-4 rounded-[8px] bg-[var(--text-primary)] disabled:opacity-40 text-white text-[12.5px] font-semibold">
              Entra no ciclo
            </button>
            <button onClick={() => decidir("extra")} disabled={enviando || !prazo}
                    className="h-10 sm:h-9 px-4 rounded-[8px] bg-[#12B5AC] disabled:opacity-40 text-white text-[12.5px] font-semibold">
              Escopo extra a combinar
            </button>
            <button onClick={() => setRecusando(true)} disabled={enviando}
                    className="h-10 sm:h-9 px-3 rounded-[8px] text-[12.5px] font-semibold text-[var(--text-muted)] hover:bg-[var(--accent)]">
              Recusar
            </button>
          </div>
          <p className="text-[11.5px] text-[var(--text-muted)] leading-snug">
            <b>Entra no ciclo</b> produz agora, dentro do que já está contratado. <b>Escopo extra</b> cria a
            tarefa e avisa o cliente de que a proposta vem antes — nada é produzido nem cobrado sem o aval dele.
          </p>
        </div>
      )}
    </div>
  );
}
