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
// Id interno de cliente não tem por que trafegar até o navegador. O digest não
// é reversível e é estável entre processos (sem sal aleatório — dois
// contêineres precisam calcular o mesmo).
//
// ⚠️ HONESTIDADE SOBRE O QUE ELE **NÃO** RESOLVE (corrigido em 15/08/2026,
// rodada 2 — a versão anterior deste comentário AFIRMAVA o contrário e estava
// errada): o digest viaja na QUERY STRING e portanto **para em log de proxy,
// igual ao id pararia**. E, por ser estável e sem sal, ele é um **pseudônimo**:
// quem tiver o log correlaciona todo o tráfego de um mesmo cliente por ele.
// O que ele evita é só o vazamento do identificador INTERNO do banco. Trocar
// por um selo mintado por sessão fecharia a correlação; não foi feito, e está
// aberto com dono.

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
 * ── `exigir` (15/08/2026, rodada 2): selo opcional NÃO É TRAVA ──────────────
 * A primeira versão devolvia `true` quando o selo não vinha — e quem não
 * mandasse `dono` (um `curl`, um bundle em cache do deploy anterior) nem
 * acionava a conferência. Trava que se desliga sozinha ao ser omitida é aviso.
 *
 * Agora quem chama diz se o selo é OBRIGATÓRIO naquele caminho:
 *
 *   • **modo cookie** (`exigir: true`) — a credencial é o cookie do domínio,
 *     que guarda UM cliente para o navegador inteiro. É exatamente o caminho
 *     em que tela e conversa podem discordar, e é onde o selo é a única
 *     conferência possível. Sem selo: **RECUSA**.
 * ⚠️ O DEFAULT **FECHA** (rodada 3): quem esquecer a flag ganha a versão
 * estrita, não a permissiva. Default aberto é o F3 esperando o próximo
 * chamador — e o próximo chamador sempre chega.
 *
 *   • **token explícito** (`exigir: false`, EXPLÍCITO) — o token identifica o cliente sem
 *     ambiguidade na própria requisição; não há dois lados para divergir.
 *     Exigir o selo aí quebraria link legítimo sem fechar buraco nenhum.
 */
export function donoConfere(
  clientIdDerivado: string | null,
  declarado: string | null | undefined,
  exigir = true,
): boolean {
  const d = declarado?.trim();
  if (!d) return !exigir;
  if (!clientIdDerivado) return false;
  return donoDaTela(clientIdDerivado) === d;
}
