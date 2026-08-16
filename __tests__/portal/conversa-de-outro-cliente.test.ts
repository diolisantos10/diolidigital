// ── O PORTAL DE UM CLIENTE MOSTRAVA A CONVERSA DE OUTRO (15/08/2026) ────────
//
// O CEO abriu o portal de um cliente em produção e o painel "Fale com seu PM"
// trouxe a conversa de OUTRO cliente — as mesmas mensagens, nos mesmos
// horários. A conversa do PM carrega briefing, valores e combinação comercial.
//
// Este arquivo anda os DOIS mecanismos que produzem isso, contra banco de
// verdade e pelas rotas de verdade. Cada um falha ANTES do conserto e passa
// depois — e cada um tem as duas metades: barra o problema plantado, e não
// inventa problema no caso limpo.
//
// ── MECANISMO 1 — A ÂNCORA (o que reproduz o sintoma exato) ─────────────────
// `conversaDoCliente` lê pela UNIÃO de duas chaves: `clientId` do dono E todas
// as solicitações dele. Isso existe por um bom motivo (o histórico não pode se
// partir quando o cliente ganha uma solicitação) e abriu um buraco que ninguém
// tinha medido: **`ClientRequestDb.clientId` não é imutável**. `/api/admin/reset`
// zera o campo; `createProjectFromRequest` e `/api/brain/orchestrate/apply`
// criam um Client novo e RE-APONTAM a mesma solicitação; e `Client` não tem
// `@@unique(workspaceId, name)`, então ficha duplicada para o mesmo negócio é
// fato registrado nesta casa (a Camila, 08/08/2026).
//
// Quando a solicitação R sai do cliente A e passa para o B, as mensagens
// antigas continuam gravadas com `clientId: A` **E** `clientRequestId: R` — as
// duas chaves, como esta casa passou a carimbar. A partir daí o portal de B lê
// aquelas mensagens pelo ramo da solicitação, e o de A continua lendo pelo ramo
// do cliente: **os dois portais mostram a mesma conversa, com os mesmos
// horários**, cada um com o seu próprio token válido. Nenhum cookie envolvido.
//
// ── MECANISMO 2 — A CREDENCIAL (o que o cookie de 180 dias permite) ─────────
// O cookie `dioli_portal` é UM por navegador, com `path:"/"`, e guarda UM
// cliente. Em `/portal/access/me` ele É a credencial da conversa. Nada conferia
// se o cliente do cookie era o mesmo que a TELA estava mostrando.

import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { NextRequest } from "next/server";

const DB_PATH = vi.hoisted(() => {
  const caminho = `${process.cwd()}/prisma/conversa-de-outro-cliente.db`;
  process.env.DATABASE_URL = `file:${caminho}`;
  return caminho;
});

const requireSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/api-guard", () => ({ requireSession }));

import { prisma } from "@/lib/db/client";
import { GET as lerConversa, POST as enviarMensagem } from "@/app/api/portal/messages/route";
import { GET as lerVista } from "@/app/api/portal/vista/route";
import { donoDaTela } from "@/lib/agency/portal/dono-da-tela";
import { PORTAL_COOKIE } from "@/lib/agency/persistence/portal-cookie";

// Dois clientes de MENTIRA. Nenhum dado real de cliente entra em teste.
const SEGREDO_1 = "SEGREDO-DO-ALFA-1 a combinacao comercial";
const SEGREDO_2 = "SEGREDO-DO-ALFA-2 os valores do briefing";

let ws = "";
let alfa = "";
let beta = "";
let reqAlfa = "";
const TOKEN_ALFA = "tok-alfa-1";
const TOKEN_BETA = "tok-beta-1";

function get(url: string, cookie?: string): NextRequest {
  const r = new NextRequest(`http://localhost${url}`);
  if (cookie) r.cookies.set(PORTAL_COOKIE, cookie);
  return r;
}
function post(body: Record<string, unknown>, cookie?: string): NextRequest {
  const r = new NextRequest("http://localhost/api/portal/messages", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (cookie) r.cookies.set(PORTAL_COOKIE, cookie);
  return r;
}
async function corpos(res: Response): Promise<string[]> {
  const j = (await res.json()) as { messages?: { body: string }[] };
  return (j.messages ?? []).map((m) => m.body);
}

beforeAll(async () => {
  if (existsSync(DB_PATH)) rmSync(DB_PATH);
  execSync("npx prisma db push --accept-data-loss", {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: `file:${DB_PATH}` },
    stdio: "pipe",
  });

  ws = (await prisma.agencyWorkspace.create({ data: { name: "Dioli", slug: `vaz-${Date.now()}` } })).id;
  alfa = (await prisma.client.create({ data: { workspaceId: ws, name: "Agência ALFA" } })).id;
  beta = (await prisma.client.create({ data: { workspaceId: ws, name: "Loja BETA" } })).id;

  // ALFA veio pelo briefing público: tem solicitação. É ela que vai mudar de dono.
  reqAlfa = (await prisma.clientRequestDb.create({
    data: {
      workspaceId: ws, clientId: alfa, businessName: "Agência ALFA", segment: "agência",
      services: "[]", objectives: "[]", status: "in_progress", rawContext: "x",
    },
  })).id;

  // As duas mensagens do ALFA, carimbadas com AS DUAS chaves — o formato que a
  // rota grava hoje, e o que torna o vazamento possível.
  await prisma.portalMessage.create({
    data: { clientId: alfa, clientRequestId: reqAlfa, authorRole: "team", authorName: "Equipe Dioli",
            body: SEGREDO_1, createdAt: new Date("2026-08-08T13:28:00Z") },
  });
  await prisma.portalMessage.create({
    data: { clientId: alfa, clientRequestId: reqAlfa, authorRole: "client", authorName: "Agência ALFA",
            body: SEGREDO_2, createdAt: new Date("2026-08-08T14:41:00Z") },
  });
  // Uma mensagem LEGADA: só `clientRequestId`, sem `clientId` — é o formato das
  // 11 escritas antigas. Ela precisa continuar visível para o dono da vez.
  await prisma.portalMessage.create({
    data: { clientRequestId: reqAlfa, authorRole: "team", authorName: "Equipe Dioli",
            body: "recado-legado-sem-clientid", createdAt: new Date("2026-08-07T10:00:00Z") },
  });
  // BETA é cliente DIRETO (o caso Foocci): sem solicitação nenhuma.
  await prisma.portalMessage.create({
    data: { clientId: beta, authorRole: "client", authorName: "Loja BETA", body: "recado-da-beta" },
  });

  await prisma.portalAccess.create({ data: { token: TOKEN_ALFA, clientId: alfa, clientRequestId: reqAlfa } });
  await prisma.portalAccess.create({ data: { token: TOKEN_BETA, clientId: beta } });

  requireSession.mockResolvedValue({ session: { name: "PM", workspaceId: ws, role: "master" }, error: null });
});

beforeEach(async () => {
  // Estado limpo: a solicitação pertence a quem a criou.
  await prisma.clientRequestDb.update({ where: { id: reqAlfa }, data: { clientId: alfa } });
});

// ═══════════════════════════════════════════════════════════════════════════
// MECANISMO 1 — A ÂNCORA
// ═══════════════════════════════════════════════════════════════════════════
describe("a solicitação muda de dono e leva a conversa junto", () => {
  it("⛔ o portal do BETA não vê UMA linha do ALFA depois do re-apontamento", async () => {
    // O re-apontamento que acontece de verdade nesta casa: reset zera o dono,
    // e a criação de projeto/aplicação de escopo aponta a MESMA solicitação
    // para um Client novo.
    await prisma.clientRequestDb.update({ where: { id: reqAlfa }, data: { clientId: beta } });

    const lidas = await corpos(await lerConversa(get(`/api/portal/messages?token=${TOKEN_BETA}`)));

    expect(lidas).not.toContain(SEGREDO_1);
    expect(lidas).not.toContain(SEGREDO_2);
    // Nem o texto, nem a CONTAGEM: o BETA continua com a conversa dele e só.
    expect(lidas).toEqual(["recado-da-beta"]);
  });

  // ⚠️ RÓTULO CORRIGIDO (rodada 2). Isto se chamava "⛔ e o ALFA também não é
  // servido pelo caminho contrário" e era **estruturalmente incapaz de
  // falhar**: sem a solicitação, o filtro do ALFA vira `{clientId: alfa}` e
  // nunca chegou perto do BETA. Controle positivo vestido de barreira engana a
  // próxima pessoa a ler a suíte. Ele fica — como controle, com o nome certo.
  it("✅ (controle) o ALFA nunca teve caminho para a conversa do BETA", async () => {
    await prisma.clientRequestDb.update({ where: { id: reqAlfa }, data: { clientId: beta } });
    const lidas = await corpos(await lerConversa(get(`/api/portal/messages?token=${TOKEN_ALFA}`)));
    expect(lidas).not.toContain("recado-da-beta");
  });

  // ⚠️ RODADA 4 — ESTE TESTE FOI INVERTIDO, e a inversão é a decisão.
  //
  // Ele exigia que "uma cerca grosseira (`clientId: X` e ponto)" NÃO fosse
  // adotada, para não apagar o histórico legado. Essa exigência é exatamente
  // o que mantinha o vazamento: a mesma linha sem dono que o dono certo lia,
  // o dono NOVO de uma solicitação re-apontada lia também. Não dá para ter as
  // duas — e entre "vê menos histórico" e "vê o preço do vizinho", a casa
  // escolhe a primeira, avisa na tela e mede o resto no censo.
  it("🟠 (custo declarado) no caso limpo, só o que tem dono ESCRITO é servido", async () => {
    const lidas = await corpos(await lerConversa(get(`/api/portal/messages?token=${TOKEN_ALFA}`)));
    expect(lidas).toContain(SEGREDO_1);
    expect(lidas).toContain(SEGREDO_2);
    // A linha legada fica parada até alguém dizer de quem é.
    expect(lidas).not.toContain("recado-legado-sem-clientid");
  });

  it("⛔ a marcação de lida também é cercada — o BETA não carimba mensagem do ALFA", async () => {
    // Uma mensagem NOVA da equipe para o ALFA, não lida por ele.
    const nova = await prisma.portalMessage.create({
      data: { clientId: alfa, clientRequestId: reqAlfa, authorRole: "team", authorName: "Equipe Dioli",
              body: "nao-lida-do-alfa", readByClient: false },
    });

    await prisma.clientRequestDb.update({ where: { id: reqAlfa }, data: { clientId: beta } });
    await lerConversa(get(`/api/portal/messages?token=${TOKEN_BETA}`));

    const depois = await prisma.portalMessage.findUnique({ where: { id: nova.id } });
    // Se o BETA "lê" a mensagem do ALFA, o alerta de não-lida do ALFA some e o
    // vazamento apaga o próprio rastro.
    expect(depois?.readByClient).toBe(false);

    await prisma.portalMessage.delete({ where: { id: nova.id } });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MECANISMO 2 — A CREDENCIAL: os três testes obrigatórios do despacho
// ═══════════════════════════════════════════════════════════════════════════
describe("cookie de um cliente, portal de outro, em /portal/access/me", () => {
  it("1) cookie do ALFA + portal do ALFA → MOSTRA a conversa", async () => {
    const vista = await (await lerVista(get("/api/portal/vista", TOKEN_ALFA))).json();
    expect(vista.marca.nome).toBe("Agência ALFA");

    const res = await lerConversa(get(`/api/portal/messages?dono=${vista.dono}`, TOKEN_ALFA));
    const lidas = await corpos(res);
    expect(lidas).toContain(SEGREDO_1);
    expect(lidas).toContain(SEGREDO_2);
  });

  it("2) cookie do ALFA + portal do BETA → NÃO MOSTRA NADA, e não vaza nome nem contagem", async () => {
    // A tela foi montada pelo token do BETA (a visita com token no caminho);
    // o chat, em `/me`, sai sem token e cai no cookie — que é do ALFA.
    const vista = await (await lerVista(get(`/api/portal/vista?token=${TOKEN_BETA}`, TOKEN_ALFA))).json();
    expect(vista.marca.nome).toBe("Loja BETA");

    const res = await lerConversa(get(`/api/portal/messages?dono=${vista.dono}`, TOKEN_ALFA));
    const bruto = JSON.stringify(await res.clone().json());
    const lidas = await corpos(res);

    expect(lidas).toEqual([]);
    // Nem o texto, nem o NOME do outro cliente, nem a CONTAGEM de mensagens
    // dele — "2 mensagens" já conta que existe relação comercial ali.
    expect(bruto).not.toContain("SEGREDO-DO-ALFA");
    expect(bruto).not.toContain("Agência ALFA");
    expect(bruto).toContain("dono-divergente");
  });

  it("2b) e o ENVIO também é barrado — a mensagem não pode cair na conversa do outro", async () => {
    const vista = await (await lerVista(get(`/api/portal/vista?token=${TOKEN_BETA}`, TOKEN_ALFA))).json();
    const antes = await prisma.portalMessage.count();

    const res = await enviarMensagem(post({ dono: vista.dono, body: "isto não pode ser gravado" }, TOKEN_ALFA));

    expect(res.status).toBe(409);
    expect(await prisma.portalMessage.count()).toBe(antes);
  });

  it("3) sem cookie nenhum → não mostra, e a resposta é tratável (a tela não quebra)", async () => {
    const res = await lerConversa(get("/api/portal/messages"));
    // Sem credencial de cliente a rota cai no lado da equipe e exige sessão —
    // o que a tela do portal já traduz. O que importa aqui: não vaza nada.
    expect(res.status).toBeGreaterThanOrEqual(400);
    const bruto = JSON.stringify(await res.json());
    expect(bruto).not.toContain("SEGREDO-DO-ALFA");
    expect(bruto).not.toContain("recado-da-beta");
  });

  // ⚠️ 15/08/2026 (rodada 2) — ESTE TESTE ASSEVERAVA UM FAIL-OPEN.
  //
  // Ele se chamava "declaração de dono AUSENTE não inventa problema" e travava
  // o selo devolvendo `true` quando não vinha nada. Selo que se desliga ao ser
  // OMITIDO não é trava: `curl` sem o parâmetro, ou um bundle em cache do
  // deploy anterior, passavam sem nunca acionar a conferência. E o mesmo PR
  // escrevia "FALHA DE LEITURA FECHA, NÃO ABRE" em `conversa.ts`.
  //
  // A regra agora depende do CAMINHO, e a distinção é o ponto:
  //   • modo COOKIE — a credencial vale para o domínio inteiro e guarda UM
  //     cliente. É onde tela e conversa podem discordar: **selo obrigatório**.
  //   • TOKEN explícito — o token identifica o cliente na própria requisição;
  //     não há dois lados para divergir. Exigir o selo aí quebraria link
  //     legítimo sem fechar buraco nenhum.
  it("✅ com TOKEN explícito o selo não é exigido — e é por não haver o que comparar", async () => {
    const lidas = await corpos(await lerConversa(get(`/api/portal/messages?token=${TOKEN_ALFA}`)));
    expect(lidas).toContain(SEGREDO_1);
  });

  it("⛔ em modo COOKIE o selo ausente RECUSA — a trava não se desliga sendo omitida", async () => {
    const res = await lerConversa(get("/api/portal/messages", TOKEN_ALFA));
    const bruto = JSON.stringify(await res.json());
    expect(bruto).not.toContain("SEGREDO-DO-ALFA");
    expect(bruto).toContain("dono-divergente");
  });

  it("⛔ dono FORJADO não abre a conversa de ninguém — a declaração só recusa", async () => {
    // A tela declara ser o ALFA, mas a credencial é do BETA. O dono continua
    // sendo DERIVADO do token; a declaração não concede nada.
    const res = await lerConversa(get(`/api/portal/messages?token=${TOKEN_BETA}&dono=${donoDaTela(alfa)}`));
    const bruto = JSON.stringify(await res.json());
    expect(bruto).not.toContain("SEGREDO-DO-ALFA");
    expect(bruto).toContain("dono-divergente");
  });
});
