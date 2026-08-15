"use client";

// ═══════════════════════════════════════════════════════════════════════════
//  12. INTEGRAÇÕES — a agência VÊ; só o cliente CONECTA.
//
//  "A equipe interna vê o status das integrações. Somente o cliente pode
//   conectar, reconectar, trocar conta, alterar escopos ou remover."
//
//  Isto está travado em QUATRO camadas, e nenhuma delas é este comentário:
//   1. NO TIPO — `IntegrationView.agencyAccess` é o literal "Somente leitura".
//      Não existe outro valor possível; nenhuma tela pode renderizar
//      "pode editar" por engano.
//   2. NA PERMISSÃO — a área desta aba é `somente-leitura`, e a lista de papéis
//      autorizados a escrever nela é VAZIA. Nem Master. Ver `permissoes.ts`.
//   3. NO SERVIDOR — `recusarAlteracaoDeIntegracao()` devolve 403 em rota de
//      escrita, com o motivo em português. Quem manda POST nunca viu o botão.
//   4. NA ORIGEM DO DADO — o carregador pede `platform`, `name`, `status`,
//      `scopes` e data. NÃO pede `accessTokenEncrypted`. O ciphertext não é
//      lido, não trafega e não chega a este componente.
//
//  Por que tanto rigor para uma tela de leitura: a agência que "reconecta para
//  ajudar" está pedindo credencial por fora do sistema — e é assim que se perde
//  acesso e confiança de uma vez.
// ═══════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { Pill, Head, TabTitle, Kpis, EmptyBlock, Acao } from "./primitives";
import { podeAlterarIntegracoes } from "@/lib/agency/clients/workspace/permissoes";
import { type PropsDaAba } from "./props-da-aba";
import type { IntegrationView } from "@/lib/agency/clients/workspace/vista";

/**
 * Quais agentes consomem cada fonte. Exigência do contrato ("quais agentes
 * utilizam cada integração"). É mapa de arquitetura, não medição — por isso não
 * vira número: vira o nome dos agentes que PARAM se a fonte cair, que é o que
 * torna o alerta acionável.
 *
 * ⚠️ A CHAVE É O GLIFO, não o nome. O nome da conexão é escolhido pelo cliente
 * ("Perfil principal", "Loja centro") e não diz plataforma nenhuma — casar por
 * nome deixava a coluna inteira em "—" para conexões reais, que é a tela
 * afirmando que nenhum agente usa aquilo. O glifo vem do `platform` do banco e
 * é 1:1 com ele.
 */
const AGENTES_POR_GLIFO: Record<string, string[]> = {
  "◉": ["Agente Social Media", "Agente Design", "Agente Tráfego Pago"], // instagram
  f: ["Agente Social Media", "Agente Tráfego Pago"],                    // facebook
  "✆": ["Agente Project Manager"],                                      // whatsapp
  G: ["Agente Estratégia"],                                             // google
  "▲": ["Agente Design", "Agente Branding"],                            // drive
};

function agentesQueUsam(i: IntegrationView): string[] {
  return AGENTES_POR_GLIFO[i.glyph] ?? [];
}

export function IntegrationsTab({ view, perms, setTab, onOpenPortal }: PropsDaAba & { onOpenPortal: () => void }) {
  const [filter, setFilter] = useState("Todas");
  const integrations = view.integrations;

  // A trava, perguntada — não presumida. A tela consulta a MESMA função que o
  // servidor consulta; duas listas de papel divergem em duas semanas.
  const podeAlterar = podeAlterarIntegracoes(perms.role);

  const visible =
    filter === "Todas"
      ? integrations
      : integrations.filter((x) =>
          filter === "Com atenção" ? x.tone === "warn" || x.tone === "partial" : x.tone === "off",
        );

  const attention = integrations.filter((x) => x.tone === "warn" || x.tone === "partial");
  const off = integrations.filter((x) => x.tone === "off");

  const MOTIVO_LEITURA =
    "Integrações são da conta do cliente: só ele conecta, reconecta, troca de conta, altera escopos ou remove — pelo portal dele. O painel interno é somente leitura para todos os papéis, inclusive Master.";

  return (
    <section className="workspaceTab integrationsTab">
      <TabTitle
        status="INTEGRATION HEALTH"
        title="Client Integration Center"
        desc="Visibilidade operacional das conexões do cliente. A agência monitora; somente o cliente autoriza, reconecta ou remove acessos."
      >
        <Acao onClick={() => setTab("intel")}>Onde estes dados são usados</Acao>
        <Acao className="primary" onClick={onOpenPortal}>Abrir portal do cliente ↗</Acao>
      </TabTitle>

      <div className="accessBanner">
        <i>◇</i>
        <div>
          <b>Modo agência · somente leitura</b>
          <span>Nenhuma credencial, permissão ou conexão pode ser alterada por esta tela.</span>
        </div>
        <Pill>GOVERNANÇA ATIVA</Pill>
      </div>

      <Kpis items={view.areaMetrics.integrations} className="integrationKpis" />

      <nav className="integrationFilters" aria-label="Filtrar integrações">
        {["Todas", "Com atenção", "Não conectadas"].map((x) => (
          <button
            key={x}
            type="button"
            onClick={() => setFilter(x)}
            className={filter === x ? "active" : ""}
            aria-current={filter === x ? "true" : undefined}
          >
            {x}
          </button>
        ))}
        <span>Estado lido do banco a cada carregamento</span>
      </nav>

      <div className="integrationGrid">
        <article className="card integrationList">
          <Head over="ECOSSISTEMA DO CLIENTE" title="Conexões e saúde" />
          <div className="integrationHeader">
            <span>INTEGRAÇÃO</span>
            <span>STATUS</span>
            <span>ÚLTIMA SYNC</span>
            <span>AGENTES QUE USAM</span>
            <span>ACESSO</span>
          </div>
          {visible.length === 0 ? (
            <EmptyBlock
              title={filter === "Todas" ? "Nenhuma integração cadastrada" : `Nada em “${filter}”`}
              hint={
                filter === "Todas"
                  ? "Só o cliente conecta. Enquanto ele não conectar nada, esta lista fica vazia — e nenhum dado desta tela pode ser estimado a partir de outra fonte."
                  : "Troque o filtro para ver o restante."
              }
              action={filter === "Todas" ? "Pedir ao cliente pelo portal" : undefined}
              onAction={filter === "Todas" ? onOpenPortal : undefined}
            />
          ) : (
            visible.map((x) => {
              const agentes = agentesQueUsam(x);
              return (
                <div className="integrationRow" key={x.name}>
                  <i>{x.glyph}</i>
                  <span>
                    <b>{x.name}</b>
                    <small>{x.scopes}</small>
                  </span>
                  <Pill t={x.tone}>{x.statusLabel}</Pill>
                  <time className={x.lastSync === null ? "noData" : ""}>{x.lastSync ?? "—"}</time>
                  <strong className={agentes.length === 0 ? "noData" : ""}>
                    {agentes.length === 0 ? "—" : agentes.join(" · ")}
                  </strong>
                  {/* A COLUNA DE ACESSO É O CONTROLE — e não existe outro.
                      Havia aqui um "→" desabilitado com o motivo ao lado. Ele
                      não abria nada: não há detalhe de conexão que a agência
                      possa ver além do que já está nesta linha. E o motivo,
                      espremido na última célula de uma grade de sete colunas,
                      virava uma coluna de UMA PALAVRA POR LINHA que esticava a
                      linha inteira para ~250px de altura — cinco vezes o espaço
                      da informação real. Um controle que só existe para ser
                      recusado, ocupando isso, é ruído, não governança. A
                      restrição continua dita, no lugar onde ela é lida. */}
                  <em title={MOTIVO_LEITURA}>{x.agencyAccess}</em>
                </div>
              );
            })
          )}
        </article>

        <aside>
          <article className="card systemDoctor">
            <div className="agentTop">
              <i>✦</i>
              <span>
                <small>AGENTE DE INTEGRAÇÕES</small>
                <h3>Connection Intelligence</h3>
              </span>
              <Pill>ATIVO</Pill>
            </div>
            <p>Acompanha disponibilidade, escopos e sincronização sem acessar ou expor credenciais.</p>
            <div>
              <small>AÇÃO RECOMENDADA AO CLIENTE</small>
              <b>
                {attention.length > 0
                  ? `Revisar ${attention.length} ${attention.length > 1 ? "conexões" : "conexão"} com pendência.`
                  : off.length > 0
                    ? `${off.length} fonte${off.length > 1 ? "s" : ""} ainda não conectada${off.length > 1 ? "s" : ""}.`
                    : "Nada pendente do lado do cliente."}
              </b>
              <span>A agência só pode pedir; a autorização é sempre do cliente.</span>
            </div>
            {/* PEDIR é ato da agência e é permitido — o link do portal é o
                caminho real, já existente. ALTERAR não é, e por isso não há
                controle de alteração nenhum nesta aba. */}
            <Acao onClick={onOpenPortal}>Abrir o portal para pedir →</Acao>
          </article>

          <article className="card integrationAlerts">
            <Head over="INCIDENTES & PENDÊNCIAS" title="O que exige atenção" />
            {attention.length === 0 && off.length === 0 ? (
              <EmptyBlock title="Sem incidentes" hint="Nenhuma conexão com pendência registrada." />
            ) : (
              [...attention, ...off].map((x) => (
                <div key={x.name}>
                  <i className={x.tone === "off" ? "off" : x.tone === "partial" ? "partial" : "warn"}>
                    {x.tone === "off" ? "×" : x.tone === "partial" ? "◇" : "!"}
                  </i>
                  <span>
                    <b>
                      {x.name} · {x.statusLabel.toLowerCase()}
                    </b>
                    {/* IMPACTO OPERACIONAL DA FALHA — exigência do contrato.
                        Sem isto o alerta diz "algo caiu" e ninguém investiga. */}
                    <small>
                      {agentesQueUsam(x).length > 0
                        ? `Para enquanto isso durar: ${agentesQueUsam(x).join(", ")}.`
                        : "Nenhum agente desta casa consome esta fonte hoje."}
                    </small>
                  </span>
                  <Pill>Cliente</Pill>
                </div>
              ))
            )}
          </article>

          <article className="card permissionMap">
            <Head over="GOVERNANÇA" title="Permissões desta área" />
            {[
              ["Ver status e saúde", "Agência + Cliente"],
              ["Ver escopos autorizados", "Agência + Cliente"],
              ["Conectar ou reconectar", "Somente Cliente"],
              ["Alterar escopos e contas", "Somente Cliente"],
              ["Remover integração", "Somente Cliente"],
            ].map(([what, who]) => (
              <div key={what}>
                <span>{what}</span>
                <b>{who}</b>
              </div>
            ))}
            {!podeAlterar && (
              <p className="moduleLead">
                Vale para todos os papéis internos, inclusive Master. A trava não é a ausência de
                botão nesta tela — é o servidor recusando a alteração.
              </p>
            )}
          </article>
        </aside>
      </div>
    </section>
  );
}
