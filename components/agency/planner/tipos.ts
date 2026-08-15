// Vocabulário do Planner — o que TODAS as peças da tela leem da mesma fonte.
//
// Estava tudo dentro de `app/agency/planner/page.tsx`, o que fazia cada bloco
// novo (painel do dia, barra de seleção, editor) recriar rótulo e cor de status
// do seu jeito. Rótulo de estado repetido é deriva garantida — o mesmo `draft`
// aparecia como "Rascunho" numa tela e sumia na outra.

/** Roteiro de vídeo/reel gerado pela IA. */
export interface VideoScript {
  hooks: string[];
  scenes: { visual: string; voiceover: string; onScreen: string }[];
  audio: string;
  cta: string;
}

/** Uma peça do calendário, como a API da agência devolve. */
export interface Post {
  id: string;
  clientId: string | null;
  clientRequestId: string | null;
  caption: string;
  networks: string[];
  format: string;
  pillar: string | null;
  /** A capa / arte única. */
  mediaUrl: string | null;
  /** As artes das telas do carrossel, na ordem de publicação. */
  telas: string[];
  /** A descrição interna de cada tela — material de trabalho, não vai ao cliente. */
  cenas: string[];
  script: VideoScript | null;
  scheduledFor: string | null;
  status: string;
  /** "compartilhado" = o cliente vê no portal · "interno" = só a equipe. */
  visibility: string;
  externalPostId: string | null;
  permalink: string | null;
  publishedAt: string | null;
  /** Quem registrou: `esteira` (o relógio) ou `equipe:<email>` (à mão). Nulo em
   *  peça publicada antes de 14/08/2026 — e nulo quer dizer "não sabemos". */
  publishedBy?: string | null;
  lastError: string | null;
}

// ─── Redes ────────────────────────────────────────────────────────────────────
// A cor aqui é a cor OFICIAL de cada rede (marca de terceiro), não uma cor da
// Dioli: não existe token para o rosa do Instagram e inventar um seria pior.
// Fica nesta tabela única — nenhum componente digita esses hex.
export const NETWORKS: { id: string; label: string; short: string; color: string }[] = [
  { id: "instagram", label: "Instagram", short: "IG", color: "#E1306C" },
  { id: "facebook",  label: "Facebook",  short: "FB", color: "#1877F2" },
  { id: "tiktok",    label: "TikTok",    short: "TT", color: "#111111" },
  { id: "linkedin",  label: "LinkedIn",  short: "IN", color: "#0A66C2" },
  { id: "youtube",   label: "YouTube",   short: "YT", color: "#FF0000" },
  { id: "pinterest", label: "Pinterest", short: "PT", color: "#E60023" },
  { id: "twitter",   label: "X / Twitter", short: "X", color: "#000000" },
  { id: "threads",   label: "Threads",   short: "TH", color: "#111111" },
  { id: "whatsapp",  label: "WhatsApp",  short: "WA", color: "#25D366" },
  { id: "gbp",       label: "Google Business", short: "GB", color: "#4285F4" },
];
export const NETWORK_MAP = Object.fromEntries(NETWORKS.map((n) => [n.id, n]));

export const FORMATS: { id: string; label: string }[] = [
  { id: "feed",     label: "Feed" },
  { id: "reel",     label: "Reel" },
  { id: "story",    label: "Story" },
  { id: "carousel", label: "Carrossel" },
  { id: "video",    label: "Vídeo" },
];

export const VIDEO_FORMATS = new Set(["reel", "video", "story"]);
export const CARROSSEL_FORMATS = new Set(["carousel", "carrossel"]);

// ─── Estados ──────────────────────────────────────────────────────────────────
// Os CINCO do schema (draft|scheduled|approved|published|failed). A tela oferecia
// só três: "aprovado" e "falhou" existiam no banco e não existiam aqui — então
// não dava para olhar o mês e ver o que o cliente já aprovou, nem o que quebrou
// na publicação.
//
// Cor NUNCA é o único sinal (DESIGN.md §2.4): cada estado carrega glifo + rótulo.
export interface EstadoMeta { label: string; bg: string; fg: string; glifo: string; ajuda: string }

export const STATUS_META: Record<string, EstadoMeta> = {
  draft: {
    label: "Rascunho", bg: "var(--accent)", fg: "var(--text-secondary)", glifo: "○",
    ajuda: "Em produção na agência. Não vai ao ar.",
  },
  scheduled: {
    label: "Agendado", bg: "var(--info-bg)", fg: "var(--info)", glifo: "◷",
    ajuda: "Programado para a data e hora abaixo.",
  },
  approved: {
    label: "Aprovado", bg: "var(--accent-light)", fg: "#0E5F5A", glifo: "✓",
    ajuda: "O cliente aprovou. Falta publicar.",
  },
  published: {
    label: "Publicado", bg: "var(--success-bg)", fg: "var(--success)", glifo: "●",
    ajuda: "Está no ar na rede.",
  },
  failed: {
    label: "Falhou", bg: "var(--danger-bg)", fg: "var(--danger)", glifo: "!",
    ajuda: "A publicação não completou. O motivo está no post.",
  },
};

export const STATUS_ORDEM = ["draft", "scheduled", "approved", "published", "failed"] as const;

export function metaDoStatus(status: string): EstadoMeta {
  return STATUS_META[status] ?? STATUS_META.draft;
}

export const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
export const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

// ─── Datas ────────────────────────────────────────────────────────────────────
/** Chave local (YYYY-MM-DD) de um ISO, no fuso de quem está olhando. */
export function dayKey(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return keyOf(d);
}
export function keyOf(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
/** "09:30" da peça, ou "" quando não tem hora marcada. */
export function horaDe(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
/** Troca o DIA mantendo a hora — é o que arrastar no calendário significa. */
export function trocarODia(iso: string | null, novoDia: string): string {
  const [y, m, d] = novoDia.split("-").map(Number);
  const base = iso ? new Date(iso) : null;
  const hora = base && !isNaN(base.getTime()) ? base.getHours() : 9;
  const min = base && !isNaN(base.getTime()) ? base.getMinutes() : 0;
  return new Date(y!, (m ?? 1) - 1, d ?? 1, hora, min).toISOString();
}

export function rotuloDeFormato(f: string): string {
  return FORMATS.find((x) => x.id === f)?.label ?? "Feed";
}

// ─── Prompt de vídeo ──────────────────────────────────────────────────────────
// Transforma o roteiro num prompt agnóstico de provedor, pronto para colar no
// Runway / Pika (ou alimentar a API deles depois — o mesmo texto).
export function buildVideoPrompt(script: VideoScript, format: string, pillar: string): string {
  const ratio = "9:16 vertical";
  const lines: string[] = [];
  lines.push(`Vídeo curto para redes sociais — ${ratio}, ~15–30s, ritmo dinâmico, alta qualidade.`);
  if (pillar) lines.push(`Tema: ${pillar}.`);
  if (script.hooks[0]) lines.push(`Abertura (gancho, 0–2s): ${script.hooks[0]}`);
  lines.push("");
  lines.push("CLIPES (gere um por cena):");
  script.scenes.forEach((s, i) => {
    const parts = [s.visual].filter(Boolean);
    if (s.onScreen) parts.push(`texto na tela: "${s.onScreen}"`);
    lines.push(`${i + 1}. ${parts.join(" — ")}`);
  });
  lines.push("");
  if (script.audio) lines.push(`Trilha/áudio: ${script.audio}`);
  if (script.cta) lines.push(`Encerramento (CTA): ${script.cta}`);
  void format;
  return lines.join("\n");
}
