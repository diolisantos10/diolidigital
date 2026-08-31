// ─── O CORPO DO ARQUIVO — a lacuna que a Onda 3 declarou e adiou ──────────
//
// `armazem.ts` diz, no próprio cabeçalho:
//
//   "LACUNA DECLARADA: O BYTE NUNCA É GRAVADO EM DISCO. (...) A escrita física
//    do byte, reaproveitando `lib/agency/media/armazenamento.ts`, fica para uma
//    onda seguinte."
//
// **Esta é a onda seguinte.** Sem ela, a ponte tem checksum, versão, quarentena
// e destinatário conferido — e nenhum arquivo. No caminho A (decisão D-0D1 do
// CEO: o agente prepara, o CEO clica para anexar), isso é fatal: não existe o
// que entregar a ele para anexar.
//
// ── A ORDEM DE ESCRITA NÃO É DETALHE ──────────────────────────────────────
// Grava-se o BYTE PRIMEIRO, e só depois o registro no banco.
//
// Se o byte falhar, não nasce registro — a casa não promete um arquivo que não
// tem. Se o registro falhar depois do byte, sobra um arquivo órfão no disco,
// que é lixo barato e some no expurgo de retenção. A ordem inversa produziria
// o pior dos dois: um registro dizendo "entrega pronta" apontando para o nada,
// que só é descoberto na frente do cliente.
//
// ── A INTEGRIDADE É CONFERIDA NA LEITURA, NÃO SÓ NA GRAVAÇÃO ─────────────
// Conferir só ao gravar responde "o que recebi era o que mandaram". A pergunta
// que importa na hora de entregar é outra: **"o que estou entregando é o que
// aprovamos?"** Entre uma coisa e outra passam dias, um deploy, um volume
// remontado e um expurgo. Por isso `lerCorpo` recalcula o sha256 e RECUSA
// devolver bytes que não batem — entregar arquivo trocado ao cliente é
// exatamente a falha que a trava do destinatário existe para evitar, só que
// pela porta de trás.

import { createHash } from "node:crypto";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { caminhoAbsoluto, MAX_BYTES_POR_ARQUIVO } from "@/lib/agency/media/armazenamento";

export type ResultadoDaGravacao =
  | { ok: true; sha256: string; tamanhoBytes: number }
  | { ok: false; motivo: string; regra: RegraDoCorpo };

export type RegraDoCorpo =
  | "caminho_invalido"
  | "sem_bytes"
  | "grande_demais"
  | "falha_de_disco"
  | "arquivo_ausente"
  | "integridade_quebrada";

/**
 * O caminho tem de ser o DERIVADO por `derivarCaminhoInterno` — nunca um valor
 * que veio de fora. Esta checagem é a segunda tranca: `derivarCaminhoInterno`
 * já sanitiza, mas quem chamar `gravarCorpo` com uma string montada à mão não
 * passa por ela. `..` num caminho de arquivo é como se escreve fora da pasta.
 */
function caminhoAceitavel(caminhoInterno: unknown): caminhoInterno is string {
  if (typeof caminhoInterno !== "string" || caminhoInterno.trim() === "") return false;
  if (caminhoInterno.includes("..")) return false;
  if (caminhoInterno.startsWith("/") || caminhoInterno.includes("\\")) return false;
  // O formato que `derivarCaminhoInterno` produz, e só ele.
  return /^celula\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/.test(caminhoInterno);
}

export function sha256De(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Grava o corpo. Devolve o sha256 do que foi REALMENTE escrito. */
export async function gravarCorpo(caminhoInterno: string, bytes: Buffer): Promise<ResultadoDaGravacao> {
  if (!caminhoAceitavel(caminhoInterno)) {
    return {
      ok: false,
      regra: "caminho_invalido",
      motivo: `caminho interno fora do formato derivado: ${JSON.stringify(caminhoInterno)}. Só se grava no caminho que a casa derivou do id.`,
    };
  }
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
    return { ok: false, regra: "sem_bytes", motivo: "não há bytes para gravar — arquivo vazio não é arquivo." };
  }
  if (bytes.length > MAX_BYTES_POR_ARQUIVO) {
    const mb = Math.round(MAX_BYTES_POR_ARQUIVO / 1024 / 1024);
    return { ok: false, regra: "grande_demais", motivo: `arquivo passa de ${mb} MB, o teto do armazém desta casa.` };
  }

  const destino = caminhoAbsoluto(caminhoInterno);
  try {
    await mkdir(dirname(destino), { recursive: true });
    await writeFile(destino, bytes);
  } catch (e) {
    return {
      ok: false,
      regra: "falha_de_disco",
      motivo: `não consegui gravar o corpo: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  return { ok: true, sha256: sha256De(bytes), tamanhoBytes: bytes.length };
}

export type ResultadoDaLeitura =
  | { ok: true; bytes: Buffer }
  | { ok: false; motivo: string; regra: RegraDoCorpo };

/**
 * Lê o corpo E CONFERE a integridade contra o sha256 registrado.
 *
 * `sha256Esperado` é obrigatório de propósito. Uma leitura sem conferência
 * existiria "só para casos internos", e em três meses alguém a usaria no
 * caminho que entrega ao cliente — que é justamente onde a conferência importa.
 */
export async function lerCorpo(caminhoInterno: string, sha256Esperado: string): Promise<ResultadoDaLeitura> {
  if (!caminhoAceitavel(caminhoInterno)) {
    return { ok: false, regra: "caminho_invalido", motivo: `caminho interno inválido: ${JSON.stringify(caminhoInterno)}.` };
  }

  let bytes: Buffer;
  try {
    bytes = await readFile(caminhoAbsoluto(caminhoInterno));
  } catch {
    return {
      ok: false,
      regra: "arquivo_ausente",
      motivo:
        `o registro existe mas o corpo NÃO está no disco (${caminhoInterno}). ` +
        `Isso é entrega prometida sem arquivo — some do caminho do cliente e vira exceção.`,
    };
  }

  const real = sha256De(bytes);
  if (typeof sha256Esperado !== "string" || sha256Esperado === "" || real !== sha256Esperado) {
    return {
      ok: false,
      regra: "integridade_quebrada",
      motivo:
        `o corpo no disco NÃO é o que foi registrado (esperado ${String(sha256Esperado).slice(0, 12)}…, ` +
        `encontrado ${real.slice(0, 12)}…). Não entrego arquivo que não posso provar ser o aprovado.`,
    };
  }

  return { ok: true, bytes };
}

/** Remove o corpo. Usado pelo expurgo de retenção e pela limpeza de órfão. */
export async function apagarCorpo(caminhoInterno: string): Promise<boolean> {
  if (!caminhoAceitavel(caminhoInterno)) return false;
  try {
    await unlink(caminhoAbsoluto(caminhoInterno));
    return true;
  } catch {
    return false;
  }
}
