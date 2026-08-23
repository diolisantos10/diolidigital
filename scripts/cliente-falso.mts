// cliente-falso.mts — o piloto que não cansa.
//
// ─── A ORDEM QUE CRIOU ISTO ─────────────────────────────────────────────────
//
// CEO, 23/08/2026: *"Não vou testar mais, porque não tenho mais tempo nem
// paciência. Você vai criar um agente de teste, um ambiente de teste — pra
// validar o projeto do início ao fim, um projeto fictício. Errou, voltou,
// corrigiu. Teste assistido, automático, de cliente."*
//
// Ele tinha acabado de gastar cinco minutos testando à mão e achado três
// defeitos. Testar à mão não escala. A partir daqui quem faz o piloto é isto.
//
// ─── COMO SE DISPARA ────────────────────────────────────────────────────────
//
//   npm run cliente-falso              # uma rodada, custo ZERO de IA
//   npm run cliente-falso -- --rodadas=3
//   npm run cliente-falso -- --ao-vivo # usa o SDR de IA de verdade (CUSTA)
//
// O placar sai na tela E em `.cliente-falso/placar.md` (para ler) e
// `.cliente-falso/placar.json` (para quem conserta).
//
// Sai com código 1 se qualquer verificação quebrou. Silêncio verde não existe
// aqui: a ferramenta grita.
//
// ─── O AMBIENTE, e por que ele é um arquivo descartável ─────────────────────
//
// Cada rodada cria (ou reusa) `.cliente-falso/teste.db` — um SQLite próprio,
// fora do banco de produção, fora do `prisma/dev.db` da casa. `.cliente-falso/`
// está no `.gitignore` e o `--limpar` apaga o diretório inteiro.
//
// Isto responde às três travas do despacho de uma vez só:
//   • **não toca no pedido real do CEO** — outro arquivo, outro banco, sem
//     `DATABASE_URL` de produção em lugar nenhum deste script;
//   • **dado de teste é reconhecível** — todo pedido nasce com o carimbo
//     `[TESTE]` no nome do negócio e contato em `.invalid`;
//   • **a limpeza não depende de alguém lembrar** — o banco é um arquivo só, e
//     apagá-lo apaga a rodada inteira. Não há linha de teste espalhada para
//     caçar depois.
//
// ─── CUSTO ──────────────────────────────────────────────────────────────────
//
// Sem `--ao-vivo`: **R$ 0,00**. Nenhuma chamada de IA, nenhuma rede.
// Com `--ao-vivo`: 10 turnos × 1 chamada ao Claude Sonnet, teto de 3.000 tokens
// de saída por turno. O número medido de uma rodada é impresso no fim do placar
// quando houver como medir — nunca estimado por chute neste cabeçalho.
//
// ─── A TRAVA DE SAÍDA ───────────────────────────────────────────────────────
//
// `CLIENTE_FALSO=1` é setado AQUI, antes de qualquer import que toque em
// e-mail. Enquanto vale, `lib/email/send.ts` recusa todo envio. É trava de
// código, não recomendação — ver `lib/agency/cliente-falso/trava-de-saida.ts`.

import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

// ⚠️ ORDEM DE LINHA IMPORTA. As duas variáveis abaixo são setadas ANTES dos
// imports dinâmicos lá embaixo. Um `import` estático de qualquer módulo que leia
// `process.env` no topo veria o valor antigo — por isso todo o resto entra por
// `await import()`, depois desta linha.
process.env.CLIENTE_FALSO = "1";

const RAIZ = resolve(import.meta.dirname, "..");
const PASTA = resolve(RAIZ, ".cliente-falso");
const BANCO = resolve(PASTA, "teste.db");

const args = process.argv.slice(2);
const querLimpar = args.includes("--limpar");
const aoVivo = args.includes("--ao-vivo");
const rodadas = Number(args.find((a) => a.startsWith("--rodadas="))?.split("=")[1] ?? 1) || 1;

if (querLimpar) {
  rmSync(PASTA, { recursive: true, force: true });
  console.log("🧹 ambiente do cliente falso apagado — nada de teste sobrou.");
  process.exit(0);
}

// ⛔ A ÚLTIMA TRAVA, e ela é grosseira de propósito: se alguém apontar este
// script para um banco que não seja o descartável, ele não roda. Um percurso
// que grava cliente fictício no banco de produção não é teste, é incidente.
const bancoHerdado = process.env.DATABASE_URL;
if (bancoHerdado && !bancoHerdado.includes(".cliente-falso")) {
  console.error(
    `⛔ DATABASE_URL aponta para fora do ambiente de teste (${bancoHerdado}).\n` +
    `   O cliente falso só roda contra o banco descartável — rode sem DATABASE_URL.`,
  );
  process.exit(2);
}
process.env.DATABASE_URL = `file:${BANCO}`;

mkdirSync(PASTA, { recursive: true });

// O banco nasce da MESMA definição de esquema da produção (`prisma/schema.prisma`).
// Um esquema paralelo escrito à mão daria falso verde no dia em que a produção
// mudasse — o teste continuaria passando contra um banco que não existe mais.
if (!existsSync(BANCO)) {
  console.log("📦 criando o banco descartável do cliente falso…");
  execFileSync("npx", ["prisma", "db", "push", "--accept-data-loss"], {
    cwd: RAIZ, stdio: "inherit", env: { ...process.env, DATABASE_URL: `file:${BANCO}` },
  });
}

const { rodarPercurso } = await import("../lib/agency/cliente-falso/percurso.ts");
const { conferir } = await import("../lib/agency/cliente-falso/verificacoes.ts");
const { placarEmTexto, linhaDoLaco } = await import("../lib/agency/cliente-falso/placar.ts");

let quebrouAlguma = false;
let ultimoPlacar = "";
let ultimoJson: unknown = null;

for (let n = 1; n <= rodadas; n++) {
  const { percurso, tropecos } = await rodarPercurso({ sdrAoVivo: aoVivo });
  const achados = conferir(percurso);
  if (achados.some((a) => a.veredito === "quebrou")) quebrouAlguma = true;

  console.log(linhaDoLaco(n, achados));
  ultimoPlacar = placarEmTexto(achados, percurso, tropecos);
  ultimoJson = {
    rodada: n, em: new Date().toISOString(), sdrAoVivo: aoVivo,
    achados, tropecos,
    escopoFinal: percurso.escopoFinal, estimativaFinal: percurso.estimativaFinal,
    pedido: percurso.pedido, orcamentoEntregue: percurso.orcamentoEntregue,
    turnos: percurso.turnos.map((t) => ({ numero: t.numero, doCliente: t.doCliente, daCasa: t.daCasa })),
    saidasBloqueadas: percurso.saidasBloqueadas,
  };
}

writeFileSync(resolve(PASTA, "placar.md"), ultimoPlacar, "utf-8");
writeFileSync(resolve(PASTA, "placar.json"), JSON.stringify(ultimoJson, null, 2), "utf-8");

console.log("\n" + ultimoPlacar);
console.log(`\n📄 placar em ${resolve(PASTA, "placar.md")}`);
console.log(`🧹 para apagar tudo: npm run cliente-falso -- --limpar`);

// Código de saída é o mecanismo: um laço que sempre sai 0 é um laço que ninguém
// nota quando quebra. Quem julga não pode ser o mesmo que executa.
process.exit(quebrouAlguma ? 1 : 0);
