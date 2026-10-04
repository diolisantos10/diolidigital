// conexoes-a-renovar.ts — QUEM PRECISA RECONECTAR, ANTES DE A PUBLICAÇÃO PARAR.
//
// Bloco D (CEO, 04/10/2026): "login nativo das redes e o que acontece quando o
// acesso expira". Medido antes deste módulo: a casa já DETECTA o acesso morto
// (Meta OAuth 190 → `expired`; Google sem refresh → `expired`) e o portal do
// cliente diz "reconecte" — mas só na PRÓXIMA VISITA DO CLIENTE. A agência não
// era avisada de nada, e o token da Meta com data de vencimento vencia em
// silêncio.
//
// Aqui: uma leitura só, do banco, do que já caiu ou vence em até 7 dias. A
// reconexão continua sendo do dono da conta, pelo login nativo no portal
// (regra de consentimento) — a agência só fica sabendo a tempo de pedir.

import { prisma } from "@/lib/db/client";

export const DIAS_DE_ANTECEDENCIA = 7;
const DIA_MS = 86_400_000;

export interface ConexaoARenovar {
  clientId: string | null;
  cliente: string;
  rede: "Instagram" | "Facebook" | "WhatsApp" | "Google Drive" | "Google Meu Negócio" | string;
  /** "caiu" = já não funciona; "vence" = funciona até `venceEm`. */
  estado: "caiu" | "vence";
  venceEm: string | null;
  frase: string;
}

const REDE: Record<string, string> = { instagram: "Instagram", facebook: "Facebook", whatsapp: "WhatsApp" };
const CAIU = ["expired", "revoked", "error"];

export function fraseDaConexao(estado: "caiu" | "vence", venceEm: Date | null, agora: Date): string {
  if (estado === "caiu") return "O acesso caiu. O cliente precisa entrar de novo pelo portal.";
  const dias = venceEm ? Math.max(0, Math.ceil((venceEm.getTime() - agora.getTime()) / DIA_MS)) : 0;
  return dias <= 1 ? "O acesso vence amanhã. Peça ao cliente para entrar de novo pelo portal." : `O acesso vence em ${dias} dias. Peça ao cliente para entrar de novo pelo portal.`;
}

export async function conexoesARenovar(workspaceId: string, agora = new Date()): Promise<ConexaoARenovar[]> {
  const limite = new Date(agora.getTime() + DIAS_DE_ANTECEDENCIA * DIA_MS);
  const [meta, drive, gmb, clientes] = await Promise.all([
    prisma.metaConnection.findMany({
      where: { workspaceId, OR: [{ status: { in: CAIU } }, { status: "connected", tokenExpiresAt: { lte: limite } }] },
      select: { clientId: true, platform: true, status: true, tokenExpiresAt: true },
    }).catch(() => []),
    prisma.googleDriveConnection.findMany({ where: { workspaceId, status: { in: CAIU } }, select: { clientId: true } }).catch(() => []),
    prisma.googleConnection.findMany({ where: { workspaceId, status: { in: CAIU } }, select: { clientId: true } }).catch(() => []),
    prisma.client.findMany({ where: { workspaceId }, select: { id: true, name: true } }).catch(() => []),
  ]);
  const nome = new Map(clientes.map((c) => [c.id, c.name]));
  const linha = (clientId: string | null, rede: string, estado: "caiu" | "vence", venceEm: Date | null): ConexaoARenovar => ({
    clientId, cliente: clientId ? nome.get(clientId) ?? "Cliente" : "Agência", rede, estado,
    venceEm: venceEm ? venceEm.toISOString() : null, frase: fraseDaConexao(estado, venceEm, agora),
  });

  const lista: ConexaoARenovar[] = [];
  const vistos = new Set<string>();
  for (const m of meta) {
    // Token com data no passado e status ainda "connected": já caiu, só não foi carimbado.
    const estado = CAIU.includes(m.status) || (m.tokenExpiresAt && m.tokenExpiresAt <= agora) ? "caiu" : "vence";
    const rede = REDE[m.platform] ?? m.platform;
    const chave = `${m.clientId}|${rede}`;
    if (vistos.has(chave)) continue; // uma linha por cliente e rede
    vistos.add(chave);
    lista.push(linha(m.clientId, rede, estado, m.tokenExpiresAt));
  }
  for (const d of drive) lista.push(linha(d.clientId, "Google Drive", "caiu", null));
  for (const g of gmb) lista.push(linha(g.clientId, "Google Meu Negócio", "caiu", null));
  // O que já caiu primeiro; depois o que vence antes.
  return lista.sort((a, b) => (a.estado === b.estado ? (a.venceEm ?? "").localeCompare(b.venceEm ?? "") : a.estado === "caiu" ? -1 : 1));
}
