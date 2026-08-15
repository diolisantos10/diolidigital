// dono-da-tela.ts — a IDENTIDADE OPACA do cliente que a tela está mostrando.
//
// ── Por que isto existe (15/08/2026, incidente do portal) ────────────────────
// O CEO abriu o portal de um cliente e o painel "Fale com seu PM" trouxe a
// conversa de OUTRO cliente — mesmas mensagens, mesmos horários. A causa
// estrutural: o cliente da TELA e o cliente da CONVERSA são resolvidos por
// caminhos diferentes (token na URL × cookie `dioli_portal`, que é UM só por
// navegador, para o domínio inteiro, guardando UM cliente) e **ninguém
// conferia se eram o mesmo**.
//
// A conferência precisa de um lado a lado. Em `/portal/access/me` não existe
// token na requisição do chat: o cookie É a credencial. Então a única forma de
// o servidor comparar "cliente da tela" com "cliente do cookie" é a tela
// DECLARAR quem ela está mostrando.
//
// ── A regra que impede isto de virar um buraco novo ─────────────────────────
// O que a tela declara **NUNCA CONCEDE ACESSO** — só pode RECUSAR. O dono
// continua sendo DERIVADO do token/cookie (regra da casa de 03/08/2026:
// derivação, nunca comparação); a declaração da tela é confrontada com essa
// derivação e, quando diverge, a resposta é vazia com motivo. Um valor forjado
// aqui não abre a conversa de ninguém: só fecha a que já estava aberta.
//
// ── E por que é um DIGEST, não o `clientId` ──────────────────────────────────
// Id interno de cliente não tem por que trafegar até o navegador nem parar em
// log de proxy. O digest é estável entre processos (não tem sal aleatório —
// dois contêineres precisam calcular o mesmo), não é reversível, e é usado
// exclusivamente para comparar dois lados que já foram autenticados.

import { createHash } from "node:crypto";

/** Prefixo de domínio: impede que este digest case com qualquer outro hash de
 *  id que a casa venha a calcular para outro fim. */
const DOMINIO = "dioli:portal:dono:v1:";

/**
 * A identidade opaca de um cliente, para conferência entre tela e conversa.
 * Determinística e sem segredo — ela não protege nada sozinha; quem protege é
 * a derivação do dono a partir do token/cookie.
 */
export function donoDaTela(clientId: string): string {
  return createHash("sha256").update(DOMINIO + clientId).digest("base64url").slice(0, 22);
}

/**
 * A tela e a conversa estão falando do mesmo cliente?
 *
 * `declarado` ausente = a tela não disse nada (chamada antiga, lado da equipe,
 * teste). Nesse caso não há o que comparar e a conferência não reprova — quem
 * segura o vazamento aí é a cerca de dono na leitura (`conversa.ts`).
 * Declaração PRESENTE e diferente = divergência, e a resposta é vazia.
 */
export function donoConfere(clientIdDerivado: string | null, declarado: string | null | undefined): boolean {
  const d = declarado?.trim();
  if (!d) return true;
  if (!clientIdDerivado) return false;
  return donoDaTela(clientIdDerivado) === d;
}
