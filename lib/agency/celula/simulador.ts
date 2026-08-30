// ─── O SIMULADOR DE CONVERSAS — percorrer o funil sem nada sair daqui ──────
//
// Critério de conclusão declarado pelo CEO: *"sem simulador de conversa"* está
// na lista do que torna a V1 NÃO concluída. E a ordem descreve o que ele tem
// de permitir ao gerente: escolher um projeto, simular respostas do cliente,
// ver a mensagem selecionada, verificar variáveis preenchidas, ver a política
// aplicada, aprovar ou reprovar, testar objeções, testar anexos, e
// **percorrer o funil completo sem enviar nada externamente**.
//
// ── A GARANTIA CENTRAL É ESTRUTURAL, NÃO UMA FLAG ─────────────────────────
// A tentação é um `if (modoSimulacao) return` antes do envio. Está errado pelo
// motivo de sempre: uma flag pode ser lida errado, invertida num refactor, ou
// simplesmente não chegar até a última camada — e aí o simulador manda mensagem
// de verdade para um cliente de verdade.
//
// Aqui **não existe caminho de envio**. Este arquivo não importa o navegador,
// não importa `fetch`, não conhece nenhuma porta de saída, e
// `__tests__/celula/simulador.test.ts` faz uma VARREDURA ESTÁTICA do fonte que
// falha se qualquer um desses símbolos aparecer. É o mesmo desenho da varredura
// que protege a trilha append-only: a garantia não é "prometemos não chamar",
// é "não há o que chamar".
//
// ── O QUE O SIMULADOR PROVA, E O QUE ELE NÃO PROVA ────────────────────────
// Ele prova que as DECISÕES da casa se encadeiam: o funil aceita a sequência,
// as travas barram o que têm de barrar, e o estado final é o esperado. Isso é
// o cérebro decidindo certo.
//
// Ele **não** prova que a casa consegue operar o 99Freelas — não há navegador,
// não há login, não há anexo real. Confundir as duas coisas seria descrever
// intenção como entrega, e o CEO proibiu isso com todas as letras.

import {
  ESTADO_INICIAL,
  avaliarTransicao,
  type Estado,
  type OrigemDaTransicao,
} from "@/lib/agency/celula/funil";
import { avaliarSaidaDoCanal, type EscopoDeSaida, type ConsentimentoDeSaida } from "@/lib/agency/celula/saida-do-canal";
import { avaliarServico } from "@/lib/agency/celula/catalogo-ofertavel";
import { avaliarRitmo, type ConfiguracaoDeRitmo } from "@/lib/agency/celula/ritmo";
import { podeNaCelula, type Credencial, type AcaoDaCelula } from "@/lib/agency/celula/papeis";

/** Um passo do roteiro que o gerente monta. Conjunto FECHADO de tipos. */
export type PassoDoRoteiro =
  /** A casa move a oportunidade no funil. */
  | { tipo: "avancar"; para: Estado; justificativa: string; autor: string; origem: OrigemDaTransicao }
  /** O cliente diz alguma coisa. É DADO — nada aqui interpreta como ordem. */
  | { tipo: "cliente_diz"; texto: string }
  /** A casa tenta sair do canal (contato, briefing, contratação, pagamento). */
  | { tipo: "tentar_sair_do_canal"; escopo: EscopoDeSaida; garantia: unknown; consentimento?: ConsentimentoDeSaida | null }
  /** A casa tenta montar um serviço na proposta. */
  | { tipo: "montar_servico"; servicoId: string; modoAutomatico: boolean }
  /** Alguém tenta uma ação que exige permissão. */
  | { tipo: "tentar_acao"; credencial: Credencial; acao: AcaoDaCelula }
  /** A casa tenta agir, e o ritmo decide. */
  | { tipo: "tentar_agir"; segundosDesdeAUltima: number | null; acoesNaHora: number; acoesNoDia: number };

export interface PassoSimulado {
  ordem: number;
  tipo: PassoDoRoteiro["tipo"];
  /** O estado do funil DEPOIS deste passo. */
  estado: Estado;
  aceito: boolean;
  /** Por que aceitou ou barrou. Sempre preenchido — passo sem motivo não se audita. */
  motivo: string;
  /** Qual trava respondeu. É o que a tela mostra ao gerente. */
  travaQueRespondeu: string;
}

export interface ResultadoDaSimulacao {
  passos: readonly PassoSimulado[];
  estadoFinal: Estado;
  /** Quantos passos foram barrados. Simulação sem nenhum barrado costuma ser
   *  roteiro que não testou nada. */
  barrados: number;
  /** O que o cliente disse, guardado como DADO, na ordem. Nunca interpretado
   *  como instrução por nenhuma função deste arquivo. */
  ditoPeloCliente: readonly string[];
}

export interface OpcoesDaSimulacao {
  estadoInicial?: Estado;
  agora?: Date;
  configuracaoDeRitmo?: ConfiguracaoDeRitmo | null;
}

/**
 * Percorre o roteiro. Cada passo consulta a trava que lhe corresponde e
 * registra o veredito — inclusive quando barra.
 *
 * Um passo barrado **não interrompe** a simulação: o gerente precisa ver o
 * funil inteiro para saber onde ele emperra, e parar no primeiro "não"
 * esconderia todos os problemas seguintes atrás do primeiro.
 */
export function simularJornada(
  roteiro: readonly PassoDoRoteiro[],
  opcoes: OpcoesDaSimulacao = {},
): ResultadoDaSimulacao {
  const agora = opcoes.agora ?? new Date("2026-08-30T12:00:00Z");
  let estado: Estado = opcoes.estadoInicial ?? ESTADO_INICIAL;
  const passos: PassoSimulado[] = [];
  const ditoPeloCliente: string[] = [];

  roteiro.forEach((p, i) => {
    const ordem = i + 1;

    if (p.tipo === "cliente_diz") {
      // Guardado como DADO. Note que NADA abaixo lê este texto para decidir
      // coisa alguma — é registro, não entrada de decisão.
      ditoPeloCliente.push(p.texto);
      passos.push({
        ordem,
        tipo: p.tipo,
        estado,
        aceito: true,
        motivo: "fala do cliente registrada como dado — nenhuma regra foi consultada nela.",
        travaQueRespondeu: "nenhuma (registro)",
      });
      return;
    }

    if (p.tipo === "avancar") {
      const v = avaliarTransicao({
        de: estado,
        para: p.para,
        autor: p.autor,
        origem: p.origem,
        justificativa: p.justificativa,
      });
      if (v.ok) estado = v.para;
      passos.push({
        ordem,
        tipo: p.tipo,
        estado,
        aceito: v.ok,
        motivo: v.ok ? `transição ${v.de} → ${v.para} aceita.` : v.motivo,
        travaQueRespondeu: "funil (tabela de pares permitidos)",
      });
      return;
    }

    if (p.tipo === "tentar_sair_do_canal") {
      const v = avaliarSaidaDoCanal({ escopo: p.escopo, garantia: p.garantia, consentimento: p.consentimento ?? null });
      passos.push({
        ordem,
        tipo: p.tipo,
        estado,
        aceito: v.pode,
        motivo: v.pode ? `saída autorizada para "${v.escopo}".` : v.motivo,
        travaQueRespondeu: "saída do canal (decisão 3 do CEO)",
      });
      return;
    }

    if (p.tipo === "montar_servico") {
      const v = avaliarServico(p.servicoId, { modoAutomatico: p.modoAutomatico });
      passos.push({
        ordem,
        tipo: p.tipo,
        estado,
        aceito: v.ofertavel,
        motivo: v.ofertavel ? `"${v.servico.nome}" é ofertável.` : v.motivo,
        travaQueRespondeu: "catálogo derivado da capacidade (decisão 5 do CEO)",
      });
      return;
    }

    if (p.tipo === "tentar_acao") {
      const v = podeNaCelula(p.credencial, p.acao);
      passos.push({
        ordem,
        tipo: p.tipo,
        estado,
        aceito: v.pode,
        motivo: v.pode ? `permitido: "${p.acao}".` : v.motivo,
        travaQueRespondeu: "papéis e permissões (Gerente e SDR)",
      });
      return;
    }

    // tentar_agir
    const ultima =
      p.segundosDesdeAUltima === null ? null : new Date(agora.getTime() - p.segundosDesdeAUltima * 1000);
    const v = avaliarRitmo(
      { ultimaAcaoEm: ultima, acoesNaUltimaHora: p.acoesNaHora, acoesNoDia: p.acoesNoDia },
      agora,
      opcoes.configuracaoDeRitmo,
    );
    passos.push({
      ordem,
      tipo: p.tipo,
      estado,
      aceito: v.pode,
      motivo: v.pode ? "ritmo dentro do permitido." : v.motivo,
      travaQueRespondeu: "limitador de ritmo",
    });
  });

  return {
    passos,
    estadoFinal: estado,
    barrados: passos.filter((x) => !x.aceito).length,
    ditoPeloCliente,
  };
}
