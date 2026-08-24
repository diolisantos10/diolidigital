// branding.ts — O CONTRATO DA BASE DE MARCA.
//
// ─── O QUE O CASE FAROL 27 MEDIU (24/08/2026) ────────────────────────────────
//
// O case sintético percorreu os doze departamentos e o achado foi estrutural:
// **branding não existia na esteira.** O cliente pediu reposicionamento de marca
// como serviço PRINCIPAL e não havia especialista que o fizesse. O Brand Hub e o
// Brand Book saíram à mão, fora da máquina.
//
// É grave porque branding é o que amarra o resto: social, design e tráfego
// deveriam obedecer à base de marca, e não havia base de marca produzida pela
// casa. Cada departamento inventava a sua — e nenhum estava errado sozinho.
//
// ─── LACUNA É CIDADÃ DE PRIMEIRA CLASSE ──────────────────────────────────────
//
// O entregável de branding NASCE sabendo dizer "isto eu não tenho". Cliente sem
// vetor, sem paleta documentada, sem histórico de versões — isso não pode virar
// invenção, e a régua abaixo é o que impede: **campo em lacuna sem dizer o que
// falta é violação de contrato, e campo em lacuna com conteúdo preenchido é
// invenção.** Um documento que preenche nove campos bonitos sobre um cliente que
// não contou nada é pior que documento nenhum: ele vira régua para as outras
// casas e propaga a invenção para toda peça do mês.
//
// A lista dos nove campos NÃO nasce aqui. Ela é a constituição da marca, mora em
// `esteira/ficha-de-marca.ts` e é importada — duas listas da mesma verdade é a
// doença que esta casa já pagou várias vezes.

import { CAMPOS_DA_MARCA, ROTULO, PERGUNTA, type CampoDaMarca } from "@/lib/agency/esteira/campos-da-marca";

/** Os estados possíveis de um campo, exatamente os da ficha. */
export const ESTADOS_DO_CAMPO = ["definido", "lacuna", "herdado_default"] as const;

/**
 * O item extra, além dos nove: os MATERIAIS que a marca tem (ou não tem).
 *
 * Existe porque "não tenho o vetor do logo" não é um dos nove campos da
 * constituição e mesmo assim é a lacuna que mais trava trabalho na prática — foi
 * ela que fez o kit de marca do Farol 27 sair em preto e branco.
 */
export const CAMPO_DOS_MATERIAIS = "materiais_da_marca";

/** Os materiais que a casa pergunta por, um a um. Nomear item a item é o que
 *  impede o "faltam materiais" genérico que ninguém sabe atender. */
export const MATERIAIS_ESPERADOS = [
  "arquivo vetorial do logo (.ai, .eps ou .svg)",
  "paleta de cores documentada (código hex, não 'azul escuro')",
  "tipografia oficial (arquivo da fonte ou nome exato)",
  "manual de marca / brand book",
  "histórico de versões do logo (o que já foi usado antes)",
] as const;

/** Os itens que o entregável DEVE trazer, na ordem de leitura. */
export const ITENS_DA_BASE_DE_MARCA: readonly string[] = [...CAMPOS_DA_MARCA, CAMPO_DOS_MATERIAIS];

function campoDe(it: Record<string, unknown>): string {
  return typeof it.campo === "string" ? it.campo.trim().toLowerCase() : "";
}
function txt(it: Record<string, unknown>, k: string): string {
  return typeof it[k] === "string" ? (it[k] as string).trim() : "";
}

/**
 * O CONTRATO DE SAÍDA da base de marca, conferido em código sobre o JSON.
 *
 * Devolve as violações em português, prontas para virar parecer. Lista vazia =
 * cumpriu. A régua é a mesma dos outros especialistas (`Especialista.contrato`)
 * — este não inventa arquitetura paralela.
 */
export function contratoDaBaseDeMarca(data: Record<string, unknown>): string[] {
  const problemas: string[] = [];
  const itens = Array.isArray(data.items)
    ? (data.items.filter((x) => typeof x === "object" && x !== null) as Array<Record<string, unknown>>)
    : [];

  if (!itens.length) {
    return ["a base de marca veio vazia: nenhum dos campos da constituição foi entregue"];
  }

  const vistos = new Map<string, Record<string, unknown>>();
  for (const it of itens) {
    const c = campoDe(it);
    if (!c) { problemas.push("um dos itens não declarou a que campo da marca pertence (`campo`)"); continue; }
    if (!ITENS_DA_BASE_DE_MARCA.includes(c)) {
      problemas.push(`campo desconhecido na base de marca: "${c}" — a constituição tem ${ITENS_DA_BASE_DE_MARCA.length} campos e não se inventa um décimo primeiro`);
      continue;
    }
    if (vistos.has(c)) { problemas.push(`o campo "${c}" veio duas vezes`); continue; }
    vistos.set(c, it);
  }

  for (const c of ITENS_DA_BASE_DE_MARCA) {
    const it = vistos.get(c);
    const rotulo = c === CAMPO_DOS_MATERIAIS
      ? "Materiais da marca"
      : ROTULO[c as CampoDaMarca];
    if (!it) { problemas.push(`faltou o campo "${c}" (${rotulo}) — ausência não é resposta: se ninguém decidiu, o campo entra como lacuna`); continue; }

    const estado = txt(it, "estado").toLowerCase();
    if (!ESTADOS_DO_CAMPO.includes(estado as (typeof ESTADOS_DO_CAMPO)[number])) {
      problemas.push(`o campo "${c}" não declarou estado válido (definido, lacuna ou herdado_default) — campo em branco vira silêncio, e silêncio vira permissão`);
      continue;
    }

    const conteudo = txt(it, "conteudo");
    const falta = txt(it, "falta");

    if (estado === "lacuna") {
      if (!falta) {
        problemas.push(`o campo "${c}" está em lacuna e NÃO diz o que falta — lacuna sem pergunta é só um buraco. A pergunta desta casa é: "${c === CAMPO_DOS_MATERIAIS ? "quais materiais o cliente tem?" : PERGUNTA[c as CampoDaMarca]}"`);
      }
      if (conteudo) {
        problemas.push(`o campo "${c}" está declarado como lacuna e mesmo assim veio preenchido — isso é invenção com cara de entrega. Ou o cliente contou (e é definido), ou não contou (e o conteúdo sai)`);
      }
      continue;
    }

    if (!conteudo) {
      problemas.push(`o campo "${c}" está como "${estado}" e veio vazio — estado que afirma decisão exige a decisão escrita`);
    }
    if (estado === "definido" && !txt(it, "fonte")) {
      problemas.push(`o campo "${c}" está como "definido" e não diz DE ONDE veio (\`fonte\`) — definido é o que o dono decidiu, não o que o modelo achou bonito. Sem fonte, o estado honesto é lacuna ou herdado_default`);
    }
  }

  const materiais = vistos.get(CAMPO_DOS_MATERIAIS);
  if (materiais && txt(materiais, "estado").toLowerCase() !== "definido") {
    const falta = txt(materiais, "falta").toLowerCase();
    const naoNomeados = MATERIAIS_ESPERADOS.filter((m) => {
      const chave = m.split(" ")[0].replace(/[^a-zà-ÿ]/gi, "").toLowerCase();
      return chave.length > 3 && !falta.includes(chave);
    });
    if (naoNomeados.length) {
      problemas.push(`os materiais que faltam precisam ser nomeados um a um; não apareceram: ${naoNomeados.join("; ")}`);
    }
  }

  return problemas;
}

/** O bloco do prompt que descreve os campos, para não repetir a lista à mão. */
export function blocoDosCamposDaMarca(): string {
  const linhas = CAMPOS_DA_MARCA.map(
    (c) => `- ${c} — ${ROTULO[c]} (se estiver em lacuna, a pergunta ao cliente é: "${PERGUNTA[c]}")`,
  );
  linhas.push(
    `- ${CAMPO_DOS_MATERIAIS} — Materiais da marca. Em \`falta\`, nomeie um a um o que não existe, usando estes nomes: ${MATERIAIS_ESPERADOS.join("; ")}.`,
  );
  return linhas.join("\n");
}
