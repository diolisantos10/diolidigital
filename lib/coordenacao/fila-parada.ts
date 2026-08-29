// A régua da fila parada — PURA, sem I/O, sem rede.
//
// Reusa a régua que já existe para reivindicação vencida (`estaViva` e
// `TETO_HORAS_PADRAO`, de `reivindicacoes.ts`) em vez de inventar um segundo
// cálculo de idade que pudesse divergir do sentinela que já roda em
// `npm test`. O que este arquivo acrescenta é só o que ainda não existia: a
// régua de PR parado, PR sem veredito e PR estacionado de propósito.
//
// Quem fala com o disco e com a API do GitHub é `scripts/varrer-fila-
// parada.mts` — a mesma separação que `reivindicacoes.ts` /
// `leitura-do-registro.ts` já usa nesta casa.
//
// ── POR QUE 7 DIAS, NÃO OUTRO NÚMERO (medido em 29/08/2026) ─────────────────
// "Dias desde o último commit", nos 34 PRs abertos naquele dia:
//
//   0.0 0.0 0.0 0.0 0.1 0.1 0.1 0.1 0.1 0.6 0.7 4.2 4.5 5.4 | 12.9 12.9 12.9 12.9
//   13.0 13.0 13.0 13.0 13.2 13.2 13.3 13.3 13.3 13.3 13.3 13.3 13.3 13.3 14.0 25.4
//
// Existe uma faixa VAZIA entre 5.4d e 12.9d — 7,5 dias sem um único PR dentro.
// Qualquer limiar dentro dela produz o MESMO veredito hoje: 14 PRs "recentes"
// de um lado, 20 PRs "parados há quase duas semanas" do outro. 7 foi escolhido
// dentro dessa faixa por ter folga dos dois lados — 1,6d acima do último PR
// "vivo" (5.4d), 5,9d abaixo do primeiro PR "parado" (12.9d) — não porque "uma
// semana parece razoável".
//
// ── O QUE ISTO NÃO É ────────────────────────────────────────────────────────
// Não encerra reivindicação, não fecha PR, não comenta nada. Só relata — a
// leitura da fila, nunca a limpeza dela.

import { estaViva, TETO_HORAS_PADRAO, type Reivindicacao } from "./reivindicacoes";

/** Um PR aberto, já resolvido pelo script (`scripts/varrer-fila-parada.mts`)
 *  a partir da API REST do GitHub — este arquivo nunca fala com a rede. */
export type PullRequestAberto = {
  numero: number;
  titulo: string;
  autor: string;
  rascunho: boolean;
  criadoEm: string; // ISO
  ultimoCommitEm: string | null; // ISO; null = não deu para saber
  vereditos: number; // reviews APPROVED + CHANGES_REQUESTED
  comentarios: number; // comentários de issue no PR
};

/** Ver a medição no cabeçalho deste arquivo: 7 cai na faixa vazia 5.4d–12.9d. */
export const DIAS_ATE_PR_PARADO = 7;

export type ItemDaFila = {
  o_que: string;
  ha_quanto: string;
  de_quem: string;
  detalhe?: string;
  /** Número do PR, quando o item vem de um PR — permite deduplicar
   *  `prsParados` × `prsSemVeredito` sem parsear `o_que` de volta (ver
   *  `totalCobravel`). Ausente em item de reivindicação vencida. */
  numeroDoPr?: number;
};

export type RetratoDaFila = {
  reivindicacoesVencidas: ItemDaFila[];
  prsParados: ItemDaFila[];
  prsSemVeredito: ItemDaFila[];
  /** Declarados parados de propósito (título com marcador) — listados para
   *  ninguém sumir do relatório, mas NUNCA somados em `totalCobravel`. */
  estacionados: ItemDaFila[];
  /**
   * `reivindicacoesVencidas.length` + a quantidade de PRs DISTINTOS que
   * aparecem em `prsParados` ∪ `prsSemVeredito` (dedup por `numeroDoPr`).
   *
   * NÃO é a soma das três listas: um PR velho e nunca julgado cai
   * legitimamente nas duas listas de PR ao mesmo tempo — são perguntas
   * diferentes ("ninguém mexe" vs. "ninguém julgou") e as duas listas
   * continuam mostrando esse PR. Mas é o MESMO PR, uma única coisa a
   * perseguir, e `totalCobravel` é o número da manchete: somar as duas
   * ocorrências infla o alarme e é isso que perde a confiança de quem lê.
   * 0 = fila limpa.
   */
  totalCobravel: number;
};

const MARCADORES_DE_PARADA = ["nao mesclar", "nao mergear", "nao fechar", "wip"];

/** Escapa caractere especial de regex — nenhum marcador atual precisa disso,
 *  mas um marcador futuro com `.`/`(`/etc. não pode virar sintaxe de regex
 *  por acidente. */
function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Um marcador só vale como PALAVRA INTEIRA — fronteira por classe Unicode de
 *  letra/número (`\p{L}` / `\p{N}`), não `\b` cru (que não conhece acento e
 *  já teria devolvido `false` para "não" antes de `semAcentoEmMinusculas`
 *  rodar, e cujo comportamento com Unicode não é garantido sem prova).
 *  Sem isto, `.includes("wip")` casa dentro de "s-WIP-e" e "WIP-er": um PR de
 *  carrossel com "swipe" no título ficaria isento para sempre, em silêncio. */
const REGEX_DOS_MARCADORES = MARCADORES_DE_PARADA.map(
  (marcador) => new RegExp(`(?<![\\p{L}\\p{N}])${escaparRegex(marcador)}(?![\\p{L}\\p{N}])`, "u"),
);

/** Remove acento (NFD + descarte da faixa Unicode de marca combinante — a
 *  mesma técnica de `normalizarResponsabilidade` em `reivindicacoes.ts`,
 *  comparação por código decimal para não sair corrompida do editor) e baixa
 *  a caixa. */
function semAcentoEmMinusculas(s: string): string {
  return Array.from(s.normalize("NFD"))
    .filter((ch) => {
      const codigo = ch.codePointAt(0) ?? 0;
      const ehMarcaCombinante = codigo >= 768 && codigo <= 879; // "Combining Diacritical Marks"
      return !ehMarcaCombinante;
    })
    .join("")
    .toLowerCase();
}

/**
 * Título traz marcador explícito de parada de propósito — comparado sem
 * acento e em minúsculas. Hoje pega #10 ("📮 CANAL DOS DIRETORES — não
 * mergear, não fechar") e #387 ("NÃO MESCLAR — aguarda palavra do CEO").
 *
 * Estacionado aparece na lista `estacionados` (ninguém some do relatório) mas
 * nunca em `totalCobravel` — sem isto, #10 (que o CEO mandou deixar aberto)
 * deixaria a rotina vermelha para sempre, e vermelho permanente por item
 * legítimo é exatamente o defeito que esta rotina existe para matar.
 */
export function estacionadoDePropOsito(titulo: string): boolean {
  const normalizado = semAcentoEmMinusculas(titulo);
  return REGEX_DOS_MARCADORES.some((regex) => regex.test(normalizado));
}

/** Dias entre `desdeIso` e `agora`. `null` quando a data não é legível — data
 *  ilegível não pode inflar a fila (ausência de informação não é
 *  informação, mas também não é motivo para cobrar por engano). */
function dias(desdeIso: string, agora: Date): number | null {
  const ms = Date.parse(desdeIso);
  if (Number.isNaN(ms)) return null;
  return (agora.getTime() - ms) / (1000 * 60 * 60 * 24);
}

function formatarDias(n: number): string {
  return `${n.toFixed(1)}d`;
}

function itemDoPr(pr: PullRequestAberto, agora: Date, referenciaIso: string, detalhe?: string): ItemDaFila {
  const d = dias(referenciaIso, agora);
  return {
    o_que: `#${pr.numero} ${pr.titulo}`,
    ha_quanto: d === null ? "(data ilegível)" : formatarDias(d),
    de_quem: pr.autor,
    detalhe,
    numeroDoPr: pr.numero,
  };
}

export function retratoDaFila(
  reivindicacoes: Reivindicacao[],
  prs: PullRequestAberto[],
  agora: Date,
  opcoes?: { tetoHoras?: number; diasAtePrParado?: number },
): RetratoDaFila {
  const tetoHoras = opcoes?.tetoHoras ?? TETO_HORAS_PADRAO;
  const limiar = opcoes?.diasAtePrParado ?? DIAS_ATE_PR_PARADO;

  // a) reivindicação vencida = estaViva(...) === "velha". Encerrada nunca
  //    entra (estaViva já devolve "encerrada" nesse caso, nunca "velha").
  const reivindicacoesVencidas: ItemDaFila[] = reivindicacoes
    .filter((r) => estaViva(r, agora, tetoHoras) === "velha")
    .map((r) => {
      const d = dias(r.abertaEm, agora);
      return {
        o_que: r.frente,
        ha_quanto: d === null ? "(data ilegível)" : formatarDias(d),
        de_quem: r.rotulo ?? r.quem,
      };
    });

  // d) estacionado sai de tudo o mais ANTES de qualquer outra regra rodar.
  const estacionados: ItemDaFila[] = [];
  const naoEstacionados: PullRequestAberto[] = [];
  for (const pr of prs) {
    if (estacionadoDePropOsito(pr.titulo)) {
      estacionados.push(itemDoPr(pr, agora, pr.ultimoCommitEm ?? pr.criadoEm));
    } else {
      naoEstacionados.push(pr);
    }
  }

  // b) PR parado = aberto, não estacionado, e ultimoCommitEm (ou, na
  //    ausência, criadoEm) há mais de `limiar` dias.
  const prsParados: ItemDaFila[] = naoEstacionados
    .filter((pr) => {
      const referencia = pr.ultimoCommitEm ?? pr.criadoEm;
      const d = dias(referencia, agora);
      return d !== null && d > limiar;
    })
    .map((pr) =>
      itemDoPr(
        pr,
        agora,
        pr.ultimoCommitEm ?? pr.criadoEm,
        pr.ultimoCommitEm === null ? "data do último commit não obtida — usando a data de abertura" : undefined,
      ),
    );

  // c) PR sem veredito = aberto, não estacionado, vereditos === 0 E
  //    comentarios === 0, E aberto (por `criadoEm`) há mais de `limiar` dias.
  //    Comentário conta como veredito nesta casa: 0 de 34 PRs têm review
  //    formal, e ignorar comentário marcaria "não julgado" os 3 que já foram
  //    julgados em comentário (#10, #170, #324).
  const prsSemVeredito: ItemDaFila[] = naoEstacionados
    .filter((pr) => {
      if (pr.vereditos !== 0 || pr.comentarios !== 0) return false;
      const d = dias(pr.criadoEm, agora);
      return d !== null && d > limiar;
    })
    .map((pr) => itemDoPr(pr, agora, pr.criadoEm));

  // Dedup por número do PR: prsParados e prsSemVeredito podem repetir o
  // mesmo PR (ver JSDoc de `totalCobravel` acima), mas a manchete conta
  // COISAS DISTINTAS a perseguir, não ocorrências em lista.
  const numerosDePrCobraveis = new Set<number>();
  for (const item of prsParados) if (item.numeroDoPr !== undefined) numerosDePrCobraveis.add(item.numeroDoPr);
  for (const item of prsSemVeredito) if (item.numeroDoPr !== undefined) numerosDePrCobraveis.add(item.numeroDoPr);
  const totalCobravel = reivindicacoesVencidas.length + numerosDePrCobraveis.size;

  return { reivindicacoesVencidas, prsParados, prsSemVeredito, estacionados, totalCobravel };
}
