// O CONTATO GANHOU COLUNA — as duas direções, contra BANCO DE VERDADE.
//
// ── POR QUE ESTE ARQUIVO EXISTE (16/08/2026) ────────────────────────────────
//
// Em 08/08 o briefing público passou a EXIGIR contato, e o dado ficou onde
// estava: dentro de `briefingJson`, um blob de texto. O preço foi escrito junto,
// em `docs/pendencias.md`: **"enquanto não for coluna, não dá para filtrar nem
// indexar por contato no banco"**. O aviso do orçamento precisa exatamente
// disso — perguntar ao banco "quais pedidos parados têm para onde responder?".
//
// ── AS TRÊS DIREÇÕES, E A TERCEIRA É A QUE MAIS DÓI SE QUEBRAR ─────────────
//
//  ✅ COM contato  → o pedido tem contato NA COLUNA e `temComoFalar` é `true`.
//  ⛔ SEM contato  → o pedido ENTRA IGUAL, grava `lead_incompleto`, e as colunas
//                    ficam nulas. Sem contato nunca foi descarte.
//  🔑 REGISTRO ANTIGO → contato só no `briefingJson`, colunas nulas, e
//                    `lerContato` continua achando. Os leads que já estão em
//                    produção não podem regredir por causa de uma coluna nova.
//
// ⚠️ NOMES FICTÍCIOS DE PROPÓSITO. Os leads reais desta casa (os três de 08/08)
// são pessoas com telefone e negócio de verdade; dado real de cliente não entra
// em fixture de teste, nem em repositório, nem em log.

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";

// O caminho do banco precisa estar no ambiente ANTES de qualquer import ser
// avaliado — o cliente Prisma lê DATABASE_URL na criação.
const DB_PATH = vi.hoisted(() => {
  const caminho = `${process.cwd()}/prisma/coluna-de-contato-e2e.db`;
  process.env.DATABASE_URL = `file:${caminho}`;
  return caminho;
});

import { prisma } from "@/lib/db/client";
import {
  createClientRequest,
  updateClientRequest,
  listClientRequests,
} from "@/lib/agency/persistence/client-request-service";
import { lerContato, colunasDeContato } from "@/lib/agency/comercial/contato-do-lead";

let workspaceId = "";

/** Um lead inventado. Nenhum negócio real da casa aparece aqui. */
const PADARIA = {
  businessName: "Padaria Trigo de Ouro",
  segment: "alimentação",
  services: ["social media"],
  objectives: ["vender mais no fim de semana"],
  rawContext: "[Prospect] Quero mais movimento aos sábados. Nosso perfil é o @trigodeouro.",
};

beforeAll(async () => {
  if (existsSync(DB_PATH)) rmSync(DB_PATH);
  execSync("npx prisma db push --accept-data-loss", {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: `file:${DB_PATH}` },
    stdio: "pipe",
  });

  const ws = await prisma.agencyWorkspace.create({
    data: { name: "Dioli Agência", slug: `contato-${Date.now()}` },
  });
  workspaceId = ws.id;
});

afterAll(async () => {
  await prisma.$disconnect().catch(() => {});
  if (existsSync(DB_PATH)) rmSync(DB_PATH);
});

describe("DIREÇÃO 1 — COM contato: ele chega na COLUNA e fica disponível para o aviso", () => {
  it("o WhatsApp declarado vira coluna, normalizada, e `temComoFalar` é true", async () => {
    const criado = await createClientRequest({
      ...PADARIA,
      workspaceId,
      status: "new",
      briefingJson: {
        scope: { businessName: PADARIA.businessName },
        contato: { nome: "Marcos", whatsapp: "(11) 97777-1234", email: null, informadoEm: "2026-08-16T10:00:00.000Z" },
      },
    });

    // A COLUNA, lida direto do banco — não o objeto devolvido pelo serviço.
    const linha = await prisma.clientRequestDb.findUniqueOrThrow({ where: { id: criado.id } });
    expect(linha.contatoWhatsapp).toBe("11977771234"); // só dígitos: máscara é assunto de tela
    expect(linha.contatoNome).toBe("Marcos");
    expect(linha.contatoEmail).toBeNull();
    expect(linha.contatoEm).toBeInstanceOf(Date);

    expect(lerContato(linha).temComoFalar).toBe(true);
  });

  it("o e-mail declarado vira coluna, e a data de declaração é a da PESSOA, não a da gravação", async () => {
    const criado = await createClientRequest({
      ...PADARIA,
      businessName: "Studio Vitrine",
      workspaceId,
      status: "new",
      briefingJson: {
        contato: { nome: "Helena", email: "helena@studiovitrine.com.br", whatsapp: null, informadoEm: "2026-08-14T09:30:00.000Z" },
      },
    });
    const linha = await prisma.clientRequestDb.findUniqueOrThrow({ where: { id: criado.id } });
    expect(linha.contatoEmail).toBe("helena@studiovitrine.com.br");
    expect(linha.contatoEm?.toISOString()).toBe("2026-08-14T09:30:00.000Z");
  });

  it("🔑 O FILTRO NO BANCO — é isto que a coluna destravou e o blob não permitia", async () => {
    const comCanal = await listClientRequests({ workspaceId, comContato: true, limit: 500 });
    const semCanal = await listClientRequests({ workspaceId, comContato: false, limit: 500 });

    // Quem tem canal aparece de um lado e NUNCA do outro. Somar as duas filas num
    // número só produz um alarme que ninguém sabe atender.
    expect(comCanal.length).toBeGreaterThan(0);
    for (const r of comCanal) expect(lerContato(r).temComoFalar).toBe(true);
    for (const r of semCanal) {
      expect(r.contatoEmail).toBeNull();
      expect(r.contatoWhatsapp).toBeNull();
    }
    const idsComCanal = new Set(comCanal.map((r) => r.id));
    expect(semCanal.some((r) => idsComCanal.has(r.id))).toBe(false);
  });

  it("corrigir o briefing REPROJETA a coluna — cache velho de contato manda a proposta para o endereço errado", async () => {
    const criado = await createClientRequest({
      ...PADARIA,
      businessName: "Bicicletaria Roda Viva",
      workspaceId,
      status: "new",
      briefingJson: { contato: { nome: "Rui", email: "rui@antigo.com.br", whatsapp: null, informadoEm: "2026-08-16T10:00:00.000Z" } },
    });
    await updateClientRequest(criado.id, {
      briefingJson: { contato: { nome: "Rui", email: "rui@novo.com.br", whatsapp: null, informadoEm: "2026-08-16T11:00:00.000Z" } },
    });
    const linha = await prisma.clientRequestDb.findUniqueOrThrow({ where: { id: criado.id } });
    expect(linha.contatoEmail).toBe("rui@novo.com.br");
  });

  it("⛔ um PATCH que só toca no handoff NÃO apaga o contato que mora no briefing", async () => {
    const criado = await createClientRequest({
      ...PADARIA,
      businessName: "Ateliê Ponto Certo",
      workspaceId,
      status: "new",
      briefingJson: { contato: { nome: "Sara", whatsapp: "11966665555", email: null, informadoEm: "2026-08-16T10:00:00.000Z" } },
    });
    await updateClientRequest(criado.id, { sdrHandoffJson: { resumo: "qualificado" } });
    const linha = await prisma.clientRequestDb.findUniqueOrThrow({ where: { id: criado.id } });
    expect(linha.contatoWhatsapp).toBe("11966665555");
  });
});

describe("DIREÇÃO 2 — SEM contato: o pedido ENTRA IGUAL e a coluna fica nula", () => {
  it("grava `lead_incompleto`, guarda a conversa inteira, e as quatro colunas ficam nulas", async () => {
    const criado = await createClientRequest({
      ...PADARIA,
      businessName: "Barbearia Fio Novo",
      workspaceId,
      status: "lead_incompleto",
      briefingJson: { scope: { businessName: "Barbearia Fio Novo" }, transcript: [{ role: "user", text: "oi" }] },
    });

    const linha = await prisma.clientRequestDb.findUniqueOrThrow({ where: { id: criado.id } });
    expect(linha.status).toBe("lead_incompleto");
    // O que ele contou NÃO some.
    expect(linha.rawContext).toContain("@trigodeouro");
    expect(linha.briefingJson).toBeTruthy();
    // E não há contato inventado em coluna nenhuma.
    expect(linha.contatoNome).toBeNull();
    expect(linha.contatoEmail).toBeNull();
    expect(linha.contatoWhatsapp).toBeNull();
    expect(linha.contatoEm).toBeNull();
    expect(lerContato(linha).temComoFalar).toBe(false);
  });

  it("🔴 A LEI DO ARQUIVO CONTINUA DE PÉ — a arroba do rawContext não preenche coluna nenhuma", async () => {
    const linhas = await prisma.clientRequestDb.findMany({ where: { businessName: "Barbearia Fio Novo" } });
    for (const l of linhas) {
      expect(l.contatoWhatsapp).toBeNull();
      expect(l.contatoEmail).toBeNull();
    }
  });

  it("NOME SOZINHO não sobe para a coluna — era assim que o desperdício se chamava", async () => {
    const criado = await createClientRequest({
      ...PADARIA,
      businessName: "Escola Passo Firme",
      workspaceId,
      status: "lead_incompleto",
      briefingJson: { scope: { prospectName: "Tadeu" } },
    });
    const linha = await prisma.clientRequestDb.findUniqueOrThrow({ where: { id: criado.id } });
    expect(linha.contatoNome).toBeNull();
    expect(lerContato(linha).nome).toBe("Tadeu"); // o nome não se perde — ele só não é contato
    expect(lerContato(linha).temComoFalar).toBe(false);
  });

  it("contato LIXO não vira coluna: e-mail quebrado e número de 4 dígitos são recusados", async () => {
    const criado = await createClientRequest({
      ...PADARIA,
      businessName: "Mercado Boa Praça",
      workspaceId,
      status: "lead_incompleto",
      briefingJson: { scope: { prospectEmail: "pedro@", prospectPhone: "1500" } },
    });
    const linha = await prisma.clientRequestDb.findUniqueOrThrow({ where: { id: criado.id } });
    expect(linha.contatoEmail).toBeNull();
    expect(linha.contatoWhatsapp).toBeNull();
  });
});

describe("DIREÇÃO 3 — REGISTRO ANTIGO: contato só no blob, e o leitor único continua achando", () => {
  it("🔑 coluna NULA + `briefingJson.contato` preenchido → `temComoFalar` continua true", async () => {
    // O registro é escrito por FORA do serviço, exatamente como ele está hoje no
    // banco de produção: o blob tem o contato e as colunas nem existiam.
    const antigo = await prisma.clientRequestDb.create({
      data: {
        workspaceId,
        businessName: "Clínica Raiz Serena",
        services: "[]",
        objectives: "[]",
        status: "new",
        briefingJson: JSON.stringify({
          contato: { nome: "Ilda", email: "ilda@raizserena.com.br", whatsapp: null, informadoEm: "2026-08-08T12:00:00.000Z" },
        }),
      },
    });

    expect(antigo.contatoEmail).toBeNull(); // a coluna está vazia — é o ponto do teste
    const contato = lerContato(antigo);
    expect(contato.temComoFalar).toBe(true);
    expect(contato.email).toBe("ilda@raizserena.com.br");
  });

  it("🔑 o formato LEGADO (`scope.prospect*`) também continua sendo achado", async () => {
    const antigo = await prisma.clientRequestDb.create({
      data: {
        workspaceId,
        businessName: "Pousada Beira Trilha",
        services: "[]",
        objectives: "[]",
        status: "new",
        briefingJson: JSON.stringify({ scope: { prospectName: "Zeca", prospectPhone: "+55 (11) 95555-4444" } }),
      },
    });
    const contato = lerContato(antigo);
    expect(contato.temComoFalar).toBe(true);
    expect(contato.whatsapp).toBe("5511955554444");
    expect(contato.nome).toBe("Zeca");
  });

  it("⚠️ E A HONESTIDADE SOBRE O LIMITE: o registro antigo NÃO responde ao filtro do banco", async () => {
    // Ele aparece na tela (o leitor único o acha) e não aparece no recorte por
    // coluna. Está declarado no tipo de `listClientRequests` e na resposta da
    // rota (`filtro.apenasColuna`). Fingir o contrário faria alguém confiar num
    // recorte que esconde gente — que é como esta fila ficou invisível por sete
    // semanas.
    const comCanal = await listClientRequests({ workspaceId, comContato: true, limit: 500 });
    expect(comCanal.some((r) => r.businessName === "Clínica Raiz Serena")).toBe(false);

    const tudo = await listClientRequests({ workspaceId, limit: 500 });
    const naFila = tudo.find((r) => r.businessName === "Clínica Raiz Serena");
    expect(naFila).toBeTruthy();
    expect(lerContato(naFila!).temComoFalar).toBe(true);
  });
});

describe("O BACKFILL DA MIGRATION — rodado de verdade, com o SQL que foi enviado", () => {
  // O SQL não é reescrito aqui: ele é LIDO do arquivo da migration. Teste que
  // reproduz a consulta com as próprias mãos prova que o teste funciona, não que
  // a migration funciona — e as duas divergem no primeiro ajuste.
  //
  // Os `UPDATE` são idempotentes por construção (guardados por `IS NULL`), então
  // rodá-los de novo sobre linhas recém-inseridas exercita exatamente o caminho
  // que rodou no deploy.
  async function rodarBackfillDaMigration(): Promise<void> {
    const { readFileSync } = await import("node:fs");
    const sql = readFileSync(
      `${process.cwd()}/prisma/migrations/20260816120000_contato_com_coluna/migration.sql`,
      "utf8",
    );
    const comandos = sql
      .split("\n")
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n")
      .split(";")
      .map((c) => c.trim())
      .filter((c) => c.toUpperCase().startsWith("UPDATE"));

    expect(comandos.length).toBeGreaterThanOrEqual(6); // o arquivo tem que ter backfill
    for (const c of comandos) await prisma.$executeRawUnsafe(c);
  }

  it("✅ sobe o formato canônico e o legado VÁLIDO para a coluna", async () => {
    await prisma.clientRequestDb.create({
      data: {
        workspaceId, businessName: "Floricultura Beija-Flor", services: "[]", objectives: "[]", status: "new",
        briefingJson: JSON.stringify({
          contato: { nome: "Nara", email: "nara@beijaflor.com.br", whatsapp: null, informadoEm: "2026-08-09T08:00:00.000Z" },
        }),
      },
    });
    await prisma.clientRequestDb.create({
      data: {
        workspaceId, businessName: "Oficina Chave Mestra", services: "[]", objectives: "[]", status: "new",
        briefingJson: JSON.stringify({ scope: { prospectName: "Gil", prospectPhone: "+55 (11) 94444-3322" } }),
      },
    });

    await rodarBackfillDaMigration();

    const canonico = await prisma.clientRequestDb.findFirstOrThrow({ where: { businessName: "Floricultura Beija-Flor" } });
    expect(canonico.contatoEmail).toBe("nara@beijaflor.com.br");
    expect(canonico.contatoNome).toBe("Nara");
    expect(canonico.contatoEm).toBeInstanceOf(Date);

    const legado = await prisma.clientRequestDb.findFirstOrThrow({ where: { businessName: "Oficina Chave Mestra" } });
    expect(legado.contatoWhatsapp).toBe("5511944443322"); // máscara removida
    expect(legado.contatoNome).toBe("Gil");
    // A data não é inventada: ninguém sabe quando o Gil declarou o telefone.
    expect(legado.contatoEm).toBeNull();
  });

  it("🔴 CONTATO FORJADO NO `$.contato` NÃO SOBE — a premissa 'válido por construção' era falsa", async () => {
    // O `seguranca` provou com POST observado: a rota pública preservava o
    // `contato` cru do corpo quando ele era inválido. Se o backfill confiasse
    // no formato canônico, este registro apareceria em `?contato=sim` enquanto
    // o dossiê diz "não há para onde responder" — duas verdades adjacentes.
    await prisma.clientRequestDb.create({
      data: {
        workspaceId, businessName: "Serralheria Porta Firme", services: "[]", objectives: "[]", status: "lead_incompleto",
        briefingJson: JSON.stringify({
          contato: { nome: "Injetado", email: "<script>alert(1)</script>", whatsapp: "0", informadoEm: "2026-08-16T10:00:00.000Z" },
        }),
      },
    });
    await prisma.clientRequestDb.create({
      data: {
        workspaceId, businessName: "Marcenaria Nó Cego", services: "[]", objectives: "[]", status: "lead_incompleto",
        // Com espaço no meio: passa por qualquer LIKE ingênuo de "tem arroba".
        briefingJson: JSON.stringify({ contato: { email: "vitima@x.com atacante@y.com", whatsapp: null } }),
      },
    });

    await rodarBackfillDaMigration();

    for (const nome of ["Serralheria Porta Firme", "Marcenaria Nó Cego"]) {
      const l = await prisma.clientRequestDb.findFirstOrThrow({ where: { businessName: nome } });
      expect(l.contatoEmail).toBeNull();
      expect(l.contatoWhatsapp).toBeNull();
      expect(l.contatoNome).toBeNull();
      expect(l.contatoEm).toBeNull();
    }

    // E a consequência que importa: o forjado NÃO entra no recorte de quem tem
    // canal. A coluna e o dossiê continuam contando a MESMA história.
    const comCanal = await listClientRequests({ workspaceId, comContato: true, limit: 500 });
    expect(comCanal.some((r) => r.businessName === "Serralheria Porta Firme")).toBe(false);
  });

  it("⛔ A OUTRA METADE — o backfill NÃO sobe lixo, e é por isso que dá para confiar no filtro", async () => {
    await prisma.clientRequestDb.create({
      data: {
        workspaceId, businessName: "Lava-Rápido Gota Limpa", services: "[]", objectives: "[]", status: "lead_incompleto",
        // Os três venenos: número curto que é preço, e-mail sem domínio, e nome
        // sozinho. Nenhum deles pode virar linha no índice.
        briefingJson: JSON.stringify({ scope: { prospectName: "Duda", prospectPhone: "1500", prospectEmail: "duda@" } }),
      },
    });
    await prisma.clientRequestDb.create({
      data: {
        workspaceId, businessName: "Pet Shop Focinho Feliz", services: "[]", objectives: "[]", status: "lead_incompleto",
        // Briefing ilegível: blob que não é JSON. Não pode derrubar a migration.
        briefingJson: "isto não é json {{{",
      },
    });

    await rodarBackfillDaMigration();

    const lixo = await prisma.clientRequestDb.findFirstOrThrow({ where: { businessName: "Lava-Rápido Gota Limpa" } });
    expect(lixo.contatoWhatsapp).toBeNull();
    expect(lixo.contatoEmail).toBeNull();
    expect(lixo.contatoNome).toBeNull(); // nome sozinho não fica na coluna
    const ilegivel = await prisma.clientRequestDb.findFirstOrThrow({ where: { businessName: "Pet Shop Focinho Feliz" } });
    expect(ilegivel.contatoEmail).toBeNull();

    // E o que já estava certo não foi estragado por rodar de novo.
    const canonico = await prisma.clientRequestDb.findFirstOrThrow({ where: { businessName: "Floricultura Beija-Flor" } });
    expect(canonico.contatoEmail).toBe("nara@beijaflor.com.br");
  });
});

describe("a coluna NÃO é atestado de qualidade — ela passa pela mesma validação", () => {
  it("⛔ um telefone de 4 dígitos escrito direto na coluna é IGNORADO", () => {
    const contato = lerContato({ contatoWhatsapp: "1500", contatoEmail: null });
    expect(contato.temComoFalar).toBe(false);
    expect(contato.whatsapp).toBeNull();
  });

  it("🔑 coluna inválida CAI para o blob em vez de derrubar o registro para 'sem contato'", () => {
    const contato = lerContato({
      contatoEmail: "quebrado@",
      briefingJson: { contato: { email: "boa@ancora.com.br" } },
    });
    expect(contato.email).toBe("boa@ancora.com.br");
    expect(contato.temComoFalar).toBe(true);
  });

  it("a coluna VENCE o blob quando as duas são válidas — é ela que o banco filtra", () => {
    const contato = lerContato({
      contatoEmail: "atual@ancora.com.br",
      briefingJson: { contato: { email: "antigo@ancora.com.br" } },
    });
    expect(contato.email).toBe("atual@ancora.com.br");
  });

  it("`colunasDeContato` é PROJEÇÃO de `lerContato` — nome sem canal não produz coluna", () => {
    expect(colunasDeContato({ briefingJson: { scope: { prospectName: "Só o nome" } } })).toEqual({
      contatoNome: null, contatoEmail: null, contatoWhatsapp: null, contatoEm: null,
    });
  });
});
