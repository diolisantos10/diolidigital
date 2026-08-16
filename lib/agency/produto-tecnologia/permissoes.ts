// PERMISSÕES DA SUPERFÍCIE DE PRODUTO & TECNOLOGIA — negar por padrão.
//
// Determinação do CEO (15/08/2026, implantação do 12º departamento):
//
//   • Master e Diretor: acesso total.
//   • Project Manager: coordena demandas, escopo, prioridade e ACEITE.
//   • Produto & Tecnologia (`tech_staff`): modifica apenas a própria área
//     técnica — não escreve em Branding, Social, Design ou Tráfego.
//   • Demais departamentos: visualização.
//   • Cliente: NÃO acessa as ferramentas internas.
//   • Operações controla deploy e ambiente.
//   • Qualidade precisa aprovar antes da publicação.
//
// Guardrail 4 da companhia: prompt é aviso, código é trava. Esconder botão não
// é controle de acesso — quem decide é este módulo, no servidor, e cada ação
// não declarada é NEGADA.

import type { PerfilOrganizacional } from "@/lib/agency/organizacao/autoridade";
import { deSlugLegado } from "@/lib/agency/catalogo-v2/adaptadores";

/** O que se pode QUERER fazer nesta superfície. Ação fora da lista não existe. */
export type AcaoDeProdutoTecnologia =
  /** Abrir e ler a superfície inteira. */
  | "ver"
  /** Abrir OS, mudar escopo, prioridade e dar o aceite da demanda. */
  | "coordenar_os"
  /** Escrever artefato técnico: UX, arquitetura, design system, código. */
  | "editar_tecnico"
  /** Dar o parecer que libera a passagem — antes da publicação. */
  | "aprovar_qualidade"
  /** Publicar: deploy, ambiente, rollback. */
  | "liberar_deploy";

export interface VeredictoDaSuperficie {
  permitido: boolean;
  motivo: string;
}

const DEPARTAMENTO = "product-technology";
/** Master e Diretor: acesso total, por determinação literal do CEO. */
const ACESSO_TOTAL = new Set(["master", "director"]);

function departamentosCanonicos(perfil: PerfilOrganizacional): Set<string> {
  return new Set(
    perfil.departamentos
      .map((d) => deSlugLegado(d) ?? d)
      .filter((d): d is string => Boolean(d)),
  );
}

export function podeNaProdutoTecnologia(
  perfil: PerfilOrganizacional,
  acao: AcaoDeProdutoTecnologia,
): VeredictoDaSuperficie {
  // O cliente não tem perfil interno — e ferramenta interna não é do cliente.
  if (!perfil || perfil.autoridade === "client") {
    return { permitido: false, motivo: "cliente não acessa as ferramentas internas da casa" };
  }
  if (ACESSO_TOTAL.has(perfil.autoridade)) {
    return { permitido: true, motivo: `autoridade ${perfil.autoridade} — acesso total` };
  }

  const meus = departamentosCanonicos(perfil);

  switch (acao) {
    case "ver":
      // Demais departamentos: visualização. Interno vê; ninguém de fora vê.
      return { permitido: true, motivo: "equipe interna consulta a superfície" };

    case "coordenar_os":
      if (perfil.autoridade === "project_manager" || meus.has("project-management")) {
        return { permitido: true, motivo: "Project Manager coordena escopo, prioridade e aceite" };
      }
      return { permitido: false, motivo: "só o PM (ou direção) coordena OS, escopo, prioridade e aceite" };

    case "editar_tecnico":
      if (meus.has(DEPARTAMENTO)) {
        return { permitido: true, motivo: "Produto & Tecnologia escreve na própria área técnica" };
      }
      return { permitido: false, motivo: "escrita técnica é de Produto & Tecnologia — negado por padrão" };

    case "aprovar_qualidade":
      if (meus.has("quality")) {
        return { permitido: true, motivo: "Qualidade aprova antes da publicação" };
      }
      return { permitido: false, motivo: "só Qualidade aprova antes da publicação" };

    case "liberar_deploy":
      if (meus.has("operations")) {
        return { permitido: true, motivo: "Operações controla deploy e ambiente" };
      }
      return { permitido: false, motivo: "deploy e ambiente são de Operações — nem a engenharia publica sozinha" };

    default:
      return { permitido: false, motivo: "ação não declarada — negado por padrão" };
  }
}

/**
 * A fronteira que o CEO mandou não borrar: Produto & Tecnologia **não** herda
 * escrita no Design de campanhas (peças, criativos) nem no Branding. Esta
 * função existe para ser testada, não para ser lembrada.
 */
export function escreveEmDesignDeCampanha(perfil: PerfilOrganizacional): boolean {
  if (ACESSO_TOTAL.has(perfil.autoridade)) return true;
  const meus = departamentosCanonicos(perfil);
  return meus.has("design") || meus.has("branding");
}
