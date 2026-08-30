// A chave de IA que uma rota PÚBLICA pode gastar.
//
// O briefing (`/briefing`) e o SDR são abertos de propósito: quem preenche não
// tem login, não tem token e não sabe o workspace. Só que a conversa custa
// dinheiro — e `resolveProviderKey(provider)` SEM workspace cai num `findFirst`
// global: "a primeira chave que existir no banco". Numa base com duas agências,
// qualquer pessoa com um laço de requisições gasta a chave de uma delas,
// escolhida por ordem de inserção. É o mesmo defeito que
// `app/api/portal/transcricao/route.ts` documenta como corrigido — lá existe
// credencial (o token diz de quem é a conta); aqui não existe credencial
// nenhuma, então a única resolução honesta é a do servidor.
//
// O PRECEDENTE QUE ESTA CASA JÁ TINHA: `client-request-service.
// resolverWorkspacePublico` já resolve exatamente esta pergunta para a
// solicitação criada pelo formulário público — um workspace, é aquele; dois ou
// mais, ninguém adivinha. Seguimos o precedente com a MESMA função, para que
// briefing e chave nunca respondam coisas diferentes sobre o mesmo prospect.
//
// A diferença de destino entre os dois:
//   • a solicitação, sem workspace, NASCE ÓRFÃ (perder o briefing do prospect
//     seria pior que o nulo — a rota de admin adota depois);
//   • a chave, sem workspace, NÃO É GASTA. Dinheiro não tem adoção posterior.
// Base com um workspace (o caso de hoje): comportamento idêntico ao anterior.
// Base sem workspace nenhum: cai na env, que é do deploy e de ninguém mais.

import { chaveDoAmbiente, resolveProviderKey, type AiProvider, type ResolvedKey } from "@/lib/ai/resolve-key";
import { resolverWorkspacePublico } from "@/lib/agency/persistence/client-request-service";
import { workspaceUnico } from "@/lib/auth/posse-de-workspace";

export async function chaveDeRotaPublica(provider: AiProvider): Promise<ResolvedKey | null> {
  const workspaceId = await resolverWorkspacePublico();
  if (workspaceId) return resolveProviderKey(provider, workspaceId);

  const { ambiguo } = await workspaceUnico();
  if (ambiguo) {
    console.warn(
      `[chave-publica] mais de um workspace na base — rota pública não gasta a chave de "${provider}" ` +
      `de um inquilino escolhido por acaso. Resolva o workspace no formulário (link/subdomínio) para religar.`,
    );
    return null;
  }
  // Sem workspace nenhum na base: só a env, NUNCA o cofre. Passar por
  // `resolveProviderKey` aqui reabriria o `findFirst` global pela porta dos
  // fundos — é exatamente o caminho que esta função existe para fechar.
  return chaveDoAmbiente(provider);
}

/**
 * O PRIMEIRO PROVEDOR COM CHAVE, andando na ordem da casa — e sempre pela regra
 * desta rota, nunca pelo cofre global.
 *
 * ─── POR QUE ISTO EXISTE (24/08/2026) ───────────────────────────────────────
 *
 * O SDR falava direto com a Anthropic, com `claude-sonnet-4-6` escrito na mão
 * desde 24/06 e nunca revisto — enquanto o resto do produto já escolhia
 * provedor e modelo pela camada multi-IA. Ordem do CEO: *"nossos produtos podem
 * ser utilizados por qualquer IA"*.
 *
 * Só que ligar o SDR na camada pela porta comum reabriria o buraco que o topo
 * deste arquivo fecha: `resolveProviderKey(p)` sem workspace cai num `findFirst`
 * global, e a rota é PÚBLICA e sem sessão. Esta função é a ponte: percorre a
 * ordem de preferência da casa e resolve CADA provedor por `chaveDeRotaPublica`
 * — a mesma regra de sempre, provedor por provedor. Multi-IA de verdade, sem
 * ceder um milímetro na porta que protege a chave do inquilino.
 *
 * Devolve `null` quando nenhum provedor tem chave utilizável, que é o mesmo
 * "não gasto" de antes: dinheiro não tem adoção posterior.
 */
export async function primeiraChaveDeRotaPublica(
  ordem: readonly AiProvider[],
): Promise<{ provider: AiProvider; chave: ResolvedKey } | null> {
  for (const provider of ordem) {
    const chave = await chaveDeRotaPublica(provider);
    if (chave) return { provider, chave };
  }
  return null;
}

/**
 * DE QUEM É A CONTA de uma chamada vinda da porta pública.
 *
 * ─── POR QUE ISTO PASSOU A SER EXPORTADO (24/08/2026) ───────────────────────
 *
 * O workspace já era resolvido aqui dentro, para achar a chave — e era
 * DESCARTADO logo em seguida. Quem chamava só recebia a chave. Resultado
 * medido em produção: toda chamada de `/api/sdr/chat` logava
 * `[custo-de-ia] chamada SEM workspace, fora da conta` — o gasto da porta
 * pública não entrava na conta de ninguém, e sem conta não havia como pôr um
 * teto de GASTO (os dois freios da rota são de ritmo, e ritmo não é dinheiro).
 *
 * É a "seta faltando" de sempre: o dado existia, o consumidor existia, e
 * ninguém tinha ligado os dois. Agora liga — e é o MESMO
 * `resolverWorkspacePublico` que decide a chave e a conta, nunca duas regras
 * respondendo coisas diferentes sobre o mesmo prospect.
 *
 * `null` é resposta legítima e NÃO é licença: quem gasta em cima disto
 * (`lib/ai/teto-de-custo.ts`) trata "sem dono" como "não gasta".
 */
export async function workspaceDaRotaPublica(): Promise<string | null> {
  return (await resolverWorkspacePublico()) ?? null;
}

/**
 * TODOS OS PROVEDORES COM CHAVE, na ordem da casa — para a porta que precisa
 * de um SEGUNDO se o primeiro estiver sem saldo.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POR QUE ISTO EXISTE (cliente oculto, 8ª volta, 26/08/2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ MEDIDO EM PRODUÇÃO, no primeiro turno da jornada: `POST /api/sdr/chat`
 * devolveu `{"ok":false,"reason":"sem_saldo_no_provedor"}`. Conferido no
 * livro-caixa no mesmo minuto (07:24:54Z): *"Your credit balance is too low to
 * access the Anthropic API"*. A conta da Anthropic zerou. A da OpenAI já estava
 * zerada desde a véspera (*"You have no credits remaining"*).
 *
 * E havia Gemini com chave e funcionando na mesma base — 12 chamadas com
 * sucesso na mesma janela. **A porta da rua da agência ficou fechada para toda
 * a internet com um provedor bom parado ao lado.**
 *
 * A causa é `primeiraChaveDeRotaPublica`: ela escolhe o primeiro provedor que
 * tem CHAVE, e a conversa fica presa nele. Ter chave não é ter saldo. O resto
 * da casa não tem esse problema — `lib/ai/generate.ts` anda na ordem de
 * preferência e cai para o próximo. A porta pública, que é a ÚNICA que atende
 * quem ainda não é cliente, era a única sem essa rede.
 *
 * ── O QUE ISTO NÃO CONSERTA, E É DO CEO ────────────────────────────────────
 *
 * Conta zerada é conta zerada. Esta lista compra o próximo provedor, não crédito
 * — se todos zerarem, a porta fecha e tem de fechar. Guardrail 2: quem põe
 * saldo é o CEO, e o código só evita que UMA conta zerada derrube o que as
 * outras ainda pagam.
 */
export async function chavesDeRotaPublica(
  ordem: readonly AiProvider[],
): Promise<Array<{ provider: AiProvider; chave: ResolvedKey }>> {
  const achadas: Array<{ provider: AiProvider; chave: ResolvedKey }> = [];
  for (const provider of ordem) {
    const chave = await chaveDeRotaPublica(provider);
    if (chave) achadas.push({ provider, chave });
  }
  return achadas;
}
