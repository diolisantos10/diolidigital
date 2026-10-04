// leitura-pelo-cofre.ts — O GANCHO da leitura de brand book pela IA do cofre.
//
// ── POR QUE EXISTE (CEO, 04/10/2026) ─────────────────────────────────────────
// A leitura automática do brand book só sabia falar com o Claude, e a conta
// Claude da agência está sem saldo. A IA desta casa vai chegar pelo cofre da
// Control Room (DeepSeek, `POST /gateway/execute`), mas o CONTRATO dessa
// chamada ainda não chegou (`docs/cofre-produtos.md`). Inventar o formato da
// chamada seria pior que esperar.
//
// Então: UM ponto só, já ligado no caminho certo. `analisarBrandBook` chama
// `lerPeloCofre` quando o Claude não está disponível. Hoje ela responde
// "indisponível" e a tela diz, com todas as letras, que o arquivo está
// guardado e a leitura espera a IA. Quando o contrato chegar, implementa-se
// AQUI — nenhuma rota, nenhuma tela muda.
//
// ⚠️ PDF: o DeepSeek não lê PDF nativo, e não há biblioteca de PDF neste
// projeto. Para PDF o cofre precisará receber o texto já extraído (ou o
// gateway extrai). Isso é decisão do contrato, não desta casa.

/** Prefixo fixo do recado "sem IA". A tela o reconhece e mostra espera, não erro. */
export const RECADO_SEM_IA =
  "Sem IA ligada para ler o brand book: o arquivo está guardado e a leitura começa quando a IA da Control Room (cofre) for ligada.";

/** O erro guardado é "falta de IA" (espera), e não defeito do arquivo? */
export function ehFaltaDeIa(erro: string | null | undefined): boolean {
  return /sem ia ligada|nenhuma chave|sem saldo|credit balance/i.test(erro ?? "");
}

export interface PedidoDeLeitura {
  workspaceId: string;
  fileName: string;
  mimeType: string;
  /** Texto já extraído do arquivo, quando houver (DOCX, PPTX, SVG, texto). */
  texto: string | null;
  system: string;
  instrucao: string;
}

export type RespostaDoCofre =
  | { disponivel: false; motivo: string }
  | { disponivel: true; ok: true; texto: string }
  | { disponivel: true; ok: false; erro: string };

/**
 * Pede a leitura à IA do cofre. **Desligada até o contrato do gateway chegar.**
 * Não lança: indisponível é resposta, não exceção.
 */
export async function lerPeloCofre(pedido: PedidoDeLeitura): Promise<RespostaDoCofre> {
  void pedido; // usado quando o contrato do gateway chegar
  return { disponivel: false, motivo: RECADO_SEM_IA };
}
