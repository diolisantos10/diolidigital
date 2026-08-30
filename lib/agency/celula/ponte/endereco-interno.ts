// endereco-interno.ts — T2: O ENDEREÇO INTERNO NUNCA SAI. PURO: nenhum
// import de Prisma, nenhum import de rede — só `node:crypto` (builtin, não é
// "chamar rede").
//
// `caminhoInterno` (e qualquer link interno) NUNCA é colado em mensagem ao
// cliente. Este arquivo expõe duas coisas:
//   • `linkInternoTemporario` — HMAC, prazo curto, PARA O OPERADOR, jamais
//     para o cliente;
//   • `contemEnderecoInterno` — trava que varre um texto de SAÍDA e bloqueia
//     se ele contiver o caminho interno, o id do arquivo, o prefixo do
//     diretório de mídia, ou um link interno assinado.
//
// A saída ao cliente é ANEXO (bytes + nome + mime), NUNCA URL — o tipo
// `ResultadoDoEnvio` em `saida.ts` não tem campo de URL para o cliente: se o
// campo não existe, ninguém o preenche por engano.

import { createHmac, timingSafeEqual } from "node:crypto";

// ── CONSERTO B2/2 — o caminho interno é DERIVADO, nunca aceito de fora ────
//
// Laudo do `qualidade` na Onda 3 (despacho B): `caminhoInterno` era aceito
// como STRING CRUA vinda de fora em `armazem.ts` — o oposto do que a ficha B
// mandava reaproveitar de `lib/agency/media/armazenamento.ts`
// (`caminhoAbsoluto`: "Derivado do id — NUNCA do nome enviado pelo cliente,
// que é o que mata travessia de diretório por construção"). A partir deste
// conserto, `registrarArquivoDoCliente` e `registrarArquivoParaCliente` (em
// `armazem.ts`) NÃO aceitam mais `caminhoInterno` como parâmetro de entrada —
// ele é sempre calculado aqui, a partir do `id` gerado dentro do próprio
// `armazem.ts` (nunca do nome ou de qualquer outro dado vindo de quem chama).
//
// LACUNA DECLARADA (escolha (b) do despacho B2): esta onda deriva o caminho
// com segurança, mas NÃO grava o byte em disco — `armazem.ts` continua sem
// `writeFile`/`node:fs`. Quem executar a escrita física do byte numa onda
// futura reaproveita `lib/agency/media/armazenamento.ts`; até lá, o
// `caminhoInterno` gravado no banco é um endereço RESERVADO e seguro (nunca
// injetável), não um caminho que já tem byte atrás dele.

/** Deriva o caminho interno de um arquivo da célula A PARTIR DO ID —
 *  nunca aceita nenhuma parte do caminho vinda de fora (nem o nome
 *  original, nem uma extensão não sanitizada, nem o workspace cru). Mesma
 *  disciplina de `sanitizarPasta` em `lib/agency/media/armazenamento.ts`. */
export function derivarCaminhoInterno(input: { workspaceId: string; id: string; extensao: string }): string {
  const pasta = apenasCaracteresSeguros(input.workspaceId, "sem-workspace");
  const id = apenasCaracteresSeguros(input.id, "sem-id");
  const extensao = apenasCaracteresSeguros(input.extensao, "bin").slice(0, 10) || "bin";
  return `celula/${pasta}/${id}.${extensao}`;
}

/** Só o que é seguro num segmento de caminho — nunca `../`, nunca separador,
 *  nunca caractere de controle. A garantia não depende de quem chama ter
 *  sanitizado antes. */
function apenasCaracteresSeguros(bruto: string, valorSeVazio: string): string {
  const limpo = (bruto ?? "").replace(/[^a-zA-Z0-9_-]/g, "");
  return limpo.length > 0 ? limpo.slice(0, 80) : valorSeVazio;
}

// ── Link interno temporário — só para o operador ────────────────────────

export interface LinkInternoInput {
  arquivoId: string;
  validoAteEm: Date;
  segredo: string;
}

/**
 * Devolve um caminho interno assinado, com prazo curto. Nunca colar isto numa
 * mensagem ao cliente — é o próprio padrão que `contemEnderecoInterno`
 * detecta e bloqueia.
 *
 * Segredo ausente NUNCA vira um link "assinado" com valor previsível — isso
 * seria pior que nenhum link, porque aparenta proteção que não existe (mesma
 * postura de `segredoDeAssinatura()` em `lib/agency/media/armazenamento.ts`).
 */
export function linkInternoTemporario(input: LinkInternoInput): string {
  if (!input.segredo || !input.segredo.trim()) {
    throw new Error("Segredo ausente — não é possível assinar link interno de arquivo.");
  }
  const expiraEm = input.validoAteEm.getTime();
  const assinatura = assinar(input.arquivoId, expiraEm, input.segredo);
  return `/interno/celula/arquivos/${input.arquivoId}?exp=${expiraEm}&sig=${assinatura}`;
}

export interface LinkInternoParaConferir {
  arquivoId: string;
  exp: string | null;
  sig: string | null;
  segredo: string;
}

/** Confere assinatura e prazo. Comparação em tempo constante — mesmo padrão
 *  de `assinaturaValida` em `armazenamento.ts`. */
export function linkInternoValido(input: LinkInternoParaConferir): boolean {
  if (!input.exp || !input.sig) return false;
  const expiraEm = Number(input.exp);
  if (!Number.isFinite(expiraEm) || expiraEm < Date.now()) return false;
  let esperada: string;
  try {
    esperada = assinar(input.arquivoId, expiraEm, input.segredo);
  } catch {
    return false;
  }
  const a = Buffer.from(esperada, "utf8");
  const b = Buffer.from(input.sig, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function assinar(arquivoId: string, expiraEm: number, segredo: string): string {
  return createHmac("sha256", segredo).update(`${arquivoId}.${expiraEm}`).digest("hex");
}

// ── A trava: um texto de saída NUNCA carrega endereço interno ───────────

/** Prefixos conhecidos de rota/diretório interno de mídia — ver
 *  `lib/agency/media/armazenamento.ts` (`raizDaMidia`, rota `app/api/media/[id]`). */
const PREFIXOS_DE_DIRETORIO_DE_MIDIA: readonly string[] = ["/api/media/", "/media/", ".media/"];

/** O formato exato que `linkInternoTemporario` produz — se aparecer num texto
 *  de saída, é o link interno vazando. */
const PADRAO_DE_LINK_INTERNO_ASSINADO = /\/interno\/celula\/arquivos\/[^\s"'<>]+\?exp=\d+&sig=[0-9a-f]{16,}/i;

export type VarreduraDeEnderecoInterno =
  | { contem: false }
  | { contem: true; achado: "caminho_interno" | "id_do_arquivo" | "prefixo_de_diretorio_de_midia" | "link_interno_assinado"; motivo: string };

/**
 * T2. Varre `texto` (uma mensagem ao cliente, por exemplo) contra o que NUNCA
 * pode aparecer nela. Metade limpa: mensagem normal, sem caminho nenhum,
 * devolve `{ contem: false }`.
 */
export function contemEnderecoInterno(
  texto: string,
  arquivo: { id: string; caminhoInterno: string },
): VarreduraDeEnderecoInterno {
  const alvo = texto ?? "";

  if (arquivo.caminhoInterno && alvo.includes(arquivo.caminhoInterno)) {
    return {
      contem: true,
      achado: "caminho_interno",
      motivo: "O texto contém o caminho interno do arquivo — isso nunca pode ir ao cliente.",
    };
  }

  if (arquivo.id && alvo.includes(arquivo.id)) {
    return {
      contem: true,
      achado: "id_do_arquivo",
      motivo: "O texto contém o id interno do arquivo.",
    };
  }

  for (const prefixo of PREFIXOS_DE_DIRETORIO_DE_MIDIA) {
    if (alvo.includes(prefixo)) {
      return {
        contem: true,
        achado: "prefixo_de_diretorio_de_midia",
        motivo: `O texto contém o prefixo interno de diretório de mídia "${prefixo}".`,
      };
    }
  }

  if (PADRAO_DE_LINK_INTERNO_ASSINADO.test(alvo)) {
    return {
      contem: true,
      achado: "link_interno_assinado",
      motivo: "O texto contém um link interno assinado — links internos são só para o operador.",
    };
  }

  return { contem: false };
}
