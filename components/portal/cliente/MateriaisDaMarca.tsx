"use client";

// A SEÇÃO "BRAND BOOK E MATERIAIS DA MARCA" — dentro do Brand Hub, e só aqui.
//
// ── O QUE ESTAVA ERRADO (15/08/2026) ────────────────────────────────────────
//
// O envio de material existia e funcionava — no FIM DA ABA ENTREGAS. Entregas é
// o que a agência entregou AO cliente; material de marca é o caminho contrário.
// Quem procurava onde mandar o brand book abria o Brand Hub, via um anel de
// porcentagem e uma entrevista, e não encontrava nenhuma forma de enviar,
// consultar ou substituir arquivo nenhum.
//
// `docs/branding-na-ficha-do-cliente.md` já tinha decidido: **a aba de Marca
// absorve o material, e é o único lugar visível.** Esta seção é isso.
//
// ── NADA AQUI É COMPONENTE NOVO DE ENVIO ────────────────────────────────────
//
// `EnvioDeMaterial` e `CaixasDeMaterial` são os mesmos, com as mesmas caixas e a
// mesma rota (`POST /api/media`). O que esta tela acrescenta é o que faltava dos
// dois lados: a lista do que JÁ entrou (que sobrevive ao recarregar) e a frase
// honesta sobre o que o brand book não resolve.

import { Fragment, useCallback, useEffect, useState } from "react";
import { EnvioDeMaterial } from "@/components/portal/EnvioDeMaterial";
import {
  O_QUE_O_BRAND_BOOK_ALCANCA,
  O_QUE_O_BRAND_BOOK_NAO_FECHA,
  ROTULO_DO_ESTADO,
  TOM_DO_ESTADO,
  type MaterialNaTela,
} from "@/lib/agency/brand/materiais-da-marca";
import { Carregando, Erro, Etiqueta, Icone, TituloDeSecao, Vazio, dataCurta } from "./pecas";

/** O ícone de cada categoria — o mesmo da caixa onde o cliente soltou. Ver a
 *  mesma lista em `CaixasDeMaterial`: se um dia divergirem, o cliente vai achar
 *  que o arquivo mudou de lugar. */
const ICONE_DA_CATEGORIA: Record<string, string> = {
  manual_de_marca: "📘",
  logo: "🎨",
  fonte: "🔤",
  foto_produto: "📸",
  foto_local: "🏠",
  foto_equipe: "👥",
  video: "🎬",
  referencia: "💡",
  outro: "📦",
  captura_de_tela: "🖥️",
};

function tamanhoLegivel(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * ── O PEDIDO DE MATERIAL, DO LADO DO CLIENTE (25/08/2026) ───────────────────
 *
 * A esteira mandava a cliente *"responder os 5 pedidos que te mandamos na
 * conversa"* e o portal não tinha onde. `MaterialRequest` só era lida pelas
 * telas da EQUIPE. A tela cobrava do cliente uma resposta que ele não tinha
 * onde dar.
 *
 * Mora AQUI, e não numa aba nova, porque é aqui que ele já vem mandar arquivo:
 * a pergunta e a porta de responder no mesmo lugar, não em duas telas.
 */
export interface PedidoDeMaterialNaTela {
  id: string;
  tipo: string;
  descricao: string;
  pedidoEm: string;
}

function PedidosDeMaterial({
  pedidos,
  token,
  aoResponder,
}: {
  pedidos: PedidoDeMaterialNaTela[];
  token: string;
  aoResponder: () => void;
}) {
  const [aberto, setAberto] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (pedidos.length === 0) return null;

  async function mandar(pedidoId: string) {
    setEnviando(true);
    setErro(null);
    try {
      const res = await fetch("/api/portal/materiais", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pedidoId, resposta: texto, ...(token ? { token } : {}) }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; pergunta?: string };
      if (!res.ok) {
        setErro(j.pergunta ?? j.error ?? "Não consegui registrar sua resposta agora.");
        return;
      }
      setAberto(null);
      setTexto("");
      aoResponder();
    } catch {
      setErro("A conexão caiu. Sua resposta NÃO foi registrada — tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <article className="cp-card" style={{ marginTop: 13 }}>
      <TituloDeSecao
        sobretitulo="A PRODUÇÃO ESTÁ ESPERANDO"
        titulo={pedidos.length === 1 ? "Uma coisa sua para a gente seguir" : `${pedidos.length} coisas suas para a gente seguir`}
      />
      <p style={{ marginTop: 13, color: "var(--cp-muted)" }}>
        Cada item abaixo travou uma parte da produção. Você pode mandar o arquivo na caixa
        acima, ou responder aqui em uma frase — “não tenho”, “já está no Drive” e “mandei
        agora” também são respostas, e todas destravam.
      </p>
      <ul style={{ marginTop: 13, listStyle: "none", padding: 0, display: "grid", gap: 10 }}>
        {pedidos.map((p) => (
          <li key={p.id} style={{ border: "1px solid var(--cp-border)", borderRadius: 10, padding: "12px 14px" }}>
            <b style={{ display: "block", fontSize: 13.5, lineHeight: 1.4 }}>{p.descricao}</b>
            <small style={{ color: "var(--cp-muted)" }}>
              {ICONE_DA_CATEGORIA[p.tipo] ?? "📦"} pedido em {new Date(p.pedidoEm).toLocaleDateString("pt-BR")}
            </small>
            {aberto === p.id ? (
              <div style={{ marginTop: 10 }}>
                <textarea
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  rows={2}
                  placeholder="Ex.: já mandei na caixa acima / não tenho esse material / usa o que está no Drive"
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--cp-border)", fontSize: 13, resize: "none" }}
                />
                <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                  <button
                    onClick={() => void mandar(p.id)}
                    disabled={enviando || texto.trim().length < 3}
                    style={{ touchAction: "manipulation" }}
                  >
                    Responder
                  </button>
                  <button onClick={() => { setAberto(null); setErro(null); }} style={{ touchAction: "manipulation" }}>
                    Cancelar
                  </button>
                </div>
                {erro && <small style={{ color: "#B91C1C", display: "block", marginTop: 6 }}>{erro}</small>}
              </div>
            ) : (
              <button
                onClick={() => { setAberto(p.id); setTexto(""); setErro(null); }}
                style={{ marginTop: 10, touchAction: "manipulation" }}
              >
                Responder este
              </button>
            )}
          </li>
        ))}
      </ul>
    </article>
  );
}

export function MateriaisDaMarca({ token }: { token: string }) {
  const [materiais, setMateriais] = useState<MaterialNaTela[] | null>(null);
  const [pedidos, setPedidos] = useState<PedidoDeMaterialNaTela[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      // A4: sem token na URL quando o cookie httpOnly já autentica.
      const url = token ? `/api/portal/materiais?token=${encodeURIComponent(token)}` : "/api/portal/materiais";
      const res = await fetch(url);
      const dados = (await res.json()) as { materiais?: MaterialNaTela[]; pedidos?: PedidoDeMaterialNaTela[]; error?: string };
      if (!res.ok) {
        // ERRO É ERRO. Cair para lista vazia aqui faria a tela dizer "você ainda
        // não mandou nada" para quem já mandou — e ele reenviaria tudo.
        setErro(dados.error ?? "Não consegui listar seus materiais agora.");
        setMateriais(null);
        return;
      }
      setMateriais(dados.materiais ?? []);
      setPedidos(Array.isArray(dados.pedidos) ? dados.pedidos : []);
    } catch {
      setErro("A conexão caiu ao buscar seus materiais. Eles não se perderam.");
      setMateriais(null);
    } finally {
      setCarregando(false);
    }
  }, [token]);

  useEffect(() => { void carregar(); }, [carregar]);

  // Agrupado pela categoria que o próprio cliente escolheu na caixa. A ordem é
  // a de chegada da lista (mais novo primeiro), então a categoria mexida por
  // último aparece no topo — que é onde ele espera achar o que acabou de mandar.
  const grupos: Array<{ categoria: string; papel: string | null; itens: MaterialNaTela[] }> = [];
  for (const m of materiais ?? []) {
    const atual = grupos.find((g) => g.categoria === m.categoria);
    if (atual) atual.itens.push(m);
    else grupos.push({ categoria: m.categoria, papel: m.papel, itens: [m] });
  }

  const brandBooks = (materiais ?? []).filter((m) => m.papel === "manual_de_marca");

  return (
    <>
      {/* PRIMEIRO o que a casa espera DELE. O que ele já mandou vem depois:
          quem abre esta tela porque foi cobrado precisa achar a porta antes de
          rolar por uma lista de arquivos antigos. */}
      <PedidosDeMaterial pedidos={pedidos} token={token} aoResponder={() => void carregar()} />

      <article className="cp-card" style={{ marginTop: 13 }}>
        <TituloDeSecao
          sobretitulo="MATERIAL DA MARCA"
          titulo="Brand Book e materiais da marca"
        />

        <p style={{ marginTop: 13, color: "var(--cp-muted)" }}>
          Este é o único lugar onde o material da sua marca precisa ser enviado — e onde
          ele fica guardado. Escolha a caixa que descreve o arquivo: a caixa já diz o que
          ele é, e é isso que permite a equipe usá-lo no que produz para você.
        </p>

        {/* ── A FRASE QUE IMPEDE A EXPECTATIVA ERRADA ────────────────────────
            Ela vem ANTES do envio, de propósito. Depois já é tarde: o cliente
            manda o PDF, vê a ficha andar três pontos, e conclui que o sistema
            comeu o arquivo dele. Ver `proposta-do-brand-book.ts`. */}
        <div className="cp-approval-note" style={{ marginTop: 13, borderRadius: 10 }}>
          <i className="cp-icon" aria-hidden>ⓘ</i>
          <span>
            <b>{O_QUE_O_BRAND_BOOK_ALCANCA}</b>
            <small>{O_QUE_O_BRAND_BOOK_NAO_FECHA}</small>
          </span>
        </div>

        <div style={{ marginTop: 15 }}>
          <EnvioDeMaterial
            token={token}
            titulo="Enviar Brand Book, logos e materiais"
            descricao="Solte cada arquivo na caixa que descreve o que ele é. Aceita imagem, vídeo, PDF e documento, até 120 MB cada."
            // Chegou material novo: a lista guardada recarrega na hora, para o
            // cliente ver o arquivo dele no lugar definitivo — e não só no
            // "recebemos" que some quando ele atualiza a página.
            aoEnviar={() => void carregar()}
          />
        </div>
      </article>

      <article className="cp-card cp-delivery-list" style={{ marginTop: 13 }}>
        <TituloDeSecao
          sobretitulo="GUARDADO COM A EQUIPE"
          titulo="O que você já enviou"
          acao={
            <button onClick={() => void carregar()} style={{ touchAction: "manipulation" }}>
              Atualizar
            </button>
          }
        />

        {/* Os três estados obrigatórios, nesta ordem. */}
        {carregando && materiais === null && !erro && (
          <div style={{ marginTop: 15 }}>
            <Carregando texto="Buscando o que você já enviou…" />
          </div>
        )}

        {erro && (
          <div style={{ marginTop: 15 }}>
            <Erro
              titulo="Não consegui mostrar seus materiais agora"
              texto={`${erro} Nada do que você enviou foi perdido.`}
              aoTentarDeNovo={() => void carregar()}
            />
          </div>
        )}

        {!carregando && !erro && materiais !== null && materiais.length === 0 && (
          <div style={{ marginTop: 15 }}>
            <Vazio
              icone="📘"
              titulo="Você ainda não enviou nenhum material"
              texto="Comece pelo Brand Book, se você tiver um. Se não tiver, o logo já ajuda — e o resto pode vir depois, aos poucos."
            />
          </div>
        )}

        {/* ── FRAGMENTO, NUNCA <div> — a moldura da referência depende disso ──
            O V12 estiliza a linha por FILHO DIRETO (`.cp-delivery-list>button`).
            Agrupar os botões dentro de uma <div> por categoria os tirava dessa
            seleção e a linha inteira perdia o desenho: nome, data e etiqueta
            colavam numa frase só. Descoberto na captura de 1280, não no código. */}
        {!erro && grupos.map((g) => (
          <Fragment key={g.categoria}>
            <p
              style={{
                marginTop: 15, marginBottom: 4, fontWeight: 700,
                fontSize: 11, letterSpacing: "0.04em", textTransform: "uppercase",
                color: "var(--cp-muted)",
              }}
            >
              {g.categoria} · {g.itens.length === 1 ? "1 arquivo" : `${g.itens.length} arquivos`}
            </p>
            {g.itens.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => { if (m.url) window.open(m.url, "_blank", "noopener,noreferrer"); }}
                title={m.url ? `Abrir ${m.nome}` : "Este arquivo ainda não está disponível para abrir"}
                style={{ touchAction: "manipulation", opacity: m.url ? 1 : 0.65 }}
              >
                <Icone>{(m.papel && ICONE_DA_CATEGORIA[m.papel]) ?? "▦"}</Icone>
                <span style={{ minWidth: 0 }}>
                  <small>
                    {m.categoria}
                    {/* A VERSÃO só é dita onde ela quer dizer alguma coisa: o
                        brand book é o que se SUBSTITUI. Numerar cinco fotos de
                        produto como "v1…v5" faria o número parecer histórico de
                        uma coisa só, que é mentira. */}
                    {m.papel === "manual_de_marca" && brandBooks.length > 1
                      ? ` · versão ${m.versao}${m.vigente ? " (atual)" : ""}`
                      : ""}
                  </small>
                  {/* Nome de arquivo não tem espaço para quebrar. Sem isto, um
                      "brand-book-identidade-2026-final.pdf" estoura a linha e
                      empurra a etiqueta para fora da tela de 375. */}
                  <b style={{ overflowWrap: "anywhere" }}>{m.nome}</b>
                  <em>{[dataCurta(m.enviadoEm), tamanhoLegivel(m.tamanhoBytes)].filter(Boolean).join(" · ")}</em>
                </span>
                <Etiqueta tom={TOM_DO_ESTADO[m.estado]}>{ROTULO_DO_ESTADO[m.estado]}</Etiqueta>
              </button>
            ))}
            {/* ── A EXPLICAÇÃO FICA FORA DA LINHA, E ESSE É O PONTO ──────────
                A linha do V12 tem ALTURA FIXA (68px). A frase de estado — "seu
                arquivo está guardado, a leitura não funcionou" — ocupa três
                linhas num celular de 375, estourava a altura e as linhas se
                sobrepunham umas às outras.
                Encurtar a frase resolveria o desenho e estragaria o recado, que
                é o que o cliente precisa ler. Então a linha continua sendo a
                linha do V12, e a explicação ganha o espaço dela embaixo. */}
            {g.itens.filter((m) => m.detalhe).map((m) => (
              <p
                key={`${m.id}-detalhe`}
                style={{ margin: "0 0 4px", paddingLeft: 3, color: "var(--cp-muted)" }}
              >
                <b style={{ overflowWrap: "anywhere" }}>{m.nome}</b> — {m.detalhe}
              </p>
            ))}
          </Fragment>
        ))}

        {brandBooks.length > 1 && (
          <p style={{ marginTop: 13, color: "var(--cp-muted)" }}>
            Você já mandou {brandBooks.length} versões do Brand Book. A mais recente é a que
            vale — as anteriores continuam aqui, porque histórico de marca não se apaga.
          </p>
        )}
      </article>
    </>
  );
}
