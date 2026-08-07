// A SALA DOS AGENTES — a camada de dados.
//
// Responde à pergunta do CEO: *"quais os agentes cada projeto tem, quem está
// sendo usado, quem não está usando."* Doutrina 20 do `dioli-brain-kit`.
//
// ─── A DECISÃO QUE GOVERNA TODO ESTE ARQUIVO ─────────────────────────────────
//
// Nenhuma leitura que falha vira zero. Falha de leitura vira `naoMedido` com o
// motivo. É a lição de 07/08/2026 nesta casa: três `.catch(() => null)` em fila
// transformaram falha de infraestrutura na afirmação "você não conectou" e
// mantiveram uma funcionalidade morta se anunciando viva por um mês.
//
// Aqui o mesmo defeito produziria "este agente nunca trabalhou" — que é pior,
// porque é acionável: o dono aposenta um agente que na verdade nunca foi medido.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db/client";
import { TABELA_VERSAO } from "@/lib/ai/precos";
import { TODOS_OS_ESPECIALISTAS } from "@/lib/agency/execution/especialistas";
import { ELENCO } from "./elenco";
import {
  medido,
  naoMedido,
  type CartaoDeAgente,
  type CartaoDeProvedor,
  type Medida,
  type SalaDosAgentes,
} from "./tipos";

/**
 * Por que quem constrói o produto não tem custo de IA aqui: ele não roda no
 * runtime do produto. Ele é despachado numa sessão de desenvolvimento, e o gasto
 * dessa sessão não passa por `AIRunLog` — passa pela fatura da assinatura.
 * Escrever zero aqui afirmaria que ele não custou nada, o que é falso.
 */
const SEM_CONTA_DE_PRODUCAO =
  "este agente é despachado em sessão de desenvolvimento; o gasto dele não passa pelo registro de chamadas da produção";

const OFICINA_FORA_DO_BUNDLE =
  "a oficina (`docs/agents/<slug>/oficina.md`) não é legível a partir deste processo — em produção o servidor roda sem a pasta `docs/`";

/** Uma entrada de oficina começa com `## `. Cabeçalho de nível 1 é o título. */
function contarBlocos(markdown: string): number {
  return markdown.split("\n").filter((l) => /^##\s+\S/.test(l)).length;
}

/**
 * Blocos assinados na oficina do agente. Devolve `naoMedido` — nunca zero —
 * quando o arquivo não é alcançável, porque "não consegui ler" e "não trabalhou"
 * são respostas diferentes e a segunda faz o dono aposentar gente que trabalha.
 */
async function blocosDaOficina(slug: string): Promise<Medida> {
  try {
    const alvo = path.join(process.cwd(), "docs", "agents", slug, "oficina.md");
    const texto = await readFile(alvo, "utf8");
    return medido(contarBlocos(texto));
  } catch {
    return naoMedido(OFICINA_FORA_DO_BUNDLE);
  }
}

interface Agregado {
  chamadas: number;
  tokens: number;
  /** `null` enquanto nenhuma linha trouxe preço; some só o que veio com preço. */
  custoUsd: number;
  /** Quantas linhas vieram sem preço. Com alguma, o custo está SUBESTIMADO. */
  linhasSemPreco: number;
  ultimo: Date | null;
  modelosSemPreco: Set<string>;
  provedores: Set<string>;
}

const novoAgregado = (): Agregado => ({
  chamadas: 0,
  tokens: 0,
  custoUsd: 0,
  linhasSemPreco: 0,
  ultimo: null,
  modelosSemPreco: new Set(),
  provedores: new Set(),
});

type LinhaDoLog = {
  agentId: string | null;
  provider: string;
  model: string;
  tokensEntrada: number | null;
  tokensSaida: number | null;
  custoEstimadoUsd: number | null;
  createdAt: Date;
};

export async function montarSalaDosAgentes(workspaceId: string): Promise<SalaDosAgentes> {
  const desde = new Date(Date.now() - 30 * 24 * 60 * 60_000);

  // A LEITURA PODE FALHAR — e a falha NÃO pode virar zero. `linhas === null`
  // significa "não sei"; `linhas === []` significa "olhei e não havia nada".
  let linhas: LinhaDoLog[] | null = null;
  try {
    linhas = await prisma.aIRunLog.findMany({
      where: { workspaceId, createdAt: { gte: desde } },
      select: {
        agentId: true,
        provider: true,
        model: true,
        tokensEntrada: true,
        tokensSaida: true,
        custoEstimadoUsd: true,
        createdAt: true,
      },
    });
  } catch {
    linhas = null;
  }

  const logIndisponivel = linhas === null;
  const PORQUE_LOG = "o registro de chamadas de IA não pôde ser lido agora";

  const porAgente = new Map<string, Agregado>();
  const porProvedor = new Map<string, Agregado>();
  const semDono = novoAgregado();

  for (const l of linhas ?? []) {
    const alvos: Agregado[] = [];

    if (l.agentId) {
      let a = porAgente.get(l.agentId);
      if (!a) porAgente.set(l.agentId, (a = novoAgregado()));
      alvos.push(a);
    } else {
      // Gasto sem agente NÃO é distribuído entre os agentes e NÃO é escondido:
      // ele vira uma lacuna declarada. Repartir seria inventar quem gastou.
      alvos.push(semDono);
    }

    const chave = `${l.provider}/${l.model}`;
    let p = porProvedor.get(chave);
    if (!p) porProvedor.set(chave, (p = novoAgregado()));
    alvos.push(p);

    for (const a of alvos) {
      a.chamadas++;
      a.tokens += (l.tokensEntrada ?? 0) + (l.tokensSaida ?? 0);
      if (l.custoEstimadoUsd == null) {
        a.linhasSemPreco++;
        a.modelosSemPreco.add(`${l.provider}/${l.model}`);
      } else {
        a.custoUsd += l.custoEstimadoUsd;
      }
      if (!a.ultimo || l.createdAt > a.ultimo) a.ultimo = l.createdAt;
      a.provedores.add(l.provider);
      if (l.agentId) p.provedores.add(l.agentId);
    }
  }

  // ── População A: quem constrói o produto ───────────────────────────────────
  const construtores: CartaoDeAgente[] = await Promise.all(
    ELENCO.map(async (m) => {
      const blocos = await blocosDaOficina(m.slug);
      return {
        slug: m.slug,
        nome: m.nome,
        area: m.area,
        funcao: m.funcao,
        populacao: "constroi_o_produto" as const,
        vinculo: m.vinculo,
        // Sem instrumentação de despacho, dizer "trabalhando" ou "desligado"
        // seria chute. `nao_medido` é a única resposta honesta hoje.
        estado:
          blocos.estado === "medido"
            ? ("trabalhando" as const)
            : ("nao_medido" as const),
        noArDesde: m.noArDesde,
        somenteLeitura: m.somenteLeitura,
        perfil: `.claude/agents/${m.slug}.md`,
        chamadas: naoMedido(SEM_CONTA_DE_PRODUCAO),
        blocos,
        tokens: naoMedido(SEM_CONTA_DE_PRODUCAO),
        custoUsd: naoMedido(SEM_CONTA_DE_PRODUCAO),
        ultimoTrabalho: null,
      };
    }),
  );

  // ── População B: quem fala com o cliente e consome IA paga ─────────────────
  const produtivos: CartaoDeAgente[] = TODOS_OS_ESPECIALISTAS.map((e) => {
    const a = porAgente.get(e.id);
    const semPreco = a ? a.linhasSemPreco : 0;

    return {
      slug: e.id,
      nome: e.label,
      area: e.departamentoLabel,
      funcao: `Produz "${e.deliverableType}" no departamento ${e.departamentoLabel}.`,
      populacao: "fala_com_cliente" as const,
      vinculo: "dominio" as const,
      estado: logIndisponivel
        ? ("nao_medido" as const)
        : a
          ? ("trabalhando" as const)
          : ("desligado" as const),
      noArDesde: null,
      somenteLeitura: false,
      perfil: "lib/agency/execution/especialistas.ts",
      chamadas: logIndisponivel ? naoMedido(PORQUE_LOG) : medido(a?.chamadas ?? 0),
      blocos: naoMedido("agente de produto não tem oficina; a medida dele é a chamada registrada"),
      tokens: logIndisponivel ? naoMedido(PORQUE_LOG) : medido(a?.tokens ?? 0),
      // Se ALGUMA chamada veio sem preço, a soma está subestimada — e soma
      // subestimada apresentada como total é a mesma família do "Total hoje"
      // que mentia. Ela vira "não medido", com o motivo.
      custoUsd: logIndisponivel
        ? naoMedido(PORQUE_LOG)
        : semPreco > 0
          ? naoMedido(
              `${semPreco} de ${a?.chamadas ?? 0} chamadas usaram modelo fora da tabela de preço — o total sairia subestimado`,
            )
          : medido(a?.custoUsd ?? 0),
      ultimoTrabalho: a?.ultimo ? a.ultimo.toISOString() : null,
    };
  });

  // ── As IAs contratadas ─────────────────────────────────────────────────────
  const provedores: CartaoDeProvedor[] = [...porProvedor.entries()].map(([chave, a]) => ({
    id: chave,
    nome: chave.replace("/", " · "),
    // Houve chamada nos últimos 30 dias, logo estava ligado no período. Se o log
    // não pôde ser lido, `null` — "não verificado", jamais "desligado".
    ligado: logIndisponivel ? null : true,
    paraQue: "Geração de texto e peça pelos departamentos.",
    custo30dUsd:
      a.linhasSemPreco > 0
        ? naoMedido(`${a.linhasSemPreco} chamadas com modelo fora da tabela de preço`)
        : medido(a.custoUsd),
    chamadas30d: medido(a.chamadas),
    usadoPor: [...a.provedores].sort(),
    modelosSemPreco: [...a.modelosSemPreco].sort(),
  }));

  // ── As lacunas — a sala declara o que ela mesma não sabe ───────────────────
  const lacunas: string[] = [
    "Quem constrói o produto (os especialistas de `.claude/agents/`) não tem custo nem token medidos: eles rodam em sessão de desenvolvimento, fora do registro de chamadas da produção.",
    "Não existe registro de despacho: a sala não sabe quantas vezes cada especialista foi acionado, só quantos blocos ele assinou na própria oficina.",
  ];
  if (logIndisponivel) {
    lacunas.push(
      "O registro de chamadas de IA não pôde ser lido nesta consulta. Nenhum número desta tela sobre uso em produção é confiável agora.",
    );
  } else if (semDono.chamadas > 0) {
    lacunas.push(
      `${semDono.chamadas} chamadas de IA nos últimos 30 dias foram registradas SEM agente responsável. O gasto delas existe e não aparece em cartão nenhum — não foi repartido, porque repartir seria inventar quem gastou.`,
    );
  }

  return {
    agentes: [...construtores, ...produtivos],
    provedores: provedores.sort((x, y) => x.nome.localeCompare(y.nome)),
    tabelaDePrecoVersao: TABELA_VERSAO,
    lacunas,
    geradoEm: new Date().toISOString(),
  };
}
