// produtor-da-peca.ts — DE QUEM A PEÇA NASCEU, para carimbar no ARQUIVO.
//
// ⚠️ MORA À PARTE DE `design-engine.ts` DE PROPÓSITO, e o motivo é mecânico:
// quinze arquivos de teste mockam `@/lib/ai/design-engine` inteiro para não
// gastar imagem. Uma função pura de carimbo morando lá dentro sumiria em todos
// eles — e o caminho vivo de `artes.ts`, que a chama, quebraria por causa do
// mock, não do código. Módulo puro, sem rede e sem banco: ninguém precisa
// mocká-lo, e por isso ninguém o apaga sem querer.

import type { DesignResult } from "@/lib/ai/design-engine";

/**
 * DE QUEM A PEÇA NASCEU, numa linha, para carimbar no ARQUIVO.
 *
 * ⚠️ Freio 3 da ordem do CEO: *"o arquivo diz de quem nasceu"*. O livro-caixa
 * já sabia (uma linha por chamada, com `provider`), mas o livro-caixa não
 * acompanha o arquivo — e a pergunta que a casa vai fazer daqui a um mês é
 * sobre a PEÇA: *"a qualidade caiu junto com a troca de produtor?"*. Sem a
 * marca no arquivo, essa pergunta exige cruzar horários, e cruzamento por
 * horário é adivinhação com cara de dado.
 */
export function produtorDaPeca(r: Pick<DesignResult, "provider" | "model">): string {
  if (!r.provider) return "design";
  return `design (${r.provider}/${r.model ?? "?"})`;
}
