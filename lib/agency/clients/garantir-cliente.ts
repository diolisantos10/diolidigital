// garantir-cliente.ts — O ÚNICO CAMINHO PARA "ACHAR OU CRIAR" UM CLIENTE.
//
// ─── O DEFEITO QUE ISTO FECHA (15/08/2026) ──────────────────────────────────
//
// `app/api/v2/assistido/route.ts` fazia, à mão:
//
//   let cliente = await prisma.client.findFirst({ where: { workspaceId, name } });
//   if (!cliente) cliente = await prisma.client.create({ ... });
//
// e o City Jobs virou dois clientes em produção. Duas coisas quebradas:
//
//   • **comparação por nome exato** — "City Jobs", "city jobs", "City  Jobs" e
//     "CityJobs" eram quatro clientes diferentes para esse `if`;
//   • **nenhuma trava no banco** — mesmo com a comparação certa, duas chamadas
//     simultâneas leem "não existe" e as duas criam. Guarda no código perde a
//     corrida por construção.
//
// ─── AS TRÊS CAMADAS, NESTA ORDEM ───────────────────────────────────────────
//
//   1. **Reconhecer** (`chaveDeReconhecimento`): varre os clientes DAQUELE
//      workspace e reusa o que já existe, mesmo grafado diferente. É a camada
//      que pega "CityJobs" — e a única que pode pegar, porque nenhuma restrição
//      de banco distingue "Casa Nova" de "Casanova" sem proibir as duas.
//   2. **Travar** (`chaveUnicaDoNome` + `@@unique([workspaceId, nameKey])`): o
//      `upsert` é atômico. Quem chegar em segundo lugar recebe a linha do
//      primeiro, não uma nova.
//   3. **Não perder a corrida mesmo assim** (`catch` do P2002): entre o upsert e
//      o commit ainda existe janela em bancos que não serializam; se o único
//      barrar, a resposta certa é buscar de novo, não estourar.
//
// Toda rota que precise garantir um cliente entra por aqui. Um segundo lugar
// que saiba fazer isso é um segundo lugar que vai esquecer uma das camadas.

import { prisma } from "@/lib/db/client";
import { chaveDeReconhecimento, chaveUnicaDoNome } from "@/lib/agency/clients/chave-do-nome";

export interface ClienteGarantido {
  cliente: { id: string; name: string; workspaceId: string };
  /** `false` = já existia (e talvez com outra grafia). */
  criado: boolean;
  /** O nome como estava gravado, quando a grafia pedida era outra. */
  reusadoDe?: string;
}

export async function garantirClientePorNome(entrada: {
  workspaceId: string;
  nome: string;
  industry?: string | null;
}): Promise<ClienteGarantido> {
  const nome = entrada.nome.trim().replace(/\s+/g, " ");
  if (!nome) throw new Error("garantirClientePorNome: nome vazio — cliente sem nome não é cliente");

  const nameKey = chaveUnicaDoNome(nome);
  const reconhecimento = chaveDeReconhecimento(nome);

  // 1. Reconhecer. Ordenado pelo mais antigo: quando já houver duplicata no
  //    banco (as que existiam antes desta correção), o caminho novo converge
  //    sempre para a MESMA linha — a mais velha, que é a que tem o histórico.
  const existentes = await prisma.client.findMany({
    where: { workspaceId: entrada.workspaceId },
    select: { id: true, name: true, workspaceId: true, nameKey: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const achado = existentes.find((c) => chaveDeReconhecimento(c.name) === reconhecimento);
  if (achado) {
    // Backfill silencioso da chave quando a linha é anterior à migration ou veio
    // de um caminho que não a calcula. Se o único barrar (outra linha já tem a
    // chave), fica como está: a duplicata é assunto do relatório, não daqui.
    if (!achado.nameKey) {
      await prisma.client
        .update({ where: { id: achado.id }, data: { nameKey } })
        .catch(() => undefined);
    }
    return {
      cliente: { id: achado.id, name: achado.name, workspaceId: achado.workspaceId },
      criado: false,
      ...(achado.name !== nome ? { reusadoDe: achado.name } : {}),
    };
  }

  // 2. Travar. `upsert` pela chave única — atômico contra a corrida.
  try {
    const cliente = await prisma.client.upsert({
      where: { workspaceId_nameKey: { workspaceId: entrada.workspaceId, nameKey } },
      update: {},
      create: {
        workspaceId: entrada.workspaceId,
        name: nome,
        nameKey,
        ...(entrada.industry ? { industry: entrada.industry } : {}),
      },
      select: { id: true, name: true, workspaceId: true },
    });
    return { cliente, criado: true };
  } catch {
    // 3. Perdeu a corrida: quem ganhou já gravou. Buscar é a resposta certa.
    const vencedor = await prisma.client.findFirst({
      where: { workspaceId: entrada.workspaceId, nameKey },
      select: { id: true, name: true, workspaceId: true },
    });
    if (!vencedor) throw new Error(`garantirClientePorNome: não consegui garantir o cliente "${nome}"`);
    return { cliente: vencedor, criado: false };
  }
}
