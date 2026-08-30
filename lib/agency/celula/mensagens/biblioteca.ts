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
import { estadoDeclarado as etapaDoFunilDeclarada } from "../funil";
import {
  ALVO_PENDENTE,
  ALVOS_DE_LIGACAO,
  ESTADOS_DO_MODELO,
  PADRAO_DE_CODIGO,
  type AlvoDeLigacao,
  type EstadoDoModelo,
  type HistoricoDoModelo,
  type LeituraDoModelo,
  type ModeloDeMensagem,
  type RegraDeAusencia,
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

// ── Regra de ausência: forma, só forma. A validade de CONTEÚDO (variável
// obrigatória em contradição, recorte que não existe no textoBase) é checada
// em `preencher`, não aqui — é o mesmo padrão do "segundo cinto" que já existe
// para `estado`/`pendencia`: quem monta um `ModeloDeMensagem` na mão (como os
// testes fazem) também passa por essa guarda. Ver Ficha B, §3.
function regraDeAusenciaValida(item: unknown): item is RegraDeAusencia {
  if (typeof item !== "object" || item === null) return false;
  const r = item as Record<string, unknown>;
  return textoNaoVazio(r.variavel) && textoNaoVazio(r.de) && textoNaoVazio(r.para) && textoNaoVazio(r.fonte);
}

function regrasDeAusenciaValidas(v: unknown): v is RegraDeAusencia[] {
  return Array.isArray(v) && v.every(regraDeAusenciaValida);
}

// ── LIGAÇÃO DE VARIÁVEIS — Ficha B, Onda 4A ─────────────────────────────────
// Leitura fail-closed de conjunto fechado, na forma exata de
// `estadoDeclarado()` em `lib/agency/celula/funil.ts`: valor que não seja
// EXATAMENTE um dos alvos declarados vira `null` — nunca `as AlvoDeLigacao`.
const CONJUNTO_DE_ALVOS_DE_LIGACAO: ReadonlySet<string> = new Set(ALVOS_DE_LIGACAO);

export function alvoDeLigacaoDeclarado(valor: unknown): AlvoDeLigacao | null {
  return typeof valor === "string" && CONJUNTO_DE_ALVOS_DE_LIGACAO.has(valor) ? (valor as AlvoDeLigacao) : null;
}

// Casa `{{chave}}` OU `[MIOLO]` — mesma regex combinada de `preencher()` (ver
// `PLACEHOLDER_COMBINADO` abaixo), mas aqui só para COLETAR nomes, nunca para
// substituir. Reaproveita a mesma leitura do miolo: sem normalizar caixa,
// acento ou espaço.
const PADRAO_DE_NOME_DE_VARIAVEL = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}|\[([^[\]]+)\]/g;

function nomesDeVariaveisNoTexto(textoBase: string): string[] {
  const nomes = new Set<string>();
  const re = new RegExp(PADRAO_DE_NOME_DE_VARIAVEL);
  let casamento: RegExpExecArray | null;
  while ((casamento = re.exec(textoBase)) !== null) {
    const nome = (casamento[1] ?? casamento[2] ?? "").trim();
    if (nome) nomes.add(nome);
  }
  return Array.from(nomes);
}

type ResultadoDaLigacao =
  | { ok: true; ligacao: Record<string, AlvoDeLigacao> }
  | { ok: false; motivo: string };

/**
 * Valida `ligacaoDeVariaveis` de UM modelo. `bruto === undefined` é
 * legítimo — modelo que não usa o recurso — e devolve `{}` (mesmo espírito
 * de `regrasDeAusencia` ausente). Presente, é validado por inteiro:
 *
 *  1. Cobertura: toda variável em `variaveisObrigatorias` ∪
 *     `variaveisOpcionais` ∪ os colchetes/chaves do `textoBase` tem ligação
 *     declarada. Falta uma → recusa, nomeando qual.
 *  2. Alvo válido: todo alvo é membro do conjunto fechado
 *     (`alvoDeLigacaoDeclarado`). Fora → recusa, nomeando a variável e o
 *     valor recebido — nunca vira default.
 *
 * (O bloqueio de ENVIO quando um alvo é `ALVO_PENDENTE` é checagem à parte,
 * em `modeloParaEnvio`/`preencher` — `ALVO_PENDENTE` É membro válido aqui.)
 */
function ligacaoDeVariaveisValida(
  bruto: unknown,
  variaveisObrigatorias: string[],
  variaveisOpcionais: string[],
  textoBase: string,
): ResultadoDaLigacao {
  if (bruto === undefined) return { ok: true, ligacao: {} };

  if (typeof bruto !== "object" || bruto === null || Array.isArray(bruto)) {
    return { ok: false, motivo: 'precisa ser um objeto no formato "variável" → alvo.' };
  }
  const mapa = bruto as Record<string, unknown>;

  const esperadas = new Set<string>([...variaveisObrigatorias, ...variaveisOpcionais, ...nomesDeVariaveisNoTexto(textoBase)]);
  for (const variavel of esperadas) {
    if (!(variavel in mapa)) {
      return {
        ok: false,
        motivo: `a variável "${variavel}" (citada em variaveisObrigatorias, variaveisOpcionais ou no textoBase) não tem ligação declarada.`,
      };
    }
  }

  const ligacao: Record<string, AlvoDeLigacao> = {};
  for (const [chave, valorBruto] of Object.entries(mapa)) {
    const alvo = alvoDeLigacaoDeclarado(valorBruto);
    if (alvo === null) {
      return {
        ok: false,
        motivo: `a variável "${chave}" tem alvo ${JSON.stringify(valorBruto)}, fora do conjunto fechado de alvos — não vira default.`,
      };
    }
    ligacao[chave] = alvo;
  }

  return { ok: true, ligacao };
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

  // Campo novo (Ficha B, §3). Opcional: ausente é legítimo e vira `[]` — não é
  // "campo obrigatório faltando" disfarçado, é modelo que não usa o recurso.
  // Presente mas malformado bloqueia o modelo inteiro, igual a qualquer outro
  // campo aqui — fail closed, não "ignora e segue".
  const regrasDeAusenciaBruta = m.regrasDeAusencia;
  let regrasDeAusencia: RegraDeAusencia[] = [];
  if (regrasDeAusenciaBruta !== undefined) {
    if (!regrasDeAusenciaValidas(regrasDeAusenciaBruta)) {
      return {
        ok: false,
        motivo: 'campo "regrasDeAusencia" precisa ser uma lista de regras completas (variavel, de, para, fonte — todos texto não vazio).',
        codigo,
      };
    }
    regrasDeAusencia = regrasDeAusenciaBruta;
  }

  // Campo novo (Ficha B, Onda 4A). Mesma régua de `regrasDeAusencia`: ausente
  // é legítimo ({} — modelo que não usa o recurso); presente é validado por
  // inteiro (cobertura + alvo do conjunto fechado) — fail closed, não
  // "ignora e segue".
  const ligacaoDeVariaveisBruta = m.ligacaoDeVariaveis;
  const ligacaoResultado = ligacaoDeVariaveisValida(ligacaoDeVariaveisBruta, variaveisObrigatorias, variaveisOpcionais, textoBase);
  if (!ligacaoResultado.ok) {
    return { ok: false, motivo: `campo "ligacaoDeVariaveis" inválido: ${ligacaoResultado.motivo}`, codigo };
  }
  const ligacaoDeVariaveis = ligacaoResultado.ligacao;

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
    regrasDeAusencia,
    ligacaoDeVariaveis,
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

// ── Palavras proibidas GLOBAIS, na raiz do arquivo (Ficha B, §4) ────────────
// Uma fonte só (a raiz), fundida com o `palavrasProibidas` de cada modelo ao
// carregar — zero duplicação copiada nos 22 modelos. Campo é NOVO e opcional:
// raiz sem ele não é malformação (`{ lista: [], malformada: false }`). Raiz
// COM o campo mas fora do formato de lista de texto é visível, não engolida
// em silêncio: vira item em `invalidos` com `indice: -1`, e a biblioteca segue
// com lista vazia — os 22 modelos continuam carregando normalmente.
function palavrasProibidasGlobaisDaRaiz(bruto: unknown): { lista: string[]; malformada: boolean } {
  if (typeof bruto !== "object" || bruto === null) return { lista: [], malformada: false };
  const r = bruto as Record<string, unknown>;
  if (r.palavrasProibidasGlobais === undefined) return { lista: [], malformada: false };
  if (!arrayDeTextos(r.palavrasProibidasGlobais)) return { lista: [], malformada: true };
  return { lista: r.palavrasProibidasGlobais, malformada: false };
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

  const globais = palavrasProibidasGlobaisDaRaiz(bruto);
  if (globais.malformada) {
    invalidos.push({
      indice: -1,
      codigo: "(desconhecido)",
      motivo: 'campo "palavrasProibidasGlobais" da raiz precisa ser uma lista de texto — ignorado; a biblioteca segue com lista vazia.',
    });
  }

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
    // Funde palavrasProibidas do modelo com as globais da raiz, sem duplicar.
    // `modeloParaEnvio`/`preencher` continuam recebendo só `palavrasProibidas`
    // — assinatura de `preencher` não muda; a fusão acontece uma vez, aqui.
    const palavrasProibidasFundidas = Array.from(new Set([...c.modelo.palavrasProibidas, ...globais.lista]));
    modelos[c.modelo.codigo] = { ...c.modelo, palavrasProibidas: palavrasProibidasFundidas };
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

  // ── etapaDoFunil precisa ser um dos 22 estados do funil (Ficha B, Onda 4A) ──
  // Vale mesmo para o placeholder "preciso confirmar com o CEO": não é um dos
  // 22, então bloqueia igual a qualquer outro valor fora do conjunto — sem
  // isso ser um caso especial no código.
  if (etapaDoFunilDeclarada(modelo.etapaDoFunil) === null) {
    return {
      ok: false,
      motivo: `modelo "${chave}" tem etapaDoFunil "${modelo.etapaDoFunil}", que não é um dos 22 estados do funil (lib/agency/celula/funil.ts) — não pode ser enviado até a etapa ser corrigida ou confirmada.`,
      codigo: chave,
    };
  }

  // ── Nenhuma variável pode ter ligação PENDENTE (Ficha B, Onda 4A) ──────────
  const ligacaoPendente = Object.entries(modelo.ligacaoDeVariaveis ?? {}).find(([, alvo]) => alvo === ALVO_PENDENTE);
  if (ligacaoPendente) {
    return {
      ok: false,
      motivo: `modelo "${chave}" tem a variável "${ligacaoPendente[0]}" com ligação "${ALVO_PENDENTE}" — não pode ser enviado até o Diretor/CEO confirmar em que campo ela liga.`,
      codigo: chave,
    };
  }

  return { ok: true, modelo };
}

// ── Preencher o texto ─────────────────────────────────────────────────────────

export type ResultadoDoPreenchimento = { ok: true; texto: string } | { ok: false; motivo: string };

// ── Uma definição só do que "ausente" significa (Ficha H) ───────────────────
// `null`, `undefined` ou string vazia/só-espaços — usada em TODO ponto de
// `preencher` que decide isso: a checagem de variável obrigatória, a de
// regra de ausência e o substituidor. Antes deste conserto havia duas
// definições que discordavam entre si: o substituidor tratava `""` como
// "presente" (devolvia `""`, o placeholder sumia do texto) enquanto a regra
// de ausência já tratava `""` como ausente — é dessa discordância que nascia
// o buraco `"Olá, . Li seu projeto..."`. Uma função só, usada nos três
// lugares, fecha a divergência.
function ausente(v: string | null | undefined): boolean {
  return v === null || v === undefined || v.trim() === "";
}

// ── O MOTOR DO COLCHETE (Ficha B) ────────────────────────────────────────────
// O texto oficial do CEO para os 22 modelos usa colchetes, não chaves duplas —
// ordem literal dele: "Os colchetes são as variáveis". Sem isto, um "[NOME]"
// do textoBase chegaria ao cliente como literal, pelo caminho limpo, sem
// nenhum bloqueio. O nome da variável é o MIOLO exatamente como está no texto
// — maiúsculas, acentos, espaços e vírgulas não são normalizados; a
// comparação com `variaveisObrigatorias`/`variaveisOpcionais` usa `trim()`
// dos dois lados, nunca lowercase nem remoção de acento.
// Fonte: docs/celula-prospeccao/despachos/ONDA-2B-B-o-motor-do-colchete.md.
//
// Casa `{{chave}}` (com espaço opcional: `{{ chave }}`) OU `[MIOLO]`, numa
// ÚNICA regex combinada, para que a substituição rode numa ÚNICA passada
// sobre o texto ORIGINAL. Isso importa: se processássemos colchete e chave
// dupla em duas passadas separadas, o valor de uma variável poderia conter
// literalmente "[OUTRA]" e ser reprocessado como molde na segunda passada —
// substituição de segunda ordem. Com uma passada combinada só, o que sobrar é
// sempre pego pelas checagens de "remanescente" abaixo, nunca executado.
const PLACEHOLDER_COMBINADO = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}|\[([^[\]]+)\]/g;

/**
 * Substitui `{{chave}}` e `[CHAVE]` pelo valor. NÃO inventa valor para
 * variável obrigatória ausente/nula/vazia — bloqueia com o nome da variável
 * no motivo. Placeholder remanescente (de qualquer um dos dois formatos) no
 * texto final bloqueia — **esta é a trava principal do motor do colchete**: é
 * o que impede um "[NOME]" literal de chegar ao cliente quando algo falhou
 * antes. O texto final é julgado pelo Guardião (`validarTexto`) — nenhum
 * outro validador de conteúdo é escrito aqui.
 *
 * SEGUNDO CINTO (Ficha J): confere `estado` e `pendencia` por conta própria,
 * mesmo que `modeloParaEnvio` já tenha aprovado antes de chegar aqui. Hoje o
 * único chamador é `proxima-mensagem.ts`, que passa por `modeloParaEnvio`
 * primeiro — mas essa é só a ordem de chamadas de HOJE, e barreira que depende
 * de o próximo programador lembrar a ordem não é barreira. Isto NÃO substitui
 * a conferência de `modeloParaEnvio` (que também barra modelo inexistente ou
 * inválido) — são dois cintos, não um cinto mudado de lugar.
 */
export function preencher(modelo: ModeloDeMensagem, variaveis: Record<string, string | null | undefined>): ResultadoDoPreenchimento {
  if (modelo.estado !== "aprovado") {
    return {
      ok: false,
      motivo: `modelo "${modelo.codigo}" está em estado "${modelo.estado}", não "aprovado" — não pode ser enviado.`,
    };
  }

  if (modelo.pendencia !== undefined && modelo.pendencia !== null && modelo.pendencia.trim() !== "") {
    return {
      ok: false,
      motivo: `modelo "${modelo.codigo}" tem pendência declarada e não pode ser preenchido: ${modelo.pendencia}`,
    };
  }

  // ── SEGUNDO CINTO (Ficha B, Onda 4A): etapaDoFunil e ligação pendente ──────
  // `modeloParaEnvio` já confere isto, mas este módulo é chamado por conta
  // própria em testes e por `proxima-mensagem.ts` — o mesmo espírito do
  // segundo cinto que já existe para `estado`/`pendencia` acima.
  if (etapaDoFunilDeclarada(modelo.etapaDoFunil) === null) {
    return {
      ok: false,
      motivo: `modelo "${modelo.codigo}" tem etapaDoFunil "${modelo.etapaDoFunil}", que não é um dos 22 estados do funil (lib/agency/celula/funil.ts) — não pode ser enviado até a etapa ser corrigida ou confirmada.`,
    };
  }

  const ligacaoPendenteEmPreencher = Object.entries(modelo.ligacaoDeVariaveis ?? {}).find(([, alvo]) => alvo === ALVO_PENDENTE);
  if (ligacaoPendenteEmPreencher) {
    return {
      ok: false,
      motivo: `modelo "${modelo.codigo}" tem a variável "${ligacaoPendenteEmPreencher[0]}" com ligação "${ALVO_PENDENTE}" — não pode ser enviado até o Diretor/CEO confirmar em que campo ela liga.`,
    };
  }

  // ── Regras de ausência (Ficha B, §3) — "sem nome, usar só Olá" ────────────
  // Duas guardas são checadas para TODA regra declarada, sempre — não só
  // quando a variável está ausente nesta chamada. São contradições/erros de
  // FORMA do próprio modelo, e uma regra inválida bloqueia o preenchimento
  // inteiro, com motivo, em vez de ser ignorada em silêncio.
  const regrasDeAusencia = modelo.regrasDeAusencia ?? [];
  for (const regra of regrasDeAusencia) {
    if (modelo.variaveisObrigatorias.includes(regra.variavel)) {
      return {
        ok: false,
        motivo: `regra de ausência para "${regra.variavel}" é inválida: a variável está em variaveisObrigatorias — ou é obrigatória, ou pode faltar, nunca as duas.`,
      };
    }
    if (!modelo.textoBase.includes(regra.de)) {
      return {
        ok: false,
        motivo: `regra de ausência inválida: o recorte "${regra.de}" não existe no textoBase do modelo "${modelo.codigo}".`,
      };
    }
  }

  for (const chave of modelo.variaveisObrigatorias) {
    const valor = variaveis[chave];
    if (ausente(valor)) {
      return { ok: false, motivo: `variável obrigatória "${chave}" está ausente, nula ou vazia.` };
    }
  }

  // Aplica as regras de ausência ANTES da substituição de variáveis, sobre o
  // textoBase original. Só troca `de` por `para` quando a variável está de
  // fato ausente/nula/vazia em `variaveis` — presente, a regra não entra e o
  // valor real segue seu caminho normal (checado no item de teste "9").
  let textoComAusencia = modelo.textoBase;
  for (const regra of regrasDeAusencia) {
    const valor = variaveis[regra.variavel];
    if (ausente(valor)) {
      textoComAusencia = textoComAusencia.split(regra.de).join(regra.para);
    }
  }

  // Substituição de UMA passada sobre o texto (já com as regras de ausência
  // aplicadas), casando `{{chave}}` e `[CHAVE]` juntos (`String.replace` com
  // regex global não reprocessa o texto já substituído). Isso importa: texto
  // de cliente é entrada hostil (lei 5 do domínio) — se o valor de uma
  // variável contivesse literalmente "{{outraVariavel}}" ou "[OUTRA]", uma
  // substituição iterativa (ou em duas passadas separadas) poderia
  // reprocessar esse texto injetado como se fosse molde. Com uma passada
  // combinada só, o que sobrar de "{{" ou "[" é pego pelas checagens abaixo,
  // nunca executado como placeholder de verdade.
  const conhecidas = new Set<string>([...modelo.variaveisObrigatorias, ...modelo.variaveisOpcionais]);
  const conhecidasColchete = new Set<string>([...conhecidas].map((c) => c.trim()));
  const texto = textoComAusencia.replace(
    PLACEHOLDER_COMBINADO,
    (casamentoCompleto: string, chaveChaveDupla: string | undefined, chaveColchete: string | undefined) => {
      if (chaveChaveDupla !== undefined) {
        if (!conhecidas.has(chaveChaveDupla)) return casamentoCompleto; // não declarado — fica, barrado abaixo.
        const valor = variaveis[chaveChaveDupla];
        // opcional ausente (null/undefined/"") — fica intacto, barrado abaixo
        // se sobrar. Nunca devolve "": foi exatamente "" tratado como
        // "presente" aqui que fazia o placeholder sumir do texto sem
        // acionar nenhuma trava (o furo desta ficha).
        if (ausente(valor)) return casamentoCompleto;
        return valor as string;
      }
      const chave = (chaveColchete ?? "").trim();
      if (!conhecidasColchete.has(chave)) return casamentoCompleto; // não declarado — fica, barrado abaixo.
      const valor = variaveis[chave];
      if (ausente(valor)) return casamentoCompleto; // opcional ausente — fica, barrado abaixo se sobrar.
      return valor as string;
    },
  );

  if (texto.includes("{{")) {
    const trecho = texto.slice(texto.indexOf("{{"));
    return { ok: false, motivo: `placeholder não preenchido restou no texto final: "${trecho}".` };
  }

  // TRAVA PRINCIPAL do motor do colchete: colchete remanescente no texto
  // final bloqueia, do mesmo jeito que "{{" remanescente já bloqueia acima —
  // sem isto, um "[NOME]" literal chegaria ao cliente pelo caminho limpo.
  const colcheteRemanescente = texto.match(/\[[^[\]]*\]/);
  if (colcheteRemanescente) {
    return { ok: false, motivo: `colchete não preenchido restou no texto final: "${colcheteRemanescente[0]}".` };
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
