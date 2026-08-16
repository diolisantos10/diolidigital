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
// devolve `false` (não bloqueia) nesse caso.
//
// ── ISTO FOI MEDIDO EM 16/08/2026, NÃO SÓ DECLARADO ─────────────────────────
// Duas vezes este risco foi escrito como "aceito e declarado" — aqui e na
// descrição do teste unitário irmão — e as duas vezes por leitura da spec do
// Fetch Metadata, nunca por um navegador batendo num servidor. Prova
// executável: `__tests__/security/guarda-de-origem-no-navegador.test.ts`.
// Instrumento: Chromium 141.0.7390.37 (Playwright, /opt/pw-browsers), dois
// servidores locais em origens DIFERENTES de verdade (127.0.0.1 × localhost —
// cross-site medido, não suposto), cookie idêntico ao desta casa
// (`dioli_portal`, httpOnly, SameSite=Lax).
//
// O QUE A MEDIÇÃO ACHOU (11 variações de navegação, servidor-eco):
//   • `Sec-Fetch-Site` chegou em TODOS os 11 casos — inclusive quando o
//     atacante zera o Referer com `rel="noreferrer"`, ele continua
//     "cross-site". É o único sinal que a página que navega não forja nem
//     apaga, e é por isso que só ele decide aqui.
//   • `Origin` NUNCA apareceu — em NENHUM dos 11 casos, same-origin ou
//     cross-site. Uma guarda para esta fresta (GET de navegação) baseada em
//     `Origin` não teria uma única vez para ler.
//   • `Referer` É suprimível pelo atacante (`rel=noreferrer` zera o Referer e
//     o Sec-Fetch-Site continua cross-site) — por isso ele não é o sinal em
//     que este helper confia.
//   • O cookie `SameSite=Lax` desta casa CHEGA nas quatro formas de
//     navegação de TOPO cross-site medidas — link (com ou sem
//     `rel=noreferrer`, mesma mecânica), `<meta refresh>`, form GET e
//     `location.href` — a fresta que este helper fecha é real, não teórica.
//   • Em `<img src>`, `fetch` no-cors e `<iframe>` cross-site o cookie Lax
//     NÃO chega — nesses casos o próprio `SameSite=Lax` do cookie já resolve
//     sozinho; não é este helper que segura ali, e ele não precisa segurar.
// ── CONTRA A ROTA REAL (não mais servidor-eco) ──────────────────────────────
// A afirmação acima ("11 variações, servidor-eco") não fala do handler desta
// casa — fala de um `node:http` que ecoa cabeçalhos. Isso ficou DECLARADO como
// "contra a rota real" numa rodada anterior sem nunca ter importado a rota.
// Corrigido em 16/08/2026: `__tests__/security/guarda-de-origem-na-rota-real.test.ts`
// importa o `GET` de verdade de `app/api/portal/messages/route.ts` e alimenta
// com os conjuntos de cabeçalhos EXATOS capturados do navegador (Chromium
// 141.0.7390.37) — não com `Sec-Fetch-Site` isolado. Prisma MOCKADO (não é
// banco de verdade rodando; é o handler de verdade, com a camada de dados
// substituída, igual ao resto da suíte desta casa):
//   • com os três primeiros conjuntos da tabela (URL digitada, navegação
//     interna, fetch do SPA) a rota chama `updateMany` — marca como lida;
//   • com os três últimos (link cruzado, link `rel=noreferrer`, `<meta
//     refresh>` cruzado) `updateMany` NÃO é chamado, e a rota continua
//     devolvendo 200 com as mensagens — a leitura não regride, só a marcação
//     como lida é pulada.
// NENHUMA REGRESSÃO OPERACIONAL MEDIDA: abrir o portal a partir do link do
// e-mail é navegação cruzada até a PÁGINA, mas o fetch que a SPA dispara
// depois de carregada sai como `same-origin` — o legítimo não é barrado.
//
// A LACUNA QUE FICA, DITA E NÃO ESCONDIDA: só há Chromium instalado nesta
// máquina (/opt/pw-browsers) — sem WebKit nem Firefox, o caso "navegador sem
// Fetch Metadata" (Safari < 16.4 de verdade) NÃO foi reproduzido em
// NAVEGADOR, só como cliente HTTP que não manda o cabeçalho. Fechar essa
// lacuna de verdade exige `npx playwright install webkit` (ou um Safari
// real) rodando o mesmo roteiro contra os dois servidores.
//
// Com a medição por trás, continua sendo risco aceito, não descoberto agora:
// navegador legado já não tinha proteção nenhuma antes deste arquivo existir,
// e negar por padrão quebraria a leitura legítima para todo mundo que também
// não manda o cabeçalho. Fail-open aqui é FAIL-OPEN DA MUTAÇÃO OPCIONAL,
// nunca do acesso — quem chama continua exigindo sessão ou token válidos por
// fora deste helper.
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
// faixa 1 — os únicos chamadores são o NAVEGADOR e as rotas de segredo/
// assinatura (CRON_SECRET, PILOTO_SECRET, HMAC), que entram por um caminho
// que nem chama esta função — ver cada rota da faixa 1 para a bifurcação.
//
// "O navegador manda `Origin` em todo POST, same-origin inclusive" ERA
// afirmação de memória — a mesma distância entre spec e prática que produziu
// a rodada de medição inteira. AGORA ESTÁ MEDIDA (16/08/2026, Chromium
// 141.0.7390.37, login REAL `master@dioli.studio` contra
// `/api/portal/messages/suggest`, ver `guarda-de-origem-na-rota-real.test.ts`):
// um POST same-origin disparado pela própria SPA chegou com `Sec-Fetch-Site:
// same-origin` E `Origin: http://localhost:3001` PRESENTE e correto.
//
// ── O CONTRASTE QUE A MEDIÇÃO ESTABELECEU, E POR QUE AS DUAS FUNÇÕES SÃO
// DIFERENTES ─────────────────────────────────────────────────────────────
// `Origin` NÃO chega em GET de navegação — 0 de 11 casos medidos (ver acima).
// `Origin` CHEGA em POST same-origin — medido agora, não suposto. É por isso
// que `ehNavegacaoCrossSite` (que só existe para cobrir GET) NÃO PODE usar
// `Origin` como sinal — não teria uma vez para ler — e `deveBloquearMutacaoCrossSite`
// PODE: para POST, `Origin` é um sinal que o navegador de fato manda, e cai
// para ele quando `Sec-Fetch-Site` está ausente (Safari < 16.4, ou requisição
// fora de navegador).
//
// Fail-open no caso 4 (os três ausentes) protegeria exatamente nada: é o
// navegador sem Fetch Metadata E sem Origin/Referer (praticamente inexistente
// hoje) que esta trava existe para cobrir, e ausência total dos três é o
// padrão de uma requisição forjada por ferramenta (curl, script), não de um
// navegador real navegando este site. Achado explícito, não escondido:
// ferramentas internas desta casa que chamam rotas guardadas por cookie sem
// mandar nenhum dos três cabeçalhos passam a receber 403 daqui em diante —
// ver `scripts/percurso-da-esteira.mts` (o alcance medido é maior do que só
// `scripts/pilot-test.mts`, que este comentário citava antes). CONSERTA-SE A
// FERRAMENTA, NUNCA A GUARDA: é o preço da faixa 1 pago no lugar certo —
// ferramenta interna se ajusta uma vez; produção não fica exposta para
// sempre.
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
