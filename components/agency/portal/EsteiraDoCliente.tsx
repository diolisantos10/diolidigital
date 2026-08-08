"use client";

// EsteiraDoCliente — a mesma verdade da esteira, do lado do cliente.
//
// O cliente pode ser leigo em marketing e nunca ter visto este sistema. Ao abrir
// o portal ele precisa entender, em cinco segundos e sem ninguém explicar:
// em que pé está o trabalho dele, e se a bola está com ele ou com a agência.
//
// Duas travas de linguagem, e as duas importam:
//
//   • Nada de jargão interno. Ele não sabe o que é "entregável", "canvas" ou
//     "departamento" — nem precisa saber. Isso é garantido por teste, não por
//     boa vontade de quem escreve a próxima frase.
//
//   • Só pedimos algo quando é REALMENTE a vez dele. Portal que vive cobrando
//     é portal que o cliente para de abrir.
//
// As duas decisões que ele pode tomar aqui — aprovar a direção e aprovar o
// pacote — são as que fazem a esteira andar do lado de cá. O resto é leitura.

import { useCallback, useEffect, useState } from "react";
import FaixaDaEsteira from "../FaixaDaEsteira";

interface EstadoDoCliente {
  ok: boolean;
  temProjeto: boolean;
  projeto?: string;
  etapa?: string;
  titulo?: string;
  agora: string;
  oQueEsperamosDeVoce?: string;
  aBolaEstaComVoce?: boolean;
  progresso?: number;
  trilha?: { etapa: string; estado: "feito" | "atual" | "futuro" }[];
  pendencias?: string[];
  ciclo?: { referencia: string; resumo: string | null } | null;
}

/**
 * ── AUSÊNCIA BENIGNA NÃO VIRA FALHA INVENTADA (08/08/2026) ───────────────────
 *
 * O servidor JÁ distingue os dois casos: 404 quando ainda não há projeto para
 * acompanhar (ausência), 403/400/500 quando alguma coisa deu errado (falha).
 * Este componente colapsava tudo em "Não consegui carregar agora. Tente
 * atualizar a página." — e atualizar NUNCA resolvia, porque não havia nada
 * quebrado.
 *
 * O custo era o pior possível: este é o estado do PRIMEIRO DIA de todo cliente
 * pagante, e aparecia DUAS vezes no percurso (Início e Projetos). A primeira
 * coisa que quem acabou de assinar lia era uma mensagem de erro.
 *
 * A regra da casa tem duas metades, e as duas valem aqui: falha de leitura não
 * vira fato sobre o cliente — e ausência benigna não vira falha inventada.
 */
type Leitura =
  | { fase: "carregando" }
  | { fase: "vazio"; titulo: string; agora: string }
  | { fase: "erro" }
  | { fase: "ok"; estado: EstadoDoCliente };

const VAZIO_PADRAO = {
  titulo: "Seu projeto está sendo montado",
  agora:
    "A equipe está organizando o começo do seu trabalho. Assim que a primeira etapa abrir, o andamento aparece aqui — e quando algo depender de você, avisamos primeiro.",
};

export default function EsteiraDoCliente({
  token,
  aoIrParaAprovacoes,
  aoFalarComPM,
}: {
  token: string;
  /**
   * ── UM ÚNICO LUGAR PARA DECIDIR (CEO, 07/08/2026) ────────────────────────
   * Quando informado, a esteira PARA de decidir: "Aprovar e começar" e
   * "Aprovar tudo" viram um caminho para Aprovações, que é onde toda decisão
   * do cliente mora.
   *
   * Por que isto era um problema real: este componente renderiza no Início E
   * em Projetos. O mesmo botão "Aprovar tudo" existia nas duas telas, e em
   * nenhuma delas chamada "Aprovações" — três lugares para a mesma decisão.
   * O cliente clicava numa, voltava na outra, via o botão de novo e não sabia
   * se já tinha decidido.
   */
  aoIrParaAprovacoes?: () => void;
  /** Caminho de saída do estado vazio: a conversa com o PM, que já vive na
   *  página. Sem ele o vazio vira beco — DESIGN.md §7.2. */
  aoFalarComPM?: () => void;
}) {
  const [leitura, setLeitura] = useState<Leitura>({ fase: "carregando" });
  const [decidindo, setDecidindo] = useState(false);
  const [recado, setRecado] = useState<string | null>(null);

  const buscar = useCallback(async () => {
    try {
      // A4: token vazio = modo cookie — o httpOnly autentica sozinho.
      const r = await fetch(token ? `/api/portal/esteira?token=${encodeURIComponent(token)}` : "/api/portal/esteira", { cache: "no-store" });
      const corpo = await r.json().catch(() => null);

      // 404 é a resposta do servidor para "ainda não existe projeto" — ausência,
      // não falha. Ele já sabe a diferença; aqui a gente só para de apagá-la.
      if (r.status === 404) { setLeitura({ fase: "vazio", ...VAZIO_PADRAO }); return; }
      if (!r.ok || !corpo?.ok) { setLeitura({ fase: "erro" }); return; }

      // 200 com `temProjeto: false`: o servidor tem a própria frase para o
      // começo do trabalho — ela ganha do texto padrão daqui.
      if (!corpo.temProjeto) {
        setLeitura({
          fase: "vazio",
          titulo: corpo.titulo?.trim() || VAZIO_PADRAO.titulo,
          agora: corpo.agora?.trim() || VAZIO_PADRAO.agora,
        });
        return;
      }
      setLeitura({ fase: "ok", estado: corpo as EstadoDoCliente });
    } catch {
      setLeitura({ fase: "erro" });
    }
  }, [token]);

  useEffect(() => { void buscar(); }, [buscar]);

  async function decidir(decisao: "aprovar_direcao" | "aprovar_pacote") {
    setDecidindo(true);
    try {
      const r = await fetch("/api/portal/esteira", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(token ? { token, decisao } : { decisao }),
      });
      const dados = await r.json();
      setRecado(dados.mensagem ?? null);
      await buscar();
    } catch {
      setRecado("Não consegui registrar agora. Pode tentar de novo?");
    } finally {
      setDecidindo(false);
    }
  }

  // ── 1/3 · CARREGANDO ──────────────────────────────────────────────────────
  if (leitura.fase === "carregando") {
    return (
      <section
        aria-busy role="status" aria-live="polite"
        className="rounded-[14px] border border-[var(--border)] bg-white p-5 shadow-[0_1px_3px_rgba(7,10,31,0.04)]"
      >
        <div className="h-5 w-2/3 animate-pulse rounded-lg bg-[var(--accent)]" />
        <div className="mt-2.5 h-4 w-full max-w-md animate-pulse rounded-lg bg-[var(--accent)]" />
        <div className="mt-4 h-2 w-full animate-pulse rounded-full bg-[var(--accent)]" />
        <span className="sr-only">Carregando o andamento do seu projeto…</span>
      </section>
    );
  }

  // ── 2/3 · VAZIO · o trabalho ainda não começou ────────────────────────────
  // Não é erro e não tem "tente atualizar": nomeia o próximo passo, sem culpar
  // o cliente e sem prometer data que a agência não pode cumprir.
  if (leitura.fase === "vazio") {
    return (
      <section className="rounded-[14px] border border-[var(--border)] bg-white p-6 shadow-[0_1px_3px_rgba(7,10,31,0.04)]">
        <div className="flex items-start gap-3.5">
          <span aria-hidden className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-[var(--accent-light)] text-[18px]">🛠️</span>
          <div className="min-w-0">
            <h2 className="text-[16px] font-bold leading-snug text-[var(--text-primary)]">{leitura.titulo}</h2>
            <p className="mt-1.5 max-w-[58ch] text-[13px] leading-relaxed text-[var(--text-secondary)]">{leitura.agora}</p>
            {/* Caminho, não chamado à ação. Aqui não há nada que o cliente
                PRECISE fazer — botão cheio implicaria que há. E um botão
                "Falar com seu PM" a três dedos do flutuante que diz a mesma
                coisa é a mesma porta desenhada duas vezes. */}
            {aoFalarComPM && (
              <button
                onClick={aoFalarComPM}
                style={{ touchAction: "manipulation" }}
                className="mt-3 inline-flex h-8 items-center text-[13px] font-semibold text-[var(--teal-text)] hover:underline"
              >
                Tem uma dúvida? Fale com seu PM →
              </button>
            )}
          </div>
        </div>
      </section>
    );
  }

  // ── 3/3 · ERRO · aí sim algo quebrou, e existe o que tentar ───────────────
  if (leitura.fase === "erro") {
    return (
      <section role="alert" className="rounded-[14px] border border-[var(--border)] bg-white p-6 shadow-[0_1px_3px_rgba(7,10,31,0.04)]">
        <h2 className="text-[15px] font-bold text-[var(--text-primary)]">Não consegui carregar o andamento agora</h2>
        <p className="mt-1.5 max-w-[58ch] text-[13px] leading-relaxed text-[var(--text-secondary)]">
          Costuma ser a conexão. Seu projeto continua do mesmo jeito — só esta parte da tela não chegou.
        </p>
        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          <button
            onClick={() => { setLeitura({ fase: "carregando" }); void buscar(); }}
            style={{ touchAction: "manipulation" }}
            className="h-10 rounded-[10px] bg-[var(--text-primary)] px-4 text-[13px] font-semibold text-white"
          >
            Tentar de novo
          </button>
          {aoFalarComPM && (
            <button
              onClick={aoFalarComPM}
              style={{ touchAction: "manipulation" }}
              className="h-10 rounded-[10px] border border-[var(--border-strong)] bg-white px-4 text-[13px] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)]"
            >
              Falar com seu PM
            </button>
          )}
        </div>
      </section>
    );
  }

  const estado = leitura.estado;
  const acoes: { rotulo: string; onClick: () => void; primaria?: boolean; carregando?: boolean }[] = [];
  const etapa = estado.etapa ?? "";

  const pedeDirecao = etapa.toLowerCase().includes("confirme o caminho");
  const pedePacote  = etapa.toLowerCase().includes("tudo pronto");

  if (aoIrParaAprovacoes) {
    // Modo CAMINHO: a esteira anuncia a decisão e leva até ela. Nunca decide.
    if (pedeDirecao || pedePacote) {
      acoes.push({ rotulo: "Ver e decidir em Aprovações", primaria: true, onClick: aoIrParaAprovacoes });
    }
  } else {
    if (pedeDirecao) {
      acoes.push({
        rotulo: "Aprovar e começar",
        primaria: true, carregando: decidindo,
        onClick: () => void decidir("aprovar_direcao"),
      });
    }
    if (pedePacote) {
      acoes.push({
        rotulo: "Aprovar tudo",
        primaria: true, carregando: decidindo,
        onClick: () => void decidir("aprovar_pacote"),
      });
    }
  }

  return (
    <div className="space-y-2">
      <FaixaDaEsteira
        publico="cliente"
        titulo={estado.etapa ?? "Seu projeto"}
        agora={estado.agora}
        {...(estado.oQueEsperamosDeVoce ? { destaque: estado.oQueEsperamosDeVoce } : {})}
        responsavel={estado.aBolaEstaComVoce ? "Você" : "Nosso time"}
        semaforo={estado.aBolaEstaComVoce ? "esperando" : "andando"}
        progresso={estado.progresso ?? 0}
        trilha={estado.trilha ?? []}
        pendencias={estado.pendencias ?? []}
        acoes={acoes}
      />

      {estado.ciclo ? (
        <p className="px-1 text-[12px] text-[var(--text-secondary)]">
          Acompanhamento de {estado.ciclo.referencia}
          {estado.ciclo.resumo ? ` — ${estado.ciclo.resumo}` : ""}
        </p>
      ) : null}

      {recado ? (
        <p role="status" className="rounded-xl border border-[var(--border)] bg-[var(--success-bg)] px-3.5 py-2.5 text-[13px] text-[var(--success)]">
          {recado}
        </p>
      ) : null}
    </div>
  );
}
