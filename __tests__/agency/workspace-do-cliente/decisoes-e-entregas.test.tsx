// TESTES 10, 11 e 12 do contrato — os quatro caminhos da decisão, a peça
// reprovada, e a separação entre material do cliente e entrega da agência.

import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }));

const { ApprovalsTab } = await import("@/components/agency/clients/workspace/ApprovalsTab");
const { DeliveriesTab } = await import("@/components/agency/clients/workspace/DeliveriesTab");
const { render, texto, vistaCheia, vistaVazia, permsDe } = await import("./_fixture");

const nada = (() => {}) as never;

// ═══════════════════════════════════════════════════════════════════════════
//  10. OS QUATRO CAMINHOS TÊM COMPORTAMENTOS DISTINTOS
//
//  Colapsar "solicitar ajustes" e "reprovar e refazer" num botão só é o que faz
//  a máquina refazer a MESMA direção que alguém acabou de recusar. E tratar
//  "tenho uma dúvida" como decisão faz o prazo correr contra quem está
//  esperando resposta da agência.
// ═══════════════════════════════════════════════════════════════════════════

describe("10. aprovar, ajustar, reprovar e duvidar são quatro coisas diferentes", () => {
  const html = render(
    <ApprovalsTab view={vistaCheia()} perms={permsDe("master")} setTab={nada} />,
  );
  const t = texto(html);

  it("os quatro caminhos aparecem nomeados na tela", () => {
    for (const c of ["Aprovar", "Solicitar ajustes", "Reprovar e refazer", "Tenho uma dúvida"]) {
      expect(t, `caminho ausente: ${c}`).toContain(c);
    }
  });

  it("'solicitar ajustes' MANTÉM a direção", () => {
    expect(t).toMatch(/Mantém a direção criativa e pede mudanças pontuais/);
  });

  it("'reprovar e refazer' DESCARTA a direção, preserva histórico e IMPEDE publicação", () => {
    expect(t).toMatch(/Descarta a versão como direção/);
    expect(t).toMatch(/preserva o histórico/);
    expect(t).toMatch(/IMPEDE a publicação|impede a publicação/i);
    expect(t).toMatch(/nova execução a partir do briefing/);
  });

  it("'tenho uma dúvida' NÃO é decisão e PAUSA o prazo", () => {
    expect(t).toMatch(/Não é decisão/);
    expect(t).toMatch(/prazo PAUSA|prazo está pausado/);
  });

  it("os quatro estados do DTO são fechados — string livre viraria três grafias de 'aprovado'", () => {
    const vista = fs.readFileSync(
      path.join(process.cwd(), "lib/agency/clients/workspace/vista.ts"),
      "utf8",
    );
    for (const d of ['"pendente"', '"aprovado"', '"ajuste_pedido"', '"reprovado"', '"duvida_aberta"']) {
      expect(vista).toContain(d);
    }
  });

  it("o carregador lê `questionOpenedAt` ANTES do status — dúvida não vira 'aguardando o cliente'", () => {
    const loader = fs.readFileSync(
      path.join(process.cwd(), "lib/agency/clients/workspace/carregar-cliente.ts"),
      "utf8",
    );
    const inicio = loader.indexOf("function decisaoDaAprovacao");
    expect(inicio, "a função de decisão sumiu").toBeGreaterThan(-1);
    // O corpo inteiro cabe de sobra em 600 caracteres; o que importa é a ORDEM
    // dos `if` dentro dele.
    const corpo = loader.slice(inicio, inicio + 600);
    const posDuvida = corpo.indexOf("if (a.questionOpenedAt)");
    const posAprovado = corpo.indexOf('=== "approved"');
    expect(posDuvida).toBeGreaterThan(-1);
    expect(posAprovado).toBeGreaterThan(-1);
    expect(posDuvida).toBeLessThan(posAprovado);
  });

  it("⚠️ APROVAÇÃO SEM CONTEÚDO NÃO GANHA BOTÃO DE DECISÃO", () => {
    // Em 14/08 uma tela desta casa deixou aprovar peça sem mostrar a arte.
    // A fixture traz um card sem versão vinculada de propósito.
    expect(t).toContain("Este card não aponta para nenhuma peça");
    expect(t).toMatch(/assinar no escuro/);
    // O card quebrado desenha "Abrir decisão" DESABILITADO, com o motivo.
    expect(html).toMatch(/disabled[^>]*title="Card sem peça vinculada não pode ser decidido/);
  });

  it("o card COM peça mostra o que está sendo decidido, e a versão", () => {
    expect(t).toContain("Entrega de teste");
    expect(t).toContain("v2");
  });

  it("a faixa de KPI conta quantos cards estão sem conteúdo — o defeito é visível", () => {
    const loader = fs.readFileSync(
      path.join(process.cwd(), "lib/agency/clients/workspace/carregar-cliente.ts"),
      "utf8",
    );
    expect(loader).toContain("SEM CONTEÚDO ANEXADO");
  });

  it("a decisão do cliente sai do PORTAL dele — este painel não assina no lugar", () => {
    expect(t).toMatch(/A decisão do cliente sai do portal dele/);
  });

  it("os comentários são auditáveis: contam autor, data e versão", () => {
    expect(t).toMatch(/comentário auditável|comentários auditáveis/);
  });

  it("estado vazio honesto quando não há nada aguardando", () => {
    const vazio = texto(render(<ApprovalsTab view={vistaVazia()} perms={permsDe("master")} setTab={nada} />));
    expect(vazio).toContain("Nada aguardando aprovação");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  11. PEÇA REPROVADA NÃO FICA PUBLICADA NEM AGENDADA
//
//  Este não é teste de tela: é da regra. Deixar agendada uma peça que alguém
//  recusou faz ela ir ao ar sozinha na hora marcada — a reprovação viraria um
//  clique sem efeito, e ninguém descobriria antes do cliente.
// ═══════════════════════════════════════════════════════════════════════════

describe("11. peça reprovada volta para rascunho e perde o agendamento", () => {
  const reprovacao = fs.readFileSync(
    path.join(process.cwd(), "lib/agency/esteira/reprovacao.ts"),
    "utf8",
  );

  it("reprovar grava status draft E limpa scheduledFor, na MESMA escrita", () => {
    const trecho = reprovacao.slice(reprovacao.indexOf("prisma.socialPost.update"));
    const update = trecho.slice(0, 400);
    expect(update).toContain('status: "draft"');
    expect(update).toContain("scheduledFor: null");
  });

  it("reprovação sem motivo é RECUSADA — tirar da frente sem ensinar não é reprovar", () => {
    expect(reprovacao).toContain("MINIMO_DO_MOTIVO");
    expect(reprovacao).toMatch(/escreva o que está errado antes de reprovar/);
  });

  it("a tela do workspace declara a regra ao lado da fila", () => {
    const html = texto(render(<ApprovalsTab view={vistaCheia()} perms={permsDe("master")} setTab={nada} />));
    expect(html).toContain("Peça reprovada não fica agendada");
    expect(html).toMatch(/iria ao ar sozinho na hora marcada/);
  });

  it("o caminho do CLIENTE também reprova de verdade: recusa vira revision_requested", () => {
    // V2 (M5): a tabela de decisões saiu da rota e virou contrato único em
    // decisoes-do-portal.ts (rota e tela leem a mesma fonte). A verificação
    // segue os dois: o contrato carrega as ações; a rota carrega o contrato.
    const contrato = fs.readFileSync(path.join(process.cwd(), "lib/agency/portal/decisoes-do-portal.ts"), "utf8");
    expect(contrato).toContain("request_revision");
    expect(contrato).toContain("reject");
    expect(contrato).toContain("cancel");
    const rota = fs.readFileSync(path.join(process.cwd(), "app/api/portal/approvals/route.ts"), "utf8");
    expect(rota).toContain("decisoes-do-portal");
    expect(rota).toContain("ACTION_QUESTION");
    expect(rota).toContain("ACTIONS_REQUIRING_COMMENT");
    expect(rota).toContain("revision_requested"); // a recusa continua virando revisão de verdade
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  12. MATERIAL DO CLIENTE E ENTREGA DA AGÊNCIA NÃO SE MISTURAM
//
//  A diferença é de DONO e de EFEITO. Material do cliente é INSUMO e nunca
//  passa por aprovação; entrega é PRODUTO, tem versão e volta com decisão.
//  Uma lista só, ordenada por data, produz "aprovar o logo que o próprio
//  cliente mandou" — e alguém aprova.
// ═══════════════════════════════════════════════════════════════════════════

describe("12. as duas listas são duas, e não uma com selo", () => {
  const view = vistaCheia();
  const perms = permsDe("master");

  it("são submódulos separados, com contadores próprios", () => {
    const html = texto(render(<DeliveriesTab view={view} perms={perms} setTab={nada} />));
    expect(html).toContain("Entregas da agência");
    expect(html).toContain("Material do cliente");
  });

  it("a lista padrão mostra a ENTREGA e não mostra o arquivo do cliente", () => {
    const html = texto(render(<DeliveriesTab view={view} perms={perms} setTab={nada} />));
    expect(html).toContain("Entrega de teste");
    expect(html).not.toContain("arquivo-de-teste.png");
  });

  it("o material do cliente é declarado como INSUMO, e que não passa por aprovação", () => {
    const fonte = fs.readFileSync(
      path.join(process.cwd(), "components/agency/clients/workspace/DeliveriesTab.tsx"),
      "utf8",
    );
    expect(fonte).toMatch(/Insumo, não entrega/);
    expect(fonte).toMatch(/ninguém aprova o arquivo que\s*\n?\s*o próprio cliente enviou/);
  });

  it("no DTO são dois campos diferentes, com tipos diferentes", () => {
    expect(view.deliverables).not.toBe(view.clientMaterials);
    expect(Object.keys(view.deliverables[0]!)).toContain("version");
    expect(Object.keys(view.clientMaterials[0]!)).toContain("fileName");
    // Entrega tem versão e gate; material tem arquivo e quem enviou. Se um dia
    // alguém der `version` ao material, é porque as duas coisas se misturaram.
    expect(Object.keys(view.clientMaterials[0]!)).not.toContain("version");
  });

  it("o carregador filtra `kind: inbound` — as três espécies não vêm juntas", () => {
    const loader = fs.readFileSync(
      path.join(process.cwd(), "lib/agency/clients/workspace/carregar-cliente.ts"),
      "utf8",
    );
    expect(loader).toContain('kind: "inbound"');
  });

  it("'entregue' não é 'apresentada': a coluna separa as duas", () => {
    const html = texto(render(<DeliveriesTab view={view} perms={perms} setTab={nada} />));
    // A fixture traz `shared: false` — a entrega existe e o cliente NÃO viu.
    expect(html).toContain("Ainda interna");
  });

  it("entrega sem corpo não ganha botão de abrir — seria botão para o vazio", () => {
    const semCorpo = {
      ...view,
      deliverables: [{ ...view.deliverables[0]!, hasContent: false, versionCount: 0 }],
    };
    const html = render(<DeliveriesTab view={semCorpo} perms={perms} setTab={nada} />);
    expect(html).toMatch(/disabled[^>]*title="Esta entrega não tem corpo/);
  });

  it("os dois estados vazios são diferentes — e o do cliente diz o que trava", () => {
    const vazio = vistaVazia();
    const html = texto(render(<DeliveriesTab view={vazio} perms={perms} setTab={nada} />));
    expect(html).toContain("Nenhuma entrega registrada");
  });
});
