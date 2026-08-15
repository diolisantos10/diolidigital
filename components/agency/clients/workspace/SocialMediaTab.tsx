"use client";

// ═══════════════════════════════════════════════════════════════════════════
//  4. SOCIAL MEDIA — o Social Media Command Center e os oito submódulos.
//
//  `children` = os blocos REAIS desta casa (`RedesDoCliente`, com as métricas da
//  Meta, e — só para master — `ReconciliarCarrosseis`). Vieram da página
//  anterior e ficam SEMPRE montados no fim da aba: o Command Center acima é
//  leitura, eles são operação. Esconder o que opera atrás de um submódulo já
//  custou uma migração inteira de campo que ninguém achava.
// ═══════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { Pill, Head, Kpis, Ring, EmptyBlock, Acao, SubNav, DepartmentModule } from "./primitives";
import { escritaDaAba, type PropsDaAba } from "./props-da-aba";

const SUB = ["Command Center", "Planner", "Conteúdo", "Canais", "Community", "Listening", "Analytics", "Aprovações"] as const;

/** O que falta para cada submódulo deixar de estar vazio. Nomear a peça
 *  ausente é o que separa "sem fonte" de "card genérico". */
const FALTA: Record<string, { frase: string; capacidades: readonly string[] }> = {
  Planner: {
    frase: "O calendário editorial deste cliente vive em /agency/planner e ainda não é lido por cliente aqui dentro. Nenhuma data é sugerida por dedução.",
    capacidades: ["Grade semanal", "Pauta por canal", "Janelas de publicação", "Feriados e sazonalidade", "Conflitos de agenda", "Aprovação do calendário"],
  },
  Conteúdo: {
    frase: "As peças de conteúdo aparecem quando houver SocialPost gravado para este cliente. A produção acontece na esteira, não neste painel.",
    capacidades: ["Rascunhos", "Legendas", "Carrosséis", "Reels", "Versões", "Proibições da marca"],
  },
  Canais: {
    frase: "Os canais conectados aparecem na aba Integrações — a conexão é ato do cliente, e a lista de lá é a mesma.",
    capacidades: ["Contas conectadas", "Escopos autorizados", "Última sincronização", "Cobertura de dados"],
  },
  Community: {
    frase: "Comentários e mensagens diretas ainda não são gravados por cliente nesta casa. A caixa de entrada da agência é /agency/inbox.",
    capacidades: ["Comentários", "Mensagens diretas", "Menções", "Tempo de resposta", "Sentimento", "Escalada"],
  },
  Listening: {
    frase: "Não existe fonte de escuta ativa conectada. Nada aqui é inferido do desempenho das peças — o que o mercado diz e o que a peça performou são coisas diferentes.",
    capacidades: ["Termos monitorados", "Volume de menções", "Sentimento", "Concorrentes", "Assuntos em aceleração"],
  },
  Analytics: {
    frase: "Alcance, engajamento e crescimento dependem de conta de rede conectada e sincronizada pelo cliente. O bloco de métricas reais da Meta está no fim desta aba.",
    capacidades: ["Alcance", "Engajamento", "Crescimento", "Melhores horários", "Formato que funciona"],
  },
};

export function SocialMediaTab({ view, perms, setTab, children }: PropsDaAba & { children?: React.ReactNode }) {
  const [sub, setSub] = useState<string>(SUB[0]);
  const { pode, motivo } = escritaDaAba(perms, "social");

  const pendentes = view.approvals.filter((a) => a.decision === "pendente" || a.decision === "duvida_aberta");
  const conectadas = view.integrations.filter((i) => i.tone !== "off");

  return (
    <section className="workspaceTab socialTab">
      <div className="socialHero">
        <div>
          <Pill>SOCIAL OS ATIVO</Pill>
          <h2>Social Media Command Center</h2>
          <p>Planejamento, criação, publicação, comunidade e inteligência multicanal.</p>
        </div>
        <div className="socialScore">
          <Ring n={null} />
          <span>
            <small>SOCIAL HEALTH</small>
            <b>Sem medição</b>
            <em>{conectadas.length === 0 ? "nenhuma rede conectada" : "sem série histórica sincronizada"}</em>
          </span>
        </div>
      </div>

      <SubNav
        itens={SUB}
        atual={sub}
        onEscolher={setSub}
        className="socialNav"
        contadores={{ Aprovações: pendentes.length }}
      >
        {pode ? (
          <Acao className="create" href="/agency/social-media-agent">＋ Criar conteúdo</Acao>
        ) : (
          <Acao className="create" indisponivel={motivo!}>＋ Criar conteúdo</Acao>
        )}
      </SubNav>

      {sub === "Aprovações" ? (
        <article className="card inbox">
          <Head over="APROVAÇÕES DO DEPARTAMENTO" title="O que o Social espera decidir" action={{ rotulo: "Central de aprovações", onClick: () => setTab("approvals") }} />
          {pendentes.length === 0 ? (
            <EmptyBlock
              title="Nada aguardando decisão"
              hint="Quando uma peça de Social precisar de aprovação, ela aparece aqui e na aba Aprovações — o mesmo card, nunca dois."
            />
          ) : (
            pendentes.map((a) => (
              <div className="deliveryRow" key={a.id}>
                <i className={a.decidesIt === "Cliente" ? "high" : "medium"} />
                <span>
                  <b>{a.content?.label ?? a.title}</b>
                  <small>{a.context}</small>
                </span>
                <Pill>{a.statusLabel}</Pill>
                <time>{a.when ?? "—"}</time>
                <Acao onClick={() => setTab("approvals")}>Ver na central →</Acao>
              </div>
            ))
          )}
        </article>
      ) : sub !== "Command Center" ? (
        <DepartmentModule
          title={sub}
          kind="social"
          oQueFalta={FALTA[sub]?.frase ?? "Sem fonte conectada para este submódulo."}
          capacidades={FALTA[sub]?.capacidades}
        />
      ) : (
        <>
          <Kpis items={view.areaMetrics.social} className="socialKpis" />
          <div className="socialGrid">
            <article className="card planner">
              <Head over="PLANNER MULTICANAL" title="Próximos 7 dias" action={{ rotulo: "Abrir planner", href: "/agency/planner" }} />
              <EmptyBlock
                title="Nenhuma publicação agendada"
                hint="O calendário editorial não é lido por cliente neste painel. Nenhuma data é sugerida por dedução — e uma data sugerida aqui viraria promessa lá na frente."
                action="Abrir o planner"
                href="/agency/planner"
              />
            </article>

            <article className="card socialAgent">
              <div className="agentTop">
                <i>✦</i>
                <span>
                  <small>AGENTE SOCIAL MEDIA</small>
                  <h3>Inteligência editorial</h3>
                </span>
                <Pill>ONLINE</Pill>
              </div>
              <p>Coordena estratégia, pauta, criação, calendário, comunidade e performance.</p>
              <div>
                <small>OPORTUNIDADE</small>
                <b>Sem histórico suficiente para recomendar.</b>
                <span>O agente só sugere pauta depois de ler desempenho real.</span>
                {pode ? (
                  <Acao href="/agency/social-media-agent">Abrir o agente →</Acao>
                ) : (
                  <Acao indisponivel={motivo!}>Abrir o agente</Acao>
                )}
              </div>
            </article>

            <article className="card pipeline">
              <Head over="OPERAÇÃO DE CONTEÚDO" title="Pipeline editorial" action={{ rotulo: "Ver aprovações", onClick: () => setTab("approvals") }} />
              <div>
                {["Ideias", "Estratégia", "Produção", "Aprovação", "Agendados", "Publicados"].map((label, i) => (
                  <span key={label}>
                    <i className={"c" + i} />
                    <b className="noData">—</b>
                    <small>{label}</small>
                  </span>
                ))}
              </div>
              <aside>
                <Pill>SEM DADO</Pill>
                <span>O pipeline editorial ainda não é contado por cliente neste painel.</span>
                <Acao onClick={() => setSub("Aprovações")}>Ver aprovações do Social →</Acao>
              </aside>
            </article>

            <article className="card socialChannels">
              <Head over="CANAIS CONECTADOS" title="Performance por rede" action={{ rotulo: "Ver integrações", onClick: () => setTab("integrations") }} />
              {conectadas.length === 0 ? (
                <EmptyBlock
                  title="Nenhuma rede conectada"
                  hint="Só o cliente conecta as contas. A agência vê o status, nunca a credencial."
                  action="Ver integrações"
                  onAction={() => setTab("integrations")}
                />
              ) : (
                conectadas.map((x) => (
                  <Acao key={x.name} onClick={() => setTab("integrations")}>
                    <>
                      <i>{x.glyph}</i>
                      <span>
                        <b>{x.name}</b>
                        <small>{x.scopes}</small>
                      </span>
                      <strong className="noData">—</strong>
                    </>
                  </Acao>
                ))
              )}
            </article>

            <article className="card listening">
              <Head over="SOCIAL LISTENING" title="O que o mercado diz" />
              <div>
                {["Positivo", "Neutro", "Negativo"].map((k) => (
                  <span key={k}>
                    <b className="noData">—</b>
                    <small>{k}</small>
                  </span>
                ))}
              </div>
              <h4>Assuntos em aceleração</h4>
              <EmptyBlock title="Sem escuta ativa" hint="Nenhuma fonte de listening está conectada a este cliente." />
            </article>
          </div>
        </>
      )}

      {/* Os blocos reais da casa — métricas da Meta e reconciliação. */}
      <div className="ccNativo">{children}</div>
    </section>
  );
}
