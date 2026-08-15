"use client";

// ═══════════════════════════════════════════════════════════════════════════
//  11. INTELIGÊNCIA — o Client Intelligence Center e os seis submódulos.
//
//  A regra do contrato para esta aba é curta e é a mais fácil de quebrar:
//  "toda recomendação deve indicar FONTE, CONFIANÇA e IMPACTO. Não apresentar
//  número fictício como dado real."
//
//  Consequência honesta: enquanto não houver série histórica conectada, esta
//  aba não recomenda nada. Ela mostra QUAIS fontes existem, quais respondem, e
//  o que cada recomendação passaria a poder dizer. Uma "síntese executiva"
//  gerada sem série é opinião vestida de leitura de dado — e é a que mais
//  convence, porque vem escrita com a mesma cara de um número medido.
// ═══════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { Pill, Head, TabTitle, Kpis, EmptyBlock, Acao, SubNav, DepartmentModule } from "./primitives";
import { type PropsDaAba } from "./props-da-aba";

const SUB = [
  "Executive Intelligence",
  "Marketing Analytics",
  "Customer Intelligence",
  "Competitive Radar",
  "Forecasts",
  "Decision Log",
] as const;

const FALTA: Record<string, { frase: string; capacidades: readonly string[] }> = {
  "Marketing Analytics": {
    frase: "Depende de conta de analytics ou de anúncio conectada pelo cliente. Nenhuma está ligada — e nenhum número aqui é derivado da contagem de entregas, que mede trabalho, não resultado.",
    capacidades: ["Tráfego", "Conversão", "Canais", "Funil", "Coorte"],
  },
  "Customer Intelligence": {
    frase: "Não existe base de clientes finais deste cliente neste sistema. Perfil, recompra e churn dependem de uma fonte que ninguém conectou.",
    capacidades: ["Perfil", "Recompra", "Ticket", "Churn", "Segmentos"],
  },
  "Competitive Radar": {
    frase: "Não existe fonte de monitoramento de concorrência conectada. Nada aqui é inferido do que a marca publica.",
    capacidades: ["Concorrentes monitorados", "Share of voice", "Movimentos", "Preço", "Campanhas"],
  },
  Forecasts: {
    frase: "Projeção exige série histórica. Sem ela, qualquer previsão é chute com casa decimal — e casa decimal é justamente o que faz um chute parecer medição.",
    capacidades: ["Leads", "Receita", "Sazonalidade", "Intervalo de confiança"],
  },
  "Decision Log": {
    frase: "Não existe tabela de decisões do relacionamento. O que esta casa registra com autor e data são as APROVAÇÕES — decisões sobre peças, não sobre direção. Elas estão na aba Aprovações.",
    capacidades: ["Decisão", "Autor", "Data", "Alternativas descartadas", "Efeito medido"],
  },
};

export function IntelligenceTab({ view, setTab }: PropsDaAba) {
  const [sub, setSub] = useState<string>(SUB[0]);
  const respondendo = view.integrations.filter((i) => i.tone === "ok");

  return (
    <section className="workspaceTab intelTab">
      <TabTitle
        status="INTELLIGENCE OS"
        title="Client Intelligence Center"
        desc="Dados transformados em decisões, recomendações e memória estratégica."
      >
        <Acao onClick={() => setTab("integrations")}>Fontes conectadas</Acao>
        <Acao
          className="primary"
          indisponivel="Gerar análise exige série histórica conectada. Sem ela, o que sairia seria opinião com cara de leitura de dado — e é a que mais convence."
        >
          Gerar análise
        </Acao>
      </TabTitle>

      <Kpis items={view.areaMetrics.intel} className="intelKpis" />

      <SubNav itens={SUB} atual={sub} onEscolher={setSub} contadores={{ "Executive Intelligence": respondendo.length }} />

      {sub !== "Executive Intelligence" ? (
        <DepartmentModule
          title={sub}
          kind="intelligence"
          oQueFalta={FALTA[sub]?.frase ?? "Sem fonte conectada para este submódulo."}
          capacidades={FALTA[sub]?.capacidades}
        />
      ) : (
        <div className="intelGrid">
          <article className="card executiveBrief">
            <Head over="AI EXECUTIVE BRIEF" title="O que mudou e o que fazer agora" />
            <div className="briefHero">
              <i>✦</i>
              <div>
                <small>SÍNTESE DE HOJE</small>
                <h3>Ainda não há dado suficiente para uma síntese executiva.</h3>
                <p>
                  O briefing executivo só é gerado quando existe série histórica conectada. Escrever
                  uma conclusão sem ela seria opinião apresentada como leitura de dado — e toda
                  recomendação desta aba precisa dizer fonte, confiança e impacto.
                </p>
              </div>
            </div>
            <EmptyBlock
              title="Sem oportunidade, risco ou decisão calculados"
              hint="Conecte as fontes do cliente para o agente ter o que ler. A conexão é ato dele, no portal."
              action="Ver integrações"
              onAction={() => setTab("integrations")}
            />
          </article>

          <article className="card dataSources">
            <Head over="DATA FOUNDATION" title="Fontes e confiabilidade" action={{ rotulo: "Ver integrações", onClick: () => setTab("integrations") }} />
            {view.integrations.length === 0 ? (
              <EmptyBlock title="Nenhuma fonte" hint="Nada conectado a este cliente." />
            ) : (
              view.integrations.map((x) => (
                <div key={x.name}>
                  <i>{x.tone === "ok" ? "✓" : x.tone === "off" ? "×" : "◇"}</i>
                  <span>
                    <b>{x.name}</b>
                    <small>{x.statusLabel}</small>
                  </span>
                  {/* CONFIANÇA da fonte. Não é nota inventada: é o que se sabe —
                      respondeu ou não respondeu na última sincronização. */}
                  <strong className={x.lastSync === null ? "noData" : ""}>
                    {x.lastSync === null ? "—" : x.tone === "ok" ? "Responde" : "Instável"}
                  </strong>
                </div>
              ))
            )}
          </article>

          <article className="card forecast">
            <Head over="FORECAST" title="Projeção de leads e receita" />
            <div className="forecastValues">
              {["LEADS · 30D", "RECEITA ATRIBUÍDA", "CONFIANÇA"].map((k) => (
                <span key={k}>
                  <small>{k}</small>
                  <b className="noData">—</b>
                  <em>sem série histórica</em>
                </span>
              ))}
            </div>
          </article>

          <article className="card decisionLog">
            <Head over="MEMÓRIA ESTRATÉGICA" title="Decisões e efeitos" action={{ rotulo: "Ver aprovações", onClick: () => setTab("approvals") }} />
            <EmptyBlock
              title="Decision Log vazio"
              hint="Não existe tabela de decisões do relacionamento nesta casa. As decisões que TÊM autor, data e histórico são as aprovações de peça — e é para lá que o atalho leva, em vez de esta aba fingir um log que não existe."
            />
          </article>
        </div>
      )}
    </section>
  );
}
