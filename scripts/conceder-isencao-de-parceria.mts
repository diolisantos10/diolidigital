// CONCEDER A ISENÇÃO DE PARCERIA — ato nominal, humano e raro.
//
// Existe porque `IsencaoDeParceria` tinha portão que LÊ, reset que APAGA e
// NADA que escreve. O cliente 001 (Foocci), que entra por parceria e não paga,
// era inconcedível: trava perfeita numa porta sem maçaneta.
//
// ⚠️ ESTE NÃO É MAIS O ÚNICO CAMINHO — e a correção está registrada.
//
// A primeira versão deste script dizia "NÃO É ROTA, por decisão". A decisão
// estava errada: sem rota, a concessão ficou inalcançável para quem não está
// no ambiente, e o resultado foi literal — "não concedi porque não alcanço o
// banco". Trava construída sem fechadura, com o nome trocado.
//
// A porta normal agora é `POST /api/admin/isencoes-de-parceria`, com sessão de
// agência, CSRF e dono da sessão na linha — o molde de `/api/admin/pagamentos`.
// Este script continua existindo para quem JÁ está no ambiente, e os dois
// passam pela MESMA conferência: um script que reimplementasse a regra seria o
// segundo caminho que ninguém testa.
//
// A conferência inteira mora em `lib/agency/financeiro/conceder-isencao.ts`.
// Este arquivo é só a boca: um script que reimplementasse a regra seria o
// segundo caminho que ninguém testa.
//
// Uso (todos os campos são obrigatórios — nenhum tem padrão):
//   npx tsx scripts/conceder-isencao-de-parceria.mts \
//     --pedido <clientRequestId> \
//     --autorizada-por "Nome de quem autorizou" \
//     --valida-ate 2026-11-27 \
//     --escopo "o que a parceria cobre" \
//     --pecas 12 \
//     --teto-ia-centavos-usd 200 \
//     [--cliente <clientId>] [--observacao "..."]

import { concederIsencaoDeParceria } from "@/lib/agency/financeiro/conceder-isencao";

function arg(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Texto → número SEM cair em zero. `Number(undefined)` é NaN e NaN é recusado
 *  lá dentro; o perigo seria um `?? 0` aqui, que transformaria a omissão de um
 *  teto num teto de zero silencioso. */
function num(v: string | undefined): number {
  return v === undefined ? Number.NaN : Number(v);
}

const r = await concederIsencaoDeParceria({
  clientRequestId: arg("pedido") ?? "",
  clientId: arg("cliente") ?? null,
  autorizadaPor: arg("autorizada-por") ?? "",
  validaAte: arg("valida-ate") ?? "",
  escopo: arg("escopo") ?? "",
  pecasContratadas: num(arg("pecas")),
  tetoDeIaCentavosUsd: num(arg("teto-ia-centavos-usd")),
  observacao: arg("observacao") ?? null,
});

if (!r.ok) {
  console.error(`RECUSADO (${r.recusa}): ${r.motivo}`);
  process.exit(1);
}

console.log(`Isenção ${r.id} concedida — vale até ${r.validaAte.toISOString().slice(0, 10)}.`);
console.log("Não é pagamento: receita R$ 0, custo contado normalmente, margem negativa visível.");
