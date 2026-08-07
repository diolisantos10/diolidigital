// peca.ts — A PEÇA PRONTA: molde + foto + texto conferido.
//
// A porta única do motor de molde. Quem produz arte (`artes.ts`) chama daqui e
// não precisa saber de HTML, de Chromium nem de zona morta de story.
//
// ── AS TRÊS PROPRIEDADES QUE ESTA CAMADA GARANTE ────────────────────────────
//
// 1. UM MOLDE, TODOS OS FORMATOS. `formato` muda dimensão, margem e corpo —
//    nunca a identidade. A tela 6 do carrossel nasce do MESMO `Molde` da tela
//    1, e por isso tem a mesma cara sem ninguém redesenhar nada.
// 2. NENHUM TEXTO ENTRA SEM PASSAR PELA TRAVA. `trava-de-texto.ts` decide; esta
//    camada apenas obedece. Texto reprovado NÃO derruba a peça: a peça sai sem
//    a camada de texto, e o motivo volta em `textoRecusado` para o registro.
// 3. RE-RENDER É BARATO. A foto entra como bytes (`fundoBytes`). Trocar o texto
//    e chamar de novo NÃO toca no gerador de imagem — é rasterização local, na
//    ordem de centavos de segundo, contra uma chamada paga de `gpt-image-1`.

import { FORMATOS, montarHtmlDaPeca, textosDaPeca, type FormatoDaPeca, type Molde, type PecaDoMolde } from "./molde";
import type { Composicao } from "./repertorio";
import { renderizarHtml, type MotivoDeFalhaDeRender } from "./renderizar";
import {
  travaDeTextoNaArte, travaDeRotuloNaArte, FORMA_DO_SELO, FORMA_DA_ASSINATURA,
  type MotivoDaTrava,
} from "./trava-de-texto";

export interface PedidoDePeca {
  formato: FormatoDaPeca;
  molde: Molde;
  /** A foto: bytes já em mão (gerados pela IA ou enviados pelo cliente). */
  fundoBytes?: Buffer | null;
  /** MIME da foto. Precisa ser um que o navegador desenhe. */
  fundoMime?: string;
  /** O texto pretendido para a arte. */
  titulo?: string | null;
  apoio?: string | null;
  selo?: string | null;
  assinatura?: string | null;
  indice?: { atual: number; total: number } | null;
  /** O conteúdo JÁ AUDITADO de onde o texto tem de ser trecho literal
   *  (legenda do post, ou a cena descrita do carrossel). */
  fonteAuditada: string;
  /** A composição desta tela — decidida pelo cérebro criativo da marca a partir
   *  do PAPEL que a tela cumpre na história (`repertorio.ts`). Ausente =
   *  `foto-cheia`, o layout histórico. */
  composicao?: Composicao | null;
}

export interface TextoRecusado {
  papel: "titulo" | "apoio" | "selo" | "assinatura";
  motivo: MotivoDaTrava;
  detalhe: string;
}

export type ResultadoDaPeca =
  | {
      ok: true;
      bytes: Buffer;
      largura: number;
      altura: number;
      /** Os textos que de fato foram pintados e conferidos no DOM. */
      textosPintados: string[];
      /** O que a trava barrou. Vazio quando tudo passou. */
      textoRecusado: TextoRecusado[];
      /** Encolhemos o título para caber? */
      encolheu: boolean;
      /** O molde veio da marca do cliente ou é o neutro declarado? */
      origemDoMolde: Molde["origem"];
      /** O que faltava no BrandBrain. Sobe junto com a peça de propósito: até a
       *  7ª auditoria, `lacunas` não tinha um único consumidor fora de teste —
       *  o cliente recebia a peça cinza e nada dizia que aquele cinza era
       *  AUSÊNCIA de marca. Quem grava a peça grava isto. */
      lacunasDoMolde: string[];
    }
  | { ok: false; erro: string; motivo: MotivoDeFalhaDeRender };

/** MIMEs que o navegador desenha como fundo. */
const MIMES_DE_FUNDO = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

/**
 * Monta a peça final. Nunca lança.
 */
export async function montarPeca(p: PedidoDePeca): Promise<ResultadoDaPeca> {
  const dim = FORMATOS[p.formato];
  const recusados: TextoRecusado[] = [];

  const passar = (papel: "titulo" | "apoio", texto: string | null | undefined): string | null => {
    // A trava devolve o texto HIGIENIZADO; é ele que vira pixel.
    const t = (texto ?? "").trim();
    if (!t) return null;
    const v = travaDeTextoNaArte(t, p.fonteAuditada);
    if (v.ok) return v.texto;
    recusados.push({ papel, motivo: v.motivo, detalhe: v.detalhe });
    return null;
  };

  const titulo = passar("titulo", p.titulo);
  const apoio = passar("apoio", p.apoio);

  // ── SELO E ASSINATURA: A TRAVA DE RÓTULO, COM O NOME DELA ─────────────────
  //
  // Antes, aqui rodava `travaDeTextoNaArte(selo, selo)` — fonte igual ao alvo,
  // ou seja, `temLastroLiteral` sempre verdadeiro por construção: um `if (true)`
  // disfarçado de conferência. E o selo é `post.pillar`, TEXTO LIVRE DE LLM: um
  // pilar de 90 caracteres saía em caixa alta no topo da peça.
  //
  // A decisão (05/08/2026) foi NÃO fingir lastro que não existe. Rótulo não tem
  // fonte auditada; o que ele tem é FORMA. `travaDeRotuloNaArte` exige tamanho,
  // contagem de palavras e alfabeto de rótulo, mais a mesma metade de classe de
  // fato de todo o resto. Pilar virado parágrafo não é rótulo, e não entra.
  const passarRotulo = (
    papel: "selo" | "assinatura",
    texto: string | null | undefined,
    forma: typeof FORMA_DO_SELO,
  ): string | null => {
    const bruto = (texto ?? "").trim();
    if (!bruto) return null;
    const v = travaDeRotuloNaArte(bruto, forma);
    if (v.ok) return v.texto;
    recusados.push({ papel, motivo: v.motivo, detalhe: v.detalhe });
    return null;
  };

  const selo = passarRotulo("selo", p.selo, FORMA_DO_SELO);
  const assinatura = passarRotulo("assinatura", p.assinatura, FORMA_DA_ASSINATURA);

  const mime = p.fundoMime ?? "image/png";
  const fundo =
    p.fundoBytes && p.fundoBytes.length > 0 && MIMES_DE_FUNDO.has(mime)
      ? `data:${mime};base64,${p.fundoBytes.toString("base64")}`
      : null;

  const peca: PecaDoMolde = {
    formato: p.formato,
    titulo: titulo ?? "",
    apoio,
    selo,
    assinatura,
    indice: p.indice ?? null,
    fundo,
    composicao: p.composicao ?? null,
  };

  const html = montarHtmlDaPeca(peca, p.molde);
  const esperados = textosDaPeca(peca).map((t) => t.texto);

  const r = await renderizarHtml({
    html,
    largura: dim.largura,
    altura: dim.altura,
    textosEsperados: esperados,
    zonaMortaTopo: dim.margemTopo,
    zonaMortaBase: dim.margemBase,
  });
  if (!r.ok) return r;

  return {
    ok: true,
    bytes: r.bytes,
    largura: r.largura,
    altura: r.altura,
    textosPintados: esperados,
    textoRecusado: recusados,
    encolheu: r.conferencia.encolheu,
    origemDoMolde: p.molde.origem,
    lacunasDoMolde: p.molde.lacunas,
  };
}
