// leitura-pelo-cofre.ts — A leitura de brand book pela IA do cofre.
//
// ── HISTÓRIA ─────────────────────────────────────────────────────────────────
// 04/10/2026 (manhã): nasceu como GANCHO desligado — o contrato do gateway da
// Control Room ainda não tinha chegado, e inventar o formato seria pior que
// esperar. 04/10/2026 (tarde): o contrato chegou e o gancho foi ligado ao
// cliente único do cofre (`lib/ai/cofre.ts`). Nenhuma rota nem tela mudou.
//
// O DeepSeek lê TEXTO. Por isso o PDF chega aqui já como texto
// (`lib/ai/texto-do-pdf.ts`) — o visual das páginas não entra, e a
// declaração de leitura diz isso ao cliente.

import { cofreLigado, pedirAoCofre } from "@/lib/ai/cofre";

/** Prefixo fixo do recado "sem IA". A tela o reconhece e mostra espera, não erro. */
export const RECADO_SEM_IA =
  "Sem IA ligada para ler o brand book: o arquivo está guardado e a leitura começa quando a IA da Control Room (cofre) for ligada.";

/** O erro guardado é "falta de IA" (espera), e não defeito do arquivo? */
export function ehFaltaDeIa(erro: string | null | undefined): boolean {
  return /sem ia ligada|nenhuma chave|sem saldo|credit balance/i.test(erro ?? "");
}

export interface PedidoDeLeitura {
  workspaceId: string;
  /** De quem é o custo da leitura (centro de custo do cliente). */
  clientId?: string | null;
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
 * Pede a leitura à IA do cofre. Não lança: indisponível é resposta.
 * Sem token → `disponivel: false` com o recado de espera. Sem TEXTO (imagem,
 * PDF sem texto extraível) → também indisponível, dito com todas as letras:
 * o cofre de texto não enxerga imagem.
 */
export async function lerPeloCofre(pedido: PedidoDeLeitura): Promise<RespostaDoCofre> {
  // Sem token, o recado é SEMPRE o de espera — mesmo que o arquivo não tenha
  // texto: o que falta primeiro é a IA, e é isso que a tela tem de dizer.
  if (!cofreLigado()) return { disponivel: false, motivo: RECADO_SEM_IA };
  if (!pedido.texto || !pedido.texto.trim()) {
    return {
      disponivel: false,
      motivo: `Não há texto para a IA do cofre ler em "${pedido.fileName}" (imagem ou PDF só de imagem). O arquivo está guardado; a leitura por imagem ainda não existe no cofre.`,
    };
  }
  const r = await pedirAoCofre({
    modalidade: "text",
    mensagens: [
      { role: "system", content: pedido.system },
      { role: "user", content: `${pedido.instrucao}\n\nArquivo: ${pedido.fileName}\n\n${pedido.texto.slice(0, 30_000)}` },
    ],
    clientId: pedido.clientId ?? null,
    agentId: "leitura-de-brand-book",
    timeoutMs: 90_000,
  });
  if (r.ok && r.texto) return { disponivel: true, ok: true, texto: r.texto };
  if (!r.ok && r.falha === "desligado") return { disponivel: false, motivo: RECADO_SEM_IA };
  return { disponivel: true, ok: false, erro: r.ok ? "Cofre respondeu sem texto." : r.erro };
}
