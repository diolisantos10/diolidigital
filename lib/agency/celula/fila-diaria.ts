// ─── A FILA DIÁRIA — as entregas do dia num lugar só ──────────────────────
//
// Pedido do CEO, dentro da decisão D-0D1 (caminho A):
//
//   "As entregas do dia se acumulam num lugar só, ele revisa e libera em
//    bloco, uma vez por dia — não uma interrupção por oportunidade."
//
// ── POR QUE NÃO EXISTE TABELA NOVA AQUI ──────────────────────────────────
// A ordem foi explícita: "se já existir estrutura de fila na Célula,
// reaproveite; não crie sistema paralelo". E há duas coisas que poderiam ser
// reaproveitadas erradamente, então vale dizer qual foi escolhida e por quê:
//
//   • `ExcecaoDaCelula` é a fila do **que quebrou** — CAPTCHA, sessão expirada,
//     arquivo suspeito, destinatário divergente. Enfiar "aprove as entregas de
//     hoje" ali misturaria rotina com incidente, e o resultado previsível é a
//     equipe aprender a ignorar a fila inteira, incidente incluído.
//
//   • `ArquivoDaCelula` com `estado: "aprovado_para_envio"` **já é** a fila.
//     Um arquivo aprovado pela Qualidade e ainda não enviado é, por definição,
//     uma entrega esperando alguém clicar.
//
// Então a fila é DERIVADA, não digitada. Nenhum estado novo, nenhuma tabela,
// nenhuma sincronização para desandar. Aprovou, entra; enviou, sai.
//
// ── A DECISÃO QUE MAIS IMPORTA: O BLOCO NÃO É CEGO ───────────────────────
// "Liberar em bloco" tem um jeito preguiçoso de implementar — marcar todos
// como enviados de uma vez. Ele é errado, e o erro é caro: um item com o corpo
// ausente, com destinatário divergente ou com integridade quebrada sairia
// carimbado como entregue junto com os bons, e ninguém saberia até o cliente
// reclamar.
//
// Aqui cada item do bloco passa pelas MESMAS conferências de um envio
// individual. O bloco libera os que passam e **devolve os que não passam, com
// motivo**. Um item ruim nunca contamina o bloco, e nunca some dentro dele.

import { prisma } from "@/lib/db/client";
import { montarPacoteDoOperador } from "@/lib/agency/celula/ponte/pacote-do-operador";
import { podeNaCelula, type Credencial } from "@/lib/agency/celula/papeis";

export interface ItemDaFila {
  arquivoId: string;
  nome: string;
  mimeType: string;
  tamanhoBytes: number;
  versao: number;
  oportunidadeId: string;
  clienteId: string | null;
  projetoId: string | null;
  /** `ArquivoDaCelula` só guarda `criadoEm` — não há coluna de atualização.
   *  Chamar isto de "aprovadoEm" seria inventar precisão que o dado não tem,
   *  então o nome diz o que é: quando o arquivo ENTROU na ponte. */
  registradoEm: Date;
  /** `true` quando todas as conferências passam e o pacote pode ser montado. */
  pronto: boolean;
  /** Quando `pronto` é falso, o que impede. Nunca vazio nesse caso. */
  impedimento: string | null;
}

export interface FilaDoDia {
  /** O dia a que a fila se refere, em ISO curto (`2026-08-30`). */
  dia: string;
  itens: readonly ItemDaFila[];
  prontos: number;
  impedidos: number;
}

/**
 * Monta a fila do dia.
 *
 * **Os impedidos aparecem na fila, não são escondidos.** Filtrar o que está
 * quebrado deixaria a lista bonita e faria a entrega sumir sem ninguém
 * perceber — que é exatamente como esta casa descobriu, um mês depois, que a
 * conexão de um cliente estava morta.
 */
export async function montarFilaDoDia(
  input: { workspaceId: string; agora?: Date },
  db: typeof prisma = prisma,
): Promise<FilaDoDia> {
  const agora = input.agora ?? new Date();
  const linhas = await db.arquivoDaCelula.findMany({
    where: { workspaceId: input.workspaceId, estado: "aprovado_para_envio", direcao: "dioli_para_cliente" },
    orderBy: [{ oportunidadeId: "asc" }, { criadoEm: "asc" }],
  });

  const itens: ItemDaFila[] = [];
  for (const a of linhas) {
    // A mesma conferência do envio individual — inclusive a leitura do corpo
    // com checagem de integridade. É cara, e é de propósito: descobrir aqui
    // que o arquivo sumiu custa um aviso na tela; descobrir na frente do
    // cliente custa o cliente.
    const p = await montarPacoteDoOperador(
      {
        workspaceId: input.workspaceId,
        arquivoId: a.id,
        destinoPretendido: { oportunidadeId: a.oportunidadeId, clienteId: a.clienteId, projetoId: a.projetoId },
      },
      db,
    );
    itens.push({
      arquivoId: a.id,
      nome: a.nomeOriginal,
      mimeType: a.mimeType,
      tamanhoBytes: a.tamanhoBytes,
      versao: a.versao,
      oportunidadeId: a.oportunidadeId,
      clienteId: a.clienteId ?? null,
      projetoId: a.projetoId ?? null,
      registradoEm: a.criadoEm,
      pronto: p.ok,
      impedimento: p.ok ? null : p.motivo,
    });
  }

  return {
    dia: agora.toISOString().slice(0, 10),
    itens,
    prontos: itens.filter((i) => i.pronto).length,
    impedidos: itens.filter((i) => !i.pronto).length,
  };
}

export interface LiberacaoDeItem {
  arquivoId: string;
  liberado: boolean;
  motivo: string | null;
}

export type ResultadoDaLiberacao =
  | {
      ok: true;
      liberados: readonly LiberacaoDeItem[];
      recusados: readonly LiberacaoDeItem[];
      /** 🔴 O NÚMERO QUE DECIDE O CAMINHO B. Itens que estavam PRONTOS — que
       *  passaram por todas as conferências — e que o operador, olhando,
       *  decidiu NÃO enviar. Cada um é uma correção que só o humano fez, e é
       *  exatamente o que se perde quando a pessoa sai do meio.
       *  Ver `docs/celula-prospeccao/decisao-b-automatico.md`, seção 4. */
      naoSelecionados: readonly string[];
    }
  | { ok: false; motivo: string; regra: "sem_permissao" | "lista_vazia" };

/**
 * Libera em bloco. Cada item é conferido individualmente.
 *
 * A permissão exigida é `autorizar_envio` — o aceite humano do modo
 * supervisionado. Quem quiser liberar precisa do papel declarado, e isso vale
 * inclusive para o CEO: se ele mesmo for liberar a fila, tem de portar o papel
 * `gerente_de_atendimento`, que é dado declarado. Não é rigor decorativo — é
 * o que faz o registro dizer QUEM liberou, e não "o sistema".
 */
export async function liberarEmBloco(
  input: {
    workspaceId: string;
    /** O que o operador SELECIONOU. */
    arquivoIds: readonly string[];
    /**
     * O que foi APRESENTADO a ele como pronto. Opcional, e a diferença entre
     * este e o de cima é a medição inteira: sem saber o que ele viu, não se
     * sabe o que ele descartou — só o que ele escolheu. Omitir não quebra a
     * liberação; apenas apaga a evidência, e por isso o número medido nasce
     * como `[]` e não como zero fingido.
     */
    prontosApresentados?: readonly string[];
    credencial: Credencial;
    autor: string;
    agora?: Date;
  },
  db: typeof prisma = prisma,
): Promise<ResultadoDaLiberacao> {
  const permissao = podeNaCelula(input.credencial, "autorizar_envio");
  if (!permissao.pode) {
    return { ok: false, regra: "sem_permissao", motivo: permissao.motivo };
  }
  if (!Array.isArray(input.arquivoIds) || input.arquivoIds.length === 0) {
    return { ok: false, regra: "lista_vazia", motivo: "nenhum item selecionado para liberar." };
  }

  const agora = input.agora ?? new Date();
  const liberados: LiberacaoDeItem[] = [];
  const recusados: LiberacaoDeItem[] = [];

  for (const arquivoId of input.arquivoIds) {
    const a = await db.arquivoDaCelula.findFirst({ where: { id: arquivoId, workspaceId: input.workspaceId } });
    if (!a) {
      recusados.push({ arquivoId, liberado: false, motivo: "arquivo não encontrado neste workspace." });
      continue;
    }

    const p = await montarPacoteDoOperador(
      {
        workspaceId: input.workspaceId,
        arquivoId,
        destinoPretendido: { oportunidadeId: a.oportunidadeId, clienteId: a.clienteId, projetoId: a.projetoId },
      },
      db,
    );
    if (!p.ok) {
      recusados.push({ arquivoId, liberado: false, motivo: p.motivo });
      continue;
    }

    // Idempotente: só sai de `aprovado_para_envio`. Rodar o bloco duas vezes
    // não envia nada duas vezes — o segundo `updateMany` conta zero.
    const mudou = await db.arquivoDaCelula.updateMany({
      where: { id: arquivoId, workspaceId: input.workspaceId, estado: "aprovado_para_envio" },
      data: { estado: "enviado" },
    });
    if (mudou.count !== 1) {
      recusados.push({ arquivoId, liberado: false, motivo: `o arquivo já saiu de "aprovado_para_envio" — nada foi feito duas vezes.` });
      continue;
    }

    await db.eventoDoArquivoDaCelula.create({
      data: {
        workspaceId: input.workspaceId,
        arquivoId,
        tipo: "enviado",
        autor: input.autor,
        origem: "fila_diaria",
        detalhe:
          `Liberado na fila diária de ${agora.toISOString().slice(0, 10)}, em bloco, ` +
          `por quem porta o papel de gerente de atendimento. Destino conferido: ${a.oportunidadeId}.`,
      },
    });
    liberados.push({ arquivoId, liberado: true, motivo: null });
  }

  // A MEDIÇÃO. Registrada como evento, não contada em memória: um número que
  // só existe enquanto o processo vive não sobrevive até quinta-feira.
  const selecionados = new Set(input.arquivoIds);
  const naoSelecionados = (input.prontosApresentados ?? []).filter((id) => !selecionados.has(id));
  for (const arquivoId of naoSelecionados) {
    const existe = await db.arquivoDaCelula.findFirst({ where: { id: arquivoId, workspaceId: input.workspaceId } });
    if (!existe) continue;
    await db.eventoDoArquivoDaCelula.create({
      data: {
        workspaceId: input.workspaceId,
        arquivoId,
        tipo: "nao_selecionado_pelo_operador",
        autor: input.autor,
        origem: "fila_diaria",
        detalhe:
          `Estava PRONTO na fila de ${agora.toISOString().slice(0, 10)} e o operador NÃO o selecionou. ` +
          `Este é o número que sustenta ou derruba o caminho B: uma correção que só o humano fez.`,
      },
    });
  }

  return { ok: true, liberados, recusados, naoSelecionados };
}
