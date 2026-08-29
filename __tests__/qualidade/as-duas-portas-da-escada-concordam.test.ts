// AS DUAS PORTAS DA ESCADA DIZIAM COISAS DIFERENTES SOBRE A MESMA LIBERAÇÃO.
//
// ═══════════════════════════════════════════════════════════════════════════
// O QUE FOI MEDIDO EM PRODUÇÃO (cliente oculto, 25/08/2026)
// ═══════════════════════════════════════════════════════════════════════════
//
//   13:47 — um pedido de Story foi RETIDO pela escada:
//           "design está em ALLOWLIST e o cliente não está na lista";
//   13:48 — o despertador aplicou `DECISOES_DO_DONO` (escopo
//           `clientes_com_projeto`) e incluiu SOZINHO o mesmo cliente novo em
//           `design` e `social-media`.
//
// E o MESMO pedido, feito pela porta certa — `POST /api/agency/escada`, ação
// `liberar_cliente` — foi recusado com **409: evidência insuficiente**.
//
// Uma porta exigia evidência; a outra liberava sozinha em um minuto. A escada
// inteira virava enfeite pela segunda: quem quisesse o resultado esperava cinco
// minutos pelo relógio em vez de passar pela porta que pergunta.
//
// ═══════════════════════════════════════════════════════════════════════════
// QUAL DAS DUAS ERA A REGRA — E O QUE **NÃO** FOI FEITO
// ═══════════════════════════════════════════════════════════════════════════
//
// A automática, e não por ser a mais permissiva: por ser a que tem
// PROCEDÊNCIA — decisão datada, assinada, com a fala literal, versionada em
// código e validada por `recusarDecisao`.
//
// O que NÃO foi feito: afrouxar a régua de evidência. Ela continua inteira para
// todo cliente que a decisão do dono não cobre, e o caso 3 abaixo é quem prova
// isso — ele é o teste que ficaria verde se alguém "resolvesse" o conflito
// removendo a exigência.
//
// ═══════════════════════════════════════════════════════════════════════════
// POR QUE PELA ROTA, E NÃO PELA FUNÇÃO
// ═══════════════════════════════════════════════════════════════════════════
//
// O 409 medido em produção saiu da ROTA. Um teste que chamasse `liberarCliente`
// direto provaria o irmão — e "sete vezes o defeito estava dentro da régua que
// deveria pegá-lo" é a advertência desta operação. Aqui a chamada é a mesma que
// o painel faz, com o mesmo corpo e a mesma leitura de status HTTP.
//
// ── A PROVA POR MUTAÇÃO (conferida à mão) ──────────────────────────────────
//
//   • apagar a consulta a `decisaoQueCobre` em `liberarCliente` → o caso 1
//     volta ao 409 medido em produção;
//   • fazer `decisaoQueCobre` devolver a decisão sem conferir o escopo → o
//     caso 3 fica vermelho (a régua de evidência teria sido afrouxada);
//   • apagar o filtro de departamento → o caso 4 fica vermelho.
//
// ⚠️ UMA MUTAÇÃO QUE **NÃO** DERRUBA A ROTA, e fica escrito: trocar
// `recusarDecisao(d)` por `false` dentro de `decisaoQueCobre` não muda nada
// pela rota, porque a única decisão declarada nesta casa é válida. A porta
// manual só tem procedência para conferir quando alguém escreve uma decisão
// malformada — e é por isso que o caso 5 cobre esse eixo pela FUNÇÃO, dizendo
// que é a função, em vez de fingir que a rota o alcança.

import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  departmentLadder: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), findMany: vi.fn() },
  departmentLadderRecord: { findMany: vi.fn(), create: vi.fn() },
  // `findFirst` entrou em 29/08 com a conferência de posse do `clientId` que a
  // rota recebe no CORPO (varredura de posse, rodada 2 lote A). O dublê responde
  // "o cliente é deste workspace" porque este teste é sobre a ESCADA concordar
  // com a decisão do dono, não sobre posse — a posse tem teste próprio em
  // `__tests__/seguranca/o-cliente-do-vizinho-na-escada.test.ts`. Sem esta linha
  // o teste morria em `prisma.client.findFirst is not a function`, que é falha do
  // dublê e não da rota.
  client: {
    findMany: vi.fn(),
    findFirst: vi.fn(async (_args: { where?: Record<string, unknown> }): Promise<{ id: string } | null> => ({ id: "cliente" })),
  },
  agencyWorkspace: { findMany: vi.fn() },
  deliverable: { findMany: vi.fn() },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

// PARCIAL: só a sessão é encenada (este processo não tem navegador logado). A
// régua de permissão da rota continua sendo a real.
vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  getSession: vi.fn(async () => ({
    userId: "op-1", role: "master", workspaceId: "ws1", clientId: null, email: "operador@dioli.test",
  })),
}));

import { NextRequest } from "next/server";
import { POST as postEscada } from "@/app/api/agency/escada/route";
import {
  DECISOES_DO_DONO, aplicarDecisoesDoDono, decisaoQueCobre, type DecisaoDoDono,
} from "@/lib/agency/escada/decisoes-do-dono";

const W = "ws1";
/** O cliente novo: tem projeto, logo está no escopo `clientes_com_projeto`. */
const CLIENTE_NOVO = "cli_novo";
/** Um cliente que a decisão NÃO alcança — não tem projeto. */
const CLIENTE_FORA = "cli_sem_projeto";

/** A decisão real desta casa, e é ela que está sob teste — não uma inventada
 *  para o teste passar. Se alguém apagar a decisão do repositório, este arquivo
 *  fica vermelho, que é o comportamento certo. */
const A_DECISAO = DECISOES_DO_DONO[0];

/** O estado medido às 13:47: `design` em allowlist, sem o cliente novo. */
function allowlistSemOClienteNovo() {
  return { degrau: "allowlist", clientesLiberados: JSON.stringify(["cli_antigo"]) };
}

function pedirLiberacao(clientId: string, departmentId = "design"): Promise<Response> {
  return postEscada(new NextRequest("http://localhost/api/agency/escada", {
    method: "POST",
    headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
    body: JSON.stringify({ acao: "liberar_cliente", departmentId, clientId }),
  })) as unknown as Promise<Response>;
}

beforeEach(() => {
  vi.clearAllMocks();
  db.departmentLadder.update.mockResolvedValue({});
  db.departmentLadder.create.mockResolvedValue({});
  // `garantirEscada` não cria nada quando todos os departamentos já existem.
  db.departmentLadder.findMany.mockResolvedValue(
    // Uma linha por departamento da casa — o suficiente para `garantirEscada`
    // considerar a escada montada e não escrever nada.
    ["design", "social-media", "paid-traffic", "analytics", "strategy", "financeiro", "prospeccao", "pm"]
      .map((departmentId) => ({ departmentId })),
  );
  db.departmentLadder.findUnique.mockResolvedValue(allowlistSemOClienteNovo());
  // ZERO registros na janela = ZERO evidência. É o estado que produziu o 409.
  db.departmentLadderRecord.findMany.mockResolvedValue([]);
  // Quem tem projeto — é o que `resolverClientes` pergunta ao banco.
  db.client.findMany.mockResolvedValue([{ id: CLIENTE_NOVO }, { id: "cli_antigo" }]);
  db.agencyWorkspace.findMany.mockResolvedValue([{ id: W }]);
  db.deliverable.findMany.mockResolvedValue([]);
});

describe("a porta manual passou a conhecer a decisão do dono", () => {
  it("1. o cliente que a decisão cobre é liberado — com a decisão na resposta, não em silêncio", async () => {
    // A decisão real cobre `design` e `clientes_com_projeto`. Se um dia deixar
    // de cobrir, este teste não deve continuar verde por engano.
    expect(A_DECISAO.departamentos, "a decisão desta casa cobre design").toContain("design");
    expect(A_DECISAO.escopo.tipo).toBe("clientes_com_projeto");

    const r = await pedirLiberacao(CLIENTE_NOVO);
    const corpo = await r.json();

    // Era 409 em produção. Este número É o defeito medido.
    expect(r.status, "a porta manual recusou o que o relógio concede sozinho em um minuto").toBe(200);
    expect(corpo.ok).toBe(true);

    // ── E NÃO EM SILÊNCIO ────────────────────────────────────────────────
    // Uma liberação sem evidência que não diz POR QUE foi concedida é pior que
    // a recusa: vira exceção invisível. A resposta carrega a procedência.
    expect(corpo.porDecisaoDoDono?.id, "a resposta diz QUAL decisão autorizou").toBe(A_DECISAO.id);
    expect(corpo.porDecisaoDoDono?.quem).toBe(A_DECISAO.quem);

    const escrita = db.departmentLadder.update.mock.calls[0][0];
    expect(JSON.parse(escrita.data.clientesLiberados)).toContain(CLIENTE_NOVO);
    // A assinatura diz as DUAS coisas: qual decisão autorizou e quem pediu.
    expect(escrita.data.decididoPor).toContain(`decisao-do-dono:${A_DECISAO.id}`);
    expect(escrita.data.decididoPor).toContain("usuario:op-1");
    // A prova gravada carrega a FALA — quem auditar o banco daqui a um ano lê a
    // frase que soltou o cliente sem precisar do repositório.
    expect(JSON.parse(escrita.data.provaJson).fala).toBe(A_DECISAO.fala);
  });

  it("2. as duas portas chegam ao MESMO resultado para o mesmo cliente", async () => {
    // É a definição de "duas verdades já estão erradas em uma delas": o que a
    // porta automática faz e o que a manual faz têm de ser a mesma coisa.
    await pedirLiberacao(CLIENTE_NOVO);
    const pelaPortaManual = JSON.parse(db.departmentLadder.update.mock.calls[0][0].data.clientesLiberados);

    db.departmentLadder.update.mockClear();
    await aplicarDecisoesDoDono(W);
    const escritaDoRelogio = db.departmentLadder.update.mock.calls
      .find((c) => c[0].where.workspaceId_departmentId.departmentId === "design")!;
    const peloRelogio = JSON.parse(escritaDoRelogio[0].data.clientesLiberados);

    expect(pelaPortaManual.sort(), "a porta manual e o relógio discordam sobre quem está liberado")
      .toEqual(peloRelogio.sort());
  });

  it("3. a régua de EVIDÊNCIA continua inteira para quem a decisão NÃO cobre", async () => {
    // Este é o teste que ficaria verde se alguém tivesse "resolvido" o conflito
    // afrouxando a porta que pergunta. Ele é a metade que importa.
    const r = await pedirLiberacao(CLIENTE_FORA);
    const corpo = await r.json();

    expect(r.status, "cliente fora do escopo da decisão foi liberado sem evidência").toBe(409);
    expect(corpo.ok).toBe(false);
    expect(corpo.erro).toMatch(/evid[êe]ncia insuficiente/i);
    // A recusa diz as DUAS razões — sem isso, quem lê acha que só falta número.
    expect(corpo.erro).toMatch(/nenhuma decis[ãa]o do dono/i);
    expect(db.departmentLadder.update, "nada foi escrito").not.toHaveBeenCalled();
  });

  it("4. departamento fora da decisão continua exigindo evidência", async () => {
    // `paid-traffic` está fora de `DECISOES_DO_DONO` de propósito (ele escreve
    // em Meta/Google). A porta manual não pode conceder o que a decisão não diz.
    expect(A_DECISAO.departamentos).not.toContain("paid-traffic");
    const r = await pedirLiberacao(CLIENTE_NOVO, "paid-traffic");
    expect(r.status, "a decisão do dono vazou para um departamento que ela não nomeia").toBe(409);
    expect(db.departmentLadder.update).not.toHaveBeenCalled();
  });

  // ── ESTE CASO É DA FUNÇÃO, NÃO DA ROTA — e está dito ────────────────────
  //
  // A rota sempre lê `DECISOES_DO_DONO`, e a única decisão declarada hoje é
  // válida. Então o eixo da PROCEDÊNCIA não tem como ser exercitado por ela.
  // Cobri-lo aqui, nomeando que é a função, é o oposto de régua mirada no
  // irmão: é dizer exatamente até onde a prova alcança.
  it("5. (pela função) decisão SEM procedência não cobre ninguém — a evidência volta a valer", async () => {
    const semFala: DecisaoDoDono = {
      id: "sem-procedencia", em: "2026-08-08", quem: "alguém",
      fala: "ok", // abaixo do mínimo: "o CEO mandou" sem a frase é memória, não registro
      departamentos: ["design"], escopo: { tipo: "clientes_com_projeto" },
    };
    const cobertura = await decisaoQueCobre({
      workspaceId: W, departmentId: "design", clientId: CLIENTE_NOVO, decisoes: [semFala],
    });
    expect(cobertura, "decisão sem a fala literal liberou um cliente").toBeNull();
  });
});
