"use client";

// ═══════════════════════════════════════════════════════════════════════════
//  6. DESIGN — o Design Command Center e os sete submódulos.
//
//  O que esta aba mostra de REAL: as entregas cujo tipo é de Design, com versão
//  e status, e a fila de revisão que sai delas. O que ela NÃO estima:
//  capacidade da equipe, nota de qualidade criativa e desempenho previsto —
//  nenhum dos três é gravado nesta casa, e um número ali viraria alocação de
//  gente em cima de ficção.
// ═══════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { Pill, Head, TabTitle, Kpis, EmptyBlock, Acao, SubNav, DepartmentModule } from "./primitives";
import { escritaDaAba, type PropsDaAba } from "./props-da-aba";

const SUB = ["Command Center", "Briefings", "Produção", "Creative Review", "Biblioteca", "Templates", "Performance"] as const;

const FALTA: Record<string, { frase: string; capacidades: readonly string[] }> = {
  Briefings: {
    frase: "O briefing que origina a peça é do PROJETO e está na aba Estratégia. Um briefing por peça ainda não tem tabela — e repetir o do projeto aqui daria duas versões do mesmo pedido.",
    capacidades: ["Objetivo da peça", "Formato e canal", "Referências aprovadas", "Restrições da marca", "Prazo", "Responsável"],
  },
  Produção: {
    frase: "A produção acontece na esteira (/agency/deliverables). O que este painel sabe é o STATUS de cada entrega, e ele está no Command Center.",
    capacidades: ["Fila", "Em execução", "Bloqueios", "Responsáveis", "Prazos"],
  },
  Biblioteca: {
    frase: "Os arquivos de marca disponíveis para a produção estão no Material de Marca, dentro da aba Branding. Não existe um segundo repositório de assets — e não vai existir por esta tela.",
    capacidades: ["Logos", "Fotos", "Fontes", "Paletas", "Material enviado pelo cliente"],
  },
  Templates: {
    frase: "Não existe biblioteca de templates por cliente nesta casa. Templates genéricos não são deste painel.",
    capacidades: ["Formatos recorrentes", "Grades", "Componentes", "Variações por canal"],
  },
  Performance: {
    frase: "Desempenho de peça depende de conta de rede ou de anúncio conectada e sincronizada pelo cliente.",
    capacidades: ["Alcance por peça", "Engajamento", "Retenção", "Melhor formato"],
  },
};

export function DesignTab({ view, perms, setTab }: PropsDaAba) {
  const [sub, setSub] = useState<string>(SUB[0]);
  const { pode, motivo } = escritaDaAba(perms, "design");

  const pecas = view.deliverables.filter((d) => d.department === "Design");
  const emRevisao = view.approvals.filter(
    (a) => (a.decision === "pendente" || a.decision === "duvida_aberta") && a.decidesIt === "Agência",
  );

  return (
    <section className="workspaceTab designTab">
      <TabTitle
        status={pecas.length ? `${pecas.length} PEÇA${pecas.length > 1 ? "S" : ""} DE DESIGN` : "DESIGN OS"}
        title="Design Command Center"
        desc="Da demanda ao ativo final: direção criativa, produção, QA e Brand Gate."
      >
        <Acao onClick={() => setTab("branding")}>Ver o Brand Space</Acao>
        {pode ? (
          <Acao className="primary" href="/agency/deliverables">Abrir a produção</Acao>
        ) : (
          <Acao className="primary" indisponivel={motivo!}>Abrir a produção</Acao>
        )}
      </TabTitle>

      <SubNav
        itens={SUB}
        atual={sub}
        onEscolher={setSub}
        contadores={{ "Creative Review": emRevisao.length }}
      />

      {sub === "Creative Review" ? (
        <article className="card inbox">
          <Head over="CREATIVE REVIEW" title="O que espera revisão interna" action={{ rotulo: "Central de aprovações", onClick: () => setTab("approvals") }} />
          <p className="moduleLead">
            Revisão INTERNA — antes de a peça chegar ao cliente. O que já está com ele aparece na
            aba Aprovações, na coluna “Aguardando o cliente”.
          </p>
          {emRevisao.length === 0 ? (
            <EmptyBlock
              title="Nada em revisão interna"
              hint="Quando uma peça precisar de olho da casa antes de ir ao cliente, ela aparece aqui com a versão e o briefing de referência."
            />
          ) : (
            emRevisao.map((a) => (
              <div className="deliveryRow" key={a.id}>
                <i className="medium" />
                <span>
                  <b>{a.content?.label ?? a.title}</b>
                  <small>{a.content?.versionLabel ?? "sem versão vinculada"}</small>
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
          kind="design"
          oQueFalta={FALTA[sub]?.frase ?? "Sem fonte conectada para este submódulo."}
          capacidades={FALTA[sub]?.capacidades}
        />
      ) : (
        <>
          <Kpis items={view.areaMetrics.design} className="designKpis" />
          <div className="designFullGrid">
            <article className="card designBoard">
              <Head over="PRODUÇÃO CRIATIVA" title="Peças deste cliente" action={{ rotulo: "Ver entregas", onClick: () => setTab("deliveries") }} />
              {pecas.length === 0 ? (
                <EmptyBlock
                  title="Nenhuma peça de Design registrada"
                  hint="O departamento é derivado do tipo da entrega. Entrega sem tipo reconhecido aparece na aba Entregas como “departamento não registrado” — nunca chutada para cá."
                  action="Ver todas as entregas"
                  onAction={() => setTab("deliveries")}
                />
              ) : (
                pecas.map((d) => (
                  <div className="deliveryRow" key={d.id}>
                    <i className={d.shared ? "done" : "medium"} />
                    <span>
                      <b>{d.title}</b>
                      <small>{d.projectName ?? "sem projeto"}</small>
                    </span>
                    <Pill>{d.statusLabel}</Pill>
                    <strong>v{d.version}</strong>
                    <time className={d.when === null ? "noData" : ""}>{d.when ?? "—"}</time>
                    <Acao onClick={() => setTab("deliveries")}>Abrir →</Acao>
                  </div>
                ))
              )}
            </article>

            <article className="card designAgent">
              <div className="agentTop">
                <i>✦</i>
                <span>
                  <small>AGENTE DESIGN</small>
                  <h3>Creative Operations</h3>
                </span>
                <Pill>ONLINE</Pill>
              </div>
              <p>Transforma briefings em direção criativa, distribui capacidade e protege qualidade, marca e prazos.</p>
              <div>
                <small>RECOMENDAÇÃO</small>
                <b>{pecas.length === 0 ? "Sem peças em fila para recomendar agrupamento." : "Sem histórico de desempenho para recomendar direção."}</b>
                <span>A recomendação depende de dado medido, não de volume.</span>
              </div>
              {pode ? (
                <Acao href="/agency/design-agent">Abrir o agente →</Acao>
              ) : (
                <Acao indisponivel={motivo!}>Abrir o agente</Acao>
              )}
            </article>

            <article className="card quality">
              <Head over="QUALITY SYSTEM" title="Qualidade criativa" action={{ rotulo: "Ver Brand Gate", onClick: () => setTab("branding") }} />
              {["Brand compliance", "Acessibilidade", "Originalidade", "Performance prevista"].map((x) => (
                <div key={x}>
                  <span>{x}</span>
                  <i>
                    <b style={{ width: "0%" }} />
                  </i>
                  <strong className="noData">—</strong>
                </div>
              ))}
              <aside>
                <b className="noData">—</b>
                <span>nenhuma dessas quatro notas é gravada nesta casa; o traço é o valor honesto</span>
              </aside>
            </article>
          </div>
        </>
      )}
    </section>
  );
}
