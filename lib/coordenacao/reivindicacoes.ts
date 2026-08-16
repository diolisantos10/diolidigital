// A trava de reivindicação — a régua, sem I/O e sem rede.
//
// ── O CASO QUE ISTO EXISTE PARA MATAR (16/08/2026) ─────────────────────────
// Três frentes foram construídas EM DOBRO no mesmo dia, por chats diferentes,
// cegos uns para os outros, na mesma branch:
//
//   1. `parse_error` do SDR — dois commits, ~3h cada, um descartado;
//   2. "verba declarada vs estimativa" — DOIS módulos com a MESMA
//      responsabilidade e nomes de arquivo DIFERENTES
//      (`verba-declarada.ts` e `verba-vs-estimativa.ts`). Colisão por caminho
//      de arquivo não pegaria este caso — só colisão por RESPONSABILIDADE
//      declarada pega;
//   3. e-mail de "orçamento pronto" — colisão em 4 arquivos.
//
// A doutrina (`docs/kit/13-quem-esta-vivo.md` §3) já mandava "escreva a
// reivindicação, commite antes de começar" desde 02/08/2026. As três colisões
// acima aconteceram com a regra ESCRITA. Prompt é sugestão; isto é mecanismo.
//
// Este arquivo é só a régua: funções puras, testáveis sem git e sem disco. Quem
// fala com o git, o disco e o remoto é `scripts/reivindicar.mts` — a mesma
// separação que `porta-de-emergencia.ts` já usa nesta casa (regra testável,
// I/O num script fino por cima).

/** Uma reivindicação de frente de trabalho, como grava em `reivindicacoes/*.json`. */
export type Reivindicacao = {
  /** Slug da responsabilidade, ex.: "comercial/verba-vs-estimativa". */
  id: string;
  /** Identificação da sessão que abriu, ex.: "pm-a27b5772". */
  quem: string;
  /** Uma frase: o que está sendo feito. */
  frente: string;
  /** A PERGUNTA que o código responde, normalizada. */
  responsabilidade: string;
  /** Caminhos que a frente vai tocar — arquivo ou prefixo de pasta. */
  arquivos: string[];
  /** ISO-8601. */
  abertaEm: string;
  encerradaEm: string | null;
  forcadaPor?: { quem: string; motivo: string; em: string };
};

/** Só o que `conferirColisao` precisa para julgar uma reivindicação nova —
 *  antes dela ganhar `id`/`abertaEm`, que quem grava (o script) decide. */
export type PropostaDeReivindicacao = Pick<Reivindicacao, "quem" | "responsabilidade" | "arquivos">;

export type EstadoDaReivindicacao = "viva" | "velha" | "encerrada";

export type ResultadoDeColisao = {
  colide: boolean;
  /** Motivos que BLOQUEIAM — reivindicação viva de outra sessão. */
  motivos: string[];
  /** Avisos que NÃO bloqueiam — reivindicação velha (>= teto de horas). */
  avisos: string[];
};

export type ResultadoDoRegistro = {
  ok: boolean;
  /** Um problema por par de reivindicações vivas em conflito. */
  problemas: string[];
};

/** 24h — o teto padrão da casa. Sessão que morre sem encerrar não pode travar
 *  a frente para sempre (guardrail 5: a proteção não pode ser mais destrutiva
 *  que o problema que ela existe para evitar). */
export const TETO_HORAS_PADRAO = 24;

/**
 * minúsculas, sem acento, separador único "/".
 *
 * Aceita que quem digita a responsabilidade use espaço, `_`, `\` ou `/`
 * misturados — é texto de gente, não de máquina — e reduz tudo a um único
 * formato canônico. É esta canonização que faz "comercial/verba-vs-estimativa"
 * e "Comercial / Verba Vs Estimativa" colidirem: sem ela, o caso 2 do
 * 16/08/2026 (nomes de ARQUIVO diferentes, mesma responsabilidade) não seria
 * pego só por texto ligeiramente diferente.
 */
export function normalizarResponsabilidade(s: string): string {
  const semAcento = Array.from(s.normalize("NFD"))
    // A forma NFD separa toda letra acentuada em "letra-base" + "marca
    // combinante" (ex.: "ê" vira "e" + acento circunflexo à parte). Descartar
    // o que sobra nessa faixa de código apaga o acento sem tocar na letra.
    //
    // Comparação por NÚMERO decimal de código de caractere — não por regex
    // com faixa `\uXXXX` nem por caractere literal colado no arquivo — porque
    // as duas formas anteriores já saíram corrompidas ao serem escritas aqui
    // (o editor normaliza/renderiza o escape antes de gravar). Número decimal
    // não tem como ser "renderizado" errado.
    .filter((ch) => {
      const codigo = ch.codePointAt(0) ?? 0;
      const ehMarcaCombinante = codigo >= 768 && codigo <= 879; // bloco Unicode "Combining Diacritical Marks"
      return !ehMarcaCombinante;
    })
    .join("");

  return semAcento
    .toLowerCase()
    .trim()
    .split(/[\\/\s_]+/) // qualquer um destes conta como separador
    .filter(Boolean)
    .join("/");
}

/** sem `./`, sem barra final. Só o suficiente para "a/b" e "./a/b/" contarem
 *  como o mesmo caminho — sem virar um resolvedor de path completo, que este
 *  arquivo não precisa (não há sistema de arquivos aqui). */
export function normalizarCaminho(p: string): string {
  let out = p.trim().replace(/\\/g, "/");
  while (out.startsWith("./")) out = out.slice(2);
  while (out.length > 1 && out.endsWith("/")) out = out.slice(0, -1);
  return out;
}

/** Nome do arquivo que grava esta responsabilidade em `reivindicacoes/`.
 *  Um arquivo por reivindicação: duas sessões pegando a MESMA responsabilidade
 *  colidem no MESMO nome de arquivo — o sinal que se quer, e de graça, porque
 *  o próprio git recusa dois arquivos iguais sem que ninguém escreva a régua
 *  duas vezes. */
export function nomeDoArquivo(responsabilidadeNormalizada: string): string {
  return `${responsabilidadeNormalizada.replace(/\//g, "-")}.json`;
}

/** Dois caminhos "se tocam" quando são iguais OU um é prefixo de diretório do
 *  outro — nunca quando um é só prefixo de TEXTO do outro (`lib/email` não
 *  pode colidir com `lib/email-templates`). */
function seTocam(a: string, b: string): boolean {
  if (a === b) return true;
  return a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

/**
 * Encerrada nunca está viva. Aberta há mais de `tetoHoras` NÃO bloqueia —
 * devolve "velha", não "viva". Ver o guardrail 5 no cabeçalho do arquivo:
 * trava eterna é trava que alguém arranca por fora, e aí ela para de proteger
 * qualquer coisa.
 */
export function estaViva(r: Reivindicacao, agora: Date, tetoHoras: number = TETO_HORAS_PADRAO): EstadoDaReivindicacao {
  if (r.encerradaEm) return "encerrada";
  const abertaEmMs = Date.parse(r.abertaEm);
  if (Number.isNaN(abertaEmMs)) return "velha"; // data ilegível não pode bloquear ninguém
  const horas = (agora.getTime() - abertaEmMs) / (1000 * 60 * 60);
  return horas > tetoHoras ? "velha" : "viva";
}

/**
 * A régua de colisão — duas regras independentes, cada uma pega um dos casos
 * reais de 16/08/2026:
 *
 *   • mesma responsabilidade normalizada → colide (caso 2: nomes de arquivo
 *     diferentes, mesma pergunta respondida duas vezes);
 *   • sobreposição de arquivo (igual ou prefixo de pasta) → colide (casos 1 e 3).
 *
 * Reivindicação encerrada nunca colide. Reivindicação velha entra em
 * `avisos`, nunca em `motivos` — ela NÃO bloqueia. A própria reivindicação do
 * mesmo `quem` nunca colide consigo mesma (reabrir/conferir a própria frente
 * não pode acusar a própria sessão de invasão).
 */
export function conferirColisao(
  nova: PropostaDeReivindicacao,
  existentes: Reivindicacao[],
  agora: Date,
  tetoHoras: number = TETO_HORAS_PADRAO,
): ResultadoDeColisao {
  const motivos: string[] = [];
  const avisos: string[] = [];

  const respostaDaNova = normalizarResponsabilidade(nova.responsabilidade);
  const arquivosDaNova = nova.arquivos.map(normalizarCaminho);

  for (const existente of existentes) {
    if (existente.quem === nova.quem) continue; // nunca colide consigo mesma

    const estado = estaViva(existente, agora, tetoHoras);
    if (estado === "encerrada") continue;

    const mesmaResponsabilidade = normalizarResponsabilidade(existente.responsabilidade) === respostaDaNova;
    const arquivosDaExistente = existente.arquivos.map(normalizarCaminho);
    const arquivoEmComum = arquivosDaNova.find((a) => arquivosDaExistente.some((b) => seTocam(a, b)));

    if (!mesmaResponsabilidade && !arquivoEmComum) continue;

    const motivo = mesmaResponsabilidade
      ? `mesma responsabilidade "${existente.responsabilidade}" já reivindicada por ${existente.quem} (frente: "${existente.frente}")`
      : `arquivo "${arquivoEmComum}" já reivindicado por ${existente.quem} (frente: "${existente.frente}")`;

    if (estado === "velha") {
      avisos.push(`[reivindicação velha, não bloqueia] ${motivo} — aberta em ${existente.abertaEm}.`);
    } else {
      motivos.push(motivo);
    }
  }

  return { colide: motivos.length > 0, motivos, avisos };
}

/**
 * O registro inteiro contra si mesmo — usado pelo sentinela que roda em
 * `npm test`. Reusa `conferirColisao` par a par (mesma régua do `abrir`, de
 * propósito: duas réguas para a mesma pergunta divergem no dia em que alguém
 * "otimiza" uma delas — ver `porta-de-emergencia.ts` para o mesmo raciocínio
 * aplicado ao sentinela do deploy).
 */
export function conferirRegistro(reivindicacoes: Reivindicacao[], agora: Date, tetoHoras: number = TETO_HORAS_PADRAO): ResultadoDoRegistro {
  const problemas: string[] = [];

  for (let i = 0; i < reivindicacoes.length; i++) {
    for (let j = i + 1; j < reivindicacoes.length; j++) {
      const a = reivindicacoes[i]!;
      const b = reivindicacoes[j]!;

      // `conferirColisao` foi escrita para o comando `abrir`, onde só o lado
      // "existente" pode estar encerrado — a "nova" ainda nem tem
      // `encerradaEm`. Aqui os dois lados são reivindicações DE VERDADE, e o
      // laço par a par passa `a` no papel de "nova": se `a` já estiver
      // encerrada, `conferirColisao` nunca olha para isso (ela só checa o
      // estado de `b`) e o par seria acusado de colidir mesmo com `a` morta.
      // Por isso a checagem simétrica mora aqui, não dentro de
      // `conferirColisao` — mexer nela quebraria o uso do `abrir`.
      if (estaViva(a, agora, tetoHoras) === "encerrada" || estaViva(b, agora, tetoHoras) === "encerrada") continue;

      const r = conferirColisao(a, [b], agora, tetoHoras);
      if (r.colide) {
        problemas.push(`"${a.id}" (${a.quem}) × "${b.id}" (${b.quem}): ${r.motivos.join("; ")}`);
      }
    }
  }

  return { ok: problemas.length === 0, problemas };
}

/** Os campos que TODO JSON de `reivindicacoes/` precisa ter. Usado pelo
 *  sentinela para reprovar arquivo malformado, e citado aqui — não duplicado —
 *  para o teste e a validação nunca divergirem sobre o que é "obrigatório". */
export const CAMPOS_OBRIGATORIOS: ReadonlyArray<keyof Reivindicacao> = [
  "id",
  "quem",
  "frente",
  "responsabilidade",
  "arquivos",
  "abertaEm",
  "encerradaEm",
];

function ehDataIsoValida(v: unknown): v is string {
  return typeof v === "string" && v.length > 0 && !Number.isNaN(Date.parse(v));
}

/**
 * Valida um JSON cru (de disco ou de `git show`) contra o formato de
 * `Reivindicacao`. Lança com uma mensagem que nomeia o arquivo de origem e o
 * campo — quem lê o erro do sentinela não pode ter que adivinhar qual dos
 * arquivos está quebrado.
 */
export function validarReivindicacao(dado: unknown, origem: string): Reivindicacao {
  if (typeof dado !== "object" || dado === null || Array.isArray(dado)) {
    throw new Error(`${origem}: não é um objeto JSON válido.`);
  }
  const d = dado as Record<string, unknown>;

  for (const campo of CAMPOS_OBRIGATORIOS) {
    if (!(campo in d)) throw new Error(`${origem}: falta o campo obrigatório "${campo}".`);
  }
  if (typeof d.id !== "string" || !d.id.trim()) throw new Error(`${origem}: "id" tem que ser string não vazia.`);
  if (typeof d.quem !== "string" || !d.quem.trim()) throw new Error(`${origem}: "quem" tem que ser string não vazia.`);
  if (typeof d.frente !== "string" || !d.frente.trim()) throw new Error(`${origem}: "frente" tem que ser string não vazia.`);
  if (typeof d.responsabilidade !== "string" || !d.responsabilidade.trim()) {
    throw new Error(`${origem}: "responsabilidade" tem que ser string não vazia.`);
  }
  if (!Array.isArray(d.arquivos) || d.arquivos.length === 0 || d.arquivos.some((a: unknown) => typeof a !== "string")) {
    throw new Error(`${origem}: "arquivos" tem que ser uma lista não vazia de strings.`);
  }
  if (!ehDataIsoValida(d.abertaEm)) throw new Error(`${origem}: "abertaEm" tem que ser data ISO-8601 válida.`);
  if (d.encerradaEm !== null && !ehDataIsoValida(d.encerradaEm)) {
    throw new Error(`${origem}: "encerradaEm" tem que ser null ou data ISO-8601 válida.`);
  }

  const reivindicacao: Reivindicacao = {
    id: d.id,
    quem: d.quem,
    frente: d.frente,
    responsabilidade: d.responsabilidade,
    arquivos: d.arquivos as string[],
    abertaEm: d.abertaEm,
    encerradaEm: (d.encerradaEm as string | null) ?? null,
  };

  if (d.forcadaPor !== undefined) {
    const f = d.forcadaPor;
    if (
      typeof f !== "object" ||
      f === null ||
      typeof (f as Record<string, unknown>).quem !== "string" ||
      typeof (f as Record<string, unknown>).motivo !== "string" ||
      typeof (f as Record<string, unknown>).em !== "string"
    ) {
      throw new Error(`${origem}: "forcadaPor" presente mas malformado (precisa de quem/motivo/em, todos string).`);
    }
    const ff = f as { quem: string; motivo: string; em: string };
    reivindicacao.forcadaPor = { quem: ff.quem, motivo: ff.motivo, em: ff.em };
  }

  return reivindicacao;
}
