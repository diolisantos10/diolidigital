"use client";

// /agency/leads — QUEM ME PROCUROU E AINDA NÃO TEVE RESPOSTA.
//
// A tela nasce de um achado de 08/08/2026: três interessados entraram pelo
// briefing público — Sushi Cazza (51 dias), Camila Pereira (29) e Beatriz
// Gimenes (28) — com a conversa inteira gravada e NENHUM canal de contato. Não
// havia alarme e não havia tela: a caixa de entrada de `/agency/requests` lia o
// store do navegador, então quem abrisse noutro computador via zero.
//
// A UMA COISA que se vem fazer aqui: **decidir se aborda.** Por isso cada cartão
// responde, nesta ordem, as três perguntas que precedem a decisão:
//   1. dá para falar com ele?  (e, quando não dá, isso vem PRIMEIRO e em vermelho)
//   2. o que ele quer, nas palavras dele?
//   3. quanto vale, pela tabela da casa — e o que ainda não dá para saber.
//
// A tela NÃO aborda ninguém, não envia mensagem e não escreve nada. O dossiê é
// determinístico (`lib/agency/comercial/dossie-do-lead.ts`): nenhuma linha aqui
// é escrita por IA sobre um cliente que ninguém conferiu.

import { useCallback, useEffect, useState } from "react";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import EmptyState from "@/components/agency/ui/EmptyState";
import type { DossieDoLead } from "@/lib/agency/comercial/dossie-do-lead";
import { NEGOCIO_NAO_INFORMADO } from "@/lib/agency/comercial/negocio-do-lead";

type Resposta =
  | { estado: "carregando" }
  | { estado: "ok"; leads: DossieDoLead[]; semContato: number }
  /** "não consegui olhar" tem tela própria. Lista vazia por falha de leitura é
   *  exatamente como esta fila ficou invisível por sete semanas. */
  | { estado: "nao_medido"; motivo: string };

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export default function LeadsPage() {
  const [r, setR] = useState<Resposta>({ estado: "carregando" });
  const [aberto, setAberto] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setR({ estado: "carregando" });
    try {
      const resp = await fetch("/api/agency/leads");
      const body = await resp.json();
      if (!resp.ok || body?.medido !== true) {
        setR({ estado: "nao_medido", motivo: body?.motivo ?? "a lista de interessados não pôde ser lida agora" });
        return;
      }
      setR({ estado: "ok", leads: body.leads ?? [], semContato: body.semContato ?? 0 });
    } catch {
      setR({ estado: "nao_medido", motivo: "não consegui falar com o servidor — esta lista não é zero, é desconhecida" });
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  return (
    <div className="max-w-[900px]">
      <AgencyHeader
        eyebrow="Comercial"
        title="Quem procurou a Dioli"
        subtitle="Briefings que chegaram pela porta pública e ainda não viraram cliente. O mais antigo em cima."
        meta={
          r.estado === "ok" && r.semContato > 0 ? (
            // Mesmo `Selo` dos cartões: duas cópias da mesma pílula no mesmo
            // arquivo divergem na primeira vez que alguém ajustar uma delas.
            <Selo tom="danger">{r.semContato} sem forma de contato</Selo>
          ) : undefined
        }
      />

      {r.estado === "carregando" && (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-[112px] rounded-[12px] border border-[var(--border)] bg-[var(--bg)] animate-pulse" />
          ))}
        </div>
      )}

      {r.estado === "nao_medido" && (
        <div className="rounded-[12px] border border-[var(--danger)] bg-[var(--danger-bg)] px-5 py-4">
          <p className="text-[13px] font-semibold text-[var(--danger)]">Não consegui ler a fila</p>
          <p className="text-[13px] text-[var(--text-secondary)] mt-1 leading-relaxed">{r.motivo}</p>
          <button
            onClick={() => void carregar()}
            className="mt-3 h-9 px-4 rounded-[8px] border border-[var(--border)] bg-white text-[13px] font-medium text-[var(--text-primary)]"
          >
            Tentar de novo
          </button>
        </div>
      )}

      {r.estado === "ok" && r.leads.length === 0 && (
        <EmptyState
          title="Ninguém esperando"
          description="Todo briefing que chegou já virou proposta ou cliente. Quando alguém preencher o briefing público, ele aparece aqui."
        />
      )}

      {r.estado === "ok" && r.leads.length > 0 && (
        <div className="space-y-3">
          {r.leads.map((l) => (
            <Cartao
              key={l.id}
              lead={l}
              aberto={aberto === l.id}
              onToggle={() => setAberto(aberto === l.id ? null : l.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Cartao({ lead, aberto, onToggle }: { lead: DossieDoLead; aberto: boolean; onToggle: () => void }) {
  const semContato = !lead.contato.temComoFalar;

  return (
    <div className={`rounded-[12px] border bg-white overflow-hidden ${semContato ? "border-[var(--danger)]" : "border-[var(--border)]"}`}>
      <button
        onClick={onToggle}
        style={{ touchAction: "manipulation" }}
        className="w-full text-left px-4 sm:px-5 py-4 hover:bg-[var(--bg)] transition-colors"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {/* Ausência declarada, nunca buraco branco: `lead.negocio` é `null`
                quando o briefing não trouxe nome do negócio — ver
                `negocio-do-lead.ts`. A forma é a MESMA que esta casa já usa em
                `MarketingIntelligence.tsx:70,152,188` para "não informado":
                `text-[13px]`, `--text-subtle`, itálico e **sem `font-semibold`**.
                O peso importa: mantendo 15px/semibold — o peso do nome real — a
                frase lê como se o negócio SE CHAMASSE "Negócio não informado",
                ou seja, ausência disfarçada de conteúdo, que é exatamente o
                defeito que este conserto existe para fechar. Achado pelo
                especialista `interface` em 16/08/2026. */}
            {lead.negocio ? (
              <p className="text-[15px] font-semibold text-[var(--text-primary)] truncate">{lead.negocio}</p>
            ) : (
              <p className="text-[13px] text-[var(--text-subtle)] italic truncate">{NEGOCIO_NAO_INFORMADO}</p>
            )}
            <p className="text-[13px] text-[var(--text-muted)] mt-0.5">
              {lead.segmento ?? "segmento não informado"} · parado há {lead.diasParado} dia{lead.diasParado === 1 ? "" : "s"}
            </p>
          </div>
          <span className="text-[12px] text-[var(--text-muted)] shrink-0 pt-1">{aberto ? "fechar" : "abrir"}</span>
        </div>

        {/* 🔴 A ORDEM DESTA FILEIRA É A REGRA DA TELA, NÃO ARRUMAÇÃO.
            O cabeçalho deste arquivo declara: "a pergunta que decide tudo vem
            primeiro". Quando o carimbo de repetição entrou (16/08), ele entrou
            ACIMA do selo de contato e quebrou justamente isso — numa coluna de
            seis cartões, a resposta de "dá para falar com ele?" deixava de
            estar sempre no mesmo lugar, porque só alguns cartões têm carimbo.
            Contato SEMPRE primeiro; a repetição vem depois, na mesma fileira.

            ESTE CONTATO JÁ ESCREVEU ANTES (16/08/2026). Pergunta do CEO: "cinco
            briefings do mesmo e-mail, o que acontece?". Acontecia que apareciam
            cinco cartões idênticos e nada dizia que eram a mesma pessoa. O
            carimbo NÃO afirma que é pedido repetido — pode ser um segundo
            projeto legítimo. Ele diz o fato e deixa a leitura para quem abre. */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {semContato ? (
            <Selo tom="danger">Sem como falar com esta pessoa</Selo>
          ) : (
            <Selo tom="success">
              {lead.contato.canais.map((c) => (c.tipo === "whatsapp" ? "WhatsApp" : "E-mail")).join(" · ")}
            </Selo>
          )}

          {/* 🔴 TOM DE INFORMAÇÃO, NÃO DE ALERTA — e a troca é deliberada.
              Este selo nasceu em `--warning`/`--warning-bg` (âmbar). Âmbar nesta
              casa quer dizer "algo saiu do trilho", e escrever cinco vezes não
              é erro do cliente: pode ser exatamente o que a agência quer, um
              cliente insistindo em contratar. Numa coluna de cinco cartões,
              cinco pílulas âmbar liam como cinco problemas e disputavam o olho
              com o vermelho de "sem como falar", que é o único alarme legítimo
              desta tela. `--info` diz o fato sem acusar ninguém. */}
          {lead.repeticao && (
            <Selo tom="info">
              {lead.repeticao.ordem}º briefing deste mesmo contato (de {lead.repeticao.vezes})
            </Selo>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-[16px] font-semibold text-[var(--text-primary)]">
            {lead.faixa ? `${brl(lead.faixa.minimo)} – ${brl(lead.faixa.maximo)}` : "faixa a definir"}
          </span>
          <span className="text-[12px] text-[var(--text-muted)]">
            {lead.fonteDaFaixa === "escopo_declarado"
              ? "pela tabela da casa, sobre o escopo declarado"
              : lead.fonteDaFaixa === "catalogo_sem_cadencia"
              ? "banda do catálogo — volume não declarado"
              : "a tabela da casa não cobre o que foi pedido"}
          </span>
        </div>
      </button>

      {aberto && (
        <div className="border-t border-[var(--border)] px-4 sm:px-5 py-4 space-y-5">
          <Bloco titulo="Como falar">
            {semContato ? (
              <>
                <p className="text-[13px] text-[var(--danger)] font-medium leading-relaxed">
                  Não há contato gravado: {lead.contato.motivo}
                </p>
                <p className="text-[13px] text-[var(--text-secondary)] mt-1.5 leading-relaxed">
                  Nada foi deduzido do texto da conversa. O que aparece abaixo são pistas que a pessoa
                  mencionou — <strong>não são contato confirmado</strong>, e quem decide se aborda por
                  ali é você.
                </p>
                {lead.pistas.length > 0 ? (
                  <ul className="mt-2.5 space-y-1">
                    {lead.pistas.map((p, i) => (
                      <li key={i} className="text-[13px] text-[var(--text-primary)]">
                        <span className="text-[var(--text-muted)]">{p.tipo} (pista):</span> {p.valor}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[13px] text-[var(--text-muted)] mt-2.5">Nenhuma pista no texto do briefing.</p>
                )}
              </>
            ) : (
              <ul className="space-y-1">
                {lead.contato.nome && (
                  <li className="text-[13px] text-[var(--text-primary)]">
                    <span className="text-[var(--text-muted)]">nome:</span> {lead.contato.nome}
                  </li>
                )}
                {lead.contato.canais.map((c) => (
                  <li key={c.tipo} className="text-[13px] text-[var(--text-primary)]">
                    <span className="text-[var(--text-muted)]">{c.tipo === "whatsapp" ? "WhatsApp" : "e-mail"}:</span> {c.valor}
                  </li>
                ))}
              </ul>
            )}
          </Bloco>

          {lead.repeticao && (
            <Bloco titulo="Este contato já escreveu antes">
              <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
                São <strong>{lead.repeticao.vezes} briefings</strong> do mesmo contato, e este é o{" "}
                <strong>{lead.repeticao.ordem}º</strong>. O primeiro chegou em{" "}
                {new Date(lead.repeticao.primeiroEm).toLocaleDateString("pt-BR")}.
              </p>
              <p className="text-[13px] text-[var(--text-secondary)] mt-1.5 leading-relaxed">
                <strong>Nenhum deles foi juntado nem descartado</strong> — cada briefing está inteiro,
                com o texto que a pessoa escreveu. Pode ser o mesmo pedido reenviado, ou um{" "}
                <strong>segundo projeto</strong> que ela quer contratar: quem lê os dois decide, não o
                sistema.
              </p>
              {/* 🔴 ID DE BANCO NÃO É INFORMAÇÃO. Até 16/08 esta lista saía como
                  `outro briefing: 0083d663-4ee0-4e8f-b9b5-acd13858f0cf` — quatro
                  linhas de monospace que eram o elemento mais pesado do bloco e
                  não respondiam a pergunta pela qual o bloco existe. Data, nome
                  do negócio e o que foi pedido respondem: é assim que se vê que
                  dois briefings viraram "unidade Pinheiros" e falam de outro
                  projeto. Tudo dado gravado — nada aqui é resumo de IA. */}
              <ul className="mt-2.5 space-y-2">
                {lead.repeticao.irmaos.map((irmao) => (
                  <li key={irmao.id} className="text-[13px] border-l-2 border-[var(--border)] pl-3">
                    <p className="text-[var(--text-primary)]">
                      <span className="tabular-nums">
                        {new Date(irmao.em).toLocaleDateString("pt-BR")}
                      </span>
                      {irmao.negocio ? <> · {irmao.negocio}</> : null}
                    </p>
                    <p className="text-[12px] text-[var(--text-muted)] leading-relaxed">
                      {/* Ausência de informação não é informação: briefing sem
                          serviço e sem texto diz que não tem descrição, e nunca
                          some da lista por isso. */}
                      {irmao.pedido ?? "sem descrição gravada neste briefing"}
                    </p>
                  </li>
                ))}
              </ul>
            </Bloco>
          )}

          {lead.servicosPedidos.length > 0 && (
            <Bloco titulo="O que ele pediu">
              <div className="flex flex-wrap gap-1.5">
                {lead.servicosPedidos.map((s, i) => (
                  <span key={i} className="h-6 px-2.5 inline-flex items-center rounded-[6px] bg-[var(--accent)] text-[var(--text-secondary)] text-[12px]">
                    {s}
                  </span>
                ))}
              </div>
            </Bloco>
          )}

          {lead.oQueEleContou.length > 0 && (
            <Bloco titulo="Nas palavras dele">
              <ul className="space-y-1.5">
                {lead.oQueEleContou.map((f, i) => (
                  <li key={i} className="text-[13px] text-[var(--text-secondary)] leading-relaxed border-l-2 border-[var(--border)] pl-3">
                    {f}
                  </li>
                ))}
              </ul>
            </Bloco>
          )}

          <Bloco titulo="Escopo e faixa, pela tabela da casa">
            {lead.escopo.length > 0 ? (
              <div className="space-y-2">
                {/* A 375px, título e preço lado a lado brigam pela mesma
                    largura: o nome do plano quebra em três linhas e o preço
                    fica espremido no canto, longe do item que ele precifica.
                    No celular a linha EMPILHA — preço embaixo do que ele
                    precifica —, e só a partir de `sm` vira duas colunas. */}
                {lead.escopo.map((l, i) => (
                  <div key={i} className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-0.5 sm:gap-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-[var(--text-primary)]">{l.item}</p>
                      <p className="text-[12px] text-[var(--text-muted)] leading-relaxed">{l.detalhe}</p>
                    </div>
                    <p className="text-[13px] font-medium text-[var(--text-primary)] shrink-0 tabular-nums">
                      {brl(l.minimo)}–{brl(l.maximo)}
                      <span className="text-[12px] font-normal text-[var(--text-muted)]">/{l.unidade}</span>
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
            <p className="text-[12px] text-[var(--text-muted)] mt-3 leading-relaxed">{lead.notaDaFaixa}</p>
          </Bloco>

          {/* ── A DIFERENÇA ENTRE O QUE ELE DISSE QUE TEM E O QUE PEDIU ────────
              Em 16/08/2026, no piloto ao vivo, o CEO declarou R$ 500/mês e a
              casa devolveu R$ 1.800–3.400 **sem uma palavra sobre a
              diferença**. Os dois números já estavam neste mesmo cartão, um
              embaixo do outro — a "Faixa de investimento" que ele declarou e a
              faixa da tabela da casa — e ninguém os comparava.

              O bloco só existe quando há desencontro real (ver
              `verba-vs-estimativa.ts`): aviso que aparece em todo cartão deixa
              de ser lido, e aí o dia em que ele importa passa junto com os
              outros.

              ⚠️ Âmbar (`--warning`), não vermelho: isto **não é defeito do
              lead** nem urgência — é uma conversa que precisa acontecer. O
              vermelho desta tela já tem dono, e é "não há como falar com esta
              pessoa". Dois vermelhos com pesos diferentes achatam os dois. */}
          {lead.acimaDaVerba && (
            <Bloco titulo="O pedido passa da verba que ele declarou">
              <div className="rounded-[10px] border border-[var(--warning)] bg-[var(--warning-bg)] px-4 py-3 space-y-2">
                <p className="text-[13px] text-[var(--warning)] font-medium leading-relaxed">
                  {lead.acimaDaVerba.diferenca}
                </p>
                <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
                  {lead.acimaDaVerba.oQueCabe}
                </p>
                <p className="text-[12px] text-[var(--text-muted)] leading-relaxed">
                  {lead.acimaDaVerba.oCaminhoQueContinua}
                </p>
              </div>
              {/* O que o degrau de entrada NÃO faz, na mesma tela em que ele é
                  oferecido. Oferecer o plano barato escondendo o corte é a
                  briga do terceiro mês — e quem vai falar com o lead precisa
                  ler isso ANTES de prometer. */}
              {lead.acimaDaVerba.planosQueCabem.map((p) => (
                <div key={p.id} className="mt-3">
                  <p className="text-[12px] font-medium text-[var(--text-primary)]">{p.nome} não inclui</p>
                  <ul className="mt-1 space-y-0.5">
                    {p.naoInclui.map((n, i) => (
                      <li key={i} className="text-[12px] text-[var(--text-muted)] leading-relaxed">• {n}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </Bloco>
          )}

          {lead.precisoConfirmar.length > 0 && (
            <Bloco titulo="Preciso confirmar">
              <ul className="space-y-1">
                {lead.precisoConfirmar.map((p, i) => (
                  <li key={i} className="text-[13px] text-[var(--text-secondary)] leading-relaxed">• {p}</li>
                ))}
              </ul>
            </Bloco>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * A pílula de estado do cartão — uma geometria só para os três tons.
 *
 * 🔴 **POR QUE A ALTURA DEIXOU DE SER FIXA.** As três nasceram com `h-6`, altura
 * travada em 24px. Medido a 375px, o carimbo mais longo de hoje ocupa 240px dos
 * 309px disponíveis e **não estoura** — mas altura fixa é uma aposta em que ele
 * nunca vá crescer, e o modo de falhar dela é o pior que existe: o texto sai
 * POR FORA do fundo colorido, em cima do que estiver embaixo, sem quebrar nada
 * que um teste perceba. Basta um `12º briefing (de 15)`, uma tradução mais
 * longa ou o zoom de fonte do sistema. `min-h` + `py` deixa o fundo crescer com
 * o texto; `max-w-full` impede que a pílula ultrapasse o cartão.
 */
function Selo({ tom, children }: { tom: "danger" | "success" | "info"; children: React.ReactNode }) {
  const cor = {
    danger:  "bg-[var(--danger-bg)] text-[var(--danger)]",
    success: "bg-[var(--success-bg)] text-[var(--success)]",
    info:    "bg-[var(--info-bg)] text-[var(--info)]",
  }[tom];
  return (
    <span
      className={`inline-flex items-center gap-1.5 min-h-6 max-w-full px-2.5 py-1 rounded-[6px] text-[12px] font-semibold leading-tight ${cor}`}
    >
      {children}
    </span>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-2">{titulo}</p>
      {children}
    </div>
  );
}
