// escolha-de-ativos.ts — O MECANISMO ÚNICO DE "ALCANCE ≠ AUTORIZAÇÃO". SERVER-ONLY.
//
// ─── POR QUE ESTE ARQUIVO EXISTE (perícia de 06/08/2026) ────────────────────
//
// Em 06/08 fechamos o fluxo do CLIENTE: o portal passou a perguntar quais
// contas a agência pode usar, e `saveConnection` passou a recusar o que não
// estivesse na lista. **O fluxo da AGÊNCIA continuou aberto** — e a perícia
// contra o banco de produção provou que foi ELE que produziu o dano: as 19
// conexões de terceiros (Sushi Cazza, Dilee, Kero Shop, Acesso Beleza,
// santioh_, dilix.br, queise, Santioh Europe, Spa da Mente, City Jobs SP)
// entraram em 03/08 às 14:05 pelo TOKEN COLADO em `/api/meta/token`, que varria
// `me/accounts` e gravava tudo que o token alcançava.
//
// A tentação era escrever "a tela de escolha da agência". Isso seria um SEGUNDO
// mecanismo — e dois mecanismos divergem: conserta-se um, esquece-se o outro, e
// o incidente volta pela porta que ninguém está olhando. Então a lógica saiu das
// rotas e virou este módulo, com TRÊS funções e um só significado:
//
//   • `alcanceDoAcesso`      — o que o token alcança (o conjunto grande)
//   • `aplicarEscolha`       — o que o dono marcou vira lista + conexão
//   • `gravarSomenteAutorizados` — o laço pós-descoberta: grava o que está na
//                              lista, CONTA o que não está, e nunca grava o resto
//
// Quem usa: `/api/portal/meta-ativos` (cliente), `/api/meta/ativos` (agência),
// `/api/meta/callback` (OAuth, os dois donos) e `/api/meta/token` (token colado).
//
// O `clientId` aqui é sempre o dono JÁ DERIVADO pelo chamador (token do portal
// ou sessão master). Nenhuma função deste módulo lê `clientId` de requisição.

import type { DiscoveredPage } from "./discovery";
import { discoverPages } from "./discovery";
import { loadConnectionToken, saveConnection } from "./connections";
import { lerContasQueOAcessoAlcanca } from "./ads-leitura";
import { DEFAULT_SCOPES } from "./config";
import {
  autorizarAtivos, idsAutorizados, normalizarId, donoDe,
  TIPOS_DE_ATIVO, type TipoDeAtivo, type EntradaDeAutorizacao,
} from "./ativos-autorizados";

export interface AtivoAlcancado {
  tipo: TipoDeAtivo;
  externalId: string;
  nome: string;
  autorizado: boolean;
  /** Só para page/instagram: a Página dona (o IG publica com o token dela). */
  pageId?: string;
}

/** O nome que a casa dá a um Instagram — um só, para a lista e a conexão nunca
 *  divergirem no rótulo do mesmo ativo. */
export function nomeDoInstagram(ig: { id: string; username?: string }): string {
  return ig.username ? `@${ig.username}` : `Instagram ${ig.id}`;
}

/**
 * TUDO O QUE O TOKEN ALCANÇA — o conjunto grande, o que NÃO é autorização.
 *
 * Páginas e Instagram sempre; contas de anúncio quando a Meta liberar
 * `ads_read`. Recusa da Meta vira LACUNA declarada, nunca lista vazia
 * silenciosa: "não consegui perguntar" e "você não tem contas" são coisas
 * diferentes, e confundi-las é tratar ausência de informação como informação.
 */
export async function alcanceDoAcesso(
  workspaceId: string,
  connectionId: string,
): Promise<{ ativos: AtivoAlcancado[]; paginas: DiscoveredPage[]; lacunas: string[] }> {
  const lacunas: string[] = [];
  const ativos: AtivoAlcancado[] = [];

  const conn = await loadConnectionToken(workspaceId, connectionId);
  let paginas: DiscoveredPage[] = [];
  if (conn) {
    try {
      paginas = await discoverPages(conn.token);
    } catch (e) {
      lacunas.push(`Não consegui listar as Páginas agora: ${e instanceof Error ? e.message : "erro na Meta"}`);
    }
  }

  for (const p of paginas) {
    ativos.push({ tipo: "page", externalId: p.id, nome: p.name, autorizado: false, pageId: p.id });
    if (p.instagram) {
      ativos.push({
        tipo: "instagram",
        externalId: p.instagram.id,
        nome: nomeDoInstagram(p.instagram),
        autorizado: false,
        pageId: p.id,
      });
    }
  }

  const contas = await lerContasQueOAcessoAlcanca(workspaceId, connectionId);
  if (contas.ok && contas.dados) {
    for (const c of contas.dados) {
      ativos.push({
        tipo: "ad_account",
        externalId: c.id,
        nome: `${c.nome} · ${c.moeda}${c.ativa ? "" : ` · ${c.statusTexto}`}`,
        autorizado: false,
      });
    }
  } else if (contas.motivo && contas.motivo !== "sem_dado") {
    lacunas.push(contas.erro ?? "Não consegui listar as contas de anúncio agora.");
  }

  return { ativos, paginas, lacunas };
}

/** Carimba `autorizado` em cada ativo alcançado, com UMA consulta por tipo. */
export async function marcarAutorizados(
  workspaceId: string,
  clientId: string | null,
  ativos: AtivoAlcancado[],
): Promise<AtivoAlcancado[]> {
  const porTipo = new Map<TipoDeAtivo, Set<string>>();
  for (const t of TIPOS_DE_ATIVO) porTipo.set(t, await idsAutorizados(workspaceId, donoDe(clientId), t));
  for (const a of ativos) {
    a.autorizado = porTipo.get(a.tipo)?.has(normalizarId(a.tipo, a.externalId)) ?? false;
  }
  return ativos;
}

export interface PedidoDeEscolha {
  tipo?: string;
  externalId?: string;
}

/**
 * A ESCOLHA VIRA LISTA E CONEXÃO — nesta ordem, e só nesta.
 *
 * Só se autoriza o que o token DESTE dono realmente alcança: um id vindo do
 * corpo que a conta dele não administra não vira linha na lista. Isso seria a
 * agência escrevendo autorização sobre ativo de terceiro — o dano do incidente,
 * pela outra ponta.
 *
 * As conexões das Páginas/Instagram escolhidos são gravadas com o token de
 * Página que a MESMA descoberta já devolveu: nenhuma chamada nova à Meta.
 */
export async function aplicarEscolha(args: {
  workspaceId: string;
  clientId: string | null;
  connectionId: string;
  pedidos: PedidoDeEscolha[];
  autorizadoPor: string;
}): Promise<{ autorizados: number; conexoes: number; recusados: string[] }> {
  const { workspaceId, connectionId, pedidos, autorizadoPor } = args;
  const clientId = donoDe(args.clientId);

  const { ativos: alcancados, paginas } = await alcanceDoAcesso(workspaceId, connectionId);
  const conhecidos = new Map(alcancados.map((a) => [`${a.tipo}:${normalizarId(a.tipo, a.externalId)}`, a]));

  const entradas: EntradaDeAutorizacao[] = [];
  const recusados: string[] = [];
  for (const p of pedidos) {
    const tipo = TIPOS_DE_ATIVO.find((t) => t === p.tipo);
    const id = tipo ? normalizarId(tipo, String(p.externalId ?? "")) : "";
    const achado = tipo && id ? conhecidos.get(`${tipo}:${id}`) : undefined;
    if (!achado) { recusados.push(`${p.tipo ?? "?"}:${p.externalId ?? "?"}`); continue; }
    entradas.push({ tipo: achado.tipo, externalId: achado.externalId, nome: achado.nome });
  }

  const autorizados = await autorizarAtivos(workspaceId, clientId, entradas, autorizadoPor);

  let conexoes = 0;
  for (const e of entradas) {
    if (e.tipo === "page") {
      const p = paginas.find((x) => x.id === e.externalId);
      if (!p) continue;
      await saveConnection({
        workspaceId, clientId, platform: "facebook",
        name: p.name, externalId: p.id, accessToken: p.accessToken,
        tokenExpiresAt: null, scopes: DEFAULT_SCOPES, meta: { pageId: p.id },
      }).then(() => { conexoes++; }).catch(() => { /* a trava recusou: fica sem conexão */ });
    }
    if (e.tipo === "instagram") {
      const p = paginas.find((x) => x.instagram?.id === e.externalId);
      if (!p || !p.instagram) continue;
      await saveConnection({
        workspaceId, clientId, platform: "instagram",
        name: e.nome ?? nomeDoInstagram(p.instagram), externalId: p.instagram.id,
        accessToken: p.accessToken, tokenExpiresAt: null, scopes: DEFAULT_SCOPES,
        meta: { pageId: p.id, igUserId: p.instagram.id },
      }).then(() => { conexoes++; }).catch(() => { /* idem */ });
    }
  }

  return { autorizados, conexoes, recusados };
}

export interface ResultadoDaGravacao {
  /** Quantas conexões foram gravadas — só ativos que já estavam na lista. */
  gravadas: number;
  /** Quantos ativos o token alcança e NINGUÉM autorizou. Não foram gravados. */
  faltamEscolher: number;
  nomes: string[];
}

/**
 * O LAÇO PÓS-DESCOBERTA — o ponto exato onde o dano de 03/08 aconteceu.
 *
 * Antes: `for (page of pages) saveConnection(page)`. Depois: grava-se só o que
 * já está na lista do dono; o resto **é contado e devolvido**, nunca gravado.
 *
 * Vale para os DOIS donos, sem exceção. Até 06/08 a agência tinha um ramo
 * próprio que auto-autorizava tudo ("fluxo_master") — que é a mesma frase
 * "alcance = autorização" escrita em outro lugar do código. Não existe mais.
 *
 * `faltamEscolher > 0 && gravadas === 0` é o desfecho "falta escolher": não é
 * erro, não é sucesso. O acesso existe e NADA foi liberado.
 */
export async function gravarSomenteAutorizados(args: {
  workspaceId: string;
  clientId: string | null;
  paginas: DiscoveredPage[];
  scopes?: string[];
}): Promise<ResultadoDaGravacao> {
  const { workspaceId, paginas } = args;
  const clientId = donoDe(args.clientId);
  const scopes = args.scopes && args.scopes.length > 0 ? args.scopes : DEFAULT_SCOPES;

  const permitidasPages = await idsAutorizados(workspaceId, clientId, "page");
  const permitidosIg = await idsAutorizados(workspaceId, clientId, "instagram");

  let gravadas = 0;
  let faltamEscolher = 0;
  const nomes: string[] = [];

  for (const page of paginas) {
    if (permitidasPages.has(normalizarId("page", page.id))) {
      await saveConnection({
        workspaceId, clientId, platform: "facebook",
        name: page.name, externalId: page.id, accessToken: page.accessToken,
        tokenExpiresAt: null, scopes, meta: { pageId: page.id },
      });
      gravadas++; nomes.push(`FB: ${page.name}`);
    } else {
      faltamEscolher++;
    }

    if (page.instagram) {
      if (permitidosIg.has(normalizarId("instagram", page.instagram.id))) {
        await saveConnection({
          workspaceId, clientId, platform: "instagram",
          name: nomeDoInstagram(page.instagram), externalId: page.instagram.id,
          accessToken: page.accessToken, // o IG publica com o token da Página
          tokenExpiresAt: null, scopes, meta: { pageId: page.id, igUserId: page.instagram.id },
        });
        gravadas++; nomes.push(`IG: ${page.instagram.username ?? page.instagram.id}`);
      } else {
        faltamEscolher++;
      }
    }
  }

  return { gravadas, faltamEscolher, nomes };
}

/** A frase única do desfecho "falta escolher", para a agência e para o cliente
 *  dizerem a MESMA coisa — e para nenhuma tela improvisar "conectado ✓". */
export function fraseFaltaEscolher(quantos: number, quem: "agencia" | "cliente"): string {
  return quem === "agencia"
    ? `Acesso guardado. Agora escolha quais das ${quantos} conta(s) a agência passa a administrar — nenhuma foi gravada ainda.`
    : `Acesso concedido. Agora escolha quais das ${quantos} conta(s) a Dioli pode acessar — nenhuma foi liberada ainda.`;
}
