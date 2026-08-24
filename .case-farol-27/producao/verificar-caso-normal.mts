// Roda a REGRA DE PARADA do caminho automático (função pura, sem banco) contra
// o payload REAL do pedido criado em produção. Responde: o automático aceitaria
// a Farol 27, ou pararia e esperaria gente?
import { readFileSync } from "node:fs";
const p = JSON.parse(readFileSync(process.argv[2]!, "utf8"));
const { avaliarCasoNormal, PISO_DA_TABELA } = await import("./lib/agency/esteira/caminho-automatico.ts");
const { separarValoresInformados } = await import("./lib/agency/execution/piso-de-verdade.ts");
const { lerEscopoDeConteudo } = await import("./lib/agency/execution/escopo-do-cliente.ts");

const req = {
  services: JSON.stringify(p.services ?? []),
  briefingJson: JSON.stringify(p.briefingJson ?? {}),
  rawContext: p.rawContext ?? "",
  chaveDoProspect: p.chaveDoProspect ?? null,
};
console.log("piso da tabela do site: R$", PISO_DA_TABELA);
const scope = p.briefingJson?.scope ?? {};
const { verbas } = separarValoresInformados(scope, req.rawContext);
console.log("verbas que o leitor da casa enxergou:", JSON.stringify(verbas));
console.log("verbas distintas:", JSON.stringify([...new Set(verbas)]));
const esc = lerEscopoDeConteudo({ servicos: p.services ?? [], escopo: JSON.stringify(scope), contextoBruto: req.rawContext });
console.log("pecas por mes legiveis:", esc.pecasPorMes);
console.log("\nVEREDITO:", JSON.stringify(avaliarCasoNormal(req), null, 2));
