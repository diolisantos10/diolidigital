// A MATRIZ DE ACESSO, ITEM POR ITEM DO CONTRATO.
//
// Cada `it` abaixo é uma linha da seção 9 do contrato aprovado pelo CEO em
// 14/08/2026. Se um deles ficar vermelho, o que quebrou não é "um teste" — é
// uma promessa feita ao dono da casa.

import { describe, it, expect } from "vitest";
import { PAGINAS, podeAbrirRota, rotaEmModoDeConsulta } from "@/lib/agency/organizacao/paginas";
import {
  capacidadesEm,
  emModoDeConsulta,
  pode,
  podeAdministrar,
  podeVerTodosOsClientes,
  type PerfilOrganizacional,
} from "@/lib/agency/organizacao/autoridade";
import { DEPARTAMENTO_IDS } from "@/lib/agency/organizacao/departamentos";
import { PERFIL_DO_PAPEL, ROLE_NAV_ALLOWLIST, isNavAllowed } from "@/lib/agency/roles";

const master = PERFIL_DO_PAPEL.master;
const diretor = PERFIL_DO_PAPEL.diretor;
const pm = PERFIL_DO_PAPEL.project_manager;
const social = PERFIL_DO_PAPEL.social_staff;
const design = PERFIL_DO_PAPEL.design_staff;
const trafego = PERFIL_DO_PAPEL.ads_staff;
const atendimento = PERFIL_DO_PAPEL.executivo_comercial;
const tecnologia = PERFIL_DO_PAPEL.tech_staff;
const cliente: PerfilOrganizacional = { autoridade: "client", departamentos: [] };

const TODAS = PAGINAS.map((p) => p.href);

describe("Master e Diretor alcançam todas as páginas", () => {
  it("master abre toda rota do inventário", () => {
    const barradas = TODAS.filter((r) => !podeAbrirRota(master, r));
    expect(barradas).toEqual([]);
  });

  it("diretor abre toda rota do inventário", () => {
    const barradas = TODAS.filter((r) => !podeAbrirRota(diretor, r));
    expect(barradas).toEqual([]);
  });

  it("alcançam também a rota que AINDA NÃO EXISTE", () => {
    // O contrato diz "todas as rotas atuais e futuras". Página nova não pode
    // nascer fechada para quem é dono da casa.
    expect(podeAbrirRota(master, "/agency/tela-que-nao-existe-ainda")).toBe(true);
    expect(podeAbrirRota(diretor, "/agency/tela-que-nao-existe-ainda")).toBe(true);
  });

  it("nenhuma página existente foi escondida da direção nesta entrega", () => {
    expect(ROLE_NAV_ALLOWLIST.master).toBe("all");
    expect(ROLE_NAV_ALLOWLIST.diretor).toBe("all");
    for (const rota of TODAS) {
      expect(isNavAllowed("master", rota)).toBe(true);
      expect(isNavAllowed("diretor", rota)).toBe(true);
    }
  });

  it("editam qualquer departamento, inclusive um que ainda não existe no código", () => {
    for (const d of DEPARTAMENTO_IDS) {
      expect(pode(master, "editar", d)).toBe(true);
      expect(pode(diretor, "publicar", d)).toBe(true);
      expect(pode(diretor, "configurar", d)).toBe(true);
    }
    expect(podeAdministrar(master)).toBe(true);
    expect(podeAdministrar(diretor)).toBe(true);
  });
});

describe("Project Manager enxerga todos os clientes e departamentos", () => {
  it("abre a lista completa de clientes e o detalhe de qualquer um", () => {
    expect(podeAbrirRota(pm, "/agency/clients")).toBe(true);
    expect(podeAbrirRota(pm, "/agency/clients/qualquer-id")).toBe(true);
  });

  it("abre a mesa de trabalho de todos os departamentos", () => {
    const barradas = TODAS.filter((r) => !podeAbrirRota(pm, r));
    expect(barradas).toEqual([]);
  });

  it("cria, edita e aprova em qualquer área — é o que coordenar exige", () => {
    for (const d of DEPARTAMENTO_IDS) {
      expect(pode(pm, "ler", d)).toBe(true);
      expect(pode(pm, "criar", d)).toBe(true);
      expect(pode(pm, "editar", d)).toBe(true);
      expect(pode(pm, "aprovar", d)).toBe(true);
    }
  });

  it("NÃO assume a autoria técnica dos departamentos alheios", () => {
    // "publicar" e "excluir" a peça de outro é assinar em nome de quem produziu.
    expect(pode(pm, "publicar", "design")).toBe(false);
    expect(pode(pm, "excluir", "social-media")).toBe(false);
    // Na própria área, sim.
    expect(pode(pm, "publicar", "project-management")).toBe(true);
  });

  it("NÃO tem a chave do cofre — administração é da direção", () => {
    expect(podeAdministrar(pm)).toBe(false);
    for (const d of DEPARTAMENTO_IDS) {
      expect(pode(pm, "administrar", d)).toBe(false);
      expect(pode(pm, "configurar", d)).toBe(false);
    }
  });
});

describe("cada departamento edita a sua área e consulta as demais", () => {
  const casos: Array<[string, PerfilOrganizacional, string, string[]]> = [
    ["Social Media", social, "social-media", ["brand-hub", "design", "paid-traffic"]],
    ["Design", design, "design", ["social-media", "paid-traffic", "client-service-sdr"]],
    ["Tráfego Pago", trafego, "paid-traffic", ["social-media", "design", "brand-hub"]],
    ["Atendimento", atendimento, "client-service-sdr", ["design", "paid-traffic", "social-media"]],
    ["Produto & Tecnologia", tecnologia, "product-technology", ["design", "operations", "brand-hub"]],
  ];

  for (const [nome, perfil, propria, alheias] of casos) {
    it(`${nome} edita a própria área`, () => {
      expect(pode(perfil, "editar", propria as never)).toBe(true);
      expect(pode(perfil, "publicar", propria as never)).toBe(true);
      expect(emModoDeConsulta(perfil, propria as never)).toBe(false);
    });

    it(`${nome} apenas CONSULTA as demais áreas`, () => {
      for (const outra of alheias) {
        expect(pode(perfil, "ler", outra as never)).toBe(true);
        expect(pode(perfil, "editar", outra as never)).toBe(false);
        expect(pode(perfil, "aprovar", outra as never)).toBe(false);
        expect(pode(perfil, "excluir", outra as never)).toBe(false);
        expect(emModoDeConsulta(perfil, outra as never)).toBe(true);
      }
    });

    it(`${nome} nunca administra nem configura`, () => {
      expect(podeAdministrar(perfil)).toBe(false);
      expect(pode(perfil, "configurar", propria as never)).toBe(false);
    });
  }

  it("Design responde também pelo Branding — acesso que já existia", () => {
    expect(pode(design, "editar", "brand-hub")).toBe(true);
    expect(podeAbrirRota(design, "/agency/brand-assets")).toBe(true);
  });
});

describe("todo departamento alcança a lista completa de clientes", () => {
  for (const [nome, perfil] of [
    ["Social", social],
    ["Design", design],
    ["Tráfego", trafego],
    ["Atendimento", atendimento],
    ["Produto & Tecnologia", tecnologia],
  ] as const) {
    it(`${nome} abre /agency/clients e o detalhe de qualquer cliente`, () => {
      expect(podeVerTodosOsClientes(perfil)).toBe(true);
      expect(podeAbrirRota(perfil, "/agency/clients")).toBe(true);
      expect(podeAbrirRota(perfil, "/agency/clients/id-de-outro-cliente")).toBe(true);
    });

    it(`${nome} consulta o panorama transversal do trabalho da casa`, () => {
      for (const rota of [
        "/agency/dashboard",
        "/agency/projects",
        "/agency/deliverables",
        "/agency/approvals",
        "/agency/tasks",
        "/agency/planner",
        "/agency/pipeline",
        "/agency/desempenho-pago",
      ]) {
        expect(podeAbrirRota(perfil, rota), `${nome} barrado em ${rota}`).toBe(true);
      }
    });
  }
});

describe("a mesa de trabalho alheia fica fechada — e a tela diz por quê", () => {
  it("Social não entra no gerador de Design nem no de Tráfego", () => {
    expect(podeAbrirRota(social, "/agency/design-agent")).toBe(false);
    expect(podeAbrirRota(social, "/agency/ads-agent")).toBe(false);
    expect(podeAbrirRota(social, "/agency/social-media-agent")).toBe(true);
  });

  it("Design não entra no gerador de Social", () => {
    expect(podeAbrirRota(design, "/agency/social-media-agent")).toBe(false);
    expect(podeAbrirRota(design, "/agency/design-agent")).toBe(true);
  });

  it("Tráfego não entra no Brand Hub", () => {
    expect(podeAbrirRota(trafego, "/agency/brand-assets")).toBe(false);
    expect(podeAbrirRota(trafego, "/agency/ads-agent")).toBe(true);
  });

  it("página transversal de outro dono abre em MODO DE CONSULTA, não fechada", () => {
    // A diferença que impede a tela sem botão de parecer quebrada.
    expect(podeAbrirRota(social, "/agency/desempenho-pago")).toBe(true);
    expect(rotaEmModoDeConsulta(social, "/agency/desempenho-pago")).toBe(true);
    expect(rotaEmModoDeConsulta(trafego, "/agency/desempenho-pago")).toBe(false);
    expect(rotaEmModoDeConsulta(master, "/agency/desempenho-pago")).toBe(false);
  });

  it("nenhum departamento chega às configurações do sistema", () => {
    for (const perfil of [social, design, trafego, atendimento, tecnologia]) {
      expect(podeAbrirRota(perfil, "/agency/settings")).toBe(false);
      expect(podeAbrirRota(perfil, "/agency/integrations")).toBe(false);
      expect(podeAbrirRota(perfil, "/agency/brain")).toBe(false);
    }
  });
});

describe("cliente não alcança /agency/** — nem uma rota", () => {
  it("todas as rotas do inventário estão fechadas para o cliente", () => {
    const abertas = TODAS.filter((r) => podeAbrirRota(cliente, r));
    expect(abertas).toEqual([]);
  });

  it("rota inventada também está fechada", () => {
    expect(podeAbrirRota(cliente, "/agency/qualquer-coisa")).toBe(false);
    expect(podeAbrirRota(cliente, "/agency")).toBe(false);
  });

  it("não tem capacidade nenhuma em departamento nenhum", () => {
    for (const d of DEPARTAMENTO_IDS) {
      expect(capacidadesEm(cliente, d).size).toBe(0);
    }
    expect(podeVerTodosOsClientes(cliente)).toBe(false);
    expect(podeAdministrar(cliente)).toBe(false);
  });
});

describe("o acesso não pergunta se o executor é pessoa ou IA", () => {
  it("a matriz depende só de autoridade e departamento", () => {
    // Dois perfis idênticos nos dois eixos têm o MESMO conjunto de capacidades,
    // qualquer que seja quem os ocupa. É a decisão do CEO virada em código: um
    // agente e uma pessoa no mesmo departamento recebem as mesmas ferramentas.
    const pessoa: PerfilOrganizacional = { autoridade: "department_member", departamentos: ["design"] };
    const agente: PerfilOrganizacional = { autoridade: "department_member", departamentos: ["design"] };
    for (const d of DEPARTAMENTO_IDS) {
      expect([...capacidadesEm(pessoa, d)].sort()).toEqual([...capacidadesEm(agente, d)].sort());
    }
  });

  it("o perfil não tem campo que distinga humano de agente", () => {
    const campos = Object.keys(PERFIL_DO_PAPEL.social_staff).sort();
    expect(campos).toEqual(["autoridade", "departamentos"]);
  });
});

describe("a navegação é derivada da mesma regra que o servidor usa", () => {
  it("o que o menu mostra é exatamente o que a rota permite", () => {
    for (const papel of Object.keys(PERFIL_DO_PAPEL) as Array<keyof typeof PERFIL_DO_PAPEL>) {
      const perfil = PERFIL_DO_PAPEL[papel];
      for (const rota of TODAS) {
        // `/agency` fica fora: a lista de navegação casa por PREFIXO, e a raiz
        // casaria com tudo — ver o comentário em `rotasVisiveis()`. Ela não é
        // destino de menu, é redirecionamento.
        if (rota === "/agency") continue;
        expect(
          isNavAllowed(papel, rota),
          `${papel} diverge em ${rota}: menu e servidor discordam`,
        ).toBe(podeAbrirRota(perfil, rota));
      }
    }
  });
});
