// A TRAVA: `prisma/schema.prisma` e `lib/generated/prisma/models/**` são DUAS
// fontes da mesma verdade, e já divergiram em silêncio uma vez (16/08/2026).
//
// `avisoOrcamentoStatus` existia no schema e na migration
// `20260816130000_aviso_de_orcamento_que_falha`, e tinha ZERO ocorrências no
// cliente Prisma gerado — alguém regenerou o cliente depois de uma migration
// e não depois da outra. O acesso de produção àqueles campos é por SQL cru
// (`lib/agency/esteira/orcamento-do-briefing.ts:366,673`), que não passa pelo
// tipo — então a função de produção funcionava, e o próximo a usar o cliente
// TIPADO para os mesmos campos quebraria em runtime sem aviso nenhum. Peça
// verde, junta rompida.
//
// A régua (pura, sem I/O) mora em `lib/plataforma/cliente-gerado.ts` — ela
// mesma documenta, em detalhe, o que NÃO cobre. Este arquivo prova por
// MUTAÇÃO que ela pega o caso real, prova que ela não inventa problema onde
// não há, e — o teste que importa de verdade — roda contra os arquivos REAIS
// do repositório, porque é esse o teste que teria pegado o defeito de hoje.
//
// Por que aqui, e não no gancho de sessão nem no `encerrar` da reivindicação:
// o sentinela da reivindicação já roda em `npm test`, a casa já aceita esse
// lugar, ele roda no CI (barra o merge) e na máquina de quem trabalha, e não
// depende de rede nem de `git` — só de ler dois arquivos locais. O conserto,
// quando ela acusa, é uma linha: `npx prisma generate`.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { camposDoSchema, camposAusentesNoCliente } from "@/lib/plataforma/cliente-gerado";

const RAIZ = resolve(__dirname, "../..");

describe("⛔ cliente Prisma gerado não pode ficar atrás do schema", () => {
  describe("prova por mutação — o caso real replantado em memória", () => {
    // Exatamente o incidente de hoje: `avisoOrcamentoStatus` está no schema,
    // e o texto do "cliente gerado" (montado à mão aqui, sem tocar disco)
    // simplesmente não o menciona em lugar nenhum.
    const SCHEMA_COM_CAMPO_NOVO = `
model ClientRequestDb {
  id              String   @id @default(cuid())
  businessName    String
  chaveDoProspect String?
  avisoOrcamentoStatus   String?
  avisoOrcamentoDetalhe  String?
}
`;

    const CLIENTE_DESATUALIZADO = `
export type ClientRequestDbMinAggregateOutputType = {
  id: string | null
  businessName: string | null
  chaveDoProspect: string | null
}

export type ClientRequestDbWhereInput = {
  id?: Prisma.StringFilter<"ClientRequestDb"> | string
  businessName?: Prisma.StringFilter<"ClientRequestDb"> | string
  chaveDoProspect?: Prisma.StringNullableFilter<"ClientRequestDb"> | string | null
}
`;

    it("acusa, e NOMEIA o campo ausente", () => {
      const campos = camposDoSchema(SCHEMA_COM_CAMPO_NOVO).get("ClientRequestDb")!;
      const ausentes = camposAusentesNoCliente(campos, CLIENTE_DESATUALIZADO);

      expect(ausentes).toContain("avisoOrcamentoStatus");
      expect(ausentes).toContain("avisoOrcamentoDetalhe");
      // E não acusa os campos que o cliente desatualizado JÁ tem.
      expect(ausentes).not.toContain("id");
      expect(ausentes).not.toContain("businessName");
      expect(ausentes).not.toContain("chaveDoProspect");
    });

    it("regenerar o cliente (a linha `npx prisma generate`) faz a acusação sumir", () => {
      const CLIENTE_EM_DIA = `
export type ClientRequestDbMinAggregateOutputType = {
  id: string | null
  businessName: string | null
  chaveDoProspect: string | null
  avisoOrcamentoStatus: string | null
  avisoOrcamentoDetalhe: string | null
}
`;
      const campos = camposDoSchema(SCHEMA_COM_CAMPO_NOVO).get("ClientRequestDb")!;
      expect(camposAusentesNoCliente(campos, CLIENTE_EM_DIA)).toEqual([]);
    });
  });

  describe("✅ a metade que não pode virar 'reprova sempre' — caso limpo não inventa problema", () => {
    it("schema e cliente em dia → nenhuma acusação", () => {
      const schema = `
model Client {
  id   String @id
  name String
}
`;
      const cliente = `
export type ClientWhereInput = {
  id?: Prisma.StringFilter<"Client"> | string
  name?: Prisma.StringFilter<"Client"> | string
}
`;
      const campos = camposDoSchema(schema).get("Client")!;
      expect(campos.sort()).toEqual(["id", "name"]);
      expect(camposAusentesNoCliente(campos, cliente)).toEqual([]);
    });

    it("campo de relação não vira campo escalar (e não gera falso positivo)", () => {
      const schema = `
model AgencyWorkspace {
  id    String @id
  name  String
  users User[]
}

model User {
  id          String          @id
  workspaceId String
  workspace   AgencyWorkspace @relation(fields: [workspaceId], references: [id])
}
`;
      const campos = camposDoSchema(schema);
      // `users` (tipo User[]) e `workspace` (tipo AgencyWorkspace) são
      // relação — não aparecem como campo escalar do model.
      expect(campos.get("AgencyWorkspace")).toEqual(["id", "name"]);
      expect(campos.get("User")).toEqual(["id", "workspaceId"]);
    });

    it("atributo de bloco (@@index, @@unique, @@map) não vira campo", () => {
      const schema = `
model EmailDoRadar {
  id          String @id
  mensagemId  String

  @@index([mensagemId])
  @@unique([id, mensagemId])
  @@map("email_do_radar")
}
`;
      const campos = camposDoSchema(schema).get("EmailDoRadar")!;
      expect(campos.sort()).toEqual(["id", "mensagemId"]);
    });

    it("comentário parecido com campo não conta", () => {
      const schema = `
model Client {
  id   String @id
  /// Só documentação — cita \`avisoOrcamentoStatus\` e \`chaveDoProspect\`
  /// como exemplo de outro model, mas isto NÃO é um campo daqui.
  // avisoOrcamentoStatus String?
  name String
}
`;
      const campos = camposDoSchema(schema).get("Client")!;
      expect(campos.sort()).toEqual(["id", "name"]);
      expect(campos).not.toContain("avisoOrcamentoStatus");
      expect(campos).not.toContain("chaveDoProspect");
    });
  });

  describe("🔑 a trava DE VERDADE — contra os arquivos reais do repositório", () => {
    // Este é o teste que roda no CI e que teria reprovado ANTES de o cliente
    // ter sido regenerado hoje. Hoje o cliente está em dia — então ele passa
    // — mas ele lê os arquivos de verdade, não texto plantado em memória.
    it("todo campo escalar do schema existe no cliente Prisma gerado", () => {
      const schema = readFileSync(resolve(RAIZ, "prisma/schema.prisma"), "utf8");
      const camposPorModelo = camposDoSchema(schema);
      const DIR_MODELOS = resolve(RAIZ, "lib/generated/prisma/models");
      const arquivosGerados = new Set(readdirSync(DIR_MODELOS));

      const problemas: string[] = [];

      for (const [modelo, campos] of camposPorModelo) {
        const arquivo = `${modelo}.ts`;
        if (!arquivosGerados.has(arquivo)) {
          // Modelo sem arquivo gerado é outro problema (cliente não
          // regenerado de jeito nenhum) — acusa nomeando o model, não os
          // campos individuais.
          problemas.push(`${modelo}: nenhum arquivo lib/generated/prisma/models/${arquivo}`);
          continue;
        }
        const textoDoModeloGerado = readFileSync(join(DIR_MODELOS, arquivo), "utf8");
        const ausentes = camposAusentesNoCliente(campos, textoDoModeloGerado);
        if (ausentes.length > 0) {
          problemas.push(`${modelo}: ${ausentes.join(", ")}`);
        }
      }

      expect(
        problemas,
        problemas.length === 0
          ? ""
          : `O cliente Prisma gerado está ATRÁS do schema nestes campos:\n` +
            problemas.map((p) => `  · ${p}`).join("\n") +
            `\n\nConserto: \`npx prisma generate\`. Quem usar o cliente TIPADO para\n` +
            `estes campos vai quebrar em runtime, mesmo com \`tsc\` verde — o\n` +
            `mesmo defeito de 16/08/2026 (avisoOrcamentoStatus, 0 ocorrências).`,
      ).toEqual([]);
    });

    it("✅ a metade que não pode virar 'reprova sempre': achou modelos e campos de verdade", () => {
      const schema = readFileSync(resolve(RAIZ, "prisma/schema.prisma"), "utf8");
      const camposPorModelo = camposDoSchema(schema);

      // Um regex quebrado devolveria um Map vazio e o teste acima passaria
      // sem checar nada — esta metade garante que isso não aconteceu.
      expect(camposPorModelo.size).toBeGreaterThan(20);
      expect(camposPorModelo.get("ClientRequestDb")).toContain("avisoOrcamentoStatus");
      expect(camposPorModelo.get("ClientRequestDb")).toContain("avisoOrcamentoDetalhe");
      expect(camposPorModelo.get("ClientRequestDb")).toContain("chaveDoProspect");
      // E a relação de ClientRequestDb.artifacts (tipo BrainArtifact[]) NÃO
      // aparece — se aparecesse, seria o falso positivo que a régua promete
      // não cometer.
      expect(camposPorModelo.get("ClientRequestDb")).not.toContain("artifacts");
    });
  });
});
