// prontidao-de-publicacao.ts — POR QUE O POST NÃO SAI. SOMENTE LEITURA.
//
// ─── O BURACO QUE ISTO FECHA (14/08/2026) ───────────────────────────────────
//
// A pergunta do CEO era: *"o que falta para a agência soltar o conteúdo dos
// clientes no Instagram? Qual a trava?"* — e a casa **não tinha como responder
// sem ler onze arquivos**. As travas estão certas, cada uma no seu lugar, e é
// exatamente por isso que ninguém enxerga a fila delas: `publicarAgendados`
// barra em nove pontos, `publishPost` barra em mais um, `conferirPublicacao` em
// mais dois, e a Meta barra num décimo terceiro que não está em código nenhum.
//
// Pior: quando um post não sai, o que fica gravado é o motivo do PRIMEIRO
// portão que barrou (`SocialPost.lastError`). Consertar aquele motivo revela o
// seguinte, um deploy depois. É a depuração mais cara que existe — uma trava
// por dia — e foi assim que 08/08 se passou descobrindo, chamada a chamada
// contra a conta de um cliente, que as 36 telas eram PNG.
//
// Este módulo responde a fila INTEIRA de uma vez, sem publicar nada e sem
// depender de tentar. É o mesmo método de `permissoes-do-token.ts`: existe uma
// resposta que não é uma tentativa, e ela custa leitura.
//
// ─── O QUE ELE NÃO FAZ, DE PROPÓSITO ────────────────────────────────────────
//
//   • **Não publica, não agenda, não corrige, não escreve.** Nem no banco, nem
//     na Meta. Diagnóstico que conserta sozinho é diagnóstico em que ninguém
//     confia depois — e aqui "corrigir" significaria postar no perfil de um
//     cliente.
//   • **Não reimplementa trava nenhuma.** Cada portão abaixo CHAMA a mesma
//     função que o publicador chama (`conferirPilar`, `contratoDeMarca`,
//     `conexaoDoCliente`, `urlPublicaDaMidia`, `conferirFormatoDeMidia`,
//     `ativoAutorizado`, `publicacaoOrganicaLiberada`). Uma segunda cópia da
//     régua começaria idêntica e divergiria no primeiro ajuste — e um
//     diagnóstico que discorda do publicador é pior que nenhum, porque ele é
//     acreditado.
//   • **Não decide.** Ele diz o estado dos portões; **aprovar uma peça é ato do
//     CLIENTE**, no portal dele (ordem do CEO, 14/08/2026), soltar o freio de
//     emergência (`PUBLICACAO_ORGANICA`) é ato da casa, e o App Review continua
//     sendo processo da Meta.
//
// ─── O QUE MUDOU EM 14/08/2026 ──────────────────────────────────────────────
//
// O portão 11 dizia "Decisão do CEO (PUBLICACAO_ORGANICA)" — e passou a mentir
// no dia em que o CEO disse, com todas as letras, que *"quem libera, quem
// aprova, são os clientes"*. O que decide agora é a **aprovação do cliente,
// peça por peça**; a chave virou **freio de emergência** da casa. O diagnóstico
// acompanhou, porque relatório que descreve o modelo antigo é pior que
// relatório nenhum: ele é acreditado.
//
//   11. Aprovação do cliente          ← POR PEÇA. Quem resolve: o cliente dono.
//   12. Freio de emergência da casa   ← global. Quem resolve: a casa.
//   13. Permissões concedidas pela Meta (era 12)
//
// ─── OS TRÊS ESTADOS, NUNCA DOIS ────────────────────────────────────────────
//
// `passou` · `barrou` · `nao_medido`. O terceiro é obrigatório e é a razão de
// este arquivo não mentir: banco fora do ar, credencial ausente ou Meta
// indisponível caem nele. "Não consegui perguntar" nunca vira "está tudo bem" —
// é o guardrail 1 da casa (ausência de informação não é informação) aplicado a
// um relatório que alguém vai ler para decidir.

import { prisma } from "@/lib/db/client";
import { conferirPilar, motivoCurto } from "@/lib/agency/execution/pilares-bloqueados";
import { contratoDeMarca } from "@/lib/agency/esteira/contrato-de-marca";
import { conexaoDoCliente, loadConnectionToken } from "@/lib/integrations/meta/connections";
import { conferirFormatoDeMidia, type MidiaConferida } from "@/lib/integrations/meta/formato-de-midia";
import {
  ativoAutorizado,
  donoDe,
  TIPO_POR_PLATAFORMA,
} from "@/lib/integrations/meta/ativos-autorizados";
import {
  publicacaoOrganicaLiberada,
  CHAVE_DA_DECISAO,
  VALOR_QUE_LIBERA,
} from "@/lib/integrations/meta/trava-de-publicacao";
import { aprovacaoDaPeca } from "@/lib/agency/esteira/aprovacao-da-peca";
import {
  permissoesDoToken,
  diagnosticar,
  PARA_PUBLICAR_NO_INSTAGRAM,
} from "@/lib/integrations/meta/permissoes-do-token";
import { normalizarFormato, lerLista, linksPublicosDaMidia } from "@/lib/agency/esteira/publicacao";

/** Passou · barrou · ninguém mediu. Ver o cabeçalho: o terceiro não é enfeite. */
export type EstadoDoPortao = "passou" | "barrou" | "nao_medido";

/**
 * QUEM DESTRAVA. Existe porque um relatório que diz "falta X" sem dizer de quem
 * é a mão produz a reunião em que todo mundo espera pelo outro.
 */
export type QuemResolve =
  /** A casa resolve sozinha: é código, arquivo ou dado nosso. */
  | "casa"
  /** Só o CEO, e só no painel da Meta — não existe API para isto. */
  | "ceo_no_painel_da_meta"
  /** A casa solta (ou puxa) o freio de emergência `PUBLICACAO_ORGANICA`.
   *  Era "ceo_decide" até 14/08/2026, quando a decisão de publicar uma peça
   *  deixou de ser da casa e passou a ser do cliente dela. */
  | "freio_da_casa"
  /** Depende do cliente (reconectar a conta dele, mandar material). */
  | "cliente"
  /** Depende do cliente APROVAR a peça, no portal dele. É o portão 11 e é o
   *  modelo de aprovação da casa desde 14/08/2026 — ninguém aprova por ele. */
  | "cliente_aprova";

export interface Portao {
  /** A posição real na fila. É a ordem em que o publicador barra, não a ordem
   *  em que seria bonito contar. */
  ordem: number;
  /** O nome curto, para virar linha de tabela. */
  nome: string;
  estado: EstadoDoPortao;
  /** Em português, com a evidência dentro (guardrail 6): nunca "algo falhou". */
  motivo: string;
  quemResolve: QuemResolve;
  /** O que fazer, dito como ação — clique, comando ou arquivo. */
  comoDestravar: string;
}

export interface ProntidaoDeUmPost {
  postId: string;
  clientId: string | null;
  formato: string;
  pilar: string | null;
  agendadoPara: string | null;
  status: string;
  /** O que o publicador gravou na última tentativa. Nulo quando nunca tentou. */
  ultimoErro: string | null;
  portoes: Portao[];
  /** O PRIMEIRO portão que barra. É este que o post veria — os seguintes nem
   *  chegam a ser avaliados pelo publicador, mas são avaliados AQUI, que é o
   *  ponto do módulo. */
  primeiroQueBarra: Portao | null;
  /** `true` só quando todos passaram. Nunca `true` por ausência de evidência. */
  pronto: boolean;
}

export interface Prontidao {
  medidoEm: string;
  /** Quantos posts `scheduled` existem para este dono, tenha chegado a hora ou
   *  não. Zero aqui significa que não há o que publicar — e isso é uma resposta,
   *  não uma falha. */
  agendados: number;
  posts: ProntidaoDeUmPost[];
  /** Os portões que não dependem de post nenhum — hoje, o freio de emergência
   *  da casa. Ficam à parte para o relatório não os repetir por post.
   *  ⚠️ A aprovação do cliente NÃO mora aqui, e é o ponto do modelo novo: ela é
   *  por peça, e uma linha global mentiria sobre um consentimento individual. */
  portoesDaCasa: Portao[];
  /** A frase única, para quem não vai ler a tabela. */
  veredito: string;
}

/** Portão que não pôde ser avaliado porque o anterior já barrou o caminho —
 *  mas que AINDA ASSIM precisa aparecer, senão o relatório volta a esconder a
 *  fila. Avaliamos tudo que dá para avaliar sem depender do que faltou. */
function naoMedido(ordem: number, nome: string, porque: string, quem: QuemResolve, como: string): Portao {
  return { ordem, nome, estado: "nao_medido", motivo: porque, quemResolve: quem, comoDestravar: como };
}

function passou(ordem: number, nome: string, motivo: string, quem: QuemResolve = "casa"): Portao {
  return { ordem, nome, estado: "passou", motivo, quemResolve: quem, comoDestravar: "—" };
}

function barrou(ordem: number, nome: string, motivo: string, quem: QuemResolve, como: string): Portao {
  return { ordem, nome, estado: "barrou", motivo, quemResolve: quem, comoDestravar: como };
}

/** O nome do portão 11, num lugar só: `montarVeredito` procura por ele e um
 *  literal repetido divergiria no primeiro ajuste. */
export const NOME_DO_PORTAO_DA_APROVACAO = "Aprovação do cliente (peça por peça)";

/** O nome do portão 12, pelo mesmo motivo. */
export const NOME_DO_PORTAO_DO_FREIO = `Freio de emergência da casa (${CHAVE_DA_DECISAO})`;

/**
 * ── PORTÃO 11: A APROVAÇÃO DO CLIENTE, PEÇA POR PEÇA ────────────────────────
 *
 * A linha mais importante do relatório desde 14/08/2026. Ela era "Decisão do
 * CEO (PUBLICACAO_ORGANICA)" e passou a mentir no dia em que ele disse *"quem
 * libera, quem aprova, são os clientes"*: um interruptor geral não descreve um
 * modelo que é peça por peça.
 *
 * **NOMEIA QUEM PRECISA APROVAR.** Relatório que diz "falta aprovação" sem
 * dizer de quem é a mão produz a reunião em que todo mundo espera pelo outro —
 * e aqui a mão nunca é da casa.
 *
 * Não reimplementa nada: chama a MESMA `aprovacaoDaPeca` que `publishPost`
 * chama, com o dono derivado da MESMA forma. Uma segunda régua começaria
 * idêntica e divergiria no primeiro ajuste.
 */
export async function portaoDaAprovacaoDoCliente(
  postId: string,
  /** O dono derivado da conexão carregada — igual ao publicador. Quando não há
   *  conexão, cai no dono da própria peça: assim o portão ainda responde a
   *  pergunta que interessa (o cliente aprovou?) em vez de virar "não medi" e
   *  esconder a única linha que o cliente pode resolver. */
  donoDaConexao: string | null,
): Promise<Portao> {
  const parecer = await aprovacaoDaPeca({ postId, donoDaConexao });

  if (parecer.aprovada) {
    return passou(
      11,
      NOME_DO_PORTAO_DA_APROVACAO,
      `aprovada por ${parecer.aprovadaPor} (cliente ${parecer.clientId}) em ` +
        `${parecer.aprovadaEm.toISOString()} — registro ${parecer.approvalRequestId}.`,
      "cliente_aprova",
    );
  }

  return barrou(
    11,
    NOME_DO_PORTAO_DA_APROVACAO,
    parecer.motivo,
    "cliente_aprova",
    "A equipe abre o card das peças em POST /api/social-posts/aprovacao (elas viram UM card visível " +
      "ao cliente) e o CLIENTE DONO decide no portal dele. A decisão dele grava quem aprovou e " +
      "quando, e é isso que a trava lê. Ninguém da casa aprova no lugar dele — nem o CEO, salvo " +
      "quando ele é o dono do cliente (caso CityJobs), e ainda assim pelo portal daquele cliente.",
  );
}

/**
 * ── PORTÃO 12: O FREIO DE EMERGÊNCIA DA CASA ────────────────────────────────
 *
 * Fica em função própria porque não depende de post nenhum. Ele é a única linha
 * em que a resposta correta pode ser "está barrado E está certo que esteja".
 *
 * ⚠️ Ele NÃO autoriza peça nenhuma. Solto, apenas devolve a decisão a quem ela
 *    pertence — o cliente (portão 11). Puxado, para tudo de uma vez, inclusive
 *    peça já aprovada. Era o portão 11 e chamava-se "Decisão do CEO".
 */
export function portaoDoFreioDeEmergencia(): Portao {
  if (publicacaoOrganicaLiberada()) {
    return passou(
      12,
      NOME_DO_PORTAO_DO_FREIO,
      `O freio está SOLTO (a chave está em "${VALOR_QUE_LIBERA}"): a casa não está segurando nada. ` +
        "Quem decide cada peça, então, é o cliente dela — ver o portão 11.",
      "freio_da_casa",
    );
  }
  return barrou(
    12,
    NOME_DO_PORTAO_DO_FREIO,
    "O freio de emergência está PUXADO: nada sai desta casa, nem peça já aprovada pelo cliente. " +
      "É trava fail-closed — ausência de decisão nunca vira permissão.",
    "freio_da_casa",
    `Definir ${CHAVE_DA_DECISAO}=${VALOR_QUE_LIBERA} no Railway (Variables) e reimplantar. ` +
      "Soltar o freio NÃO publica nada sozinho: cada peça continua precisando da aprovação do " +
      "cliente dela (portão 11). Enquanto o freio estiver puxado, nenhuma chamada sai para a Meta — " +
      "e nenhuma tentativa é feita, o que é o comportamento desejado.",
  );
}

/**
 * ── PORTÃO 13: O QUE A META CONCEDEU, ATIVO POR ATIVO ───────────────────────
 * (era 12 até 14/08/2026, quando a aprovação do cliente e o freio da casa
 *  passaram a ocupar 11 e 12.)
 *
 * Este portão **não existe em código** no caminho de publicação — e é
 * justamente por isso que ele precisa existir aqui. Ele é o portão da Meta, e
 * quem o descobre pelo caminho normal o descobre TENTANDO, que é o padrão que
 * restringiu a conta da agência em 03/08.
 *
 * `debug_token` é leitura pura: não toca no perfil do cliente, não cria
 * contêiner, não publica. Custa uma chamada e responde a pergunta exata —
 * `instagram_content_publish` vale para ESTE id de Instagram?
 *
 * Só roda quando `medirNaMeta` é pedido explicitamente. Um diagnóstico que fala
 * com a Meta a cada abertura de tela vira ritmo de máquina por acidente.
 */
async function portaoDasPermissoes(
  workspaceId: string,
  connectionId: string | null,
  igId: string | null,
  medirNaMeta: boolean,
): Promise<Portao> {
  const nome = "Permissões concedidas pela Meta para este perfil";
  const comoDestravar =
    "Acesso avançado em `instagram_content_publish` exige App Review + verificação do negócio. " +
    "No painel: developers.facebook.com → app Dioli Digital Studio → Análise do app → Permissões e recursos.";

  if (!medirNaMeta) {
    return naoMedido(
      13,
      nome,
      "não medi: a medição fala com a Meta (leitura `debug_token`) e só roda quando pedida explicitamente.",
      "ceo_no_painel_da_meta",
      comoDestravar,
    );
  }
  if (!connectionId || !igId) {
    return naoMedido(
      13,
      nome,
      "não medi: sem conexão de Instagram gravada não há token para inspecionar.",
      "cliente",
      comoDestravar,
    );
  }

  const p = await permissoesDoToken(workspaceId, connectionId);
  const d = diagnosticar(p, PARA_PUBLICAR_NO_INSTAGRAM, igId);
  if (d.naoMedidas.length > 0) return naoMedido(13, nome, d.resumo, "ceo_no_painel_da_meta", comoDestravar);
  if (!d.completo) return barrou(13, nome, d.resumo, "ceo_no_painel_da_meta", comoDestravar);
  return passou(13, nome, d.resumo, "ceo_no_painel_da_meta");
}

/**
 * A FILA INTEIRA, PARA UM POST. A ordem é a de `publicarAgendados` seguida da
 * de `publishPost` → `conferirPublicacao`, e ela é copiada da leitura do código,
 * não da memória de ninguém.
 */
async function conferirPost(
  post: {
    id: string;
    workspaceId: string;
    clientId: string | null;
    pillar: string | null;
    format: string;
    caption: string;
    mediaUrl: string | null;
    mediaUrlsJson: string;
    scheduledFor: Date | null;
    status: string;
    lastError: string | null;
  },
  medirNaMeta: boolean,
): Promise<ProntidaoDeUmPost> {
  const portoes: Portao[] = [];
  const formato = normalizarFormato(post.format);
  const ehVideo = formato === "reel";

  // ── 1. Hora marcada ───────────────────────────────────────────────────────
  // Não é uma trava: é a diferença entre "não sai" e "ainda não é a hora", e
  // confundir as duas faz alguém caçar defeito onde só há calendário.
  const agora = new Date();
  portoes.push(
    !post.scheduledFor
      ? barrou(1, "Hora marcada", "o post não tem data — o relógio não o vê.", "casa",
          "Aprovar o calendário do cliente (o fluxo `aprovarCalendario`), que é quem grava a data.")
      : post.scheduledFor <= agora
        ? passou(1, "Hora marcada", `a hora já passou (${post.scheduledFor.toISOString()}): o relógio pega este post na próxima rodada.`)
        : barrou(1, "Hora marcada", `ainda não é a hora: marcado para ${post.scheduledFor.toISOString()}.`, "casa",
            "Nada a fazer — é calendário, não defeito. O relógio roda a cada 5 minutos."),
  );

  // ── 2. Pilar bloqueado ────────────────────────────────────────────────────
  const veredito = conferirPilar(post.pillar);
  portoes.push(
    veredito.bloqueado
      ? barrou(2, "Pilar de conteúdo", motivoCurto(veredito), "casa",
          "Este bloqueio cai sozinho quando existir conferência de PIXEL na imagem gerada " +
            "(`conferenciaDePixelDisponivel`). Não há variável de ambiente nem exceção por cliente, de propósito. " +
            "Enquanto não houver, a saída é publicar peças de OUTRO pilar.")
      : passou(2, "Pilar de conteúdo", post.pillar ? `pilar "${post.pillar}" não está na lista de bloqueados.` : "peça sem pilar declarado — não bloqueia."),
  );

  // ── 3. O post tem dono ────────────────────────────────────────────────────
  portoes.push(
    post.clientId
      ? passou(3, "Cliente do post", `dono: ${post.clientId}.`)
      : barrou(3, "Cliente do post", "post sem cliente — o publicador não sabe em qual perfil postar.", "casa",
          "Corrigir `SocialPost.clientId`. Post sem dono nunca sai, por construção."),
  );

  // ── 4. Marca constituída ──────────────────────────────────────────────────
  const marca = await contratoDeMarca(post.clientId).catch(() => null);
  portoes.push(
    !marca
      ? naoMedido(4, "Régua de marca", "não consegui ler a régua de marca deste cliente (banco indisponível). Fail-closed: o publicador recusa neste estado.", "casa",
          "Conferir o banco. Enquanto não ler, o post não sai — e está certo que não saia.")
      : marca.naoConstituida
        ? barrou(4, "Régua de marca", "marca NÃO constituída: o cliente não declarou nenhuma regra de marca. Publicar assim é a agência escolhendo a marca por ele.", "casa",
            "Preencher a ficha de marca do cliente (`lerFichaDeMarca` / tela de marca na ficha do cliente). " +
              "Preenchida, o post sai sozinho na passada seguinte.")
        : passou(4, "Régua de marca", `marca constituída${marca.lacunas.length > 0 ? ` (com ${marca.lacunas.length} lacuna(s) declarada(s) — não bloqueiam)` : ""}.`),
  );

  // ── 5 e 6. Conexão do Instagram ───────────────────────────────────────────
  const conexao = post.clientId
    ? await conexaoDoCliente(post.workspaceId, post.clientId, "instagram").catch(() => null)
    : null;

  if (!conexao) {
    portoes.push(
      barrou(5, "Instagram conectado", "não há conexão de Instagram gravada para este cliente.", "cliente",
        "O cliente conecta pelo portal dele (aba Conexões → Conectar Facebook/Instagram). " +
          "Sem isso não existe token, e sem token não há publicação."),
      naoMedido(6, "Token vivo", "não medi: sem conexão não há token.", "cliente", "Ver o portão 5."),
    );
  } else {
    portoes.push(passou(5, "Instagram conectado", `conexão ${conexao.id} → perfil ${conexao.externalId}.`));
    portoes.push(
      conexao.status === "connected"
        ? conexao.token
          ? passou(6, "Token vivo", `status "connected" e o token guardado abre${conexao.tokenExpiresAt ? `; vence em ${conexao.tokenExpiresAt.toISOString()}` : ""}.`)
          : barrou(6, "Token vivo", "status \"connected\", mas o token guardado NÃO abre (a chave de cifra mudou).", "cliente",
              "Reconectar a conta pelo portal do cliente — o token guardado é ilegível e não há como recuperá-lo.")
        : barrou(6, "Token vivo", `a conexão está "${conexao.status}" — token vencido ou revogado. Isto é "reconecte", não "conecte".`, "cliente",
            "O cliente refaz a conexão no portal dele. Foi exatamente este o estado de @cityjobs.sp em 07/08/2026."),
    );
  }

  // ── 7. Link público da mídia ──────────────────────────────────────────────
  // A Meta busca a mídia com os servidores DELA. Sem domínio público
  // configurado, o arquivo existe e mesmo assim não há como entregá-lo.
  const guardadas = formato === "carousel" ? lerLista(post.mediaUrlsJson) : [post.mediaUrl].filter((x): x is string => !!x);
  const resolvidas = await linksPublicosDaMidia(guardadas);
  const publicas = resolvidas.links;
  const temDominioPublico = Boolean(
    process.env.PUBLIC_BASE_URL?.trim() || process.env.RAILWAY_PUBLIC_DOMAIN?.trim(),
  );

  if (resolvidas.erro) {
    // O motivo REAL, e não o genérico "falta domínio público": foi por confundir
    // os dois que o operador procuraria a variável errada.
    portoes.push(
      barrou(7, "Mídia com link público", resolvidas.erro, "casa",
        "Definir AUTH_SECRET (ou JWT_SECRET) no ambiente — é o segredo que assina o link temporário da mídia."),
    );
  } else if (guardadas.length === 0) {
    portoes.push(
      barrou(7, "Mídia com link público", ehVideo
        ? "a peça ainda não tem vídeo."
        : "a peça ainda não tem imagem — o Instagram não aceita post só com legenda.", "casa",
        "Produzir/anexar a arte da peça. Nenhum formato do Instagram publica sem mídia."),
    );
  } else if (formato === "carousel" && publicas.length < 2) {
    portoes.push(
      barrou(7, "Mídia com link público", `só ${publicas.length} de ${guardadas.length} telas do carrossel têm link público.`, "casa",
        temDominioPublico ? "Conferir as telas que faltam." : "Definir PUBLIC_BASE_URL (ou RAILWAY_PUBLIC_DOMAIN) no ambiente — sem domínio público a Meta não alcança o arquivo."),
    );
  } else if (formato !== "carousel" && publicas.length === 0) {
    portoes.push(
      barrou(7, "Mídia com link público", "não consegui gerar link público da mídia.", "casa",
        temDominioPublico ? "Conferir o arquivo da peça." : "Definir PUBLIC_BASE_URL (ou RAILWAY_PUBLIC_DOMAIN) no ambiente."),
    );
  } else {
    portoes.push(passou(7, "Mídia com link público", `${publicas.length} arquivo(s) com link público.`));
  }

  // ── 8. Formato do arquivo (o defeito de 08/08: PNG) ───────────────────────
  const idsDaPeca = (formato === "carousel" ? lerLista(post.mediaUrlsJson) : [post.mediaUrl])
    .filter((u): u is string => !!u && u.startsWith("/api/media/"))
    .map((u) => u.split("/api/media/")[1]?.split("?")[0] ?? "")
    .filter((id) => id.length > 0);

  if (idsDaPeca.length === 0) {
    portoes.push(
      passou(8, "Formato do arquivo", "a peça não usa mídia guardada nesta casa — o publicador não confere formato neste caso."),
    );
  } else {
    const linhas = await prisma.mediaAsset
      .findMany({ where: { id: { in: idsDaPeca } }, select: { id: true, mimeType: true } })
      .catch(() => null);
    if (!linhas) {
      portoes.push(naoMedido(8, "Formato do arquivo", "banco indisponível — não consegui ler o tipo dos arquivos.", "casa", "Conferir o banco."));
    } else {
      const porId = new Map(linhas.map((l) => [l.id, l.mimeType]));
      const conferidas: MidiaConferida[] = idsDaPeca.map((id) => ({ id, mime: porId.get(id) ?? null }));
      const v = conferirFormatoDeMidia(conferidas, ehVideo);
      portoes.push(
        v.aceita
          ? passou(8, "Formato do arquivo", `${conferidas.length} arquivo(s) em formato que o Instagram aceita.`)
          : barrou(8, "Formato do arquivo", v.motivo, "casa",
              "Reprocessar a peça no formato aceito (imagem = JPEG). Foi este portão que falhou 12 vezes por hora em 08/08."),
      );
    }
  }

  // ── 9. O token da conexão abre (dentro de publishPost) ────────────────────
  const carregada = conexao ? await loadConnectionToken(post.workspaceId, conexao.id).catch(() => null) : null;
  portoes.push(
    !conexao
      ? naoMedido(9, "Token carregável pelo publicador", "não medi: não há conexão.", "cliente", "Ver o portão 5.")
      : carregada
        ? passou(9, "Token carregável pelo publicador", "`loadConnectionToken` devolveu o token e o dono derivado da própria linha.")
        : barrou(9, "Token carregável pelo publicador", "`publishPost` não conseguiu carregar esta conexão — ela some ou o token não decifra.", "cliente",
            "Reconectar a conta pelo portal do cliente."),
  );

  // ── 10. Ativo autorizado (a lista que o DONO marcou) ──────────────────────
  // A pergunta é feita com o dono DERIVADO da conexão, exatamente como
  // `conferirPublicacao` a faz. Perguntar com o `clientId` do post daria a
  // resposta certa por acaso e a errada no dia em que os dois divergissem.
  const nome10 = "Perfil na lista de ativos autorizados";
  if (!carregada) {
    portoes.push(naoMedido(10, nome10, "não medi: sem conexão carregada não há dono derivado para consultar.", "casa", "Ver os portões 5 e 9."));
  } else {
    const tipo = TIPO_POR_PLATAFORMA[carregada.platform] ?? null;
    if (!tipo || tipo === "ad_account" || tipo === "whatsapp") {
      portoes.push(barrou(10, nome10, `publicação não faz sentido para "${carregada.platform}".`, "casa", "Conferir a plataforma da conexão."));
    } else {
      const ok = await ativoAutorizado(post.workspaceId, donoDe(carregada.clientId), tipo, carregada.externalId);
      portoes.push(
        ok
          ? passou(10, nome10, `o perfil ${carregada.externalId} está na lista do dono ${donoDe(carregada.clientId) ?? "agencia"}.`)
          : barrou(10, nome10, `NINGUÉM autorizou publicar em ${carregada.externalId}. Conexão existir não é autorização — o token alcança muito mais do que foi autorizado.`, "casa",
              "O dono marca o perfil: o cliente no portal dele (aba Conexões), a agência na tela de Integrações. " +
                "Grava em `MetaAtivoAutorizado` via `/api/meta/ativos`. Lista vazia = nada liberado, por construção."),
      );
    }
  }

  // ── 11: a aprovação do cliente, DESTA peça ────────────────────────────────
  // O dono é derivado da conexão carregada, exatamente como `conferirPublicacao`
  // o faz. Sem conexão, cai no dono da própria peça — assim o portão continua
  // respondendo "o cliente aprovou?" em vez de virar "não medi" e esconder a
  // única linha do relatório que o cliente pode resolver sozinho.
  portoes.push(
    await portaoDaAprovacaoDoCliente(
      post.id,
      carregada ? donoDe(carregada.clientId) : donoDe(post.clientId),
    ),
  );

  // ── 12 e 13: o freio da casa e o portão da Meta ───────────────────────────
  portoes.push(portaoDoFreioDeEmergencia());
  portoes.push(
    await portaoDasPermissoes(post.workspaceId, conexao?.id ?? null, conexao?.externalId ?? null, medirNaMeta),
  );

  portoes.sort((a, b) => a.ordem - b.ordem);
  const primeiroQueBarra = portoes.find((p) => p.estado === "barrou") ?? null;
  const pronto = portoes.every((p) => p.estado === "passou");

  return {
    postId: post.id,
    clientId: post.clientId,
    formato,
    pilar: post.pillar,
    agendadoPara: post.scheduledFor?.toISOString() ?? null,
    status: post.status,
    ultimoErro: post.lastError,
    portoes,
    primeiroQueBarra,
    pronto,
  };
}

export interface EntradaDaProntidao {
  workspaceId: string;
  /** Nulo = todos os clientes com post agendado. */
  clientId?: string | null;
  /** Fala com a Meta (leitura `debug_token`) para medir o portão 12. */
  medirNaMeta?: boolean;
  /** Teto de posts examinados. Diagnóstico não é varredura de banco inteiro. */
  limite?: number;
}

/**
 * O DIAGNÓSTICO. Somente leitura, do começo ao fim.
 */
export async function conferirProntidao(entrada: EntradaDaProntidao): Promise<Prontidao> {
  const { workspaceId, medirNaMeta = false, limite = 20 } = entrada;
  const clientId = entrada.clientId === undefined ? undefined : donoDe(entrada.clientId);

  const posts = await prisma.socialPost
    .findMany({
      where: {
        workspaceId,
        status: "scheduled",
        ...(clientId === undefined ? {} : { clientId }),
      },
      orderBy: { scheduledFor: "asc" },
      take: limite,
    })
    .catch(() => null);

  const medidoEm = new Date().toISOString();

  if (posts === null) {
    return {
      medidoEm,
      agendados: 0,
      posts: [],
      portoesDaCasa: [portaoDoFreioDeEmergencia()],
      veredito: "NÃO MEDI: o banco não respondeu. Isto não é 'está tudo certo' nem 'está tudo errado'.",
    };
  }

  const resultados: ProntidaoDeUmPost[] = [];
  for (const p of posts) {
    resultados.push(
      await conferirPost(
        {
          id: p.id,
          workspaceId: p.workspaceId,
          clientId: p.clientId,
          pillar: p.pillar,
          format: p.format,
          caption: p.caption,
          mediaUrl: p.mediaUrl,
          mediaUrlsJson: p.mediaUrlsJson,
          scheduledFor: p.scheduledFor,
          status: p.status,
          lastError: p.lastError,
        },
        // A medição na Meta custa uma chamada POR POST. Só o primeiro mede: o
        // token e o perfil são os mesmos, e repetir seria rajada por acidente —
        // o padrão exato que restringiu a conta em 03/08.
        medirNaMeta && resultados.length === 0,
      ),
    );
  }

  const portoesDaCasa = [portaoDoFreioDeEmergencia()];

  const veredito = montarVeredito(resultados, portoesDaCasa);
  return { medidoEm, agendados: posts.length, posts: resultados, portoesDaCasa, veredito };
}

/**
 * A FRASE ÚNICA. Nomeia o portão que barra o MAIOR número de posts — que é o
 * que destrava mais com um gesto — e nunca conclui "pronto" a partir de
 * silêncio.
 */
export function montarVeredito(posts: ProntidaoDeUmPost[], portoesDaCasa: Portao[]): string {
  if (posts.length === 0) {
    const freio = portoesDaCasa.find((p) => p.nome === NOME_DO_PORTAO_DO_FREIO);
    return (
      "Não há NENHUM post agendado (`status: scheduled`) — não é trava da Meta, é que não existe o que publicar. " +
      (freio?.estado === "barrou" ? "E o freio de emergência da casa segue puxado. " : "") +
      "O cliente precisa aprovar as peças no portal dele antes — é a aprovação dele que põe a peça no calendário."
    );
  }

  const prontos = posts.filter((p) => p.pronto).length;
  if (prontos === posts.length) {
    return `Os ${posts.length} posts passam em TODOS os portões conferidos. Nada nesta casa os está segurando.`;
  }

  const contagem = new Map<string, number>();
  for (const p of posts) {
    if (p.primeiroQueBarra) contagem.set(p.primeiroQueBarra.nome, (contagem.get(p.primeiroQueBarra.nome) ?? 0) + 1);
  }
  const [nome, quantos] = [...contagem.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["—", 0];
  const exemplo = posts.find((p) => p.primeiroQueBarra?.nome === nome)?.primeiroQueBarra;

  return (
    `${prontos} de ${posts.length} posts prontos. A trava que segura mais posts (${quantos}) é: ` +
    `**${nome}** — ${exemplo?.motivo ?? ""} Resolve: ${exemplo?.quemResolve ?? "—"}.`
  );
}
