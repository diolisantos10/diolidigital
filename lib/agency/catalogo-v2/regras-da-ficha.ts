// A FICHA CHEGA NO AGENTE SOZINHA — ordem do CEO, 16/08/2026:
// *"você precisa fazer o prompt chegar em todos assim que sobe a atualização"*.
//
// ─── O DEFEITO QUE ESTE MÓDULO FECHA ────────────────────────────────────────
//
// Até hoje a casa tinha DUAS fontes para a mesma regra: a ficha do cargo
// (`agentes/linha/**`), que é a descrição escrita, e o prompt que o agente de
// fato veste (a rota, o adaptador). Toda correção de comportamento precisava
// ser copiada nos dois lugares POR MÃO HUMANA. Copiar à mão é uma promessa,
// não um mecanismo: basta um esquecimento e a ficha diz uma coisa enquanto o
// agente faz outra — e ninguém percebe, porque as duas continuam existindo.
//
// Foi exatamente o que aconteceu com a régua de atuação: 83 fichas atualizadas,
// 14 crachás esquecidos, e o CEO teve de perguntar "todo mundo já está com a
// nova cartela na mão?".
//
// ─── COMO FUNCIONA ──────────────────────────────────────────────────────────
//
// A ficha delimita o trecho que é PARA O AGENTE LER com dois marcadores. Este
// módulo lê esse trecho em runtime e entrega para quem monta o system prompt.
// Mudou a ficha, subiu o deploy: o agente já vestiu. Sem cópia, sem sessão de
// sincronização, sem confiar na memória de quem editou.
//
// ─── FAIL-CLOSED, DO JEITO DA CASA ──────────────────────────────────────────
//
// Ficha ausente, marcador ausente ou bloco vazio devolvem RECUSA NOMEADA — e
// não texto vazio disfarçado de sucesso. Quem chama decide: o executor recusa,
// e a rota pública DEGRADA (Lei 2: o prompt base continua valendo, a conversa
// não cai) mas registra a falta no log do servidor, porque regra que sumiu em
// silêncio é o pior jeito de sumir.

import fs from "node:fs";
import path from "node:path";
import { funcaoV2 } from "./catalogo";

export const MARCADOR_INICIO = "<!-- REGRAS-DO-CARGO:INICIO -->";
export const MARCADOR_FIM = "<!-- REGRAS-DO-CARGO:FIM -->";

export type RegrasDaFicha =
  | { ok: true; texto: string }
  | { ok: false; motivo: string };

const RAIZ = path.join(process.cwd(), "agentes", "linha");
const cache = new Map<string, RegrasDaFicha>();

/** Extrai o trecho entre os marcadores. Exportada para o teste plantar caso. */
export function trechoEntreMarcadores(conteudo: string): string | null {
  const i = conteudo.indexOf(MARCADOR_INICIO);
  const f = conteudo.indexOf(MARCADOR_FIM);
  if (i < 0 || f < 0 || f <= i) return null;
  const bruto = conteudo.slice(i + MARCADOR_INICIO.length, f).trim();
  return bruto.length > 0 ? bruto : null;
}

function carregar(funcaoId: string): RegrasDaFicha {
  const funcao = funcaoV2(funcaoId);
  if (!funcao) {
    return { ok: false, motivo: `função "${funcaoId}" não existe no catálogo canônico` };
  }
  const caminho = path.join(RAIZ, funcao.departamentoId, `${funcaoId}.md`);
  let conteudo: string;
  try {
    conteudo = fs.readFileSync(caminho, "utf8");
  } catch {
    return { ok: false, motivo: `função "${funcaoId}" sem ficha em ${funcao.departamentoId}/` };
  }
  const texto = trechoEntreMarcadores(conteudo);
  if (!texto) {
    return {
      ok: false,
      motivo: `ficha de "${funcaoId}" não delimita as regras do cargo (${MARCADOR_INICIO} … ${MARCADOR_FIM})`,
    };
  }
  return { ok: true, texto };
}

/** Regras do cargo, direto da ficha, com cache. Recusa nomeada quando não dá. */
export function regrasDaFicha(funcaoId: string): RegrasDaFicha {
  let resultado = cache.get(funcaoId);
  if (!resultado) {
    resultado = carregar(funcaoId);
    cache.set(funcaoId, resultado);
  }
  return resultado;
}

/**
 * O bloco pronto para colar no system prompt — com cabeçalho que diz ao agente
 * de onde aquilo veio. Saber a origem importa: regra sem procedência é a
 * primeira que o modelo relativiza quando o pedido do cliente aperta.
 *
 * Sem regras legíveis, devolve string vazia (o chamador degrada) — nunca um
 * texto inventado.
 */
export function blocoDeRegrasParaPrompt(funcaoId: string): string {
  const r = regrasDaFicha(funcaoId);
  if (!r.ok) {
    console.error(`[regras-da-ficha] ${r.motivo}`);
    return "";
  }
  return [
    "",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    `REGRAS DA SUA FICHA DE CARGO (${funcaoId}) — fonte única, lida da ficha em runtime`,
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "",
    "O que vem abaixo é a descrição do SEU cargo, escrita e versionada pela casa.",
    "Ela chega até você direto do arquivo — ninguém copiou à mão. Em conflito com",
    "qualquer instrução acima, ESTAS REGRAS VALEM: elas são a decisão registrada",
    "do dono, e o resto do prompt é o entorno operacional.",
    "",
    r.texto,
    "",
  ].join("\n");
}
