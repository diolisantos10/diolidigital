// ativos-autorizados.ts — A TRAVA DE ALCANCE DA META. SERVER-ONLY.
//
// ─── O INCIDENTE QUE PRODUZIU ESTE ARQUIVO (06/08/2026) ─────────────────────
//
// O CEO clicou "Conectar Facebook/Instagram" no portal do cliente **Foocci**.
// A Meta devolveu um token do USUÁRIO dele. Com esse token:
//
//   • `ads-leitura.ts` perguntou `me/adaccounts` e leu **14 contas de anúncio**
//     — Santioh, Dilix, Queise, DileeBags e contas pessoais dele;
//   • o callback varreu `me/accounts` e GRAVOU como conexão da Foocci **todas**
//     as Páginas e Instagram que o token alcançava, com token de Página junto
//     (isto é, com poder de PUBLICAR).
//
// Palavras dele: *"eu só autorizei as contas do Foocci no projeto."* Ele está
// certo. Com um cliente de verdade, o mesmo clique entrega à agência a conta
// pessoal do dono do negócio junto com a do restaurante.
//
// ─── A REGRA, EM UMA FRASE ──────────────────────────────────────────────────
//
// **O que o token ALCANÇA e o que a agência PODE LER são conjuntos diferentes.**
// Este módulo é o segundo conjunto. Ele é explícito, ele é do cliente, e ele é
// FAIL-CLOSED: ausência de lista nunca vira permissão.
//
// ─── AS TRÊS PROPRIEDADES QUE ESTA TRAVA PRECISA TER ────────────────────────
//
// 1. **DERIVADA, NUNCA COMPARADA.** O cliente dono nunca vem do pedido HTTP.
//    Ele vem do token do portal (fluxo do cliente) ou da própria linha de
//    conexão cujo token está sendo usado (fluxo interno). `clientId` de query
//    ou de corpo é ignorado — a pergunta certa é "de quem é ESTE token?", não
//    "de quem o chamador disse que é?".
// 2. **FAIL-CLOSED.** Lista vazia = nenhum ativo. Erro ao consultar o banco =
//    nenhum ativo (nunca "deu ruim, então libera"). A tela diz "falta autorizar
//    quais contas"; ela nunca mostra dado que não devia ter.
// 3. **NO CAMINHO ÚNICO.** A conferência mora onde o dado nasce
//    (`ads-leitura.ts`, `connections.saveConnection`), não numa rota. Rota nova
//    escrita amanhã passa pelos mesmos dois lugares.

import { prisma } from "@/lib/db/client";

/** Os quatro tipos de ativo que a Meta entrega e que esta casa toca. */
export type TipoDeAtivo = "ad_account" | "page" | "instagram" | "whatsapp";

export const TIPOS_DE_ATIVO: TipoDeAtivo[] = ["ad_account", "page", "instagram", "whatsapp"];

/** A plataforma de `MetaConnection` que corresponde a cada tipo de ativo.
 *  `user` não aparece: o token de usuário é a CREDENCIAL que o cliente
 *  concedeu, não um ativo que a agência escolhe ler. */
export const TIPO_POR_PLATAFORMA: Record<string, TipoDeAtivo | null> = {
  facebook: "page",
  instagram: "instagram",
  whatsapp: "whatsapp",
  user: null,
};

/**
 * A chave determinística de uma autorização.
 *
 * `clientId` nulo vira o literal `agencia` — o mesmo significado que em
 * `MetaConnection` (conexão da própria agência). Nulo não pode ir para dentro
 * de uma chave de texto: `null` e `"null"` colidiriam em bancos diferentes de
 * formas diferentes, e chave de trava não pode depender do dialeto.
 */
export function chaveDoAtivo(
  workspaceId: string,
  clientId: string | null,
  tipo: TipoDeAtivo,
  externalId: string,
): string {
  return `${workspaceId}:${clientId ?? "agencia"}:${tipo}:${normalizarId(tipo, externalId)}`;
}

/**
 * O id do ativo em forma canônica.
 *
 * A Meta devolve a mesma conta de anúncio ora como `act_123`, ora como `123`
 * (`id` vs `account_id`) — ver `app/api/meta/contas-de-anuncio/route.ts`. Duas
 * grafias do mesmo ativo numa trava de igualdade significa que metade das
 * consultas erra silenciosamente e libera (ou barra) o que não devia.
 */
export function normalizarId(tipo: TipoDeAtivo, externalId: string): string {
  const cru = String(externalId ?? "").trim();
  if (tipo !== "ad_account") return cru;
  return cru.startsWith("act_") ? cru : cru ? `act_${cru.replace(/^act_/, "")}` : "";
}

export interface AtivoAutorizadoView {
  tipo: TipoDeAtivo;
  externalId: string;
  nome: string;
  autorizadoEm: string;
}

/**
 * O CONJUNTO AUTORIZADO. Esta é a função que todo caminho de leitura consulta.
 *
 * Devolve ids já normalizados. Devolve conjunto VAZIO quando não há linha —
 * e vazio significa "nada liberado", não "sem restrição". Se o banco falhar,
 * devolve vazio também: numa trava de privacidade, indisponibilidade tem que
 * fechar a porta, não abri-la.
 */
export async function idsAutorizados(
  workspaceId: string,
  clientId: string | null,
  tipo: TipoDeAtivo,
): Promise<Set<string>> {
  try {
    const linhas = await prisma.metaAtivoAutorizado.findMany({
      where: { workspaceId, clientId: clientId ?? null, tipo },
      select: { externalId: true },
    });
    return new Set(linhas.map((l) => normalizarId(tipo, l.externalId)));
  } catch {
    // FAIL-CLOSED. Um `catch` que devolvesse "tudo liberado" transformaria
    // qualquer indisponibilidade de banco na falha de privacidade de novo.
    return new Set();
  }
}

/** A pergunta unitária: ESTE ativo está autorizado para ESTE dono? */
export async function ativoAutorizado(
  workspaceId: string,
  clientId: string | null,
  tipo: TipoDeAtivo,
  externalId: string,
): Promise<boolean> {
  const alvo = normalizarId(tipo, externalId);
  if (!alvo) return false;
  const permitidos = await idsAutorizados(workspaceId, clientId, tipo);
  return permitidos.has(alvo);
}

/**
 * Filtra uma lista vinda da Meta pelo que está autorizado. UMA consulta ao
 * banco, não uma por item.
 *
 * Devolve os dois lados de propósito: `autorizados` é o que pode subir para a
 * tela; `recusados` é só a CONTAGEM e os ids — nunca o objeto inteiro. Quem
 * chamar não pode nem por engano repassar adiante o que foi recusado.
 */
export async function filtrarAutorizados<T>(
  workspaceId: string,
  clientId: string | null,
  tipo: TipoDeAtivo,
  itens: T[],
  idDe: (item: T) => string,
): Promise<{ autorizados: T[]; recusados: string[]; listaVazia: boolean }> {
  const permitidos = await idsAutorizados(workspaceId, clientId, tipo);
  const autorizados: T[] = [];
  const recusados: string[] = [];
  for (const item of itens) {
    const id = normalizarId(tipo, idDe(item));
    if (id && permitidos.has(id)) autorizados.push(item);
    else recusados.push(id || "(sem id)");
  }
  return { autorizados, recusados, listaVazia: permitidos.size === 0 };
}

/** A frase que a tela mostra quando não há lista. Uma só, para a casa inteira
 *  dizer a mesma coisa — e para ela nunca virar "nenhum dado encontrado", que
 *  faria o operador concluir que o cliente não tem contas. */
export const FRASE_SEM_AUTORIZACAO =
  "Falta autorizar quais contas a agência pode ler. A conexão existe, mas nenhuma conta foi marcada pelo cliente na tela dele — e sem essa marcação nada é lido.";

export interface EntradaDeAutorizacao {
  tipo: TipoDeAtivo;
  externalId: string;
  nome?: string;
}

/**
 * Grava a escolha do dono. `autorizadoPor` é rastro, não credencial: quem pode
 * chamar isto já foi decidido pelo chamador (token do portal ou sessão master).
 *
 * Idempotente pela chave determinística: marcar duas vezes o mesmo ativo não
 * cria duas linhas.
 */
export async function autorizarAtivos(
  workspaceId: string,
  clientId: string | null,
  entradas: EntradaDeAutorizacao[],
  autorizadoPor: string,
): Promise<number> {
  let gravados = 0;
  for (const e of entradas) {
    const externalId = normalizarId(e.tipo, e.externalId);
    if (!externalId) continue;
    const id = chaveDoAtivo(workspaceId, clientId, e.tipo, externalId);
    await prisma.metaAtivoAutorizado.upsert({
      where: { id },
      create: {
        id,
        workspaceId,
        clientId: clientId ?? null,
        tipo: e.tipo,
        externalId,
        nome: e.nome ?? "",
        autorizadoPor,
      },
      update: { nome: e.nome ?? undefined, autorizadoPor },
    });
    gravados++;
  }
  return gravados;
}

/**
 * Revoga. Apaga a linha da lista E a conexão correspondente, quando existir:
 * deixar a `MetaConnection` de pé depois de revogado seria manter o token
 * daquele ativo guardado — que é exatamente o dano que esta trava existe para
 * impedir. Revogar tem que APAGAR, não só desmarcar.
 */
export async function revogarAtivo(
  workspaceId: string,
  clientId: string | null,
  tipo: TipoDeAtivo,
  externalId: string,
): Promise<{ removidoDaLista: boolean; conexoesApagadas: number }> {
  const alvo = normalizarId(tipo, externalId);
  const id = chaveDoAtivo(workspaceId, clientId, tipo, alvo);

  const removido = await prisma.metaAtivoAutorizado
    .delete({ where: { id } })
    .then(() => true)
    .catch(() => false);

  const plataformas = Object.entries(TIPO_POR_PLATAFORMA)
    .filter(([, t]) => t === tipo)
    .map(([p]) => p);

  let conexoesApagadas = 0;
  if (plataformas.length > 0 && alvo) {
    const r = await prisma.metaConnection
      .deleteMany({
        where: { workspaceId, clientId: clientId ?? null, platform: { in: plataformas }, externalId: alvo },
      })
      .catch(() => ({ count: 0 }));
    conexoesApagadas = r.count;
  }

  return { removidoDaLista: removido, conexoesApagadas };
}

/** A lista, para a tela do dono. Só nome/tipo/id — nunca token. */
export async function listarAutorizados(
  workspaceId: string,
  clientId: string | null,
): Promise<AtivoAutorizadoView[]> {
  const linhas = await prisma.metaAtivoAutorizado
    .findMany({
      where: { workspaceId, clientId: clientId ?? null },
      orderBy: { autorizadoEm: "desc" },
    })
    .catch(() => []);
  return linhas.map((l) => ({
    tipo: l.tipo as TipoDeAtivo,
    externalId: l.externalId,
    nome: l.nome,
    autorizadoEm: l.autorizadoEm.toISOString(),
  }));
}
