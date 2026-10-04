// cadastro.ts — TIPO, FAIXA, RESPONSÁVEL E META DA CONTA (raio-x de 03/10,
// aplicado em 04/10/2026 por ordem do CEO).
//
//   • tipo: "cliente" | "projeto_interno" — projeto interno (a própria Dioli,
//     um produto da casa) não conta como receita nem como cliente pagante.
//   • faixa de preço: "normal" | "parceiro" — NÃO é coluna. É DERIVADA da
//     parceria declarada vigente (`parceriaDoCliente`), a mesma régua que o
//     preço já usa. Uma segunda coluna seria a segunda verdade que a regra da
//     reivindicação proíbe ("colisão é por responsabilidade").
//   • responsável: User.id da equipe (não do cliente).
//   • meta: uma frase.

export const TIPOS_DE_CLIENTE = ["cliente", "projeto_interno"] as const;
export type TipoDeCliente = (typeof TIPOS_DE_CLIENTE)[number];
export const ROTULO_DO_TIPO: Record<TipoDeCliente, string> = {
  cliente: "Cliente",
  projeto_interno: "Projeto interno",
};

export type FaixaDePreco = "normal" | "parceiro";

export function ehTipoDeCliente(v: unknown): v is TipoDeCliente {
  return typeof v === "string" && (TIPOS_DE_CLIENTE as readonly string[]).includes(v);
}

/** Lê os campos novos de um corpo de PUT. Ausente = não mexe. Inválido = erro. */
export function camposDoCadastro(body: Record<string, unknown>):
  | { ok: true; dados: { tipo?: TipoDeCliente; responsavelUserId?: string | null; meta?: string | null } }
  | { ok: false; erro: string } {
  const dados: { tipo?: TipoDeCliente; responsavelUserId?: string | null; meta?: string | null } = {};
  if ("tipo" in body) {
    if (!ehTipoDeCliente(body.tipo)) return { ok: false, erro: `tipo inválido — use ${TIPOS_DE_CLIENTE.join(" | ")}` };
    dados.tipo = body.tipo;
  }
  if ("responsavelUserId" in body) {
    const v = body.responsavelUserId;
    if (v !== null && typeof v !== "string") return { ok: false, erro: "responsavelUserId inválido" };
    dados.responsavelUserId = typeof v === "string" && v.trim() ? v.trim() : null;
  }
  if ("meta" in body) {
    const v = body.meta;
    if (v !== null && typeof v !== "string") return { ok: false, erro: "meta inválida" };
    dados.meta = typeof v === "string" && v.trim() ? v.trim().slice(0, 300) : null;
  }
  return { ok: true, dados };
}
