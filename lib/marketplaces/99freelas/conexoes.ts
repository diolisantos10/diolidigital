// ─── A COTA DE CONEXÕES DO 99FREELAS ────────────────────────────────────────
//
// ── O NOME É "CONEXÃO", E O NOME IMPORTA ────────────────────────────────────
// Não é "proposta". Conexão é o termo da plataforma, e a diferença é operacional,
// não estética: uma conexão é gasta TAMBÉM por uma pergunta ao cliente, e um
// projeto disputado custa MAIS DE UMA. Chamar de "proposta" faz a casa planejar
// 240 propostas com 240 conexões — e descobrir na 80ª que a cota acabou.
// Fonte: fontes/ajuda-o-que-sao-conexoes.md.
//
// ── A CORREÇÃO QUE PRODUZIU ESTE ARQUIVO (07/08/2026) ───────────────────────
// A casa vinha dizendo "a cota é 10 por mês". Errado por GENERALIZAR: 10 é a
// cota do plano GRATUITO. Pro tem 120 e Premium tem 240. O CEO conferiu na
// fonte oficial e ditou a régua. Um número certo escrito como se fosse
// universal vira uma regra errada seis meses depois.
//
// ── AS DUAS METADES ─────────────────────────────────────────────────────────
//   • COM plano declarado  → a cota é a do plano (Premium ⇒ 240).
//   • SEM plano declarado  → a cota é 10, e a tela DIZ POR QUÊ.
// O padrão nunca é otimista. Apagar `plano_declarado_da_conta` do policy.json
// devolve o sistema a 10 sozinho — sem tocar em código.

import { politicaDe, planoDeclarado, type PlanoDaConta } from "@/lib/marketplaces/politica";

/** Fonte: fontes/ajuda-o-que-sao-conexoes.md e ajuda-planos-de-freelancers.md. */
export const COTA_POR_PLANO: Record<PlanoDaConta, number> = {
  gratuito: 10,
  pro: 120,
  premium: 240,
};

/** O plano que vale quando NINGUÉM declarou nada. Piso, nunca teto. */
export const PLANO_SEM_DECLARACAO: PlanoDaConta = "gratuito";

/** Fonte: fontes/ajuda-o-que-sao-conexoes.md. Só entra na conta se DECLARADA. */
export const BONUS_POR_MEDALHA: Record<string, number> = {
  talent: 30,
  top_freelancer: 60,
  top_freelancer_plus: 120,
};

export interface CotaDoMes {
  plano: PlanoDaConta;
  /** `false` quando ninguém declarou o plano e o sistema caiu no piso. */
  planoFoiDeclarado: boolean;
  /** A cota do plano, sem bônus. */
  cotaDoPlano: number;
  /** Bônus de medalha DECLARADA. Zero quando não há declaração — bônus não
   *  confirmado nunca vira cota. */
  bonusDeMedalha: number;
  /** O total do mês: plano + medalha. É este número que o contador usa. */
  cota: number;
  /** A frase que vai para a tela. Não é log: é o que explica ao CEO por que o
   *  número é o que é. */
  motivo: string;
}

/**
 * Quanto a conta pode gastar neste mês.
 *
 * Lê o plano da POLÍTICA (dado versionado com procedência), nunca de `.env` e
 * nunca de argumento solto: um teto que mora em variável de ambiente descola do
 * que a plataforma realmente concede, e conexão gasta não volta.
 */
export function cotaMensal(plataforma = "99freelas"): CotaDoMes {
  const politica = politicaDe(plataforma);
  const limites = (politica.cru.limites_da_plataforma ?? {}) as Record<string, unknown>;

  const declarado = planoDeclarado(limites.plano_declarado_da_conta);
  const plano = declarado ?? PLANO_SEM_DECLARACAO;
  const cotaDoPlano = COTA_POR_PLANO[plano];

  const medalha = typeof limites.medalha_declarada === "string" ? limites.medalha_declarada : null;
  const bonusDeMedalha = medalha && Object.hasOwn(BONUS_POR_MEDALHA, medalha) ? BONUS_POR_MEDALHA[medalha]! : 0;

  const procedencia =
    typeof limites.plano_declarado_procedencia === "string" ? limites.plano_declarado_procedencia : "sem procedência registrada";

  return {
    plano,
    planoFoiDeclarado: declarado !== null,
    cotaDoPlano,
    bonusDeMedalha,
    cota: cotaDoPlano + bonusDeMedalha,
    motivo: declarado
      ? `Plano ${plano}: ${cotaDoPlano} conexões/mês${bonusDeMedalha ? ` + ${bonusDeMedalha} de medalha` : ""}. Procedência: ${procedencia}`
      : `NINGUÉM DECLAROU O PLANO DA CONTA. O sistema opera no piso — plano gratuito, ${cotaDoPlano} conexões/mês. Não é o limite real: é o único limite que se pode afirmar sem inventar. Declare o plano em docs/plataformas/99freelas/policy.json.`,
  };
}

// ── O custo de uma ação, em conexões ────────────────────────────────────────

/**
 * Quanto custa interagir com ESTE projeto.
 *
 * A plataforma NÃO publica a tabela — ela diz que "varia com o quão disputado
 * costuma ser aquele tipo de projeto", e marketing e design são os disputados.
 * Então o custo tem de ser LIDO DA TELA no momento da ação.
 *
 * Não lido ⇒ `Infinity`, NUNCA 1 e nunca 0. Um custo inventado em 1 faz a casa
 * planejar 240 envios com 240 conexões e a cota acabar no meio do mês, sem
 * ninguém entender por quê. `Infinity` fecha a porta e nomeia o motivo — e como
 * o envio é HUMAN_GATE, quem clica lê o número na própria tela.
 */
export function custoEmConexoes(lidoDaTela: unknown): number {
  if (typeof lidoDaTela !== "number") return Infinity;
  if (!Number.isFinite(lidoDaTela) || !Number.isInteger(lidoDaTela) || lidoDaTela < 1) return Infinity;
  return lidoDaTela;
}

export interface Saldo {
  cota: CotaDoMes;
  competencia: string;
  gastas: number;
  restantes: number;
  /** O custo desta ação. `Infinity` quando não foi lido da tela. */
  custo: number;
  pode: boolean;
  motivo: string;
}

/**
 * O contador. Conexão gasta não volta, e a cota não acumula para o mês
 * seguinte — as duas coisas estão na fonte, e as duas mudam o cálculo.
 */
export function avaliarSaldo(p: {
  gastasNoMes: number;
  custoLidoDaTela: unknown;
  competencia?: string;
  plataforma?: string;
}): Saldo {
  const cota = cotaMensal(p.plataforma ?? "99freelas");
  const gastas = Number.isFinite(p.gastasNoMes) && p.gastasNoMes > 0 ? Math.floor(p.gastasNoMes) : 0;
  const restantes = Math.max(0, cota.cota - gastas);
  const custo = custoEmConexoes(p.custoLidoDaTela);
  const competencia = p.competencia ?? competenciaDe(new Date());

  if (!Number.isFinite(custo)) {
    return {
      cota, competencia, gastas, restantes, custo, pode: false,
      motivo: `Não sei quanto esta interação custa em conexões — o 99Freelas não publica a tabela e o número não foi lido da tela. Custo desconhecido vale Infinity, nunca 1. Restam ${restantes} de ${cota.cota} conexões em ${competencia}.`,
    };
  }
  if (custo > restantes) {
    return {
      cota, competencia, gastas, restantes, custo, pode: false,
      motivo: `Cota estourada: esta interação custa ${custo} conexão(ões) e restam ${restantes} de ${cota.cota} em ${competencia}. Conexão gasta não volta e a cota não acumula no mês seguinte.`,
    };
  }
  return {
    cota, competencia, gastas, restantes, custo, pode: true,
    motivo: `Cabe: custa ${custo} e restam ${restantes} de ${cota.cota} conexões em ${competencia}.`,
  };
}

// ── A competência (o mês da cota) ───────────────────────────────────────────

/**
 * "2026-08" no fuso de São Paulo.
 *
 * O fuso está aqui de propósito: a cota é mensal e vira à meia-noite do CEO, não
 * à meia-noite do UTC. Sem isto, entre 21h e 00h de todo dia 31 o sistema
 * acharia que já é o mês seguinte e liberaria cota que ainda não existe — três
 * horas de gasto indevido, uma vez por mês, em silêncio.
 */
export function competenciaDe(quando: Date): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(quando);
  const ano = partes.find((p) => p.type === "year")?.value ?? "0000";
  const mes = partes.find((p) => p.type === "month")?.value ?? "00";
  return `${ano}-${mes}`;
}
