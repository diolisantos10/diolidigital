// pareamento-do-cofre.ts — COMO o Dioli ganha acesso à IA da Control Room,
// sem ninguém entregar token a ninguém (contrato da Control Room, PR #118,
// 04/10/2026).
//
// ── O FLUXO ──────────────────────────────────────────────────────────────────
//   1. O Dioli gera o PRÓPRIO segredo (32 bytes aleatórios, em hex) e guarda
//      SÓ consigo: cifrado no banco (`CofrePareamento`). Nunca manda o valor a
//      ninguém; nunca em log, tela, resposta de API ou commit.
//   2. Pede o pareamento: POST /api/v1/ai/pareamento/solicitar com o SHA-256
//      do segredo. Resposta esperada: 202 {"ok":true,"status":"pendente"}.
//   3. O Diego aprova com um clique na tela do cofre.
//   4. Daí em diante, toda chamada vai ao gateway com X-Service-Token = segredo.
//   5. Pedido novo SUBSTITUI o anterior e exige clique novo.
//
// ── AS TRÊS REGRAS QUE EVITAM CLIQUE À TOA ─────────────────────────────────
//   • PERSISTENTE: o segredo sobrevive a deploy (banco), gerado UMA vez.
//   • SÓ PRODUÇÃO pede: um ambiente local ou de teste pedindo pareamento
//     substituiria o pedido de produção — e o Diego aprovaria o errado.
//   • SÓ REPAREIA se o cofre responder 401 DEPOIS de já ter aprovado. 401
//     enquanto pendente é só "ainda não clicaram" — pedir de novo trocaria o
//     pedido que o Diego está para aprovar.
//
// Enquanto pendente, o gateway é SONDADO no máximo a cada 2 min (para
// descobrir a aprovação sem martelar a Control Room); entre sondagens, a
// casa responde "aguardando aprovação no cofre" na hora, sem rede.

import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/client";
import { decryptSecret, encryptSecret } from "@/lib/security/crypto";
import { enderecoBaseDoCofre } from "@/lib/ai/endereco-do-cofre";

export const ID_DO_PRODUTO = "dioli-digital";
export const CAMINHO_DO_PAREAMENTO = "/api/v1/ai/pareamento/solicitar";
export const ESPERA_ENTRE_SONDAGENS_MS = 2 * 60_000;
const TEMPO_DO_PEDIDO_MS = 15_000;

export type EstadoDoPareamento = "sem_pareamento" | "pendente" | "aprovado";

interface Par {
  segredo: string;
  estado: "pendente" | "aprovado";
  solicitadoEm: Date;
  aprovadoEm: Date | null;
}

/** `undefined` = ainda não lido do banco; `null` = lido, não existe. */
let memoria: Par | null | undefined;
let ultimaSondagem = 0;

/** SHA-256 hex minúsculo — o que a Control Room conhece do segredo. */
export function hashDoSegredo(segredo: string): string {
  return createHash("sha256").update(segredo, "utf8").digest("hex");
}

/** Pode pedir pareamento neste processo? Só produção (ou teste que pede). */
export function podePedirPareamento(): boolean {
  return process.env.NODE_ENV === "production" || process.env.COFRE_PAREAR_FORA_DE_PRODUCAO === "1";
}

/** O estado como está na memória do processo — leitura síncrona para telas. */
export function estadoDoPareamento(): EstadoDoPareamento {
  // Ainda não lido do banco (processo recém-subido): dispara a leitura e
  // responde "sem pareamento" só desta vez — a próxima consulta já sabe.
  if (memoria === undefined) void carregar().catch(() => undefined);
  if (!memoria) return "sem_pareamento";
  return memoria.estado;
}

/** Só para teste: esquece a memória (o banco continua mandando). */
export function esquecerMemoriaDoPareamento(): void {
  memoria = undefined;
  ultimaSondagem = 0;
}

async function carregar(): Promise<Par | null> {
  if (memoria !== undefined) return memoria;
  const linha = await prisma.cofrePareamento.findUnique({ where: { id: ID_DO_PRODUTO } }).catch(() => null);
  const segredo = linha ? decryptSecret(linha.segredoCifrado) : null;
  memoria = linha && segredo
    ? {
        segredo,
        estado: linha.estado === "aprovado" ? "aprovado" : "pendente",
        solicitadoEm: linha.solicitadoEm,
        aprovadoEm: linha.aprovadoEm,
      }
    : null;
  return memoria;
}

/** Resumo SEM o segredo, para tela e rota de estado. */
export async function resumoDoPareamento(): Promise<{
  estado: EstadoDoPareamento;
  solicitadoEm: string | null;
  aprovadoEm: string | null;
  /** Os 8 primeiros caracteres do HASH, para o Diego reconhecer o pedido no cofre. */
  hashInicio: string | null;
}> {
  const par = await carregar();
  return {
    estado: par ? par.estado : "sem_pareamento",
    solicitadoEm: par ? par.solicitadoEm.toISOString() : null,
    aprovadoEm: par?.aprovadoEm ? par.aprovadoEm.toISOString() : null,
    hashInicio: par ? hashDoSegredo(par.segredo).slice(0, 8) : null,
  };
}

/**
 * Gera um segredo NOVO, grava cifrado (substituindo o anterior) e pede o
 * pareamento. Nunca lança. O segredo nunca sai daqui — só o hash.
 */
export async function solicitarPareamento(origem: string): Promise<{ ok: boolean; status: number | null; detalhe: string }> {
  if (!podePedirPareamento()) {
    return { ok: false, status: null, detalhe: "pareamento só é pedido pelo serviço de produção" };
  }
  const segredo = randomBytes(32).toString("hex");
  const hash = hashDoSegredo(segredo);
  const agora = new Date();
  await prisma.cofrePareamento.upsert({
    where: { id: ID_DO_PRODUTO },
    create: { id: ID_DO_PRODUTO, segredoCifrado: encryptSecret(segredo), hashDoSegredo: hash, estado: "pendente", solicitadoEm: agora },
    update: { segredoCifrado: encryptSecret(segredo), hashDoSegredo: hash, estado: "pendente", solicitadoEm: agora, aprovadoEm: null, ultimaResposta: null },
  });
  memoria = { segredo, estado: "pendente", solicitadoEm: agora, aprovadoEm: null };
  ultimaSondagem = 0;

  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TEMPO_DO_PEDIDO_MS);
  let resultado: { ok: boolean; status: number | null; detalhe: string };
  try {
    const res = await fetch(`${enderecoBaseDoCofre()}${CAMINHO_DO_PAREAMENTO}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ produto: ID_DO_PRODUTO, hash, origem }),
      signal: controle.signal,
    });
    const corpo = (await res.text().catch(() => "")).slice(0, 200).split(segredo).join("***");
    resultado = { ok: res.status === 202 || res.ok, status: res.status, detalhe: corpo };
  } catch (e) {
    resultado = {
      ok: false,
      status: null,
      detalhe: e instanceof Error && e.name === "AbortError" ? "tempo esgotado ao pedir o pareamento" : "falha de rede ao pedir o pareamento",
    };
  } finally {
    clearTimeout(relogio);
  }
  await prisma.cofrePareamento
    .update({ where: { id: ID_DO_PRODUTO }, data: { ultimaResposta: `${resultado.status ?? "sem resposta"} ${resultado.detalhe}`.slice(0, 300) } })
    .catch(() => undefined);
  console.log(`[cofre] pedido de pareamento (${origem}): ${resultado.status ?? "sem resposta"} — hash ${hash.slice(0, 8)}…`);
  return resultado;
}

/**
 * No BOOT do serviço: sem segredo guardado → gera e pede. Com segredo → nada
 * (pendente espera o clique; aprovado já funciona). Nunca lança.
 */
export async function garantirPareamento(origem: string): Promise<void> {
  // Carrega SEMPRE (é o que deixa o estado pronto para as consultas
  // síncronas logo depois do boot); pedir, só em produção.
  const par = await carregar().catch(() => null);
  if (par || !podePedirPareamento()) return;
  await solicitarPareamento(origem).catch(() => undefined);
}

export type Credencial =
  | { pronta: true; segredo: string; estado: "pendente" | "aprovado" }
  | { pronta: false; estado: EstadoDoPareamento };

/**
 * O segredo para a próxima chamada ao gateway — ou o porquê de não chamar.
 * Pendente entre sondagens → não chama (responde "aguardando" sem rede).
 */
export async function credencialParaChamar(): Promise<Credencial> {
  const par = await carregar().catch(() => null);
  if (!par) return { pronta: false, estado: "sem_pareamento" };
  if (par.estado === "pendente") {
    const agora = Date.now();
    if (agora - ultimaSondagem < ESPERA_ENTRE_SONDAGENS_MS) return { pronta: false, estado: "pendente" };
    ultimaSondagem = agora;
  }
  return { pronta: true, segredo: par.segredo, estado: par.estado };
}

/** O gateway aceitou o segredo: o Diego aprovou. */
export async function marcarAprovado(): Promise<void> {
  if (!memoria || memoria.estado === "aprovado") return;
  const agora = new Date();
  memoria = { ...memoria, estado: "aprovado", aprovadoEm: agora };
  await prisma.cofrePareamento
    .update({ where: { id: ID_DO_PRODUTO }, data: { estado: "aprovado", aprovadoEm: agora } })
    .catch(() => undefined);
}

/**
 * O gateway respondeu 401. Pendente → só "ainda não aprovado" (nada muda).
 * Aprovado → o acesso foi revogado ou trocado: pede pareamento NOVO.
 * Devolve se pediu de novo.
 */
export async function aoReceber401(): Promise<boolean> {
  const par = await carregar().catch(() => null);
  if (!par || par.estado === "pendente") return false;
  await solicitarPareamento("o cofre respondeu 401 a um segredo já aprovado").catch(() => undefined);
  return true;
}
