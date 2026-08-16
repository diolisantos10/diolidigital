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

// ── 🔴 O QUE A AUDITORIA DE 16/08 ACHOU AQUI ──────────────────────────────
//
// **A faixa somava os dois baldes e cobrava o cliente pelo atraso da casa.**
// Ela imprimia `resumo.paradas` sob o rótulo "esperando a decisão dele" — e
// `paradas` é o TOTAL, que inclui `bolaConosco`. Medido: 3 cards, 2 com dúvida
// aberta → a faixa mostrava "2 ele perguntou e não respondemos" **e** "3
// esperando a decisão dele — a mais antiga há 6 dias", quando só **1** esperava
// o cliente e os 6 dias eram de um card cujo relógio o schema declara PAUSADO.
//
// É literalmente o alarme que o cabeçalho acima jura impedir. **A separação
// estava feita na prosa e não estava feita no número** — e o aviso de não-soma
// ficava entre `abandonadas` e `paradas`, que não era o par que se sobrepunha.
//
// A conta passou a morar no servidor (`esperandoOCliente`, em
// `lib/agency/esteira/aprovacao-parada.ts`): tela que faz conta é a segunda
// cópia da regra, e cópia diverge.

import { useCallback, useEffect, useState } from "react";
import {
  Carregando, CartaoDeErro, Numero, Placar, TituloDeFila, dias, esperaHa, paradaHa, contagem,
} from "@/components/agency/ui/fila/pecas";
import { departamentoEmPortugues } from "@/lib/agency/organizacao/nome-do-departamento";

interface Parada {
  id: string;
  departamento: string;
  diasParado: number;
  prazoVencido: boolean;
  bolaConosco: boolean;
  deQuemEAVez: string;
}

interface Resumo {
  /** O TOTAL. Cliente e casa somados — nunca sob um rótulo que fale de um dos
   *  dois. */
  paradas: number;
  abandonadas: number;
  /** A bola é NOSSA. */
  bolaConosco: number;
  /** A bola é DELE: `paradas − bolaConosco`. Calculado no servidor. */
  esperandoOCliente: number;
  maisAntigoEmDias: number | null;
  /** O mais antigo em que a bola é DELE. Datar a espera do cliente com o
   *  relógio de um card pausado foi o segundo defeito desta faixa. */
  maisAntigoDeleEmDias: number | null;
  maisAntigoNossoEmDias: number | null;
  listados: number;
  amostrada: boolean;
}

type Estado =
  | { estado: "carregando" }
  | {
      estado: "ok";
      resumo: Resumo;
      fila: Parada[];
      /** `null` = **não dá para atribuir**, e isso não é zero. Ver o cabeçalho
       *  da rota: com mais de um inquilino, card órfão não tem dono. */
      semDono: number | null;
      motivoDoSemDono: string | null;
      abandono: number;
    }
  /** "não consegui olhar" tem tela própria. Fila vazia por falha de leitura é
   *  exatamente como esta fila ficou invisível desde sempre. */
  | { estado: "nao_medido"; motivo: string };

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
      // `?? null`, e nunca `?? 0`: "não medi" e "não há" são fatos opostos, e é
      // a distinção que esta faixa inteira existe para marcar.
      semDono: body.semDono ?? null,
      motivoDoSemDono: body.motivoDoSemDono ?? null,
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
  // outras — só que sem fila que o mostre. Quando ele é NULO (mais de um
  // inquilino), a conta inteira vira "não medido": somar zero seria afirmar que
  // não há órfão nenhum.
  if (e.semDono === null) return null;
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
    // O esqueleto ANUNCIA que está carregando (§7.1). Uma barra cinza pulsando
    // não diz nada a quem usa leitor de tela, e a conclusão razoável de um
    // silêncio numa tela de fila é "a fila está vazia".
    return <Carregando blocos={1} etiqueta="Lendo o que espera decisão do cliente…" />;
  }

  if (dados.estado === "nao_medido") {
    // A MESMA peça da tela irmã, com `role="alert"` (§7.3) e o botão da casa.
    // Este bloco era uma cópia byte a byte do de `/agency/leads`, com um
    // `<button>` refeito à mão.
    return (
      <CartaoDeErro
        titulo="Não consegui ler o que espera decisão do cliente"
        motivo={dados.motivo}
        aoTentarDeNovo={carregar}
      />
    );
  }

  const { resumo, fila, semDono, motivoDoSemDono, abandono } = dados;

  // Fila vazia é boa notícia — e diz isso numa linha, em vez de sumir. Sumir
  // deixaria quem lê sem saber se a fila está vazia ou se ninguém olhou, que é
  // a diferença que esta faixa inteira existe para marcar.
  //
  // `semDono === 0` e não `!semDono`: com o órfão NULO (não medido) esta faixa
  // não pode dizer "boa notícia".
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
      <TituloDeFila>Esperando decisão no portal do cliente · {resumo.paradas}</TituloDeFila>
      <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed mb-3">
        Peça pronta que já foi para o cliente e ninguém decidiu. Esta faixa <strong>só conta</strong> —
        ninguém é aprovado, reprovado nem cobrado por máquina.
      </p>

      <Placar>
        {/* A DÍVIDA NOSSA VEM PRIMEIRO. É a única vermelha, e é a única em que
            o conserto é uma pessoa desta casa responder. */}
        <Numero
          valor={resumo.bolaConosco}
          rotulo="ele perguntou e não respondemos"
          nota={
            resumo.maisAntigoNossoEmDias !== null
              ? `a vez é NOSSA — a mais velha ${esperaHa(resumo.maisAntigoNossoEmDias)}, e o prazo dele está pausado`
              : "a vez é NOSSA — e o prazo dele fica pausado enquanto isso"
          }
          tom={resumo.bolaConosco > 0 ? "nossa" : "deles"}
        />
        {/* 🔴 `esperandoOCliente`, e NÃO `paradas`. O total inclui a dívida
            nossa: imprimi-lo aqui cobrava o cliente pelo atraso da casa, e o
            aviso de não-soma estava no cartão errado. */}
        <Numero
          valor={resumo.esperandoOCliente}
          rotulo="esperando a decisão dele"
          nota={
            resumo.maisAntigoDeleEmDias !== null
              ? `a mais antiga ${esperaHa(resumo.maisAntigoDeleEmDias)} — não some com o número ao lado`
              : "ninguém nessa situação"
          }
          tom="deles"
        />
        <Numero
          valor={resumo.abandonadas}
          rotulo={`passaram do prazo ou de ${dias(abandono)}`}
          nota="parte dos dois números ao lado — não some com eles"
          tom={resumo.abandonadas > 0 ? "atencao" : "deles"}
        />
      </Placar>

      {/* Os dois de cima somam o total, e o total aparece no título. Dizê-lo
          aqui é o que impede alguém de somar de novo os três cartões. */}
      <p className="mt-2 text-[12px] text-[var(--text-muted)] leading-relaxed">
        {contagem(resumo.bolaConosco, "é dívida nossa", "são dívida nossa")} e{" "}
        {contagem(resumo.esperandoOCliente, "espera o cliente", "esperam o cliente")}:{" "}
        <strong>{contagem(resumo.paradas, "card parado", "cards parados")}</strong> ao todo.
      </p>

      {semDono !== null && semDono > 0 && (
        <p className="mt-2.5 text-[12px] text-[var(--warning)] leading-relaxed">
          <strong>{contagem(semDono, "card pendente sem dono", "cards pendentes sem dono")}</strong> —
          sem solicitação e sem cliente ligados, eles não entram em nenhuma fila por workspace e não
          estão contados acima. Consertar isso é decisão de gente.
        </p>
      )}

      {/* NÃO MEDIDO não é ZERO, e a faixa diz qual dos dois é. */}
      {semDono === null && motivoDoSemDono && (
        <p className="mt-2.5 text-[12px] text-[var(--text-muted)] leading-relaxed">
          <strong>Cards sem dono: não medidos.</strong> {motivoDoSemDono}.
        </p>
      )}

      {mostrados.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {mostrados.map((c) => {
            const dep = departamentoEmPortugues(c.departamento);
            return (
            <li
              key={c.id}
              className={`rounded-[8px] border px-3 py-2 bg-[var(--card)] ${
                c.bolaConosco ? "border-[var(--danger)]" : "border-[var(--border)]"
              }`}
            >
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                {/* 🔴 "social-media" e "paid-traffic" saíam CRUS aqui. Pior:
                    duas linhas do mesmo departamento ficavam indistinguíveis, e
                    a faixa não diz de que CLIENTE é a peça — ninguém conseguia
                    ir responder. O código do card é o localizador enquanto o
                    nome do cliente não for decidido (ver o LEIA-ME da entrega). */}
                <span className="text-[13px] font-medium text-[var(--text-primary)]">
                  {dep.nome}
                  {!dep.conhecido && (
                    <span className="text-[12px] font-normal text-[var(--text-muted)]"> (chave não cadastrada)</span>
                  )}
                </span>
                <span className="text-[12px] text-[var(--text-muted)] tabular-nums select-all">
                  #{c.id.slice(-6)}
                </span>
                <span className="text-[12px] text-[var(--text-muted)] tabular-nums">
                  {paradaHa(c.diasParado)}
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
            );
          })}
        </ul>
      )}

      {/* 🔴 A FRASE ERA VERDADEIRA SOBRE A LISTA E FALSA SOBRE A CONTAGEM.
          Ela afirmava "a contagem acima não tem teto" enquanto `paradas` saía
          de `fila.length` sobre um `take: 200`. Agora a contagem é consulta
          própria — e a frase só aparece com o número que o servidor mediu. */}
      {resumo.paradas > mostrados.length && (
        <p className="mt-2 text-[12px] text-[var(--text-muted)]">
          A fila tem <strong>{resumo.paradas}</strong> e esta faixa lista {mostrados.length}.{" "}
          {resumo.amostrada
            ? `Os números do placar valem sobre os ${resumo.listados} mais antigos lidos — são piso, não total.`
            : "A lista tem teto; a contagem acima não."}
        </p>
      )}
    </div>
  );
}
