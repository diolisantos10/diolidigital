"use client";

// ── Portal do Cliente — Hub v1 (Fase 3 → Lote 2) ─────────────────────────────
// A tela do cliente inteira montada com os 6 blocos da spec
// (docs/projetos/hub/02-blocos-fluxos-navegacao.md) e EXATAMENTE 6 itens de
// navegação: Início · Projetos · Aprovações · Resultados · Arquivos · Conta.
// As ~10 abas antigas viraram estados internos — nada sumiu, mudou de casa.
//
// Regras que esta tela cumpre e que não são estilo, são contrato:
//   • Início abre com "O que depende de você" — pendência ACIMA de qualquer
//     métrica (o desenho antigo era o inverso: banner de aprovação no fim).
//   • Métrica sem meta + comparação + ação NÃO renderiza. Os 4 tiles "—"
//     morreram; Resultados mostra o estado honesto até o 1º ciclo fechar.
//   • Aprovação tem os 3 caminhos (Aprovar / Solicitar ajustes / Tenho uma
//     dúvida) — componente AprovacoesDoCliente.
//   • Chat com o PM em todas as telas (adição do CEO, 03/08/2026): o cliente
//     nunca fala com um departamento direto — fala com o PM, a ponte.
//   • A4: o token sai da URL no primeiro acesso (cookie httpOnly + URL limpa).

import { use, useCallback, useEffect, useRef, useState } from "react";
import { CalendarioDoMes } from "@/components/portal/CalendarioDoMes";
import { ConexoesDoCliente } from "@/components/portal/ConexoesDoCliente";
import { EnvioDeMaterial } from "@/components/portal/EnvioDeMaterial";
import {
  AprovacoesDoCliente,
  type AprovacaoDoPortal,
  type AcaoDeAprovacao,
} from "@/components/portal/AprovacoesDoCliente";
import { ResultadosDoCliente } from "@/components/portal/ResultadosDoCliente";
import { ChatDrawer } from "@/components/agency/portal/FloatingChat";
import EsteiraDoCliente from "@/components/agency/portal/EsteiraDoCliente";

// ── Tipos ────────────────────────────────────────────────────────────────────

interface PipelineStep {
  id: string;
  departmentKey: string;
  department: string;
  approvedAt: string;
  version: number;
}
interface DeptContent { label: string; headline: string | null; bullets: string[]; approvedAt: string | null }
interface PortalData {
  id: string | null;
  businessName: string;
  status: string;
  segment?: string;
  targetAudience?: string;
  socialPlatforms?: string[];
  services: string[];
  objectives: string[];
  departments?: Record<string, DeptContent>;
  createdAt: string | null;
  pipeline: PipelineStep[];
  approvals: AprovacaoDoPortal[];
}

interface PortalPost {
  id: string;
  caption: string;
  networks: string[];
  format: string;
  pillar: string | null;
  mediaUrl: string | null;
  /** As telas do carrossel (ordem de publicação) — o clique abre a peça inteira. */
  telas?: string[];
  scheduledFor: string | null;
  status: string;
}

interface EstadoEsteira {
  ok: boolean;
  temProjeto: boolean;
  pendencias?: string[];
  ciclo?: { referencia: string; resumo: string | null } | null;
}

// O projeto como a rota /api/portal/projetos entrega: por clientId, já na
// linguagem do cliente (etapa legível, sem nada interno).
interface ProjetoDoPortal {
  id: string;
  nome: string;
  objetivo: string | null;
  etapa: string;
  criadoEm: string | null;
}

interface ConexaoView { id: string; platform: string; name: string; status: string }

type SecaoId = "inicio" | "projetos" | "aprovacoes" | "resultados" | "arquivos" | "conta";

// ── Config ───────────────────────────────────────────────────────────────────

// Os 6 itens — teto do briefing: nenhum entra sem remover outro.
const NAV: { id: SecaoId; label: string }[] = [
  { id: "inicio",     label: "Início" },
  { id: "projetos",   label: "Projetos" },
  { id: "aprovacoes", label: "Aprovações" },
  { id: "resultados", label: "Resultados" },
  { id: "arquivos",   label: "Arquivos" },
  { id: "conta",      label: "Conta" },
];

// Serviço contratado → módulo dentro de Projetos (as antigas abas dinâmicas).
const MODULOS_DE_SERVICO: { id: string; label: string; match: RegExp; deptKeys: string[] }[] = [
  { id: "social",  label: "Social Media",      match: /social|redes|instagram|conte[úu]do/i, deptKeys: ["social", "social-media"] },
  { id: "traffic", label: "Tráfego Pago",      match: /tr[áa]fego|ads|an[úu]ncio|m[íi]dia\s*paga/i, deptKeys: ["traffic", "paid-traffic"] },
  { id: "design",  label: "Identidade Visual", match: /identidade|design|marca|logo|visual/i, deptKeys: ["design"] },
];

const STATUS_LABEL: Record<string, string> = {
  new: "Recebido", waiting_strategy: "Diagnóstico estratégico",
  waiting_social: "Planejamento de conteúdo", waiting_design: "Desenvolvimento visual",
  waiting_traffic: "Configuração de tráfego", waiting_analytics: "Configuração de analytics",
  waiting_quality: "Revisão final", in_progress: "Em execução", completed: "Concluído",
  in_production: "Em produção", accepted: "Proposta aceita", quoted: "Proposta enviada",
};

const DECISAO_LABEL: Record<string, string> = {
  approved: "aprovado por você",
  revision_requested: "ajustes solicitados por você",
  rejected: "recusado por você",
};

// Integrações futuras (além da Meta, que já é real em Conexões).
const INTEGRACOES_FUTURAS: { key: string; name: string; desc: string; color: string; initials: string }[] = [
  { key: "gdrive",     name: "Google Drive",     desc: "Repositório de fotos, vídeos e materiais", color: "#1FA463", initials: "GD" },
  { key: "gads",       name: "Google Ads",       desc: "Campanhas e desempenho de anúncios",       color: "#4285F4", initials: "GA" },
  { key: "ganalytics", name: "Google Analytics", desc: "Tráfego e conversões do site",             color: "#E8710A", initials: "GA" },
  { key: "tiktok",     name: "TikTok",           desc: "Visualizações, seguidores e engajamento",  color: "#010101", initials: "TT" },
];

function sanitizePortalToken(raw: string): string {
  let t = raw.trim().replace(/^`+|`+$/g, "").trim();
  t = t.replace(/\.+$/, "");
  return t;
}

function dataCurta(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

// ── Marca ────────────────────────────────────────────────────────────────────

function DioliMark() {
  // O logo OFICIAL, não uma recomposição em texto — o CEO pegou a marca errada
  // no ar em 03/08/2026. O arquivo horizontal branco é o certo para o
  // cabeçalho escuro do portal.
  return (
    <div className="flex items-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/dioli-logo-h-white.png" alt="Dioli Digital" className="h-6 w-auto" />
    </div>
  );
}

// ── Blocos de apoio ──────────────────────────────────────────────────────────

function TituloDeBloco({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)] mb-2.5">
      <span aria-hidden className="w-[18px] h-[18px] rounded-[6px] bg-[#070A1F] text-white text-[10px] font-mono flex items-center justify-center">{n}</span>
      {children}
    </h2>
  );
}

function LinhaDePendencia({
  icone, fundo, titulo, porque, meta, onClick,
}: {
  icone: string; fundo: string; titulo: string; porque: string; meta: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{ touchAction: "manipulation" }}
      className="w-full flex items-start gap-3 px-4 py-3.5 text-left border-t border-[var(--border)] first:border-t-0 hover:bg-[var(--bg-elevated)] transition-colors"
    >
      <span aria-hidden className="shrink-0 w-9 h-9 rounded-[9px] flex items-center justify-center text-[15px]" style={{ background: fundo }}>{icone}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-semibold text-[var(--text-primary)] leading-snug">{titulo}</span>
        <span className="block text-[12.5px] text-[var(--text-secondary)] mt-0.5 leading-snug">{porque}</span>
        <span className="block text-[11.5px] text-[var(--text-muted)] mt-1">{meta}</span>
      </span>
      <span aria-hidden className="self-center text-[var(--text-subtle)]">›</span>
    </button>
  );
}

// ── Página ───────────────────────────────────────────────────────────────────

export default function ClientPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token: rawToken } = use(params);
  const tokenDaUrl = sanitizePortalToken(rawToken);
  // "me" é a URL limpa da correção A4: sem token no caminho, o cookie httpOnly
  // autentica cada chamada. Token real no caminho = link antigo (compatível).
  const modoCookie = tokenDaUrl === "me";
  const token = modoCookie ? "" : tokenDaUrl;
  const q = token ? `?token=${encodeURIComponent(token)}` : "";

  const [data, setData] = useState<PortalData | null>(null);
  const [esteira, setEsteira] = useState<EstadoEsteira | null>(null);
  const [conexoes, setConexoes] = useState<ConexaoView[]>([]);
  const [posts, setPosts] = useState<PortalPost[]>([]);
  const [projetos, setProjetos] = useState<ProjetoDoPortal[]>([]);
  const [calendarioPorCliente, setCalendarioPorCliente] = useState<PortalPost[]>([]);
  const [erroProjetos, setErroProjetos] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [secao, setSecao] = useState<SecaoId>("inicio");
  const [aprovacaoAberta, setAprovacaoAberta] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erroDecisao, setErroDecisao] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  // A4: com o cookie httpOnly gravado, o token NÃO entra mais em URL de mídia —
  // <img src="…?token=…"> deixava a credencial inteira no DOM. Nasce true no
  // modo cookie; vira true no modo link assim que a troca por cookie dá certo.
  const [cookiePronto, setCookiePronto] = useState(modoCookie);
  const trocouUrl = useRef(false);

  // A4: chegou com token no CAMINHO → troca por cookie e limpa a URL sem
  // recarregar. O token em memória continua servindo esta visita; a próxima já
  // nasce limpa.
  useEffect(() => {
    if (modoCookie || trocouUrl.current || !token) return;
    trocouUrl.current = true;
    void (async () => {
      try {
        const res = await fetch("/api/portal/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (res.ok) {
          const limpa = `/portal/access/me${window.location.search}${window.location.hash}`;
          window.history.replaceState(null, "", limpa);
          // Daqui em diante a mídia autentica pelo cookie — token fora do DOM.
          setCookiePronto(true);
        }
      } catch { /* sem cookie a visita segue pelo token — nada quebra */ }
    })();
  }, [modoCookie, token]);

  // Deep-link de seção (?secao=aprovacoes&aprovacao=<id>) — é o que permite a
  // pendência do Início apontar direto para o card certo.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const s = sp.get("secao") as SecaoId | null;
    if (s && NAV.some((n) => n.id === s)) setSecao(s);
    const ap = sp.get("aprovacao");
    if (ap) { setSecao("aprovacoes"); setAprovacaoAberta(ap); }
  }, []);

  function irPara(s: SecaoId, aprovacaoId?: string | null) {
    setSecao(s);
    setAprovacaoAberta(aprovacaoId ?? null);
    setErroDecisao(null);
    const sp = new URLSearchParams(window.location.search);
    sp.set("secao", s);
    if (aprovacaoId) sp.set("aprovacao", aprovacaoId); else sp.delete("aprovacao");
    window.history.replaceState(null, "", `${window.location.pathname}?${sp.toString()}`);
    window.scrollTo({ top: 0 });
  }

  const loadData = useCallback(async () => {
    try {
      const res = await fetch(`/api/brain/portal-data${q}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.reason === "expired" ? "expired" : json.reason === "revoked" ? "revoked" : "invalid");
        return;
      }
      const json = await res.json();
      // Defesa barata: se um deploy antigo da API não mandar `pecas`, o card
      // volta ao comportamento só-texto em vez de quebrar a tela inteira.
      json.approvals = (Array.isArray(json.approvals) ? json.approvals : []).map(
        (a: AprovacaoDoPortal) => ({ ...a, pecas: Array.isArray(a.pecas) ? a.pecas : [] }),
      );
      setData(json);
      setError(null);
    } catch {
      setError("network");
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => { void loadData(); }, [loadData]);

  // Pendências de material e ciclo — mesma fonte da trilha (esteira).
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`/api/portal/esteira${q}`, { cache: "no-store" });
        if (res.ok) setEsteira(await res.json());
      } catch { /* o Início ainda funciona sem a esteira */ }
    })();
  }, [q]);

  // Conexões — para a pendência "conta quebrada" do Início.
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`/api/portal/conexoes${q}`);
        if (res.ok) {
          const json = await res.json();
          setConexoes(Array.isArray(json.conexoes) ? json.conexoes : []);
        }
      } catch { /* sem conexões o bloco só não lista essa pendência */ }
    })();
  }, [q]);

  // Calendário editorial (módulo Social dentro de Projetos).
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`/api/social-posts${q}`);
        if (res.ok) {
          const json = await res.json();
          setPosts(Array.isArray(json.posts) ? json.posts : []);
        }
      } catch { /* portal funciona sem o calendário */ }
    })();
  }, [q]);

  // Projetos + calendário POR clientId — o caminho que funciona também para o
  // cliente criado direto (sem solicitação de briefing). Foi o buraco da
  // Foocci: projeto e posts existiam por clientId e a aba aparecia vazia.
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`/api/portal/projetos${q}`, { cache: "no-store" });
        if (!res.ok) { setErroProjetos(true); return; }
        const json = await res.json();
        setProjetos(Array.isArray(json.projetos) ? json.projetos : []);
        setCalendarioPorCliente(Array.isArray(json.calendario) ? json.calendario : []);
        setErroProjetos(false);
      } catch {
        setErroProjetos(true);
      }
    })();
  }, [q]);

  async function decidir(approvalId: string, action: AcaoDeAprovacao, comment?: string): Promise<boolean> {
    if (enviando) return false;
    setEnviando(true);
    setErroDecisao(null);
    try {
      const res = await fetch("/api/portal/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(token ? { token } : {}),
          approvalRequestId: approvalId,
          action,
          comment: comment?.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({} as { error?: string }));
        throw new Error(j.error ?? `Falha HTTP ${res.status}`);
      }
      await loadData();
      return true;
    } catch (e) {
      setErroDecisao(e instanceof Error ? e.message : "Erro ao registrar. Tente novamente.");
      return false;
    } finally {
      setEnviando(false);
    }
  }

  // ── Portões de carregamento / erro ────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-elevated)]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-[var(--border)] border-t-[#070A1F] animate-spin" />
          <p className="text-[13px] text-[var(--text-muted)]">Abrindo seu portal…</p>
        </div>
      </div>
    );
  }
  if (error || !data) {
    const messages: Record<string, { title: string; body: string }> = {
      expired: { title: "Link expirado", body: "Este link de acesso expirou. Solicite um novo à equipe Dioli." },
      revoked: { title: "Acesso revogado", body: "Este link foi desativado. Entre em contato com a equipe Dioli." },
      invalid: { title: "Link inválido", body: "Este link não é válido. Verifique o link recebido ou solicite um novo." },
      network: { title: "Erro de conexão", body: "Não foi possível verificar o acesso. Tente novamente em instantes." },
    };
    const msg = messages[error ?? "invalid"] ?? messages.invalid;
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-elevated)] px-4">
        <div className="max-w-sm text-center">
          <div className="w-12 h-12 rounded-full bg-[#FEF3C7] flex items-center justify-center mx-auto mb-4 text-xl">⚠</div>
          <h1 className="text-[18px] font-semibold text-[var(--text-primary)] mb-2">{msg.title}</h1>
          <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">{msg.body}</p>
        </div>
      </div>
    );
  }

  // ── Derivações ────────────────────────────────────────────────────────────
  const pendentes = data.approvals.filter((a) => a.status === "pending");
  const decididas = data.approvals
    .filter((a) => a.status !== "pending" && a.reviewedAt)
    .sort((a, b) => (b.reviewedAt ?? "").localeCompare(a.reviewedAt ?? ""));
  const materiaisPedidos = esteira?.pendencias ?? [];
  const conexoesQuebradas = conexoes.filter((c) => ["expired", "revoked", "error"].includes(c.status));
  const totalPendencias = pendentes.length + materiaisPedidos.length + conexoesQuebradas.length;
  // O chip do cabeçalho: o cliente DIRETO não tem solicitação Brain — o
  // portal-data devolve o estado vazio ("new" → "Recebido") mesmo com projeto
  // em produção. Quando /api/portal/projetos enxerga projeto, a etapa DELE é a
  // verdade que o cliente deve ler — nunca "Recebido" para trabalho em curso.
  const currentStatus =
    (data.id === null || data.status === "new") && projetos.length > 0
      ? projetos[0].etapa
      : STATUS_LABEL[data.status] ?? "Em andamento";
  // Em modo cookie o token some das URLs de mídia (A4) — o cookie autentica.
  const tokenDeMidia = cookiePronto ? "" : token;

  const modulosAtivos = MODULOS_DE_SERVICO.filter((m) => data.services.some((s) => m.match.test(s)));
  // A fonte do calendário: a rota por solicitação quando ela responde; senão a
  // rota por clientId — que enxerga os posts agendados sem clientRequestId.
  const pecasDoCalendario = posts.length > 0 ? posts : calendarioPorCliente;
  const entregasRecentes = [...data.pipeline]
    .sort((a, b) => (b.approvedAt ?? "").localeCompare(a.approvedAt ?? ""))
    .slice(0, 3);
  // A ORDEM dos blocos é fixa (spec 3.2); o NÚMERO exibido é sequencial sobre
  // o que renderiza — bloco oculto não deixa buraco na contagem ("1, 2, 4"
  // parece bug para quem lê).
  const numeroEntregas = 3;
  const numeroDecisoes = entregasRecentes.length > 0 ? 4 : 3;

  const tituloDaAprovacao = (ap: AprovacaoDoPortal) => {
    const primeira = ap.reviewNote?.split("\n")[0]?.trim();
    return primeira && primeira.length <= 90 ? primeira : ap.department;
  };

  // ── Shell ─────────────────────────────────────────────────────────────────
  return (
    // Sem `min-h-screen` aqui: quem garante a altura e o fundo é o layout do
    // portal (`.portal-shell`), que também reserva o espaço do botão flutuante.
    // Dobrar o `min-h-screen` forçaria uma rolagem morta do tamanho da reserva.
    <div className="bg-[var(--bg-elevated)]">
      {/* Cabeçalho de marca */}
      <header className="relative overflow-hidden" style={{ background: "linear-gradient(135deg, #0B0F2A 0%, #070A1F 55%, #0A0E24 100%)" }}>
        <div className="absolute inset-0 opacity-[0.15]" style={{ background: "radial-gradient(600px 200px at 80% -20%, #9AF5F0, transparent)" }} />
        <div className="relative max-w-[860px] mx-auto px-5 pt-5 pb-12 sm:pb-14">
          <div className="flex items-center justify-between">
            <DioliMark />
            <span className="text-[11px] font-medium text-white/45">Portal do Cliente</span>
          </div>
          <div className="mt-6 sm:mt-8">
            <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[11px] font-semibold" style={{ background: "rgba(154,245,240,0.12)", color: "#9AF5F0" }}>
              <span className="w-1.5 h-1.5 rounded-full bg-[#9AF5F0] animate-pulse" /> {currentStatus}
            </span>
            <h1 className="text-[24px] sm:text-[30px] font-bold text-white mt-2.5 tracking-tight leading-tight truncate">
              {data.businessName}
            </h1>
            <p className="text-[13px] text-white/55 mt-1">
              {totalPendencias === 0
                ? "Nada pendente com você agora."
                : totalPendencias === 1
                  ? "1 pendência espera por você."
                  : `${totalPendencias} pendências esperam por você.`}
            </p>
          </div>
        </div>
      </header>

      {/* Navegação — exatamente 6 itens */}
      <nav aria-label="Navegação do portal" className="sticky top-0 z-20 bg-[var(--bg-elevated)]/92 backdrop-blur border-b border-[var(--border)] -mt-7 sm:-mt-8">
        <div className="max-w-[860px] mx-auto px-3">
          <div className="flex gap-1 overflow-x-auto no-scrollbar py-2.5">
            {NAV.map((item) => {
              const active = secao === item.id;
              const badge = item.id === "aprovacoes" ? pendentes.length : 0;
              return (
                <button
                  key={item.id}
                  onClick={() => irPara(item.id)}
                  aria-current={active ? "page" : undefined}
                  style={{ touchAction: "manipulation" }}
                  className={`shrink-0 h-9 px-3.5 rounded-[9px] text-[13px] font-semibold transition-colors flex items-center gap-1.5 ${
                    active ? "bg-[#070A1F] text-white shadow-[0_2px_8px_rgba(7,10,31,0.2)]" : "text-[var(--text-secondary)] hover:bg-[#F0EFEB]"
                  }`}
                >
                  {item.label}
                  {badge > 0 && (
                    <span className="ml-0.5 inline-flex items-center justify-center min-w-[17px] h-[17px] px-1 rounded-full text-[10px] font-bold bg-[#F59E0B] text-white">{badge}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* `pb-10` é só o respiro do conteúdo até o rodapé. O espaço do botão
          flutuante NÃO mora aqui — mora no layout (`.portal-shell`). */}
      <main className="max-w-[860px] mx-auto px-4 sm:px-5 py-6 pb-10">

        {/* ══ INÍCIO — ordem inegociável: pendência acima de tudo ══ */}
        {secao === "inicio" && (
          <div className="space-y-7">
            {/* 1 · O que depende de você */}
            <section>
              <TituloDeBloco n={1}>O que depende de você</TituloDeBloco>
              {totalPendencias === 0 ? (
                <div className="bg-white rounded-[14px] border border-[var(--border)] p-6 text-center shadow-[0_1px_3px_rgba(7,10,31,0.04)]">
                  <p className="text-[13.5px] font-semibold text-[var(--text-primary)]">✅ Nada depende de você agora</p>
                  <p className="text-[12px] text-[var(--text-muted)] mt-1">A equipe está trabalhando — quando precisarmos de você, aparece aqui primeiro.</p>
                </div>
              ) : (
                <div className="bg-white rounded-[14px] border border-[var(--border)] overflow-hidden shadow-[0_1px_3px_rgba(7,10,31,0.04)]">
                  {pendentes.map((ap) => {
                    const vencida = !ap.questionOpen && ap.expiresAt != null && new Date(ap.expiresAt) < new Date();
                    return (
                      <LinhaDePendencia
                        key={ap.id}
                        icone="✍️" fundo="#FEF3C7"
                        titulo={`${tituloDaAprovacao(ap)} aguarda sua aprovação`}
                        porque="Enquanto você não decide, a próxima etapa fica em espera."
                        meta={ap.questionOpen
                          ? "Prazo pausado — dúvida aguardando a agência"
                          : vencida
                            ? `O prazo venceu em ${dataCurta(ap.expiresAt)} — a entrega está aguardando você`
                            : dataCurta(ap.expiresAt) ? `Prazo: ${dataCurta(ap.expiresAt)}` : "Decida em Aprovações"}
                        onClick={() => irPara("aprovacoes", ap.id)}
                      />
                    );
                  })}
                  {materiaisPedidos.map((m, i) => (
                    <LinhaDePendencia
                      key={`mat-${i}`}
                      icone="📤" fundo="#EFF6FF"
                      titulo={m}
                      porque="Sem este material, a produção fica parada."
                      meta="Enviar em Arquivos"
                      onClick={() => irPara("arquivos")}
                    />
                  ))}
                  {conexoesQuebradas.map((c) => (
                    <LinhaDePendencia
                      key={c.id}
                      icone="🔌" fundo="#FEF2F2"
                      titulo={`${c.name || c.platform} desconectado — reconecte a conta`}
                      porque="Sem a conexão, os posts aprovados não podem ser publicados."
                      meta="Resolver em Conta"
                      onClick={() => irPara("conta")}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* 2 · Onde estamos */}
            <section>
              <TituloDeBloco n={2}>Onde estamos e o que vem</TituloDeBloco>
              <EsteiraDoCliente token={token} />
            </section>

            {/* 3 · Entregas recentes — só renderiza quando existe entrega */}
            {entregasRecentes.length > 0 && (
              <section>
                <TituloDeBloco n={numeroEntregas}>Entregas recentes</TituloDeBloco>
                <div className="bg-white rounded-[14px] border border-[var(--border)] overflow-hidden shadow-[0_1px_3px_rgba(7,10,31,0.04)]">
                  {entregasRecentes.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => irPara("projetos")}
                      style={{ touchAction: "manipulation" }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left border-t border-[var(--border)] first:border-t-0 hover:bg-[var(--bg-elevated)] transition-colors"
                    >
                      <span aria-hidden className="shrink-0 w-9 h-9 rounded-[9px] bg-[var(--accent)] flex items-center justify-center text-[15px]">🎨</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] font-semibold text-[var(--text-primary)]">{p.department}</span>
                        <span className="text-[12px] text-[var(--text-secondary)]">v{p.version}</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[11px] font-semibold bg-[#DCFCE7] text-[#16A34A] shrink-0">
                        Aprovado {dataCurta(p.approvedAt)}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* 4 · Decisões registradas — lista vazia não renderiza */}
            {decididas.length > 0 && (
              <section>
                <TituloDeBloco n={numeroDecisoes}>Decisões registradas</TituloDeBloco>
                <div className="bg-white rounded-[14px] border border-[var(--border)] overflow-hidden shadow-[0_1px_3px_rgba(7,10,31,0.04)]">
                  {decididas.slice(0, 3).map((d) => (
                    <button
                      key={d.id}
                      onClick={() => irPara("aprovacoes", d.id)}
                      style={{ touchAction: "manipulation" }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left border-t border-[var(--border)] first:border-t-0 hover:bg-[var(--bg-elevated)] transition-colors"
                    >
                      <span aria-hidden className="shrink-0 w-9 h-9 rounded-[9px] bg-[var(--accent)] flex items-center justify-center text-[15px]">📌</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] font-semibold text-[var(--text-primary)] truncate">
                          {tituloDaAprovacao(d)}{d.version != null ? ` (v${d.version})` : ""} — {DECISAO_LABEL[d.status] ?? d.status}
                        </span>
                        <span className="text-[12px] text-[var(--text-secondary)]">Registrada em {dataCurta(d.reviewedAt)}</span>
                      </span>
                    </button>
                  ))}
                  <div className="px-4 py-2.5 border-t border-[var(--border)]">
                    <button onClick={() => irPara("aprovacoes")} className="text-[12.5px] font-semibold text-[#12B5AC] hover:underline" style={{ touchAction: "manipulation" }}>
                      Ver todas as decisões →
                    </button>
                  </div>
                </div>
              </section>
            )}

            {/* 5 · Resultado do ciclo — SÓ com meta + comparação + ação.
                Sem ciclo fechado com dado completo, o bloco simplesmente não
                existe: os tiles "—" morreram e não voltam como placeholder. */}
          </div>
        )}

        {/* ══ PROJETOS — as abas de serviço viraram estados daqui ══ */}
        {secao === "projetos" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-[18px] font-bold text-[var(--text-primary)]">Projetos</h2>
              <p className="text-[12.5px] text-[var(--text-secondary)] mt-0.5">O que a Dioli está construindo para você.</p>
            </div>

            <EsteiraDoCliente token={token} />

            {/* Cartões de projeto — vêm por clientId, então aparecem também
                para o cliente criado direto (a correção do "onde eu vejo o
                projeto?" do lançamento da Foocci). */}
            {projetos.map((p) => (
              <section key={p.id} className="bg-white rounded-[14px] border border-[var(--border)] p-5 shadow-[0_1px_3px_rgba(7,10,31,0.04)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-[15px] font-bold text-[var(--text-primary)] leading-snug">{p.nome}</h3>
                    {p.objetivo && (
                      <p className="text-[12.5px] text-[var(--text-secondary)] mt-1 leading-relaxed">{p.objetivo}</p>
                    )}
                  </div>
                  <span className="shrink-0 h-6 px-2.5 rounded-full bg-[#EFF6FF] text-[#1D4ED8] text-[11px] font-semibold flex items-center">
                    {p.etapa}
                  </span>
                </div>
                {p.criadoEm && (
                  <p className="text-[11.5px] text-[var(--text-muted)] mt-2.5">Aberto em {dataCurta(p.criadoEm)}</p>
                )}
              </section>
            ))}

            {data.services.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {data.services.map((s, i) => (
                  <span key={i} className="h-8 px-3.5 rounded-[9px] bg-white border border-[var(--border)] text-[var(--text-primary)] text-[12px] font-medium flex items-center shadow-[0_1px_2px_rgba(7,10,31,0.03)]">{s}</span>
                ))}
              </div>
            )}

            {modulosAtivos.map((mod) => {
              const dept = mod.deptKeys.map((k) => data.departments?.[k]).find(Boolean);
              return (
                <section key={mod.id} className="bg-white rounded-[14px] border border-[var(--border)] p-5 shadow-[0_1px_3px_rgba(7,10,31,0.04)]">
                  <div className="flex items-center justify-between mb-2.5">
                    <h3 className="text-[14px] font-bold text-[var(--text-primary)]">{mod.label}</h3>
                    {dept?.approvedAt && (
                      <span className="h-5 px-2 rounded-full bg-[#DCFCE7] text-[#16A34A] text-[10px] font-semibold flex items-center">✓ Plano aprovado</span>
                    )}
                  </div>
                  {dept && (dept.headline || dept.bullets.length > 0) ? (
                    <>
                      {dept.headline && <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed mb-2">{dept.headline}</p>}
                      {dept.bullets.length > 0 && (
                        <ul className="space-y-1.5">
                          {dept.bullets.map((b, i) => (
                            <li key={i} className="flex items-start gap-2 text-[12.5px] text-[var(--text-secondary)]"><span aria-hidden className="text-[#12B5AC] mt-0.5 shrink-0">•</span>{b}</li>
                          ))}
                        </ul>
                      )}
                    </>
                  ) : (
                    <p className="text-[13px] text-[var(--text-muted)]">A equipe está preparando o plano de {mod.label.toLowerCase()} — em breve aparece aqui.</p>
                  )}

                  {/* O calendário vive DENTRO do módulo Social — é um recorte do
                      projeto, não um destino de topo (spec 3.1). */}
                  {mod.id === "social" && (
                    <div className="mt-4">
                      <h4 className="text-[13px] font-bold text-[var(--text-primary)] mb-2">Calendário do mês</h4>
                      <CalendarioDoMes pecas={pecasDoCalendario} token={tokenDeMidia} aprovacoesPendentes={pendentes.length} />
                    </div>
                  )}
                </section>
              );
            })}

            {/* Cliente direto não tem módulo de serviço ativo, mas tem
                calendário: o mês agendado não pode ficar invisível. */}
            {!modulosAtivos.some((m) => m.id === "social") && pecasDoCalendario.length > 0 && (
              <section className="bg-white rounded-[14px] border border-[var(--border)] p-5 shadow-[0_1px_3px_rgba(7,10,31,0.04)]">
                <h3 className="text-[14px] font-bold text-[var(--text-primary)] mb-2">Calendário do mês</h3>
                <CalendarioDoMes pecas={pecasDoCalendario} token={tokenDeMidia} aprovacoesPendentes={pendentes.length} />
              </section>
            )}

            {erroProjetos && projetos.length === 0 && (
              <div className="bg-white rounded-[14px] border border-[var(--border)] p-7 text-center">
                <p className="text-[13.5px] font-semibold text-[var(--text-primary)]">Não consegui carregar agora</p>
                <p className="text-[12px] text-[var(--text-muted)] mt-1">Tente atualizar a página. Se continuar assim, fale com a gente pela conversa aqui do portal.</p>
              </div>
            )}

            {!erroProjetos && modulosAtivos.length === 0 && projetos.length === 0 && pecasDoCalendario.length === 0 && (
              <div className="bg-white rounded-[14px] border border-[var(--border)] p-7 text-center">
                <p className="text-[13.5px] font-semibold text-[var(--text-primary)]">Seu projeto está sendo montado</p>
                <p className="text-[12px] text-[var(--text-muted)] mt-1">Assim que os módulos do seu plano forem definidos, cada um aparece aqui.</p>
              </div>
            )}
          </div>
        )}

        {/* ══ APROVAÇÕES — lista + detalhe com os 3 caminhos ══ */}
        {secao === "aprovacoes" && (
          <AprovacoesDoCliente
            aprovacoes={data.approvals}
            token={tokenDeMidia}
            abertaId={aprovacaoAberta}
            onAbrir={(id) => irPara("aprovacoes", id)}
            enviando={enviando}
            erro={erroDecisao}
            onDecidir={decidir}
          />
        )}

        {/* ══ RESULTADOS — os números reais das redes (pedido do CEO, 04/08).
            Número SEM meta sai com o período visível; comparação inventada não
            entra. Sem conexão / token vencido são tela, não erro. ══ */}
        {secao === "resultados" && (
          <div className="space-y-5">
            <div>
              <h2 className="text-[18px] font-bold text-[var(--text-primary)]">Resultados</h2>
              <p className="text-[12.5px] text-[var(--text-secondary)] mt-0.5">
                Os números do seu Instagram, direto da Meta — sem enfeite e sem estimativa.
              </p>
            </div>
            <ResultadosDoCliente token={token} onIrParaConta={() => irPara("conta")} />
          </div>
        )}

        {/* ══ ARQUIVOS (antiga Materiais) ══ */}
        {secao === "arquivos" && (
          <div className="space-y-4">
            <div>
              <h2 className="text-[18px] font-bold text-[var(--text-primary)]">Arquivos</h2>
              <p className="text-[12.5px] text-[var(--text-secondary)] mt-0.5">O que a equipe precisa de você — mande direto por aqui, sem criar conta em lugar nenhum.</p>
            </div>

            {materiaisPedidos.length > 0 && (
              <div className="bg-[#FFFBEB] border border-[#FCE7A0] rounded-[12px] px-4 py-3">
                <p className="text-[12.5px] font-semibold text-[#9B7B2D] mb-1">A produção está esperando:</p>
                <ul className="space-y-1">
                  {materiaisPedidos.map((m, i) => (
                    <li key={i} className="flex items-start gap-2 text-[12.5px] text-[#B08D3E]"><span aria-hidden className="mt-0.5 shrink-0">•</span>{m}</li>
                  ))}
                </ul>
              </div>
            )}

            <EnvioDeMaterial token={token} />

            <div className="bg-white rounded-[14px] border border-[var(--border)] p-5">
              <h3 className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.05em] mb-2">Arquivo muito grande?</h3>
              <p className="text-[12px] text-[var(--text-secondary)]">
                Se passar de 120 MB, mande um link (WeTransfer, Drive, Dropbox):{" "}
                <button onClick={() => setChatOpen(true)} className="text-[#12B5AC] font-semibold hover:underline" style={{ touchAction: "manipulation" }}>fale com seu PM</button>{" "}
                e cole o link na conversa.
              </p>
            </div>
          </div>
        )}

        {/* ══ CONTA — conexões + integrações (fundidas) + contexto do negócio ══ */}
        {secao === "conta" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-[18px] font-bold text-[var(--text-primary)]">Conta</h2>
              <p className="text-[12.5px] text-[var(--text-secondary)] mt-0.5">Suas conexões, seu plano e seu acesso.</p>
            </div>

            {/* Checklist de integrações — Conexões e Integrações eram duas abas
                para a mesma ideia; agora são uma seção (spec 3.1). */}
            <ConexoesDoCliente token={token} />

            <section>
              <h3 className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.06em] mb-2">Em breve</h3>
              <div className="grid sm:grid-cols-2 gap-2.5">
                {INTEGRACOES_FUTURAS.map((it) => (
                  <div key={it.key} className="bg-white rounded-[12px] border border-[var(--border)] p-3.5 flex items-center gap-3">
                    <span aria-hidden className="w-9 h-9 rounded-[9px] flex items-center justify-center text-white text-[11px] font-bold shrink-0" style={{ background: it.color }}>{it.initials}</span>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-[var(--text-primary)]">{it.name}</p>
                      <p className="text-[11.5px] text-[var(--text-secondary)] leading-snug">{it.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-[var(--text-subtle)] mt-2.5">🔒 Toda conexão é feita pela autorização oficial da plataforma (OAuth). Você nunca digita senha aqui, e tokens nunca aparecem.</p>
            </section>

            {(data.segment || data.targetAudience || data.objectives.length > 0) && (
              <section className="bg-white rounded-[14px] border border-[var(--border)] p-5 shadow-[0_1px_3px_rgba(7,10,31,0.04)]">
                <h3 className="text-[14px] font-bold text-[var(--text-primary)] mb-3">Sobre o seu negócio</h3>
                <div className="space-y-3">
                  {data.segment && (
                    <div>
                      <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.06em]">Segmento</div>
                      <p className="text-[13px] text-[var(--text-primary)] mt-0.5">{data.segment}</p>
                    </div>
                  )}
                  {data.targetAudience && (
                    <div>
                      <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.06em]">Público-alvo</div>
                      <p className="text-[13px] text-[var(--text-primary)] mt-0.5">{data.targetAudience}</p>
                    </div>
                  )}
                  {data.objectives.length > 0 && (
                    <div>
                      <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.06em]">Objetivos</div>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {data.objectives.map((o, i) => (
                          <span key={i} className="h-7 px-3 rounded-full bg-[#F0EFEB] text-[var(--text-secondary)] text-[11px] font-medium flex items-center">{o}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}

            <section className="bg-white rounded-[14px] border border-[var(--border)] p-5">
              <h3 className="text-[14px] font-bold text-[var(--text-primary)] mb-1.5">Seu acesso</h3>
              <p className="text-[12.5px] text-[var(--text-secondary)] leading-relaxed">
                Você entra por um link único e seguro, sem senha. O link some da barra de endereço
                depois do primeiro acesso — o navegador guarda a chave num cookie protegido.
                Perdeu o link? Peça um novo ao seu PM pela conversa aqui do portal.
              </p>
            </section>
          </div>
        )}

      </main>

      <footer className="max-w-[860px] mx-auto px-5 pb-8 text-center">
        <p className="text-[10px] text-[var(--text-subtle)]">Acesso seguro via link único · Dioli Digital</p>
      </footer>

      {/* Chat com o PM — botão flutuante em TODAS as telas (adição do CEO).
          O PM é a ponte única: o cliente nunca fala com um departamento direto. */}
      {!chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          aria-label="Fale com seu PM"
          // `--fab-base` = deslocamento + safe-area do iOS: no iPhone o botão
          // parava por baixo do traço de home. Mesma fonte de medida que o
          // espaço reservado no layout — os dois nunca saem de sincronia.
          style={{ touchAction: "manipulation", background: "linear-gradient(135deg,#0B0F2A,#070A1F)", bottom: "var(--fab-base, 1.25rem)" }}
          className="fixed right-5 z-40 inline-flex items-center gap-2 h-12 pl-4 pr-5 rounded-full text-white font-semibold text-[13px] shadow-[0_8px_24px_rgba(7,10,31,0.35)] border border-white/10 transition-transform hover:scale-[1.03]"
        >
          <svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden>
            <path d="M4 4h12a1 1 0 011 1v8a1 1 0 01-1 1H8l-3.5 3V14H4a1 1 0 01-1-1V5a1 1 0 011-1z" stroke="#9AF5F0" strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
          Fale com seu PM
          <span aria-hidden className="w-2 h-2 rounded-full bg-[#22C55E]" />
        </button>
      )}

      <ChatDrawer
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        token={token}
        authorName={data.businessName}
        teamLabel="Fale com seu PM"
        subtitle="a ponte com todos os departamentos"
      />

      <style jsx global>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}
