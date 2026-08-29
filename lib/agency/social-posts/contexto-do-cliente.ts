// O CONTEXTO DO CLIENTE PARA O COPILOTO DE CONTEÚDO — extraído de
// `app/api/social-posts/generate/route.ts` (varredura de posse, rodada 2,
// lote B — 29/08/2026).
//
// POR QUE SAIU DA ROTA: `route.ts` é um arquivo de rota do Next, e o plugin de
// tipos do framework reprova no BUILD qualquer export que não seja um dos que
// ele reconhece (GET/POST/..., `dynamic`, etc.) — uma função qualquer
// exportada dali passa no `tsc --noEmit` e no `npm test`, mas quebra
// `next build`. Função medida por teste não pode morar num arquivo com essa
// restrição (o mesmo motivo documentado no cabeçalho de
// `lib/agency/comercial/prompt-do-sdr.ts`).
//
// O FURO QUE ESTE MÓDULO FECHA: a busca do briefing (`clientRequestDb`) era
// feita SÓ por `clientId`, sem `workspaceId`, enquanto a busca do `Client` já
// conferia o workspace corretamente. Um `clientId` de OUTRO inquilino fazia
// `client` voltar `null` (barrado, certo) mas `request` vinha preenchido com
// o briefing ALHEIO (nome do negócio, segmento, serviços contratados,
// objetivos, público-alvo) — e `!client && !request` deixava passar porque
// `request` sozinho já bastava. Esse contexto virava prompt da IA e voltava,
// para quem pediu, na legenda/ideia/roteiro gerado: leitura entre inquilinos
// sem erro nenhum na tela.
//
// `Client.workspaceId` é obrigatório (nunca nulo): achar `client` já PROVA
// que `clientId` é deste workspace. Sem essa prova, nenhum outro dado ligado
// a este `clientId` é confiável — por isso a segunda busca só roda DEPOIS da
// primeira, nunca em paralelo com ela.

import "server-only";

import { prisma } from "@/lib/db/client";

export interface ClientContext {
  businessName: string;
  segment: string;
  targetAudience: string;
  tone: string;
  services: string[];
  objectives: string[];
}

export async function loadClientContext(clientId: string | null, workspaceId: string): Promise<ClientContext | null> {
  if (!clientId) return null;
  try {
    const client = await prisma.client.findFirst({ where: { id: clientId, workspaceId }, include: { brandBrain: true } });
    if (!client) return null;
    const request = await prisma.clientRequestDb.findFirst({
      where: { clientId }, orderBy: { createdAt: "desc" },
    });

    let scope: Record<string, unknown> = {};
    try { scope = JSON.parse(request?.briefingJson ?? "{}")?.scope ?? {}; } catch { /* ignore */ }
    const brand = client?.brandBrain ?? null;
    const services = (() => { try { return JSON.parse(request?.services ?? "[]"); } catch { return []; } })();
    const objectives = (() => { try { return JSON.parse(request?.objectives ?? "[]"); } catch { return []; } })();

    const str = (...vals: unknown[]) => vals.find((v) => typeof v === "string" && v.trim())?.toString().trim() ?? "";

    return {
      businessName: str(request?.businessName, client?.name, "o cliente"),
      segment:      str(request?.segment, scope.segment, client?.industry),
      targetAudience: str(scope.targetAudience, brand?.targetAudience),
      tone:         str(brand?.tone),
      services:     Array.isArray(services) ? services.filter((s): s is string => typeof s === "string") : [],
      objectives:   Array.isArray(objectives) ? objectives.filter((o): o is string => typeof o === "string") : [],
    };
  } catch {
    return null;
  }
}
