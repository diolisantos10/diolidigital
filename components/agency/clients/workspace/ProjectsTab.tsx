"use client";

// ═══════════════════════════════════════════════════════════════════════════
//  8. PROJETOS — o portfólio de iniciativas TEMPORÁRIAS dentro do
//  relacionamento PERMANENTE.
//
//  O contrato inverte o eixo do painel e fecha a frase com um aviso:
//  "criação de novo projeto pelo fluxo existente, SEM TRANSFORMAR O CLIENTE EM
//  PROJETO". Por isso esta aba lista, agrupa e leva — mas a criação sai daqui
//  para o fluxo que já existe, e o detalhe de cada projeto continua em
//  `/agency/projects/[id]`. Duplicar a página de projeto aqui dentro faria o
//  cliente voltar a ser um projeto com nome diferente.
//
//  O PROGRESSO NÃO É UM CAMPO GRAVADO: é a posição na trilha real da esteira,
//  lida pelos mesmos carimbos que o resto do sistema usa. Campo de status
//  escrito à mão mente em duas semanas — está escrito no próprio schema.
// ═══════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { Pill, Head, TabTitle, Kpis, EmptyBlock, Acao, SubNav } from "./primitives";
import { escritaDaAba, type PropsDaAba } from "./props-da-aba";

const SUB = ["Portfólio", "Timeline", "Capacidade", "Dependências"] as const;

export function ProjectsTab({
  view,
  perms,
  setTab,
  onOpenProject,
  onNewProject,
}: PropsDaAba & {
  onOpenProject: (id: string) => void;
  onNewProject: () => void;
}) {
  const [sub, setSub] = useState<string>(SUB[0]);
  const { pode, motivo } = escritaDaAba(perms, "projects");
  const projects = view.projects;

  return (
    <section className="workspaceTab projectsTab">
      <TabTitle
        status={projects.length ? `${projects.length} PROJETO${projects.length > 1 ? "S" : ""} DO CLIENTE` : "NENHUM PROJETO"}
        title="Client Project Portfolio"
        desc="Iniciativas temporárias dentro do relacionamento permanente com o cliente."
      >
        <Acao onClick={() => setTab("deliveries")}>Ver entregas</Acao>
        {pode ? (
          <Acao className="primary" onClick={onNewProject}>＋ Novo projeto</Acao>
        ) : (
          <Acao className="primary" indisponivel={motivo!}>＋ Novo projeto</Acao>
        )}
      </TabTitle>

      <SubNav itens={SUB} atual={sub} onEscolher={setSub} contadores={{ Portfólio: projects.length }} />

      <Kpis items={view.areaMetrics.projects} className="projectKpis" />

      {sub === "Timeline" && (
        <article className="card roadmap">
          <Head over="TRILHA DA ESTEIRA" title="Projetos no tempo" />
          <p className="moduleLead">
            A barra é a posição real na trilha (proposta → direção → produção → apresentação →
            aprovação), lida dos mesmos carimbos que a esteira usa. Não é percentual estimado.
          </p>
          {projects.length === 0 ? (
            <EmptyBlock
              title="Nada na trilha"
              hint="Crie o primeiro projeto para desenhar a linha do tempo."
              action={pode ? "Criar projeto" : "Criar projeto"}
              onAction={pode ? onNewProject : undefined}
              acaoIndisponivel={motivo}
            />
          ) : (
            projects.map((p) => (
              <div key={p.id}>
                <span>{p.name}</span>
                <i>
                  <b style={{ width: `${p.progress ?? 0}%` }} />
                </i>
                <strong className={p.progress === null ? "noData" : ""}>
                  {p.progress === null ? "—" : `${p.progress}%`}
                </strong>
              </div>
            ))
          )}
        </article>
      )}

      {sub === "Capacidade" && (
        <article className="card">
          <Head over="CAPACIDADE" title="Quem consegue pegar mais" />
          <EmptyBlock
            title="A capacidade da equipe não é registrada nesta casa"
            hint="Capacidade exige horas disponíveis por agente e esforço estimado por tarefa — nenhum dos dois é gravado. O que existe é o VOLUME de tarefas por projeto, que é outra coisa: volume alto pode ser muita tarefa pequena. Mostrar volume com o rótulo de capacidade faria alguém alocar gente em cima disso."
            action="Ver projetos"
            onAction={() => setSub("Portfólio")}
          />
        </article>
      )}

      {sub === "Dependências" && (
        <article className="card">
          <Head over="DEPENDÊNCIAS E BLOQUEIOS" title="O que trava o quê" action={{ rotulo: "Ver estratégia", onClick: () => setTab("strategy") }} />
          {view.strategy.risks.length === 0 ? (
            <EmptyBlock
              title="Nenhuma tarefa bloqueada"
              hint="Dependência entre tarefas não é gravada nesta casa — o que se registra é o estado “bloqueada”, e nenhuma está. Um grafo de dependências desenhado a partir de ordem de criação seria invenção."
            />
          ) : (
            view.strategy.risks.map((r) => (
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

      {sub === "Portfólio" &&
        (projects.length === 0 ? (
          <article className="card">
            <EmptyBlock
              title="Este cliente ainda não tem projeto"
              hint="Projetos, campanhas e entregas pertencem ao cliente. Crie o primeiro para começar o portfólio — o cliente continua sendo o registro principal."
              action="Criar projeto"
              onAction={pode ? onNewProject : undefined}
              acaoIndisponivel={motivo}
            />
          </article>
        ) : (
          <div className="projectPortfolio">
            {projects.map((p, i) => (
              <article className="card" key={p.id}>
                <header>
                  <i className={"pr" + (i % 6)} />
                  <Pill>{p.statusLabel}</Pill>
                </header>
                <small>{p.kind.toUpperCase()}</small>
                <h3>{p.name}</h3>
                <p>{p.agents.length ? p.agents.join(" · ") : "Sem agente atribuído"}</p>
                <div>
                  <i>
                    <b style={{ width: `${p.progress ?? 0}%` }} />
                  </i>
                  <strong className={p.progress === null ? "noData" : ""}>
                    {p.progress === null ? "—" : `${p.progress}%`}
                  </strong>
                </div>
                <footer>
                  <span>{p.decisionCount} decisões</span>
                  <span>{p.deliverableCount} entregáveis</span>
                  <Acao ariaLabel={`Abrir ${p.name}`} onClick={() => onOpenProject(p.id)}>
                    →
                  </Acao>
                </footer>
              </article>
            ))}
          </div>
        ))}
    </section>
  );
}
