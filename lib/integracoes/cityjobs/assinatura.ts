// assinatura.ts — HMAC-SHA256 do CITY JOBS, EXATO como o contrato. SERVER-ONLY.
//
// Fonte da verdade: docs/integracoes/cityjobs-contrato.md, §1. A string
// assinada é `<timestamp>.<corpo bruto>` — os BYTES exatos que atravessaram a
// rede, nunca o objeto re-serializado depois do `JSON.parse` (a causa mais
// comum de "assinatura inválida" entre dois times, conforme o próprio
// contrato §1.2). Por isso `conferirAssinatura` recebe `corpoBruto` como
// STRING — quem chama tem de capturar o corpo como texto ANTES de fazer
// `JSON.parse`, nunca depois.
//
// A janela de 5 min (passado E futuro) é a defesa contra replay, e é checada
// ANTES da assinatura — não custa nada calcular um HMAC para uma requisição
// capturada há uma hora, mas custa não ter essa trava.
//
// Comparação em tempo constante (`timingSafeEqual`), nunca `===`. Os dois
// segredos (vigente + anterior, durante a rotação) são testados em sequência;
// a primeira que bater aceita a requisição.
//
// FAIL-CLOSED: sem NENHUM segredo configurado, `segredosVigentes` devolve
// lista vazia e `conferirAssinatura` nunca aceita nada. Quem chama esta lib
// devolve 503 nesse caso — a rota está mal configurada, o City Jobs não errou,
// e por isso não é o mesmo motivo HTTP de "assinatura inválida" (401).

import { createHmac, timingSafeEqual } from "crypto";

export const PREFIXO_DA_ASSINATURA = "v1=";
/** 5 minutos, nos dois sentidos — contrato §1.5. */
export const JANELA_DO_TIMESTAMP_S = 300;

/** O HMAC-SHA256 da string `<timestamp>.<corpoBruto>`, em hex — contrato §1.3. */
export function assinar(timestamp: string, corpoBruto: string, segredo: string): string {
  return createHmac("sha256", segredo).update(`${timestamp}.${corpoBruto}`, "utf8").digest("hex");
}

/** O cabeçalho `X-Dioli-Assinatura` pronto — usado por quem MANDA a
 *  requisição (o webhook de volta, §8, usa o mesmo esquema nos dois sentidos). */
export function cabecalhoDaAssinatura(timestamp: string, corpoBruto: string, segredo: string): string {
  return `${PREFIXO_DA_ASSINATURA}${assinar(timestamp, corpoBruto, segredo)}`;
}

/**
 * Os segredos vigentes, na ordem em que devem ser testados: o atual primeiro,
 * o anterior (rotação, contrato §1.6) depois. String vazia ou ausente nunca
 * entra na lista — vazio não é segredo válido, mesmo que alguém o grave por
 * engano.
 */
export function segredosVigentes(
  env: Record<string, string | undefined> = process.env,
): string[] {
  return [env.CITYJOBS_HMAC_SEGREDO, env.CITYJOBS_HMAC_SEGREDO_ANTERIOR].filter(
    (s): s is string => typeof s === "string" && s.trim().length > 0,
  );
}

export type MotivoDaRecusa =
  | "sem_segredo_configurado"
  | "timestamp_fora_da_janela"
  | "assinatura_invalida";

export type VereditoDaAssinatura = { ok: true } | { ok: false; motivo: MotivoDaRecusa };

/**
 * A CONFERÊNCIA COMPLETA — regra dos dois lados (contrato §1.5).
 *
 * `corpoBruto` é o TEXTO exato do corpo — string vazia no GET (contrato §3:
 * "GET assina o corpo vazio: `<timestamp>.`"). Nunca `JSON.stringify` de um
 * objeto já parseado.
 */
export function conferirAssinatura(a: {
  timestampHeader: string | null;
  corpoBruto: string;
  assinaturaHeader: string | null;
  agora?: Date;
  env?: Record<string, string | undefined>;
}): VereditoDaAssinatura {
  const segredos = segredosVigentes(a.env);
  if (segredos.length === 0) return { ok: false, motivo: "sem_segredo_configurado" };

  if (!a.timestampHeader || !a.assinaturaHeader) {
    return { ok: false, motivo: "assinatura_invalida" };
  }

  const timestampNum = Number(a.timestampHeader);
  if (!Number.isFinite(timestampNum) || !/^\d+$/.test(a.timestampHeader.trim())) {
    return { ok: false, motivo: "assinatura_invalida" };
  }

  const agora = a.agora ?? new Date();
  const agoraS = Math.floor(agora.getTime() / 1000);
  if (Math.abs(agoraS - timestampNum) > JANELA_DO_TIMESTAMP_S) {
    return { ok: false, motivo: "timestamp_fora_da_janela" };
  }

  const semPrefixo = a.assinaturaHeader.startsWith(PREFIXO_DA_ASSINATURA)
    ? a.assinaturaHeader.slice(PREFIXO_DA_ASSINATURA.length)
    : null;
  // Prefixo ausente/errado: recusa sem tentar validar um hex de outro esquema
  // como se fosse HMAC-SHA256 — é para isto que o prefixo existe (contrato §1.1).
  if (!semPrefixo || !/^[0-9a-f]+$/i.test(semPrefixo) || semPrefixo.length % 2 !== 0) {
    return { ok: false, motivo: "assinatura_invalida" };
  }

  const recebidaBuf = Buffer.from(semPrefixo, "hex");

  for (const segredo of segredos) {
    const esperadaBuf = Buffer.from(assinar(a.timestampHeader, a.corpoBruto, segredo), "hex");
    if (esperadaBuf.length === recebidaBuf.length && timingSafeEqual(esperadaBuf, recebidaBuf)) {
      return { ok: true };
    }
  }
  return { ok: false, motivo: "assinatura_invalida" };
}
