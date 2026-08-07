// O portão do deploy, do lado do Railway.
//
// ── O MECANISMO ESCOLHIDO, E POR QUÊ ────────────────────────────────────────
// O Railway tem um recurso próprio para isto — "Wait for CI"
// (docs.railway.com/deployments/github-autodeploys, seção "Wait for CI"):
// com ele ligado, o push cria a implantação em estado WAITING enquanto os
// workflows do GitHub rodam; se algum falhar, a implantação vira SKIPPED; só
// quando todos fecharem verdes ela segue.
//
// Na API pública isso é o campo `checkSuites` do DeploymentTrigger. É o que
// esta casa liga. Escolhido em vez de "desligar o autodeploy e mandar o deploy
// de dentro de um workflow" por três razões:
//
//   1. A trava fica DO LADO DO RAILWAY. Ela vale mesmo com o GitHub Actions
//      inteiro fora do ar — o caminho alternativo depende de um workflow rodar
//      para deployar, e num dia de pane nenhum workflow roda: a produção
//      ficaria sem NENHUM caminho automático.
//   2. Não exige guardar o token do Railway como segredo do repositório. Token
//      de deploy dentro do CI é uma credencial a mais exposta a cada action de
//      terceiro que entra no workflow.
//   3. É um mecanismo só. O caminho alternativo seria uma SEGUNDA régua de
//      "o que conta como verde", ao lado da que o sentinela já usa.
//
// O que o recurso do Railway NÃO dá — e por isso o resto deste arquivo existe:
// um jeito registrado de forçar quando a CI está fora. Ver
// `porta-de-emergencia.ts` e `scripts/deploy-de-emergencia.mts`.

const ENDPOINT = "https://backboard.railway.com/graphql/v2";

export const PROJETO = "b776c152-698e-4fa0-923f-ead2de6a24d0";
export const AMBIENTE = "bea02cda-fe8c-4b5e-8dd1-889cd6b54751";
export const SERVICO = "e0c288cb-c10f-4100-8863-48de0bb43d65";
export const BRANCH_DE_PRODUCAO = "claude/dioli-agency-os-architecture-kk7kp";

/**
 * O token vem SÓ do ambiente e nunca é impresso, nem em mensagem de erro.
 * Erro de GraphQL costuma ecoar o pedido inteiro; por isso nada aqui joga
 * `init` nem cabeçalho em log.
 */
function token(): string {
  const t = process.env.RAILWAY_TOKEN ?? process.env.RAILWAY_API_TOKEN;
  if (!t) {
    throw new Error(
      "RAILWAY_TOKEN não está no ambiente. Sem ele não há como falar com o Railway — e adivinhar não é opção.",
    );
  }
  return t;
}

async function graphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 30_000);
  let r: Response;
  try {
    r = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Project-Access-Token": token(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
      signal: ac.signal,
    });
  } finally {
    clearTimeout(t);
  }
  if (!r.ok) throw new Error(`Railway respondeu HTTP ${r.status}.`);
  const j = (await r.json()) as { data?: T; errors?: { message: string }[] };
  if (j.errors?.length) throw new Error(`Railway recusou: ${j.errors.map((e) => e.message).join(" | ")}`);
  if (!j.data) throw new Error("Railway respondeu sem dados.");
  return j.data;
}

export type EstadoDoPortao = {
  triggerId: string;
  repositorio: string;
  branch: string;
  /** true = "Wait for CI" ligado: push só sobe depois da CI verde. */
  esperaPelaCI: boolean;
  /** Quantos workflows o Railway reconhece como portão válido. 0 = o recurso não tem o que esperar. */
  workflowsReconhecidos: number;
};

export async function lerPortao(): Promise<EstadoDoPortao> {
  const d = await graphql<{
    project: {
      deploymentTriggers: {
        edges: {
          node: {
            id: string;
            repository: string;
            branch: string;
            checkSuites: boolean;
            validCheckSuites: number;
            serviceId: string;
            environmentId: string;
          };
        }[];
      };
    };
  }>(
    `query($id: String!) {
       project(id: $id) {
         deploymentTriggers { edges { node {
           id repository branch checkSuites validCheckSuites serviceId environmentId
         } } }
       }
     }`,
    { id: PROJETO },
  );

  const nos = d.project.deploymentTriggers.edges.map((e) => e.node);
  const meu = nos.find((n) => n.serviceId === SERVICO && n.environmentId === AMBIENTE);
  if (!meu) {
    throw new Error("Não achei o gatilho de deploy do serviço de produção. Não dá para julgar o portão sem ele.");
  }
  return {
    triggerId: meu.id,
    repositorio: meu.repository,
    branch: meu.branch,
    esperaPelaCI: meu.checkSuites === true,
    workflowsReconhecidos: meu.validCheckSuites ?? 0,
  };
}

/** Liga ou desliga o "Wait for CI" e DEVOLVE o estado relido — não o que pedimos. */
export async function ajustarPortao(triggerId: string, esperarPelaCI: boolean): Promise<EstadoDoPortao> {
  await graphql(
    `mutation($id: String!, $input: DeploymentTriggerUpdateInput!) {
       deploymentTriggerUpdate(id: $id, input: $input) { id checkSuites }
     }`,
    { id: triggerId, input: { checkSuites: esperarPelaCI } },
  );
  // Reler é o que transforma "mandei mudar" em "está mudado". Confiar na
  // resposta da mutação é como um portão fica aberto achando que fechou.
  return lerPortao();
}

export async function lerAutodeploy(): Promise<{ ligado: boolean; podeLigar: boolean; motivo: string | null }> {
  const d = await graphql<{
    serviceInstanceAutoDeployStatus: { enabled: boolean; canEnable: boolean; reason: string | null };
  }>(
    `query($p: String!, $s: String!, $e: String!) {
       serviceInstanceAutoDeployStatus(projectId: $p, serviceId: $s, environmentId: $e) {
         enabled canEnable reason
       }
     }`,
    { p: PROJETO, s: SERVICO, e: AMBIENTE },
  );
  const a = d.serviceInstanceAutoDeployStatus;
  return { ligado: a.enabled, podeLigar: a.canEnable, motivo: a.reason ?? null };
}

/**
 * Dispara o deploy de UM COMMIT NOMEADO.
 *
 * ── POR QUE NÃO É MAIS `environmentTriggersDeploy` ──────────────────────────
 *
 * Era, e a porta de emergência não abria. Duas descobertas, as duas pagas em
 * incidente real e registradas em `docs/deploys/emergencias.md`:
 *
 *   1. O token de PROJETO do Railway (`Project-Access-Token`, o único que esta
 *      casa tem) RECUSA `environmentTriggersDeploy` e `deploymentTriggerUpdate`
 *      com "Bad Access". Em 06/08 e 07/08/2026 a porta falhou nos dois usos —
 *      no segundo, com o GitHub Actions em pane e a produção quebrada na cara
 *      do CEO, o conserto teve de subir À MÃO, por fora do script.
 *   2. O MESMO token ACEITA `serviceInstanceDeployV2`. Foi ela que subiu o
 *      conserto de 07/08.
 *
 * Ela é melhor por três motivos, não só por funcionar:
 *
 *   • NÃO PASSA PELO "Wait for CI". O portão pode continuar LIGADO durante a
 *     emergência. O caminho antigo precisava DESLIGAR o portão para disparar e
 *     religar depois — uma janela em que todo push ia direto para produção sem
 *     CI, e que ficava aberta para sempre se o processo morresse no meio.
 *   • O COMMIT É EXPLÍCITO. "Deploy do último commit da branch" não responde
 *     "que commit subiu mesmo?" — e numa emergência é exatamente a pergunta.
 *     Aqui o commit é argumento obrigatório: adivinhar não é opção.
 *   • SUBSTITUI a implantação presa em `WAITING`, que é o estado em que o push
 *     fica quando a CI nunca vai responder porque o GitHub está fora.
 *
 * Devolve o id da implantação criada — é o que permite conferir depois que a
 * subida foi mesmo esta, em vez de acreditar no "disparei".
 */
export async function dispararDeploy(commitSha: string): Promise<string> {
  const sha = commitSha?.trim();
  // Porta de emergência que adivinha o que sobe não é porta, é alçapão.
  if (!sha) {
    throw new Error("dispararDeploy exige o commitSha: sem ele não há como dizer O QUE subiu.");
  }
  const d = await graphql<{ serviceInstanceDeployV2: string }>(
    `mutation($serviceId: String!, $environmentId: String!, $commitSha: String) {
       serviceInstanceDeployV2(serviceId: $serviceId, environmentId: $environmentId, commitSha: $commitSha)
     }`,
    { serviceId: SERVICO, environmentId: AMBIENTE, commitSha: sha },
  );
  return d.serviceInstanceDeployV2;
}

export type ImplantacaoResumida = {
  id: string;
  status: string;
  criadaEm: string;
};

export async function ultimasImplantacoes(quantas = 5): Promise<ImplantacaoResumida[]> {
  const d = await graphql<{
    deployments: { edges: { node: { id: string; status: string; createdAt: string } }[] };
  }>(
    `query($input: DeploymentListInput!, $first: Int) {
       deployments(input: $input, first: $first) {
         edges { node { id status createdAt } }
       }
     }`,
    { input: { projectId: PROJETO, serviceId: SERVICO, environmentId: AMBIENTE }, first: quantas },
  );
  return d.deployments.edges.map((e) => ({
    id: e.node.id,
    status: e.node.status,
    criadaEm: e.node.createdAt,
  }));
}
