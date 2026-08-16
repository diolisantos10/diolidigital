import { origemPublica } from "@/lib/http/endereco-publico";

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

// ─── A OUTRA METADE: Origin/Referer para a FAIXA 1 (efeito externo irreversível) ──
//
// `ehNavegacaoCrossSite` acima cobre GET que muda estado (a fresta que o Lax
// libera de propósito). Esta função cobre a mutação de verdade — POST em rotas
// cujo forjar publica no perfil real do cliente, dispara WhatsApp real, liga
// campanha (move dinheiro) ou gasta a chave de IA da agência. `Lax` já barra o
// CSRF clássico de POST, então em teoria bastaria — mas o Diretor decidiu, para
// ESSA faixa e só ela, não apostar em "navegador legado é improvável" com
// dinheiro e publicação alheios (ver a ficha de despacho). Esta função é a
// segunda trava, não a primeira: quem chama continua exigindo sessão/token por
// fora — ela só decide se a REQUISIÇÃO em si merece confiança de origem.
//
// ── A ORDEM DE SINAIS, do mais forte ao mais fraco ─────────────────────────
//
// 1. `Sec-Fetch-Site` — o navegador anexa sozinho, página nenhuma forja.
//    "cross-site" BLOQUEIA sempre. "same-origin"/"same-site" LIBERA sempre —
//    são os sinais mais confiáveis que existem, não vale a pena checar mais
//    nada depois deles.
// 2. Ausente (Safari < 16.4, ou requisição fora de navegador) → cai para
//    `Origin`, comparado contra a origem PÚBLICA desta casa
//    (`lib/http/endereco-publico.ts`, a mesma fonte que resolve o link que a
//    Meta recebe). `Origin` é "forbidden header name": página nenhuma escrita
//    em JS consegue setá-lo, só o navegador. Bate → libera. Não bate ou não dá
//    para saber a origem esperada → BLOQUEIA.
// 3. Sem `Origin`, cai para `Referer` (mesmo motivo: cabeçalho que o
//    navegador controla, não a página). Mesma regra de comparação.
// 4. Sem NENHUM dos três → BLOQUEIA.
//
// ── POR QUE FAIL-CLOSED NO CASO 4, AO CONTRÁRIO DO `ehNavegacaoCrossSite` ──
//
// Medido antes de travar (a ordem que a ficha exigiu): não existe, nesta casa,
// nenhuma chamada servidor-para-servidor ao próprio `/api` para as rotas da
// faixa 1 — os únicos chamadores são o NAVEGADOR (que manda `Origin` em todo
// POST, same-origin inclusive, desde 2020) e as rotas de segredo/assinatura
// (CRON_SECRET, PILOTO_SECRET, HMAC), que entram por um caminho que nem chama
// esta função — ver cada rota da faixa 1 para a bifurcação. Fail-open aqui
// protegeria exatamente nada: é o navegador sem Fetch Metadata E sem Origin/
// Referer (III praticamente inexistente hoje) que esta trava existe para
// cobrir, e ausência total dos três é o padrão de uma requisição forjada por
// ferramenta (curl, script), não de um navegador real navegando este site.
// Achado explícito, não escondido: scripts de ensaio manual desta casa
// (`scripts/pilot-test.mts` e primos — não fazem parte de CI nem de produção,
// só são rodados à mão contra `localhost`) autenticam por cookie e não mandam
// nenhum dos três cabeçalhos; rodá-los depois desta trava exige acrescentar
// `Origin` na chamada. É o preço da faixa 1 pago no lugar certo: ferramenta
// interna se ajusta uma vez; produção não fica exposta para sempre.
export function deveBloquearMutacaoCrossSite(request: {
  headers: { get(name: string): string | null };
}): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site === "cross-site") return true;
  if (site === "same-origin" || site === "same-site") return false;

  const esperado = origemPublica(request);
  const normalizada = (v: string) => v.replace(/\/+$/, "").toLowerCase();

  const origin = request.headers.get("origin");
  if (origin) {
    if (!esperado) return true; // sem saber a origem esperada, não dá para confirmar — nega
    return normalizada(origin) !== normalizada(esperado);
  }

  const referer = request.headers.get("referer");
  if (referer) {
    if (!esperado) return true;
    try {
      return normalizada(new URL(referer).origin) !== normalizada(esperado);
    } catch {
      return true; // Referer malformado não prova nada — nega
    }
  }

  // Sec-Fetch-Site, Origin e Referer: os três ausentes. Ver o bloco acima.
  return true;
}
