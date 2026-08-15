// A FILA DA CENTRAL, POR FUNÇÃO — cada um vê a própria mesa; a direção vê todas.
//
// Marco 4 da V2. Regra da arquitetura mestra: "Central de Trabalho: visão
// individual do executor, filas, dependências e prazos". O recorte é derivado
// do PERFIL (autoridade × departamentos), nunca de parâmetro de requisição —
// a mesma regra de ouro da guarda.
//
// Função pura de propósito: o recorte é testável sem banco e sem sessão.

import type { PerfilOrganizacional } from "@/lib/agency/organizacao/autoridade";
import { deSlugLegado } from "@/lib/agency/catalogo-v2/adaptadores";

export interface ItemDeFila {
  id: string;
  titulo: string;
  departamentoId: string; // canônico
  estadoCanonico: string | null;
  prazo?: Date | null;
  bloqueado: boolean;
}

/** A direção vê tudo; staff vê os departamentos onde ESCREVE (leitura de overview continua global nas telas de cliente). */
export function departamentosDaFila(perfil: PerfilOrganizacional): "todos" | string[] {
  if (perfil.autoridade === "master" || perfil.autoridade === "director") return "todos";
  const canonicos = perfil.departamentos
    .map((d) => deSlugLegado(d) ?? null)
    .filter((d): d is string => d !== null);
  return canonicos;
}

export function filtrarFila(perfil: PerfilOrganizacional, itens: ItemDeFila[]): ItemDeFila[] {
  const recorte = departamentosDaFila(perfil);
  const visiveis = recorte === "todos" ? itens : itens.filter((i) => recorte.includes(i.departamentoId));
  // Bloqueado primeiro (quem tem a bola aparece — não se esconde), depois prazo.
  return [...visiveis].sort((a, b) => {
    if (a.bloqueado !== b.bloqueado) return a.bloqueado ? -1 : 1;
    const pa = a.prazo?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const pb = b.prazo?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return pa - pb;
  });
}
