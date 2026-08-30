// proxima-mensagem.ts — FICHA G: O MOTOR DE DECISÃO DA PRÓXIMA MENSAGEM
//
// Fonte: docs/celula-prospeccao/despachos/G-motor-da-proxima-mensagem.md.
//
// ─── ESTE ARQUIVO NÃO INVENTA REGRA NOVA — ELE COSTURA ─────────────────────
//
// As sete peças (trava-de-conversa, entrada-hostil, objecoes, biblioteca,
// perguntas-por-servico, anti-generico, compromisso) já existem e já foram
// escritas por outros especialistas da Onda 2. Este módulo só decide EM QUE
// ORDEM elas rodam para produzir UMA mensagem, ou dizer por que não pode.
//
// ─── AS DUAS REGRAS LITERAIS DO CEO — SÃO TRAVA, NÃO ESTILO ────────────────
//
//   1. "A mensagem primeiro RESPONDE ao cliente, e só depois faz a próxima
//      pergunta." `MensagemMontada.texto` é sempre `resposta` seguida de
//      `pergunta` — nunca o contrário — e se o cliente fez uma pergunta
//      direta ("?" no texto dele) sem que `resposta` tenha conteúdo, o motor
//      BLOQUEIA em vez de emitir uma mensagem que ignora o cliente.
//   2. "No máximo UMA pergunta principal por mensagem." A assinatura
//      (`pergunta: string | null`, nunca lista) é a primeira metade da trava;
//      a segunda é a contagem de "?" no `texto` final — mais de um ⇒
//      BLOQUEIO, mesmo que a segunda pergunta tenha entrado escondida dentro
//      da própria `resposta`.
//
// ─── A ORDEM DAS TRAVAS (a alma do arquivo) ─────────────────────────────────
//
//   1. reservar a conversa (mutex) e ler o estado
//   2. isolar o texto do cliente (dado, nunca ordem — `entrada-hostil.ts`)
//   3. classificar OBJEÇÃO; se exigir concessão, `podeConceder` manda — sem
//      autorização registrada, ESCALA
//   4. senão, escolher o MODELO (só `estado: "aprovado"`, respeita o teto de
//      uso já registrado na conversa)
//   5. PREÇO, se o modelo pedir — sempre do motor de preços, nunca de
//      constante; motor sem resposta ⇒ ESCALA, jamais número improvisado
//   6. montar a RESPOSTA, depois a ÚNICA PERGUNTA (`proximaPergunta`)
//   7. a trava estrutural de UMA pergunta só (contagem de "?")
//   8. as travas de estado da própria conversa (mensagem duplicada,
//      contradição com a última fala enviada)
//   9. ANTI-GENÉRICO — repetido/parecido/genérico ⇒ BLOQUEIO
//  10. GUARDIÃO (`validarTexto`) — conteúdo proibido ⇒ BLOQUEIO
//  11. COMPROMISSO — promete data? registra ANTES de liberar
//  12. LIBERAR a trava de conversa — em TODOS os caminhos, exceção inclusive
//
// Nenhuma etapa é pulável por configuração. Não há flag de bypass.
//
// ─── POR QUE A LIBERAÇÃO NÃO FICA A CARGO DE QUEM CHAMA ─────────────────────
//
// `comATravaDaConversa` (trava-de-conversa.ts), no caminho de sucesso,
// devolve `liberar()` para o CHAMADOR decidir quando soltar — porque aquele
// módulo não sabe se quem chamou ainda vai montar e enviar a fala. Este
// módulo É o chamador que monta a fala inteira, então ele mesmo libera a
// reserva no fim de TODO caminho — inclusive `"enviar"` — e por isso usa a
// porta (`reservar`/`ler`/`liberar`) diretamente em vez do wrapper.
//
// ─── ENTRADA HOSTIL: O QUE ESTE MÓDULO FAZ E O QUE ELE NÃO FAZ ─────────────
//
// O texto do cliente nunca é ecoado literalmente para dentro da mensagem de
// saída — `resposta` só nasce de texto aprovado (o `respostaAprovada` de uma
// objeção classificada, ou o `textoBase` de um modelo `aprovado`, os dois já
// escritos pela casa). `sinaisDeInjecao` roda para TELEMETRIA — nomeia a
// tentativa para quem for revisar a escalada — e nunca decide nada sozinho.
// `delimitarTextoDeTerceiro` mostra a fronteira: é a única forma que o texto
// do cliente teria permissão de assumir se algum dia precisasse ir para dentro
// de um prompt — este módulo não usa modelo de IA, então ele nem chega a essa
// porta, mas a disciplina fica registrada aqui para quem herdar este arquivo.

import {
  verificarMensagemDuplicada,
  verificarPerguntaRepetida,
  verificarContradicao,
  verificarLimiteDeModelo,
  type EstadoDaConversa,
  type PortaDaConversa,
} from "./trava-de-conversa";
import { delimitarTextoDeTerceiro, sinaisDeInjecao, type SinalDeInjecao } from "./entrada-hostil";
import {
  classificarObjecao,
  classificarSilencio,
  objecaoPorId,
  podeConceder,
  type ObjecaoId,
  type Concessao,
  type AutorizacaoRegistrada,
} from "./objecoes";
import { modeloParaEnvio, preencher } from "./biblioteca";
import type { ModeloDeMensagem } from "./tipos";
import { proximaPergunta as proximaPerguntaPadrao } from "./perguntas-por-servico";
import { avaliarAntiGenerico } from "./anti-generico";
import { liberarTextoComPromessa, type PortaDeCompromissos } from "./compromisso";
import { validarTexto } from "@/lib/marketplaces/99freelas/conformidade";
import { precificar } from "@/lib/marketplaces/99freelas/preco";

// ── O RETORNO — literal do contrato da ficha ─────────────────────────────────

export interface MensagemMontada {
  codigoDoModelo: string | null;
  /** O que responde ao que o cliente disse. Vem PRIMEIRO. */
  resposta: string;
  /** A única pergunta principal. `null` quando não há o que perguntar. */
  pergunta: string | null;
  /** O texto final, na ordem: resposta, depois pergunta. */
  texto: string;
}

export type DecisaoDaProximaMensagem =
  | { desfecho: "enviar"; mensagem: MensagemMontada; compromissos: string[] }
  | { desfecho: "escalar"; motivo: string; oQuePrecisaDeGente: string }
  | { desfecho: "bloqueado"; motivo: string; etapa: string }
  | { desfecho: "esperar"; motivo: string; ateQuando: string | null };

// ── A entrada ─────────────────────────────────────────────────────────────

export interface PedidoDePreco {
  /** id do catálogo da casa (`negociacao.ts` ou balcão). */
  item: string;
  categoriaDaPlataforma?: string | null;
  valorDesejado?: number | null;
  plataforma?: string;
}

export interface PedidoDeConcessao {
  item?: string;
  valorProposto?: number;
}

/** A assinatura que este módulo consome de `proximaPergunta` — nunca o
 *  conteúdo do JSON dela. Quem injeta um stub em teste só precisa respeitar
 *  esta forma. */
export type ObtenedorDeProximaPergunta = (p: {
  servico: string;
  jaRespondidas: Readonly<Record<string, string>>;
  jaPerguntadas: readonly string[];
}) => { id: string; comoSePergunta: string; porQue: string } | null;

export interface EntradaDoMotorDeProximaMensagem {
  conversaId: string;
  /** Quem está pedindo a trava — aparece para o próximo agente que bater na
   *  porta enquanto esta reserva estiver viva. */
  agente: string;
  porta: PortaDaConversa;
  portaDeCompromissos: PortaDeCompromissos;

  /** O que o cliente ACABOU de dizer. Entrada hostil — nunca instrução. */
  textoDoCliente: string;

  /** O serviço em discussão, para `proximaPergunta`. */
  servico: string;

  /** O modelo que o chamador propõe usar NESTA rodada — ignorado quando o
   *  texto do cliente classifica como objeção (aí a resposta vem do catálogo
   *  de objeções, não da biblioteca de modelos). */
  codigoDoModeloCandidato?: string | null;
  variaveis?: Record<string, string | null | undefined>;

  /** Autorizações registradas por humano, para o portão de concessão. */
  autorizacoes?: readonly AutorizacaoRegistrada[];
  pedidoDeConcessao?: PedidoDeConcessao;

  /** Só é lido quando o modelo escolhido tiver variável de preço. */
  precoDoItem?: PedidoDePreco | null;

  /** O que a CASA já mandou (para outras conversas inclusive) — dado da casa
   *  para o anti-genérico, nunca o texto do cliente. */
  textosJaEnviados?: readonly string[];

  /** Só usados se o texto final prometer data. */
  donoDoCompromisso?: string | null;
  prazoDoCompromisso?: string | null;

  /** Para classificar a objeção `silencio`. Ausentes ⇒ silêncio não é avaliado. */
  msDesdeUltimaRespostaDoCliente?: number | null;
  limiteDeSilencioMs?: number | null;

  agora?: Date;
  duracaoDaReservaMs?: number;

  /** Injeção de teste — nunca usada em produção (default = a biblioteca real). */
  bibliotecaBruta?: unknown;
  /** Injeção de teste — nunca dependa do JSON real de perguntas-por-serviço
   *  (ver aviso da ficha: outro especialista mexe nele agora). Default = a
   *  função real. */
  obterProximaPergunta?: ObtenedorDeProximaPergunta;
}

// ── Mapa fechado: só as objeções que a casa já sabe traduzir em concessão.
//    As demais (pedido_de_contato_externo, pedido_de_teste, silencio,
//    indecisao) são política fixa — a `respostaAprovada` já não concede nada,
//    então não precisam passar pelo portão. ──────────────────────────────────
const MAPA_DE_CONCESSAO: Partial<Record<ObjecaoId, Concessao>> = {
  preco: "desconto",
  comparacao_com_concorrente: "desconto",
  prazo: "alteracao_de_prazo",
  confianca: "garantia",
  portfolio: "ampliacao_de_escopo",
  escopo: "ampliacao_de_escopo",
  forma_de_pagamento: "condicao_comercial",
};

const DURACAO_PADRAO_DA_RESERVA_MS = 2 * 60 * 1000;

function contarPontosDeInterrogacao(texto: string): number {
  return (texto.match(/\?/g) ?? []).length;
}

function formatarPergunta(comoSePergunta: string): string {
  const t = comoSePergunta.trim();
  if (!t) return t;
  const comInterrogacao = t.endsWith("?") ? t : `${t}?`;
  return comInterrogacao.charAt(0).toUpperCase() + comInterrogacao.slice(1);
}

/** `Preco.ofertaFinalQueOClienteVe` já é o número que o cliente vê — só
 *  formata, nunca recalcula. */
function formatarReaisParaCliente(valor: number): string {
  return `R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── A função principal ───────────────────────────────────────────────────

export async function decidirProximaMensagem(
  entrada: EntradaDoMotorDeProximaMensagem,
): Promise<DecisaoDaProximaMensagem> {
  const agora = entrada.agora ?? new Date();
  const expiraEm = new Date(
    agora.getTime() + (entrada.duracaoDaReservaMs ?? DURACAO_PADRAO_DA_RESERVA_MS),
  ).toISOString();

  // ── 1. RESERVAR ────────────────────────────────────────────────────────
  const reservou = await entrada.porta.reservar({
    conversaId: entrada.conversaId,
    agente: entrada.agente,
    expiraEm,
  });

  if (!reservou) {
    // Nada foi reservado por nós — não há o que liberar (mesma regra de
    // `comATravaDaConversa`).
    const estadoAtual = await entrada.porta.ler(entrada.conversaId).catch(() => null);
    const quem = estadoAtual?.agenteResponsavel ?? "outro agente";
    return {
      desfecho: "esperar",
      motivo: `A conversa "${entrada.conversaId}" já está sendo atendida por "${quem}". Espere a liberação antes de decidir a próxima mensagem.`,
      ateQuando: null,
    };
  }

  let liberado = false;
  const finalizar = async (): Promise<void> => {
    if (liberado) return;
    liberado = true;
    await entrada.porta.liberar({ conversaId: entrada.conversaId, agente: entrada.agente });
  };

  try {
    const estado = await entrada.porta.ler(entrada.conversaId);
    if (!estado) {
      await finalizar();
      return {
        desfecho: "bloqueado",
        motivo: `A conversa "${entrada.conversaId}" não foi encontrada depois de reservada. Ausência de estado não é conversa nova por padrão — confirme o id antes de decidir.`,
        etapa: "trava_de_conversa",
      };
    }

    // ── 2. ISOLAR o texto do cliente — dado, nunca ordem ───────────────────
    // `delimitado` existe para documentar a fronteira (nenhum prompt de IA é
    // montado neste módulo, então ele não é consumido adiante); `sinais` é
    // telemetria que só entra em mensagens de ESCALADA para GENTE, nunca
    // muda uma decisão.
    const delimitado = delimitarTextoDeTerceiro(entrada.textoDoCliente);
    void delimitado;
    const sinaisHostis: SinalDeInjecao[] = sinaisDeInjecao(entrada.textoDoCliente);
    const clienteFezPerguntaDireta = entrada.textoDoCliente.includes("?");

    // ── 3/4. OBJEÇÃO ou MODELO ──────────────────────────────────────────────
    const deteccaoObjecao =
      classificarObjecao(entrada.textoDoCliente) ??
      (entrada.msDesdeUltimaRespostaDoCliente != null && entrada.limiteDeSilencioMs != null
        ? classificarSilencio({
            msDesdeUltimaRespostaDoCliente: entrada.msDesdeUltimaRespostaDoCliente,
            limiteDeSilencioMs: entrada.limiteDeSilencioMs,
          })
        : null);

    let modelo: ModeloDeMensagem | null = null;
    let respostaBase = "";
    let variaveisUsadas: Record<string, string | null | undefined> = {};

    if (deteccaoObjecao) {
      const objecao = objecaoPorId(deteccaoObjecao.id);
      if (!objecao) {
        await finalizar();
        return {
          desfecho: "escalar",
          motivo: `A objeção "${deteccaoObjecao.id}" foi reconhecida, mas não há definição cadastrada para ela no catálogo.`,
          oQuePrecisaDeGente: "cadastrar a definição desta objeção em docs/plataformas/99freelas/objecoes.json.",
        };
      }

      const concessao = MAPA_DE_CONCESSAO[deteccaoObjecao.id as ObjecaoId];
      if (concessao) {
        const veredicto = podeConceder({
          concessao,
          item: entrada.pedidoDeConcessao?.item,
          valorProposto: entrada.pedidoDeConcessao?.valorProposto,
          autorizacoes: entrada.autorizacoes ?? [],
        });
        if (!veredicto.ok) {
          await finalizar();
          return {
            desfecho: "escalar",
            motivo: veredicto.motivo,
            oQuePrecisaDeGente: objecao.quandoEscalarAoGerente || `autorizar "${concessao}" para esta conversa.`,
          };
        }
      }

      respostaBase = objecao.respostaAprovada;
    } else if (entrada.codigoDoModeloCandidato) {
      const leitura = modeloParaEnvio(entrada.codigoDoModeloCandidato, entrada.bibliotecaBruta);
      if (!leitura.ok) {
        await finalizar();
        return {
          desfecho: "escalar",
          motivo: leitura.motivo,
          oQuePrecisaDeGente: `aprovar o modelo "${entrada.codigoDoModeloCandidato}" ou indicar outro modelo já aprovado.`,
        };
      }
      modelo = leitura.modelo;

      const bloqueioDeLimite = verificarLimiteDeModelo(estado, modelo.codigo, modelo.maximoDeUsos);
      if (bloqueioDeLimite) {
        await finalizar();
        return { desfecho: "bloqueado", motivo: bloqueioDeLimite.motivo, etapa: "limite_de_modelo" };
      }

      variaveisUsadas = { ...(entrada.variaveis ?? {}) };

      // ── 5. PREÇO, se o modelo pedir ───────────────────────────────────────
      const variaveisDePreco = modelo.variaveisObrigatorias.filter((v) => /pre[cç]o|valor/i.test(v));
      if (variaveisDePreco.length > 0) {
        const pedidoDePreco = entrada.precoDoItem;
        if (!pedidoDePreco) {
          await finalizar();
          return {
            desfecho: "escalar",
            motivo: `O modelo "${modelo.codigo}" exige a(s) variável(is) de preço ${variaveisDePreco.join(", ")}, mas nenhum pedido de preço foi informado ao motor. Preço nunca é inventado.`,
            oQuePrecisaDeGente: "informar o item a precificar (ou confirmar o valor manualmente antes de enviar).",
          };
        }
        const preco = precificar(pedidoDePreco);
        if (!preco.ok) {
          await finalizar();
          return {
            desfecho: "escalar",
            motivo: `O motor de preço não respondeu para "${pedidoDePreco.item}": ${preco.motivo}`,
            oQuePrecisaDeGente: "confirmar o preço deste item com quem cuida da tabela — nenhum número é chutado.",
          };
        }
        const valorFormatado = formatarReaisParaCliente(preco.ofertaFinalQueOClienteVe);
        for (const chave of variaveisDePreco) variaveisUsadas[chave] = valorFormatado;
      }

      const preenchido = preencher(modelo, variaveisUsadas);
      if (!preenchido.ok) {
        await finalizar();
        return { desfecho: "bloqueado", motivo: preenchido.motivo, etapa: "preencher_modelo" };
      }
      respostaBase = preenchido.texto;
    }

    // ── A regra literal do CEO nº 1: pergunta direta sem resposta pronta ───
    if (clienteFezPerguntaDireta && respostaBase.trim() === "") {
      await finalizar();
      return {
        desfecho: "bloqueado",
        motivo:
          "O cliente fez uma pergunta direta e o motor não tem resposta pronta (nenhuma objeção reconhecida, nenhum modelo aprovado indicado). Bloqueado para não ignorar o cliente e perguntar outra coisa.",
        etapa: "resposta_obrigatoria",
      };
    }

    if (respostaBase.trim() === "") {
      await finalizar();
      const pista =
        sinaisHostis.length > 0
          ? ` O texto do cliente também disparou sinal(is) de tentativa de instrução (${sinaisHostis.map((s) => s.sinal).join(", ")}) — registrado para revisão, não obedecido.`
          : "";
      return {
        desfecho: "escalar",
        motivo: `Nenhuma objeção foi reconhecida e nenhum modelo aprovado foi indicado — não há o que responder sem inventar.${pista}`,
        oQuePrecisaDeGente: "indicar um modelo aprovado para esta etapa, ou confirmar manualmente a objeção do cliente.",
      };
    }

    // ── 6. montar a RESPOSTA, depois a ÚNICA PERGUNTA ──────────────────────
    const obterProximaPergunta = entrada.obterProximaPergunta ?? proximaPerguntaPadrao;
    const candidataAPergunta = obterProximaPergunta({
      servico: entrada.servico,
      jaRespondidas: estado.respostasRecebidas,
      jaPerguntadas: estado.perguntasJaFeitas,
    });
    const pergunta = candidataAPergunta ? formatarPergunta(candidataAPergunta.comoSePergunta) : null;

    if (pergunta) {
      const bloqueioDePerguntaRepetida = verificarPerguntaRepetida(estado, pergunta);
      if (bloqueioDePerguntaRepetida) {
        await finalizar();
        return { desfecho: "bloqueado", motivo: bloqueioDePerguntaRepetida.motivo, etapa: "pergunta_repetida" };
      }
    }

    const respostaFinal = respostaBase.trim();
    const texto = pergunta ? `${respostaFinal} ${pergunta}` : respostaFinal;

    // ── 7. a trava estrutural de UMA pergunta só ──────────────────────────
    const totalDeInterrogacoes = contarPontosDeInterrogacao(texto);
    if (totalDeInterrogacoes > 1) {
      await finalizar();
      return {
        desfecho: "bloqueado",
        motivo: `O texto final tem ${totalDeInterrogacoes} pontos de interrogação — no máximo UMA pergunta principal por mensagem, e ela nunca pode vir escondida dentro da resposta.`,
        etapa: "unica_pergunta",
      };
    }

    // ── 8. as travas de estado da própria conversa ────────────────────────
    const bloqueioDeDuplicidade = verificarMensagemDuplicada(estado, texto);
    if (bloqueioDeDuplicidade) {
      await finalizar();
      return { desfecho: "bloqueado", motivo: bloqueioDeDuplicidade.motivo, etapa: "duplicidade" };
    }

    const bloqueioDeContradicao = verificarContradicao(estado, texto);
    if (bloqueioDeContradicao) {
      await finalizar();
      return { desfecho: "bloqueado", motivo: bloqueioDeContradicao.motivo, etapa: "contradicao" };
    }

    // ── 9. ANTI-GENÉRICO ────────────────────────────────────────────────────
    const veredictoAntiGenerico = avaliarAntiGenerico({
      textoFinal: texto,
      variaveis: variaveisUsadas,
      variaveisObrigatorias: modelo?.variaveisObrigatorias ?? [],
      textosJaEnviados: entrada.textosJaEnviados ?? [],
    });
    if (!veredictoAntiGenerico.ok) {
      await finalizar();
      return { desfecho: "bloqueado", motivo: veredictoAntiGenerico.motivo, etapa: "anti_generico" };
    }

    // ── 10. GUARDIÃO ────────────────────────────────────────────────────────
    const conformidade = validarTexto(texto);
    if (!conformidade.ok) {
      const achados = conformidade.achados
        .map((a) => `${a.regra} ("${a.trecho}", fonte: ${a.fonte})`)
        .join("; ");
      await finalizar();
      return {
        desfecho: "bloqueado",
        motivo: `O texto final viola o Guardião de conteúdo: ${achados}`,
        etapa: "guardiao",
      };
    }

    // ── 11. COMPROMISSO — registra ANTES de liberar ────────────────────────
    const veredictoDaPromessa = await liberarTextoComPromessa({
      texto,
      conversaId: entrada.conversaId,
      dono: entrada.donoDoCompromisso ?? null,
      prazo: entrada.prazoDoCompromisso ?? null,
      agora,
      porta: entrada.portaDeCompromissos,
    });
    if (!veredictoDaPromessa.ok) {
      await finalizar();
      return { desfecho: "bloqueado", motivo: veredictoDaPromessa.motivo, etapa: "compromisso" };
    }

    // ── 12. LIBERAR e devolver ──────────────────────────────────────────────
    await finalizar();
    const mensagem: MensagemMontada = {
      codigoDoModelo: modelo?.codigo ?? null,
      resposta: respostaFinal,
      pergunta,
      texto,
    };
    return { desfecho: "enviar", mensagem, compromissos: veredictoDaPromessa.compromissosCriados };
  } catch (erro) {
    await finalizar().catch(() => {
      // A exceção original importa mais que uma falha ao liberar durante o
      // tratamento dela — não deixamos um segundo erro esconder o primeiro.
    });
    throw erro;
  }
}
