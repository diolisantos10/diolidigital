// piso-de-verdade.ts — O FREIO QUE NÃO DEPENDE DE IA.
//
// O P0 desta casa, em uma frase: das 31 checagens declaradas em
// `quality-gates.ts`, 28 são texto descrevendo o que um humano deveria conferir.
// Com revisão humana isso era um checklist. Sem revisão humana é decoração.
//
// O auditor que roda de verdade (`quality-auditor.ts`) é um LLM — e um LLM
// julgando outro LLM tem o mesmo ponto cego dos dois: se o modelo inventou um
// telefone plausível, o juiz acha plausível também. Além disso, o auditor é
// fail-open: IA fora do ar = passou.
//
// Este módulo é o PISO. Roda em código, sem IA, sem rede, e por isso:
//   • não tem ponto cego compartilhado com quem escreveu a peça;
//   • não pode ficar "indisponível";
//   • é determinístico — o mesmo texto dá sempre o mesmo veredito.
//
// Ele NÃO julga qualidade, gosto ou criatividade — isso continua com o LLM.
// Ele responde uma pergunta só, e é a que chega no cliente como mentira:
// **esta peça afirma algum FATO que a agência não tem como sustentar?**
//
// Regra de convivência com o auditor de IA: o piso é BLOQUEANTE e o juízo do
// LLM continua sendo parecer. Reprovar por invenção de dado é objetivo;
// reprovar por "achei fraco" não é.

/** Um fato que a agência SABE sobre o cliente. Tudo que a peça afirmar e que
 *  contradiga (ou extrapole) isto é invenção, não criatividade. */
export interface VerdadeDoCliente {
  businessName: string;
  /** Telefones conhecidos (do briefing / cadastro), só dígitos. */
  telefones: string[];
  /** E-mails conhecidos. */
  emails: string[];
  /** Serviços realmente contratados. */
  servicos: string[];
  /** Valores que o cliente informou (verba, mensalidade). Em reais. */
  valores: number[];
}

export interface Violacao {
  /** id estável — vira métrica de "o que mais reprova" com o tempo. */
  id: string;
  /** O que apareceu na peça. */
  trecho: string;
  /** Por que isto não pode ir ao cliente, em linguagem de negócio. */
  motivo: string;
}

export interface VereditoDoPiso {
  aprovado: boolean;
  violacoes: Violacao[];
}

// ─── Padrões ────────────────────────────────────────────────────────────────

/** Telefone brasileiro em qualquer formatação usual. */
const RE_TELEFONE = /(?:\+?55\s*)?(?:\(?\d{2}\)?[\s.-]*)?9?\d{4}[\s.-]?\d{4}/g;
const RE_EMAIL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const RE_VALOR = /R\$\s?([\d.]+(?:,\d{2})?)/g;
/** CNPJ e CPF: nunca deveriam ser gerados por um modelo. */
const RE_DOCUMENTO = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b|\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;

/** Rascunho que vazou para a entrega. O cliente lendo "[inserir aqui]" perde a
 *  confiança em tudo que veio junto — e isso não é questão de gosto. */
const RE_PLACEHOLDER = /\[(?:inserir|preencher|completar|adicionar|seu|sua)\b[^\]]*\]|\blorem ipsum\b|\{\{[^}]+\}\}/gi;

/** Marcadores que SÓ valem em CAIXA ALTA, e a distinção não é preciosismo:
 *  `TODO` sem diferenciar maiúscula casa com "Todo dia", "toda semana", "todos
 *  os dias" — palavras comuníssimas em português. Reprovar por elas faria o
 *  piso barrar peça legítima o tempo todo, e um freio que reprova tudo é
 *  desligado na primeira semana. */
const RE_PLACEHOLDER_CAIXA_ALTA = /\bTODO\b|\bFIXME\b|\bXXX+\b/g;

/** Promessa de resultado com número. É o que dá processo, não só reclamação:
 *  marketing não garante venda, e prometer garantia é publicidade enganosa. */
const RE_PROMESSA = new RegExp(
  String.raw`\b(garant\w+|assegur\w+|prometemos|com certeza)\b[^.!?\n]{0,80}?\d+\s*%` + "|" +
  String.raw`\d+\s*%[^.!?\n]{0,60}?\b(garantid\w+|assegurad\w+)\b` + "|" +
  String.raw`\b(garantimos|prometemos)\b[^.!?\n]{0,60}?\b(vendas?|faturamento|resultado|retorno|lucro|clientes?)\b`,
  "gi",
);

// ─── Normalização ───────────────────────────────────────────────────────────

const digitos = (s: string) => s.replace(/\D/g, "");

/** "R$ 2.500,00" → 2500 */
function paraNumero(bruto: string): number {
  const limpo = bruto.replace(/\./g, "").replace(",", ".");
  const n = Number(limpo);
  return Number.isFinite(n) ? n : NaN;
}

/** O texto sem os trechos em que o especialista ADMITE não saber. "PRECISO
 *  CONFIRMAR: verba mensal" é o comportamento correto — não pode ser punido. */
function semAdmissoes(texto: string): string {
  return texto.replace(/PRECISO CONFIRMAR[^\n]*/gi, " ");
}

/** Um número de telefone só é "conhecido" se bater com um do cliente. Comparar
 *  por sufixo de 8 dígitos evita falso positivo por DDD escrito diferente. */
function telefoneConhecido(achado: string, conhecidos: string[]): boolean {
  const d = digitos(achado);
  if (d.length < 8) return false;
  const sufixo = d.slice(-8);
  return conhecidos.some((c) => digitos(c).endsWith(sufixo));
}

// ─── O piso ─────────────────────────────────────────────────────────────────

/**
 * Confere a peça contra a verdade conhecida do cliente. Determinístico,
 * sem IA e sem rede.
 *
 * Falso positivo aqui custa uma revisão automática; falso negativo custa a
 * confiança do cliente. Por isso, na dúvida, **reprova** — mas só sobre FATO
 * verificável, nunca sobre estilo.
 */
export function conferirPisoDeVerdade(conteudo: string, verdade: VerdadeDoCliente): VereditoDoPiso {
  const violacoes: Violacao[] = [];
  const texto = semAdmissoes(conteudo);

  // 1. Telefone que a agência não conhece. Cliente ligando num número errado
  //    impresso pela agência é dano direto ao negócio dele.
  for (const achado of texto.match(RE_TELEFONE) ?? []) {
    if (!telefoneConhecido(achado, verdade.telefones)) {
      violacoes.push({
        id: "telefone_inventado",
        trecho: achado.trim(),
        motivo: "Telefone que não veio do cliente. Número inventado numa peça publicada manda gente para a linha errada.",
      });
    }
  }

  // 2. E-mail desconhecido — mesmo raciocínio.
  for (const achado of texto.match(RE_EMAIL) ?? []) {
    const conhecido = verdade.emails.some((e) => e.toLowerCase() === achado.toLowerCase());
    if (!conhecido) {
      violacoes.push({
        id: "email_inventado",
        trecho: achado,
        motivo: "E-mail que não veio do cliente. Endereço inventado perde contato de verdade.",
      });
    }
  }

  // 3. Valor que o cliente nunca informou. É promessa comercial: o cliente lê
  //    "R$ 2.000/mês" e passa a cobrar isso da agência.
  for (const m of texto.matchAll(RE_VALOR)) {
    const n = paraNumero(m[1]!);
    if (!Number.isFinite(n)) continue;
    const informado = verdade.valores.some((v) => Math.abs(v - n) < 0.01);
    if (!informado) {
      violacoes.push({
        id: "valor_inventado",
        trecho: m[0],
        motivo: "Valor que o cliente não informou. Número em peça vira promessa comercial — e ele vai cobrar por ela.",
      });
    }
  }

  // 4. CNPJ/CPF gerado por modelo. Não existe motivo legítimo para um agente
  //    de marketing produzir documento: ou veio do cadastro, ou é ficção.
  for (const achado of texto.match(RE_DOCUMENTO) ?? []) {
    violacoes.push({
      id: "documento_inventado",
      trecho: achado,
      motivo: "CNPJ/CPF gerado pela IA. Documento em peça de cliente é sempre invenção — e é grave.",
    });
  }

  // 5. Rascunho vazado.
  const rascunhos = [...(texto.match(RE_PLACEHOLDER) ?? []), ...(texto.match(RE_PLACEHOLDER_CAIXA_ALTA) ?? [])];
  for (const achado of rascunhos) {
    violacoes.push({
      id: "placeholder",
      trecho: achado.trim(),
      motivo: "Marcador de rascunho na entrega. O cliente lendo isso desconfia de tudo que veio junto.",
    });
  }

  // 6. Promessa de resultado com número. O risco aqui é jurídico, não estético.
  for (const achado of texto.match(RE_PROMESSA) ?? []) {
    violacoes.push({
      id: "promessa_de_resultado",
      trecho: achado.trim().slice(0, 120),
      motivo: "Garantia de resultado numérico. Marketing não garante venda — prometer isso é publicidade enganosa.",
    });
  }

  return { aprovado: violacoes.length === 0, violacoes };
}

/** O parecer em uma linha, para o agente corrigir e para o painel mostrar. */
export function resumirViolacoes(violacoes: Violacao[]): string {
  if (violacoes.length === 0) return "";
  return violacoes.map((v) => `${v.motivo} (encontrado: "${v.trecho}")`).join(" ");
}
