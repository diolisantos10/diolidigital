// posts.ts — A ORQUESTRAÇÃO: recebe o post do City Jobs, valida, agenda,
// aprova (quando a regra permite) e responde. SERVER-ONLY.
//
// Contrato: docs/integracoes/cityjobs-contrato.md. Este módulo NÃO confere
// HMAC (isso é `assinatura.ts`, chamado pela rota) e NÃO decide domínio
// permitido/SSRF/formato de mídia sozinho (isso é `midia.ts`) — ele COSTURA:
// idempotência (§2), a fila do dia (§6.2/§6.4), a trava de duplicado (§6.3)
// e a aprovação automática (§6.1).
//
// ── ONDE A RAMPA/TETO DE STORY É ENFORÇADA, E POR QUE NÃO É AQUI ────────────
//
// `publicarAgendados` (`esteira/publicacao.ts`) já confere
// `confereRampaDeStoriesDoDia` — a cada rodada do relógio, ANTES de publicar
// cada story agendado — e adia (nunca falha) o que excede o teto do dia.
// Criar o `SocialPost` aqui com um horário "razoável" (empurrado pelo
// intervalo mínimo do formato) é suficiente: o teto/rampa é aplicado por
// quem já existe, sem duplicar a régua. O que ESTE módulo decide é o
// SLOT (quando), não SE aquele dia já está cheio — isso é problema do dia da
// publicação, não do dia do agendamento.
//
// Para FEED/CARROSSEL não existe equivalente no motor geral (2 slots por dia
// é uma regra desta MARCA, não da casa inteira) — por isso o slot de feed é
// decidido aqui, com a fila "pagas antes de selecionadas" (`regras.ts`,
// `proximoSlotDoDia`).

import { createHash } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import {
  intervaloDoFormato,
  inicioDoDiaCivilDeBrasilia,
} from "@/lib/agency/esteira/publicacao";
import { lerPacote, type PacoteDaMarca } from "@/lib/agency/esteira/pacote-da-marca";
import {
  carimboDoCityJobsPagaSemRisco,
  clienteEhCityJobsComRegraLigada,
  registrarAprovacaoPorRegra,
} from "@/lib/agency/esteira/modo-de-aprovacao";
import { createApprovalRequest } from "@/lib/agency/persistence/approval-service";
import { DEPARTAMENTO } from "@/lib/agency/esteira/cards-de-aprovacao";
import { baixarEValidarMidiaExterna, dominiosPermitidosDeEnv } from "@/lib/integracoes/cityjobs/midia";
import { registrarEventoDeWebhook } from "@/lib/integracoes/cityjobs/webhook";
import {
  dentroDaJanelaDeDuplicado,
  proximoSlotDoDia,
  HORARIOS_DE_FEED_BRASILIA,
  TETO_DE_FEED_POR_DIA,
  MOTIVO_REPOST_AUTORIZADO,
  duracaoDoPlanoEmDias,
  repostAindaElegivel,
  legendaDoRepost,
  minutoDoRepostNaJanela,
  type OcupanteDoDia,
  type PrioridadeDoPost,
} from "@/lib/integracoes/cityjobs/regras";

export const FONTE = "cityjobs";

// ─── O CORPO DO CONTRATO (§4) ────────────────────────────────────────────────

const MidiaUrlSchema = z.object({ tipo: z.literal("url"), url: z.string().url() });

const EntradaBaseSchema = z.object({
  idExterno: z.string().min(1),
  marca: z.string().min(1),
  formato: z.enum(["story", "feed_imagem", "carrossel"]),
  midia: z.union([MidiaUrlSchema, z.array(MidiaUrlSchema).min(2).max(10)]),
  legenda: z.string().default(""),
  prioridade: z.enum(["paga", "selecionada"]),
  risco: z.enum(["sem_risco", "com_risco"]),
  horarioDesejado: z.string().min(1),
  validadePlano: z.string().optional(),
  metadados: z.unknown().optional(),
});

export type EntradaValidada = z.infer<typeof EntradaBaseSchema>;

export type VereditoDaEntrada =
  | { ok: true; corpo: EntradaValidada }
  | { ok: false; motivo: string; campo: string };

/** Valida o corpo contra o contrato §4 — o mínimo de coerência que o JSON
 *  precisa ter ANTES de qualquer leitura de banco. */
export function validarEntrada(bruto: unknown): VereditoDaEntrada {
  const parsed = EntradaBaseSchema.safeParse(bruto);
  if (!parsed.success) {
    const primeiro = parsed.error.issues[0];
    const campo = primeiro?.path?.join(".") || "corpo";
    return { ok: false, motivo: primeiro?.message ?? "corpo inválido", campo };
  }
  const v = parsed.data;

  if (v.formato === "carrossel" && !Array.isArray(v.midia)) {
    return { ok: false, motivo: "carrossel exige uma LISTA de 2 a 10 itens de mídia", campo: "midia" };
  }
  if (v.formato !== "carrossel" && Array.isArray(v.midia)) {
    return { ok: false, motivo: `o formato "${v.formato}" exige um único item de mídia, não lista`, campo: "midia" };
  }
  if (v.formato !== "story" && !v.legenda?.trim()) {
    return { ok: false, motivo: `legenda é obrigatória para "${v.formato}"`, campo: "legenda" };
  }
  if (v.prioridade === "paga" && !v.validadePlano) {
    return { ok: false, motivo: 'validadePlano é obrigatório quando prioridade é "paga"', campo: "validadePlano" };
  }
  if (v.validadePlano && Number.isNaN(Date.parse(v.validadePlano))) {
    return { ok: false, motivo: "validadePlano precisa ser uma data válida (AAAA-MM-DD)", campo: "validadePlano" };
  }
  if (Number.isNaN(Date.parse(v.horarioDesejado))) {
    return { ok: false, motivo: "horarioDesejado precisa ser ISO 8601 com fuso", campo: "horarioDesejado" };
  }
  const metaSerializado = JSON.stringify(v.metadados ?? null);
  if (metaSerializado.length > 4096) {
    return { ok: false, motivo: "metadados excede 4 KB serializado", campo: "metadados" };
  }
  return { ok: true, corpo: v };
}

/** O hash canônico dos CAMPOS DE NEGÓCIO (contrato §2) — nunca do corpo bruto
 *  assinado. Ordem de chave FIXA: é o que torna o hash estável entre duas
 *  serializações do "mesmo" corpo com chaves em ordem diferente. */
export function corpoDeNegocioSha256(v: EntradaValidada): string {
  const canonico = JSON.stringify({
    idExterno: v.idExterno,
    marca: v.marca,
    formato: v.formato,
    midia: v.midia,
    legenda: v.legenda ?? "",
    prioridade: v.prioridade,
    risco: v.risco,
    horarioDesejado: v.horarioDesejado,
    validadePlano: v.validadePlano ?? null,
    metadados: v.metadados ?? null,
  });
  return createHash("sha256").update(canonico).digest("hex");
}

// ─── O MAPEAMENTO formato (contrato) → SocialPost.format (a casa) ───────────

export function formatoInterno(formato: EntradaValidada["formato"]): string {
  return formato === "story" ? "story" : formato === "feed_imagem" ? "feed" : "carousel";
}

// ─── A MARCA DE FONTE EXTERNA (Achado 1, J4, 28/09/2026) ────────────────────
//
// Gravada em `SocialPost.scriptJson` em TODO post criado por esta integração
// — o original (`receberPost`) e cada repost (`processarRepostsDeVagasPagas`).
// Lida por `ehPostDeFonteExterna`/`ehPostDeFonteExternaComRisco`
// (`lib/agency/esteira/modo-de-aprovacao.ts`), nunca reimplementada aqui: quem
// ESCREVE e quem LÊ o marcador têm de concordar sobre o formato, e a única
// forma de garantir isso é as duas metades olharem para a MESMA definição de
// chave (`origem`, `risco`) — aqui só a grafamos.
function marcadorDeFonteExterna(corpo: { idExterno: string; risco: string; prioridade: string }): string {
  return JSON.stringify({
    origem: FONTE,
    idExterno: corpo.idExterno,
    risco: corpo.risco,
    prioridade: corpo.prioridade,
  });
}

// ─── O SLOT DE STORY: empurra pelo intervalo mínimo, nunca pelo teto do dia ─

async function proximoSlotDeStory(a: {
  clientId: string;
  horarioDesejado: Date;
  pacote: PacoteDaMarca | null;
  chaveDeVariacao: string;
}): Promise<Date> {
  const ultimo = await prisma.socialPost.findFirst({
    where: { clientId: a.clientId, format: "story", status: { notIn: ["failed", "cancelado"] } },
    orderBy: { scheduledFor: "desc" },
    select: { scheduledFor: true },
  });
  const intervalo = intervaloDoFormato("story", a.pacote, a.chaveDeVariacao);
  if (!ultimo?.scheduledFor) return a.horarioDesejado;
  const minimo = new Date(ultimo.scheduledFor.getTime() + intervalo);
  return a.horarioDesejado.getTime() >= minimo.getTime() ? a.horarioDesejado : minimo;
}

// ─── O SLOT DE FEED/CARROSSEL: 10h/16h, teto 2/dia, pagas empurram selecionadas ─

/**
 * `diaCivil` já é o INSTANTE UTC correto de 00:00 em Brasília
 * (`inicioDoDiaCivilDeBrasilia` já soma o offset internamente) — somar
 * minutos-desde-a-meia-noite LOCAL a esse instante dá a hora certa em UTC
 * sem precisar (e sem poder) somar o offset de novo.
 */
function horarioBrasiliaDoDia(diaCivil: Date, horaMin: string): Date {
  const [h, m] = horaMin.split(":").map(Number);
  return new Date(diaCivil.getTime() + (h * 60 + m) * 60_000);
}

const HORIZONTE_DE_BUSCA_DIAS = 45;

interface SlotDeFeed {
  scheduledFor: Date;
  /** Um ocupante existente foi empurrado para abrir esta vaga. */
  empurrado?: { socialPostId: string; novaData: Date };
}

/**
 * Acha o próximo slot de feed (10h ou 16h Brasília) livre para este cliente,
 * a partir do dia de `horarioDesejado`, respeitando o teto de 2/dia e a
 * ordem "pagas antes de selecionadas" (regras.ts). Empurra no MÁXIMO um
 * ocupante (o mais antigo "selecionada" do dia que travou a vaga).
 */
async function proximoSlotDeFeed(a: {
  workspaceId: string;
  clientId: string;
  prioridade: PrioridadeDoPost;
  horarioDesejado: Date;
}): Promise<SlotDeFeed> {
  const diaBase = inicioDoDiaCivilDeBrasilia(a.horarioDesejado);
  const fimDaBusca = new Date(diaBase.getTime() + (HORIZONTE_DE_BUSCA_DIAS + 1) * 24 * 60 * 60_000);

  const candidatos = await prisma.socialPost.findMany({
    where: {
      clientId: a.clientId,
      format: { in: ["feed", "carousel"] },
      status: { notIn: ["failed", "cancelado"] },
      scheduledFor: { gte: diaBase, lt: fimDaBusca },
    },
    select: { id: true, scheduledFor: true, createdAt: true },
  });

  const prioridadeDoCandidato = new Map<string, PrioridadeDoPost>();
  if (candidatos.length > 0) {
    const donos = await prisma.postExterno.findMany({
      where: {
        clientId: a.clientId,
        fonte: FONTE,
        OR: candidatos.map((c) => ({ socialPostIdsJson: { contains: c.id } })),
      },
      select: { prioridade: true, socialPostIdsJson: true },
    });
    for (const dono of donos) {
      let ids: unknown;
      try { ids = JSON.parse(dono.socialPostIdsJson || "[]"); } catch { ids = []; }
      if (!Array.isArray(ids)) continue;
      for (const id of ids) {
        if (typeof id === "string" && !prioridadeDoCandidato.has(id)) {
          prioridadeDoCandidato.set(id, dono.prioridade === "paga" ? "paga" : "selecionada");
        }
      }
    }
  }

  const diaIndiceDe = (d: Date) => Math.round((inicioDoDiaCivilDeBrasilia(d).getTime() - diaBase.getTime()) / (24 * 60 * 60_000));
  const ocupacaoPorDia = new Map<number, OcupanteDoDia[]>();
  for (const c of candidatos) {
    if (!c.scheduledFor) continue;
    const dia = diaIndiceDe(c.scheduledFor);
    const lista = ocupacaoPorDia.get(dia) ?? [];
    // Sem dono conhecido (glitch de dado): tratado como "selecionada" —
    // fail-closed do jeito mais conservador possível: nunca deixa de contar
    // uma vaga ocupada, e ainda pode ser empurrado se uma paga precisar dela.
    lista.push({ id: c.id, prioridade: prioridadeDoCandidato.get(c.id) ?? "selecionada", criadoEm: c.createdAt });
    ocupacaoPorDia.set(dia, lista);
  }

  const decisao = proximoSlotDoDia({
    ocupacaoPorDia,
    prioridade: a.prioridade,
    tetoPorDia: TETO_DE_FEED_POR_DIA,
    diaIndiceInicial: Math.max(0, diaIndiceDe(a.horarioDesejado)),
    horizonteDeDias: HORIZONTE_DE_BUSCA_DIAS,
  });

  const diaEscolhido = new Date(diaBase.getTime() + decisao.diaIndice * 24 * 60 * 60_000);
  const ocupantesDoDiaEscolhido = ocupacaoPorDia.get(decisao.diaIndice) ?? [];
  const horariosUsados = new Set(
    candidatos
      .filter((c) => c.scheduledFor && diaIndiceDe(c.scheduledFor) === decisao.diaIndice && c.id !== decisao.empurrado?.id)
      .map((c) => c.scheduledFor!.getTime()),
  );
  const slotLivre = HORARIOS_DE_FEED_BRASILIA.find(
    (hm) => !horariosUsados.has(horarioBrasiliaDoDia(diaEscolhido, hm).getTime()),
  ) ?? HORARIOS_DE_FEED_BRASILIA[0];
  const scheduledFor = horarioBrasiliaDoDia(diaEscolhido, slotLivre);

  if (!decisao.empurrado) {
    return { scheduledFor };
  }

  // Reagenda o empurrado para o PRÓXIMO dia com vaga, a partir do dia+1 —
  // ele nunca empurra ninguém (entra como "selecionada").
  const semOEmpurrado = new Map(ocupacaoPorDia);
  semOEmpurrado.set(
    decisao.diaIndice,
    ocupantesDoDiaEscolhido.filter((o) => o.id !== decisao.empurrado!.id),
  );
  const decisaoDoEmpurrado = proximoSlotDoDia({
    ocupacaoPorDia: semOEmpurrado,
    prioridade: "selecionada",
    tetoPorDia: TETO_DE_FEED_POR_DIA,
    diaIndiceInicial: decisao.diaIndice + 1,
    horizonteDeDias: HORIZONTE_DE_BUSCA_DIAS,
  });
  const diaDoEmpurrado = new Date(diaBase.getTime() + decisaoDoEmpurrado.diaIndice * 24 * 60 * 60_000);
  const horariosUsadosNoDiaDoEmpurrado = new Set(
    candidatos
      .filter((c) => c.scheduledFor && diaIndiceDe(c.scheduledFor) === decisaoDoEmpurrado.diaIndice)
      .map((c) => c.scheduledFor!.getTime()),
  );
  const slotDoEmpurrado = HORARIOS_DE_FEED_BRASILIA.find(
    (hm) => !horariosUsadosNoDiaDoEmpurrado.has(horarioBrasiliaDoDia(diaDoEmpurrado, hm).getTime()),
  ) ?? HORARIOS_DE_FEED_BRASILIA[0];
  const novaData = horarioBrasiliaDoDia(diaDoEmpurrado, slotDoEmpurrado);

  await prisma.socialPost.update({ where: { id: decisao.empurrado.id }, data: { scheduledFor: novaData } }).catch(() => {});
  await prisma.activityEvent
    .create({
      data: {
        workspaceId: a.workspaceId,
        clientId: a.clientId,
        type: "cityjobs_feed_empurrado",
        message: `Um post "selecionada" (SocialPost ${decisao.empurrado.id}) foi empurrado de ${scheduledFor.toISOString()} para ${novaData.toISOString()} para abrir vaga a uma vaga PAGA (contrato §6.2, ordem pagas antes de selecionadas).`.slice(0, 900),
      },
    })
    .catch(() => {});

  return { scheduledFor, empurrado: { socialPostId: decisao.empurrado.id, novaData } };
}

// ─── A TRAVA DE DUPLICADO (contrato §6.3) ────────────────────────────────────

/**
 * Alguma publicação da MESMA mídia (sha256) + MESMA legenda (byte-idêntica)
 * ainda está dentro da janela de duplicado?
 *
 * Para FEED/CARROSSEL, o repost de vaga paga (§6.4) atravessa esta trava SEM
 * precisar de uma exceção à parte: a legenda dele (`legendaDoRepost`,
 * `regras.ts`) NUNCA é byte-idêntica ao dia anterior, e esta função só
 * bloqueia mídia+legenda IDÊNTICAS.
 *
 * ⚠️ DIVERGÊNCIA DO CONTRATO, corrigida aqui e relatada ao PM (ver relato
 * final): o contrato (§6.3) descreve a MESMA lógica de "a legenda muda"
 * também para STORY — mas §4 do próprio contrato diz que a Meta IGNORA
 * legenda em story, e todo story do City Jobs sai com `caption: ""`. Duas
 * legendas vazias são byte-IDÊNTICAS entre si, então "a legenda varia" nunca
 * teria efeito prático em story — teria bloqueado o 2º dia de repost sempre.
 * Por isso STORY usa a EXCEÇÃO ETIQUETADA explícita (`excecaoRotulada`),
 * nunca a variação de legenda. FEED/CARROSSEL continuam pela legenda, como o
 * contrato descreve.
 */
async function violaTravaDeDuplicado(a: {
  clientId: string;
  formato: EntradaValidada["formato"];
  mediaSha256: string[];
  legenda: string;
  agora: Date;
  excecaoRotulada?: boolean;
}): Promise<boolean> {
  if (a.excecaoRotulada) return false;
  const assets = await prisma.mediaAsset.findMany({ where: { sha256: { in: a.mediaSha256 } }, select: { id: true } });
  const idsInternos = assets.map((x) => `/api/media/${x.id}`);
  if (idsInternos.length === 0) return false;

  const candidatos = await prisma.socialPost.findMany({
    where: {
      clientId: a.clientId,
      format: formatoInterno(a.formato),
      caption: a.legenda,
      OR: idsInternos.map((u) => ({ mediaUrl: u })),
    },
    select: { publishedAt: true, scheduledFor: true, createdAt: true },
  });
  for (const c of candidatos) {
    const referencia = c.publishedAt ?? c.scheduledFor ?? c.createdAt;
    if (referencia && dentroDaJanelaDeDuplicado(referencia, a.agora, a.formato)) return true;
  }
  return false;
}

// ─── A RESPOSTA (contrato §3/§7) ─────────────────────────────────────────────

export interface RespostaDoPost {
  idExterno: string;
  estado: string;
  agendadoPara: string | null;
  permalink?: string | null;
  externalPostId?: string | null;
  motivoFalha?: string | null;
}

function paraResposta(p: { idExterno: string; estado: string; motivo: string | null }, socialPost?: {
  scheduledFor: Date | null; publishedAt: Date | null; permalink: string | null; externalPostId: string | null; lastError: string | null;
} | null): RespostaDoPost {
  return {
    idExterno: p.idExterno,
    estado: p.estado,
    agendadoPara: socialPost?.scheduledFor ? socialPost.scheduledFor.toISOString() : null,
    permalink: socialPost?.permalink ?? null,
    externalPostId: socialPost?.externalPostId ?? null,
    motivoFalha: p.estado === "falhou" ? (p.motivo ?? socialPost?.lastError ?? null) : null,
  };
}

export type ResultadoDoRecebimento =
  | { http: 202 | 200; corpo: RespostaDoPost }
  | { http: 400; corpo: { erro: "campo_invalido"; campo: string; motivo: string; idExterno?: string } }
  | { http: 409; corpo: { erro: "idexterno_conflitante" | "duplicado"; motivo: string; idExterno: string } }
  | { http: 422; corpo: { erro: "midia_fora_de_spec"; motivo: string; idExterno: string } }
  | { http: 503; corpo: { erro: string; motivo: string } };

/**
 * O CORAÇÃO DO ENDPOINT — chamado depois que a rota já conferiu HMAC e rate
 * limit. `clientId`/`workspaceId` já resolvidos pela rota via
 * `CITYJOBS_CLIENT_ID` (nunca pelo `marca` do corpo — ver o relato final).
 */
export async function receberPost(a: {
  corpoBruto: unknown;
  workspaceId: string;
  clientId: string;
  agora?: Date;
}): Promise<ResultadoDoRecebimento> {
  const agora = a.agora ?? new Date();

  const validado = validarEntrada(a.corpoBruto);
  if (!validado.ok) {
    return { http: 400, corpo: { erro: "campo_invalido", campo: validado.campo, motivo: validado.motivo } };
  }
  const corpo = validado.corpo;
  const hashDeNegocio = corpoDeNegocioSha256(corpo);

  const existente = await prisma.postExterno.findUnique({
    where: { fonte_idExterno: { fonte: FONTE, idExterno: corpo.idExterno } },
  });
  if (existente) {
    if (existente.corpoSha256 !== hashDeNegocio) {
      return {
        http: 409,
        corpo: { erro: "idexterno_conflitante", idExterno: corpo.idExterno, motivo: "esta idExterno já existe com um corpo diferente" },
      };
    }
    const socialPost = await socialPostDoDono(existente.socialPostIdsJson);
    return { http: 200, corpo: paraResposta(existente, socialPost) };
  }

  // ── MÍDIA ──────────────────────────────────────────────────────────────
  const dominios = dominiosPermitidosDeEnv();
  const itensDeMidia = Array.isArray(corpo.midia) ? corpo.midia : [corpo.midia];
  const mediaAssetIds: string[] = [];
  const sha256DasMidias: string[] = [];
  for (const item of itensDeMidia) {
    const veredito = await baixarEValidarMidiaExterna({
      url: item.url,
      formato: corpo.formato,
      workspaceId: a.workspaceId,
      clientId: a.clientId,
      dominiosPermitidos: dominios,
    });
    if (!veredito.ok) {
      if (veredito.codigo === "campo_invalido") {
        return { http: 400, corpo: { erro: "campo_invalido", campo: veredito.campo, motivo: veredito.motivo, idExterno: corpo.idExterno } };
      }
      return { http: 422, corpo: { erro: "midia_fora_de_spec", motivo: veredito.motivo, idExterno: corpo.idExterno } };
    }
    mediaAssetIds.push(veredito.mediaAssetId);
  }
  const assetsGuardados = await prisma.mediaAsset.findMany({ where: { id: { in: mediaAssetIds } }, select: { id: true, sha256: true } });
  for (const asset of assetsGuardados) sha256DasMidias.push(asset.sha256);

  // ── TRAVA DE DUPLICADO ────────────────────────────────────────────────
  const duplicado = await violaTravaDeDuplicado({
    clientId: a.clientId,
    formato: corpo.formato,
    mediaSha256: sha256DasMidias,
    legenda: corpo.legenda ?? "",
    agora,
  });
  if (duplicado) {
    return {
      http: 409,
      corpo: {
        erro: "duplicado",
        idExterno: corpo.idExterno,
        motivo: "a mesma mídia e a mesma legenda já foram publicadas dentro da janela de duplicado desta marca",
      },
    };
  }

  // ── AGENDAMENTO ──────────────────────────────────────────────────────
  const clienteRow = await prisma.client.findUnique({ where: { id: a.clientId }, select: { pacoteJson: true } });
  const pacoteLido = lerPacote(clienteRow?.pacoteJson);
  const pacote = pacoteLido.ok ? pacoteLido.pacote : null;

  const horarioDesejado = new Date(corpo.horarioDesejado);
  let scheduledFor: Date;
  if (corpo.formato === "story") {
    scheduledFor = await proximoSlotDeStory({
      clientId: a.clientId,
      horarioDesejado,
      pacote,
      chaveDeVariacao: corpo.idExterno,
    });
  } else {
    const slot = await proximoSlotDeFeed({
      workspaceId: a.workspaceId,
      clientId: a.clientId,
      prioridade: corpo.prioridade,
      horarioDesejado,
    });
    scheduledFor = slot.scheduledFor;
  }

  const mediaUrls = mediaAssetIds.map((id) => `/api/media/${id}`);
  const socialPost = await prisma.socialPost.create({
    data: {
      workspaceId: a.workspaceId,
      clientId: a.clientId,
      caption: corpo.formato === "story" ? "" : corpo.legenda ?? "",
      networks: JSON.stringify(["instagram"]),
      format: formatoInterno(corpo.formato),
      mediaUrl: mediaUrls[0] ?? null,
      mediaUrlsJson: JSON.stringify(mediaUrls),
      scheduledFor,
      status: "draft",
      visibility: "compartilhado",
      // A MARCA DE FONTE EXTERNA (Achado 1, J4, 28/09/2026 — Q8-qualidade):
      // nunca "fase":"pauta" (esta peça já chega PRONTA, contrato §11) — é
      // "origem" que diz "não passa pela rotina editorial da casa", lida por
      // `ehPostDeFonteExterna`/`ehPostDeFonteExternaComRisco`
      // (`modo-de-aprovacao.ts`) em toda trava de aprovação por REGRA.
      scriptJson: marcadorDeFonteExterna(corpo),
    },
  });

  // ── APROVAÇÃO (contrato §6.1) ────────────────────────────────────────
  let estado: string;
  if (corpo.risco === "sem_risco" && corpo.prioridade === "paga") {
    const regraLigada = await clienteEhCityJobsComRegraLigada(a.clientId);
    if (regraLigada) {
      const carimbo = carimboDoCityJobsPagaSemRisco(scheduledFor);
      const aprovacao = await registrarAprovacaoPorRegra({
        workspaceId: a.workspaceId,
        clientId: a.clientId,
        postIds: [socialPost.id],
        carimbo,
      });
      // Se a auto-aprovação não validar (ex.: carimbo não bate com o modo
      // em vigor na data da peça), a peça NÃO fica órfã: cai no mesmo
      // caminho de revisão manual do resto da casa — nunca um estado sem
      // card correspondente no Planner.
      estado = aprovacao.ok
        ? "agendado"
        : await abrirRevisaoNoPlanner(a.workspaceId, a.clientId, socialPost.id, corpo);
    } else {
      estado = await abrirRevisaoNoPlanner(a.workspaceId, a.clientId, socialPost.id, corpo);
    }
  } else {
    estado = await abrirRevisaoNoPlanner(a.workspaceId, a.clientId, socialPost.id, corpo);
  }

  const postExterno = await prisma.postExterno.create({
    data: {
      workspaceId: a.workspaceId,
      clientId: a.clientId,
      fonte: FONTE,
      idExterno: corpo.idExterno,
      corpoSha256: hashDeNegocio,
      formato: corpo.formato,
      prioridade: corpo.prioridade,
      risco: corpo.risco,
      horarioDesejado,
      validadePlano: corpo.validadePlano ? new Date(corpo.validadePlano) : null,
      legenda: corpo.legenda ?? "",
      midiaAssetIdsJson: JSON.stringify(mediaAssetIds),
      metadadosJson: corpo.metadados !== undefined ? JSON.stringify(corpo.metadados) : null,
      estado,
      socialPostIdsJson: JSON.stringify([socialPost.id]),
    },
  });

  await registrarEventoDeWebhook(postExterno.id, {
    idExterno: corpo.idExterno,
    evento: "agendado",
    ocorridoEm: agora,
    metadados: corpo.metadados,
  });

  return {
    http: 202,
    corpo: paraResposta(postExterno, { scheduledFor, publishedAt: null, permalink: null, externalPostId: null, lastError: null }),
  };
}

async function abrirRevisaoNoPlanner(
  workspaceId: string,
  clientId: string,
  socialPostId: string,
  corpo: { idExterno: string; prioridade: string; risco: string },
): Promise<string> {
  await createApprovalRequest({
    clientId,
    department: DEPARTAMENTO,
    clientVisible: false,
    requestedBy: "cityjobs-fonte-externa",
    reviewNote: `Vaga do City Jobs (${corpo.idExterno}) — prioridade "${corpo.prioridade}", risco "${corpo.risco}". Aguardando revisão antes de agendar.`,
    sourcePostIds: [socialPostId],
  }).catch(() => {});
  return "aguardando_revisao";
}

async function socialPostDoDono(socialPostIdsJson: string) {
  let ids: unknown;
  try { ids = JSON.parse(socialPostIdsJson || "[]"); } catch { ids = []; }
  const id = Array.isArray(ids) && typeof ids[0] === "string" ? ids[0] : null;
  if (!id) return null;
  return prisma.socialPost.findUnique({
    where: { id },
    select: { scheduledFor: true, publishedAt: true, permalink: true, externalPostId: true, lastError: true },
  });
}

export async function consultarPost(clientId: string, idExterno: string): Promise<RespostaDoPost | null> {
  const p = await prisma.postExterno.findUnique({ where: { fonte_idExterno: { fonte: FONTE, idExterno } } });
  if (!p || p.clientId !== clientId) return null;
  const socialPost = await socialPostDoDono(p.socialPostIdsJson);
  return paraResposta(p, socialPost);
}

// ─── O REPOST DIÁRIO DE VAGA PAGA (contrato §6.4) ────────────────────────────
//
// Escopo desta ficha: reposta STORY. Feed/carrossel não repetem sozinhos
// (conteúdo permanente no perfil — repetir diariamente não é o mesmo padrão
// de risco/benefício que repetir um story efêmero). Se o City Jobs também
// precisar de repost diário em feed, é ajuste desta função, não do contrato:
// registrar como pendência para o PM confirmar antes de estender.
//
// Chamada pelo despertador (perna própria, ver `lib/agency/despertador.ts`).
// Cria NO MÁXIMO um repost por vaga por tique — mesma régua de "sequencial,
// nunca em paralelo" do resto da casa.

/** A janela do dia dentro da qual o horário do repost varia — expediente
 *  comercial comum (09h–17h Brasília), mesma faixa que a rampa de stories já
 *  assume no resto da esteira. */
const JANELA_DO_REPOST_MIN = { inicio: 9 * 60, fim: 17 * 60 };

export interface ResultadoDosReposts {
  criados: number;
  falhas: string[];
}

/**
 * Roda os reposts do dia que já venceram. Idempotente: só cria o repost do
 * DIA de `agora` uma vez (`repostsFeitos` é o carimbo), então rodar de novo
 * no mesmo dia não duplica.
 */
export async function processarRepostsDeVagasPagas(agora: Date = new Date()): Promise<ResultadoDosReposts> {
  const saida: ResultadoDosReposts = { criados: 0, falhas: [] };

  const candidatos = await prisma.postExterno.findMany({
    where: {
      fonte: FONTE,
      formato: "story",
      prioridade: "paga",
      validadePlano: { not: null },
      estado: { in: ["agendado", "publicado"] },
    },
    take: 50,
    orderBy: { criadoEm: "asc" },
  });

  const hojeCivil = inicioDoDiaCivilDeBrasilia(agora);

  for (const p of candidatos) {
    try {
      if (!p.validadePlano) continue;
      const duracaoDias = duracaoDoPlanoEmDias(p.criadoEm, p.validadePlano);
      // Dia 1 = o post ORIGINAL (já existe, criado por `receberPost`).
      // `repostsFeitos` conta quantos reposts (além do dia 1) já saíram.
      const proximoDia = p.repostsFeitos + 2;
      if (!repostAindaElegivel(proximoDia, duracaoDias)) continue;

      const diaBaseCriacao = inicioDoDiaCivilDeBrasilia(p.criadoEm);
      const diaDoProximoRepost = new Date(diaBaseCriacao.getTime() + (proximoDia - 1) * 24 * 60 * 60_000);
      if (hojeCivil.getTime() < diaDoProximoRepost.getTime()) continue; // ainda não chegou o dia deste repost

      const minuto = minutoDoRepostNaJanela(p.idExterno, proximoDia, JANELA_DO_REPOST_MIN.inicio, JANELA_DO_REPOST_MIN.fim);
      const scheduledFor = new Date(diaDoProximoRepost.getTime() + minuto * 60_000);
      const legenda = legendaDoRepost(p.legenda, proximoDia, duracaoDias);

      const mediaAssetIds: unknown = JSON.parse(p.midiaAssetIdsJson || "[]");
      const mediaUrls = Array.isArray(mediaAssetIds)
        ? mediaAssetIds.filter((x): x is string => typeof x === "string").map((id) => `/api/media/${id}`)
        : [];

      // ⚠️ CORRIGIDO (Achado 3, Q8-qualidade, 28/09/2026): este comentário
      // dizia que a trava de duplicado ERA conferida aqui "com a exceção
      // etiquetada". Não é — `violaTravaDeDuplicado` só é chamada em
      // `receberPost` (a criação original), nunca dentro deste laço. O repost
      // de vaga paga ATRAVESSA a trava POR DESENHO, sem nenhuma checagem
      // acontecer aqui (contrato §6.3 autoriza o repost a atravessar; o que
      // este comentário prometia — logar colisão com OUTRA publicação — nunca
      // rodou). O `ActivityEvent` abaixo (`MOTIVO_REPOST_AUTORIZADO`) registra
      // a DECISÃO de deixar passar, não o resultado de uma conferência.
      const socialPost = await prisma.socialPost.create({
        data: {
          workspaceId: p.workspaceId,
          clientId: p.clientId,
          caption: "", // story: Meta ignora legenda — `legenda` acima fica só no ActivityEvent/auditoria
          networks: JSON.stringify(["instagram"]),
          format: "story",
          mediaUrl: mediaUrls[0] ?? null,
          mediaUrlsJson: JSON.stringify(mediaUrls),
          scheduledFor,
          status: "draft",
          visibility: "compartilhado",
          // A MESMA marca de fonte externa do post original (achado 1, J4) —
          // um repost é tão "fonte externa" quanto o dia 1, e precisa da MESMA
          // trava de silêncio/piloto se algum dia carregar risco.
          scriptJson: marcadorDeFonteExterna({ idExterno: p.idExterno, risco: p.risco, prioridade: p.prioridade }),
        },
      });

      const idsAnteriores: unknown = JSON.parse(p.socialPostIdsJson || "[]");
      const novaListaDeIds = [...(Array.isArray(idsAnteriores) ? idsAnteriores : []), socialPost.id];

      await prisma.postExterno.update({
        where: { id: p.id },
        data: { repostsFeitos: proximoDia - 1, socialPostIdsJson: JSON.stringify(novaListaDeIds) },
      });

      await prisma.activityEvent
        .create({
          data: {
            workspaceId: p.workspaceId,
            clientId: p.clientId,
            type: "cityjobs_repost_de_vaga_paga",
            message: `Repost do dia ${proximoDia}/${duracaoDias} da vaga "${p.idExterno}" — legenda: "${legenda.slice(0, 200)}" — motivo interno: ${MOTIVO_REPOST_AUTORIZADO}.`.slice(0, 900),
          },
        })
        .catch(() => {});

      // "paga + sem_risco" repete a mesma trava de aprovação do post
      // original — nunca herda o carimbo do dia 1 sem reconferir.
      if (p.risco === "sem_risco") {
        const regraLigada = await clienteEhCityJobsComRegraLigada(p.clientId);
        if (regraLigada) {
          await registrarAprovacaoPorRegra({
            workspaceId: p.workspaceId,
            clientId: p.clientId,
            postIds: [socialPost.id],
            carimbo: carimboDoCityJobsPagaSemRisco(scheduledFor),
          }).catch(() => {});
        } else {
          await abrirRevisaoNoPlanner(p.workspaceId, p.clientId, socialPost.id, {
            idExterno: p.idExterno,
            prioridade: "paga",
            risco: p.risco,
          });
        }
      } else {
        await abrirRevisaoNoPlanner(p.workspaceId, p.clientId, socialPost.id, {
          idExterno: p.idExterno,
          prioridade: "paga",
          risco: p.risco,
        });
      }

      await registrarEventoDeWebhook(p.id, { idExterno: p.idExterno, evento: "agendado", ocorridoEm: agora });

      saida.criados++;
    } catch (err) {
      saida.falhas.push(`vaga ${p.idExterno}: ${err instanceof Error ? err.message : "erro ao processar repost"}`);
    }
  }

  return saida;
}

/** Reexportado para quem monta a régua de repost — ver `regras.ts`. */
export { MOTIVO_REPOST_AUTORIZADO };
