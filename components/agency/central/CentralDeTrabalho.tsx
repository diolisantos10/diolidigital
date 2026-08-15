"use client";

// ─── A CENTRAL DE TRABALHO ───────────────────────────────────────────────────
//
// O desenho é o do PR #136, aprovado pelo CEO em 14/08/2026. Ele NÃO se reabre:
// hierarquia, densidade, componentes e tamanho de letra são contrato. O que
// mudou do protótipo para cá foi só o que precisava mudar para a tela virar
// produto:
//
//   • os dados demonstrativos saíram inteiros. Cliente, saúde, prioridade,
//     entrega e handoff vêm do banco, por `/api/agency/central`;
//   • a casca (sidebar, logo, usuário) saiu — quem desenha é o `AgencyShell`;
//   • entraram os sete estados que um protótipo não precisa ter: carregando,
//     vazio, erro, sem permissão, somente leitura, sucesso e dado parcial;
//   • o seletor de experiência virou ferramenta de demonstração restrita à
//     direção, e ele NÃO troca permissão de ninguém — só a leitura da tela.
//
// ── A linha que governa cada número desta tela ─────────────────────────────
//
//   Nunca escrever 0 quando a resposta é "ainda não dá para medir".
//
// Por isso todo valor é `Medida`, e `<Valor>` trata os três casos. Um painel
// que confunde "não medido" com "zero" ensina o dono a não confiar nele.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Icone } from "./Icone";
import type {
  CartaoDeCliente,
  LeituraDaCentral,
  Medida,
  Prioridade,
} from "./dados";
import { AGENCY_ROLE_OPTIONS, PERFIL_DO_PAPEL, type AgencyRole } from "@/lib/agency/roles";
import {
  eDirecao,
  departamentosQueEscreve,
  type PerfilOrganizacional,
} from "@/lib/agency/organizacao/autoridade";
import { getDepartamento } from "@/lib/agency/organizacao/departamentos";

interface Resposta {
  leitura: LeituraDaCentral;
  perfil: PerfilOrganizacional;
  usuario: { nome: string; papel: string };
}

type Estado =
  | { fase: "carregando" }
  | { fase: "erro"; mensagem: string }
  | { fase: "pronto"; dados: Resposta };

// ─── Peças pequenas ──────────────────────────────────────────────────────────

/**
 * Um número que pode não existir.
 *
 * Três casos, três aparências. `naoMedido` sai em itálico apagado com o motivo
 * no `title` — nunca como "0", que seria a tela afirmando algo que ela não sabe.
 */
function Valor({ medida, sufixo = "" }: { medida: Medida; sufixo?: string }) {
  if (medida.estado === "naoMedido") {
    return <span className="ct-sem-medida" title={medida.porque}>—</span>;
  }
  if (medida.estado === "zeroMedido") return <>0{sufixo}</>;
  return <>{medida.valor}{sufixo}</>;
}

function numeroOuNulo(medida: Medida): number | null {
  if (medida.estado === "medido") return medida.valor;
  if (medida.estado === "zeroMedido") return 0;
  return null;
}

function saudacao(agora: Date): string {
  const h = agora.getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function tempoRelativo(iso: string, agora: number): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const min = Math.floor((agora - t) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}

// ─── A tela ──────────────────────────────────────────────────────────────────

export function CentralDeTrabalho({
  nomeDoUsuario,
  papelDaSessao,
  perfilDaSessao,
}: {
  nomeDoUsuario: string;
  papelDaSessao: AgencyRole;
  perfilDaSessao: PerfilOrganizacional;
}) {
  const [estado, setEstado] = useState<Estado>({ fase: "carregando" });
  const [tentativa, setTentativa] = useState(0);
  const [busca, setBusca] = useState("");
  const [clienteAberto, setClienteAberto] = useState<CartaoDeCliente | null>(null);
  const [chatAberto, setChatAberto] = useState(false);
  const [mapaAberto, setMapaAberto] = useState(false);
  // Relógio só depois de montar: hora do servidor e do navegador divergem, e a
  // saudação renderizada nos dois lados precisa bater na primeira pintura.
  const [agora, setAgora] = useState<number | null>(null);

  // ⚠️ O papel de DEMONSTRAÇÃO. Ele muda o que esta tela MOSTRA e nada mais.
  // A permissão real continua sendo a da sessão, conferida no servidor a cada
  // requisição (`/api/agency/central`) e a cada navegação (`proxy.ts`).
  // Trocar aqui não abre uma porta — abre uma prévia.
  const podeDemonstrar = eDirecao(perfilDaSessao.autoridade);
  const [papelDemonstrado, setPapelDemonstrado] = useState<AgencyRole>(papelDaSessao);
  const perfilExibido = podeDemonstrar ? PERFIL_DO_PAPEL[papelDemonstrado] : perfilDaSessao;
  const demonstrando = podeDemonstrar && papelDemonstrado !== papelDaSessao;

  useEffect(() => setAgora(Date.now()), []);

  useEffect(() => {
    let vivo = true;
    setEstado({ fase: "carregando" });
    fetch("/api/agency/central")
      .then(async (r) => {
        if (!r.ok) {
          const corpo = await r.json().catch(() => ({}));
          throw new Error(corpo.error || `A leitura respondeu ${r.status}.`);
        }
        return r.json() as Promise<Resposta>;
      })
      .then((dados) => { if (vivo) setEstado({ fase: "pronto", dados }); })
      .catch((e: Error) => { if (vivo) setEstado({ fase: "erro", mensagem: e.message }); });
    return () => { vivo = false; };
  }, [tentativa]);

  const leitura = estado.fase === "pronto" ? estado.dados.leitura : null;

  const clientesFiltrados = useMemo(() => {
    if (!leitura) return [];
    const t = busca.trim().toLowerCase();
    if (!t) return leitura.clientes;
    return leitura.clientes.filter(
      (c) => c.nome.toLowerCase().includes(t) || c.segmento.toLowerCase().includes(t),
    );
  }, [leitura, busca]);

  const minhasAreas = departamentosQueEscreve(perfilExibido);
  const rotuloDoPapel =
    AGENCY_ROLE_OPTIONS.find((r) => r.id === (podeDemonstrar ? papelDemonstrado : papelDaSessao))?.label ??
    papelDaSessao;

  const proxima: Prioridade | null = leitura?.prioridades[0] ?? null;
  const primeiroNome = nomeDoUsuario.trim().split(/\s+/)[0] || nomeDoUsuario;

  return (
    <div className="central-de-trabalho">
      {/* ── Barra de ação ─────────────────────────────────────────────────── */}
      <header className="topbar">
        <div className="search-box">
          <Icone nome="search" tamanho={17} />
          <input
            aria-label="Buscar cliente"
            placeholder="Buscar cliente ou segmento..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <div className="top-actions">
          <span className="client-filter">
            <span className="filter-dot" />
            Todos os clientes
            <span className="count">{leitura ? leitura.totalDeClientes : "—"}</span>
          </span>
          <button className="pm-chat" onClick={() => setChatAberto(true)}>
            <Icone nome="message" tamanho={16} /> Falar com o PM
          </button>
          <Link className="icon-button" href="/agency/approvals" aria-label="Aprovações pendentes">
            <Icone nome="bell" tamanho={18} />
            {numeroOuNulo(leitura?.metricas.find((m) => m.chave === "revisao")?.valor ?? { estado: "zeroMedido" }) ? <i /> : null}
          </Link>
        </div>
      </header>

      <main className="main-content">
        <div className="breadcrumb">
          <span>Central de Trabalho</span><b>/</b><strong>Início</strong>
        </div>

        <section className="page-heading">
          <div>
            <div className="eyebrow"><span /> OPERAÇÃO CONECTADA</div>
            <h1>{agora ? `${saudacao(new Date(agora))}, ${primeiroNome}.` : `Olá, ${primeiroNome}.`}</h1>
            <p>Seu trabalho, os clientes e os departamentos em uma única leitura.</p>
          </div>

          {/* O seletor só existe para quem já enxerga tudo. Para os demais ele
              nem é renderizado — não é escondido por CSS, é ausente. */}
          {podeDemonstrar ? (
            <div className="role-control">
              <label htmlFor="papel-demo">Visualizar experiência como (demonstração)</label>
              <select
                id="papel-demo"
                value={papelDemonstrado}
                onChange={(e) => setPapelDemonstrado(e.target.value as AgencyRole)}
              >
                {AGENCY_ROLE_OPTIONS.map((r) => (
                  <option key={r.id} value={r.id}>{r.label}</option>
                ))}
              </select>
            </div>
          ) : null}
        </section>

        {demonstrando ? (
          <div className="ct-erro" style={{ borderColor: "#CDEBE9", background: "#F0FCFB", color: "#147F84", marginBottom: 14 }}>
            <Icone nome="eye" tamanho={18} />
            <div>
              <strong>Prévia da experiência de {rotuloDoPapel}</strong>
              <span>
                Só a leitura desta tela mudou. Sua permissão continua a da sua conta — o
                servidor confere o papel real a cada página e a cada chamada.
              </span>
            </div>
          </div>
        ) : null}

        {/* ── Estado: erro recuperável ──────────────────────────────────── */}
        {estado.fase === "erro" ? (
          <div className="ct-erro" role="alert">
            <Icone nome="alert" tamanho={18} />
            <div>
              <strong>Não foi possível carregar a leitura da operação</strong>
              <span>{estado.mensagem}</span>
              <button onClick={() => setTentativa((n) => n + 1)}>Tentar de novo</button>
            </div>
          </div>
        ) : null}

        {/* ── Estado: carregando ────────────────────────────────────────── */}
        {estado.fase === "carregando" ? <Esqueleto /> : null}

        {leitura ? (
          <>
            {/* ── Herói: a leitura do dia ──────────────────────────────── */}
            <section className="hero-panel">
              <div className="orbit orbit-one" /><div className="orbit orbit-two" />
              <div className="orbit-dot cyan" /><div className="orbit-dot blue" />
              <div className="hero-copy">
                <span className="hero-tag"><Icone nome="spark" tamanho={14} /> LEITURA DO DIA</span>
                {leitura.prioridades.length > 0 ? (
                  <h2>
                    Você tem <em>{leitura.prioridades.length} {leitura.prioridades.length === 1 ? "prioridade" : "prioridades"}</em>
                    <br />na fila de hoje.
                  </h2>
                ) : (
                  <h2>Nenhuma prioridade<br /><em>aberta agora.</em></h2>
                )}
                <p>
                  {leitura.prioridades.length > 0
                    ? "A fila é montada pelo estado real dos projetos: proposta parada, entrega em revisão e dependência travada sobem primeiro."
                    : "Nada travado, nada vencido e nada esperando aval. Quando algo entrar na fila, aparece aqui antes de qualquer outra coisa."}
                </p>
                <Link className="primary-action" href="/agency/tasks">
                  Ver minhas prioridades <Icone nome="arrow" tamanho={16} />
                </Link>
              </div>

              <div className="hero-focus">
                <div className="focus-label"><span>PRÓXIMA AÇÃO</span><b>01</b></div>
                <strong>{proxima ? proxima.titulo : "Nada aguardando você"}</strong>
                <p>
                  <Icone nome="clock" tamanho={14} />{" "}
                  {proxima ? `${proxima.clienteNome} · prioridade ${proxima.urgencia}` : "fila limpa"}
                </p>
                <div className="focus-progress">
                  <i style={{ width: `${porcentagemDaFila(leitura.prioridades)}%` }} />
                </div>
              </div>
            </section>

            {/* ── Métricas ─────────────────────────────────────────────── */}
            <section className="metrics-grid">
              {leitura.metricas.map((m) => (
                <article key={m.chave}>
                  <div className={`metric-icon ${m.tom}-bg`}>
                    <Icone nome={iconeDaMetrica(m.chave)} tamanho={18} />
                  </div>
                  <div>
                    <span>{m.rotulo}</span>
                    <strong><Valor medida={m.valor} /></strong>
                    {m.nota ? <small className={m.notaPositiva ? "positive" : ""}>{m.nota}</small> : null}
                  </div>
                </article>
              ))}
            </section>

            {/* ── Clientes: a leitura global ───────────────────────────── */}
            <section className="section-block client-section">
              <div className="section-header">
                <div>
                  <div className="section-kicker">VISÃO MULTIDISCIPLINAR</div>
                  <h2>Clientes da agência</h2>
                  <p>Todos enxergam o panorama completo. A edição respeita a área de cada agente.</p>
                </div>
                <div className="read-access">
                  <Icone nome="eye" tamanho={16} />
                  <span>
                    <strong>Leitura global</strong> para todos os departamentos
                  </span>
                </div>
              </div>

              {leitura.clientes.length === 0 ? (
                <div className="ct-vazio">
                  <strong>Nenhum cliente cadastrado ainda</strong>
                  <span>
                    Quando o primeiro cliente entrar, o panorama dele aparece aqui — com as
                    áreas que já têm trabalho e as que ainda não começaram.
                  </span>
                  <Link href="/agency/clients">Abrir cadastro de clientes</Link>
                </div>
              ) : clientesFiltrados.length === 0 ? (
                <div className="ct-vazio">
                  <strong>Nenhum cliente com “{busca}”</strong>
                  <span>A busca olha nome e segmento. Limpe o campo para ver os {leitura.totalDeClientes}.</span>
                </div>
              ) : (
                <div className="client-grid">
                  {clientesFiltrados.map((c) => (
                    <button className="client-card" key={c.id} onClick={() => setClienteAberto(c)}>
                      <div className="client-top">
                        <div className="client-logo" style={{ background: c.cor, color: c.tinta }}>{c.iniciais}</div>
                        <div className="client-name">
                          <strong>{c.nome}</strong><span>{c.segmento}</span>
                        </div>
                        <span className={`status-pill ${c.statusTom}`}>{c.statusRotulo}</span>
                      </div>

                      <div className="client-headline">
                        <span>MOMENTO DA MARCA</span>
                        <strong>{c.manchete}</strong>
                      </div>

                      <div className="health-line">
                        <div>
                          <span>Saúde da operação</span>
                          <b><Valor medida={c.saude} sufixo="%" /></b>
                        </div>
                        <div className="bar"><i style={{ width: `${numeroOuNulo(c.saude) ?? 0}%` }} /></div>
                      </div>

                      <div className="department-dots">
                        {c.areas.slice(0, 6).map((a) => (
                          <i key={a.id} className={classeDoPonto(a.progresso)} title={`${a.nome}: ${a.situacao}`} />
                        ))}
                        <span>
                          {c.areasComTrabalho > 0
                            ? `${c.areasComTrabalho} ${c.areasComTrabalho === 1 ? "área" : "áreas"} com trabalho`
                            : "nenhuma área iniciada"}
                        </span>
                      </div>

                      <div className="client-next">
                        <div>
                          <span>PRÓXIMO MARCO</span>
                          <strong>{c.proximoMarco ?? "sem prazo em aberto"}</strong>
                        </div>
                        <div className="round-arrow"><Icone nome="arrow" tamanho={15} /></div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* ── Fluxo + mapa ─────────────────────────────────────────── */}
            <section className="lower-grid">
              <article className="work-card">
                <div className="card-heading">
                  <div><span>MEU FLUXO</span><h3>O que está em movimento</h3></div>
                  <Link href="/agency/tasks"><button>Ver tudo <Icone nome="arrow" tamanho={14} /></button></Link>
                </div>
                <div className="task-list">
                  {leitura.prioridades.length === 0 ? (
                    <div className="ct-vazio" style={{ margin: 16, border: "none", background: "transparent", padding: "22px 10px" }}>
                      <strong>Nada em movimento agora</strong>
                      <span>Sua fila está limpa. Itens entram sozinhos quando um projeto trava, uma entrega volta ou um prazo aperta.</span>
                    </div>
                  ) : (
                    leitura.prioridades.map((p) => (
                      <Link className="task-row" key={p.id} href={p.rota}>
                        <span className={`priority ${p.urgencia === "alta" ? "high" : p.urgencia === "media" ? "medium" : "normal"}`} />
                        <div className="task-copy">
                          <strong>{p.titulo}</strong>
                          <small>{p.contexto} · {p.motivo}</small>
                        </div>
                        <span className={`task-status ${p.situacao === "andamento" ? "doing" : p.situacao === "revisao" ? "review" : "waiting"}`}>
                          {p.situacao === "andamento" ? "Em andamento" : p.situacao === "revisao" ? "Revisão" : "Aguardando"}
                        </span>
                      </Link>
                    ))
                  )}
                </div>
              </article>

              <article className="map-card">
                <div className="card-heading">
                  <div><span>DEPARTAMENTALIZAÇÃO</span><h3>Uma agência, várias especialidades</h3></div>
                  <button onClick={() => setMapaAberto(true)}>Ampliar <Icone nome="arrow" tamanho={14} /></button>
                </div>
                <p className="map-intro">
                  Todos consultam o trabalho entre si. O Project Manager distribui, conecta e resolve dependências.
                </p>
                <div className="mini-org-map">
                  <div className="pm-node">
                    <span>PM</span>
                    <div><strong>Project Manager</strong><small>elo central</small></div>
                  </div>
                  <div className="connector-line" />
                  {/* A quantidade NÃO está fixada: o mapa percorre o registro
                      canônico. Departamento novo entra por configuração. */}
                  <div className="department-row">
                    {leitura.mapa.filter((m) => m.dep.temSuperficie).slice(0, 4).map(({ dep }) => (
                      <span key={dep.id}><Icone nome={dep.icone} tamanho={15} />{dep.nome}</span>
                    ))}
                  </div>
                </div>
              </article>
            </section>

            {/* ── Handoffs ─────────────────────────────────────────────── */}
            <section className="handoff-strip">
              <div className="handoff-title">
                <span className="live-dot" />
                <div>
                  <strong>Comunicação entre departamentos</strong>
                  <small>Handoffs coordenados pelo Project Manager</small>
                </div>
              </div>
              {leitura.handoffs.length === 0 ? (
                <div className="handoff-event">
                  <p>
                    <strong>Sem passagem de bastão registrada.</strong> Assim que uma entrega
                    mudar de mãos, o movimento aparece aqui com hora e responsável.
                  </p>
                </div>
              ) : (
                leitura.handoffs.map((h) => (
                  <div className="handoff-event" key={h.id}>
                    <div className="handoff-avatars">
                      <span>{h.de.charAt(0)}</span><span>{h.para.charAt(0)}</span>
                    </div>
                    <p><strong>{h.de} → {h.para}</strong> {h.texto}</p>
                    <time>{agora ? tempoRelativo(h.quandoIso, agora) : ""}</time>
                  </div>
                ))
              )}
            </section>
          </>
        ) : null}
      </main>

      {/* ── Gaveta do cliente ───────────────────────────────────────────── */}
      {clienteAberto ? (
        <div className="drawer-backdrop" onMouseDown={() => setClienteAberto(null)}>
          <aside className="client-drawer" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label={`Panorama de ${clienteAberto.nome}`}>
            <button className="close-button" onClick={() => setClienteAberto(null)} aria-label="Fechar">
              <Icone nome="close" tamanho={20} />
            </button>

            <div className="drawer-brand">
              <div className="client-logo large" style={{ background: clienteAberto.cor, color: clienteAberto.tinta }}>
                {clienteAberto.iniciais}
              </div>
              <div>
                <span>CLIENTE</span>
                <h2>{clienteAberto.nome}</h2>
                <p>{clienteAberto.segmento}</p>
              </div>
            </div>

            <div className="access-banner">
              <Icone nome="eye" tamanho={18} />
              <div>
                <strong>Visão geral liberada</strong>
                <span>
                  Você consulta todas as áreas deste cliente.
                  {minhasAreas.length > 0
                    ? ` Alterações ficam com ${minhasAreas.map((d) => getDepartamento(d).nome).join(", ")}.`
                    : " Nesta conta o acesso é de consulta."}
                </span>
              </div>
            </div>

            <div className="drawer-health">
              <div>
                <span>Saúde geral da operação</span>
                <strong><Valor medida={clienteAberto.saude} sufixo="%" /></strong>
              </div>
              <div className="bar"><i style={{ width: `${numeroOuNulo(clienteAberto.saude) ?? 0}%` }} /></div>
            </div>

            <div className="drawer-section-title">
              <span>PANORAMA POR DEPARTAMENTO</span>
            </div>

            <div className="drawer-departments">
              {clienteAberto.areas.map((a) => (
                <button key={a.id}>
                  <div className="dept-symbol" style={{ color: a.cor }}><Icone nome={a.icone} tamanho={18} /></div>
                  <div>
                    <strong>{a.nome}</strong>
                    <span>{a.situacao}</span>
                  </div>
                  {a.podeEditar ? null : <span className="ct-selo-consulta">consulta</span>}
                  <b><Valor medida={a.progresso} sufixo="%" /></b>
                  <Icone nome="chevron" tamanho={15} />
                </button>
              ))}
            </div>

            <div className="drawer-next">
              <span>PRÓXIMO MARCO</span>
              <strong>{clienteAberto.proximoMarco ?? "Nenhum prazo em aberto"}</strong>
              <Link href={`/agency/clients/${clienteAberto.id}`}>
                <button>Ver página completa do cliente <Icone nome="arrow" tamanho={15} /></button>
              </Link>
            </div>
          </aside>
        </div>
      ) : null}

      {/* ── Conversa com o PM ───────────────────────────────────────────── */}
      {chatAberto ? (
        <div className="drawer-backdrop" onMouseDown={() => setChatAberto(false)}>
          <aside className="chat-drawer" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Conversa com o Project Manager">
            <div className="chat-head">
              <div className="pm-avatar">PM</div>
              <div>
                <strong>Project Manager</strong>
                <span><i /> Operação ativa</span>
              </div>
              <button onClick={() => setChatAberto(false)} aria-label="Fechar"><Icone nome="close" tamanho={20} /></button>
            </div>

            <div className="chat-context">
              <Icone nome="briefcase" tamanho={16} />
              <span>Conversa interna · Todos os clientes</span>
            </div>

            <div className="chat-body">
              {/* ⚠️ ESTADO VAZIO HONESTO, e não uma conversa de mentira.
                  O protótipo trazia duas mensagens escritas à mão. O canal
                  interno de mensagem NÃO EXISTE no banco hoje — o que existe é
                  a conversa com o CLIENTE (`/agency/inbox`). Encher isto com
                  texto fabricado seria a tela mentindo sobre uma capacidade
                  que a casa não tem. */}
              <div className="ct-vazio">
                <strong>O canal interno ainda não está ligado</strong>
                <span>
                  As mensagens que existem hoje são as trocadas com o cliente, e elas moram
                  na Caixa de entrada. Quando o canal interno entrar, a conversa com o
                  Project Manager aparece aqui, presa à tarefa que a originou.
                </span>
                <Link href="/agency/inbox">Abrir Caixa de entrada</Link>
              </div>
            </div>

            <div className="chat-composer">
              <textarea placeholder="Canal interno indisponível — use a Caixa de entrada" disabled />
              <button aria-label="Enviar" disabled><Icone nome="send" tamanho={18} /></button>
            </div>
          </aside>
        </div>
      ) : null}

      {/* ── Mapa da agência ─────────────────────────────────────────────── */}
      {mapaAberto && leitura ? (
        <div className="modal-backdrop" onMouseDown={() => setMapaAberto(false)}>
          <section className="org-modal" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Mapa da agência">
            <button className="close-button" onClick={() => setMapaAberto(false)} aria-label="Fechar">
              <Icone nome="close" tamanho={20} />
            </button>

            <div className="org-heading">
              <span>MAPA DA AGÊNCIA</span>
              <h2>Especialidades independentes.<br /><em>Operação conectada.</em></h2>
              <p>
                Cada departamento executa a sua especialidade, consulta o contexto completo do
                cliente e se comunica por meio do Project Manager.
              </p>
            </div>

            <div className="org-flow">
              <div className="client-origin">
                <Icone nome="users" tamanho={20} />
                <div>
                  <strong>{leitura.totalDeClientes} {leitura.totalDeClientes === 1 ? "cliente" : "clientes"}</strong>
                  <span>contexto compartilhado</span>
                </div>
              </div>
              <div className="flow-arrow">↓</div>
              <div className="pm-center">
                <span>PM</span>
                <div>
                  <strong>Project Manager</strong>
                  <small>prioriza · distribui · conecta · acompanha</small>
                </div>
                <b>ELO CENTRAL</b>
              </div>
              <div className="org-line" />
              <div className="org-departments">
                {leitura.mapa.map(({ dep, clientesAtendidos, podeEditar }) => (
                  <article key={dep.id}>
                    <div style={{ color: dep.cor }}><Icone nome={dep.icone} tamanho={19} /></div>
                    <strong>{dep.nome}</strong>
                    <span>{dep.resumo}</span>
                    <small>
                      <i style={{ background: clientesAtendidos > 0 ? "#32BE8F" : "#C6CDD4" }} />
                      {clientesAtendidos > 0
                        ? `${clientesAtendidos} ${clientesAtendidos === 1 ? "cliente" : "clientes"}`
                        : "sem trabalho ainda"}
                      {podeEditar ? " · você opera" : ""}
                    </small>
                  </article>
                ))}
              </div>
            </div>

            <div className="org-rule">
              <Icone nome="eye" tamanho={18} />
              <p>
                <strong>Regra transversal:</strong> todos visualizam o panorama dos clientes;
                editar, aprovar, publicar e excluir ficam com o departamento responsável e com
                a direção.
              </p>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

// ─── Auxiliares de apresentação ──────────────────────────────────────────────

function porcentagemDaFila(prioridades: Prioridade[]): number {
  if (prioridades.length === 0) return 100;
  const altas = prioridades.filter((p) => p.urgencia === "alta").length;
  // A barra mostra quanto da fila NÃO é urgente. Fila só de urgência = barra
  // curta; fila tranquila = barra cheia. É leitura, não meta inventada.
  return Math.round(((prioridades.length - altas) / prioridades.length) * 100);
}

function iconeDaMetrica(chave: string) {
  if (chave === "tarefas") return "check" as const;
  if (chave === "entregas") return "box" as const;
  if (chave === "revisao") return "approve" as const;
  return "users" as const;
}

function classeDoPonto(m: Medida): string {
  const v = numeroOuNulo(m);
  if (v === null) return "";           // não medido: ponto apagado, sem cor de status
  if (v < 60) return "low";
  if (v < 80) return "mid";
  return "high";
}

// ─── Estado: carregando ──────────────────────────────────────────────────────
//
// Esqueleto com a FORMA da tela, e não um "Carregando…" centralizado: a pessoa
// já entende o que vem, e a página não pula quando o dado chega.

function Esqueleto() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Carregando a leitura da operação…</span>
      <div className="ct-esqueleto" style={{ height: 220, borderRadius: 16 }} />
      <div className="metrics-grid" style={{ border: "none", background: "transparent", gap: 11 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="ct-esqueleto" style={{ height: 88 }} />
        ))}
      </div>
      <div className="client-grid" style={{ marginTop: 18 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="ct-esqueleto" style={{ height: 232, borderRadius: 13 }} />
        ))}
      </div>
    </div>
  );
}
