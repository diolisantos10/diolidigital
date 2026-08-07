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
import type { MotivoDeFalhaDeRender } from "@/lib/agency/design/renderizar";
import { tituloDaFonte } from "@/lib/agency/design/trava-de-texto";
import { cerebroDaMarca } from "@/lib/agency/design/repertorio-registrado";
import {
  composicaoParaFuncao, direcaoDeAmplitude, type CerebroCriativo, type Composicao,
} from "@/lib/agency/design/repertorio";
import {
  conferirStoryboard, direcaoDaImagem, laudoDoStoryboard, lerStoryboard,
  REGUA_CARROSSEL_DE_VENDA, type ReguaDeStoryboard, type TelaDoStoryboard,
} from "@/lib/agency/design/storyboard";
import { createHash } from "node:crypto";

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
    // Molde impossível por falta de ferramenta = a peça não existe. Falha
    // contada como falha, com tentativa gasta, e NADA gravado no post.
    if (!composta.ok) {
      saida.falhas.push({ postId: post.id, erro: composta.erro });
      await marcarErro(post.id, composta.erro, tentativas + 1);
      continue;
    }

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
  /** O CÉREBRO CRIATIVO desta marca: repertório (peça + razão), amplitude
   *  declarada e formatos com régua própria. Marca sem cérebro registrado
   *  recebe o cérebro VAZIO com as lacunas ditas — nunca o de outra marca. */
  cerebro: CerebroCriativo;
}

async function lerMarca(clientId: string | null): Promise<MarcaDaPeca> {
  const vazio: MarcaDaPeca = {
    nome: "", segmento: "", cores: [], tom: "",
    molde: moldeDoCliente(null),
    cerebro: cerebroDaMarca(null),
  };
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
    // O cérebro é achado pelo NOME da marca. Marca desconhecida recebe o vazio
    // declarado; emprestar o repertório de um cliente a outro seria dar a
    // identidade de um a outro.
    cerebro: cerebroDaMarca(c.name),
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
  /** A composição escolhida pelo cérebro criativo a partir do papel da tela.
   *  Ausente = `foto-cheia`, o layout histórico. */
  composicao?: Composicao | null;
}

/** Falha de INFRAESTRUTURA do rasterizador: não há navegador, ou ele quebrou.
 *  Não é característica do conteúdo — é a casa sem a ferramenta montada. */
const MOTIVOS_DE_INFRA: ReadonlySet<MotivoDeFalhaDeRender> = new Set([
  "sem_navegador",
  "erro_do_navegador",
  "timeout",
]);

/**
 * Põe a camada de texto sobre a foto.
 *
 * ── POR QUE ISTO NÃO DEGRADA MAIS QUANDO FALTA NAVEGADOR ────────────────────
 *
 * Esta função devolvia SEMPRE bytes publicáveis: sem Chromium, saía a foto pura
 * com uma `nota`. Parecia degradação declarada e era FAIL-OPEN — porque a nota
 * ia para `lastError`, que ninguém lê antes de publicar, enquanto a peça seguia
 * para o portal e para o perfil do cliente sem o molde da marca.
 *
 * E a falta de navegador não é um caso raro: até 07/08/2026 o `playwright`
 * morava em `devDependencies`, então em produção ele NUNCA existiu. O resultado
 * é que TODA peça de TODO cliente saiu como foto crua de IA, e o sistema
 * relatou isso como sucesso, peça por peça.
 *
 * Por isso a separação abaixo, que é a regra da casa "configuração faltando =
 * porta FECHADA":
 *
 *   • INFRA (sem navegador, navegador quebrado, timeout) → `ok: false`. A peça
 *     NÃO é gravada e NÃO é publicada. A causa sobe nomeada, e quem chamou
 *     trata como falha de verdade — do mesmo jeito que já trata "não consegui
 *     gerar a foto". Ferramenta faltando é problema da agência, não um
 *     entregável de qualidade menor para o cliente pagante.
 *
 *   • CONTEÚDO (não há frase utilizável, o texto não cabe, a trava reprovou a
 *     letra) → segue a degradação declarada: foto + `nota`. Aqui o molde falhou
 *     por causa do MATERIAL, o texto errado nunca chega à arte, e a peça sem
 *     chamada continua sendo uma peça. Mudar isto é decisão de produto, com
 *     alcance maior — está anotado em `docs/pendencias.md` para o CEO decidir.
 */
type ResultadoDaComposicao =
  | { ok: true; bytes: Buffer; nota: string | null }
  | { ok: false; motivo: MotivoDeFalhaDeRender; erro: string };

async function comporComMolde(p: PedidoDeComposicao): Promise<ResultadoDaComposicao> {
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
    return { ok: true, bytes: p.fotoBytes, nota: comAviso("[molde] peça entregue só com a foto: o conteúdo não tem uma frase utilizável como chamada.") };
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
    composicao: p.composicao ?? null,
  }).catch((e) => ({ ok: false as const, motivo: "erro_do_navegador" as const, erro: e instanceof Error ? e.message : "erro" }));

  if (!r.ok) {
    // PORTA FECHADA. Sem a ferramenta, não sai peça — nem "peça pior".
    if (MOTIVOS_DE_INFRA.has(r.motivo)) {
      return {
        ok: false,
        motivo: r.motivo,
        erro:
          r.motivo === "sem_navegador"
            ? "não há Chromium para rasterizar o molde neste ambiente — a peça NÃO foi gravada. " +
              "Confira `playwright` em `dependencies` e o pacote `chromium` em `railpack.json → deploy.aptPackages`."
            : `o rasterizador do molde falhou (${r.motivo}) — a peça NÃO foi gravada: ${r.erro}`,
      };
    }
    // Falha de CONTEÚDO: o molde não coube nesta letra. A peça sai como foto,
    // declarando o motivo — o texto reprovado nunca chega à arte.
    return {
      ok: true,
      bytes: p.fotoBytes,
      nota: `[molde] peça entregue só com a foto (sem camada de texto): ${r.motivo} — ${r.erro}`.slice(0, 480),
    };
  }
  if (r.textoRecusado.length > 0) {
    // Aconteceu o caminho bom: a peça SAIU, e o que a trava barrou está dito.
    const barrado = r.textoRecusado.map((t) => `${t.papel}: ${t.detalhe}`).join(" · ");
    return { ok: true, bytes: r.bytes, nota: comAviso(`[molde] texto barrado pela trava — ${barrado}`) };
  }
  return { ok: true, bytes: r.bytes, nota: comAviso(null) };
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
  if (!composta.ok) return { ok: false, erro: composta.erro };

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
  /**
   * O que a IMAGEM DESTA TELA precisa mostrar, derivado do PAPEL que ela cumpre
   * na história (`direcaoDaImagem`).
   *
   * É a virada de 07/08/2026: até aqui todas as telas de um carrossel recebiam
   * a mesma direção fotográfica e mudavam só o assunto — por isso a imagem era
   * fundo, e não argumento. Vazio quando o papel não é conhecido; vazio é
   * vazio, e o prompt não menciona papel nenhum.
   */
  papelDaTela?: string;
  /** Os extremos DECLARADOS da marca (`direcaoDeAmplitude`). Vazio quando a
   *  marca não tem amplitude registrada — a agência não inventa os extremos
   *  permitidos da marca de um cliente. */
  amplitude?: string;
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
    // O papel vem antes da amplitude de propósito: ele diz O QUE a imagem tem
    // de provar, e a amplitude só diz em que registro provar.
    input.papelDaTela ? `FUNÇÃO DESTA TELA NA HISTÓRIA — a imagem precisa MOSTRAR isto, e não servir de fundo bonito: ${input.papelDaTela}` : "",
    input.amplitude ? input.amplitude : "",
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

  // ── O STORYBOARD, ANTES DE QUALQUER CHAMADA PAGA ──────────────────────────
  //
  // "Tem carrosséis que têm duas imagens e as imagens ficam sendo repetidas.
  // Não contam história de acordo com o texto, só são imagens." (CEO,
  // 07/08/2026). A conferência mora AQUI, e não depois da produção, por dois
  // motivos que puxam para o mesmo lado: (a) uma tela é uma imagem paga, então
  // reprovar antes economiza o carrossel inteiro; (b) o defeito é de ROTEIRO,
  // e roteiro não melhora depois que a foto já existe.
  //
  // Vem DEPOIS das contagens acima de propósito: contar telas é mais barato que
  // conferir história, e um carrossel de 12 telas precisa ouvir "o teto é 6",
  // que é o conserto real, e não uma reclamação de roteiro.
  //
  // A régua vem do CÉREBRO DA MARCA, não deste arquivo. Marca sem formato
  // registrado cai na régua do carrossel de venda, que é a que a casa conhece.
  const regua: ReguaDeStoryboard =
    marca.cerebro.formatos.find((f) => f.regua.funcoesPermitidas.includes("gancho"))?.regua
    ?? REGUA_CARROSSEL_DE_VENDA;
  const formatoId = marca.cerebro.formatos.find((f) => f.regua.id === regua.id)?.id ?? null;
  const roteiro = conferirStoryboard(lerStoryboard(cenas), regua);
  if (!roteiro.ok) {
    // NÃO gasta imagem (`gerou: 0`): insistir não conserta um roteiro que
    // repete tela. Quem conserta é o especialista de conteúdo, reescrevendo as
    // cenas — e o laudo diz exatamente qual tela e por quê.
    return { ok: false, gerou: 0, erro: laudoDoStoryboard(roteiro).slice(0, 460) };
  }

  const urls: string[] = [];
  /** O que o molde não conseguiu fazer, tela a tela. Vira `lastError` legível —
   *  sem gastar tentativa: o carrossel SAIU, e o que faltou está dito. */
  const notas: string[] = [];
  /** Imagens efetivamente PAGAS. Sai junto do veredito porque o carrossel é
   *  tudo-ou-nada: pode falhar na tela 5 tendo pago 5. */
  let gerou = 0;
  /** As telas COM a identidade da imagem que saiu. É a segunda metade da trava:
   *  a primeira confere o roteiro, esta confere o que virou pixel. */
  const telasProduzidas: TelaDoStoryboard[] = [];
  for (const [i, tela] of roteiro.telas.entries()) {
    const cena = tela.descricao;
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
        // ── O QUE FAZ A IMAGEM SER O ARGUMENTO ────────────────────────────
        // A direção da foto vem do PAPEL que esta tela cumpre, não da legenda
        // do post. É o que separa "imagem de fundo" de "imagem argumento": a
        // tela de tensão pede o custo visível, a de mecanismo pede a
        // engrenagem em operação. Papel desconhecido devolve string vazia, e
        // aí o prompt simplesmente não fala disso.
        papelDaTela: direcaoDaImagem(tela.funcao),
        amplitude: direcaoDeAmplitude(marca.cerebro),
      }),
      size: "square",
      quality: "high",
      workspaceId: post.workspaceId,
    }).catch(() => ({ ok: false as const, url: undefined }));
    gerou++;

    if (!r.ok || !r.url) return { ok: false, gerou, erro: `não consegui gerar a tela ${i + 1} de ${cenas.length}` };

    const bytes = await baixarImagem(r.url).catch(() => null);
    if (!bytes) return { ok: false, gerou, erro: `não consegui baixar a tela ${i + 1}` };

    // A IDENTIDADE DA IMAGEM. Hash dos bytes: duas telas com o mesmo hash são,
    // literalmente, a mesma imagem publicada duas vezes — o defeito que o CEO
    // apontou. Conferido AQUI, dentro do laço, para não pagar as telas
    // restantes de um carrossel que já está reprovado.
    const impressao = createHash("sha256").update(bytes).digest("hex");
    const jaUsada = telasProduzidas.find((t) => t.imagem === impressao);
    if (jaUsada) {
      return {
        ok: false, gerou,
        erro: `[storyboard] REPROVADO — as telas ${jaUsada.ordem} e ${i + 1} saíram com A MESMA IMAGEM. Imagem repetida é a prova de que aquela tela não tinha função própria; o carrossel não foi gravado.`.slice(0, 460),
      };
    }
    telasProduzidas.push({ ...tela, imagem: impressao });

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

    // ── A MESMA MARCA DA TELA 1 À TELA 6, SEM SEREM A MESMA TELA ───────────
    //
    // Todas as telas nascem do MESMO `molde` (marca.molde): cor, tipografia e
    // assinatura são as mesmas, e é isso que faz a peça pertencer ao conjunto.
    // O que MUDA agora é a COMPOSIÇÃO, escolhida pelo cérebro criativo a partir
    // do papel desta tela — porque uma composição só, repetida seis vezes, foi
    // exatamente o que produziu as 36 telas iguais da Foocci.
    //
    // Sem repertório para aquele papel, `escolha` é `null` e a tela cai no
    // `foto-cheia` histórico — DECLARANDO que caiu, em vez de a agência
    // escolher um layout "que combina" pelo cliente.
    const escolha = composicaoParaFuncao(marca.cerebro, tela.funcao, formatoId);
    if (!escolha) {
      notas.push(
        `tela ${i + 1}: sem entrada de repertório para o papel "${tela.funcao ?? "(não declarado)"}" — saiu na composição base (foto cheia).`,
      );
    }
    const composicao: Composicao = escolha?.composicao ?? "foto-cheia";
    const composta = await comporComMolde({
      formato: "carrossel",
      molde: marca.molde,
      fotoBytes: bytes,
      // A CENA é o conteúdo auditado desta tela — a legenda é do post inteiro.
      fonteAuditada: cena,
      selo: i === 0 ? post.pillar : null,
      assinatura: marca.nome,
      indice: { atual: i + 1, total: cenas.length },
      composicao,
    });
    // Uma tela sem molde contamina o carrossel inteiro: o cliente receberia um
    // carrossel meio com marca, meio foto crua. Falta de ferramenta derruba a
    // peça toda, não gera meia peça.
    if (!composta.ok) return { ok: false, gerou, erro: composta.erro };
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

  // ── A SEGUNDA CONFERÊNCIA: O ROTEIRO CONTRA O QUE VIROU PIXEL ─────────────
  //
  // A primeira rodou sobre a intenção; esta roda sobre o resultado, com a
  // identidade real de cada imagem preenchida. Parece redundante e não é: entre
  // as duas existe o gerador de imagem, que é justamente a peça que pode
  // devolver a mesma foto para duas cenas diferentes. Reprovar aqui custa as
  // imagens já pagas e evita o carrossel repetido no perfil do cliente — que é
  // o dano que não volta atrás.
  const conferenciaFinal = conferirStoryboard(telasProduzidas, regua);
  if (!conferenciaFinal.ok) {
    return { ok: false, gerou, erro: laudoDoStoryboard(conferenciaFinal).slice(0, 460) };
  }

  // O cérebro da marca declara o que NÃO sabe, e a declaração sobe junto com a
  // peça. Lacuna que ninguém lê não é lacuna declarada.
  if (marca.cerebro.lacunas.length > 0) {
    notas.push(`[cérebro criativo] o que falta para esta marca: ${marca.cerebro.lacunas.join("; ")}`);
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
