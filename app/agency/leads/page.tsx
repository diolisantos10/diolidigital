"use client";

// /agency/leads — QUEM BATEU NA PORTA E AINDA NÃO FOI ATENDIDO.
//
// A tela nasce de um achado de 08/08/2026: três interessados entraram pelo
// briefing público — Sushi Cazza (51 dias), Camila Pereira (29) e Beatriz
// Gimenes (28) — com a conversa inteira gravada e NENHUM canal de contato. Não
// havia alarme e não havia tela: a caixa de entrada de `/agency/requests` lia o
// store do navegador, então quem abrisse noutro computador via zero.
//
// ── O QUE MUDOU EM 16/08/2026 ─────────────────────────────────────────────
//
// A tela mostrava os dossiês e **não mostrava a fila**. `quemBateuNaPorta` —
// que é quem sabe dizer "estas pessoas entraram e ninguém respondeu" — existia
// completo e testado desde 08/08 e nenhuma linha de produção o chamava. O
// briefing do CityJobs, entregue pelo próprio CEO, ficou parado sem ninguém
// saber. A fila passou a ser a ESPINHA desta tela, e o dossiê virou o detalhe
// de cada linha.
//
// **Por que aqui, e não numa rota nova:** é a tela que a equipe já abre a
// caminho de vender. Fila numa rota órfã é fila que continua invisível — foi
// assim que a caixa de `/agency/requests` deixou de ser lida.
//
// A UMA COISA que se vem fazer aqui: **decidir se aborda.** Por isso cada
// cartão responde, nesta ordem: dá para falar com ele? (e o "não" vem primeiro,
// em vermelho) · o que ele quer, nas palavras dele · quanto vale, pela tabela
// da casa.
//
// A tela NÃO aborda ninguém, não envia mensagem e não escreve nada. O dossiê é
// determinístico (`lib/agency/comercial/dossie-do-lead.ts`): nenhuma linha aqui
// é escrita por IA sobre um cliente que ninguém conferiu.

// ── O QUE MUDOU DE NOVO EM 16/08/2026, DEPOIS DA AUDITORIA ────────────────
//
// A tela tinha uma seção própria, "Não fecharam o briefing", montada a partir
// dos dossiês com `status: "lead_incompleto"` — com um comentário explicando
// que eles "NÃO estão na porta pela conta da varredura". Estavam de fora porque
// `AINDA_NA_PORTA` **não os listava**, o que era o defeito, não a regra. O
// resultado eram duas verdades na mesma tela: o placar dizia `semCaminho: 0` e
// logo abaixo havia cartões dizendo "sem como falar com esta pessoa".
//
// Agora `lead_incompleto` está na fila, `semCaminho` o conta, e a seção
// separada saiu: quem não deixou contato aparece **uma vez**, na fila "Sem
// forma de contato", que é onde ele sempre pertenceu.

import { useCallback, useEffect, useState } from "react";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import EmptyState from "@/components/agency/ui/EmptyState";
import {
  Carregando, CartaoDeErro, Numero, Placar as GradeDoPlacar, Selo, TituloDeFila,
  dias, esperaHa, contagem,
} from "@/components/agency/ui/fila/pecas";
import { whatsappComoSeLe } from "@/lib/agency/comercial/contato-do-lead";
import type { DossieDoLead } from "@/lib/agency/comercial/dossie-do-lead";
import type { NaPorta, ResumoDaPorta } from "@/lib/agency/comercial/quem-bateu-na-porta";

type Porta =
  | { estado: "carregando" }
  | { estado: "ok"; resumo: ResumoDaPorta; fila: NaPorta[]; prazo: number }
  /** "não consegui olhar" tem tela própria. Fila vazia por falha de leitura é
   *  exatamente como esta fila ficou invisível por sete semanas. */
  | { estado: "nao_medido"; motivo: string };

type Dossies =
  | { estado: "carregando" }
  | { estado: "ok"; leads: DossieDoLead[] }
  | { estado: "nao_medido"; motivo: string };

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** "esperando há 0 dias" é uma frase que ninguém fala. A regra mora em
 *  `components/agency/ui/fila/pecas.tsx`, junto com a da tela irmã — escrita
 *  duas vezes ela já divergiu uma. */
const espera = (n: number) => (n === 0 ? "entrou hoje" : `esperando ${esperaHa(n)}`);

/** O contato como se lê em voz alta. A regra mora no leitor único de contato
 *  (`contato-do-lead.ts`), não aqui — e ela recusa formatar o que não tem forma
 *  de telefone, em vez de arrumar por cima. */
const comoSeLe = (tipo: string, valor: string) =>
  tipo === "whatsapp" ? whatsappComoSeLe(valor) : valor;

export default function LeadsPage() {
  const [porta, setPorta] = useState<Porta>({ estado: "carregando" });
  const [dossies, setDossies] = useState<Dossies>({ estado: "carregando" });
  const [aberto, setAberto] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setPorta({ estado: "carregando" });
    setDossies({ estado: "carregando" });

    // Em paralelo, e com falhas INDEPENDENTES: o dossiê fora do ar não pode
    // apagar a fila da tela — a fila é a parte que cobra a casa.
    void (async () => {
      try {
        const resp = await fetch("/api/agency/porta");
        const body = await resp.json();
        if (!resp.ok || body?.medido !== true) {
          setPorta({ estado: "nao_medido", motivo: body?.motivo ?? "a fila da porta não pôde ser lida agora" });
          return;
        }
        setPorta({ estado: "ok", resumo: body.resumo, fila: body.fila ?? [], prazo: body.diasAteVirarDesleixo ?? 2 });
      } catch {
        setPorta({ estado: "nao_medido", motivo: "não consegui falar com o servidor — esta fila não é zero, é desconhecida" });
      }
    })();

    void (async () => {
      try {
        const resp = await fetch("/api/agency/leads");
        const body = await resp.json();
        if (!resp.ok || body?.medido !== true) {
          setDossies({ estado: "nao_medido", motivo: body?.motivo ?? "os dossiês não puderam ser lidos agora" });
          return;
        }
        setDossies({ estado: "ok", leads: body.leads ?? [] });
      } catch {
        setDossies({ estado: "nao_medido", motivo: "não consegui falar com o servidor" });
      }
    })();
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  const porId = new Map<string, DossieDoLead>(
    dossies.estado === "ok" ? dossies.leads.map((l) => [l.id, l]) : [],
  );

  const carregando = porta.estado === "carregando";
  const vazio = porta.estado === "ok" && porta.resumo.naPorta === 0;
  const alcancaveis = porta.estado === "ok" ? porta.fila.filter((p) => p.temComoFalar) : [];
  const semCaminho = porta.estado === "ok" ? porta.fila.filter((p) => !p.temComoFalar) : [];

  return (
    <div className="max-w-[900px]">
      <AgencyHeader
        eyebrow="Comercial"
        title="Quem bateu na porta"
        subtitle="Briefings que chegaram pela porta pública e ainda não foram atendidos. Quem dá para atender vem primeiro; dentro de cada fila, o mais antigo em cima."
      />

      {carregando && <Carregando etiqueta="Lendo quem está esperando na porta…" />}

      {porta.estado === "nao_medido" && (
        <CartaoDeErro
          titulo="Não consegui ler a fila da porta"
          motivo={porta.motivo}
          aoTentarDeNovo={() => void carregar()}
        />
      )}

      {/* Placar de três zeros em cima de "ninguém esperando" é o mesmo fato
          dito duas vezes, e a segunda com cara de painel quebrado. Com fila
          vazia quem fala é o estado vazio, que diz o que os zeros não dizem:
          isto é boa notícia. */}
      {porta.estado === "ok" && !vazio && <Placar resumo={porta.resumo} prazo={porta.prazo} />}

      {vazio && (
        <EmptyState
          title="Ninguém esperando na porta"
          description="Isto é boa notícia: todo briefing que chegou já foi atendido. Quando alguém preencher o briefing público, ele aparece aqui em minutos."
        />
      )}

      {/* O dossiê fora do ar não some com a fila — só com o detalhe dela.
          `role="alert"` porque é falha parcial, e o §7.3 do DESIGN.md não abre
          exceção para "só um pedaço quebrou". */}
      {porta.estado === "ok" && porta.fila.length > 0 && dossies.estado === "nao_medido" && (
        <div role="alert" className="mb-3 rounded-[10px] border border-[var(--warning)] bg-[var(--warning-bg)] px-4 py-3">
          <p className="text-[13px] text-[var(--warning)] leading-relaxed">
            A fila abaixo está correta, mas <strong>o escopo e a faixa de preço não puderam ser lidos</strong>:{" "}
            {dossies.motivo}
          </p>
        </div>
      )}

      {/* ── AS DUAS FILAS NÃO SE MISTURAM ────────────────────────────────────
          O placar separa os dois números porque são problemas opostos; a LISTA
          tem de separar pelo mesmo motivo. Numa fila só, ordenada por idade,
          as primeiras linhas da tela eram justamente as que ninguém pode
          atender — e a primeira ação possível ficava na terceira linha, abaixo
          de dois cartões que só dizem "não dá". Dentro de cada fila, o mais
          antigo em cima. */}
      {porta.estado === "ok" && alcancaveis.length > 0 && (
        <Fila
          titulo="Dá para falar — e ninguém falou"
          descricao="Estes deixaram canal de contato. O conserto aqui é uma pessoa abrir e falar."
          itens={alcancaveis}
          porId={porId}
          aberto={aberto}
          setAberto={setAberto}
        />
      )}

      {porta.estado === "ok" && semCaminho.length > 0 && (
        <Fila
          titulo="Sem forma de contato"
          descricao="Contaram o negócio e não deixaram canal. Não é desleixo de ninguém: é dado que falta, e falar é impossível até alguém achar um caminho."
          itens={semCaminho}
          porId={porId}
          aberto={aberto}
          setAberto={setAberto}
        />
      )}

      {/* A LISTA TEM TETO E A CONTAGEM NÃO — e a tela diz qual dos dois está
          olhando. Afirmar "a contagem acima não tem teto" sem que fosse verdade
          foi o defeito de 16/08 na tela irmã; aqui a frase só aparece quando o
          servidor diz que amostrou. */}
      {porta.estado === "ok" && porta.resumo.amostrada && (
        <p className="text-[12px] text-[var(--text-muted)] leading-relaxed">
          A fila tem <strong>{porta.resumo.naPorta}</strong> pessoas e esta tela lista as{" "}
          {porta.resumo.listados} mais antigas. Os números do placar valem sobre essas{" "}
          {porta.resumo.listados} — são <strong>piso</strong>, não total.
        </p>
      )}
    </div>
  );
}

function Fila({
  titulo, descricao, itens, porId, aberto, setAberto,
}: {
  titulo: string;
  descricao: string;
  itens: NaPorta[];
  porId: Map<string, DossieDoLead>;
  aberto: string | null;
  setAberto: (id: string | null) => void;
}) {
  return (
    <div className="mb-7">
      <TituloDeFila>{titulo} · {itens.length}</TituloDeFila>
      <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed mb-3">{descricao}</p>
      <div className="space-y-3">
        {itens.map((p) => (
          <Cartao
            key={p.id}
            porta={p}
            dossie={porId.get(p.id)}
            aberto={aberto === p.id}
            onToggle={() => setAberto(aberto === p.id ? null : p.id)}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * O placar da porta. TRÊS números, e os dois primeiros NÃO se somam ao terceiro.
 *
 * "Ninguém respondeu" e "não temos como responder" parecem a mesma linha e são
 * problemas opostos: o primeiro é desleixo da casa e o conserto é uma pessoa
 * abrir e falar; o segundo é buraco de dado e falar é impossível. Somá-los
 * produziria um alarme que ninguém sabe atender — e alarme que não diz o
 * conserto é ruído que se aprende a ignorar.
 */
function Placar({ resumo, prazo }: { resumo: ResumoDaPorta; prazo: number }) {
  return (
    <div className="mb-5">
      <GradeDoPlacar>
        {/* OS TRÊS DEGRAUS, na mesma semântica da tela irmã de aprovações —
            `nossa` é a bola da casa, `atencao` é buraco de dado ou prazo
            estourado. Até 16/08 esta tela pintava "passaram do prazo" com o
            MESMO vermelho de "ninguém falou", achatando dois degraus em um,
            enquanto a de aprovações usava três. Copiar o componente não
            sincronizava a semântica; agora ela mora num lugar só. */}
        <Numero
          valor={resumo.esperandoResposta}
          rotulo="dá para falar, e ninguém falou"
          nota={
            resumo.maisAntigoEmDias !== null
              ? `o mais antigo espera há ${dias(resumo.maisAntigoEmDias)}`
              : "ninguém nessa situação"
          }
          tom={resumo.esperandoResposta > 0 ? "nossa" : "deles"}
        />
        <Numero
          valor={resumo.desleixo}
          rotulo={`passaram de ${dias(prazo)}`}
          nota="parte do número ao lado — não some os dois"
          tom={resumo.desleixo > 0 ? "atencao" : "deles"}
        />
        <Numero
          valor={resumo.semCaminho}
          rotulo="sem forma de contato"
          nota="buraco de dado, não desleixo: falar é impossível"
          tom={resumo.semCaminho > 0 ? "atencao" : "deles"}
        />
      </GradeDoPlacar>
      {resumo.naPorta > 0 && (
        <p className="text-[12px] text-[var(--text-muted)] mt-2 leading-relaxed">
          {contagem(resumo.naPorta, "pessoa na porta", "pessoas na porta")} ao todo. Esta tela só
          conta — <strong>ninguém é abordado por máquina</strong>.
        </p>
      )}
    </div>
  );
}

function Cartao({
  porta, dossie, aberto, onToggle,
}: { porta: NaPorta; dossie?: DossieDoLead; aberto: boolean; onToggle: () => void }) {
  const semContato = !porta.temComoFalar;

  return (
    // `bg-[var(--card)]`, e não `bg-white`: existe token, e no modo escuro
    // `--card` vira navy. Cartão branco fixo dentro de tela escura era o
    // resultado literal de seis `bg-white` escritos à mão nestas duas telas.
    <div
      className={`rounded-[12px] border bg-[var(--card)] overflow-hidden ${
        porta.desleixo ? "border-[var(--danger)]" : semContato ? "border-[var(--warning)]" : "border-[var(--border)]"
      }`}
    >
      {/* O cartão é um DISCLOSURE, e precisava dizer isso a quem não enxerga a
          seta: sem `aria-expanded` o leitor de tela anuncia "botão, Portal de
          Vagas" e não conta que existe conteúdo escondido nem se ele já está
          aberto — a pessoa clica no escuro. O `abrir/fechar` visível já dizia
          isso para quem vê. */}
      <button
        onClick={onToggle}
        aria-expanded={aberto}
        // `aria-controls` SÓ quando o painel existe no DOM. Fechado, o detalhe
        // não é renderizado e o atributo apontava para um id inexistente —
        // IDREF pendurado, que alguns leitores de tela anunciam como controle
        // quebrado e outros ignoram em silêncio. `aria-expanded` sozinho já diz
        // o que precisa ser dito enquanto está fechado.
        aria-controls={aberto ? `detalhe-${porta.id}` : undefined}
        style={{ touchAction: "manipulation" }}
        className="w-full text-left px-4 sm:px-5 py-4 hover:bg-[var(--bg)] transition-colors"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-[var(--text-primary)] truncate">{porta.negocio}</p>
            <p className="text-[13px] text-[var(--text-muted)] mt-0.5">
              {dossie?.segmento ?? "segmento não informado"} · {espera(porta.diasEsperando)}
            </p>
          </div>
          <span className="text-[12px] text-[var(--text-muted)] shrink-0 pt-1">{aberto ? "fechar" : "abrir"}</span>
        </div>

        {/* A pergunta que decide tudo vem primeiro, e o "não" é vermelho. O
            selo de desleixo vem colado nela: é o que separa "entrou hoje" de
            "está sendo ignorado". */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {semContato ? (
            <Selo tom="atencao">Sem como falar com esta pessoa</Selo>
          ) : (
            <Selo tom="ok">
              {dossie
                ? dossie.contato.canais.map((c) => (c.tipo === "whatsapp" ? "WhatsApp" : "E-mail")).join(" · ")
                : "Tem canal de contato"}
            </Selo>
          )}
          {porta.desleixo && <Selo tom="nossa">Passou do prazo — ninguém respondeu</Selo>}
        </div>

        {dossie && (
          // 14px, abaixo dos 15px do nome do negócio. Estava 16px: o preço
          // saía MAIOR que o nome de quem está esperando, e o que se vem
          // decidir aqui é falar com uma pessoa, não olhar uma tabela.
          <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-[14px] font-semibold text-[var(--text-primary)]">
              {dossie.faixa ? `${brl(dossie.faixa.minimo)} – ${brl(dossie.faixa.maximo)}` : "faixa a definir"}
            </span>
            <span className="text-[12px] text-[var(--text-muted)]">
              {dossie.fonteDaFaixa === "escopo_declarado"
                ? "pela tabela da casa, sobre o escopo declarado"
                : dossie.fonteDaFaixa === "catalogo_sem_cadencia"
                ? "banda do catálogo — volume não declarado"
                : "a tabela da casa não cobre o que foi pedido"}
            </span>
          </div>
        )}
      </button>

      {aberto && (
        <div id={`detalhe-${porta.id}`} className="border-t border-[var(--border)] px-4 sm:px-5 py-4 space-y-5">
          <Bloco titulo="Como falar">
            {semContato ? (
              <>
                <p className="text-[13px] text-[var(--danger)] font-medium leading-relaxed">
                  Não há contato gravado{porta.porQueNaoDaParaFalar ? `: ${porta.porQueNaoDaParaFalar}` : "."}
                </p>
                <p className="text-[13px] text-[var(--text-secondary)] mt-1.5 leading-relaxed">
                  Nada foi deduzido do texto da conversa. O que aparece abaixo são pistas que a pessoa
                  mencionou — <strong>não são contato confirmado</strong>, e quem decide se aborda por
                  ali é você.
                </p>
                {porta.pistas.length > 0 ? (
                  <ul className="mt-2.5 space-y-1">
                    {porta.pistas.map((p, i) => (
                      <li key={i} className="text-[13px] text-[var(--text-primary)]">
                        <span className="text-[var(--text-muted)]">{p.tipo} (pista):</span> {p.valor}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[13px] text-[var(--text-muted)] mt-2.5">Nenhuma pista no texto do briefing.</p>
                )}
              </>
            ) : dossie ? (
              <ul className="space-y-1">
                {dossie.contato.nome && (
                  <li className="text-[13px] text-[var(--text-primary)]">
                    <span className="text-[var(--text-muted)]">nome:</span> {dossie.contato.nome}
                  </li>
                )}
                {dossie.contato.canais.map((c) => (
                  <li key={c.tipo} className="text-[13px] text-[var(--text-primary)]">
                    <span className="text-[var(--text-muted)]">{c.tipo === "whatsapp" ? "WhatsApp" : "e-mail"}:</span>{" "}
                    <span className="tabular-nums select-all">{comoSeLe(c.tipo, c.valor)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
                Há canal de contato gravado. O detalhe não foi carregado nesta tela — abra a ficha da
                solicitação para vê-lo.
              </p>
            )}
          </Bloco>

          {!dossie && (
            // Desde 16/08 a fila e os dossiês leem o MESMO conjunto de status
            // (`AINDA_NA_PORTA`), então este caso deixou de ser rotina e passou
            // a ser sinal: as duas leituras discordaram. A frase antiga
            // ("já saiu da caixa de entrada") explicava um comportamento que
            // não existe mais e mandaria a pessoa procurar no lugar errado.
            <p className="text-[12px] text-[var(--text-muted)] leading-relaxed">
              O escopo e a faixa desta solicitação não vieram nesta leitura. Ela está na fila, mas o
              dossiê dela não foi montado — <strong>abra a ficha da solicitação</strong> para ver o
              detalhe.
            </p>
          )}

          {dossie && dossie.servicosPedidos.length > 0 && (
            <Bloco titulo="O que ele pediu">
              <div className="flex flex-wrap gap-1.5">
                {dossie.servicosPedidos.map((s, i) => (
                  <span key={i} className="h-6 px-2.5 inline-flex items-center rounded-[6px] bg-[var(--accent)] text-[var(--text-secondary)] text-[12px]">
                    {s}
                  </span>
                ))}
              </div>
            </Bloco>
          )}

          {dossie && dossie.oQueEleContou.length > 0 && (
            <Bloco titulo="Nas palavras dele">
              <ul className="space-y-1.5">
                {dossie.oQueEleContou.map((f, i) => (
                  <li key={i} className="text-[13px] text-[var(--text-secondary)] leading-relaxed border-l-2 border-[var(--border)] pl-3">
                    {f}
                  </li>
                ))}
              </ul>
            </Bloco>
          )}

          {dossie && (
            <Bloco titulo="Escopo e faixa, pela tabela da casa">
              {dossie.escopo.length > 0 ? (
                <div className="space-y-2">
                  {/* A 375px, título e preço lado a lado brigam pela mesma
                      largura: o nome do plano quebra em três linhas e o preço
                      fica espremido no canto, longe do item que ele precifica.
                      No celular a linha EMPILHA — preço embaixo do que ele
                      precifica —, e só a partir de `sm` vira duas colunas. */}
                  {dossie.escopo.map((l, i) => (
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
              <p className="text-[12px] text-[var(--text-muted)] mt-3 leading-relaxed">{dossie.notaDaFaixa}</p>
            </Bloco>
          )}

          {dossie && dossie.precisoConfirmar.length > 0 && (
            <Bloco titulo="Preciso confirmar">
              <ul className="space-y-1">
                {dossie.precisoConfirmar.map((p, i) => (
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

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      {/* 12px: o piso da §3 do DESIGN.md. Estava 11px. */}
      <h3 className="text-[12px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-2">{titulo}</h3>
      {children}
    </div>
  );
}
