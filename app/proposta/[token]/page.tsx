"use client";

// ── A PÁGINA DA PROPOSTA — onde o cliente responde "cliente aceitou?" ────────
//
// O cursograma da casa tem UM ponto de decisão depois da precificação, e até
// 24/08/2026 ele não tinha tela. A rota do aceite existia, era testada, estava
// no ar — e nenhuma página a chamava. A produção somava zero clientes com
// projeto porque ninguém tinha onde clicar "aceito".
//
// ── POR QUE UMA PÁGINA PRÓPRIA, E NÃO UMA ABA DO PORTAL ────────────────────
//
// O portal de 11 abas (`/portal/access/[token]`) precisa de um `Client` para
// abrir: `resolvePortalClient` devolve `null` sem ele e TODA rota de dados
// responde 403. Neste ponto da esteira o `Client` ainda não existe — quem o
// cria é justamente o projeto que este aceite faz nascer. Pendurar o aceite lá
// seria exigir o efeito como condição da causa.
//
// ── O QUE ESTA TELA NÃO FAZ ────────────────────────────────────────────────
//
//   • Não decide nada sozinha. Sem clique não há decisão: silêncio não é
//     aceite, e "não recusou" nunca vale como "aceitou".
//   • Não desenha botão quando o servidor diz que não há decisão a tomar
//     (`decidivel: false`). Quem manda é o estado do pedido, não a tela.
//   • Não mostra id, valor interno, nem nome de sistema. O corpo é o mesmo
//     texto que já foi para a conversa e para o e-mail.
//   • **Não aplica piso de preço.** A conversa vai ao servidor e é ELE quem
//     barra valor abaixo do piso. Trava em tela é sugestão: um POST direto
//     passa por cima de qualquer coisa escrita aqui.

import { use, useCallback, useEffect, useState } from "react";
// ⚠️ Só TEXTO PURO vem daqui. Este arquivo é um client component: qualquer
// import que arraste o Prisma reprova o `npm run build` (a lição já paga,
// escrita no topo de `lib/agency/comercial/parceria-declarada.ts`).
import { textoDaIsencao, type IsencaoVisivel } from "@/lib/agency/comercial/aviso-de-isencao";

type Proposta = {
  negocio: string;
  texto: string | null;
  decidivel: boolean;
  status: string;
  motivo?: string;
  jaAceito?: boolean;
  jaRecusado?: boolean;
  /** O aviso de que a publicação automática ainda não existe. `null` quando ela
   *  já existe — e aí o bloco some sozinho, sem ninguém apagar texto. */
  avisoDeAgendamento?: string | null;
  /**
   * A ISENÇÃO POR PARCERIA — ausente/`null` quando este cliente é PAGANTE.
   *
   * ⚠️ Quem a preenche é o SERVIDOR (`parceriaVivaDoCliente`, a partir do
   * `clientId` que a rota derivou do token). A tela nunca decide isto, e nunca
   * há um caminho em que "não veio no JSON" vire isenção: ausência é cliente
   * pagante, com preço e com o portão fechando — o comportamento de sempre.
   */
  isencaoDeParceria?: IsencaoVisivel | null;
};

type Fala = { role: "user" | "assistant"; text: string };

const CAIXA: React.CSSProperties = {
  maxWidth: 680,
  margin: "0 auto",
  padding: "40px 20px 64px",
  fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
  color: "#1A1A1A",
  lineHeight: 1.6,
};

const BOTAO: React.CSSProperties = {
  border: "none",
  borderRadius: 10,
  padding: "14px 22px",
  fontSize: 16,
  fontWeight: 600,
  cursor: "pointer",
};

/** O que a casa diz quando a conversa não responde. Nunca um beco: ela nomeia
 *  gente e a próxima ação. *Botão que cai na mesma parada é pior que botão
 *  nenhum.* */
export const CONVERSA_INDISPONIVEL =
  "Não consegui responder agora. Me diga por aqui mesmo o que você precisa que " +
  "o gerente do projeto te procura — ou responda o e-mail do orçamento.";

// ═══════════════════════════════════════════════════════════════════════════
// O SDR NESTA PÁGINA — ordem do CEO, 27/08/2026
// ═══════════════════════════════════════════════════════════════════════════
//
//   *"A página onde vai estar o orçamento tem que ter o agente de SDR pronto
//   para negociar valores e não deixar o cliente desistir."*
//
// Antes daqui a tela tinha DOIS botões: aceitar e "agora não". **Cliente que só
// tem esses dois botões e acha caro não negocia — some**, e a casa nem fica
// sabendo que houve objeção. É exatamente esse cliente que isto existe para
// segurar.
//
// ⚠️ NÃO É UM SEGUNDO SDR. A conversa vai para `POST /api/sdr/chat`, o mesmo
// funil da sala de briefing, com os mesmos guardas. O que muda é o `contexto`:
// o servidor deriva do TOKEN quem é o cliente e quanto foi orçado, e o piso é
// aplicado sobre a fala pronta, no servidor.
export function ConversaDaProposta({
  token,
  negocio,
  /**
   * Este cliente é PARCEIRO ISENTO? Só muda o CONVITE desta caixa: quem não
   * paga não tem "dúvida no valor" a resolver, e um convite a negociar preço
   * seria a casa insinuando uma cobrança que ela mesma dispensou.
   *
   * ⛔ Isto NÃO afrouxa nada no servidor: a fala continua passando pelo piso
   * (`pisoRespeitado`), que recusa valor sem serviço conhecido. Tela é
   * sugestão; a trava é o código do outro lado.
   */
  isento = false,
}: {
  token: string;
  negocio: string;
  isento?: boolean;
}) {
  const [falas, setFalas] = useState<Fala[]>([]);
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const [falhou, setFalhou] = useState<string | null>(null);
  const [sessionId] = useState(() => `proposta-${Math.random().toString(36).slice(2)}-${Date.now()}`);

  async function enviar(ev: React.FormEvent) {
    ev.preventDefault();
    const pergunta = texto.trim();
    if (!pergunta || pensando) return;
    setTexto("");
    setFalhou(null);
    const historico: Fala[] = [...falas, { role: "user", text: pergunta }];
    setFalas(historico);
    setPensando(true);
    try {
      const res = await fetch("/api/sdr/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: falas.map((f) => ({ role: f.role, text: f.text })),
          currentMessage: pergunta,
          sessionId,
          contexto: "negociacao",
          // É daqui que o servidor deriva TUDO — nada de id no corpo.
          propostaToken: token,
        }),
      });
      const corpo = (await res.json()) as { ok?: boolean; reply?: string };
      if (!res.ok || !corpo.ok || !corpo.reply) {
        setFalhou(CONVERSA_INDISPONIVEL);
        return;
      }
      setFalas([...historico, { role: "assistant", text: corpo.reply }]);
    } catch {
      setFalhou(CONVERSA_INDISPONIVEL);
    } finally {
      setPensando(false);
    }
  }

  return (
    <section
      aria-label="Conversar sobre o orçamento"
      style={{ marginTop: 32, border: "1px solid #EAEAE4", borderRadius: 12, overflow: "hidden" }}
    >
      <div style={{ background: "#F5F5F1", padding: "14px 18px", borderBottom: "1px solid #EAEAE4" }}>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
          {isento ? "Quer ajustar o escopo?" : "Ficou com dúvida no valor?"}
        </p>
        <p style={{ margin: "4px 0 0", fontSize: 14, color: "#6B7280" }}>
          {isento
            ? "Fale comigo antes de aceitar — dá para acertar o que entra e o que não entra."
            : "Fale comigo antes de decidir — dá para ajustar o plano ao que cabe."}
        </p>
      </div>

      {falas.length > 0 && (
        <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
          {falas.map((f, i) => (
            <p
              key={i}
              style={{
                margin: 0,
                fontSize: 15,
                whiteSpace: "pre-wrap",
                alignSelf: f.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "88%",
                background: f.role === "user" ? "#1A1A1A" : "#F7F7F4",
                color: f.role === "user" ? "#fff" : "#1A1A1A",
                borderRadius: 12,
                padding: "10px 14px",
              }}
            >
              {f.text}
            </p>
          ))}
          {pensando && <p style={{ margin: 0, fontSize: 14, color: "#6B7280" }}>Digitando…</p>}
        </div>
      )}

      {falhou && (
        <p style={{ margin: 0, padding: "12px 18px", fontSize: 14, color: "#92400E", background: "#FEF3C7" }}>
          {falhou}
        </p>
      )}

      <form onSubmit={(ev) => void enviar(ev)} style={{ display: "flex", gap: 8, padding: 14, borderTop: "1px solid #EAEAE4" }}>
        <label htmlFor="fala-da-proposta" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
          Sua mensagem sobre o orçamento de {negocio}
        </label>
        <input
          id="fala-da-proposta"
          value={texto}
          onChange={(ev) => setTexto(ev.target.value)}
          placeholder={isento ? "Ex.: dá para trocar uma peça por outra?" : "Ex.: achei caro, tem algo mais enxuto?"}
          disabled={pensando}
          style={{ flex: 1, border: "1px solid #D6D6CE", borderRadius: 10, padding: "12px 14px", fontSize: 15, minWidth: 0 }}
        />
        <button
          type="submit"
          disabled={pensando || !texto.trim()}
          style={{ ...BOTAO, padding: "12px 18px", background: "#1A1A1A", color: "#fff", opacity: pensando || !texto.trim() ? 0.5 : 1 }}
        >
          Enviar
        </button>
      </form>
    </section>
  );
}

/**
 * O QUE O CLIENTE VÊ. Separado do componente de página de propósito.
 *
 * A página resolve o token e busca os dados — coisas que só existem no
 * navegador. Isto aqui é só a vista, e por ser só a vista **um teste consegue
 * renderizá-la e olhar o HTML que o cliente lê de verdade**. Enquanto a vista
 * morava dentro do `use(params)`, nenhum teste alcançava a tela: dava para
 * provar a função e não dava para provar a página — que é a pergunta que esta
 * casa faz sempre (*o teste alcança o que o cliente de verdade vê?*).
 */
export function CorpoDaProposta({
  dados, token, enviando, resposta, erro, onDecidir,
}: {
  dados: Proposta;
  token: string;
  enviando: "aceito" | "recusado" | null;
  resposta: string | null;
  erro: string | null;
  onDecidir: (d: "aceito" | "recusado") => void;
}) {
  const decidindoAgora = dados.decidivel && !!dados.texto && !resposta;

  // ── A ISENÇÃO, SE O SERVIDOR DISSE QUE EXISTE ────────────────────────────
  //
  // FAIL-CLOSED por construção: só há isenção quando o campo chegou preenchido
  // do servidor. Campo ausente, `null`, JSON velho de um cache, rota que falhou
  // ao ler o banco — tudo cai aqui como cliente PAGANTE, que é o comportamento
  // de hoje. Não existe caminho nesta tela em que "não sei" vire "isento".
  const isento = dados.isencaoDeParceria ?? null;

  return (
    <main style={CAIXA}>
      <p style={{ margin: 0, fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase", color: "#9B9B95", fontWeight: 600 }}>
        Sua proposta
      </p>
      <h1 style={{ margin: "6px 0 28px", fontSize: 28, lineHeight: 1.25 }}>
        {dados.negocio || "Seu projeto"}
      </h1>

      {/* ⚠️ O AVISO DE ISENÇÃO VEM ANTES DO TEXTO, e a POSIÇÃO É A ORDEM.
          O parceiro está abrindo esta página para ver o orçamento; se ele
          encontrar o número primeiro, já leu uma cobrança — e a frase que
          desmente vem tarde. O valor continua aparecendo logo abaixo, como
          REFERÊNCIA do que o trabalho vale, e isso é bom: mostra o tamanho do
          investimento da casa. Some inteiro para cliente pagante. */}
      {isento && (
        <section
          role="note"
          aria-label="Isenção por parceria"
          style={{ marginBottom: 24, background: "#DCFCE7", color: "#166534", border: "1px solid #86EFAC", borderRadius: 12, padding: "18px 20px" }}
        >
          {textoDaIsencao(isento).map((linha, i) => (
            <p key={i} style={{ margin: i === 0 ? 0 : "8px 0 0", fontSize: i === 0 ? 17 : 15, fontWeight: i === 0 ? 700 : 400, lineHeight: 1.6 }}>
              {linha}
            </p>
          ))}
        </section>
      )}

      {dados.texto ? (
        <div style={{ whiteSpace: "pre-wrap", fontSize: 16, background: "#FAFAF8", border: "1px solid #EAEAE4", borderRadius: 12, padding: 24 }}>
          {dados.texto}
        </div>
      ) : (
        <p style={{ fontSize: 16 }}>
          {dados.motivo ?? "A proposta ainda está sendo montada."} Assim que estiver pronta, você recebe por e-mail.
        </p>
      )}

      {resposta && (
        <p style={{ marginTop: 24, fontSize: 16, background: "#DCFCE7", color: "#166534", borderRadius: 10, padding: "14px 18px" }}>
          {resposta}
        </p>
      )}

      {/* ⚠️ O AVISO VEM ANTES DOS BOTÕES, e a posição é a metade da ordem.
          Quem aceita tem de saber o que está comprando: a publicação automática
          no Instagram ainda não existe, e o agendamento é manual por enquanto.
          Um aviso depois do botão chega tarde — guardrail 5 (nunca vender como
          pronto o que está em piloto) morre exatamente aí. Some sozinho quando
          a Meta liberar: quem decide é o servidor, não esta tela. */}
      {dados.avisoDeAgendamento && decidindoAgora && (
        <p
          role="note"
          style={{ marginTop: 24, fontSize: 15, lineHeight: 1.6, background: "#FEF3C7", color: "#92400E", borderRadius: 10, padding: "14px 18px" }}
        >
          {dados.avisoDeAgendamento}
        </p>
      )}

      {/* Botão só existe quando há decisão a tomar. A tela não inventa a
          pergunta: quem diz se o pedido está esperando resposta é o servidor. */}
      {decidindoAgora && (
        <div style={{ display: "flex", gap: 12, marginTop: 28, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => onDecidir("aceito")}
            disabled={enviando !== null}
            style={{ ...BOTAO, background: "#166534", color: "#fff", opacity: enviando ? 0.6 : 1 }}
          >
            {/* ⚠️ O BOTÃO NÃO CONVIDA A PAGAR QUEM NÃO PAGA. Sob parceria ele
                aceita o ESCOPO, e o rótulo diz isso: "aceitar e começar" ao
                lado de um preço é um botão de compra, e o parceiro leria como
                tal. Para o pagante o rótulo é o de sempre. */}
            {enviando === "aceito" ? "Registrando…" : isento ? "Aceitar o escopo e começar" : "Aceitar e começar"}
          </button>
          <button
            type="button"
            onClick={() => onDecidir("recusado")}
            disabled={enviando !== null}
            style={{ ...BOTAO, background: "#fff", color: "#6B7280", border: "1px solid #D6D6CE", opacity: enviando ? 0.6 : 1 }}
          >
            {enviando === "recusado" ? "Registrando…" : "Agora não"}
          </button>
        </div>
      )}

      {/* A CONVERSA. Só aparece enquanto há decisão a tomar: negociar uma
          proposta já aceita (ou já recusada) seria reabrir pelas costas o que o
          cliente fechou. */}
      {decidindoAgora && <ConversaDaProposta token={token} negocio={dados.negocio} isento={!!isento} />}

      {!dados.decidivel && !resposta && dados.texto && (
        <p style={{ marginTop: 24, fontSize: 15, color: "#6B7280" }}>
          {dados.jaAceito
            ? "Você já aceitou esta proposta — seu projeto está em montagem."
            : dados.jaRecusado
              ? "Você respondeu que não agora. Se mudar de ideia, é só responder o e-mail."
              : "Esta proposta não está aguardando decisão no momento."}
        </p>
      )}

      {erro && (
        <p style={{ marginTop: 20, fontSize: 15, color: "#DC2626" }}>{erro}</p>
      )}
    </main>
  );
}

export default function PropostaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [dados, setDados] = useState<Proposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<"aceito" | "recusado" | null>(null);
  const [resposta, setResposta] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/briefing/proposta?token=${encodeURIComponent(token)}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setErro(
          res.status === 403 || res.status === 404
            ? "Este link não está mais válido. Responda o e-mail do orçamento que a gente reenvia."
            : "Não consegui carregar sua proposta agora. Tente de novo em alguns minutos.",
        );
        return;
      }
      setDados((await res.json()) as Proposta);
    } catch {
      setErro("Não consegui carregar sua proposta agora. Tente de novo em alguns minutos.");
    }
  }, [token]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function decidir(decisao: "aceito" | "recusado") {
    setEnviando(decisao);
    setErro(null);
    try {
      const res = await fetch("/api/portal/briefing/aceite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, decisao }),
      });
      const corpo = (await res.json()) as { mensagem?: string; error?: string };
      if (!res.ok) {
        setErro(corpo.error ?? "Não consegui registrar sua resposta. Tente de novo.");
        return;
      }
      setResposta(corpo.mensagem ?? "Resposta registrada.");
      await carregar();
    } catch {
      setErro("Não consegui registrar sua resposta. Tente de novo.");
    } finally {
      setEnviando(null);
    }
  }

  if (erro && !dados) {
    return (
      <main style={CAIXA}>
        <p style={{ fontSize: 17 }}>{erro}</p>
      </main>
    );
  }
  if (!dados) {
    return (
      <main style={CAIXA}>
        <p style={{ color: "#6B7280" }}>Carregando sua proposta…</p>
      </main>
    );
  }

  return (
    <CorpoDaProposta
      dados={dados}
      token={token}
      enviando={enviando}
      resposta={resposta}
      erro={erro}
      onDecidir={(d) => void decidir(d)}
    />
  );
}
