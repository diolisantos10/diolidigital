// BANCO SQLITE DESCARTÁVEL — caminho único por PROCESSO, nunca fixo.
//
// POR QUE ISTO EXISTE (16/08/2026, investigação do portão instável):
// `criterios-de-aceite.test.ts`, `homologacao-62.test.ts` e
// `migracao-rollback.integracao.test.ts` sobem um SQLite real em `/tmp` para
// rodar as migrations de verdade. Os três usavam um caminho FIXO
// (ex.: "/tmp/v2-criterios.db") — um literal, sempre o mesmo, a cada rodada.
//
// Nesta casa **várias sessões de agente rodam `npm test` ao mesmo tempo na
// MESMA máquina** (a vitrine de `plataforma` já registra isso: "vários
// agentes escrevem na MESMA branch"). Um caminho fixo em `/tmp` não é estado
// isolado do processo — é um arquivo do SISTEMA DE ARQUIVOS, visível e
// gravável por QUALQUER processo `node` rodando na mesma caixa. Duas
// execuções de `npm test` (duas sessões, dois PMs) que caem no mesmo
// instante:
//   1. uma faz `rmSync` no arquivo que a outra acabou de popular;
//   2. o `prisma migrate deploy` de uma roda contra o esqueleto que a outra
//      recriou no meio do caminho;
//   3. as duas abrem conexões de VERDADE (processos do SO diferentes, não
//      threads isoladas dentro do mesmo processo — o mutex do
//      `@prisma/adapter-libsql` só serializa dentro de UM processo) contra o
//      MESMO arquivo.
//
// Isso explica o padrão medido: 14/14 rodando sozinho, contagem de falha
// VARIÁVEL (5, depois 7, depois 0) rodando dentro da suíte cheia — variável
// porque depende de haver ou não outro `npm test` tocando o mesmo relógio no
// mesmo segundo, não de lógica errada no arquivo testado.
//
// O caminho fica único por processo (`pid`) + instante aleatório
// (`randomUUID`): dois processos NUNCA pousam no mesmo arquivo, mesmo que
// disparados no mesmo milissegundo. WAL/SHM/journal são limpos dos dois
// lados (antes de recriar e depois de terminar) porque são o resíduo que uma
// execução interrompida (OOM kill, Ctrl-C, timeout) deixa para trás — um
// `-wal` órfão ao lado de um `.db` recém-criado pode ser reproduzido pelo
// SQLite na abertura da conexão seguinte, e essa é OUTRA forma de estado
// compartilhado entre execuções, mesmo com caminho único.

import { rmSync } from "node:fs";
import { randomUUID } from "node:crypto";

/**
 * Gera um caminho de banco SQLite em `/tmp` único para ESTE processo e ESTA
 * execução. Nunca reutilize o valor entre `describe`s — cada arquivo de
 * teste que sobe seu próprio banco chama isto uma vez, no topo do módulo.
 */
export function caminhoDeBancoDescartavel(nomeBase: string): string {
  return `/tmp/${nomeBase}-${process.pid}-${randomUUID()}.db`;
}

/**
 * Remove o arquivo principal e os artefatos de journaling que o SQLite (modo
 * WAL) deixa ao lado dele. Chame ANTES de recriar o banco (limpa resíduo de
 * uma execução anterior interrompida) e DEPOIS de terminar (não deixa lixo
 * em `/tmp`).
 */
export function limparArquivosDoBanco(caminho: string): void {
  for (const sufixo of ["", "-wal", "-shm", "-journal"]) {
    rmSync(`${caminho}${sufixo}`, { force: true });
  }
}
