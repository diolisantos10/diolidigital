"use client";

// ═══════════════════════════════════════════════════════════════════════════
//  3. ESTRATÉGIA — a aba que NINGUÉM tinha construído.
//
//  Nem o pacote visual nem o porte de 14/08 a criaram: o mockup tem nove abas,
//  o porte tem onze, e a que falta nos dois é esta. Por isso ela não é "porte
//  de referência" — é desenho novo, feito com os mesmos primitivos, as mesmas
//  classes e o mesmo cabeçalho azul-marinho das outras onze, para que ninguém
//  consiga apontar qual foi a que chegou depois.
//
//  ── DE ONDE VEM CADA COISA, E O QUE NÃO EXISTE ──────────────────────────
//   · objetivo / público / mensagem / critério → `Briefing` (campos escritos
//     por gente, no projeto)
//   · posicionamento                           → `BrandBrain`, via ficha de marca
//   · salas, debate e hipóteses                → `StrategyRoom.analysisJson`
//   · riscos                                   → tarefas bloqueadas (o único
//     risco que esta casa registra)
//   · ROADMAP ESTRATÉGICO e DECISION LOG       → NÃO EXISTEM. Não há tabela, e
//     nenhum dos dois é deduzido de "o que está perto". Eles aparecem vazios,
//     com o nome da peça que falta — porque a lacuna nomeada é acionável e o
//     card inventado não é.
//
//  O contrato pede ainda "relação com Branding, Social, Design e Tráfego". Ela
//  não é um diagrama decorativo: é o atalho real para cada aba, com o que já
//  existe de dado ligado àquele eixo.
// ═══════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { Pill, Head, TabTitle, Kpis, EmptyBlock, Acao, SubNav } from "./primitives";
import { escritaDaAba, type PropsDaAba } from "./props-da-aba";
import type { ClientWorkspaceTabId } from "./client-workspace-tabs";

const SUB = ["Objetivos", "Salas de estratégia", "Públicos e jornadas", "Roadmap", "Riscos e dependências", "Decisões"] as const;

/** As quatro áreas que a estratégia atravessa. O contrato manda mostrar a
 *  relação; mostrar sem levar até lá seria um desenho. */
const EIXOS: { rotulo: string; aba: ClientWorkspaceTabId; oQue: string }[] = [
  { rotulo: "Branding", aba: "branding", oQue: "posicionamento, tom de voz e sistema visual" },
  { rotulo: "Social Media", aba: "social", oQue: "pauta, calendário e comunidade" },
  { rotulo: "Design", aba: "design", oQue: "direção criativa e peças" },
  { rotulo: "Tráfego Pago", aba: "traffic", oQue: "investimento, público e atribuição" },
];

export function StrategyTab({ view, perms, setTab }: PropsDaAba) {
  const [sub, setSub] = useState<string>(SUB[0]);
  const s = view.strategy;
  const { pode, motivo } = escritaDaAba(perms, "strategy");

  const temObjetivo = s.objectives.some((o) => o.value !== null);

  return (
    <section className="workspaceTab strategyTab">
      <TabTitle
        status={s.rooms.length ? `${s.rooms.length} SALA${s.rooms.length > 1 ? "S" : ""} DE ESTRATÉGIA` : "SEM SALA DE ESTRATÉGIA"}
        title="Client Strategy Center"
        desc="Objetivos, posicionamento, hipóteses e decisões que orientam tudo que as outras áreas produzem para este cliente."
      >
        <Acao onClick={() => setTab("branding")}>Ver o Brand Space</Acao>
        {pode ? (
          <Acao className="primary" href="/agency/strategy-agent">Abrir o Agente Estratégia</Acao>
        ) : (
          <Acao className="primary" indisponivel={motivo!}>Abrir o Agente Estratégia</Acao>
        )}
      </TabTitle>

      <Kpis items={view.areaMetrics.strategy} className="strategyKpis" />

      <SubNav itens={SUB} atual={sub} onEscolher={setSub} contadores={{ "Salas de estratégia": s.rooms.length, "Riscos e dependências": s.risks.length }} />

      {sub === "Objetivos" && (
        <div className="strategyGrid">
          <article className="card strategyCore">
            <Head over="NORTE DO CLIENTE" title="Objetivo, mensagem e critério de sucesso" action={{ rotulo: "Ver projetos", onClick: () => setTab("projects") }} />
            {!temObjetivo ? (
              <EmptyBlock
                title="Nenhum objetivo registrado"
                hint="O objetivo do cliente é escrito no briefing do projeto — é o único lugar desta casa onde ele existe por escrito, dito por gente. Enquanto não houver briefing, esta área fica vazia: deduzir objetivo do que já foi produzido inverte a ordem das coisas."
                action={pode ? "Abrir projetos" : "Abrir projetos"}
                onAction={pode ? () => setTab("projects") : undefined}
                acaoIndisponivel={motivo}
              />
            ) : (
              <dl className="strategyDl">
                {s.objectives.map((o) => (
                  <div key={o.label}>
                    <dt>{o.label}</dt>
                    <dd className={o.value === null ? "noData" : ""}>{o.value ?? "— não registrado"}</dd>
                    <small>{o.source}</small>
                  </div>
                ))}
              </dl>
            )}
          </article>

          <article className="card strategyPositioning">
            <Head over="POSICIONAMENTO" title="Como esta marca se coloca" action={{ rotulo: "Abrir Branding", onClick: () => setTab("branding") }} />
            {s.positioning === null ? (
              <EmptyBlock
                title="Posicionamento ainda não confirmado"
                hint="O posicionamento vive na ficha de marca e só conta quando alguém confirmou com o cliente. O que está no padrão do sistema NÃO é posicionamento — é o vazio com outra roupa."
                action="Completar a ficha de marca"
                onAction={() => setTab("branding")}
              />
            ) : (
              <p className="strategyStatement">{s.positioning}</p>
            )}
          </article>

          <article className="card strategyRelations">
            <Head over="RELAÇÃO COM AS OUTRAS ÁREAS" title="O que a estratégia governa" />
            {EIXOS.map((e) => (
              <Acao key={e.aba} onClick={() => setTab(e.aba)}>
                <>
                  <span>
                    <b>{e.rotulo}</b>
                    <small>{e.oQue}</small>
                  </span>
                  <em>→</em>
                </>
              </Acao>
            ))}
          </article>
        </div>
      )}

      {sub === "Salas de estratégia" && (
        <article className="card strategyRooms">
          <Head over="STRATEGY ROOMS" title="Os debates registrados" />
          {s.rooms.length === 0 ? (
            <EmptyBlock
              title="Nenhuma sala aberta"
              hint="A sala de estratégia é o debate entre agentes especialistas sobre um projeto deste cliente. Ela nasce a partir de um projeto — sem projeto não há sala, e uma sala vazia não é o mesmo que uma estratégia que ninguém escreveu."
              action="Ver projetos"
              onAction={() => setTab("projects")}
            />
          ) : (
            s.rooms.map((r) => (
              <div className="strategyRoom" key={r.id}>
                <header>
                  <b>{r.projectName}</b>
                  <Pill t={r.tone}>{r.statusLabel}</Pill>
                </header>
                {r.summary ? (
                  <p>{r.summary}</p>
                ) : (
                  <p className="noData">
                    {r.statusLabel === "Em análise"
                      ? "A sala ainda está rodando — o resumo aparece quando ela termina."
                      : "Esta sala não deixou resumo legível. O status é real; o texto é que não pôde ser lido."}
                  </p>
                )}
                <footer>
                  <span className={r.specialists === null ? "noData" : ""}>
                    {r.specialists === null ? "— especialistas" : `${r.specialists} especialistas`}
                  </span>
                  <span>{r.when ?? "sem data"}</span>
                  <Acao href={`/agency/projects/${r.projectId}`}>Abrir o projeto →</Acao>
                </footer>
              </div>
            ))
          )}
        </article>
      )}

      {sub === "Públicos e jornadas" && (
        <div className="strategyGrid">
          <article className="card">
            <Head over="PÚBLICO" title="Para quem esta marca fala" />
            {s.audience === null ? (
              <EmptyBlock
                title="Público não registrado"
                hint="O público sai do briefing do projeto. Nenhum recorte é inferido do desempenho das peças — audiência que performou não é audiência que se escolheu."
              />
            ) : (
              <p className="strategyStatement">{s.audience}</p>
            )}
          </article>
          <article className="card">
            <Head over="MENSAGEM-CHAVE" title="O que precisa ficar dito" />
            {s.keyMessage === null ? (
              <EmptyBlock title="Mensagem-chave não registrada" hint="Também vem do briefing do projeto." />
            ) : (
              <p className="strategyStatement">{s.keyMessage}</p>
            )}
          </article>
          <article className="card">
            <Head over="OPORTUNIDADES" title="Hipóteses lidas das salas" />
            {s.hypotheses.length === 0 ? (
              <EmptyBlock
                title="Nenhuma hipótese registrada"
                hint="As hipóteses são lidas da análise das salas de estratégia. Sem sala concluída, não há o que ler — e hipótese escrita pela tela não é hipótese de ninguém."
              />
            ) : (
              s.hypotheses.map((h) => (
                <div key={h.roomId + h.title}>
                  <i>✦</i>
                  <span>
                    <b>{h.title}</b>
                    <small>{h.note ?? "sem projeto"}</small>
                  </span>
                </div>
              ))
            )}
          </article>
        </div>
      )}

      {sub === "Roadmap" && (
        <article className="card">
          <Head over="ROADMAP ESTRATÉGICO" title="A sequência planejada" />
          <EmptyBlock
            title="Não existe roadmap estratégico neste sistema"
            hint="Esta casa registra a trilha de fases de cada PROJETO (proposta → direção → produção → apresentação), e ela está na aba Projetos. O que não existe é um roadmap do RELACIONAMENTO — a sequência de iniciativas ao longo dos meses. Isso precisa de tabela própria; até lá, apontar a trilha de um projeto como se fosse o roadmap do cliente seria trocar uma coisa pela outra."
            action="Ver a trilha dos projetos"
            onAction={() => setTab("projects")}
          />
        </article>
      )}

      {sub === "Riscos e dependências" && (
        <article className="card">
          <Head over="RISCOS" title="O que pode travar a estratégia" action={{ rotulo: "Ver projetos", onClick: () => setTab("projects") }} />
          <p className="moduleLead">
            O único risco que esta casa mede é tarefa bloqueada. Risco de mercado, de verba e de
            prazo declarado ainda não têm onde ser gravados — e não são deduzidos daqui.
          </p>
          {s.risks.length === 0 ? (
            <EmptyBlock title="Nenhuma tarefa bloqueada" hint="Nada trava a operação deste cliente neste momento." />
          ) : (
            s.risks.map((r) => (
              <div className="riskRow" key={r.title}>
                <i className="warn">!</i>
                <span>
                  <b>{r.title}</b>
                  <small>{r.note ?? "sem projeto"}</small>
                </span>
                <Pill t="warn">Bloqueada</Pill>
              </div>
            ))
          )}
        </article>
      )}

      {sub === "Decisões" && (
        <article className="card">
          <Head over="MEMÓRIA ESTRATÉGICA" title="Decisões e responsáveis" />
          <EmptyBlock
            title="O Decision Log não tem tabela nesta casa"
            hint="Decisão estratégica com autor, data e efeito é o que permite responder “por que fizemos assim?” seis meses depois. Hoje o que existe registrado com autor e data são as APROVAÇÕES — que são decisões sobre peças, não sobre direção. Elas estão na aba Aprovações, e é para lá que este atalho leva, em vez de esta aba fingir um log que não existe."
            action="Ver aprovações"
            onAction={() => setTab("approvals")}
          />
        </article>
      )}
    </section>
  );
}
