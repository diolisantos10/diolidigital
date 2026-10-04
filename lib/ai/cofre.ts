// cofre.ts — O CLIENTE ÚNICO DA IA DA CONTROL ROOM (o "cofre").
//
// ── POR QUE EXISTE (CEO, 04/10/2026) ─────────────────────────────────────────
// As contas diretas de IA da agência estão sem saldo ou espalhadas. A IA do
// Dioli passa a vir da Control Room: o Dioli não guarda chave de provedor,
// pede o trabalho ao gateway, e o gateway escolhe o modelo (DeepSeek para
// texto, xAI para imagem) e cobra o centro de custo do cliente certo.
//
// UM lugar só fala com o gateway: este arquivo. `generate()` (calendário,
// legenda, analista…), `generateDesign()` (arte) e a leitura de brand book
// passam por aqui. Ninguém mais monta este pedido.
//
// ── A CREDENCIAL: PAREAMENTO, NÃO TOKEN (04/10/2026, contrato PR #118) ──────
// Ninguém entrega token a ninguém. O Dioli gera o próprio segredo, guarda
// cifrado e pede o pareamento; o Diego aprova com um clique no cofre. Ver
// `lib/ai/pareamento-do-cofre.ts`. Sem pareamento aprovado, nada quebra: a
// tela diz "aguardando aprovação no cofre".
//
// ── O QUE VEM DO AMBIENTE (tudo opcional) ────────────────────────────────────
//   CONTROL_ROOM_URL               base do cofre (padrão: `endereco-do-cofre.ts`).
//   CONTROL_ROOM_GATEWAY_PATH      caminho (padrão: /api/v1/ai/gateway/execute —
//                                  conferido em 04/10: /gateway/execute dá 404).
//   CONTROL_ROOM_CENTRO_CUSTO_PADRAO  centro de custo da CASA: trabalho sem
//                                  cliente, ou cliente sem centro próprio.
//
// ⚠️ O SEGREDO NUNCA SAI DAQUI: não vai para log, erro, resposta de API nem
// `AIRunLog` — é mascarado até se o gateway o ecoar.
//
// ── O QUE NÃO FOI CONFIRMADO DO CONTRATO ─────────────────────────────────────
// O formato exato da resposta ("o resultado do modelo") e o payload de imagem
// não vieram escritos. A leitura da resposta aceita as formas mais prováveis
// e, se nenhuma servir, devolve falha DECLARADA — nunca um texto inventado.
// As dúvidas estão listadas em `docs/cofre-duvidas.md`.

import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/client";
import { enderecoBaseDoCofre } from "@/lib/ai/endereco-do-cofre";
import { aoReceber401, credencialParaChamar, estadoDoPareamento, marcarAprovado } from "@/lib/ai/pareamento-do-cofre";

export const CAMINHO_PADRAO_DO_GATEWAY = "/api/v1/ai/gateway/execute";
export const ENDERECO_DO_PAPEL = "dioli.digital.gateway.chamador";

/** O recado de quando o cofre ainda não atende. A tela mostra isto, não "erro". */
export const AGUARDANDO_O_COFRE = "Aguardando a IA da Control Room: aguardando aprovação no cofre.";

/** Centro de custo quando nem o cliente nem o ambiente dizem outro: o produto.
 *  (Dúvida aberta com a Control Room — `docs/cofre-duvidas.md`.) */
export const CENTRO_DE_CUSTO_DO_PRODUTO = "dioli-digital";

const TEMPO_PADRAO_MS = 60_000;

export type Modalidade = "text" | "image";

/** Por que o cofre não entregou — cada um com um dono diferente. */
export type FalhaDoCofre =
  | "desligado"        // sem token: espera, não defeito
  | "sem_centro_de_custo"
  | "nao_autorizado"   // 401/403: token errado ou revogado — do CEO
  | "sem_modelo"       // 409: nenhum modelo elegível — da Control Room
  | "corpo_invalido"   // 422: pedido nosso mal montado — da casa
  | "tempo_esgotado"
  | "resposta_ilegivel"
  | "falha";           // 5xx, rede

export type RespostaDoCofre =
  | {
      ok: true; texto: string | null; imagemUrl: string | null; modelo: string | null;
      uso: { entrada: number | null; saida: number | null } | null;
      /** O custo que o gateway informou, como veio (número ou texto). `null` = não informou. */
      custo: number | string | null;
    }
  | { ok: false; falha: FalhaDoCofre; status: number | null; erro: string };

export interface PedidoAoCofre {
  modalidade: Modalidade;
  /** As mensagens, no formato do contrato. Para imagem: o prompt vai como
   *  mensagem do usuário E em `prompt` (ver dúvida 4 em `docs/cofre-duvidas.md`). */
  mensagens: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  /** De quem é o custo. `null` = trabalho da casa. */
  clientId?: string | null;
  /** Quem pediu, dentro do Dioli (vai no `payloadRef` para rastrear). */
  agentId?: string | null;
  /** Só imagem: o tamanho pedido (square | portrait | landscape). */
  tamanho?: string;
  timeoutMs?: number;
}

/**
 * Vale TENTAR o cofre? Sim quando há pareamento (pendente ou aprovado): os
 * chamadores pedem, e `pedirAoCofre` responde "aguardando" sem rede enquanto
 * o clique não sai. Leitura síncrona da memória do processo.
 */
export function cofreLigado(): boolean {
  return estadoDoPareamento() !== "sem_pareamento";
}

/** O Diego já aprovou (o gateway aceitou o segredo pelo menos uma vez). */
export function cofreAprovado(): boolean {
  return estadoDoPareamento() === "aprovado";
}

export function enderecoDoGateway(): string {
  const b = enderecoBaseDoCofre();
  const caminho = process.env.CONTROL_ROOM_GATEWAY_PATH?.trim() || CAMINHO_PADRAO_DO_GATEWAY;
  return `${b}${caminho.startsWith("/") ? caminho : `/${caminho}`}`;
}

/**
 * O centro de custo de quem paga. Cliente com centro próprio → o dele; senão
 * o da casa (`CONTROL_ROOM_CENTRO_CUSTO_PADRAO`), e o desvio é DITO no log
 * (sem dado do cliente além do id). Sem nenhum dos dois → `null`, e o cofre
 * não é chamado: pedido sem dono de custo seria um 422 pago em tempo.
 */
export async function centroDeCustoDe(clientId: string | null | undefined): Promise<string | null> {
  const padrao = process.env.CONTROL_ROOM_CENTRO_CUSTO_PADRAO?.trim() || CENTRO_DE_CUSTO_DO_PRODUTO;
  if (!clientId) return padrao;
  const c = await prisma.client
    .findUnique({ where: { id: clientId }, select: { centroCustoId: true } })
    .catch(() => null);
  const proprio = c?.centroCustoId?.trim() || null;
  if (proprio) return proprio;
  if (padrao) console.warn(`[cofre] cliente ${clientId} sem centro de custo próprio — custo lançado no centro da casa`);
  return padrao;
}

function ambiente(): string {
  return process.env.CONTROL_ROOM_AMBIENTE?.trim() || (process.env.NODE_ENV === "production" ? "production" : "development");
}

/** O corpo do pedido, montado num lugar só (e conferido em teste). */
export function corpoDoPedido(p: PedidoAoCofre, centroCustoId: string, payloadRef: string): Record<string, unknown> {
  const corpo: Record<string, unknown> = {
    roleAddress: ENDERECO_DO_PAPEL,
    workClass: "routine",
    modalidade: p.modalidade,
    centroCustoId,
    escopo: { holdingId: "dioli" },
    ambiente: ambiente(),
    payloadRef,
    classificacaoDados: "internal",
    solicitadoPor: "dioli-digital",
    mensagens: p.mensagens,
  };
  if (p.modalidade === "image") {
    corpo.prompt = p.mensagens.filter((m) => m.role === "user").map((m) => m.content).join("\n");
    if (p.tamanho) corpo.tamanho = p.tamanho;
  }
  return corpo;
}

/** Tira de um valor desconhecido o primeiro texto que parecer a resposta. */
function textoDe(v: unknown, profundidade = 0): string | null {
  if (profundidade > 4 || v == null) return null;
  if (typeof v === "string") return v.trim() ? v : null;
  if (Array.isArray(v)) {
    for (const x of v) {
      const t = textoDe(x, profundidade + 1);
      if (t) return t;
    }
    return null;
  }
  if (typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  // Forma OpenAI/DeepSeek, se o gateway repassar a resposta crua.
  const escolha = (o.choices as Array<{ message?: { content?: unknown } }> | undefined)?.[0]?.message?.content;
  if (typeof escolha === "string" && escolha.trim()) return escolha;
  for (const k of ["texto", "text", "content", "conteudo", "saida", "output", "resposta", "resultado", "result", "message", "mensagem"]) {
    const t = textoDe(o[k], profundidade + 1);
    if (t) return t;
  }
  return null;
}

/** Tira a imagem (URL ou base64) de um valor desconhecido. */
function imagemDe(v: unknown, profundidade = 0): string | null {
  if (profundidade > 4 || v == null || typeof v !== "object") return null;
  if (Array.isArray(v)) {
    for (const x of v) {
      const i = imagemDe(x, profundidade + 1);
      if (i) return i;
    }
    return null;
  }
  const o = v as Record<string, unknown>;
  for (const k of ["url", "imageUrl", "imagemUrl", "image_url"]) {
    if (typeof o[k] === "string" && /^(https?:|data:image\/)/.test(o[k] as string)) return o[k] as string;
  }
  for (const k of ["b64_json", "b64", "base64", "imagemBase64"]) {
    if (typeof o[k] === "string" && (o[k] as string).length > 32) return `data:image/png;base64,${o[k] as string}`;
  }
  for (const k of ["data", "resultado", "result", "imagem", "image", "output", "saida"]) {
    const i = imagemDe(o[k], profundidade + 1);
    if (i) return i;
  }
  return null;
}

function usoDe(o: Record<string, unknown>): { entrada: number | null; saida: number | null } | null {
  const u = (o.uso ?? o.usage) as Record<string, unknown> | undefined;
  if (!u || typeof u !== "object") return null;
  const n = (x: unknown) => (typeof x === "number" ? x : null);
  return { entrada: n(u.entrada ?? u.prompt_tokens ?? u.input_tokens), saida: n(u.saida ?? u.completion_tokens ?? u.output_tokens) };
}

/** O custo informado pelo gateway, se houver, em qualquer das formas comuns. */
function custoDe(o: Record<string, unknown>): number | string | null {
  for (const k of ["custo", "cost", "custoUsd", "custo_usd", "costUsd"]) {
    const v = o[k];
    if (typeof v === "number" || (typeof v === "string" && v.trim())) return v as number | string;
  }
  const u = (o.uso ?? o.usage) as Record<string, unknown> | undefined;
  if (u && typeof u === "object") {
    for (const k of ["custo", "cost"]) {
      const v = u[k];
      if (typeof v === "number" || (typeof v === "string" && v.trim())) return v as number | string;
    }
  }
  return null;
}

/** O que o gateway disse ao recusar — cortado, e com o token mascarado por garantia. */
async function motivoDaRecusa(res: Response, segredo: string): Promise<string> {
  try {
    const bruto = (await res.text()).slice(0, 300).replace(/\s+/g, " ").trim();
    return bruto.split(segredo).join("***");
  } catch {
    return "";
  }
}

/**
 * Pede UM trabalho ao gateway. Nunca lança: indisponível, recusado e tempo
 * esgotado são respostas, cada uma com o seu nome.
 */
export async function pedirAoCofre(p: PedidoAoCofre): Promise<RespostaDoCofre> {
  const credencial = await credencialParaChamar();
  if (!credencial.pronta) return { ok: false, falha: "desligado", status: null, erro: AGUARDANDO_O_COFRE };
  const t = credencial.segredo;

  const centro = await centroDeCustoDe(p.clientId);
  if (!centro) {
    return {
      ok: false, falha: "sem_centro_de_custo", status: null,
      erro: "Cofre ligado, mas sem centro de custo: defina CONTROL_ROOM_CENTRO_CUSTO_PADRAO ou o centro de custo do cliente.",
    };
  }
  const payloadRef = `dioli:${p.agentId ?? "sem-agente"}:${p.clientId ?? "casa"}:${randomUUID()}`;

  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), p.timeoutMs ?? TEMPO_PADRAO_MS);
  try {
    const res = await fetch(enderecoDoGateway(), {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Service-Token": t },
      body: JSON.stringify(corpoDoPedido(p, centro, payloadRef)),
      signal: controle.signal,
    });
    // Qualquer resposta que não seja 401/403 prova que o segredo foi aceito:
    // o Diego aprovou. (409/422 vêm DEPOIS da autenticação.)
    if (res.status !== 401 && res.status !== 403 && res.status < 500) await marcarAprovado();
    if (res.status === 401 || res.status === 403) {
      const repareou = await aoReceber401();
      if (!repareou) {
        // Pendente: ainda não clicaram. Espera, não defeito.
        return { ok: false, falha: "desligado", status: res.status, erro: AGUARDANDO_O_COFRE };
      }
      return {
        ok: false, falha: "nao_autorizado", status: res.status,
        erro: `Cofre HTTP ${res.status} — o acesso aprovado foi recusado; um pedido novo de pareamento foi feito e espera aprovação no cofre.`,
      };
    }
    if (!res.ok) {
      const motivo = await motivoDaRecusa(res, t);
      const falha: FalhaDoCofre =
        res.status === 401 || res.status === 403 ? "nao_autorizado"
        : res.status === 409 ? "sem_modelo"
        : res.status === 422 ? "corpo_invalido"
        : "falha";
      const rotulo = {
        nao_autorizado: "acesso recusado pelo cofre",
        sem_modelo: "nenhum modelo elegível na Control Room",
        corpo_invalido: "pedido recusado como inválido",
        falha: "falha da Control Room",
      }[falha as "nao_autorizado" | "sem_modelo" | "corpo_invalido" | "falha"];
      return { ok: false, falha, status: res.status, erro: `Cofre HTTP ${res.status} — ${rotulo}${motivo ? `: ${motivo}` : ""}` };
    }
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!json) return { ok: false, falha: "resposta_ilegivel", status: res.status, erro: "Cofre respondeu sem JSON legível." };
    const modelo = typeof json.modelo === "string" ? json.modelo : typeof json.model === "string" ? json.model : null;
    if (p.modalidade === "image") {
      const imagemUrl = imagemDe(json);
      if (!imagemUrl) return { ok: false, falha: "resposta_ilegivel", status: res.status, erro: "Cofre respondeu sem imagem reconhecível." };
      return { ok: true, texto: null, imagemUrl, modelo, uso: usoDe(json), custo: custoDe(json) };
    }
    const texto = textoDe(json);
    if (!texto) return { ok: false, falha: "resposta_ilegivel", status: res.status, erro: "Cofre respondeu sem texto reconhecível." };
    return { ok: true, texto, imagemUrl: null, modelo, uso: usoDe(json), custo: custoDe(json) };
  } catch (e) {
    const abortou = e instanceof Error && e.name === "AbortError";
    return abortou
      ? { ok: false, falha: "tempo_esgotado", status: null, erro: "Cofre: tempo esgotado." }
      : { ok: false, falha: "falha", status: null, erro: "Cofre: falha de rede." };
  } finally {
    clearTimeout(relogio);
  }
}

/** Mapeia o modelo informado pelo gateway para o provedor da casa, quando der. */
export function provedorDoModelo(modelo: string | null): "deepseek" | "xai" | "openai" | "claude" | "gemini" | null {
  const m = (modelo ?? "").toLowerCase();
  if (m.includes("deepseek")) return "deepseek";
  if (m.includes("grok") || m.includes("xai")) return "xai";
  if (m.includes("gpt") || m.includes("dall-e")) return "openai";
  if (m.includes("claude")) return "claude";
  if (m.includes("gemini")) return "gemini";
  return null;
}
