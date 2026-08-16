// RECUSA NUNCA É SILENCIOSA — todo "não" do motor vira linha com motivo,
// dono e idade.
//
// ─── POR QUE ISTO EXISTE (16/08/2026) ──────────────────────────────────────
//
// O CEO passou meia hora achando que o produto tinha um defeito. Não tinha:
// o sistema SABIA o motivo (a chave `v2_execucao` estava virada para um
// `clientId` apagado no reset) e não disse. O briefing do CityJobs entrou,
// virou linha em `ClientRequestDb` e parou — sem erro na tela, sem linha no
// log, sem nada.
//
// O motor JÁ gravava recusa: `executarFuncao` chama `deps.gravarRecusa` a
// cada "não" (executor.ts) e a rota assistida grava em `RecusaV2`. O buraco
// eram os "não" que acontecem ANTES do motor abrir:
//
//   • o 403 da própria rota ("v2_execucao desligada — allowlist primeiro"):
//     devolvia HTTP e não gravava linha nenhuma;
//   • a solicitação que nunca foi levada ao motor por não ter cliente,
//     workspace ou autorização: nem chegava a existir como recusa.
//
// Este módulo é o registrador ÚNICO desses casos, para que não haja um
// segundo caminho de recusa divergindo do primeiro.
//
// ─── O QUE A LINHA CARREGA ─────────────────────────────────────────────────
//
// `RecusaV2` guarda funcaoId, motivo, correlationId, clienteId e `em`. O
// DONO e a IDADE não são colunas novas: são DERIVADOS, de propósito.
//   • dono  → do catálogo canônico (função → departamento). Coluna gravada
//     congelaria o dono do dia em que a recusa nasceu; derivar acompanha a
//     reorganização da casa.
//   • idade → `agora - em`. Guardar idade em coluna seria guardar um número
//     que envelhece errado.
// Migration nova para isto seria custo sem informação nova.

import { funcaoV2, departamentoV2 } from "@/lib/agency/catalogo-v2/catalogo";

/**
 * Os "não" que acontecem antes de existir função executora. São `funcaoId`
 * sentinela — o campo é texto livre no banco, e o prefixo `esteira/` os
 * separa das funções de verdade do catálogo.
 */
export const PORTA_DA_ESTEIRA = "esteira/porta-de-entrada";
export const AUTORIZACAO_DA_ESTEIRA = "esteira/autorizacao";
export const HANDOFF_DA_ESTEIRA = "esteira/handoff-sem-aceite";

const DONO_DOS_SENTINELAS: Record<string, string> = {
  [PORTA_DA_ESTEIRA]: "PM da esteira",
  [AUTORIZACAO_DA_ESTEIRA]: "Direção (quem liga a chave)",
  [HANDOFF_DA_ESTEIRA]: "PM da esteira",
};

/**
 * De quem é o problema. Nunca devolve vazio: recusa sem dono é exatamente a
 * recusa que fica parada, porque "todo mundo" não é ninguém.
 */
export function donoDaRecusa(funcaoId: string): string {
  const sentinela = DONO_DOS_SENTINELAS[funcaoId];
  if (sentinela) return sentinela;
  const funcao = funcaoV2(funcaoId);
  if (!funcao) return "PM da esteira";
  const depto = departamentoV2(funcao.departamentoId);
  return depto?.nome ?? funcao.departamentoId;
}

/** Idade em horas, sempre >= 0. Relógio para trás não vira idade negativa. */
export function idadeEmHoras(em: Date, agora: Date): number {
  return Math.max(0, (agora.getTime() - em.getTime()) / 3_600_000);
}

/** "há 3 h" / "há 2 dias" — a idade em português, para a tela do CEO. */
export function idadeEmPortugues(em: Date, agora: Date): string {
  const horas = idadeEmHoras(em, agora);
  if (horas < 1) {
    const minutos = Math.max(1, Math.round(horas * 60));
    return `há ${minutos} min`;
  }
  if (horas < 48) return `há ${Math.round(horas)} h`;
  return `há ${Math.round(horas / 24)} dias`;
}

export interface LinhaDeRecusaVisivel {
  id: string;
  funcaoId: string;
  motivo: string;
  dono: string;
  idadeHoras: number;
  idade: string;
  clienteId: string | null;
  correlationId: string;
  em: Date;
}

export interface RecusaCrua {
  id: string;
  funcaoId: string;
  motivo: string;
  correlationId: string;
  clienteId: string | null;
  em: Date;
}

export function linhaDeRecusa(r: RecusaCrua, agora: Date): LinhaDeRecusaVisivel {
  return {
    id: r.id,
    funcaoId: r.funcaoId,
    motivo: r.motivo,
    dono: donoDaRecusa(r.funcaoId),
    idadeHoras: idadeEmHoras(r.em, agora),
    idade: idadeEmPortugues(r.em, agora),
    clienteId: r.clienteId,
    correlationId: r.correlationId,
    em: r.em,
  };
}

export interface RegistradorDeRecusa {
  criar(dados: {
    funcaoId: string;
    motivo: string;
    correlationId: string;
    clienteId?: string | null;
    em: Date;
  }): Promise<unknown>;
}

/**
 * Grava a recusa e NUNCA derruba quem a chamou.
 *
 * A ordem importa: quem chama esta função está no meio de um caminho de erro.
 * Se gravar o motivo pudesse lançar, um banco indisponível transformaria uma
 * recusa explicada de volta numa recusa muda — que é o defeito inteiro. Por
 * isso a falha vai para o console e a recusa segue devolvida ao chamador.
 */
export async function registrarRecusaVisivel(
  registrador: RegistradorDeRecusa,
  dados: { funcaoId: string; motivo: string; correlationId: string; clienteId?: string | null; em: Date },
): Promise<{ gravada: boolean }> {
  try {
    await registrador.criar(dados);
    return { gravada: true };
  } catch (e) {
    console.error("[esteira] NÃO consegui gravar a recusa — o motivo segue no retorno:", dados.motivo, e);
    return { gravada: false };
  }
}
