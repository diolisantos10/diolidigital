"use client";

// ── VISÃO GERAL — a primeira tela do cliente ────────────────────────────────
//
// Estrutura portada da referência aprovada (CLAUDE_HANDOFF_2): o herói escuro
// com a marca, o número do período, o gráfico e a faixa de três pulsos; depois
// os números, a faixa de pendências, os departamentos e o rodapé de projetos.
// Nada foi redesenhado nem simplificado.
//
// O QUE MUDA EM RELAÇÃO À DEMONSTRAÇÃO — e por quê:
//
//   • **O número do herói é medido, ou não existe.** A demonstração traz "438
//     contatos, +31,7%". O portal real só escreve um número quando ele foi
//     medido de verdade; sem medição, o mesmo espaço diz por que está vazio e
//     como resolver. Número inventado é o pior erro possível aqui: o cliente lê
//     como se fosse resultado DELE (regra 9 do despacho).
//   • **A comparação com o período anterior só aparece quando existe.** "+31,7%"
//     sem série anterior medida é ficção com cara de gráfico.
//   • **O cabeçalho obedece à regra 2**, e não por convenção: o trio
//     símbolo · marca · nome-da-tela sai de `cabecalhoDoPortal()`, que RECUSA
//     "Visão Geral da Marca" em vez de corrigir em silêncio.

import { cabecalhoDoPortal } from "@/lib/agency/portal/cabecalho";
import type { DepartamentoView } from "@/lib/agency/portal/vista-do-cliente";
import { Etiqueta, Icone, Numeros, TituloDeSecao, Vazio, dataCurta } from "./pecas";

export interface PendenciaDaVisaoGeral {
  id: string;
  titulo: string;
  quando: string;
  urgente: boolean;
}

export interface NumeroMedido {
  rotulo: string;
  valor: string;
  nota: string;
}

export interface ProjetoDaVisaoGeral {
  id: string;
  nome: string;
  objetivo: string | null;
  etapa: string;
  criadoEm: string | null;
}

export interface ResumoDoPeriodo {
  /** O número-manchete já formatado, ou `null` quando nada foi medido. */
  manchete: { rotulo: string; valor: string } | null;
  /** A série diária de alcance. Vazia = sem gráfico e sem eixo, nunca uma linha reta falsa. */
  serie: { data: string; alcance: number }[];
  periodo: string | null;
  /** Por que não há número, em português de gente. */
  porqueVazio: string | null;
}

/**
 * O caminho do gráfico a partir da série medida. Devolve `null` com menos de
 * dois pontos — uma linha de um ponto só é uma linha reta que não aconteceu.
 */
function caminhoDaSerie(serie: { alcance: number }[], largura: number, altura: number): string | null {
  if (serie.length < 2) return null;
  const maximo = Math.max(...serie.map((p) => p.alcance), 1);
  const passo = largura / (serie.length - 1);
  return serie
    .map((p, i) => `${i === 0 ? "M" : "L"}${(i * passo).toFixed(1)} ${(altura - (p.alcance / maximo) * altura).toFixed(1)}`)
    .join(" ");
}

export function VisaoGeral({
  marca, resumo, numeros, pendencias, departamentos, projetos,
  aoIrPara, aoAbrirChat, aoPedirAlgo,
}: {
  /** O nome da marca, do cadastro. O símbolo sai dele, pela mesma função que o
   *  servidor usa — dois lugares nunca discordam sobre qual é a inicial. */
  marca: string;
  resumo: ResumoDoPeriodo;
  numeros: NumeroMedido[];
  pendencias: PendenciaDaVisaoGeral[];
  departamentos: DepartamentoView[];
  projetos: ProjetoDaVisaoGeral[];
  aoIrPara: (aba: string) => void;
  aoAbrirChat: () => void;
  aoPedirAlgo: () => void;
}) {
  // A regra 2 aplicada com trava: se alguém escrever "Visão Geral da Foocci"
  // aqui, isto lança em vez de renderizar a colagem proibida.
  const cabecalho = cabecalhoDoPortal(marca, "Visão Geral");
  const caminho = caminhoDaSerie(resumo.serie, 520, 118);
  const social = departamentos.find((d) => d.chave === "social");
  const trafego = departamentos.find((d) => d.chave === "trafego");
  const pm = departamentos.find((d) => d.chave === "pm");

  return (
    <>
      {/* `sem-numeros` só existe para dar altura ao herói quando o gráfico e o
          número não estão lá: a altura fixa da referência foi medida COM eles, e
          sem eles o botão "Ver relatório completo" encostava na faixa de pulsos. */}
      <section className={`cp-performance-hero${resumo.manchete ? "" : " sem-numeros"}`}>
        <div className="cp-performance-copy">
          {/* 1 · o símbolo do cliente. 2 · o nome da marca AO LADO.
              3 · ABAIXO, o nome da tela. Nunca uma frase só. */}
          <div className="cp-brand-mark" aria-hidden>{cabecalho.simbolo}</div>
          <div>
            <div className="cp-performance-brandline">
              <strong>{cabecalho.marca}</strong>
              {resumo.periodo && <Etiqueta>RESULTADOS DO PERÍODO</Etiqueta>}
            </div>
            <h1>{cabecalho.tela}</h1>
            <p>
              Veja como as redes sociais, os anúncios e os projetos estão contribuindo
              para o crescimento da sua marca.
            </p>

            {/* ── O AVISO DE AUSÊNCIA MORA NO FLUXO, NÃO NO LUGAR DO NÚMERO ──
                O bloco `.cp-performance-number` da referência é ABSOLUTO e
                dimensionado para "438": uma frase de três linhas ali passa por
                cima do parágrafo em 1280 e vira sopa em 375. Sem número medido,
                o elemento simplesmente não existe — e o porquê entra abaixo do
                texto, onde cabe em qualquer largura. */}
            {!resumo.manchete && (
              <p style={{ marginTop: 12, color: "#cfe6e7", maxWidth: 460 }}>
                <b style={{ color: "#fff" }}>Ainda sem números.</b>{" "}
                {resumo.porqueVazio ?? "Assim que houver medição, eles aparecem aqui."}
              </p>
            )}

            <button onClick={() => aoIrPara("resultados")} style={{ touchAction: "manipulation" }}>
              Ver relatório completo →
            </button>
          </div>
        </div>

        {resumo.periodo && <div className="cp-period-control">{resumo.periodo}</div>}

        {resumo.manchete && (
          <div className="cp-performance-number">
            <small>{resumo.manchete.rotulo.toLocaleUpperCase("pt-BR")}</small>
            <span><b>{resumo.manchete.valor}</b></span>
            {/* Sem período anterior medido não há comparação — e a tela diz
                isso, em vez de estampar um "+31,7%" que ninguém apurou. */}
            <p>Medido no período. Ainda não há período anterior para comparar.</p>
          </div>
        )}

        {caminho && (
          <div className="cp-hero-chart">
            <svg viewBox="0 0 520 118" preserveAspectRatio="none" role="img"
                 aria-label={`Alcance por dia no período — ${resumo.serie.length} dias medidos.`}>
              <defs>
                <linearGradient id="cpHeroArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#70e6e9" stopOpacity=".4" />
                  <stop offset="1" stopColor="#70e6e9" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={`${caminho} L520 118 L0 118Z`} fill="url(#cpHeroArea)" />
              <path d={caminho} fill="none" stroke="#70e6e9" strokeWidth="4" />
            </svg>
          </div>
        )}

        <div className="cp-performance-pulse">
          <button onClick={() => aoIrPara("social")} style={{ touchAction: "manipulation" }}>
            <i aria-hidden>◎</i>
            <span><small>SOCIAL MEDIA</small><b>{social?.ativo ? "Em movimento" : "Sem publicação"}</b></span>
            <em>{social?.situacao}</em>
            <strong aria-hidden>→</strong>
          </button>
          <button onClick={() => aoIrPara("trafego")} style={{ touchAction: "manipulation" }}>
            <i aria-hidden>↗</i>
            <span><small>TRÁFEGO PAGO</small><b>{trafego?.ativo ? "No ar" : "Sem campanha"}</b></span>
            <em>{trafego?.situacao}</em>
            <strong aria-hidden>→</strong>
          </button>
          <button onClick={() => aoIrPara("projetos")} style={{ touchAction: "manipulation" }}>
            <i aria-hidden>◇</i>
            <span><small>PROJETOS</small><b>{projetos.length > 0 ? "Em andamento" : "Sendo montado"}</b></span>
            <em>{pm?.situacao}</em>
            <strong aria-hidden>→</strong>
          </button>
        </div>
      </section>

      {/* Os números só existem quando foram medidos. Lista vazia não desenha
          moldura — seis "—" alinhados é a tela mentindo com cara de dashboard. */}
      <Numeros itens={numeros} />

      {/* ── O QUE DEPENDE DE VOCÊ ────────────────────────────────────────────
          Fica ACIMA de projetos e departamentos porque destravar o que está
          parado é a única coisa que este portal existe para fazer. Sem
          pendência, a faixa não aparece — e o lugar dela vira o convite a
          pedir, que é a coisa mais útil que a tela pode oferecer. */}
      {pendencias.length > 0 ? (
        <section className="cp-attention-strip">
          <div>
            <Icone>✓</Icone>
            <span>
              <small>PENDÊNCIAS QUE PRECISAM DE VOCÊ</small>
              <b>
                {pendencias.length === 1
                  ? "1 item aguarda uma decisão sua para os projetos avançarem."
                  : `${pendencias.length} itens aguardam uma decisão sua para os projetos avançarem.`}
              </b>
            </span>
          </div>
          <div className="cp-attention-items">
            {pendencias.slice(0, 2).map((p) => (
              <span key={p.id}>
                <Etiqueta tom={p.urgente ? "amber" : "cyan"}>{p.quando}</Etiqueta>
                <b>{p.titulo}</b>
              </span>
            ))}
          </div>
          <button onClick={() => aoIrPara("aprovacoes")} style={{ touchAction: "manipulation" }}>
            Revisar pendências →
          </button>
        </section>
      ) : (
        <section className="cp-attention-strip" style={{ borderLeftColor: "#23cbd2", borderColor: "#cfe6e7" }}>
          <div>
            <Icone>✓</Icone>
            <span>
              <small style={{ color: "#177f86" }}>NADA DEPENDE DE VOCÊ AGORA</small>
              <b>A equipe está trabalhando. Quando precisarmos de você, aparece aqui primeiro.</b>
            </span>
          </div>
          <button onClick={aoPedirAlgo} style={{ color: "#177f86" }}>Precisa de alguma coisa? →</button>
        </section>
      )}

      {/* ── A OPERAÇÃO POR DEPARTAMENTO (regra 5) ────────────────────────────
          O cliente vê o ESTADO de cada área. O que ele não vê — e não sai do
          servidor — é quem fez, com o quê, quanto custou e qual área está
          esperando qual. Coordenação é trabalho nosso. */}
      <section style={{ marginBottom: 13 }}>
        <TituloDeSecao sobretitulo="QUEM ESTÁ TRABALHANDO PARA VOCÊ" titulo="As áreas da Dioli no seu projeto" />
        <div className="cp-departamentos">
          {departamentos.map((d) => (
            <div key={d.chave} className={d.ativo ? "" : "off"}>
              <small>{d.nome}</small>
              <b>{d.situacao}</b>
              <em>{d.oQueFaz}</em>
            </div>
          ))}
        </div>
      </section>

      <div className="cp-home-grid cp-home-lower">
        <article className="cp-card cp-projects-mini">
          <TituloDeSecao
            sobretitulo="PROJETOS EM ANDAMENTO"
            titulo="O que a Dioli está construindo"
            acao={projetos.length > 0
              ? <button onClick={() => aoIrPara("projetos")} style={{ touchAction: "manipulation" }}>Ver todos →</button>
              : undefined}
          />
          {projetos.length === 0 ? (
            <div style={{ marginTop: 15 }}>
              <Vazio
                icone="◇"
                titulo="Seu projeto está sendo montado"
                texto="Assim que o primeiro projeto abrir, ele aparece aqui com etapa e prazo."
                acao={{ rotulo: "Falar com seu Project Manager", aoClicar: aoAbrirChat }}
              />
            </div>
          ) : (
            projetos.slice(0, 4).map((p, i) => (
              <button key={p.id} onClick={() => aoIrPara("projetos")} style={{ touchAction: "manipulation" }}>
                <i className={`cp-project-color c${i % 3}`} aria-hidden />
                <span>
                  <small>{p.objetivo ?? "Projeto"}</small>
                  <b>{p.nome}</b>
                  <em>{p.etapa}{dataCurta(p.criadoEm) ? ` · aberto em ${dataCurta(p.criadoEm)}` : ""}</em>
                </span>
              </button>
            ))
          )}
        </article>

        <article className="cp-card cp-next-moves">
          <TituloDeSecao sobretitulo="SEU CANAL DIRETO" titulo="Fale com quem organiza tudo" />
          <div>
            <i aria-hidden>1</i>
            <time>Sempre</time>
            <span><b>Project Manager</b><small>Um único contato para tudo — ele coordena as áreas por você.</small></span>
          </div>
          <div>
            <i aria-hidden>2</i>
            <time>A qualquer hora</time>
            <span><b>Pedir alguma coisa</b><small>Texto, áudio ou arquivo. Não precisa saber o nome do serviço.</small></span>
          </div>
          <div>
            <i aria-hidden>3</i>
            <time>Quando pronto</time>
            <span><b>Aprovar o que foi feito</b><small>Tudo que espera decisão sua fica em Aprovações.</small></span>
          </div>
          <button onClick={aoAbrirChat} style={{ touchAction: "manipulation" }}>
            Falar com o Project Manager →
          </button>
        </article>
      </div>
    </>
  );
}
