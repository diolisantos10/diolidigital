// SPECS OPERACIONAIS — a ficha da linha lida por máquina, não só por gente.
//
// Integração V2: cada uma das 81 fichas de
// `agentes/linha/` carrega um bloco ```json com a especificação operacional
// (entradas, saída, ferramentas, dados, handoff, SLA, custo, autonomia,
// golden set). O CI já valida a ESTRUTURA (`fichas-da-linha.test.ts`); este
// módulo é quem ENTREGA a spec ao motor de execução em runtime.
//
// Fail-closed em todas as pontas: função sem ficha, ficha sem bloco ou bloco
// que não parseia devolvem recusa NOMEADA — o executor não roda função cuja
// spec ele não conseguiu ler. Ausência de informação não é informação.

import fs from "node:fs";
import path from "node:path";
import { funcaoV2 } from "./catalogo";

export interface CasoGolden {
  tipo: "normal" | "recusa" | "escalada";
  entrada: string;
  aceitavel: string;
  inaceitavel: string;
}

export interface SpecOperacional {
  funcao: string;
  departamento: string;
  /** Toda função NASCE desligada; ligar é decisão registrada, nunca deploy. */
  ativa: boolean;
  entradas_obrigatorias: string[];
  saida: { formato: string; esquema: string };
  ferramentas_permitidas: string[];
  ferramentas_proibidas: string[];
  dados_acessiveis: string[];
  dados_proibidos: string[];
  handoff: { recebe_de: string; entrega_para: string };
  sla_horas: number;
  timeout_min: number;
  retentativas: number;
  metrica_sucesso: string;
  golden_set: CasoGolden[];
  modelo: { recomendado: string; fallback: string };
  teto_custo_usd_execucao: number;
  autonomia: "A" | "B" | "C";
  gatilhos_humanos: string[];
}

export type ResultadoDeSpec =
  | { ok: true; spec: SpecOperacional }
  | { ok: false; motivo: string };

const RAIZ = path.join(process.cwd(), "agentes", "linha");
const cache = new Map<string, ResultadoDeSpec>();

function carregar(funcaoId: string): ResultadoDeSpec {
  const funcao = funcaoV2(funcaoId);
  if (!funcao) {
    return { ok: false, motivo: `função "${funcaoId}" não existe no catálogo canônico` };
  }
  const caminho = path.join(RAIZ, funcao.departamentoId, `${funcaoId}.md`);
  let conteudo: string;
  try {
    conteudo = fs.readFileSync(caminho, "utf8");
  } catch {
    return { ok: false, motivo: `função "${funcaoId}" sem ficha em ${funcao.departamentoId}/ — sem ficha não se executa` };
  }
  const bloco = conteudo.match(/```json\n([\s\S]*?)\n```/);
  if (!bloco) {
    return { ok: false, motivo: `ficha de "${funcaoId}" sem bloco de especificação legível por máquina` };
  }
  let spec: SpecOperacional;
  try {
    spec = JSON.parse(bloco[1]!) as SpecOperacional;
  } catch {
    return { ok: false, motivo: `especificação de "${funcaoId}" não parseia — ficha inválida não roda` };
  }
  if (spec.funcao !== funcaoId || spec.departamento !== funcao.departamentoId) {
    return { ok: false, motivo: `especificação de "${funcaoId}" diverge do catálogo (diz ser ${spec.departamento}/${spec.funcao})` };
  }
  return { ok: true, spec };
}

/** Spec da função, com cache. Recusa nomeada quando não dá pra confiar nela. */
export function specDaFuncao(funcaoId: string): ResultadoDeSpec {
  let resultado = cache.get(funcaoId);
  if (!resultado) {
    resultado = carregar(funcaoId);
    cache.set(funcaoId, resultado);
  }
  return resultado;
}
