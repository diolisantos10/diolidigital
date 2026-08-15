"use client";

// FilaDeAvisos — o que o cliente ainda não sabe.
//
// Enquanto não houver canal automático configurado, é por aqui que o aviso sai.
// O desenho segue uma regra: **quem for disparar não deve precisar escrever
// nada**. O texto já vem pronto, com o link do portal, num botão de copiar.
// Aviso escrito às pressas por alguém apressado é pior que aviso nenhum — o
// cliente sente.
//
// Fila vazia é o estado normal e desejável. Por isso ela some da tela quando
// não há nada: painel cheio de caixa vazia treina o time a ignorar o painel.
//
// ── OS DOIS LADOS DO INTERRUPTOR (15/08/2026) ───────────────────────────────
//
// Esta tela mostrava UM lado: o que a agência precisa disparar. Faltava o
// outro, e ele é o que acusa a própria casa — **o cliente que perguntou e não
// foi respondido**. Enquanto só um lado aparecia, a tela dizia "está tudo em
// dia" num dia em que a agência devia resposta a três clientes.
//
// A régua vem de `resumoDasAprovacoes` e as duas metades **nunca são somadas**:
//   • "esperando o cliente" — a bola é dele, cobrar é legítimo;
//   • "esperando a AGÊNCIA" — a bola é nossa, e o prazo dele está pausado.
//
// E a barra diz **qual metade falta**: quando o resumo não pôde ser medido, a
// tela escreve isso em vez de mostrar zero. Zero e "não medi" são fatos
// opostos, e o segundo com cara do primeiro é como uma fila fica invisível.

import { useCallback, useEffect, useState } from "react";

interface Aviso {
  id: string;
  cliente: string;
  tipo: string;
  textoParaEnviar: string;
  porQueNaoSaiuSozinho: string | null;
  esperandoDesde: string;
}

interface ResumoDasAprovacoes {
  paradas: number;
  abandonadas: number;
  bolaConosco: number;
  maisAntigoEmDias: number | null;
}

const ROTULO_DO_TIPO: Record<string, string> = {
  direcao:   "Precisa aprovar a direção",
  material:  "Precisa mandar material",
  entrega:   "Tem entrega para ver",
  ciclo:     "Novidade do acompanhamento",
  recompra:  "Toque de recompra",
  aprovacao: "Aprovação parada além do prazo",
};

/** Tipo que a tela não conhece NÃO vira "undefined" na frente de quem opera.
 *  `ROTULO_DO_TIPO[a.tipo]` já saía vazio para `recompra` desde 06/08 — o mapa
 *  tinha 4 chaves e a fila listava 5 tipos. */
function rotuloDoTipo(tipo: string): string {
  return ROTULO_DO_TIPO[tipo] ?? "Precisa ser avisado";
}

function esperandoHa(desde: string): string {
  const ms = Date.now() - new Date(desde).getTime();
  const horas = Math.floor(ms / 3_600_000);
  if (horas < 1) return "agora há pouco";
  if (horas < 24) return `há ${horas}h`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? "há 1 dia" : `há ${dias} dias`;
}

export default function FilaDeAvisos() {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [aprovacoes, setAprovacoes] = useState<ResumoDasAprovacoes | null>(null);
  const [medido, setMedido] = useState(true);
  const [carregando, setCarregando] = useState(true);
  const [copiado, setCopiado] = useState<string | null>(null);

  const buscar = useCallback(async () => {
    try {
      const r = await fetch("/api/avisos", { cache: "no-store" });
      const dados = await r.json();
      setAvisos(dados.avisos ?? []);
      setAprovacoes(dados.aprovacoes ?? null);
      setMedido(dados.aprovacoes != null);
    } catch {
      setAvisos([]);
      setAprovacoes(null);
      setMedido(false);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { void buscar(); }, [buscar]);

  async function copiar(a: Aviso) {
    try {
      await navigator.clipboard.writeText(a.textoParaEnviar);
      setCopiado(a.id);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      setCopiado(null);
    }
  }

  async function marcar(id: string, acao: "enviei" | "dispensar") {
    setAvisos((prev) => prev.filter((a) => a.id !== id));   // some na hora
    try {
      await fetch("/api/avisos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, acao }),
      });
    } catch {
      await buscar();   // deu errado: recarrega e o aviso volta
    }
  }

  const esperandoCliente = aprovacoes ? aprovacoes.paradas - aprovacoes.bolaConosco : 0;
  const bolaConosco = aprovacoes?.bolaConosco ?? 0;
  // A dívida da casa aparece MESMO com a fila de avisos vazia: é o único item
  // desta tela que acusa a própria agência, e escondê-lo por falta de avisos
  // seria escondê-lo exatamente quando não há nada disfarçando.
  const temAlgoAMostrar = avisos.length > 0 || bolaConosco > 0 || !medido;

  // Fila vazia não ocupa espaço — caixa vazia treina o time a ignorar a tela.
  if (carregando || !temAlgoAMostrar) return null;

  return (
    <section className="rounded-2xl border border-[#F5D9A3] bg-[#FEF6E7] p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-[#7A5310]">
          {avisos.length === 0
            ? "Nenhum aviso na fila"
            : avisos.length === 1
              ? "1 cliente precisa ser avisado"
              : `${avisos.length} clientes precisam ser avisados`}
        </h2>
        {avisos.length > 0 ? (
          <p className="text-[11px] text-[#9A7328]">o texto já está pronto — é copiar e mandar</p>
        ) : null}
      </div>

      {/* ── OS DOIS LADOS DO INTERRUPTOR ──────────────────────────────────── */}
      {/* Nunca somados: um cobra o cliente, o outro cobra a casa.            */}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-[#F0DCB4] bg-white/70 px-3.5 py-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-[#9A7328]">Esperando o cliente</p>
          <p className="mt-1 text-[20px] font-semibold leading-none text-[var(--text-primary)]">
            {medido ? esperandoCliente : "—"}
          </p>
          <p className="mt-1.5 text-[11px] leading-snug text-[var(--text-secondary)]">
            {/* ⚠️ `maisAntigoEmDias` é da fila INTEIRA e não sai aqui de
                propósito: o card mais antigo pode ser um dos que esperam a
                AGÊNCIA, e atribuí-lo ao cliente seria pôr o atraso da casa na
                conta dele — dentro da própria caixa que existe para separar os
                dois. Ele aparece no rodapé, rotulado como o que é. */}
            {!medido
              ? "não consegui medir agora — isto NÃO quer dizer zero"
              : esperandoCliente === 0
                ? "nenhuma aprovação parada com o cliente"
                : `aprovaç${esperandoCliente === 1 ? "ão parada esperando a decisão dele" : "ões paradas esperando a decisão dele"}`}
          </p>
        </div>

        <div
          className={
            bolaConosco > 0
              ? "rounded-xl border border-[#F2B8B8] bg-[#FDF1F1] px-3.5 py-3"
              : "rounded-xl border border-[#F0DCB4] bg-white/70 px-3.5 py-3"
          }
        >
          <p className={`text-[11px] font-medium uppercase tracking-wide ${bolaConosco > 0 ? "text-[#A33A3A]" : "text-[#9A7328]"}`}>
            Esperando a agência
          </p>
          <p className={`mt-1 text-[20px] font-semibold leading-none ${bolaConosco > 0 ? "text-[#A33A3A]" : "text-[var(--text-primary)]"}`}>
            {medido ? bolaConosco : "—"}
          </p>
          <p className="mt-1.5 text-[11px] leading-snug text-[var(--text-secondary)]">
            {!medido
              ? "não consegui medir agora — isto NÃO quer dizer zero"
              : bolaConosco === 0
                ? "nenhuma dúvida de cliente sem resposta"
                : "o cliente perguntou e ainda não foi respondido — o prazo dele está pausado"}
          </p>
        </div>
      </div>

      {medido && aprovacoes && aprovacoes.maisAntigoEmDias != null ? (
        <p className="mt-2 text-[11px] text-[#9A7328]">
          Na fila toda, a aprovação mais antiga espera há {aprovacoes.maisAntigoEmDias} dia(s)
          {aprovacoes.abandonadas > 0 ? ` · ${aprovacoes.abandonadas} passou do prazo` : ""}.
        </p>
      ) : null}

      <ul className="mt-3.5 space-y-2.5">
        {avisos.map((a) => (
          <li key={a.id} className="rounded-xl border border-[#F0DCB4] bg-white/80 p-3.5">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-[14px] font-semibold text-[var(--text-primary)]">{a.cliente}</span>
              <span className="text-[12px] text-[var(--text-secondary)]">— {rotuloDoTipo(a.tipo)}</span>
              <span className="text-[11px] text-[var(--text-muted)]">esperando {esperandoHa(a.esperandoDesde)}</span>
            </div>

            {a.porQueNaoSaiuSozinho ? (
              <p className="mt-1 text-[11px] text-[#9A7328]">Não saiu sozinho: {a.porQueNaoSaiuSozinho}</p>
            ) : null}

            <pre className="mt-2.5 max-h-32 overflow-y-auto whitespace-pre-wrap rounded-lg bg-[var(--bg)] px-3 py-2.5 font-sans text-[12px] leading-relaxed text-[var(--text-primary)]">
              {a.textoParaEnviar}
            </pre>

            <div className="mt-2.5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void copiar(a)}
                className="rounded-lg bg-[var(--navy)] px-3 py-1.5 text-[12px] font-medium text-white transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--navy)] focus-visible:ring-offset-2"
              >
                {copiado === a.id ? "Copiado ✓" : "Copiar mensagem"}
              </button>
              <button
                type="button"
                onClick={() => void marcar(a.id, "enviei")}
                className="rounded-lg border border-[var(--border-strong)] bg-white px-3 py-1.5 text-[12px] font-medium text-[var(--text-primary)] transition hover:bg-[var(--bg)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--navy)] focus-visible:ring-offset-2"
              >
                Já mandei
              </button>
              <button
                type="button"
                onClick={() => void marcar(a.id, "dispensar")}
                className="rounded-lg px-3 py-1.5 text-[12px] text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--navy)] focus-visible:ring-offset-2"
              >
                Não precisa
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
