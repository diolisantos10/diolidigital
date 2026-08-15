"use client";

// ═══════════════════════════════════════════════════════════════════════════
//  1. VISÃO GERAL — o raio X executivo do cliente.
//
//  A regra que governa esta aba está no contrato e é fácil de violar sem
//  perceber: "atalhos para as respectivas abas, SEM EXECUTAR AÇÕES SENSÍVEIS
//  DIRETAMENTE no overview". Aqui não se aprova, não se reprova, não se muda
//  verba e não se publica. Tudo que parece decisão leva à aba onde a decisão
//  tem contexto — a peça, a versão, o histórico e o prazo.
//
//  Por que isso importa: um card de "aprovações pendentes" com botão de aprovar
//  no resumo é exatamente como se aprova sem ver a arte.
// ═══════════════════════════════════════════════════════════════════════════

import { Pill, Head, TabTitle, Kpis, EmptyBlock, Acao } from "./primitives";
import type { PropsDaAba } from "./props-da-aba";

export function OverviewTab({
  view,
  setTab,
  onOpenPortal,
  atividade,
}: PropsDaAba & {
  onOpenPortal: () => void;
  /** A linha do tempo real do cliente, montada pela casa. */
  atividade?: React.ReactNode;
}) {
  const health = view.brand.health;
  const pendentes = view.approvals.filter((a) => a.decision === "pendente" || a.decision === "duvida_aberta");

  /** Os agentes especialistas e o que já se mede de cada um. O contrato pede
   *  "saúde dos departamentos/agentes"; o que existe é volume de trabalho —
   *  e volume não é saúde, então o rótulo diz "itens", não "nota". */
  const agentes = [
    { nome: "Agente Social Media", aba: "social" as const, itens: view.deliverables.filter((d) => d.department === "Social Media").length },
    { nome: "Agente Branding", aba: "branding" as const, itens: view.brand.knowledge.filter((k) => k.state === "confirmed").length },
    { nome: "Agente Design", aba: "design" as const, itens: view.deliverables.filter((d) => d.department === "Design").length },
    { nome: "Agente Tráfego Pago", aba: "traffic" as const, itens: view.deliverables.filter((d) => d.department === "Tráfego Pago").length },
    { nome: "Agente Estratégia", aba: "strategy" as const, itens: view.strategy.rooms.length },
  ];
  const maior = Math.max(1, ...agentes.map((a) => a.itens));

  return (
    <section className="workspaceTab">
      <TabTitle
        status={view.client.isActive ? "CLIENTE ATIVO" : "SEM PROJETO EM CURSO"}
        title="Client Command Center"
        desc={`O raio X executivo da ${view.client.name}: negócio, marca, canais, operação e relacionamento.`}
      >
        {/* O seletor de período existe no contrato ("KPIs reais e período
            selecionável") e NÃO tem fonte: todo número desta faixa é contagem
            de estado atual, não série temporal. Botão que troca um período que
            ninguém filtra seria o pior dos dois mundos — parece que filtrou. */}
        <Acao indisponivel="O período só passa a existir quando houver série histórica conectada. Hoje todo número desta faixa é o estado de agora, não um recorte de 30 dias.">
          Últimos 30 dias
        </Acao>
        <Acao className="primary" onClick={onOpenPortal}>Portal do cliente ↗</Acao>
      </TabTitle>

      <Kpis items={view.areaMetrics.overview} />

      <div className="overviewGrid">
        <article className="card perf">
          <Head over="PERFORMANCE INTEGRADA" title="Ecossistema de canais" action={{ rotulo: "Ver integrações", onClick: () => setTab("integrations") }} />
          <EmptyBlock
            title="Nenhuma fonte de performance conectada"
            hint="Alcance, engajamento e receita atribuída chegam das contas de anúncio e analytics do cliente. Enquanto nenhuma estiver ligada, este gráfico fica vazio de propósito — número inventado aqui viraria decisão errada lá na frente."
            action="Ver integrações"
            onAction={() => setTab("integrations")}
          />
          <div className="channelStrip">
            {view.integrations.length === 0 ? (
              <Acao onClick={() => setTab("integrations")}>
                <>
                  <i>◇</i>
                  <span>
                    <b>Sem canais</b>
                    <small>conectar no portal do cliente</small>
                  </span>
                  →
                </>
              </Acao>
            ) : (
              view.integrations.slice(0, 4).map((x) => (
                <Acao key={x.name} onClick={() => setTab("integrations")}>
                  <>
                    <i>{x.glyph}</i>
                    <span>
                      <b>{x.name}</b>
                      <small>{x.statusLabel}</small>
                    </span>
                    →
                  </>
                </Acao>
              ))
            )}
          </div>
        </article>

        <article className="card agentHealth">
          <Head over="OPERAÇÃO AUTÔNOMA" title="Saúde dos agentes" action={{ rotulo: "Ver projetos", onClick: () => setTab("projects") }} />
          <EmptyBlock
            title="Sem telemetria dos agentes"
            hint="A nota de saúde por agente depende de um histórico de execução que ainda não é gravado para a esteira de agência. O painel abaixo mostra volume de trabalho, que é outra coisa."
          />
        </article>

        <article className="card priorities">
          <Head over="PRÓXIMAS AÇÕES" title="Prioridades coordenadas" action={{ rotulo: "Ver aprovações", onClick: () => setTab("approvals") }} />
          {pendentes.length === 0 ? (
            <EmptyBlock
              title="Nenhuma ação pendente registrada"
              hint="Aprovações e decisões pendentes aparecem aqui assim que existirem."
            />
          ) : (
            pendentes.slice(0, 4).map((a, i) => (
              <div key={a.id}>
                <time>{a.when ?? "—"}</time>
                <span>
                  <b>{a.title}</b>
                  <small>{a.context}</small>
                </span>
                <em className={"p" + i}>{a.decidesIt}</em>
              </div>
            ))
          )}
        </article>

        <article className="card radar">
          <Head over="CLIENT INTELLIGENCE" title="Radar do relacionamento" />
          <div className="nps">
            <b className="noData">—</b>
            <span>
              <strong>NPS RELACIONAL</strong>
              <small>sem pesquisa respondida</small>
            </span>
          </div>
          {[
            ["Sentimento", null],
            ["Risco de churn", null],
            ["Engajamento", null],
            ["Decisões pendentes", pendentes.length ? String(pendentes.length) : null],
          ].map(([k, v]) => (
            <div key={k as string}>
              <span>{k}</span>
              <b className={v === null ? "noData" : ""}>{v ?? "—"}</b>
            </div>
          ))}
        </article>

        <article className="card departments">
          <Head over="AGENTES ESPECIALISTAS" title="Panorama dos agentes" />
          {agentes.map((a) => (
            <Acao key={a.nome} onClick={() => setTab(a.aba)}>
              <>
                <span>
                  <b>{a.nome}</b>
                  <small>{a.itens > 0 ? `${a.itens} registro${a.itens > 1 ? "s" : ""} neste cliente` : "sem atividade registrada"}</small>
                </span>
                <i>
                  <b style={{ width: `${Math.round((a.itens / maior) * 100)}%` }} />
                </i>
                <strong className={a.itens === 0 ? "noData" : ""}>{a.itens === 0 ? "—" : a.itens}</strong>
              </>
            </Acao>
          ))}
        </article>

        <article className="card reqMini">
          <Head over="VOZ DO CLIENTE" title="Solicitações recentes" action={{ rotulo: "Ver todas", onClick: () => setTab("requests") }} />
          {view.requests.length === 0 ? (
            <EmptyBlock
              title="Nenhuma solicitação do cliente"
              hint="Esta lista é a voz do cliente — não é a fila de tarefas internas dos agentes. As duas coisas não se misturam neste painel."
            />
          ) : (
            view.requests.slice(0, 3).map((r) => (
              <div key={r.id}>
                <i>↗</i>
                <span>
                  <small>{r.routedTo}</small>
                  <b>{r.title}</b>
                </span>
                <Pill>{r.statusLabel}</Pill>
              </div>
            ))
          )}
        </article>

        <article className="card reqMini">
          <Head over="COMPROMISSOS E RISCOS" title="O que pode travar" action={{ rotulo: "Ver estratégia", onClick: () => setTab("strategy") }} />
          {view.strategy.risks.length === 0 ? (
            <EmptyBlock
              title="Nenhum bloqueio registrado"
              hint="O único risco que esta casa registra hoje é tarefa bloqueada. Risco estratégico declarado não tem tabela — e não é deduzido do que existe perto."
            />
          ) : (
            view.strategy.risks.slice(0, 4).map((r) => (
              <div key={r.title}>
                <i>!</i>
                <span>
                  <small>{r.note ?? "sem projeto"}</small>
                  <b>{r.title}</b>
                </span>
                <Pill t="warn">Bloqueada</Pill>
              </div>
            ))
          )}
        </article>
      </div>

      {/* A atividade do cliente vinha da página anterior e é dado REAL
          (`ActivityEvent`). Ela não tinha card na referência; entra aqui, na
          largura inteira, para não sumir na migração. */}
      {atividade && <div className="ccNativo">{atividade}</div>}

      {health === null && (
        <p className="tabFootnote">
          Brand health, alcance e receita atribuída ficam em branco até a fonte correspondente ser
          conectada pelo cliente. Nada nesta tela é estimado.
        </p>
      )}
    </section>
  );
}
