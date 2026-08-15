// chave-do-nome.ts — DUAS NORMALIZAÇÕES DE NOME DE CLIENTE, E POR QUE DUAS. PURO.
//
// ─── O DEFEITO QUE ISTO FECHA (15/08/2026) ──────────────────────────────────
//
// A rota do piloto assistido garantia o cliente assim:
//
//   let cliente = await prisma.client.findFirst({ where: { workspaceId, name } });
//   if (!cliente) cliente = await prisma.client.create({ ... });
//
// Busca por nome EXATO. "City Jobs", "city jobs", "City  Jobs" e "CityJobs" são
// quatro clientes diferentes para esse `if` — e o City Jobs foi duplicado em
// produção. Pior: `Client.name` não tinha restrição de unicidade nenhuma, então
// nada no banco impedia. Guarda que mora só no código perde a corrida quando
// duas chamadas chegam juntas: as duas leem "não existe" e as duas criam.
//
// ─── POR QUE DUAS CHAVES ────────────────────────────────────────────────────
//
// Elas respondem a perguntas diferentes, e uni-las estragaria uma das duas.
//
// • `chaveUnicaDoNome` — a que TRAVA. Vira coluna (`Client.nameKey`) com
//   `@@unique([workspaceId, nameKey])`. Precisa ser reproduzível em SQL puro,
//   porque a migration faz o backfill das linhas que já existem: por isso é
//   `lower + trim + colapso de espaço`, e NADA de dobra de acento — SQLite não
//   dobra acento sem ICU, e uma chave que o código calcula diferente do banco é
//   pior que chave nenhuma (o `upsert` erraria o alvo e voltaria a duplicar).
//
// • `chaveDeReconhecimento` — a que RECONHECE. Mais agressiva: derruba tudo que
//   não é letra ou número, e aí "CityJobs" encontra "City Jobs". Ela NÃO vira
//   restrição de banco de propósito: "Casa Nova" e "Casanova" são dois clientes
//   legítimos, e travá-los seria impedir a casa de cadastrar quem ela quer.
//
// A ordem no caminho de escrita é: reconhecer (reusa o que já existe, mesmo
// grafado diferente) → travar (o banco recusa a corrida). Uma sem a outra deixa
// buraco: só a agressiva não protege contra concorrência; só a do banco não
// pega "CityJobs".

/** Espaço colapsado, ponta aparada, minúsculas. Reproduzível em SQL. */
export function chaveUnicaDoNome(nome: string): string {
  return nome.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Só letras e números, sem acento, minúsculas. Para ACHAR o cliente que já
 * existe escrito de outro jeito — nunca para travar.
 */
export function chaveDeReconhecimento(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Os dois nomes são o mesmo cliente, ainda que grafados diferente? */
export function mesmoCliente(a: string, b: string): boolean {
  const ka = chaveDeReconhecimento(a);
  return ka.length > 0 && ka === chaveDeReconhecimento(b);
}
