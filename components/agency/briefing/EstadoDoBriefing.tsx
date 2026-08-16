"use client";

// A TELA DE CONFIRMAÇÃO DO BRIEFING PÚBLICO — sem prazo, com estado real.
//
// ─── O QUE ESTA TELA NÃO FAZ MAIS ────────────────────────────────────────────
//
// Ela não promete prazo. Nem "1 dia útil", nem "24 horas", nem "em breve".
// O CEO, em 16/08/2026: *"não autorizei nada disso, não foi decisão minha, e um
// dia isso é coisa de um ano — inteligência artificial faz em minutos"*.
//
// **A regra que fica: nunca se escreve prazo na cara do cliente sem que exista,
// no código, algo que garanta esse prazo.** Não existe esse algo. Então não se
// escreve o prazo.
//
// ─── O QUE ELA FAZ NO LUGAR ──────────────────────────────────────────────────
//
// Pergunta ao servidor em que ponto o orçamento está e mostra o estado REAL:
// recebido → montando (com a contagem de verdade) → pronto. Se travou, diz que
// travou, com motivo em português e o que fazer.
//
// **Nada aqui simula progresso.** Não há `setTimeout` pintando barrinha, não há
// estado que só existe na tela. Cada frase vem de `GET /api/briefing/estado`,
// que conta linhas no banco. Quando não dá para saber, a tela diz que não sabe —
// que é o oposto do defeito que ela veio consertar.

import { useCallback, useEffect, useRef, useState } from "react";
import type { Passo } from "@/lib/agency/briefing/estado-do-briefing";

const WHATSAPP = "https://wa.me/5511989400692";

/** De quanto em quanto tempo se pergunta de novo. 2s é curto o bastante para o
 *  "pronto" aparecer enquanto a pessoa ainda está na tela, e longo o bastante
 *  para não virar enxurrada de consulta ao banco por aba aberta. */
const INTERVALO_MS = 2_000;

/** Teto de perguntas. Uma aba esquecida aberta a noite inteira não pode ficar
 *  batendo no banco para sempre — depois disto a tela oferece o botão de
 *  atualizar, que é gesto de gente. */
const MAXIMO_DE_PERGUNTAS = 90;

interface Resposta {
  estado: string;
  titulo: string;
  detalhe: string;
  passos: Passo[];
  chamaOWhatsApp: boolean;
  canvases: number;
  totalDeCanvases: number;
  aindaMuda: boolean;
}

export interface EstadoDoBriefingProps {
  /** O id devolvido pelo servidor. `null` = o POST não chegou lá. */
  idNoServidor: string | null;
  /** true quando o envio ao servidor falhou de verdade. */
  falhouAoEnviar: boolean;
  /** A referência local, mostrada no rodapé. */
  referencia: string | null;
  onVoltar: () => void;
}

export function EstadoDoBriefing({ idNoServidor, falhouAoEnviar, referencia, onVoltar }: EstadoDoBriefingProps) {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const perguntas = useRef(0);

  const perguntar = useCallback(async () => {
    if (!idNoServidor) return;
    try {
      const r = await fetch(`/api/briefing/estado?id=${encodeURIComponent(idNoServidor)}`, { cache: "no-store" });
      if (!r.ok) {
        // 404 e 503 dizem coisas diferentes, e a tela não pode achatá-las: uma é
        // "não achamos o seu briefing", a outra é "não conseguimos olhar agora".
        setErro(
          r.status === 404
            ? "Não encontramos o seu briefing pelo código desta página."
            : "Não conseguimos consultar o andamento agora.",
        );
        return;
      }
      setDados(await r.json());
      setErro(null);
    } catch {
      setErro("Não conseguimos consultar o andamento agora — pode ser a sua conexão.");
    } finally {
      setCarregando(false);
    }
  }, [idNoServidor]);

  useEffect(() => {
    if (!idNoServidor) {
      setCarregando(false);
      return;
    }
    void perguntar();
    const t = setInterval(() => {
      perguntas.current += 1;
      if (perguntas.current > MAXIMO_DE_PERGUNTAS) {
        clearInterval(t);
        return;
      }
      void perguntar();
    }, INTERVALO_MS);
    return () => clearInterval(t);
  }, [idNoServidor, perguntar]);

  // Chegou ao fim: para de perguntar.
  useEffect(() => {
    if (dados && !dados.aindaMuda) perguntas.current = MAXIMO_DE_PERGUNTAS + 1;
  }, [dados]);

  const travado = dados?.estado === "travado";
  const semContato = dados?.estado === "sem_contato";
  const pronto = dados?.estado === "pronto";

  return (
    <div className="mx-auto w-full max-w-[560px] px-4 py-10 sm:py-16">
      <div className="text-center">
        {/* Três tons, e cada um casa com o painel que aparece embaixo. A
            primeira versão pintava o selo de âmbar e o painel de vermelho na
            MESMA tela de erro — dois sinais discordando sobre a gravidade. */}
        <Selo
          tom={
            erro || falhouAoEnviar || !idNoServidor
              ? "erro"
              : travado || semContato
                ? "atencao"
                : pronto
                  ? "pronto"
                  : "andando"
          }
        />

        {/* ── ESTADO 1: CARREGANDO ─────────────────────────────────────────── */}
        {carregando && !dados && !erro && !falhouAoEnviar && (
          <>
            <h1 className="mb-3 text-[20px] font-semibold text-[var(--text-primary)] sm:text-[22px]">
              Recebemos seu briefing.
            </h1>
            <p className="mx-auto mb-6 max-w-[420px] text-[14px] leading-relaxed text-[var(--text-secondary)]">
              Estamos consultando em que ponto o seu orçamento está…
            </p>
            <div className="mb-8" aria-hidden="true">
              <div className="mx-auto h-3 w-3/4 animate-pulse rounded-full bg-[var(--border)]" />
              <div className="mx-auto mt-2 h-3 w-1/2 animate-pulse rounded-full bg-[var(--border)]" />
            </div>
          </>
        )}

        {/* ── ESTADO 2: ERRO (inclusive o envio que não chegou) ─────────────── */}
        {/* O envio que não chegou é o caso mais importante desta tela: sem id do
            servidor, NÃO dá para afirmar que o briefing está salvo lá. Dizer
            "recebemos" aqui seria a mesma mentira do prazo, com outra roupa. */}
        {(falhouAoEnviar || !idNoServidor || erro) && !carregando && (
          <>
            <h1 className="mb-3 text-[20px] font-semibold text-[var(--text-primary)] sm:text-[22px]">
              {falhouAoEnviar || !idNoServidor
                ? "Não conseguimos confirmar o envio."
                : "Não conseguimos ver o andamento."}
            </h1>
            <p className="mx-auto mb-6 max-w-[440px] text-[14px] leading-relaxed text-[var(--text-secondary)]">
              {falhouAoEnviar || !idNoServidor
                ? "Sua conversa está guardada neste navegador, mas ela não chegou até nós — então não podemos dizer que recebemos. Chama a gente no WhatsApp que resolvemos na hora, sem você digitar tudo de novo."
                : `${erro} Seu briefing está salvo; o que falhou foi só esta consulta.`}
            </p>
            <div className="mb-8 rounded-[10px] border border-[var(--danger)] bg-[var(--danger-bg)] px-5 py-4 text-left">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--danger)]">
                O que a gente faz agora
              </p>
              <p className="text-[12.5px] leading-relaxed text-[var(--text-secondary)]">
                {falhouAoEnviar || !idNoServidor
                  ? "Nossa equipe não foi avisada automaticamente — quem tem que dar o próximo passo é você, pelo WhatsApp abaixo."
                  : "Você pode tentar de novo agora. Se continuar assim, chama a gente no WhatsApp."}
              </p>
            </div>
            {!falhouAoEnviar && idNoServidor && (
              <button
                onClick={() => {
                  setCarregando(true);
                  perguntas.current = 0;
                  void perguntar();
                }}
                className="mb-4 inline-flex h-9 items-center rounded-[8px] border border-[var(--border)] px-5 text-[13px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg)]"
              >
                Tentar de novo
              </button>
            )}
          </>
        )}

        {/* ── ESTADO 3: O ESTADO REAL, VINDO DO SERVIDOR ───────────────────── */}
        {dados && !erro && !falhouAoEnviar && (
          <>
            <h1 className="mb-3 text-[20px] font-semibold text-[var(--text-primary)] sm:text-[22px]">
              {dados.titulo}
            </h1>
            <p className="mx-auto mb-6 max-w-[440px] text-[14px] leading-relaxed text-[var(--text-secondary)]">
              {dados.detalhe}
            </p>

            <div
              className={`mb-8 rounded-[10px] border px-5 py-4 text-left ${
                travado || semContato
                  ? "border-[var(--warning)] bg-[var(--warning-bg)]"
                  : "border-[var(--border)] bg-[var(--bg)]"
              }`}
            >
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)]">
                Onde seu pedido está
              </p>
              <ol className="space-y-2">
                {dados.passos.map((p, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-[12.5px] leading-relaxed text-[var(--text-secondary)]">
                    <Marcador estado={p.estado} />
                    <span className={p.estado === "agora" ? "font-medium text-[var(--text-primary)]" : undefined}>
                      {p.rotulo}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </>
        )}

        {/* ── Ações ─────────────────────────────────────────────────────────── */}
        {/* Empilham no celular: lado a lado a 375px, o rótulo do WhatsApp
            quebrava em duas linhas e o botão ficava com o dobro da altura. */}
        <div className="flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
          <button
            onClick={onVoltar}
            className="inline-flex h-10 items-center justify-center rounded-[8px] border border-[var(--border)] px-5 text-[13px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg)]"
          >
            Voltar ao início
          </button>
          <a
            href={WHATSAPP}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center justify-center rounded-[8px] bg-[var(--text-primary)] px-5 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
          >
            Falar com a Dioli no WhatsApp
          </a>
        </div>

        {referencia && (
          <p className="mt-6 break-all text-[10px] text-[var(--text-subtle)]">Referência: {referencia}</p>
        )}
      </div>
    </div>
  );
}

/**
 * O selo do topo.
 *
 * ⚠️ "andando" NÃO é um ✓ verde, e isso foi defeito achado na captura a 375px:
 * a tela dizia "Estamos montando seu orçamento" com um tique verde de concluído
 * em cima. Quem bate o olho lê o símbolo antes da frase e vai embora achando que
 * acabou. Tique verde é DONE; enquanto anda, o selo é um ponto pulsando em tom
 * neutro. Três estados, três símbolos — nunca dois estados com a mesma cara.
 */
function Selo({ tom }: { tom: "andando" | "pronto" | "atencao" | "erro" }) {
  if (tom === "andando") {
    return (
      <div
        className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full"
        style={{ backgroundColor: "var(--bg)", border: "1px solid var(--border-strong)" }}
        aria-hidden="true"
      >
        <span
          className="block h-3 w-3 animate-pulse rounded-full"
          style={{ backgroundColor: "var(--text-primary)" }}
        />
      </div>
    );
  }
  const cor =
    tom === "erro"
      ? { bg: "var(--danger-bg)", fg: "var(--danger)", glifo: "!" }
      : tom === "atencao"
        ? { bg: "var(--warning-bg)", fg: "var(--warning)", glifo: "!" }
        : { bg: "var(--success-bg)", fg: "var(--success)", glifo: "✓" };
  return (
    <div
      className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full text-[22px] font-bold"
      style={{ backgroundColor: cor.bg, color: cor.fg }}
      aria-hidden="true"
    >
      {cor.glifo}
    </div>
  );
}

function Marcador({ estado }: { estado: Passo["estado"] }) {
  if (estado === "feito") {
    return (
      <span
        className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
        style={{ backgroundColor: "var(--success)" }}
      >
        ✓
      </span>
    );
  }
  if (estado === "parado") {
    return (
      <span
        className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
        style={{ backgroundColor: "var(--warning)" }}
      >
        !
      </span>
    );
  }
  if (estado === "agora") {
    return (
      <span
        className="mt-0.5 flex h-4 w-4 shrink-0 animate-pulse items-center justify-center rounded-full text-[9px] font-bold text-white"
        style={{ backgroundColor: "var(--text-primary)" }}
      >
        •
      </span>
    );
  }
  return (
    <span
      className="mt-0.5 h-4 w-4 shrink-0 rounded-full border"
      style={{ borderColor: "var(--border-strong)" }}
    />
  );
}
