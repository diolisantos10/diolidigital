// ─── A metade do CSRF que o SameSite=Lax NÃO cobre ──────────────────────────
//
// O cookie de sessão desta casa (`lib/auth/session.ts`) é `sameSite: "lax"`,
// setado EXPLICITAMENTE. Isso já barra o CSRF clássico de POST/PUT/PATCH/
// DELETE: navegador nenhum anexa cookie `Lax` a um POST de origem cruzada
// (a exceção de 2 minutos do Chrome — "Lax+POST" — só existe para cookie SEM
// atributo `SameSite`, que é o caso do default do navegador, não o desta casa).
//
// O que `Lax` LIBERA de propósito é a NAVEGAÇÃO DE TOPO com método seguro
// (GET/HEAD) — é assim que um link de e-mail ainda abre a sessão. Se uma rota
// muda estado dentro de um GET, essa liberação vira porta: um `<a href>`, um
// `<meta refresh>` ou um redirect em qualquer site aciona o GET com o cookie
// anexado, porque para o navegador aquilo É uma navegação de topo legítima.
//
// Este helper fecha ESSA fresta, e só ela — não é substituto de token CSRF
// nem de checagem de Origin/Referer para POST (que já não precisam, dado o
// Lax explícito). Usa o cabeçalho `Sec-Fetch-Site` (Fetch Metadata), que o
// navegador anexa sozinho e a página que navega NÃO consegue forjar.
//
// ⚠️ NAVEGADOR SEM SUPORTE A FETCH METADATA (Safari < 16.4, e qualquer
// navegador sem SameSite) não manda o cabeçalho — `ehNavegacaoCrossSite`
// devolve `false` (não bloqueia) nesse caso. É risco aceito e declarado, não
// escondido: navegador legado já não tinha proteção nenhuma antes deste
// arquivo existir, e negar por padrão quebraria a leitura legítima para todo
// mundo que também não manda o cabeçalho. Fail-open aqui é FAIL-OPEN DA
// MUTAÇÃO OPCIONAL, nunca do acesso — quem chama continua exigindo sessão ou
// token válidos por fora deste helper.
export function ehNavegacaoCrossSite(request: { headers: { get(name: string): string | null } }): boolean {
  const site = request.headers.get("sec-fetch-site");
  return site === "cross-site";
}
