// A MATRIZ DE PRODUTO & TECNOLOGIA — a determinação do CEO como teste.
//
// Implantação do 12º departamento (15/08/2026). O CEO escreveu a matriz em
// linguagem de negócio; aqui ela vira trava conferida a cada rodada:
//
//   Master e Diretor: acesso total.
//   PM: coordena demandas, escopo, prioridade e aceite.
//   Produto & Tecnologia: modifica apenas a própria área técnica.
//   Demais departamentos: visualização.
//   Cliente: não acessa ferramentas internas.
//   Operações controla deploy e ambiente.
//   Qualidade aprova antes da publicação.
//
// As duas metades de toda trava: barra o caso plantado E não acusa o limpo.
// Os perfis usados são os REAIS de PERFIL_DO_PAPEL — se um papel mudar de
// perfil amanhã, este teste conta a história.

import { describe, it, expect } from "vitest";
import { PERFIL_DO_PAPEL } from "@/lib/agency/roles";
import {
  podeNaProdutoTecnologia,
  escreveEmDesignDeCampanha,
  type AcaoDeProdutoTecnologia,
} from "@/lib/agency/produto-tecnologia/permissoes";
import { PAGINAS } from "@/lib/agency/organizacao/paginas";
import { DEPARTAMENTOS } from "@/lib/agency/organizacao/departamentos";
import { departamentoV2 } from "@/lib/agency/catalogo-v2/catalogo";

const TODAS: AcaoDeProdutoTecnologia[] = [
  "ver",
  "coordenar_os",
  "editar_tecnico",
  "aprovar_qualidade",
  "liberar_deploy",
];

describe("Produto & Tecnologia — quem pode o quê", () => {
  it("Master e Diretor têm acesso total — todas as ações", () => {
    for (const papel of ["master", "diretor"] as const) {
      for (const acao of TODAS) {
        expect(podeNaProdutoTecnologia(PERFIL_DO_PAPEL[papel], acao).permitido, `${papel}/${acao}`).toBe(true);
      }
    }
  });

  it("Project Manager coordena OS, escopo, prioridade e aceite — e não escreve código", () => {
    const pm = PERFIL_DO_PAPEL.project_manager;
    expect(podeNaProdutoTecnologia(pm, "coordenar_os").permitido).toBe(true);
    expect(podeNaProdutoTecnologia(pm, "ver").permitido).toBe(true);
    expect(podeNaProdutoTecnologia(pm, "editar_tecnico").permitido).toBe(false);
    expect(podeNaProdutoTecnologia(pm, "liberar_deploy").permitido).toBe(false);
    expect(podeNaProdutoTecnologia(pm, "aprovar_qualidade").permitido).toBe(false);
  });

  it("tech_staff escreve na PRÓPRIA área técnica — e só nela", () => {
    const tech = PERFIL_DO_PAPEL.tech_staff;
    expect(podeNaProdutoTecnologia(tech, "editar_tecnico").permitido).toBe(true);
    expect(podeNaProdutoTecnologia(tech, "ver").permitido).toBe(true);
    // Não coordena OS, não aprova qualidade e NÃO publica: a engenharia
    // entrega, mas quem publica é Operações depois da Qualidade.
    expect(podeNaProdutoTecnologia(tech, "coordenar_os").permitido).toBe(false);
    expect(podeNaProdutoTecnologia(tech, "aprovar_qualidade").permitido).toBe(false);
    expect(podeNaProdutoTecnologia(tech, "liberar_deploy").permitido).toBe(false);
  });

  it("a fronteira com o Design de campanha não se borra — tech_staff não escreve em peça criativa", () => {
    expect(escreveEmDesignDeCampanha(PERFIL_DO_PAPEL.tech_staff)).toBe(false);
    // E o contrário também: quem faz campanha não escreve na plataforma.
    expect(podeNaProdutoTecnologia(PERFIL_DO_PAPEL.design_staff, "editar_tecnico").permitido).toBe(false);
    // O caso limpo: Design continua dono do Design de campanha.
    expect(escreveEmDesignDeCampanha(PERFIL_DO_PAPEL.design_staff)).toBe(true);
  });

  it("demais departamentos: visualização — veem tudo, não escrevem nada", () => {
    for (const papel of ["social_staff", "ads_staff", "executivo_comercial"] as const) {
      const perfil = PERFIL_DO_PAPEL[papel];
      expect(podeNaProdutoTecnologia(perfil, "ver").permitido, papel).toBe(true);
      for (const acao of ["coordenar_os", "editar_tecnico", "aprovar_qualidade", "liberar_deploy"] as const) {
        expect(podeNaProdutoTecnologia(perfil, acao).permitido, `${papel}/${acao}`).toBe(false);
      }
    }
  });

  it("cliente não acessa ferramenta interna — nem para ver", () => {
    const cliente = { autoridade: "client" as const, departamentos: [] };
    for (const acao of TODAS) {
      const veredito = podeNaProdutoTecnologia(cliente, acao);
      expect(veredito.permitido, acao).toBe(false);
      expect(veredito.motivo).toContain("cliente");
    }
  });

  it("Operações controla deploy e ambiente; Qualidade aprova antes da publicação", () => {
    const operacoes = { autoridade: "department_member" as const, departamentos: ["operations" as const] };
    const qualidade = { autoridade: "department_member" as const, departamentos: ["quality" as const] };
    expect(podeNaProdutoTecnologia(operacoes, "liberar_deploy").permitido).toBe(true);
    expect(podeNaProdutoTecnologia(operacoes, "aprovar_qualidade").permitido).toBe(false);
    expect(podeNaProdutoTecnologia(qualidade, "aprovar_qualidade").permitido).toBe(true);
    expect(podeNaProdutoTecnologia(qualidade, "liberar_deploy").permitido).toBe(false);
    // Nem a própria engenharia publica sozinha.
    expect(podeNaProdutoTecnologia(PERFIL_DO_PAPEL.tech_staff, "liberar_deploy").permitido).toBe(false);
  });

  it("ação não declarada é NEGADA — negar por padrão, sem exceção silenciosa", () => {
    const inventada = "apagar_tudo" as AcaoDeProdutoTecnologia;
    expect(podeNaProdutoTecnologia(PERFIL_DO_PAPEL.tech_staff, inventada).permitido).toBe(false);
  });

  it("todo veredito nomeia o motivo — negativa muda é negativa que ninguém entende", () => {
    for (const papel of ["tech_staff", "project_manager", "social_staff"] as const) {
      for (const acao of TODAS) {
        expect(podeNaProdutoTecnologia(PERFIL_DO_PAPEL[papel], acao).motivo.length, `${papel}/${acao}`).toBeGreaterThan(10);
      }
    }
  });
});

describe("Produto & Tecnologia — a superfície está de pé e ligada à casa", () => {
  it("a página está registrada na organização, com dono e acesso corretos", () => {
    const pagina = PAGINAS.find((p) => p.href === "/agency/produto-tecnologia");
    expect(pagina, "página não registrada em paginas.ts").toBeDefined();
    expect(pagina!.dono).toBe("product-technology");
    // "Demais departamentos: visualização" — abrir é de todo interno; a
    // escrita é decidida no servidor, não no menu.
    expect(pagina!.acesso).toBe("todos_internos");
    expect(pagina!.noMenu).toBe(false);
  });

  it("o departamento existe na organização e declara ter superfície", () => {
    const dep = DEPARTAMENTOS.find((d) => d.id === "product-technology");
    expect(dep, "departamento ausente da organização").toBeDefined();
    expect(dep!.temSuperficie, "superfície construída precisa estar declarada").toBe(true);
    expect(dep!.nome).toBe("Produto & Tecnologia");
  });

  // As sete executoras continuam as mesmas; o oitavo nome é o GERENTE do
  // departamento, criado na reforma de hierarquia de 16/08/2026. Ele não
  // executa: recebe do Gerente Geral e distribui aqui dentro.
  it("as sete funções do departamento, mais o gerente, existem no catálogo canônico", () => {
    const dep = departamentoV2("product-technology");
    expect(dep, "departamento ausente do catálogo canônico").toBeDefined();
    expect(dep!.funcoes.map((f) => f.id).sort()).toEqual(
      [
        "backend-engineer",
        "design-system-engineer",
        "frontend-engineer",
        "fullstack-engineer",
        "manager-produto-tecnologia",
        "product-designer",
        "software-architect",
        "technology-orchestrator",
      ].sort(),
    );
  });

  it("NENHUMA página existente foi removida — a implantação é aditiva", () => {
    // As salas que já existiam continuam registradas. Se um dia esta lista
    // encolher, é porque alguém apagou tela — e o CEO proibiu isso literalmente.
    for (const href of [
      "/agency/dashboard",
      "/agency/pm-command",
      "/agency/clients",
      "/agency/operations-agent",
      "/agency/design-agent",
      "/agency/social-media-agent",
      "/agency/approvals",
      "/agency/deliverables",
    ]) {
      expect(PAGINAS.some((p) => p.href === href), `página sumiu: ${href}`).toBe(true);
    }
  });
});
