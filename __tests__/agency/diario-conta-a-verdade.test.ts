// O DIÁRIO PRECISA CONTAR A VERDADE, NÃO A PÁGINA — medido com banco real,
// não suposição (16/08/2026).
//
// TRÊS BURACOS, os três provados aqui:
//
//   1. `escopoFoiSalvo: false` chegava em `registrarTurnoDoSdr` e era jogado
//      fora: `false` e `undefined` caíam no mesmo `? :` e viravam a MESMA
//      string vazia. Plantado no banco: 55 turnos barrados, 37 sem a frase de
//      "salvo" — misturando escopo perdido de verdade, registro gravado ANTES
//      da frase existir, e turno sem escopo à mão. "Perdido" e "não sei" eram
//      indistinguíveis.
//   2. `quantos` devolvia `pedidos.length` etc — o TAMANHO DA PÁGINA
//      (`take: limite`, padrão 40) — não quantas linhas existem. Com 55
//      mensagens no banco o diário dizia "40".
//   3. A pergunta mais importante do dia — quantas vezes o resgate do escopo
//      FUNCIONOU e quantas NÃO — não tinha número nenhum.
//
// Banco SQLite real, migrado de verdade, caminho único por processo — ver
// `__tests__/v2/_infra/banco-descartavel.ts` para o porquê (colisão entre
// sessões de agente rodando `npm test` na mesma máquina ao mesmo tempo).

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { execSync } from "node:child_process";
import { NextRequest } from "next/server";
import { limparArquivosDoBanco } from "../v2/_infra/banco-descartavel";

// O caminho do banco precisa estar no ambiente ANTES de qualquer import ser
// avaliado — o cliente Prisma (`lib/db/client.ts`) lê `DATABASE_URL` na
// criação do singleton, e o singleton só é criado uma vez, na primeira vez
// que o módulo é importado. `vi.hoisted` é o único jeito de garantir que esta
// linha rode antes dos `import` abaixo.
//
// A fórmula (pid + `crypto.randomUUID()`) é a MESMA de
// `caminhoDeBancoDescartavel` em `_infra/banco-descartavel.ts` — só não pode
// ser a mesma CHAMADA porque `vi.hoisted` roda antes de qualquer import
// resolver, e `crypto` já é global no Node 22 (usado sem import em várias
// rotas desta casa, ex. `app/api/auth/google/route.ts`).
const CAMINHO_DB = vi.hoisted(() => {
  const caminho = `/tmp/diario-conta-a-verdade-${process.pid}-${crypto.randomUUID()}.db`;
  process.env.DATABASE_URL = `file:${caminho}`;
  process.env.PILOTO_SECRET = "segredo-de-teste-do-diario";
  return caminho;
});

import { prisma } from "@/lib/db/client";
import { GET } from "@/app/api/piloto/diario/route";
import {
  registrarTurnoDoSdr,
  PREFIXO_TURNO_BARRADO,
  FRASE_ESCOPO_SALVO,
  FRASE_ESCOPO_PERDIDO,
} from "@/lib/agency/comercial/registro-da-conversa";

const SEGREDO = "segredo-de-teste-do-diario";

function chamar(limite?: number) {
  const url = new URL("http://localhost/api/piloto/diario");
  url.searchParams.set("chave", SEGREDO);
  if (limite !== undefined) url.searchParams.set("limite", String(limite));
  return GET(new NextRequest(url));
}

beforeAll(() => {
  limparArquivosDoBanco(CAMINHO_DB);
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: `file:${CAMINHO_DB}` },
    stdio: "pipe",
    timeout: 240_000,
  });
}, 300_000);

afterAll(async () => {
  await prisma.$disconnect();
  limparArquivosDoBanco(CAMINHO_DB);
});

// Cada teste começa com a tabela de mensagens vazia — inclusive o primeiro,
// já que apagar uma tabela vazia não muda nada. Isso troca "ordem dos testes
// importa" por "cada teste planta exatamente o que precisa", que é a única
// forma de um número exato (55, 3, 2…) não depender de quem rodou antes.
beforeEach(async () => {
  await prisma.portalMessage.deleteMany();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("banco vazio não inventa problema", () => {
  it("quantos e resgate_do_escopo saem zerados, sem cegueira, sem quebrar", async () => {
    const res = await chamar();
    expect(res.status).toBe(200);
    const corpo = await res.json();

    expect(corpo.cegueiras).toEqual([]);
    expect(corpo.quantos.mensagens).toEqual({ total: 0, mostrando: 0 });
    expect(corpo.quantos.solicitacoes).toEqual({ total: 0, mostrando: 0 });
    expect(corpo.quantos.clientes).toEqual({ total: 0, mostrando: 0 });
    expect(corpo.resgate_do_escopo).toMatchObject({ funcionou: 0, nao_funcionou: 0, nao_sei: 0 });
    // O campo existe para o CEO ler sem intérprete — não é documentação à
    // parte, é o próprio JSON explicando o próprio número.
    expect(typeof corpo.resgate_do_escopo.nota).toBe("string");
    expect(corpo.resgate_do_escopo.nota.length).toBeGreaterThan(0);
  });
});

describe("os três estados de escopoFoiSalvo gravam frases diferentes", () => {
  it("true grava a frase afirmativa de escopo salvo", async () => {
    await registrarTurnoDoSdr({
      sessionId: "estado-true",
      doVisitante: "quanto custa?",
      motivoDaRecusa: "price_leak",
      escopoFoiSalvo: true,
    });
    const [msg] = await prisma.portalMessage.findMany({ where: { authorRole: "team" } });
    expect(msg.body).toContain(FRASE_ESCOPO_SALVO);
    expect(msg.body).not.toContain(FRASE_ESCOPO_PERDIDO);
  });

  it("false grava a frase NOVA, afirmativa, de escopo perdido — não mais silêncio", async () => {
    await registrarTurnoDoSdr({
      sessionId: "estado-false",
      doVisitante: "quanto custa?",
      motivoDaRecusa: "price_leak",
      escopoFoiSalvo: false,
    });
    const [msg] = await prisma.portalMessage.findMany({ where: { authorRole: "team" } });
    expect(msg.body).toContain(FRASE_ESCOPO_PERDIDO);
    expect(msg.body).not.toContain(FRASE_ESCOPO_SALVO);
  });

  it("undefined não grava nenhuma das duas — e só assim 'não sei' quer dizer algo", async () => {
    await registrarTurnoDoSdr({
      sessionId: "estado-undefined",
      doVisitante: "quanto custa?",
      motivoDaRecusa: "price_leak",
      // escopoFoiSalvo ausente de propósito — é o terceiro estado.
    });
    const [msg] = await prisma.portalMessage.findMany({ where: { authorRole: "team" } });
    expect(msg.body).not.toContain(FRASE_ESCOPO_SALVO);
    expect(msg.body).not.toContain(FRASE_ESCOPO_PERDIDO);
    expect(msg.body).toContain(PREFIXO_TURNO_BARRADO);
  });
});

describe("quantos mostra o total real, separado da amostra", () => {
  it("com 55 mensagens plantadas e limite 40, total é 55 e mostrando é 40", async () => {
    // Plantar sequencial, não em paralelo: 55 conexões simultâneas contra o
    // MESMO arquivo SQLite (lock de escrita único) seria concorrência que o
    // teste não precisa correr.
    for (let i = 0; i < 55; i++) {
      await registrarTurnoDoSdr({ sessionId: `qtd-${i}`, doVisitante: `mensagem número ${i}` });
    }

    const res = await chamar(40);
    const corpo = await res.json();

    // Este é o teste que impede a mentira de voltar: 55 no banco, 40 na
    // amostra — os dois números, nunca confundidos um pelo outro.
    expect(corpo.quantos.mensagens).toEqual({ total: 55, mostrando: 40 });
  });
});

describe("resgate_do_escopo conta os três baldes", () => {
  it("funcionou, nao_funcionou e nao_sei contam exatamente o que foi plantado", async () => {
    for (let i = 0; i < 3; i++) {
      await registrarTurnoDoSdr({
        sessionId: `func-${i}`,
        doVisitante: "quanto custa?",
        motivoDaRecusa: "price_leak",
        escopoFoiSalvo: true,
      });
    }
    for (let i = 0; i < 2; i++) {
      await registrarTurnoDoSdr({
        sessionId: `naofunc-${i}`,
        doVisitante: "quanto custa?",
        motivoDaRecusa: "price_leak",
        escopoFoiSalvo: false,
      });
    }
    // "não sei" pelo caminho normal — guarda que bloqueou sem ter escopo à
    // mão para tentar salvar (escopoFoiSalvo nunca chega para este turno).
    await registrarTurnoDoSdr({
      sessionId: "naosei-novo",
      doVisitante: "quanto custa?",
      motivoDaRecusa: "price_leak",
    });
    // "não sei" no formato ANTIGO — como ficaram gravados os turnos de ANTES
    // deste conserto existir. Gravado à mão porque `registrarTurnoDoSdr` já
    // não produz mais este formato; é exatamente por isso que este balde
    // representa o PASSADO, não o presente.
    await prisma.portalMessage.create({
      data: {
        clientId: "sdr:legado-1",
        authorRole: "team",
        authorName: "SDR",
        body: `${PREFIXO_TURNO_BARRADO} price_leak — quem respondeu ao visitante foi o motor de regras.]`,
        readByTeam: true,
        readByClient: true,
      },
    });

    const res = await chamar();
    const corpo = await res.json();

    expect(corpo.resgate_do_escopo.funcionou).toBe(3);
    expect(corpo.resgate_do_escopo.nao_funcionou).toBe(2);
    // undefined novo (1) + formato antigo (1)
    expect(corpo.resgate_do_escopo.nao_sei).toBe(2);
  });
});

describe("falha de leitura vira cegueira e total null — nunca 0", () => {
  it("count() rejeitado não derruba o diário, e o total não vira zero", async () => {
    await registrarTurnoDoSdr({ sessionId: "antes-da-falha", doVisitante: "oi" });

    const spy = vi.spyOn(prisma.portalMessage, "count").mockRejectedValueOnce(
      new Error("simulado: banco fora do ar"),
    );

    const res = await chamar();
    const corpo = await res.json();

    // Zero é um fato ("não há nenhum"); null é outro ("não consegui
    // contar") — e há 1 mensagem de verdade no banco, então um `0` aqui
    // seria uma mentira, não só um valor ausente.
    expect(corpo.quantos.mensagens.total).toBeNull();
    expect(corpo.cegueiras.some((c: string) => c.startsWith("mensagens_total:"))).toBe(true);

    spy.mockRestore();
  });
});
