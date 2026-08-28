// A JORNADA DO PARCEIRO, DE PONTA A PONTA, CONTRA UM BANCO DE VERDADE.
//
// ═══ POR QUE ESTE ARQUIVO EXISTE (28/08/2026) ═══════════════════════════════
//
// Um cliente real entra amanhã de manhã pelo link de parceiro. Cada peça do
// caminho dele já tem teste próprio — e é exatamente esse o problema que esta
// casa mediu **dez vezes em 48 horas**: duas metades provadas isoladamente, com
// NADA ligando as duas. *A pergunta obrigatória é "quem CHAMA isto?"*
//
// Este teste não prova peça. Ele prova a TRAVESSIA: o token do link vira
// cliente, a conversa vira rastro, o rastro vira pedido, o pedido ganha isenção
// derivada, e o portão de pagamento abre sem um centavo trocar de mão.
//
// A ÚNICA coisa dublada é a chamada de IA — a travessia não pode depender de
// rede nem gastar crédito para ser verificada, e o que está sob teste é o
// TRANSPORTE, não o texto que o modelo escreve.
//
// ⚠️ UM DOS TESTES AQUI PROVA UM DEFEITO VIVO, e falha de propósito seria a
// leitura errada: ele AFIRMA o comportamento defeituoso de hoje (a pergunta de
// verba que continua sendo feita ao parceiro) para que o conserto o derrube.
// Está marcado com 🔴 e explicado no lugar.

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";

// O caminho do banco precisa estar no ambiente ANTES de qualquer import ser
// avaliado — o cliente Prisma lê DATABASE_URL na criação. Em ESM os imports
// rodam antes do corpo do módulo, então uma atribuição comum aqui chegaria
// tarde demais e o teste falaria com o banco de desenvolvimento.
const DB_PATH = vi.hoisted(() => {
  const caminho = `${process.cwd()}/prisma/jornada-parceiro-e2e.db`;
  process.env.DATABASE_URL = `file:${caminho}`;
  return caminho;
});

// ⛔ CUSTO ZERO: nenhuma chamada de IA sai desta suíte.
vi.mock("@/lib/ai/generate", () => ({
  generate: vi.fn(async () => ({ ok: false, error: "IA dublada — travessia não gasta crédito" })),
  anyProviderConfigured: vi.fn(async () => false),
}));

import { prisma } from "@/lib/db/client";
import { autorizarParceriaDoCliente, parceriaVivaDoCliente } from "@/lib/agency/financeiro/parceria-do-parceiro";
import { cunharConviteDeParceria, resolverConviteDeParceria } from "@/lib/agency/comercial/convite-de-parceria";
import { guardarRastroDaConversa, conversasSemPedido } from "@/lib/agency/comercial/conversa-sem-pedido";
import { promoverConversasParadas } from "@/lib/agency/comercial/promover-conversas-paradas";
import { conferirPagamento } from "@/lib/agency/financeiro/portao-de-pagamento";
import { initProspectConvState, processProspectMessage } from "@/lib/agency/prospect-engine";
import { remainingRequiredQuestions, dispensadoDeVerba } from "@/lib/agency/question-engine";
import { canSubmitProposal } from "@/lib/agency/sdr-agent";
import type { BriefingScope } from "@/lib/agency/briefing-conversation";
import { lerContato } from "@/lib/agency/comercial/contato-do-lead";
import { motivoDoBloqueioDeSaida } from "@/lib/agency/cliente-falso/trava-de-saida";
import { textoDaIsencao, TITULO_DA_ISENCAO } from "@/lib/agency/comercial/aviso-de-isencao";

let workspaceId = "";
let clientId = "";
let tokenDoConvite = "";

// O fio da conversa do parceiro. É a chave de idempotência do pedido.
const SESSION_ID = "sess-marcos-foocci-28ago";

// O escopo que o parceiro deixa na conversa. Tudo aqui é palavra DELE — a
// promoção se recusa a preencher lacuna, e um escopo de consolo faria o teste
// provar uma travessia que a casa não faz.
const ESCOPO_DO_PARCEIRO: Partial<BriefingScope> = {
  prospectName: "Marcos",
  businessName: "FOOCCI",
  segment: "SaaS de CRM para restaurantes",
  wantsSocialMedia: true,
  // ⚠️ O volume mora em `social.postsPerWeek`, não na raiz do escopo:
  // `volumeDeclarado` (live-calculator.ts:241) só olha aqui, e sem ele
  // `computeEstimate` TRAVA — a conta não fecha e a promoção recusa, com a
  // pendência nomeada. Foi o que esta travessia mediu na primeira rodada.
  social: { platforms: ["instagram"], postsPerWeek: 3 },
  objectives: ["aparecer para donos de restaurante"],
};

beforeAll(async () => {
  if (existsSync(DB_PATH)) rmSync(DB_PATH);
  execSync("npx prisma db push --accept-data-loss", {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: `file:${DB_PATH}` },
    stdio: "pipe",
  });

  const ws = await prisma.agencyWorkspace.create({
    data: { name: "Dioli Digital", slug: `jornada-${Date.now()}` },
  });
  workspaceId = ws.id;

  // O cadastro do parceiro. Nasce SEM e-mail de propósito: é assim que o
  // cadastro do primeiro cliente real nasceu, e o ponto 3 do diagnóstico
  // depende de o contato vir do briefing, não da ficha.
  const cliente = await prisma.client.create({
    data: { workspaceId, name: "FOOCCI", industry: "SaaS" },
  });
  clientId = cliente.id;

  // A autorização da parceria — pela função real, com dono nominal, validade e
  // teto. Sem ela nada nesta travessia acontece, e é esse o desenho.
  const parceria = await autorizarParceriaDoCliente({
    clientId,
    autorizadaPor: "Dioli Santos (CEO), citando D-0B9",
    validaAte: new Date(Date.now() + 30 * 24 * 3600 * 1000),
    escopo: "social media — piloto de parceria",
    pecasContratadas: 12,
    tetoDeIaCentavosUsd: 500,
  });
  if (!parceria.ok) throw new Error(`a parceria não foi autorizada: ${parceria.recusa}`);

  const convite = await cunharConviteDeParceria({
    clientId,
    criadoPor: "Dioli Santos (CEO)",
  });
  if (!convite.ok) throw new Error(`o convite não foi cunhado: ${convite.recusa}`);
  tokenDoConvite = convite.token;
});

afterAll(async () => {
  await prisma.$disconnect().catch(() => {});
  if (existsSync(DB_PATH)) rmSync(DB_PATH);
});

describe("a jornada do parceiro, de ponta a ponta, com banco real", () => {
  // ── PONTO 1 ───────────────────────────────────────────────────────────────
  it("1. o token do link resolve no SERVIDOR e devolve o cliente parceiro", async () => {
    const resolvido = await resolverConviteDeParceria(tokenDoConvite);
    expect(resolvido, "o link entregue ao parceiro não resolve — a jornada morre no primeiro passo").not.toBeNull();
    expect(resolvido!.clientId).toBe(clientId);
    expect(resolvido!.parceria.autorizadaPor).toContain("Dioli Santos");
  });

  it("1b. token inventado na barra de endereço vale o mesmo que nenhum", async () => {
    expect(await resolverConviteDeParceria("token-que-eu-inventei")).toBeNull();
    expect(await resolverConviteDeParceria("")).toBeNull();
    expect(await resolverConviteDeParceria(undefined)).toBeNull();
  });

  // ── PONTO 2 — O DEFEITO ───────────────────────────────────────────────────
  //
  // 🔴 ESTE TESTE AFIRMA O DEFEITO DE HOJE, NÃO O COMPORTAMENTO DESEJADO.
  //
  // `dispensadoDeVerba` lê `state.parceriaDeclarada`. Esse campo existe no tipo
  // (`briefing-conversation.ts:292`), é lido (`question-engine.ts:1031`) e o
  // comentário ao lado dele afirma que "o SERVIDOR preenche" — mas **nenhuma
  // linha de produção escreve nele**. A sala monta o `ConvState` em
  // `PublicBriefingRoom.tsx:1676` sem o campo, e `/api/sdr/chat` devolve apenas
  // `{ok, reply, needsClarification, scope}`: a parceria que o servidor
  // resolveu nunca volta para quem decide a fila de perguntas.
  //
  // Resultado: o parceiro É perguntado sobre verba, que é exatamente a pergunta
  // que travou a conversa do primeiro cliente real às 13:43 de 27/08.
  //
  // Quando o conserto chegar, este teste falha — e é assim que ele avisa.
  it("🔴 2. DEFEITO VIVO: o parceiro AINDA é perguntado sobre verba", () => {
    let estado = initProspectConvState();
    for (const fala of [
      "oi, sou o Marcos da FOOCCI",
      "somos um SaaS de CRM que vende para restaurantes",
      "queremos Instagram, uns 3 posts por semana",
      "queremos aparecer para donos de restaurante",
    ]) {
      estado = processProspectMessage(fala, estado);
    }

    // A sala nunca soube da parceria: o campo chega vazio.
    expect(
      estado.conv.parceriaDeclarada,
      "se isto deixou de ser nulo, o conserto chegou — troque este teste pelo inverso",
    ).toBeFalsy();

    // E por isso a dispensa nunca vale.
    expect(dispensadoDeVerba(estado.conv)).toBe(false);

    const pendentes = remainingRequiredQuestions(estado.conv).map((q) => q.id);
    expect(
      pendentes,
      "a pergunta que a parceria deveria poupar do parceiro continua na fila",
    ).toContain("budget_range");
  });

  it("🔴 2b. DEFEITO VIVO: o botão de fechar o pedido fica travado para o parceiro", () => {
    let estado = initProspectConvState();
    for (const fala of [
      "oi, sou o Marcos da FOOCCI",
      "somos um SaaS de CRM que vende para restaurantes",
      "queremos Instagram, uns 3 posts por semana",
      "queremos aparecer para donos de restaurante",
    ]) {
      estado = processProspectMessage(fala, estado);
    }
    // `canSubmitProposal` exige fila vazia, e `budget_range` continua nela.
    expect(
      canSubmitProposal(estado.conv, estado.sdr),
      "se isto virou true, o parceiro passou a fechar pela sala — atualize o diagnóstico",
    ).toBe(false);
  });

  // ── O QUE FECHA A PORTA — descoberto por MUTAÇÃO ─────────────────────────
  //
  // A mutação "a validade da parceria deixa de valer" SOBREVIVEU à primeira
  // versão desta suíte: a parceria daqui nasce viva, então apagar o teste de
  // validade não mudava nada. Um teste que só exercita o caminho feliz não
  // prova a trava — prova o contrário dela. Estes dois fecham o buraco.
  it("1c. parceria VENCIDA não abre a porta — o link do parceiro morre com ela", async () => {
    const outro = await prisma.client.create({ data: { workspaceId, name: "Parceiro Vencido" } });
    await prisma.parceriaDoCliente.create({
      data: {
        clientId: outro.id,
        autorizadaPor: "Dioli Santos (CEO)",
        validaAte: new Date(Date.now() - 24 * 3600 * 1000), // ontem
        escopo: "piloto encerrado",
        pecasContratadas: 4,
        tetoDeIaCentavosUsd: 100,
      },
    });
    const convite = await prisma.conviteDeParceria.create({
      data: {
        token: `tok-vencido-${Date.now()}`,
        clientId: outro.id,
        criadoPor: "Dioli Santos (CEO)",
        expiraEm: new Date(Date.now() + 7 * 24 * 3600 * 1000), // o CONVITE ainda vale
      },
    });

    expect(await parceriaVivaDoCliente(outro.id)).toBeNull();
    // O convite não vencido NÃO salva a parceria vencida: a régua é a parceria.
    expect(
      await resolverConviteDeParceria(convite.token),
      "um convite dentro da validade abriu a porta de uma parceria que já acabou",
    ).toBeNull();
  });

  it("1d. parceria REVOGADA mata o link no mesmo instante — sem caçar link nenhum", async () => {
    const antes = await resolverConviteDeParceria(tokenDoConvite);
    expect(antes).not.toBeNull();

    await prisma.parceriaDoCliente.update({
      where: { clientId },
      data: { revogadaEm: new Date() },
    });
    expect(await resolverConviteDeParceria(tokenDoConvite)).toBeNull();

    // Devolvido ao estado vivo: os passos seguintes desta travessia dependem dele.
    await prisma.parceriaDoCliente.update({ where: { clientId }, data: { revogadaEm: null } });
    expect(await resolverConviteDeParceria(tokenDoConvite)).not.toBeNull();
  });

  // ── PONTOS 3 a 5 — A VIA QUE SALVA A JORNADA ──────────────────────────────
  it("3. a conversa do parceiro deixa rastro CARIMBADO com o cliente do convite", async () => {
    const gravou = await guardarRastroDaConversa({
      sessionId: SESSION_ID,
      workspaceId,
      escopo: ESCOPO_DO_PARCEIRO,
      // O contato que o parceiro digitou NO BRIEFING — o cadastro nasceu sem
      // e-mail, então é este endereço que o aviso de orçamento vai usar.
      contato: { email: "marcos@foocci.com.br" },
      turnos: 4,
      clienteDoConvite: clientId,
    });
    expect(gravou, "sem rastro não há o que promover — a jornada para aqui").toBe(true);

    const rastros = await conversasSemPedido(workspaceId);
    expect(rastros.length).toBe(1);
    expect(rastros[0]!.clienteDoConvite).toBe(clientId);
  });

  it("4. o relógio promove o rastro a PEDIDO do parceiro — sem ninguém clicar", async () => {
    const r = await promoverConversasParadas();

    expect(
      r.falhas,
      `a promoção falhou: ${r.falhas.join(" · ")}`,
    ).toEqual([]);
    expect(
      r.promovidos.length,
      `nenhuma conversa promovida (pendências: ${JSON.stringify(r.pendencias)}, sem parceria: ${r.semParceria})`,
    ).toBe(1);

    const promovido = r.promovidos[0]!;
    expect(promovido.clientId, "o pedido nasceu em outro cadastro que não o do parceiro").toBe(clientId);

    const pedido = await prisma.clientRequestDb.findUnique({ where: { id: promovido.clientRequestId } });
    expect(pedido).not.toBeNull();
    expect(pedido!.clientId).toBe(clientId);
    expect(pedido!.businessName).toBe("FOOCCI");
  });

  it("5. a isenção do pedido foi DERIVADA da parceria — ninguém a digitou", async () => {
    const pedido = await prisma.clientRequestDb.findFirst({ where: { clientId } });
    expect(pedido).not.toBeNull();

    const isencao = await prisma.isencaoDeParceria.findUnique({
      where: { clientRequestId: pedido!.id },
    });
    expect(isencao, "sem isenção derivada o portão fecha e a produção não anda").not.toBeNull();
    expect(isencao!.autorizadaPor).toContain("Dioli Santos");
    expect(isencao!.observacao).toContain("derivada da parceria");

    // Os termos são os MESMOS da autorização — uma fonte, um valor.
    const parceria = await parceriaVivaDoCliente(clientId);
    expect(isencao!.tetoDeIaCentavosUsd).toBe(parceria!.tetoDeIaCentavosUsd);
    expect(isencao!.pecasContratadas).toBe(parceria!.pecasContratadas);
  });

  // ── PONTO 3 — O E-MAIL, que é a pergunta que o CEO fez ───────────────────
  //
  // "por que o orçamento não chegou no e-mail?" O cadastro do parceiro nasce SEM
  // e-mail (ver o `beforeAll`), então o único endereço que existe é o que ele
  // digitou no briefing. Se o pedido promovido não carregar esse contato, o
  // aviso de orçamento não tem para onde ir.
  it("5b. o pedido promovido carrega o e-mail que o parceiro digitou NO BRIEFING", async () => {
    const pedido = await prisma.clientRequestDb.findFirst({ where: { clientId } });
    const contato = lerContato({ briefingJson: pedido!.briefingJson });

    expect(contato.email, "o contato do briefing não chegou no pedido — o orçamento não teria para onde ir").toBe(
      "marcos@foocci.com.br",
    );
    expect(contato.temComoFalar).toBe(true);
    expect(pedido!.status, "sem contato o pedido nasceria `lead_incompleto`").toBe("new");

    // E o cadastro do cliente continua sem e-mail: o endereço veio do briefing,
    // não da ficha. É exatamente o caso do primeiro cliente real.
    const ficha = await prisma.client.findUnique({ where: { id: clientId } });
    expect(ficha!.email).toBeNull();
  });

  it("5c. a trava de contato falso NÃO barra o endereço legítimo do parceiro", () => {
    // A trava existe para `.invalid` (RFC 2606) e para o modo de cliente falso.
    expect(motivoDoBloqueioDeSaida("email", "marcos@foocci.com.br")).toBeNull();
    // E continua barrando o que ela existe para barrar.
    expect(motivoDoBloqueioDeSaida("email", "qualquer@cliente-falso.invalid")).toBe("dominio_inexistente");
    // Domínio REAL que só contém a palavra não é censurado.
    expect(motivoDoBloqueioDeSaida("email", "fulano@x.invalid.com.br")).toBeNull();
  });

  it("6. o portão de pagamento LIBERA por parceria — e não por pagamento", async () => {
    const pedido = await prisma.clientRequestDb.findFirst({ where: { clientId } });
    const veredito = await conferirPagamento(pedido!.id);

    expect(
      veredito.liberado,
      `a produção do parceiro ficou barrada: ${"motivo" in veredito ? veredito.motivo : "?"}`,
    ).toBe(true);
    expect(veredito.motivo).toBe("parceria_isenta");
  });

  // ── PONTO 4 — O QUE O PARCEIRO LÊ NA PROPOSTA ────────────────────────────
  //
  // Alcança o TEXTO, não a estrutura: é a frase que ele lê na tela que decide
  // se ele acha que vai ser cobrado.
  it("6b. a proposta diz 100% ISENTO, com prazo, e sem preço na frase", async () => {
    const pedido = await prisma.clientRequestDb.findFirst({ where: { clientId } });
    // A MESMA fonte que `app/api/portal/briefing/proposta/route.ts:100` usa.
    const parceria = await parceriaVivaDoCliente(pedido!.clientId);
    expect(parceria, "sem isto a proposta do parceiro sairia como a de um pagante").not.toBeNull();

    const linhas = textoDaIsencao({
      autorizadaPor: parceria!.autorizadaPor,
      validaAte: parceria!.validaAte.toISOString(),
      escopo: parceria!.escopo,
    });

    // O título leva ponto final na composição (`textoDaIsencao`).
    expect(linhas[0]).toBe(`${TITULO_DA_ISENCAO}.`);
    expect(linhas[0]).toContain("100% isento");
    // O prazo aparece — parceria eterna vira esquecimento.
    expect(linhas.join(" ")).toMatch(/vale at[ée]/i);
    // ⛔ A frase da isenção NUNCA carrega preço: dizer "isento" não é dizer valor.
    // ⚠️ Só "R$": o ANO da validade é um número de 4 dígitos legítimo, e uma
    // regex de dígitos barraria a própria data que o teste acima exige.
    expect(
      linhas.join(" "),
      "a frase da isenção vazou um preço — ela existe justamente para não ser sobre dinheiro",
    ).not.toMatch(/R\$/);
  });

  it("7. ⛔ nenhum pagamento falso de R$ 0 foi inventado — receita de parceria é ZERO", async () => {
    const pagamentos = await prisma.pagamentoConfirmado.count();
    expect(
      pagamentos,
      "alguém escreveu um pagamento para o parceiro passar — isso contamina o financeiro como venda",
    ).toBe(0);
  });
});
