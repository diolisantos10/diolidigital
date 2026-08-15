// PADRÃO 2 — Id aceito sem conferir de quem é.
//
// O que pescou de verdade, nesta casa: uma rota que gerava o link de acesso ao
// portal de QUALQUER cliente do banco. Quem chamava estava logado — só não era
// dono. A frase da casa está em `lib/auth/posse-de-workspace.ts`: **estar logado
// não é ser dono**.
//
// TRADUÇÃO PARA ESTE CÓDIGO: id de entrada aqui é `searchParams.get("clientId")`,
// `body.projectId`, `params.id` e parentes. Prova de posse é UMA das quatro:
//   • um helper de `lib/auth/posse-de-workspace` (a fronteira única da casa);
//   • `workspaceId` entrando no `where` da consulta;
//   • guarda de portal (o id deriva do token, não do corpo);
//   • segredo de cron (a rota não é chamada por gente).
// `requireSession` sozinho NÃO conta, e essa é a regra inteira desta varredura:
// ele responde "quem é você", nunca "isto é seu".

import { fontesDoProjeto, type Arquivo } from "../fonte";
import { cega, type Achado, type ResultadoDeVarredura } from "../tipos";

const NOME = "id-sem-dono";

const ID_DE_ENTRADA = [
  /searchParams\.get\(\s*["'`](\w*[iI]d)["'`]/g,
  /\bbody\??\.(\w*[iI]d)\b/g,
  /\bparams\s*\)?\.(\w*[iI]d|id)\b/g,
  /const\s*\{[^}]*\b(\w*[iI]d)\b[^}]*\}\s*=\s*(await\s+)?(request\.json\(\)|params|body)/g,
];

const PROVA_DE_POSSE =
  /posse-de-workspace|clienteDoWorkspace|posseDaSolicitacao|solicitacaoDoWorkspace|aprovacaoDoWorkspace|artefatoDoWorkspace|apenasDoWorkspace|solicitacoesDoWorkspace|workspaceId\s*:|segredoConfere|portal-guard|portalGuard|resolverToken|PortalAccess/;

/** POSSE DELEGADA — calibração da primeira rodada de verdade (05/08/2026).
 *  `/api/meta/publish` recebe `connectionId` e não confere nada no arquivo…
 *  porque chama `publishPost(session.workspaceId, body)`, e a conferência está
 *  em `loadConnectionToken(workspaceId, connectionId)`, uma camada abaixo. Uma
 *  varredura que só lê um arquivo por vez NÃO consegue provar que a camada de
 *  baixo confere — mas também não pode chamar isso de rota desprotegida. Então
 *  ela declara o que sabe: o workspace VIAJA junto com o id; alguém precisa
 *  olhar a função que recebe. Achado médio, não alto — e explicitamente
 *  "confira", não "está furado". */
const POSSE_DELEGADA = /session\.workspaceId|guard\.session\.workspaceId|workspaceId\s*,/;

/** POSSE DELEGADA PELA GUARDA DA V2 — calibração de 15/08/2026, mesmo precedente.
 *
 *  `/api/v2/retomar` recebe `correlationId` e não filtra nada no arquivo…
 *  porque chama `retomarProcesso(correlationId, guarda.acesso.perfil,
 *  guarda.acesso.session.userId, …)`: a **identidade da sessão viaja junto com
 *  o id**, e quem decidiria o recorte é a camada de baixo. É a situação exata de
 *  `/api/meta/publish` em 05/08 — e a resposta é a mesma: a varredura declara o
 *  que sabe ("confira a função de destino"), em vez de gritar "rota aceita id
 *  sem login", que é **falso** e desmoraliza a lista inteira.
 *
 *  ⚠️ Médio não é absolvição — é uma pergunta com endereço. Para `/api/v2/retomar`
 *  a pergunta foi feita nesta mesma rodada e a resposta está em
 *  `docs/raio-x/README.md`: a camada de baixo **não** filtra. O achado continua
 *  na lista todas as noites até alguém fechar. */
const POSSE_DELEGADA_PELA_GUARDA = /guarda\.acesso\.(session|perfil)|acesso\.session\.userId|\bperfil\s*,/;

/** Autenticação não é posse. Fica listado para o relatório poder dizer
 *  "a rota exige login E MESMO ASSIM não confere dono" — que é pior, não melhor:
 *  é a rota que passa despercebida numa revisão.
 *
 *  A família `exigir*` de `lib/agency/organizacao/guarda.ts` entra AQUI, e não
 *  em `PROVA_DE_POSSE`, de propósito: ela responde "você é interno e alcança
 *  esta mesa", nunca "este id é seu". Confundir as duas é o erro que esta
 *  varredura inteira existe para não cometer. */
const APENAS_AUTENTICACAO =
  /requireSession|verifySession|getSession|requireRole|exigirApiInterna|exigirAdministracao|exigirCapacidade|exigirAcessoInterno/;

export function varrerIdSemDono(entrada?: Arquivo[]): ResultadoDeVarredura {
  const rotas = (entrada ?? fontesDoProjeto(["app"])).filter((f) => /route\.tsx?$/.test(f.caminho));
  if (rotas.length === 0) return cega(NOME, "id-sem-dono", "nenhuma rota lida — varredura não olhou nada");

  const achados: Achado[] = [];
  let rotasComId = 0;
  let delegadas = 0;
  let semNada = 0;

  for (const { caminho, texto } of rotas) {
    const ids = new Set<string>();
    for (const re of ID_DE_ENTRADA) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(texto))) {
        const nome = m[1];
        if (nome && /[iI]d$/.test(nome)) ids.add(nome);
      }
    }
    if (ids.size === 0) continue;
    rotasComId++;
    if (PROVA_DE_POSSE.test(texto)) continue;

    const soLogin = APENAS_AUTENTICACAO.test(texto);
    const comWorkspace = POSSE_DELEGADA.test(texto);
    // O que viaja com o id muda o que se deve conferir lá embaixo — e escrever
    // "repassa o workspaceId" numa rota que repassa o USUÁRIO manda o revisor
    // procurar um filtro que não existe. Ausência de informação não é informação.
    const comSessao = !comWorkspace && POSSE_DELEGADA_PELA_GUARDA.test(texto);
    const delegada = comWorkspace || comSessao;
    if (delegada) delegadas++;
    else semNada++;

    const listaDeIds = [...ids].sort().join(", ");

    achados.push({
      padrao: "id-sem-dono",
      chave: `id-sem-dono:${caminho}`,
      titulo: delegada
        ? comWorkspace
          ? "Posse delegada: o workspace viaja com o id, mas quem confere está uma camada abaixo"
          : "Posse delegada: a sessão viaja com o id, mas o recorte é decidido uma camada abaixo"
        : soLogin
          ? "Rota exige login mas não confere de quem é o id"
          : "Rota aceita id sem login e sem conferir dono",
      evidencia: delegada
        ? comWorkspace
          ? `${caminho} recebe ${listaDeIds} e repassa o workspaceId adiante — confira se a função de destino filtra por ele`
          : `${caminho} recebe ${listaDeIds}, é fechada pela guarda interna (exigir*) e repassa perfil/usuário da sessão à função de domínio — o id em si NÃO é filtrado aqui. Confira se a camada de destino recorta por dono`
        : `${caminho} recebe ${listaDeIds} e não passa por nenhuma prova de posse`,
      local: caminho,
      gravidade: delegada ? "medio" : "alto",
    });
  }

  return {
    varredura: NOME,
    padrao: "id-sem-dono",
    status: "rodou",
    achados,
    medidas: {
      rotasQueRecebemId: rotasComId,
      rotasSemProvaDePosse: semNada,
      rotasComPosseDelegada: delegadas,
    },
  };
}
