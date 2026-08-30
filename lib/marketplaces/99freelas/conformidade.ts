// ─── COMPLIANCE VALIDATOR — o que NÃO pode sair escrito ─────────────────────
//
// Roda sobre todo texto que a casa manda para a plataforma: proposta, pergunta,
// mensagem de chat. É TRAVA, não aviso: o gate bloqueia o envio, não emite um
// alerta que ninguém lê. Prompt é sugestão; isto é mecanismo.
//
// ── AS SEIS PROIBIÇÕES, TODAS COM FONTE ─────────────────────────────────────
//   1. link externo            — Regras para Freelancers
//   2. dado de contato         — idem (telefone, e-mail, @, "chama no zap")
//   3. pagamento por fora      — Termos de Uso
//   4. REFERÊNCIA À COMISSÃO   — Central de Ajuda, "Como enviar propostas?":
//                                🚫 "Não fazer referência à comissão do 99Freelas"
//   5. pagamento comissionado  — Termos de Uso
//   6. permuta / teste grátis  — Projetos não permitidos
//
// A nº 4 é a que a especificação 00 do CEO NÃO previa e o parecer descobriu.
// "Esse valor já considera a taxa da plataforma" é violação — a frase mais
// natural do mundo para quem está precificando, e a que derruba a conta.
//
// ── POR QUE ESTE ARQUIVO NÃO "LIMPA" E SEGUE ────────────────────────────────
// Existe `higienizar`, e ele é para o RASCUNHO. O validador NÃO higieniza antes
// de julgar: um texto que precisou ser limpo é um texto que o gerador escreveu
// errado, e apagar o erro sem contar esconde a reincidência. Limpa-se o
// rascunho; julga-se o que vai sair.

export type RegraDeConteudo =
  | "link_externo"
  | "dado_de_contato"
  | "pagamento_fora"
  | "referencia_a_comissao"
  | "pagamento_comissionado"
  | "permuta_ou_teste_gratis";

export interface Achado {
  regra: RegraDeConteudo;
  /** O pedaço exato do texto que disparou. É o que vai para a tela — dizer
   *  "tem link" sem mostrar qual obriga o humano a caçar. */
  trecho: string;
  fonte: string;
}

export interface ResultadoDaConformidade {
  ok: boolean;
  achados: Achado[];
}

interface Padrao {
  regra: RegraDeConteudo;
  re: RegExp;
  fonte: string;
}

const F_REGRAS = "Termos de Uso · Regras para Freelancers";
const F_AJUDA = "Central de Ajuda · Como enviar propostas?";
const F_PROIBIDOS = "Central de Ajuda · Projetos não permitidos";
// Fonte específica do padrão de direcionamento-para-fora (ficha I, abaixo):
// citação literal do policy.json que o parecer da ficha B já apontava e a
// ficha I cobrou de volta.
const F_DIRECIONAMENTO =
  'policy.json · proibicoes_de_conteudo.dado_de_contato + link_externo — ' +
  '"não se pode adicionar dados de contato e/ou links ao seu perfil ou ' +
  'portfólio" / "não se pode solicitar ou compartilhar dados de contato"';

/**
 * Os padrões. Ordem não importa (todos rodam); o que importa é cada um ter
 * fonte nomeada — regra sem fonte é opinião, e opinião não bloqueia envio.
 */
const PADROES: Padrao[] = [
  // 1. LINK ─────────────────────────────────────────────────────────────────
  { regra: "link_externo", re: /https?:\/\/\S+/gi, fonte: F_REGRAS },
  { regra: "link_externo", re: /\bwww\.[a-z0-9-]+\.[a-z]{2,}/gi, fonte: F_REGRAS },
  // Domínio solto ("dioli.com.br", "meusite.io"). A lista de TLDs é FECHADA de
  // propósito: um `\.[a-z]{2,}` genérico transformaria "R$ 1.500" e "etc.br"
  // em violação e o gate viraria ruído que a equipe aprende a ignorar.
  {
    regra: "link_externo",
    re: /\b[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.(?:com|com\.br|net|net\.br|org|org\.br|io|co|app|dev|site|me|link|bio|shop|studio|digital)\b/gi,
    fonte: F_REGRAS,
  },

  // 2. CONTATO ──────────────────────────────────────────────────────────────
  { regra: "dado_de_contato", re: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, fonte: F_REGRAS },
  // @handle de rede social. Exige 3+ caracteres para não pegar "@" solto.
  { regra: "dado_de_contato", re: /(?:^|[\s(])@[a-z0-9._]{3,}/gi, fonte: F_REGRAS },
  // Telefone brasileiro, com ou sem DDD, com ou sem máscara.
  { regra: "dado_de_contato", re: /(?:\+?55\s*)?(?:\(?\d{2}\)?[\s.-]*)?9?\d{4}[\s.-]?\d{4}\b/g, fonte: F_REGRAS },
  {
    regra: "dado_de_contato",
    // "instagram", "insta" e "linkedin" foram TIRADOS desta lista pelo
    // `seguranca` na Onda 2 (célula de prospecção, ficha B) — achado, não
    // suspeita: o texto limpo de teste da própria ficha do CEO ("preciso de
    // 12 posts para Instagram de uma clínica odontológica...") é um anúncio
    // NORMAL de uma agência de social media, e a palavra nua "Instagram"
    // como PLATAFORMA DE ENTREGA disparava esta regra por engano — a prova
    // de que o defeito já era conhecido: `PROPOSTA_LIMPA` em
    // `__tests__/marketplaces/99freelas.test.ts` evita citar a palavra
    // "Instagram" e escreve "perfil de rede social" no lugar dela. Trava que
    // barra o caso limpo é desligada na primeira sexta-feira apertada — e
    // "fazer posts para Instagram" é o produto central desta casa, não uma
    // exceção. A combinação REALMENTE hostil ("me chama no instagram", "fala
    // comigo no instagram") continua barrada pelos padrões
    // `me\s+chama\s+n[oa]` / `chama\s+n[oa]`, que não dependem do nome da
    // plataforma. WhatsApp/Telegram/Skype/Discord continuam na lista: são
    // apps de contato direto, não plataformas de entrega desta agência.
    re: /\b(?:whats\s*app|whatsapp|whats|zap|telegram|skype|discord|e-?mail|email|celular|telefone|meu\s+site|meu\s+portf[óo]lio|fora\s+da\s+plataforma|me\s+chama\s+n[oa]|chama\s+n[oa]|falar\s+por\s+fora)\b/gi,
    fonte: F_REGRAS,
  },

  // 2b. DIRECIONAMENTO PARA FORA DA PLATAFORMA — a AÇÃO, não o nome da rede ──
  // Ficha I (docs/celula-prospeccao/despachos/I-o-meio-termo-do-guardiao.md,
  // 30/08/2026, laudo do `qualidade`). A remoção de "instagram"/"insta"/
  // "linkedin" (ficha B, Onda 2) consertou o falso positivo de verdade
  // ("12 posts para Instagram" é o produto central desta casa) mas abriu um
  // meio-termo: "me segue no insta" e "meu perfil no linkedin" passaram a
  // PASSAR — não são @handle, não citam a palavra proibida sozinha, e
  // "perfil" ≠ "portfólio". A fonte (policy.json, ver F_DIRECIONAMENTO acima)
  // proíbe a CONDUTA de mandar o cliente seguir/achar/conferir um perfil fora
  // da plataforma — não o nome da rede. Por isso o padrão pega o VERBO de
  // direcionamento (segue, acha, procura, "meu perfil no", "dá uma olhada no
  // meu perfil"), não a palavra da plataforma: nenhuma dessas construções
  // aparece numa proposta comum de "posts/gestão/reels para Instagram" — quem
  // vende entrega não pede para ser seguido.
  {
    regra: "dado_de_contato",
    // "me segue no/na X", "nos segue no/na X", "segue a gente no/na X"
    re: /\b(?:me\s+segue|nos\s+segue|segue\s+a\s+gente)\s+n[oa]\s+\S+/gi,
    fonte: F_DIRECIONAMENTO,
  },
  {
    regra: "dado_de_contato",
    // "meu perfil no/na X" — direciona para FORA; distinto de citar o
    // próprio portfólio DENTRO da plataforma, que não tem "no/na + destino".
    re: /\bmeu\s+perfil\s+n[oa]\s+\S+/gi,
    fonte: F_DIRECIONAMENTO,
  },
  {
    regra: "dado_de_contato",
    // "me acha no/na X", "me encontra no/na X"
    re: /\b(?:me\s+acha|me\s+encontra)\s+n[oa]\s+\S+/gi,
    fonte: F_DIRECIONAMENTO,
  },
  {
    regra: "dado_de_contato",
    // "procura por mim/a gente/nós no/na X" — mantido estreito (auto-
    // referência + "no/na") para não pegar "procura qualidade no mercado" e
    // frases benignas parecidas.
    re: /\bprocura\s+(?:por\s+)?(?:mim|a\s+gente|n[oó]s)\s+n[oa]\s+\S+/gi,
    fonte: F_DIRECIONAMENTO,
  },
  {
    regra: "dado_de_contato",
    // "dá/dê uma olhada no meu perfil", "olha/confere meu perfil"
    re: /\b(?:d[áa]|d[êe])\s+uma\s+olhada\s+(?:n[oa]\s+)?meu\s+perfil\b|\b(?:olha|olhe|confere|conf[ie]ra)\s+meu\s+perfil\b/gi,
    fonte: F_DIRECIONAMENTO,
  },

  // 3. PAGAMENTO POR FORA ───────────────────────────────────────────────────
  // A variante conjugada ("pago por fora", "paga por fora") foi ACRESCENTADA
  // pelo `seguranca` na Onda 2 (célula de prospecção, ficha B) — o teste da
  // entrada hostil usa "pago por fora, sem a taxa da plataforma", e a
  // alternação antiga só cobria "pagar"/"pagamento"/"receber" por fora.
  // Mesma fonte da regra original: é a mesma proibição, só faltava a flexão.
  {
    regra: "pagamento_fora",
    re: /\b(?:pix|dep[óo]sito\s+em\s+conta|transfer[êe]ncia\s+banc[áa]ria|dados?\s+banc[áa]rios?|pag(?:ar|amento|o|a)\s+por\s+fora|receber\s+por\s+fora|direto\s+comigo)\b/gi,
    fonte: "Termos de Uso · Sanções",
  },

  // 4. REFERÊNCIA À COMISSÃO — a que a especificação do CEO não previa ───────
  {
    regra: "referencia_a_comissao",
    re: /\b(?:comiss[ãa]o|taxa\s+d[aoe]\s*(?:plataforma|site|99\s*freelas|99freelas|intermedia[çc][ãa]o)|taxa\s+cobrada\s+pel[oa]|j[áa]\s+(?:considera|inclui|est[áa]\s+inclu[íi]d[ao])\s+a\s+taxa|descontad[ao]\s+a\s+taxa|l[íi]quido\s+ap[óo]s\s+a\s+taxa)\b/gi,
    fonte: F_AJUDA,
  },

  // 5. PAGAMENTO COMISSIONADO ───────────────────────────────────────────────
  {
    regra: "pagamento_comissionado",
    re: /\b(?:pagamento\s+comissionado|trabalho\s+comissionado|por\s+comiss[ãa]o|%\s*(?:das|sobre\s+as)\s+vendas|participa[çc][ãa]o\s+nos\s+lucros|s[óo]cio\s+do\s+projeto)\b/gi,
    fonte: "Termos de Uso · Regras para Freelancers",
  },

  // 6. PERMUTA / TESTE GRÁTIS ───────────────────────────────────────────────
  {
    regra: "permuta_ou_teste_gratis",
    re: /\b(?:permuta|escambo|teste\s+gr[áa]tis|amostra\s+gr[áa]tis|fa[çc]o\s+de\s+gra[çç]a|sem\s+custo\s+inicial)\b/gi,
    fonte: F_PROIBIDOS,
  },
];

/**
 * Julga o texto. `ok: false` = o envio PARA.
 *
 * Não devolve "aviso" e nem "score": um portão com nota é um portão que alguém
 * arredonda para cima numa sexta-feira apertada.
 */
export function validarTexto(texto: string): ResultadoDaConformidade {
  const alvo = texto ?? "";
  const achados: Achado[] = [];
  const vistos = new Set<string>();

  for (const padrao of PADROES) {
    // `lastIndex` de um regex global é ESTADO: sem reiniciar, a segunda chamada
    // desta função começa de onde a primeira parou e deixa passar violação.
    padrao.re.lastIndex = 0;
    for (const m of alvo.matchAll(padrao.re)) {
      const trecho = (m[0] ?? "").trim();
      if (!trecho) continue;
      const chave = `${padrao.regra}::${trecho.toLowerCase()}`;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      achados.push({ regra: padrao.regra, trecho, fonte: padrao.fonte });
    }
  }

  return { ok: achados.length === 0, achados };
}

/**
 * Limpa um RASCUNHO nosso antes de ele ser julgado.
 *
 * Tira o que dá para tirar sem mudar o sentido (link e contato). NÃO tenta
 * reescrever referência à comissão nem oferta de permuta: essas mudam o sentido
 * comercial da frase, e um robô que reescreve preço em silêncio é pior que um
 * robô que para e pergunta.
 */
export function higienizar(texto: string): string {
  return (texto ?? "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\bwww\.[a-z0-9-]+\.[a-z]{2,}\S*/gi, "")
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, "")
    .replace(/(?:\+?55\s*)?(?:\(?\d{2}\)?[\s.-]*)?9?\d{4}[\s.-]?\d{4}\b/g, "")
    .replace(/(?:^|[\s(])@[a-z0-9._]{3,}/gi, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * O texto de duas propostas é o MESMO?
 *
 * Texto repetido entre projetos é o vetor de spam listado nas Sanções, e spam é
 * a sanção que o parecer marcou como a mais provável para um robô. Similaridade
 * por conjunto de trigramas de palavra: barata, sem IA e sem depender de rede.
 *
 * Não decide sozinha o corte — quem decide é o gate, que compara com o teto.
 */
export function similaridade(a: string, b: string): number {
  const ta = trigramas(a);
  const tb = trigramas(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let comuns = 0;
  for (const t of ta) if (tb.has(t)) comuns++;
  return comuns / Math.min(ta.size, tb.size);
}

function trigramas(texto: string): Set<string> {
  const palavras = (texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const s = new Set<string>();
  for (let i = 0; i + 2 < palavras.length; i++) s.add(`${palavras[i]} ${palavras[i + 1]} ${palavras[i + 2]}`);
  return s;
}

/** Acima disto, duas propostas contam como a mesma. */
export const TETO_DE_SIMILARIDADE = 0.6;
