"use client";

// ═══════════════════════════════════════════════════════════════════════════
//  CHAT DO AGENTE PROJECT MANAGER — ação do cabeçalho, não aba.
//
//  O contrato é explícito e é o ponto inteiro deste componente: "o chat global
//  do Project Manager é a fonte oficial da conversa. O chat dentro do cliente é
//  uma VISÃO CONTEXTUAL da mesma conversa, NÃO uma conversa paralela."
//
//  Por isso ele recebe as mensagens de fora e não guarda conversa própria: elas
//  são `PortalMessage`, exatamente as mesmas que o cliente vê no portal dele.
//
//  ⚠️ O RODAPÉ NÃO ESCREVE, e isso é decisão, não falta.
//  A referência trazia caixa de texto e botão "Enviar". Mandar mensagem para um
//  cliente real é efeito IRREVERSÍVEL com destinatário de fora. Esta casa já tem
//  UM lugar onde a agência responde — `/agency/inbox`, criado em 05/08/2026
//  exatamente porque a mensagem do cliente caía num campo que ninguém lia. Um
//  segundo compositor seria um segundo jeito de fazer a mesma coisa, com uma
//  fila que ninguém confere.
//
//  ⚠️ A CASCATA É INTERNA. O cliente não pode ver o cascateamento operacional
//  entre agentes. Ela só é desenhada quando `showCascade` é verdadeiro — e a
//  fronteira de DADO não está aqui nem num seletor paralelo: ela mora no
//  servidor (`Deliverable.visibility`, `ApprovalRequest.clientVisible` e
//  `app/api/brain/portal-data`). Este componente não é montado pelo portal, e o
//  dado da cascata nem sai do servidor para lá.
// ═══════════════════════════════════════════════════════════════════════════

import Link from "next/link";
import { Pill, EmptyBlock } from "./primitives";
import type { ChatMessageView } from "@/lib/agency/clients/workspace/vista";

export function ProjectManagerChat({
  close,
  clientName,
  messages,
  context,
  cascadeAgents,
  cascade,
  showCascade,
}: {
  close: () => void;
  clientName: string;
  messages: ChatMessageView[];
  context: { headline: string | null; counters: string[] };
  cascadeAgents: string[];
  cascade: { requestId: string; chain: string[] }[];
  showCascade: boolean;
}) {
  return (
    <div className="modalBackdrop pmBackdrop" role="dialog" aria-modal="true" aria-label="Chat do Agente Project Manager">
      <section className="pmChat">
        <header>
          <div className="agentMini">✦</div>
          <div>
            <small>CANAL OFICIAL · {clientName.toUpperCase()}</small>
            <h2>Agente Project Manager</h2>
            <p>Único interlocutor da agência com este cliente</p>
          </div>
          <Pill>ONLINE</Pill>
          <button onClick={close} aria-label="Fechar chat" type="button">
            ×
          </button>
        </header>

        <div className="pmFlow">
          <span>
            <i>1</i>
            <b>Cliente conversa</b>
            <small>Portal do cliente</small>
          </span>
          <em>→</em>
          <span>
            <i>2</i>
            <b>Agente PM interpreta</b>
            <small>Contexto e prioridade</small>
          </span>
          <em>→</em>
          <span>
            <i>3</i>
            <b>Cascateia</b>
            <small>Agentes especialistas</small>
          </span>
        </div>

        <div className="chatBody">
          <aside>
            <small>CONTEXTO ATIVO</small>
            <h3>{clientName}</h3>
            <p>{context.headline ?? "Sem contexto consolidado"}</p>
            <div>
              {context.counters.length === 0 ? (
                <span>sem contadores</span>
              ) : (
                context.counters.map((c) => <span key={c}>{c}</span>)
              )}
            </div>
            <b>Agentes na cascata</b>
            {cascadeAgents.map((x) => (
              <span className="chatAgent" key={x}>
                ✦ {x}
              </span>
            ))}
          </aside>

          <main>
            {messages.length === 0 ? (
              <EmptyBlock
                title="Nenhuma conversa ainda"
                hint="O chat com o Agente Project Manager é a fonte oficial do relacionamento. Assim que a primeira mensagem existir, ela aparece aqui — e no portal do cliente, na MESMA conversa."
              />
            ) : (
              messages.map((m) => (
                <div className={"message " + (m.side === "client" ? "clientMessage" : "pmMessage")} key={m.id}>
                  <small>
                    {m.author.toUpperCase()} · {m.when}
                  </small>
                  <p>{m.body}</p>
                </div>
              ))
            )}

            {showCascade &&
              cascade.map((c) => (
                <div className="cascadeNote" key={c.requestId}>
                  <i>✦</i>
                  <span>
                    <b>Cascata criada pelo Agente PM · interna</b>
                    <small>{c.chain.join(" → ")}</small>
                  </span>
                  <Link href="/agency/tasks">Ver as tarefas →</Link>
                </div>
              ))}
          </main>
        </div>

        <footer>
          <span className="pmChatNota">
            Esta é a visão contextual da conversa oficial — não uma conversa paralela. A resposta ao
            cliente sai da Caixa de entrada, um lugar só, com fila que se confere.
          </span>
          <Link className="send" href="/agency/inbox">Responder na Caixa de entrada →</Link>
        </footer>
      </section>
    </div>
  );
}
