// CAPACIDADE POR FUNÇÃO — negar por padrão, no servidor.
//
// Marco 2 da V2. A regra do 04-PERMISSOES-RBAC: "capacidade não declarada não
// é permitida" e "esconder botão não é controle de acesso". Este módulo é a
// quarta camada (consulta/mutação no servidor) para o vocabulário NOVO — as
// funções executoras do catálogo. Ele NÃO substitui `organizacao/guarda.ts`
// (menu/página/API), que continua valendo: ele se apoia no mesmo perfil
// (autoridade × departamentos) e traduz o departamento legado do perfil para
// o canônico pelo adaptador.
//
// Desenho fail-closed, nas quatro perguntas, nesta ordem:
//   1. a função existe no catálogo?           não → NEGA
//   2. o ator é master/director?              sim → PERMITE (regra do 04)
//   3. o perfil escreve no departamento dono? sim → PERMITE
//   4. qualquer outra coisa                   → NEGA

import type { PerfilOrganizacional } from "@/lib/agency/organizacao/autoridade";
import { departamentoDaFuncao } from "./catalogo";
import { deSlugLegado } from "./adaptadores";

export interface VeredictoDeCapacidade {
  permitido: boolean;
  motivo: string;
}

/** Autoridades com edição total (04-PERMISSOES: "Master e Diretor veem e editam tudo"). */
const AUTORIDADE_TOTAL = new Set(["master", "director"]);

export function podeExecutarFuncao(
  perfil: PerfilOrganizacional,
  funcaoId: string,
): VeredictoDeCapacidade {
  const departamento = departamentoDaFuncao(funcaoId);
  if (!departamento) {
    return { permitido: false, motivo: `função "${funcaoId}" não existe no catálogo canônico — negado por padrão` };
  }
  if (AUTORIDADE_TOTAL.has(perfil.autoridade)) {
    return { permitido: true, motivo: `autoridade ${perfil.autoridade} edita tudo` };
  }
  const escreveEm = new Set(
    perfil.departamentos
      .map((d) => deSlugLegado(d) ?? d)
      .filter((d): d is string => Boolean(d)),
  );
  if (escreveEm.has(departamento)) {
    return { permitido: true, motivo: `perfil escreve em ${departamento}` };
  }
  return {
    permitido: false,
    motivo: `perfil não escreve em ${departamento} (função ${funcaoId}) — negado por padrão`,
  };
}
