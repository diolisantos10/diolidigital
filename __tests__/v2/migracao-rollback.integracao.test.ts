// O ENSAIO GERAL DA MIGRAÇÃO — banco real, dados sintéticos, rollback provado.
//
// Gate do Marco 3: "reconciliação sem perda e rollback demonstrado". Este
// teste faz o caminho INTEIRO num SQLite descartável (determinação do CEO:
// dados sintéticos, ambiente controlado):
//
//   migrations completas → semeia posts sintéticos → flag desligada = nada
//   escreve → liga flag → backfill → reconciliação zero-divergência →
//   DESLIGA a flag (o rollback) → comportamento volta ao legado e NENHUM
//   dado legado mudou.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { backfillDeEntidade, type ArmazemDeBackfill } from "@/lib/agency/estados-v2/backfill";
import { derivarDeSocialPost } from "@/lib/agency/estados-v2/derivar";
import { reconciliar } from "@/lib/agency/estados-v2/leitura-dupla";
import { flagLigada, FLAGS_V2, type ArmazemDeFlags } from "@/lib/agency/flags-v2/flags";
import { caminhoDeBancoDescartavel, limparArquivosDoBanco } from "./_infra/banco-descartavel";

// Caminho ÚNICO por processo — ver `_infra/banco-descartavel.ts`: um caminho
// fixo em /tmp colide entre sessões de agente diferentes rodando `npm test`
// na mesma máquina ao mesmo tempo.
const CAMINHO_DB = caminhoDeBancoDescartavel("v2-ensaio-geral");
let prisma: PrismaClient;

function armazemDeFlagsNoBanco(): ArmazemDeFlags {
  return {
    async buscar(chave, escopos) {
      const linhas = await prisma.flagV2.findMany({ where: { chave, escopo: { in: escopos } } });
      return linhas.map((l) => ({ chave: l.chave, escopo: l.escopo, ligada: l.ligada }));
    },
  };
}

function armazemDeBackfillNoBanco(): ArmazemDeBackfill {
  return {
    async listar(_tipo, lote, cursor) {
      const posts = await prisma.socialPost.findMany({
        take: lote,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: "asc" },
      });
      return posts.map((p) => ({ id: p.id, estadoCanonico: p.estadoCanonico, legado: { status: p.status } }));
    },
    async gravarEstado(_tipo, id, estado) {
      await prisma.socialPost.update({ where: { id }, data: { estadoCanonico: estado } });
    },
  };
}

const derivador = (legado: Record<string, unknown>) => derivarDeSocialPost(legado as { status: string });

beforeAll(() => {
  limparArquivosDoBanco(CAMINHO_DB);
  execSync(`npx prisma migrate deploy`, {
    env: { ...process.env, DATABASE_URL: `file:${CAMINHO_DB}` },
    stdio: "pipe",
    timeout: 240_000,
  });
  prisma = new PrismaClient({ adapter: new PrismaLibSql({ url: `file:${CAMINHO_DB}` }) });
}, 300_000);

afterAll(async () => {
  await prisma?.$disconnect();
  limparArquivosDoBanco(CAMINHO_DB);
});

describe("ensaio geral: migração aditiva → backfill → reconciliação → rollback", () => {
  it("faz o caminho inteiro sem perder um byte do legado", async () => {
    // 1. SEMEIA dados sintéticos — nenhum dado real de cliente entra aqui.
    await prisma.socialPost.createMany({
      data: [
        { id: "sint-1", workspaceId: "ws-sintetico", status: "draft", caption: "peça sintética 1" },
        { id: "sint-2", workspaceId: "ws-sintetico", status: "scheduled", caption: "peça sintética 2" },
        { id: "sint-3", workspaceId: "ws-sintetico", status: "published", caption: "peça sintética 3" },
      ],
    });
    const legadoAntes = await prisma.socialPost.findMany({ orderBy: { id: "asc" } });

    // 2. FLAG DESLIGADA por padrão — a escrita nova não acontece sem decisão.
    const flags = armazemDeFlagsNoBanco();
    expect(await flagLigada(FLAGS_V2.escrita, ["ws-sintetico"], flags)).toBe(false);

    // 3. LIGA a flag, com procedência (motivo + quem decidiu).
    await prisma.flagV2.create({
      data: { chave: FLAGS_V2.escrita, escopo: "ws-sintetico", ligada: true, motivo: "ensaio geral do M3", decididoPor: "arquiteto-v2" },
    });
    expect(await flagLigada(FLAGS_V2.escrita, ["ws-sintetico"], flags)).toBe(true);

    // 4. BACKFILL — e a segunda rodada prova a idempotência no banco real.
    const r1 = await backfillDeEntidade("SocialPost", derivador, armazemDeBackfillNoBanco());
    expect(r1).toMatchObject({ total: 3, atualizados: 3, semDerivacao: 0 });
    const r2 = await backfillDeEntidade("SocialPost", derivador, armazemDeBackfillNoBanco());
    expect(r2).toMatchObject({ total: 3, atualizados: 0, jaCorretos: 3 });

    // 5. LEITURA DUPLA e reconciliação: zero divergência, gravada como relatório.
    const posts = await prisma.socialPost.findMany({ orderBy: { id: "asc" } });
    const relatorio = reconciliar(
      "SocialPost",
      posts.map((p) => ({ id: p.id, gravado: p.estadoCanonico, derivado: derivador({ status: p.status }) })),
    );
    expect(relatorio.veredito).toBe("promovivel");
    await prisma.reconciliacaoV2.create({
      data: {
        entidadeTipo: relatorio.entidadeTipo,
        total: relatorio.total,
        divergentes: relatorio.divergentes,
        amostra: JSON.stringify(relatorio.amostra),
        veredito: relatorio.veredito,
      },
    });

    // 6. ROLLBACK: desliga a flag. Comportamento volta ao legado na hora.
    await prisma.flagV2.updateMany({
      where: { chave: FLAGS_V2.escrita, escopo: "ws-sintetico" },
      data: { ligada: false },
    });
    expect(await flagLigada(FLAGS_V2.escrita, ["ws-sintetico"], flags)).toBe(false);

    // 7. A PROVA DO "SEM PERDA": todo campo legado byte a byte igual ao início.
    const legadoDepois = await prisma.socialPost.findMany({ orderBy: { id: "asc" } });
    for (let i = 0; i < legadoAntes.length; i++) {
      const antes = legadoAntes[i]!;
      const depois = legadoDepois[i]!;
      expect(depois.status).toBe(antes.status);
      expect(depois.caption).toBe(antes.caption);
      expect(depois.workspaceId).toBe(antes.workspaceId);
      expect(depois.networks).toBe(antes.networks);
      expect(depois.scheduledFor).toEqual(antes.scheduledFor);
    }
  }, 300_000);

  it("a transição canônica grava rastro auditável e recusa a chave repetida (banco real)", async () => {
    const chave = "transicao-sintetica-1";
    const criar = () =>
      prisma.transicaoDeEstado.create({
        data: {
          entidadeTipo: "SocialPost", entidadeId: "sint-1",
          de: "production", para: "internal_review",
          atorTipo: "ia", atorId: "copywriter",
          motivo: "peça pronta para revisão", origem: "ensaio",
          versaoLida: 0, chaveIdempotencia: chave, correlationId: "c-sintetico",
        },
      });
    await criar();
    await expect(criar()).rejects.toThrow(); // UNIQUE na chave: a mesma transição nunca 2x
    const rastro = await prisma.transicaoDeEstado.findMany({ where: { chaveIdempotencia: chave } });
    expect(rastro).toHaveLength(1);
  });
});
