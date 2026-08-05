// O RAIO-X NOTURNO — a coleta. Rode com: npm run raio-x
//
// Protocolo obrigatório da companhia (dioli-brain-kit, `16-raio-x-noturno.md`).
// Esta é a METADE 1: código, determinístico, sem IA. A metade 2 é uma sessão do
// Diretor lendo esta saída e escrevendo o relatório do CEO.
//
//   npm run raio-x                      → varre o repositório e grava a noite
//   npm run raio-x -- --dados <url>     → busca também a metade de dados da
//                                         produção (/api/cron/raio-x) e grava
//
// Só escreve em `docs/raio-x/coletas/`. Não toca no banco, não manda mensagem,
// não cria pedido, não chama IA.

import { rodarMetadeDeCodigo, guardarMetadeDeDados, resumir } from "@/lib/raio-x/executar";
import type { Coleta } from "@/lib/raio-x/tipos";

async function main(): Promise<void> {
  const noiteDeCodigo = rodarMetadeDeCodigo();
  console.log(resumir(noiteDeCodigo));
  console.log(`\n(gravado em ${noiteDeCodigo.arquivo})`);

  const i = process.argv.indexOf("--dados");
  const url = i !== -1 ? process.argv[i + 1] : undefined;
  if (!url) return;

  const segredo = process.env.CRON_SECRET;
  if (!segredo) {
    console.log("\nMETADE DE DADOS: NÃO SEI — CRON_SECRET não está definido no ambiente.");
    return;
  }
  try {
    const r = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${segredo}` } });
    if (!r.ok) {
      console.log(`\nMETADE DE DADOS: NÃO SEI — a produção respondeu ${r.status}.`);
      return;
    }
    const coleta = (await r.json()) as Coleta;
    const noiteDeDados = guardarMetadeDeDados(coleta);
    console.log(`\n${resumir(noiteDeDados)}`);
    console.log(`\n(gravado em ${noiteDeDados.arquivo})`);
  } catch (erro) {
    // Produção fora do ar é ausência de informação, não ausência de problema.
    console.log(`\nMETADE DE DADOS: NÃO SEI — ${(erro as Error).message}`);
  }
}

void main();
