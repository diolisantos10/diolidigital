"use client";

// PacoteDaMarca — O QUE SE PRODUZ para este cliente.
//
// Decisão do CEO (27/09/2026): cada marca tem um MODO DE APROVAÇÃO (ver
// ModoDeAprovacao.tsx, ao lado) e um PACOTE — a frequência, os formatos, os
// dias, os horários e os pilares de conteúdo. Sem pacote, o calendário não é
// gerado: "Gerar calendário do mês" (Planner) recusa com 422 até este formulário
// ser preenchido — é por isso que o estado VAZIO daqui não é decoração, é a
// causa raiz de uma recusa que a pessoa vê em outra tela.
//
// Fonte: GET/PUT /api/agency/clients/{id}/pacote. Só master escreve — os
// demais papéis veem o mesmo formulário em modo leitura (DESIGN.md §7: nunca
// esconder o controle, desabilitar com o motivo).
//
// ─── W13 (27/09/2026): stories, cardápio, fontes de prova, carrossel, séries,
// colaboradores ─────────────────────────────────────────────────────────────
// Campos NOVOS e OPCIONAIS do schema (`lib/agency/esteira/pacote-da-marca.ts`)
// ganham seção própria aqui — todos RECOLHÍVEIS (§ da ficha: não virar um
// paredão no celular). As ordens do CEO viram texto curto dentro de cada
// seção, não só comentário de código:
//   • Stories: promoção/queda de preço/combo só sai em story — o feed é
//     vitrine da marca.
//   • Cardápio: preço do combo vem de aqui, nunca inventado; sem combo
//     cadastrado o story de combo não sai.
//   • Fontes de prova: número em post só com fonte cadastrada aqui.
//   • Colaboradores: LIGÁVEL nesta tela (1C, parecer da Meta recebido).
//     Máx. 3 contas, username sem "@" (`[A-Za-z0-9._]{1,30}`), e o aviso da
//     regra de negócio: só em feed/carrossel/reels — nunca em stories — e a
//     conta convidada precisa aceitar o convite dentro do app do Instagram.
//   • Séries: só leitura nesta versão — edição completa fica para depois.
import { useCallback, useEffect, useState, type ReactNode } from "react";

interface Pilar { nome: string; peso: number }

/** "repost" é aceito na LEITURA do servidor (nome antigo), mas a saída nunca
 *  contém "repost" — o formulário só escreve os três nomes atuais. */
type ItemDaMistura = "combo" | "reciclado" | "terceiro_autorizado";
type DerivadoDeStory = "capa_do_post_do_dia" | "reel_do_acervo";

interface StoriesDraft {
  porDiaMin: number;
  porDiaMax: number;
  /** "HH:MM", Brasília. */
  aPartirDe: string;
  intervaloMinimoMin: number;
  combosMinPorDia: number;
  mistura: ItemDaMistura[];
  derivados?: DerivadoDeStory[];
}

interface ComboDoCardapio { nome: string; preco: string; descricao?: string }

interface FonteDeProva { afirmacao: string; fonte: string; data?: string }

/** Mesma lista fechada de `SEQUENCIA_DO_CARROSSEL`
 *  (`lib/agency/esteira/pacote-da-marca.ts`) — espelhada aqui de propósito
 *  (regra de ouro do relato: campo de UI não importa `lib/`). */
type SequenciaDoCard =
  | "dor"
  | "transformacao"
  | "prova"
  | "beneficio"
  | "importancia_do_servico"
  | "cta";

interface CarrosselDraft {
  cardsMin: number;
  cardsMax: number;
  sequencia: SequenciaDoCard[];
  cta?: string;
  /** "HH:MM", Brasília — só usado quando `usarHorarioDoDna` é falso. */
  horarioPadrao?: string;
  usarHorarioDoDna?: boolean;
  porDia?: number;
}

interface SerieDraft {
  id: string;
  nome: string;
  /** 0=domingo … 6=sábado. */
  dias: number[];
  formato: "carrossel";
  cardsMin: number;
  cardsMax?: number;
  exigeFonte?: boolean;
  layout?: string;
  sequencia?: SequenciaDoCard[];
  horario?: string;
}

interface ColaboradoresDraft {
  /** Ligável nesta tela desde o 1C (parecer da Meta recebido — ver o
   *  cabeçalho do arquivo). */
  ativo: boolean;
  contas: string[];
}

interface Pacote {
  postsPorDia: number;
  postsPorSemana: number;
  formatos: string[];
  /** 0=domingo … 6=sábado. */
  dias: number[];
  /** "HH:MM", fuso de Brasília. */
  horarios: string[];
  pilares: Pilar[];
  /** OPCIONAL — pacote sem stories configurado não tem este campo. */
  stories?: StoriesDraft;
  /** OPCIONAL — marca sem cardápio cadastrado ainda. */
  cardapio?: { combos: ComboDoCardapio[] };
  /** OPCIONAL — biblioteca de afirmações com fonte desta marca. */
  fontesDeProva?: FonteDeProva[];
  /** OPCIONAL — o carrossel "de sempre" da marca. */
  carrossel?: CarrosselDraft;
  /** OPCIONAL, SÓ LEITURA nesta versão — séries nomeadas (ex.: "Radar"). */
  series?: SerieDraft[];
  /** OPCIONAL — sempre exibido, mesmo sem valor gravado (ver COLABORADORES_PADRAO). */
  colaboradores?: ColaboradoresDraft;
}

type Estado =
  | { fase: "carregando" }
  | { fase: "erro"; mensagem: string }
  /** `motivo` vem de `lerPacote` (a rota) quando existe pacoteJson gravado mas
   *  inválido — mais informativo que "sem pacote" sozinho. Ausente quando o
   *  cliente simplesmente nunca teve pacote definido. */
  | { fase: "vazio"; motivo?: string | null }
  | { fase: "ok"; pacote: Pacote };

const FORMATOS_PACOTE: { id: string; label: string; nota?: string }[] = [
  { id: "feed_imagem", label: "Feed imagem" },
  { id: "carrossel", label: "Carrossel" },
  { id: "reels", label: "Reels", nota: "Reels só com vídeo enviado pelo cliente" },
  { id: "stories", label: "Stories" },
];

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const MISTURA_LABELS: Record<ItemDaMistura, string> = {
  combo: "Combo",
  reciclado: "Reciclado (peça já existente)",
  terceiro_autorizado: "Terceiro autorizado",
};
const MISTURA_OPCOES: ItemDaMistura[] = ["combo", "reciclado", "terceiro_autorizado"];

const DERIVADOS_LABELS: Record<DerivadoDeStory, string> = {
  capa_do_post_do_dia: "Capa do post do dia",
  reel_do_acervo: "Reel do acervo",
};
const DERIVADOS_OPCOES: DerivadoDeStory[] = ["capa_do_post_do_dia", "reel_do_acervo"];

const SEQUENCIA_LABELS: Record<SequenciaDoCard, string> = {
  dor: "Dor",
  transformacao: "Transformação",
  prova: "Prova",
  beneficio: "Benefício",
  importancia_do_servico: "Importância do serviço",
  cta: "CTA",
};
const SEQUENCIA_OPCOES: SequenciaDoCard[] = [
  "dor",
  "transformacao",
  "prova",
  "beneficio",
  "importancia_do_servico",
  "cta",
];

// A recusa PADRÃO de `lerPacote` (marca que nunca teve pacote definido) cita os
// campos do contrato em parênteses — vocabulário de rota, não de tela. O CEO lê
// "Sem pacote — o calendário não é gerado até o pacote ser definido." e mais
// nada; só mostramos o `motivo` cru quando ele NÃO é esta recusa padrão (ex.:
// pacote gravado corrompido / JSON inválido — aí o detalhe técnico ajuda).
const MOTIVO_AUSENCIA_PADRAO = "ainda não tem pacote definido";

// O contrato (`PacoteDaMarcaSchema`, lib/agency/esteira/pacote-da-marca.ts)
// exige AO MENOS UM pilar — pacote sem pilar nenhum é 400. O padrão nasce com
// um pilar de propósito: começar de um array vazio empurraria todo cliente
// novo direto para o erro de validação no primeiro "Salvar".
const PACOTE_PADRAO: Pacote = {
  postsPorDia: 1,
  postsPorSemana: 3,
  formatos: ["feed_imagem"],
  dias: [1, 3, 5],
  horarios: ["09:00"],
  pilares: [{ nome: "Geral", peso: 1 }],
};

/** Valores de partida ao clicar "+ Configurar stories" — todos dentro dos
 *  mínimos do schema, para o primeiro "Salvar" não quebrar em 400. */
const STORIES_PADRAO: StoriesDraft = {
  porDiaMin: 1,
  porDiaMax: 1,
  aPartirDe: "09:00",
  intervaloMinimoMin: 30,
  combosMinPorDia: 0,
  mistura: ["combo"],
  derivados: [],
};

/** Idem, para "+ Configurar carrossel". */
const CARROSSEL_PADRAO: CarrosselDraft = {
  cardsMin: 4,
  cardsMax: 8,
  sequencia: ["dor", "transformacao", "prova", "cta"],
  usarHorarioDoDna: true,
};

// Colaboradores é SEMPRE exibido — nunca atrás de um "+ Configurar", porque a
// seção existe para comunicar o estado (ligado/desligado), não para esconder
// até alguém precisar (ver o cabeçalho do arquivo). Nasce DESLIGADO — ligar é
// uma escolha explícita de quem edita, nunca o padrão de um cliente novo.
const COLABORADORES_PADRAO: ColaboradoresDraft = { ativo: false, contas: [] };

/** "R$ 59,90" — por extenso, nunca calculado aqui (mesma régua do schema). */
const PRECO_REGEX = /^R\$\s?\d{1,3}(?:\.\d{3})*,\d{2}$/;

/** Mesma régua de `USERNAME_DE_COLABORADOR_REGEX`
 *  (`lib/integrations/meta/client.ts`), espelhada aqui para o erro aparecer
 *  ANTES do round-trip ao servidor — nunca em vez dele. Sem "@": o campo
 *  guarda o username puro, do jeito que a Graph API espera. */
const USERNAME_COLABORADOR_REGEX = /^[A-Za-z0-9._]{1,30}$/;

function ordenarHorarios(horarios: string[]): string[] {
  return [...horarios].sort();
}

/**
 * A MESMA régua do `PacoteDaMarcaSchema`, espelhada aqui para o erro aparecer
 * ANTES do round-trip ao servidor — nunca em vez dele: o servidor continua
 * sendo quem decide de verdade (`erroSalvar` cobre o 400 dele também).
 */
function validarDraft(d: Pacote): string | null {
  if (d.formatos.length === 0) return "Escolha pelo menos um formato.";
  if (d.dias.length === 0) return "Escolha pelo menos um dia da semana.";
  if (d.horarios.length === 0) return "Adicione pelo menos um horário.";
  if (d.pilares.length === 0) return "Adicione pelo menos um pilar de conteúdo.";
  if (d.pilares.some((p) => !p.nome.trim())) return "Todo pilar precisa de um nome.";
  if (d.postsPorSemana > d.postsPorDia * d.dias.length) {
    return "Posts por semana não pode ser maior que posts por dia × número de dias escolhidos.";
  }
  if (d.stories && d.stories.porDiaMax < d.stories.porDiaMin) {
    return "Stories: o máximo por dia não pode ser menor que o mínimo.";
  }
  if (d.stories && d.stories.mistura.length === 0) {
    return "Stories: escolha pelo menos um tipo na mistura.";
  }
  if (d.cardapio?.combos.some((c) => !c.nome.trim())) {
    return "Cardápio: todo combo precisa de um nome.";
  }
  if (d.cardapio?.combos.some((c) => !PRECO_REGEX.test(c.preco.trim()))) {
    return "Cardápio: preço no formato R$ 59,90 — é o que sai no story, nunca invente.";
  }
  if (d.fontesDeProva?.some((f) => !f.afirmacao.trim() || !f.fonte.trim())) {
    return "Fontes de prova: toda entrada precisa de afirmação e fonte.";
  }
  if (d.carrossel && d.carrossel.cardsMax < d.carrossel.cardsMin) {
    return "Carrossel: o máximo de cards não pode ser menor que o mínimo.";
  }
  if (d.carrossel && d.carrossel.sequencia.length === 0) {
    return "Carrossel: escolha pelo menos um passo da sequência.";
  }
  if ((d.colaboradores?.contas.length ?? 0) > 3) {
    return "Colaboradores: no máximo 3 contas.";
  }
  if (d.colaboradores?.contas.some((c) => !c.trim())) {
    return "Colaboradores: toda conta precisa de um usuário.";
  }
  if (d.colaboradores?.contas.some((c) => !USERNAME_COLABORADOR_REGEX.test(c.trim()))) {
    return "Colaboradores: usuário sem \"@\", só letras, números, ponto e underline (até 30 caracteres).";
  }
  return null;
}

export default function PacoteDaMarca({ clientId, podeEditar }: { clientId: string; podeEditar: boolean }) {
  const [estado, setEstado] = useState<Estado>({ fase: "carregando" });
  const [tentativa, setTentativa] = useState(0);
  const [editando, setEditando] = useState(false);
  const [draft, setDraft] = useState<Pacote>(PACOTE_PADRAO);
  const [novoHorario, setNovoHorario] = useState("09:00");
  const [salvando, setSalvando] = useState(false);
  const [erroSalvar, setErroSalvar] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  // Seções recolhíveis (W13) — um único mapa, compartilhado entre leitura e
  // edição: abrir "Stories" na leitura mantém aberto ao entrar em editar.
  const [abertas, setAbertas] = useState<Record<string, boolean>>({});

  function alternarSecao(id: string) {
    setAbertas((a) => ({ ...a, [id]: !a[id] }));
  }

  const buscar = useCallback(async () => {
    try {
      const r = await fetch(`/api/agency/clients/${clientId}/pacote`, { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j) { setEstado({ fase: "erro", mensagem: "Não consegui carregar o pacote agora." }); return; }
      if (!j.pacote) { setEstado({ fase: "vazio", motivo: typeof j.motivo === "string" ? j.motivo : null }); return; }
      setEstado({ fase: "ok", pacote: j.pacote as Pacote });
    } catch {
      setEstado({ fase: "erro", mensagem: "Sem conexão com o servidor. Tente novamente." });
    }
  }, [clientId]);

  useEffect(() => { void buscar(); }, [buscar, tentativa]);

  function abrirEdicao() {
    const base = estado.fase === "ok" ? estado.pacote : PACOTE_PADRAO;
    // Colaboradores é sempre visível/editável (a lista de contas), mesmo que
    // o pacote nunca tenha declarado o bloco — só o "ativo" nunca liga aqui.
    setDraft({ ...base, colaboradores: base.colaboradores ?? { ...COLABORADORES_PADRAO } });
    setErroSalvar(null);
    setEditando(true);
  }

  async function salvar() {
    const problema = validarDraft(draft);
    if (problema) { setErroSalvar(problema); return; }
    setSalvando(true);
    setErroSalvar(null);
    try {
      const r = await fetch(`/api/agency/clients/${clientId}/pacote`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) {
        setErroSalvar(typeof j.error === "string" ? j.error : "Não consegui salvar o pacote agora.");
        return;
      }
      setEstado({ fase: "ok", pacote: j.pacote as Pacote });
      setEditando(false);
      setSalvo(true);
      setTimeout(() => setSalvo(false), 3000);
    } catch {
      setErroSalvar("Falha de rede ao salvar. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  function alternarFormato(id: string) {
    setDraft((d) => ({
      ...d,
      formatos: d.formatos.includes(id) ? d.formatos.filter((f) => f !== id) : [...d.formatos, id],
    }));
  }
  function alternarDia(i: number) {
    setDraft((d) => ({
      ...d,
      dias: d.dias.includes(i) ? d.dias.filter((x) => x !== i) : [...d.dias, i].sort(),
    }));
  }
  function adicionarHorario() {
    if (!novoHorario || draft.horarios.includes(novoHorario)) return;
    setDraft((d) => ({ ...d, horarios: ordenarHorarios([...d.horarios, novoHorario]) }));
  }
  function removerHorario(h: string) {
    setDraft((d) => ({ ...d, horarios: d.horarios.filter((x) => x !== h) }));
  }
  function adicionarPilar() {
    setDraft((d) => ({ ...d, pilares: [...d.pilares, { nome: "", peso: 1 }] }));
  }
  function atualizarPilar(i: number, campo: keyof Pilar, valor: string | number) {
    setDraft((d) => ({ ...d, pilares: d.pilares.map((p, idx) => (idx === i ? { ...p, [campo]: valor } : p)) }));
  }
  function removerPilar(i: number) {
    setDraft((d) => ({ ...d, pilares: d.pilares.filter((_, idx) => idx !== i) }));
  }

  // ── Stories (W13) ─────────────────────────────────────────────────────
  function configurarStories() {
    setDraft((d) => ({ ...d, stories: { ...STORIES_PADRAO } }));
    setAbertas((a) => ({ ...a, stories: true }));
  }
  function removerStories() {
    setDraft((d) => {
      const { stories: _stories, ...resto } = d;
      return resto;
    });
  }
  function atualizarStories<K extends keyof StoriesDraft>(campo: K, valor: StoriesDraft[K]) {
    setDraft((d) => (d.stories ? { ...d, stories: { ...d.stories, [campo]: valor } } : d));
  }
  function alternarMisturaStories(item: ItemDaMistura) {
    setDraft((d) => {
      if (!d.stories) return d;
      const atual = d.stories.mistura;
      const novo = atual.includes(item) ? atual.filter((x) => x !== item) : [...atual, item];
      return { ...d, stories: { ...d.stories, mistura: novo } };
    });
  }
  function alternarDerivadoStories(item: DerivadoDeStory) {
    setDraft((d) => {
      if (!d.stories) return d;
      const atual = d.stories.derivados ?? [];
      const novo = atual.includes(item) ? atual.filter((x) => x !== item) : [...atual, item];
      return { ...d, stories: { ...d.stories, derivados: novo } };
    });
  }

  // ── Cardápio (W13) ────────────────────────────────────────────────────
  function adicionarCombo() {
    setDraft((d) => ({ ...d, cardapio: { combos: [...(d.cardapio?.combos ?? []), { nome: "", preco: "" }] } }));
  }
  function atualizarCombo(i: number, campo: keyof ComboDoCardapio, valor: string) {
    setDraft((d) => ({
      ...d,
      cardapio: { combos: (d.cardapio?.combos ?? []).map((c, idx) => (idx === i ? { ...c, [campo]: valor } : c)) },
    }));
  }
  function removerCombo(i: number) {
    setDraft((d) => ({ ...d, cardapio: { combos: (d.cardapio?.combos ?? []).filter((_, idx) => idx !== i) } }));
  }

  // ── Fontes de prova (W13) ─────────────────────────────────────────────
  function adicionarFonte() {
    setDraft((d) => ({ ...d, fontesDeProva: [...(d.fontesDeProva ?? []), { afirmacao: "", fonte: "" }] }));
  }
  function atualizarFonte(i: number, campo: keyof FonteDeProva, valor: string) {
    setDraft((d) => ({
      ...d,
      fontesDeProva: (d.fontesDeProva ?? []).map((f, idx) => (idx === i ? { ...f, [campo]: valor } : f)),
    }));
  }
  function removerFonte(i: number) {
    setDraft((d) => ({ ...d, fontesDeProva: (d.fontesDeProva ?? []).filter((_, idx) => idx !== i) }));
  }

  // ── Carrossel "de sempre" (W13) ───────────────────────────────────────
  function configurarCarrossel() {
    setDraft((d) => ({ ...d, carrossel: { ...CARROSSEL_PADRAO } }));
    setAbertas((a) => ({ ...a, carrossel: true }));
  }
  function removerCarrossel() {
    setDraft((d) => {
      const { carrossel: _carrossel, ...resto } = d;
      return resto;
    });
  }
  function atualizarCarrossel<K extends keyof CarrosselDraft>(campo: K, valor: CarrosselDraft[K]) {
    setDraft((d) => (d.carrossel ? { ...d, carrossel: { ...d.carrossel, [campo]: valor } } : d));
  }
  function alternarSequenciaCarrossel(item: SequenciaDoCard) {
    setDraft((d) => {
      if (!d.carrossel) return d;
      const atual = d.carrossel.sequencia;
      const novo = atual.includes(item) ? atual.filter((x) => x !== item) : [...atual, item];
      return { ...d, carrossel: { ...d.carrossel, sequencia: novo } };
    });
  }

  // ── Colaboradores (W13) — sempre presente, "ativo" nunca liga por aqui ──
  function adicionarContaColaborador() {
    setDraft((d) => {
      const atual = d.colaboradores ?? { ...COLABORADORES_PADRAO };
      if (atual.contas.length >= 3) return d;
      return { ...d, colaboradores: { ...atual, contas: [...atual.contas, ""] } };
    });
  }
  function atualizarContaColaborador(i: number, valor: string) {
    setDraft((d) => {
      const atual = d.colaboradores ?? { ...COLABORADORES_PADRAO };
      return { ...d, colaboradores: { ...atual, contas: atual.contas.map((c, idx) => (idx === i ? valor : c)) } };
    });
  }
  function removerContaColaborador(i: number) {
    setDraft((d) => {
      const atual = d.colaboradores ?? { ...COLABORADORES_PADRAO };
      return { ...d, colaboradores: { ...atual, contas: atual.contas.filter((_, idx) => idx !== i) } };
    });
  }

  return (
    <div className="bg-white rounded-[12px] border border-[var(--border)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
      <div className="flex items-center justify-between gap-3 flex-wrap px-5 py-4 border-b border-[var(--border)]">
        <div>
          <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">Pacote da marca</h2>
          <p className="text-[12px] text-[var(--text-muted)] mt-0.5">O que se produz para este cliente — frequência, formatos, dias e horários.</p>
        </div>
        <div className="flex items-center gap-2">
          {salvo && <span className="text-[12px] text-[var(--success)] font-medium">✓ Salvo</span>}
          {podeEditar && estado.fase === "ok" && !editando && (
            <button
              onClick={abrirEdicao}
              className="h-11 sm:h-7 px-3 rounded-[6px] text-[12px] font-medium bg-[var(--bg)] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--border)] transition-colors"
            >
              Editar
            </button>
          )}
          {!podeEditar && (
            <span className="text-[12px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--accent)] text-[var(--text-muted)]" title="Só quem é master edita o pacote">
              Leitura
            </span>
          )}
        </div>
      </div>

      {/* ── Carregando ─────────────────────────────────────────────────── */}
      {estado.fase === "carregando" && (
        <div role="status" aria-live="polite" className="px-5 py-4 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-14 rounded-[8px] bg-[var(--accent)] animate-pulse" />
            ))}
          </div>
          <span className="sr-only">Carregando o pacote da marca…</span>
        </div>
      )}

      {/* ── Erro ───────────────────────────────────────────────────────── */}
      {estado.fase === "erro" && (
        <div role="alert" className="px-5 py-6 text-center">
          <p className="text-[13px] font-medium text-[var(--text-primary)]">{estado.mensagem}</p>
          <button
            onClick={() => setTentativa((t) => t + 1)}
            className="mt-3 h-11 sm:h-8 px-3.5 rounded-[7px] border border-[var(--border-strong)] text-[12px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
          >
            Tentar de novo
          </button>
        </div>
      )}

      {/* ── Vazio — a causa raiz da recusa no Planner ─────────────────────
          "Sem pacote — o calendário não é gerado até o pacote ser definido."
          Contrato exato: nomear a consequência, não só a ausência (§7.2). */}
      {estado.fase === "vazio" && !editando && (
        <div className="px-5 py-8 text-center">
          <p className="text-[13px] font-medium text-[var(--text-primary)]">Sem pacote</p>
          <p className="text-[12px] text-[var(--text-muted)] mt-1 max-w-[46ch] mx-auto">
            O calendário não é gerado até o pacote ser definido.
          </p>
          {estado.motivo && !estado.motivo.includes(MOTIVO_AUSENCIA_PADRAO) && (
            <p className="text-[12px] text-[var(--text-subtle)] mt-1.5 max-w-[46ch] mx-auto italic">{estado.motivo}</p>
          )}
          {podeEditar ? (
            <button
              onClick={abrirEdicao}
              className="mt-3 h-11 sm:h-8 px-3.5 rounded-[7px] bg-[var(--navy)] text-white text-[12px] font-medium hover:opacity-90 transition-opacity"
            >
              Definir pacote
            </button>
          ) : (
            <p className="text-[12px] text-[var(--text-subtle)] mt-2 italic">Só quem é master pode definir.</p>
          )}
        </div>
      )}

      {/* ── Leitura (existe pacote, não editando) ─────────────────────────── */}
      {estado.fase === "ok" && !editando && (
        <div className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Metrica rotulo="Posts por dia" valor={String(estado.pacote.postsPorDia)} />
            <Metrica rotulo="Posts por semana" valor={String(estado.pacote.postsPorSemana)} />
            <Metrica rotulo="Formatos" valor={String(estado.pacote.formatos.length)} />
            <Metrica rotulo="Horários" valor={String(estado.pacote.horarios.length)} />
          </div>
          <div>
            <h3 className="text-[12px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)] mb-1.5">Formatos</h3>
            <div className="flex flex-wrap gap-1.5">
              {estado.pacote.formatos.length === 0 ? (
                <span className="text-[12px] text-[var(--text-subtle)] italic">nenhum formato escolhido</span>
              ) : (
                estado.pacote.formatos.map((f) => (
                  <span key={f} className="inline-flex h-6 items-center rounded-full px-2.5 text-[12px] font-medium bg-[var(--accent)] text-[var(--text-secondary)]">
                    {FORMATOS_PACOTE.find((x) => x.id === f)?.label ?? f}
                  </span>
                ))
              )}
            </div>
          </div>
          <div>
            <h3 className="text-[12px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)] mb-1.5">Dias da semana</h3>
            <div className="flex flex-wrap gap-1.5">
              {DIAS_SEMANA.map((d, i) => (
                <span
                  key={d}
                  className={`inline-flex h-6 w-9 items-center justify-center rounded-[6px] text-[12px] font-semibold ${
                    estado.pacote.dias.includes(i) ? "bg-[var(--navy)] text-white" : "bg-[var(--bg)] text-[var(--text-subtle)] border border-[var(--border)]"
                  }`}
                >
                  {d}
                </span>
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-[12px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)] mb-1.5">Horários (Brasília)</h3>
            <div className="flex flex-wrap gap-1.5">
              {estado.pacote.horarios.length === 0 ? (
                <span className="text-[12px] text-[var(--text-subtle)] italic">nenhum horário definido</span>
              ) : (
                estado.pacote.horarios.map((h) => (
                  <span key={h} className="mono-num inline-flex h-6 items-center rounded-[6px] px-2 text-[12px] font-medium bg-[var(--accent)] text-[var(--text-secondary)]">
                    {h}
                  </span>
                ))
              )}
            </div>
          </div>
          <div>
            <h3 className="text-[12px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)] mb-1.5">Pilares de conteúdo</h3>
            {estado.pacote.pilares.length === 0 ? (
              <p className="text-[12px] text-[var(--text-subtle)] italic">nenhum pilar definido</p>
            ) : (
              <ul className="space-y-1">
                {estado.pacote.pilares.map((p, i) => (
                  <li key={i} className="flex items-center justify-between text-[12.5px] text-[var(--text-primary)]">
                    <span>{p.nome || <em className="text-[var(--text-subtle)]">sem nome</em>}</span>
                    <span className="text-[var(--text-muted)]">peso {p.peso}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* ── W13: stories, cardápio, fontes de prova, carrossel, séries,
              colaboradores — recolhíveis, para não virar um paredão. ─────── */}
          <div className="space-y-2 pt-1 border-t border-[var(--border)]">
            <SecaoRecolhivel
              id="view-stories"
              titulo="Stories"
              nota="Promoção, queda de preço e combo promocional só em stories. O feed é vitrine da marca."
              aberta={!!abertas["stories"]}
              onToggle={() => alternarSecao("stories")}
            >
              {estado.pacote.stories ? (
                <div className="space-y-2.5">
                  <div className="grid grid-cols-2 gap-2">
                    <Metrica rotulo="Por dia" valor={`${estado.pacote.stories.porDiaMin}–${estado.pacote.stories.porDiaMax}`} />
                    <Metrica rotulo="A partir de" valor={estado.pacote.stories.aPartirDe} />
                    <Metrica rotulo="Intervalo mín." valor={`${estado.pacote.stories.intervaloMinimoMin} min`} />
                    <Metrica rotulo="Combos mín./dia" valor={String(estado.pacote.stories.combosMinPorDia)} />
                  </div>
                  <ChipsLista rotulo="Mistura" itens={estado.pacote.stories.mistura.map((m) => MISTURA_LABELS[m])} />
                  {(estado.pacote.stories.derivados?.length ?? 0) > 0 && (
                    <ChipsLista rotulo="Derivados" itens={(estado.pacote.stories.derivados ?? []).map((d) => DERIVADOS_LABELS[d])} />
                  )}
                </div>
              ) : (
                <p className="text-[12px] text-[var(--text-subtle)] italic">Sem stories configurado.</p>
              )}
            </SecaoRecolhivel>

            <SecaoRecolhivel
              id="view-cardapio"
              titulo="Cardápio"
              nota="O preço do combo vem daqui — nunca é inventado. Sem combo cadastrado, o story de combo não sai."
              badge={<ContagemBadge n={estado.pacote.cardapio?.combos.length ?? 0} />}
              aberta={!!abertas["cardapio"]}
              onToggle={() => alternarSecao("cardapio")}
            >
              {(estado.pacote.cardapio?.combos.length ?? 0) === 0 ? (
                <p className="text-[12px] text-[var(--text-subtle)] italic">Sem combo cadastrado.</p>
              ) : (
                <ul className="space-y-1.5">
                  {estado.pacote.cardapio!.combos.map((c, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 text-[12.5px]">
                      <span className="text-[var(--text-primary)] min-w-0 truncate">
                        {c.nome}
                        {c.descricao && <span className="text-[var(--text-muted)]"> — {c.descricao}</span>}
                      </span>
                      <span className="mono-num font-semibold text-[var(--text-secondary)] shrink-0">{c.preco}</span>
                    </li>
                  ))}
                </ul>
              )}
            </SecaoRecolhivel>

            <SecaoRecolhivel
              id="view-fontes"
              titulo="Fontes de prova"
              nota="Número em post só com fonte cadastrada aqui."
              badge={<ContagemBadge n={estado.pacote.fontesDeProva?.length ?? 0} />}
              aberta={!!abertas["fontes"]}
              onToggle={() => alternarSecao("fontes")}
            >
              {(estado.pacote.fontesDeProva?.length ?? 0) === 0 ? (
                <p className="text-[12px] text-[var(--text-subtle)] italic">Nenhuma fonte cadastrada.</p>
              ) : (
                <ul className="space-y-1.5">
                  {estado.pacote.fontesDeProva!.map((f, i) => (
                    <li key={i} className="text-[12.5px] text-[var(--text-primary)]">
                      <span className="font-medium">{f.afirmacao}</span>
                      <span className="text-[var(--text-muted)]"> — {f.fonte}{f.data ? ` (${f.data})` : ""}</span>
                    </li>
                  ))}
                </ul>
              )}
            </SecaoRecolhivel>

            <SecaoRecolhivel
              id="view-carrossel"
              titulo="Carrossel"
              nota="A régua-padrão do carrossel de sempre da marca — cards, sequência e CTA."
              aberta={!!abertas["carrossel"]}
              onToggle={() => alternarSecao("carrossel")}
            >
              {estado.pacote.carrossel ? (
                <div className="space-y-2.5">
                  <div className="grid grid-cols-2 gap-2">
                    <Metrica rotulo="Cards" valor={`${estado.pacote.carrossel.cardsMin}–${estado.pacote.carrossel.cardsMax}`} />
                    <Metrica
                      rotulo="Horário"
                      valor={estado.pacote.carrossel.usarHorarioDoDna ? "DNA da marca" : (estado.pacote.carrossel.horarioPadrao ?? "—")}
                    />
                    {estado.pacote.carrossel.porDia !== undefined && (
                      <Metrica rotulo="Por dia" valor={String(estado.pacote.carrossel.porDia)} />
                    )}
                  </div>
                  <ChipsLista rotulo="Sequência" itens={estado.pacote.carrossel.sequencia.map((s) => SEQUENCIA_LABELS[s])} />
                  {estado.pacote.carrossel.cta && (
                    <p className="text-[12.5px] text-[var(--text-secondary)]"><span className="text-[var(--text-muted)]">CTA: </span>{estado.pacote.carrossel.cta}</p>
                  )}
                </div>
              ) : (
                <p className="text-[12px] text-[var(--text-subtle)] italic">Sem carrossel configurado.</p>
              )}
            </SecaoRecolhivel>

            <SecaoRecolhivel
              id="view-series"
              titulo="Séries"
              nota="Séries editoriais nomeadas (ex.: Radar Dioli Tech) — só leitura nesta versão."
              badge={<ContagemBadge n={estado.pacote.series?.length ?? 0} />}
              aberta={!!abertas["series"]}
              onToggle={() => alternarSecao("series")}
            >
              {(estado.pacote.series?.length ?? 0) === 0 ? (
                <p className="text-[12px] text-[var(--text-subtle)] italic">Nenhuma série cadastrada.</p>
              ) : (
                <ul className="space-y-2">
                  {estado.pacote.series!.map((s) => (
                    <li key={s.id} className="rounded-[7px] border border-[var(--border)] px-3 py-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-[12.5px] font-semibold text-[var(--text-primary)]">{s.nome}</span>
                        {s.exigeFonte && (
                          <span className="text-[12px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--warning-bg)] text-[var(--warning)]">Exige fonte</span>
                        )}
                      </div>
                      <p className="text-[12px] text-[var(--text-muted)] mt-1">
                        {s.dias.map((d) => DIAS_SEMANA[d]).join(", ")} · {s.cardsMin}
                        {s.cardsMax ? `–${s.cardsMax}` : "+"} cards
                        {s.horario ? ` · ${s.horario}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </SecaoRecolhivel>

            <SecaoRecolhivel
              id="view-colaboradores"
              titulo="Colaboradores"
              badge={<BadgeAtivo ativo={!!estado.pacote.colaboradores?.ativo} />}
              nota="Vai só em feed, carrossel e reels — nunca em stories. A outra conta precisa aceitar o convite no app do Instagram."
              aberta={!!abertas["colaboradores"]}
              onToggle={() => alternarSecao("colaboradores")}
            >
              {(estado.pacote.colaboradores?.contas.length ?? 0) === 0 ? (
                <p className="text-[12px] text-[var(--text-subtle)] italic">Nenhuma conta cadastrada.</p>
              ) : (
                <ChipsLista rotulo="Contas" itens={estado.pacote.colaboradores!.contas} />
              )}
            </SecaoRecolhivel>
          </div>
        </div>
      )}

      {/* ── Formulário (definir ou editar) — só master chega aqui ─────────── */}
      {editando && podeEditar && (
        <div className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <CampoNumero
              id="pacote-posts-dia"
              label="Posts por dia"
              min={1}
              max={5}
              valor={draft.postsPorDia}
              onChange={(n) => setDraft((d) => ({ ...d, postsPorDia: n }))}
            />
            <CampoNumero
              id="pacote-posts-semana"
              label="Posts por semana"
              min={1}
              max={21}
              valor={draft.postsPorSemana}
              onChange={(n) => setDraft((d) => ({ ...d, postsPorSemana: n }))}
            />
          </div>

          <div>
            <h3 className="text-[12px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)] mb-1.5">Formatos</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {FORMATOS_PACOTE.map((f) => (
                <label key={f.id} className="flex items-start gap-2 text-[13px] text-[var(--text-primary)] min-h-[44px] py-2 -my-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.formatos.includes(f.id)}
                    onChange={() => alternarFormato(f.id)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--navy)]"
                  />
                  <span>
                    {f.label}
                    {f.nota && <span className="block text-[12px] text-[var(--text-muted)]">{f.nota}</span>}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-[12px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)] mb-1.5">Dias da semana</h3>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Dias da semana em que este cliente publica">
              {DIAS_SEMANA.map((d, i) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={draft.dias.includes(i)}
                  onClick={() => alternarDia(i)}
                  className={`h-11 sm:h-9 min-w-[44px] px-2 rounded-[6px] text-[12px] font-semibold transition-colors ${
                    draft.dias.includes(i) ? "bg-[var(--navy)] text-white" : "bg-[var(--bg)] text-[var(--text-secondary)] border border-[var(--border)] hover:bg-[var(--accent)]"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-[12px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)] mb-1.5">Horários (Brasília)</h3>
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              {draft.horarios.map((h) => (
                // A "×" é o único alvo abaixo de 44px deste formulário, DE
                // PROPÓSITO documentado: aumentar um remover-chip até 44px
                // dentro de uma lista compacta de horários trocaria densidade
                // por espaço vazio — mesma concessão que Linear/Attio fazem em
                // chip removível. O botão principal (Salvar) continua ≥44px.
                <span key={h} className="mono-num inline-flex h-9 sm:h-8 items-center gap-1 rounded-[6px] pl-2.5 pr-1 text-[13px] font-medium bg-[var(--accent)] text-[var(--text-secondary)]">
                  {h}
                  <button
                    type="button"
                    onClick={() => removerHorario(h)}
                    aria-label={`Remover horário ${h}`}
                    className="h-8 w-8 sm:h-6 sm:w-6 rounded-full flex items-center justify-center hover:bg-[var(--border)] text-[var(--text-muted)]"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="pacote-novo-horario" className="sr-only">Novo horário</label>
              <input
                id="pacote-novo-horario"
                type="time"
                value={novoHorario}
                onChange={(e) => setNovoHorario(e.target.value)}
                className="h-11 sm:h-9 rounded-[7px] px-2.5 text-[16px] sm:text-[13px] bg-[var(--bg)] border border-[var(--border)] outline-none focus:border-[var(--navy)] focus:bg-white"
              />
              <button
                type="button"
                onClick={adicionarHorario}
                className="h-11 sm:h-9 px-3 rounded-[7px] text-[12px] font-medium bg-[var(--bg)] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--border)] transition-colors"
              >
                + Adicionar
              </button>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <h3 className="text-[12px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)]">Pilares de conteúdo</h3>
              <button
                type="button"
                onClick={adicionarPilar}
                className="h-11 sm:h-7 px-2.5 rounded-[6px] text-[12px] font-medium bg-[var(--bg)] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--border)] transition-colors"
              >
                + Pilar
              </button>
            </div>
            {draft.pilares.length === 0 ? (
              // Pelo menos um pilar é OBRIGATÓRIO (o servidor recusa com 400
              // sem nenhum) — não é "opcional", é estado inválido de trânsito
              // enquanto quem edita monta a lista.
              <p className="text-[12px]" style={{ color: "var(--warning)" }}>
                Pelo menos um pilar é obrigatório — use &quot;+ Pilar&quot; acima.
              </p>
            ) : (
              <div className="space-y-2">
                {draft.pilares.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <label className="sr-only" htmlFor={`pacote-pilar-nome-${i}`}>Nome do pilar</label>
                    <input
                      id={`pacote-pilar-nome-${i}`}
                      value={p.nome}
                      onChange={(e) => atualizarPilar(i, "nome", e.target.value)}
                      placeholder="Ex.: Bastidores"
                      className="flex-1 min-w-0 h-11 sm:h-9 px-3 text-[16px] sm:text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white"
                    />
                    <label className="sr-only" htmlFor={`pacote-pilar-peso-${i}`}>Peso do pilar</label>
                    <input
                      id={`pacote-pilar-peso-${i}`}
                      type="number"
                      min={1}
                      value={p.peso}
                      onChange={(e) => atualizarPilar(i, "peso", Math.max(1, Number(e.target.value) || 1))}
                      className="w-16 h-11 sm:h-9 px-2 text-[16px] sm:text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => removerPilar(i)}
                      aria-label={`Remover pilar ${p.nome || i + 1}`}
                      className="h-11 w-11 sm:h-9 sm:w-9 shrink-0 rounded-[7px] flex items-center justify-center hover:bg-[var(--accent)] text-[var(--text-muted)]"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── W13: stories, cardápio, fontes de prova, carrossel, séries,
              colaboradores — recolhíveis, para não virar um paredão. ─────── */}
          <div className="space-y-2 pt-1 border-t border-[var(--border)]">
            <SecaoRecolhivel
              id="edit-stories"
              titulo="Stories"
              nota="Promoção, queda de preço e combo promocional só em stories. O feed é vitrine da marca."
              aberta={!!abertas["stories"]}
              onToggle={() => alternarSecao("stories")}
            >
              {!draft.stories ? (
                <button
                  type="button"
                  onClick={configurarStories}
                  className="h-11 sm:h-7 px-2.5 rounded-[6px] text-[12px] font-medium bg-[var(--bg)] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--border)] transition-colors"
                >
                  + Configurar stories
                </button>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <CampoNumero
                      id="pacote-stories-min"
                      label="Mínimo por dia"
                      min={1}
                      max={20}
                      valor={draft.stories.porDiaMin}
                      onChange={(n) => atualizarStories("porDiaMin", n)}
                    />
                    <CampoNumero
                      id="pacote-stories-max"
                      label="Máximo por dia"
                      min={1}
                      max={20}
                      valor={draft.stories.porDiaMax}
                      onChange={(n) => atualizarStories("porDiaMax", n)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="pacote-stories-partir" className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">A partir de</label>
                      <input
                        id="pacote-stories-partir"
                        type="time"
                        value={draft.stories.aPartirDe}
                        onChange={(e) => atualizarStories("aPartirDe", e.target.value)}
                        className="w-full h-11 sm:h-9 px-3 text-[16px] sm:text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white"
                      />
                    </div>
                    <CampoNumero
                      id="pacote-stories-intervalo"
                      label="Intervalo mín. (min)"
                      min={1}
                      max={720}
                      valor={draft.stories.intervaloMinimoMin}
                      onChange={(n) => atualizarStories("intervaloMinimoMin", n)}
                    />
                  </div>
                  <CampoNumero
                    id="pacote-stories-combos-min"
                    label="Combos mín. por dia"
                    min={0}
                    max={20}
                    valor={draft.stories.combosMinPorDia}
                    onChange={(n) => atualizarStories("combosMinPorDia", n)}
                  />
                  <div>
                    <h4 className="text-[12px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)] mb-1.5">Mistura (o que preenche o resto do dia)</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {MISTURA_OPCOES.map((m) => (
                        <label key={m} className="flex items-center gap-2 text-[13px] text-[var(--text-primary)] min-h-[44px] py-2 -my-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={draft.stories!.mistura.includes(m)}
                            onChange={() => alternarMisturaStories(m)}
                            className="h-4 w-4 shrink-0 accent-[var(--navy)]"
                          />
                          <span>{MISTURA_LABELS[m]}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-[12px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)] mb-1.5">Derivados de outra peça</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {DERIVADOS_OPCOES.map((dv) => (
                        <label key={dv} className="flex items-center gap-2 text-[13px] text-[var(--text-primary)] min-h-[44px] py-2 -my-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={(draft.stories!.derivados ?? []).includes(dv)}
                            onChange={() => alternarDerivadoStories(dv)}
                            className="h-4 w-4 shrink-0 accent-[var(--navy)]"
                          />
                          <span>{DERIVADOS_LABELS[dv]}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={removerStories}
                    className="text-[12px] font-medium text-[var(--danger)] hover:underline"
                  >
                    Remover configuração de stories
                  </button>
                </div>
              )}
            </SecaoRecolhivel>

            <SecaoRecolhivel
              id="edit-cardapio"
              titulo="Cardápio"
              nota="O preço do combo vem daqui — nunca é inventado. Sem combo cadastrado, o story de combo não sai."
              badge={<ContagemBadge n={draft.cardapio?.combos.length ?? 0} />}
              aberta={!!abertas["cardapio"]}
              onToggle={() => alternarSecao("cardapio")}
            >
              <div className="space-y-2">
                {(draft.cardapio?.combos ?? []).map((c, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <label className="sr-only" htmlFor={`pacote-combo-nome-${i}`}>Nome do combo</label>
                      <input
                        id={`pacote-combo-nome-${i}`}
                        value={c.nome}
                        onChange={(e) => atualizarCombo(i, "nome", e.target.value)}
                        placeholder="Ex.: Combo Família"
                        className="w-full h-11 sm:h-9 px-3 text-[16px] sm:text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white"
                      />
                      <label className="sr-only" htmlFor={`pacote-combo-preco-${i}`}>Preço</label>
                      <input
                        id={`pacote-combo-preco-${i}`}
                        value={c.preco}
                        onChange={(e) => atualizarCombo(i, "preco", e.target.value)}
                        placeholder="R$ 59,90"
                        className="mono-num w-full h-11 sm:h-9 px-3 text-[16px] sm:text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white"
                      />
                      <label className="sr-only" htmlFor={`pacote-combo-descricao-${i}`}>Descrição (opcional)</label>
                      <input
                        id={`pacote-combo-descricao-${i}`}
                        value={c.descricao ?? ""}
                        onChange={(e) => atualizarCombo(i, "descricao", e.target.value)}
                        placeholder="Descrição (opcional)"
                        className="w-full h-11 sm:h-9 px-3 text-[16px] sm:text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removerCombo(i)}
                      aria-label={`Remover combo ${c.nome || i + 1}`}
                      className="h-11 w-11 sm:h-9 sm:w-9 shrink-0 rounded-[7px] flex items-center justify-center hover:bg-[var(--accent)] text-[var(--text-muted)]"
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={adicionarCombo}
                  className="h-11 sm:h-7 px-2.5 rounded-[6px] text-[12px] font-medium bg-[var(--bg)] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--border)] transition-colors"
                >
                  + Combo
                </button>
              </div>
            </SecaoRecolhivel>

            <SecaoRecolhivel
              id="edit-fontes"
              titulo="Fontes de prova"
              nota="Número em post só com fonte cadastrada aqui."
              badge={<ContagemBadge n={draft.fontesDeProva?.length ?? 0} />}
              aberta={!!abertas["fontes"]}
              onToggle={() => alternarSecao("fontes")}
            >
              <div className="space-y-2">
                {(draft.fontesDeProva ?? []).map((f, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <label className="sr-only" htmlFor={`pacote-fonte-afirmacao-${i}`}>Afirmação</label>
                      <input
                        id={`pacote-fonte-afirmacao-${i}`}
                        value={f.afirmacao}
                        onChange={(e) => atualizarFonte(i, "afirmacao", e.target.value)}
                        placeholder="Ex.: 9 em cada 10 clientes voltam"
                        className="w-full h-11 sm:h-9 px-3 text-[16px] sm:text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white"
                      />
                      <label className="sr-only" htmlFor={`pacote-fonte-fonte-${i}`}>Fonte</label>
                      <input
                        id={`pacote-fonte-fonte-${i}`}
                        value={f.fonte}
                        onChange={(e) => atualizarFonte(i, "fonte", e.target.value)}
                        placeholder="Ex.: Pesquisa interna, ago/2026"
                        className="w-full h-11 sm:h-9 px-3 text-[16px] sm:text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white"
                      />
                      <label className="sr-only" htmlFor={`pacote-fonte-data-${i}`}>Data (opcional)</label>
                      <input
                        id={`pacote-fonte-data-${i}`}
                        value={f.data ?? ""}
                        onChange={(e) => atualizarFonte(i, "data", e.target.value)}
                        placeholder="AAAA-MM-DD (opcional)"
                        className="mono-num w-full h-11 sm:h-9 px-3 text-[16px] sm:text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removerFonte(i)}
                      aria-label={`Remover fonte ${i + 1}`}
                      className="h-11 w-11 sm:h-9 sm:w-9 shrink-0 rounded-[7px] flex items-center justify-center hover:bg-[var(--accent)] text-[var(--text-muted)]"
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={adicionarFonte}
                  className="h-11 sm:h-7 px-2.5 rounded-[6px] text-[12px] font-medium bg-[var(--bg)] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--border)] transition-colors"
                >
                  + Fonte
                </button>
              </div>
            </SecaoRecolhivel>

            <SecaoRecolhivel
              id="edit-carrossel"
              titulo="Carrossel"
              nota="A régua-padrão do carrossel de sempre da marca — cards, sequência e CTA."
              aberta={!!abertas["carrossel"]}
              onToggle={() => alternarSecao("carrossel")}
            >
              {!draft.carrossel ? (
                <button
                  type="button"
                  onClick={configurarCarrossel}
                  className="h-11 sm:h-7 px-2.5 rounded-[6px] text-[12px] font-medium bg-[var(--bg)] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--border)] transition-colors"
                >
                  + Configurar carrossel
                </button>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <CampoNumero
                      id="pacote-carrossel-min"
                      label="Cards mín."
                      min={1}
                      max={20}
                      valor={draft.carrossel.cardsMin}
                      onChange={(n) => atualizarCarrossel("cardsMin", n)}
                    />
                    <CampoNumero
                      id="pacote-carrossel-max"
                      label="Cards máx."
                      min={1}
                      max={20}
                      valor={draft.carrossel.cardsMax}
                      onChange={(n) => atualizarCarrossel("cardsMax", n)}
                    />
                  </div>
                  <div>
                    <label htmlFor="pacote-carrossel-por-dia" className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">
                      Carrosséis por dia (opcional)
                    </label>
                    <input
                      id="pacote-carrossel-por-dia"
                      type="number"
                      min={1}
                      value={draft.carrossel.porDia ?? ""}
                      placeholder="sem limite fixo"
                      onChange={(e) => {
                        const texto = e.target.value;
                        atualizarCarrossel("porDia", texto === "" ? undefined : Math.max(1, Number(texto) || 1));
                      }}
                      className="w-full h-11 sm:h-9 px-3 text-[16px] sm:text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white"
                    />
                  </div>
                  <div>
                    <h4 className="text-[12px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)] mb-1.5">Sequência de intenção</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {SEQUENCIA_OPCOES.map((s) => (
                        <label key={s} className="flex items-center gap-2 text-[13px] text-[var(--text-primary)] min-h-[44px] py-2 -my-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={draft.carrossel!.sequencia.includes(s)}
                            onChange={() => alternarSequenciaCarrossel(s)}
                            className="h-4 w-4 shrink-0 accent-[var(--navy)]"
                          />
                          <span>{SEQUENCIA_LABELS[s]}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label htmlFor="pacote-carrossel-cta" className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">CTA (opcional)</label>
                    <input
                      id="pacote-carrossel-cta"
                      value={draft.carrossel.cta ?? ""}
                      onChange={(e) => atualizarCarrossel("cta", e.target.value)}
                      placeholder="Ex.: Chama no direct"
                      className="w-full h-11 sm:h-9 px-3 text-[16px] sm:text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-[13px] text-[var(--text-primary)] min-h-[44px] py-2 -my-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!draft.carrossel.usarHorarioDoDna}
                      onChange={(e) => atualizarCarrossel("usarHorarioDoDna", e.target.checked)}
                      className="h-4 w-4 shrink-0 accent-[var(--navy)]"
                    />
                    <span>Usar o horário do DNA da marca</span>
                  </label>
                  {!draft.carrossel.usarHorarioDoDna && (
                    <div>
                      <label htmlFor="pacote-carrossel-horario" className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">Horário padrão</label>
                      <input
                        id="pacote-carrossel-horario"
                        type="time"
                        value={draft.carrossel.horarioPadrao ?? ""}
                        onChange={(e) => atualizarCarrossel("horarioPadrao", e.target.value)}
                        className="w-full h-11 sm:h-9 px-3 text-[16px] sm:text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white"
                      />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={removerCarrossel}
                    className="text-[12px] font-medium text-[var(--danger)] hover:underline"
                  >
                    Remover configuração de carrossel
                  </button>
                </div>
              )}
            </SecaoRecolhivel>

            <SecaoRecolhivel
              id="edit-series"
              titulo="Séries"
              nota="Séries editoriais nomeadas (ex.: Radar Dioli Tech) — edição completa fica para uma próxima versão; aqui é só leitura."
              badge={<ContagemBadge n={draft.series?.length ?? 0} />}
              aberta={!!abertas["series"]}
              onToggle={() => alternarSecao("series")}
            >
              {(draft.series?.length ?? 0) === 0 ? (
                <p className="text-[12px] text-[var(--text-subtle)] italic">Nenhuma série cadastrada.</p>
              ) : (
                <ul className="space-y-2">
                  {draft.series!.map((s) => (
                    <li key={s.id} className="rounded-[7px] border border-[var(--border)] px-3 py-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-[12.5px] font-semibold text-[var(--text-primary)]">{s.nome}</span>
                        {s.exigeFonte && (
                          <span className="text-[12px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--warning-bg)] text-[var(--warning)]">Exige fonte</span>
                        )}
                      </div>
                      <p className="text-[12px] text-[var(--text-muted)] mt-1">
                        {s.dias.map((d) => DIAS_SEMANA[d]).join(", ")} · {s.cardsMin}
                        {s.cardsMax ? `–${s.cardsMax}` : "+"} cards
                        {s.horario ? ` · ${s.horario}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </SecaoRecolhivel>

            <SecaoRecolhivel
              id="edit-colaboradores"
              titulo="Colaboradores"
              nota="Vai só em feed, carrossel e reels — nunca em stories. A outra conta precisa aceitar o convite no app do Instagram."
              badge={<BadgeAtivo ativo={!!draft.colaboradores?.ativo} />}
              aberta={!!abertas["colaboradores"]}
              onToggle={() => alternarSecao("colaboradores")}
            >
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-[13px] text-[var(--text-primary)] min-h-[44px] py-2 -my-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!draft.colaboradores?.ativo}
                    onChange={(e) => {
                      const ativo = e.target.checked;
                      setDraft((d) => ({ ...d, colaboradores: { ...(d.colaboradores ?? COLABORADORES_PADRAO), ativo } }));
                    }}
                    className="h-4 w-4 shrink-0 accent-[var(--navy)]"
                  />
                  <span>Ativo</span>
                </label>
                <div className="space-y-2">
                  {(draft.colaboradores?.contas ?? []).map((conta, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <label className="sr-only" htmlFor={`pacote-colaborador-${i}`}>Conta colaboradora</label>
                      <input
                        id={`pacote-colaborador-${i}`}
                        value={conta}
                        onChange={(e) => atualizarContaColaborador(i, e.target.value.replace(/^@+/, ""))}
                        placeholder="usuario (sem @)"
                        className="flex-1 min-w-0 h-11 sm:h-9 px-3 text-[16px] sm:text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => removerContaColaborador(i)}
                        aria-label={`Remover conta ${conta || i + 1}`}
                        className="h-11 w-11 sm:h-9 sm:w-9 shrink-0 rounded-[7px] flex items-center justify-center hover:bg-[var(--accent)] text-[var(--text-muted)]"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {(draft.colaboradores?.contas.length ?? 0) > 0 && (
                    <p className="text-[12px] text-[var(--text-muted)]">
                      Sem &quot;@&quot; — só letras, números, ponto e underline (até 30 caracteres).
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={adicionarContaColaborador}
                  disabled={(draft.colaboradores?.contas.length ?? 0) >= 3}
                  className="h-11 sm:h-7 px-2.5 rounded-[6px] text-[12px] font-medium bg-[var(--bg)] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--border)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  + Conta (máx. 3)
                </button>
              </div>
            </SecaoRecolhivel>
          </div>

          {erroSalvar && (
            <p role="alert" className="text-[12.5px] text-[var(--danger)] bg-[var(--danger-bg)] rounded-[8px] px-3 py-2">{erroSalvar}</p>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => void salvar()}
              disabled={salvando}
              className="h-11 sm:h-8 px-3.5 rounded-[7px] text-[12.5px] font-semibold transition-colors bg-[var(--navy)] text-white hover:opacity-90 disabled:bg-[var(--border)] disabled:text-[var(--text-muted)] disabled:cursor-not-allowed"
            >
              {salvando ? "Salvando…" : "Salvar"}
            </button>
            <button
              onClick={() => { setEditando(false); setErroSalvar(null); }}
              disabled={salvando}
              className="h-11 sm:h-8 px-3.5 rounded-[7px] text-[12.5px] font-medium text-[var(--text-secondary)] hover:bg-[var(--accent)] disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Metrica({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-[8px] border border-[var(--border)] px-3.5 py-3">
      <div className="text-[12px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)]">{rotulo}</div>
      <div className="mono-num text-[20px] font-bold leading-none text-[var(--text-primary)] mt-1.5">{valor}</div>
    </div>
  );
}

function CampoNumero({
  id, label, valor, onChange, min, max,
}: { id: string; label: string; valor: number; onChange: (n: number) => void; min: number; max: number }) {
  return (
    <div>
      <label htmlFor={id} className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">{label}</label>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        value={valor}
        onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || min)))}
        className="w-full h-11 sm:h-9 px-3 text-[16px] sm:text-[13px] bg-[var(--bg)] border border-[var(--border)] rounded-[7px] outline-none focus:border-[var(--navy)] focus:bg-white"
      />
    </div>
  );
}

/** O estado ligado/desligado de Colaboradores, visível mesmo com a seção
 *  fechada — a mesma razão de existir da `ContagemBadge` logo abaixo. */
function BadgeAtivo({ ativo }: { ativo: boolean }) {
  return ativo ? (
    <span className="text-[12px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--success-bg)] text-[var(--success)]">Ativo</span>
  ) : (
    <span className="text-[12px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--accent)] text-[var(--text-muted)]">Desligado</span>
  );
}

/** Contador de itens no cabeçalho de uma seção recolhida — deixa a informação
 *  visível mesmo fechada, sem precisar abrir para saber "tem algo aqui?". */
function ContagemBadge({ n }: { n: number }) {
  if (n === 0) return null;
  return (
    <span className="text-[12px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--accent)] text-[var(--text-muted)]">{n}</span>
  );
}

/** Lista de chips somente-leitura (mistura, derivados, sequência, contas). */
function ChipsLista({ rotulo, itens }: { rotulo: string; itens: string[] }) {
  if (itens.length === 0) return null;
  return (
    <div>
      <h4 className="text-[12px] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)] mb-1">{rotulo}</h4>
      <div className="flex flex-wrap gap-1.5">
        {itens.map((it, i) => (
          <span key={i} className="inline-flex h-6 items-center rounded-full px-2.5 text-[12px] font-medium bg-[var(--accent)] text-[var(--text-secondary)]">
            {it}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Seção recolhível (W13) — a saída para não empilhar seis blocos novos como
 * um paredão no celular. Cabeçalho é `<button>` com `aria-expanded` +
 * `aria-controls` (teclado e leitor de tela), alvo de toque ≥44px. `nota` é a
 * ordem do CEO em texto curto — sempre visível dentro da seção, aberta.
 */
function SecaoRecolhivel({
  id, titulo, nota, badge, aberta, onToggle, children,
}: {
  id: string;
  titulo: string;
  nota?: string;
  badge?: ReactNode;
  aberta: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[8px] border border-[var(--border)] overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={aberta}
        aria-controls={`${id}-conteudo`}
        className="w-full flex items-center justify-between gap-2 min-h-[44px] px-3.5 py-2.5 text-left hover:bg-[var(--accent)] transition-colors"
      >
        <span className="flex items-center gap-2 min-w-0">
          <span className="text-[13px] font-semibold text-[var(--text-primary)] truncate">{titulo}</span>
          {badge}
        </span>
        <span aria-hidden className="text-[var(--text-muted)] text-[12px] shrink-0">{aberta ? "▲" : "▼"}</span>
      </button>
      {aberta && (
        <div id={`${id}-conteudo`} className="px-3.5 pb-3.5 pt-2 border-t border-[var(--border)] space-y-2.5">
          {nota && <p className="text-[12px] text-[var(--text-muted)] leading-relaxed">{nota}</p>}
          {children}
        </div>
      )}
    </div>
  );
}
