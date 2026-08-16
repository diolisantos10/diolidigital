"use client";

// ── PORTAL DO CLIENTE — 11 abas, navegação horizontal ───────────────────────
//
// Implantação da referência aprovada pelo CEO (CLAUDE_HANDOFF_2, 14/08/2026).
// A estrutura, as classes e os componentes são os da referência
// (`app/portal/portal-cliente.css`); nada foi redesenhado, simplificado nem
// reinterpretado.
//
// AS REGRAS DO HANDOFF QUE ESTA TELA CUMPRE, e onde cada uma vive:
//
//  1. Não redesenhar. A folha de estilo é a da referência, copiada; o que foi
//     acrescentado (estados vazios, 375px) está marcado no fim do arquivo CSS.
//  2. Cabeçalho = símbolo do cliente · nome da marca ao lado · ABAIXO o nome da
//     tela. Montado por `cabecalhoDoPortal()`, que RECUSA "Visão Geral da X" em
//     vez de corrigir em silêncio. Nome e símbolo vêm do CADASTRO.
//  3. As 11 abas em navegação HORIZONTAL, com setas laterais. Sem menu lateral.
//  4. O que é interno não sai do SERVIDOR — `lib/agency/portal/vista-do-cliente.ts`
//     monta a vista por allowlist, e o teste de vazamento aponta o caminho do
//     campo quando alguém abre a fronteira.
//  5. A operação aparece POR DEPARTAMENTO (Social, Tráfego, Branding, Design, PM).
//  6. Em lugar nenhum se enfatiza que o trabalho é feito por IA.
//  7. Linguagem de dono de negócio. Tela inicial informativa, resultado
//     primeiro; solicitações é função secundária (aba 9, e o botão flutuante).
//  8. Molde único: cliente SEM projeto, SEM aprovação e SEM entrega abre uma
//     tela que faz sentido — cada aba trata o próprio vazio.
//  9. Dados reais onde existem; onde não existem, o vazio diz POR QUÊ. Nenhum
//     número desta tela é inventado.
// 10. Nada da tela anterior sumiu — as 5 seções antigas viraram abas, e cada
//     componente que existia continua montado (ver o mapa em `MUDOU_DE_CASA`).
//
// ── O QUE MUDOU DE CASA (nada foi apagado) ─────────────────────────────────
//   Início            → Visão Geral
//   Projetos          → Projetos (a trilha da esteira segue dentro)
//   Aprovações        → Aprovações (componente inteiro, os 3 caminhos)
//   Enviar arquivos   → Entregas (o envio é o lado direito da aba)
//   Sua conta         → Minha conta + Integrações (as duas seções que já eram
//                       rotuladas lá dentro voltam a ser abas próprias)
//   "Seus números"    → Resultados (e um recorte em Social Media)
//   Calendário do mês → Social Media
//   Seus pedidos      → Solicitações
//   Chat com o PM     → cabeçalho + botão flutuante, como antes
//
// A4 (segurança) segue igual: o token sai da URL no primeiro acesso, o cookie
// httpOnly autentica, e a mídia deixa de carregar credencial no DOM.

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { mensagemDeErro } from "@/components/agency/ui/mensagemDeErro";
import { CalendarioDoMes } from "@/components/portal/CalendarioDoMes";
import { ConexoesDoCliente } from "@/components/portal/ConexoesDoCliente";
import { MateriaisDaMarca } from "@/components/portal/cliente/MateriaisDaMarca";
import {
  AprovacoesDoCliente,
  idDeOrcamento,
  orcamentoEsperandoDecisao,
  type DecisaoDaEsteira,
  type AprovacaoDoPortal,
  type AcaoDeAprovacao,
  type DecisaoDeOrcamento,
} from "@/components/portal/AprovacoesDoCliente";
import { ResultadosDoCliente } from "@/components/portal/ResultadosDoCliente";
import { SolicitarAlgo, MeusPedidos, type PedidoDoCliente } from "@/components/portal/SolicitarAlgo";
import { ChatDrawer } from "@/components/agency/portal/FloatingChat";
import EsteiraDoCliente from "@/components/agency/portal/EsteiraDoCliente";
import { cabecalhoDoPortal } from "@/lib/agency/portal/cabecalho";
import type { VistaDoCliente } from "@/lib/agency/portal/vista-do-cliente";
import {
  VisaoGeral,
  type NumeroMedido, type PecaDoCalendario, type PendenciaDaVisaoGeral,
  type RedeDoCliente, type ResumoDoPeriodo,
} from "@/components/portal/cliente/VisaoGeral";
import {
  AbaBrandHub, AbaEntregas, AbaMinhaConta, AbaProjetos, AbaResultados, AbaTrafegoPago,
  type ProjetoDoPortal,
} from "@/components/portal/cliente/abas";
import { EntrevistaDeMarca } from "@/components/portal/cliente/EntrevistaDeMarca";
import { CapaDaAba, Carregando, Erro, Etiqueta, Numeros, TituloDeSecao, Vazio, dataCurta } from "@/components/portal/cliente/pecas";

// ── As 11 abas, na ordem do handoff ─────────────────────────────────────────
type AbaId =
  | "inicio" | "social" | "trafego" | "resultados" | "projetos" | "aprovacoes"
  | "entregas" | "marca" | "solicitacoes" | "integracoes" | "conta";

const ABAS: { id: AbaId; label: string }[] = [
  { id: "inicio",       label: "Visão Geral" },
  { id: "social",       label: "Social Media" },
  { id: "trafego",      label: "Tráfego Pago" },
  { id: "resultados",   label: "Resultados" },
  { id: "projetos",     label: "Projetos" },
  { id: "aprovacoes",   label: "Aprovações" },
  { id: "entregas",     label: "Entregas" },
  { id: "marca",        label: "Brand Hub" },
  { id: "solicitacoes", label: "Solicitações" },
  { id: "integracoes",  label: "Integrações" },
  { id: "conta",        label: "Minha conta" },
];

/** Endereços antigos que continuam válidos — link antigo nunca vira beco. */
const DESTINO_ANTIGO: Record<string, AbaId> = {
  inicio: "inicio", projetos: "projetos", aprovacoes: "aprovacoes",
  arquivos: "entregas", conta: "conta", integracoes: "integracoes",
  resultados: "resultados",
};

// ── Tipos das rotas já existentes ───────────────────────────────────────────

interface PipelineStep { id: string; departmentKey: string; department: string; approvedAt: string; version: number }
interface PortalData {
  id: string | null;
  businessName: string;
  status: string;
  services: string[];
  objectives: string[];
  createdAt: string | null;
  pipeline: PipelineStep[];
  approvals: AprovacaoDoPortal[];
}

interface EstadoEsteira {
  ok: boolean;
  temProjeto: boolean;
  etapa?: string;
  titulo?: string;
  oQueEsperamosDeVoce?: string;
  aBolaEstaComVoce?: boolean;
  pendencias?: string[];
  pacote?: { pedeAprovacao: boolean; prontas: string[]; emProducao: string[] } | null;
}

interface ConexaoView {
  id: string; platform: string; name: string; status: string;
  estado?: "viva" | "nao_verificada" | "caiu";
  quemResolve?: "cliente" | "agencia" | "ninguem_agora" | null;
}

interface PortalPost {
  id: string; caption: string; networks: string[]; format: string; pillar: string | null;
  mediaUrl: string | null; telas?: string[]; scheduledFor: string | null; status: string;
}

interface MetricasDoPortal {
  ok?: boolean;
  semConexao?: boolean;
  precisaReconectar?: boolean;
  conta?: {
    perfil?: { seguidores: number | null; totalDePosts: number | null };
    periodo?: { desde: string; ate: string };
    totais?: { alcance: number | null; visualizacoes: number | null; contasComEngajamento: number | null; interacoes: number | null };
    rotuloDoAlcance?: string;
  };
  serie?: { data: string; alcance: number }[];
}

function sanitizePortalToken(raw: string): string {
  return raw.trim().replace(/^`+|`+$/g, "").trim().replace(/\.+$/, "");
}

/** Número em pt-BR. `null` NUNCA vira zero — zero é medição, ausência é ausência. */
function numeroBR(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  if (Math.abs(n) >= 1000) return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(n);
  return new Intl.NumberFormat("pt-BR").format(n);
}

function diaCurto(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}` : iso;
}

export default function PortalDoCliente({ params }: { params: Promise<{ token: string }> }) {
  const { token: rawToken } = use(params);
  const tokenDaUrl = sanitizePortalToken(rawToken);
  const modoCookie = tokenDaUrl === "me";
  const token = modoCookie ? "" : tokenDaUrl;
  const q = token ? `?token=${encodeURIComponent(token)}` : "";

  const [vista, setVista] = useState<VistaDoCliente | null>(null);
  // ── QUEM ESTA TELA ESTÁ MOSTRANDO (15/08/2026, incidente do portal) ───────
  // A identidade OPACA do dono desta tela, como o SERVIDOR a derivou em
  // `/api/portal/vista`. Ela viaja junto da conversa do PM para que o servidor
  // possa conferir que o cliente da tela e o cliente da credencial da conversa
  // são o mesmo. Ela não abre nada: só faz a conversa fechar quando divergem.
  const [donoDaTela, setDonoDaTela] = useState<string | null>(null);
  const [data, setData] = useState<PortalData | null>(null);
  const [esteira, setEsteira] = useState<EstadoEsteira | null>(null);
  const [conexoes, setConexoes] = useState<ConexaoView[]>([]);
  const [projetos, setProjetos] = useState<ProjetoDoPortal[]>([]);
  const [calendario, setCalendario] = useState<PortalPost[]>([]);
  const [pedidos, setPedidos] = useState<PedidoDoCliente[]>([]);
  const [metricas, setMetricas] = useState<MetricasDoPortal | null>(null);
  const [erroProjetos, setErroProjetos] = useState(false);

  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [aba, setAba] = useState<AbaId>("inicio");
  const [chatAberto, setChatAberto] = useState(false);
  const [solicitando, setSolicitando] = useState(false);
  const [entrevista, setEntrevista] = useState(false);
  const [recadoDoPedido, setRecadoDoPedido] = useState<string | null>(null);
  const [aprovacaoAberta, setAprovacaoAberta] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erroDecisao, setErroDecisao] = useState<string | null>(null);
  const [cookiePronto, setCookiePronto] = useState(modoCookie);
  const trocouUrl = useRef(false);
  const trilho = useRef<HTMLElement>(null);
  const abaAtiva = useRef<HTMLButtonElement>(null);

  // ── A4: token no CAMINHO → troca por cookie e limpa a URL ─────────────────
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
          window.history.replaceState(null, "", `/portal/access/me${window.location.search}${window.location.hash}`);
          setCookiePronto(true);
        }
      } catch { /* sem cookie a visita segue pelo token — nada quebra */ }
    })();
  }, [modoCookie, token]);

  // Deep-link: `?secao=` (endereço antigo) e `?aba=` (novo). Os dois funcionam.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const pedida = sp.get("aba") ?? sp.get("secao");
    if (pedida) {
      const alvo = (ABAS.find((a) => a.id === pedida)?.id) ?? DESTINO_ANTIGO[pedida];
      if (alvo) setAba(alvo);
    }
    const ap = sp.get("aprovacao");
    if (ap) { setAba("aprovacoes"); setAprovacaoAberta(ap); }
  }, []);

  // A aba ativa entra em cena sozinha: com 11 abas numa barra rolável, trocar
  // de aba por link e ficar com o rótulo fora da tela é o cliente sem saber
  // onde está.
  useEffect(() => {
    abaAtiva.current?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [aba]);

  const carregarVista = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/vista${q}`, { cache: "no-store" });
      if (!res.ok) {
        setErro(res.status === 403 ? "invalid" : "network");
        return;
      }
      const json = (await res.json()) as VistaDoCliente & { dono?: string };
      setVista(json);
      setDonoDaTela(typeof json.dono === "string" ? json.dono : null);
      setErro(null);
    } catch {
      setErro("network");
    } finally {
      setCarregando(false);
    }
  }, [q]);

  const carregarPortalData = useCallback(async () => {
    try {
      const res = await fetch(`/api/brain/portal-data${q}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setErro(json.reason === "expired" ? "expired" : json.reason === "revoked" ? "revoked" : "invalid");
        return;
      }
      const json = await res.json();
      json.approvals = (Array.isArray(json.approvals) ? json.approvals : []).map(
        (a: AprovacaoDoPortal) => ({ ...a, pecas: Array.isArray(a.pecas) ? a.pecas : [] }),
      );
      setData(json);
    } catch {
      setErro("network");
    }
  }, [q]);

  const carregarPedidos = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/pedidos${q}`, { cache: "no-store" });
      if (!res.ok) return;
      const j = await res.json();
      setPedidos(Array.isArray(j.pedidos) ? j.pedidos : []);
    } catch { /* a porta de pedir continua funcionando sem a lista */ }
  }, [q]);

  const carregarEsteira = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/esteira${q}`, { cache: "no-store" });
      if (res.ok) setEsteira(await res.json());
    } catch { /* a Visão Geral ainda funciona sem a esteira */ }
  }, [q]);

  const carregarProjetos = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/projetos${q}`, { cache: "no-store" });
      if (!res.ok) { setErroProjetos(true); return; }
      const json = await res.json();
      setProjetos(Array.isArray(json.projetos) ? json.projetos : []);
      setCalendario(Array.isArray(json.calendario) ? json.calendario : []);
      setErroProjetos(false);
    } catch {
      setErroProjetos(true);
    }
  }, [q]);

  useEffect(() => { void carregarVista(); }, [carregarVista]);
  useEffect(() => { void carregarPortalData(); }, [carregarPortalData]);
  useEffect(() => { void carregarPedidos(); }, [carregarPedidos]);
  useEffect(() => { void carregarEsteira(); }, [carregarEsteira]);
  useEffect(() => { void carregarProjetos(); }, [carregarProjetos]);

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

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`/api/portal/metricas${q}`, { cache: "no-store" });
        if (res.ok) setMetricas(await res.json());
      } catch { /* o herói cai no estado honesto "ainda sem números" */ }
    })();
  }, [q]);

  /** Quem assina a decisão no registro: o nome do cadastro, sem preposição.
   *  Nunca um campo digitado na tela — quem decide é o dono do acesso. */
  const nomeDeQuemDecide = vista?.marca.nome || data?.businessName || "Cliente do portal";

  function irPara(destino: string, aprovacaoId?: string | null) {
    const alvo = (ABAS.find((a) => a.id === destino)?.id) ?? DESTINO_ANTIGO[destino] ?? "inicio";
    setAba(alvo);
    setAprovacaoAberta(aprovacaoId ?? null);
    setErroDecisao(null);
    const sp = new URLSearchParams(window.location.search);
    sp.set("aba", alvo);
    sp.delete("secao");
    if (aprovacaoId) sp.set("aprovacao", aprovacaoId); else sp.delete("aprovacao");
    window.history.replaceState(null, "", `${window.location.pathname}?${sp.toString()}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ── As três decisões, inalteradas: mesma rota, mesmo estado de envio, mesma
  //    caixa de erro. Elas são o coração do portal e não mudam de forma só
  //    porque a casca mudou.
  async function decidir(approvalId: string, action: AcaoDeAprovacao, comment?: string): Promise<boolean> {
    if (enviando) return false;
    setEnviando(true); setErroDecisao(null);
    try {
      const res = await fetch("/api/portal/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(token ? { token } : {}),
          approvalRequestId: approvalId,
          action,
          comment: comment?.trim() || undefined,
          // ── APROVAÇÃO SEM AUTOR NÃO É APROVAÇÃO (14/08/2026) ─────────────
          // A rota aceita `authorName` e, sem ele, grava `portal:<hash do
          // token>`: passa na trava de publicação, mas o registro fica sem
          // nome de gente — e o que prova a decisão depois é justamente o
          // nome. O nome vem do CADASTRO (o mesmo do cabeçalho), nunca de um
          // campo digitado aqui: quem assina é o dono do acesso.
          authorName: nomeDeQuemDecide,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({} as { error?: string }));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      await carregarPortalData();
      return true;
    } catch (e) {
      setErroDecisao(mensagemDeErro(e, "registrar sua resposta").mensagem);
      return false;
    } finally {
      setEnviando(false);
    }
  }

  async function decidirOrcamento(pedidoId: string, decisao: DecisaoDeOrcamento, apontamento?: string): Promise<boolean> {
    if (enviando) return false;
    setEnviando(true); setErroDecisao(null);
    try {
      const res = await fetch("/api/portal/pedidos/orcamento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(token ? { token } : {}), pedidoId, decisao, ...(apontamento ? { apontamento } : {}) }),
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

  async function decidirEsteira(decisao: "aprovar_direcao" | "aprovar_pacote"): Promise<boolean> {
    if (enviando) return false;
    setEnviando(true); setErroDecisao(null);
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
      await Promise.all([carregarEsteira(), carregarPortalData()]);
      return true;
    } catch (e) {
      setErroDecisao(mensagemDeErro(e, "registrar sua aprovação").mensagem);
      return false;
    } finally {
      setEnviando(false);
    }
  }

  // ── Derivações ────────────────────────────────────────────────────────────
  // A conta de pendências é a MESMA de antes, com as mesmas regras duramente
  // aprendidas: card sem corpo não é pendência; conexão que a AGÊNCIA resolve
  // não entra na fila do cliente; o pacote só pede aprovação quando o servidor
  // diz que há material.
  const aprovacoesPendentes = useMemo(
    () => (data?.approvals ?? []).filter((a) => a.status === "pending" && a.semConteudo !== true),
    [data],
  );
  const orcamentosPendentes = useMemo(() => pedidos.filter(orcamentoEsperandoDecisao), [pedidos]);
  const pacoteDaEsteira = esteira?.pacote ?? null;
  const etapaEsteira = (esteira?.etapa ?? "").toLowerCase();

  const decisaoDaEsteira: DecisaoDaEsteira | null = etapaEsteira.includes("confirme o caminho")
    ? {
        titulo: "Confirme o caminho do projeto",
        descricao: "A equipe montou a direção do trabalho a partir do seu briefing. Com o seu sim, a produção começa; se algo não fizer sentido, fale com seu PM antes de aprovar.",
        rotulo: "Aprovar e começar",
        // Direção não tem "itens": o que se aprova é o caminho, não um pacote
        // de peças. A confirmação continua existindo — o que ela não faz é
        // inventar uma lista que não existe.
        itens: [],
        decidir: () => decidirEsteira("aprovar_direcao"),
      }
    : pacoteDaEsteira?.pedeAprovacao
      ? {
          titulo: pacoteDaEsteira.prontas.length === 1
            ? "1 entrega está pronta para você"
            : `${pacoteDaEsteira.prontas.length} entregas estão prontas para você`,
          descricao:
            `Nesta aprovação vão: ${pacoteDaEsteira.prontas.join(", ")}. `
            + (pacoteDaEsteira.emProducao.length > 0
                ? `Ainda em produção, e fora desta aprovação: ${pacoteDaEsteira.emProducao.join(", ")}. `
                : "")
            + "Aprovar libera a publicação do calendário. Você pode decidir item por item nas linhas acima, ou aprovar de uma vez.",
          rotulo: pacoteDaEsteira.prontas.length === 1 ? "Aprovar esta entrega" : "Aprovar as entregas prontas",
          // A MESMA lista que o servidor mediu (`retratoDoPacote.prontas`) —
          // é ela que a confirmação nomeia. O texto acima já a citava; agora o
          // botão também depende dela, em vez de aprovar um número.
          itens: pacoteDaEsteira.prontas,
          emProducao: pacoteDaEsteira.emProducao,
          decidir: () => decidirEsteira("aprovar_pacote"),
        }
      : null;

  const materiaisPedidos = esteira?.pendencias ?? [];

  // ── NEM TODA CONEXÃO CAÍDA É PENDÊNCIA DO CLIENTE (08/08/2026) ────────────
  // Medido em produção: Páginas recusadas com código 10 — falta uma permissão
  // no app DA AGÊNCIA junto à Meta. Isso caía como "reconecte a conta" na fila
  // do dono do negócio. Ele reconectaria, o erro voltaria igual, e sobraria a
  // impressão de que o produto não funciona. Quem decide de quem é a bola é o
  // servidor (`quemResolve`); ausente = cliente, que é o comportamento antigo.
  const conexoesCaidas = conexoes.filter(
    (c) => c.estado === "caiu" || ["expired", "revoked", "error"].includes(c.status),
  );
  const conexoesQuebradas = conexoesCaidas.filter((c) => (c.quemResolve ?? "cliente") === "cliente");
  /** As que a AGÊNCIA resolve. Aparecem — esconder seria a mesma mentira de
   *  outro jeito — mas fora da fila dele, e sem a palavra "reconecte". */
  const conexoesComAAgencia = conexoesCaidas.filter((c) => (c.quemResolve ?? "cliente") !== "cliente");

  // ── O que os painéis de canal da referência mostram ───────────────────────
  // Duas listas que já estavam carregadas e ficavam presas dentro de uma aba
  // só. Nenhuma inventa campo: rede é a conexão que ELE fez; peça é o que já
  // está compartilhado com ele no calendário.
  const redesDoCliente: RedeDoCliente[] = conexoes.map((c) => ({
    id: c.id,
    plataforma: c.platform,
    nome: c.name || c.platform,
    ok: !(c.estado === "caiu" || ["expired", "revoked", "error"].includes(c.status)),
  }));

  const pecasDoCalendario: PecaDoCalendario[] = calendario.map((p) => {
    const legenda = (p.caption ?? "").trim();
    return {
      id: p.id,
      // A legenda é o texto do post, não um título — corta-se na primeira frase
      // em vez de derramar um parágrafo dentro de um cartão de uma linha.
      titulo: legenda ? (legenda.length > 72 ? `${legenda.slice(0, 71)}…` : legenda) : "Publicação sem legenda",
      quando: dataCurta(p.scheduledFor),
      noAr: p.status === "published",
    };
  });

  const decisoesEsperando = aprovacoesPendentes.length + orcamentosPendentes.length + (decisaoDaEsteira ? 1 : 0);

  // A CONTA, escrita uma vez. A lista abaixo é montada das MESMAS cinco fontes,
  // na mesma ordem — número que não bate com a tela é o cliente procurando uma
  // sexta coisa que não existe.
  const totalPendencias =
    aprovacoesPendentes.length + orcamentosPendentes.length + (decisaoDaEsteira ? 1 : 0)
    + materiaisPedidos.length + conexoesQuebradas.length;

  const pendencias: PendenciaDaVisaoGeral[] = [
    ...(decisaoDaEsteira ? [{ id: "esteira", titulo: decisaoDaEsteira.titulo, quando: "AGORA", urgente: true }] : []),
    ...aprovacoesPendentes.map((a) => {
      const vencida = !a.questionOpen && a.expiresAt != null && new Date(a.expiresAt) < new Date();
      return {
        id: a.id,
        titulo: `${a.department} aguarda sua aprovação`,
        quando: vencida ? "PRAZO VENCIDO" : dataCurta(a.expiresAt) ? `ATÉ ${dataCurta(a.expiresAt)}` : "SEM PRAZO",
        urgente: vencida,
      };
    }),
    ...orcamentosPendentes.map((p) => ({
      id: `orc-${p.id}`,
      titulo: p.titulo.startsWith("Orçamento") ? `${p.titulo} aguarda sua resposta` : `Orçamento de ${p.titulo}`,
      quando: "ORÇAMENTO",
      urgente: false,
    })),
    ...materiaisPedidos.map((m, i) => ({ id: `mat-${i}`, titulo: m, quando: "MATERIAL", urgente: false })),
    ...conexoesQuebradas.map((c) => ({
      id: c.id, titulo: `${c.name || c.platform} desconectado — reconecte a conta`, quando: "CONEXÃO", urgente: true,
    })),
  ];

  // ── Os números medidos ────────────────────────────────────────────────────
  // Só entra o que a plataforma devolveu. Métrica ausente NÃO vira zero e NÃO
  // vira "—" numa fila de seis caixas: ela simplesmente não desenha caixa.
  const totais = metricas?.conta?.totais;
  const numerosMedidos: NumeroMedido[] = metricas?.ok
    ? ([
        [metricas.conta?.rotuloDoAlcance ?? "PESSOAS ALCANÇADAS", numeroBR(totais?.alcance)],
        ["VISUALIZAÇÕES", numeroBR(totais?.visualizacoes)],
        ["CONTAS QUE INTERAGIRAM", numeroBR(totais?.contasComEngajamento)],
        ["INTERAÇÕES", numeroBR(totais?.interacoes)],
        ["SEGUIDORES", numeroBR(metricas.conta?.perfil?.seguidores)],
      ] as [string, string | null][])
        .filter((x): x is [string, string] => x[1] !== null)
        .map(([rotulo, valor]) => ({ rotulo: rotulo.toLocaleUpperCase("pt-BR"), valor, nota: "medido no período" }))
    : [];

  const periodo = metricas?.conta?.periodo
    ? `${diaCurto(metricas.conta.periodo.desde)} a ${diaCurto(metricas.conta.periodo.ate)}`
    : null;

  const resumo: ResumoDoPeriodo = {
    manchete: numerosMedidos[0] ? { rotulo: numerosMedidos[0].rotulo, valor: numerosMedidos[0].valor } : null,
    serie: metricas?.serie ?? [],
    periodo,
    porqueVazio: metricas?.semConexao
      ? "Nenhuma rede conectada ainda. Conecte em Integrações e seus números passam a aparecer aqui."
      : metricas?.precisaReconectar
        ? "A conexão com a rede caiu. Reconecte em Integrações para os números voltarem."
        : "Assim que a primeira medição do período fechar, o número aparece aqui.",
  };

  const tokenDeMidia = cookiePronto ? "" : token;

  // ── Portões ───────────────────────────────────────────────────────────────
  if (carregando) {
    return <div className="cp-shell"><main className="cp-main"><Carregando /></main></div>;
  }
  if (erro || !vista) {
    const mensagens: Record<string, { titulo: string; corpo: string }> = {
      expired: { titulo: "Link expirado", corpo: "Este link de acesso expirou. Peça um novo à equipe Dioli." },
      revoked: { titulo: "Acesso revogado", corpo: "Este link foi desativado. Entre em contato com a equipe Dioli." },
      invalid: { titulo: "Link inválido", corpo: "Este link não é válido. Confira o link que você recebeu ou peça um novo." },
      network: { titulo: "Erro de conexão", corpo: "Não consegui verificar o seu acesso. Tente novamente em instantes." },
    };
    const m = mensagens[erro ?? "invalid"] ?? mensagens.invalid;
    const podeTentar = erro === "network" || !erro;
    return (
      <div className="cp-shell">
        <main className="cp-main">
          <Erro
            titulo={m.titulo}
            texto={m.corpo}
            aoTentarDeNovo={podeTentar ? () => { setErro(null); setCarregando(true); void carregarVista(); } : undefined}
          />
        </main>
      </div>
    );
  }

  const marca = vista.marca.nome || data?.businessName || "Sua marca";
  const simbolo = vista.marca.simbolo || "•";
  // O nome da tela é o rótulo da aba, sempre. Nunca "Visão Geral da <marca>".
  const nomeDaTela = ABAS.find((a) => a.id === aba)?.label ?? "Visão Geral";
  const cabecalho = cabecalhoDoPortal(marca, nomeDaTela);

  const selo: Partial<Record<AbaId, string>> = {
    aprovacoes: decisoesEsperando > 0 ? String(decisoesEsperando) : undefined,
    solicitacoes: pedidos.length > 0 ? String(pedidos.length) : undefined,
    marca: vista.brandHub.total > 0 ? `${vista.brandHub.percentual}%` : undefined,
    integracoes: conexoesQuebradas.length > 0 ? String(conexoesQuebradas.length) : undefined,
  };

  return (
    <div className="cp-shell">
      {/* ── Barra superior: a agência, o cliente, e o canal com o PM ──────── */}
      <header className="cp-topbar">
        <div className="cp-dioli">
          <i aria-hidden>O°</i>
          <b>Dioli</b>
          <span aria-hidden>×</span>
          {/* Símbolo e nome do CLIENTE, do cadastro — nunca uma letra fixa. */}
          <div className="cp-mini-brand" aria-hidden>{cabecalho.simbolo}</div>
          <strong>{cabecalho.marca}</strong>
        </div>
        <div className="cp-private">
          <i aria-hidden>✓</i>
          <span><b>Portal seguro</b><small>Área exclusiva de {cabecalho.marca}</small></span>
        </div>
        <div className="cp-top-actions">
          <button onClick={() => setChatAberto(true)} style={{ touchAction: "manipulation" }}>
            ✦ Project Manager
          </button>
          <div>
            <i aria-hidden>{cabecalho.simbolo}</i>
            <span><b>{cabecalho.marca}</b><small>Acesso do cliente</small></span>
            <button onClick={() => irPara("conta")} aria-label="Abrir minha conta">⌄</button>
          </div>
        </div>
      </header>

      <main className="cp-main">
        {/* ── O CABEÇALHO DA REGRA 2 ───────────────────────────────────────
            símbolo · nome da marca ao lado · ABAIXO, o nome da tela. */}
        <div className="cp-client-head">
          <div>
            <div className="cp-mini-brand" aria-hidden>{cabecalho.simbolo}</div>
            <span>
              <small>{cabecalho.marca}</small>
              <h1>{cabecalho.tela}</h1>
            </span>
          </div>
          <p>
            {totalPendencias === 0
              ? "Nada depende de você agora"
              : totalPendencias === 1
                ? "1 coisa depende de você"
                : `${totalPendencias} coisas dependem de você`}
            {periodo ? ` · período medido: ${periodo}` : ""}
          </p>
        </div>

        {/* ── As 11 abas, horizontais, com setas quando não couberem ─────── */}
        <div className="cp-nav-shell">
          <button onClick={() => trilho.current?.scrollBy({ left: -320, behavior: "smooth" })} aria-label="Ver abas anteriores">‹</button>
          <nav ref={trilho} aria-label="Navegação do portal">
            {ABAS.map((x) => (
              <button
                key={x.id}
                ref={aba === x.id ? abaAtiva : undefined}
                className={aba === x.id ? "active" : ""}
                aria-current={aba === x.id ? "page" : undefined}
                onClick={() => irPara(x.id)}
                style={{ touchAction: "manipulation" }}
              >
                {x.label}
                {selo[x.id] && <em>{selo[x.id]}</em>}
              </button>
            ))}
          </nav>
          <button onClick={() => trilho.current?.scrollBy({ left: 320, behavior: "smooth" })} aria-label="Ver próximas abas">›</button>
        </div>

        <div className="cp-content">
          {aba === "inicio" && (
            <VisaoGeral
              marca={marca}
              resumo={resumo}
              numeros={numerosMedidos}
              pendencias={pendencias}
              departamentos={vista.departamentos}
              projetos={projetos}
              campanhas={vista.campanhas}
              redes={redesDoCliente}
              calendario={pecasDoCalendario}
              aoIrPara={irPara}
              aoAbrirChat={() => setChatAberto(true)}
              aoPedirAlgo={() => { setSolicitando(true); setRecadoDoPedido(null); }}
            />
          )}

          {/* ── SOCIAL MEDIA — os números da rede + o calendário do mês ───── */}
          {aba === "social" && (
            <>
              <CapaDaAba
                simbolo={simbolo}
                sobretitulo="PAINEL DE REDES SOCIAIS"
                titulo="Social Media"
                descricao="O alcance das suas redes e o que está publicado, programado ou esperando você."
              >
                <button onClick={() => irPara("integracoes")} style={{ touchAction: "manipulation" }}>Gerenciar contas</button>
              </CapaDaAba>
              <Numeros itens={numerosMedidos} />

              {/* A grade da referência: o crescimento à esquerda, a leitura da
                  área à direita, o calendário inteiro embaixo. */}
              <div className="cp-social-dashboard" style={{ marginTop: 13 }}>
                <article className={`cp-card cp-social-growth${numerosMedidos.length === 0 ? " sem-serie" : ""}`}>
                  <TituloDeSecao sobretitulo="CRESCIMENTO DA AUDIÊNCIA" titulo="Alcance no período" />
                  <div style={{ marginTop: 15 }}>
                    <ResultadosDoCliente token={token} onIrParaIntegracoes={() => irPara("integracoes")} />
                  </div>
                  {redesDoCliente.length > 0 && (
                    <div className="cp-platform-performance">
                      {redesDoCliente.map((r) => (
                        <button key={r.id} onClick={() => irPara("integracoes")} style={{ touchAction: "manipulation" }}>
                          <i className="cp-icon" aria-hidden>{r.plataforma.toLocaleUpperCase("pt-BR").slice(0, 2)}</i>
                          <span><b>{r.nome}</b><small>{r.ok ? "trazendo dados" : "precisa reconectar"}</small></span>
                          <strong>{r.plataforma}</strong>
                          <em style={r.ok ? undefined : { color: "#9a6417" }}>{r.ok ? "✓" : "!"}</em>
                        </button>
                      ))}
                    </div>
                  )}
                </article>

                <aside>
                  <article className="cp-card cp-content-winner">
                    <TituloDeSecao sobretitulo="MELHOR CONTEÚDO" titulo="O que mais conectou" />
                    {/* A demonstração cravava "86,4 mil visualizações". Sem
                        métrica por post, dizer qual foi o melhor seria escolher
                        um vencedor no chute — e ele decidiria pauta com isso. */}
                    <div style={{ marginTop: 15 }}>
                      <Vazio
                        icone="▶"
                        titulo="Ainda não medimos post a post"
                        texto="Com a conta conectada e o primeiro fechamento, a peça de melhor desempenho aparece aqui — com o número que a plataforma deu."
                      />
                    </div>
                  </article>

                  <article className="cp-card cp-social-agent" style={{ marginTop: 13 }}>
                    <div className="cp-pm-top">
                      <div className="cp-pm-avatar" aria-hidden>◎</div>
                      <span><small>SOCIAL MEDIA</small><h3>Como está o seu conteúdo</h3></span>
                    </div>
                    <p>
                      {vista.departamentos.find((d) => d.chave === "social")?.situacao}
                      {" "}Tudo que for publicado passa antes por você em Aprovações — nada
                      vai ao ar sem o seu sim.
                    </p>
                  </article>
                </aside>

                <article className="cp-card cp-content-calendar">
                  <TituloDeSecao sobretitulo="PLANO DE CONTEÚDO" titulo="Calendário do mês" />
                  <div style={{ marginTop: 15 }}>
                    {calendario.length === 0 ? (
                      <Vazio
                        icone="▦"
                        titulo="Nenhuma publicação no seu calendário ainda"
                        texto="Quando a equipe programar o primeiro conteúdo, o mês inteiro aparece aqui — com data, rede e o que já foi ao ar."
                        acao={{ rotulo: "Pedir conteúdo", aoClicar: () => { setSolicitando(true); setRecadoDoPedido(null); } }}
                      />
                    ) : (
                      <CalendarioDoMes pecas={calendario} token={tokenDeMidia} aprovacoesPendentes={aprovacoesPendentes.length} />
                    )}
                  </div>
                </article>
              </div>
            </>
          )}

          {aba === "trafego" && (
            <AbaTrafegoPago campanhas={vista.campanhas} simbolo={simbolo} aoAbrirChat={() => setChatAberto(true)} />
          )}

          {/* ── RESULTADOS — os números reais das redes, com os 3 estados ─── */}
          {aba === "resultados" && (
            <AbaResultados
              simbolo={simbolo}
              numeros={numerosMedidos}
              redes={redesDoCliente}
              periodo={periodo}
              resultados={<ResultadosDoCliente token={token} onIrParaIntegracoes={() => irPara("integracoes")} />}
              aoAbrirChat={() => setChatAberto(true)}
              aoIrPara={irPara}
            />
          )}

          {aba === "projetos" && (
            <AbaProjetos
              projetos={projetos}
              simbolo={simbolo}
              erro={erroProjetos}
              aoTentarDeNovo={() => { setErroProjetos(false); void carregarProjetos(); }}
              aoIrPara={irPara}
              aoAbrirChat={() => setChatAberto(true)}
              extra={
                <EsteiraDoCliente
                  token={token}
                  aoIrParaAprovacoes={() => irPara("aprovacoes")}
                  aoFalarComPM={() => setChatAberto(true)}
                />
              }
            />
          )}

          {/* ── APROVAÇÕES — o componente inteiro, com os 3 caminhos ──────── */}
          {aba === "aprovacoes" && (
            <>
              <CapaDaAba
                simbolo={simbolo}
                sobretitulo={decisoesEsperando === 1 ? "1 DECISÃO PENDENTE" : `${decisoesEsperando} DECISÕES PENDENTES`}
                titulo="Aprovações"
                descricao="Tudo que precisa de uma decisão sua, com contexto suficiente para decidir com segurança."
              />
              <div className="cp-approval-note">
                <i className="cp-icon" aria-hidden>✓</i>
                <span>
                  <b>Você decide. A Dioli coordena.</b>
                  <small>Aprovar libera a próxima etapa; pedir ajuste devolve o item à equipe com o seu comentário.</small>
                </span>
              </div>
              <div style={{ marginTop: 13 }}>
                {data ? (
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
                ) : (
                  <Carregando texto="Carregando suas aprovações…" />
                )}
              </div>
            </>
          )}

          {aba === "entregas" && (
            <AbaEntregas
              entregas={vista.entregas}
              simbolo={simbolo}
              aoIrParaMarca={() => irPara("marca")}
            />
          )}

          {aba === "marca" && (
            <AbaBrandHub
              brandHub={vista.brandHub}
              marca={marca}
              simbolo={simbolo}
              aoResponder={() => setEntrevista(true)}
              aoAbrirChat={() => setChatAberto(true)}
              // O ÚNICO ponto de envio de material do portal. Ver o comentário
              // em `AbaEntregas`: ele morava lá, na aba errada.
              materiais={<MateriaisDaMarca token={token} />}
            />
          )}

          {/* ── SOLICITAÇÕES — função secundária, como o handoff pede ─────── */}
          {aba === "solicitacoes" && (
            <>
              <CapaDaAba
                simbolo={simbolo}
                sobretitulo={pedidos.length === 1 ? "1 SOLICITAÇÃO" : `${pedidos.length} SOLICITAÇÕES`}
                titulo="Solicitações"
                descricao="Peça do seu jeito — texto, áudio ou arquivo. O Project Manager organiza, confirma e acompanha até a entrega."
              >
                <button className="primary" onClick={() => { setSolicitando(true); setRecadoDoPedido(null); }} style={{ touchAction: "manipulation" }}>
                  ＋ Nova solicitação
                </button>
              </CapaDaAba>

              {recadoDoPedido && (
                <div className="cp-success" role="status">
                  <i className="cp-icon" aria-hidden>✓</i>
                  <span><b>{recadoDoPedido}</b><small>Você acompanha o andamento aqui mesmo.</small></span>
                </div>
              )}

              <div className="cp-two-cols" style={{ marginTop: 13 }}>
                <article className="cp-card cp-request-list">
                  <TituloDeSecao sobretitulo="ACOMPANHAMENTO" titulo="Todas as suas solicitações" />
                  {pedidos.length === 0 ? (
                    <div style={{ marginTop: 15 }}>
                      <Vazio
                        icone="＋"
                        titulo="Você ainda não pediu nada por aqui"
                        texto="Não precisa saber o nome do serviço. Escreva com suas palavras, mande um áudio ou um arquivo — a equipe organiza e responde com prazo e preço."
                        acao={{ rotulo: "Fazer a primeira solicitação", aoClicar: () => { setSolicitando(true); setRecadoDoPedido(null); } }}
                      />
                    </div>
                  ) : (
                    <div style={{ marginTop: 13 }}>
                      <MeusPedidos pedidos={pedidos} aoIrParaAprovacoes={(id) => irPara("aprovacoes", idDeOrcamento(id))} />
                    </div>
                  )}
                </article>

                <aside className="cp-card cp-how-it-works">
                  <TituloDeSecao sobretitulo="COMO FUNCIONA" titulo="Do pedido à entrega" />
                  <div>
                    {[
                      ["1", "Você pede", "Texto, áudio, arquivo ou pela conversa."],
                      ["2", "O PM confirma", "Escopo, prioridade e prazo ficam claros."],
                      ["3", "A Dioli executa", "As áreas trabalham de forma coordenada."],
                      ["4", "Você aprova", "Tudo chega organizado, aqui no portal."],
                    ].map(([n, titulo, texto]) => (
                      <span key={n}><i aria-hidden>{n}</i><b>{titulo}</b><small>{texto}</small></span>
                    ))}
                  </div>
                  <button onClick={() => setChatAberto(true)} style={{ touchAction: "manipulation" }}>
                    Tirar uma dúvida com o PM →
                  </button>
                </aside>
              </div>
            </>
          )}

          {/* ── INTEGRAÇÕES — só o cliente conecta; a equipe vê o status ──── */}
          {aba === "integracoes" && (
            <>
              <CapaDaAba
                simbolo={simbolo}
                sobretitulo="ACESSOS SOB SEU CONTROLE"
                titulo="Integrações"
                descricao="As contas que você conecta à Dioli. Só você conecta, reconecta ou remove — a equipe acompanha apenas o status."
              />
              <div className="cp-integration-safe">
                <i className="cp-icon" aria-hidden>⌾</i>
                <span>
                  <b>Você controla todas as conexões</b>
                  <small>Toda conexão passa pela autorização oficial da plataforma. Você nunca digita senha aqui.</small>
                </span>
                <Etiqueta tom="green">AMBIENTE SEGURO</Etiqueta>
              </div>
              {conexoesQuebradas.length > 0 && (
                <div className="cp-attention-strip" style={{ marginTop: 13 }} role="alert">
                  <div>
                    <i className="cp-icon" aria-hidden>!</i>
                    <span>
                      <small>PRECISA DE VOCÊ</small>
                      <b>
                        {conexoesQuebradas.length === 1
                          ? "1 conexão precisa ser refeita por você."
                          : `${conexoesQuebradas.length} conexões precisam ser refeitas por você.`}
                      </b>
                    </span>
                  </div>
                  <div className="cp-attention-items">
                    <span><b>Enquanto isso, os posts aprovados não são publicados e os números não atualizam.</b></span>
                  </div>
                </div>
              )}

              {/* O que está caído POR NOSSA CONTA aparece — esconder seria a
                  mesma mentira de outro jeito — mas não se disfarça de tarefa
                  dele, e não usa a palavra "reconecte". */}
              {conexoesComAAgencia.length > 0 && (
                <div className="cp-attention-strip" style={{ marginTop: 13 }}>
                  <div>
                    <i className="cp-icon" aria-hidden>◷</i>
                    <span>
                      <small>COM A DIOLI, NÃO COM VOCÊ</small>
                      <b>
                        {conexoesComAAgencia.length === 1
                          ? "1 conexão está com a Dioli, não com você."
                          : `${conexoesComAAgencia.length} conexões estão com a Dioli, não com você.`}
                      </b>
                    </span>
                  </div>
                  <div className="cp-attention-items">
                    <span>
                      <b>
                        A plataforma recusou o acesso por uma permissão que falta no
                        aplicativo da agência. Não há nada para você fazer, e
                        reconectar não resolve — a agência está resolvendo.
                      </b>
                    </span>
                  </div>
                </div>
              )}

              {/* A grade da referência: as conexões à esquerda, e à direita as
                  duas garantias que o cliente precisa ler ANTES de autorizar —
                  quem guarda a senha (ninguém aqui) e quem ajuda se travar. */}
              <div className="cp-integration-layout" style={{ marginTop: 13 }}>
                <article className="cp-card">
                  <ConexoesDoCliente token={token} />
                </article>

                <aside>
                  <article className="cp-card cp-security-card">
                    <div className="cp-pm-top">
                      <div className="cp-pm-avatar" aria-hidden>⌾</div>
                      <span><small>SEGURANÇA E PRIVACIDADE</small><h3>Credenciais protegidas</h3></span>
                    </div>
                    <p>
                      A Dioli não recebe nem guarda a sua senha. Quem autoriza é a
                      própria plataforma, e ela libera só o que o trabalho contratado precisa.
                    </p>
                    {[
                      ["Sua senha", "Nunca passa por aqui"],
                      ["A autorização", "Você revoga quando quiser"],
                      ["Quem conecta", "Somente você"],
                    ].map(([o, q]) => (
                      <div key={o}><span>{o}</span><b>{q} ✓</b></div>
                    ))}
                  </article>

                  <article className="cp-card cp-integration-help">
                    <TituloDeSecao sobretitulo="PRECISA DE AJUDA?" titulo="Conexão assistida" />
                    <p style={{ marginTop: 13 }}>
                      Se a autorização travar, o Project Manager acompanha você passo a
                      passo — sem pedir senha e sem assumir o controle da sua conta.
                    </p>
                    <button onClick={() => setChatAberto(true)} style={{ touchAction: "manipulation" }}>
                      Pedir ajuda ao PM →
                    </button>
                  </article>
                </aside>
              </div>
            </>
          )}

          {aba === "conta" && (
            <AbaMinhaConta
              conta={vista.conta}
              marca={marca}
              simbolo={simbolo}
              segmento={vista.marca.segmento}
              aoAbrirChat={() => setChatAberto(true)}
              aoIrPara={irPara}
            />
          )}
        </div>
      </main>

      {/* O botão flutuante do PM — em todas as telas, como já era. */}
      {!chatAberto && (
        <button className="cp-floating-pm" onClick={() => setChatAberto(true)} aria-label="Falar com seu Project Manager">
          <i aria-hidden>✦</i>
          <span><b>Precisa de algo?</b><small>Fale com o Project Manager</small></span>
        </button>
      )}

      <SolicitarAlgo
        token={token}
        aberto={solicitando}
        aoFechar={() => setSolicitando(false)}
        aoEnviar={(recado) => {
          setRecadoDoPedido(recado);
          void carregarPedidos();
          void carregarPortalData();
          irPara("solicitacoes");
        }}
      />

      <EntrevistaDeMarca
        aberto={entrevista}
        token={token}
        perguntas={vista.brandHub.perguntas}
        aoFechar={() => setEntrevista(false)}
        aoGravar={() => void carregarVista()}
      />

      <ChatDrawer
        open={chatAberto}
        onClose={() => setChatAberto(false)}
        token={token}
        dono={donoDaTela}
        authorName={marca}
        teamLabel="Fale com seu PM"
        subtitle="a ponte com todos os departamentos"
      />
    </div>
  );
}
