"use client";

// Branding / Brand Hub — portado da referência aprovada (BrandHeader, Control,
// Detail, AgentCard), com o mesmo DOM e as mesmas classes.
//
// O MAPA DE CONHECIMENTO NÃO É DECORAÇÃO. Ele é a ficha real dos nove campos
// da marca (`lib/agency/esteira/ficha-de-marca.ts`), e o estado de cada um vem
// de `BrandBrain.fieldStatesJson` — o campo que a casa criou justamente para
// separar "definido" de "lacuna" de "herdado do default do sistema". Um campo
// no default conta como NÃO perguntado, nunca como preenchido: é essa distinção
// que impede a agência de achar que sabe da marca o que ela não sabe.

import { useState } from "react";
import { Pill, Head, Ring, EmptyBlock } from "./primitives";

import type { AgencyClientView } from "@/lib/agency/command-center/vista";

const brandNav: [string, string][] = [
  ["control", "Control Room"],
  ["core", "Brand Core"],
  ["people", "Públicos"],
  ["voice", "Verbal"],
  ["visual", "Visual"],
  ["mood", "Moodboards"],
  ["assets", "Assets"],
  ["audit", "Auditor"],
  ["gates", "Gates"],
  ["evolve", "Evolution"],
  ["ficha", "Ficha de Marca"],
];

const details: Record<string, [string, string, string[]]> = {
  core: ["Brand Core", "O núcleo estratégico e imutável da marca.",
    ["Essência e propósito", "Posicionamento", "Proposta de valor", "Territórios", "Arquétipos", "Manifesto"]],
  people: ["Públicos & Cultura", "Pessoas, contextos e tensões que movem a marca.",
    ["Segmentos vivos", "Personas", "Jobs to be Done", "Jornadas", "Comunidades", "Radar cultural"]],
  voice: ["Sistema Verbal", "Como a marca pensa, fala e se comporta.",
    ["Tom e voz", "Message house", "Vocabulário", "Do / Don't", "Claims", "Prompts oficiais"]],
  visual: ["Sistema Visual", "A linguagem visual modular da marca.",
    ["Arquitetura de logo", "Tokens visuais", "Tipografia", "Fotografia", "Motion & som", "Acessibilidade"]],
  mood: ["Moodboard Lab", "Referências vivas ligadas às decisões criativas.",
    ["Território HumanTech", "Presença humana", "Growth", "Anti-referências", "Campanhas", "Deriva visual"]],
  assets: ["Asset Intelligence", "DAM com inteligência, direitos e performance.",
    ["Biblioteca mestre", "Busca semântica", "Direitos de uso", "Versões", "Coleções", "ROI de ativos"]],
  audit: ["Brand Auditor", "Auditoria multimodal e explicável.",
    ["Texto e voz", "Logo e cores", "Composição", "Acessibilidade", "Compliance", "Correções sugeridas"]],
  gates: ["Approval Gates", "A trava que protege cada entrega antes do cliente.",
    ["Pré-auditoria", "Revisão humana", "Exceções", "Aprovações", "SLA", "Trilha de evidência"]],
  evolve: ["Evolution Lab", "Mudança controlada sem perder coerência.",
    ["Radar de sinais", "Hipóteses", "Experimentos", "Brand equity", "Change requests", "Rollback"]],
};

function BrandHeader({
  view, brandView, setView, onInterview,
}: {
  view: string;
  brandView: AgencyClientView["brand"];
  setView: (v: string) => void;
  onInterview: () => void;
}) {
  const missing = brandView.knowledge.filter((k) => k.state !== "confirmed").length;
  const total = brandView.knowledge.length;
  const pendingPct = total ? Math.round((missing / total) * 100) : null;
  return (
    <>
      <section className="brandHeader">
        <div className="brandIdentity">
          <div className="brandMark">{brandView.headline.charAt(0).toUpperCase()}</div>
          <div>
            <span>
              <Pill>BRAND OS ATIVO</Pill>
              <small>{brandView.tagline ? "Perfil de marca preenchido" : "Perfil de marca no padrão do sistema"}</small>
            </span>
            <h2>{brandView.headline} Brand Space</h2>
            <p>{brandView.tagline ?? "Nenhuma descrição de marca cadastrada para este cliente."}</p>
          </div>
        </div>
        <div className="brandHealth">
          <Ring n={brandView.health} />
          <span>
            <small>BRAND HEALTH</small>
            <b>{brandView.health === null ? "Sem medição" : brandView.health >= 80 ? "Forte & coerente" : "Em construção"}</b>
            <em>{brandView.health === null ? "sem base de comparação" : "conhecimento preenchido"}</em>
          </span>
        </div>
        <div className="brandAura">
          <i />
          <i />
          <b>{brandView.headline.charAt(0).toUpperCase()}</b>
        </div>
      </section>
      <div className="brandTools">
        <nav>
          {brandNav.map((x) => (
            <button key={x[0]} type="button" onClick={() => setView(x[0])} className={view === x[0] ? "active" : ""}>
              {x[1]}
            </button>
          ))}
        </nav>
        <button className="interviewButton" type="button" onClick={onInterview}>
          ✦ Completar marca com IA <span>{pendingPct === null ? "sem mapa" : `${pendingPct}% pendente`}</span>
        </button>
      </div>
    </>
  );
}

function AgentCard({ onInterview, answered }: { onInterview: () => void; answered: number }) {
  return (
    <article className="card agentCard">
      <div className="agentTop">
        <i>✦</i>
        <span>
          <small>AGENTE DIRETOR DE BRANDING</small>
          <h3>Agente Branding AI</h3>
        </span>
        <Pill>ONLINE</Pill>
      </div>
      <p>Coordena a inteligência de marca deste cliente e sincroniza aprendizados com o sistema de branding da agência.</p>
      <div className="agentFocus">
        <small>PRÓXIMA MELHOR AÇÃO</small>
        <b>Confirmar com o cliente o que hoje está no padrão do sistema.</b>
        <span>Essa informação afeta: tom de voz, UX writing, campanhas e o agente de atendimento.</span>
      </div>
      <button type="button" onClick={onInterview}>Iniciar entrevista inteligente →</button>
      <footer>
        <span>
          <i /> {answered} campos confirmados
        </span>
        <span>
          <i /> 1 fonte conectada
        </span>
      </footer>
    </article>
  );
}

function Control({
  brandView, setView, onInterview,
}: {
  brandView: AgencyClientView["brand"];
  setView: (v: string) => void;
  onInterview: () => void;
}) {
  const confirmed = brandView.knowledge.filter((k) => k.state === "confirmed").length;
  const total = brandView.knowledge.length;
  return (
    <div className="controlGrid">
      <section className="mainCol">
        <div className="signals">
          {[
            ["COMPLETUDE", total ? `${Math.round((confirmed / total) * 100)}%` : null, total ? `${total - confirmed} a descobrir` : null],
            ["CONSISTÊNCIA", null, null],
            ["ATIVOS", null, null],
            ["GATES ABERTOS", null, null],
            ["RISCO", null, null],
          ].map(([label, value, hint]) => (
            <div key={label as string}>
              <small>{label}</small>
              <b className={value === null ? "noData" : ""}>{value ?? "—"}</b>
              <span>{hint ?? "sem dado conectado"}</span>
            </div>
          ))}
        </div>
        <article className="card readiness">
          <Head over="PRONTIDÃO DA MARCA" title="Mapa de conhecimento" action="Ver diagnóstico" />
          <p>O sistema separa o que está confirmado, inferido e ainda precisa ser perguntado.</p>
          {brandView.knowledge.length === 0 ? (
            <EmptyBlock
              title="Nenhum perfil de marca cadastrado"
              hint="Sem o perfil de marca do cliente não há o que mapear. O mapa não presume nada."
            />
          ) : (
            <div className="knowledge">
              {brandView.knowledge.map((k) => (
                /* Cada área é um dos nove campos da ficha — e é na ficha que
                   ele se preenche. Mandar para um sub-módulo decorativo seria
                   um clique que não leva a lugar nenhum. */
                <button key={k.area} type="button" onClick={() => setView("ficha")}>
                  <span>
                    <b>{k.area}</b>
                    <small>
                      {k.state === "confirmed"
                        ? "Confirmado"
                        : k.state === "mixed"
                          ? "Parcialmente validado"
                          : "Informação insuficiente"}
                    </small>
                  </span>
                  <i>
                    <b style={{ width: `${k.pct ?? 0}%` }} />
                  </i>
                  <strong className={k.pct === null ? "noData" : ""}>{k.pct === null ? "—" : `${k.pct}%`}</strong>
                </button>
              ))}
            </div>
          )}
        </article>
        <article className="card gatePanel">
          <Head over="CONTROLE DE ENTREGA" title="Brand Gate Pipeline" action="Abrir central" />
          <p>Nenhuma entrega chega ao cliente sem cumprir as regras críticas da marca.</p>
          <div className="flow">
            {["Em produção", "Pré-auditoria", "Revisão humana", "Liberados"].map((label, i) => (
              <div key={label} className={"f" + i}>
                <b className="noData">—</b>
                <small>{label}</small>
                {i < 3 && <em>→</em>}
              </div>
            ))}
          </div>
          <div className="blocked">
            <span>
              ! <b>Nenhuma entrega bloqueada</b>
              <small>o pipeline de entregas ainda não é registrado para este cliente</small>
            </span>
            <button type="button" onClick={() => setView("gates")}>Ver regras →</button>
          </div>
        </article>
        <article className="card mood">
          <Head over="DIREÇÃO CRIATIVA" title="Living Moodboards" action="Abrir laboratório" />
          <EmptyBlock
            title="Nenhum moodboard"
            hint="Referências visuais do cliente ainda não têm onde ser guardadas neste sistema."
          />
        </article>
      </section>
      <aside className="rightCol">
        <AgentCard onInterview={onInterview} answered={confirmed} />
        <article className="card aiAudit">
          <Head over="AUDITORIA CONTÍNUA" title="Brand Auditor AI" />
          <div className="scan">
            <i>✦</i>
            <span>
              <b>Monitoramento multimodal</b>
              <small>Texto · Imagem · Vídeo · Interface</small>
            </span>
            <Pill>ATIVO</Pill>
          </div>
          {["Voz & mensagem", "Sistema visual", "Contexto cultural", "Acessibilidade"].map((x) => (
            <div className="score" key={x}>
              <span>{x}</span>
              <i>
                <b style={{ width: "0%" }} />
              </i>
              <strong className="noData">—</strong>
            </div>
          ))}
          <button type="button" onClick={() => setView("audit")}>Executar auditoria</button>
        </article>
        <article className="card sources">
          <Head over="FONTES DA MARCA" title="Conhecimento conectado" />
          <div>
            <i>▤</i>
            <span>
              <b>Perfil de marca do cliente</b>
              <small>{brandView.tagline ? "Preenchido" : "No padrão do sistema"}</small>
            </span>
            <em>✓</em>
          </div>
        </article>
      </aside>
    </div>
  );
}

function Detail({ view, setView }: { view: string; setView: (v: string) => void }) {
  const d: [string, string, string[]] = details[view] ?? details.core!;
  return (
    <div className="detail">
      <div className="detailIntro">
        <button type="button" onClick={() => setView("control")}>← Control Room</button>
        <Pill>MÓDULO ATIVO</Pill>
        <h2>{d[0]}</h2>
        <p>{d[1]}</p>
      </div>
      <div className="detailGrid">
        <article className="card capabilities">
          <Head over="CAPACIDADES" title="O que este módulo controla" />
          <div>
            {d[2].map((x, i) => (
              <button key={x} type="button">
                <i>{String(i + 1).padStart(2, "0")}</i>
                <span>
                  <b>{x}</b>
                  <small className="noData">sem estado registrado</small>
                </span>
                <em>→</em>
              </button>
            ))}
          </div>
        </article>
        <article className="card maturity">
          <Head over="SAÚDE DO MÓDULO" title="Score por dimensão" />
          {["Estrutura", "Cobertura", "Consistência", "Adoção", "Atualidade"].map((x) => (
            <div key={x}>
              <span>{x}</span>
              <i>
                <b style={{ width: "0%" }} />
              </i>
              <strong className="noData">—</strong>
            </div>
          ))}
          <aside>
            <small>PRÓXIMA MELHOR AÇÃO</small>
            <b>Validar os itens inferidos com o cliente.</b>
            <button type="button">Gerar perguntas →</button>
          </aside>
        </article>
      </div>
    </div>
  );
}

/**
 * A aba de Branding.
 *
 * O `children` são os blocos que ESTA CASA já tem e que não podiam se perder na
 * migração — a Ficha de Marca (os nove campos que permitem julgar), o Material
 * de Marca e o Brand Hub. Eles entram DEPOIS do Control Room de propósito: o
 * Control Room é o painel de leitura da marca; os três de baixo são onde se
 * escreve. Ver `app/agency/clients/[id]/page.tsx`.
 *
 * "Completar marca com IA" não abre entrevista simulada: leva ao sub-módulo
 * `ficha`, que renderiza a entrevista real desta casa.
 */
export function BrandingTab({ view, children }: { view: AgencyClientView; children?: React.ReactNode }) {
  const [sub, setSub] = useState("control");
  return (
    <section className="brandingTab">
      <BrandHeader view={sub} brandView={view.brand} setView={setSub} onInterview={() => setSub("ficha")} />
      {sub === "control" ? (
        <Control brandView={view.brand} setView={setSub} onInterview={() => setSub("ficha")} />
      ) : sub === "ficha" ? null : (
        <Detail view={sub} setView={setSub} />
      )}
      {/* Os blocos reais da casa. Ficam sempre montados: são a fonte de escrita
          da marca, e escondê-los atrás de uma aba interna já custou uma
          migração inteira de campo que ninguém achava. */}
      <div className="ccNativo">{children}</div>
    </section>
  );
}
