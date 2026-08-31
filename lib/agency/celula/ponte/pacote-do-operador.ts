// ─── O PACOTE QUE O CEO CLICA PARA ANEXAR — o caminho A da decisão D-0D1 ──
//
//   "O agente prepara — produz a peça, confere pela ponte de arquivos, monta o
//    pacote endereçado, registra. O CEO clica para anexar no chat do 99Freelas."
//
// Este arquivo é o último metro desse caminho: ele entrega, na mão de quem vai
// clicar, **o arquivo certo, para o cliente certo, provado**.
//
// ── AS QUATRO CONFERÊNCIAS, E NENHUMA É FORMALIDADE ──────────────────────
//   1. o arquivo é DESTE workspace          — id vindo de fora não alcança outro;
//   2. o estado é `aprovado_para_envio`     — Qualidade aprovou, não é rascunho;
//   3. o destinatário BATE                  — a trava nº 14 do CEO;
//   4. o corpo no disco bate com o sha256   — não entrego o que não posso provar.
//
// A nº 4 é a que só existe porque o corpo passou a ser gravado nesta onda. Sem
// ela, "o arquivo está pronto" significaria "o registro está pronto", e o CEO
// anexaria um arquivo ausente ou trocado sem ninguém perceber até o cliente
// abrir.
//
// ── POR QUE O PACOTE NÃO CARREGA O CAMINHO INTERNO ───────────────────────
// Ordem do CEO: "não enviar ao cliente o endereço interno do arquivo". O pacote
// leva os BYTES e o nome de exibição. O `caminhoInterno` fica de fora do que é
// devolvido — o que não existe no objeto não pode vazar para uma tela, um log
// ou uma mensagem por descuido.

import { prisma } from "@/lib/db/client";
import { lerCorpo } from "@/lib/agency/celula/ponte/corpo";

export interface PacoteDoOperador {
  arquivoId: string;
  /** O nome que o cliente vai ver. */
  nomeParaAnexar: string;
  mimeType: string;
  tamanhoBytes: number;
  /** O conteúdo, já conferido contra o sha256 registrado. */
  bytes: Buffer;
  /** Para onde vai — o operador confere na tela antes de clicar. */
  destino: { oportunidadeId: string; clienteId: string | null; projetoId: string | null };
  versao: number;
  /** O que o operador tem de registrar depois de anexar. */
  evidenciaExigida: readonly string[];
}

export type RegraDoPacote =
  | "arquivo_nao_encontrado"
  | "nao_aprovado_para_envio"
  | "destinatario_divergente"
  | "corpo_indisponivel";

export type ResultadoDoPacote =
  | { ok: true; pacote: PacoteDoOperador }
  | { ok: false; motivo: string; regra: RegraDoPacote };

/**
 * Monta o pacote — ou recusa, dizendo qual conferência falhou.
 *
 * `destinoPretendido` é OBRIGATÓRIO e vem de quem vai anexar, não do registro.
 * É de propósito: se o destino saísse do próprio registro, a conferência
 * compararia o dado com ele mesmo e nunca reprovaria nada. O valor da trava
 * está justamente em confrontar **o que o operador acha** com **o que a casa
 * registrou**.
 */
export async function montarPacoteDoOperador(
  input: {
    workspaceId: string;
    arquivoId: string;
    destinoPretendido: { oportunidadeId: string; clienteId?: string | null; projetoId?: string | null };
  },
  db: typeof prisma = prisma,
): Promise<ResultadoDoPacote> {
  const a = await db.arquivoDaCelula.findFirst({
    where: { id: input.arquivoId, workspaceId: input.workspaceId },
  });
  if (!a) {
    return {
      ok: false,
      regra: "arquivo_nao_encontrado",
      motivo: "arquivo não encontrado neste workspace.",
    };
  }

  if (a.estado !== "aprovado_para_envio") {
    return {
      ok: false,
      regra: "nao_aprovado_para_envio",
      motivo:
        `o arquivo está "${a.estado}", não "aprovado_para_envio". ` +
        `Só sai para o cliente o que a Qualidade aprovou.`,
    };
  }

  // A trava nº 14, no último metro. Comparação por eixo, e cada divergência
  // nomeada: dizer só "destinatário divergente" obrigaria o operador a caçar
  // qual dos três não bate.
  const divergentes: string[] = [];
  if (a.oportunidadeId !== input.destinoPretendido.oportunidadeId) divergentes.push("oportunidadeId");
  if ((a.clienteId ?? null) !== (input.destinoPretendido.clienteId ?? null)) divergentes.push("clienteId");
  if ((a.projetoId ?? null) !== (input.destinoPretendido.projetoId ?? null)) divergentes.push("projetoId");
  if (divergentes.length > 0) {
    return {
      ok: false,
      regra: "destinatario_divergente",
      motivo:
        `destinatário divergente — não monto o pacote. Eixos que não conferem: ${divergentes.join(", ")}. ` +
        `Arquivo do cliente A não vai ao cliente B.`,
    };
  }

  const corpo = await lerCorpo(a.caminhoInterno, a.sha256);
  if (!corpo.ok) {
    return { ok: false, regra: "corpo_indisponivel", motivo: corpo.motivo };
  }

  return {
    ok: true,
    pacote: {
      arquivoId: a.id,
      nomeParaAnexar: a.nomeOriginal,
      mimeType: a.mimeType,
      tamanhoBytes: corpo.bytes.length,
      bytes: corpo.bytes,
      destino: {
        oportunidadeId: a.oportunidadeId,
        clienteId: a.clienteId ?? null,
        projetoId: a.projetoId ?? null,
      },
      versao: a.versao,
      evidenciaExigida: ["url_da_conversa", "nome_do_arquivo", "tamanho_em_bytes", "checksum", "carimbo_de_tempo"],
    },
  };
}
