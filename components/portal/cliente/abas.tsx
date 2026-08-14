"use client";

// As abas do portal do cliente que não têm componente próprio ainda: Projetos,
// Tráfego Pago, Entregas, Brand Hub e Minha conta.
//
// Estrutura e classes portadas da referência aprovada (CLAUDE_HANDOFF_2), sem
// redesenho. A diferença com a demonstração é sempre a mesma e sempre a mesma
// razão: onde a demonstração escreve um número fixo ("438 contatos", "1.284
// arquivos", "91/100 de saúde da marca"), aqui ou existe medição, ou existe
// estado vazio dizendo por quê. Número inventado é o pior erro possível neste
// portal — o cliente lê como se fosse resultado dele (regra 9 do despacho).

import type { ReactNode } from "react";
import type { BrandHubView, CampanhaView, ContaView, EntregaView } from "@/lib/agency/portal/vista-do-cliente";
import { CapaDaAba, Etiqueta, Icone, Numeros, TituloDeSecao, Vazio, dataCurta, emReais, mesEAno, passosDoProjeto } from "./pecas";

export interface ProjetoDoPortal {
  id: string;
  nome: string;
  objetivo: string | null;
  etapa: string;
  criadoEm: string | null;
}

export function AbaProjetos({
  projetos, simbolo, erro, aoTentarDeNovo, aoIrPara, aoAbrirChat, extra,
}: {
  projetos: ProjetoDoPortal[];
  simbolo: string;
  erro: boolean;
  aoTentarDeNovo: () => void;
  aoIrPara: (aba: string) => void;
  aoAbrirChat: () => void;
  /** A trilha do projeto (EsteiraDoCliente) — o "onde estamos" que já existia. */
  extra?: ReactNode;
}) {
  return (
    <>
      <CapaDaAba
        simbolo={simbolo}
        sobretitulo={projetos.length === 1 ? "1 PROJETO" : `${projetos.length} PROJETOS`}
        titulo="Projetos"
        descricao="Acompanhe objetivo, etapa e o que depende de você em cada projeto."
      >
        <button className="primary" onClick={() => aoIrPara("aprovacoes")} style={{ touchAction: "manipulation" }}>
          Ver o que espera você
        </button>
      </CapaDaAba>

      {extra && <div style={{ margin: "13px 0" }}>{extra}</div>}

      {erro && projetos.length === 0 ? (
        <Vazio
          icone="!"
          titulo="Não consegui carregar seus projetos"
          texto="Costuma ser conexão. Tente de novo — se continuar assim, fale com seu Project Manager pela conversa aqui do portal."
          acao={{ rotulo: "Tentar de novo", aoClicar: aoTentarDeNovo }}
        />
      ) : projetos.length === 0 ? (
        <Vazio
          icone="◇"
          titulo="Seu projeto está sendo montado"
          texto="Assim que o primeiro projeto abrir, ele aparece aqui com a etapa atual e o que depende de você."
          acao={{ rotulo: "Falar com seu Project Manager", aoClicar: aoAbrirChat }}
        />
      ) : (
        <div className="cp-project-board">
          {projetos.map((p) => {
            const { passos, progresso } = passosDoProjeto(p.etapa);
            return (
              <article className="cp-card cp-project-card" key={p.id}>
                <header>
                  <Etiqueta tom={progresso === 100 ? "green" : "cyan"}>{p.etapa.toLocaleUpperCase("pt-BR")}</Etiqueta>
                </header>
                <h3>{p.nome}</h3>
                <p>{p.objetivo ?? "O objetivo deste projeto ainda não foi registrado. Diga ao seu Project Manager e ele entra aqui."}</p>
                <div className="cp-project-meta">
                  <span><small>ETAPA ATUAL</small><b>{p.etapa}</b></span>
                  <span><small>ABERTO EM</small><b>{dataCurta(p.criadoEm) ?? "—"}</b></span>
                </div>
                <div className="cp-project-progress">
                  <span><b>Progresso geral</b><strong>{progresso}%</strong></span>
                  <i><b style={{ width: `${progresso}%` }} /></i>
                </div>
                <div className="cp-project-steps">
                  {passos.map(([rotulo, estado]) => (
                    <span className={estado} key={rotulo}>
                      <i aria-hidden>{estado === "done" ? "✓" : estado === "active" ? "•" : ""}</i>
                      <small>{rotulo}</small>
                    </span>
                  ))}
                </div>
                <footer>
                  <span>{dataCurta(p.criadoEm) ? `Aberto em ${dataCurta(p.criadoEm)}` : "Em acompanhamento"}</span>
                  <button onClick={() => aoIrPara("aprovacoes")} style={{ touchAction: "manipulation" }}>
                    Ver decisões →
                  </button>
                </footer>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}

/**
 * RESULTADOS — a grade da referência (gráfico grande · leitura · por canal).
 *
 * O gráfico e os números vêm inteiros do componente que já lê a plataforma
 * (`ResultadosDoCliente`), com os três estados dele. O que esta aba acrescenta
 * é a MOLDURA aprovada: a leitura ao lado e a lista por canal embaixo.
 *
 * A "análise" da demonstração ("a campanha com prova real gerou 42% mais…")
 * não tem equivalente honesto aqui: ninguém apurou isso para este cliente. No
 * lugar dela entra o que é verdade sempre e ajuda de verdade — o que cada
 * número quer dizer — e a porta para perguntar ao PM.
 */
export function AbaResultados({
  simbolo, numeros, resultados, redes, periodo, aoAbrirChat, aoIrPara,
}: {
  simbolo: string;
  numeros: { rotulo: string; valor: string; nota: string }[];
  /** O painel medido, com os três estados — vem pronto de quem lê a plataforma. */
  resultados: ReactNode;
  redes: { id: string; plataforma: string; nome: string; ok: boolean }[];
  periodo: string | null;
  aoAbrirChat: () => void;
  aoIrPara: (aba: string) => void;
}) {
  return (
    <>
      <CapaDaAba
        simbolo={simbolo}
        sobretitulo="VISÃO DOS RESULTADOS"
        titulo="Resultados"
        descricao="Uma leitura simples do que está acontecendo com a sua marca no período medido."
      >
        <button onClick={() => aoIrPara("integracoes")} style={{ touchAction: "manipulation" }}>
          Gerenciar contas
        </button>
      </CapaDaAba>

      <Numeros itens={numeros} />

      <div className="cp-results-grid" style={{ marginTop: 13 }}>
        <article className={`cp-card cp-main-chart${numeros.length === 0 ? " sem-serie" : ""}`}>
          <TituloDeSecao
            sobretitulo="CRESCIMENTO CONSOLIDADO"
            titulo={periodo ? `Evolução em ${periodo}` : "Evolução dos resultados"}
          />
          <div style={{ marginTop: 15 }}>{resultados}</div>
        </article>

        <aside className="cp-card cp-insights">
          <div className="cp-pm-top">
            <div className="cp-pm-avatar" aria-hidden>✦</div>
            <span><small>COMO LER ESTA TELA</small><h3>O que cada número diz</h3></span>
          </div>
          {[
            ["◎", "Alcance é gente diferente que viu você. Duas visualizações da mesma pessoa contam uma vez."],
            ["↗", "Interações são curtidas, comentários, salvamentos e compartilhamentos — o sinal de que o conteúdo tocou alguém."],
            ["→", "Número que não aparece aqui não foi medido pela plataforma. A gente não completa com estimativa."],
          ].map(([icone, texto]) => (
            <div key={texto}><i aria-hidden>{icone}</i><p>{texto}</p></div>
          ))}
          <button onClick={aoAbrirChat} style={{ touchAction: "manipulation" }}>
            Conversar sobre os resultados →
          </button>
        </aside>

        <article className="cp-card cp-channel-results">
          <TituloDeSecao
            sobretitulo="POR CANAL"
            titulo="De onde vêm os seus números"
            acao={<button onClick={() => aoIrPara("integracoes")} style={{ touchAction: "manipulation" }}>Gerenciar →</button>}
          />
          {redes.length === 0 ? (
            <div style={{ marginTop: 15 }}>
              <Vazio
                icone="⌁"
                titulo="Nenhum canal conectado ainda"
                texto="Os números desta tela vêm das contas que você conecta. Conecte a primeira e ela passa a aparecer aqui, com o que traz para o relatório."
                acao={{ rotulo: "Conectar em Integrações", aoClicar: () => aoIrPara("integracoes") }}
              />
            </div>
          ) : (
            redes.map((r) => (
              <button key={r.id} onClick={() => aoIrPara("integracoes")} style={{ touchAction: "manipulation" }}>
                <Icone>{r.plataforma.toLocaleUpperCase("pt-BR").slice(0, 2)}</Icone>
                <span><b>{r.nome || r.plataforma}</b><small>{r.plataforma}</small></span>
                <strong>{r.ok ? "Conectado" : "Reconectar"}</strong>
                <span><b>{r.ok ? "Trazendo dados" : "Sem leitura"}</b><small>estado da conexão</small></span>
                <em style={r.ok ? undefined : { color: "#9a6417" }}>{r.ok ? "✓" : "!"}</em>
                <i aria-hidden>→</i>
              </button>
            ))
          )}
        </article>
      </div>
    </>
  );
}

export function AbaTrafegoPago({
  campanhas, simbolo, aoAbrirChat,
}: {
  campanhas: CampanhaView[];
  simbolo: string;
  aoAbrirChat: () => void;
}) {
  const noAr = campanhas.filter((c) => c.situacao === "No ar");
  // O teto somado é o que o CLIENTE aprovou por escrito — número dele, guardado
  // no ato da criação. O que NÃO existe aqui é gasto realizado: sem leitura da
  // plataforma no período, um "investido: R$ X" seria estimativa vestida de
  // fato. Enquanto não há leitura, a tela diz que não há.
  const teto = campanhas.reduce((s, c) => s + (c.tetoAprovadoBRL ?? 0), 0);
  const verbaNoAr = noAr.reduce((s, c) => s + (c.verbaDiariaBRL ?? 0), 0);

  return (
    <>
      <CapaDaAba
        simbolo={simbolo}
        sobretitulo="PAINEL DE TRÁFEGO PAGO"
        titulo="Tráfego Pago"
        descricao="Suas campanhas de anúncio: o que está no ar, para quem, e com qual teto de investimento aprovado por você."
      >
        <button onClick={aoAbrirChat} style={{ touchAction: "manipulation" }}>Falar sobre as campanhas</button>
      </CapaDaAba>

      <Numeros
        itens={campanhas.length === 0 ? [] : [
          { rotulo: "CAMPANHAS NO AR", valor: String(noAr.length), nota: `de ${campanhas.length} montada(s)` },
          { rotulo: "PAUSADAS", valor: String(campanhas.length - noAr.length), nota: "não estão gastando" },
          ...(teto > 0 ? [{ rotulo: "TETO APROVADO POR VOCÊ", valor: emReais(teto) ?? "—", nota: "somando as campanhas" }] : []),
          ...(verbaNoAr > 0 ? [{ rotulo: "VERBA DIÁRIA NO AR", valor: emReais(verbaNoAr) ?? "—", nota: "por dia, enquanto estiver no ar" }] : []),
        ]}
      />

      {campanhas.length === 0 ? (
        <Vazio
          icone="↗"
          titulo="Nenhuma campanha de anúncio montada ainda"
          texto="Quando a primeira campanha for montada, ela aparece aqui com público, objetivo e o teto de investimento que você aprovou. Nada vai ao ar sem o seu sim."
          acao={{ rotulo: "Quero anunciar — falar com o PM", aoClicar: aoAbrirChat }}
        />
      ) : (
        /* A grade da referência: desempenho à esquerda, a proteção da verba à
           direita, a tabela inteira embaixo e a leitura escura no rodapé. */
        <div className="cp-paid-dashboard" style={{ marginTop: 13 }}>
          {/* Os NÚMEROS de desempenho (gasto, contatos, custo por contato) vêm da
              plataforma de anúncio. Enquanto essa leitura não está ligada, a
              tela declara a ausência em vez de estampar uma estimativa. */}
          <article className="cp-card cp-paid-evolution sem-serie">
            <TituloDeSecao sobretitulo="DESEMPENHO DO PERÍODO" titulo="Quanto rendeu" />
            <div style={{ marginTop: 15 }}>
              <Vazio
                icone="◷"
                titulo="Ainda não temos os números do período"
                texto="Gasto, contatos gerados e custo por contato vêm direto da plataforma de anúncio. Assim que a leitura do período fechar, eles aparecem aqui — medidos, nunca estimados."
              />
            </div>
          </article>

          {/* O funil da demonstração (impressões → cliques → contatos) precisa de
              leitura da plataforma. O que existe de verdade e é o que mais
              importa para quem paga é o CONTROLE do dinheiro: o teto que ele
              aprovou e o que sai por dia. É isso que ocupa a coluna. */}
          <aside className="cp-card cp-funnel-card">
            <TituloDeSecao sobretitulo="SEU DINHEIRO" titulo="O que está comprometido" />
            <footer>
              <span><small>TETO APROVADO POR VOCÊ</small><b>{emReais(teto) ?? "—"}</b></span>
              <span><small>VERBA DIÁRIA NO AR</small><b>{emReais(verbaNoAr) ?? "—"}</b></span>
            </footer>
            <p style={{ marginTop: 13, color: "var(--cp-muted)" }}>
              O teto é o limite que você aprovou por escrito e ele não muda sozinho.
              Campanha pausada não gasta. Para subir o teto, é preciso a sua palavra.
            </p>
          </aside>

          <article className="cp-card cp-campaign-table">
            <TituloDeSecao sobretitulo="SUAS CAMPANHAS" titulo="Campanha por campanha" />
            {/* Cinco colunas, não seis: o público já é a segunda linha do nome,
                e repetir a mesma informação em duas colunas é o cliente
                conferindo se são dois dados diferentes. */}
            <div className="cp-table-head">
              <span>Campanha</span><span>Objetivo</span><span>Verba diária</span><span>Teto aprovado</span><span>Situação</span>
            </div>
            {/* No ar primeiro: o que está gastando agora é o que ele precisa ver
                antes. A ordem do banco é de criação, e não diz nada a ele. */}
            {[...campanhas]
              .sort((a, b) => Number(b.situacao === "No ar") - Number(a.situacao === "No ar"))
              .map((c) => (
                <button key={c.id} style={{ touchAction: "manipulation" }}>
                  <span><b>{c.nome}</b><small>{c.publico ?? "Público definido na plataforma"}</small></span>
                  <span>{c.objetivo}</span>
                  <strong>{emReais(c.verbaDiariaBRL) ?? "—"}</strong>
                  <span>{emReais(c.tetoAprovadoBRL) ?? "—"}</span>
                  <Etiqueta tom={c.situacao === "No ar" ? "green" : c.situacao === "Pausada" ? "amber" : "muted"}>
                    {c.situacao}
                  </Etiqueta>
                </button>
              ))}
          </article>

          <article className="cp-card cp-paid-insight">
            <div className="cp-pm-top">
              <div className="cp-pm-avatar" aria-hidden>✦</div>
              <span><small>COMO ISTO FUNCIONA</small><h3>Nada sobe sem você</h3></span>
            </div>
            <p>
              Toda campanha nasce pausada e só vai ao ar com o teto que você aprovou.
              Se quiser mudar público, verba ou objetivo, fale com o Project Manager —
              ele leva à equipe e volta com o que muda, antes de qualquer alteração.
            </p>
            <button onClick={aoAbrirChat} style={{ touchAction: "manipulation" }}>
              Falar com o PM →
            </button>
          </article>
        </div>
      )}
    </>
  );
}

export function AbaEntregas({
  entregas, simbolo, envio,
}: {
  entregas: EntregaView[];
  simbolo: string;
  /** O envio de material que já existia no portal — não sumiu, mudou de aba. */
  envio: ReactNode;
}) {
  // O índice por projeto sai das entregas que ELE já pode ver — não é uma
  // árvore de pastas inventada.
  const porProjeto = Object.entries(
    entregas.reduce<Record<string, number>>((mapa, e) => {
      const chave = e.projeto ?? "Sem projeto";
      mapa[chave] = (mapa[chave] ?? 0) + 1;
      return mapa;
    }, {}),
  );

  return (
    <>
      <CapaDaAba
        simbolo={simbolo}
        sobretitulo={entregas.length === 1 ? "1 ENTREGA" : `${entregas.length} ENTREGAS`}
        titulo="Entregas"
        descricao="Tudo o que já foi entregue para você, na versão certa — e o lugar de mandar material para a equipe."
      />

      <div className="cp-two-cols cp-delivery-layout" style={{ marginTop: 13 }}>
        <article className="cp-card cp-delivery-list">
          <TituloDeSecao sobretitulo="MAIS RECENTES" titulo="Suas entregas" />
          {entregas.length === 0 ? (
            <div style={{ marginTop: 15 }}>
              <Vazio
                icone="▦"
                titulo="Nenhuma entrega disponível ainda"
                texto="Assim que a primeira peça for concluída e apresentada a você, ela aparece aqui — com a versão e a data."
              />
            </div>
          ) : (
            entregas.map((e) => (
              <button key={e.id} style={{ touchAction: "manipulation" }}>
                <Icone>▦</Icone>
                <span>
                  <small>{e.projeto ?? e.tipo}</small>
                  <b>{e.nome}</b>
                  <em>v{e.versao}{dataCurta(e.atualizadaEm) ? ` · ${dataCurta(e.atualizadaEm)}` : ""}</em>
                </span>
                <Etiqueta tom={e.situacao === "Aprovado por você" ? "green" : e.situacao === "Esperando você" ? "amber" : "cyan"}>
                  {e.situacao}
                </Etiqueta>
              </button>
            ))
          )}
        </article>

        {/* A coluna estreita da referência é um índice, não um formulário. O
            envio de material é largo por natureza (seis caixas de tipo + área de
            arrastar) e, espremido em 0,65fr, cada palavra virava uma coluna de
            uma letra. Aqui fica o índice; o envio vai inteiro, embaixo. */}
        <aside className="cp-card cp-folders">
          <TituloDeSecao sobretitulo="ORGANIZAÇÃO" titulo="Por projeto" />
          {porProjeto.length === 0 ? (
            <p style={{ marginTop: 15, color: "var(--cp-muted)" }}>
              Quando houver entrega, ela aparece aqui agrupada pelo projeto a que pertence.
            </p>
          ) : (
            porProjeto.map(([projeto, quantas]) => (
              <button key={projeto} style={{ touchAction: "manipulation" }}>
                <Icone>▦</Icone>
                <span><b>{projeto}</b><small>{quantas === 1 ? "1 entrega" : `${quantas} entregas`}</small></span>
                <strong aria-hidden>→</strong>
              </button>
            ))
          )}
        </aside>
      </div>

      <article className="cp-card" style={{ marginTop: 13 }}>
        <TituloDeSecao sobretitulo="MANDAR PARA A EQUIPE" titulo="Enviar material" />
        <div style={{ marginTop: 15 }}>{envio}</div>
      </article>
    </>
  );
}

export function AbaBrandHub({
  brandHub, marca, simbolo, aoResponder, aoAbrirChat,
}: {
  brandHub: BrandHubView;
  marca: string;
  simbolo: string;
  aoResponder: () => void;
  aoAbrirChat: () => void;
}) {
  const comecou = brandHub.respondidas > 0;
  return (
    <>
      <section className="cp-brand-hero">
        <div className="cp-brand-lockup">
          {/* Mesma regra do cabeçalho: símbolo, nome da marca ao lado, e o que
              é ESTA tela abaixo. Nunca "Brand Hub da Foocci". */}
          <div className="cp-brand-mark large" aria-hidden>{simbolo}</div>
          <div>
            <Etiqueta>{marca.toLocaleUpperCase("pt-BR")}</Etiqueta>
            <h2>Brand Hub</h2>
            <p>
              Tudo o que define quem a sua marca é, como ela fala e como ela aparece.
              Quanto mais completo, mais parecido com você fica o que a equipe produz.
            </p>
            <div>
              <button className="primary" onClick={aoResponder} style={{ touchAction: "manipulation" }}>
                {comecou ? "Continuar a entrevista de marca" : "Começar a entrevista de marca"}
              </button>
              <button onClick={aoAbrirChat} style={{ touchAction: "manipulation" }}>Tirar uma dúvida</button>
            </div>
          </div>
        </div>
        {/* A "saúde da marca" da demonstração era uma nota 91/100 sem origem. O
            que existe de verdade e é auditável é QUANTO da marca está
            documentado — então é isso que o anel mostra. */}
        <div className="cp-brand-health">
          <div className="cp-score-ring brand" style={{ background: `conic-gradient(var(--cp-cyan) ${Math.round(brandHub.percentual * 3.6)}deg,#2e4053 0)` }}>
            <span><b>{brandHub.percentual}</b><small>%</small></span>
          </div>
          <span>
            <small>MARCA DOCUMENTADA</small>
            <b>{brandHub.respondidas} de {brandHub.total} definições</b>
            {/* `perguntas` é a RODADA (a rota entrega no máximo cinco por vez);
                o que falta é a conta das definições. Chamar a rodada de "o que
                falta" faria a barra andar e o número não mudar. */}
            <em>
              {brandHub.total - brandHub.respondidas > 0
                ? `Faltam ${brandHub.total - brandHub.respondidas} definições`
                : "Nada pendente com você"}
            </em>
          </span>
        </div>
        <div className="cp-brand-pattern"><i /><i /><i /></div>
      </section>

      <div className="cp-brand-progress">
        <span><small>CONHECIMENTO DA MARCA</small><b>{brandHub.percentual}% completo</b></span>
        <i><b style={{ width: `${brandHub.percentual}%` }} /></i>
        <p>
          {brandHub.perguntas.length > 0
            ? `${brandHub.perguntas.length === 1 ? "1 pergunta" : `${brandHub.perguntas.length} perguntas`} para responder agora — leva poucos minutos.`
            : "Todas as definições registradas. Se algo mudar no seu negócio, é só avisar."}
        </p>
        {brandHub.perguntas.length > 0 && (
          <button onClick={aoResponder} style={{ touchAction: "manipulation" }}>Responder agora →</button>
        )}
      </div>

      <div className="cp-brand-grid">
        <article className="cp-card cp-brand-map">
          <TituloDeSecao sobretitulo="DEFINIÇÕES DA MARCA" titulo="O que já está definido" />
          {brandHub.definicoes.length === 0 ? (
            <div style={{ marginTop: 15 }}>
              <Vazio
                icone="✦"
                titulo="A entrevista de marca ainda não começou"
                texto="São perguntas curtas sobre o seu negócio. Você responde quando puder, uma por vez — e pode dizer “não sei” em qualquer uma."
                acao={{ rotulo: "Começar agora", aoClicar: aoResponder }}
              />
            </div>
          ) : (
            brandHub.definicoes.map((d) => (
              <button key={d.rotulo} onClick={aoResponder} style={{ touchAction: "manipulation" }}>
                <span><b>{d.rotulo}</b><small>{d.definido ? "Definido por você" : "Ainda em aberto"}</small></span>
                <i><b style={{ width: d.definido ? "100%" : "0%" }} /></i>
                <strong>{d.definido ? "100%" : "—"}</strong>
              </button>
            ))
          )}
          {brandHub.perguntas[0] && (
            <div>
              <Icone>✦</Icone>
              <span>
                <b>Próxima pergunta</b>
                <small>{brandHub.perguntas[0].pergunta}</small>
              </span>
              <button onClick={aoResponder} style={{ touchAction: "manipulation" }}>Responder →</button>
            </div>
          )}
        </article>

        <article className="cp-card">
          <TituloDeSecao sobretitulo="POR QUE ISTO IMPORTA" titulo="A marca é sua, não nossa" />
          <p style={{ marginTop: 15 }}>
            Cada resposta vira regra para tudo o que a equipe produz — texto, peça,
            anúncio. Campo em aberto não vira suposição: significa que ali ainda não
            existe régua, e a equipe pergunta antes de decidir por você.
          </p>
          <p style={{ marginTop: 11 }}>
            “Não sei” é resposta válida e não grava nada. Melhor um campo em aberto
            que uma resposta no chute virando regra para sempre.
          </p>
        </article>
      </div>
    </>
  );
}

export function AbaMinhaConta({
  conta, marca, simbolo, segmento, aoAbrirChat, aoIrPara,
}: {
  conta: ContaView;
  marca: string;
  simbolo: string;
  segmento: string | null;
  aoAbrirChat: () => void;
  aoIrPara: (aba: string) => void;
}) {
  const naoInformado = <span style={{ color: "#9aa7ac", fontWeight: 400 }}>Não informado</span>;
  return (
    <>
      <CapaDaAba
        simbolo={simbolo}
        sobretitulo="CONTA E RELACIONAMENTO"
        titulo="Minha conta"
        descricao="Os dados do seu negócio, o que você contratou, como você entra aqui e como falar com a equipe."
      >
        <button className="primary" onClick={aoAbrirChat} style={{ touchAction: "manipulation" }}>
          Falar com o Project Manager
        </button>
      </CapaDaAba>

      <div className="cp-account-grid" style={{ marginTop: 13 }}>
        <article className="cp-card cp-profile-card">
          <TituloDeSecao sobretitulo="PERFIL DA EMPRESA" titulo="Seus dados" />
          <div className="cp-company">
            <div className="cp-brand-mark" aria-hidden>{simbolo}</div>
            <span>
              <h3>{marca}</h3>
              <p>{segmento ?? "Segmento não informado"}</p>
              <Etiqueta tom="green">CLIENTE ATIVO</Etiqueta>
            </span>
          </div>
          {/* Campo sem dado NUNCA some — bloco escondido é a agência sabendo
              que falta um dado e o cliente não. */}
          <dl>
            <div><dt>E-mail</dt><dd>{conta.email ?? naoInformado}</dd></div>
            <div><dt>Telefone</dt><dd>{conta.telefone ?? naoInformado}</dd></div>
            <div><dt>Site</dt><dd>{conta.site ?? naoInformado}</dd></div>
            {/* Aqui o ANO importa e o dia não: "14/08" não diz se é cliente há um
                mês ou há dois anos. */}
            <div><dt>Cliente desde</dt><dd>{mesEAno(conta.clienteDesde) ?? naoInformado}</dd></div>
          </dl>
          <p style={{ marginTop: 15, color: "var(--cp-muted)" }}>
            Algum dado está errado ou faltando? Diga na conversa com seu Project
            Manager — a equipe corrige e o novo dado passa a valer para todo o trabalho.
          </p>
        </article>

        <article className="cp-card cp-contact-card">
          <TituloDeSecao sobretitulo="SEU ATENDIMENTO" titulo="Project Manager" />
          <div className="cp-pm-top">
            <div className="cp-pm-avatar" aria-hidden>✦</div>
            <span>
              <small>PONTO ÚNICO DE CONTATO</small>
              <h3>Seu Project Manager</h3>
            </span>
          </div>
          <p>
            Ele recebe suas solicitações, organiza o contexto e coordena as áreas
            responsáveis. Você nunca precisa falar com cada área separadamente.
          </p>
          <button onClick={aoAbrirChat} style={{ touchAction: "manipulation" }}>Abrir conversa →</button>
        </article>

        <article className="cp-card">
          <TituloDeSecao sobretitulo="SEU PLANO" titulo="O que você contratou" />
          {conta.servicos.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 15 }}>
              {conta.servicos.map((s) => <Etiqueta key={s} tom="muted">{s.toLocaleUpperCase("pt-BR")}</Etiqueta>)}
            </div>
          ) : (
            <div style={{ marginTop: 15 }}>
              <Vazio
                icone="▤"
                titulo="Nenhum serviço registrado neste cadastro"
                texto="Se você já contratou algo, fale com seu Project Manager — o plano precisa aparecer aqui."
                acao={{ rotulo: "Falar com o PM", aoClicar: aoAbrirChat }}
              />
            </div>
          )}
        </article>

        <article className="cp-card cp-preferences">
          <TituloDeSecao sobretitulo="ACESSO E SEGURANÇA" titulo="Como você entra aqui" />
          <button onClick={aoAbrirChat} style={{ touchAction: "manipulation" }}>
            <Icone>⌾</Icone>
            <span>
              <b>Link único, sem senha</b>
              <small>O link some da barra de endereço depois do primeiro acesso. Perdeu? Peça um novo ao seu PM.</small>
            </span>
            <strong>Pedir novo →</strong>
          </button>
          <button onClick={() => aoIrPara("integracoes")} style={{ touchAction: "manipulation" }}>
            <Icone>◉</Icone>
            <span>
              <b>Contas conectadas</b>
              <small>Só você conecta, reconecta ou remove. A equipe acompanha apenas o status.</small>
            </span>
            <strong>Abrir →</strong>
          </button>
        </article>
      </div>
    </>
  );
}
