// armazem.ts — a ÚNICA ponte para o Prisma da PONTE DE ARQUIVOS. Todo o
// resto desta pasta (`tipos.ts`, `entrada.ts`, `saida.ts`, `quarentena.ts`,
// `endereco-interno.ts`) é PURO. Este arquivo lê o estado ATUAL do banco
// dentro da MESMA `prisma.$transaction` que julga e grava — mesmo desenho de
// `lib/agency/celula/trilha.ts` (o "MODELO de desenho" citado no despacho).
//
// ── APPEND-ONLY DE VERDADE, SÓ PARA O EVENTO ────────────────────────────────
// `EventoDoArquivoDaCelula` só recebe `.create` e leitura — NUNCA `.update`,
// `.updateMany`, `.delete`, `.deleteMany`, `.upsert`. A auditoria é a prova do
// que aconteceu, não um formulário editável. (Regex-varrida em
// `__tests__/celula/ponte-versoes.test.ts`, mesmo padrão de
// `__tests__/celula/trilha-e-append-only.test.ts`.)
//
// `ArquivoDaCelula` NÃO tem essa restrição da mesma forma: o registro em si
// PODE ser atualizado (`estado`, `motivoDaQuarentena`) — é o "onde este
// arquivo está agora", não a trilha. O que nunca pode acontecer é sobrescrever
// o CONTEÚDO de uma versão: `versao` nunca é reescrita, e uma versão nova é
// SEMPRE uma linha `.create` nova com `versao + 1` — nunca um `.update` sobre
// a linha anterior. O `@@unique([linhagemId, versao])` é a trava de banco; a
// de código é calcular a próxima versão (MAX(versao) + 1 da linhagem) dentro
// da MESMA transação que grava — inline em cada função de registro, para que
// o TypeScript infira o tipo de `tx` do próprio callback do `$transaction`.
//
// ── FRONTEIRA COM O DESPACHO C ───────────────────────────────────────────────
// Este arquivo NUNCA importa `lib/agency/celula/excecoes/*` e NUNCA escreve
// na fila de exceções. Quando uma trava pede exceção (`abrirExcecao`), este
// arquivo só DEVOLVE o `PedidoDeExcecao` para quem chamou — a costura com a
// fila é lacuna declarada desta onda, para a camada de cima (despacho C)
// consumir numa onda seguinte.
//
// ── LACUNA DECLARADA: O GATE DE QUALIDADE ────────────────────────────────────
// A transição `recebido → aprovado_para_envio` (Dioli → cliente) hoje é feita
// por `aprovarParaEnvio` sem nenhuma verificação de que a Qualidade de fato
// aprovou a versão — esta onda não integra com o departamento `qualidade`.
// Quem chamar `aprovarParaEnvio` é responsável, por fora deste arquivo, por
// só chamá-la depois da aprovação real.

import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/client";
import { MIMES_ACEITOS, MAX_BYTES_POR_ARQUIVO } from "@/lib/agency/media/armazenamento";
import { varrerArquivoRecebido, type ArquivoRecebido } from "./quarentena";
import { confirmarRecebimentoAoCliente } from "./entrada";
import { avaliarEnvioAoCliente } from "./saida";
import { linkInternoTemporario } from "./endereco-interno";
import {
  estadoDoArquivoDeclarado,
  type Direcao,
  type EstadoDoArquivo,
  type PedidoDeExcecao,
} from "./tipos";

// ── CLIENTE → DIOLI: registrar uma nova versão recebida ───────────────────

export type ResultadoDoRegistro =
  | { ok: true; arquivoId: string; versao: number; estado: EstadoDoArquivo }
  | { ok: false; motivo: string; abrirExcecao?: PedidoDeExcecao };

/**
 * T3 + versionamento, tudo dentro de UMA `prisma.$transaction`. `versao`
 * NUNCA vem de fora: é calculada aqui, como MAX(versao) + 1 para a mesma
 * `linhagemId` (ou 1, se a linhagem é nova) — e a checagem de unicidade do
 * banco (`@@unique([linhagemId, versao])`) é a segunda trava contra corrida.
 */
export async function registrarArquivoDoCliente(input: {
  workspaceId: string;
  oportunidadeId: string;
  clienteId?: string | null;
  projetoId?: string | null;
  linhagemId: string;
  nomeOriginal: string;
  extensaoDeclarada: string;
  mimeType: string;
  bytes: Buffer;
  caminhoInterno: string;
  destinatarioDeclarado: string;
  autor: string;
}): Promise<ResultadoDoRegistro> {
  const arquivoParaVarredura: ArquivoRecebido = {
    nomeOriginal: input.nomeOriginal,
    extensaoDeclarada: input.extensaoDeclarada,
    mimeType: input.mimeType,
    tamanhoBytes: input.bytes.length,
    // só os primeiros 16 bytes — suficiente para os números mágicos checados,
    // e evita segurar o buffer inteiro em memória além do necessário aqui.
    amostraDeBytes: input.bytes.subarray(0, 16),
  };
  const veredicto = varrerArquivoRecebido(arquivoParaVarredura, {
    mimesAceitos: MIMES_ACEITOS,
    maxBytesPorArquivo: MAX_BYTES_POR_ARQUIVO,
  });

  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const estadoInicial: EstadoDoArquivo = veredicto.ok ? "liberado" : veredicto.estado;
  const direcao: Direcao = "cliente_para_dioli";

  return prisma.$transaction(async (tx) => {
    // MAX(versao) + 1 para a linhagem, DENTRO da transação — nunca aceita
    // `versao` vinda de fora. Inline (não extraído para função à parte) para
    // que o TypeScript infira o tipo de `tx` do próprio callback, sem
    // anotação manual arriscada.
    //
    // ESCOPADO POR workspaceId — achado do laudo de segurança da Onda 3
    // (despacho D, padrão nomeado "identificador de recurso sem verificação
    // de posse"): antes deste conserto, a busca da última versão filtrava só
    // por `linhagemId`. Se um `linhagemId` de um workspace fosse reaproveitado
    // (por acidente ou má-fé) numa chamada de OUTRO workspace, a versão
    // calculada continuaria a numeração do dono original — poluindo a
    // linhagem entre tenants. Agora, um `linhagemId` reaproveitado por outro
    // workspace recalcula do zero e colide com a trava `@@unique([linhagemId,
    // versao])` do banco: falha alto (`throw`), nunca mescla em silêncio.
    // Prova em `__tests__/celula/ponte-versoes.test.ts`.
    const ultima = await tx.arquivoDaCelula.findFirst({
      where: { workspaceId: input.workspaceId, linhagemId: input.linhagemId },
      orderBy: { versao: "desc" },
      select: { versao: true },
    });
    const versao = (ultima?.versao ?? 0) + 1;

    const criado = await tx.arquivoDaCelula.create({
      data: {
        workspaceId: input.workspaceId,
        oportunidadeId: input.oportunidadeId,
        clienteId: input.clienteId ?? null,
        projetoId: input.projetoId ?? null,
        direcao,
        linhagemId: input.linhagemId,
        versao,
        nomeOriginal: input.nomeOriginal,
        extensao: input.extensaoDeclarada,
        mimeType: input.mimeType,
        tamanhoBytes: input.bytes.length,
        sha256,
        caminhoInterno: input.caminhoInterno,
        estado: estadoInicial,
        destinatarioDeclarado: input.destinatarioDeclarado,
        motivoDaQuarentena: veredicto.ok ? null : veredicto.motivo,
      },
    });

    await tx.eventoDoArquivoDaCelula.create({
      data: {
        workspaceId: input.workspaceId,
        arquivoId: criado.id,
        tipo: veredicto.ok ? "varredura" : veredicto.estado === "em_quarentena" ? "quarentena" : "recusado",
        autor: input.autor,
        origem: "sistema",
        detalhe: veredicto.ok ? "Varredura concluída sem achados. Arquivo liberado." : veredicto.motivo,
      },
    });

    if (!veredicto.ok) {
      return { ok: false, motivo: veredicto.motivo, abrirExcecao: veredicto.abrirExcecao };
    }
    return { ok: true, arquivoId: criado.id, versao, estado: estadoInicial };
  });
}

// ── T4 — confirmação de recebimento ao cliente ─────────────────────────────

export type ResultadoDaConfirmacao = { ok: true } | { ok: false; motivo: string };

/** Lê o estado ATUAL do banco, dentro da transação — nunca aceita `estado` de
 *  fora. Rejeição (T4) NÃO grava evento — mesmo espírito de `avancarFunil`:
 *  uma rejeição não deixa rastro de uma ação que não aconteceu. */
export async function confirmarRecebimentoParaCliente(input: {
  workspaceId: string;
  arquivoId: string;
  autor: string;
}): Promise<ResultadoDaConfirmacao> {
  return prisma.$transaction(async (tx) => {
    const arquivo = await tx.arquivoDaCelula.findUnique({ where: { id: input.arquivoId } });
    if (!arquivo || arquivo.workspaceId !== input.workspaceId) {
      return { ok: false, motivo: "Arquivo não encontrado neste workspace." };
    }

    const estado = estadoDoArquivoDeclarado(arquivo.estado) ?? "recebido";
    const veredicto = confirmarRecebimentoAoCliente({ id: arquivo.id, estado });
    if (!veredicto.ok) return veredicto;

    await tx.eventoDoArquivoDaCelula.create({
      data: {
        workspaceId: input.workspaceId,
        arquivoId: arquivo.id,
        tipo: "confirmacao_ao_cliente",
        autor: input.autor,
        origem: "sistema",
        detalhe: "Recebimento confirmado ao cliente após integridade e varredura conferidas.",
      },
    });
    return { ok: true };
  });
}

// ── DIOLI → CLIENTE: registrar, aprovar, enviar ───────────────────────────

/** Registra uma nova versão de arquivo PRODUZIDO pela casa, ainda sem
 *  aprovação de envio — `estado` sempre nasce `"recebido"` aqui (o nome é o
 *  mesmo do modelo, "chegou nesta pasta"; a aprovação é um passo à parte, ver
 *  `aprovarParaEnvio`). */
export async function registrarArquivoParaCliente(input: {
  workspaceId: string;
  oportunidadeId: string;
  clienteId?: string | null;
  projetoId?: string | null;
  linhagemId: string;
  nomeOriginal: string;
  extensao: string;
  mimeType: string;
  bytes: Buffer;
  caminhoInterno: string;
  destinatarioDeclarado: string;
  autor: string;
}): Promise<{ ok: true; arquivoId: string; versao: number } | { ok: false; motivo: string }> {
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const direcao: Direcao = "dioli_para_cliente";

  return prisma.$transaction(async (tx) => {
    // Mesma fronteira de posse do registro do lado cliente → Dioli (ver o
    // comentário em `registrarArquivoDoCliente`): escopado por workspaceId.
    const ultima = await tx.arquivoDaCelula.findFirst({
      where: { linhagemId: input.linhagemId, workspaceId: input.workspaceId },
      orderBy: { versao: "desc" },
      select: { versao: true },
    });
    const versao = (ultima?.versao ?? 0) + 1;

    const criado = await tx.arquivoDaCelula.create({
      data: {
        workspaceId: input.workspaceId,
        oportunidadeId: input.oportunidadeId,
        clienteId: input.clienteId ?? null,
        projetoId: input.projetoId ?? null,
        direcao,
        linhagemId: input.linhagemId,
        versao,
        nomeOriginal: input.nomeOriginal,
        extensao: input.extensao,
        mimeType: input.mimeType,
        tamanhoBytes: input.bytes.length,
        sha256,
        caminhoInterno: input.caminhoInterno,
        estado: "recebido",
        destinatarioDeclarado: input.destinatarioDeclarado,
      },
    });

    await tx.eventoDoArquivoDaCelula.create({
      data: {
        workspaceId: input.workspaceId,
        arquivoId: criado.id,
        tipo: "recebido",
        autor: input.autor,
        origem: "sistema",
        detalhe: "Versão produzida pela casa registrada, aguardando aprovação de envio.",
      },
    });

    return { ok: true, arquivoId: criado.id, versao };
  });
}

/**
 * `recebido → aprovado_para_envio`. Ver a LACUNA DECLARADA no topo do
 * arquivo: esta função NÃO verifica se a Qualidade de fato aprovou — quem
 * chama é responsável por isso, fora desta pasta.
 */
export async function aprovarParaEnvio(input: {
  workspaceId: string;
  arquivoId: string;
  autor: string;
}): Promise<{ ok: true } | { ok: false; motivo: string }> {
  return prisma.$transaction(async (tx) => {
    const arquivo = await tx.arquivoDaCelula.findUnique({ where: { id: input.arquivoId } });
    if (!arquivo || arquivo.workspaceId !== input.workspaceId) {
      return { ok: false, motivo: "Arquivo não encontrado neste workspace." };
    }
    const estado = estadoDoArquivoDeclarado(arquivo.estado) ?? "recebido";
    if (estado !== "recebido") {
      return { ok: false, motivo: `Só é possível aprovar para envio a partir de "recebido" — o arquivo está em "${estado}".` };
    }

    await tx.arquivoDaCelula.update({ where: { id: arquivo.id }, data: { estado: "aprovado_para_envio" } });
    await tx.eventoDoArquivoDaCelula.create({
      data: {
        workspaceId: input.workspaceId,
        arquivoId: arquivo.id,
        tipo: "liberado",
        autor: input.autor,
        origem: "gerente",
        detalhe: "Aprovado para envio ao cliente.",
      },
    });
    return { ok: true };
  });
}

export type ResultadoDoEnvioAoCliente = { ok: true } | { ok: false; motivo: string; abrirExcecao?: PedidoDeExcecao };

/** T1 + T2, aplicados sobre o estado LIDO do banco na hora — nunca sobre um
 *  `arquivo` que o chamador construiu à mão. Bloqueado grava `envio_bloqueado`
 *  com o motivo; aprovado atualiza `estado: "enviado"` e grava `envio`. */
export async function enviarAoCliente(input: {
  workspaceId: string;
  arquivoId: string;
  destinoPretendido: { oportunidadeId: string; clienteId?: string | null; projetoId?: string | null; destinatarioDeclarado: string };
  mensagemDeAcompanhamento?: string;
  autor: string;
}): Promise<ResultadoDoEnvioAoCliente> {
  return prisma.$transaction(async (tx) => {
    const registro = await tx.arquivoDaCelula.findUnique({ where: { id: input.arquivoId } });
    if (!registro || registro.workspaceId !== input.workspaceId) {
      return { ok: false, motivo: "Arquivo não encontrado neste workspace." };
    }

    const estado = estadoDoArquivoDeclarado(registro.estado) ?? "recebido";
    const veredicto = avaliarEnvioAoCliente({
      arquivo: {
        id: registro.id,
        workspaceId: registro.workspaceId,
        oportunidadeId: registro.oportunidadeId,
        clienteId: registro.clienteId,
        projetoId: registro.projetoId,
        direcao: registro.direcao === "cliente_para_dioli" ? "cliente_para_dioli" : "dioli_para_cliente",
        linhagemId: registro.linhagemId,
        versao: registro.versao,
        destinatarioDeclarado: registro.destinatarioDeclarado,
        estado,
        caminhoInterno: registro.caminhoInterno,
      },
      destinoPretendido: input.destinoPretendido,
      mensagemDeAcompanhamento: input.mensagemDeAcompanhamento,
    });

    if (!veredicto.ok) {
      await tx.eventoDoArquivoDaCelula.create({
        data: {
          workspaceId: input.workspaceId,
          arquivoId: registro.id,
          tipo: "envio_bloqueado",
          autor: input.autor,
          origem: "sistema",
          detalhe: veredicto.motivo,
        },
      });
      return { ok: false, motivo: veredicto.motivo, abrirExcecao: veredicto.abrirExcecao };
    }

    await tx.arquivoDaCelula.update({ where: { id: registro.id }, data: { estado: "enviado" } });
    await tx.eventoDoArquivoDaCelula.create({
      data: {
        workspaceId: input.workspaceId,
        arquivoId: registro.id,
        tipo: "envio",
        autor: input.autor,
        origem: "gerente",
        detalhe: "Arquivo enviado ao cliente após conferência de destinatário e de endereço interno.",
      },
    });
    return { ok: true };
  });
}

// ── Link interno temporário para o operador ────────────────────────────────

/** Confirma que o arquivo existe neste workspace antes de assinar — evita
 *  gerar um link "válido" para um id que não pertence a este workspace. */
export async function linkInternoParaOperador(input: {
  workspaceId: string;
  arquivoId: string;
  segredo: string;
  validadeMs?: number;
}): Promise<{ ok: true; link: string } | { ok: false; motivo: string }> {
  const registro = await prisma.arquivoDaCelula.findUnique({ where: { id: input.arquivoId }, select: { workspaceId: true } });
  if (!registro || registro.workspaceId !== input.workspaceId) {
    return { ok: false, motivo: "Arquivo não encontrado neste workspace." };
  }
  const validoAteEm = new Date(Date.now() + (input.validadeMs ?? 30 * 60_000));
  const link = linkInternoTemporario({ arquivoId: input.arquivoId, validoAteEm, segredo: input.segredo });
  return { ok: true, link };
}
