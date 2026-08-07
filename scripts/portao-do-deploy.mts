/**
 * O portão do deploy — ver e operar.
 *
 *     npm run portao            # mostra o estado (não muda nada)
 *     npm run portao -- --ligar # liga "só sobe com CI verde"
 *
 * Desligar de propósito NÃO tem comando aqui. Quem precisa subir com a CI fora
 * usa a porta de emergência (`npm run deploy:emergencia`), que registra quem,
 * quando e por quê. Um `--desligar` cômodo seria o atalho pelo qual o portão
 * some sem ninguém saber.
 *
 * Precisa de RAILWAY_TOKEN no ambiente. O token nunca é impresso.
 */

import { ajustarPortao, lerAutodeploy, lerPortao, ultimasImplantacoes } from "../lib/plataforma/railway-portao.ts";

async function main(): Promise<void> {
  const ligar = process.argv.includes("--ligar");

  let portao = await lerPortao();
  if (ligar && !portao.esperaPelaCI) {
    console.log("Ligando o portão (Wait for CI)…");
    portao = await ajustarPortao(portao.triggerId, true);
  }

  const auto = await lerAutodeploy().catch(() => null);
  const impl = await ultimasImplantacoes(5).catch(() => []);

  console.log("");
  console.log(portao.esperaPelaCI ? "✅ Portão LIGADO — produção só recebe commit com CI verde." : "🚨 Portão DESLIGADO — todo push vai para produção sem olhar a CI.");
  console.log("");
  console.log(`   repositório ......... ${portao.repositorio}`);
  console.log(`   branch de produção .. ${portao.branch}`);
  console.log(`   espera pela CI ...... ${portao.esperaPelaCI ? "sim" : "NÃO"}`);
  console.log(`   workflows de portão . ${portao.workflowsReconhecidos}`);
  if (auto) console.log(`   autodeploy .......... ${auto.ligado ? "ligado" : "DESLIGADO"}`);
  if (impl.length) {
    console.log("");
    console.log("   últimas implantações:");
    for (const d of impl) console.log(`     ${d.criadaEm}  ${d.status}`);
  }
  console.log("");

  // Portão que o Railway não tem workflow para esperar é portão que aprova
  // tudo. Isso precisa ser vermelho, não uma linha a mais no relatório.
  if (portao.esperaPelaCI && portao.workflowsReconhecidos < 1) {
    console.error("🚨 O portão está ligado mas o Railway não reconhece NENHUM workflow de portão.");
    console.error("   Nesse estado ele não tem o que esperar. Conferir `on: push: branches:` em .github/workflows/ci.yml.");
    process.exit(1);
  }

  process.exit(portao.esperaPelaCI ? 0 : 1);
}

void main().catch((e: unknown) => {
  console.error(`Falhou: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
