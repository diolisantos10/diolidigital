"use client";

// /agency/celula/papeis — QUEM FAZ O QUÊ NA CÉLULA DE PROSPECÇÃO.
//
// ── POR QUE ESTA TELA EXISTE (02/09/2026) ─────────────────────────────────
//
// A Célula de Prospecção tem hoje DUAS rotas de liberação de arquivo
// (`/api/agency/oportunidades/[id]/funil` e
// `/api/agency/oportunidades/fila-diaria`), e as duas exigem que quem chama
// porte o papel `gerente_de_atendimento` — lido de `User.papelNaCelula`
// (`lib/agency/celula/papel-do-usuario.ts`), NUNCA de um header que o
// chamador poderia forjar. Até esta tela existir, não havia UM lugar no
// produto onde alguém pudesse gravar esse papel: a coluna existia, a regra
// de permissão existia, e a única porta de escrita era um script rodado à
// mão no terminal. Sem esta tela, ninguém consegue usar as duas rotas.
//
// A API (`app/api/agency/celula/papeis/route.ts`) já faz TODA a regra —
// leitura larga (master, diretor, PM), escrita estreita (só master), conjunto
// fechado de papéis. Esta tela só CHAMA a rota; não reimplementa nada disso.
//
// ── NUNCA OTIMISTA ─────────────────────────────────────────────────────────
// Trocar o papel de alguém não é "provavelmente vai dar certo" — é uma
// permissão real, numa rota que outra pessoa depende para trabalhar. A linha
// só muda na tela DEPOIS que o servidor confirma; se o POST falhar, a tela
// não finge que gravou. O erro aparece colado na linha da conta que falhou,
// nunca num toast solto — quem está atribuindo precisa saber QUAL atribuição
// não pegou.
//
// ── A AÇÃO SÓ APARECE PARA MASTER, MAS A TRAVA É DA API ────────────────────
// `session.role === "master"` é quem grava — a API já recusa o resto com
// 403. Esta tela esconde o seletor de quem não é master (lido de
// `/api/session`, a mesma rota que `app/agency/settings/page.tsx` já usa)
// porque botão que sempre falha é UX ruim — isto NÃO é a trava de verdade,
// é só não prometer o que o servidor não entrega. Diretor e PM continuam
// enxergando a lista (a API já libera a LEITURA para os três), em modo
// consulta.

import { useCallback, useEffect, useState } from "react";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import EmptyState from "@/components/agency/ui/EmptyState";
import { AGENCY_ROLE_OPTIONS } from "@/lib/agency/roles";

const ROTA = "/api/agency/celula/papeis";

const ROLE_LABEL: Record<string, string> = Object.fromEntries(
  AGENCY_ROLE_OPTIONS.map((r) => [r.id, r.label]),
);

/** Todo `MAPA[chave]` vindo de dado de rede tem fallback (§7.5 do DESIGN.md)
 *  — o papel de agência é `String` livre no banco, o tipo do TypeScript é só
 *  palpite sobre o que o servidor manda hoje. */
function rotuloDoPapelDeAgencia(role: string): string {
  return ROLE_LABEL[role] ?? role;
}

type PapelNaCelula = "gerente_de_atendimento" | "sdr" | null;

const ROTULO_DO_PAPEL: Record<"gerente_de_atendimento" | "sdr", string> = {
  gerente_de_atendimento: "Gerente de Atendimento",
  sdr: "SDR",
};

function rotuloDoPapelNaCelula(p: PapelNaCelula): string {
  if (p === null) return "Nenhum";
  return ROTULO_DO_PAPEL[p] ?? p;
}

interface ContaCelula {
  id: string;
  name: string;
  email: string;
  role: string;
  papelNaCelula: PapelNaCelula;
}

type Resposta =
  | { estado: "carregando" }
  | { estado: "erro"; motivo: string; semAutoridade: boolean }
  | { estado: "ok"; contas: ContaCelula[] };

type EstadoDaLinha =
  | { fase: "idle" }
  | { fase: "salvando" }
  | { fase: "erro"; motivo: string };

/**
 * A CASCA QUE FALA COM O SERVIDOR — fetch, estado, nada de layout. Mesma
 * separação de `app/agency/avisos-de-orcamento/page.tsx`: a aparência mora
 * inteira em `PapeisDaCelulaView`, que só recebe props e nunca chama `fetch`.
 */
export default function PapeisDaCelulaPage() {
  const [r, setR] = useState<Resposta>({ estado: "carregando" });
  const [souMaster, setSouMaster] = useState<boolean | null>(null);
  // `/api/session` não devolve `userId` (só name/email/role/workspaceId) — o
  // e-mail é a chave que ela já expõe, e é a mesma chave única de `User`.
  const [meuEmail, setMeuEmail] = useState<string | null>(null);
  const [porLinha, setPorLinha] = useState<Record<string, EstadoDaLinha>>({});

  const carregar = useCallback(async () => {
    setR({ estado: "carregando" });
    try {
      const resp = await fetch(ROTA, { cache: "no-store" });
      const body = await resp.json().catch(() => null);
      if (!resp.ok) {
        // 403 aqui é SEMPRE "requer autoridade de gestão (master, diretor ou
        // PM)" — a rota não tem outro caminho de 403 no GET. Clicar em
        // "Tentar de novo" refaz a MESMA chamada, com a MESMA sessão, e
        // recebe o MESMO 403 pra sempre: quem chega aqui sem autoridade
        // (ex.: um `executivo_comercial` seguindo o link que `fila-diaria`
        // oferece) fica preso num laço que promete um conserto que não
        // existe. Mesmo padrão de `erroSemSolucaoAqui` em
        // `app/agency/oportunidades/fila-diaria/page.tsx`.
        setR({
          estado: "erro",
          motivo: body?.error ?? `não consegui carregar as contas do workspace (HTTP ${resp.status}).`,
          semAutoridade: resp.status === 403,
        });
        return;
      }
      setR({ estado: "ok", contas: Array.isArray(body?.contas) ? body.contas : [] });
    } catch {
      setR({
        estado: "erro",
        motivo: "não consegui falar com o servidor. Verifique a conexão e tente de novo.",
        semAutoridade: false,
      });
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    let vivo = true;
    fetch("/api/session", { cache: "no-store" })
      .then((resp) => resp.json())
      .then((body: { active?: boolean; role?: string; email?: string }) => {
        if (!vivo) return;
        setSouMaster(body?.active === true && body?.role === "master");
        setMeuEmail(typeof body?.email === "string" ? body.email : null);
      })
      .catch(() => {
        if (vivo) setSouMaster(false);
      });
    return () => {
      vivo = false;
    };
  }, []);

  const trocarPapel = useCallback(async (conta: ContaCelula, papel: "gerente_de_atendimento" | "sdr" | null) => {
    setPorLinha((atual) => ({ ...atual, [conta.id]: { fase: "salvando" } }));
    try {
      const resp = await fetch(ROTA, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: conta.id, papel }),
      });
      const body = await resp.json().catch(() => null);
      if (!resp.ok || body?.ok !== true) {
        setPorLinha((atual) => ({
          ...atual,
          [conta.id]: { fase: "erro", motivo: body?.error ?? `não consegui gravar (HTTP ${resp.status}).` },
        }));
        return; // A lista NÃO muda — o que está na tela é só o que o servidor confirmou.
      }
      setPorLinha((atual) => ({ ...atual, [conta.id]: { fase: "idle" } }));
      setR((atualR) =>
        atualR.estado === "ok"
          ? {
              estado: "ok",
              contas: atualR.contas.map((c) => (c.id === conta.id ? { ...c, papelNaCelula: body.papel } : c)),
            }
          : atualR,
      );
    } catch {
      setPorLinha((atual) => ({
        ...atual,
        [conta.id]: { fase: "erro", motivo: "não consegui falar com o servidor. Verifique a conexão e tente de novo." },
      }));
    }
  }, []);

  return (
    <PapeisDaCelulaView
      r={r}
      souMaster={souMaster}
      meuEmail={meuEmail}
      porLinha={porLinha}
      aoRecarregar={carregar}
      aoTrocarPapel={trocarPapel}
    />
  );
}

/**
 * A APARÊNCIA — puramente de props, nunca chama `fetch`.
 */
export function PapeisDaCelulaView({
  r,
  souMaster,
  meuEmail,
  porLinha,
  aoRecarregar,
  aoTrocarPapel,
}: {
  r: Resposta;
  /** `null` = ainda não se sabe (sessão carregando) — trata como consulta,
   *  nunca mostra a ação de escrita antes de ter certeza. */
  souMaster: boolean | null;
  meuEmail: string | null;
  porLinha: Record<string, EstadoDaLinha>;
  aoRecarregar: () => void;
  aoTrocarPapel: (conta: ContaCelula, papel: "gerente_de_atendimento" | "sdr" | null) => void;
}) {
  const contas = r.estado === "ok" ? r.contas : null;
  const podeEditar = souMaster === true;

  return (
    <div className="max-w-[760px]">
      <AgencyHeader
        eyebrow="Célula de Prospecção · 99Freelas"
        title="Papéis da Célula"
        subtitle={
          podeEditar
            ? "Defina quem é Gerente de Atendimento e quem é SDR. As duas rotas de liberação de arquivo da Célula só funcionam para quem tiver um destes papéis."
            : "Quem tem cada papel na Célula de Prospecção. Só uma conta com autoridade master atribui — aqui você só consulta."
        }
      />

      {r.estado === "carregando" && (
        <ul className="space-y-2.5 list-none p-0 m-0" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <li key={i} className="rounded-[12px] border border-[var(--border)] bg-white px-4 sm:px-5 py-4">
              <div className="h-3.5 w-40 rounded bg-[var(--accent)] animate-pulse" />
              <div className="h-3 w-56 rounded bg-[var(--accent)] animate-pulse mt-2.5" />
            </li>
          ))}
        </ul>
      )}

      {r.estado === "erro" && (
        <div role="alert" className="rounded-[12px] border border-[var(--danger)] bg-[var(--danger-bg)] px-5 py-4">
          <p className="text-[13px] font-semibold text-[var(--danger)]">Não consegui carregar as contas</p>
          <p className="text-[13px] text-[var(--text-secondary)] mt-1 leading-relaxed">{r.motivo}</p>
          {r.semAutoridade ? (
            // Não é falha transitória — é autoridade. "Tentar de novo" aqui
            // refaria a mesma chamada e receberia o mesmo 403 pra sempre.
            // Mesmo padrão de `erroSemSolucaoAqui` em `fila-diaria/page.tsx`.
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--danger)]/80">
              Isto não é um problema temporário: esta tela só é aberta para quem tem
              autoridade de gestão (master, diretor ou project manager). Peça a uma
              dessas contas para ver ou atribuir papéis na Célula.
            </p>
          ) : (
            <button
              onClick={() => aoRecarregar()}
              style={{ touchAction: "manipulation" }}
              className="mt-3 h-9 px-4 rounded-[8px] border border-[var(--border)] bg-white text-[13px] font-medium text-[var(--text-primary)]"
            >
              Tentar de novo
            </button>
          )}
        </div>
      )}

      {contas && contas.length === 0 && (
        <EmptyState
          title="Nenhuma conta neste workspace"
          description="Assim que houver contas de equipe, elas aparecem aqui para receber o papel de Gerente de Atendimento ou SDR."
        />
      )}

      {contas && contas.length > 0 && (
        <ul className="space-y-2.5 list-none p-0 m-0">
          {contas.map((conta) => {
            const linha = porLinha[conta.id] ?? { fase: "idle" as const };
            return (
              <li
                key={conta.id}
                className="rounded-[12px] border border-[var(--border)] bg-white px-4 sm:px-5 py-4"
              >
                {/* Empilha no celular (nome em cima, controle embaixo, alinhado
                    à esquerda) — lado a lado só de `sm` para cima. Evita o
                    select (mais largo que um selo) disputar espaço com o
                    nome numa única linha estreita. */}
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[14px] font-medium text-[var(--text-primary)] truncate">
                      {conta.name}
                      {meuEmail !== null && meuEmail === conta.email && (
                        <span className="text-[12px] font-normal text-[var(--text-muted)]"> · você</span>
                      )}
                    </p>
                    <p className="text-[13px] text-[var(--text-muted)] mt-0.5 truncate">
                      {conta.email} · {rotuloDoPapelDeAgencia(conta.role)}
                    </p>
                  </div>

                  <div className="flex flex-col items-start sm:items-end gap-1.5 shrink-0">
                    {podeEditar ? (
                      <select
                        aria-label={`Papel de ${conta.name} na Célula`}
                        value={conta.papelNaCelula ?? ""}
                        disabled={linha.fase === "salvando"}
                        onChange={(e) => {
                          const valor = e.target.value;
                          aoTrocarPapel(conta, valor === "" ? null : (valor as "gerente_de_atendimento" | "sdr"));
                        }}
                        className="h-9 rounded-[8px] border border-[var(--border)] bg-white px-2.5 text-[13px] text-[var(--text-primary)] disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <option value="">Nenhum</option>
                        <option value="gerente_de_atendimento">Gerente de Atendimento</option>
                        <option value="sdr">SDR</option>
                      </select>
                    ) : (
                      <Badge papel={conta.papelNaCelula} />
                    )}
                    {linha.fase === "salvando" && (
                      <p className="text-[12px] text-[var(--text-muted)]" role="status" aria-live="polite">
                        Salvando…
                      </p>
                    )}
                  </div>
                </div>

                {linha.fase === "erro" && (
                  <p role="alert" className="mt-2.5 text-[12px] leading-relaxed text-[var(--danger)]">
                    Não gravou: {linha.motivo}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Badge({ papel }: { papel: PapelNaCelula }) {
  const tom =
    papel === "gerente_de_atendimento"
      ? "bg-[var(--info-bg)] text-[var(--info)]"
      : papel === "sdr"
        ? "bg-[var(--accent-light)] text-[var(--teal-text)]"
        : "bg-[var(--accent)] text-[var(--text-muted)]";
  return (
    <span className={`inline-flex h-7 items-center rounded-full px-3 text-[12px] font-semibold whitespace-nowrap ${tom}`}>
      {rotuloDoPapelNaCelula(papel)}
    </span>
  );
}
