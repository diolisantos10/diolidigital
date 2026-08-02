// signed-request.ts — o envelope assinado que a Meta manda nos callbacks.
//
// A Meta usa isto em dois callbacks que TODO app precisa ter para passar no
// App Review: exclusão de dados e desautorização. O corpo chega como
// `assinatura.payload`, os dois em base64url, e a assinatura é um HMAC-SHA256
// do payload com o App Secret.
//
// POR QUE ESTE ARQUIVO EXISTE SEPARADO, e por que a validação é obrigatória:
// o callback de exclusão APAGA DADOS. Um endpoint que aceita qualquer corpo é
// um botão de "delete" aberto na internet — bastaria alguém adivinhar um id de
// usuário para varrer a base de um cliente. A assinatura é o que prova que
// quem pediu foi a Meta.
//
// `timingSafeEqual` e não `===`: comparação de string curto-circuita no
// primeiro byte diferente, e o tempo dessa comparação vaza a assinatura byte a
// byte para quem medir. É o mesmo cuidado de `webhooks.ts`.

import { createHmac, timingSafeEqual } from "crypto";

export interface SignedRequest {
  /** O id do usuário na Meta. É o que identifica o que apagar. */
  user_id?: string;
  algorithm?: string;
  issued_at?: number;
  [k: string]: unknown;
}

function deBase64Url(s: string): Buffer {
  // base64url → base64: a Meta usa o alfabeto seguro para URL e sem padding.
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), "="), "base64");
}

/**
 * Abre o envelope e CONFERE a assinatura. Devolve `null` sempre que houver
 * qualquer dúvida — formato errado, algoritmo diferente, assinatura que não
 * bate. Nunca devolve o conteúdo "no melhor esforço": aqui, aceitar por engano
 * significa apagar dado por engano.
 */
export function lerSignedRequest(bruto: string, appSecret: string): SignedRequest | null {
  if (!bruto || !appSecret) return null;

  const partes = bruto.split(".");
  if (partes.length !== 2) return null;
  const [assinaturaB64, payloadB64] = partes as [string, string];

  let payload: SignedRequest;
  try {
    payload = JSON.parse(deBase64Url(payloadB64).toString("utf8")) as SignedRequest;
  } catch {
    return null;
  }

  // A Meta só assina com HMAC-SHA256. Aceitar outro algoritmo é aceitar que
  // alguém escolha o algoritmo — inclusive um que não protege nada.
  if (payload.algorithm !== "HMAC-SHA256") return null;

  const esperada = createHmac("sha256", appSecret).update(payloadB64).digest();
  const recebida = deBase64Url(assinaturaB64);
  if (esperada.length !== recebida.length) return null;
  if (!timingSafeEqual(esperada, recebida)) return null;

  return payload;
}
