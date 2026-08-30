// AS TRÊS TRAVAS DA HOMOLOGAÇÃO FINAL — o núcleo puro, sem rota e sem banco.
//
// `a-porta-do-connect.test.ts` prova as travas ONDE ELAS ACONTECEM (a rota) e
// `execucao-carimbada.test.ts` prova a resolução do cliente contra SQLite de
// verdade. Este arquivo é a terceira camada, e existe por um motivo específico:
// as regras que decidem — a lista de uma, a recusa do cliente informado, a
// escolha entre linhas candidatas — são funções puras, e função pura merece
// teste que roda em milissegundos e nomeia o caso limite.
//
// Determinações do CEO de 30/08/2026 cobertas aqui:
//   3. o segredo é `CONNECT_SECRET` e mais nada — e o encosto não volta calado;
//   4. a função é uma lista de uma;
//   5. ⭐ o cliente não vem de quem chama;
//   9. a resposta continua identificada como RASCUNHO.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  DOMINIO_DO_CLIENTE_FALSO,
  MARCA_DO_CLIENTE_FALSO,
} from "@/lib/agency/cliente-falso/trava-de-saida";
import {
  conferirPedido,
  FUNCAO_DO_PILOTO,
  FUNCOES_PERMITIDAS,
  CAMPOS_DE_CLIENTE_PROIBIDOS,
} from "@/lib/agency/connect/contrato";
import {
  escolherClienteDeHomologacao,
  type LinhaDeCliente,
} from "@/lib/agency/connect/cliente-de-homologacao";
import { SELO_DE_RASCUNHO } from "@/lib/agency/connect/despacho";
import { AVISO_DE_RASCUNHO } from "@/lib/agency/connect/realizar-sintetico";

const RAIZ = process.cwd();

/** O corpo mínimo que atravessa o conferidor. Sem cliente — não existe campo. */
function corpo(extra: Record<string, unknown> = {}) {
  return {
    modo: "homologacao",
    sintetico: true,
    pergunta: "e aí, como está o atendimento?",
    ...extra,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// TRAVA 3 — segredo de outra finalidade não abre porta corporativa.
// ───────────────────────────────────────────────────────────────────────────
describe("trava 3 — o encosto no PILOTO_SECRET não pode voltar sem alguém ver", () => {
  // A trava de comportamento está em `a-porta-do-connect.test.ts` (503 com o
  // segredo do piloto configurado). Esta aqui é a trava contra o RETORNO
  // SILENCIOSO: um `|| process.env.PILOTO_SECRET` reintroduzido numa refatoração
  // futura passaria por aquele teste apenas se alguém também mexesse nele. Aqui
  // o próprio arquivo da rota é lido, e a leitura só admite uma menção — a que
  // EXPLICA por que ele não é aceito.
  const rota = fs.readFileSync(path.join(RAIZ, "app/api/connect/despacho/route.ts"), "utf8");

  it("a rota lê CONNECT_SECRET e nenhum outro segredo de ambiente", () => {
    const lidos = [...rota.matchAll(/process\.env\.([A-Z_]+)/g)].map((m) => m[1]);
    expect(lidos).toContain("CONNECT_SECRET");
    expect(
      lidos.filter((v) => v !== "CONNECT_SECRET"),
      "a porta do Connect voltou a ler outro segredo de ambiente — segredo de outra finalidade não abre porta corporativa",
    ).toEqual([]);
  });

  it("PILOTO_SECRET só aparece na rota como explicação, nunca como leitura", () => {
    expect(rota).toContain("PILOTO_SECRET"); // o comentário que registra a decisão
    expect(rota).not.toContain("process.env.PILOTO_SECRET");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// TRAVA 4 — a função é uma lista de uma.
// ───────────────────────────────────────────────────────────────────────────
describe("trava 4 — a lista de uma", () => {
  it("a lista tem exatamente um item, e é o gerente do piloto", () => {
    expect(FUNCOES_PERMITIDAS).toEqual([FUNCAO_DO_PILOTO]);
    expect(FUNCAO_DO_PILOTO).toBe("manager-atendimento");
  });

  it.each([
    ["conversational-sdr", "outra ficha real do catálogo"],
    ["pm-orchestrator", "uma ficha de outro departamento"],
    ["manager-atendimento ", "o nome certo com espaço à direita"],
    ["Manager-Atendimento", "o nome certo com caixa trocada"],
    ["", "vazio"],
  ])("recusa %s (%s), nomeando o que foi pedido", (funcao) => {
    const r = conferirPedido(corpo({ funcao }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toContain(JSON.stringify(funcao));
    expect(r.motivo).toContain(FUNCAO_DO_PILOTO);
  });

  it.each([[42], [true], [{ funcao: "manager-atendimento" }], [["manager-atendimento"]]])(
    "tipo errado (%s) não cai mais no padrão silencioso — vira recusa",
    (funcao) => {
      const r = conferirPedido(corpo({ funcao }));
      expect(r.ok).toBe(false);
    },
  );

  it("a outra metade — a função permitida passa, e a ausência vale pela única", () => {
    const comNome = conferirPedido(corpo({ funcao: FUNCAO_DO_PILOTO }));
    expect(comNome.ok).toBe(true);
    if (comNome.ok) expect(comNome.pedido.funcao).toBe(FUNCAO_DO_PILOTO);

    const semNome = conferirPedido(corpo());
    expect(semNome.ok).toBe(true);
    if (semNome.ok) expect(semNome.pedido.funcao).toBe(FUNCAO_DO_PILOTO);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// ⭐ TRAVA 5 — o cliente não vem de quem chama.
// ───────────────────────────────────────────────────────────────────────────
describe("trava 5 — nenhum campo de cliente é entrada", () => {
  it("os dois campos proibidos estão nomeados em um lugar só", () => {
    expect([...CAMPOS_DE_CLIENTE_PROIBIDOS]).toEqual(["clienteId", "cliente"]);
  });

  it.each([
    ["clienteId", "cli-de-producao-de-alguem"],
    ["clienteId", ""],
    ["clienteId", null],
    ["cliente", `Cantina da Prova ${MARCA_DO_CLIENTE_FALSO}`],
    ["cliente", "Padaria do Zé"],
    ["cliente", null],
  ])("recusa quando %s vem no corpo, mesmo valendo %s", (campo, valor) => {
    const r = conferirPedido(corpo({ [campo]: valor }));
    expect(r.ok, `"${campo}" passou — a porta voltou a deixar o chamador escolher cliente`).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toContain(`"${campo}" não é mais entrada desta porta`);
    expect(r.motivo).toMatch(/resolvido pelo próprio gateway/i);
  });

  it("o pedido conferido não tem onde guardar cliente — nem por engano de código", () => {
    const r = conferirPedido(corpo());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Object.keys(r.pedido)).not.toContain("cliente");
    expect(Object.keys(r.pedido)).not.toContain("clienteId");
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("trava 5 — a escolha entre linhas candidatas", () => {
  const sintetico: LinhaDeCliente = {
    id: "cli-sintetico",
    name: `Cantina da Prova ${MARCA_DO_CLIENTE_FALSO}`,
    email: `contato@${DOMINIO_DO_CLIENTE_FALSO}`,
  };

  it("aceita a linha que cumpre AS DUAS condições", () => {
    const r = escolherClienteDeHomologacao([sintetico]);
    expect(r).not.toBeNull();
    expect(r!.id).toBe("cli-sintetico");
    expect(r!.conferido.carimbo).toBe(MARCA_DO_CLIENTE_FALSO);
    expect(r!.conferido.dominio).toBe(DOMINIO_DO_CLIENTE_FALSO);
  });

  it.each<[string, LinhaDeCliente]>([
    ["domínio real, carimbo certo", { id: "a", name: `Loja ${MARCA_DO_CLIENTE_FALSO}`, email: "a@loja.com.br" }],
    ["domínio certo, sem carimbo", { id: "b", name: "Padaria do Zé", email: `b@${DOMINIO_DO_CLIENTE_FALSO}` }],
    ["sem e-mail nenhum", { id: "c", name: `Loja ${MARCA_DO_CLIENTE_FALSO}`, email: null }],
    ["e-mail vazio", { id: "d", name: `Loja ${MARCA_DO_CLIENTE_FALSO}`, email: "   " }],
    [
      "domínio só PARECIDO — sufixo colado sem ponto nem arroba",
      { id: "e", name: `Loja ${MARCA_DO_CLIENTE_FALSO}`, email: `x@fake${DOMINIO_DO_CLIENTE_FALSO}` },
    ],
    [
      "o domínio fictício como PREFIXO de um domínio real",
      { id: "f", name: `Loja ${MARCA_DO_CLIENTE_FALSO}`, email: `x@${DOMINIO_DO_CLIENTE_FALSO}.com.br` },
    ],
  ])("descarta: %s", (_caso, linha) => {
    expect(escolherClienteDeHomologacao([linha])).toBeNull();
  });

  it("com lixo na frente, a escolha é a primeira linha que passa nas duas", () => {
    const r = escolherClienteDeHomologacao([
      { id: "real", name: "Padaria do Zé", email: "ze@padaria.com.br" },
      { id: "meio-caminho", name: "Padaria do Zé", email: `ze@${DOMINIO_DO_CLIENTE_FALSO}` },
      sintetico,
    ]);
    expect(r!.id).toBe("cli-sintetico");
  });

  it("lista vazia devolve null — e é isso que faz a porta recusar em vez de inventar", () => {
    expect(escolherClienteDeHomologacao([])).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// TRAVA 9 — a resposta continua identificada como RASCUNHO.
// ───────────────────────────────────────────────────────────────────────────
describe("trava 9 — o selo de rascunho é inequívoco nos dois lugares", () => {
  it("o campo que a Control Room lê não deixa margem: booleano, rótulo e frase", () => {
    expect(SELO_DE_RASCUNHO.rascunho).toBe(true);
    expect(SELO_DE_RASCUNHO.natureza).toBe("RASCUNHO");
    expect(SELO_DE_RASCUNHO.aviso).toMatch(/^RASCUNHO —/);
    expect(SELO_DE_RASCUNHO.aviso).toMatch(/NÃO é a comunicação final e inteligente do gerente/);
    expect(SELO_DE_RASCUNHO.aviso).toMatch(/sem provedor de IA/);
  });

  it("o texto do artefato abre com o aviso, em palavras que qualquer um entende", () => {
    expect(AVISO_DE_RASCUNHO).toMatch(/RASCUNHO/);
    expect(AVISO_DE_RASCUNHO).toMatch(/NÃO É A COMUNICAÇÃO FINAL DO GERENTE/);
    expect(AVISO_DE_RASCUNHO).toMatch(/não envie a cliente/i);
  });
});
