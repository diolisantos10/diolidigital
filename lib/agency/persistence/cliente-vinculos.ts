// cliente-vinculos.ts — o que está pendurado num cliente, e como mover ou soltar.
//
// POR QUE ESTE ARQUIVO EXISTE:
// A lista de clientes ficou com duplicata visível ("City Jobs" e "CityJobs",
// "Camila Pereira" duas vezes) e não havia como resolver: o sistema nunca teve
// função de apagar nem de fundir cliente. `app/api/clients/[id]/route.ts` só
// tinha GET e PUT.
//
// A ARMADILHA QUE ISTO EVITA — e é o motivo de não ser um `prisma.client.delete`
// de uma linha: no schema, só CINCO modelos caem junto com o cliente
// (`onDelete: Cascade`): Project, ClientNotice, ContentRequest, BrandBrain e
// BrandUpdate. Outros vinte e poucos carregam `clientId` SOLTO, sem relação
// declarada — aprovação, mensagem do portal, mídia, conexão da Meta, acesso ao
// portal, lançamento financeiro. Um delete ingênuo apaga o dono e deixa tudo
// isso pendurado sem ninguém: aprovação de cliente que não existe, conversa sem
// remetente. Isso é pior que a duplicata, porque some da tela e continua no
// banco.
//
// A DECISÃO DE DESENHO, e ela é deliberada:
//   • FUNDIR é a operação principal — é o que duplicata precisa. Move tudo para
//     o sobrevivente. Nada se perde, e é reversível na prática (o dado continua
//     lá, com outro dono).
//   • APAGAR só é permitido quando NÃO HÁ NADA pendurado. Com qualquer vínculo,
//     a rota recusa e manda fundir. Apagar dado de cliente é irreversível, e
//     recusar é barato; o contrário não é. Prompt é aviso, código é trava.

import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";

/** Transação ou cliente Prisma — as funções aqui servem aos dois. */
type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Todo lugar que guarda `clientId` SEM relação declarada no schema, e por isso
 * não é tratado pelo cascade. Levantado do `prisma/schema.prisma`.
 *
 * `rotulo` é o que o CEO lê na tela — nome de negócio, não de tabela.
 * `unicoPorCliente` marca quem tem restrição de unicidade envolvendo clientId:
 * numa fusão, se o sobrevivente já tiver a linha dele, a do absorvido não pode
 * ser movida (violaria a restrição) — ela é descartada.
 */
export const VINCULOS_SOLTOS = [
  { chave: "approvalRequest",        rotulo: "aprovações" },
  { chave: "portalMessage",          rotulo: "mensagens do portal" },
  { chave: "clientRequestDb",        rotulo: "pedidos" },
  { chave: "briefing",               rotulo: "briefings" },
  { chave: "mediaAsset",             rotulo: "mídias" },
  { chave: "socialPost",             rotulo: "posts" },
  { chave: "metricaDePost",          rotulo: "métricas de post" },
  { chave: "brainArtifact",          rotulo: "peças do cérebro" },
  { chave: "adCampaign",             rotulo: "campanhas" },
  { chave: "lancamentoFinanceiro",   rotulo: "lançamentos financeiros" },
  { chave: "portalAccess",           rotulo: "acessos ao portal" },
  { chave: "metaConnection",         rotulo: "conexões da Meta" },
  { chave: "metaAtivoAutorizado",    rotulo: "ativos autorizados da Meta" },
  { chave: "googleConnection",       rotulo: "conexões do Google" },
  { chave: "googleReview",           rotulo: "avaliações do Google" },
  { chave: "driveMaterial",          rotulo: "materiais do Drive" },
  { chave: "strategyRoom",           rotulo: "salas de estratégia" },
  { chave: "activityEvent",          rotulo: "eventos de atividade" },
  { chave: "aIRunLog",               rotulo: "registros de IA" },
  { chave: "departmentLadderRecord", rotulo: "registros de escada" },
  { chave: "user",                   rotulo: "usuários" },
  // A isenção de parceria (27/08/2026). Entra aqui porque ela é um COMPROMISSO
  // com aquele cliente — funde junto e some junto. Deixá-la de fora faria a
  // fusão largar uma isenção órfã, e isenção órfã é produção liberada de graça
  // sem cliente a que responder. Os dois testes-guarda da casa pegaram esta
  // omissão antes do merge, que é exatamente para isso que eles existem.
  { chave: "isencaoDeParceria",      rotulo: "isenções de parceria" },
  // O convite aponta para o cliente parceiro: fundir clientes tem de levar o
  // convite junto, senão o link entregue passa a apontar para um cliente que
  // não existe mais — e um convite órfão é uma credencial sem dono.
  // A AUTORIZAÇÃO da parceria é do cliente: fundir clientes tem de levá-la
  // junto, senão o parceiro perde a parceria na fusão — e volta a ser cobrado.
  //
  // ⚠️ `unicoPorCliente: true` (28/08/2026): `ParceriaDoCliente.clientId` é
  // `@unique` no schema (`prisma/schema.prisma:2764` — "um cliente tem UMA
  // parceria"). Sem a flag, `moverVinculos` tentava MOVER a linha do
  // absorvido em vez de descartá-la quando o sobrevivente já tinha a sua —
  // violava a restrição, o Prisma jogava P2002, o `$transaction` abortava e a
  // fusão da FOOCCI (dois cadastros de 27/08) morria com 500 cru.
  { chave: "parceriaDoCliente",      rotulo: "parcerias do cliente",  unicoPorCliente: true },
  { chave: "conviteDeParceria",      rotulo: "convites de parceria" },
  // A assinatura recorrente (27/08/2026). Entra aqui pela MESMA razão da isenção,
  // e por uma pior: ela é uma COBRANÇA MENSAL VIVA. Fusão que largasse uma
  // assinatura órfã deixaria o Mercado Pago cobrando todo mês um cliente que não
  // existe mais na casa — dinheiro entrando sem ninguém a quem entregar, que é o
  // avesso exato do defeito que a recorrência veio consertar.
  //
  // Unicidade por `clientRequestId`, não por `clientId`: um cliente pode ter mais
  // de um pedido mensal, então ela NÃO é `unicoPorCliente` e as linhas do
  // absorvido se movem todas.
  //
  // ⚠️ As COBRANÇAS caem por cascata da assinatura (`onDelete: Cascade`), então
  // não têm linha própria aqui — e é por isso que apagar a assinatura não deixa
  // histórico de pagamento pendurado no vazio.
  { chave: "assinaturaRecorrente",   rotulo: "assinaturas mensais" },
  // Unicidade por (workspaceId, clientId): não dá para ter dois do mesmo dono.
  { chave: "googleDriveConnection",  rotulo: "conexões do Drive",   unicoPorCliente: true },
  { chave: "clientAiProvider",       rotulo: "provedores de IA",    unicoPorCliente: true },
] as const;

/**
 * Os que caem junto com o cliente por `onDelete: Cascade` no schema.
 *
 * `moverVinculos` percorre `TODOS` (cascata + soltos) com o MESMO laço — a
 * cascata só protege contra APAGAR, não contra FUNDIR, e por isso `brandBrain`
 * carrega `unicoPorCliente` igual a qualquer item de `VINCULOS_SOLTOS`: a flag
 * é lida por `item.chave` dentro de `TODOS`, sem distinguir de qual lista o
 * item veio (confira `moverVinculos` abaixo — ele não filtra por lista).
 */
export const VINCULOS_EM_CASCATA = [
  { chave: "project",        rotulo: "projetos" },
  { chave: "clientNotice",   rotulo: "avisos" },
  { chave: "contentRequest", rotulo: "solicitações de conteúdo" },
  { chave: "brandUpdate",    rotulo: "atualizações de marca" },
  // ⚠️ `unicoPorCliente: true` (28/08/2026): `BrandBrain.clientId` é
  // `@unique` no schema (`prisma/schema.prisma:815`) — um cliente tem UM
  // cérebro de marca. Mesmo defeito e mesma causa do `parceriaDoCliente`
  // acima: sem a flag, dois cadastros com cérebro de marca (o caso real da
  // FOOCCI) faziam `moverVinculos` violar a unicidade e abortar a fusão.
  { chave: "brandBrain",     rotulo: "cérebro de marca",   unicoPorCliente: true },
] as const;

const TODOS = [...VINCULOS_EM_CASCATA, ...VINCULOS_SOLTOS];

export type ItemDoInventario = { chave: string; rotulo: string; total: number };

export type Inventario = {
  /** Só o que tem contagem maior que zero — a tela mostra isto ao CEO. */
  itens: ItemDoInventario[];
  /** Soma de tudo. Zero significa que apagar não perde nada. */
  total: number;
  /** Falso quando há qualquer vínculo: aí o caminho é fundir, não apagar. */
  podeApagar: boolean;
};

/**
 * Conta tudo que está pendurado num cliente, para o aviso ser específico
 * ("3 projetos, 12 mensagens") em vez de um "tem certeza?" genérico.
 *
 * Um modelo que não exista no client do Prisma é ignorado em vez de derrubar a
 * conferência: schema muda, e uma tela de confirmação que quebra é pior que uma
 * contagem a menos. O que NÃO se faz é o contrário — sumir com o inventário
 * inteiro por causa de um nome errado.
 */
export async function inventarioDoCliente(db: Db, clientId: string): Promise<Inventario> {
  const itens: ItemDoInventario[] = [];

  for (const { chave, rotulo } of TODOS) {
    const modelo = (db as unknown as Record<string, { count?: (a: unknown) => Promise<number> }>)[chave];
    if (!modelo?.count) continue;
    const total = await modelo.count({ where: { clientId } });
    if (total > 0) itens.push({ chave, rotulo, total });
  }

  const total = itens.reduce((soma, i) => soma + i.total, 0);
  return { itens, total, podeApagar: total === 0 };
}

export type ResultadoDaFusao = { movidos: ItemDoInventario[]; descartados: ItemDoInventario[] };

/**
 * Move tudo do cliente absorvido para o sobrevivente. Chame DENTRO de uma
 * transação: pela metade é pior que não ter feito.
 *
 * O cascade não precisa de ajuda para APAGAR, mas precisa aqui — numa fusão
 * ninguém quer que projeto suma junto; quer que ele troque de dono. Por isso os
 * dois grupos são percorridos.
 */
export async function moverVinculos(
  tx: Prisma.TransactionClient,
  deId: string,
  paraId: string,
): Promise<ResultadoDaFusao> {
  const movidos: ItemDoInventario[] = [];
  const descartados: ItemDoInventario[] = [];

  for (const item of TODOS) {
    const modelo = (tx as unknown as Record<string, {
      count?: (a: unknown) => Promise<number>;
      updateMany?: (a: unknown) => Promise<{ count: number }>;
      deleteMany?: (a: unknown) => Promise<{ count: number }>;
    }>)[item.chave];
    if (!modelo?.updateMany || !modelo.count) continue;

    // Unicidade por cliente: se o sobrevivente já tem a linha dele, mover a do
    // absorvido violaria a restrição. O do sobrevivente vence — é ele quem
    // continua existindo — e a linha órfã do absorvido é descartada.
    if ("unicoPorCliente" in item && item.unicoPorCliente) {
      const jaTem = await modelo.count({ where: { clientId: paraId } });
      if (jaTem > 0) {
        const sobrando = await modelo.count({ where: { clientId: deId } });
        if (sobrando > 0 && modelo.deleteMany) {
          await modelo.deleteMany({ where: { clientId: deId } });
          descartados.push({ chave: item.chave, rotulo: item.rotulo, total: sobrando });
        }
        continue;
      }
    }

    const { count } = await modelo.updateMany({
      where: { clientId: deId },
      data: { clientId: paraId },
    });
    if (count > 0) movidos.push({ chave: item.chave, rotulo: item.rotulo, total: count });
  }

  return { movidos, descartados };
}

/**
 * Preenche buraco do sobrevivente com o dado do absorvido. Campo que já tem
 * valor NUNCA é sobrescrito: a fusão junta informação, não substitui a de quem
 * fica. É por isso que "City Jobs" (setor vazio) pode ser absorvido por
 * "CityJobs" sem que ninguém perca o setor preenchido.
 */
export function completarCampos(
  sobrevivente: { industry: string | null; email: string | null; phone: string | null; website: string | null },
  absorvido:    { industry: string | null; email: string | null; phone: string | null; website: string | null },
): { industry?: string; email?: string; phone?: string; website?: string } {
  const dados: Record<string, string> = {};
  for (const campo of ["industry", "email", "phone", "website"] as const) {
    const atual = sobrevivente[campo]?.trim();
    const vindo  = absorvido[campo]?.trim();
    if (!atual && vindo) dados[campo] = vindo;
  }
  return dados;
}

export type ConflitoDeFusao = { status: number; mensagem: string };

/**
 * Traduz um erro de restrição de unicidade (P2002) do Prisma, ocorrido durante
 * `moverVinculos` dentro do `$transaction` da rota de fusão, numa mensagem que
 * o CEO lê — "parcerias do cliente", não `parceriaDoCliente`. Devolve `null`
 * quando o erro NÃO é P2002: quem chama decide o que fazer com um erro que não
 * é este (a rota trata como falha genuína, não como sucesso).
 *
 * POR QUE ISTO EXISTE MESMO COM `unicoPorCliente` já cobrindo os dois casos
 * conhecidos (28/08/2026, `ParceriaDoCliente` e `BrandBrain`): a flag evita o
 * P2002 nos vínculos JÁ mapeados. Esta função é a rede para o que a flag ainda
 * não cobre — o PRÓXIMO `clientId @unique` que entrar no schema sem a flag
 * (o guarda de teste pega isso antes do deploy, mas não antes de alguém
 * escrever o código), ou uma corrida real entre duas fusões simultâneas do
 * mesmo par de clientes.
 *
 * Duck-typed de propósito (`typeof erro.code`, não `instanceof
 * Prisma.PrismaClientKnownRequestError`): `instanceof` quebra quando a mesma
 * classe é carregada por dois caminhos de módulo diferentes — já aconteceu
 * nesta casa com outras libs. `code` e `meta` são o contrato estável do erro,
 * documentado pelo Prisma independente de import.
 */
export function traduzirConflitoDeFusao(erro: unknown): ConflitoDeFusao | null {
  if (typeof erro !== "object" || erro === null) return null;
  const e = erro as { code?: unknown; meta?: unknown };
  if (e.code !== "P2002") return null;

  const meta = typeof e.meta === "object" && e.meta !== null
    ? (e.meta as Record<string, unknown>)
    : {};

  // 1ª tentativa: `meta.modelName`. É a chamada de maior confiança: o Prisma
  // anexa o model da operação que falhou (confirmado lendo
  // `node_modules/@prisma/client/runtime/client.js`, `handleRequestError`:
  // `modelName` é mesclado no `meta` do erro final quando a operação que
  // lançou tem um model conhecido — e `tx.<model>.updateMany` sempre tem).
  const modelName = typeof meta.modelName === "string" ? meta.modelName : undefined;
  if (modelName) {
    const item = TODOS.find((v) => v.chave.toLowerCase() === modelName.toLowerCase());
    if (item) {
      return {
        status: 409,
        mensagem: `não foi possível fundir: o cliente sobrevivente já tem "${item.rotulo}" — a fusão não pode ter dois.`,
      };
    }
  }

  // 2ª tentativa: `meta.target` — nomeia o CAMPO (ex.: "clientId"), não o
  // model. Sem o model não dá para citar o `rotulo` certo; melhor um aviso
  // honesto e genérico do que um rótulo inventado.
  const target = meta.target;
  const campos = Array.isArray(target)
    ? target.filter((t): t is string => typeof t === "string")
    : typeof target === "string" ? [target] : [];
  if (campos.length > 0) {
    return {
      status: 409,
      mensagem: `não foi possível fundir: restrição de unicidade em "${campos.join(", ")}" impede mover um vínculo para o cliente sobrevivente.`,
    };
  }

  // Nem modelName nem target: ainda é P2002, ainda é conflito, só sem detalhe.
  return {
    status: 409,
    mensagem: "não foi possível fundir: um vínculo do cliente absorvido colide com um já existente no cliente sobrevivente.",
  };
}
