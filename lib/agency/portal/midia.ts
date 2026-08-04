// midia.ts — como o portal monta a URL de uma mídia protegida.
//
// Fecho do achado A4 (auditoria do Hub): o token de portal é a credencial
// única do cliente, e ele parava no DOM — cada <img src="/api/media/…?token=…">
// é o token inteiro visível em "inspecionar elemento", em extensão de navegador
// e em log de proxy. Em modo cookie (token vazio no cliente) a URL sai LIMPA:
// a rota /api/media/[id] autentica pelo cookie httpOnly. O sufixo ?token= só
// existe para o modo compatibilidade (link antigo, cookie ainda não gravado).

/**
 * A URL da mídia para o portal renderizar.
 * - `token` vazio (modo cookie) → a URL como está, sem credencial no DOM;
 * - `token` presente (compatibilidade) → `?token=` anexado.
 */
export function urlDeMidiaDoPortal(mediaUrl: string | null, token: string): string | null {
  if (!mediaUrl) return null;
  if (!token) return mediaUrl;
  return `${mediaUrl}${mediaUrl.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
}
