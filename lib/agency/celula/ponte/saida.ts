// saida.ts — Dioli → cliente: a trava de destinatário e a avaliação do
// envio. PURO: nenhum import de Prisma, nenhum import de rede, nenhum `fs`
// real.
//
// A saída ao cliente é ANEXO (bytes + nome + mime), NUNCA URL. O tipo
// `ResultadoDoEnvio` abaixo NÃO TEM campo de URL para o cliente — se o campo
// não existe, ninguém o preenche por engano. Quem lê o byte do disco e monta
// o anexo de verdade é a camada acima (fora desta pasta), DEPOIS que
// `avaliarEnvioAoCliente` devolver `ok: true` — este arquivo só julga, nunca
// lê nem transporta byte.

import { contemEnderecoInterno } from "./endereco-interno";
import type { ArquivoParaConferencia, DestinoPretendido, EstadoDoArquivo, PedidoDeExcecao } from "./tipos";

// ── T1 — DESTINATÁRIO DIVERGENTE BLOQUEIA O ENVIO (prova nº 14) ───────────

export type VeredictoDoDestinatario =
  | { ok: true }
  | { ok: false; motivo: string; eixosDivergentes: string[]; abrirExcecao: PedidoDeExcecao };

/**
 * Compara os três eixos entre o arquivo e o destino PRETENDIDO pelo operador:
 * `oportunidadeId`, `clienteId`/`projetoId`, `destinatarioDeclarado`.
 * Divergiu em QUALQUER eixo → bloqueia. Fail-closed: destino ausente, vazio
 * ou não declarado TAMBÉM bloqueia — ausência de informação não é informação.
 * Metade limpa: destino idêntico ao declarado → passa.
 */
export function conferirDestinatario(input: {
  arquivo: Pick<ArquivoParaConferencia, "id" | "oportunidadeId" | "clienteId" | "projetoId" | "destinatarioDeclarado">;
  destinoPretendido: DestinoPretendido;
}): VeredictoDoDestinatario {
  const eixosDivergentes: string[] = [];

  const destinatarioPretendido = (input.destinoPretendido.destinatarioDeclarado ?? "").trim();
  if (!destinatarioPretendido) {
    eixosDivergentes.push("destinatarioDeclarado (ausente)");
  } else if (destinatarioPretendido !== input.arquivo.destinatarioDeclarado) {
    eixosDivergentes.push("destinatarioDeclarado");
  }

  if (!input.destinoPretendido.oportunidadeId || input.destinoPretendido.oportunidadeId !== input.arquivo.oportunidadeId) {
    eixosDivergentes.push("oportunidadeId");
  }

  const clienteOuProjetoDoArquivo = input.arquivo.clienteId ?? input.arquivo.projetoId ?? null;
  const clienteOuProjetoDoDestino = input.destinoPretendido.clienteId ?? input.destinoPretendido.projetoId ?? null;
  if (!clienteOuProjetoDoDestino) {
    eixosDivergentes.push("clienteId/projetoId (ausente)");
  } else if (clienteOuProjetoDoArquivo !== clienteOuProjetoDoDestino) {
    eixosDivergentes.push("clienteId/projetoId");
  }

  if (eixosDivergentes.length > 0) {
    return {
      ok: false,
      motivo: `Destinatário divergente — envio bloqueado. Eixos que não conferem: ${eixosDivergentes.join(", ")}.`,
      eixosDivergentes,
      abrirExcecao: {
        caso: "destinatario_divergente",
        contexto: { arquivoId: input.arquivo.id, eixosDivergentes },
        acaoRecomendada: "Gerente de atendimento confirma o destinatário correto antes de qualquer reenvio.",
      },
    };
  }

  return { ok: true };
}

// ── A avaliação completa do envio: T1 + T2 + estado ───────────────────────

/** Só arquivos aprovados pela Qualidade saem para o cliente. A costura com o
 *  gate de Qualidade (quem marca `aprovado_para_envio`) não existe nesta
 *  onda — LACUNA DECLARADA, ver relatório do despacho. */
const ESTADOS_QUE_PODEM_SER_ENVIADOS: readonly EstadoDoArquivo[] = ["aprovado_para_envio"];

export type ResultadoDoEnvio =
  | { ok: true }
  | { ok: false; motivo: string; abrirExcecao?: PedidoDeExcecao };

/**
 * A trava completa antes de um arquivo sair para o cliente:
 *   1. o arquivo precisa estar `aprovado_para_envio`;
 *   2. T1 — o destinatário pretendido precisa bater nos três eixos;
 *   3. T2 — a mensagem de acompanhamento (se houver) não pode conter
 *      endereço interno.
 * Não devolve bytes nem URL — só o veredicto.
 */
export function avaliarEnvioAoCliente(input: {
  arquivo: ArquivoParaConferencia;
  destinoPretendido: DestinoPretendido;
  mensagemDeAcompanhamento?: string;
}): ResultadoDoEnvio {
  if (!ESTADOS_QUE_PODEM_SER_ENVIADOS.includes(input.arquivo.estado)) {
    return {
      ok: false,
      motivo: `Arquivo em "${input.arquivo.estado}" não pode ser enviado — só arquivos "aprovado_para_envio" saem para o cliente.`,
    };
  }

  const destinatario = conferirDestinatario({ arquivo: input.arquivo, destinoPretendido: input.destinoPretendido });
  if (!destinatario.ok) {
    return { ok: false, motivo: destinatario.motivo, abrirExcecao: destinatario.abrirExcecao };
  }

  if (input.mensagemDeAcompanhamento) {
    const varredura = contemEnderecoInterno(input.mensagemDeAcompanhamento, {
      id: input.arquivo.id,
      caminhoInterno: input.arquivo.caminhoInterno,
    });
    if (varredura.contem) {
      return { ok: false, motivo: `Mensagem de acompanhamento bloqueada: ${varredura.motivo}` };
    }
  }

  return { ok: true };
}
