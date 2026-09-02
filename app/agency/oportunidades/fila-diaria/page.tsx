"use client";

// /agency/oportunidades/fila-diaria — A FILA DIÁRIA DE LIBERAÇÃO.
//
// Despacho do PM: as entregas do dia (arquivos aprovados pela Qualidade,
// esperando para sair na Célula de Prospecção do 99Freelas) se acumulam num
// lugar só. O CEO revisa e libera em bloco, uma vez por dia — não uma
// interrupção por oportunidade.
//
// A lógica de negócio inteira — a montagem da fila e a liberação em bloco,
// item a item, com as mesmas conferências de um envio individual — já existe
// e já é testada em `lib/agency/celula/fila-diaria.ts`. Esta tela só CHAMA a
// rota (`/api/agency/oportunidades/fila-diaria`); ela não reimplementa nada
// disso.
//
// ── OS IMPEDIDOS NUNCA SOMEM ──────────────────────────────────────────────
// A rota traz os itens impedidos DE PROPÓSITO — esconder o que está quebrado
// deixaria a lista bonita e a entrega sumiria sem ninguém perceber. Aqui eles
// aparecem, sem checkbox, com o motivo em português — nunca um código cru.
//
// ── A MEDIÇÃO DO "NÃO SELECIONADO" ────────────────────────────────────────
// `prontosApresentados` vai sempre com TODOS os itens prontos que estavam na
// tela no momento do clique — não só os selecionados. É o dado que sustenta a
// medição de quantas correções só o humano fez (ver o comentário em
// `lib/agency/celula/fila-diaria.ts`).
//
// ── O GAP DE 02/09/2026, FECHADO ──────────────────────────────────────────
// A rota exige o papel `gerente_de_atendimento` — lido de `User.papelNaCelula`
// (`lib/agency/celula/papel-do-usuario.ts`), nunca de um header forjável —
// para autorizar o POST. Até 02/09/2026 não existia, em nenhuma tela do
// produto, um jeito de a pessoa logada RECEBER esse papel: a coluna existia,
// a regra existia, e a única porta de escrita era um script de terminal.
// Agora existe: `/agency/celula/papeis` (só master atribui, master/diretor/PM
// consultam). Esta tela continua sem inventar nada por conta própria — ela só
// chama a rota e mostra o que o servidor responde; quem grava o papel é a
// outra tela. Por isso o botão "Liberar selecionados" ainda pode devolver 403
// com `regra: "sem_permissao"` para quem não tiver o papel — a tela trata
// isso como um estado de erro normal, mostrando o motivo exato que o servidor
// manda, com o caminho para resolver.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import EmptyState from "@/components/agency/ui/EmptyState";
import Button from "@/components/agency/ui/Button";

interface ItemDaFila {
  arquivoId: string;
  nome: string;
  mimeType: string;
  tamanhoBytes: number;
  versao: number;
  oportunidadeId: string;
  clienteId: string | null;
  projetoId: string | null;
  registradoEm: string;
  pronto: boolean;
  impedimento: string | null;
}

interface FilaResposta {
  dia: string;
  itens: ItemDaFila[];
  prontos: number;
  impedidos: number;
}

interface RecusaExibida {
  arquivoId: string;
  nome: string;
  motivo: string | null;
}

interface ResultadoExibido {
  liberadosCount: number;
  recusados: RecusaExibida[];
}

const ROTA = "/api/agency/oportunidades/fila-diaria";

function formatarTamanho(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "tamanho desconhecido";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function extensaoDoMime(mime: string): string {
  const parte = mime.split("/")[1] ?? mime;
  return parte.split(";")[0].toUpperCase();
}

function formatarData(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "data inválida";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function formatarDia(diaIso: string): string {
  const d = new Date(`${diaIso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return diaIso;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

export default function FilaDiariaPage() {
  const [itens, setItens] = useState<ItemDaFila[]>([]);
  const [dia, setDia] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  // `true` quando o motivo do erro é de PERMISSÃO/PAPEL, não de rede — clicar
  // de novo devolve exatamente o mesmo erro pra sempre. Achado do `experiencia`:
  // sem essa distinção, "Tentar de novo" prende a pessoa num laço que nunca
  // resolve, porque o botão promete um conserto transitório que não existe.
  const [erroSemSolucaoAqui, setErroSemSolucaoAqui] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [liberando, setLiberando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoExibido | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    setErroSemSolucaoAqui(false);
    try {
      const r = await fetch(ROTA, { cache: "no-store" });
      if (!r.ok) {
        // A mensagem do servidor é mostrada como veio quando existe: ela sabe
        // POR QUE barrou (papel, sessão), e trocá-la por "erro genérico"
        // apagaria justamente a informação que resolve o problema.
        const corpo = (await r.json().catch(() => null)) as { error?: string; regra?: string } | null;
        setErro(corpo?.error ?? `não consegui carregar a fila de hoje (HTTP ${r.status}).`);
        setErroSemSolucaoAqui(corpo?.regra === "fora_da_celula" || r.status === 403);
        return;
      }
      const json = (await r.json()) as FilaResposta;
      setItens(Array.isArray(json.itens) ? json.itens : []);
      setDia(json.dia ?? null);
    } catch {
      setErro("não consegui falar com o servidor. Verifique a conexão e tente de novo.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const prontos = useMemo(() => itens.filter((i) => i.pronto), [itens]);
  const impedidos = useMemo(() => itens.filter((i) => !i.pronto), [itens]);
  const todosProntosSelecionados = prontos.length > 0 && prontos.every((i) => selecionados.has(i.arquivoId));

  function alternarItem(arquivoId: string) {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(arquivoId)) novo.delete(arquivoId);
      else novo.add(arquivoId);
      return novo;
    });
  }

  function alternarTodos() {
    setSelecionados((atual) => {
      if (todosProntosSelecionados) return new Set();
      return new Set(prontos.map((i) => i.arquivoId));
    });
  }

  async function liberar() {
    if (selecionados.size === 0 || liberando) return;
    setLiberando(true);
    setErro(null);
    setErroSemSolucaoAqui(false);
    setResultado(null);
    // Nomes capturados ANTES do recarregamento — depois de liberar, os itens
    // liberados saem da fila e o mapa de nomes some junto com eles.
    const mapaDeNomes = new Map(itens.map((i) => [i.arquivoId, i.nome]));
    try {
      const r = await fetch(ROTA, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          arquivoIds: Array.from(selecionados),
          // TODOS os prontos apresentados na tela, não só os selecionados —
          // é o dado que sustenta a medição do que o operador viu e decidiu
          // não selecionar.
          prontosApresentados: prontos.map((i) => i.arquivoId),
        }),
      });
      const corpo = (await r.json().catch(() => null)) as
        | { error?: string; regra?: string; liberados?: { arquivoId: string }[]; recusados?: { arquivoId: string; motivo: string | null }[] }
        | null;
      if (!r.ok) {
        setErro(corpo?.error ?? `não consegui liberar os itens selecionados (HTTP ${r.status}).`);
        // "sem_permissao" é a regra da rota para "você não porta o papel
        // exigido" — não é uma falha de rede, e clicar de novo nunca muda o
        // resultado. "Tentar de novo" aqui seria mentira.
        setErroSemSolucaoAqui(r.status === 403 || corpo?.regra === "sem_permissao");
        return;
      }
      setResultado({
        liberadosCount: corpo?.liberados?.length ?? 0,
        recusados: (corpo?.recusados ?? []).map((rec) => ({
          arquivoId: rec.arquivoId,
          nome: mapaDeNomes.get(rec.arquivoId) ?? rec.arquivoId,
          motivo: rec.motivo,
        })),
      });
      setSelecionados(new Set());
      await carregar();
    } catch {
      setErro("não consegui falar com o servidor. Verifique a conexão e tente de novo.");
    } finally {
      setLiberando(false);
    }
  }

  return (
    <>
      <AgencyHeader
        title="Fila diária de liberação"
        eyebrow="Célula de Prospecção · 99Freelas"
        subtitle={
          dia
            ? `Entregas de ${formatarDia(dia)}, já aprovadas pela Qualidade. Revise e libere em bloco — impedidos ficam à vista, sem checkbox.`
            : "As entregas do dia se acumulam aqui. Revise e libere em bloco — impedidos ficam à vista, sem checkbox."
        }
        meta={
          !carregando && !erro && itens.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex h-5 items-center rounded-full bg-[var(--success-bg)] px-2 text-[11px] font-semibold text-[var(--success)]">
                {prontos.length} pronto{prontos.length === 1 ? "" : "s"}
              </span>
              {impedidos.length > 0 && (
                <span className="inline-flex h-5 items-center rounded-full bg-[var(--danger-bg)] px-2 text-[11px] font-semibold text-[var(--danger)]">
                  {impedidos.length} impedido{impedidos.length === 1 ? "" : "s"}
                </span>
              )}
            </div>
          ) : undefined
        }
      />

      {resultado && (
        <div role="status" className="mb-4 rounded-[8px] border border-[#BBF7D0] bg-[var(--success-bg)] px-4 py-3">
          <p className="text-[13px] font-medium text-[var(--success)]">
            {resultado.liberadosCount} liberado{resultado.liberadosCount === 1 ? "" : "s"}
            {resultado.recusados.length > 0
              ? ` · ${resultado.recusados.length} recusado${resultado.recusados.length === 1 ? "" : "s"}`
              : ""}
          </p>
          {resultado.recusados.length > 0 && (
            <ul className="mt-2 space-y-1 list-none p-0 m-0">
              {resultado.recusados.map((r) => (
                <li key={r.arquivoId} className="text-[12px] leading-relaxed text-[var(--danger)]">
                  <span className="font-medium">{r.nome}</span>
                  {r.motivo ? `: ${r.motivo}` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {erro && (
        <div role="alert" className="mb-4 rounded-[8px] bg-[var(--danger-bg)] border border-[#FCA5A5] px-4 py-3">
          <p className="text-[13px] leading-relaxed text-[var(--danger)]">{erro}</p>
          {erroSemSolucaoAqui ? (
            // Não é falha transitória — é permissão. Oferecer "Tentar de
            // novo" aqui prenderia a pessoa num laço que nunca resolve.
            <p className="mt-2 text-[12px] leading-relaxed text-[var(--danger)]/80">
              Você não tem papel atribuído na Célula. Peça a um master para atribuir em{" "}
              <Link href="/agency/celula/papeis" className="underline font-medium">
                Papéis da Célula
              </Link>
              .
            </p>
          ) : (
            <button
              onClick={() => void carregar()}
              className="mt-2 h-8 px-3 rounded-[6px] border border-[#FCA5A5] text-[12px] font-medium text-[var(--danger)] hover:bg-white/60 transition-colors"
            >
              Tentar de novo
            </button>
          )}
        </div>
      )}

      {carregando ? (
        <ul className="space-y-2 list-none p-0 m-0" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <li key={i} className="bg-white rounded-[12px] border border-[var(--border)] p-4">
              <div className="h-3 w-24 rounded bg-[var(--accent)] animate-pulse" />
              <div className="h-4 w-3/4 rounded bg-[var(--accent)] animate-pulse mt-3" />
              <div className="h-3 w-full rounded bg-[var(--accent)] animate-pulse mt-2" />
            </li>
          ))}
        </ul>
      ) : itens.length === 0 && !erro ? (
        <EmptyState
          icon={
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none" aria-hidden>
              <rect x="3" y="2.5" width="10" height="11" rx="1.3" stroke="currentColor" strokeWidth="1.3" />
              <path d="M5.5 6h5M5.5 8.5h5M5.5 11h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          }
          title="Nada esperando por hoje"
          description="A fila diária mostra as entregas já aprovadas pela Qualidade e prontas para o cliente. Quando houver algo, você revisa e libera aqui — não é preciso fazer nada agora."
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-[var(--border)] bg-white px-4 py-3 mb-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <label
                htmlFor="selecionar-todos-prontos"
                className={`flex items-center gap-2 select-none ${prontos.length === 0 ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
              >
                <input
                  id="selecionar-todos-prontos"
                  type="checkbox"
                  checked={todosProntosSelecionados}
                  onChange={alternarTodos}
                  disabled={prontos.length === 0}
                  className="h-4 w-4 rounded border-[var(--border-strong)] accent-[var(--navy)] cursor-pointer disabled:cursor-not-allowed"
                />
                <span className="text-[13px] font-medium text-[var(--text-primary)]">Selecionar todos os prontos</span>
              </label>
              <span className="text-[12px] text-[var(--text-muted)]">
                {selecionados.size} selecionado{selecionados.size === 1 ? "" : "s"} de {prontos.length} pronto{prontos.length === 1 ? "" : "s"}
              </span>
            </div>
            <Button variant="primary" onClick={liberar} disabled={selecionados.size === 0 || liberando}>
              {liberando ? "Liberando…" : `Liberar selecionados${selecionados.size > 0 ? ` (${selecionados.size})` : ""}`}
            </Button>
          </div>

          <ul className="space-y-2 list-none p-0 m-0">
            {itens.map((item) => (
              <li
                key={item.arquivoId}
                className={`flex items-start gap-3 rounded-[12px] border p-4 ${
                  item.pronto
                    ? "bg-white border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
                    : "bg-[var(--bg-elevated)] border-dashed border-[var(--border-strong)]"
                }`}
              >
                {item.pronto ? (
                  <label
                    htmlFor={`sel-${item.arquivoId}`}
                    className="flex h-9 w-9 -m-2 shrink-0 items-center justify-center cursor-pointer"
                  >
                    <input
                      id={`sel-${item.arquivoId}`}
                      type="checkbox"
                      checked={selecionados.has(item.arquivoId)}
                      onChange={() => alternarItem(item.arquivoId)}
                      aria-label={`Selecionar ${item.nome} para liberar`}
                      className="h-4 w-4 rounded border-[var(--border-strong)] accent-[var(--navy)] cursor-pointer"
                    />
                  </label>
                ) : (
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center text-[var(--danger)]"
                    aria-hidden="true"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <circle cx="8" cy="8" r="6.3" stroke="currentColor" strokeWidth="1.3" />
                      <path d="M8 5v3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                      <circle cx="8" cy="11" r="0.9" fill="currentColor" />
                    </svg>
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-[14px] font-medium text-[var(--text-primary)] truncate">{item.nome}</p>
                    {!item.pronto && (
                      <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-[var(--danger-bg)] px-2 text-[11px] font-semibold text-[var(--danger)]">
                        Impedido
                      </span>
                    )}
                  </div>

                  <p className="mt-1 text-[12px] text-[var(--text-muted)]">
                    {extensaoDoMime(item.mimeType)} · {formatarTamanho(item.tamanhoBytes)} · versão {item.versao} · entrou em{" "}
                    {formatarData(item.registradoEm)}
                  </p>

                  <p className="mt-1 text-[12px] text-[var(--text-secondary)]">
                    Oportunidade <span className="font-mono">{item.oportunidadeId.slice(0, 8)}</span>
                    {item.clienteId ? (
                      <>
                        {" "}
                        · cliente <span className="font-mono">{item.clienteId.slice(0, 8)}</span>
                      </>
                    ) : (
                      " · cliente ainda não vinculado"
                    )}
                  </p>

                  {!item.pronto && item.impedimento && (
                    <p className="mt-2 text-[12px] leading-relaxed text-[var(--danger)]">{item.impedimento}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
