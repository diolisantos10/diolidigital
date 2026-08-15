// A PONTE ENTRE O BRAND BOOK E A FICHA DE MARCA.
//
// GET  → o que o brand book alcançaria HOJE, sem gravar nada. É a prévia que a
//        tela mostra antes de o humano clicar em aplicar.
// POST → aplica os campos alcançáveis que ainda estão em lacuna, com procedência.
//
// ── POR QUE ESTA ROTA EXISTE, E NÃO É O `PUT` AO LADO ──────────────────────
//
// O `PUT /api/agency/clients/[id]/marca` grava o que recebe. Isso está certo
// para a resposta do DONO — ele é a autoridade sobre a própria marca. Mandar a
// extração de um modelo pelo mesmo caminho trocaria a palavra do cliente pelo
// palpite de um PDF, em silêncio.
//
// Aqui a regra é outra e é o motivo da rota separada: **a extração propõe.**
// Campo já `definido` não é tocado, sai nomeado em `naoTocados`, e o humano vê.
//
// ── O QUE ESTA ROTA SE RECUSA A FAZER PARECER ──────────────────────────────
//
// Ela NUNCA devolve "ficha completa". Mesmo aplicando tudo o que consegue, ela
// devolve `aindaFalta` com os campos que continuam em lacuna e o motivo de cada
// um — porque seis dos nove não vêm de brand book nenhum. Uma resposta que
// omitisse isso faria a tela mentir por omissão, e o CEO clicaria em aplicar
// para ver a ficha andar 11 pontos sem entender por quê.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";
import {
  lerFichaDeMarca, proximasPerguntas, CAMPOS_DA_MARCA,
  COLUNA_DA_FICHA, COLUNA_EH_JSON,
} from "@/lib/agency/esteira/ficha-de-marca";
import {
  proporDoBrandBook, fundirProcedencia, type PropostaDeCampo,
} from "@/lib/agency/esteira/proposta-do-brand-book";
import type { BrandExtraction } from "@/lib/types/brand-extraction";

export const dynamic = "force-dynamic";

/**
 * O cliente existe E é desta sessão? 404 quando não — NUNCA 403.
 *
 * A diferença não é estética: 403 confirma que o id existe e pertence a outra
 * conta, e essa confirmação já é vazamento. 404 não distingue "não existe" de
 * "não é seu", e é por isso que é a resposta certa nas duas situações.
 *
 * ── O ESCOPO VAI NO `where`, NUNCA NUMA COMPARAÇÃO DEPOIS ─────────────────
 *
 * Buscar por id e comparar `achado.workspaceId === sessao.workspaceId` num `if`
 * funciona até alguém acrescentar um caminho de saída antes do `if`. Derivar
 * dentro da consulta faz o isolamento não depender de ninguém lembrar.
 *
 * E a sessão do PORTAL carrega `clientId`: ela só alcança o próprio cliente.
 * Sem esta linha, um token de portal legítimo leria a ficha de marca de
 * qualquer outro cliente do mesmo workspace.
 */
async function clienteOuNulo(
  id: string,
  sessao: { workspaceId: string; clientId?: string },
): Promise<{ id: string } | null> {
  if (sessao.clientId && sessao.clientId !== id) return null;
  return prisma.client.findFirst({
    where: { id, workspaceId: sessao.workspaceId },
    select: { id: true },
  }).catch(() => null);
}

function extracaoDoCorpo(bruto: unknown): BrandExtraction | null {
  if (!bruto || typeof bruto !== "object") return null;
  const d = bruto as Record<string, unknown>;
  // `brandName` é o campo que `validate` do analisador exige para considerar a
  // extração válida. Sem ele, o que chegou aqui não passou por lá.
  if (typeof d.brandName !== "string" || !d.brandName.trim()) return null;
  const t = (k: string) => (typeof d[k] === "string" ? (d[k] as string) : "");
  return {
    brandName: t("brandName"), tagline: t("tagline"),
    primaryColor: t("primaryColor"), secondaryColor: t("secondaryColor"), accentColor: t("accentColor"),
    typography: t("typography"), tone: t("tone"),
    values: Array.isArray(d.values) ? (d.values as unknown[]).map(String) : [],
    targetAudience: t("targetAudience"), positioning: t("positioning"), summary: t("summary"),
  };
}

/** O que ainda falta depois de aplicar — com a pergunta pronta para o dono. */
function aindaFalta(ficha: Awaited<ReturnType<typeof lerFichaDeMarca>>) {
  return {
    definidos: ficha.definidos,
    total: CAMPOS_DA_MARCA.length,
    lacunas: ficha.lacunas.map((l) => ({ campo: l.campo, rotulo: l.rotulo, pergunta: l.pergunta })),
    // O gatilho do dia zero é o número honesto: a ficha pode andar e a marca
    // continuar não constituída, porque os campos que decidem não vêm do PDF.
    aindaNoDiaZero: ficha.naoConstituida,
    proximasPerguntas: proximasPerguntas(ficha).map((p) => ({ campo: p.campo, pergunta: p.pergunta })),
  };
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const sessao = await getSession();
  if (!sessao) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  if (!(await clienteOuNulo(id, sessao))) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });

  const extracao = extracaoDoCorpo(
    JSON.parse(req.nextUrl.searchParams.get("extracao") ?? "null") as unknown,
  );
  if (!extracao) {
    return NextResponse.json({ error: "Mande a extração do brand book para ver a prévia." }, { status: 400 });
  }

  const ficha = await lerFichaDeMarca(id);
  const proposta = proporDoBrandBook(extracao, ficha);
  return NextResponse.json({ previa: true, ...proposta, aindaFalta: aindaFalta(ficha) });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const sessao = await getSession();
  if (!sessao) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  if (!(await clienteOuNulo(id, sessao))) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });

  const corpo = (await req.json().catch(() => ({}))) as {
    extracao?: unknown; arquivo?: string; confirmadoPor?: string;
  };
  const extracao = extracaoDoCorpo(corpo.extracao);
  if (!extracao) {
    return NextResponse.json({ error: "A extração do brand book não veio, ou veio sem o nome da marca." }, { status: 400 });
  }

  // O ARQUIVO é obrigatório: procedência sem a fonte não é procedência. Se um
  // dia alguém perguntar "de onde saiu esta cor?", a resposta tem que ser o nome
  // do PDF, não "do sistema".
  const arquivo = (corpo.arquivo ?? "").trim();
  if (!arquivo) {
    return NextResponse.json({ error: "Falta dizer de qual arquivo veio esta extração." }, { status: 400 });
  }
  // Quem confirmou. Cai na sessão, nunca em "sistema": alguém clicou.
  const confirmadoPor = (corpo.confirmadoPor ?? "").trim() || sessao.email || sessao.userId || "operador";

  const fichaAntes = await lerFichaDeMarca(id);
  const proposta = proporDoBrandBook(extracao, fichaAntes);

  if (proposta.aplicaveis.length === 0) {
    // Zero aplicado NUNCA é frase verde. Se não entrou nada, o motivo é dito:
    // ou o dono já tinha respondido, ou o PDF não trouxe o que a ficha usa.
    return NextResponse.json({
      ok: false,
      aplicados: [],
      naoTocados: proposta.jaDefinidos,
      foraDoAlcance: proposta.foraDoAlcance,
      recado: proposta.recado,
      aindaFalta: aindaFalta(fichaAntes),
    }, { status: 200 });
  }

  const dados: Record<string, string> = {};
  const aplicados: PropostaDeCampo[] = [];
  for (const p of proposta.aplicaveis) {
    const coluna = COLUNA_DA_FICHA[p.campo];
    if (!coluna) continue;
    // `valor` de campo JSON já sai de `proporDoBrandBook` serializado; os de
    // texto vão como texto. A conferência existe para o dia em que alguém
    // acrescentar um campo e esquecer de qual dos dois tipos ele é.
    dados[coluna] = COLUNA_EH_JSON.has(coluna) && !p.valor.trim().startsWith("{")
      ? JSON.stringify({ valor: p.valor })
      : p.valor;
    aplicados.push(p);
  }

  const atual = await prisma.brandBrain.findUnique({
    where: { clientId: id }, select: { fieldStatesJson: true },
  }).catch(() => null);

  dados.fieldStatesJson = fundirProcedencia(atual?.fieldStatesJson, aplicados, { arquivo, confirmadoPor });

  await prisma.brandBrain.upsert({
    where: { clientId: id },
    update: dados,
    create: { clientId: id, ...dados },
  });

  const fichaDepois = await lerFichaDeMarca(id);

  return NextResponse.json({
    ok: true,
    aplicados: aplicados.map((a) => ({ campo: a.campo, rotulo: a.rotulo, deOnde: a.deOnde })),
    naoTocados: proposta.jaDefinidos,
    foraDoAlcance: proposta.foraDoAlcance,
    procedencia: { arquivo, confirmadoPor },
    recado: proposta.recado,
    // A conclusão primeiro, e ela é honesta: quanto andou e quanto ainda falta.
    andou: { de: fichaAntes.definidos, para: fichaDepois.definidos, total: CAMPOS_DA_MARCA.length },
    aindaFalta: aindaFalta(fichaDepois),
  });
}
