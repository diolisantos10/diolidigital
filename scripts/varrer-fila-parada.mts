/**
 * Varre a fila parada e cobra o que envelheceu — reivindicações vencidas
 * (`reivindicacoes/*.json`, disco) e PRs abertos sem atividade recente ou
 * sem veredito (API REST do GitHub).
 *
 *     npm run varrer-fila             # varre e escreve docs/relatorios/fila-parada.md
 *     npm run varrer-fila -- --json   # também imprime o retrato em JSON (teste/depuração)
 *
 * ── HISTÓRICO COMPLETO NÃO É NECESSÁRIO ──────────────────────────────────────
 * Este script lê arquivos do working tree e a API do GitHub — nenhum
 * `git log`, nenhum ancestral, nenhum clone completo. Não altere
 * `fetch-depth` de workflow nenhum por causa deste script.
 *
 * ── SEM TOKEN, OU API FORA DO AR: A METADE DE PRs FICA CEGA, EM VOZ ALTA ────
 * Ausência de informação não é ausência de problema. Se `GITHUB_TOKEN` não
 * estiver setado, ou a API do GitHub falhar, este script NÃO escreve
 * relatório fingindo que a fila de PR está limpa — ele grita e sai com
 * código != 0. Mesma doutrina do passo "A metade de DADOS não pode ficar
 * cega em silêncio" em `.github/workflows/raio-x-noturno.yml`.
 *
 * ── O QUE ISTO NÃO FAZ ────────────────────────────────────────────────────
 * Não encerra reivindicação, não fecha/comenta PR, não manda notificação.
 * Só lê e relata — ver `lib/coordenacao/fila-parada.ts` para a régua.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { lerReivindicacoesDoDisco } from "@/lib/coordenacao/leitura-do-registro";
import {
  DIAS_ATE_PR_PARADO,
  retratoDaFila,
  type ItemDaFila,
  type PullRequestAberto,
  type RetratoDaFila,
} from "@/lib/coordenacao/fila-parada";
import { cabecalhosDoGitHub, comTempoLimite, REPO_PADRAO } from "@/lib/plataforma/consulta-de-ci";

const PASTA_REIVINDICACOES = "reivindicacoes";
const ARQUIVO_RELATORIO = "docs/relatorios/fila-parada.md";

type PrCru = {
  number: number;
  title: string;
  user: { login: string } | null;
  draft: boolean;
  created_at: string;
};

type CommitCru = {
  commit: {
    committer: { date: string } | null;
    author: { date: string } | null;
  };
};

type ReviewCru = { state: string };

async function pedirJson<T>(url: string, oQue: string): Promise<T> {
  const r = await comTempoLimite(url, { headers: cabecalhosDoGitHub() });
  if (!r.ok) throw new Error(`HTTP ${r.status} ao pedir ${oQue} (${url})`);
  return (await r.json()) as T;
}

async function listarPrsAbertos(repo: string): Promise<PrCru[]> {
  return pedirJson<PrCru[]>(`https://api.github.com/repos/${repo}/pulls?state=open&per_page=100`, "PRs abertos");
}

async function ultimoCommitDoPr(repo: string, numero: number): Promise<string | null> {
  const commits = await pedirJson<CommitCru[]>(`https://api.github.com/repos/${repo}/pulls/${numero}/commits?per_page=100`, `commits do PR #${numero}`);
  if (commits.length === 0) return null;
  const ultimo = commits[commits.length - 1]!;
  return ultimo.commit.committer?.date ?? ultimo.commit.author?.date ?? null;
}

async function vereditosDoPr(repo: string, numero: number): Promise<number> {
  const reviews = await pedirJson<ReviewCru[]>(`https://api.github.com/repos/${repo}/pulls/${numero}/reviews?per_page=100`, `reviews do PR #${numero}`);
  return reviews.filter((rv) => rv.state === "APPROVED" || rv.state === "CHANGES_REQUESTED").length;
}

async function comentariosDoPr(repo: string, numero: number): Promise<number> {
  const comentarios = await pedirJson<unknown[]>(`https://api.github.com/repos/${repo}/issues/${numero}/comments?per_page=100`, `comentários do PR #${numero}`);
  return comentarios.length;
}

/** Um PR por vez, de propósito — a API do GitHub tem limite de requisições
 *  por minuto, e 34 PRs × 3 chamadas já é perto do teto secundário em
 *  paralelo total. Sequencial é mais lento e não estoura o limite. */
async function carregarPrs(repo: string): Promise<PullRequestAberto[]> {
  const crus = await listarPrsAbertos(repo);
  const prs: PullRequestAberto[] = [];
  for (const pr of crus) {
    const [ultimoCommitEm, vereditos, comentarios] = await Promise.all([
      ultimoCommitDoPr(repo, pr.number),
      vereditosDoPr(repo, pr.number),
      comentariosDoPr(repo, pr.number),
    ]);
    prs.push({
      numero: pr.number,
      titulo: pr.title,
      autor: pr.user?.login ?? "(desconhecido)",
      rascunho: pr.draft,
      criadoEm: pr.created_at,
      ultimoCommitEm,
      vereditos,
      comentarios,
    });
  }
  return prs;
}

function linhaDaTabela(item: ItemDaFila): string {
  const detalhe = item.detalhe ? ` _(${item.detalhe})_` : "";
  const oQue = item.o_que.replace(/\|/g, "\\|");
  return `| ${oQue} | ${item.ha_quanto} | ${item.de_quem}${detalhe} |`;
}

function tabela(titulo: string, itens: ItemDaFila[]): string {
  const linhas = [`### ${titulo} (${itens.length})`, "", "| o quê | há quanto tempo | de quem |", "|---|---|---|"];
  linhas.push(...(itens.length === 0 ? ["| _(vazio)_ | | |"] : itens.map(linhaDaTabela)));
  return linhas.join("\n");
}

function montarRelatorio(retrato: RetratoDaFila, agora: Date, limiarDias: number): string {
  const veredito =
    retrato.totalCobravel === 0
      ? "✅ **Fila limpa — nada cobrável agora.**"
      : `🔴 **${retrato.totalCobravel} item(ns) cobrável(is).**`;

  return (
    [
      "# Fila parada",
      "",
      `Varredura em ${agora.toISOString()} (${agora.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} BRT).`,
      `Limiar de PR parado/sem veredito: ${limiarDias} dias. Teto de reivindicação vencida: 24h (o padrão da casa).`,
      "",
      veredito,
      "",
      tabela("Reivindicações vencidas", retrato.reivindicacoesVencidas),
      "",
      tabela("PRs parados", retrato.prsParados),
      "",
      tabela("PRs sem veredito", retrato.prsSemVeredito),
      "",
      tabela("Estacionados de propósito (NÃO contam no total)", retrato.estacionados),
      "",
      "> Gerado por `scripts/varrer-fila-parada.mts`. Sobrescrito a cada corrida — não edite à mão.",
      "",
    ].join("\n") + "\n"
  );
}

async function main(): Promise<void> {
  const querJson = process.argv.includes("--json");
  const agora = new Date();

  const reivindicacoes = lerReivindicacoesDoDisco(PASTA_REIVINDICACOES);

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error(
      "🔴 GITHUB_TOKEN ausente — a metade de PRs desta varredura ficou CEGA. " +
        "Não escrevo relatório fingindo que a fila de PR está limpa (ausência de informação não é informação).",
    );
    process.exitCode = 1;
    return;
  }

  let prs: PullRequestAberto[];
  try {
    prs = await carregarPrs(REPO_PADRAO);
  } catch (e) {
    console.error(
      `🔴 A API do GitHub falhou ou está fora do ar — a metade de PRs desta varredura ficou CEGA: ` +
        `${e instanceof Error ? e.message : String(e)}`,
    );
    process.exitCode = 1;
    return;
  }

  const retrato = retratoDaFila(reivindicacoes, prs, agora, { diasAtePrParado: DIAS_ATE_PR_PARADO });

  if (querJson) {
    console.log(JSON.stringify(retrato, null, 2));
  }

  const relatorio = montarRelatorio(retrato, agora, DIAS_ATE_PR_PARADO);
  mkdirSync(dirname(ARQUIVO_RELATORIO), { recursive: true });
  writeFileSync(ARQUIVO_RELATORIO, relatorio, "utf8");

  console.log(`Relatório escrito em ${ARQUIVO_RELATORIO} — totalCobravel=${retrato.totalCobravel}.`);
  if (retrato.totalCobravel > 0) {
    console.error(`::error::Fila parada: ${retrato.totalCobravel} item(ns) cobrável(is). Ver ${ARQUIVO_RELATORIO}.`);
  }

  process.exitCode = retrato.totalCobravel > 0 ? 1 : 0;
}

main().catch((e) => {
  console.error("🔴 Falha inesperada na varredura da fila parada:", e);
  process.exitCode = 1;
});
