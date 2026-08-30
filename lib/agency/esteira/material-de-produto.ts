// A ETAPA QUE FALTAVA: PEDIR O PRODUTO DO CLIENTE.
//
// ─── Por que existe (06/08/2026) ─────────────────────────────────────────────
//
// Comparativo do CEO (`docs/projetos/foocci/comparativo-06-08.md`): o produto do
// cliente aparece em **7 de 10** peças de referência e em **0 de 6** das nossas.
// Nas nossas ele só existe como palavra escrita — foto genérica, frase, logo no
// canto. "Qualquer software de restaurante poderia assinar as nossas peças sem
// trocar uma vírgula."
//
// E o diagnóstico é de INSUMO, não de talento: **a esteira nunca pediu**. Não
// havia etapa que pedisse captura de tela, embalagem, uniforme ou app. O Design
// não podia pôr na peça o que ninguém tinha coletado.
//
// ─── A regra que governa este arquivo ────────────────────────────────────────
//
// **Material ausente vira PERGUNTA ao cliente, nunca invenção.** É por isso que
// a saída daqui é `MaterialRequest` — a tabela que já trava a produção e já
// aparece no portal sob "A produção está esperando:" — e não um campo marcado
// como "assumimos que não tem".
//
// E o inverso também vale, e é a metade que detector nenhum lembra: **não se
// pede o que não faz sentido.** Pedir "3 capturas do seu app" a uma padaria é
// alarme falso, e alarme falso recorrente treina o cliente a ignorar a lista
// inteira — inclusive o item que importava. Por isso cada pedido tem um
// gatilho, e o gatilho lê o que o CLIENTE ESCREVEU, nunca o que a gente supõe
// do segmento dele.
//
// ─── O terceiro caso, que é o mais comum ─────────────────────────────────────
//
// Quando o texto do cliente não diz **nem que tem, nem que não tem** produto
// digital, a resposta certa não é pedir (falso alarme) nem pular (o buraco
// original). É **perguntar** — e a pergunta é ela própria um `MaterialRequest`,
// porque é isso que faz alguém responder. Ausência de informação não é
// informação: não vira "não tem".

import { prisma } from "@/lib/db/client";
import { abrirPedido } from "./pedidos";

/** Quem pede. Não é um agente de departamento: é a etapa de onboarding da
 *  esteira, e o cliente precisa ler "Equipe Dioli", não "a2". */
const PEDINTE = { agentId: "pm-onboarding", agenteLabel: "Onboarding" };

export type GatilhoDeMaterial = "sempre" | "produto_digital" | "produto_fisico" | "duvida_digital";

export interface MaterialDeProduto {
  tipo: string;
  /** O que o cliente lê. Concreto e contável — "3 a 5 fotos" é atendível;
   *  "material da marca" produz um arquivo solto e mais uma rodada. */
  descricao: string;
  gatilho: GatilhoDeMaterial;
}

/**
 * O catálogo. Fechado de propósito: lista aberta gerada por IA a cada projeto
 * pede coisa diferente para cada cliente e ninguém consegue medir se a coleta
 * melhorou.
 */
export const CATALOGO_DE_MATERIAL_DE_PRODUTO: MaterialDeProduto[] = [
  {
    tipo: "produto_captura",
    descricao:
      "3 a 5 capturas de tela REAIS do seu app/painel/site — as telas que você mais gostaria de mostrar. Precisam ser capturas de verdade: não desenhamos tela nem inventamos números, porque o que aparece na peça é promessa do que o produto entrega.",
    gatilho: "produto_digital",
  },
  {
    tipo: "produto_existe_digital",
    descricao:
      "Você tem app, painel, site com área logada ou sistema próprio? Se sim, mande 3 a 5 capturas de tela reais. Se não tem, é só responder \"não tenho\" — a resposta muda o tipo de peça que produzimos para você.",
    gatilho: "duvida_digital",
  },
  {
    tipo: "produto_embalagem",
    descricao:
      "Fotos da sua embalagem, sacola, caixa, rótulo ou etiqueta — a marca no mundo físico. 3 a 5 fotos, com boa luz, de preferência do produto fechado e aberto.",
    gatilho: "produto_fisico",
  },
  {
    tipo: "produto_em_uso",
    descricao:
      "3 a 5 fotos do seu produto/serviço sendo usado de verdade: entregando, atendendo, na mão do cliente. É o que separa uma peça sua de uma foto de banco de imagens.",
    gatilho: "sempre",
  },
  {
    tipo: "marca_aplicada",
    descricao:
      "Fotos da sua marca aplicada: uniforme, avental, fachada, adesivo, veículo. Se não existir ainda, responda \"ainda não temos\" — não vamos inventar.",
    gatilho: "sempre",
  },
  {
    tipo: "marca_arquivo",
    descricao:
      "O arquivo da sua logo em PNG com fundo transparente ou SVG (não serve print, nem foto de tela). Se tiver manual de marca, mande junto.",
    gatilho: "sempre",
  },
];

// ── Os gatilhos, lidos do que o cliente escreveu ─────────────────────────────

/** Palavras que só aparecem quando existe produto digital de verdade. Ficam
 *  aqui, nomeadas, para que a decisão seja auditável — e não um prompt. */
const SINAIS_DIGITAIS = [
  "app", "aplicativo", "software", "saas", "sistema", "plataforma", "painel",
  "dashboard", "assinatura mensal", "área logada", "area logada", "portal do cliente",
  "cardápio digital", "cardapio digital", "e-commerce", "ecommerce", "loja virtual",
  "marketplace", "crm", "erp", "startup",
  // ⚠️ "tecnologia" SAIU em 24/08/2026, e o motivo está medido.
  //
  // No case Farol 27 (padaria) o briefing dizia *"Ana — dona, decisora final,
  // pouca familiaridade com tecnologia"*. A palavra estava lá, e ela não fala
  // do PRODUTO do cliente: fala do letramento da dona. Sozinha, "tecnologia"
  // não é evidência de que existe app, painel ou área logada para fotografar —
  // e era ela que mandava um pedido de captura de tela para uma padaria.
  //
  // As outras palavras desta lista nomeiam uma COISA que existe e pode ser
  // capturada. Esta nomeava um assunto. Quem tem produto digital de verdade
  // continua caindo aqui por "app", "sistema", "plataforma", "e-commerce" — e
  // quem não cai em nenhuma recebe a PERGUNTA (`duvida_digital`), que é a
  // resposta certa para "não sei", em vez de um falso alarme.
];

/** Palavras que indicam produto que existe no mundo físico. */
const SINAIS_FISICOS = [
  "loja", "restaurante", "padaria", "confeitaria", "doceria", "bolo", "pizzaria",
  "lanchonete", "café", "cafeteria", "bar", "mercado", "salão", "salao", "barbearia",
  "clínica", "clinica", "academia", "produto", "embalagem", "delivery", "food",
  "moda", "roupa", "cosmético", "cosmetico", "artesanal", "fábrica", "fabrica",
];

function normalizar(texto: string): string {
  return texto.toLowerCase();
}

/**
 * ── A NEGAÇÃO CONTA (24/08/2026) ────────────────────────────────────────────
 *
 * O gatilho lia o texto do cliente com `includes` puro. No case Farol 27 o
 * briefing da PADARIA dizia, literalmente, *"Site antigo sem tracking
 * confiável; (…) **sem dashboard**"* — uma LACUNA declarada pela cliente — e a
 * casa leu isso como "tem dashboard" e mandou pedir 3 a 5 capturas de tela do
 * app dela.
 *
 * Ler "sem X" como "tem X" é a inversão mais cara que existe aqui: ela
 * transforma exatamente a frase em que o cliente diz que NÃO TEM na prova de
 * que TEM. E o custo não é o pedido bobo isolado — é que alarme falso
 * recorrente treina o cliente a ignorar a lista inteira, inclusive o item que
 * importava (é o que o cabeçalho deste arquivo existe para evitar).
 *
 * A janela é curta e nomeada de propósito: o negador tem de vir COLADO no
 * sinal (até três palavras antes). "sem dashboard", "não tem app", "nenhum
 * sistema" não contam; "temos um app e não temos tempo" continua contando,
 * porque ali o negador não governa o sinal.
 *
 * Na dúvida esta função NÃO inventa o oposto: sinal negado apenas deixa de ser
 * sinal. Quem fica sem nenhum sinal digital cai em `duvida_digital` e é
 * PERGUNTADO — ausência de informação não vira "não tem".
 */
const NEGADORES = ["sem", "nao", "não", "nenhum", "nenhuma", "inexistente", "falta", "faltam"];

/** Quantas palavras antes do sinal ainda contam como negação dele. */
const JANELA_DA_NEGACAO = 3;

/** Sem acento e só palavras — a régua da janela conta PALAVRAS, não letras. */
function palavras(texto: string): string[] {
  return normalizar(texto)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * O sinal aparece no texto SEM estar negado?
 *
 * Termos de mais de uma palavra ("área logada", "loja virtual") são conferidos
 * pela primeira palavra da ocorrência: é ela que o negador precederia.
 */
function contem(texto: string, termos: string[]): boolean {
  const t = normalizar(texto);
  const tokens = palavras(texto);
  return termos.some((termo) => {
    if (!t.includes(normalizar(termo))) return false;
    const alvo = palavras(termo);
    if (alvo.length === 0) return false;
    // Toda ocorrência do termo; basta UMA não negada para o sinal valer.
    for (let i = 0; i < tokens.length; i++) {
      if (alvo.some((a, k) => tokens[i + k] !== a)) continue;
      const antes = tokens.slice(Math.max(0, i - JANELA_DA_NEGACAO), i);
      if (!antes.some((w) => NEGADORES.includes(w))) return true;
    }
    // O termo está no texto mas TODA ocorrência está negada. Não é sinal.
    return false;
  });
}

export interface SinaisDoCliente {
  temProdutoDigital: boolean;
  temProdutoFisico: boolean;
}

/**
 * Lê os sinais do texto REAL do cliente (nome do negócio, segmento, serviços,
 * contexto do briefing). Nada aqui é inferido do que "costuma ser": ou a
 * palavra está no que ele escreveu, ou não está.
 */
export function lerSinaisDoCliente(textoDoCliente: string): SinaisDoCliente {
  return {
    temProdutoDigital: contem(textoDoCliente, SINAIS_DIGITAIS),
    temProdutoFisico: contem(textoDoCliente, SINAIS_FISICOS),
  };
}

/**
 * Quais materiais pedir a este cliente.
 *
 * A regra do `duvida_digital` é o coração: sem sinal digital, NÃO se pede
 * captura de tela (seria o falso alarme) e NÃO se conclui que não existe
 * (seria inventar). Pergunta-se.
 */
export function materiaisAPedir(sinais: SinaisDoCliente): MaterialDeProduto[] {
  return CATALOGO_DE_MATERIAL_DE_PRODUTO.filter((m) => {
    switch (m.gatilho) {
      case "sempre":
        return true;
      case "produto_digital":
        return sinais.temProdutoDigital;
      case "duvida_digital":
        return !sinais.temProdutoDigital;
      case "produto_fisico":
        return sinais.temProdutoFisico;
    }
  });
}

// ── A etapa, ligada ao projeto ───────────────────────────────────────────────

export interface ColetaDeProduto {
  abertos: string[];
  jaExistiam: number;
  sinais: SinaisDoCliente;
  /**
   * Quantos pedidos EFETIVAMENTE foram levados ao cliente nesta chamada.
   *
   * Existe porque abrir e pedir eram duas coisas, e só a primeira acontecia:
   * ver o bloco "PEDIR ANTES DE COBRAR" em `coletarMaterialDeProduto`.
   */
  cobrados: number;
  /** Por que a mensagem não saiu, quando não saiu. Vazio = saiu (ou nada a mandar). */
  naoCobrouPorque?: string;
}

/**
 * Abre os pedidos de material de produto para um projeto recém-nascido.
 *
 * Idempotente por construção: `abrirPedido` não duplica pedido em aberto do
 * mesmo tipo pelo mesmo pedinte. Rodar duas vezes não cobra o cliente duas
 * vezes — cobrança dupla pelo mesmo material é o defeito que a esteira já
 * corrigiu uma vez (`materiais.ts`) e não vai reintroduzir aqui.
 *
 * NUNCA lança: onboarding sem material é problema; onboarding que impede o
 * projeto de nascer é problema maior.
 */
export async function coletarMaterialDeProduto(input: {
  projectId: string;
  clientRequestId?: string | null;
}): Promise<ColetaDeProduto> {
  let texto = "";
  if (input.clientRequestId) {
    const req = await prisma.clientRequestDb
      .findUnique({
        where: { id: input.clientRequestId },
        select: { businessName: true, segment: true, services: true, rawContext: true, briefingJson: true },
      })
      .catch(() => null);
    if (req) {
      texto = [req.businessName, req.segment, req.services, req.rawContext, req.briefingJson ?? ""].join(" \n ");
    }
  }

  const sinais = lerSinaisDoCliente(texto);
  const abertos: string[] = [];
  let jaExistiam = 0;

  for (const material of materiaisAPedir(sinais)) {
    const r = await abrirPedido({
      projectId: input.projectId,
      tipo: material.tipo,
      descricao: material.descricao,
      ...PEDINTE,
    });
    if (r.criado) abertos.push(material.tipo);
    else if (r.id) jaExistiam++;
  }

  // ═══ PEDIR ANTES DE COBRAR (24/08/2026) ═══════════════════════════════════
  //
  // Até aqui esta função ABRIA os pedidos e ia embora. `abrirPedido` grava a
  // linha em `MaterialRequest` com `askedClientAt` VAZIO — quem preenche esse
  // campo é `cobrarCliente`, e ela tinha um único chamador, dentro de
  // `run-execution`, que só dispara pelos pedidos que os ESPECIALISTAS abrem.
  // Os pedidos de onboarding, abertos aqui, não passavam por lá nunca.
  //
  // Medido na produção no case Farol 27: CINCO pedidos de material abertos no
  // nascimento do projeto, `askedClientAt: null` nos cinco — e a esteira
  // dizendo à cliente *"Responder os 5 pedidos que te mandamos na conversa"*.
  // Nenhum tinha sido mandado. A varredura de 24h (`cobrarPedidosEsquecidos`)
  // é a rede embaixo disto, não o caminho: um dia inteiro cobrando o cliente
  // por uma mensagem que não existe já é o estrago feito.
  //
  // Agora o pedido SAI aqui, na mesma passada em que nasce, pela MESMA voz do
  // resto da casa (`cobrarCliente`: muitos agentes atrás, uma voz na frente).
  // Idempotente: `cobrarCliente` só junta o que ainda não foi perguntado, então
  // rodar duas vezes não manda a mesma pergunta duas vezes.
  //
  // ⚠️ Best-effort e nunca lança: onboarding sem material é problema; onboarding
  // que impede o projeto de nascer é problema maior. Quando a mensagem NÃO sai,
  // o motivo volta em `naoCobrouPorque` — e o pedido continua com
  // `askedClientAt` vazio, que é o que faz a etapa NÃO cobrar resposta dele
  // (`fases.ts`) e a varredura de 24h tentar de novo. Falha fechada: sem prova
  // de que o pedido saiu, não se cobra.
  let cobrados = 0;
  let naoCobrouPorque: string | undefined;
  if (abertos.length > 0) {
    if (!input.clientRequestId) {
      naoCobrouPorque = "o projeto não tem solicitação de portal — não há conversa onde perguntar";
    } else {
      try {
        const { cobrarCliente } = await import("./pedidos");
        const projeto = await prisma.project
          .findUnique({ where: { id: input.projectId }, select: { client: { select: { name: true } } } })
          .catch(() => null);
        cobrados = await cobrarCliente({
          projectId: input.projectId,
          clientRequestId: input.clientRequestId,
          nomeDoNegocio: projeto?.client?.name ?? "seu projeto",
        });
        if (cobrados === 0) naoCobrouPorque = "a mensagem não pôde ser escrita no portal";
      } catch (e) {
        naoCobrouPorque = e instanceof Error ? e.message : "falha ao levar o pedido ao cliente";
      }
    }
    if (naoCobrouPorque) {
      console.warn("[esteira] pedidos de material abertos e NÃO levados ao cliente:", naoCobrouPorque);
    }
  }

  return { abertos, jaExistiam, sinais, cobrados, ...(naoCobrouPorque ? { naoCobrouPorque } : {}) };
}
