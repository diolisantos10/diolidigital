"use client";

// ESPERANDO O CLIENTE DECIDIR — a faixa que faltava no Centro de Aprovações.
//
// ── POR QUE ELA EXISTE (16/08/2026) ───────────────────────────────────────
//
// O Centro de Aprovações mostrava quatro filas — proposta enviada, entrega em
// revisão, atualização de marca, material pedido — e **não mostrava a fila mais
// cara de todas**: o card de aprovação que já foi para o cliente e ninguém
// decidiu. A peça está pronta, a IA já foi paga, o relógio já foi gasto, e ela
// morre esperando um clique. Do lado de fora parece que a agência não entregou;
// do lado de dentro parece que entregou.
//
// A varredura que sabe contar isso (`lib/agency/esteira/aprovacao-parada.ts`)
// existia completa e testada, com ZERO chamadores de produção. O relógio passou
// a chamá-la no mesmo dia — mas **log do Railway não é tela**, e fila que só
// existe se alguém lembrar de abrir o console é a mesma fila morta com um
// arquivo bonito ao lado.
//
// ── OS DOIS NÚMEROS NÃO SE SOMAM ──────────────────────────────────────────
//
//   • "esperando o cliente" — a bola é DELE. Cobrar é legítimo.
//   • "ele perguntou e não respondemos" — a bola é NOSSA, e o prazo dele está
//     PAUSADO enquanto isso (é o que o schema diz em `questionOpenedAt`).
//
// Somá-los produziria a pior espécie de alarme: um que cobra o cliente pelo
// atraso da própria casa. Por isso a dívida nossa sobe em cima, separada — e é
// a única linha vermelha desta faixa.
//
// ── ESTA FAIXA NÃO DECIDE NADA ────────────────────────────────────────────
//
// Não aprova, não reprova, não expira card e não avisa ninguém. Aprovar no
// lugar do cliente é falsificar o consentimento dele, e é o único erro da lista
// que não tem desfazer. Ela CONTA e APONTA.

import { useCallback, useEffect, useState } from "react";

interface Parada {
  id: string;
  departamento: string;
  diasParado: number;
  prazoVencido: boolean;
  bolaConosco: boolean;
  deQuemEAVez: string;
}

interface Resumo {
  paradas: number;
  abandonadas: number;
  bolaConosco: number;
  maisAntigoEmDias: number | null;
}

type Estado =
  | { estado: "carregando" }
  | { estado: "ok"; resumo: Resumo; fila: Parada[]; semDono: number; abandono: number }
  /** "não consegui olhar" tem tela própria. Fila vazia por falha de leitura é
   *  exatamente como esta fila ficou invisível desde sempre. */
  | { estado: "nao_medido"; motivo: string };

const dias = (n: number) => `${n} dia${n === 1 ? "" : "s"}`;

/** Quantos nomes a faixa mostra antes de virar enxurrada. O teto vale para a
 *  LISTA, nunca para a contagem — truncar a contagem mentiria sobre o tamanho
 *  da fila. */
const TETO_DA_LISTA = 6;

/**
 * @param onContagem quantos itens esta faixa acrescenta ao "pendente" da tela.
 *   `null` = **não medido**, que é diferente de zero. Sem isto o cabeçalho da
 *   página dizia *"Nenhum item pendente — tudo em dia"* com cinco peças paradas
 *   listadas dois centímetros abaixo: duas afirmações opostas na mesma tela, que
 *   é o defeito do cartão do Drive de 07/08 ("conectado" e "não conectado" ao
 *   mesmo tempo) repetido.
 */
/**
 * A leitura, FORA do componente e sem tocar em estado de React.
 *
 * Ela vive aqui em cima de propósito: um `useCallback` que chama `setState` e é
 * disparado por um efeito é renderização em cascata — o lint da casa reprova, e
 * com razão. Aqui a função só devolve o que leu; quem decide o que fazer com
 * isso é o efeito, depois do `await`, e só se o componente ainda estiver na
 * tela.
 */
async function lerAFila(): Promise<Estado> {
  try {
    const resp = await fetch("/api/agency/aprovacoes-paradas");
    const body = await resp.json();
    if (!resp.ok || body?.medido !== true) {
      return {
        estado: "nao_medido",
        motivo: body?.motivo ?? "a fila de aprovações não pôde ser lida agora",
      };
    }
    return {
      estado: "ok",
      resumo: body.resumo,
      fila: body.fila ?? [],
      semDono: body.semDono ?? 0,
      abandono: body.diasAteVirarAbandono ?? 3,
    };
  } catch {
    return {
      estado: "nao_medido",
      motivo: "não consegui falar com o servidor — esta fila não é zero, é desconhecida",
    };
  }
}

/** Quantos itens esta faixa acrescenta ao "pendente" da tela. `null` = **não
 *  medido**, que não é zero. */
function quantosPendentes(e: Estado): number | null {
  if (e.estado !== "ok") return null;
  // O órfão entra na conta: ele é peça pronta esperando decisão igual às
  // outras — só que sem fila que o mostre.
  return e.resumo.paradas + e.semDono;
}

export default function EsperandoOCliente({ onContagem }: { onContagem?: (n: number | null) => void }) {
  const [dados, setDados] = useState<Estado>({ estado: "carregando" });
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    // `vivo` não é zelo decorativo: esta faixa fica numa tela que a pessoa
    // abre e fecha depressa, e escrever estado depois da saída é um aviso de
    // React que ninguém lê até virar bug de verdade.
    let vivo = true;
    void (async () => {
      const lido = await lerAFila();
      if (!vivo) return;
      setDados(lido);
      onContagem?.(quantosPendentes(lido));
    })();
    return () => { vivo = false; };
  }, [onContagem, tentativa]);

  const carregar = useCallback(() => {
    setDados({ estado: "carregando" });
    setTentativa((n) => n + 1);
  }, []);

  if (dados.estado === "carregando") {
    return <div className="h-[92px] rounded-[12px] border border-[var(--border)] bg-[var(--bg)] animate-pulse mb-8" />;
  }

  if (dados.estado === "nao_medido") {
    return (
      <div className="mb-8 rounded-[12px] border border-[var(--danger)] bg-[var(--danger-bg)] px-4 sm:px-5 py-4">
        <p className="text-[13px] font-semibold text-[var(--danger)]">
          Não consegui ler o que espera decisão do cliente
        </p>
        <p className="text-[13px] text-[var(--text-secondary)] mt-1 leading-relaxed">{dados.motivo}</p>
        <p className="text-[12px] text-[var(--text-muted)] mt-2 leading-relaxed">
          Isto <strong>não</strong> quer dizer que a fila está vazia. Quer dizer que ela não foi medida agora.
        </p>
        <button
          onClick={carregar}
          className="mt-3 h-9 px-4 rounded-[8px] border border-[var(--border)] bg-white text-[13px] font-medium text-[var(--text-primary)]"
        >
          Tentar de novo
        </button>
      </div>
    );
  }

  const { resumo, fila, semDono, abandono } = dados;

  // Fila vazia é boa notícia — e diz isso numa linha, em vez de sumir. Sumir
  // deixaria quem lê sem saber se a fila está vazia ou se ninguém olhou, que é
  // a diferença que esta faixa inteira existe para marcar.
  if (resumo.paradas === 0 && semDono === 0) {
    return (
      <p className="mb-8 text-[13px] text-[var(--text-muted)] leading-relaxed">
        Nenhuma peça esperando decisão do cliente. <strong>Isto é boa notícia:</strong> nada pronto
        está parado no portal dele.
      </p>
    );
  }

  const mostrados = fila.slice(0, TETO_DA_LISTA);

  return (
    <div className="mb-8">
      <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-1.5">
        Esperando decisão no portal do cliente · {resumo.paradas}
      </p>
      <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed mb-3">
        Peça pronta que já foi para o cliente e ninguém decidiu. Esta faixa <strong>só conta</strong> —
        ninguém é aprovado, reprovado nem cobrado por máquina.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {/* A DÍVIDA NOSSA VEM PRIMEIRO. É a única vermelha, e é a única em que
            o conserto é uma pessoa desta casa responder. */}
        <Numero
          valor={resumo.bolaConosco}
          rotulo="ele perguntou e não respondemos"
          nota="a vez é NOSSA — e o prazo dele está pausado"
          tom={resumo.bolaConosco > 0 ? "danger" : "neutro"}
        />
        <Numero
          valor={resumo.paradas}
          rotulo="esperando a decisão dele"
          nota={
            resumo.maisAntigoEmDias !== null
              ? `a mais antiga há ${dias(resumo.maisAntigoEmDias)}`
              : "ninguém nessa situação"
          }
          tom="neutro"
        />
        <Numero
          valor={resumo.abandonadas}
          rotulo={`passaram do prazo ou de ${dias(abandono)}`}
          nota="parte do número ao lado — não some os dois"
          tom={resumo.abandonadas > 0 ? "warning" : "neutro"}
        />
      </div>

      {semDono > 0 && (
        <p className="mt-2.5 text-[12px] text-[var(--warning)] leading-relaxed">
          <strong>{semDono} card(s) pendentes sem dono</strong> — sem solicitação e sem cliente
          ligados, eles não entram em nenhuma fila por workspace e não estão contados acima.
          Consertar isso é decisão de gente.
        </p>
      )}

      {mostrados.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {mostrados.map((c) => (
            <li
              key={c.id}
              className={`rounded-[8px] border px-3 py-2 bg-white ${
                c.bolaConosco ? "border-[var(--danger)]" : "border-[var(--border)]"
              }`}
            >
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-[13px] font-medium text-[var(--text-primary)]">{c.departamento}</span>
                <span className="text-[12px] text-[var(--text-muted)] tabular-nums">
                  parada há {dias(c.diasParado)}
                </span>
                {c.prazoVencido && (
                  <span className="text-[12px] font-semibold text-[var(--warning)]">passou do prazo</span>
                )}
              </div>
              <p
                className={`text-[12px] leading-relaxed mt-0.5 ${
                  c.bolaConosco ? "text-[var(--danger)] font-medium" : "text-[var(--text-muted)]"
                }`}
              >
                {c.deQuemEAVez}
              </p>
            </li>
          ))}
        </ul>
      )}

      {fila.length > mostrados.length && (
        <p className="mt-2 text-[12px] text-[var(--text-muted)]">
          e mais {fila.length - mostrados.length} — a lista tem teto, a contagem acima não.
        </p>
      )}
    </div>
  );
}

function Numero({
  valor, rotulo, nota, tom,
}: { valor: number; rotulo: string; nota: string; tom: "danger" | "warning" | "neutro" }) {
  const cor =
    tom === "danger" ? "text-[var(--danger)]" : tom === "warning" ? "text-[var(--warning)]" : "text-[var(--text-primary)]";
  const borda =
    tom === "danger" ? "border-[var(--danger)]" : tom === "warning" ? "border-[var(--warning)]" : "border-[var(--border)]";
  return (
    // No celular cada número é uma LINHA — três blocos altos empurrariam a
    // primeira fila real para longe da dobra, e quem abre esta tela vem
    // decidir, não contar. A partir de `sm` volta a ser cartão.
    <div className={`rounded-[12px] border ${borda} bg-white px-4 py-3`}>
      <div className="flex items-baseline gap-2.5 sm:block">
        <p className={`text-[24px] sm:text-[26px] font-semibold leading-none tabular-nums shrink-0 ${cor}`}>{valor}</p>
        <p className="text-[13px] font-medium text-[var(--text-primary)] sm:mt-1.5 leading-snug">{rotulo}</p>
      </div>
      <p className="text-[12px] text-[var(--text-muted)] mt-1 leading-relaxed">{nota}</p>
    </div>
  );
}
