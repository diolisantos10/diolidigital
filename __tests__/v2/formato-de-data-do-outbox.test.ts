// A TRAVA DO FORMATO DE DATA DO OUTBOX — texto vira número, e no SQLite dois
// formatos de texto não empatam.
//
// MEDIDO neste repositório, com banco real (16/08/2026): `OutboxV2.proximaTentativaEm`
// é coluna `text` (conferido com `typeof()`), então o filtro `lte` do cron
// (app/api/cron/v2/route.ts:30) é comparação LEXICOGRÁFICA, não temporal.
// Dois formatos de texto convivem sem trava nenhuma:
//   - o Prisma Client grava:  2026-08-16T23:01:46.990+00:00   (com a letra T)
//   - SQL cru grava:          2026-08-16 23:01:46             (com ESPAÇO)
// 0x20 (espaço) < 0x54 (T) na tabela ASCII — medido com `SELECT ? < ?`, o
// SQLite devolveu 1. Consequência medida: gravando duas linhas agendadas para
// o MESMO instante, 4 horas no futuro — uma pelo Prisma, outra por SQL cru —
// e rodando a consulta EXATA do cron: a do Prisma fica de fora (correto), a
// gravada com espaço é colhida AGORA, 4 horas adiantada. Qualquer horário do
// mesmo dia no formato com espaço compara como "mais antigo" que qualquer
// horário gravado pelo Prisma — o agendamento simplesmente deixa de valer.
//
// A CADEIA QUE ISSO QUEBRA: `proximaTentativaEm` é o backoff exponencial de
// `processador-outbox.ts` (1min, 2min, 4min... teto 1h, MAX_TENTATIVAS=5). Se
// o agendamento não vale, um efeito que falhou é retentado na batida seguinte
// do cron em vez de esperar — queima as 5 tentativas em minutos e cai na fila
// morta antes da hora. O efeito (mensagem, publicação) morre, e vira item
// parado no painel: exatamente o que o backoff existia para evitar.
//
// POR QUE FICA LATENTE, NÃO VIVO: hoje só o Prisma Client escreve nessas
// colunas em produção — os dois formatos ainda não se encontram. Funciona por
// ACIDENTE, não por mecanismo: o próprio DEFAULT da migration
// (`DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`, em
// `prisma/migrations/20260815180000_v2_nucleo_canonico/migration.sql`) grava
// no formato com espaço sempre que um INSERT cru omitir a coluna. O conserto
// da causa raiz exige migration nova (a aplicada não se reescreve) — por ora
// o que protege é a trava: as três metades abaixo.
//
// ACHADO 16/08/2026, medido com banco real por volta das 20:15 UTC: este
// arquivo usava `new Date()` (o relógio real) para `agora`/`futuro`, e a
// comparação lexicográfica do defeito só aparece quando os dois carimbos
// caem no MESMO DIA. `agora + 4h` cruzou a meia-noite na medição, e a
// diferença do dígito do DIA decidiu a comparação antes de chegar ao
// separador (espaço vs "T") que é o defeito de verdade — a linha crua não
// foi colhida e a METADE (a) ficou VERDE por acidente, não porque o defeito
// tivesse sumido. Por isso os carimbos abaixo agora são literais fixos, e a
// METADE (a) ganhou um caso novo provando exatamente essa fronteira: o
// defeito É intermitente por natureza, não o teste que o mede.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { caminhoDeBancoDescartavel, limparArquivosDoBanco } from "./_infra/banco-descartavel";

const CAMINHO_DB = caminhoDeBancoDescartavel("v2-formato-data");
let db: PrismaClient;

beforeAll(() => {
  limparArquivosDoBanco(CAMINHO_DB);
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: `file:${CAMINHO_DB}` },
    stdio: "pipe",
    timeout: 240_000,
  });
  db = new PrismaClient({ adapter: new PrismaLibSql({ url: `file:${CAMINHO_DB}` }) });
}, 300_000);

afterAll(async () => {
  await db?.$disconnect();
  limparArquivosDoBanco(CAMINHO_DB);
});

/** A consulta EXATA do cron (app/api/cron/v2/route.ts:30) — cópia literal, não paráfrase. */
async function pendentesProntosComoOCron(agora: Date, correlationId: string) {
  return db.outboxV2.findMany({
    where: { status: "pending", proximaTentativaEm: { lte: agora }, correlationId },
    select: { id: true },
  });
}

/** O formato que o DEFAULT `CURRENT_TIMESTAMP` da migration produz num INSERT cru. */
function comoEspaco(d: Date): string {
  return d.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
}

describe("METADE (a) — o defeito medido: SQL cru engana o filtro `lte` do cron", () => {
  it("linha gravada com ESPAÇO no futuro é colhida agora; a do Prisma, no MESMO instante, não é", async () => {
    // Carimbos FIXOS, no MESMO dia — de propósito: a comparação lexicográfica
    // que produz o defeito só se manifesta dentro do mesmo dia (ver ACHADO
    // 16/08/2026 no topo do arquivo). Com `new Date()` este caso ficava
    // VERDE por acidente entre ~20h e meia-noite UTC.
    const agora = new Date("2026-08-16T12:00:00.000Z");
    const futuro = new Date(agora.getTime() + 4 * 60 * 60 * 1000); // 16:00 do MESMO dia — nenhuma das duas deveria ser colhida agora

    await db.$executeRawUnsafe(
      `INSERT INTO "OutboxV2" ("id","tipo","payload","status","tentativas","proximaTentativaEm","chaveIdempotencia","correlationId") VALUES (?,?,?,?,?,?,?,?)`,
      "outbox-cru-futuro",
      "registro_de_teste",
      "{}",
      "pending",
      0,
      comoEspaco(futuro),
      "cru-futuro",
      "c-formato-data",
    );
    await db.outboxV2.create({
      data: {
        id: "outbox-prisma-futuro",
        tipo: "registro_de_teste",
        payload: "{}",
        proximaTentativaEm: futuro,
        chaveIdempotencia: "prisma-futuro",
        correlationId: "c-formato-data",
      },
    });

    const colhidos = await pendentesProntosComoOCron(agora, "c-formato-data");
    const ids = colhidos.map((c) => c.id);

    // O conserto de causa raiz (migration nova, corrigindo o DEFAULT) faz esta
    // linha ficar VERMELHA — e isso é o ESPERADO, não regressão: o defeito
    // deixou de existir e a expectativa aqui precisa se inverter (para
    // `.not.toContain`). Quem consertar a causa raiz meses depois não quebrou
    // nada; inverta este `expect` e apague este comentário.
    expect(ids, "a linha gravada por SQL cru, 4h no futuro, foi colhida agora — o bug medido").toContain(
      "outbox-cru-futuro",
    );
    expect(ids, "a linha gravada pelo Prisma, no MESMO instante futuro, NÃO deveria ser colhida").not.toContain(
      "outbox-prisma-futuro",
    );
  });

  it("quando o agendamento cruza a virada do dia, o defeito SOME — propriedade do defeito, não do teste", async () => {
    // Isto não é o defeito "consertado" — é o defeito MASCARADO, e é PIOR,
    // não melhor: um defeito que desaparece perto da meia-noite e reaparece
    // de manhã é o tipo que ninguém consegue reproduzir quando vai
    // investigar. Mecanismo (ver ACHADO 16/08/2026 no topo do arquivo): a
    // comparação lexicográfica esbarra primeiro no dígito do DIA, que já
    // decide o resultado, e nunca chega ao separador (espaço vs "T") que é
    // o defeito de verdade.
    //
    // E ele fica ativo quase sempre, não raramente: o backoff real do
    // outbox (processador-outbox.ts) vai de 1 minuto a 1 hora, então na
    // esmagadora maioria dos agendamentos `agora` e `futuro` caem no MESMO
    // dia. É só esta janela estreita — perto da virada — que mascara.
    const agora = new Date("2026-08-16T23:00:00.000Z");
    const futuro = new Date(agora.getTime() + 4 * 60 * 60 * 1000); // cruza para 2026-08-17

    await db.$executeRawUnsafe(
      `INSERT INTO "OutboxV2" ("id","tipo","payload","status","tentativas","proximaTentativaEm","chaveIdempotencia","correlationId") VALUES (?,?,?,?,?,?,?,?)`,
      "outbox-cru-futuro-vira-dia",
      "registro_de_teste",
      "{}",
      "pending",
      0,
      comoEspaco(futuro),
      "cru-futuro-vira-dia",
      "c-formato-data-vira-dia",
    );

    const colhidos = await pendentesProntosComoOCron(agora, "c-formato-data-vira-dia");
    const ids = colhidos.map((c) => c.id);

    expect(
      ids,
      "com a virada do dia entre agora e futuro, o dígito do DIA decide a comparação antes do separador — o mesmo defeito medido acima não aparece aqui",
    ).not.toContain("outbox-cru-futuro-vira-dia");
  });
});

describe("METADE (b) — caminho limpo: só o Prisma escrevendo, o agendamento funciona", () => {
  it("item vencido é colhido; item futuro não é — os dois gravados pelo Prisma", async () => {
    // Carimbo FIXO pelo mesmo motivo da METADE (a) — ver ACHADO 16/08/2026 no
    // topo do arquivo. Aqui os dois lados são gravados pelo Prisma (formato
    // consistente), então o risco latente é a mesma virada de dia, só que na
    // direção oposta.
    const agora = new Date("2026-08-16T12:00:00.000Z");
    const vencido = new Date(agora.getTime() - 5 * 60_000);
    const futuro = new Date(agora.getTime() + 4 * 60 * 60 * 1000);

    await db.outboxV2.create({
      data: {
        id: "outbox-prisma-vencido",
        tipo: "registro_de_teste",
        payload: "{}",
        proximaTentativaEm: vencido,
        chaveIdempotencia: "prisma-vencido",
        correlationId: "c-formato-data-limpo",
      },
    });
    await db.outboxV2.create({
      data: {
        id: "outbox-prisma-futuro-limpo",
        tipo: "registro_de_teste",
        payload: "{}",
        proximaTentativaEm: futuro,
        chaveIdempotencia: "prisma-futuro-limpo",
        correlationId: "c-formato-data-limpo",
      },
    });

    const colhidos = await pendentesProntosComoOCron(agora, "c-formato-data-limpo");
    const ids = colhidos.map((c) => c.id);

    expect(ids).toContain("outbox-prisma-vencido");
    expect(ids).not.toContain("outbox-prisma-futuro-limpo");
  });
});

describe("METADE (c) — a trava que protege o futuro: SQL cru não toca as tabelas do núcleo V2", () => {
  // Lista de exceções: caminho relativo do arquivo. Vazia por decisão — hoje
  // não existe nenhum caso legítimo. Quem precisar adicionar um escreve o
  // motivo NESTA linha, não silencia o teste por fora dele.
  const EXCECOES: string[] = [];

  const RAIZ = resolve(__dirname, "../..");

  // A regra ERA "SQL cru + coluna de data" e tinha dois furos medidos pelo
  // `qualidade` (16/08/2026): (i) só casava com o nome da tabela ENTRE ASPAS
  // — o estilo vigente nesta casa (lib/integrations/meta/cota-de-anuncios.ts,
  // ritmo-no-banco.ts) escreve `UPDATE MetaAdCota` SEM aspas, e passaria
  // batido; (ii) o mecanismo REAL do defeito medido é um INSERT que OMITE a
  // coluna de data e deixa o `DEFAULT CURRENT_TIMESTAMP` da migration gravar
  // o formato errado — um INSERT que omite a coluna não cita o nome dela em
  // lugar nenhum, então a regra era cega exatamente para o caso que a
  // originou. O conserto: nestas tabelas a data está SEMPRE envolvida — ou
  // explícita, ou pelo DEFAULT que dispara quando a coluna é omitida — então
  // qualquer SQL cru que TOQUE a tabela já é suspeito, sem precisar adivinhar
  // se a data foi citada.
  const TABELAS_NUCLEO_V2 = ["OutboxV2", "HeartbeatDoRelogio", "FlagV2", "ReconciliacaoV2", "ExecucaoV2"];

  // Fronteira de palavra (`\b`) para "OutboxV2" não casar dentro de
  // "OutboxV2Antigo", e sensível a maiúsculas para não casar dentro de um
  // identificador do Prisma Client como `prisma.outboxV2` (inicial
  // minúscula) — o alvo é o SQL cru, não a chamada tipada. Aspas duplas ao
  // redor do nome, quando existem, ficam fora da fronteira de palavra e não
  // atrapalham o casamento.
  const PADROES_DE_TABELA = TABELAS_NUCLEO_V2.map((tabela) => ({
    tabela,
    padrao: new RegExp(`\\b${tabela}\\b`),
  }));

  function arquivosFonte(dir: string, acc: string[] = []): string[] {
    for (const nome of readdirSync(dir)) {
      if (nome === "generated") continue; // código GERADO pelo Prisma — o defeito não nasce ali
      const caminho = join(dir, nome);
      const info = statSync(caminho);
      if (info.isDirectory()) arquivosFonte(caminho, acc);
      else if (/\.(ts|tsx|mts|mjs)$/.test(nome)) acc.push(caminho);
    }
    return acc;
  }

  // `scripts/` entra na varredura: 14+ scripts usam PrismaClient e podem
  // escrever no banco — nenhum toca as tabelas V2 hoje, mas o ponto cego era
  // estrutural, não uma lacuna medida. `__tests__/` fica de fora de propósito:
  // os próprios testes desta suíte (a METADE (a) acima) precisam de SQL cru
  // contra estas tabelas para medir o defeito.
  const ARQUIVOS = [
    ...arquivosFonte(resolve(RAIZ, "app")),
    ...arquivosFonte(resolve(RAIZ, "lib")),
    ...arquivosFonte(resolve(RAIZ, "scripts")),
  ].filter((a) => !EXCECOES.includes(a.replace(`${RAIZ}/`, "")));

  it("achou arquivos para varrer (senão o teste passa por estar cego, não por estar limpo)", () => {
    // 680 fica acima da contagem de app/+lib/ sozinhos (~654 medido em
    // 16/08/2026): prova que scripts/ de fato entrou na varredura, não só que
    // o diretório existe.
    expect(ARQUIVOS.length).toBeGreaterThan(680);
  });

  it("nenhum SQL cru toca OutboxV2, HeartbeatDoRelogio, FlagV2, ReconciliacaoV2 ou ExecucaoV2", () => {
    // `$queryRaw` (template tag, sem "Unsafe") entra na lista de verbos
    // vigiados: o `qualidade` apontou que só a forma Unsafe de queryRaw
    // estava coberta, mas `$queryRaw` com template tag também roda
    // INSERT/UPDATE, não só SELECT.
    const VERBO_CRU = /\$executeRawUnsafe|\$executeRaw(?!Unsafe)|\$queryRawUnsafe|\$queryRaw(?!Unsafe)/g;

    // Raio da janela ao redor da chamada: o SQL cru desta casa é escrito
    // inline no próprio call site (medido em lib/integrations/meta/) — 1200
    // caracteres para cada lado cobre statements maiores sem precisar ler o
    // arquivo inteiro, o que acusaria menções à tabela sem relação com esta
    // chamada. É heurística, não prova; aceitável porque o padrão observado
    // nesta casa é SQL cru curto e local ao verbo.
    const RAIO_DA_JANELA = 1200;

    const culpados: string[] = [];

    for (const arquivo of ARQUIVOS) {
      const texto = readFileSync(arquivo, "utf8");
      let m: RegExpExecArray | null;
      VERBO_CRU.lastIndex = 0;
      while ((m = VERBO_CRU.exec(texto))) {
        const janela = texto.slice(Math.max(0, m.index - RAIO_DA_JANELA), m.index + RAIO_DA_JANELA);
        for (const { tabela, padrao } of PADROES_DE_TABELA) {
          if (padrao.test(janela)) {
            culpados.push(`${arquivo.replace(`${RAIZ}/`, "")}: SQL cru perto de "${tabela}"`);
          }
        }
      }
    }

    expect(culpados).toEqual([]);
  });
});
