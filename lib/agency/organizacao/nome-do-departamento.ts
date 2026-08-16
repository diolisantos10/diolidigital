// CHAVE DE BANCO NÃO É PORTUGUÊS — o tradutor único.
//
// ── A CICATRIZ (16/08/2026) ───────────────────────────────────────────────
//
// A faixa "esperando decisão do cliente" imprimia `c.departamento` cru:
// **"social-media"**, **"paid-traffic"**. O `Badge` desta casa carrega um
// comentário dizendo exatamente isso desde 2026 — *"chave de banco não é
// português: no mínimo, troque o underscore por espaço antes de mostrar"* — e a
// faixa nova nasceu sem passar por ele.
//
// ── POR QUE NÃO É SÓ `getDepartmentDef(id).name` ──────────────────────────
//
// `ApprovalRequest.department` é `String` livre no schema, e o que a casa grava
// ali **não é só id de departamento**:
//
//   • `social-media`, `design`, `paid-traffic` — id de verdade (`departments.ts`);
//   • `pedido:<id>` — `producao-de-pedido.ts`, um card por pedido do cliente;
//   • `proibicoes-do-cliente` — `proibicoes.ts`, que não é departamento nenhum.
//
// Um `getDepartmentDef(x)!.name` cru devolveria `undefined` para dois desses
// três casos e a tela mostraria "undefined" — trocar um defeito por outro pior.
//
// ── A REGRA: TRADUZ O QUE CONHECE, E DECLARA O QUE NÃO CONHECE ────────────
//
// Chave desconhecida **não é inventada nem escondida**. Ela é humanizada
// (hífen vira espaço, primeira letra maiúscula) e devolvida com
// `conhecido: false`, para a tela poder dizer que aquilo é uma chave e não um
// nome. Escrever um nome bonito para uma chave que ninguém cadastrou é a
// mesma classe de erro de preencher dado de cliente por inferência.

import { getDepartmentDef, type DepartmentId } from "@/lib/agency/departments";

export interface NomeDeDepartamento {
  /** O que a tela mostra. Nunca vazio, nunca "undefined". */
  nome: string;
  /** `false` quando a chave não está no cadastro — a tela deve marcá-la como
   *  chave, não como nome. */
  conhecido: boolean;
}

/** Chaves que a casa grava em `department` e que **não são** departamento. */
const NAO_SAO_DEPARTAMENTO: Record<string, string> = {
  "proibicoes-do-cliente": "O que o cliente não quer",
};

export function departamentoEmPortugues(chave: string): NomeDeDepartamento {
  const limpa = (chave ?? "").trim();
  if (!limpa) return { nome: "sem departamento declarado", conhecido: false };

  // `pedido:<id>` é um card por pedido, não por departamento. Mostrar o id do
  // pedido não ajuda ninguém a decidir; dizer o que aquilo é, ajuda.
  if (limpa.startsWith("pedido:")) return { nome: "Pedido do cliente", conhecido: true };

  const excecao = NAO_SAO_DEPARTAMENTO[limpa];
  if (excecao) return { nome: excecao, conhecido: true };

  const def = getDepartmentDef(limpa as DepartmentId);
  if (def) return { nome: def.name, conhecido: true };

  // Desconhecida: humaniza e **declara** que é chave.
  return {
    nome: limpa.replace(/[-_]/g, " ").replace(/^./, (c) => c.toUpperCase()),
    conhecido: false,
  };
}
