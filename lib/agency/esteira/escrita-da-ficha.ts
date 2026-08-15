// A ESCRITA DA FICHA DE MARCA — um envelope só, para as duas portas.
//
// ── Por que este arquivo nasceu ─────────────────────────────────────────────
//
// A ficha tem duas portas de escrita, de propósito: o painel
// (`/api/agency/clients/[id]/marca`) para quem atende registrar o que o cliente
// DISSE, e o portal (`/api/portal/marca`) para o cliente DIZER. Duas portas,
// um destino — isso está certo.
//
// O que estava errado é que cada porta carregava a SUA CÓPIA da função
// `envelopar`, byte a byte igual, e as duas gravavam a mesma linha fatal:
//
//     if (coluna === "referencesJson") return JSON.stringify({ aprovadas: [t], reprovadas: [] });
//     if (coluna === "voicePairsJson") return JSON.stringify([{ dizemos: t, naoDizemos: "" }]);
//
// A metade que permite REPROVAR nascia vazia por literal, nas duas portas. E
// como `referenciasCompletas` exige as duas, `naoConstituida` era `true` para
// sempre e `publicacao.ts:699` recusava todo post — de todo cliente, desde
// sempre. Não era a Meta, não era token, não era conexão: era esta linha.
//
// Três cópias da mesma lista foi o que produziu o carrossel que virava feed;
// duas cópias do mesmo envelope foi o que produziu a porta que nunca abria. A
// regra é a mesma: **uma fonte só**.
//
// ── O QUE ESTE ARQUIVO NÃO GRAVA ───────────────────────────────────────────
//
// Coluna nenhuma de `BrandBrain` guarda proibição. Ela tem dono próprio
// (`esteira/proibicoes.ts`) e continua tendo: quando o campo `proibicoes` chega
// aqui, ele é encaminhado para lá, nunca copiado para uma coluna. Escrever a
// mesma regra por dois caminhos é como nasce a divergência.

import { prisma } from "@/lib/db/client";
import {
  METADES, referenciasDeclaradas, paresDeVoz,
  type CampoDaMarca, type ParDeVoz,
} from "@/lib/agency/esteira/ficha-de-marca";
import {
  registrarProibicoesDeclaradas, DEPARTAMENTO_DAS_PROIBICOES,
  type OrigemDaProibicao,
} from "@/lib/agency/esteira/proibicoes";

/** Onde cada campo da ficha mora no banco. **A única cópia deste mapa.**
 *  Proibições não estão aqui e não podem estar — têm dono próprio. */
export const COLUNA: Partial<Record<CampoDaMarca, string>> = {
  proposito_e_promessa: "purposeAndPromise",
  publico_e_relacao: "audienceRelation",
  voz: "voicePairsJson",
  lexico: "lexiconJson",
  referencias: "referencesJson",
  atributos_formais: "formalTokensJson",
  limites_de_promessa: "promiseLimits",
  hierarquia_e_dono: "ownerAndHierarchyJson",
};

/** Campos guardados como JSON. Texto puro que chega para eles é embrulhado, em
 *  vez de gravado cru — senão a leitura seguinte quebra e o campo inteiro
 *  desaparece da ficha sem ninguém perceber. */
export const EH_JSON = new Set([
  "voicePairsJson", "lexiconJson", "referencesJson", "formalTokensJson", "ownerAndHierarchyJson",
]);

/**
 * O campo tem porta de resposta no portal do cliente?
 *
 * `proibicoes` tem — e continua **fora** de `COLUNA`. Ela é encaminhada para o
 * dono dela (`esteira/proibicoes.ts`), nunca copiada para uma coluna de
 * `BrandBrain`. Ter porta e ter coluna são coisas diferentes, e é a segunda que
 * criaria a divergência.
 *
 * Até 15/08/2026 a pergunta das proibições era filtrada para fora da entrevista
 * — a lista de perguntas passava por `COLUNA` (`portal/marca/route.ts:66`) e
 * `proibicoes` não está lá. Como o gatilho do dia zero exige TRÊS proibições
 * vigentes e `proibicoes` é 1 dos 4 campos do `MODO_MINIMO`, o cliente nunca
 * era perguntado por aquilo de que a porta mais precisava.
 */
export function respondivelPeloCliente(campo: CampoDaMarca): boolean {
  return !!COLUNA[campo] || campo === "proibicoes";
}

const TETO_DO_CAMPO = 4000;
/** Quantas referências guardamos por lado. O cliente pode mandar mais ao longo
 *  do tempo; guardar tudo transforma a régua numa lista infinita sem ganho. */
const MAX_REFERENCIAS_POR_LADO = 10;

function texto(v: unknown): string {
  return typeof v === "string" ? v.trim().slice(0, TETO_DO_CAMPO) : "";
}

function objetoAnterior(anterior: string | null | undefined): Record<string, unknown> {
  try {
    const v = JSON.parse((anterior ?? "").trim() || "{}") as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * As metades que chegaram viram o JSON que a régua lê — **somando** ao que já
 * estava lá.
 *
 * A soma é o ponto e não é conforto: o cliente responde "a nossa cara" no ponto
 * de ônibus e o contraexemplo três dias depois. Se a segunda resposta
 * sobrescrevesse a primeira, o campo nunca ficaria completo e a porta nunca
 * abriria — o mesmo desfecho de antes, por outro caminho.
 */
export function envelopar(
  coluna: string,
  partes: Record<string, string>,
  anterior?: string | null,
): string {
  if (coluna === "voicePairsJson") {
    const pares = paresDeVoz(anterior);
    const dizemos = texto(partes.dizemos);
    const naoDizemos = texto(partes.naoDizemos);
    // Completa o primeiro par pela metade; só abre par novo quando não há
    // nenhum aberto. Assim as duas respostas do mesmo cliente formam UM par —
    // e um par é o que a régua conta.
    const aberto = pares.findIndex((p) => !p.dizemos || !p.naoDizemos);
    const base: ParDeVoz = aberto >= 0 ? pares[aberto]! : { dizemos: "", naoDizemos: "" };
    const novo: ParDeVoz = {
      dizemos: dizemos || base.dizemos,
      naoDizemos: naoDizemos || base.naoDizemos,
    };
    const lista = aberto >= 0 ? pares.map((p, i) => (i === aberto ? novo : p)) : [...pares, novo];
    return JSON.stringify(lista.filter((p) => p.dizemos || p.naoDizemos).slice(0, MAX_REFERENCIAS_POR_LADO));
  }

  if (coluna === "referencesJson") {
    const r = referenciasDeclaradas(anterior);
    const somar = (atual: string[], nova: string) =>
      (nova ? [...new Set([...atual, nova])] : atual).slice(0, MAX_REFERENCIAS_POR_LADO);
    return JSON.stringify({
      aprovadas: somar(r.aprovadas, texto(partes.aprovada)),
      reprovadas: somar(r.reprovadas, texto(partes.reprovada)),
    });
  }

  // Campos de resposta única: preserva as outras chaves do objeto anterior, em
  // vez de trocar o objeto inteiro por uma chave só.
  const anteriorObj = objetoAnterior(anterior);
  const t = texto(partes.valor);
  if (coluna === "lexiconJson") return JSON.stringify({ ...anteriorObj, nome: t || anteriorObj.nome });
  if (coluna === "formalTokensJson") return JSON.stringify({ ...anteriorObj, descricao: t || anteriorObj.descricao });
  if (coluna === "ownerAndHierarchyJson") return JSON.stringify({ ...anteriorObj, dono: t || anteriorObj.dono });
  return JSON.stringify({ ...anteriorObj, valor: t || anteriorObj.valor });
}

/**
 * Normaliza o que chegou da tela para o mapa de metades daquele campo.
 *
 * Aceita as três formas que existem hoje, e nenhuma delas perde resposta:
 *   • `{ aprovada: "...", reprovada: "..." }`  — a tela nova, as duas metades;
 *   • `"texto"`                                — resposta única, ou UMA metade;
 *   • `{ aprovadas: [...] }`                   — objeto já no formato do banco.
 *
 * Texto puro num campo de par vai para a PRIMEIRA metade. Ele não vira o campo
 * inteiro: a segunda continua faltando e continua sendo perguntada — que é a
 * verdade, e é o oposto do `reprovadas: []` fixo, que fingia campo respondido.
 */
export function metadesDaResposta(
  campo: CampoDaMarca,
  entrada: unknown,
): { partes: Record<string, string>; cru?: string } {
  const metades = METADES[campo];

  if (typeof entrada === "string") {
    const t = entrada.trim();
    if (!t) return { partes: {} };
    return { partes: metades ? { [metades[0]!.chave]: t } : { valor: t } };
  }

  if (entrada && typeof entrada === "object") {
    const obj = entrada as Record<string, unknown>;
    const chaves = (metades ?? []).map((m) => m.chave);
    const partes: Record<string, string> = {};
    for (const c of chaves) if (typeof obj[c] === "string") partes[c] = (obj[c] as string).trim();
    if (Object.keys(partes).some((k) => partes[k])) return { partes };
    if (typeof obj.valor === "string") return { partes: { valor: obj.valor.trim() } };
    // Objeto que já vem no formato do banco (`{aprovadas:[...]}`): passa reto,
    // sem envelope. É o caminho de importação/migração, não o do cliente.
    return { partes: {}, cru: JSON.stringify(entrada) };
  }

  return { partes: {} };
}

export interface ResultadoDaEscrita {
  gravado: boolean;
  /** Onde foi parar: o nome da coluna, ou o dono das proibições. */
  onde: string;
  motivo?: string;
}

/**
 * Grava UMA resposta da ficha. **O único escritor da ficha de marca.**
 *
 * Lê o valor anterior antes de escrever, porque campo de par se completa em
 * duas visitas — e uma escrita que ignora o que já estava lá apaga a metade que
 * o cliente já tinha dado.
 */
export async function gravarRespostaDeMarca(input: {
  clientId: string;
  campo: CampoDaMarca;
  /** O que veio da tela: string, objeto de metades, ou objeto cru. */
  entrada: unknown;
  /** De onde veio a resposta. Só as proibições registram origem hoje, e ela
   *  importa: `cliente` é o dono falando pelo portal; `equipe` é quem atende
   *  registrando o que ele disse. Resposta preenchida pela agência não pode se
   *  passar por resposta do cliente — é a mesma regra do `reviewedBy`. */
  origem?: OrigemDaProibicao;
}): Promise<ResultadoDaEscrita> {
  const { clientId, campo } = input;

  // ── AS PROIBIÇÕES NÃO TÊM COLUNA, E NÃO VÃO GANHAR UMA ────────────────────
  // Elas moram em `BrainArtifact` com dono próprio. Aqui só passam o recado.
  if (campo === "proibicoes") {
    const texto = typeof input.entrada === "string" ? input.entrada.trim() : "";
    if (!texto) return { gravado: false, onde: DEPARTAMENTO_DAS_PROIBICOES, motivo: "sem resposta" };
    const r = await registrarProibicoesDeclaradas(clientId, texto, input.origem ?? "marca");
    return {
      gravado: r.novas.length > 0,
      onde: DEPARTAMENTO_DAS_PROIBICOES,
      // Resposta que não virou nenhuma proibição NÃO some calada: sem termo
      // aproveitável, a regra nunca dispararia e o especialista a leria como se
      // estivesse valendo.
      motivo: r.erro
        ? `não consegui guardar: ${r.erro}`
        : r.novas.length === 0
        ? "não consegui transformar isso numa regra que a máquina consiga conferir — vale reescrever citando a palavra, a cor ou o nome exato"
        : undefined,
    };
  }

  const coluna = COLUNA[campo];
  if (!coluna) return { gravado: false, onde: "", motivo: "campo sem porta de escrita nesta ficha" };

  const { partes, cru } = metadesDaResposta(campo, input.entrada);
  if (!cru && !Object.values(partes).some((v) => v)) {
    return { gravado: false, onde: coluna, motivo: "sem resposta" };
  }

  let valor: string;
  if (cru) {
    valor = cru.slice(0, TETO_DO_CAMPO);
  } else if (EH_JSON.has(coluna)) {
    const atual = await prisma.brandBrain
      .findUnique({ where: { clientId }, select: { [coluna]: true } as never })
      .catch(() => null);
    const anterior = (atual as Record<string, unknown> | null)?.[coluna];
    valor = envelopar(coluna, partes, typeof anterior === "string" ? anterior : null);
  } else {
    valor = texto(partes.valor ?? Object.values(partes)[0] ?? "");
  }

  await prisma.brandBrain.upsert({
    where: { clientId },
    update: { [coluna]: valor },
    create: { clientId, [coluna]: valor },
  });
  return { gravado: true, onde: coluna };
}
