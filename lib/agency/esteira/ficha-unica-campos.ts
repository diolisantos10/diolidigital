// ficha-unica-campos.ts — a LISTA de campos da ficha única e o mapa do antigo
// Brand Hub. Sem banco: a tela importa daqui sem levar o Prisma junto.
// Quem lê e grava é `ficha-unica.ts`.

/** Os campos da ficha única, na ordem da tela. `coluna` = onde mora. */
export const CAMPOS_DA_FICHA_UNICA = [
  { chave: "tagline", rotulo: "Slogan / tagline", coluna: "tagline", ajuda: "A frase curta da marca." },
  { chave: "resumo", rotulo: "Resumo do negócio", coluna: "extra", ajuda: "O que o negócio é, o que vende, por que existe." },
  { chave: "manifesto", rotulo: "Manifesto / história", coluna: "extra", ajuda: "De onde a marca veio e no que acredita." },
  { chave: "proposta", rotulo: "Proposta de valor / posicionamento", coluna: "positioning", ajuda: "Por que escolher esta marca e não outra." },
  { chave: "publico", rotulo: "Público e persona", coluna: "targetAudience", ajuda: "Com quem a marca fala. Pode descrever a persona." },
  { chave: "tom", rotulo: "Tom de voz", coluna: "tone", ajuda: "Como a marca se comunica." },
  { chave: "produtos", rotulo: "Produtos e serviços", coluna: "extra", ajuda: "Um por linha: nome — descrição — preço (o preço é opcional)." },
  { chave: "concorrentes", rotulo: "Concorrentes e referências", coluna: "extra", ajuda: "Quem disputa o mesmo cliente e quem inspira." },
  { chave: "objetivos", rotulo: "Objetivos", coluna: "extra", ajuda: "O que a marca quer alcançar (vendas, seguidores, leads…)." },
  { chave: "canais", rotulo: "Canais e redes", coluna: "extra", ajuda: "Site, Instagram, WhatsApp… um por linha." },
  { chave: "paleta", rotulo: "Paleta de cores", coluna: "extra", ajuda: "Nome, código e uso. Separe por vírgula, ponto e vírgula, linha ou ·. Ex.: Vermelho #C8102E fundo; Preto #111111 texto" },
  { chave: "tipografia", rotulo: "Tipografia", coluna: "typography", ajuda: "Fonte e uso. Ex.: Montserrat Bold (títulos), Inter (texto)" },
  { chave: "regrasDoLogo", rotulo: "Regras de uso do logo", coluna: "extra", ajuda: "Área de proteção, tamanho mínimo, fundos permitidos." },
  { chave: "estiloDeFoto", rotulo: "Estilo de foto / imagem", coluna: "extra", ajuda: "Luz, enquadramento, cenário, o que aparece." },
  { chave: "regras", rotulo: "Regras da marca", coluna: "values", ajuda: "Inegociáveis. Uma por linha." },
  { chave: "evitar", rotulo: "O que evitar", coluna: "extra", ajuda: "Palavras, temas, estilos que a marca não usa." },
  { chave: "notasInternas", rotulo: "Notas internas (só a agência vê)", coluna: "extra", ajuda: "Contexto, histórico, ressalvas." },
] as const;

export type ChaveDaFichaUnica = (typeof CAMPOS_DA_FICHA_UNICA)[number]["chave"];
export type FichaUnica = Partial<Record<ChaveDaFichaUnica, string>>;

/**
 * Os nomes do antigo Brand Hub → a chave na ficha única. Serve a dois
 * caminhos que ainda falam a língua velha: a rota `PUT /api/clients/[id]/brand-brain`
 * (que antes descartava 7 dos 13 campos) e as sugestões pendentes
 * (`BrandUpdate.field`). Nenhum dos dois perde campo agora.
 */
export const DO_BRAND_HUB: Record<string, ChaveDaFichaUnica> = {
  tagline: "tagline",
  businessSummary: "resumo",
  positioning: "proposta",
  targetAudience: "publico",
  toneOfVoice: "tom",
  visualStyle: "estiloDeFoto",
  colors: "paleta",
  fonts: "tipografia",
  references: "concorrentes",
  brandRules: "regras",
  productsToHighlight: "produtos",
  thingsToAvoid: "evitar",
  preferredChannels: "canais",
  strategicNotes: "notasInternas",
};

/** Corpo no formato do Brand Hub → ficha única. Só campos string presentes. */
export function fichaDoBrandHub(corpo: Record<string, unknown>): FichaUnica {
  const f: FichaUnica = {};
  for (const [velho, novo] of Object.entries(DO_BRAND_HUB)) {
    const v = corpo[velho];
    if (typeof v === "string") f[novo] = v;
  }
  return f;
}
