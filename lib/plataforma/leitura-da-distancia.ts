// A metade de I/O de `distancia-do-deploy.ts`: pergunta à produção, ao git e
// à fila de implantações do Railway, e devolve o fato OU a falha — nunca
// lança para quem chama.
//
// Separado do julgamento puro pelo mesmo motivo do sentinela: o julgamento é
// testável sem rede nem `git`; só este arquivo fala com o mundo de fora.

import { execFileSync } from "node:child_process";
import type { CommitDaBranch, EstadoDaFila } from "./distancia-do-deploy";
import { ultimasImplantacoes } from "./railway-portao";

// `olharProducao` mora em `consulta-da-producao.ts` porque o sentinela do
// deploy também precisa dela — duas cópias da mesma pergunta já tinham
// divergido antes deste bloco. Reexportado aqui para não quebrar quem já
// importa `olharProducao` e `LeituraDaProducao` deste módulo.
export { olharProducao } from "./consulta-da-producao";
export type { LeituraDaProducao } from "./consulta-da-producao";

/** O histórico da branch, ou por que não foi possível lê-lo. */
export type LeituraDoHistorico = {
  historico: CommitDaBranch[];
  falha: string | null;
  /** `git fetch` falhou mas o histórico local foi usado assim mesmo — pode estar velho. */
  avisoDeFetch: string | null;
  /**
   * true = devolvemos exatamente `limite` commits — pode haver mais além
   * dele. É o que separa "não achei o commit na janela que consultei"
   * (COMMIT_ALEM_DO_LIMITE) de "vi a branch inteira e ele não está nela"
   * (COMMIT_FORA_DA_BRANCH) lá no veredito.
   */
  bateuNoLimite: boolean;
};

/**
 * O histórico de `origin/<branch>`, do mais novo para o mais antigo.
 *
 * Tenta `git fetch` antes; se o fetch falhar, segue com o histórico local
 * (sem rede, um histórico velho ainda diz algo) mas registra o aviso à parte
 * — quem lê precisa saber que ele pode estar desatualizado.
 */
export function historicoDaBranch(branch: string, limite = 200): LeituraDoHistorico {
  let avisoDeFetch: string | null = null;
  try {
    execFileSync("git", ["fetch", "origin", branch], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch {
    avisoDeFetch = `git fetch origin ${branch} falhou — histórico local pode estar desatualizado`;
  }

  try {
    const saida = execFileSync(
      "git",
      ["log", "--format=%h\t%s", "-n", String(limite), `origin/${branch}`],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    const historico: CommitDaBranch[] = saida
      .split("\n")
      .filter((linha) => linha.length > 0)
      .map((linha) => {
        const [commitCurto, ...resto] = linha.split("\t");
        return { commitCurto: commitCurto ?? "", assunto: resto.join("\t") };
      });
    return { historico, falha: null, avisoDeFetch, bateuNoLimite: historico.length === limite };
  } catch {
    return { historico: [], falha: `git log falhou para origin/${branch}`, avisoDeFetch, bateuNoLimite: false };
  }
}

/**
 * Status do Railway que contam como "algo subindo agora". Vem do enum
 * `DeploymentStatus` da API deles — nomeados aqui, não importados, porque a
 * lib não expõe um tipo TypeScript para o enum do GraphQL.
 */
const EM_VOO: ReadonlySet<string> = new Set([
  "BUILDING",
  "DEPLOYING",
  "WAITING",
  "INITIALIZING",
  "QUEUED",
  "NEEDS_APPROVAL",
]);

/** Status que contam como "nada subindo" — a implantação já terminou, de um jeito ou de outro. */
const PARADO: ReadonlySet<string> = new Set(["SUCCESS", "FAILED", "CRASHED", "SKIPPED", "REMOVED"]);

/**
 * Olha a fila de implantações do Railway e classifica: há algo em voo agora?
 *
 * NUNCA lança — sem `RAILWAY_TOKEN` (o caso comum desta sessão, e tratado
 * como cidadão de primeira classe, não exceção), com a API fora, ou com
 * timeout, `consultei` sai `false` e `falha` vem preenchida. Isso significa
 * "NÃO CONSEGUI OLHAR A FILA", que é o oposto de "não há deploy em voo" — a
 * mesma lei da casa que já vale para produção e histórico.
 *
 * Um status que não está nem em EM_VOO nem em PARADO (o Railway inventa um
 * amanhã) NUNCA é tratado como "parado" por omissão: sai em
 * `statusDesconhecido` para que quem julga trate como "não sei" — classificar
 * o desconhecido como parado reproduziria o alarme falso que este bloco
 * existe para matar.
 */
export async function olharFilaDeDeploy(quantas = 5): Promise<EstadoDaFila> {
  try {
    const implantacoes = await ultimasImplantacoes(quantas);
    const desconhecida = implantacoes.find((i) => !EM_VOO.has(i.status) && !PARADO.has(i.status));
    const emVoo = implantacoes.filter((i) => EM_VOO.has(i.status)).length;
    return {
      consultei: true,
      emVoo,
      statusMaisRecente: implantacoes[0]?.status ?? null,
      statusDesconhecido: desconhecida ? desconhecida.status : null,
      falha: null,
    };
  } catch (erro) {
    return {
      consultei: false,
      emVoo: 0,
      statusMaisRecente: null,
      statusDesconhecido: null,
      falha: erro instanceof Error ? erro.message : "falha desconhecida ao consultar a fila de deploy no Railway",
    };
  }
}
