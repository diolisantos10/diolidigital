// ─── A BIBLIOTECA DE MENSAGENS — LEITOR TIPADO, FAIL CLOSED ─────────────────
//
// Fonte: docs/celula-prospeccao/despachos/A-biblioteca.md.
//
// O dado é `docs/plataformas/99freelas/mensagens.json` — no mesmo espírito de
// `lib/marketplaces/politica.ts` lendo `policy.json`: uma fonte só, versionada,
// nunca duplicada em constante espalhada pelo código.
//
// ── FAIL CLOSED, SEM DEFAULT ────────────────────────────────────────────────
// Todo campo obrigatório é conferido campo a campo (nada de `any`, nada de
// `as ModeloDeMensagem` num objeto não validado). Modelo inválido não entra na
// biblioteca — nunca "assume o default". Modelo válido mas não `aprovado`
// entra na biblioteca (dá para inspecionar), mas `modeloParaEnvio` recusa.
//
// ── PORTA INJETADA, NÃO IMPORT ESCONDIDO ────────────────────────────────────
// `carregarBiblioteca` e `modeloParaEnvio` aceitam o dado bruto como parâmetro
// opcional (default = o JSON real). Isso é o mesmo padrão de `ContextoDaRodada`
// em `lib/marketplaces/99freelas/agente.ts`: testes de validação de campo não
// precisam editar o arquivo de produção para provar uma regra — constroem um
// fixture mínimo e chamam a função direto.
//
// ── O QUE ESTE ARQUIVO NÃO FAZ ──────────────────────────────────────────────
// Não compara texto com envios anteriores e não detecta frase genérica — isso
// é a Ficha B, outro especialista, outro arquivo. Este módulo entrega o texto
// preenchido e conforme, ou o motivo do bloqueio. Ponto final.

import { validarTexto } from "@/lib/marketplaces/99freelas/conformidade";
import bibliotecaCrua from "@/docs/plataformas/99freelas/mensagens.json";
import {
  ESTADOS_DO_MODELO,
  PADRAO_DE_CODIGO,
  type EstadoDoModelo,
  type HistoricoDoModelo,
  type LeituraDoModelo,
  type ModeloDeMensagem,
} from "./tipos";

// ── Guardas de forma, campo a campo. Sem `any`. ──────────────────────────────

function textoNaoVazio(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function textoOuNulo(v: unknown): v is string | null {
  return v === null || typeof v === "string";
}

function numeroOuNulo(v: unknown): v is number | null {
  return v === null || (typeof v === "number" && Number.isFinite(v));
}

function arrayDeTextos(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((item) => typeof item === "string");
}

function estadoValido(v: unknown): v is EstadoDoModelo {
  return typeof v === "string" && (ESTADOS_DO_MODELO as readonly string[]).includes(v);
}

function entradaDeHistoricoValida(item: unknown): item is HistoricoDoModelo {
  if (typeof item !== "object" || item === null) return false;
  const h = item as Record<string, unknown>;
  return (
    textoNaoVazio(h.versao) &&
    textoNaoVazio(h.em) &&
    textoNaoVazio(h.autor) &&
    textoOuNulo(h.aprovador) &&
    textoNaoVazio(h.oQueMudou)
  );
}

function historicoValido(v: unknown): v is HistoricoDoModelo[] {
  return Array.isArray(v) && v.every(entradaDeHistoricoValida);
}

/**
 * Lê UM modelo bruto (vindo do JSON) e devolve `LeituraDoModelo`.
 *
 * Cada regra é checada isoladamente, na ordem do contrato (`tipos.ts`), e cada
 * falha devolve o motivo em português — nunca `false` mudo. Exportada porque é
 * a unidade que os testes de "campo obrigatório faltando" exercitam direto,
 * sem precisar editar `mensagens.json`.
 */
export function lerModelo(bruto: unknown): LeituraDoModelo {
  if (typeof bruto !== "object" || bruto === null) {
    return { ok: false, motivo: "o modelo não é um objeto.", codigo: "(desconhecido)" };
  }
  const m = bruto as Record<string, unknown>;

  const codigoBruto = m.codigo;
  if (typeof codigoBruto !== "string" || !PADRAO_DE_CODIGO.test(codigoBruto)) {
    const codigoParaErro = typeof codigoBruto === "string" && codigoBruto ? codigoBruto : "(desconhecido)";
    return {
      ok: false,
      motivo: `campo "codigo" ausente ou fora do padrão M\\d{2} (recebido: ${JSON.stringify(codigoBruto)}).`,
      codigo: codigoParaErro,
    };
  }
  const codigo = codigoBruto;

  const nomeBruto = m.nome;
  if (!textoNaoVazio(nomeBruto)) {
    return { ok: false, motivo: 'campo "nome" ausente, vazio ou não é texto.', codigo };
  }
  const nome = nomeBruto;

  const plataformaBruta = m.plataforma;
  if (!textoNaoVazio(plataformaBruta)) {
    return { ok: false, motivo: 'campo "plataforma" ausente, vazio ou não é texto.', codigo };
  }
  const plataforma = plataformaBruta;

  const etapaDoFunilBruta = m.etapaDoFunil;
  if (!textoNaoVazio(etapaDoFunilBruta)) {
    return { ok: false, motivo: 'campo "etapaDoFunil" ausente, vazio ou não é texto.', codigo };
  }
  const etapaDoFunil = etapaDoFunilBruta;

  const finalidadeBruta = m.finalidade;
  if (!textoNaoVazio(finalidadeBruta)) {
    return { ok: false, motivo: 'campo "finalidade" ausente, vazio ou não é texto.', codigo };
  }
  const finalidade = finalidadeBruta;

  const textoBaseBruto = m.textoBase;
  if (typeof textoBaseBruto !== "string") {
    return { ok: false, motivo: 'campo "textoBase" ausente ou não é texto.', codigo };
  }
  const textoBase = textoBaseBruto;

  const pendenciaBruta = m.pendencia;
  if (pendenciaBruta !== undefined && !textoOuNulo(pendenciaBruta)) {
    return { ok: false, motivo: 'campo "pendencia" precisa ser texto, nulo ou ausente.', codigo };
  }
  const pendencia = typeof pendenciaBruta === "string" ? pendenciaBruta : null;

  // `textoBase` vazio só é aceito quando há `pendencia` explicando o porquê —
  // é exatamente o caso dos slots M01–M22 sem texto oficial do CEO. Vazio sem
  // justificativa é campo obrigatório faltando, disfarçado.
  if (textoBase.trim() === "" && !textoNaoVazio(pendencia)) {
    return {
      ok: false,
      motivo: 'campo "textoBase" está vazio e não há "pendencia" explicando por quê — texto vazio sem justificativa é campo obrigatório faltando.',
      codigo,
    };
  }

  const variaveisObrigatoriasBruta = m.variaveisObrigatorias;
  if (!arrayDeTextos(variaveisObrigatoriasBruta)) {
    return { ok: false, motivo: 'campo "variaveisObrigatorias" precisa ser uma lista de texto.', codigo };
  }
  const variaveisObrigatorias = variaveisObrigatoriasBruta;

  const variaveisOpcionaisBruta = m.variaveisOpcionais;
  if (!arrayDeTextos(variaveisOpcionaisBruta)) {
    return { ok: false, motivo: 'campo "variaveisOpcionais" precisa ser uma lista de texto.', codigo };
  }
  const variaveisOpcionais = variaveisOpcionaisBruta;

  const palavrasProibidasBruta = m.palavrasProibidas;
  if (!arrayDeTextos(palavrasProibidasBruta)) {
    return { ok: false, motivo: 'campo "palavrasProibidas" precisa ser uma lista de texto.', codigo };
  }
  const palavrasProibidas = palavrasProibidasBruta;

  const condicaoDeEntradaBruta = m.condicaoDeEntrada;
  if (!textoNaoVazio(condicaoDeEntradaBruta)) {
    return { ok: false, motivo: 'campo "condicaoDeEntrada" ausente, vazio ou não é texto.', codigo };
  }
  const condicaoDeEntrada = condicaoDeEntradaBruta;

  const condicaoDeSaidaBruta = m.condicaoDeSaida;
  if (!textoNaoVazio(condicaoDeSaidaBruta)) {
    return { ok: false, motivo: 'campo "condicaoDeSaida" ausente, vazio ou não é texto.', codigo };
  }
  const condicaoDeSaida = condicaoDeSaidaBruta;

  const proximaAcaoBruta = m.proximaAcao;
  if (!textoNaoVazio(proximaAcaoBruta)) {
    return { ok: false, motivo: 'campo "proximaAcao" ausente, vazio ou não é texto.', codigo };
  }
  const proximaAcao = proximaAcaoBruta;

  const tempoDeEsperaHorasBruto = m.tempoDeEsperaHoras;
  if (!numeroOuNulo(tempoDeEsperaHorasBruto)) {
    return { ok: false, motivo: 'campo "tempoDeEsperaHoras" precisa ser número ou nulo.', codigo };
  }
  const tempoDeEsperaHoras = tempoDeEsperaHorasBruto;

  const maximoDeUsosBruto = m.maximoDeUsos;
  if (!numeroOuNulo(maximoDeUsosBruto)) {
    return { ok: false, motivo: 'campo "maximoDeUsos" precisa ser número ou nulo.', codigo };
  }
  const maximoDeUsos = maximoDeUsosBruto;

  const versaoBruta = m.versao;
  if (!textoNaoVazio(versaoBruta)) {
    return { ok: false, motivo: 'campo "versao" ausente, vazio ou não é texto.', codigo };
  }
  const versao = versaoBruta;

  const autorBruto = m.autor;
  if (!textoNaoVazio(autorBruto)) {
    return { ok: false, motivo: 'campo "autor" ausente, vazio ou não é texto.', codigo };
  }
  const autor = autorBruto;

  const aprovadorBruto = m.aprovador;
  if (!textoOuNulo(aprovadorBruto)) {
    return { ok: false, motivo: 'campo "aprovador" precisa ser texto ou nulo.', codigo };
  }
  const aprovador = aprovadorBruto;

  const estadoBruto = m.estado;
  if (!estadoValido(estadoBruto)) {
    return {
      ok: false,
      motivo: `campo "estado" fora da lista permitida (${ESTADOS_DO_MODELO.join(", ")}) — recebido: ${JSON.stringify(estadoBruto)}.`,
      codigo,
    };
  }
  const estado = estadoBruto;

  const historicoBruto = m.historico;
  if (!historicoValido(historicoBruto)) {
    return {
      ok: false,
      motivo: 'campo "historico" precisa ser uma lista de entradas completas (versao, em, autor, aprovador, oQueMudou).',
      codigo,
    };
  }
  const historico = historicoBruto;

  const modelo: ModeloDeMensagem = {
    codigo,
    nome,
    plataforma,
    etapaDoFunil,
    finalidade,
    textoBase,
    variaveisObrigatorias,
    variaveisOpcionais,
    palavrasProibidas,
    condicaoDeEntrada,
    condicaoDeSaida,
    proximaAcao,
    tempoDeEsperaHoras,
    maximoDeUsos,
    versao,
    autor,
    aprovador,
    estado,
    historico,
    pendencia,
  };
  return { ok: true, modelo };
}

// ── A biblioteca inteira ─────────────────────────────────────────────────────

export interface ItemInvalido {
  /** Índice no array `modelos` do JSON. `-1` quando a raiz do arquivo falhou. */
  indice: number;
  codigo: string;
  motivo: string;
}

export interface BibliotecaCarregada {
  /** Só os modelos VÁLIDOS, indexados por código. */
  modelos: Record<string, ModeloDeMensagem>;
  /** Todo modelo que não entrou, e por quê. Nunca fica em silêncio. */
  invalidos: ItemInvalido[];
}

function raizValida(bruto: unknown): { modelos: unknown[] } | null {
  if (typeof bruto !== "object" || bruto === null) return null;
  const r = bruto as Record<string, unknown>;
  if (!Array.isArray(r.modelos)) return null;
  return { modelos: r.modelos };
}

/**
 * Carrega e valida a biblioteca inteira.
 *
 * `bruto` é injetável (default = o JSON real da casa) — é assim que os testes
 * de campo obrigatório e de duplicidade rodam sem tocar em
 * `docs/plataformas/99freelas/mensagens.json`.
 */
export function carregarBiblioteca(bruto: unknown = bibliotecaCrua): BibliotecaCarregada {
  const raiz = raizValida(bruto);
  if (!raiz) {
    return {
      modelos: {},
      invalidos: [{ indice: -1, codigo: "(desconhecido)", motivo: 'a raiz do arquivo precisa ter um campo "modelos" com uma lista.' }],
    };
  }

  const invalidos: ItemInvalido[] = [];
  const candidatos: Array<{ indice: number; modelo: ModeloDeMensagem }> = [];

  raiz.modelos.forEach((item, indice) => {
    const leitura = lerModelo(item);
    if (!leitura.ok) {
      invalidos.push({ indice, codigo: leitura.codigo, motivo: leitura.motivo });
      return;
    }
    candidatos.push({ indice, modelo: leitura.modelo });
  });

  // Duplicidade de código: nenhum dos dois entra. Um código repetido é a
  // biblioteca dizendo duas coisas diferentes com o mesmo nome — inválido para
  // os dois, não só para o segundo que apareceu.
  const contagem = new Map<string, number>();
  for (const c of candidatos) contagem.set(c.modelo.codigo, (contagem.get(c.modelo.codigo) ?? 0) + 1);

  const modelos: Record<string, ModeloDeMensagem> = {};
  for (const c of candidatos) {
    const vezes = contagem.get(c.modelo.codigo) ?? 0;
    if (vezes > 1) {
      invalidos.push({
        indice: c.indice,
        codigo: c.modelo.codigo,
        motivo: `código "${c.modelo.codigo}" duplicado — ${vezes} modelos usam o mesmo código. A biblioteca não pode ter dois modelos com o mesmo código.`,
      });
      continue;
    }
    modelos[c.modelo.codigo] = c.modelo;
  }

  return { modelos, invalidos };
}

/**
 * Só devolve `{ok:true}` se o modelo existe, é VÁLIDO e está `estado:
 * "aprovado"`. Rascunho, pausado e aposentado devolvem `{ok:false, motivo}`
 * dizendo o estado por extenso — nunca `false` mudo.
 */
export function modeloParaEnvio(codigo: string, bruto: unknown = bibliotecaCrua): LeituraDoModelo {
  const chave = (codigo ?? "").trim();
  if (!PADRAO_DE_CODIGO.test(chave)) {
    return { ok: false, motivo: `código "${codigo}" fora do padrão M\\d{2}.`, codigo: chave || "(desconhecido)" };
  }

  const biblioteca = carregarBiblioteca(bruto);
  const modelo = biblioteca.modelos[chave];
  if (!modelo) {
    const invalido = biblioteca.invalidos.find((i) => i.codigo === chave);
    if (invalido) {
      return { ok: false, motivo: `modelo "${chave}" é inválido e não entrou na biblioteca: ${invalido.motivo}`, codigo: chave };
    }
    return { ok: false, motivo: `modelo "${chave}" não existe na biblioteca.`, codigo: chave };
  }

  if (modelo.estado !== "aprovado") {
    return {
      ok: false,
      motivo: `modelo "${chave}" está em estado "${modelo.estado}", não "aprovado" — não pode ser enviado.`,
      codigo: chave,
    };
  }

  return { ok: true, modelo };
}

// ── Preencher o texto ─────────────────────────────────────────────────────────

export type ResultadoDoPreenchimento = { ok: true; texto: string } | { ok: false; motivo: string };

/** Casa `{{chave}}`, com espaço opcional dentro das chaves: `{{ chave }}`. */
const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/**
 * Substitui `{{chave}}` pelo valor. NÃO inventa valor para variável obrigatória
 * ausente/nula/vazia — bloqueia com o nome da variável no motivo. Placeholder
 * remanescente no texto final bloqueia. O texto final é julgado pelo Guardião
 * (`validarTexto`) — nenhum outro validador de conteúdo é escrito aqui.
 */
export function preencher(modelo: ModeloDeMensagem, variaveis: Record<string, string | null | undefined>): ResultadoDoPreenchimento {
  for (const chave of modelo.variaveisObrigatorias) {
    const valor = variaveis[chave];
    if (valor === null || valor === undefined || valor.trim() === "") {
      return { ok: false, motivo: `variável obrigatória "${chave}" está ausente, nula ou vazia.` };
    }
  }

  // Substituição de UMA passada sobre o texto ORIGINAL (`String.replace` com
  // regex global não reprocessa o texto já substituído). Isso importa: texto
  // de cliente é entrada hostil (lei 5 do domínio) — se o valor de uma
  // variável contivesse literalmente "{{outraVariavel}}", uma substituição
  // iterativa poderia reprocessar esse texto injetado como se fosse molde. Com
  // uma passada só, o que sobrar de "{{" é pego pela checagem abaixo, nunca
  // executado como placeholder de verdade.
  const conhecidas = new Set<string>([...modelo.variaveisObrigatorias, ...modelo.variaveisOpcionais]);
  const texto = modelo.textoBase.replace(PLACEHOLDER, (casamentoCompleto, chave: string) => {
    if (!conhecidas.has(chave)) return casamentoCompleto; // não declarado — fica, e é barrado abaixo.
    const valor = variaveis[chave];
    if (valor === null || valor === undefined) return casamentoCompleto; // opcional ausente — fica, e é barrado abaixo se sobrar.
    return valor;
  });

  if (texto.includes("{{")) {
    const trecho = texto.slice(texto.indexOf("{{"));
    return { ok: false, motivo: `placeholder não preenchido restou no texto final: "${trecho}".` };
  }

  for (const proibida of modelo.palavrasProibidas) {
    if (proibida && texto.toLowerCase().includes(proibida.toLowerCase())) {
      return { ok: false, motivo: `palavra proibida do próprio modelo encontrada no texto final: "${proibida}".` };
    }
  }

  const conformidade = validarTexto(texto);
  if (!conformidade.ok) {
    const achados = conformidade.achados
      .map((a) => `${a.regra} ("${a.trecho}", fonte: ${a.fonte})`)
      .join("; ");
    return { ok: false, motivo: `texto final viola o Guardião de conteúdo: ${achados}` };
  }

  return { ok: true, texto };
}
