"use client";

import { mensagemDeErro } from "@/components/agency/ui/mensagemDeErro";

// ── Portal do Cliente — Hub v1 (Fase 3 → Lote 2) ─────────────────────────────
// A tela do cliente inteira montada com os blocos da spec
// (docs/projetos/hub/02-blocos-fluxos-navegacao.md), em 7 itens de navegação:
// Início · Projetos · Aprovações · Resultados · Arquivos · Integrações · Conta.
// As ~10 abas antigas viraram estados internos — nada sumiu, mudou de casa.
//
// Regras que esta tela cumpre e que não são estilo, são contrato:
//   • UM ÚNICO LUGAR PARA DECIDIR (CEO, 07/08/2026). Tudo que espera decisão do
//     cliente — entrega OU orçamento — vive em Aprovações, e só ali. Início e
//     Projetos ANUNCIAM a pendência e LEVAM para lá; nenhum dos dois repete o
//     botão. A mesma decisão em duas telas é o cliente sem saber se já decidiu.
//   • Conta é sobre o CLIENTE (negócio, plano, acesso). Tudo que conecta um
//     aplicativo mora em Integrações. Uma aba, um assunto.
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
  idDeOrcamento,
  orcamentoEsperandoDecisao,
  type DecisaoDaEsteira,
  type AprovacaoDoPortal,
  type AcaoDeAprovacao,
} from "@/components/portal/AprovacoesDoCliente";
import { ResultadosDoCliente } from "@/components/portal/ResultadosDoCliente";
import { SolicitarAlgo, MeusPedidos, type PedidoDoCliente } from "@/components/portal/SolicitarAlgo";
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
  /** A etapa legível. É dela que sai a decisão de andamento que virou card de
   *  Aprovações — antes ela só existia como botão dentro do painel de esteira. */
  etapa?: string;
  titulo?: string;
  /** O que a esteira pede ao cliente, em uma frase. Entra na conta de
   *  pendências: o painel dizia "Conecte seu Instagram" enquanto o cabeçalho
   *  dizia "Nada pendente com você agora" — duas frases, a mesma tela. */
  oQueEsperamosDeVoce?: string;
  aBolaEstaComVoce?: boolean;
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

type SecaoId = "inicio" | "projetos" | "aprovacoes" | "resultados" | "arquivos" | "integracoes" | "conta";

// ── Config ───────────────────────────────────────────────────────────────────

// ── A NAVEGAÇÃO, E POR QUE ELA TEM 7 ITENS (CEO, 07/08/2026) ────────────────
// O teto era 6 e o custo de manter era um item fazendo dois papéis: "Conta"
// guardava o cadastro do cliente E as conexões com Facebook/Instagram/Drive.
// O CEO: "aba de Conta é todas as informações sobre esse cliente; aba onde você
// integra com aplicativos se chama aba de Integrações". Nomear a coisa pelo que
// ela é vale mais que o número — nome errado custa uma busca em toda visita.
//
// A ORDEM tem uma lógica só: o que a Dioli faz por você (Projetos, Aprovações,
// Resultados), o que você manda (Arquivos), o que você conecta (Integrações),
// e quem você é (Conta).
const NAV: { id: SecaoId; label: string }[] = [
  { id: "inicio",      label: "Início" },
  { id: "projetos",    label: "Projetos" },
  { id: "aprovacoes",  label: "Aprovações" },
  { id: "resultados",  label: "Resultados" },
  { id: "arquivos",    label: "Arquivos" },
  { id: "integracoes", label: "Integrações" },
  { id: "conta",       label: "Conta" },
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

// Integrações futuras (além da Meta e do Google Drive, que já são reais em
// Conexões). O Drive saiu daqui em 07/08/2026: cartão "EM BREVE" que não faz
// nada é promessa parada na tela do cliente.
const INTEGRACOES_FUTURAS: { key: string; name: string; desc: string; color: string; initials: string }[] = [
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

/** Campo da ficha do cliente. Sem dado, diz "Não informado" — nunca some.
 *  Bloco escondido é a agência sabendo que falta um dado e o cliente não. */
function CampoDaConta({ rotulo, valor }: { rotulo: string; valor?: string | null }) {
  const preenchido = !!valor?.trim();
  return (
    <div>
      <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.06em]">{rotulo}</div>
      <p className={`text-[13px] mt-0.5 ${preenchido ? "text-[var(--text-primary)]" : "text-[var(--text-subtle)]"}`}>
        {preenchido ? valor : "Não informado"}
      </p>
    </div>
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
  // A porta do cliente para dentro da agência. Mora AQUI, no topo da página,
  // porque abre por cima de qualquer seção — o CEO pediu "em segundo plano, e
  // não abrir uma página": trocar de tela faz ele perder o que estava olhando.
  const [solicitando, setSolicitando] = useState(false);
  const [recadoDoPedido, setRecadoDoPedido] = useState<string | null>(null);
  const [pedidos, setPedidos] = useState<PedidoDoCliente[]>([]);
  const [aprovacaoAberta, setAprovacaoAberta] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erroDecisao, setErroDecisao] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  // A4: com o cookie httpOnly gravado, o token NÃO entra mais em URL de mídia —
  // <img src="…?token=…"> deixava a credencial inteira no DOM. Nasce true no
  // modo cookie; vira true no modo link assim que a troca por cookie dá certo.
  const [cookiePronto, setCookiePronto] = useState(modoCookie);
  const trocouUrl = useRef(false);
  const navRef = useRef<HTMLDivElement | null>(null);

  // Com 7 itens, a barra rola no celular — e "Integrações" e "Conta" nascem
  // fora da tela. Aba ativa fora do campo de visão é o cliente sem saber onde
  // está: a barra se move até ela sempre que a seção muda.
  useEffect(() => {
    const ativo = navRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
    ativo?.scrollIntoView({ block: "nearest", inline: "center", behavior: "instant" });
  }, [secao]);

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

  const carregarPedidos = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/pedidos${token ? `?token=${encodeURIComponent(token)}` : ""}`, { cache: "no-store" });
      if (!res.ok) return;
      const j = await res.json();
      setPedidos(Array.isArray(j.pedidos) ? j.pedidos : []);
    } catch {
      // A porta de pedir continua funcionando sem a lista.
    }
  }, [token]);

  useEffect(() => { void carregarPedidos(); }, [carregarPedidos]);

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
  const carregarEsteira = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/esteira${q}`, { cache: "no-store" });
      if (res.ok) setEsteira(await res.json());
    } catch { /* o Início ainda funciona sem a esteira */ }
  }, [q]);

  useEffect(() => { void carregarEsteira(); }, [carregarEsteira]);

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
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      await loadData();
      return true;
    } catch (e) {
      // Quem lê isto é o CLIENTE PAGANTE. "Falha HTTP 500" na tela dele não é
      // mensagem de erro, é log vazado — DESIGN.md §7.3.
      setErroDecisao(mensagemDeErro(e, "registrar sua resposta").mensagem);
      return false;
    } finally {
      setEnviando(false);
    }
  }

  // A decisão do ORÇAMENTO subiu para cá junto com os botões: ela é irmã de
  // `decidir` (a decisão da entrega) e as duas passam pelo MESMO estado de
  // envio e pela MESMA caixa de erro. Enquanto morava dentro de `MeusPedidos`,
  // cada tela que renderizava a lista carregava uma cópia do mesmo poder.
  async function decidirOrcamento(pedidoId: string, decisao: "aceito" | "recusado"): Promise<boolean> {
    if (enviando) return false;
    setEnviando(true);
    setErroDecisao(null);
    try {
      const res = await fetch("/api/portal/pedidos/orcamento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(token ? { token } : {}), pedidoId, decisao }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({} as { error?: string }));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      await carregarPedidos();
      return true;
    } catch (e) {
      setErroDecisao(mensagemDeErro(e, "registrar sua resposta").mensagem);
      return false;
    } finally {
      setEnviando(false);
    }
  }

  // A decisão de ANDAMENTO (confirmar o caminho · aprovar o pacote). Saiu de
  // dentro do painel da esteira, que aparece em duas telas, e virou card de
  // Aprovações — o único lugar onde o cliente decide.
  async function decidirEsteira(decisao: "aprovar_direcao" | "aprovar_pacote"): Promise<boolean> {
    if (enviando) return false;
    setEnviando(true);
    setErroDecisao(null);
    try {
      const res = await fetch("/api/portal/esteira", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(token ? { token, decisao } : { decisao }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({} as { error?: string }));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      await Promise.all([carregarEsteira(), loadData()]);
      return true;
    } catch (e) {
      setErroDecisao(mensagemDeErro(e, "registrar sua aprovação").mensagem);
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
    // "network" e a falha genérica são recuperáveis: quem chega aqui por queda
    // de conexão precisa de um BOTÃO, não de um pedido para recarregar a
    // página. Link expirado/revogado não tem o que tentar — só contato.
    const podeTentarDeNovo = error === "network" || !error;
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-elevated)] px-4">
        <div className="max-w-sm text-center" role="alert">
          <div className="w-12 h-12 rounded-full bg-[var(--warning-bg)] flex items-center justify-center mx-auto mb-4 text-xl" aria-hidden>⚠</div>
          <h1 className="text-[18px] font-semibold text-[var(--text-primary)] mb-2">{msg.title}</h1>
          <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">{msg.body}</p>
          {podeTentarDeNovo && (
            <button
              onClick={() => { setError(null); setLoading(true); void loadData(); }}
              className="mt-4 h-10 px-4 rounded-[10px] bg-[var(--text-primary)] text-white text-[13px] font-semibold"
              style={{ touchAction: "manipulation" }}
            >
              Tentar de novo
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Derivações ────────────────────────────────────────────────────────────
  const pendentes = data.approvals.filter((a) => a.status === "pending");
  // O orçamento com preço na mesa é uma DECISÃO — conta junto das aprovações em
  // toda contagem da tela (selo da navegação, frase do cabeçalho, bloco "o que
  // depende de você"). Antes ele não contava em lugar nenhum e mesmo assim
  // tinha botão em duas telas: número que não bate com o que a tela pede.
  const orcamentosPendentes = pedidos.filter(orcamentoEsperandoDecisao);
  // A decisão de andamento, derivada da MESMA etapa que a esteira mostra — para
  // as duas telas nunca discordarem sobre a bola estar com o cliente.
  const etapaEsteira = (esteira?.etapa ?? "").toLowerCase();
  const decisaoDaEsteira: DecisaoDaEsteira | null = etapaEsteira.includes("confirme o caminho")
    ? {
        titulo: "Confirme o caminho do projeto",
        descricao: "A equipe montou a direção do trabalho a partir do seu briefing. Com o seu sim, a produção começa; se algo não fizer sentido, fale com seu PM antes de aprovar.",
        rotulo: "Aprovar e começar",
        decidir: () => decidirEsteira("aprovar_direcao"),
      }
    : etapaEsteira.includes("tudo pronto")
      ? {
          titulo: "O pacote inteiro está pronto para você",
          descricao: "Terminamos e organizamos tudo. Aprovar o pacote libera a publicação do calendário e coloca o trabalho em operação. Você pode decidir item por item nas linhas abaixo, ou aprovar tudo de uma vez.",
          rotulo: "Aprovar tudo",
          decidir: () => decidirEsteira("aprovar_pacote"),
        }
      : null;
  const decididas = data.approvals
    .filter((a) => a.status !== "pending" && a.reviewedAt)
    .sort((a, b) => (b.reviewedAt ?? "").localeCompare(a.reviewedAt ?? ""));
  const materiaisPedidos = esteira?.pendencias ?? [];
  const conexoesQuebradas = conexoes.filter((c) => ["expired", "revoked", "error"].includes(c.status));
  const outrasPendencias =
    pendentes.length + orcamentosPendentes.length + (decisaoDaEsteira ? 1 : 0)
    + materiaisPedidos.length + conexoesQuebradas.length;

  // ── A PENDÊNCIA QUE SÓ A ESTEIRA ENXERGA ──────────────────────────────────
  // A esteira sabe pedir coisas que não são aprovação, material nem conexão
  // quebrada — "conecte seu Instagram" quando NUNCA houve conexão, por exemplo.
  // Sem esta linha, o painel dizia "O que precisamos de você: conecte seu
  // Instagram" três dedos abaixo de "Nada pendente com você agora".
  // Entra só quando nenhuma outra fonte já cobre o assunto — a regra é somar o
  // que falta, nunca contar duas vezes o mesmo pedido.
  const pedidoDaEsteira = esteira?.aBolaEstaComVoce ? esteira.oQueEsperamosDeVoce?.trim() : "";
  const pendenciaDaEsteira = outrasPendencias === 0 && pedidoDaEsteira
    ? {
        texto: pedidoDaEsteira,
        titulo: esteira?.etapa || esteira?.titulo || "A equipe precisa de você",
        destino: /conect|instagram|facebook|integra/i.test(pedidoDaEsteira)
          ? ("integracoes" as SecaoId)
          : /envi|materi|arquiv|foto|v[íi]deo|log[oô]/i.test(pedidoDaEsteira)
            ? ("arquivos" as SecaoId)
            : ("projetos" as SecaoId),
      }
    : null;

  const totalPendencias = outrasPendencias + (pendenciaDaEsteira ? 1 : 0);
  // O selo da navegação é a MESMA conta de "aguardando você" dentro de
  // Aprovações. Dois números com nomes parecidos e valores diferentes é o que
  // faz o cliente desconfiar da tela.
  const decisoesEsperando = pendentes.length + orcamentosPendentes.length + (decisaoDaEsteira ? 1 : 0);
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
          <div ref={navRef} className="flex gap-1 overflow-x-auto no-scrollbar py-2.5">
            {NAV.map((item) => {
              const active = secao === item.id;
              const badge = item.id === "aprovacoes" ? decisoesEsperando : 0;
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
                  {/* A decisão de andamento entra na LISTA, não só na contagem.
                      Sem esta linha o cabeçalho dizia "5 pendências" e o bloco
                      mostrava 4 — número que não bate com a tela é o cliente
                      procurando uma quinta coisa que não existe. */}
                  {decisaoDaEsteira && (
                    <LinhaDePendencia
                      icone="🚦" fundo="var(--warning-bg)"
                      titulo={decisaoDaEsteira.titulo}
                      porque={decisaoDaEsteira.descricao}
                      meta="Decidir em Aprovações"
                      onClick={() => irPara("aprovacoes")}
                    />
                  )}
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
                  {/* O orçamento também é decisão — e o caminho dele é o mesmo
                      de qualquer outra: Aprovações. Antes ele nem aparecia
                      aqui, mas tinha botão em Projetos. */}
                  {orcamentosPendentes.map((p) => (
                    <LinhaDePendencia
                      key={`orc-${p.id}`}
                      icone="💬" fundo="var(--accent-light)"
                      titulo={`Orçamento de ${p.titulo} aguarda sua resposta`}
                      porque="A equipe já respondeu com preço e prazo — falta o seu sim."
                      meta="Decidir em Aprovações"
                      onClick={() => irPara("aprovacoes", idDeOrcamento(p.id))}
                    />
                  ))}
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
                  {pendenciaDaEsteira && (
                    <LinhaDePendencia
                      icone="🔔" fundo="var(--info-bg)"
                      titulo={pendenciaDaEsteira.titulo}
                      porque={pendenciaDaEsteira.texto}
                      meta={pendenciaDaEsteira.destino === "integracoes"
                        ? "Resolver em Integrações"
                        : pendenciaDaEsteira.destino === "arquivos"
                          ? "Enviar em Arquivos"
                          : "Ver em Projetos"}
                      onClick={() => irPara(pendenciaDaEsteira.destino)}
                    />
                  )}
                  {conexoesQuebradas.map((c) => (
                    <LinhaDePendencia
                      key={c.id}
                      icone="🔌" fundo="#FEF2F2"
                      titulo={`${c.name || c.platform} desconectado — reconecte a conta`}
                      porque="Sem a conexão, os posts aprovados não podem ser publicados."
                      meta="Resolver em Integrações"
                      onClick={() => irPara("integracoes")}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* 2 · Onde estamos */}
            <section>
              <TituloDeBloco n={2}>Onde estamos e o que vem</TituloDeBloco>
              <EsteiraDoCliente token={token} aoIrParaAprovacoes={() => irPara("aprovacoes")} />
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
                      <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[11px] font-semibold bg-[#DCFCE7] text-[var(--success)] shrink-0">
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
                      {/* O QUE foi decidido em cima, QUAL decisão embaixo. Numa
                          linha só, "Kit de marca — paleta e tipografia — a…"
                          cortava justamente a palavra que diz o resultado. */}
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] font-semibold text-[var(--text-primary)] truncate">
                          {tituloDaAprovacao(d)}{d.version != null ? ` (v${d.version})` : ""}
                        </span>
                        <span className="block text-[12px] text-[var(--text-secondary)] leading-snug">
                          {DECISAO_LABEL[d.status] ?? d.status} · {dataCurta(d.reviewedAt)}
                        </span>
                      </span>
                    </button>
                  ))}
                  <div className="px-4 py-2.5 border-t border-[var(--border)]">
                    <button onClick={() => irPara("aprovacoes")} className="text-[12.5px] font-semibold text-[var(--teal-text)] hover:underline" style={{ touchAction: "manipulation" }}>
                      Ver todas as decisões →
                    </button>
                  </div>
                </div>
              </section>
            )}

            {/* 5 · Resultado do ciclo — SÓ com meta + comparação + ação.
                Sem ciclo fechado com dado completo, o bloco simplesmente não
                existe: os tiles "—" morreram e não voltam como placeholder. */}

            {/* A PORTA DE VENDA. Estava no rodapé e navegava para outra aba —
                o CEO: "está muito escondido... precisa estar super destacado...
                tem que abrir em segundo plano e não abrir uma página". Porta de
                venda no rodapé é porta fechada. */}
            <button
              onClick={() => { setSolicitando(true); setRecadoDoPedido(null); }}
              style={{ touchAction: "manipulation" }}
              className="w-full flex items-center gap-3.5 rounded-[16px] px-5 py-4 text-left bg-[#070A1F] text-white shadow-[0_6px_20px_rgba(7,10,31,0.22)] hover:-translate-y-0.5 transition-transform"
            >
              <span aria-hidden className="shrink-0 w-11 h-11 rounded-[12px] bg-[#12B5AC] flex items-center justify-center text-[20px] font-bold leading-none">+</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold">Precisa de alguma coisa?</span>
                <span className="block text-[12.5px] text-white/70 mt-0.5 leading-snug">
                  Peça, serviço novo, orçamento — a equipe responde aqui com prazo e preço.
                </span>
              </span>
              <span aria-hidden className="text-white/50 text-[18px]">›</span>
            </button>

            {recadoDoPedido && (
              <p className="rounded-[12px] bg-[#ECFDF5] px-4 py-3 text-[13px] text-[#047857]">✓ {recadoDoPedido}</p>
            )}

            {/* A lista "Seus pedidos" NÃO se repete aqui. Ela morava no Início
                E em Projetos, com os botões de decisão nas duas — a mesma coisa
                em dois lugares é o que faz o cliente não saber se já decidiu.
                O que espera decisão já está no bloco 1, no topo; o
                acompanhamento completo mora em Projetos. */}
            {pedidos.length > 0 && (
              <button
                onClick={() => irPara("projetos")}
                style={{ touchAction: "manipulation" }}
                className="w-full text-left text-[12.5px] font-semibold text-[var(--teal-text)] hover:underline"
              >
                Ver todos os seus pedidos em Projetos →
              </button>
            )}

          </div>
        )}

        {/* ══ PROJETOS — as abas de serviço viraram estados daqui ══ */}
        {secao === "projetos" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-[18px] font-bold text-[var(--text-primary)]">Projetos</h2>
              <p className="text-[12.5px] text-[var(--text-secondary)] mt-0.5">
                O andamento do que a Dioli está construindo para você. Decisões ficam em <b>Aprovações</b>.
              </p>
            </div>

            {/* A metade visível da regra: existindo decisão pendente, Projetos
                a ANUNCIA e aponta o caminho — sem repetir o botão. */}
            {decisoesEsperando > 0 && (
              <button
                onClick={() => irPara("aprovacoes")}
                style={{ touchAction: "manipulation" }}
                className="w-full flex items-center gap-3 rounded-[12px] border border-[var(--border)] bg-[var(--warning-bg)] px-4 py-3 text-left hover:brightness-[0.98] transition-[filter]"
              >
                <span aria-hidden className="shrink-0 w-8 h-8 rounded-[9px] bg-white/70 flex items-center justify-center text-[14px]">✍️</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-bold text-[var(--warning)]">
                    {decisoesEsperando === 1 ? "1 item espera sua decisão" : `${decisoesEsperando} itens esperam sua decisão`}
                  </span>
                  <span className="block text-[12px] text-[var(--warning)]/90 mt-0.5">
                    Tudo que precisa de um sim seu fica em Aprovações — inclusive orçamentos.
                  </span>
                </span>
                <span aria-hidden className="text-[var(--warning)]">›</span>
              </button>
            )}

            <EsteiraDoCliente token={token} aoIrParaAprovacoes={() => irPara("aprovacoes")} />

            {/* O mesmo caminho, na aba onde ele pensa no trabalho. Um só
                componente, um só formulário: duas portas para a mesma folha. */}
            <button
              onClick={() => { setSolicitando(true); setRecadoDoPedido(null); }}
              style={{ touchAction: "manipulation" }}
              className="w-full flex items-center gap-3.5 rounded-[14px] px-4 py-3.5 text-left bg-white border border-[var(--border)] hover:bg-[var(--bg-elevated)] transition-colors shadow-[0_1px_3px_rgba(7,10,31,0.04)]"
            >
              <span aria-hidden className="shrink-0 w-10 h-10 rounded-[11px] bg-[#E6FBFA] text-[#0E9E96] flex items-center justify-center text-[19px] font-bold leading-none">+</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-bold text-[var(--text-primary)]">Precisa de alguma coisa?</span>
                <span className="block text-[12px] text-[var(--text-secondary)] mt-0.5">Peça, serviço novo ou orçamento — a resposta vem com preço.</span>
              </span>
            </button>

            {/* Sem botões de decisão: Projetos MOSTRA o estado e leva para
                Aprovações. A mesma decisão não pode existir em duas telas. */}
            {pedidos.length > 0 && (
              <MeusPedidos
                pedidos={pedidos}
                aoIrParaAprovacoes={(id) => irPara("aprovacoes", idDeOrcamento(id))}
              />
            )}

            {/* Cartões de projeto — vêm por clientId, então aparecem também
                para o cliente criado direto (a correção do "onde eu vejo o
                projeto?" do lançamento da Foocci). */}
            {projetos.map((p) => (
              <section key={p.id} className="bg-white rounded-[14px] border border-[var(--border)] p-5 shadow-[0_1px_3px_rgba(7,10,31,0.04)]">
                {/* No celular o selo desce: "Aprovado por você — colocando no
                    ar" ao lado do título deixava "Presença digital — agosto"
                    quebrado em três linhas de uma palavra. */}
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3">
                  <div className="min-w-0 order-2 sm:order-1">
                    <h3 className="text-[15px] font-bold text-[var(--text-primary)] leading-snug">{p.nome}</h3>
                    {p.objetivo && (
                      <p className="text-[12.5px] text-[var(--text-secondary)] mt-1 leading-relaxed">{p.objetivo}</p>
                    )}
                  </div>
                  <span className="order-1 sm:order-2 self-start shrink-0 h-6 px-2.5 rounded-full bg-[var(--info-bg)] text-[var(--info)] text-[11px] font-semibold flex items-center">
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
                      <span className="h-5 px-2 rounded-full bg-[#DCFCE7] text-[var(--success)] text-[10px] font-semibold flex items-center">✓ Plano aprovado</span>
                    )}
                  </div>
                  {dept && (dept.headline || dept.bullets.length > 0) ? (
                    <>
                      {dept.headline && <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed mb-2">{dept.headline}</p>}
                      {dept.bullets.length > 0 && (
                        <ul className="space-y-1.5">
                          {dept.bullets.map((b, i) => (
                            <li key={i} className="flex items-start gap-2 text-[12.5px] text-[var(--text-secondary)]"><span aria-hidden className="text-[var(--teal-text)] mt-0.5 shrink-0">•</span>{b}</li>
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
              <div role="alert" className="bg-white rounded-[14px] border border-[#FCA5A5] p-7 text-center">
                <p className="text-[13.5px] font-semibold text-[var(--text-primary)]">Não consegui carregar seus projetos</p>
                <p className="text-[12px] text-[var(--text-secondary)] mt-1">
                  Costuma ser conexão. Tente de novo — se continuar assim, fale com a gente pela conversa aqui do portal.
                </p>
                <div className="flex items-center justify-center gap-2 mt-4">
                  <button
                    onClick={() => { setErroProjetos(false); void loadData(); }}
                    className="h-10 px-4 rounded-[10px] bg-[var(--text-primary)] text-white text-[13px] font-semibold"
                    style={{ touchAction: "manipulation" }}
                  >
                    Tentar de novo
                  </button>
                  <button
                    onClick={() => setChatOpen(true)}
                    className="h-10 px-4 rounded-[10px] border border-[var(--border)] text-[var(--text-primary)] text-[13px] font-semibold"
                    style={{ touchAction: "manipulation" }}
                  >
                    Falar com seu PM
                  </button>
                </div>
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
            orcamentos={pedidos}
            decisaoDaEsteira={decisaoDaEsteira}
            token={tokenDeMidia}
            abertaId={aprovacaoAberta}
            onAbrir={(id) => irPara("aprovacoes", id)}
            enviando={enviando}
            erro={erroDecisao}
            onDecidir={decidir}
            onDecidirOrcamento={decidirOrcamento}
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
            <ResultadosDoCliente token={token} onIrParaIntegracoes={() => irPara("integracoes")} />
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
                <button onClick={() => setChatOpen(true)} className="text-[var(--teal-text)] font-semibold hover:underline" style={{ touchAction: "manipulation" }}>fale com seu PM</button>{" "}
                e cole o link na conversa.
              </p>
            </div>
          </div>
        )}

        {/* ══ INTEGRAÇÕES — tudo que CONECTA um aplicativo ══
            Saiu de dentro de Conta em 07/08/2026, por ordem do CEO: "aba onde
            você integra com aplicativos se chama aba de Integrações". Conta
            passou a ser só sobre o cliente. ══ */}
        {secao === "integracoes" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-[18px] font-bold text-[var(--text-primary)]">Integrações</h2>
              <p className="text-[12.5px] text-[var(--text-secondary)] mt-0.5">
                As contas que você conecta à Dioli — e o que cada uma libera. Conectar é opcional: sem elas o trabalho continua, só não é publicado nem medido automaticamente.
              </p>
            </div>

            {conexoesQuebradas.length > 0 && (
              <div role="alert" className="rounded-[12px] border border-[var(--border)] bg-[var(--danger-bg)] px-4 py-3">
                <p className="text-[12.5px] font-semibold text-[var(--danger)]">
                  {conexoesQuebradas.length === 1
                    ? "1 conexão precisa ser refeita"
                    : `${conexoesQuebradas.length} conexões precisam ser refeitas`}
                </p>
                <p className="text-[12px] text-[var(--danger)] mt-0.5 leading-snug">
                  Enquanto ela estiver assim, os posts aprovados não são publicados e os números não atualizam.
                </p>
              </div>
            )}

            {/* Checklist de conexões reais (Meta/Instagram, Google Drive, ativos
                autorizados) — o componente já trata carregando / vazio / erro. */}
            <ConexoesDoCliente token={token} />

            <section>
              <h3 className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.06em] mb-2">Em breve</h3>
              <p className="text-[12px] text-[var(--text-secondary)] mb-2.5 max-w-[62ch] leading-relaxed">
                Ainda não dá para conectar estas — quando abrirem, elas aparecem aqui com o botão de conectar. Não há nada a fazer agora.
              </p>
              <div className="grid sm:grid-cols-2 gap-2.5">
                {INTEGRACOES_FUTURAS.map((it) => (
                  <div key={it.key} className="bg-white rounded-[12px] border border-[var(--border)] p-3.5 flex items-center gap-3">
                    <span aria-hidden className="w-9 h-9 rounded-[9px] flex items-center justify-center text-white text-[11px] font-bold shrink-0" style={{ background: it.color }}>{it.initials}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-[var(--text-primary)]">{it.name}</p>
                      <p className="text-[11.5px] text-[var(--text-secondary)] leading-snug">{it.desc}</p>
                    </div>
                    <span className="shrink-0 h-6 px-2.5 rounded-full bg-[var(--accent)] text-[var(--text-muted)] text-[11px] font-semibold flex items-center">Em breve</span>
                  </div>
                ))}
              </div>
              <p className="text-[11.5px] text-[var(--text-muted)] mt-2.5 leading-relaxed">
                🔒 Toda conexão é feita pela autorização oficial da plataforma (OAuth). Você nunca digita senha aqui, e tokens nunca aparecem.
              </p>
            </section>
          </div>
        )}

        {/* ══ CONTA — TUDO sobre o cliente: negócio, plano, acesso ══ */}
        {secao === "conta" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-[18px] font-bold text-[var(--text-primary)]">Conta</h2>
              <p className="text-[12.5px] text-[var(--text-secondary)] mt-0.5">
                Os dados do seu negócio, o que você contratou e como você entra aqui.
              </p>
            </div>

            <section className="bg-white rounded-[14px] border border-[var(--border)] p-5 shadow-[0_1px_3px_rgba(7,10,31,0.04)]">
              <h3 className="text-[14px] font-bold text-[var(--text-primary)] mb-3">Sobre o seu negócio</h3>
              <div className="space-y-3">
                <div>
                  <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.06em]">Nome</div>
                  <p className="text-[13px] text-[var(--text-primary)] mt-0.5">{data.businessName}</p>
                </div>
                {/* Estado honesto vence preenchimento bonito: campo sem dado diz
                    "não informado" e como corrigir — nunca some da tela, senão
                    o cliente não sabe que a agência está sem aquele dado. */}
                <CampoDaConta rotulo="Segmento" valor={data.segment} />
                <CampoDaConta rotulo="Público-alvo" valor={data.targetAudience} />
                <div>
                  <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.06em]">Objetivos</div>
                  {data.objectives.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {data.objectives.map((o, i) => (
                        <span key={i} className="h-7 px-3 rounded-full bg-[var(--accent)] text-[var(--text-secondary)] text-[12px] font-medium flex items-center">{o}</span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[13px] text-[var(--text-subtle)] mt-0.5">Não informado</p>
                  )}
                </div>
              </div>
              <p className="text-[11.5px] text-[var(--text-muted)] mt-4 leading-relaxed">
                Algum dado está errado ou faltando? Diga na conversa com seu PM — a equipe corrige e o novo dado passa a valer para todo o trabalho.
              </p>
            </section>

            <section className="bg-white rounded-[14px] border border-[var(--border)] p-5 shadow-[0_1px_3px_rgba(7,10,31,0.04)]">
              <h3 className="text-[14px] font-bold text-[var(--text-primary)] mb-3">O que você contratou</h3>
              {data.services.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {data.services.map((s, i) => (
                    <span key={i} className="h-8 px-3.5 rounded-[9px] bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-primary)] text-[12px] font-medium flex items-center">{s}</span>
                  ))}
                </div>
              ) : (
                <p className="text-[12.5px] text-[var(--text-secondary)] leading-relaxed">
                  Nenhum serviço registrado neste cadastro ainda. Se você já contratou algo, fale com seu PM — o plano precisa aparecer aqui.
                </p>
              )}
              <p className="text-[11.5px] text-[var(--text-muted)] mt-3">
                Situação atual do trabalho: <b className="text-[var(--text-secondary)]">{currentStatus}</b>.
              </p>
            </section>

            <section className="bg-white rounded-[14px] border border-[var(--border)] p-5">
              <h3 className="text-[14px] font-bold text-[var(--text-primary)] mb-1.5">Seu acesso</h3>
              <p className="text-[12.5px] text-[var(--text-secondary)] leading-relaxed">
                Você entra por um link único e seguro, sem senha. O link some da barra de endereço
                depois do primeiro acesso — o navegador guarda a chave num cookie protegido.
                Perdeu o link? Peça um novo ao seu PM pela conversa aqui do portal.
              </p>
              <button
                onClick={() => setChatOpen(true)}
                style={{ touchAction: "manipulation" }}
                className="mt-3 h-10 px-4 rounded-[10px] border border-[var(--border-strong)] bg-white text-[13px] font-semibold text-[var(--text-primary)] hover:bg-[var(--accent)] transition-colors"
              >
                Falar com seu PM
              </button>
            </section>

            {/* Ponte explícita: quem procurou conexão em Conta (onde ela morava
                até hoje) encontra a porta, em vez de concluir que sumiu. */}
            <button
              onClick={() => irPara("integracoes")}
              style={{ touchAction: "manipulation" }}
              className="w-full flex items-center gap-3 rounded-[12px] border border-[var(--border)] bg-white px-4 py-3.5 text-left hover:bg-[var(--bg-elevated)] transition-colors"
            >
              <span aria-hidden className="shrink-0 w-9 h-9 rounded-[9px] bg-[var(--accent-light)] flex items-center justify-center text-[15px]">🔌</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-semibold text-[var(--text-primary)]">Procurando suas conexões?</span>
                <span className="block text-[12px] text-[var(--text-secondary)] mt-0.5">Facebook, Instagram e Google Drive agora ficam em Integrações.</span>
              </span>
              <span aria-hidden className="text-[var(--text-subtle)]">›</span>
            </button>
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

      {/* A folha de solicitar. Mora na raiz porque abre por cima de QUALQUER
          seção — e é por isso que o clique não navega mais. */}
      <SolicitarAlgo
        token={token}
        aberto={solicitando}
        aoFechar={() => setSolicitando(false)}
        // `loadData` junto porque desde 06/08/2026 a esteira pode ter ENTREGADO
        // a peça antes desta linha rodar: o card de aprovação já existe, e sem
        // recarregar o portal-data o cliente leria "está nas suas aprovações"
        // olhando para uma aba vazia.
        aoEnviar={(recado) => { setRecadoDoPedido(recado); void carregarPedidos(); void loadData(); }}
      />

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
