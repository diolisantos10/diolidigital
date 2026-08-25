// conferencia-do-arquivo.ts — A RÉGUA QUE OLHA OS BYTES, NÃO O ESTADO.
//
// ─── POR QUE ISTO EXISTE (Operação Salvaguarda, 25/08/2026) ─────────────────
//
// A regra principal do contrato de aceite é uma frase só: **"o teste precisa
// observar o artefato final; estado interno sem arquivo não vale."**
//
// A casa tinha travas de estado espalhadas e nenhuma que abrisse o arquivo. O
// pedido virava `entregue` porque um `Deliverable` de texto existia; a peça
// virava "pronta" porque `mediaUrl` deixou de ser nulo. Nenhuma das duas
// perguntas é "o cliente consegue ver a imagem certa?".
//
// Aqui a pergunta é feita contra os BYTES:
//   1. o arquivo existe e não está vazio;
//   2. os bytes são realmente do MIME exigido — lido do CABEÇALHO do arquivo,
//      não do campo que alguém gravou no banco;
//   3. a dimensão decodificada é EXATAMENTE a exigida pelo produto.
//
// ─── POR QUE O MIME SAI DOS BYTES, E NÃO DO BANCO ───────────────────────────
//
// `MediaAsset.mimeType` é o que quem gravou DISSE que gravou. Foi exatamente
// esse tipo de declaração otimista que produziu a rajada de recusas da Meta
// documentada em `integrations/meta/formato-de-midia.ts`: o banco dizia JPEG e
// o arquivo era outra coisa. Uma régua que lê a declaração confere a declaração
// consigo mesma — e sempre passa.
//
// Os dois são conferidos, e têm de CONCORDAR: bytes que são JPEG num registro
// que diz PNG é um defeito real (o link público sai com o cabeçalho errado e a
// Meta recusa), e essa divergência precisa aparecer, não ser escolhida.
//
// ─── FALHA FECHADA, SEM EXCEÇÃO ─────────────────────────────────────────────
//
// Não decodificou? **Reprova.** "Sharp não estava instalado" é ausência de
// medida, e ausência de informação não é informação — é o guardrail 1 desta
// casa. Uma régua que devolve "aprovado, não consegui medir" é pior que régua
// nenhuma: a régua nenhuma deixa a dúvida viva; esta mataria a dúvida e
// deixaria o defeito.

import type { ProdutoCanonico } from "./registro";
import { dimensaoExigida } from "./registro";

/** O que a conferência achou. `null` em cada campo que ela NÃO conseguiu medir
 *  — e campo não medido nunca vira campo aprovado. */
export interface MedidaDoArquivo {
  bytes: number;
  /** MIME lido do cabeçalho dos próprios bytes. `null` = formato não
   *  reconhecido por esta régua, que é motivo de recusa. */
  mimeReal: string | null;
  largura: number | null;
  altura: number | null;
}

export type VereditoDoArquivo =
  | { ok: true; medida: MedidaDoArquivo }
  | { ok: false; medida: MedidaDoArquivo; problemas: string[]; motivo: string };

/**
 * O MIME pelos MAGIC BYTES. Sem biblioteca: são três formatos e as assinaturas
 * não mudam desde os anos 90. Formato fora desta lista devolve `null` — e
 * `null` reprova, porque a régua não sabe o que está olhando.
 */
export function mimePelosBytes(b: Buffer): string | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (
    b.length >= 8 &&
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
  ) return "image/png";
  if (
    b.length >= 12 &&
    b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP"
  ) return "image/webp";
  return null;
}

/** Mede largura e altura decodificando de verdade. Nunca lança: falha de
 *  decodificação vira `null`, e `null` reprova em `conferirArquivoDoProduto`. */
export async function medirDimensao(
  bytes: Buffer,
): Promise<{ largura: number; altura: number } | null> {
  try {
    const { default: sharp } = await import("sharp");
    const m = await sharp(bytes).metadata();
    if (typeof m.width !== "number" || typeof m.height !== "number") return null;
    if (m.width < 1 || m.height < 1) return null;
    return { largura: m.width, altura: m.height };
  } catch {
    // Sem `sharp`, ou bytes que não decodificam. Os dois são ausência de
    // medida, e ausência de medida NÃO é aprovação.
    return null;
  }
}

export interface PedidoDeConferencia {
  bytes: Buffer;
  produto: ProdutoCanonico;
  /** O `mimeType` gravado no `MediaAsset`, quando existir. Conferido CONTRA os
   *  bytes — os dois têm de concordar. `null` quando o chamador não tem o
   *  registro na mão (e aí só os bytes mandam). */
  mimeDeclarado?: string | null;
  /** Para a frase de recusa nomear o arquivo. */
  ondeEsta?: string;
}

/**
 * O ARQUIVO SERVE PARA ESTE PRODUTO?
 *
 * Determinística: sem IA, sem rede, sem provedor. Por isso ela nunca fica
 * "indisponível" — a mesma razão pela qual o piso de verdade é código e não
 * modelo (`producao-de-pedido.ts`, "a ordem dos freios").
 *
 * Devolve TODOS os problemas, não o primeiro: quem conserta precisa da lista
 * inteira, e um relatório que para no primeiro erro produz três rodadas de
 * conserto onde cabia uma.
 */
export async function conferirArquivoDoProduto(
  p: PedidoDeConferencia,
): Promise<VereditoDoArquivo> {
  const { bytes, produto } = p;
  const onde = p.ondeEsta ? ` (${p.ondeEsta})` : "";
  const exigida = dimensaoExigida(produto);

  const mimeReal = bytes.length > 0 ? mimePelosBytes(bytes) : null;
  const dim = bytes.length > 0 ? await medirDimensao(bytes) : null;

  const medida: MedidaDoArquivo = {
    bytes: bytes.length,
    mimeReal,
    largura: dim?.largura ?? null,
    altura: dim?.altura ?? null,
  };

  const problemas: string[] = [];

  if (bytes.length === 0) {
    problemas.push(`o arquivo${onde} está VAZIO (0 bytes) — não há peça, há um registro.`);
  } else {
    if (mimeReal === null) {
      problemas.push(
        `não reconheci o formato dos bytes${onde}. Esperado ${produto.mimeExigido}. ` +
        "Formato não reconhecido é recusa: não dá para afirmar que a Meta aceitaria.",
      );
    } else if (mimeReal !== produto.mimeExigido) {
      problemas.push(
        `o arquivo${onde} é ${mimeReal}, e este produto exige ${produto.mimeExigido}. ` +
        "O caminho da correção é reconverter a arte, não reconectar a conta.",
      );
    }

    if (
      p.mimeDeclarado !== undefined && p.mimeDeclarado !== null &&
      mimeReal !== null && p.mimeDeclarado !== mimeReal
    ) {
      problemas.push(
        `o banco de mídia diz que este arquivo é ${p.mimeDeclarado}, e os bytes dizem ${mimeReal}. ` +
        "Declaração e conteúdo divergentes: o link público sai com o cabeçalho errado.",
      );
    }

    if (dim === null) {
      problemas.push(
        `não consegui MEDIR a imagem${onde}. Sem medida não há aprovação — ` +
        "ausência de informação não é informação.",
      );
    } else if (dim.largura !== exigida.largura || dim.altura !== exigida.altura) {
      problemas.push(
        `a dimensão é ${dim.largura}×${dim.altura} e este produto exige exatamente ` +
        `${exigida.largura}×${exigida.altura}. ` +
        (dim.largura === dim.altura
          ? "Peça quadrada num produto vertical é reprovação imediata pelo contrato de aceite."
          : "Story entregue em outra proporção é o texto do cliente cortado pela interface."),
      );
    }
  }

  if (problemas.length === 0) return { ok: true, medida };

  return {
    ok: false,
    medida,
    problemas,
    motivo:
      `O arquivo final não serve para "${produto.label}": ` + problemas.join(" · "),
  };
}

/** A medida em uma linha, para o relatório de evidência. Nomeia o que foi
 *  medido, nunca só o veredito — placar sem número não é prova. */
export function medidaEmUmaLinha(m: MedidaDoArquivo): string {
  return [
    `${m.bytes} bytes`,
    m.mimeReal ?? "MIME não reconhecido",
    m.largura !== null && m.altura !== null ? `${m.largura}×${m.altura}` : "dimensão não medida",
  ].join(" · ");
}
