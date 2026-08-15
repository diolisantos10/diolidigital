// AS DUAS METADES DE TESTE DE CADA VARREDURA — exigência do kit
// (`16-raio-x-noturno.md`, regra 3): "cada varredura nasce com a que prova que
// ela ACHA o problema quando ele existe, e a que prova que ela NÃO INVENTA
// problema quando ele não existe. Varredura só vista achando coisa é
// indistinguível de varredura que alarma sempre."
//
// Por isso cada bloco abaixo tem exatamente esse par. O caso limpo não é
// enfeite: é ele que sustenta a comparação com ontem, porque varredura que
// alarma sempre transforma "37 contra 4 ontem" em "37 contra 37".

import { describe, it, expect } from "vitest";
import type { Arquivo } from "@/lib/raio-x/fonte";
import type { ResultadoDeVarredura } from "@/lib/raio-x/tipos";
import { varrerTrabalhoInvisivel } from "@/lib/raio-x/varreduras/trabalho-invisivel";
import { varrerIdSemDono } from "@/lib/raio-x/varreduras/id-sem-dono";
import { varrerPromessaNaoCumprida } from "@/lib/raio-x/varreduras/promessa-nao-cumprida";
import { varrerEstadoMorto } from "@/lib/raio-x/varreduras/estado-morto";
import { varrerPortaAberta } from "@/lib/raio-x/varreduras/porta-aberta";

const f = (caminho: string, texto: string): Arquivo => ({ caminho, texto });

describe("padrão 1 — trabalho que existe e ninguém vê", () => {
  it("acha o laço pago que engole o erro (a forma das 1.728 imagens/dia)", () => {
    const r = varrerTrabalhoInvisivel([
      f(
        "lib/agency/media/artes.ts",
        `export async function gerar(posts) {
           for (const post of posts) {
             try { await gerarImagem(post.prompt); }
             catch { continue; }
           }
         }`
      ),
    ]);
    expect(r.status).toBe("rodou");
    expect(r.achados).toHaveLength(1);
    expect(r.achados[0]!.titulo).toContain("gerarImagem");
    expect(r.achados[0]!.evidencia).toContain("lib/agency/media/artes.ts:2");
  });

  it("não inventa: laço pago com teto e erro marcado passa limpo", () => {
    const r = varrerTrabalhoInvisivel([
      f(
        "lib/agency/media/artes.ts",
        `const MAX_POR_CLIENTE = 40;
         export async function gerar(posts) {
           for (const post of posts.slice(0, MAX_POR_CLIENTE)) {
             try { await gerarImagem(post.prompt); }
             catch (e) { await marcarErro(post.id, e); }
           }
         }`
      ),
    ]);
    expect(r.achados).toEqual([]);
    expect(r.medidas.lacosComMotorPago).toBe(1);
  });

  it("devolve CEGA quando não leu arquivo nenhum — nunca 'está tudo bem'", () => {
    const r = varrerTrabalhoInvisivel([]);
    expect(r.status).toBe("cega");
    expect(r.motivo).toBeTruthy();
  });
});

describe("padrão 2 — id aceito sem conferir de quem é", () => {
  it("acha a rota que exige login mas não confere dono", () => {
    const r = varrerIdSemDono([
      f(
        "app/api/portal-access/route.ts",
        `export async function POST(request) {
           const guard = await requireSession();
           const body = await request.json();
           const link = await gerarLink(body.clientId);
           return Response.json({ link });
         }`
      ),
    ]);
    expect(r.achados).toHaveLength(1);
    expect(r.achados[0]!.titulo).toContain("não confere de quem é o id");
    expect(r.achados[0]!.evidencia).toContain("clientId");
  });

  it("não inventa: rota que passa pela fronteira de posse passa limpo", () => {
    const r = varrerIdSemDono([
      f(
        "app/api/portal-access/route.ts",
        `import { clienteDoWorkspace } from "@/lib/auth/posse-de-workspace";
         export async function POST(request) {
           const guard = await requireSession();
           const body = await request.json();
           if (!(await clienteDoWorkspace(body.clientId, guard.session.workspaceId))) return naoEncontrado();
           return Response.json({ ok: true });
         }`
      ),
    ]);
    expect(r.achados).toEqual([]);
    expect(r.medidas.rotasQueRecebemId).toBe(1);
  });
});

// A partir da calibração de 15/08/2026 a medida do P0 vem de `retratoDosPortoes()`,
// o registro — não mais de contar `autoCheckable:` no texto. Consequência: o achado
// do P0 acompanha a varredura SEMPRE, e não só quando ela por acaso leu aquele
// arquivo. Por isso os casos abaixo olham os carimbos, que é o que eles medem.
// (As duas metades do P0 estão em `calibracao-vocabulario-v2.test.ts`.)
const carimbosDe = (r: ResultadoDeVarredura) => r.achados.filter((a) => a.chave.startsWith("carimbo-fixo"));

describe("padrão 3 — promessa que o código não cumpre", () => {
  it("acha o veredito gravado como literal", () => {
    const r = varrerPromessaNaoCumprida([
      f("lib/dioli-brain/quality-engine.ts", `const resultado = { semAlucinacao: true, nota: calcular() };`),
    ]);
    expect(carimbosDe(r)).toHaveLength(1);
    expect(carimbosDe(r)[0]!.titulo).toContain("semAlucinacao");
  });

  it("não inventa: veredito que vem de uma checagem que rodou passa limpo", () => {
    const r = varrerPromessaNaoCumprida([
      f("lib/dioli-brain/quality-engine.ts", `const resultado = { semAlucinacao: await conferirLastro(texto) };`),
    ]);
    expect(carimbosDe(r)).toEqual([]);
  });

  it("mede o P0 da casa: quantas checagens nenhum código roda", () => {
    const r = varrerPromessaNaoCumprida(
      [f("lib/dioli-brain/quality-engine.ts", `const nota = calcular();`)],
      () => ({ total: 3, comMecanismo: 1, comLacuna: 2, bloqueantesSemMecanismo: 2 }),
    );
    expect(r.medidas.checagensDeQualidade).toBe(3);
    expect(r.medidas.checagensNaoExecutaveis).toBe(2);
    expect(r.achados.some((a) => a.chave === "p0-checagens-nao-executaveis")).toBe(true);
  });
});

describe("padrão 4 — estado morto", () => {
  it("acha o estado que a tela grava e ninguém lê (a cicatriz da aprovação)", () => {
    const r = varrerEstadoMorto([
      f("app/api/aprovar/route.ts", `await prisma.socialPost.update({ where: { id }, data: { status: "approved" } });`),
      f("lib/agency/esteira/relogio.ts", `const fila = await prisma.socialPost.findMany({ where: { status: "scheduled" } });`),
    ]);
    const mortos = r.achados.map((a) => a.chave);
    expect(mortos).toContain("estado-morto:status=approved");
    expect(r.achados.find((a) => a.chave === "estado-morto:status=approved")!.evidencia).toContain("0 leitura");
  });

  it("não inventa: estado escrito E lido passa limpo", () => {
    const r = varrerEstadoMorto([
      f("app/api/aprovar/route.ts", `await prisma.socialPost.update({ where: { id }, data: { status: "approved" } });`),
      f("lib/agency/esteira/relogio.ts", `const fila = await prisma.socialPost.findMany({ where: { status: "approved" } });`),
    ]);
    expect(r.achados).toEqual([]);
  });

  it("a ordem dos arquivos não muda o veredito (o leitor pode vir antes do escritor)", () => {
    // Regressão da primeira rodada de verdade: numa passada só, a leitura em
    // `app/agency/requests/page.tsx` era processada ANTES da escrita em `lib/`,
    // o estado ainda não existia no mapa, e a varredura declarava morto um
    // estado que a tela lê. Veredito que depende de ordem alfabética não é
    // veredito.
    const leitor = f("app/agency/requests/page.tsx", `const revisar = pedidos.filter((r) => r.status === "scope_ready");`);
    const escritor = f("lib/agency/negociar.ts", `await prisma.clientRequestDb.update({ where: { id }, data: { status: "scope_ready" } });`);
    expect(varrerEstadoMorto([leitor, escritor]).achados).toEqual([]);
    expect(varrerEstadoMorto([escritor, leitor]).achados).toEqual([]);
  });

  it("leitura por comparação solta também conta como leitor", () => {
    const r = varrerEstadoMorto([
      f("app/api/aprovar/route.ts", `await prisma.socialPost.update({ where: { id }, data: { status: "approved" } });`),
      f("components/card.tsx".replace("components", "lib"), `const pronto = post.status === "approved";`),
    ]);
    expect(r.achados).toEqual([]);
  });
});

describe("padrão 5 — porta aberta para a internet", () => {
  it("acha a rota sem guarda encostada em motor pago (a de /api/generate-image)", () => {
    const r = varrerPortaAberta([
      f(
        "app/api/generate-image/route.ts",
        `export async function POST(request) {
           const { prompt } = await request.json();
           const url = await gerarImagem(prompt);
           return Response.json({ url });
         }`
      ),
    ]);
    expect(r.achados).toHaveLength(1);
    expect(r.achados[0]!.gravidade).toBe("alto");
    expect(r.achados[0]!.titulo).toContain("motor pago");
  });

  it("não inventa: rota com guarda de sessão passa limpo", () => {
    const r = varrerPortaAberta([
      f(
        "app/api/generate-image/route.ts",
        `export async function POST(request) {
           const guard = await requireSession();
           if (!guard.ok) return guard.response;
           const url = await gerarImagem((await request.json()).prompt);
           return Response.json({ url });
         }`
      ),
    ]);
    expect(r.achados).toEqual([]);
  });

  it("não inventa: rota pública por contrato não vira achado", () => {
    const r = varrerPortaAberta([
      f("app/api/health/route.ts", `export async function GET() { await prisma.$queryRaw\`SELECT 1\`; return Response.json({ ok: true }); }`),
    ]);
    expect(r.achados).toEqual([]);
  });
});
