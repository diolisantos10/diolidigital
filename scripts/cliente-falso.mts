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
// ── `--com-servidor`: sobe um Next de teste só para a porta AUTENTICADA ─────
// É opt-in porque custa ~30s de boot por bateria e a rodada offline não precisa
// dele para nada mais. Sem ele, a régua `porta-autenticada` fica em "não
// coberto" e DIZ o porquê — jamais em "passou". Ver `servidor-de-teste.ts`,
// inclusive as três travas (só loopback, banco descartável, CLIENTE_FALSO=1).
const comServidor = args.includes("--com-servidor");
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
const { subirServidorDeTeste } = await import("../lib/agency/cliente-falso/servidor-de-teste.ts");
const { conferir } = await import("../lib/agency/cliente-falso/verificacoes.ts");
const { placarEmTexto, linhaDoLaco } = await import("../lib/agency/cliente-falso/placar.ts");

// O servidor sobe UMA vez para a bateria inteira: 30s por rodada seria pagar o
// mesmo boot três vezes para medir a mesma porta.
let servidor: { baseUrl: string; parar: () => Promise<void> } | null = null;
if (comServidor) {
  console.log("🌐 subindo um Next de teste em 127.0.0.1 (só loopback) para exercitar a porta autenticada…");
  const r = await subirServidorDeTeste({ databaseUrl: `file:${BANCO}` });
  servidor = r.servidor;
  if (!servidor) {
    // Não é motivo para matar a bateria: o resto continua medível, e a régua
    // da porta vai dizer "não coberto" com este motivo.
    console.log(`⚠️  o servidor de teste não subiu (${r.motivo}) — a porta autenticada fica sem medição`);
  } else {
    console.log(`✅ servidor de teste de pé em ${servidor.baseUrl}`);
  }
}

let quebrouAlguma = false;
let ultimoPlacar = "";
let ultimoJson: Record<string, unknown> | null = null;

// ── POR QUE O RESUMO DE TODAS AS RODADAS, E NÃO SÓ A ÚLTIMA ─────────────────
// O placar gravado é sempre o da ÚLTIMA rodada — e com o SDR de IA no meio, que
// é não-determinístico, a rodada boa do fim apagava a queda da rodada do meio.
// "Três rodadas seguidas limpas" é uma afirmação sobre TODAS elas; guardar só a
// última tornava essa afirmação impossível de provar depois.
const resumoDasRodadas: Record<string, unknown>[] = [];

for (let n = 1; n <= rodadas; n++) {
  const { percurso, tropecos } = await rodarPercurso({ sdrAoVivo: aoVivo, baseUrlDoServidor: servidor?.baseUrl ?? null });
  const achados = conferir(percurso);
  if (achados.some((a) => a.veredito === "quebrou")) quebrouAlguma = true;

  console.log(linhaDoLaco(n, achados, percurso));
  resumoDasRodadas.push({
    rodada: n,
    quebrou: achados.filter((a) => a.veredito === "quebrou").map((a) => a.id),
    naoCoberto: achados.filter((a) => a.veredito === "nao-coberto").map((a) => a.id),
    sdrRespondeu: percurso.respostasDoSdr.filter((r) => r.respondeu).length,
    sdrChamado: percurso.respostasDoSdr.length,
    sdrQuedas: percurso.respostasDoSdr.filter((r) => !r.respondeu).map((r) => r.motivo),
    turnosBarrados: percurso.turnosBarrados.length,
    aprovouViaRota: percurso.aprovacao.viaRota,
    nasceuSemPainel: percurso.aceite.nasceuSozinho,
    pecasAprovadasPeloCliente: percurso.aprovacaoDaPeca.carimboDoCliente,
    projetoId: percurso.esteira.projetoId,
    tarefas: percurso.esteira.tarefas,
  });
  ultimoPlacar = placarEmTexto(achados, percurso, tropecos);

  // ── AS PEÇAS, PARA O DONO LER ────────────────────────────────────────────
  // O CEO pediu para VER o que a esteira produz. O portal do cliente e a tela
  // da agência mostram peça, mas nenhum dos dois alcança o piloto: o banco é
  // descartável e o servidor de teste é só loopback. Então as peças saem em
  // texto, no artefato da rodada. Ver `pecas-em-texto.ts`.
  if (percurso.esteira.projetoId) {
    const { pecasEmTexto } = await import("../lib/agency/cliente-falso/pecas-em-texto.ts");
    writeFileSync(
      resolve(PASTA, "pecas.md"),
      await pecasEmTexto(percurso.esteira.projetoId, percurso.roteiro.nomeDoNegocioNaTela),
      "utf-8",
    );
  }
  ultimoJson = {
    rodada: n, em: new Date().toISOString(), sdrAoVivo: aoVivo,
    achados, tropecos,
    escopoFinal: percurso.escopoFinal, estimativaFinal: percurso.estimativaFinal,
    pedido: percurso.pedido, orcamentoEntregue: percurso.orcamentoEntregue,
    turnos: percurso.turnos.map((t) => ({ numero: t.numero, doCliente: t.doCliente, daCasa: t.daCasa })),
    respostasDoSdr: percurso.respostasDoSdr,
    aprovacao: percurso.aprovacao,
    aceite: percurso.aceite,
    aprovacaoDaPeca: percurso.aprovacaoDaPeca,
    esteira: percurso.esteira,
    turnosBarrados: percurso.turnosBarrados,
    saidasBloqueadas: percurso.saidasBloqueadas,
  };
}

if (servidor) {
  await servidor.parar();
  console.log("🌐 servidor de teste derrubado.");
}

if (ultimoJson) ultimoJson.todasAsRodadas = resumoDasRodadas;

writeFileSync(resolve(PASTA, "placar.md"), ultimoPlacar, "utf-8");
writeFileSync(resolve(PASTA, "placar.json"), JSON.stringify(ultimoJson, null, 2), "utf-8");

console.log("\n" + ultimoPlacar);
console.log(`\n📄 placar em ${resolve(PASTA, "placar.md")}`);
console.log(`🧹 para apagar tudo: npm run cliente-falso -- --limpar`);

// Código de saída é o mecanismo: um laço que sempre sai 0 é um laço que ninguém
// nota quando quebra. Quem julga não pode ser o mesmo que executa.
process.exit(quebrouAlguma ? 1 : 0);
