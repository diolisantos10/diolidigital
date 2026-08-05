// A ELEVAÇÃO DE PRIVILÉGIO QUE MORAVA EM DUAS LINHAS.
//
// A corrente inteira: `isAgencyRole()` (lib/auth/session.ts) trazia uma lista
// escrita à mão com CINCO papéis e omitia `executivo_comercial`, que existe em
// `lib/agency/roles.ts`. E o login fazia:
//
//     const role = isAgencyRole(user.role) ? user.role : "master";
//
// Ou seja: papel não reconhecido virava MASTER. Um usuário comercial recebia
// JWT de master e com ele abria `/api/admin/reset` (apaga a operação inteira),
// `/api/ai-keys`, `/api/meta/config` (o App Secret) e `/api/backup`.
//
// E o defeito não era do `executivo_comercial`: era do DEFAULT. Todo papel novo
// que alguém acrescentasse em `roles.ts` e esquecesse na lista daqui nasceria
// master no ato do login.
//
// AS DUAS METADES:
//   • papel desconhecido → NEGADO, e nenhuma sessão criada;
//   • papel legítimo (inclusive o `executivo_comercial`) → entra com o PRÓPRIO
//     papel, sem atrito.
//
// E a terceira coisa que este arquivo tranca: o ORÁCULO DE ENUMERAÇÃO. O login
// respondia antes do `bcrypt.compare` quando o e-mail não existia — a diferença
// de tempo dizia quais contas existem. `master@dioli.studio` está no seed e no
// log de boot: é o alvo óbvio.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({ user: { findUnique: vi.fn() } }));
const createSession = vi.hoisted(() => vi.fn());
const compare = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("bcryptjs", () => ({ compare }));
vi.mock("@/lib/auth/session", async (original) => {
  const real = (await original()) as Record<string, unknown>;
  return { ...real, createSession };
});

import { POST as signin } from "@/app/api/auth/signin/route";
import { isAgencyRole } from "@/lib/auth/session";
import { AGENCY_ROLE_OPTIONS } from "@/lib/agency/roles";

let contadorDeIp = 0;

function pedido(email: string, password = "senha-certa"): NextRequest {
  // Um IP novo por chamada: o teto de tentativas é um comportamento à parte,
  // testado no seu próprio bloco. Aqui ele não pode contaminar os outros casos.
  contadorDeIp += 1;
  return new NextRequest("http://localhost/api/auth/signin", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `10.0.0.${contadorDeIp % 250}` },
    body: JSON.stringify({ email, password }),
  });
}

const USUARIO = {
  id: "u1",
  email: "alguem@dioli.studio",
  name: "Alguém",
  passwordHash: "$2b$12$hash",
  role: "master",
  workspaceId: "ws1",
  clientId: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  compare.mockResolvedValue(true);
  contadorDeIp += 7;
});

describe("a lista de papéis não é mais uma cópia à mão", () => {
  it("TODO papel declarado em roles.ts é reconhecido — inclusive executivo_comercial", () => {
    for (const opcao of AGENCY_ROLE_OPTIONS) {
      expect(isAgencyRole(opcao.id), `papel ${opcao.id} não reconhecido`).toBe(true);
    }
    // O que estava faltando, dito com nome e sobrenome.
    expect(isAgencyRole("executivo_comercial")).toBe(true);
  });

  it("papel inventado continua não sendo papel de agência", () => {
    expect(isAgencyRole("superadmin")).toBe(false);
    expect(isAgencyRole("")).toBe(false);
    // E nada de herdar do Object.prototype: "constructor" não é papel.
    expect(isAgencyRole("constructor")).toBe(false);
    expect(isAgencyRole("toString")).toBe(false);
  });
});

describe("o login não promove papel desconhecido", () => {
  it("papel que não existe em roles.ts → 403 e NENHUMA sessão criada", async () => {
    db.user.findUnique.mockResolvedValue({ ...USUARIO, role: "papel_que_alguem_esqueceu" });

    const res = await signin(pedido("alguem@dioli.studio"));

    expect(res.status).toBe(403);
    expect(createSession).not.toHaveBeenCalled();
  });

  it("executivo_comercial entra COMO executivo_comercial — nunca como master", async () => {
    db.user.findUnique.mockResolvedValue({ ...USUARIO, role: "executivo_comercial" });

    const res = await signin(pedido("comercial@dioli.studio"));

    expect(res.status).toBe(200);
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(createSession.mock.calls[0]![0].role).toBe("executivo_comercial");
  });

  it("o master de verdade continua entrando como master", async () => {
    db.user.findUnique.mockResolvedValue({ ...USUARIO, role: "master" });

    const res = await signin(pedido("master@dioli.studio"));

    expect(res.status).toBe(200);
    expect(createSession.mock.calls[0]![0].role).toBe("master");
  });
});

describe("o login não conta quais e-mails existem", () => {
  it("e-mail inexistente AINDA paga o custo do bcrypt — a resposta não sai antes", async () => {
    db.user.findUnique.mockResolvedValue(null);
    compare.mockResolvedValue(false);

    const res = await signin(pedido("ninguem@lugar.nenhum"));

    expect(res.status).toBe(401);
    // A prova: o compare FOI chamado mesmo sem usuário. É o que iguala o tempo.
    expect(compare).toHaveBeenCalledTimes(1);
    expect(createSession).not.toHaveBeenCalled();
  });

  it("e-mail inexistente e senha errada dão a MESMA resposta, palavra por palavra", async () => {
    db.user.findUnique.mockResolvedValue(null);
    compare.mockResolvedValue(false);
    const semUsuario = await signin(pedido("ninguem@lugar.nenhum"));

    db.user.findUnique.mockResolvedValue(USUARIO);
    compare.mockResolvedValue(false);
    const senhaErrada = await signin(pedido("alguem@dioli.studio"));

    expect(semUsuario.status).toBe(senhaErrada.status);
    expect(await semUsuario.json()).toEqual(await senhaErrada.json());
  });
});

describe("força bruta tem teto", () => {
  it("o mesmo e-mail, insistindo, começa a levar 429", async () => {
    db.user.findUnique.mockResolvedValue(USUARIO);
    compare.mockResolvedValue(false);

    const alvo = `alvo-${Date.now()}@dioli.studio`;
    const status: number[] = [];
    for (let i = 0; i < 8; i++) status.push((await signin(pedido(alvo, "chute"))).status);

    // As primeiras passam (e falham como 401); a partir do teto, 429.
    expect(status.filter((s) => s === 401).length).toBeGreaterThan(0);
    expect(status.at(-1)).toBe(429);
  });

  it("o teto não impede o login legítimo de quem não estourou a cota", async () => {
    db.user.findUnique.mockResolvedValue(USUARIO);
    compare.mockResolvedValue(true);

    const res = await signin(pedido(`ok-${Date.now()}@dioli.studio`));
    expect(res.status).toBe(200);
  });
});
