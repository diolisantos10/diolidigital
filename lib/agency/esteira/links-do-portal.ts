// links-do-portal.ts — A REGRA DOS LINKS DE PORTAL, EM UM LUGAR SÓ.
//
// Nasceu como `scripts/links-do-portal.mts` em 07/08/2026, porque o CEO ficou
// parado esperando três links (CityJobs, Foocci, Dioli Digital) e não havia
// caminho. O script resolvia — para quem alcança o banco. E ninguém alcança:
// o SQLite de produção mora num volume DENTRO do contêiner do Railway.
//
// Então a regra saiu do script e virou este módulo, consumido por dois donos:
//
//   • `scripts/links-do-portal.mts` — para quem tem o banco na mão (dev, perícia);
//   • `GET /api/admin/links-do-portal` — que roda ONDE O BANCO ESTÁ.
//
// Uma implementação, não duas. Duas versões da mesma regra divergem, e a que
// diverge aqui emite credencial de 180 dias com critério diferente da outra.
//
// ── AS TRÊS DECISÕES QUE ESTE MÓDULO CARREGA ────────────────────────────────
//
// 1. HOST FIXO NO DOMÍNIO PRÓPRIO. Só `www.diolidigital.com.br` está registrado
//    como redirect no Google (`/api/google/drive/callback`). Um link do host do
//    Railway leva o cliente a `redirect_uri_mismatch` na hora de conectar o
//    Drive — erro do Google, com cara de defeito nosso.
//
// 2. NÃO REVOGA NADA, NUNCA. Um token de portal vivo pode estar no WhatsApp do
//    cliente. Trocá-lo por um novo quebra, em silêncio, o link que ele já tem.
//    Este módulo REUSA o token válido e só emite quando não há nenhum.
//
// 3. ESCREVER É EXPLÍCITO. `emitir` é `false` por padrão: quem não tem token
//    aparece com o MOTIVO, e nada é gravado. Emitir credencial de 180 dias por
//    efeito colateral de uma CONSULTA é como credencial vaza — e uma consulta
//    é exatamente o que uma rota GET parece ser para quem a chama.

import { prisma } from "@/lib/db/client";
import { randomBytes } from "crypto";

/** O host que funciona ponta a ponta. Ver decisão 1 no cabeçalho. */
export const HOST_PADRAO = "https://www.diolidigital.com.br";

/** Os clientes que o CEO pede por padrão quando não nomeia nenhum. */
export const CLIENTES_PADRAO = ["CityJobs", "Foocci", "Dioli Digital"];

export type SituacaoDoLink =
  /** Tem token vivo. O link é reaproveitado — nada foi gravado. */
  | "link_existente"
  /** Não tinha token e `emitir` estava ligado: token novo criado. */
  | "link_novo"
  /** Não tem token vivo e `emitir` estava desligado. NADA foi gravado. */
  | "sem_token"
  /** Não existe cliente com esse nome. Sem cliente não há portal. */
  | "cliente_nao_existe"
  /** Mais de um cliente casa com o nome. Não se escolhe por palpite: mandar o
   *  link do cliente errado entrega o portal de um cliente a outro. */
  | "nome_ambiguo";

export interface LinhaDeLink {
  /** O nome PROCURADO — a palavra de quem pediu, não a do banco. */
  procurado: string;
  situacao: SituacaoDoLink;
  /** O nome do cliente no banco. `null` quando não houve cliente único. */
  cliente: string | null;
  clientId: string | null;
  /** O link montado. `null` sempre que não há token vivo — este campo NUNCA é
   *  preenchido por inferência. */
  link: string | null;
  /** Em português, sempre. É o que vai para a frente do CEO no lugar do link. */
  motivo: string;
  /** Quando o token existente foi emitido (ISO, só a data). */
  emitidoEm?: string;
  /** Quantas vezes o cliente já entrou por ele. */
  acessos?: number;
  /** Os candidatos, quando o nome ficou ambíguo. */
  candidatos?: Array<{ id: string; nome: string }>;
}

export interface RelatorioDeLinks {
  host: string;
  /** `false` = leitura pura. Nenhuma linha do banco foi escrita. */
  emitiu: boolean;
  /** Todos os clientes do banco — o contexto que evita a pergunta seguinte. */
  clientesNoBanco: Array<{ id: string; nome: string }>;
  linhas: LinhaDeLink[];
  /** Quantos ficaram SEM link. Cada um tem o motivo na própria linha. */
  faltando: number;
}

/** Token válido = não revogado e não vencido. A data é conferida aqui, e não no
 *  `where`, para que "vencido" apareça no relato em vez de sumir do resultado. */
export function tokenVivo(t: { revokedAt: Date | null; expiresAt: Date | null }, agora = new Date()): boolean {
  if (t.revokedAt) return false;
  if (t.expiresAt && t.expiresAt.getTime() < agora.getTime()) return false;
  return true;
}

/** O host normalizado — sem barra no fim, para não montar `//portal/access`. */
export function normalizarHost(host: string | null | undefined): string {
  const h = (host ?? "").trim();
  return (h || HOST_PADRAO).replace(/\/+$/, "");
}

export interface PedidoDeLinks {
  /** Os nomes procurados. Vazio = `CLIENTES_PADRAO`. */
  clientes?: string[];
  host?: string | null;
  /** `true` só quando quem chamou pediu EXPLICITAMENTE para gerar o que falta. */
  emitir?: boolean;
}

/**
 * Os links de portal, prontos para colar.
 *
 * Nunca lança por cliente: um nome que não existe vira uma LINHA com motivo, e
 * não uma exceção que derruba os outros dois links que o CEO também pediu.
 */
export async function levantarLinksDoPortal(p: PedidoDeLinks = {}): Promise<RelatorioDeLinks> {
  const host = normalizarHost(p.host);
  const emitir = p.emitir === true;
  const procurados = (p.clientes ?? []).map((s) => s.trim()).filter(Boolean);
  const alvos = procurados.length > 0 ? procurados : CLIENTES_PADRAO;

  const todos = await prisma.client.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const linhas: LinhaDeLink[] = [];
  let faltando = 0;

  for (const nome of alvos) {
    // Busca por conteúdo, sem `mode: insensitive` — o SQLite do Prisma não o
    // suporta e ele LANÇA em vez de filtrar. Comparação feita em memória.
    const casam = todos.filter((c) => (c.name ?? "").toLowerCase().includes(nome.toLowerCase()));

    if (casam.length === 0) {
      linhas.push({
        procurado: nome, situacao: "cliente_nao_existe", cliente: null, clientId: null, link: null,
        motivo: `não existe cliente com esse nome neste banco. Sem cliente não há portal.`,
      });
      faltando++;
      continue;
    }
    if (casam.length > 1) {
      linhas.push({
        procurado: nome, situacao: "nome_ambiguo", cliente: null, clientId: null, link: null,
        motivo: `${casam.length} clientes casam com este nome. Não escolhi por conta própria — mandar o link do cliente errado entrega o portal de um cliente a outro.`,
        candidatos: casam.map((c) => ({ id: c.id, nome: c.name ?? "" })),
      });
      faltando++;
      continue;
    }

    const c = casam[0]!;
    const acessos = await prisma.portalAccess.findMany({
      where: { clientId: c.id },
      orderBy: { grantedAt: "desc" },
    });
    const bom = acessos.find((a) => tokenVivo(a));

    if (bom) {
      linhas.push({
        procurado: nome, situacao: "link_existente", cliente: c.name ?? "", clientId: c.id,
        link: `${host}/portal/access/${bom.token}`,
        motivo: "token existente, reaproveitado — nada foi gravado e nada foi revogado.",
        emitidoEm: bom.grantedAt.toISOString().slice(0, 10),
        acessos: bom.accessCount,
      });
      continue;
    }

    const motivo = acessos.length === 0
      ? "nunca teve token de portal"
      : "todos os tokens estão revogados ou vencidos";

    if (!emitir) {
      linhas.push({
        procurado: nome, situacao: "sem_token", cliente: c.name ?? "", clientId: c.id, link: null,
        motivo: `${motivo}. Nada foi gravado: emitir é ação explícita (\`emitir=1\`).`,
      });
      faltando++;
      continue;
    }

    const novo = await prisma.portalAccess.create({
      data: { token: randomBytes(32).toString("base64url"), clientId: c.id },
    });
    linhas.push({
      procurado: nome, situacao: "link_novo", cliente: c.name ?? "", clientId: c.id,
      link: `${host}/portal/access/${novo.token}`,
      motivo: `${motivo} — token NOVO emitido agora. Nenhum token anterior foi revogado.`,
      emitidoEm: novo.grantedAt.toISOString().slice(0, 10),
      acessos: novo.accessCount,
    });
  }

  return {
    host,
    emitiu: emitir,
    clientesNoBanco: todos.map((c) => ({ id: c.id, nome: c.name ?? "" })),
    linhas,
    faltando,
  };
}
