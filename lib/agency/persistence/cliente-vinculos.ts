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
  { chave: "parceriaDoCliente",      rotulo: "parcerias do cliente" },
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

/** Os que caem junto com o cliente por `onDelete: Cascade` no schema. */
export const VINCULOS_EM_CASCATA = [
  { chave: "project",        rotulo: "projetos" },
  { chave: "clientNotice",   rotulo: "avisos" },
  { chave: "contentRequest", rotulo: "solicitações de conteúdo" },
  { chave: "brandUpdate",    rotulo: "atualizações de marca" },
  { chave: "brandBrain",     rotulo: "cérebro de marca" },
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
