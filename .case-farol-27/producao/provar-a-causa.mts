// Isola a causa: o SDR fala em SEMANAS, o leitor da casa só entende MÊS/DIA.
import { readFileSync } from "node:fs";
const { lerEscopoDeConteudo } = await import("./lib/agency/execution/escopo-do-cliente.ts");
const { avaliarCasoNormal } = await import("./lib/agency/esteira/caminho-automatico.ts");
const p = JSON.parse(readFileSync(process.argv[2]!, "utf8"));
const scope = p.briefingJson?.scope ?? {};
const servicos = p.services ?? [];

const casos: [string, string][] = [
  ["como o SDR escreveu (semana)", "3 posts por semana no feed"],
  ["a MESMA coisa dita em mês",    "12 posts por mês no feed"],
  ["a MESMA coisa dita em dia",    "1 post por dia no feed"],
  ["campo estruturado apenas",     ""],
];
for (const [rot, frase] of casos) {
  const r = lerEscopoDeConteudo({ servicos, escopo: JSON.stringify(scope), contextoBruto: frase });
  console.log(`${rot.padEnd(30)} → pecasPorMes = ${String(r.pecasPorMes)}`);
}
console.log(`\nscope.social.postsPerWeek que o SDR capturou = ${JSON.stringify(scope?.social?.postsPerWeek)}`);
console.log(`scope.social.storiesPerWeek                  = ${JSON.stringify(scope?.social?.storiesPerWeek)}`);
console.log(`scope.social.videosPerMonth                  = ${JSON.stringify(scope?.social?.videosPerMonth)}`);

// E o que acontece com o caminho automático se só o volume for consertado:
const req = {
  services: JSON.stringify(servicos),
  briefingJson: JSON.stringify(p.briefingJson ?? {}),
  rawContext: (p.rawContext ?? "") + "\n12 posts por mês no feed",
  chaveDoProspect: p.chaveDoProspect ?? null,
};
console.log("\nSe o volume virar legível, o automático aceita?");
console.log(JSON.stringify(avaliarCasoNormal(req), null, 2));
