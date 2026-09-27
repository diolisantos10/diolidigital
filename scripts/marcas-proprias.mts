// marcas-proprias.mts — GARANTE AS MARCAS PRÓPRIAS DA CASA NO WORKSPACE.
//
// ── O QUE ISTO FAZ, E O QUE NÃO FAZ ──────────────────────────────────────────
//
// Garante que "Sushi Cazza", "Foocci" e "Dioli Digital" existem como `Client`
// no workspace informado, todas nascendo em `modoAprovacao: "APROVACAO_CEO"`
// (o modo mais conservador — ver `lib/agency/esteira/modo-de-aprovacao.ts`).
//
// Foocci e Dioli Digital continuam SEM pacote (`pacoteJson: null`) — ninguém
// inventa quantos posts por semana uma marca produz.
//
// Sushi Cazza (27/09/2026, decisão do CEO) nasce com `PACOTE_SUSHI_CAZZA`
// abaixo: marca SÓ DE STORIES (`formatos: ["stories"]`, sem feed/carrossel/
// Reels), 6 a 8 stories por dia a partir das 18:00 Brasília. Ver
// `lib/agency/esteira/pacote-da-marca.ts` para o contrato completo.
//
// IDEMPOTENTE: busca por NOME (case-insensitive) antes de criar — cria só o
// que falta. NUNCA altera cliente que já existe além de IMPRIMIR o estado
// dele, **com UMA exceção, declarada e só ela**: se a Sushi Cazza JÁ EXISTIR
// e `pacoteJson` estiver NULO, este script PREENCHE o pacote — nunca
// SOBRESCREVE um pacote que já exista (o CEO pode ter editado pela tela, e
// isso não se desfaz por rodar um script de novo). Toda marca (nova ou já
// existente) fora de APROVACAO_CEO, ou com qualquer outro campo já
// configurado, continua intocada.
//
// SQLite não tem `mode: "insensitive"` no Prisma (mesma lição de
// `cliente-do-briefing.ts`) — a busca por nome é feita em memória.
//
// ── USO ───────────────────────────────────────────────────────────────────
//
//   npx tsx scripts/marcas-proprias.mts --workspace <id>                (DRY-RUN — só mede)
//   npx tsx scripts/marcas-proprias.mts --workspace <id> --confirmar    (aplica)
//
// ⛔ NÃO RODE EM PRODUÇÃO SEM ORDEM DO CEO. Sem `--confirmar` o script só lê e
// relata — nunca escreve, mesmo que o workspace seja o de produção.

import { prisma } from "@/lib/db/client";
import { PacoteDaMarcaSchema } from "@/lib/agency/esteira/pacote-da-marca";

const MARCAS_PROPRIAS = ["Sushi Cazza", "Foocci", "Dioli Digital"] as const;

/**
 * O pacote da Sushi Cazza (CEO, 27/09/2026) — marca SÓ DE STORIES. Validado
 * contra `PacoteDaMarcaSchema` antes de qualquer escrita (`validarPacote`,
 * abaixo): se o contrato mudar e este objeto ficar para trás, o script
 * recusa em vez de gravar lixo.
 */
const PACOTE_SUSHI_CAZZA = {
  formatos: ["stories"],
  dias: [0, 1, 2, 3, 4, 5, 6],
  postsPorDia: 0,
  postsPorSemana: 0,
  horarios: [],
  pilares: [
    { nome: "combo", peso: 1 },
    { nome: "produto", peso: 1 },
  ],
  stories: {
    porDiaMin: 6,
    porDiaMax: 8,
    aPartirDe: "18:00",
    intervaloMinimoMin: 30,
    combosMinPorDia: 1,
    mistura: ["combo", "reciclado", "repost"],
  },
};

/** O pacote de cada marca própria — `undefined` = continua sem pacote. */
const PACOTE_POR_MARCA: Partial<Record<(typeof MARCAS_PROPRIAS)[number], unknown>> = {
  "Sushi Cazza": PACOTE_SUSHI_CAZZA,
};

/** Valida o pacote contra o MESMO schema que `lerPacote` usa em produção —
 *  nunca grava um pacote que a própria esteira recusaria ao ler de volta. */
function validarPacote(pacote: unknown): { ok: true; json: string } | { ok: false; motivo: string } {
  const r = PacoteDaMarcaSchema.safeParse(pacote);
  if (!r.success) {
    const primeiro = r.error.issues[0];
    const onde = primeiro?.path?.length ? ` (${primeiro.path.join(".")})` : "";
    return { ok: false, motivo: `pacote inválido${onde}: ${primeiro?.message ?? "formato incorreto"}` };
  }
  return { ok: true, json: JSON.stringify(r.data) };
}

function arg(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function flag(nome: string): boolean {
  return process.argv.includes(`--${nome}`);
}

async function main(): Promise<void> {
  const workspaceId = arg("workspace");
  const confirmar = flag("confirmar");

  if (!workspaceId) {
    console.error('uso: npx tsx scripts/marcas-proprias.mts --workspace <id> [--confirmar]');
    process.exit(1);
  }

  console.log(
    confirmar
      ? `\n⚠️  APLICANDO no workspace ${workspaceId}. NÃO RODE EM PRODUÇÃO SEM ORDEM DO CEO.\n`
      : `\nDRY-RUN — nada será escrito. Rode de novo com --confirmar para aplicar.\n`,
  );

  const workspace = await prisma.agencyWorkspace.findUnique({ where: { id: workspaceId }, select: { id: true, name: true } });
  if (!workspace) {
    console.error(`workspace "${workspaceId}" não encontrado — nada a fazer.`);
    process.exit(1);
  }
  console.log(`workspace: ${workspace.name} (${workspace.id})\n`);

  // Busca em memória: SQLite não tem `mode: "insensitive"` no Prisma.
  const existentes = await prisma.client.findMany({
    where: { workspaceId },
    select: { id: true, name: true, modoAprovacao: true, pacoteJson: true },
  });
  const porNomeMinusculo = new Map(existentes.map((c) => [c.name.trim().toLowerCase(), c]));

  let criadas = 0;
  let jaExistiam = 0;
  let atualizadas = 0;
  let erros = 0;

  for (const nome of MARCAS_PROPRIAS) {
    const achada = porNomeMinusculo.get(nome.trim().toLowerCase());
    const pacoteBruto = PACOTE_POR_MARCA[nome];

    if (achada) {
      // ── A ÚNICA EXCEÇÃO À REGRA "NÃO TOCADO" ────────────────────────────
      // Só preenche o pacote de uma marca já existente quando (a) esta marca
      // TEM pacote definido no script E (b) o pacote GRAVADO está NULO. Marca
      // sem entrada em `PACOTE_POR_MARCA` (Foocci, Dioli Digital) ou já com
      // pacote definido (o CEO editou pela tela) passa direto, intocada.
      if (pacoteBruto !== undefined && !achada.pacoteJson) {
        const validado = validarPacote(pacoteBruto);
        if (!validado.ok) {
          erros++;
          console.error(`! "${nome}" (${achada.id}) — pacote NÃO aplicado: ${validado.motivo}`);
          continue;
        }
        if (!confirmar) {
          atualizadas++;
          console.log(`~ "${nome}" já existe (${achada.id}) SEM pacote — pacote SERIA PREENCHIDO (DRY-RUN).`);
          continue;
        }
        await prisma.client.update({ where: { id: achada.id }, data: { pacoteJson: validado.json } });
        atualizadas++;
        console.log(`~ "${nome}" (${achada.id}) — pacote PREENCHIDO (estava nulo).`);
        continue;
      }

      jaExistiam++;
      console.log(
        `= "${nome}" já existe (${achada.id}) — modoAprovacao="${achada.modoAprovacao}", ` +
          `pacote=${achada.pacoteJson ? "definido" : "(nenhum)"}. NÃO TOCADO.`,
      );
      continue;
    }

    let pacoteJson: string | null = null;
    if (pacoteBruto !== undefined) {
      const validado = validarPacote(pacoteBruto);
      if (!validado.ok) {
        erros++;
        console.error(`! "${nome}" NÃO CRIADA — pacote inválido: ${validado.motivo}`);
        continue;
      }
      pacoteJson = validado.json;
    }

    criadas++;
    if (!confirmar) {
      console.log(
        `+ "${nome}" NÃO EXISTE — seria criada (DRY-RUN, nada gravado), pacote=${pacoteJson ? "definido" : "(nenhum)"}.`,
      );
      continue;
    }

    const novo = await prisma.client.create({
      data: {
        workspaceId,
        name: nome,
        modoAprovacao: "APROVACAO_CEO",
        pacoteJson,
      },
      select: { id: true },
    });
    console.log(`+ "${nome}" CRIADA (${novo.id}) — modoAprovacao="APROVACAO_CEO", pacote=${pacoteJson ? "definido" : "(nenhum)"}.`);
  }

  console.log(
    `\nresumo: ${jaExistiam} já existiam (intocadas) · ${criadas} ${confirmar ? "criada(s)" : "seria(m) criada(s)"} · ` +
      `${atualizadas} ${confirmar ? "com pacote preenchido" : "teriam o pacote preenchido"} · ${erros} erro(s).`,
  );
  if (!confirmar && (criadas > 0 || atualizadas > 0)) {
    console.log("Rode de novo com --confirmar para aplicar.");
  }
  if (erros > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error("erro:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
