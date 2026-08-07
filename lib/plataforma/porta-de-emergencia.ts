// A porta de emergência do deploy — quem pode forçar, e o rastro que fica.
//
// ── POR QUE ISTO EXISTE ─────────────────────────────────────────────────────
// O portão do deploy (Wait for CI, no Railway) segura a subida até a CI fechar
// verde. Num dia de pane do GitHub Actions — como 06/08/2026, quando o Actions
// entrou em major outage — a CI não fecha NUNCA, e o portão que protege vira o
// portão que impede o conserto. A casa precisa conseguir subir mesmo assim.
//
// Só que porta de emergência sem registro vira o caminho normal na primeira
// sexta apertada, e aí o portão inteiro é decoração. Por isso a regra aqui não
// é "avisa que é sério": é MECANISMO.
//
//   • sem motivo escrito por gente, não abre;
//   • sem confirmação explícita, não abre;
//   • se o portão JÁ libera este commit, não abre (não é emergência: é o
//     caminho normal, e usar a porta de emergência para ele é justamente como
//     ela deixa de ser exceção);
//   • o registro é escrito ANTES da subida. Se não deu para registrar, não sobe.
//
// Este módulo é só a regra e o texto. Quem fala com o Railway e com o disco é
// `scripts/deploy-de-emergencia.mts` — assim a regra é testável sem rede.

import type { CodigoDaProva } from "./sentinela-do-deploy.ts";

/** Motivo curto demais não é motivo — é carimbo. */
export const TAMANHO_MINIMO_DO_MOTIVO = 20;

export type PedidoDeForca = {
  /** Por que está sendo forçado, escrito por gente. */
  motivo: string;
  /** Quem está forçando (nome ou e-mail). */
  quem: string;
  /** O operador confirmou explicitamente (--confirmo). */
  confirmado: boolean;
  /** O operador insistiu mesmo com o portão já liberando (--mesmo-aprovado). */
  insistiuComAprovado?: boolean;
};

export type Decisao = { liberado: true } | { liberado: false; erro: string };

export function podeForcar(pedido: PedidoDeForca, prova: CodigoDaProva): Decisao {
  const motivo = pedido.motivo.trim();
  const quem = pedido.quem.trim();

  if (!quem) {
    return { liberado: false, erro: "Falta --quem: subida forçada sem autor não é rastro, é anonimato." };
  }
  if (motivo.length < TAMANHO_MINIMO_DO_MOTIVO) {
    return {
      liberado: false,
      erro:
        `Falta --motivo com pelo menos ${TAMANHO_MINIMO_DO_MOTIVO} caracteres. ` +
        "O registro tem que dizer POR QUE, para quem for ler daqui a um mês.",
    };
  }
  if (!pedido.confirmado) {
    return { liberado: false, erro: "Falta --confirmo. Forçar produção não pode acontecer por engano de comando." };
  }

  if (prova === "APROVADO" && !pedido.insistiuComAprovado) {
    return {
      liberado: false,
      erro:
        "Este commit TEM CI verde — o portão já o libera pelo caminho normal. " +
        "Porta de emergência usada com o portão aberto é como ela deixa de ser exceção. " +
        "Se ainda assim for preciso (um redeploy travado, por exemplo), repita com --mesmo-aprovado.",
    };
  }

  return { liberado: true };
}

export type DadosDoRegistro = {
  quando: Date;
  quem: string;
  motivo: string;
  /** SHA completo do commit que vai para produção. */
  commit: string;
  /** Assunto do commit, para quem lê não ter que ir ao git. */
  assunto: string;
  /** O veredito da CI NO MOMENTO em que foi forçado. */
  prova: CodigoDaProva;
  resumoDaProva: string;
  /** Link do run de CI, quando existir. */
  urlDaCI?: string | null;
  /** Incidente da plataforma, quando houver. */
  incidente?: string | null;
};

/**
 * Uma entrada de registro, em markdown, para `docs/deploys/emergencias.md`.
 *
 * O formato é lido por gente, não por máquina — quem abre o arquivo tem que
 * conseguir responder, sem sair dali: quem forçou, quando, por quê, sobre qual
 * commit, e em que estado a CI estava.
 */
export function montarRegistro(d: DadosDoRegistro): string {
  const quando = d.quando.toISOString().replace("T", " ").slice(0, 16) + " UTC";
  const linhas = [
    ``,
    `## ${quando} — \`${d.commit.slice(0, 7)}\``,
    ``,
    `- **Quem forçou:** ${d.quem}`,
    `- **Commit:** \`${d.commit}\` — ${d.assunto}`,
    `- **Estado da CI no momento:** \`${d.prova}\` — ${d.resumoDaProva}`,
  ];
  if (d.incidente) linhas.push(`- **Incidente da plataforma:** ${d.incidente}`);
  if (d.urlDaCI) linhas.push(`- **Run da CI:** ${d.urlDaCI}`);
  linhas.push(`- **Motivo:** ${d.motivo.trim()}`);
  linhas.push(``);
  return linhas.join("\n");
}

/** O que o registro DEVE conter — usado pelo teste, para o formato não apodrecer. */
export const CAMPOS_OBRIGATORIOS_DO_REGISTRO = [
  "Quem forçou",
  "Commit",
  "Estado da CI no momento",
  "Motivo",
] as const;
