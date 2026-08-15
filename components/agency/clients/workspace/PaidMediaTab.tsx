"use client";

// ═══════════════════════════════════════════════════════════════════════════
//  7. TRÁFEGO PAGO — o Paid Media Command Center e os sete submódulos.
//
//  ── A REGRA QUE MANDA NESTA ABA ─────────────────────────────────────────
//  "Nenhum aumento de verba ou publicação pode ocorrer sem autorização
//  compatível." Ela está cumprida da forma mais simples e mais forte possível:
//  **esta tela não tem controle de verba nenhum.** Não há campo de orçamento,
//  não há botão de escalar, não há pausa de campanha. Subir verba é efeito
//  irreversível com dinheiro de terceiro; ele acontece onde já acontece hoje
//  (/agency/ads-agent), com o papel que a rota exige.
//
//  ── E POR QUE TUDO AQUI ESTÁ VAZIO ──────────────────────────────────────
//  Investimento, receita atribuída, ROAS e CPA vêm das contas de anúncio DO
//  CLIENTE. Sem conta conectada, estimar qualquer um dos quatro é inventar
//  dinheiro — e o número inventado vira decisão de verba lá na frente.
// ═══════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { Pill, Head, TabTitle, Kpis, EmptyBlock, Acao, SubNav, DepartmentModule } from "./primitives";
import { escritaDaAba, type PropsDaAba } from "./props-da-aba";

const SUB = ["Command Center", "Campanhas", "Experimentos", "Criativos", "Audiências", "Atribuição", "Budget Control"] as const;

const FALTA: Record<string, { frase: string; capacidades: readonly string[] }> = {
  Campanhas: {
    frase: "As campanhas vêm da conta de anúncio do cliente. Sem conta conectada não há campanha para listar — e uma lista vazia aqui não significa que ele não anuncia, significa que a agência não está lendo.",
    capacidades: ["Ativas", "Pausadas", "Objetivo", "Verba diária", "Entrega", "Aprendizado"],
  },
  Experimentos: {
    frase: "Teste A/B depende de campanha conectada. Sem campanha, não há teste rodando.",
    capacidades: ["Hipótese", "Variantes", "Significância", "Resultado", "Decisão"],
  },
  Criativos: {
    frase: "O criativo que roda no anúncio é uma entrega desta agência — ele está na aba Entregas, com versão e aprovação. O desempenho dele depende da conta conectada.",
    capacidades: ["Peça em veiculação", "Versão aprovada", "Frequência", "Fadiga", "Desempenho"],
  },
  Audiências: {
    frase: "Públicos salvos vivem na conta de anúncio do cliente. O público que a ESTRATÉGIA definiu está na aba Estratégia — e os dois não são a mesma coisa.",
    capacidades: ["Públicos salvos", "Semelhantes", "Remarketing", "Exclusões", "Sobreposição"],
  },
  Atribuição: {
    frase: "Atribuição exige analytics conectado além da conta de anúncio. Nenhuma das duas fontes está ligada a este cliente.",
    capacidades: ["Origem do lead", "Jornada", "Janela de conversão", "Receita atribuída"],
  },
  "Budget Control": {
    frase: "Este painel NÃO controla verba — de propósito. Mudança de investimento é efeito irreversível com dinheiro do cliente e acontece no Agente de Tráfego, com o papel que a rota exige.",
    capacidades: ["Verba contratada", "Consumo", "Ritmo", "Alerta de estouro", "Autorização de aumento"],
  },
};

export function PaidMediaTab({ view, perms, setTab }: PropsDaAba) {
  const [sub, setSub] = useState<string>(SUB[0]);
  const { pode, motivo } = escritaDaAba(perms, "traffic");
  const contas = view.integrations.filter((i) => i.name.toLowerCase().includes("meta") || i.glyph === "f" || i.glyph === "◉");

  return (
    <section className="workspaceTab trafficTab">
      <TabTitle
        status="GROWTH OS"
        title="Paid Media Command Center"
        desc="Investimento, experimentação, atribuição e escala com governança de risco."
      >
        <Acao onClick={() => setTab("integrations")}>Contas conectadas</Acao>
        {pode ? (
          <Acao className="primary" href="/agency/ads-agent">Abrir o Agente de Tráfego</Acao>
        ) : (
          <Acao className="primary" indisponivel={motivo!}>Abrir o Agente de Tráfego</Acao>
        )}
      </TabTitle>

      <SubNav itens={SUB} atual={sub} onEscolher={setSub} />

      {sub !== "Command Center" ? (
        <DepartmentModule
          title={sub}
          kind="growth"
          oQueFalta={FALTA[sub]?.frase ?? "Sem fonte conectada para este submódulo."}
          capacidades={FALTA[sub]?.capacidades}
        />
      ) : (
        <>
          <Kpis items={view.areaMetrics.traffic} className="growthKpis" />

          <div className="accessBanner">
            <i>◇</i>
            <div>
              <b>Este painel não movimenta verba</b>
              <span>
                Não existe aqui campo de orçamento, botão de escalar nem pausa de campanha. Mudar
                investimento é efeito irreversível com dinheiro do cliente e acontece no Agente de
                Tráfego, com o papel que a rota exige.
              </span>
            </div>
            <Pill>GOVERNANÇA ATIVA</Pill>
          </div>

          <div className="trafficGrid">
            <article className="card spendChart">
              <Head over="PERFORMANCE & INVESTIMENTO" title="Eficiência da mídia" action={{ rotulo: "Ver integrações", onClick: () => setTab("integrations") }} />
              <div className="growthChart">
                <div>
                  <span>
                    <b className="noData">—</b>
                    <small>Investimento</small>
                  </span>
                  <span>
                    <b className="noData">—</b>
                    <small>Receita atribuída</small>
                  </span>
                </div>
              </div>
              <EmptyBlock
                title="Nenhuma conta de anúncio conectada"
                hint="Investimento, receita atribuída, ROAS e CPA vêm das contas do cliente. Sem conexão, esta área fica vazia — estimar aqui seria inventar dinheiro."
                action="Ver integrações"
                onAction={() => setTab("integrations")}
              />
              <div className="platforms">
                {contas.length === 0 ? (
                  <Acao onClick={() => setTab("integrations")}>
                    <>
                      <i>◇</i>
                      <span>
                        <b>Sem plataforma</b>
                        <small>conectar no portal do cliente</small>
                      </span>
                      <strong className="noData">—</strong>
                    </>
                  </Acao>
                ) : (
                  contas.map((c) => (
                    <Acao key={c.name} onClick={() => setTab("integrations")}>
                      <>
                        <i>{c.glyph}</i>
                        <span>
                          <b>{c.name}</b>
                          <small>{c.statusLabel}</small>
                        </span>
                        <strong className="noData">—</strong>
                      </>
                    </Acao>
                  ))
                )}
              </div>
            </article>

            <article className="card growthAgent">
              <div className="agentTop">
                <i>✦</i>
                <span>
                  <small>AGENTE TRÁFEGO PAGO</small>
                  <h3>Media Intelligence</h3>
                </span>
                <Pill>ONLINE</Pill>
              </div>
              <p>Monitora orçamento, aprendizado e risco. Nunca aumenta investimento real sem autorização.</p>
              <div>
                <small>OPORTUNIDADE</small>
                <b>Sem campanha para analisar.</b>
                <span>O agente não sugere escala sem dado medido.</span>
              </div>
              {pode ? (
                <Acao href="/agency/desempenho-pago">Ver desempenho pago →</Acao>
              ) : (
                <Acao indisponivel={motivo!}>Ver desempenho pago</Acao>
              )}
            </article>

            <article className="card campaigns">
              <Head over="CAMPANHAS ATIVAS" title="Performance e decisão" />
              <EmptyBlock title="Nenhuma campanha ativa" hint="Nenhuma conta de mídia paga está conectada a este cliente." />
            </article>

            <article className="card experiments">
              <Head over="EXPERIMENTATION ENGINE" title="Testes em andamento" />
              <EmptyBlock title="Nenhum experimento" hint="Sem campanha conectada não há teste rodando." />
            </article>
          </div>
        </>
      )}
    </section>
  );
}
