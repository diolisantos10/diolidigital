// O ARMAZÉM DO FUNIL DA CÉLULA DE PROSPECÇÃO — a única ponte para o Prisma.
//
// O juiz (`lib/agency/celula/funil.ts`) é puro, sem banco, e já testado
// isoladamente. Este arquivo é o que grava o veredicto dele: LÊ o estado
// ATUAL do banco (nunca aceita `de` vindo de fora — `de` de fora é o caminho
// para forjar transição), julga com `avaliarTransicao`, e escreve as DUAS
// tabelas (`LinhaDoFunil` + `TransicaoDoFunil`) dentro de UMA única
// `prisma.$transaction`. Trilha sem linha, ou linha sem trilha, é o defeito
// que este desenho torna impossível — não porque alguém lembrou de checar,
// mas porque as duas escritas são atômicas ou nenhuma acontece.
//
// ── APPEND-ONLY DE VERDADE ───────────────────────────────────────────────
// Neste módulo NUNCA existe `transicaoDoFunil.update`, `.updateMany`,
// `.delete`, `.deleteMany` nem `.upsert`. A trilha só recebe `.create` e
// leitura. Quem quiser "corrigir" uma linha da trilha está no arquivo errado:
// o jeito certo é criar uma NOVA transição que documente a correção — a
// trilha é a prova do que aconteceu, não um formulário editável.
// (`__tests__/celula/trilha-e-append-only.test.ts` varre este arquivo por
// regex e falha se qualquer um desses métodos aparecer sobre
// `transicaoDoFunil`.)
//
// `LinhaDoFunil` (o estado ATUAL) não tem essa restrição: ela é atualizada a
// cada avanço, de propósito — é o cache do "onde a oportunidade está agora",
// não a trilha.
//
// ── `justificativa` é DADO do pedido de avanço, nunca do anúncio ──────────
// Este módulo não importa nada de `lib/marketplaces`. Texto de terceiro
// (anúncio, cliente) é dado não confiável — nunca ordem para o sistema. Ver a
// mesma nota em `funil.ts`, seção "O QUE ESTE ARQUIVO NÃO FAZ".

import { prisma } from "@/lib/db/client";
import {
  type Estado,
  type OrigemDaTransicao,
  avaliarTransicao,
  estadoAtualOuInicial,
  origemDeclarada,
} from "@/lib/agency/celula/funil";

export interface RegistroDeTransicao {
  estadoAnterior: Estado;
  estadoNovo: Estado;
  autor: string;
  // `null` = "gravado com uma origem que hoje não sei mais ler" (corrupção,
  // versão antiga do enum, edição direta no banco). NÃO é `OrigemDaTransicao`
  // cru: `origemDeclarada` já valida contra as 4 origens legítimas em
  // `funil.ts`, e ausência de informação não é informação — não inventamos
  // `'sistema'` (mentiria sobre quem agiu) nem descartamos a linha (a trilha
  // é append-only; sumir com uma linha imperfeita é pior que mostrá-la assim).
  origem: OrigemDaTransicao | null;
  justificativa: string;
  criadoEm: Date;
}

/**
 * O estado ATUAL da oportunidade. Fail-closed: oportunidade sem
 * `LinhaDoFunil`, ou com um valor corrompido no banco, lê `ESTADO_INICIAL`
 * (`'encontrada'`) — nunca "pode avançar". Mesma postura de
 * `estadoAtualOuInicial` em `funil.ts`.
 */
export async function estadoDoFunil(oportunidadeId: string): Promise<Estado> {
  const linha = await prisma.linhaDoFunil.findUnique({
    where: { oportunidadeId },
    select: { estado: true },
  });
  return estadoAtualOuInicial(linha?.estado);
}

/**
 * A trilha inteira da oportunidade, em ORDEM CRONOLÓGICA (mais antiga
 * primeiro). Os cinco campos são carimbados na escrita e nunca mudam depois
 * — ver a nota de append-only no topo do arquivo.
 */
export async function trilhaDoFunil(oportunidadeId: string): Promise<RegistroDeTransicao[]> {
  const linhas = await prisma.transicaoDoFunil.findMany({
    where: { oportunidadeId },
    orderBy: { criadoEm: "asc" },
  });
  return linhas.map((linha) => ({
    // Escrito só por `avancarFunil` abaixo, sempre com um dos 22 slugs
    // validados por `avaliarTransicao` — `estadoAtualOuInicial` aqui é
    // defesa em profundidade, não a trava principal.
    estadoAnterior: estadoAtualOuInicial(linha.estadoAnterior),
    estadoNovo: estadoAtualOuInicial(linha.estadoNovo),
    autor: linha.autor,
    // Defesa em profundidade, mesmo espírito de `estadoAtualOuInicial` acima:
    // `origem` já foi validada por `avaliarTransicao` no momento da escrita
    // (só `avancarFunil` grava aqui), mas uma linha corrompida ou gravada por
    // uma versão antiga do enum não pode virar `as OrigemDaTransicao` cru.
    origem: origemDeclarada(linha.origem),
    justificativa: linha.justificativa,
    criadoEm: linha.criadoEm,
  }));
}

export type ResultadoDoAvanco = { ok: true; de: Estado; para: Estado } | { ok: false; codigo: string; motivo: string };

/**
 * O único caminho de escrita do funil. `de` NUNCA vem de `entrada` — é lido
 * do banco, de dentro da mesma transação que grava o resultado, para que não
 * haja janela em que o estado lido fique desatualizado por uma escrita
 * concorrente.
 *
 * Transição inválida (par não permitido, justificativa ausente, origem ou
 * autor inválidos, estado desconhecido) NÃO grava nada — nem `LinhaDoFunil`
 * nem `TransicaoDoFunil`: a validação acontece antes de qualquer `.create`,
 * dentro da mesma transação, então uma rejeição não deixa rastro.
 */
export async function avancarFunil(entrada: {
  workspaceId: string;
  oportunidadeId: string;
  para: unknown;
  autor: unknown;
  origem: unknown;
  justificativa: unknown;
}): Promise<ResultadoDoAvanco> {
  const { workspaceId, oportunidadeId } = entrada;

  return prisma.$transaction(async (tx) => {
    const linhaAtual = await tx.linhaDoFunil.findUnique({
      where: { oportunidadeId },
      select: { estado: true },
    });
    const de = estadoAtualOuInicial(linhaAtual?.estado);

    const veredicto = avaliarTransicao({
      de,
      para: entrada.para,
      autor: entrada.autor,
      origem: entrada.origem,
      justificativa: entrada.justificativa,
    });

    if (!veredicto.ok) {
      return { ok: false, codigo: veredicto.codigo, motivo: veredicto.motivo };
    }

    // A partir daqui `avaliarTransicao` já confirmou que autor/origem/
    // justificativa são strings não vazias no formato esperado — os casts
    // abaixo só nomeiam o que já foi validado, não pulam validação.
    const agora = new Date();
    const autor = entrada.autor as string;
    const origem = entrada.origem as OrigemDaTransicao;
    const justificativa = entrada.justificativa as string;

    // A TRILHA — só `.create`. Ver a nota de append-only no topo do arquivo.
    await tx.transicaoDoFunil.create({
      data: {
        workspaceId,
        oportunidadeId,
        estadoAnterior: veredicto.de,
        estadoNovo: veredicto.para,
        autor,
        origem,
        justificativa,
        criadoEm: agora,
      },
    });

    // A LINHA — o estado ATUAL, um registro por oportunidade. Esta tabela,
    // ao contrário da trilha, é atualizada a cada avanço, de propósito.
    await tx.linhaDoFunil.upsert({
      where: { oportunidadeId },
      create: {
        workspaceId,
        oportunidadeId,
        estado: veredicto.para,
        entrouNoEstadoEm: agora,
      },
      update: {
        estado: veredicto.para,
        entrouNoEstadoEm: agora,
      },
    });

    return { ok: true, de: veredicto.de, para: veredicto.para };
  });
}
