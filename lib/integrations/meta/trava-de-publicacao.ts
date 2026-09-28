// trava-de-publicacao.ts — A TRAVA DA PUBLICAÇÃO ORGÂNICA. SERVER-ONLY.
//
// ─── O BURACO QUE ISTO FECHA (07/08/2026) ───────────────────────────────────
//
// Em 06/08/2026 a casa fechou a trava de ativos autorizados
// (`ativos-autorizados.ts`). Ela cobria TRÊS caminhos:
//
//   • leitura de anúncios      (`ads-leitura.ts`)
//   • gravação de conexão      (`connections.saveConnection`)
//   • escrita de anúncio       (`ads.ts`)
//
// E deixava o quarto de fora: **PUBLICAR NO INSTAGRAM E NO FACEBOOK**.
// `publishPost` recebia um `connectionId`, carregava o token e postava. Não
// perguntava a NINGUÉM se aquele perfil podia receber conteúdo desta casa.
//
// Isso não era teórico. Medido em produção em 07/08/2026, às 01h:
//
//   • os 6 carrosséis da Foocci estavam `scheduled` para 07/08 às 10:00 UTC,
//     com as 6 telas v4 completas e a capa como tela 1 — isto é, PRONTOS;
//   • `MetaConnection` tinha `@foocci_` (17841443818801353) `connected`, com o
//     escopo `instagram_content_publish` no token;
//   • o despertador (`instrumentation.ts` → `ligarDespertador`) roda a cada 5
//     minutos, em produção, sem condição nenhuma, e chama `publicarAgendados`.
//
// Ou seja: faltavam nove horas para a casa publicar sozinha, em nome de um
// cliente, contra a ordem explícita do CEO de que nada vai à Meta sem decisão
// dele. Ninguém teria apertado um botão. É o mesmo formato do incidente de
// 03/08 — a máquina agindo sozinha na Meta — e daquela vez custou a conta de
// anúncios da agência.
//
// ─── AS TRÊS PERGUNTAS, NESTA ORDEM ─────────────────────────────────────────
//
// 1. **ESTE PERFIL É NOSSO DE DIREITO?** O ativo tem de estar na lista que o
//    DONO marcou (`MetaAtivoAutorizado`). Mesma trava, mesmo mecanismo e mesma
//    função (`ativoAutorizado`) que a leitura e a escrita de anúncio já usam —
//    um segundo mecanismo divergiria, e o incidente voltaria pela porta que
//    ninguém está olhando.
//
// 2. **O CLIENTE DONO DESTA PEÇA APROVOU ESTA PEÇA?** Acrescentada em
//    14/08/2026. Ver o bloco da ordem do CEO logo abaixo.
//
// 3. **A CASA PUXOU O FREIO DE EMERGÊNCIA?** Pergunta diferente das duas
//    primeiras, e ela não se responde com dado de banco. Ver mais abaixo.
//
// A ordem é do mais ESPECÍFICO para o mais GERAL, de propósito: quando várias
// barram, o motivo que fala desta peça e deste perfil é mais útil ao operador
// do que "a casa está parada".
//
// ─── A PERGUNTA 2, E A ORDEM QUE A CRIOU (CEO, 14/08/2026) ──────────────────
//
//   *"Quem libera, quem aprova, são os clientes. Quem é o dono da CityJobs sou
//   eu, então eu vou aprovar. Se entrar um cliente novo, quem aprova é ele."*
//
// Até esta data a casa tinha DUAS perguntas, e a segunda era um **interruptor
// geral cego**: com `PUBLICACAO_ORGANICA=liberada`, TODA peça agendada saía
// sozinha pelo despertador de 5 minutos — aprovada ou não, vista ou não. Era o
// mesmo formato do quase-incidente narrado aqui em cima: ninguém aperta um
// botão e seis carrosséis vão ao ar.
//
// Um interruptor geral não pode ser a resposta a uma ordem que é "peça por
// peça". Ele responde *"a casa pode publicar hoje?"*; a ordem pergunta *"ESTE
// cliente liberou ESTA peça?"*. São perguntas diferentes, e a que decide agora
// é a segunda.
//
// A pergunta 2 mora em `lib/agency/esteira/aprovacao-da-peca.ts`. Ela LÊ o
// registro de aprovação que a casa já tinha (`ApprovalRequest` +
// `sourcePostIdsJson` + `reviewedBy` + `reviewedAt`) em vez de inventar um
// segundo — o cabeçalho daquele arquivo conta por quê, e por que só a decisão
// tomada no portal do cliente (`reviewedBy` começando em `client:`) conta.
//
// Ela é FAIL-CLOSED como as outras duas: sem peça identificada, sem card, com o
// banco fora do ar ou com o carimbo da agência no lugar do clique do cliente,
// **não publica**. Ausência de aprovação nunca vira permissão.
//
// ─── POR QUE A PERGUNTA 3 CONTINUA EXISTINDO (e o que ela virou) ────────────
//
// ⚠️ MUDANÇA DE PAPEL EM 14/08/2026. `PUBLICACAO_ORGANICA` **deixa de ser o
//    portão que decide** e passa a ser o **FREIO DE EMERGÊNCIA DA CASA**: a
//    alavanca que a agência puxa quando quer PARAR TUDO de uma vez, sem
//    depender de reabrir card por card. Quem autoriza uma peça é o cliente dela
//    (pergunta 2); a chave só serve para a casa poder dizer "ninguém publica
//    agora", e ela continua fail-closed — desligada, nada sai, mesmo com
//    aprovação do cliente em dia.
//
//    Por que o freio não some junto com a promoção da pergunta 2: as razões
//    abaixo são da PLATAFORMA, não do cliente. Nenhum cliente pode aprová-las, e
//    elas seguem valendo mesmo com todo card aprovado.
//
// A pergunta 1, sozinha, NÃO teria impedido a publicação das 10:00: `@foocci_`
// ESTÁ na lista de autorizados. E, mesmo assim, publicar hoje é NÃO PODE — por
// razões que a lista de ativos não conhece e nunca vai conhecer:
//
//   • O app opera em **acesso padrão**, e acesso padrão só alcança conta que a
//     casa possui ou gerencia **"e que foi adicionada ao app no Painel de
//     Apps"**. Perfil de cliente não é nenhuma das duas coisas — e atribuir o
//     ativo ao nosso Business Manager NÃO é o teste que a Meta usa.
//     (fonte: docs/plataformas/meta/fontes/instagram-insights.md:57 e
//      fontes/instagram-visao-geral.md:99-101)
//   • `instagram_content_publish` publicando em nome de terceiro exige **App
//     Review**: "se o app se destina a ser usado por pessoas sem função nele,
//     ele precisa passar pela análise". A análise não foi feita.
//     (fonte: docs/plataformas/meta/fontes/app-review-processo.md)
//   • E há um segundo portão, independente da análise: sem **verificação do
//     negócio** concluída, *"os usuários de outras empresas não poderão conceder
//     permissões a esses apps, e todos os recursos ficarão inativos"*.
//     (fonte: docs/plataformas/meta/fontes/verificacao-de-negocio.md:20)
//
//   ⚠️ CORRIGIDO EM 11/08/2026. Este bloco dizia *"o app está em modo de
//   desenvolvimento"*. **Está errado**, e o erro tem consequência prática. O
//   parecer assinado do especialista `meta` apurou que o app da casa é do tipo
//   **Business** (usa Login do Facebook para Empresas, que só aceita `config_id`
//   — `oauth.ts:31-49`), e a Meta diz com todas as letras: *"os apps de empresa
//   não têm modos e se baseiam exclusivamente em níveis de acesso"*
//   (fontes/app-review-publicacao.md:35).
//
//   Por que corrigir em vez de anotar: com o motivo errado escrito aqui, quem
//   fosse destravar procuraria o botão "ligar modo Ativo". Ou não o acharia, ou
//   — pior — o acharia, o ligaria, veria que nada mudou e concluiria que **a
//   trava é que está quebrada**. A trava está certa. A explicação é que estava.
//   • O token de hoje TEM o escopo porque quem clicou "Conectar" foi o próprio
//     CEO, que é admin do app. O escopo estar no token prova que a chamada
//     PASSARIA — não prova que ela é permitida. Foi exatamente essa confusão
//     ("a API deixou, então pode") que restringiu a conta de anúncios em 03/08.
//     (fonte: docs/plataformas/meta/fontes/termos-da-plataforma.md — a Meta
//     audita a atividade do app e pune o APP, não só a conta)
//
// Nada disso é legível a partir do banco desta casa, e nada disso é do cliente:
// é o estado da PLATAFORMA. Por isso o freio existe, e por isso ele é
// FAIL-CLOSED: ausência de decisão nunca vira permissão. Um aviso no log não
// teria segurado as 10:00 — só uma trava segura. ("Trava, não aviso.")
//
//     PUBLICACAO_ORGANICA=liberada   → o freio está SOLTO; quem decide, então,
//                                      é o cliente, peça por peça (pergunta 2)
//     (variável ausente ou qualquer  → freio PUXADO: nada vai à Meta, nem peça
//      outro valor)                    aprovada, e a recusa é dita em português
//
// ⚠️ O freio solto NÃO é autorização para publicar. Ele só devolve a decisão a
//    quem ela sempre pertenceu — o cliente. Ler `PUBLICACAO_ORGANICA=liberada`
//    como "pode publicar" é exatamente o erro que esta mudança veio desfazer.
//
// ─── AS TRÊS PROPRIEDADES, HERDADAS E NÃO REINVENTADAS ──────────────────────
//
// 1. **DERIVADA, NUNCA COMPARADA.** O dono do ativo NÃO vem do pedido HTTP nem
//    do post: vem da própria linha de `MetaConnection` cujo token vai ser
//    usado (`loadConnectionToken` já devolve `clientId` normalizado). A
//    pergunta certa é "de quem é ESTE token?", não "de quem o chamador disse".
//    Vale igual para a pergunta 2: o dono da PEÇA vem do `SocialPost`, e o
//    `postId` é a única coisa que o chamador informa — ele aponta QUAL peça, e
//    nunca quem a aprovou.
// 2. **FAIL-CLOSED.** Sem lista, sem aprovação do cliente, com o freio puxado,
//    ou com o banco fora do ar: NÃO PUBLICA. `idsAutorizados` já devolve
//    conjunto vazio em erro de banco, e `aprovacaoDaPeca` recusa em erro de
//    leitura em vez de presumir.
// 3. **NO CAMINHO ÚNICO.** A conferência mora dentro de `publishPost`, que é
//    por onde passam os dois chamadores vivos (`esteira/publicacao.ts` e
//    `app/api/meta/publish/route.ts`) e por onde passará o terceiro, escrito
//    amanhã por alguém que nunca leu este arquivo.
//    É por isso que `postId` entrou em `PublishInput` (14/08/2026) em vez de a
//    conferência de aprovação morar em `esteira/publicacao.ts`: posta ali, ela
//    cobriria o despertador e deixaria a rota manual descoberta — que é o mesmo
//    desenho que deixou PUBLICAR de fora da trava de ativos em 06/08. Chamador
//    que não sabe dizer de que peça se trata não publica, e isso é o desejado.
//
// ⛔ A RECUSA ACONTECE ANTES DE QUALQUER CHAMADA DE REDE. Não é "tenta e
//    desfaz" — publicação é irreversível, e uma tentativa recusada pela Meta
//    ainda assim conta como tentativa contra a reputação do app.
//
// ─── A PERGUNTA 2 GANHOU UMA SEGUNDA RESPOSTA (27/09/2026) ──────────────────
//
// Até hoje só o clique do cliente (`client:<nome>`) respondia "sim" à pergunta
// 2. Decisão do CEO: cada marca escolhe o PRÓPRIO modo de aprovação
// (`lib/agency/esteira/modo-de-aprovacao.ts`) — piloto automático, silêncio
// semanal/mensal, ou o master aprovando por regra em `APROVACAO_CEO`. Essas
// aprovações também gravam `ApprovalRequest` (mesma tabela, mesmo
// `sourcePostIdsJson`), mas com um carimbo PRÓPRIO (`regra-da-marca:...` ou
// `ceo:...`), nunca `client:` — carimbo que finge um clique que não aconteceu
// é a mesma mentira que o carimbo seco "cliente" já contou uma vez.
//
// `aprovacaoDaPeca` continua SEM SABER disso, de propósito: ela é a régua pura
// de "o cliente decidiu?", usada também por `prontidao-de-publicacao.ts` e
// `refazer-com-direcao.ts`, e misturar as duas perguntas ali faria QUALQUER
// leitor daquele módulo herdar uma noção de "modo da marca" que não é dele.
// A conferência do carimbo por regra mora AQUI, depois da recusa por cliente,
// porque só a trava de publicação decide "o que aceito para deixar a peça ir
// ao ar" — as outras duas perguntam coisas diferentes ("o card está pronto
// para mostrar ao cliente?", "o refazer precisa reabrir aprovação?").
//
// Continua FAIL-CLOSED: erro ao ler `Client` ou `SocialPost`, modelo ausente no
// cliente de banco (dublê de teste que não simula este caminho), carimbo cuja
// grafia a régua não reconhece, ou carimbo de um modo que NÃO é o modo em vigor
// NA DATA DA PEÇA — todos caem em "não aprovada", nunca em "deixa passar".

import { ativoAutorizado, TIPO_POR_PLATAFORMA, donoDe } from "./ativos-autorizados";
import { aprovacaoDaPeca } from "@/lib/agency/esteira/aprovacao-da-peca";
import { topDownLigado } from "@/lib/agency/top-down";
import { prisma } from "@/lib/db/client";
import { modoEmVigor, carimboValeNoModo } from "@/lib/agency/esteira/modo-de-aprovacao";

/** O parecer, no formato da casa: pode, ou não pode COM MOTIVO LEGÍVEL. */
export type ParecerDePublicacao =
  | { pode: true }
  | { pode: false; motivo: string };

/** O valor que libera. Qualquer outra coisa — inclusive vazio — barra. */
export const VALOR_QUE_LIBERA = "liberada";

/** O nome da variável, num lugar só, para o motivo poder citá-la ao operador. */
export const CHAVE_DA_DECISAO = "PUBLICACAO_ORGANICA";

/**
 * O freio de emergência da casa está SOLTO? Lê o ambiente na HORA da chamada,
 * de propósito: uma constante de módulo congelaria o valor no boot, e o freio
 * precisa valer quando alguém o puxa.
 *
 * ⚠️ Solto ≠ autorizado. Quem autoriza a peça é o cliente dela (pergunta 2).
 */
export function publicacaoOrganicaLiberada(): boolean {
  return (process.env[CHAVE_DA_DECISAO] ?? "").trim().toLowerCase() === VALOR_QUE_LIBERA;
}

/**
 * O freio está solto — pelo ambiente OU por decisão TOP DOWN registrada na
 * tela? Esta é a pergunta que o caminho de publicação faz de verdade.
 *
 * POR QUE OS DOIS, E POR QUE "OU": o TOP DOWN (`lib/agency/top-down.ts`) nasceu
 * em 15/08/2026 porque uma decisão do CEO não pode morar numa variável de
 * ambiente — lá ela não tem dono, não tem data, não tem porquê, e trocar exige
 * redeploy. A variável continua valendo como caminho de emergência de quem tem
 * o Railway e não tem a tela.
 *
 * Quando os dois falam, quem manda é quem LIBERA: um freio que ignorasse o
 * operador que acabou de soltá-lo seria uma surpresa no pior momento possível.
 *
 * Continua FAIL-CLOSED: `topDownLigado` devolve false sem linha no banco e
 * também em erro de leitura. Ausência de decisão nunca vira permissão.
 *
 * ⚠️ Solto ≠ autorizado. Quem autoriza a peça é o cliente dela (pergunta 2).
 */
export async function freioSolto(): Promise<boolean> {
  if (publicacaoOrganicaLiberada()) return true;
  return topDownLigado("publicacao_organica");
}

/** A frase da recusa pelo freio de emergência. Uma só, para a casa inteira
 *  dizer a mesma coisa — e para ela nunca virar "erro ao publicar", que faria o
 *  operador procurar defeito onde há regra. */
export const FRASE_SEM_DECISAO =
  "A publicação orgânica está PARADA nesta casa: o freio de emergência " +
  `(${CHAVE_DA_DECISAO}) está puxado, e com ele puxado nada sai — nem peça já ` +
  "aprovada pelo cliente. O freio não é quem autoriza a peça (quem autoriza é o " +
  "cliente dono dela, peça por peça); ele é a alavanca que para tudo de uma vez. " +
  "Ele está puxado porque as permissões de publicação estão em acesso PADRÃO, que " +
  "só alcança conta da própria casa — publicar no perfil de um cliente exige acesso " +
  "avançado, e acesso avançado exige App Review mais a verificação do negócio. " +
  "Publicar em nome de cliente antes disso é o que a Meta chama de automação fora " +
  "das regras. " +
  `Para soltar o freio, a casa define ${CHAVE_DA_DECISAO}=${VALOR_QUE_LIBERA} — e ainda ` +
  "assim só sai a peça que o cliente dela aprovou.";

/** A frase da recusa por ativo não autorizado. */
export function fraseAtivoNaoAutorizado(platform: string, externalId: string): string {
  return (
    `Ninguém autorizou publicar em "${externalId}" (${platform}). ` +
    "Só recebe publicação desta casa o perfil que o dono marcou — o cliente no " +
    "portal dele, a agência na tela de Integrações. Conexão existir não é " +
    "autorização: o token alcança muito mais do que foi autorizado."
  );
}

/**
 * A APROVAÇÃO É POR REGRA — dado o MODO EM VIGOR na data da peça?
 *
 * Chamada só quando `aprovacaoDaPeca` já disse "não" (o clique do cliente não
 * existe). Não reabre nenhuma das perguntas que `aprovacaoDaPeca` já fez —
 * dono da peça, existência do post — ela mesma refaz o mínimo necessário
 * porque não pode alterar aquele módulo (ver o cabeçalho: `aprovacaoDaPeca` é
 * usada por outros dois leitores que não conhecem "modo da marca").
 *
 * FAIL-CLOSED por inteiro: qualquer erro (banco fora do ar, `prisma.client`
 * ausente num dublê de teste que não simula este caminho) cai em "sem
 * aprovação por regra" — nunca em "deixa passar por não saber perguntar".
 */
async function aprovacaoPorRegraDaMarca(entrada: {
  postId: string | null | undefined;
  dono: string | null;
}): Promise<{ aprovada: true } | { aprovada: false; motivo: string | null }> {
  const postId = (entrada.postId ?? "").trim();
  if (!postId || !entrada.dono) return { aprovada: false, motivo: null };

  try {
    const post = await prisma.socialPost.findUnique({
      where: { id: postId },
      select: { id: true, clientId: true, scheduledFor: true },
    });
    // Peça inexistente, ou de outro dono: as duas já são o motivo de
    // `aprovacaoDaPeca` — não há frase melhor a acrescentar aqui.
    if (!post || post.clientId !== entrada.dono) return { aprovada: false, motivo: null };

    const cliente = await prisma.client.findUnique({
      where: { id: entrada.dono },
      select: { modoAprovacao: true, modoPendente: true, modoPendenteVigenteEm: true },
    });
    if (!cliente) return { aprovada: false, motivo: null };

    const modo = modoEmVigor(cliente, post.scheduledFor ?? new Date());

    const cards = await prisma.approvalRequest.findMany({
      where: {
        clientId: entrada.dono,
        status: "approved",
        sourcePostIdsJson: { contains: postId },
      },
      select: { reviewedBy: true, sourcePostIdsJson: true },
    });

    let carimboDeRegraQueNaoBate: string | null = null;
    for (const card of cards) {
      let ids: unknown;
      try { ids = JSON.parse(card.sourcePostIdsJson ?? "[]"); } catch { ids = []; }
      if (!Array.isArray(ids) || !ids.includes(postId)) continue;
      const carimbo = (card.reviewedBy ?? "").trim();
      if (!carimbo) continue;
      if (carimboValeNoModo(carimbo, modo)) return { aprovada: true };
      // É um carimbo de REGRA (não do cliente, que já falhou em `aprovacaoDaPeca`)
      // que existe mas não bate com o modo de hoje — guarda para a frase legível.
      if (!carimboDeRegraQueNaoBate) carimboDeRegraQueNaoBate = carimbo;
    }

    if (carimboDeRegraQueNaoBate) {
      return {
        aprovada: false,
        motivo:
          `Esta peça tem um carimbo de aprovação por regra ("${carimboDeRegraQueNaoBate}"), mas ele não ` +
          `vale no modo em vigor desta marca na data desta peça ("${modo}"). A troca de modo nunca revalida ` +
          "um carimbo antigo — o modo mudou depois que a regra aprovou, e a regra parou de valer.",
      };
    }
    return { aprovada: false, motivo: null };
  } catch {
    return { aprovada: false, motivo: null };
  }
}

/**
 * O PARECER. Chamado por `publishPost` antes de qualquer chamada de rede.
 *
 * `clientId` tem de vir da linha de conexão — nunca do post, nunca do corpo
 * HTTP. Ver a propriedade 1 no cabeçalho.
 */
export async function conferirPublicacao(entrada: {
  workspaceId: string;
  /** O DONO, derivado da `MetaConnection` cujo token será usado. */
  clientId: string | null;
  platform: string;
  externalId: string;
  /** QUAL peça (`SocialPost.id`). Aponta o que vai ao ar; nunca diz quem
   *  aprovou — isso se lê no registro de aprovação. Ausente = recusa. */
  postId?: string | null;
}): Promise<ParecerDePublicacao> {
  const { workspaceId, platform, externalId } = entrada;
  const dono = donoDe(entrada.clientId);

  // ── 1. O ativo está na lista do dono? ────────────────────────────────────
  // `user` e plataforma desconhecida não têm tipo de ativo: não se publica num
  // token, publica-se num PERFIL. Recusa, em vez de deixar passar por omissão.
  const tipo = TIPO_POR_PLATAFORMA[platform] ?? null;
  if (!tipo || tipo === "ad_account" || tipo === "whatsapp") {
    return {
      pode: false,
      motivo: `Publicação não faz sentido para "${platform}" — só Página do Facebook e conta do Instagram recebem post.`,
    };
  }
  if (!(await ativoAutorizado(workspaceId, dono, tipo, externalId))) {
    return { pode: false, motivo: fraseAtivoNaoAutorizado(platform, externalId) };
  }

  // ── 2. O CLIENTE DONO DESTA PEÇA APROVOU ESTA PEÇA? ─────────────────────
  // A pergunta do CEO (14/08/2026), e a única que decide peça por peça.
  // Fail-closed por dentro: sem `postId`, sem card, sem clique do cliente, ou
  // com o banco fora do ar, ela recusa — nunca presume.
  const aprovacao = await aprovacaoDaPeca({
    postId: entrada.postId,
    // Derivado, nunca comparado: o dono do perfil é o da conexão. Serve para a
    // aprovação cruzar "a peça é deste cliente mesmo?".
    donoDaConexao: dono,
  });
  if (!aprovacao.aprovada) {
    // ── 2b. Sem clique do cliente — mas existe carimbo por REGRA que vale no
    // modo em vigor desta marca, na data desta peça? (CEO, 27/09/2026)
    const porRegra = await aprovacaoPorRegraDaMarca({ postId: entrada.postId, dono });
    if (!porRegra.aprovada) {
      return { pode: false, motivo: porRegra.motivo ?? aprovacao.motivo };
    }
  }

  // ── 3. A casa puxou o freio de emergência? ──────────────────────────────
  // Por último de propósito: é o motivo mais GERAL. Quando ele e um dos
  // anteriores barram, "esta peça não foi aprovada" ou "este perfil não é seu"
  // dizem ao operador o que fazer; "a casa está parada" só diz que ele espere.
  if (!(await freioSolto())) {
    return { pode: false, motivo: FRASE_SEM_DECISAO };
  }

  return { pode: true };
}
