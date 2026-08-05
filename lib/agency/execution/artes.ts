// artes.ts — O DESIGN PASSA A PRODUZIR IMAGEM, NÃO DESCRIÇÃO DE IMAGEM.
//
// O buraco: `design-engine.ts` — gerador de imagem, pronto, funcionando, com
// fallback de modelo e tudo — não tinha um único chamador na esteira de
// produção. O departamento de Design entregava TEXTO descrevendo o que uma
// peça deveria ser ("fundo escuro, tipografia serifada, o pão em close").
// Bonito de ler e impossível de postar: o Instagram exige mídia em todo
// formato, então cada post ficava parado esperando uma imagem que ninguém
// produzia. A agência vendia arte e entregava briefing de arte.
//
// ── A VIRADA DE 05/08/2026: O MODELO FAZ FOTO, O CÓDIGO FAZ LAYOUT ──────────
//
// Diagnóstico do CEO, fechado e aprovado: pedir a PEÇA INTEIRA ao `gpt-image-1`
// entrega foto, não design — e modelo de imagem erra letra. Foi por isso que
// os 36 criativos do lançamento da Foocci foram montados à mão em HTML e
// rasterizados. Agora aquele trabalho manual é o motor: `lib/agency/design/`.
//
// A produção passou a ter DUAS CAMADAS:
//   • FOTO  → `generateDesign` (cenário, luz, textura). Continua igual, e o
//     prompt continua PROIBINDO letra: a tipografia não é dela.
//   • TEXTO, COR, MARGEM e ASSINATURA → HTML rasterizado pelo Chromium que a
//     casa já usa. A letra sai do rasterizador de fonte, e é conferida contra o
//     DOM antes de virar arquivo (`lib/agency/design/renderizar.ts`).
//
// ── O QUE CONTINUA VALENDO DO CABEÇALHO ANTIGO ──────────────────────────────
//
// A proibição antiga tinha DUAS razões. A primeira ("modelo erra letra") o
// molde fecha por construção. A segunda NÃO se resolve sozinha e continua de pé
// palavra por palavra: "preço, telefone e prazo dentro de um pixel escapam do
// piso de verdade, que lê texto e não enxerga imagem". Por isso todo texto que
// vira pixel passa pela trava de `lib/agency/design/trava-de-texto.ts`, que
// exige (a) trecho LITERAL do conteúdo já auditado e (b) nenhuma classe de fato
// perigosa. Reprovou? A peça sai só com a foto — nunca com texto que ninguém
// consegue conferir.

import { prisma } from "@/lib/db/client";
import { generateDesign } from "@/lib/ai/design-engine";
import { guardarArquivo, lerArquivo } from "@/lib/agency/media/armazenamento";
import { estiloVisualPersistido, estiloVistoPersistido } from "@/lib/agency/execution/leitura-do-cliente";
import { moldeDoCliente, formatoDoPost, type Molde } from "@/lib/agency/design/molde";
import { montarPeca } from "@/lib/agency/design/peca";
import { tituloDaFonte } from "@/lib/agency/design/trava-de-texto";

/** Quantas artes por rodada. Cada uma é uma chamada cara de modelo de imagem —
 *  um calendário de 12 posts custaria 12 de uma vez se não houvesse teto. */
const MAX_ARTES_POR_RODADA = 6;

/** Depois disto, a peça para de tentar sozinha. Modelo de imagem falha por
 *  motivos que não melhoram com insistência (conteúdo recusado, conta sem
 *  acesso), e cada tentativa custa. */
const MAX_TENTATIVAS_POR_PECA = 3;

/**
 * ── O TETO DIÁRIO DE IMAGENS POR CLIENTE ────────────────────────────────────
 *
 * O teto por rodada (6) não é teto de gasto: esta rodada dispara a cada 5
 * minutos, e 6 × 288 rodadas = **1.728 gerações pagas por dia** se as peças
 * continuarem voltando. O teto por PEÇA (3 tentativas) fecha o caso de uma peça
 * teimosa; este fecha o caso de MUITAS peças teimosas, de um bug novo que
 * ninguém previu e do carrossel que multiplica por tela.
 *
 * Por que 40, e não 12 nem 500: um mês inteiro de conteúdo desta casa são 6 a 8
 * posts, com 1 a 2 carrosséis de até 6 telas — na conta mais cara, ~25 imagens.
 * 40 cabe o mês inteiro produzido num único dia (é o que acontece quando o
 * pacote é aprovado) mais folga para refação, e ainda assim corta o desastre em
 * ~43×. Acima de 40 num dia não é produção: é laço.
 *
 * É teto de SEGURANÇA, não orçamento comercial — orçamento por cliente e por
 * contrato ainda não existe nesta casa, e este número não o substitui.
 */
const MAX_IMAGENS_POR_CLIENTE_POR_DIA = 40;

/** Teto de telas de um carrossel. Cada tela é UMA geração paga — carrossel de
 *  12 telas custa 12 imagens. O contrato de saída do especialista (3 a 6) é
 *  conferido em `especialistas.ts`; aqui é o cinto, porque a peça pode ter
 *  nascido antes daquela trava existir. */
const MAX_TELAS_POR_CARROSSEL = 6;

export interface ArtesFeitas {
  produzidas: number;
  falhas: Array<{ postId: string; erro: string }>;
  /** Peças que desistiram — precisam de gente ou de material do cliente. */
  desistiram: string[];
  /** Peças que NÃO foram tentadas porque o cliente bateu o teto diário de
   *  imagens. Não é falha da peça e não gasta tentativa — volta amanhã. */
  semOrcamento: string[];
}

/**
 * Produz a arte que falta nos posts já agendados.
 *
 * Só toca em post SEM mídia. Post com foto do cliente não é sobrescrito: a foto
 * real da padaria dele vale mais que qualquer imagem gerada, e trocá-la seria a
 * agência decidindo que sabe melhor.
 */
export async function produzirArtesPendentes(): Promise<ArtesFeitas> {
  const saida: ArtesFeitas = { produzidas: 0, falhas: [], desistiram: [], semOrcamento: [] };

  const pendentes = await prisma.socialPost.findMany({
    where: { mediaUrl: null, status: { in: ["draft", "scheduled", "approved"] } },
    // `mediaUrl: null` cobre o carrossel também: ele só recebe a capa quando
    // TODAS as telas ficam prontas, então um carrossel pela metade continua
    // aparecendo como pendente na rodada seguinte.
    orderBy: { scheduledFor: "asc" },
    take: MAX_ARTES_POR_RODADA,
  }).catch(() => []);
  if (pendentes.length === 0) return saida;

  // O estilo visual observado no feed REAL do cliente. SÓ da síntese
  // persistida (leitura-do-cliente.ts) — esta rodada dispara a cada 5 minutos
  // pelo despertador, e bater na Graph aqui seria rajada no rate limit da
  // Meta. Sem síntese fresca, vazio — e vazio é vazio: o prompt não menciona
  // o feed. Memoizado por CLIENTE para não repetir a consulta a cada peça.
  //
  // A chave é `clientId`, não `clientRequestId`: o post de cliente DIRETO nasce
  // com clientRequestId nulo (publicacao.ts), e chavear pela solicitação
  // devolvia "" para sempre — em silêncio, sem erro e sem teste vermelho —
  // justamente no cliente-piloto, que é o único criado direto.
  const estilosDoFeed = new Map<string, string>();
  const estiloDoFeedDe = async (clientId: string | null): Promise<string> => {
    if (!clientId) return "";
    if (!estilosDoFeed.has(clientId)) {
      estilosDoFeed.set(clientId, await estiloVisualPersistido(clientId).catch(() => ""));
    }
    return estilosDoFeed.get(clientId) ?? "";
  };

  // O que a VISÃO viu nas imagens do feed — vocabulário fechado, gravado pela
  // leitura do cliente. Mesmo caminho do de cima: só o persistido, nunca uma
  // chamada de visão aqui. Visão custa por imagem, e esta rodada dispara a cada
  // 5 minutos — uma chamada aqui multiplicaria a fatura pelo relógio.
  const estilosVistos = new Map<string, string>();
  const estiloVistoDe = async (clientId: string | null): Promise<string> => {
    if (!clientId) return "";
    if (!estilosVistos.has(clientId)) {
      estilosVistos.set(clientId, await estiloVistoPersistido(clientId).catch(() => ""));
    }
    return estilosVistos.get(clientId) ?? "";
  };

  const orcamento = abrirOrcamentoDoDia();

  for (const post of pendentes) {
    const tentativas = contarTentativas(post.lastError);

    // ── REEL: o vídeo do CLIENTE, editado ────────────────────────────────────
    // Gerar imagem estática e publicá-la como reel entregaria algo que ele não
    // comprou. O que a casa faz é EDITAR o material bruto que ele mandou — que
    // até 02/08/2026 ficava parado no armazenamento, sem ninguém tocar.
    if (post.format === "reel" || post.format === "video") {
      if (tentativas >= MAX_TENTATIVAS_POR_PECA) { saida.desistiram.push(post.id); continue; }
      const r = await montarReel(post);
      if (r.ok) { saida.produzidas++; continue; }
      saida.falhas.push({ postId: post.id, erro: r.erro });
      if (r.semMaterial) {
        // Não é falha da máquina: falta material do cliente. Gastar tentativa
        // aqui esgotaria o teto esperando algo que só ele pode resolver.
        saida.desistiram.push(post.id);
        await marcarErro(post.id, `aguardando vídeo do cliente — ${r.erro}`, null);
      } else {
        await marcarErro(post.id, r.erro, tentativas + 1);
      }
      continue;
    }

    if (tentativas >= MAX_TENTATIVAS_POR_PECA) {
      saida.desistiram.push(post.id);
      continue;
    }

    // ── O TETO DIÁRIO, ANTES DE QUALQUER CHAMADA PAGA ───────────────────────
    // Conferido aqui e não dentro do gerador porque o que custa é a CHAMADA:
    // depois dela o dinheiro já saiu, independentemente do que aconteça com os
    // bytes.
    const disponivel = await orcamento.restam(post.clientId);
    if (disponivel.erro) {
      // Não deu para ler o contador. Fail-CLOSED de propósito: um teto de gasto
      // que se desliga sozinho quando o banco tosse não é teto. A peça volta na
      // rodada seguinte e NÃO gasta tentativa — não foi ela que falhou.
      saida.falhas.push({ postId: post.id, erro: `não consegui conferir o teto diário de imagens (${disponivel.erro}) — a peça fica para a próxima rodada` });
      continue;
    }
    if (disponivel.restam <= 0) {
      saida.semOrcamento.push(post.id);
      continue;
    }

    const marca = await lerMarca(post.clientId);
    const estiloDoFeed = await estiloDoFeedDe(post.clientId);
    const estiloVisto = await estiloVistoDe(post.clientId);

    // ── CARROSSEL: uma arte POR TELA ─────────────────────────────────────────
    // Gerar uma imagem só e repetir seria entregar cinco vezes a mesma coisa.
    // Cada tela é uma ideia, e a arte tem que acompanhar a ideia dela.
    if (post.format === "carousel" || post.format === "carrossel") {
      const r = await montarCarrossel(post, marca, estiloDoFeed, estiloVisto, disponivel.restam);
      // O gasto conta ANTES do veredito: imagem gerada é imagem paga, mesmo que
      // o carrossel inteiro tenha sido descartado depois.
      orcamento.gastar(post.clientId, r.gerou);
      if (r.ok) { saida.produzidas++; continue; }
      saida.falhas.push({ postId: post.id, erro: r.erro });
      if (r.semOrcamento) {
        // O carrossel não cabe no que sobrou hoje. Não é falha da peça: gastar
        // tentativa aqui esgotaria o teto por causa do relógio.
        saida.semOrcamento.push(post.id);
        continue;
      }
      await marcarErro(post.id, r.erro, tentativas + 1);
      continue;
    }

    // Story é VERTICAL. Gerar quadrado e publicar como story corta a peça no
    // meio — e o cliente vê o próprio conteúdo mutilado no perfil dele.
    const proporcao = post.format === "story" ? "portrait" : "square";

    const r = await generateDesign({
      prompt: montarPrompt({
        legenda: post.caption,
        pilar: post.pillar,
        negocio: marca.nome,
        segmento: marca.segmento,
        cores: marca.cores,
        tom: marca.tom,
        formato: post.format,
        estiloDoFeed,
        estiloVisto,
      }),
      size: proporcao,
      quality: "high",
      workspaceId: post.workspaceId,
    }).catch((e) => ({ ok: false as const, error: e instanceof Error ? e.message : "erro" }));
    // A chamada saiu: o dinheiro saiu junto, deu certo ou não.
    orcamento.gastar(post.clientId, 1);

    if (!r.ok || !r.url) {
      const erro = r.error ?? "o gerador de imagem não devolveu nada";
      saida.falhas.push({ postId: post.id, erro });
      await marcarErro(post.id, erro, tentativas + 1);
      continue;
    }

    // ── DAQUI PARA BAIXO A IMAGEM JÁ FOI PAGA ───────────────────────────────
    // Todo caminho de saída GASTA TENTATIVA. Não é zelo: o `continue` sem
    // `marcarErro` era um vazamento de dinheiro puro — `contarTentativas` nunca
    // subia, `MAX_TENTATIVAS_POR_PECA` nunca era atingido, e a peça voltava na
    // rodada seguinte (a cada 5 minutos, para sempre) gerando uma imagem paga
    // por rodada sem NUNCA entregar nada.
    const bytes = await baixarImagem(r.url).catch(() => null);
    if (!bytes) {
      const erro = "não consegui baixar a imagem gerada";
      saida.falhas.push({ postId: post.id, erro });
      await marcarErro(post.id, erro, tentativas + 1);
      continue;
    }

    // ── A FOTO É GUARDADA À PARTE ───────────────────────────────────────────
    // Custa um arquivo a mais por peça, e paga isso na primeira correção de
    // texto: com o fundo em disco, trocar a chamada da arte é rasterização
    // local (≈1s), não uma chamada nova e paga ao modelo de imagem.
    const fundo = await guardarArquivo({
      bytes,
      fileName: nomeDoFundo(post.id),
      mimeType: "image/png",
      workspaceId: post.workspaceId,
      clientId: post.clientId,
      clientRequestId: post.clientRequestId,
      kind: "generated",
      uploadedBy: "design",
    });
    if (!fundo.ok) {
      saida.falhas.push({ postId: post.id, erro: fundo.motivo });
      await marcarErro(post.id, fundo.motivo, tentativas + 1);
      continue;
    }

    // ── A CAMADA DE TEXTO, POR CÓDIGO ───────────────────────────────────────
    const composta = await comporComMolde({
      formato: formatoDoPost(post.format),
      molde: marca.molde,
      fotoBytes: bytes,
      fonteAuditada: post.caption,
      selo: post.pillar,
      assinatura: marca.nome,
      indice: null,
    });

    // Guardada no MESMO lugar que o material do cliente: um só armazenamento,
    // uma só cota, um só link assinado que a Meta consegue buscar.
    const guardado = await guardarArquivo({
      bytes: composta.bytes,
      fileName: `arte-${post.id}.png`,
      mimeType: "image/png",
      workspaceId: post.workspaceId,
      clientId: post.clientId,
      clientRequestId: post.clientRequestId,
      kind: "generated",
      uploadedBy: "design",
    });
    if (!guardado.ok) {
      saida.falhas.push({ postId: post.id, erro: guardado.motivo });
      await marcarErro(post.id, guardado.motivo, tentativas + 1);
      continue;
    }

    await prisma.socialPost.update({
      where: { id: post.id },
      // A nota do molde NÃO gasta tentativa (não casa com o padrão "[arte n/"):
      // peça sem camada de texto é peça entregue, não peça falhada. O que ela
      // não pode é sair sem alguém saber que saiu assim.
      data: { mediaUrl: `/api/media/${guardado.arquivo.id}`, lastError: composta.nota },
    });
    saida.produzidas++;
  }

  return saida;
}

// ─── Internos ───────────────────────────────────────────────────────────────

/**
 * O orçamento de imagens do dia, por cliente.
 *
 * O contador NÃO mora na memória do processo — essa é a lição do teto de ritmo
 * da Meta, que vale N× com N instâncias no ar e zera a cada deploy. Ele é
 * DERIVADO do banco: cada geração paga vira exatamente um arquivo `fundo-*`
 * guardado, então contar esses arquivos de hoje é contar as gerações de hoje.
 *
 * O gasto da rodada corrente é somado localmente porque os arquivos só
 * aparecem depois — a rodada não pode furar o próprio teto enquanto grava.
 *
 * Resíduo declarado: a geração que falha ANTES de salvar o fundo (download
 * caído) sai do bolso e não entra na contagem do banco. É limitada pelas 3
 * tentativas por peça, e por isso não vira laço.
 */
interface OrcamentoDeImagens {
  restam(clientId: string | null): Promise<{ restam: number; erro?: string }>;
  gastar(clientId: string | null, quantas: number): void;
}

const SEM_CLIENTE = "__sem_cliente__";

function abrirOrcamentoDoDia(): OrcamentoDeImagens {
  const lidoDoBanco = new Map<string, number | "erro">();
  const gastoNestaRodada = new Map<string, number>();
  const inicioDoDia = new Date();
  inicioDoDia.setHours(0, 0, 0, 0);

  return {
    async restam(clientId) {
      const chave = clientId ?? SEM_CLIENTE;
      if (!lidoDoBanco.has(chave)) {
        const n = clientId
          ? await prisma.mediaAsset.count({
              where: {
                clientId,
                kind: "generated",
                fileName: { startsWith: "fundo-" },
                createdAt: { gte: inicioDoDia },
              },
            }).catch(() => "erro" as const)
          : 0;
        lidoDoBanco.set(chave, n);
      }
      const jaHoje = lidoDoBanco.get(chave)!;
      if (jaHoje === "erro") return { restam: 0, erro: "o contador do dia não pôde ser lido" };
      return { restam: MAX_IMAGENS_POR_CLIENTE_POR_DIA - jaHoje - (gastoNestaRodada.get(chave) ?? 0) };
    },
    gastar(clientId, quantas) {
      if (quantas <= 0) return;
      const chave = clientId ?? SEM_CLIENTE;
      gastoNestaRodada.set(chave, (gastoNestaRodada.get(chave) ?? 0) + quantas);
    },
  };
}

/** Quantas vezes esta peça já falhou. O contador mora no próprio `lastError`
 *  para não inventar mais uma coluna que um dia diverge do que aconteceu. */
function contarTentativas(lastError: string | null): number {
  const m = lastError?.match(/^\[arte (\d+)\//);
  return m ? Number(m[1]) : 0;
}

interface MarcaDaPeca {
  nome: string;
  segmento: string;
  cores: string[];
  tom: string;
  /** O molde DESTE cliente — a mesma cara em toda peça, de todo formato.
   *  Sem marca definida, vem o molde NEUTRO, declarado como tal. */
  molde: Molde;
}

async function lerMarca(clientId: string | null): Promise<MarcaDaPeca> {
  const vazio: MarcaDaPeca = { nome: "", segmento: "", cores: [], tom: "", molde: moldeDoCliente(null) };
  if (!clientId) return vazio;
  const c = await prisma.client.findUnique({
    where: { id: clientId },
    select: { name: true, industry: true, brandBrain: true },
  }).catch(() => null);
  if (!c) return vazio;
  const b = c.brandBrain;
  return {
    nome: c.name ?? "",
    segmento: c.industry ?? "",
    cores: [b?.primaryColor, b?.secondaryColor].filter((v): v is string => !!v),
    tom: b?.tone ?? "",
    // O molde nasce do BrandBrain e SÓ dele. Cliente sem cor cadastrada recebe
    // o neutro — a agência não escolhe a cor da marca de ninguém.
    molde: moldeDoCliente(b ?? null),
  };
}

/** O nome do arquivo da FOTO de uma peça. Fixo por post (e por tela, no
 *  carrossel) porque é a chave do re-render barato. */
export function nomeDoFundo(postId: string, tela?: number): string {
  return tela ? `fundo-${postId}-${tela}.png` : `fundo-${postId}.png`;
}

interface PedidoDeComposicao {
  formato: ReturnType<typeof formatoDoPost>;
  molde: Molde;
  fotoBytes: Buffer;
  /** O MIME real da foto. Declarar errado faz o navegador desenhar nada — e a
   *  peça sairia com o fundo chapado sem ninguém entender por quê. */
  fotoMime?: string;
  /** O conteúdo já auditado de onde o texto tem de ser trecho literal. */
  fonteAuditada: string;
  selo: string | null;
  assinatura: string;
  indice: { atual: number; total: number } | null;
}

/**
 * Põe a camada de texto sobre a foto — e degrada DECLARANDO.
 *
 * Devolve sempre bytes publicáveis. Quando o molde não pode ser aplicado (sem
 * Chromium, texto sem lastro, texto que não cabe), o que volta é a FOTO PURA,
 * que é exatamente o que o motor antigo entregava, mais uma `nota` dizendo por
 * quê. Nunca volta peça com texto que a trava reprovou.
 */
async function comporComMolde(p: PedidoDeComposicao): Promise<{ bytes: Buffer; nota: string | null }> {
  // ── O MOLDE NEUTRO PRECISA SER DECLARADO PARA FORA ────────────────────────
  // Até a 7ª auditoria, `origem: "neutro"` e `lacunas` não tinham um único
  // consumidor fora de teste: o cliente sem marca recebia a peça cinza e nada —
  // nem `lastError`, nem portal, nem log — dizia que aquele cinza era AUSÊNCIA
  // de marca. Vazio declarado só é declarado se alguém lê a declaração.
  const avisoDeNeutro =
    p.molde.origem === "neutro"
      ? `[molde neutro] esta peça saiu SEM a identidade do cliente (cinza padrão, não a marca dele). Falta no cadastro: ${p.molde.lacunas.join(", ") || "cor primária da marca"}.`
      : null;
  const comAviso = (nota: string | null): string | null =>
    [avisoDeNeutro, nota].filter(Boolean).join(" ").slice(0, 480) || null;

  const titulo = tituloDaFonte(p.fonteAuditada);
  if (!titulo) {
    return { bytes: p.fotoBytes, nota: comAviso("[molde] peça entregue só com a foto: o conteúdo não tem uma frase utilizável como chamada.") };
  }

  const r = await montarPeca({
    formato: p.formato,
    molde: p.molde,
    fundoBytes: p.fotoBytes,
    fundoMime: p.fotoMime ?? "image/png",
    titulo,
    selo: p.selo,
    assinatura: p.assinatura,
    indice: p.indice,
    fonteAuditada: p.fonteAuditada,
  }).catch((e) => ({ ok: false as const, motivo: "erro_do_navegador" as const, erro: e instanceof Error ? e.message : "erro" }));

  if (!r.ok) {
    // Sem camada de texto o molde nem foi aplicado — o aviso de neutro não
    // descreveria esta peça, e uma nota que descreve o que não aconteceu é
    // ruído. Aqui vale só o motivo real.
    return {
      bytes: p.fotoBytes,
      nota: `[molde] peça entregue só com a foto (sem camada de texto): ${r.motivo} — ${r.erro}`.slice(0, 480),
    };
  }
  if (r.textoRecusado.length > 0) {
    // Aconteceu o caminho bom: a peça SAIU, e o que a trava barrou está dito.
    const barrado = r.textoRecusado.map((t) => `${t.papel}: ${t.detalhe}`).join(" · ");
    return { bytes: r.bytes, nota: comAviso(`[molde] texto barrado pela trava — ${barrado}`) };
  }
  return { bytes: r.bytes, nota: comAviso(null) };
}

/**
 * Re-render de TEXTO, sem tocar no gerador de imagem.
 *
 * A foto já está no armazenamento (`fundo-<postId>.png`), então trocar a
 * chamada da peça é rasterização local — a diferença entre corrigir uma arte e
 * comprar outra. É o caminho para o "muda essa frase" do cliente.
 *
 * Nunca lança. Só funciona se o fundo daquela peça existir: sem ele, a peça
 * teria de ser gerada de novo, e essa decisão (que custa) não é desta função.
 */
export async function reRenderizarTexto(
  postId: string,
  novoTitulo: string,
): Promise<{ ok: boolean; erro?: string; mediaUrl?: string }> {
  const post = await prisma.socialPost.findUnique({ where: { id: postId } }).catch(() => null);
  if (!post) return { ok: false, erro: "peça não encontrada" };

  const fundo = await prisma.mediaAsset.findFirst({
    where: { fileName: nomeDoFundo(postId), workspaceId: post.workspaceId },
    orderBy: { createdAt: "desc" },
  }).catch(() => null);
  if (!fundo) return { ok: false, erro: "a foto original desta peça não está guardada — o re-render exigiria gerar a imagem de novo" };

  const bytes = await lerArquivo(fundo.storagePath);
  if (!bytes) return { ok: false, erro: "a foto original não está mais no armazenamento" };

  const marca = await lerMarca(post.clientId);
  const r = await montarPeca({
    formato: formatoDoPost(post.format),
    molde: marca.molde,
    fundoBytes: Buffer.from(bytes),
    fundoMime: "image/png",
    titulo: novoTitulo,
    selo: post.pillar,
    assinatura: marca.nome,
    // O texto novo continua tendo de ser trecho literal da legenda auditada.
    // Sem isso, o re-render vira a porta dos fundos por onde qualquer frase
    // entraria na arte sem passar por auditoria nenhuma.
    fonteAuditada: post.caption,
  }).catch((e) => ({ ok: false as const, motivo: "erro_do_navegador" as const, erro: e instanceof Error ? e.message : "erro" }));
  if (!r.ok) return { ok: false, erro: `${r.motivo} — ${r.erro}` };
  if (r.textoRecusado.length > 0) {
    return { ok: false, erro: `texto recusado pela trava — ${r.textoRecusado.map((t) => t.detalhe).join(" · ")}` };
  }

  const guardado = await guardarArquivo({
    bytes: r.bytes,
    fileName: `arte-${postId}.png`,
    mimeType: "image/png",
    workspaceId: post.workspaceId,
    clientId: post.clientId,
    clientRequestId: post.clientRequestId,
    kind: "generated",
    uploadedBy: "design",
  });
  if (!guardado.ok) return { ok: false, erro: guardado.motivo };

  const mediaUrl = `/api/media/${guardado.arquivo.id}`;
  // O re-render também declara o molde neutro: a peça saiu com o cinza padrão,
  // não com a marca do cliente, e limpar o `lastError` apagaria essa notícia.
  const nota =
    marca.molde.origem === "neutro"
      ? `[molde neutro] esta peça saiu SEM a identidade do cliente. Falta no cadastro: ${marca.molde.lacunas.join(", ") || "cor primária da marca"}.`.slice(0, 480)
      : null;
  await prisma.socialPost.update({ where: { id: postId }, data: { mediaUrl, lastError: nota } });
  return { ok: true, mediaUrl };
}

/**
 * A peça montada sobre a FOTO DO PRÓPRIO CLIENTE.
 *
 * A foto real dele ganha de qualquer imagem gerada — é a mesma regra que já
 * vale para vídeo em `montarReel`. O que esta função NÃO faz é adivinhar qual
 * foto vai em qual post: quem passa o `mediaAssetId` é quem decidiu.
 *
 * Isso é deliberado e vem de uma lição cara desta casa (auditoria de
 * 04/08/2026, `scripts/backfill-carrossel-foocci.mjs`): "sobra não é evidência
 * de correspondência". Casar arquivo com peça por ordem ou por sobra montou
 * carrossel com o logo e com material bruto dentro. Enquanto não existir um
 * vínculo explícito entre `SocialPost` e `MediaAsset` no banco, a escolha é de
 * gente — e o automático continua gerando a foto.
 */
export async function montarArteComFotoDoCliente(
  postId: string,
  mediaAssetId: string,
): Promise<{ ok: boolean; erro?: string; mediaUrl?: string }> {
  const post = await prisma.socialPost.findUnique({ where: { id: postId } }).catch(() => null);
  if (!post) return { ok: false, erro: "peça não encontrada" };

  const asset = await prisma.mediaAsset.findUnique({ where: { id: mediaAssetId } }).catch(() => null);
  if (!asset) return { ok: false, erro: "arquivo não encontrado" };
  // Posse conferida no servidor: arquivo de outro workspace não vira peça deste.
  if (asset.workspaceId !== post.workspaceId) return { ok: false, erro: "esse arquivo não é deste workspace" };
  if (!asset.mimeType.startsWith("image/")) return { ok: false, erro: "esse arquivo não é uma imagem" };

  const bytes = await lerArquivo(asset.storagePath);
  if (!bytes) return { ok: false, erro: "o arquivo não está mais no armazenamento" };

  const marca = await lerMarca(post.clientId);
  const composta = await comporComMolde({
    formato: formatoDoPost(post.format),
    molde: marca.molde,
    fotoBytes: Buffer.from(bytes),
    fotoMime: asset.mimeType,
    fonteAuditada: post.caption,
    selo: post.pillar,
    assinatura: marca.nome,
    indice: null,
  });

  const guardado = await guardarArquivo({
    bytes: composta.bytes,
    fileName: `arte-${postId}.png`,
    mimeType: "image/png",
    workspaceId: post.workspaceId,
    clientId: post.clientId,
    clientRequestId: post.clientRequestId,
    kind: "generated",
    uploadedBy: "design",
  });
  if (!guardado.ok) return { ok: false, erro: guardado.motivo };

  const mediaUrl = `/api/media/${guardado.arquivo.id}`;
  await prisma.socialPost.update({ where: { id: postId }, data: { mediaUrl, lastError: composta.nota } });
  return { ok: true, mediaUrl };
}

/**
 * O prompt da arte.
 *
 * A legenda entra como ASSUNTO — o que a cena mostra — nunca como texto a ser
 * desenhado. E a proibição de tipografia é repetida de propósito: modelos de
 * imagem inserem letra por conta própria mesmo sem pedir.
 */
export function montarPrompt(input: {
  legenda: string;
  pilar: string | null;
  negocio: string;
  segmento: string;
  cores: string[];
  tom: string;
  formato?: string;
  /** O estilo visual OBSERVADO no feed real do cliente (síntese persistida de
   *  leitura-do-cliente.ts). Vazio quando o feed não foi lido — e aí o prompt
   *  simplesmente não menciona feed nenhum: estilo não se inventa. */
  estiloDoFeed?: string;
  /** O que a IA de VISÃO viu NAS IMAGENS do feed — vocabulário fechado
   *  (paleta, enquadramento, luz), nunca frase livre. Entra rotulado como
   *  "visto nas imagens" para não se confundir com o que foi lido em legenda:
   *  são duas evidências diferentes, e o gerador precisa saber qual é qual. */
  estiloVisto?: string;
}): string {
  const vertical = input.formato === "story";
  const partes = [
    `Fotografia publicitária profissional para redes sociais, formato ${vertical ? "vertical 9:16 (story de celular)" : "quadrado"}, alta qualidade.`,
    input.segmento ? `Negócio: ${input.segmento}${input.negocio ? ` (${input.negocio})` : ""}.` : "",
    input.pilar ? `Tema da peça: ${input.pilar}.` : "",
    `Cena a retratar: ${input.legenda.slice(0, 500)}`,
    input.cores.length > 0 ? `Paleta da marca, para a ambientação e os objetos: ${input.cores.join(", ")}.` : "",
    input.tom ? `Clima: ${input.tom}.` : "",
    // A peça nova precisa parecer do MESMO perfil que as que já estão lá —
    // é o pedido literal do CEO ("os nossos carrosséis têm a ver com os que
    // eles fizeram lá?").
    input.estiloDoFeed ? `Estilo visual observado no feed real deste cliente — a peça deve pertencer à mesma família visual, sem copiar nenhum post: ${input.estiloDoFeed}` : "",
    input.estiloVisto ? `Leitura das IMAGENS do feed real deste cliente (paleta, enquadramento e luz efetivamente vistos): ${input.estiloVisto}. Siga esta direção fotográfica.` : "",
    // O molde escreve por cima da faixa de baixo — e elemento fixo obriga
    // espaço reservado (DESIGN.md). Sem isto, a IA compõe o assunto exatamente
    // onde o título vai entrar, e a peça sai com texto sobre o rosto do pão.
    "COMPOSIÇÃO OBRIGATÓRIA: deixe o terço INFERIOR da imagem visualmente calmo — fundo, sombra ou superfície lisa —, sem assunto importante ali. Esse espaço é reservado para a tipografia, que é aplicada depois.",
    vertical
      // Story é lido de celular na mão, em segundos, e o topo e a base ficam
      // sob os elementos da interface do Instagram.
      ? "Assunto centralizado no terço do meio, com margem generosa em cima e embaixo. Iluminação natural, composição limpa."
      : "Iluminação natural, composição limpa, espaço negativo para respiro.",
    // Repetido de propósito — ver o cabeçalho do arquivo.
    "IMPORTANTE: a imagem NÃO pode conter nenhum texto, letra, número, palavra, logotipo, marca d'água, placa ou etiqueta escrita. Apenas a cena visual, sem tipografia de nenhum tipo.",
  ];
  return partes.filter(Boolean).join(" ");
}

async function baixarImagem(url: string): Promise<Buffer | null> {
  // O gpt-image-1 devolve base64 embutido; o dall-e-3 devolve URL hospedada.
  if (url.startsWith("data:")) {
    const base64 = url.split(",")[1];
    return base64 ? Buffer.from(base64, "base64") : null;
  }
  const res = await fetch(url);
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Monta o reel a partir do vídeo que o CLIENTE mandou.
 *
 * `semMaterial: true` distingue as duas naturezas de falha, e a distinção
 * importa: sem vídeo, nenhuma tentativa a mais resolve — quem resolve é ele.
 * Contar isso como tentativa esgotaria o teto esperando algo que a máquina não
 * pode produzir.
 */
async function montarReel(post: {
  id: string; workspaceId: string; clientId: string | null; clientRequestId: string | null;
}): Promise<{ ok: boolean; erro: string; semMaterial?: boolean }> {
  // O material bruto do cliente: vídeo que ELE enviou e que ainda não virou peça.
  const bruto = await prisma.mediaAsset.findFirst({
    where: {
      kind: "inbound",
      mimeType: { startsWith: "video/" },
      OR: [
        ...(post.clientId ? [{ clientId: post.clientId }] : []),
        ...(post.clientRequestId ? [{ clientRequestId: post.clientRequestId }] : []),
      ],
    },
    orderBy: { createdAt: "desc" },
  }).catch(() => null);

  if (!bruto) {
    return { ok: false, semMaterial: true, erro: "o cliente ainda não enviou nenhum vídeo para editarmos" };
  }

  const bytes = await lerArquivo(bruto.storagePath);
  if (!bytes) return { ok: false, erro: "o vídeo do cliente não está mais no armazenamento" };

  const { editarParaReel } = await import("@/lib/agency/media/video");
  const editado = await editarParaReel(bytes);
  if (!editado.ok || !editado.bytes) {
    return { ok: false, erro: editado.erro ?? "não consegui editar o vídeo" };
  }

  const guardado = await guardarArquivo({
    bytes: editado.bytes,
    fileName: `reel-${post.id}.mp4`,
    mimeType: "video/mp4",
    workspaceId: post.workspaceId,
    clientId: post.clientId,
    clientRequestId: post.clientRequestId,
    kind: "generated",
    uploadedBy: "design",
  });
  if (!guardado.ok) return { ok: false, erro: guardado.motivo };

  await prisma.socialPost.update({
    where: { id: post.id },
    data: { mediaUrl: `/api/media/${guardado.arquivo.id}`, lastError: null },
  });
  return { ok: true, erro: "" };
}

/** Grava a falha de forma legível. `tentativa` nulo = não gasta o teto — a
 *  causa está fora do alcance da máquina. */
async function marcarErro(postId: string, erro: string, tentativa: number | null): Promise<void> {
  const texto = tentativa === null
    ? erro
    : `[arte ${tentativa}/${MAX_TENTATIVAS_POR_PECA}] ${erro}`;
  await prisma.socialPost.update({
    where: { id: postId },
    data: { lastError: texto.slice(0, 500) },
  }).catch(() => { /* best-effort */ });
}

/**
 * Monta as artes de um carrossel — uma por tela.
 *
 * Tudo ou nada: se uma tela falhar, NADA é gravado. Um carrossel com buracos
 * publica uma sequência que perde o sentido no meio, e é pior do que não
 * publicar. Por isso as artes só são amarradas ao post quando todas existem.
 */
async function montarCarrossel(
  post: { id: string; workspaceId: string; clientId: string | null; clientRequestId: string | null; caption: string; pillar: string | null; scenesJson?: string },
  marca: MarcaDaPeca,
  estiloDoFeed = "",
  estiloVisto = "",
  orcamentoRestante = Number.POSITIVE_INFINITY,
): Promise<{ ok: boolean; erro: string; gerou: number; semOrcamento?: boolean }> {
  let cenas: string[] = [];
  try {
    const v = JSON.parse(post.scenesJson ?? "[]");
    if (Array.isArray(v)) cenas = v.filter((x): x is string => typeof x === "string");
  } catch { /* corrompido = sem cenas */ }

  if (cenas.length < 2) return { ok: false, erro: "o carrossel não tem telas descritas para desenhar", gerou: 0 };
  // Uma tela = uma imagem paga. Carrossel fora do formato é conta de multiplicar
  // errada, e a hora de descobrir é ANTES da primeira chamada.
  if (cenas.length > MAX_TELAS_POR_CARROSSEL) {
    return { ok: false, gerou: 0, erro: `o carrossel veio com ${cenas.length} telas e o teto é ${MAX_TELAS_POR_CARROSSEL} — cada tela é uma imagem paga` };
  }
  if (cenas.length > orcamentoRestante) {
    return {
      ok: false, gerou: 0, semOrcamento: true,
      erro: `este carrossel precisa de ${cenas.length} imagens e o cliente só tem ${Math.max(0, orcamentoRestante)} no teto de hoje`,
    };
  }

  const urls: string[] = [];
  /** O que o molde não conseguiu fazer, tela a tela. Vira `lastError` legível —
   *  sem gastar tentativa: o carrossel SAIU, e o que faltou está dito. */
  const notas: string[] = [];
  /** Imagens efetivamente PAGAS. Sai junto do veredito porque o carrossel é
   *  tudo-ou-nada: pode falhar na tela 5 tendo pago 5. */
  let gerou = 0;
  for (const [i, cena] of cenas.entries()) {
    const r = await generateDesign({
      prompt: montarPrompt({
        // A CENA é o assunto, não a legenda: a legenda é a mesma para o
        // carrossel inteiro, e usá-la geraria N variações da mesma imagem.
        legenda: cena,
        pilar: post.pillar,
        negocio: marca.nome,
        segmento: marca.segmento,
        cores: marca.cores,
        tom: marca.tom,
        // O carrossel também é 4:5 no molde — o quadrado é o que o gerador
        // devolve, e o corte acontece no `background-size: cover` do molde.
        estiloDoFeed,
        estiloVisto,
      }),
      size: "square",
      quality: "high",
      workspaceId: post.workspaceId,
    }).catch(() => ({ ok: false as const, url: undefined }));
    gerou++;

    if (!r.ok || !r.url) return { ok: false, gerou, erro: `não consegui gerar a tela ${i + 1} de ${cenas.length}` };

    const bytes = await baixarImagem(r.url).catch(() => null);
    if (!bytes) return { ok: false, gerou, erro: `não consegui baixar a tela ${i + 1}` };

    // A foto de CADA tela fica guardada — é o que faz o re-render de texto de
    // uma tela isolada custar rasterização em vez de uma imagem nova.
    await guardarArquivo({
      bytes,
      fileName: nomeDoFundo(post.id, i + 1),
      mimeType: "image/png",
      workspaceId: post.workspaceId,
      clientId: post.clientId,
      clientRequestId: post.clientRequestId,
      kind: "generated",
      uploadedBy: "design",
    }).catch(() => null);

    // ── A MESMA CARA DA TELA 1 ATÉ A TELA 6 ────────────────────────────────
    // Todas as telas nascem do MESMO `molde` (marca.molde) e do mesmo layout;
    // o que muda é a foto, a frase e o índice. Era exatamente isto que não
    // existia quando cada tela era um prompt novo para o modelo de imagem.
    const composta = await comporComMolde({
      formato: "carrossel",
      molde: marca.molde,
      fotoBytes: bytes,
      // A CENA é o conteúdo auditado desta tela — a legenda é do post inteiro.
      fonteAuditada: cena,
      selo: i === 0 ? post.pillar : null,
      assinatura: marca.nome,
      indice: { atual: i + 1, total: cenas.length },
    });
    if (composta.nota) notas.push(`tela ${i + 1}: ${composta.nota}`);

    const g = await guardarArquivo({
      bytes: composta.bytes,
      fileName: `carrossel-${post.id}-${i + 1}.png`,
      mimeType: "image/png",
      workspaceId: post.workspaceId,
      clientId: post.clientId,
      clientRequestId: post.clientRequestId,
      kind: "generated",
      uploadedBy: "design",
    });
    if (!g.ok) return { ok: false, gerou, erro: g.motivo };
    urls.push(`/api/media/${g.arquivo.id}`);
  }

  await prisma.socialPost.update({
    where: { id: post.id },
    data: {
      mediaUrlsJson: JSON.stringify(urls),
      // A capa também vai em `mediaUrl`: é o que o portal mostra como miniatura.
      mediaUrl: urls[0],
      lastError: notas.length > 0 ? notas.join(" | ").slice(0, 480) : null,
    },
  });
  return { ok: true, erro: "", gerou };
}
