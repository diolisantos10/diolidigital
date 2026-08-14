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
import type { CampanhaView, ChaveDeDepartamento, DepartamentoView } from "@/lib/agency/portal/vista-do-cliente";
import { Etiqueta, Icone, Numeros, TituloDeSecao, Vazio, dataCurta, emReais, passosDoProjeto } from "./pecas";

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

/** Uma conta de rede ligada por ELE. Só o que a tela precisa mostrar. */
export interface RedeDoCliente {
  id: string;
  plataforma: string;
  nome: string;
  ok: boolean;
}

/** Uma peça do calendário dele — o que já foi ao ar e o que está programado. */
export interface PecaDoCalendario {
  id: string;
  titulo: string;
  quando: string | null;
  noAr: boolean;
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

/** O ícone de cada área, na ordem da referência. Só desenho — nada de dado. */
const ICONE_DO_DEPARTAMENTO: Record<ChaveDeDepartamento, string> = {
  social: "◎", trafego: "↗", branding: "✦", design: "◇", pm: "✧",
};

/** Número curto em pt-BR, para a série medida do gráfico. */
function compacto(n: number): string {
  return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

/** dd/mm a partir de "AAAA-MM-DD" — a série vem em data simples, sem hora. */
function diaDoEixo(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}` : iso;
}

export function VisaoGeral({
  marca, resumo, numeros, pendencias, departamentos, projetos,
  campanhas, redes, calendario,
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
  /** As campanhas dele — alimentam o painel de Tráfego Pago da referência. */
  campanhas: CampanhaView[];
  /** As contas de rede que ELE ligou — alimentam a faixa de plataformas. */
  redes: RedeDoCliente[];
  /** O calendário dele — alimenta o "conteúdo em destaque" da referência. */
  calendario: PecaDoCalendario[];
  aoIrPara: (aba: string) => void;
  aoAbrirChat: () => void;
  aoPedirAlgo: () => void;
}) {
  // A regra 2 aplicada com trava: se alguém escrever "Visão Geral da Foocci"
  // aqui, isto lança em vez de renderizar a colagem proibida.
  const cabecalho = cabecalhoDoPortal(marca, "Visão Geral");
  const caminho = caminhoDaSerie(resumo.serie, 520, 118);
  const caminhoGrande = caminhoDaSerie(resumo.serie, 720, 228);
  const social = departamentos.find((d) => d.chave === "social");
  const trafego = departamentos.find((d) => d.chave === "trafego");
  const pm = departamentos.find((d) => d.chave === "pm");

  // ── O que os dois painéis de canal mostram — tudo MEDIDO, nada estimado ──
  // O melhor dia sai da própria série; o resto sai da contagem do que existe no
  // banco dele. Nenhum destes números precisa de uma leitura que não temos.
  const melhorDia = resumo.serie.length > 0
    ? resumo.serie.reduce((a, b) => (b.alcance > a.alcance ? b : a))
    : null;
  const noAr = calendario.filter((p) => p.noAr).length;
  const programadas = calendario.length - noAr;
  const proximaPeca = calendario.find((p) => !p.noAr) ?? calendario[0] ?? null;
  const campanhasNoAr = campanhas.filter((c) => c.situacao === "No ar");
  const campanhasPausadas = campanhas.filter((c) => c.situacao === "Pausada");
  const tetoAprovado = campanhas.reduce((s, c) => s + (c.tetoAprovadoBRL ?? 0), 0);
  const verbaDiaria = campanhasNoAr.reduce((s, c) => s + (c.verbaDiariaBRL ?? 0), 0);
  const campanhaEmDestaque = campanhasNoAr
    .slice()
    .sort((a, b) => (b.tetoAprovadoBRL ?? 0) - (a.tetoAprovadoBRL ?? 0))[0] ?? null;

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

      {/* ── O BLOCO PRINCIPAL DA REFERÊNCIA ──────────────────────────────────
          Esquerda: a evolução medida. Direita: a operação POR DEPARTAMENTO
          (regra 5), no cartão escuro que a referência reserva para a leitura.
          O cliente vê o ESTADO de cada área — nunca quem fez, com o quê,
          quanto custou, nem qual área espera qual. Coordenação é trabalho
          nosso, e não sai do servidor. */}
      <div className="cp-dashboard-primary">
        <article className={`cp-card cp-overview-performance${caminhoGrande ? "" : " sem-serie"}`}>
          <TituloDeSecao
            sobretitulo="EVOLUÇÃO DOS RESULTADOS"
            titulo="Alcance no período"
            acao={caminhoGrande
              ? <div className="cp-chart-legend"><span><i />Medido por dia</span></div>
              : undefined}
          />
          {caminhoGrande && melhorDia ? (
            <>
              <div className="cp-overview-summary">
                {resumo.manchete && (
                  <span>
                    <small>{resumo.manchete.rotulo}</small>
                    <b>{resumo.manchete.valor}</b>
                    <em>no período medido</em>
                  </span>
                )}
                <span>
                  <small>MELHOR DIA</small>
                  <b>{compacto(melhorDia.alcance)}</b>
                  <em>{diaDoEixo(melhorDia.data)}</em>
                </span>
                <span>
                  <small>DIAS MEDIDOS</small>
                  <b>{resumo.serie.length}</b>
                  <em>{resumo.periodo ?? "período em aberto"}</em>
                </span>
              </div>
              <div className="cp-overview-chart">
                <svg viewBox="0 0 720 228" preserveAspectRatio="none" role="img"
                     aria-label={`Alcance por dia — ${resumo.serie.length} dias medidos.`}>
                  <defs>
                    <linearGradient id="cpOverviewArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="#23cbd2" stopOpacity=".27" />
                      <stop offset="1" stopColor="#23cbd2" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d={`${caminhoGrande} L720 228 L0 228Z`} fill="url(#cpOverviewArea)" />
                  <path d={caminhoGrande} fill="none" stroke="#23cbd2" strokeWidth="4" />
                </svg>
              </div>
              <div className="cp-chart-axis">
                <span>{diaDoEixo(resumo.serie[0].data)}</span>
                <span>{diaDoEixo(resumo.serie[Math.floor(resumo.serie.length / 2)].data)}</span>
                <span>{diaDoEixo(resumo.serie[resumo.serie.length - 1].data)}</span>
              </div>
            </>
          ) : (
            /* A referência traz uma curva pronta. Aqui, sem série medida, não se
               desenha curva nenhuma: linha inventada é o gráfico mentindo com
               cara de fato. O espaço explica a ausência e dá a saída. */
            <div style={{ marginTop: 15 }}>
              <Vazio
                icone="◷"
                titulo="Ainda não há série medida para desenhar"
                texto={resumo.porqueVazio ?? "Assim que a primeira medição do período fechar, a evolução aparece aqui."}
                acao={{ rotulo: "Ir para Integrações", aoClicar: () => aoIrPara("integracoes") }}
              />
            </div>
          )}
        </article>

        <aside className="cp-card cp-executive-reading">
          <div className="cp-pm-top">
            <div className="cp-pm-avatar" aria-hidden>✦</div>
            <span>
              <small>QUEM ESTÁ TRABALHANDO PARA VOCÊ</small>
              <h3>As áreas no seu projeto</h3>
            </span>
          </div>
          <h4>Você fala com uma pessoa só. Ela coordena as cinco áreas.</h4>
          <p>
            Cada linha abaixo mostra o estado real da sua operação hoje. Quando
            alguma coisa depender de você, ela aparece antes, na faixa de pendências.
          </p>
          {departamentos.map((d) => (
            <div key={d.chave}>
              <i aria-hidden>{ICONE_DO_DEPARTAMENTO[d.chave]}</i>
              <span>
                <small>{d.nome.toLocaleUpperCase("pt-BR")}</small>
                <b>{d.situacao}</b>
              </span>
            </div>
          ))}
          <button onClick={aoAbrirChat} style={{ touchAction: "manipulation" }}>
            Falar com o Project Manager →
          </button>
        </aside>
      </div>

      {/* ── OS DOIS PAINÉIS DE CANAL ─────────────────────────────────────────
          Social Media e Tráfego Pago com o resumo de cada um e a porta para o
          painel inteiro, como na referência. Todo número aqui é contagem do que
          existe no cadastro dele — não há estimativa em lugar nenhum. */}
      <div className="cp-channel-panels">
        <article className="cp-card cp-social-overview">
          <TituloDeSecao
            sobretitulo="SOCIAL MEDIA"
            titulo="Redes sociais e conteúdo"
            acao={<button onClick={() => aoIrPara("social")} style={{ touchAction: "manipulation" }}>Ver painel de Social Media →</button>}
          />
          {/* Manchete só quando há o que manchetar. Um "0" em corpo 26 no lugar
              do alcance não é honestidade: é a tela anunciando fracasso onde só
              existe começo. Sem número e sem calendário, quem fala é o vazio. */}
          {(resumo.manchete || calendario.length > 0) && (
            <div className="cp-channel-headline">
              <span>
                {resumo.manchete ? (
                  <>
                    <small>{resumo.manchete.rotulo}</small>
                    <b>{resumo.manchete.valor}</b>
                    <em>{resumo.periodo ? `no período ${resumo.periodo}` : "no período medido"}</em>
                  </>
                ) : (
                  <>
                    <small>PUBLICAÇÕES NO SEU CALENDÁRIO</small>
                    <b>{calendario.length}</b>
                    <em>{noAr} no ar · {programadas} programadas</em>
                  </>
                )}
              </span>
            </div>
          )}

          {!resumo.manchete && calendario.length === 0 && (
            <div style={{ marginTop: 15 }}>
              <Vazio
                icone="◎"
                titulo="Nada publicado ainda"
                texto="Quando a equipe programar o primeiro conteúdo — e com a sua conta conectada — alcance, engajamento e calendário aparecem aqui."
                acao={{ rotulo: "Conectar em Integrações", aoClicar: () => aoIrPara("integracoes") }}
              />
            </div>
          )}

          {redes.length > 0 ? (
            <div className="cp-platform-strip" style={{ marginTop: 13 }}>
              {redes.slice(0, 3).map((r) => (
                <button key={r.id} onClick={() => aoIrPara("integracoes")} style={{ touchAction: "manipulation" }}>
                  <Icone>{r.plataforma.toLocaleUpperCase("pt-BR").slice(0, 2)}</Icone>
                  <span><b>{r.nome || r.plataforma}</b><small>{r.ok ? "conectado" : "precisa reconectar"}</small></span>
                  <em style={r.ok ? undefined : { color: "#9a6417" }}>{r.ok ? "✓" : "!"}</em>
                </button>
              ))}
            </div>
          ) : calendario.length > 0 ? (
            /* Só quando há conteúdo: com a aba inteira vazia, o convite a
               conectar já é o estado vazio acima — dois convites seguidos para
               a mesma coisa é a tela repetindo o recado. */
            <div className="cp-top-content">
              <div>
                <i aria-hidden>◎</i>
                <span>
                  <small>NENHUMA REDE CONECTADA</small>
                  <b>Conecte suas contas para ver alcance e engajamento aqui</b>
                  <em>Só você conecta. A equipe acompanha apenas o status.</em>
                </span>
              </div>
              <button onClick={() => aoIrPara("integracoes")} style={{ touchAction: "manipulation" }}>Conectar →</button>
            </div>
          ) : null}

          {proximaPeca && (
            <div className="cp-top-content">
              <div>
                <i aria-hidden>▦</i>
                <span>
                  <small>{proximaPeca.noAr ? "ÚLTIMA PUBLICAÇÃO" : "PRÓXIMA PUBLICAÇÃO"}</small>
                  <b>{proximaPeca.titulo}</b>
                  <em>{proximaPeca.quando ?? "sem data definida"}</em>
                </span>
              </div>
              <button onClick={() => aoIrPara("social")} style={{ touchAction: "manipulation" }}>Ver calendário →</button>
            </div>
          )}
        </article>

        <article className="cp-card cp-paid-overview">
          <TituloDeSecao
            sobretitulo="TRÁFEGO PAGO"
            titulo="Anúncios e investimento"
            acao={<button onClick={() => aoIrPara("trafego")} style={{ touchAction: "manipulation" }}>Ver painel de anúncios →</button>}
          />
          {campanhas.length === 0 ? (
            <div style={{ marginTop: 15 }}>
              <Vazio
                icone="↗"
                titulo="Nenhuma campanha montada ainda"
                texto="Quando a primeira campanha for montada, ela aparece aqui com público, objetivo e o teto que você aprovou. Nada vai ao ar sem o seu sim."
                acao={{ rotulo: "Quero anunciar", aoClicar: aoAbrirChat }}
              />
            </div>
          ) : (
            <>
              <div className="cp-paid-metrics">
                <span><small>NO AR</small><b>{campanhasNoAr.length}</b><em>de {campanhas.length}</em></span>
                <span><small>PAUSADAS</small><b>{campanhasPausadas.length}</b><em>sem gastar</em></span>
                <span>
                  <small>TETO APROVADO</small>
                  <b>{emReais(tetoAprovado) ?? "—"}</b>
                  <em>por você, por escrito</em>
                </span>
                <span>
                  <small>VERBA DIÁRIA</small>
                  <b>{emReais(verbaDiaria) ?? "—"}</b>
                  <em>somando o que está no ar</em>
                </span>
              </div>
              {campanhaEmDestaque ? (
                <div className="cp-campaign-best">
                  <Etiqueta tom="green">NO AR AGORA</Etiqueta>
                  <span>
                    <b>{campanhaEmDestaque.nome}</b>
                    <small>{campanhaEmDestaque.publico ?? campanhaEmDestaque.objetivo}</small>
                  </span>
                  <button onClick={() => aoIrPara("trafego")} aria-label="Abrir painel de anúncios" style={{ touchAction: "manipulation" }}>→</button>
                </div>
              ) : (
                <div className="cp-campaign-best">
                  <Etiqueta tom="amber">NADA NO AR</Etiqueta>
                  <span>
                    <b>Nenhuma campanha está veiculando agora</b>
                    <small>Campanha pausada não gasta. Fale com seu PM para retomar.</small>
                  </span>
                  <button onClick={aoAbrirChat} aria-label="Falar com o Project Manager" style={{ touchAction: "manipulation" }}>→</button>
                </div>
              )}
            </>
          )}
        </article>
      </div>

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
            projetos.slice(0, 4).map((p, i) => {
              // A MESMA conta da aba Projetos, importada — nunca uma segunda
              // régua para o mesmo projeto na mesma tela.
              const { progresso } = passosDoProjeto(p.etapa);
              return (
                <button key={p.id} onClick={() => aoIrPara("projetos")} style={{ touchAction: "manipulation" }}>
                  <i className={`cp-project-color c${i % 3}`} aria-hidden />
                  <span>
                    <small>{p.objetivo ?? "Projeto"}</small>
                    <b>{p.nome}</b>
                    <em>{p.etapa}{dataCurta(p.criadoEm) ? ` · aberto em ${dataCurta(p.criadoEm)}` : ""}</em>
                  </span>
                  <div>
                    <i><b style={{ width: `${progresso}%` }} /></i>
                    <strong>{progresso}%</strong>
                  </div>
                </button>
              );
            })
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
