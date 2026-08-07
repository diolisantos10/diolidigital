// AS PROIBIÇÕES DO CLIENTE — a metade NEGATIVA da verdade ancorada.
//
// ── O buraco, com prova ─────────────────────────────────────────────────────
// `ClientKnowledgeSnapshot.thingsToAvoid` existia desde sempre em
// `lib/dioli-brain/client-snapshot.ts`. E o próprio arquivo declarava, na linha
// 157, que **nenhuma coluna o preenchia**:
//
//     // preferredChannels / visualStyle / thingsToAvoid / productsToHighlight
//     // have no DB column on BrandBrain — left undefined, reported as missing.
//
// Ou seja: a casa sabia o que o cliente É (nome, telefone, horário, serviço) e
// não sabia o que ele NÃO QUER. "Nunca use essa palavra", "não fale de preço",
// "não cite concorrente" morriam no texto do pedido daquela vez e não
// sobreviviam para a peça seguinte.
//
// E isso é pior que uma lacuna de dado: **peça que viola uma proibição
// registrada é pior que peça sem graça, porque o cliente já avisou.** Ele lê a
// mesma palavra que pediu para nunca mais usar, na peça pela qual pagou.
//
// ── ONDE A PROIBIÇÃO MORA ───────────────────────────────────────────────────
// Em `BrainArtifact`, com `department = "proibicoes-do-cliente"`. Não é gambiarra
// de conveniência e a razão está escrita porque ela tem prazo de validade:
//
//   • `BrainArtifact` já é a memória por-cliente desta casa (`@@index([clientId,
//     department])`), já é versionada (`version`), já é apagada pelo
//     `/api/admin/reset`, e já tem o mesmo par de chaves cliente/solicitação
//     usado por `SocialPost` e `ApprovalRequest`;
//   • uma coluna nova em `BrandBrain` exigiria migration, e em 06/08/2026
//     `prisma/schema.prisma` estava sendo alterado por outro agente na mesma
//     árvore (migration `provedor_por_cliente_e_conta_de_ia`). Duas migrations
//     concorrentes no mesmo dia é como se perde dado de produção.
//
// Quando o schema estiver livre, `BrandBrain.thingsToAvoid` é a casa definitiva
// e este módulo passa a ler de lá — a interface pública (`lerProibicoes` /
// `registrarProibicoes`) não muda.
//
// ── COMO ELA ENTRA ──────────────────────────────────────────────────────────
// Um escritor só (`registrarProibicoes`), chamado de onde o cliente FALA:
//   1. o pedido dele no portal (`esteira/triagem.ts`, todo pedido passa lá);
//   2. o pedido de ajuste sobre uma entrega (`esteira/refacao.ts`);
//   3. o briefing / contexto bruto (`sincronizarDoBriefing`).
// Acumula e deduplica — proibição não expira porque o cliente parou de repetir.
//
// ── COMO ELA CHEGA AO ESPECIALISTA, E A TRAVA ───────────────────────────────
// Dois caminhos, e o segundo é o que protege:
//   • AVISO: `thingsToAvoid` do snapshot passa a vir daqui e entra no prompt.
//     Isso é sugestão ao modelo, e sugestão não protege nada.
//   • TRAVA: `VerdadeDoCliente.proibicoes` entra no PISO DE VERDADE
//     (`lib/agency/execution/piso-de-verdade.ts`), que roda em código, sem IA,
//     na SAÍDA, antes de a peça virar `Deliverable` visível ao cliente. Termo
//     proibido no texto = peça reprovada, com o motivo nas palavras dele.
//
// **Fail-closed:** se a leitura das proibições não puder rodar (banco fora do
// ar, tabela ausente), `lidas: false` — e o piso reprova a peça em vez de
// deixá-la sair como aprovada. Checagem que se desliga sozinha não é checagem.

import { prisma } from "@/lib/db/client";
import type { ProibicaoRegistrada, ProibicoesDoCliente } from "@/lib/agency/execution/piso-de-verdade";

/** A gaveta dentro de `BrainArtifact`. Constante exportada porque quem consulta
 *  o banco à mão precisa saber onde olhar. */
export const DEPARTAMENTO_DAS_PROIBICOES = "proibicoes-do-cliente";
const CANVAS_DAS_PROIBICOES = "proibicoes";

/** De onde a proibição veio. Sem origem ninguém consegue auditar depois por que
 *  uma peça foi barrada — e uma trava que não se explica é desligada. */
export type OrigemDaProibicao = "briefing" | "pedido" | "ajuste" | "marca" | "equipe";

export interface Proibicao extends ProibicaoRegistrada {
  origem: OrigemDaProibicao;
  registradaEm: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// A EXTRAÇÃO — léxica, determinística, sem IA
// ─────────────────────────────────────────────────────────────────────────────

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Minúsculas e espaço normalizado, **com acento**.
 *
 * A busca dos padrões roda AQUI e não em `semAcento` por um motivo que aparece
 * na mensagem que o cliente lê: a frase guardada é a DELE. Barrar uma peça
 * dizendo `O cliente proibiu: "nunca use a palavra 'imperdivel'"` quando ele
 * escreveu "imperdível" faz a trava parecer defeito. Os TERMOS conferidos
 * continuam sem acento — lá o que importa é casar, não citar.
 */
function minusculas(s: string): string {
  return (s ?? "").toLowerCase().replace(/\s+/g, " ");
}

/**
 * Os jeitos que um cliente brasileiro escreve uma proibição. Cada padrão captura
 * o OBJETO — o que não pode.
 *
 * A lista é conservadora de propósito. Falso positivo aqui não é uma revisão
 * extra: é uma palavra que a agência para de poder usar para sempre naquele
 * cliente. Por isso só entram construções em que a negação é explícita.
 */
const PADROES: RegExp[] = [
  /\bnunca\s+(?:mais\s+)?(?:use|usem|usar|utilize|utilizem|utilizar|fale|falem|falar|cite|citem|citar|mencione|mencionem|mencionar|escreva|escrevam|escrever|coloque|coloquem|colocar|publique|publiquem|publicar|poste|postem|postar)\s+([^.;!?\n]{2,90})/g,
  /\bn(?:a|ã)o\s+(?:use|usem|usar|utilize|utilizem|utilizar|fale|falem|falar|cite|citem|citar|mencione|mencionem|mencionar|escreva|escrevam|escrever|coloque|coloquem|colocar|publique|publiquem|publicar|poste|postem|postar)\s+([^.;!?\n]{2,90})/g,
  /\bn(?:a|ã)o\s+quero\s+(?:que\s+(?:apare(?:ca|ça)|tenha|use|fale)\s+)?([^.;!?\n]{2,90})/g,
  /\b(?:evite|evitem|evitar|evitando)\s+([^.;!?\n]{2,90})/g,
  /\bnada\s+de\s+([^.;!?\n]{2,90})/g,
  /\b(?:proibido|proibida|proibidos|proibidas)\s+([^.;!?\n]{2,90})/g,
  /\bjamais\s+([^.;!?\n]{2,90})/g,
  /\bsem\s+(?:falar\s+(?:de|em|sobre)|citar|mencionar|usar)\s+([^.;!?\n]{2,90})/g,
];

/** Palavras que não podem virar termo bloqueado sozinhas: bloquear "de" ou
 *  "para" barraria toda peça em português. */
const VAZIAS = new Set([
  "a", "o", "as", "os", "um", "uma", "uns", "umas", "de", "do", "da", "dos", "das",
  "em", "no", "na", "nos", "nas", "por", "para", "pra", "com", "sem", "que", "e",
  "ou", "se", "ao", "aos", "nem", "muito", "muita", "mais", "menos", "nosso",
  "nossa", "nossos", "nossas", "meu", "minha", "meus", "minhas", "seu", "sua",
  "nunca", "jamais", "nada", "nao", "tipo", "coisa", "coisas", "algo", "isso",
  "palavra", "palavras", "termo", "termos", "expressao", "expressoes", "nome",
  "genericos", "generico", "generica", "demais", "todo", "toda", "nenhum",
  // Cortesia. "Não use isso, POR FAVOR" chegou a virar a proibição do termo
  // "favor" — uma regra que barraria toda peça que dissesse "por favor".
  "favor", "obrigado", "obrigada", "please", "gente", "voces", "voce", "acho",
  "achei", "gostaria", "prefiro", "peca", "pecas", "post", "posts", "legenda",
  "legendas", "texto", "textos", "material", "conteudo",
]);

/** Um termo curto demais vira colisão: bloquear "ia" barraria "família",
 *  "notícia" e "criativa". Quatro letras é o piso empírico. */
const MINIMO_DE_LETRAS = 4;
/** Teto por proibição: uma frase inteira não vira 20 bloqueios. */
const MAX_TERMOS_POR_FRASE = 4;

/**
 * Lê o texto do cliente e devolve as proibições que ele declarou.
 *
 * Determinística: sem IA, sem rede, sem banco. Mesmo texto, mesmo resultado.
 * O que ela NÃO faz: inferir proibição a partir de tom ("achei meio agressivo").
 * Proibição inferida seria a agência colocando palavra na boca do cliente e
 * depois se barrando por causa dela.
 */
export function extrairProibicoes(textoDoCliente: string, origem: OrigemDaProibicao): Proibicao[] {
  const t = minusculas(textoDoCliente ?? "").trim();
  if (!t) return [];

  const agora = new Date().toISOString();
  const achadas: Proibicao[] = [];
  const vistas = new Set<string>();

  for (const re of PADROES) {
    re.lastIndex = 0;
    for (const m of t.matchAll(re)) {
      const objeto = (m[1] ?? "").trim();
      if (!objeto) continue;

      const termos = termosDoObjeto(objeto);
      // Objeto sem nenhum termo aproveitável (só palavras vazias) NÃO vira
      // proibição vazia: proibição sem termo é uma regra que nunca dispara e
      // que o especialista lê como se estivesse valendo.
      if (termos.length === 0) continue;

      const chave = termos.join("|");
      if (vistas.has(chave)) continue;
      vistas.add(chave);

      achadas.push({
        frase: m[0].trim().slice(0, 160),
        termos,
        origem,
        registradaEm: agora,
      });
    }
  }
  return achadas;
}

/**
 * Do objeto da frase para os termos que serão CONFERIDOS na peça.
 *
 * Trecho entre aspas vale inteiro ("nunca use a palavra 'imperdível'"): quando o
 * cliente destaca, ele já disse exatamente o que não pode.
 */
function termosDoObjeto(objeto: string): string[] {
  const citados = [...objeto.matchAll(/["'“”‘’]([^"'“”‘’]{3,40})["'“”‘’]/g)].map((c) => c[1]!.trim());
  if (citados.length > 0) {
    return [...new Set(citados.map(semAcento).filter((c) => c.length >= 3))].slice(0, MAX_TERMOS_POR_FRASE);
  }
  // Acento sai só AQUI: o termo é para casar com o texto da peça, e "imperdível"
  // e "imperdivel" são a mesma proibição para quem digitou no celular.
  const palavras = semAcento(objeto)
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((p) => p.trim())
    .filter((p) => p.length >= MINIMO_DE_LETRAS && !VAZIAS.has(p));
  return [...new Set(palavras)].slice(0, MAX_TERMOS_POR_FRASE);
}

// ─────────────────────────────────────────────────────────────────────────────
// A LEITURA — e o fail-closed
// ─────────────────────────────────────────────────────────────────────────────

interface Gaveta {
  itens: Proibicao[];
}

/**
 * As proibições registradas deste cliente.
 *
 * NUNCA LANÇA, e a direção do erro é declarada: falha de leitura devolve
 * `{ lidas: false }`, e o piso trata isso como **reprovação**, não como
 * permissão. Uma checagem que some quando o banco pisca é decoração.
 */
export async function lerProibicoes(clientId: string | null | undefined): Promise<ProibicoesDoCliente> {
  if (!clientId) {
    // Sem cliente não há proibição a conferir — e isso é uma resposta legítima,
    // não uma falha: a peça de um lead sem cadastro não tem dono para proibir.
    return { lidas: true, itens: [] };
  }
  try {
    const registro = await prisma.brainArtifact.findFirst({
      where: { clientId, department: DEPARTAMENTO_DAS_PROIBICOES },
      orderBy: { version: "desc" },
      select: { canvasJson: true },
    });
    if (!registro) return { lidas: true, itens: [] };
    const gaveta = JSON.parse(registro.canvasJson) as Gaveta;
    const itens = Array.isArray(gaveta?.itens) ? gaveta.itens : [];
    return {
      lidas: true,
      itens: itens
        .filter((i) => i && typeof i.frase === "string" && Array.isArray(i.termos) && i.termos.length > 0)
        .map((i) => ({ frase: i.frase, termos: i.termos.filter((x) => typeof x === "string" && x.length >= 3) }))
        .filter((i) => i.termos.length > 0),
    };
  } catch (e) {
    console.warn(`[proibicoes] não consegui ler as proibições de ${clientId}: ${String(e)}`);
    return { lidas: false, itens: [] };
  }
}

/** As proibições em uma frase, para entrar no prompt como `thingsToAvoid`. */
export async function textoDasProibicoes(clientId: string | null | undefined): Promise<string | undefined> {
  const p = await lerProibicoes(clientId);
  if (!p.lidas || p.itens.length === 0) return undefined;
  return p.itens.map((i) => i.frase).join(" · ").slice(0, 1200);
}

// ─────────────────────────────────────────────────────────────────────────────
// A ESCRITA — um caminho só
// ─────────────────────────────────────────────────────────────────────────────

export interface RegistroDeProibicoes {
  novas: Proibicao[];
  total: number;
  /** Falhou em gravar. Não derruba quem chamou — mas não some. */
  erro?: string;
}

/**
 * Extrai as proibições do texto e as ACRESCENTA ao registro do cliente.
 *
 * Acumula, nunca substitui: o cliente que disse "não cite concorrente" em março
 * não precisa repetir em agosto. Deduplicado por conjunto de termos.
 *
 * Best-effort na escrita (não derruba a triagem nem a refação), mas o erro volta
 * no resultado — quem chama decide se registra. Silêncio aqui reproduziria
 * exatamente o buraco que este arquivo fecha.
 */
export async function registrarProibicoes(
  clientId: string,
  texto: string,
  origem: OrigemDaProibicao,
): Promise<RegistroDeProibicoes> {
  const encontradas = extrairProibicoes(texto, origem);
  if (encontradas.length === 0) return { novas: [], total: 0 };

  try {
    const atual = await prisma.brainArtifact.findFirst({
      where: { clientId, department: DEPARTAMENTO_DAS_PROIBICOES },
      orderBy: { version: "desc" },
      select: { canvasJson: true, version: true },
    });

    let existentes: Proibicao[] = [];
    if (atual) {
      try {
        const g = JSON.parse(atual.canvasJson) as Gaveta;
        existentes = Array.isArray(g?.itens) ? g.itens : [];
      } catch {
        // Gaveta corrompida não apaga o histórico em silêncio: começa vazia e
        // a versão nova fica ao lado da antiga (nunca sobrescrevemos linha).
        existentes = [];
      }
    }

    const chaves = new Set(existentes.map((i) => (i.termos ?? []).join("|")));
    const novas = encontradas.filter((n) => !chaves.has(n.termos.join("|")));
    if (novas.length === 0) return { novas: [], total: existentes.length };

    const itens = [...existentes, ...novas].slice(-100);
    await prisma.brainArtifact.create({
      data: {
        clientId,
        department: DEPARTAMENTO_DAS_PROIBICOES,
        canvasId: CANVAS_DAS_PROIBICOES,
        canvasJson: JSON.stringify({ itens }),
        version: (atual?.version ?? 0) + 1,
        status: "approved",
        approvedBy: `registro automático (${origem})`,
      },
    });
    return { novas, total: itens.length };
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    console.warn(`[proibicoes] não consegui gravar as proibições de ${clientId}: ${erro}`);
    return { novas: [], total: 0, erro };
  }
}

/**
 * Varre o que o cliente escreveu no BRIEFING e no contexto bruto e registra o
 * que ele proibiu ali. Idempotente pela deduplicação de `registrarProibicoes`.
 *
 * Existe porque a proibição mais forte que um cliente escreve costuma estar no
 * briefing — e o briefing é anterior a este módulo em todos os clientes atuais.
 */
export async function sincronizarDoBriefing(clientId: string): Promise<RegistroDeProibicoes> {
  try {
    const req = await prisma.clientRequestDb.findFirst({
      where: { clientId },
      orderBy: { createdAt: "desc" },
      select: { rawContext: true, briefingJson: true },
    });
    const partes = [req?.rawContext ?? "", req?.briefingJson ?? ""].filter(Boolean);
    if (partes.length === 0) return { novas: [], total: 0 };
    return await registrarProibicoes(clientId, partes.join("\n"), "briefing");
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    console.warn(`[proibicoes] não consegui sincronizar do briefing de ${clientId}: ${erro}`);
    return { novas: [], total: 0, erro };
  }
}
