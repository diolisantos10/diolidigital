"use client";

// FaixaDaEsteira — a primeira coisa que qualquer pessoa lê ao abrir um projeto.
//
// O pedido que originou este componente: "quem abre o projeto precisa entender
// de cara, só olhando a primeira tela, o que está acontecendo e em que etapa
// está" — valendo tanto para quem trabalha na agência quanto para o cliente,
// que pode ser leigo.
//
// As decisões de desenho, e o porquê de cada uma:
//
//   • UMA FRASE ANTES DE QUALQUER NÚMERO. Painel que abre com métrica exige que
//     a pessoa monte o significado sozinha. Aqui a leitura já vem pronta.
//
//   • QUEM TEM A BOLA, EM DESTAQUE. A pergunta que trava projeto de agência
//     nunca é "quanto por cento"; é "está esperando quem?". Sem dono explícito,
//     todo mundo acha que a vez é do outro.
//
//   • O QUE TRAVA APARECE, NÃO SE ESCONDE. Pendência omitida vira surpresa na
//     terceira semana. Ela ocupa espaço na tela de propósito.
//
//   • A TRILHA MOSTRA O CAMINHO INTEIRO. Ver as etapas seguintes é o que faz
//     alguém entender o processo sem ninguém explicar.
//
// O mesmo componente serve as duas plateias: `publico="cliente"` troca a
// linguagem e esconde o que é assunto interno. A verdade é a mesma nos dois
// casos — se cada lado tivesse a própria leitura, um dia divergiriam, e não há
// jeito pior de perder a confiança do cliente.

type Semaforo = "andando" | "esperando" | "travado" | "concluido";
type EstadoDaEtapa = "feito" | "atual" | "futuro";

export interface FaixaProps {
  publico: "equipe" | "cliente";
  titulo: string;
  agora: string;
  /** Para a equipe: o próximo passo. Para o cliente: o que se espera dele. */
  destaque?: string;
  responsavel: string;
  semaforo: Semaforo;
  progresso: number;
  trilha: { etapa: string; estado: EstadoDaEtapa }[];
  pendencias?: string[];
  /** Ações disponíveis agora. A faixa não decide nada — só oferece. */
  acoes?: { rotulo: string; onClick: () => void; primaria?: boolean; carregando?: boolean }[];
}

const CORES: Record<Semaforo, { fundo: string; borda: string; texto: string; ponto: string; rotulo: string }> = {
  andando:   { fundo: "#E6FBFA", borda: "#99E5E0", texto: "#0F5F5A", ponto: "#0FA69C", rotulo: "Em andamento" },
  esperando: { fundo: "#FEF6E7", borda: "#F5D9A3", texto: "#7A5310", ponto: "#D97706", rotulo: "Aguardando" },
  travado:   { fundo: "#FEECEC", borda: "#F5B5B5", texto: "#8C1F1F", ponto: "#DC2626", rotulo: "Parado" },
  concluido: { fundo: "#DCFCE7", borda: "#A3E5BE", texto: "#14532D", ponto: "#16A34A", rotulo: "Concluído" },
};

export default function FaixaDaEsteira({
  publico, titulo, agora, destaque, responsavel, semaforo, progresso, trilha, pendencias = [], acoes = [],
}: FaixaProps) {
  const c = CORES[semaforo];
  const paraCliente = publico === "cliente";
  // Normalmente existe exatamente uma etapa "atual". Quando não existe — projeto
  // concluído, trilha inteira marcada como feita — cair na PRIMEIRA seria dizer
  // "etapa 1 de 9" num projeto 100% entregue. O certo é a última percorrida.
  const marcada = trilha.findIndex((t) => t.estado === "atual");
  const ultimaFeita = trilha.map((t) => t.estado).lastIndexOf("feito");
  const indiceAtual = marcada >= 0 ? marcada : Math.max(0, ultimaFeita);
  const etapaAtual = trilha[indiceAtual];

  return (
    <section
      aria-label="Situação do projeto"
      style={{ background: c.fundo, borderColor: c.borda }}
      className="rounded-2xl border p-5 sm:p-6"
    >
      {/* Linha 1 — o estado, em uma olhada */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden
            style={{ background: c.ponto }}
            className={`h-2.5 w-2.5 rounded-full ${semaforo === "andando" ? "animate-pulse" : ""}`}
          />
          <span style={{ color: c.texto }} className="text-[11px] font-semibold uppercase tracking-[0.12em]">
            {c.rotulo}
          </span>
        </span>

        <span className="text-[11px] text-[var(--text-secondary)]">
          {paraCliente && responsavel === "Você" ? "Sua vez" : `Com ${responsavel.toLowerCase()}`}
        </span>
      </div>

      {/* Linha 2 — a frase que explica tudo, antes de qualquer número */}
      <h2 style={{ color: c.texto }} className="mt-3 text-[20px] sm:text-[22px] font-semibold leading-tight text-balance">
        {titulo}
      </h2>
      <p className="mt-1.5 max-w-[62ch] text-[14px] leading-relaxed text-[var(--text-primary)]">{agora}</p>

      {destaque ? (
        <p
          style={{ borderColor: c.borda }}
          className="mt-3 max-w-[62ch] rounded-xl border bg-white/70 px-3.5 py-2.5 text-[13px] leading-relaxed text-[var(--text-primary)]"
        >
          <strong className="font-semibold">{paraCliente ? "O que precisamos de você: " : "Próximo passo: "}</strong>
          {destaque}
        </p>
      ) : null}

      {/* Linha 3 — o que está travando. Aparece, nunca some. */}
      {pendencias.length > 0 ? (
        <div className="mt-3.5 rounded-xl border border-[#F5B5B5] bg-white/70 px-3.5 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#8C1F1F]">
            {paraCliente ? "Esperando de você" : "Travando a produção"}
          </p>
          <ul className="mt-1.5 space-y-1">
            {pendencias.map((p, i) => (
              <li key={i} className="text-[13px] leading-snug text-[var(--text-primary)]">— {p}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Linha 4 — a trilha: o caminho inteiro, para entender sem explicação */}
      <div className="mt-5">
        <div className="flex items-center gap-1.5" role="list" aria-label="Etapas do projeto">
          {trilha.map((t, i) => (
            <span
              key={i}
              role="listitem"
              aria-current={t.estado === "atual" ? "step" : undefined}
              title={t.etapa}
              style={{ background: t.estado === "futuro" ? "#E5E5E2" : t.estado === "atual" ? c.ponto : "var(--text-muted)" }}
              className={`h-1.5 flex-1 rounded-full ${t.estado === "atual" ? "" : "opacity-80"}`}
            />
          ))}
        </div>
        {/* No celular, nove rótulos viram duas linhas de sopa — ruído, não
            informação. Lá mostramos só onde o projeto está; a lista inteira
            aparece a partir do tablet, onde cabe numa linha e ajuda de verdade. */}
        <p className="mt-2 text-[12px] text-[var(--text-primary)] sm:hidden">
          <span className="font-semibold">{etapaAtual?.etapa ?? ""}</span>
          <span className="text-[var(--text-secondary)]"> · etapa {indiceAtual + 1} de {trilha.length}</span>
        </p>

        <div className="mt-2 hidden flex-wrap items-center gap-x-3 gap-y-1 sm:flex">
          {trilha.map((t, i) => (
            <span
              key={i}
              className={
                t.estado === "atual"
                  ? "text-[11px] font-semibold text-[var(--text-primary)]"
                  : t.estado === "feito"
                    ? "text-[11px] text-[var(--text-secondary)]"
                    : "text-[11px] text-[var(--text-muted)]"
              }
            >
              {t.estado === "feito" ? "✓ " : ""}{t.etapa}
            </span>
          ))}
        </div>
        <p className="mt-2 text-[11px] tabular-nums text-[var(--text-secondary)]">{progresso}% do caminho até a entrega</p>
      </div>

      {/* Linha 5 — o que dá para fazer agora */}
      {acoes.length > 0 ? (
        <div className="mt-5 flex flex-wrap gap-2">
          {acoes.map((a, i) => (
            <button
              key={i}
              type="button"
              onClick={a.onClick}
              disabled={a.carregando}
              className={
                a.primaria
                  ? "rounded-xl bg-[var(--navy)] px-4 py-2 text-[13px] font-medium text-white transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--navy)] focus-visible:ring-offset-2 disabled:opacity-50"
                  : "rounded-xl border border-[var(--border-strong)] bg-white px-4 py-2 text-[13px] font-medium text-[var(--text-primary)] transition hover:bg-[var(--bg)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--navy)] focus-visible:ring-offset-2 disabled:opacity-50"
              }
            >
              {a.carregando ? "Um instante…" : a.rotulo}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
