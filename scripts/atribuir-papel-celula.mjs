// Atribui o papel de uma pessoa na Célula de Prospecção — Node puro, sem
// tsx, sem prisma client, mesmo padrão de scripts/seed-db.mjs (usa
// @libsql/client direto).
//
// Por que este script existe: `lib/agency/celula/papel-do-usuario.ts`
// (`atribuirPapelNaCelula`) é a fonte única da REGRA, mas ela roda dentro do
// servidor Next — precisa de uma sessão HTTP de `master` para ser chamada
// pela rota `app/api/agency/celula/papeis`. Este script é o passo EXPLÍCITO,
// rodado por comando, que dá o primeiro papel a alguém quando ainda não há
// ninguém logado com `master` para usar a tela. NÃO é um atalho que pula a
// regra: ele grava exatamente o mesmo valor, na mesma coluna, e valida contra
// o mesmo conjunto fechado.
//
// Uso:
//   node scripts/atribuir-papel-celula.mjs --email <email> --papel <papel>
//   node scripts/atribuir-papel-celula.mjs --email <email> --papel nenhum   (remove o papel)
//
// Exemplo real (a conta master local):
//   node scripts/atribuir-papel-celula.mjs --email master@dioli.studio --papel gerente_de_atendimento

import { createClient } from "@libsql/client";
import { existsSync } from "node:fs";
import { join } from "node:path";

function carregarEnvLocal() {
  const arquivo = join(process.cwd(), ".env");
  if (!existsSync(arquivo)) return;
  try {
    process.loadEnvFile(arquivo);
  } catch {
    // .env malformado não pode derrubar a execução — mesma postura do seed.
  }
}

/** ⚠️ ESPELHA `RESPONSAVEIS` de `lib/agency/celula/excecoes/tipos.ts`. Este
 *  script é Node puro (sem tsx), então não importa TypeScript — mas o
 *  conjunto tem que continuar EXATAMENTE igual ao de lá. Mudou lá, muda aqui
 *  na mesma sessão. */
const RESPONSAVEIS = ["gerente_de_atendimento", "sdr"];

class RecusaLimpa extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = "RecusaLimpa";
    this.recusaLimpa = true;
  }
}

function lerArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--email") args.email = argv[++i];
    else if (argv[i] === "--papel") args.papel = argv[++i];
  }
  return args;
}

function conferirArgs({ email, papel }) {
  const problemas = [];
  if (!email) problemas.push("faltou --email <email>");
  if (!papel) problemas.push("faltou --papel <gerente_de_atendimento|sdr|nenhum>");
  if (papel && papel !== "nenhum" && !RESPONSAVEIS.includes(papel)) {
    problemas.push(
      `--papel "${papel}" é inválido. Conjunto fechado: ${RESPONSAVEIS.join(", ")}, ou "nenhum" para remover.`,
    );
  }
  if (problemas.length > 0) {
    throw new RecusaLimpa(
      [
        "",
        "✗ Uso inválido — NADA foi escrito.",
        ...problemas.map((p) => `    • ${p}`),
        "",
        "  Uso:",
        "    node scripts/atribuir-papel-celula.mjs --email <email> --papel <gerente_de_atendimento|sdr|nenhum>",
        "",
      ].join("\n"),
    );
  }
}

carregarEnvLocal();

const dbUrl = process.env.DATABASE_URL ?? "file:./dev.db";
const url = dbUrl.startsWith("file:./")
  ? `file:${process.cwd()}/${dbUrl.slice("file:./".length)}`
  : dbUrl;

async function main() {
  const args = lerArgs(process.argv.slice(2));
  conferirArgs(args);
  const papelParaGravar = args.papel === "nenhum" ? null : args.papel;

  const db = createClient({ url });
  try {
    const achado = await db.execute({
      sql: `SELECT id, name, papelNaCelula FROM User WHERE email = ?`,
      args: [args.email],
    });
    if (achado.rows.length === 0) {
      throw new RecusaLimpa(`✗ Nenhum usuário com o e-mail "${args.email}". NADA foi escrito.`);
    }
    const usuario = achado.rows[0];

    await db.execute({
      sql: `UPDATE User SET papelNaCelula = ? WHERE email = ?`,
      args: [papelParaGravar, args.email],
    });

    console.log(
      `✓ ${args.email} (${usuario.name}): papel na Célula "${usuario.papelNaCelula ?? "nenhum"}" → "${papelParaGravar ?? "nenhum"}"`,
    );
  } finally {
    db.close();
  }
}

main().catch((e) => {
  if (e instanceof RecusaLimpa || e?.recusaLimpa) {
    console.error(e.message);
  } else {
    console.error(e);
  }
  process.exitCode = 1;
});
