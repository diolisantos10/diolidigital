// medir-conta-com-serie.ts — LER O PASSADO, MEDIR, GRAVAR O PRESENTE.
//
// Esta costura morava dentro da rota (`app/api/meta/desempenho/route.ts`) e por
// isso só um teste que lê o código-fonte conseguia afirmar sobre ela — e teste
// que lê texto é teste que uma refatoração inocente engana. Aqui ela é uma
// função, com prisma mockável, e o teste afirma sobre COMPORTAMENTO: sem a
// leitura do passado o resultado sai `nao_medido`; sem a gravação, amanhã não
// há passado.
//
// A ordem é parte da trava: GRAVAR vem depois de MEDIR. Gravar antes faria o
// período atual virar o próprio passado numa releitura da mesma janela, e a
// campanha ficaria eternamente comparada consigo mesma. O `ate: { lt: desde }`
// da consulta já barra isso; a ordem é a segunda tranca.

import type { DesempenhoDaCampanha } from "@/lib/integrations/meta/ads-leitura";
import { medirIntegridade, type IntegridadeDaMedicao } from "./integridade-do-panorama";
import { passadoDasCampanhas, registrarPeriodo } from "./serie";

export async function medirContaComSerie(entrada: {
  contaId: string;
  periodo: { desde: string; ate: string };
  desempenho: DesempenhoDaCampanha[];
  totais: { gasto: number | null; impressoes: number | null; alcance: number | null; cliques: number | null };
}): Promise<IntegridadeDaMedicao> {
  const passado = await passadoDasCampanhas(
    entrada.desempenho.map((d) => d.campanhaId),
    entrada.periodo,
  );

  const integridade = medirIntegridade({
    desempenho: entrada.desempenho,
    totais: entrada.totais,
    passado,
  });

  for (const d of entrada.desempenho) {
    // `acoes` vazio é "a fonte respondeu e não veio evento" — fato medido, e
    // grava. Quem NÃO grava é a leitura que não respondeu, e essa a conciliação
    // já marcou como não medida.
    await registrarPeriodo({
      campanhaId: d.campanhaId,
      contaId: entrada.contaId,
      periodo: entrada.periodo,
      eventos: Object.keys(d.acoes),
    });
  }

  return integridade;
}
