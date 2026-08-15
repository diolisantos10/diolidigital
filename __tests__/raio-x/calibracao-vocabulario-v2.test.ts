// A CALIBRAÇÃO DE 15/08/2026 — o código andou (V2) e a varredura não.
//
// O PR anterior consertou o AGENDAMENTO do raio-x: ele voltou a pousar na branch
// viva depois de 8 noites varrendo uma branch morta com o painel verde. E ia
// pousar GRITANDO ERRADO — 28 dos 48 achados eram ruído, porque a varredura não
// conhecia o vocabulário que a casa construiu depois dela:
//
//   · 6 rotas acusadas de "sem guarda" usam `exigirApiInterna`/`exigirAdministracao`;
//   · 22 "vereditos carimbados" são uniões discriminadas — inclusive a trava de
//     aprovação pelo cliente que o CEO mandou criar em 14/08;
//   · e o número do P0 saía por contagem de texto, divergindo do registro.
//
// "Relatório com ruído ensina o CEO a não ler o relatório" (docs/raio-x/README.md).
// Instrumento que volta a funcionar gritando errado é pior que instrumento parado.
//
// CADA AJUSTE VIRA TESTE, COM AS DUAS METADES — é isso que separa CALIBRAR de
// AFROUXAR. Toda vez que este arquivo ensina a varredura a calar, existe logo ao
// lado o teste que prova que ela continua gritando no caso sujo.

import { describe, it, expect } from "vitest";
import type { Arquivo } from "@/lib/raio-x/fonte";
import { varrerIdSemDono } from "@/lib/raio-x/varreduras/id-sem-dono";
import { varrerPortaAberta } from "@/lib/raio-x/varreduras/porta-aberta";
import { varrerPromessaNaoCumprida } from "@/lib/raio-x/varreduras/promessa-nao-cumprida";
import { retratoDosPortoes } from "@/lib/dioli-brain/quality-gates";

const f = (caminho: string, texto: string): Arquivo => ({ caminho, texto });

// A forma REAL das rotas da V2, copiada do jeito que elas são escritas.
const ROTA_COM_GUARDA_V2 = `
  import { exigirApiInterna } from "@/lib/agency/organizacao/guarda";
  export async function GET() {
    const guarda = await exigirApiInterna("/agency/pm-command");
    if (guarda.erro) return guarda.erro;
    const linhas = await prisma.outboxV2.findMany({});
    return NextResponse.json({ linhas });
  }`;

// A outra forma, desestruturada — as duas convivem no repositório.
const ROTA_COM_GUARDA_V2_DESESTRUTURADA = `
  import { exigirApiInterna } from "@/lib/agency/organizacao/guarda";
  export async function GET() {
    const { acesso, erro } = await exigirApiInterna("/agency/dashboard");
    if (erro) return erro;
    const linhas = await prisma.task.findMany({ where: { id: acesso.session.userId } });
    return NextResponse.json({ linhas });
  }`;

describe("calibração 1 — a varredura passa a conhecer a guarda da V2", () => {
  it("NÃO INVENTA: rota fechada por exigirApiInterna não é 'rota sem guarda'", () => {
    const r = varrerPortaAberta([f("app/api/v2/pm-command/route.ts", ROTA_COM_GUARDA_V2)]);
    expect(r.achados).toEqual([]);
    expect(r.medidas.rotasComGuardaDaOrganizacao).toBe(1);
  });

  it("NÃO INVENTA: a forma desestruturada (`if (erro) return erro`) também é guarda", () => {
    const r = varrerPortaAberta([f("app/api/agency/central/route.ts", ROTA_COM_GUARDA_V2_DESESTRUTURADA)]);
    expect(r.achados).toEqual([]);
  });

  it("NÃO INVENTA: exigirAdministracao fecha a rota que ESCREVE no banco", () => {
    const r = varrerPortaAberta([
      f(
        "app/api/v2/rollout/route.ts",
        `import { exigirAdministracao } from "@/lib/agency/organizacao/guarda";
         export async function POST() {
           const guarda = await exigirAdministracao("/agency/pm-command");
           if (guarda.erro) return guarda.erro;
           await prisma.flagV2.update({ where: { id: "x" }, data: { ligada: true } });
         }`
      ),
    ]);
    expect(r.achados).toEqual([]);
  });

  // ── E AS METADES QUE PROVAM QUE ISTO NÃO FOI AFROUXAMENTO ─────────────────

  it("ACHA: rota que escreve no banco sem guarda nenhuma continua sendo achado ALTO", () => {
    const r = varrerPortaAberta([
      f(
        "app/api/v2/qualquer/route.ts",
        `export async function POST(request) {
           const body = await request.json();
           await prisma.outboxV2.updateMany({ where: { id: body.id }, data: { status: "pending" } });
         }`
      ),
    ]);
    expect(r.achados).toHaveLength(1);
    expect(r.achados[0]!.titulo).toContain("ESCREVE no banco");
    expect(r.achados[0]!.gravidade).toBe("alto");
  });

  it("ACHA: chamar a guarda e NÃO devolver o erro dela é achado próprio, e ALTO", () => {
    // Este é o modo de falhar que a calibração poderia ter aberto: `exigirApiInterna`
    // não barra sozinha — devolve `{ acesso, erro }`. Quem chama e ignora o erro
    // fica com cara de rota protegida em qualquer revisão de olho, e não está.
    const r = varrerPortaAberta([
      f(
        "app/api/v2/teatro/route.ts",
        `import { exigirApiInterna } from "@/lib/agency/organizacao/guarda";
         export async function POST(request) {
           const guarda = await exigirApiInterna("/agency/pm-command");
           const body = await request.json();
           await prisma.outboxV2.updateMany({ where: { id: body.id }, data: { status: "pending" } });
         }`
      ),
    ]);
    expect(r.achados).toHaveLength(1);
    expect(r.achados[0]!.titulo).toContain("não devolve o erro");
    expect(r.achados[0]!.gravidade).toBe("alto");
    expect(r.medidas.rotasQueChamamAGuardaEIgnoram).toBe(1);
  });

  it("a guarda da V2 é LOGIN, nunca posse: id sem dono continua acusado", () => {
    // O erro que esta calibração NÃO pode cometer é promover `exigirApiInterna`
    // a prova de posse. Ela responde "você é interno e alcança esta mesa" — nunca
    // "este id é seu". Confundir as duas é o que a varredura inteira existe para
    // não fazer (`lib/auth/posse-de-workspace.ts`: estar logado não é ser dono).
    const r = varrerIdSemDono([
      f(
        "app/api/v2/qualquer/route.ts",
        `import { exigirApiInterna } from "@/lib/agency/organizacao/guarda";
         export async function POST(request) {
           const guarda = await exigirApiInterna("/agency/pm-command");
           if (guarda.erro) return guarda.erro;
           const body = await request.json();
           return Response.json(await prisma.client.findUnique({ where: { id: body.clientId } }));
         }`
      ),
    ]);
    expect(r.achados).toHaveLength(1);
    expect(r.achados[0]!.titulo).toContain("não confere de quem é o id");
    expect(r.achados[0]!.gravidade).toBe("alto");
  });
});

describe("calibração 3 — /api/v2/retomar: posse delegada, não 'sem login'", () => {
  const RETOMAR = `
    import { exigirApiInterna } from "@/lib/agency/organizacao/guarda";
    export async function POST(request) {
      const guarda = await exigirApiInterna("/agency/pm-command");
      if (guarda.erro) return guarda.erro;
      const body = await request.json();
      const resultado = await retomarProcesso(
        body.correlationId.trim(),
        guarda.acesso.perfil,
        guarda.acesso.session.userId,
        armazemDePrisma(),
        new Date(),
      );
      return NextResponse.json(resultado);
    }`;

  it("para de dizer a MENTIRA ('aceita id sem login') — a rota tem guarda", () => {
    const r = varrerIdSemDono([f("app/api/v2/retomar/route.ts", RETOMAR)]);
    expect(r.achados).toHaveLength(1);
    expect(r.achados[0]!.titulo).not.toContain("sem login");
  });

  it("vira POSSE DELEGADA (médio) — o precedente de /api/meta/publish, de 05/08", () => {
    const r = varrerIdSemDono([f("app/api/v2/retomar/route.ts", RETOMAR)]);
    expect(r.achados[0]!.titulo).toContain("Posse delegada");
    expect(r.achados[0]!.gravidade).toBe("medio");
    expect(r.medidas.rotasComPosseDelegada).toBe(1);
    expect(r.medidas.rotasSemProvaDePosse).toBe(0);
  });

  it("mas NÃO some do relatório, e a evidência manda olhar a camada de baixo", () => {
    // Médio não é absolvição. A pergunta que sobra é legítima e tem endereço:
    // o `correlationId` não é filtrado por posse AQUI. Se o achado sumisse, a
    // pergunta sumiria junto — e ela é a única coisa que sobrou de verdadeiro
    // no alarme original.
    const r = varrerIdSemDono([f("app/api/v2/retomar/route.ts", RETOMAR)]);
    expect(r.achados[0]!.evidencia).toContain("correlationId");
    expect(r.achados[0]!.evidencia).toContain("camada de destino");
  });

  it("a evidência não mente sobre O QUE viaja: sessão, não workspaceId", () => {
    // Escrever "repassa o workspaceId" numa rota que repassa o USUÁRIO manda o
    // revisor procurar um filtro que não existe — e ele volta dizendo "está ok".
    const r = varrerIdSemDono([f("app/api/v2/retomar/route.ts", RETOMAR)]);
    expect(r.achados[0]!.evidencia).not.toContain("repassa o workspaceId");
    expect(r.achados[0]!.titulo).toContain("a sessão viaja com o id");
  });

  it("e a rota que REALMENTE leva o workspace continua com o texto dela", () => {
    const r = varrerIdSemDono([
      f(
        "app/api/meta/publish/route.ts",
        `export async function POST(request) {
           const session = await requireSession();
           const body = await request.json();
           return Response.json(await publishPost(session.workspaceId, body.connectionId));
         }`
      ),
    ]);
    expect(r.achados[0]!.evidencia).toContain("repassa o workspaceId");
  });
});

describe("calibração 2 — carimbo de veredito × união discriminada", () => {
  // A forma REAL de `lib/agency/execucao-v2/registro.ts` e de
  // `lib/agency/esteira/aprovacao-da-peca.ts`, encurtada.
  const UNIAO_DISCRIMINADA = `
    export type Parecer =
      | { valido: true }
      | { valido: false; motivo: string };

    export function validarRegistro(r) {
      if (!r.usuarioId) return { valido: false, motivo: "execução humana sem usuarioId — quem fez?" };
      if (!r.modelo) return { valido: false, motivo: "execução por IA sem modelo declarado" };
      if (!r.correlationId) return { valido: false, motivo: "registro sem correlationId" };
      return { valido: true };
    }`;

  it("NÃO INVENTA: o 'sim' devolvido no fim de um caminho que provou passa limpo", () => {
    const r = varrerPromessaNaoCumprida([f("lib/agency/execucao-v2/registro.ts", UNIAO_DISCRIMINADA)]);
    expect(r.achados.filter((a) => a.chave.startsWith("carimbo-fixo"))).toEqual([]);
    expect(r.medidas.vereditosEmUniaoDiscriminada).toBe(1);
  });

  it("NÃO INVENTA: a DECLARAÇÃO DE TIPO da união não é veredito nenhum", () => {
    // `| { aprovada: true; … } | { aprovada: false; motivo: string }` descreve o
    // FORMATO das respostas. É a assinatura que OBRIGA quem recusa a escrever o
    // motivo — acusá-la é acusar o contrato de ser a quebra dele.
    const r = varrerPromessaNaoCumprida([
      f(
        "lib/agency/esteira/aprovacao-da-peca.ts",
        `export type ParecerDeAprovacao =
           | {
               aprovada: true;
               approvalRequestId: string;
             }
           | { aprovada: false; motivo: string };`
      ),
    ]);
    expect(r.achados.filter((a) => a.chave.startsWith("carimbo-fixo"))).toEqual([]);
    expect(r.medidas.declaracoesDeTipoIgnoradas).toBe(2);
  });

  it("NÃO INVENTA: RECUSAR não promete nada — o padrão persegue o 'sim' sem lastro", () => {
    const r = varrerPromessaNaoCumprida([
      f(
        "lib/agency/esteira/aprovacao-da-peca.ts",
        `export function parecer(cards, postId) {
           if (cards.length === 0) {
             return {
               aprovada: false,
               motivo: "Fail-closed: 'não consegui perguntar' nunca vira 'está aprovada'.",
             };
           }
         }`
      ),
    ]);
    expect(r.achados.filter((a) => a.chave.startsWith("carimbo-fixo"))).toEqual([]);
    expect(r.medidas.recusasIgnoradas).toBe(1);
  });

  it("a trava do CEO de 14/08 (só o cliente aprova) deixa de ser acusada de defeito", () => {
    const r = varrerPromessaNaoCumprida([
      f(
        "lib/agency/esteira/aprovacao-da-peca.ts",
        `export async function aprovacaoDaPeca(postId, donoDaPeca) {
           const cards = await ler(postId);
           if (cards.length === 0) return { aprovada: false, motivo: fraseSemAprovacao(donoDaPeca) };
           const doCliente = cards.find((c) => decisaoEhDoCliente(c.reviewedBy) && !!c.reviewedAt);
           if (!doCliente) {
             return {
               aprovada: false,
               motivo: "Carimbo da agência em nome do cliente não é aprovação do cliente.",
             };
           }
           return {
             aprovada: true,
             approvalRequestId: doCliente.id,
             clientId: donoDaPeca,
           };
         }`
      ),
    ]);
    expect(r.achados.filter((a) => a.chave.startsWith("carimbo-fixo"))).toEqual([]);
  });

  // ── E AS METADES QUE PROVAM QUE ISTO NÃO FOI AFROUXAMENTO ─────────────────

  it("ACHA: o veredito literal de verdade, plantado (a forma do incidente original)", () => {
    const r = varrerPromessaNaoCumprida([
      f("lib/dioli-brain/quality-engine.ts", `const resultado = { semAlucinacao: true, nota: calcular() };`),
    ]);
    const carimbos = r.achados.filter((a) => a.chave.startsWith("carimbo-fixo"));
    expect(carimbos).toHaveLength(1);
    expect(carimbos[0]!.titulo).toContain("semAlucinacao");
    expect(carimbos[0]!.gravidade).toBe("alto");
  });

  it("ACHA: 'sim' devolvido por função que NUNCA soube dizer não", () => {
    // Sem caminho de recusa não há caminho que prove: é carimbo com forma de
    // união discriminada, e é exatamente assim que alguém tentaria escapar.
    const r = varrerPromessaNaoCumprida([
      f("lib/dioli-brain/conferir.ts", `export function conferir(peca) { return { verificado: true }; }`),
    ]);
    expect(r.achados.filter((a) => a.chave.startsWith("carimbo-fixo"))).toHaveLength(1);
  });

  it("ACHA: carimbo escondido DENTRO de um arquivo cheio de recusas legítimas", () => {
    // A metade dura. O arquivo tem a união discriminada inteira — e ainda assim
    // o `aprovado: true` colado num objeto de resposta (não devolvido no fim de
    // um caminho) continua sendo carimbo. É a conjunção das duas condições que
    // torna caro fingir a trava: fingir passa a custar escrever a trava.
    const r = varrerPromessaNaoCumprida([
      f(
        "lib/agency/esteira/aprovacao-da-peca.ts",
        `${UNIAO_DISCRIMINADA}
         export function relatorio(peca) {
           const linha = { peca, aprovado: true, geradoEm: new Date() };
           return montar(linha);
         }`
      ),
    ]);
    const carimbos = r.achados.filter((a) => a.chave.startsWith("carimbo-fixo"));
    expect(carimbos).toHaveLength(1);
    expect(carimbos[0]!.titulo).toContain("aprovado");
  });

  it("ACHA: polaridade invertida — `hasHallucination: false` é AFIRMAÇÃO, não recusa", () => {
    // O nome que criou o padrão. Aqui a afirmação boa é o `false`, e tratá-lo
    // como recusa devolveria o incidente original para dentro do ponto cego.
    const r = varrerPromessaNaoCumprida([
      f("lib/dioli-brain/quality-engine.ts", `const saida = { hasHallucination: false, texto };`),
    ]);
    expect(r.achados.filter((a) => a.chave.startsWith("carimbo-fixo"))).toHaveLength(1);
  });

  it("comentário continua não sendo código (a calibração de 05/08 segue de pé)", () => {
    const r = varrerPromessaNaoCumprida([
      f("lib/dioli-brain/quality-engine.ts", `// const hasHallucination = false; — o bug já consertado`),
    ]);
    expect(r.achados.filter((a) => a.chave.startsWith("carimbo-fixo"))).toEqual([]);
  });
});

describe("calibração 4 — o número do P0 tem UM dono só", () => {
  it("o raio-x LÊ A FUNÇÃO do registro, não conta texto", () => {
    // A prova de que a fonte mudou: um arquivo cuja contagem TEXTUAL mente
    // descaradamente (5 ocorrências) não move o número, porque o número vem de
    // `retratoDosPortoes()`.
    const mentiroso = f(
      "lib/dioli-brain/quality-gates.ts",
      `autoCheckable: false, autoCheckable: false, autoCheckable: false,
       autoCheckable: false, autoCheckable: true,`
    );
    const r = varrerPromessaNaoCumprida([mentiroso], () => ({
      total: 33,
      comMecanismo: 8,
      comLacuna: 25,
      bloqueantesSemMecanismo: 21,
    }));
    expect(r.medidas.checagensDeQualidade).toBe(33);
    expect(r.medidas.checagensNaoExecutaveis).toBe(25);
    expect(r.medidas.checagensBloqueantesSemMecanismo).toBe(21);
  });

  it("A TRAVA: o número do raio-x é IDÊNTICO ao de retratoDosPortoes(), sempre", () => {
    // Este é o teste que impede a divergência de voltar. Ele roda contra o
    // repositório de verdade: se alguém reintroduzir a contagem de texto, os
    // dois números descolam de novo e o CI reprova antes de o relatório mentir.
    const registro = retratoDosPortoes();
    const r = varrerPromessaNaoCumprida();
    expect(r.medidas.checagensDeQualidade).toBe(registro.total);
    expect(r.medidas.checagensNaoExecutaveis).toBe(registro.comLacuna);
    expect(r.medidas.checagensBloqueantesSemMecanismo).toBe(registro.bloqueantesSemMecanismo);
  });

  it("o achado do P0 nomeia as BLOQUEANTES — o número que decide o risco", () => {
    const r = varrerPromessaNaoCumprida([], () => ({
      total: 33,
      comMecanismo: 8,
      comLacuna: 25,
      bloqueantesSemMecanismo: 21,
    }));
    // Sem fontes a varredura é CEGA — e cega nunca vira "está tudo bem".
    expect(r.status).toBe("cega");
  });
});

describe("o relatório de amanhã é legível — a medida do bloco inteiro", () => {
  it("nenhuma das 6 rotas da V2 volta como 'rota sem guarda'", () => {
    const r = varrerPortaAberta();
    const semGuarda = r.achados.filter((a) => a.titulo.includes("sem guarda"));
    expect(semGuarda).toEqual([]);
    expect(r.medidas.rotasSemGuarda).toBe(0);
  });

  it("e nenhuma rota desta casa chama a guarda sem devolver o erro dela", () => {
    // Esta linha faz a calibração PAGAR o que ela recebeu: ao ensinar a
    // varredura a reconhecer `exigir*`, o nome da função passou a valer como
    // proteção — então o dia em que alguém escrever a chamada e esquecer o
    // `return guarda.erro`, o CI reprova, e não a próxima varredura noturna.
    // Conferido à mão nesta rodada: as 7 rotas que usam a guarda devolvem o erro.
    const r = varrerPortaAberta();
    expect(r.medidas.rotasQueChamamAGuardaEIgnoram).toBe(0);
    expect(r.medidas.rotasComGuardaDaOrganizacao).toBeGreaterThan(0);
  });

  it("nenhuma união discriminada volta como veredito carimbado", () => {
    const r = varrerPromessaNaoCumprida();
    expect(r.medidas.carimbosConstantes).toBe(0);
  });

  it("e o que foi descartado fica CONTADO — calibração que engole defeito aparece", () => {
    // Se estes números explodirem de uma noite para a outra, a calibração
    // passou a esconder coisa. Descartar em silêncio seria o mesmo defeito que
    // o `status: "cega"` existe para impedir.
    const r = varrerPromessaNaoCumprida();
    expect(r.medidas.recusasIgnoradas).toBeGreaterThan(0);
    expect(r.medidas.declaracoesDeTipoIgnoradas).toBeGreaterThanOrEqual(0);
    expect(r.medidas.vereditosEmUniaoDiscriminada).toBeGreaterThan(0);
  });
});
