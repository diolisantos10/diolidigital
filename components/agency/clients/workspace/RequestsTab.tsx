"use client";

// ═══════════════════════════════════════════════════════════════════════════
//  2. SOLICITAÇÕES — a fila universal do que o CLIENTE pediu.
//
//  ⚠️ A distinção que o contrato repete duas vezes e que esta aba existe para
//  não perder: "solicitações do cliente e tarefas operacionais dos agentes são
//  entidades diferentes e NUNCA devem ser misturadas". Aqui só entra
//  `ContentRequest` — o que ele escreveu, com as palavras dele. A tarefa que
//  nasceu do pedido vive em Projetos; a cascata entre agentes vive no chat do
//  PM. Juntar as três listas foi o que fez o time responder ao cliente sobre
//  uma tarefa interna que ele nunca pediu.
//
//  ⚠️ A referência trazia um modal de "nova solicitação" com caixa de texto,
//  abas de áudio/arquivo e um "Analisar solicitação →" que fechava o modal e
//  descartava tudo. Numa maquete é ilustração; numa tela de trabalho é um botão
//  que não faz nada — e quem digitou acredita que mandou. A solicitação nasce em
//  DOIS lugares reais nesta casa: o cliente pede pelo portal
//  (`components/portal/SolicitarAlgo`, que grava `ContentRequest`) e a agência
//  tria em `/agency/requests`. Os botões levam para lá.
// ═══════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { Pill, Head, TabTitle, Kpis, EmptyBlock, Acao } from "./primitives";
import { escritaDaAba, type PropsDaAba } from "./props-da-aba";

/** As entradas que o contrato exige (texto, áudio e arquivo) e onde cada uma
 *  realmente acontece. A tela nomeia as três em vez de desenhar um seletor que
 *  não recebe nada — a caixa de entrada é o PORTAL, não este painel. */
const ENTRADAS: { rotulo: string; onde: string }[] = [
  { rotulo: "Texto", onde: "portal do cliente e chat do Agente Project Manager" },
  { rotulo: "Áudio", onde: "portal do cliente (gravação anexada ao pedido)" },
  { rotulo: "Arquivo", onde: "portal do cliente (vira material do cliente, não entrega)" },
];

export function RequestsTab({ view, perms, setTab, onOpenPortal }: PropsDaAba & { onOpenPortal: () => void }) {
  const [foco, setFoco] = useState<string | null>(null);
  const requests = view.requests;
  const { pode, motivo } = escritaDaAba(perms, "requests");
  const selecionada = requests.find((r) => r.id === foco) ?? null;

  return (
    <section className="workspaceTab">
      <TabTitle
        status={requests.length ? `${requests.length} SOLICITAÇÕES REGISTRADAS` : "NENHUMA SOLICITAÇÃO"}
        title="Client Request Center"
        desc="Entrada universal: o Agente Project Manager entende, estrutura, distribui e acompanha qualquer demanda do cliente."
      >
        <Acao onClick={onOpenPortal}>Portal do cliente ↗</Acao>
        {pode ? (
          <Acao className="primary" href="/agency/requests">Abrir triagem</Acao>
        ) : (
          <Acao className="primary" indisponivel={motivo!}>Abrir triagem</Acao>
        )}
      </TabTitle>

      <Kpis items={view.areaMetrics.requests} className="requestKpis" />

      <div className="requestGrid">
        <article className="card inbox">
          <Head over="FILA INTELIGENTE" title="Solicitações do cliente" />
          {requests.length === 0 ? (
            <EmptyBlock
              title="A fila está vazia"
              hint="Só entra aqui o que o cliente pediu, pelo portal ou pelo chat com o Agente Project Manager. Tarefa operacional de agente não aparece nesta lista."
              action={pode ? "Abrir a triagem" : "Triagem"}
              href={pode ? "/agency/requests" : undefined}
              acaoIndisponivel={motivo}
            />
          ) : (
            requests.map((r) => (
              <Acao
                className={"requestRow" + (foco === r.id ? " aberto" : "")}
                key={r.id}
                onClick={() => setFoco(foco === r.id ? null : r.id)}
                ariaLabel={`Abrir detalhe de ${r.title}`}
              >
                <>
                  <i className={r.priority} />
                  <span>{r.code}</span>
                  <span>
                    <b>{r.title}</b>
                    <small>{r.routedTo}</small>
                  </span>
                  <Pill>{r.statusLabel}</Pill>
                  <time>{r.when}</time>
                  <em>{foco === r.id ? "▾" : "→"}</em>
                </>
              </Acao>
            ))
          )}
        </article>

        <aside>
          {/* O detalhe da solicitação selecionada. Sem seleção, o card explica o
              que ele mostra em vez de sumir — card que aparece do nada quando se
              clica faz o layout pular e a pessoa perde a linha. */}
          <article className="card orchestrator">
            <div className="agentTop">
              <i>✦</i>
              <span>
                <small>AGENTE PROJECT MANAGER</small>
                <h3>Triagem e cascata</h3>
              </span>
              <Pill>{selecionada ? "SOLICITAÇÃO ABERTA" : "ONLINE"}</Pill>
            </div>
            {selecionada ? (
              <>
                <p>{selecionada.title}</p>
                <div>
                  <small>ENCAMINHADA PARA</small>
                  <b>{selecionada.routedTo}</b>
                  <span>Registrada em {selecionada.when} · {selecionada.statusLabel}</span>
                </div>
                <Acao href="/agency/requests">Abrir na triagem →</Acao>
              </>
            ) : (
              <>
                <p>Transforma texto, áudio, arquivo ou conversa em briefing, escopo, responsáveis e plano de execução.</p>
                <div>
                  <small>COMO O PEDIDO ENTRA</small>
                  {ENTRADAS.map((e) => (
                    <span key={e.rotulo}>
                      <b>{e.rotulo}</b> · {e.onde}
                    </span>
                  ))}
                </div>
                <Acao onClick={() => setTab("approvals")}>Ver o que espera decisão →</Acao>
              </>
            )}
          </article>

          <article className="card routing">
            <Head over="DISTRIBUIÇÃO" title="Para onde foram" />
            {requests.length === 0 ? (
              <EmptyBlock title="Sem distribuição" hint="Nenhuma solicitação foi encaminhada ainda." />
            ) : (
              Object.entries(
                requests.reduce<Record<string, number>>((acc, r) => {
                  acc[r.routedTo] = (acc[r.routedTo] ?? 0) + 1;
                  return acc;
                }, {}),
              ).map(([agent, n]) => (
                <div key={agent}>
                  <span>{agent}</span>
                  <i>
                    <b style={{ width: `${Math.min(100, (n / requests.length) * 100)}%` }} />
                  </i>
                  <strong>{n}</strong>
                </div>
              ))
            )}
          </article>

          <article className="card permissionMap">
            <Head over="GOVERNANÇA" title="O que é solicitação, o que não é" />
            <div>
              <span>Pedido escrito pelo cliente</span>
              <b>Aparece aqui</b>
            </div>
            <div>
              <span>Tarefa interna de agente</span>
              <b>Vive em Projetos</b>
            </div>
            <div>
              <span>Cascata entre agentes</span>
              <b>Chat do PM · nunca no portal</b>
            </div>
          </article>
        </aside>
      </div>
    </section>
  );
}
