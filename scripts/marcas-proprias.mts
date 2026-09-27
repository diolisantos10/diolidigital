// marcas-proprias.mts — GARANTE AS MARCAS PRÓPRIAS DA CASA NO WORKSPACE.
//
// ── O QUE ISTO FAZ, E O QUE NÃO FAZ ──────────────────────────────────────────
//
// Garante que "Sushi Cazza", "Foocci" e "Dioli Digital" existem como `Client`
// no workspace informado, todas nascendo em `modoAprovacao: "APROVACAO_CEO"`
// (o modo mais conservador — ver `lib/agency/esteira/modo-de-aprovacao.ts`).
//
// AS TRÊS AGORA NASCEM COM PACOTE (W12a, 27/09/2026) — `PACOTE_FOOCCI`,
// `PACOTE_DIOLI_DIGITAL` e `PACOTE_SUSHI_CAZZA` abaixo. Nenhum é inventado: é
// o contrato de conteúdo que o CEO descreveu para cada marca própria, e cada
// um passa pelo MESMO `PacoteDaMarcaSchema` que a esteira usa em produção
// (`validarPacote`, abaixo) antes de qualquer escrita.
//
// Sushi Cazza (27/09/2026) é marca SÓ DE STORIES (`formatos: ["stories"]`,
// sem feed/carrossel/Reels), 6 a 8 stories por dia a partir das 18:00
// Brasília, mistura "combo"/"reciclado"/"terceiro_autorizado" (nome novo do
// antigo "repost" — ver o cabeçalho de `pacote-da-marca.ts`) e cardápio vazio
// (o CEO cadastra os combos depois). Foocci (@foocci_) é carrossel + stories
// todo dia da semana. Dioli Digital é duas séries nomeadas ("Radar Dioli
// Tech" às segundas, "Serviço" às quartas/sextas) + 1 story por dia. Ver
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
 *
 * W12a (27/09/2026): "repost" virou "terceiro_autorizado" na mistura (nome
 * novo do mesmo conceito — ver o cabeçalho de `pacote-da-marca.ts`), e o
 * cardápio nasce vazio: o CEO cadastra os combos pela tela depois.
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
    mistura: ["combo", "reciclado", "terceiro_autorizado"],
  },
  cardapio: { combos: [] },
};

/**
 * O pacote da Foocci (@foocci_, CEO, 27/09/2026): carrossel + stories, todo
 * dia da semana. `fontesDeProva: []` — o CEO cadastra a biblioteca de provas
 * depois; até lá, `conferirNumeroComFonte` recusa qualquer número de prova
 * que a IA tente afirmar sem fonte cadastrada.
 */
const PACOTE_FOOCCI = {
  formatos: ["carrossel", "stories"],
  dias: [0, 1, 2, 3, 4, 5, 6],
  postsPorDia: 1,
  postsPorSemana: 7,
  horarios: ["12:00"],
  pilares: [
    { nome: "dor", peso: 1 },
    { nome: "transformação", peso: 1 },
    { nome: "prova", peso: 1 },
  ],
  carrossel: {
    porDia: 1,
    cardsMin: 3,
    cardsMax: 6,
    sequencia: ["dor", "transformacao", "prova", "cta"],
    cta: "Link na bio ou chame no WhatsApp",
    horarioPadrao: "12:00",
    usarHorarioDoDna: true,
  },
  stories: {
    porDiaMin: 2,
    porDiaMax: 2,
    aPartirDe: "12:30",
    intervaloMinimoMin: 30,
    combosMinPorDia: 0,
    mistura: ["reciclado"],
    derivados: ["capa_do_post_do_dia", "reel_do_acervo"],
  },
  fontesDeProva: [],
};

/**
 * O pacote da Dioli Digital (CEO, 27/09/2026): duas séries nomeadas — "Radar
 * Dioli Tech" (segundas, exige fonte) e "Serviço" (quartas e sextas) — mais
 * 1 story por dia. `colaboradores.ativo: false` até o parecer do `meta` (1C)
 * liberar citar conta de terceiro.
 */
const PACOTE_DIOLI_DIGITAL = {
  formatos: ["carrossel", "stories"],
  dias: [1, 3, 5],
  postsPorDia: 1,
  postsPorSemana: 3,
  horarios: ["09:00", "12:00"],
  pilares: [
    { nome: "radar", peso: 1 },
    { nome: "servico", peso: 1 },
  ],
  series: [
    {
      id: "radar",
      nome: "Radar Dioli Tech",
      dias: [1],
      formato: "carrossel",
      cardsMin: 8,
      exigeFonte: true,
      layout: "radar",
      horario: "09:00",
    },
    {
      id: "servico",
      nome: "Serviço",
      dias: [3, 5],
      formato: "carrossel",
      cardsMin: 3,
      cardsMax: 6,
      sequencia: ["dor", "importancia_do_servico", "cta"],
      layout: "servico",
      horario: "12:00",
    },
  ],
  stories: {
    porDiaMin: 1,
    porDiaMax: 1,
    aPartirDe: "12:30",
    intervaloMinimoMin: 30,
    combosMinPorDia: 0,
    mistura: ["reciclado"],
    derivados: ["capa_do_post_do_dia"],
  },
  colaboradores: { ativo: false, contas: [] },
};

/** O pacote de cada marca própria — `undefined` = continua sem pacote. */
const PACOTE_POR_MARCA: Partial<Record<(typeof MARCAS_PROPRIAS)[number], unknown>> = {
  "Sushi Cazza": PACOTE_SUSHI_CAZZA,
  Foocci: PACOTE_FOOCCI,
  "Dioli Digital": PACOTE_DIOLI_DIGITAL,
};

/** Valida o pacote contra o MESMO schema que `lerPacote` usa em produção —
 *  nunca grava um pacote que a própria esteira recusaria ao ler de volta.
 *  Devolve `data` (o objeto já normalizado — ex.: "repost" virado
 *  "terceiro_autorizado") para IMPRESSÃO no dry-run, além do `json` gravável. */
function validarPacote(
  pacote: unknown,
): { ok: true; data: unknown; json: string } | { ok: false; motivo: string } {
  const r = PacoteDaMarcaSchema.safeParse(pacote);
  if (!r.success) {
    const primeiro = r.error.issues[0];
    const onde = primeiro?.path?.length ? ` (${primeiro.path.join(".")})` : "";
    return { ok: false, motivo: `pacote inválido${onde}: ${primeiro?.message ?? "formato incorreto"}` };
  }
  return { ok: true, data: r.data, json: JSON.stringify(r.data) };
}

/** Imprime o pacote (já validado/normalizado) por extenso — o CEO confere no
 *  dry-run ANTES de rodar `--confirmar`. */
function imprimirPacote(nome: string, pacote: unknown): void {
  const linhas = JSON.stringify(pacote, null, 2).split("\n");
  console.log(`  pacote de "${nome}":`);
  for (const linha of linhas) console.log(`    ${linha}`);
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
          imprimirPacote(nome, validado.data);
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
      if (!confirmar && pacoteBruto !== undefined && achada.pacoteJson) {
        const validadoDeReferencia = validarPacote(pacoteBruto);
        if (validadoDeReferencia.ok) {
          console.log(`  (pacote do script — referência, NÃO aplicado: "${nome}" já tem pacote gravado)`);
          imprimirPacote(nome, validadoDeReferencia.data);
        }
      }
      continue;
    }

    let pacoteJson: string | null = null;
    let pacoteData: unknown = null;
    if (pacoteBruto !== undefined) {
      const validado = validarPacote(pacoteBruto);
      if (!validado.ok) {
        erros++;
        console.error(`! "${nome}" NÃO CRIADA — pacote inválido: ${validado.motivo}`);
        continue;
      }
      pacoteJson = validado.json;
      pacoteData = validado.data;
    }

    criadas++;
    if (!confirmar) {
      console.log(
        `+ "${nome}" NÃO EXISTE — seria criada (DRY-RUN, nada gravado), pacote=${pacoteJson ? "definido" : "(nenhum)"}.`,
      );
      if (pacoteData !== null) imprimirPacote(nome, pacoteData);
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
