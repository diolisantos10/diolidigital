"use client";

// ═══════════════════════════════════════════════════════════════════════════
//  5. BRANDING — o Brand Space, os dez submódulos, e a presença mais forte da
//  marca DO CLIENTE em toda a superfície interna (exigência do contrato).
//
//  O MAPA DE CONHECIMENTO NÃO É DECORAÇÃO. Ele é a ficha real dos nove campos
//  da marca (`lib/agency/esteira/ficha-de-marca.ts`), e o estado de cada um vem
//  de `BrandBrain.fieldStatesJson` — o campo que a casa criou justamente para
//  separar "definido" de "lacuna" de "herdado do default do sistema". Um campo
//  no default conta como NÃO perguntado, nunca como preenchido: é essa distinção
//  que impede a agência de achar que sabe da marca o que ela não sabe.
//
//  O `children` são os blocos que ESTA CASA já tem e que não podiam se perder na
//  migração — a Ficha de Marca (os nove campos que permitem julgar), o Material
//  de Marca e o Brand Hub. Eles ficam SEMPRE montados, depois do Control Room:
//  o Control Room é leitura da marca; os três de baixo são onde se ESCREVE.
//
//  "Completar marca com IA" não abre entrevista simulada — a referência tinha
//  três perguntas fixas cujas respostas iam para lugar nenhum. Esta casa tem a
//  entrevista de verdade, que sabe qual campo está em lacuna e qual pergunta
//  fazer para cada um. O botão leva para ela.
//
//  ⚠️ NÃO CRIAR SEGUNDO REPOSITÓRIO DE ASSETS. O submódulo "Assets" aponta para
//  o Material de Marca desta aba, que já lê o armazenamento existente.
// ═══════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { Pill, Head, Kpis, Ring, EmptyBlock, Acao } from "./primitives";
import { escritaDaAba, type PropsDaAba } from "./props-da-aba";
import type { AgencyClientView } from "@/lib/agency/clients/workspace/vista";

const brandNav: [string, string][] = [
  ["control", "Control Room"],
  ["core", "Brand Core"],
  ["people", "Públicos"],
  ["voice", "Sistema Verbal"],
  ["visual", "Sistema Visual"],
  ["mood", "Moodboards"],
  ["assets", "Assets"],
  ["audit", "Brand Auditor"],
  ["gates", "Approval Gates"],
  ["evolve", "Evolution Lab"],
  ["ficha", "Ficha de Marca"],
];

/** [título, o que é, o que ele controlaria, o que falta para existir]. A quarta
 *  posição é o que separa isto de um card genérico: ela nomeia a peça ausente. */
const details: Record<string, [string, string, string[], string]> = {
  core: ["Brand Core", "O núcleo estratégico e imutável da marca.",
    ["Essência e propósito", "Posicionamento", "Proposta de valor", "Territórios", "Arquétipos", "Manifesto"],
    "Estes seis são campos da Ficha de Marca, abaixo nesta mesma aba — é lá que eles se preenchem e é de lá que o mapa de conhecimento lê. Não existe um segundo Brand Core."],
  people: ["Públicos & Cultura", "Pessoas, contextos e tensões que movem a marca.",
    ["Segmentos vivos", "Personas", "Jobs to be Done", "Jornadas", "Comunidades", "Radar cultural"],
    "O público escrito por gente está no briefing do projeto e aparece na aba Estratégia. Persona, jornada e radar cultural não têm tabela nesta casa."],
  voice: ["Sistema Verbal", "Como a marca pensa, fala e se comporta.",
    ["Tom e voz", "Message house", "Vocabulário", "Do / Don't", "Claims", "Prompts oficiais"],
    "Tom de voz e o que evitar são campos da Ficha de Marca. O que NÃO existe: message house, vocabulário controlado e claims aprovados — cada um precisaria de tabela própria."],
  visual: ["Sistema Visual", "A linguagem visual modular da marca.",
    ["Arquitetura de logo", "Tokens visuais", "Tipografia", "Fotografia", "Motion & som", "Acessibilidade"],
    "Cores, fontes e estilo visual são campos da Ficha de Marca; os arquivos estão no Material de Marca. Tokens versionados e regras de motion não são gravados aqui."],
  mood: ["Moodboard Lab", "Referências vivas ligadas às decisões criativas.",
    ["Território visual", "Presença humana", "Anti-referências", "Campanhas", "Deriva visual"],
    "Referências visuais do cliente ainda não têm onde ser guardadas com curadoria. As que existem chegaram como material do cliente e estão na aba Entregas."],
  assets: ["Asset Intelligence", "Os arquivos que a produção consegue usar de verdade.",
    ["Biblioteca mestre", "Direitos de uso", "Versões", "Coleções"],
    "Os assets reais deste cliente estão no Material de Marca, abaixo nesta mesma aba. Não existe um segundo repositório — e não vai existir por esta tela."],
  audit: ["Brand Auditor", "Auditoria multimodal e explicável.",
    ["Texto e voz", "Logo e cores", "Composição", "Acessibilidade", "Compliance", "Correções sugeridas"],
    "O Brand Auditor não roda para este cliente: não há histórico de auditoria gravado. Uma nota de conformidade sem auditoria seria a tela dando aval que ninguém deu."],
  gates: ["Approval Gates", "A trava que protege cada entrega antes do cliente.",
    ["Pré-auditoria", "Revisão humana", "Exceções", "Aprovações", "Trilha de evidência"],
    "O gate REAL desta casa é a aba Aprovações — é lá que a peça, a versão e a decisão vivem. Este submódulo descreve as regras; a fila é de lá."],
  evolve: ["Evolution Lab", "Mudança controlada sem perder coerência.",
    ["Radar de sinais", "Hipóteses", "Experimentos", "Brand equity", "Change requests", "Rollback"],
    "Não existe versionamento de marca ao longo do tempo nesta casa. As hipóteses que existem vêm das salas de estratégia e estão na aba Estratégia."],
};

function BrandHeader({
  view, brandView, setView, onInterview, pendentePct,
}: {
  view: string;
  brandView: AgencyClientView["brand"];
  setView: (v: string) => void;
  onInterview: () => void;
  pendentePct: number | null;
}) {
  return (
    <>
      {/* A PRESENÇA VISUAL MAIS FORTE DA MARCA DO CLIENTE em toda a superfície
          interna — exigência do contrato. O chrome continua sendo da Dioli; o
          que muda é o peso do símbolo e do nome dele dentro desta faixa. */}
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
            <em>{brandView.health === null ? "sem base de comparação" : "conhecimento confirmado"}</em>
          </span>
        </div>
        <div className="brandAura">
          <i />
          <i />
          <b>{brandView.headline.charAt(0).toUpperCase()}</b>
        </div>
      </section>
      <div className="brandTools">
        <nav aria-label="Submódulos do Brand Space">
          {brandNav.map((x) => (
            <button
              key={x[0]}
              type="button"
              onClick={() => setView(x[0])}
              className={view === x[0] ? "active" : ""}
              aria-current={view === x[0] ? "true" : undefined}
            >
              {x[1]}
            </button>
          ))}
        </nav>
        <Acao className="interviewButton" onClick={onInterview}>
          <>
            ✦ Completar marca <span>{pendentePct === null ? "sem mapa" : `${pendentePct}% pendente`}</span>
          </>
        </Acao>
      </div>
    </>
  );
}

function Control({
  brandView, setView, onInterview, setTab, podeEscrever, motivo,
}: {
  brandView: AgencyClientView["brand"];
  setView: (v: string) => void;
  onInterview: () => void;
  setTab: PropsDaAba["setTab"];
  podeEscrever: boolean;
  motivo?: string;
}) {
  const confirmed = brandView.knowledge.filter((k) => k.state === "confirmed").length;
  const total = brandView.knowledge.length;
  return (
    <div className="controlGrid">
      <section className="mainCol">
        <div className="signals">
          {[
            ["COMPLETUDE", total ? `${Math.round((confirmed / total) * 100)}%` : null, total ? `${total - confirmed} a descobrir` : null],
            ["CONSISTÊNCIA", null, "não há auditoria gravada"],
            ["ATIVOS", null, "os arquivos estão no Material de Marca"],
            ["GATES ABERTOS", null, "a fila real está na aba Aprovações"],
            ["RISCO", null, "risco de marca não é medido nesta casa"],
          ].map(([label, value, hint]) => (
            <div key={label as string}>
              <small>{label}</small>
              <b className={value === null ? "noData" : ""}>{value ?? "—"}</b>
              <span>{hint ?? "sem dado conectado"}</span>
            </div>
          ))}
        </div>

        <article className="card readiness">
          <Head over="PRONTIDÃO DA MARCA" title="Mapa de conhecimento" action={{ rotulo: "Abrir a ficha", onClick: () => setView("ficha") }} />
          <p>O sistema separa o que está confirmado, o que está no padrão do sistema e o que ainda precisa ser perguntado.</p>
          {brandView.knowledge.length === 0 ? (
            <EmptyBlock
              title="Nenhum perfil de marca cadastrado"
              hint="Sem o perfil de marca do cliente não há o que mapear. O mapa não presume nada — e campo no padrão do sistema conta como não perguntado, nunca como preenchido."
              action={podeEscrever ? "Abrir a ficha de marca" : "Abrir a ficha de marca"}
              onAction={podeEscrever ? () => setView("ficha") : undefined}
              acaoIndisponivel={motivo}
            />
          ) : (
            <div className="knowledge">
              {brandView.knowledge.map((k) => (
                /* Cada área é um dos nove campos da ficha — e é na ficha que
                   ele se preenche. Mandar para um sub-módulo decorativo seria
                   um clique que não leva a lugar nenhum. */
                <Acao key={k.area} onClick={() => setView("ficha")}>
                  <>
                    <span>
                      <b>{k.area}</b>
                      <small>
                        {k.state === "confirmed"
                          ? "Confirmado"
                          : k.state === "mixed"
                            ? "No padrão do sistema — não perguntado"
                            : "Informação insuficiente"}
                      </small>
                    </span>
                    <i>
                      <b style={{ width: `${k.pct ?? 0}%` }} />
                    </i>
                    <strong className={k.pct === null ? "noData" : ""}>{k.pct === null ? "—" : `${k.pct}%`}</strong>
                  </>
                </Acao>
              ))}
            </div>
          )}
        </article>

        <article className="card gatePanel">
          <Head over="CONTROLE DE ENTREGA" title="Brand Gate Pipeline" action={{ rotulo: "Ver aprovações", onClick: () => setTab("approvals") }} />
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
              ◇ <b>O pipeline do gate não é contado por etapa</b>
              <small>a fila real, com peça e versão, está na aba Aprovações</small>
            </span>
            <Acao onClick={() => setView("gates")}>Ver as regras →</Acao>
          </div>
        </article>

        <article className="card mood">
          <Head over="DIREÇÃO CRIATIVA" title="Living Moodboards" action={{ rotulo: "Abrir o laboratório", onClick: () => setView("mood") }} />
          <EmptyBlock
            title="Nenhum moodboard"
            hint="Referências visuais do cliente ainda não têm onde ser guardadas com curadoria neste sistema. O que ele enviou está na aba Entregas, como material do cliente."
          />
        </article>
      </section>

      <aside className="rightCol">
        <article className="card agentCard">
          <div className="agentTop">
            <i>✦</i>
            <span>
              <small>AGENTE DIRETOR DE BRANDING</small>
              <h3>Agente Branding</h3>
            </span>
            <Pill>ONLINE</Pill>
          </div>
          <p>Coordena a inteligência de marca deste cliente e sincroniza aprendizados com o sistema de branding da agência.</p>
          <div className="agentFocus">
            <small>PRÓXIMA MELHOR AÇÃO</small>
            <b>Confirmar com o cliente o que hoje está no padrão do sistema.</b>
            <span>Essa informação afeta: tom de voz, textos, campanhas e o agente de atendimento.</span>
          </div>
          {podeEscrever ? (
            <Acao onClick={onInterview}>Abrir a entrevista real →</Acao>
          ) : (
            <Acao indisponivel={motivo!}>Abrir a entrevista real</Acao>
          )}
          <footer>
            <span>
              <i /> {confirmed} campos confirmados
            </span>
            <span>
              <i /> {total - confirmed} em aberto
            </span>
          </footer>
        </article>

        <article className="card aiAudit">
          <Head over="AUDITORIA CONTÍNUA" title="Brand Auditor" />
          <div className="scan">
            <i>✦</i>
            <span>
              <b>Monitoramento multimodal</b>
              <small>Texto · Imagem · Vídeo · Interface</small>
            </span>
            <Pill t="partial">SEM HISTÓRICO</Pill>
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
          <Acao indisponivel="A auditoria de marca não roda para este cliente: não há histórico gravado nem base de comparação. Uma nota aqui seria aval que ninguém deu.">
            Executar auditoria
          </Acao>
        </article>

        <article className="card sources">
          <Head over="FONTES DA MARCA" title="Conhecimento conectado" />
          <div>
            <i>▤</i>
            <span>
              <b>Perfil de marca do cliente</b>
              <small>{brandView.tagline ? "Preenchido" : "No padrão do sistema"}</small>
            </span>
            <em>{brandView.tagline ? "✓" : "◇"}</em>
          </div>
          <div>
            <i>▦</i>
            <span>
              <b>Material de marca</b>
              <small>os arquivos que a produção consegue usar</small>
            </span>
            <em>↓</em>
          </div>
        </article>
      </aside>
    </div>
  );
}

function Detail({ view, setView }: { view: string; setView: (v: string) => void }) {
  const d = details[view] ?? details.core!;
  return (
    <div className="detail">
      <div className="detailIntro">
        <Acao onClick={() => setView("control")}>← Control Room</Acao>
        <Pill>MÓDULO ATIVO</Pill>
        <h2>{d[0]}</h2>
        <p>{d[1]}</p>
      </div>
      <div className="detailGrid">
        <article className="card capabilities">
          <Head over="CAPACIDADES" title="O que este módulo controla" />
          <div>
            {d[2].map((x, i) => (
              <div key={x}>
                <i>{String(i + 1).padStart(2, "0")}</i>
                <span>
                  <b>{x}</b>
                  <small className="noData">sem estado registrado</small>
                </span>
              </div>
            ))}
          </div>
        </article>
        <article className="card maturity">
          <Head over="ONDE ISTO VIVE HOJE" title="O que falta para este módulo existir" />
          <p className="moduleLead">{d[3]}</p>
          <aside>
            <small>PRÓXIMA MELHOR AÇÃO</small>
            <b>Preencher o que já tem lugar: a Ficha de Marca, abaixo nesta aba.</b>
            <Acao onClick={() => setView("ficha")}>Ir para a ficha →</Acao>
          </aside>
        </article>
      </div>
    </div>
  );
}

export function BrandingTab({ view, perms, setTab, children }: PropsDaAba & { children?: React.ReactNode }) {
  const [sub, setSub] = useState("control");
  const { pode, motivo } = escritaDaAba(perms, "branding");
  const b = view.brand;
  const missing = b.knowledge.filter((k) => k.state !== "confirmed").length;
  const total = b.knowledge.length;
  const pendentePct = total ? Math.round((missing / total) * 100) : null;

  return (
    <section className="workspaceTab brandingTab">
      <BrandHeader
        view={sub}
        brandView={b}
        setView={setSub}
        onInterview={() => setSub("ficha")}
        pendentePct={pendentePct}
      />
      <Kpis items={view.areaMetrics.branding} className="brandKpis" />
      {sub === "control" ? (
        <Control
          brandView={b}
          setView={setSub}
          onInterview={() => setSub("ficha")}
          setTab={setTab}
          podeEscrever={pode}
          motivo={motivo}
        />
      ) : sub === "ficha" ? null : (
        <Detail view={sub} setView={setSub} />
      )}
      {/* Os blocos reais da casa: Ficha de Marca, Material de Marca e Brand Hub.
          Sempre montados — é onde a marca se escreve. */}
      <div className="ccNativo">{children}</div>
    </section>
  );
}
