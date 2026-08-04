"use client";

// ReconciliarCarrosseis — a versão clicável do backfill de telas de carrossel.
//
// O problema que ela resolve, em uma frase: as telas dos carrosséis estão nos
// Arquivos do cliente, mas nada liga tela a post — então o portal mostra só a
// capa e o cliente acha que recebeu uma imagem quando recebeu seis.
//
// ── O fluxo é de DOIS passos, e a ordem não é negociável ────────────────────
//  1. ENSAIO (sempre primeiro). Só lê. Mostra o que casou, por qual método,
//     o que foi excluído com motivo e o que sobrou.
//  2. APLICAR. O botão só nasce DEPOIS do ensaio, diz quantos posts serão
//     alterados, e some se o ensaio tiver qualquer casamento por ORDEM.
//
// Casamento por ORDEM é posicional (chute) e vira aviso vermelho + trava: quem
// realmente precisar roda o script à mão, lendo o log linha a linha.

import { useState } from "react";

// ─── O contrato com /api/admin/backfill-carrossel ────────────────────────────

type Via = "esteira" | "nome-CnTm" | "ordem";

interface TelaNaTela {
  pos: number;
  fileName: string;
  via: Via;
  url: string;
}

interface PostNaTela {
  id: string;
  idx: number;
  caption: string;
  telasAtuais: number;
  telas: TelaNaTela[];
  acao: "atualizar" | "ja-tem-telas" | "sem-telas-suficientes";
}

interface Ensaio {
  ok: true;
  cliente: { id: string; nome: string };
  resumo: {
    carrosseis: number;
    imagens: number;
    midiasComDono: number;
    postsQueSeraoAtualizados: number;
    postsJaComTelas: number;
    postsSemTelasSuficientes: number;
    telasCasadas: number;
    telasQueSeraoLigadas: number;
    excluidas: number;
    semCasar: number;
  };
  posts: PostNaTela[];
  excluidos: { assetId: string; fileName: string; motivo: string }[];
  naoCasados: { assetId: string; fileName: string; createdAt: string | null }[];
  temCasamentoPorOrdem: boolean;
  aplicavel: boolean;
  motivoNaoAplicavel: string | null;
}

interface Abortado {
  ok: false;
  codigo: "sem-posts" | "sem-data";
  titulo: string;
  detalhe: string;
  oQueFazer: string;
  semData: { id: string; caption: string }[];
}

type Estado =
  | { fase: "inicio" }
  | { fase: "carregando" }
  | { fase: "aplicando"; ensaio: Ensaio }
  | { fase: "ensaio"; ensaio: Ensaio }
  | { fase: "abortado"; motivo: Abortado }
  | { fase: "aplicado"; posts: number; telas: number }
  | { fase: "erro"; mensagem: string };

// ─── Rótulos em português de gente ───────────────────────────────────────────

const ROTULO_VIA: Record<Via, { texto: string; ajuda: string; classe: string }> = {
  esteira: {
    texto: "nome da esteira",
    ajuda: "O próprio sistema gerou o arquivo com o código do post no nome. Não há dúvida.",
    classe: "bg-[var(--success-bg)] text-[var(--success)]",
  },
  "nome-CnTm": {
    texto: "nome C/T",
    ajuda: "O arquivo diz de qual carrossel e de qual tela é (ex.: c2t3), na ordem do calendário.",
    classe: "bg-[var(--info-bg)] text-[var(--info)]",
  },
  ordem: {
    texto: "ordem de upload",
    ajuda: "Casamento posicional — sem nenhuma evidência no nome. Esta tela não aplica.",
    classe: "bg-[var(--danger-bg)] text-[var(--danger)]",
  },
};

const ROTULO_ACAO: Record<PostNaTela["acao"], { texto: string; classe: string }> = {
  atualizar: { texto: "vai receber as telas", classe: "bg-[var(--success-bg)] text-[var(--success)]" },
  "ja-tem-telas": { texto: "já tem telas — não muda", classe: "bg-[var(--accent-light)] text-[var(--text-secondary)]" },
  "sem-telas-suficientes": { texto: "nenhuma tela encontrada", classe: "bg-[var(--warning-bg)] text-[var(--warning)]" },
};

function plural(n: number, um: string, muitos: string) {
  return `${n} ${n === 1 ? um : muitos}`;
}

// ─── Peças visuais ───────────────────────────────────────────────────────────

function Numero({ rotulo, valor, tom = "normal" }: { rotulo: string; valor: number; tom?: "normal" | "forte" }) {
  return (
    <div className="rounded-[8px] border border-[var(--border)] px-3.5 py-3">
      <div className="text-[12px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)] leading-tight">
        {rotulo}
      </div>
      <div
        className={`mono-num text-[22px] font-bold leading-none mt-1.5 ${
          tom === "forte" && valor > 0 ? "text-[var(--success)]" : "text-[var(--text-primary)]"
        }`}
      >
        {valor}
      </div>
    </div>
  );
}

function Lista({
  titulo,
  ajuda,
  itens,
}: {
  titulo: string;
  ajuda: string;
  itens: { chave: string; nome: string; nota: string }[];
}) {
  if (itens.length === 0) return null;
  return (
    <details className="rounded-[8px] border border-[var(--border)] bg-[var(--bg-elevated)] overflow-hidden">
      <summary className="cursor-pointer list-none px-3.5 py-2.5 text-[13px] font-medium text-[var(--text-primary)] hover:bg-[var(--accent-light)] transition-colors">
        {titulo} <span className="mono-num text-[var(--text-muted)]">({itens.length})</span>
        <span className="block text-[12px] font-normal text-[var(--text-muted)] mt-0.5">{ajuda}</span>
      </summary>
      <ul className="border-t border-[var(--border)] divide-y divide-[var(--border)]">
        {itens.map((i) => (
          <li key={i.chave} className="px-3.5 py-2 text-[13px] flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-[var(--text-primary)] break-words">{i.nome}</span>
            <span className="text-[12px] text-[var(--text-muted)]">— {i.nota}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

// ─── Componente ──────────────────────────────────────────────────────────────

export default function ReconciliarCarrosseis({ clientId }: { clientId: string }) {
  const [estado, setEstado] = useState<Estado>({ fase: "inicio" });

  async function rodarEnsaio() {
    setEstado({ fase: "carregando" });
    try {
      const res = await fetch(`/api/admin/backfill-carrossel?clientId=${encodeURIComponent(clientId)}`, {
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json) {
        setEstado({
          fase: "erro",
          mensagem:
            res.status === 403
              ? "Só o perfil Master pode reconciliar carrosséis."
              : (json?.error as string) ?? "Não consegui montar o ensaio agora.",
        });
        return;
      }
      if (json.ok === false) {
        setEstado({ fase: "abortado", motivo: json as Abortado });
        return;
      }
      setEstado({ fase: "ensaio", ensaio: json as Ensaio });
    } catch {
      setEstado({ fase: "erro", mensagem: "Sem conexão com o servidor. Tente de novo." });
    }
  }

  async function aplicar(ensaio: Ensaio) {
    setEstado({ fase: "aplicando", ensaio });
    try {
      const res = await fetch("/api/admin/backfill-carrossel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, confirmar: "APLICAR" }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setEstado({
          fase: "erro",
          mensagem:
            (json?.error as string) ??
            "A aplicação foi recusada e nada foi alterado. Rode o ensaio de novo para ver o estado atual.",
        });
        return;
      }
      setEstado({ fase: "aplicado", posts: json.postsAtualizados ?? 0, telas: json.telasLigadas ?? 0 });
    } catch {
      setEstado({ fase: "erro", mensagem: "Sem conexão com o servidor. Nada foi alterado." });
    }
  }

  const emEnsaio = estado.fase === "ensaio" || estado.fase === "aplicando";
  const ensaio = emEnsaio ? estado.ensaio : null;

  return (
    <section className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 border-b border-[var(--border)]">
        <div className="min-w-0">
          <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">Reconciliar telas dos carrosséis</h2>
          <p className="text-[13px] text-[var(--text-secondary)] mt-1 max-w-[62ch] leading-relaxed">
            Liga as telas que estão nos Arquivos do cliente aos posts de carrossel. Sem esse vínculo,
            o portal mostra só a capa — e o cliente acha que recebeu uma imagem quando recebeu várias.
          </p>
        </div>
        <button
          onClick={rodarEnsaio}
          disabled={estado.fase === "carregando" || estado.fase === "aplicando"}
          className="shrink-0 h-9 px-4 rounded-[7px] bg-[var(--navy)] text-white text-[13px] font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {estado.fase === "inicio" ? "Rodar ensaio" : "Rodar ensaio de novo"}
        </button>
      </div>

      {/* ── Passo 0: convite ─────────────────────────────────────────────── */}
      {estado.fase === "inicio" && (
        <div className="px-5 py-8 text-center">
          {/* Marca geométrica em vez de emoji: a paleta da casa é sóbria e o
              emoji entra colorido, fora de qualquer token. */}
          <span
            aria-hidden
            className="mx-auto mb-2.5 block w-8 h-8 rounded-[8px] border border-[var(--border-strong)] bg-[var(--accent-light)]"
          />
          <p className="text-[14px] font-medium text-[var(--text-primary)]">Comece pelo ensaio</p>
          <p className="text-[13px] text-[var(--text-muted)] mt-1 max-w-[54ch] mx-auto leading-relaxed">
            O ensaio <b>não altera nada</b>. Ele mostra quais telas seriam ligadas a quais posts,
            o que ficou de fora e por quê. Só depois de ver o ensaio o botão de aplicar aparece.
          </p>
        </div>
      )}

      {/* ── Carregando ───────────────────────────────────────────────────── */}
      {estado.fase === "carregando" && (
        <div role="status" aria-live="polite" className="px-5 py-4 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded-[8px] bg-[var(--accent)] animate-pulse" />
            ))}
          </div>
          <div className="h-28 rounded-[8px] bg-[var(--accent)] animate-pulse" />
          <span className="sr-only">Montando o ensaio…</span>
        </div>
      )}

      {/* ── Abortado: falta data / nenhum carrossel ──────────────────────── */}
      {estado.fase === "abortado" && (
        <div className="px-5 py-6">
          <div
            className={`rounded-[8px] border px-4 py-3.5 ${
              estado.motivo.codigo === "sem-data"
                ? "border-[var(--warning)]/30 bg-[var(--warning-bg)]"
                : "border-[var(--border)] bg-[var(--bg-elevated)]"
            }`}
          >
            <p className="text-[14px] font-semibold text-[var(--text-primary)]">{estado.motivo.titulo}</p>
            <p className="text-[13px] text-[var(--text-secondary)] mt-1.5 max-w-[62ch] leading-relaxed">
              {estado.motivo.detalhe}
            </p>
            <p className="text-[13px] font-medium text-[var(--text-primary)] mt-2">{estado.motivo.oQueFazer}</p>
          </div>
          {estado.motivo.semData.length > 0 && (
            <ul className="mt-3 border border-[var(--border)] rounded-[8px] divide-y divide-[var(--border)]">
              {estado.motivo.semData.map((p) => (
                <li key={p.id} className="px-3.5 py-2 text-[13px] text-[var(--text-primary)]">
                  {p.caption || <span className="italic text-[var(--text-muted)]">sem legenda</span>}
                  <span className="block text-[12px] text-[var(--text-muted)] mt-0.5">sem data no calendário</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── Erro ─────────────────────────────────────────────────────────── */}
      {estado.fase === "erro" && (
        <div role="alert" className="px-5 py-6 text-center">
          <p className="text-[13px] font-medium text-[var(--text-primary)] max-w-[54ch] mx-auto">{estado.mensagem}</p>
          <button
            onClick={rodarEnsaio}
            className="mt-3 h-9 px-4 rounded-[7px] border border-[var(--border-strong)] text-[13px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
          >
            Rodar ensaio de novo
          </button>
        </div>
      )}

      {/* ── Aplicado ─────────────────────────────────────────────────────── */}
      {estado.fase === "aplicado" && (
        <div className="px-5 py-8 text-center">
          <div className="rounded-[8px] border border-[var(--success)]/30 bg-[var(--success-bg)] px-4 py-4 max-w-[54ch] mx-auto">
            <p className="text-[14px] font-semibold text-[var(--success)]">
              Pronto — {plural(estado.posts, "carrossel atualizado", "carrosséis atualizados")}
            </p>
            <p className="text-[13px] text-[var(--text-secondary)] mt-1.5 leading-relaxed">
              {plural(estado.telas, "tela ligada", "telas ligadas")} aos posts. O cliente já vê o carrossel
              completo no portal.
            </p>
          </div>
          <button
            onClick={rodarEnsaio}
            className="mt-3 h-9 px-4 rounded-[7px] border border-[var(--border-strong)] text-[13px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
          >
            Conferir com um novo ensaio
          </button>
        </div>
      )}

      {/* ── O ensaio ─────────────────────────────────────────────────────── */}
      {ensaio && (
        <div className="px-5 py-4 space-y-4">
          <p className="text-[13px] text-[var(--text-secondary)]">
            <b className="text-[var(--text-primary)]">Ensaio — nada foi alterado.</b> Encontrei{" "}
            {plural(ensaio.resumo.carrosseis, "carrossel", "carrosséis")} e{" "}
            {plural(ensaio.resumo.imagens, "imagem", "imagens")} nos Arquivos de {ensaio.cliente.nome}.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Numero rotulo="Serão alterados" valor={ensaio.resumo.postsQueSeraoAtualizados} tom="forte" />
            <Numero rotulo="Telas casadas" valor={ensaio.resumo.telasCasadas} />
            <Numero rotulo="Já com telas" valor={ensaio.resumo.postsJaComTelas} />
            <Numero rotulo="Sem casar" valor={ensaio.resumo.semCasar} />
          </div>

          {/* A trava vermelha: casamento posicional não passa por esta tela. */}
          {ensaio.temCasamentoPorOrdem && (
            <div
              role="alert"
              className="rounded-[8px] border border-[var(--danger)]/30 bg-[var(--danger-bg)] px-4 py-3.5"
            >
              <p className="text-[13px] font-semibold text-[var(--danger)]">
                Bloqueado: o ensaio casou telas por ordem de upload
              </p>
              <p className="text-[13px] text-[var(--text-secondary)] mt-1.5 max-w-[62ch] leading-relaxed">
                Casar por ordem é chute posicional — o nome do arquivo não diz de qual carrossel ele é.
                É assim que um logo vira tela de carrossel no portal do cliente. Esta tela não aplica esse
                tipo de casamento; corrija os nomes dos arquivos ou peça para a equipe rodar o script à mão.
              </p>
            </div>
          )}

          {/* Nada a fazer */}
          {!ensaio.aplicavel && !ensaio.temCasamentoPorOrdem && (
            <div className="rounded-[8px] border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3.5">
              <p className="text-[13px] font-semibold text-[var(--text-primary)]">Não há o que aplicar</p>
              <p className="text-[13px] text-[var(--text-secondary)] mt-1.5 max-w-[62ch] leading-relaxed">
                {ensaio.resumo.postsJaComTelas === ensaio.resumo.carrosseis
                  ? "Todos os carrosséis já têm telas ligadas — o portal já mostra o conteúdo completo."
                  : "Nenhum post ganharia telas novas. Carrossel precisa de pelo menos 2 telas reconhecidas pelo nome do arquivo."}
              </p>
            </div>
          )}

          {/* Post a post */}
          <div className="border border-[var(--border)] rounded-[8px] overflow-hidden">
            <h3 className="px-3.5 py-2.5 text-[12px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)] bg-[var(--bg-elevated)] border-b border-[var(--border)]">
              O que acontece com cada carrossel
            </h3>
            <ul className="divide-y divide-[var(--border)]">
              {ensaio.posts.map((p) => {
                // Com a trava de ORDEM ligada nada será aplicado — dizer "vai
                // receber as telas" em verde seria prometer o que não acontece.
                const acao =
                  p.acao === "atualizar" && ensaio.temCasamentoPorOrdem
                    ? { texto: "bloqueado — não será aplicado", classe: "bg-[var(--danger-bg)] text-[var(--danger)]" }
                    : ROTULO_ACAO[p.acao];
                return (
                  <li key={p.id} className="px-3.5 py-3">
                    {/* No celular o rótulo desce para a própria linha: encaixá-lo
                        ao lado de uma legenda que quebra em 3 linhas deixa a
                        coluna ilegível a 375px. */}
                    <div className="flex flex-col sm:flex-row sm:items-baseline gap-x-2 gap-y-1.5">
                      <p className="text-[13px] text-[var(--text-primary)] flex-1 leading-snug">
                        <span className="mono-num text-[12px] font-semibold text-[var(--text-muted)] mr-1.5">
                          #{p.idx}
                        </span>
                        {p.caption
                          ? `${p.caption}${p.caption.length >= 50 ? "…" : ""}`
                          : <span className="italic text-[var(--text-muted)]">sem legenda</span>}
                      </p>
                      <span
                        className={`self-start shrink-0 h-5 px-2 rounded-full text-[12px] font-medium leading-5 ${acao.classe}`}
                      >
                        {acao.texto}
                      </span>
                    </div>
                    {/* Post intocado não lista telas: mostrar um casamento que
                        NÃO vai acontecer faz o leitor achar que vai. */}
                    {p.acao === "ja-tem-telas" && (
                      <p className="mt-1.5 text-[13px] text-[var(--text-muted)] leading-snug">
                        Já tem {plural(p.telasAtuais, "tela ligada", "telas ligadas")}. Esta tela nunca
                        sobrescreve telas existentes.
                      </p>
                    )}
                    {p.acao === "sem-telas-suficientes" && (
                      <p className="mt-1.5 text-[13px] text-[var(--text-muted)] leading-snug">
                        Nenhum arquivo nos Arquivos do cliente tem nome que o identifique como tela deste
                        carrossel.
                      </p>
                    )}
                    {p.acao === "atualizar" && p.telas.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {p.telas.map((t) => {
                          const via = ROTULO_VIA[t.via];
                          return (
                            <li
                              key={`${t.pos}-${t.fileName}`}
                              className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[13px]"
                            >
                              <span className="mono-num text-[12px] text-[var(--text-muted)] w-[52px] shrink-0">
                                tela {t.pos}
                              </span>
                              <span className="text-[var(--text-secondary)] break-words flex-1 min-w-[12ch]">
                                {t.fileName}
                              </span>
                              <span
                                title={via.ajuda}
                                className={`shrink-0 h-5 px-2 rounded-full text-[12px] font-medium leading-5 ${via.classe}`}
                              >
                                {via.texto}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          <Lista
            titulo="Excluídas do casamento"
            ajuda="Arquivos que a regra recusa de propósito — logo, marca, ou material que já pertence a outra entrega."
            itens={ensaio.excluidos.map((e) => ({ chave: e.assetId, nome: e.fileName, nota: e.motivo }))}
          />
          <Lista
            titulo="Sobraram sem casar"
            ajuda="Imagens livres cujo nome não diz de qual carrossel elas são. Ficam como estão."
            itens={ensaio.naoCasados.map((e) => ({ chave: e.assetId, nome: e.fileName, nota: "nome não identifica o carrossel" }))}
          />

          {/* ── Passo 2: aplicar ────────────────────────────────────────── */}
          {ensaio.aplicavel && (
            <div className="rounded-[8px] border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-4 py-3.5 flex flex-wrap items-center justify-between gap-3">
              <p className="text-[13px] text-[var(--text-secondary)] max-w-[52ch] leading-relaxed">
                Ao aplicar,{" "}
                <b className="text-[var(--text-primary)]">
                  {plural(ensaio.resumo.postsQueSeraoAtualizados, "post será alterado", "posts serão alterados")}
                </b>{" "}
                e {plural(ensaio.resumo.telasQueSeraoLigadas, "tela ficará ligada", "telas ficarão ligadas")} a eles.
                Posts que já têm telas não são tocados.
              </p>
              <button
                onClick={() => aplicar(ensaio)}
                disabled={estado.fase === "aplicando"}
                className="shrink-0 h-9 px-4 rounded-[7px] bg-[var(--navy)] text-white text-[13px] font-medium hover:opacity-90 disabled:opacity-60 transition-opacity"
              >
                {estado.fase === "aplicando"
                  ? "Aplicando…"
                  : `Aplicar em ${plural(ensaio.resumo.postsQueSeraoAtualizados, "post", "posts")}`}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
