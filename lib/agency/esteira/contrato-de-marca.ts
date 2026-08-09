// O CONTRATO DE MARCA — a régua que chega a QUEM PRODUZ, antes de produzir.
//
// ── Por que este arquivo existe (09/08/2026) ────────────────────────────────
//
// Medido neste dia, contra o código em produção: do cérebro de marca, o
// produtor recebia **três coisas** — público-alvo, tom, e um sim/não de "tem
// material de marca" (`run-execution.ts`, montagem do `Ctx`). Todo o resto do
// que a casa sabe sobre a marca ficava guardado e não chegava.
//
// A constituição do `branding` (dioli-brain-kit, doutrina 23) nomeia esse
// defeito e dá o remédio:
//
//   > "Campo que ninguém lê é decoração. O desenho tem que dizer como a regra
//   >  CHEGA A QUEM PRODUZ, não apenas onde ela fica guardada."
//
// E dá também a forma: **um contrato de no máximo UMA TELA**, entregue antes da
// execução. O limite não é estético — é o que impede o contrato de crescer até
// ninguém ler. O próprio Conselho listou "o contrato cresce até ninguém ler"
// como risco, e avisou que o limite de uma tela "será a primeira coisa violada
// 'só desta vez'". Por isso o teto aqui é código, não recomendação.
//
// ── O QUE ESTE ARQUIVO NÃO FAZ ──────────────────────────────────────────────
//
//   • **Não julga peça.** Julgar é do portão; isto é a régua ANTES do trabalho.
//   • **Não inventa regra.** Campo vazio vira LACUNA NOMEADA, nunca um valor
//     plausível. Ausência de informação não é informação.
//   • **Não escreve nada.** Só lê. É a mesma trava do agente `branding`.
//
// ── AS PROIBIÇÕES JÁ FUNCIONAVAM ───────────────────────────────────────────
//
// Registrado porque eu mesmo errei isto em 09/08 e quase repeti o erro da
// auditoria de 08/08: as proibições do cliente **existem e já chegam ao
// produtor** (`lerProibicoes`, guardadas em `BrainArtifact`). Elas não estão em
// `BrandBrain`, e é por isso que quem olha só as colunas conclui que não
// existem. Este contrato as REÚNE com o resto — não as substitui.

import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/client";
import { lerProibicoes } from "@/lib/agency/esteira/proibicoes";
import { materiaisDeMarca } from "@/lib/agency/esteira/material-do-drive";

/** Teto do contrato, em caracteres. ~Uma tela de celular lida sem rolar duas
 *  vezes. Passou disto, o excedente é CORTADO E DECLARADO — nunca truncado em
 *  silêncio, porque corte silencioso vira "a regra não existia". */
export const TETO_DO_CONTRATO = 1800;

export interface ContratoDeMarca {
  /** O texto que vai para quem produz. Nunca passa de `TETO_DO_CONTRATO`. */
  texto: string;
  /** Identidade do conteúdo deste contrato. É o `marca_versao` que o artefato
   *  carrega — o que permite, depois, saber com qual régua a peça foi feita.
   *  Derivado do CONTEÚDO, não do relógio: mesmo conteúdo, mesma versão. */
  marcaVersao: string;
  /** O que a marca ainda não declarou. Nomeado, um por linha, para virar
   *  pergunta ao dono — nunca preenchido por inferência. */
  lacunas: string[];
  /** O que não coube no teto. Vazio quando coube tudo. */
  cortado: string[];
  /** `true` quando a marca não tem nenhuma regra registrada. É o estado
   *  `marca_nao_constituida` da constituição: legítimo, declarado, e não
   *  autoriza ninguém a julgar peça por identidade. */
  naoConstituida: boolean;
}

/** Um campo que vale a pena estar no contrato só se MUDA UMA DECISÃO de quem
 *  produz. Campo que não muda decisão não entra — regra da constituição. */
interface Linha {
  rotulo: string;
  valor: string | null | undefined;
  /** Nome da lacuna quando o valor falta. `null` = a falta não é lacuna. */
  lacuna: string | null;
}

function limpar(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  return s.length > 0 ? s : null;
}

/**
 * Monta o contrato de marca de um cliente.
 *
 * Nunca lança: falha de leitura vira lacuna declarada, porque produção parada
 * por causa do contrato é pior do que produção avisada de que a régua faltou.
 */
export async function contratoDeMarca(clientId: string | null | undefined): Promise<ContratoDeMarca> {
  if (!clientId) {
    return {
      texto: "SEM CLIENTE — não há marca para obedecer nesta peça.",
      marcaVersao: versaoDe("sem-cliente"),
      lacunas: [],
      cortado: [],
      naoConstituida: true,
    };
  }

  const [marca, proibicoes, materiais] = await Promise.all([
    prisma.brandBrain.findUnique({ where: { clientId } }).catch(() => null),
    lerProibicoes(clientId).catch(() => ({ lidas: false, itens: [] as { frase: string }[] })),
    materiaisDeMarca(clientId).catch(() => []),
  ]);

  const lacunas: string[] = [];
  const partes: string[] = [];
  const cortado: string[] = [];

  // ── 1. QUEM É ────────────────────────────────────────────────────────────
  const identidade: Linha[] = [
    { rotulo: "Marca", valor: limpar(marca?.brandName), lacuna: "nome da marca" },
    { rotulo: "Promessa", valor: limpar(marca?.tagline), lacuna: "promessa (tagline)" },
    { rotulo: "Posicionamento", valor: limpar(marca?.positioning), lacuna: "posicionamento" },
    { rotulo: "Fala com", valor: limpar(marca?.targetAudience), lacuna: "público" },
    { rotulo: "Tom", valor: limpar(marca?.tone), lacuna: "tom de voz" },
  ];
  const linhasIdentidade = identidade
    .filter((l) => {
      if (l.valor) return true;
      if (l.lacuna) lacunas.push(l.lacuna);
      return false;
    })
    .map((l) => `${l.rotulo}: ${l.valor}`);
  if (linhasIdentidade.length > 0) partes.push(`QUEM É\n${linhasIdentidade.join("\n")}`);

  // ── 2. O QUE NUNCA FAZER ─────────────────────────────────────────────────
  // Primeiro bloco depois da identidade, de propósito: é o único que permite
  // reprovar, e é o que o cliente já disse em voz alta.
  const frases = (proibicoes.itens ?? []).map((i) => i.frase).filter(Boolean);
  if (frases.length > 0) {
    partes.push(`NUNCA\n${frases.map((f) => `— ${f}`).join("\n")}`);
  } else {
    lacunas.push("proibições (o que a marca nunca faz)");
  }

  // ── 3. COM O QUE SE PARECE ───────────────────────────────────────────────
  const formais = [
    marca?.primaryColor ? `cor principal ${marca.primaryColor}` : null,
    marca?.secondaryColor ? `cor de apoio ${marca.secondaryColor}` : null,
    limpar(marca?.typography) ? `tipografia ${limpar(marca?.typography)}` : null,
  ].filter(Boolean) as string[];
  if (formais.length > 0) partes.push(`FORMA\n${formais.join(" · ")}`);
  else lacunas.push("cor e tipografia");

  const logo = materiais.find((m) => m.papel === "logo");
  const referencias = materiais.filter((m) => m.papel === "referencia");
  const material: string[] = [];
  if (logo) material.push(`logo: ${logo.nome}`);
  else lacunas.push("arquivo de logo");
  if (referencias.length > 0) material.push(`referências: ${referencias.map((r) => r.nome).slice(0, 3).join(", ")}`);
  else lacunas.push("referência visual (o que a marca considera certo)");
  if (material.length > 0) partes.push(`MATERIAL\n${material.join("\n")}`);

  // ── 4. O QUE A MARCA AINDA NÃO DECIDIU ───────────────────────────────────
  // Vai DENTRO do contrato, não num relatório à parte: quem produz precisa
  // saber que ali não há régua — senão preenche com o próprio gosto e ninguém
  // fica sabendo.
  if (lacunas.length > 0) {
    partes.push(
      `AINDA NÃO DECIDIDO (${lacunas.length})\n` +
        lacunas.map((l) => `— ${l}`).join("\n") +
        `\nNão invente estes. Se a peça depender de um deles, diga que dependeu.`,
    );
  }

  const naoConstituida = frases.length === 0 && linhasIdentidade.length === 0;
  if (naoConstituida) {
    partes.unshift(
      "MARCA NÃO CONSTITUÍDA — esta marca ainda não declarou regra nenhuma.\n" +
        "Produza com o que o briefing disser e NÃO afirme nada sobre a marca que\n" +
        "não esteja escrito nele.",
    );
  }

  // ── O TETO, aplicado por bloco inteiro ───────────────────────────────────
  // Cortar no meio de um bloco entregaria meia regra, que é pior que nenhuma:
  // quem lê "NUNCA — não cite conc" obedece o pedaço e inventa o resto.
  const mantidos: string[] = [];
  let tamanho = 0;
  for (const bloco of partes) {
    const custo = bloco.length + 2;
    if (tamanho + custo > TETO_DO_CONTRATO) {
      cortado.push(bloco.split("\n")[0] ?? "bloco");
      continue;
    }
    mantidos.push(bloco);
    tamanho += custo;
  }
  if (cortado.length > 0) {
    const aviso = `(${cortado.length} bloco(s) não couberam: ${cortado.join(", ")})`;
    if (tamanho + aviso.length + 2 <= TETO_DO_CONTRATO) mantidos.push(aviso);
  }

  const texto = mantidos.join("\n\n");
  return { texto, marcaVersao: versaoDe(texto), lacunas, cortado, naoConstituida };
}

/** A versão é do CONTEÚDO: mesma régua, mesma versão, em qualquer máquina e em
 *  qualquer dia. Derivar do relógio faria duas peças idênticas parecerem feitas
 *  sob réguas diferentes. */
export function versaoDe(texto: string): string {
  return `mv_${createHash("sha256").update(texto).digest("hex").slice(0, 10)}`;
}
