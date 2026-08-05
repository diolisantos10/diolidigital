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
import { renderizarHtml, type MotivoDeFalhaDeRender } from "./renderizar";
import { travaDeTextoNaArte, type MotivoDaTrava } from "./trava-de-texto";

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
}

export interface TextoRecusado {
  papel: "titulo" | "apoio";
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
    const t = (texto ?? "").trim();
    if (!t) return null;
    const v = travaDeTextoNaArte(t, p.fonteAuditada);
    if (v.ok) return v.texto;
    recusados.push({ papel, motivo: v.motivo, detalhe: v.detalhe });
    return null;
  };

  const titulo = passar("titulo", p.titulo);
  const apoio = passar("apoio", p.apoio);

  // O selo (pilar) e a assinatura (nome do cliente) NÃO passam pela trava de
  // lastro de propósito: o pilar é rótulo interno da própria casa e o nome do
  // cliente é dado de cadastro — nenhum dos dois é afirmação sobre o negócio
  // dele. O que eles têm é a outra metade da trava, a de classe de fato: nome
  // com número ou promessa dentro também não vira pixel.
  const seloBruto = (p.selo ?? "").trim();
  const selo = seloBruto && travaDeTextoNaArte(seloBruto, seloBruto).ok ? seloBruto : null;
  const assinaturaBruta = (p.assinatura ?? "").trim();
  const assinatura =
    assinaturaBruta && travaDeTextoNaArte(assinaturaBruta, assinaturaBruta).ok ? assinaturaBruta : null;

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
  };
}
