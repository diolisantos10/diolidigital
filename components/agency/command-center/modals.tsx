"use client";

// Modais da referência Dioli, portados com o mesmo DOM e as mesmas classes:
//   · ClientSheet → "Ficha do cliente"                (módulo 11 do handoff)
//   · PMChat      → "Chat do Agente Project Manager"  (módulo 12 do handoff)
//
// O que mudou em relação à referência: os nomes e números fixos do mockup
// ("Diego Oliveira", "38 respostas consolidadas") viraram props ligadas ao
// banco. Onde não existe fonte de dado, o campo mostra "— não informado" e o
// card mostra o motivo — nunca o exemplo do mockup passando por dado do
// cliente real. Ver o bloco do fim do arquivo para os dois modais que a
// referência tinha e que NÃO foram portados.


import Link from "next/link";
import { Pill, Head, EmptyBlock } from "./primitives";
import type { AgencyClientView, ChatMessageView } from "@/lib/agency/command-center/vista";
import type { ClientSheetData } from "@/lib/agency/command-center/ficha";

// ─── Ficha do cliente ────────────────────────────────────────────────────────

function Dl({ rows }: { rows: { term: string; value: string | null }[] }) {
  return (
    <dl>
      {rows.map((r) => (
        <div key={r.term}>
          <dt>{r.term}</dt>
          <dd className={r.value === null ? "noData" : ""}>{r.value ?? "— não informado"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ClientSheet({
  close,
  clientName,
  initial,
  data,
}: {
  close: () => void;
  clientName: string;
  initial: string;
  data: ClientSheetData;
}) {
  const b = data.briefing;
  return (
    <div className="modalBackdrop" role="dialog" aria-modal="true" aria-label="Ficha do cliente">
      <section className="clientSheet">
        <header>
          <div className="agentMini">{initial}</div>
          <div>
            <small>FICHA TÉCNICA DO CLIENTE</small>
            <h2>{clientName} · Client Profile</h2>
          </div>
          <Pill>CADASTRO ATIVO</Pill>
          <button onClick={close} aria-label="Fechar ficha do cliente">
            ×
          </button>
        </header>
        <div className="sheetMeta">
          <span>
            <small>RESPONSÁVEL DO CLIENTE</small>
            <b>{data.responsible.name ?? "—"}</b>
            <em>{data.responsible.role ?? "sem responsável cadastrado"}</em>
          </span>
          <span>
            <small>ORIGEM</small>
            <b>{data.origin.label ?? "—"}</b>
            <em>{data.origin.note ?? "sem registro de intake"}</em>
          </span>
          <span>
            <small>AGENTE RESPONSÁVEL</small>
            <b>{data.agent.label}</b>
            <em>{data.agent.note}</em>
          </span>
          <span>
            <small>RELACIONAMENTO</small>
            <b>{data.relationship.label}</b>
            <em>{data.relationship.note ?? "—"}</em>
          </span>
        </div>
        <div className="sheetGrid">
          <article>
            <Head over="EMPRESA" title="Informações cadastrais" />
            <Dl rows={data.company} />
          </article>
          <article>
            <Head over="CONTATO PRINCIPAL" title="Responsável do lado do cliente" />
            <Dl rows={data.contact} />
          </article>
          <article className="briefingCard">
            <Head over="INTAKE DO AGENTE SDR" title="Briefing original" />
            {b.summary === null ? (
              <EmptyBlock
                title="Nenhum briefing do SDR registrado"
                hint="A entrevista de sondagem do Agente SDR ainda não foi feita para este cliente. Enquanto ela não existir, nada é preenchido aqui por dedução."
              />
            ) : (
              <>
                <p>{b.summary}</p>
                <div>
                  <span>
                    <small>DOR CENTRAL</small>
                    <b>{b.pain ?? "— não perguntado"}</b>
                  </span>
                  <span>
                    <small>OBJETIVO</small>
                    <b>{b.goal ?? "— não perguntado"}</b>
                  </span>
                  <span>
                    <small>PÚBLICO</small>
                    <b>{b.audience ?? "— não perguntado"}</b>
                  </span>
                </div>
                <button type="button">Reler briefing completo →</button>
              </>
            )}
          </article>
          <article>
            <Head over="GOVERNANÇA" title="Regras do relacionamento" />
            <Dl rows={data.governance} />
          </article>
        </div>
        <footer>
          <span>{data.lastReview ? `Última revisão: ${data.lastReview} · histórico preservado` : "Sem revisão registrada"}</span>
          <button onClick={close}>Fechar</button>
          <button className="primary">Editar ficha</button>
        </footer>
      </section>
    </div>
  );
}

// ─── Chat do Agente Project Manager ──────────────────────────────────────────
//
// O handoff é explícito: o Agente Project Manager é o ÚNICO interlocutor do
// cliente, e o chat global é a fonte de verdade — o chat dentro do cliente é
// uma visão contextual da MESMA conversa. Por isso este componente recebe as
// mensagens de fora; ele não guarda conversa própria.
//
// O bloco "Cascata criada pelo Agente PM" é INTERNO (o cliente não pode ver o
// cascateamento operacional entre agentes). Ele só é desenhado quando
// `showCascade` é verdadeiro. A fronteira de DADO não está aqui nem num seletor
// paralelo: ela mora no servidor deste sistema — `Deliverable.visibility`,
// `ApprovalRequest.clientVisible` e `app/api/brain/portal-data`. Ver o
// cabeçalho de `lib/agency/command-center/vista.ts`.
//
// ⚠️ O RODAPÉ NÃO ESCREVE. A referência trazia uma caixa de texto e um botão
// "Enviar" — e mandar mensagem para um cliente real é efeito irreversível com
// destinatário de fora. Esta casa já tem UM lugar onde a agência responde
// (`/agency/inbox`, criado em 05/08/2026 exatamente porque a mensagem do
// cliente caía num campo que ninguém lia). Um segundo compositor seria um
// segundo jeito de fazer a mesma coisa, com uma fila que ninguém confere.
// Aqui é visão contextual da MESMA conversa, como o handoff manda; o rodapé
// leva para onde se responde.

export function PMChat({
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
          <button onClick={close} aria-label="Fechar chat">
            ×
          </button>
        </header>
        <div className="pmFlow">
          <span>
            <i>1</i>
            <b>Cliente conversa</b>
            <small>Dashboard do cliente</small>
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
            <b>Agentes no cascata</b>
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
                hint="O chat com o Agente Project Manager é a fonte de verdade do relacionamento. Assim que a primeira mensagem existir, ela aparece aqui — e no portal do cliente, na mesma conversa."
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
                    <b>Cascata criada pelo Agente PM</b>
                    <small>{c.chain.join(" → ")}</small>
                  </span>
                  <button type="button">Ver OS →</button>
                </div>
              ))}
          </main>
        </div>
        <footer>
          <span className="pmChatNota">
            Esta é a visão contextual da conversa. A resposta ao cliente sai da
            Caixa de entrada — um lugar só, com fila que se confere.
          </span>
          <Link className="send" href="/agency/inbox">Responder na Caixa de entrada →</Link>
        </footer>
      </section>
    </div>
  );
}
// ─── O QUE FOI REMOVIDO DESTE ARQUIVO, E POR QUÊ ────────────────────────────
//
// A referência tinha mais dois modais aqui. Nenhum dos dois sobreviveu ao
// porte, e a razão é a mesma nos dois casos: **eles simulavam uma ação que
// esta casa já sabe fazer de verdade, em outro lugar.**
//
//  · `RequestModal` — "Nova solicitação". Caixa de texto, abas de áudio e
//    arquivo, e um "Analisar solicitação →" que fechava o modal e descartava
//    tudo. A solicitação real nasce em `components/portal/SolicitarAlgo`
//    (grava `ContentRequest`) e é triada em `/agency/requests`. O botão da aba
//    de Solicitações passa a levar para lá.
//
//  · `Interview` — "entrevista adaptativa do Agente Branding". Três perguntas
//    fixas escritas à mão, com respostas que não iam para lugar nenhum. Esta
//    casa tem a entrevista de verdade: `lib/agency/esteira/ficha-de-marca.ts`
//    sabe quais dos nove campos estão em lacuna e qual pergunta fazer para cada
//    um (`PERGUNTA`, `proximasPerguntas`), e a `FichaDeMarca` já a renderiza.
//    Duas entrevistas de marca seriam duas verdades sobre a mesma marca.
//
// Não é poda de escopo: os dois estão listados aqui para que a remoção seja
// achável por quem procurar o módulo do handoff e não o encontrar.

export type { AgencyClientView, ClientSheetData };
