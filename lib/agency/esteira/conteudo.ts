// conteudo.ts — o trabalho da IA vira texto que fica guardado.
//
// O buraco que este arquivo fecha: as telas de agente geravam material completo,
// mostravam na tela, e salvavam no banco APENAS O TÍTULO. O conteúdo ia para o
// lixo. Era como imprimir o planejamento inteiro, arquivar a capa e jogar as
// páginas fora — o cliente abria o portal e via cartões vazios.
//
// Aqui o objeto que a IA devolveu vira markdown legível, sem que cada tela
// precise saber escrever markdown. Um serializador genérico é a escolha certa
// para isto: as seis telas devolvem formatos diferentes, e um conversor por tela
// significaria seis chances de esquecer um campo. Este nunca perde dado — o que
// existe no objeto aparece no texto.

/** Rótulos amigáveis para as chaves que mais aparecem nas saídas dos agentes. */
const ROTULO: Record<string, string> = {
  headline: "Título", title: "Título", format: "Formato", caption: "Legenda",
  visual: "Visual", direction: "Direção", palette: "Paleta", typography: "Tipografia",
  cta: "Chamada", audience: "Público", targetAudience: "Público", note: "Observação", notes: "Observação",
  positioning: "Posicionamento", pillars: "Pilares", toneOfVoice: "Tom de voz",
  visualStyle: "Estilo visual", businessSummary: "O negócio", brandRules: "Regras da marca",
  thingsToAvoid: "O que evitar", risks: "Riscos", opportunities: "Oportunidades",
  angle: "Ângulo", objective: "Objetivo", channel: "Canal", channels: "Canais",
  budget: "Verba", kpi: "Indicador", metric: "Indicador", goal: "Meta",
  day: "Dia", date: "Data", week: "Semana", theme: "Tema", copy: "Texto",
  hashtags: "Hashtags", summary: "Resumo", description: "Descrição",
  platform: "Plataforma", frequency: "Frequência", tone: "Tom",
};

function rotular(chave: string): string {
  if (ROTULO[chave]) return ROTULO[chave];
  // camelCase → "Camel case"; snake_case → "Snake case"
  const solto = chave.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim();
  return solto.charAt(0).toUpperCase() + solto.slice(1);
}

function ehVazio(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim().length === 0;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v as object).length === 0;
  return false;
}

function valorSimples(v: unknown): string | null {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v) && v.every((x) => typeof x === "string" || typeof x === "number")) {
    return v.join(", ");
  }
  return null;
}

/** Renderiza um item (objeto) como um bloco de linhas. */
function renderItem(item: unknown, indice: number, nivel: number): string[] {
  const recuo = "  ".repeat(Math.max(0, nivel - 1));

  const simples = valorSimples(item);
  if (simples !== null) return [`${recuo}${indice}. ${simples}`];

  if (typeof item !== "object" || item === null) return [];

  const obj = item as Record<string, unknown>;
  const linhas: string[] = [];

  // O título do bloco sai do campo mais "cabeçalho" que existir.
  const cabecalho = ["headline", "title", "theme", "angle", "kpi", "name", "day"]
    .map((k) => obj[k])
    .find((v) => typeof v === "string" && v.trim());

  linhas.push(`${recuo}**${indice}. ${cabecalho ?? `Item ${indice}`}**`);

  for (const [chave, valor] of Object.entries(obj)) {
    if (ehVazio(valor)) continue;
    if (typeof valor === "string" && valor === cabecalho) continue;

    const plano = valorSimples(valor);
    if (plano !== null) {
      linhas.push(`${recuo}- ${rotular(chave)}: ${plano}`);
      continue;
    }
    if (Array.isArray(valor)) {
      linhas.push(`${recuo}- ${rotular(chave)}:`);
      valor.forEach((sub, i) => linhas.push(...renderItem(sub, i + 1, nivel + 1)));
      continue;
    }
    if (typeof valor === "object") {
      linhas.push(`${recuo}- ${rotular(chave)}:`);
      linhas.push(...renderItem(valor, 1, nivel + 1));
    }
  }
  linhas.push("");
  return linhas;
}

/**
 * Transforma a saída de um agente em markdown legível e completo.
 *
 * `titulo` e `resumo` entram no topo quando existirem. O resto é percorrido na
 * ordem em que veio — a ordem que a IA escolheu costuma ser a ordem que faz
 * sentido para quem lê.
 */
export function comoTexto(dados: unknown, opts: { titulo?: string; resumo?: string } = {}): string {
  const linhas: string[] = [];
  if (opts.titulo?.trim()) linhas.push(`# ${opts.titulo.trim()}`, "");
  if (opts.resumo?.trim()) linhas.push(opts.resumo.trim(), "");

  const simples = valorSimples(dados);
  if (simples !== null) {
    linhas.push(simples);
    return linhas.join("\n").trim();
  }

  if (Array.isArray(dados)) {
    dados.forEach((item, i) => linhas.push(...renderItem(item, i + 1, 1)));
    return linhas.join("\n").trim();
  }

  if (typeof dados === "object" && dados !== null) {
    for (const [chave, valor] of Object.entries(dados as Record<string, unknown>)) {
      if (ehVazio(valor)) continue;
      if (chave === "title" || chave === "summary") continue; // já foram para o topo

      const plano = valorSimples(valor);
      if (plano !== null) {
        linhas.push(`**${rotular(chave)}:** ${plano}`, "");
        continue;
      }
      linhas.push(`## ${rotular(chave)}`, "");
      if (Array.isArray(valor)) {
        valor.forEach((item, i) => linhas.push(...renderItem(item, i + 1, 1)));
      } else {
        linhas.push(...renderItem(valor, 1, 1));
      }
    }
  }

  return linhas.join("\n").trim();
}

/** Piso: conteúdo abaixo disto não é entrega, é cartão vazio com outro nome. */
export const MINIMO_DE_CONTEUDO = 40;

/** O conteúdo tem substância suficiente para virar entregável? */
export function temSubstancia(texto: string | null | undefined): boolean {
  return typeof texto === "string" && texto.trim().length >= MINIMO_DE_CONTEUDO;
}
