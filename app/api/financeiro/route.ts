// GET /api/financeiro?ref=YYYY-MM — O DRE DA AGÊNCIA. SÓ LEITURA.
//
// POST /api/financeiro — lança UMA receita ou UM custo, com procedência.
//
// ── QUEM VÊ ─────────────────────────────────────────────────────────────────
// `master` e `project_manager`, e ninguém mais. O DRE da agência inteira não é
// informação de staff de departamento: ele mostra faturamento por cliente e
// resultado por projeto. Restringir aqui, na rota, e não só no menu — menu
// escondido é sugestão; rota fechada é trava.
//
// ── O QUE ESTA ROTA NÃO FAZ ────────────────────────────────────────────────
// Não converte moeda, não estima receita, não preenche mês vazio. Tudo o que
// não foi lançado volta com o estado `nao_lancado`/`nao_medido` e o motivo, e a
// tela escreve a palavra. É o contrato inteiro deste departamento.

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api-guard";
import { prisma } from "@/lib/db/client";
import { montarDre, porProjeto, mesDeReferencia } from "@/lib/agency/financeiro/dre";

const CATEGORIAS = new Set(["mensalidade", "projeto", "ia", "midia", "producao", "ferramenta", "pessoal", "imposto", "outro"]);
const ORIGENS = new Set(["manual", "contrato", "extrato", "importado"]);
const NATUREZAS = new Set(["realizado", "estimado"]);

function referenciaPedida(req: NextRequest): string {
  const ref = req.nextUrl.searchParams.get("ref");
  if (ref && /^\d{4}-\d{2}$/.test(ref)) return ref;
  const hoje = new Date();
  return `${hoje.getUTCFullYear()}-${String(hoje.getUTCMonth() + 1).padStart(2, "0")}`;
}

interface Catalogo {
  /** Nome por id — para a tela não mostrar `cmsg7…` como se fosse gente. */
  nome: (id: string) => string;
  /** Id por nome, SÓ quando o nome é único. Ambíguo devolve `null`. */
  idPorNome: (nome: string) => string | null;
}

async function catalogoDeClientes(workspaceId: string): Promise<Catalogo> {
  const clientes = await prisma.client
    .findMany({ where: { workspaceId }, select: { id: true, name: true } })
    .catch(() => [] as Array<{ id: string; name: string }>);
  const porId = new Map(clientes.map((c) => [c.id, c.name]));

  // Nome repetido NÃO resolve. Dois clientes homônimos existem de verdade
  // (a base de desenvolvimento tinha três "Padaria do João"), e fundi-los
  // porque o texto bate seria inventar que são o mesmo negócio.
  const contagem = new Map<string, number>();
  for (const c of clientes) contagem.set(c.name.trim().toLowerCase(), (contagem.get(c.name.trim().toLowerCase()) ?? 0) + 1);
  const unicos = new Map(
    clientes
      .filter((c) => contagem.get(c.name.trim().toLowerCase()) === 1)
      .map((c) => [c.name.trim().toLowerCase(), c.id]),
  );

  return {
    // Id sem nome volta como o próprio id — nunca como "Cliente" genérico, que
    // faria dois clientes diferentes virarem a mesma linha no relatório.
    nome: (id) => porId.get(id) ?? id,
    idPorNome: (n) => unicos.get(n.trim().toLowerCase()) ?? null,
  };
}

export async function GET(req: NextRequest) {
  const { session, error } = await requireSession(["master", "project_manager"]);
  if (error) return error;

  const referencia = referenciaPedida(req);
  let periodo;
  try {
    periodo = mesDeReferencia(referencia);
  } catch {
    return NextResponse.json({ error: `Referência inválida: "${referencia}". Esperado AAAA-MM.` }, { status: 400 });
  }

  const catalogo = await catalogoDeClientes(session.workspaceId);
  const [dre, projetos] = await Promise.all([
    montarDre(session.workspaceId, periodo, catalogo.nome),
    porProjeto(session.workspaceId, periodo, catalogo.nome, catalogo.idPorNome),
  ]);

  const lancamentos = await prisma.lancamentoFinanceiro
    .findMany({
      where: { workspaceId: session.workspaceId, competencia: { gte: periodo.inicio, lt: periodo.fim } },
      orderBy: { competencia: "desc" },
      take: 200,
      select: {
        id: true, tipo: true, categoria: true, descricao: true, valorCentavos: true, moeda: true,
        origem: true, natureza: true, competencia: true, clientId: true, centroDeCusto: true, criadoPor: true,
      },
    })
    .catch(() => null);

  return NextResponse.json({
    referencia,
    dre,
    projetos,
    // `null` (não pôde ler) é diferente de `[]` (leu e não havia nada). A tela
    // precisa dos dois estados para não dizer "nenhum lançamento" quando o que
    // houve foi uma falha de leitura.
    lancamentos: lancamentos
      ? lancamentos.map((l) => ({ ...l, cliente: l.clientId ? catalogo.nome(l.clientId) : null }))
      : null,
  });
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireSession(["master", "project_manager"]);
  if (error) return error;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const tipo = String(body.tipo ?? "");
  const categoria = String(body.categoria ?? "");
  const origem = String(body.origem ?? "");
  const natureza = String(body.natureza ?? "realizado");
  const descricao = String(body.descricao ?? "").trim();
  const competencia = String(body.competencia ?? "");
  const valorCentavos = Number(body.valorCentavos);

  // Recusa nomeada, campo a campo. "Salvou" com o campo errado gravado como
  // default é como um lançamento entra no DRE dizendo outra coisa.
  const faltas: string[] = [];
  if (tipo !== "receita" && tipo !== "custo") faltas.push("tipo deve ser 'receita' ou 'custo'");
  if (!CATEGORIAS.has(categoria)) faltas.push(`categoria deve ser uma de: ${[...CATEGORIAS].join(", ")}`);
  if (!ORIGENS.has(origem)) faltas.push(`origem (procedência do número) deve ser uma de: ${[...ORIGENS].join(", ")}`);
  if (!NATUREZAS.has(natureza)) faltas.push("natureza deve ser 'realizado' ou 'estimado'");
  if (!descricao) faltas.push("descricao é obrigatória — número sem descrição não é auditável");
  if (!Number.isInteger(valorCentavos) || valorCentavos === 0) faltas.push("valorCentavos deve ser inteiro e diferente de zero");
  if (!/^\d{4}-\d{2}$/.test(competencia)) faltas.push("competencia deve ser AAAA-MM");
  if (faltas.length) return NextResponse.json({ error: "Lançamento recusado", faltas }, { status: 400 });

  const registro = await prisma.lancamentoFinanceiro.create({
    data: {
      workspaceId: session.workspaceId,
      tipo, categoria, descricao, origem, natureza,
      valorCentavos: Math.abs(valorCentavos),
      moeda: "BRL",
      competencia: mesDeReferencia(competencia).inicio,
      clientId: typeof body.clientId === "string" && body.clientId ? body.clientId : null,
      projectId: typeof body.projectId === "string" && body.projectId ? body.projectId : null,
      centroDeCusto: typeof body.centroDeCusto === "string" && body.centroDeCusto ? body.centroDeCusto : null,
      criadoPor: session.name ?? session.role,
      observacao: typeof body.observacao === "string" ? body.observacao : null,
    },
  });

  return NextResponse.json({ ok: true, id: registro.id });
}
