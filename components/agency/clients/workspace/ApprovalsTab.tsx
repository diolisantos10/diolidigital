"use client";

// ═══════════════════════════════════════════════════════════════════════════
//  9. APROVAÇÕES — a única central interna do que espera decisão.
//
//  ── A REGRA QUE CUSTOU UM INCIDENTE ─────────────────────────────────────
//  "Nunca exibir aprovação sem conteúdo." Em 14/08 uma tela desta casa deixou
//  o CEO aprovar peças SEM VER A ARTE: o card mostrava departamento, prazo e
//  dois botões, e o que estava sendo decidido não aparecia em lugar nenhum.
//
//  Aqui isso virou estrutura, não recomendação: quando `content` é `null`, o
//  card NÃO DESENHA BOTÃO DE DECISÃO. Ele desenha o aviso de que está quebrado
//  e o caminho para consertar. Um card sem peça não é uma decisão pendente —
//  é um defeito de dado esperando alguém decidir no escuro.
//
//  ── OS QUATRO CAMINHOS, E POR QUE DOIS DELES NÃO PODEM SER O MESMO ──────
//   · Aprovar             → libera; a peça segue.
//   · Solicitar ajustes   → MANTÉM a direção, pede mudança pontual.
//   · Reprovar e refazer  → DESCARTA a direção, preserva o histórico, impede
//                           publicação e cria nova execução a partir do
//                           briefing + Brand Hub + referências aprovadas.
//   · Tenho uma dúvida    → NÃO É DECISÃO. O card segue pendente e o prazo
//                           pausa (`questionOpenedAt`), porque a bola passou
//                           para a agência e o relógio não pode correr contra
//                           quem está esperando resposta.
//  Colapsar "ajuste" e "reprovação" num botão só é o que faz a máquina refazer
//  a mesma direção que alguém já recusou.
//
//  ── QUEM DECIDE, E ONDE ─────────────────────────────────────────────────
//  A decisão do CLIENTE acontece no portal dele, com o token dele — é assim que
//  a assinatura vale. Este painel é interno: ele ACOMPANHA, encaminha e explica.
//  Por isso os quatro caminhos aparecem aqui como o que são (estado do card e
//  destino), e não como quatro botões que a agência aperta pelo cliente.
// ═══════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { Pill, Head, TabTitle, Kpis, EmptyBlock, Acao, SubNav } from "./primitives";
import { escritaDaAba, type PropsDaAba } from "./props-da-aba";
import type { ApprovalDecision, ApprovalView } from "@/lib/agency/clients/workspace/vista";

const SUB = ["Tudo", "Aguardando o cliente", "Revisão interna", "Dúvidas abertas", "Decididas"] as const;

/** O que cada caminho FAZ. Fica na tela, ao lado dos cards, porque a diferença
 *  entre "ajuste" e "reprovar e refazer" é justamente a que ninguém lembra na
 *  hora — e é a que mais custa quando se erra. */
const CAMINHOS: { rotulo: string; oQueFaz: string; tom: string }[] = [
  { rotulo: "Aprovar", oQueFaz: "Libera a peça. A partir daqui ela pode ser agendada e publicada.", tom: "ok" },
  { rotulo: "Solicitar ajustes", oQueFaz: "Mantém a direção criativa e pede mudanças pontuais. A peça volta para a mesa na mesma linha.", tom: "partial" },
  { rotulo: "Reprovar e refazer", oQueFaz: "Descarta a versão como direção, preserva o histórico, IMPEDE a publicação e abre nova execução a partir do briefing, do Brand Hub e das referências aprovadas.", tom: "warn" },
  { rotulo: "Tenho uma dúvida", oQueFaz: "Não é decisão: o card segue pendente e o prazo PAUSA enquanto a bola está com a agência.", tom: "" },
];

const TOM_DA_DECISAO: Record<ApprovalDecision, string> = {
  pendente: "",
  aprovado: "ok",
  ajuste_pedido: "partial",
  reprovado: "warn",
  duvida_aberta: "partial",
};

function filtrar(lista: ApprovalView[], sub: string): ApprovalView[] {
  const pendente = (a: ApprovalView) => a.decision === "pendente" || a.decision === "duvida_aberta";
  if (sub === "Aguardando o cliente") return lista.filter((a) => pendente(a) && a.decidesIt === "Cliente");
  if (sub === "Revisão interna") return lista.filter((a) => pendente(a) && a.decidesIt === "Agência");
  if (sub === "Dúvidas abertas") return lista.filter((a) => a.decision === "duvida_aberta");
  if (sub === "Decididas") return lista.filter((a) => !pendente(a));
  return lista;
}

export function ApprovalsTab({ view, perms, setTab }: PropsDaAba) {
  const [sub, setSub] = useState<string>(SUB[0]);
  const { pode, motivo } = escritaDaAba(perms, "approvals");
  const todas = view.approvals;
  const visiveis = filtrar(todas, sub);
  const semConteudo = todas.filter((a) => a.content === null);

  return (
    <section className="workspaceTab approvalsTab">
      <TabTitle
        status={`${todas.filter((a) => a.decision === "pendente" || a.decision === "duvida_aberta").length} AGUARDANDO DECISÃO`}
        title="Client Approval Center"
        desc="Tudo que espera decisão do cliente ou revisão interna, num lugar só — com a peça, a versão e o histórico presos ao card."
      >
        <Acao onClick={() => setTab("deliveries")}>Ver entregas</Acao>
        {pode ? (
          <Acao className="primary" href="/agency/approvals">Central de aprovações</Acao>
        ) : (
          <Acao className="primary" indisponivel={motivo!}>Central de aprovações</Acao>
        )}
      </TabTitle>

      <Kpis items={view.areaMetrics.approvals} className="approvalKpis" />

      {semConteudo.length > 0 && (
        <div className="accessBanner alerta" role="alert">
          <i>!</i>
          <div>
            <b>
              {semConteudo.length} {semConteudo.length > 1 ? "cards não apontam" : "card não aponta"} para nenhuma peça
            </b>
            <span>
              Card de aprovação sem conteúdo não pode ser decidido — quem aprova estaria assinando no
              escuro. Eles aparecem abaixo marcados, e sem botão de decisão.
            </span>
          </div>
          <Pill t="warn">DEFEITO DE DADO</Pill>
        </div>
      )}

      <SubNav
        itens={SUB}
        atual={sub}
        onEscolher={setSub}
        contadores={{
          Tudo: todas.length,
          "Aguardando o cliente": filtrar(todas, "Aguardando o cliente").length,
          "Revisão interna": filtrar(todas, "Revisão interna").length,
          "Dúvidas abertas": filtrar(todas, "Dúvidas abertas").length,
          Decididas: filtrar(todas, "Decididas").length,
        }}
      />

      <div className="approvalGrid">
        <article className="card inbox">
          <Head over="APPROVAL GATES" title="O que espera decisão" />
          <p className="moduleLead">
            Nenhuma entrega chega ao cliente sem passar por aqui. A coluna de quem decide é o que
            separa o que é da agência do que é do cliente.
          </p>
          {visiveis.length === 0 ? (
            <EmptyBlock
              title={sub === "Tudo" ? "Nada aguardando aprovação" : `Nada em “${sub}”`}
              hint={
                sub === "Tudo"
                  ? "O gate está vazio. Quando uma peça, campanha ou entrega precisar de decisão, ela aparece aqui com a arte, a versão e o responsável nomeado."
                  : "Troque o filtro para ver o restante da fila."
              }
            />
          ) : (
            visiveis.map((a) => (
              <div className={"approvalCard d-" + a.decision} key={a.id}>
                <header>
                  <span>
                    <b>{a.title}</b>
                    <small>{a.context}</small>
                  </span>
                  <Pill t={TOM_DA_DECISAO[a.decision]}>{a.statusLabel}</Pill>
                  <em>{a.decidesIt}</em>
                </header>

                {/* O QUE ESTÁ SENDO DECIDIDO. Sem isto, não há decisão. */}
                {a.content ? (
                  <div className="approvalContent">
                    <i>▤</i>
                    <span>
                      <b>{a.content.label}</b>
                      <small>{a.content.versionLabel ?? "versão não registrada"}</small>
                    </span>
                    {a.content.deliverableId ? (
                      <Acao onClick={() => setTab("deliveries")} ariaLabel={`Ver a peça ${a.content.label}`}>
                        Ver a peça →
                      </Acao>
                    ) : (
                      <Acao indisponivel="A versão está registrada, mas ela não aponta para uma entrega — não há arquivo para abrir.">
                        Ver a peça
                      </Acao>
                    )}
                  </div>
                ) : (
                  <div className="approvalContent semConteudo" role="alert">
                    <i>!</i>
                    <span>
                      <b>Este card não aponta para nenhuma peça</b>
                      <small>
                        Sem versão vinculada não há o que mostrar a quem decide. Decidir assim é
                        assinar no escuro — por isso os caminhos de decisão não aparecem neste card.
                      </small>
                    </span>
                  </div>
                )}

                {a.note && (
                  <p className="approvalNote">
                    <small>NOTA DA REVISÃO</small>
                    {a.note}
                  </p>
                )}

                <footer>
                  <span>
                    {a.commentCount > 0
                      ? `${a.commentCount} comentário${a.commentCount > 1 ? "s" : ""} auditável${a.commentCount > 1 ? "eis" : ""}`
                      : "sem comentário registrado"}
                  </span>
                  <span>{a.when ?? "sem data"}</span>
                  {/* A DECISÃO NÃO SE TOMA DAQUI — ver o cabeçalho do arquivo.
                      O caminho é a central, onde existe a peça inteira, o
                      histórico e a assinatura de quem decidiu. */}
                  {a.content === null ? (
                    <Acao indisponivel="Card sem peça vinculada não pode ser decidido. Corrija o vínculo da versão antes de mandar isto ao cliente.">
                      Abrir decisão
                    </Acao>
                  ) : a.decision === "aprovado" || a.decision === "reprovado" ? (
                    <Acao href="/agency/approvals">Ver histórico →</Acao>
                  ) : pode ? (
                    <Acao className="primary" href="/agency/approvals">Abrir decisão →</Acao>
                  ) : (
                    <Acao className="primary" indisponivel={motivo!}>Abrir decisão</Acao>
                  )}
                </footer>
              </div>
            ))
          )}
        </article>

        <aside>
          <article className="card permissionMap">
            <Head over="OS QUATRO CAMINHOS" title="E o que cada um faz de diferente" />
            {CAMINHOS.map((c) => (
              <div className="caminhoDaDecisao" key={c.rotulo}>
                <Pill t={c.tom}>{c.rotulo}</Pill>
                <small>{c.oQueFaz}</small>
              </div>
            ))}
          </article>

          <article className="card integrationAlerts">
            <Head over="GOVERNANÇA" title="Quem assina" />
            <div>
              <i className="partial">◇</i>
              <span>
                <b>A decisão do cliente sai do portal dele</b>
                <small>
                  É o token dele que assina. Este painel acompanha, encaminha e explica — nunca
                  decide no lugar dele.
                </small>
              </span>
            </div>
            <div>
              <i className="warn">!</i>
              <span>
                <b>Peça reprovada não fica agendada</b>
                <small>
                  Reprovar devolve a peça para rascunho e limpa o agendamento. Sem isso, algo que
                  alguém recusou iria ao ar sozinho na hora marcada.
                </small>
              </span>
            </div>
          </article>
        </aside>
      </div>
    </section>
  );
}
