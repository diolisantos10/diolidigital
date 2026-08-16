/**
 * A trava de reivindicação — a CLI que descobre ANTES do `git pull --rebase`.
 *
 *     npm run reivindicar -- abrir --quem <id> --frente "<frase>" \
 *       --responsabilidade <slug> --arquivos <a,b,c> \
 *       [--forcar --motivo "<texto>"] [--mesmo-com-trabalho-em-andamento]
 *     npm run reivindicar -- conferir [--quem <id>]
 *     npm run reivindicar -- encerrar --responsabilidade <slug>
 *     npm run reivindicar -- listar
 *     npm run reivindicar -- instalar-gancho [--silencioso]
 *
 * ── POR QUE ISTO EXISTE (16/08/2026) ────────────────────────────────────────
 * Três frentes foram construídas EM DOBRO no mesmo dia, por chats cegos uns
 * para os outros: `parse_error` do SDR (dois commits, um descartado),
 * "verba declarada vs estimativa" (dois módulos, DOIS arquivos, mesma
 * responsabilidade — os dois ainda estão na branch) e o e-mail de "orçamento
 * pronto" (colisão em 4 arquivos). A doutrina já mandava "escreva a
 * reivindicação, commite antes de começar" desde 02/08. Isto vira mecanismo.
 *
 * A régua de colisão mora em `lib/coordenacao/reivindicacoes.ts` — pura, sem
 * I/O. Este script é só a casca: fala com o git e com o disco.
 *
 * ── A ÚNICA FONTE QUE DUAS SESSÕES ISOLADAS COMPARTILHAM É O REMOTO ────────
 * Por isso `abrir` e `conferir` sempre começam com `git fetch origin <branch>`
 * e leem `origin/<branch>:reivindicacoes/` — nunca o working tree local, que
 * pode estar desatualizado sem ninguém perceber.
 *
 * ── DECISÃO DE DESENHO: HEAD local vs. branch de coordenação ────────────────
 * Worktrees de agente rodam em branches próprias (`worktree-agent-<hash>`),
 * mas TODA sessão precisa coordenar contra o mesmo lugar — senão a trava não
 * trava nada. Por isso o padrão de fetch/leitura/push NÃO é
 * `git rev-parse --abbrev-ref HEAD` (que devolveria a branch privada do
 * worktree): é a branch de deploy, sempre, a menos que `--branch` diga outra.
 * O HEAD local só é usado para o COMMIT em si (`git commit`) e para o
 * `git push origin HEAD:<branch>` — o commit nasce onde a sessão está, mas
 * pousa sempre no mesmo lugar.
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  conferirColisao,
  estaViva,
  nomeDoArquivo,
  normalizarCaminho,
  normalizarResponsabilidade,
  validarReivindicacao,
  type Reivindicacao,
} from "../lib/coordenacao/reivindicacoes.ts";
import { lerReivindicacoesDoDisco } from "../lib/coordenacao/leitura-do-registro.ts";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PASTA_REIVINDICACOES = join(RAIZ, "reivindicacoes");

/** Onde a identidade da sessão mora — DENTRO do worktree, nunca em
 *  ".git/config" (ver o bloco "Identidade da sessão" abaixo, e o incidente
 *  de 16/08/2026 que forçou esta mudança). Formato: duas linhas — a
 *  identidade, e o CAMINHO ABSOLUTO deste worktree (rodada 3, mesmo dia —
 *  é o que permite detectar identidade herdada de outro worktree ou de um
 *  arquivo escrito antes desta regra). */
const CAMINHO_IDENTIDADE = join(RAIZ, ".dioli-quem");

/** A branch que TODAS as sessões — inclusive as de worktree — compartilham.
 *  Ver o bloco "DECISÃO DE DESENHO" no cabeçalho do arquivo. */
const BRANCH_DE_COORDENACAO_PADRAO = "claude/dioli-agency-os-architecture-kk7kp";

// ─────────────────────────────────────────────────────────────────────────
// Leitura de argumentos — `--nome valor` (espaço), não `--nome=valor`, para
// casar com os exemplos da própria ficha de despacho.
// ─────────────────────────────────────────────────────────────────────────

function pegarArg(argv: string[], nome: string): string | null {
  const i = argv.indexOf(`--${nome}`);
  if (i === -1) return null;
  const v = argv[i + 1];
  if (v === undefined || v.startsWith("--")) return "";
  return v;
}

function temFlag(argv: string[], nome: string): boolean {
  return argv.includes(`--${nome}`);
}

function branchAlvo(argv: string[]): string {
  return pegarArg(argv, "branch") || BRANCH_DE_COORDENACAO_PADRAO;
}

// ─────────────────────────────────────────────────────────────────────────
// A casca do git — tudo que fala com o remoto ou grava commit vive aqui.
// ─────────────────────────────────────────────────────────────────────────

function git(args: string[]): string {
  return execFileSync("git", args, { cwd: RAIZ, encoding: "utf8" }).trim();
}

function gitOuNulo(args: string[]): string | null {
  try {
    return execFileSync("git", args, { cwd: RAIZ, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch {
    return null;
  }
}

/** `git fetch origin <branch>` — o primeiro passo de `abrir` e `conferir`,
 *  porque conferir só o disco local não descobre nada sobre a OUTRA sessão. */
function buscarRemoto(branch: string): { ok: true } | { ok: false; erro: string } {
  try {
    execFileSync("git", ["fetch", "origin", branch], { cwd: RAIZ, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
}

/** Lê e valida as reivindicações que estão em `origin/<branch>:reivindicacoes/`
 *  — nunca o working tree, que pode estar velho sem ninguém perceber. Pasta
 *  ausente no remoto (repositório recém-criado) devolve lista vazia. */
function lerReivindicacoesRemotas(branch: string): Reivindicacao[] {
  const listagem = gitOuNulo(["ls-tree", "-r", "--name-only", `origin/${branch}`, "--", "reivindicacoes"]);
  if (listagem === null) {
    throw new Error(`não consegui listar "reivindicacoes/" em origin/${branch}. A branch existe no remoto?`);
  }
  const arquivos = listagem
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.endsWith(".json"));

  return arquivos.map((caminho) => {
    const conteudo = git(["show", `origin/${branch}:${caminho}`]);
    let bruto: unknown;
    try {
      bruto = JSON.parse(conteudo);
    } catch (e) {
      throw new Error(`${caminho}: JSON malformado em origin/${branch} (${e instanceof Error ? e.message : String(e)}).`);
    }
    return validarReivindicacao(bruto, caminho);
  });
}

/** O formato que `execFileSync` lança quando o processo falha e `stdio` tem
 *  `pipe` em stdout/stderr: além de `message`, o erro carrega `stdout` e
 *  `stderr` como string (porque passamos `encoding: "utf8"`). */
type ErroDeProcesso = { message?: string; stdout?: string; stderr?: string };

/** Traduz a falha do `git pull --rebase` na causa REAL, medida na saída do
 *  próprio git — nunca advinhada. Antes deste conserto, TODA falha de rebase
 *  virava "provável outra sessão pegou a mesma responsabilidade", mesmo
 *  quando a causa era trivial (working tree sujo no PRÓPRIO worktree, sem
 *  nenhuma outra sessão envolvida). Trava que diagnostica errado ensina quem
 *  lê a desconfiar dela — e trava em que ninguém confia é trava que some. */
function diagnosticarFalhaDoRebase(erro: unknown, branch: string): string {
  const bruto = erro as ErroDeProcesso;
  const saida = `${bruto.stderr ?? ""}\n${bruto.stdout ?? ""}`.trim();
  const detalhe = saida || (erro instanceof Error ? erro.message : String(erro));
  const comumATodas =
    `O commit local ainda existe; resolva à mão ("git rebase --abort" desfaz) e rode ` +
    `"npm run reivindicar -- abrir" de novo depois.`;

  // (a) O git recusa "pull --rebase" com working tree sujo — isto acontece no
  // PRÓPRIO worktree, sem nenhuma outra sessão por perto. É a causa mais
  // comum e a mais fácil de confirmar sem adivinhar nada.
  if (/cannot pull with rebase/i.test(detalhe) || /you have unstaged changes/i.test(detalhe) || /error: your local changes/i.test(detalhe)) {
    return (
      `"git pull --rebase origin ${branch}" falhou porque HÁ TRABALHO NÃO COMMITADO no seu próprio worktree — ` +
      `isto NÃO é colisão com outra sessão. Commite (ou "git stash") o que está solto e rode "npm run reivindicar -- abrir" de novo. ` +
      `Detalhe: ${detalhe}`
    );
  }

  // (b) Conflito de merge de verdade — aqui sim pode ser outra sessão mexendo
  // no MESMO arquivo, porque o rebase chegou a tentar aplicar o commit e as
  // duas versões não conciliam.
  if (/CONFLICT/i.test(detalhe)) {
    return (
      `"git pull --rebase origin ${branch}" falhou com CONFLITO DE VERDADE (provável outra sessão na mesma responsabilidade). ${comumATodas} ` +
      `Detalhe: ${detalhe}`
    );
  }

  // (c) Qualquer outra causa: mostramos a saída crua em vez de inventar um
  // motivo. Regra da casa — nunca afirmar causa que não foi medida.
  return (
    `"git pull --rebase origin ${branch}" falhou por um motivo que não reconheço — mostrando a saída crua em vez de adivinhar causa. ${comumATodas} ` +
    `Detalhe: ${detalhe}`
  );
}

/** Escreve o arquivo local da reivindicação, `git add` + `git commit`, e
 *  tenta o `git push`. Se o push falhar por a branch remota ter andado,
 *  reconfere a colisão contra o estado NOVO do remoto antes de repetir —
 *  nunca empurra às cegas depois de um rebase. */
function commitarEEmpurrar(
  caminhoRelativo: string,
  mensagem: string,
  branch: string,
  nova: Pick<Reivindicacao, "quem" | "responsabilidade" | "arquivos">,
  // Propaga o `--forcar` original para a reconferência pós-rebase. Sem isto,
  // uma sessão que forçou de propósito e precisou rebasear por uma corrida
  // seria barrada na retentativa mesmo tendo decidido, com motivo registrado,
  // seguir apesar da colisão — o force perderia efeito no pior momento.
  permitirColisaoNaReconferencia = false,
): void {
  git(["add", caminhoRelativo]);
  git(["commit", "-m", mensagem]);

  // `--no-verify` É DELIBERADO — não é atalho, é o CONSERTO do deadlock medido
  // em 16/08/2026. Sem ele, este push aciona o gancho pre-push, que roda
  // "conferir", que por sua vez lê a MESMA responsabilidade que este comando
  // acabou de gravar/encerrar — e pode barrar o push PELA PRÓPRIA
  // reivindicação que ele está tentando empurrar. Isto já aconteceu: um "pm"
  // fez tudo certo (abriu antes de trabalhar) e ficou trancado, porque
  // "encerrar" só sai por push, e o push estava barrado pelo gancho que o
  // próprio "encerrar" ia disparar.
  //   A conferência de colisão contra o remoto já rodou, linhas acima
  // (`conferirColisao` em `abrir`, ou a leitura de `existentes` em
  // `encerrar`) — pedir para o gancho conferir de NOVO é conferência dupla, e
  // conferência dupla contra o próprio commit que a gente está tentando subir
  // só pode dar falso positivo. `abrir` já recusou colisão ANTES de escrever
  // qualquer coisa; `encerrar` só REMOVE reivindicação, nunca adiciona risco.
  // Nenhum dos dois precisa do gancho para se auto-policiar.
  const tentarPush = () => execFileSync("git", ["push", "--no-verify", "origin", `HEAD:${branch}`], { cwd: RAIZ, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

  try {
    tentarPush();
    return;
  } catch {
    console.log(`   push recusado — a branch ${branch} andou. Rebaseando…`);
  }

  try {
    execFileSync("git", ["pull", "--rebase", "origin", branch], { cwd: RAIZ, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    throw new Error(diagnosticarFalhaDoRebase(e, branch));
  }

  // Depois do rebase, reconfere contra o remoto ATUALIZADO — de novo, `git
  // fetch` primeiro, porque o rebase só trouxe o que já estava no remoto NO
  // MOMENTO do fetch anterior; alguém pode ter empurrado de novo enquanto o
  // rebase rodava.
  const busca = buscarRemoto(branch);
  if (!busca.ok) {
    throw new Error(`rebase deu certo mas não consegui reconferir o remoto antes de empurrar de novo (${busca.erro}). Nada foi empurrado — rode de novo.`);
  }
  // `conferirColisao` já ignora reivindicações do mesmo `quem` — inclusive a
  // que estamos abrindo/encerrando agora, se por algum motivo ela já tiver
  // chegado ao remoto entre o fetch anterior e este. Não precisa filtro extra.
  const existentesAgora = lerReivindicacoesRemotas(branch);
  const reconferencia = conferirColisao(nova, existentesAgora, new Date());
  if (reconferencia.colide && !permitirColisaoNaReconferencia) {
    throw new Error(
      `depois do rebase, a reivindicação colide com quem chegou primeiro:\n` + reconferencia.motivos.map((m) => `   - ${m}`).join("\n") + `\nNada foi empurrado.`,
    );
  }
  if (reconferencia.colide && permitirColisaoNaReconferencia) {
    console.log("   ⚠️  ainda colide depois do rebase, mas --forcar segue valendo — empurrando mesmo assim.");
  }

  tentarPush();
}

// ─────────────────────────────────────────────────────────────────────────
// Identidade da sessão — persistida LOCAL, nunca versionada
// ─────────────────────────────────────────────────────────────────────────
//
// MEDIÇÃO REAL (16/08/2026, DUAS RODADAS):
//
// Rodada 1: o gancho pre-push chama "conferir" SEM --quem, porque o gancho
// não sabe quem é a sessão. Sem saber "quem sou eu", "conferir" não tem como
// distinguir "isto é a MINHA PRÓPRIA reivindicação" de "isto é de outra
// sessão" — e passou a barrar uma sessão pela reivindicação que ELA MESMA
// tinha aberto, corretamente, antes de trabalhar.
//
// O conserto da rodada 1 foi gravar a identidade em ".git/config"
// (`git config --local dioli.quem <id>`) — e essa escolha tinha um defeito
// que só apareceu quando o rodou dentro de um WORKTREE de agente:
//
// Rodada 2, causa raiz MEDIDA (não suposta):
//   git rev-parse --git-dir         -> .../.git/worktrees/agent-<hash>
//   git rev-parse --git-common-dir  -> .../.git   (o repo PRINCIPAL)
//   grep dioli .git/config (no repo principal) -> a chave [dioli] estava lá
// "git config --local", dentro de um worktree, grava no GIT-COMMON-DIR — que
// é COMPARTILHADO por todos os worktrees. Isto produzia dois defeitos:
//   (1) o arquivo fica FORA do worktree isolado, então a gravação é recusada
//       ao agente sandboxed — e o antigo "catch {}" silencioso escondia isso;
//   (2) o common-dir é o MESMO para todos os worktrees: duas sessões
//       gravando "dioli.quem" se SOBRESCREVEM, e uma sessão pode herdar a
//       identidade de outra. Identidade ERRADA é pior que identidade
//       AUSENTE — com ela, a trava passa a APROVAR o que deveria BARRAR.
//
// A saída da rodada 2: a identidade passa a morar em ".dioli-quem", um
// arquivo comum na RAIZ do próprio worktree (a constante CAMINHO_IDENTIDADE,
// acima) — não em ".git/config". É o único lugar que:
//   • o agente isolado alcança com certeza, porque está DENTRO do worktree
//     em que ele já lê e escreve;
//   • NÃO colide entre worktrees, porque cada worktree tem a sua própria
//     cópia do arquivo (nunca versionado — ver o ".gitignore").
//
// Rodada 3, causa raiz MEDIDA por outro PM, no WORKTREE PRINCIPAL — que É o
// git-common-dir, não um worktree isolado de agente:
//   git config dioli.quem  ->  "pm-a27b5772" (identidade de OUTRA sessão,
//     gravada pelo código ANTIGO da rodada 1, de ANTES da migração para
//     ".dioli-quem" — o worktree principal nunca tinha o arquivo novo,
//     porque nenhuma sessão pós-rodada-2 tinha rodado "abrir" nele ainda)
//   "npm run reivindicar -- conferir --quem pm-9ab49074" (a identidade
//     verdadeira, passada na mão) -> SEM colisão
//   "npm run reivindicar -- conferir" (sem --quem, resolvendo sozinho) ->
//     caía no fallback de "git config", achava que sabia quem era, e
//     BARRAVA a própria sessão pelas PRÓPRIAS reivindicações — o "quem"
//     usado na conferência era o de OUTRA sessão.
//
// O DEFEITO DE DESENHO da rodada 2, que a rodada 3 expôs: "conferir" tratava
// QUALQUER identidade resolvida (arquivo OU git config) como igualmente
// confiável — bastava achar UM valor, de qualquer fonte, para OBEDECER esse
// valor como "quem eu sou". Faltava a pergunta seguinte: "esse valor prova
// que fui EU que escrevi, ou só prova que ALGUÉM escreveu, algum dia, em
// ALGUM worktree que compartilha este git-common-dir?"
//
// A SAÍDA (CONSERTO 2 e 3, 16/08/2026): ".dioli-quem" passa a gravar, numa
// segunda linha, o CAMINHO ABSOLUTO do worktree em que foi escrito. Na
// leitura:
//   • o caminho bate com o worktree atual -> CONFIÁVEL, foi ESTE worktree
//     que gravou;
//   • o caminho NÃO bate, OU o arquivo está no formato LEGADO de uma linha
//     só (escrito antes desta regra, sem caminho nenhum), OU a única fonte é
//     "git config" (sempre compartilhado entre worktrees) -> SUSPEITA DE
//     HERANÇA. A identidade encontrada é MOSTRADA — para quem lê saber o que
//     foi achado e de onde veio — mas NUNCA OBEDECIDA para decidir "esta
//     reivindicação é minha".
//
// A ASSIMETRIA QUE JUSTIFICA A ESCOLHA: diante de identidade duvidosa, há
// dois jeitos de errar. BARRAR por engano (tratar uma reivindicação própria
// como se fosse de outra sessão) é o erro BENIGNO — a pessoa lê o aviso, vê
// a linha para corrigir, roda de novo, perde um minuto. APROVAR por engano
// (obedecer uma identidade herdada e passar a comparar colisão com o "quem"
// ERRADO — reconhecendo como próprias reivindicações de outra sessão, ou
// pior, fazendo a PRÓPRIA reivindicação da sessão parecer alheia) é o erro
// CARO e SILENCIOSO — ninguém percebe até o dano estar feito, exatamente o
// que aconteceu na rodada 3. Diante de identidade duvidosa, a trava sempre
// escolhe o lado que faz barulho.
//
// "conferir" resolve "quem" nesta ordem, do mais para o menos confiável:
//   (a) a flag --quem, se foi dada — sempre CONFIÁVEL: quem digitou sabe
//       melhor que qualquer cache, e é a única fonte que também CORRIGE o
//       arquivo do worktree (ver CONSERTO 1, em `gravarIdentidadeLocal`, e
//       CONSERTO 3 logo abaixo);
//   (b) o arquivo ".dioli-quem" DESTE worktree, no formato NOVO (duas
//       linhas: quem + caminho absoluto), com o caminho batendo com este
//       worktree — CONFIÁVEL, foi este worktree que gravou;
//   (c) o mesmo arquivo, mas com o caminho DIVERGENTE, ou no formato LEGADO
//       de uma linha só (sem caminho, escrito antes desta regra) — SUSPEITO
//       DE HERANÇA. Mostrado, nunca obedecido;
//   (d) "git config --get dioli.quem" — SEMPRE suspeito, porque mora no
//       git-common-dir e é visto por TODOS os worktrees que o compartilham.
//       Mostrado, nunca obedecido, e acompanhado da linha que LIMPA a chave
//       (CONSERTO 3) — sem executar a limpeza sozinho, porque a chave pode
//       ser de outra sessão viva;
//   (e) nenhuma das anteriores: o comando NÃO FINGE que sabe quem é —
//       inventar uma identidade aqui seria pior que admitir a lacuna, porque
//       uma identidade errada faz a PRÓPRIA reivindicação da sessão parecer
//       alheia (o bug da rodada 1). Ele avisa, claramente, e segue
//       conferindo mesmo assim — falhar fechado por falta de identidade
//       bloquearia até quem nunca reivindicou nada.
//
// Em (c) e (d) o valor encontrado NÃO é usado para decidir "isto é meu" — a
// conferência de colisão roda como se a identidade fosse desconhecida (o
// mesmo caminho de (e)), só que a MENSAGEM é mais específica: mostra o valor
// achado, de onde veio, por que não está sendo obedecido, e a linha exata
// para CONFIRMAR (se for mesmo esta sessão) ou CORRIGIR (se não for).
// ─────────────────────────────────────────────────────────────────────────

/** De onde a identidade resolvida veio — usado para decidir QUE aviso
 *  mostrar E se a identidade é CONFIÁVEL (ver `confiavel` em
 *  `resolverQuemParaConferir`). "arquivo-do-worktree" é a única fonte
 *  automática confiável; as outras duas são SUSPEITAS DE HERANÇA (CONSERTO
 *  2, 16/08/2026, rodada 3) — mostradas, nunca obedecidas. */
type OrigemDaIdentidade =
  | "flag"
  | "arquivo-do-worktree"
  | "arquivo-do-worktree-suspeito"
  | "git-config-compatibilidade";

/** A linha exata, pronta para copiar e colar, que resolve "identidade
 *  desconhecida" (ou suspeita — CONFIRMAR com --quem é o mesmo comando que
 *  CORRIGIR com --quem, a flag sempre vence). Existe em função própria para
 *  nunca divergir entre os vários lugares que a mostram (regra de "nenhum
 *  caminho termina em beco sem saída" — CONSERTO 4, 16/08/2026). */
function linhaParaGravarIdentidade(quemSugerido: string): string {
  return `npm run reivindicar -- abrir --quem ${quemSugerido} --frente "<retomando>" --responsabilidade <slug> --arquivos <a,b,c>`;
}

/** A linha que LIMPA "git config dioli.quem" — CONSERTO 3 (16/08/2026,
 *  rodada 3). Só é IMPRESSA, nunca EXECUTADA por este script: a chave mora
 *  no git-common-dir e é vista por TODOS os worktrees que o compartilham —
 *  pode pertencer a uma sessão ainda viva, e apagar estado alheio sem pedir
 *  não é o tipo de conveniência que esta casa aceita. Quem decide apagar é
 *  sempre a pessoa, lendo o aviso. */
function linhaParaLimparGitConfig(): string {
  return "git config --unset dioli.quem";
}

/** Grava "quem sou eu" localmente — no arquivo ".dioli-quem" NA RAIZ DESTE
 *  WORKTREE (nunca em ".git/config" — ver o bloco acima). Formato NOVO,
 *  DUAS linhas: a identidade, e o CAMINHO ABSOLUTO deste worktree — é essa
 *  segunda linha que permite à PRÓXIMA leitura confirmar que foi ESTE
 *  worktree que escreveu (CONSERTO 2, 16/08/2026, rodada 3), em vez de um
 *  valor herdado de qualquer lugar.
 *
 *  QUANDO isto é chamado — CONSERTO 1 (16/08/2026, rodada 3), em
 *  `comandoAbrir`: a identidade é gravada assim que "quem" é conhecido e
 *  VALIDADO, ANTES da primeira tentativa de push — não depois dele ter dado
 *  certo. O código antigo gravava só DEPOIS do push, com o argumento de que
 *  "reivindicação que não chegou ao remoto não deve ensinar 'conferir' a se
 *  reconhecer como dona de nada". Esse raciocínio estava ERRADO: quem eu sou
 *  é um fato da SESSÃO, não da reivindicação, e não depende do push ter tido
 *  sucesso. O efeito prático do erro: quando o push falhava — exatamente
 *  quando a pessoa mais precisa que "conferir" e "encerrar" funcionem para
 *  desembolar a situação — a sessão ficava SEM identidade gravada, e caía no
 *  mesmo impasse que a mudança de 16/08 tinha acabado de resolver. Gravar
 *  cedo custa uma escrita em disco a mais no caminho feliz (o push dá certo
 *  do mesmo jeito); gravar tarde custa a identidade inteira no caminho
 *  infeliz.
 *
 *  Falha aqui NUNCA é silenciosa: se a identidade não pôde ser salva
 *  localmente (permissão, disco somente-leitura), a pessoa fica sabendo NA
 *  HORA, com a linha exata que resolve — porque foi exatamente esse silêncio
 *  que produziu o deadlock de 16/08/2026: ninguém sabia que a identidade não
 *  tinha sido gravada até o push já estar trancado. */
function gravarIdentidadeLocal(quem: string): void {
  try {
    writeFileSync(CAMINHO_IDENTIDADE, `${quem}\n${RAIZ}\n`, "utf8");
  } catch (e) {
    console.error(
      `⚠️  Não consegui salvar a identidade em ` +
        `"${CAMINHO_IDENTIDADE}" (${e instanceof Error ? e.message : String(e)}). ` +
        `Sem isto, "conferir" (inclusive o gancho pre-push) não vai reconhecer suas PRÓPRIAS reivindicações ` +
        `como suas. Resolva com uma das opções abaixo:`,
    );
    console.error(`   - repita o comando com a flag:  --quem ${quem}`);
    console.error(`   - ou grave a identidade à mão (duas linhas — identidade e caminho absoluto deste worktree):`);
    console.error(`        printf '%s\\n%s\\n' "${quem}" "${RAIZ}" > "${CAMINHO_IDENTIDADE}"`);
  }
}

/** Lê a identidade gravada em ".dioli-quem" deste worktree, e diz se ela é
 *  CONFIÁVEL. Formato NOVO (duas linhas: quem + caminho absoluto do
 *  worktree que escreveu) — confiável só quando o caminho gravado bate com
 *  este worktree (`RAIZ`). Formato LEGADO (uma linha só, sem caminho —
 *  escrito por código de ANTES deste conserto) — SEMPRE suspeito, por
 *  definição: foi escrito antes de existir a marca de origem, e pode ter
 *  vindo de qualquer worktree que compartilhava o mesmo mecanismo antigo
 *  (CONSERTO 2, 16/08/2026, rodada 3). */
function lerIdentidadeDoArquivo(): { quem: string; confiavel: boolean } | null {
  if (!existsSync(CAMINHO_IDENTIDADE)) return null;
  try {
    const linhas = readFileSync(CAMINHO_IDENTIDADE, "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (linhas.length === 0) return null;
    const quem = linhas[0]!;
    if (linhas.length < 2) {
      // Formato legado (uma linha só) — sem caminho gravado, não há como
      // confirmar que foi ESTE worktree que escreveu. SUSPEITO por
      // definição.
      return { quem, confiavel: false };
    }
    const caminhoGravado = linhas[1]!;
    return { quem, confiavel: caminhoGravado === RAIZ };
  } catch {
    return null;
  }
}

/** Só para COMPATIBILIDADE com identidade gravada pelo código ANTIGO (antes
 *  da rodada 2), em ".git/config" via "git config --local dioli.quem". SEMPRE
 *  suspeita — nunca é a primeira fonte, e nunca é obedecida sozinha (ver a
 *  ordem de resolução no bloco acima, e CONSERTO 2/3). `git config --get`
 *  sai com código != 0 quando a chave não existe, por isso `gitOuNulo` em
 *  vez de `git`. */
function lerIdentidadeGitConfigCompatibilidade(): string | null {
  const v = gitOuNulo(["config", "--get", "dioli.quem"]);
  return v && v.trim() ? v.trim() : null;
}

/** A ordem de resolução descrita no bloco acima: flag > arquivo do worktree
 *  (confiável) > arquivo do worktree suspeito / git config (SUSPEITOS,
 *  nunca obedecidos) > "não sei" (nunca um palpite). Devolve `null` só no
 *  último caso — quem chama decide como avisar, esta função só recusa
 *  adivinhar. `confiavel` é o campo que os chamadores usam para decidir SE
 *  obedecem o valor (CONSERTO 2) — `origem` é só para a MENSAGEM. */
function resolverQuemParaConferir(argv: string[]): { quem: string; origem: OrigemDaIdentidade; confiavel: boolean } | null {
  const daFlag = pegarArg(argv, "quem");
  if (daFlag) return { quem: daFlag, origem: "flag", confiavel: true };

  const doArquivo = lerIdentidadeDoArquivo();
  if (doArquivo) {
    return {
      quem: doArquivo.quem,
      origem: doArquivo.confiavel ? "arquivo-do-worktree" : "arquivo-do-worktree-suspeito",
      confiavel: doArquivo.confiavel,
    };
  }

  const doGitConfig = lerIdentidadeGitConfigCompatibilidade();
  if (doGitConfig) return { quem: doGitConfig, origem: "git-config-compatibilidade", confiavel: false };

  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// abrir
// ─────────────────────────────────────────────────────────────────────────

/** O que está solto no working tree AGORA — staged, unstaged ou untracked —
 *  ignorando `caminhoIgnorado` (o próprio arquivo de reivindicação que
 *  `abrir` está prestes a escrever; sem o filtro, o comando acusaria a
 *  mudança que ELE MESMO vai fazer). Mesma leitura de `git status
 *  --porcelain` que `arquivosNoWorkingTree` usa para o gancho pre-push. */
function arquivosNaoCommitados(caminhoIgnorado: string): string[] {
  const status = gitOuNulo(["status", "--porcelain"]) ?? "";
  return status
    .split("\n")
    .map((l) => l.slice(3).trim()) // "XY caminho" — os dois primeiros chars são o código de status
    .filter(Boolean)
    .map((l) => (l.includes(" -> ") ? l.split(" -> ")[1]! : l)) // renomeios: "de -> para"
    .filter((caminho) => caminho !== caminhoIgnorado);
}

function comandoAbrir(argv: string[]): void {
  const branch = branchAlvo(argv);
  const quem = (pegarArg(argv, "quem") || "").trim();
  const frente = (pegarArg(argv, "frente") || "").trim();
  const responsabilidade = (pegarArg(argv, "responsabilidade") || "").trim();
  const arquivosBrutos = (pegarArg(argv, "arquivos") || "").trim();
  const forcar = temFlag(argv, "forcar");
  const motivo = (pegarArg(argv, "motivo") || "").trim();
  const mesmoComTrabalhoEmAndamento = temFlag(argv, "mesmo-com-trabalho-em-andamento");

  if (!quem || !frente || !responsabilidade || !arquivosBrutos) {
    console.error("Uso: npm run reivindicar -- abrir --quem <id> --frente \"<frase>\" --responsabilidade <slug> --arquivos <a,b,c>");
    process.exit(1);
  }
  if (forcar && !motivo) {
    console.error('--forcar exige --motivo "<texto>" não vazio. Forçar sem motivo é desligar a trava sem deixar rastro.');
    process.exit(1);
  }

  // CONSERTO 1 (16/08/2026, rodada 3) — grava a identidade AQUI, assim que
  // "quem" foi validado (não-vazio, ver o `if` acima), e ANTES de qualquer
  // tentativa de push. Ver o comentário completo em `gravarIdentidadeLocal`
  // sobre por que gravar só depois do push era o próprio bug.
  gravarIdentidadeLocal(quem);

  // O caminho que este comando está PRESTES a escrever — calculado cedo só
  // para poder ser ignorado na conferência de terreno abaixo.
  const id = normalizarResponsabilidade(responsabilidade);
  const nomeArquivo = nomeDoArquivo(id);
  const caminhoRelativo = join("reivindicacoes", nomeArquivo);

  // ── Conferir o terreno ANTES de escrever ou commitar qualquer coisa ───────
  // Reivindicação se abre ANTES de começar o trabalho: working tree limpo é
  // o estado normal de quem chega para abrir uma frente nova. Hoje "abrir"
  // commitava primeiro e só descobria o problema no push — deixando um
  // commit local órfão (com trabalho alheio embarcado) quando o push falhava.
  // Descobrir terreno sujo AQUI, antes de qualquer escrita, é mais barato do
  // que desfazer um commit depois.
  if (!mesmoComTrabalhoEmAndamento) {
    const soltos = arquivosNaoCommitados(caminhoRelativo);
    if (soltos.length > 0) {
      console.error("🚫 Há mudança não commitada no working tree — não escrevi nem commitei nada:");
      for (const a of soltos) console.error(`   - ${a}`);
      console.error(
        "Reivindicação se abre ANTES de começar o trabalho: working tree limpo é o estado normal. " +
          'Commite ou guarde ("git stash") o que está solto e rode "npm run reivindicar -- abrir" de novo.',
      );
      console.error(
        "Se você sabe o que está fazendo (ex.: reabrindo a reivindicação de um trabalho que já está em andamento), " +
          "repita com --mesmo-com-trabalho-em-andamento.",
      );
      process.exit(1);
    }
  }

  const arquivos = arquivosBrutos.split(",").map((a) => a.trim()).filter(Boolean);
  const nova = { quem, responsabilidade, arquivos };

  // ── ASSIMETRIA DELIBERADA (ver o espelho desta nota em `comandoConferir`) ──
  // `abrir` falha FECHADO sem rede: sem ler `origin/<branch>:reivindicacoes/`
  // não há como saber se a responsabilidade ou o arquivo já pertencem a outra
  // sessão. Reivindicar às cegas não é "reivindicar com risco" — é uma
  // reivindicação que ninguém mais enxerga, o que é PIOR do que não
  // reivindicar nada: dá a quem abriu a falsa sensação de posse, sem
  // proteger de fato. E o custo de recusar aqui é baixo: quem chama `abrir`
  // ainda não escreveu uma linha de código — recomeçar não perde trabalho.
  console.log(`Buscando origin/${branch}…`);
  const busca = buscarRemoto(branch);
  if (!busca.ok) {
    console.error(`Não consegui alcançar o remoto (${busca.erro}). Sem conferir o remoto, não se reivindica nada — nada foi gravado.`);
    process.exit(1);
  }

  const existentes = lerReivindicacoesRemotas(branch);
  const resultado = conferirColisao(nova, existentes, new Date());

  if (resultado.colide && !forcar) {
    console.error("🚫 Colisão — não gravei nada:");
    for (const m of resultado.motivos) console.error(`   - ${m}`);
    if (resultado.avisos.length) {
      console.error("   (avisos, não bloqueiam):");
      for (const a of resultado.avisos) console.error(`   - ${a}`);
    }
    console.error('Se ainda assim precisa seguir, repita com --forcar --motivo "<por quê>".');
    process.exit(1);
  }

  for (const a of resultado.avisos) console.log(`⚠️  ${a}`);

  const agora = new Date();
  const reivindicacao: Reivindicacao = {
    id,
    quem,
    frente,
    responsabilidade,
    arquivos: arquivos.map(normalizarCaminho),
    abertaEm: agora.toISOString(),
    encerradaEm: null,
  };
  if (resultado.colide && forcar) {
    reivindicacao.forcadaPor = { quem, motivo, em: agora.toISOString() };
  }

  mkdirSync(PASTA_REIVINDICACOES, { recursive: true });
  const caminhoAbsoluto = join(PASTA_REIVINDICACOES, nomeArquivo);
  writeFileSync(caminhoAbsoluto, `${JSON.stringify(reivindicacao, null, 2)}\n`, "utf8");

  try {
    commitarEEmpurrar(caminhoRelativo, `reivindica: ${frente}`, branch, nova, forcar);
  } catch (e) {
    console.error(`🚫 ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }

  // A identidade já foi gravada ANTES da primeira tentativa de push — ver o
  // CONSERTO 1, no início desta função. Nada a gravar de novo aqui.

  if (resultado.colide && forcar) {
    console.log(`🚨 REIVINDICAÇÃO FORÇADA por ${quem}, apesar da colisão. Motivo registrado: "${motivo}"`);
  }
  console.log(`✅ Reivindicado: "${responsabilidade}" por ${quem} — ${caminhoRelativo}, empurrado para ${branch}.`);
}

// ─────────────────────────────────────────────────────────────────────────
// conferir — o comando da abertura de turno, e o que o gancho pre-push chama
// ─────────────────────────────────────────────────────────────────────────

/**
 * O que "está no meu working tree", para efeito de conferência. Duas fontes,
 * de propósito:
 *
 *   • `git status --porcelain` — o que ainda não foi commitado (staged,
 *     unstaged, untracked). É o caso de quem está no MEIO de escrever.
 *   • `git diff --name-only origin/<branch>...HEAD` — o que JÁ foi commitado
 *     mas ainda não chegou ao remoto. Este é o caso que importa de verdade
 *     para o gancho pre-push: quando o hook roda, o working tree geralmente
 *     está limpo (tudo já commitado) — só o diff contra o remoto revela o que
 *     está prestes a subir. Sem esta fonte, o gancho ficaria cego bem no
 *     momento em que ele precisa enxergar.
 */
function arquivosNoWorkingTree(branch: string): string[] {
  const status = gitOuNulo(["status", "--porcelain"]) ?? "";
  const doStatus = status
    .split("\n")
    .map((l) => l.slice(3).trim()) // "XY caminho" — os dois primeiros chars são o código de status
    .filter(Boolean)
    .map((l) => (l.includes(" -> ") ? l.split(" -> ")[1]! : l)); // renomeios: "de -> para"

  const doDiff = (gitOuNulo(["diff", "--name-only", `origin/${branch}...HEAD`]) ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  return Array.from(new Set([...doStatus, ...doDiff]));
}

/**
 * AVISO DE VIZINHANÇA — o único ângulo automático possível contra o pior dos
 * três casos de 16/08/2026: `lib/agency/comercial/verba-declarada.ts` e
 * `lib/agency/comercial/verba-vs-estimativa.ts` respondem à MESMA pergunta
 * comercial, com nomes de ARQUIVO diferentes, e os dois estão na branch. A
 * colisão por sobreposição exata de caminho (`conferirColisao`, acima) NUNCA
 * pegaria este caso — nomes diferentes não se tocam. E não existe mecanismo
 * automático que prove que dois arquivos de nomes distintos respondem à mesma
 * pergunta: só quem declara a responsabilidade sabe.
 *
 * O que dá para fazer sem inventar prova onde não há: quando um arquivo que
 * estou tocando cai no MESMO DIRETÓRIO de um arquivo já reivindicado, vivo,
 * por OUTRA sessão — mesmo sem bater o caminho exato — isto é INDÍCIO, não
 * prova. Por isso é AVISO, e nunca BLOQUEIO: duas frentes legítimas e
 * independentes convivem no mesmo diretório o tempo todo — é assim que
 * trabalho em paralelo acontece nesta casa —, e travar por vizinhança
 * bloquearia exatamente o paralelismo que a régua de sobreposição exata já
 * preserva. O aviso nomeia a outra sessão, a frente dela e a responsabilidade
 * dela, e pergunta na cara: isto responde à mesma pergunta?
 */
function avisosDeVizinhanca(arquivosDaSessao: string[], quem: string, existentes: Reivindicacao[], agora: Date): string[] {
  const avisos: string[] = [];

  const dirDe = (caminho: string): string => {
    const norm = normalizarCaminho(caminho);
    const i = norm.lastIndexOf("/");
    return i === -1 ? "." : norm.slice(0, i);
  };

  // A RAIZ do repositório NUNCA gera aviso de vizinhança. Um arquivo solto na
  // raiz (ex.: "vitest.config.ts") tem diretório ".", e "." é o diretório de
  // TODO arquivo de primeiro nível — package.json, README.md, tsconfig.json,
  // AGENTS.md, CLAUDE.md, dezenas deles, sem relação nenhuma entre si além de
  // estarem no mesmo nível de pasta. Tratar "." como vizinhança real faria
  // QUALQUER mudança na raiz soar vizinha de QUALQUER outra — um aviso que
  // dispara sempre é um aviso que vira ruído de fundo e que ninguém lê mais
  // (o próprio comentário desta função já diz: vizinhança é indício, não
  // prova — mas na raiz nem indício é, porque não distingue nada). Só
  // diretório de verdade (um subdiretório nomeado) carrega indício.
  const ehDiretorioRaiz = (dir: string): boolean => dir === "." || dir === "" || dir === "./";

  const meusDiretorios = new Set(arquivosDaSessao.map(dirDe).filter((d) => !ehDiretorioRaiz(d)));
  const meusArquivosNormalizados = new Set(arquivosDaSessao.map(normalizarCaminho));

  // Um aviso por PAR (outra sessão × responsabilidade dela) — não um por
  // arquivo, para não repetir o mesmo indício dez vezes se dez arquivos meus
  // caírem no mesmo diretório da mesma reivindicação alheia.
  const jaAvisados = new Set<string>();

  for (const existente of existentes) {
    if (existente.quem === quem) continue; // nunca avisa contra a própria sessão
    if (estaViva(existente, agora) !== "viva") continue; // encerrada/velha não gera indício

    for (const arquivoExistente of existente.arquivos) {
      const caminhoExistenteNormalizado = normalizarCaminho(arquivoExistente);
      if (meusArquivosNormalizados.has(caminhoExistenteNormalizado)) continue; // sobreposição exata já é BLOQUEIO em outro lugar — não duplica aviso
      if (!meusDiretorios.has(dirDe(arquivoExistente))) continue;

      const chave = `${existente.quem}|${existente.responsabilidade}`;
      if (jaAvisados.has(chave)) continue;
      jaAvisados.add(chave);

      avisos.push(
        `[vizinhança] você toca "${dirDe(arquivoExistente)}/", onde ${existente.quem} tem reivindicação VIVA ` +
          `— frente: "${existente.frente}", responsabilidade: "${existente.responsabilidade}" (arquivo: "${caminhoExistenteNormalizado}"). ` +
          `Não é sobreposição de arquivo — isto é indício, não prova, e por isso é aviso, não bloqueio. ` +
          `Isto responde à MESMA pergunta que a frente de ${existente.quem}?`,
      );
    }
  }

  return avisos;
}

function comandoConferir(argv: string[]): void {
  const branch = branchAlvo(argv);
  const resolvida = resolverQuemParaConferir(argv);

  if (!resolvida) {
    console.warn(
      `⚠️  Identidade da sessão desconhecida (sem --quem, sem "${CAMINHO_IDENTIDADE}" e sem "git config dioli.quem" ` +
        "de compatibilidade). Reivindicações da PRÓPRIA sessão não serão distinguidas das de outras sessões — pode " +
        "gerar falso positivo, inclusive contra uma frente que VOCÊ MESMO abriu. Para resolver:",
    );
    console.warn(`   - repita este comando com:  --quem <id>`);
    console.warn(`   - ou rode "npm run reivindicar -- abrir ..." uma vez, que grava a identidade automaticamente`);
    console.warn("   Seguindo a conferência mesmo assim — falhar fechado por falta de identidade bloquearia até quem nunca reivindicou nada.");
  } else if (!resolvida.confiavel) {
    // CONSERTO 2 (16/08/2026, rodada 3) — identidade ENCONTRADA, mas
    // SUSPEITA DE HERANÇA: ou veio de ".dioli-quem" sem o caminho deste
    // worktree bater (formato legado ou gravada por outro worktree), ou veio
    // só de "git config", que é sempre compartilhado. Nos dois casos, o
    // valor é MOSTRADO — para quem lê saber o que foi achado e de onde veio
    // — mas NUNCA OBEDECIDO para decidir "esta reivindicação é minha" (por
    // isso `quem`, abaixo, cai para "<seu-id>" como se nada tivesse sido
    // encontrado). Aprovar por engano é o erro caro e silencioso; a trava
    // escolhe o lado que faz barulho.
    const origemDescrita =
      resolvida.origem === "git-config-compatibilidade"
        ? '"git config dioli.quem" — a chave de COMPATIBILIDADE, que mora no git-common-dir e é COMPARTILHADA por todos os worktrees'
        : `"${CAMINHO_IDENTIDADE}" — mas no formato legado (sem caminho gravado), ou com o caminho de OUTRO worktree`;
    console.warn(
      `⚠️  Encontrei uma identidade — "${resolvida.quem}" — vinda de ${origemDescrita}. ` +
        "NÃO estou obedecendo esse valor: nada garante que foi ESTA sessão que o escreveu por último, e obedecer " +
        "identidade herdada foi exatamente o que trocou reivindicações de sessões diferentes em 16/08/2026. Esta " +
        "conferência segue como se a identidade fosse DESCONHECIDA. Para resolver:",
    );
    console.warn(`   - se "${resolvida.quem}" for VOCÊ MESMO, confirme e grave a identidade deste worktree:  ${linhaParaGravarIdentidade(resolvida.quem)}`);
    console.warn(`   - se NÃO for você, grave a sua identidade correta:  npm run reivindicar -- abrir --quem <seu-id-verdadeiro> --frente "<...>" --responsabilidade <slug> --arquivos <a,b,c>`);
    if (resolvida.origem === "git-config-compatibilidade") {
      console.warn(
        `   - a chave "git config dioli.quem" pode pertencer a OUTRA sessão viva — não apago sozinho. Se você tiver ` +
          "certeza de que não é mais necessária, limpe-a à mão:",
      );
      console.warn(`        ${linhaParaLimparGitConfig()}`);
    }
  }

  // ── CONSERTO 1 (16/08/2026, rodada 2) — O CAMINHO HONESTO NÃO PODE SER MAIS
  // CARO QUE O ATALHO, SENÃO A TRAVA MORRE. Medido: antes deste conserto,
  // "conferir --quem <id>" resolvia a identidade só PARA ESTA CHAMADA e
  // nunca gravava — só "abrir" gravava em ".dioli-quem". Consequência: quem
  // era barrado por falta de identidade lia "repita este comando com --quem
  // <id>", repetia, funcionava… e na PRÓXIMA vez precisava repetir de novo,
  // para sempre. Por isso "conferir" grava a identidade exatamente como
  // "abrir" já fazia — MAS só quando ela é CONFIÁVEL (CONSERTO 2, rodada 3):
  // gravar uma identidade SUSPEITA aqui fossilizaria um valor herdado como
  // se fosse confirmado, o oposto do que este conserto existe para evitar.
  if (resolvida && resolvida.confiavel) {
    gravarIdentidadeLocal(resolvida.quem);
  }

  // Identidade suspeita (rodada 3) NÃO é obedecida — cai no mesmo "<seu-id>"
  // de quando nada foi encontrado. Só uma identidade CONFIÁVEL (flag, ou
  // arquivo deste worktree com o caminho batendo) decide "isto é meu".
  const quem = resolvida?.confiavel ? resolvida.quem : "<seu-id>";

  console.log(`Buscando origin/${branch}…`);
  const busca = buscarRemoto(branch);
  if (!busca.ok) {
    // ── ASSIMETRIA DELIBERADA (ver o espelho desta nota em `comandoAbrir`) ──
    // `conferir` falha ABERTO sem rede — o oposto de `abrir`, e de propósito.
    // A diferença não é descuido, é QUEM chama e o que já está em jogo:
    // `abrir` ainda não começou nada, recusar não custa trabalho perdido.
    // `conferir` é quem o gancho pre-push chama, DEPOIS de horas de trabalho
    // já commitadas — barrar aqui por falta de REDE (não por colisão real)
    // ensina a pessoa a usar `--no-verify` na primeira vez que a conexão
    // cai, e a partir daí o gancho deixa de proteger qualquer coisa, mesmo
    // nos dias em que a rede volta. Deixar passar sem rede é o único jeito
    // da trava sobreviver ao primeiro dia de conexão ruim.
    console.warn(`⚠️  Não consegui alcançar o remoto (${busca.erro}). Sem rede não dá para conferir — deixando passar.`);
    process.exit(0);
  }

  let existentes: Reivindicacao[];
  try {
    existentes = lerReivindicacoesRemotas(branch);
  } catch (e) {
    console.warn(`⚠️  Remoto alcançável mas o registro não leu (${e instanceof Error ? e.message : String(e)}). Deixando passar — registro quebrado não pode travar todo mundo.`);
    process.exit(0);
  }

  const arquivos = arquivosNoWorkingTree(branch);
  if (arquivos.length === 0) {
    console.log("Nada alterado no working tree. Nada a conferir.");
    process.exit(0);
  }

  // `conferirColisao` também checa "mesma responsabilidade" — aqui só importa
  // ARQUIVO (esta sessão pode nem ter aberto reivindicação ainda). Uma
  // responsabilidade-isca, que não bate com nenhuma reivindicação real, deixa
  // só o canal de arquivo ativo — MESMA régua, sem duplicar lógica.
  const propostaSomenteArquivos = {
    quem,
    responsabilidade: `__conferir-apenas-arquivos__/${Date.now()}`,
    arquivos,
  };
  const resultado = conferirColisao(propostaSomenteArquivos, existentes, new Date());

  for (const a of resultado.avisos) console.log(`⚠️  ${a}`);

  // Aviso de vizinhança — ver o comentário na função. Roda sempre, colidindo
  // ou não: é indício, não bloqueio, então não depende de `resultado.colide`.
  for (const a of avisosDeVizinhanca(arquivos, quem, existentes, new Date())) console.log(`⚠️  ${a}`);

  if (resultado.colide) {
    console.error("🚫 O que você alterou pisa em frente reivindicada por outra sessão:");
    for (const m of resultado.motivos) console.error(`   - ${m}`);

    // 5º CONSERTO — NENHUM CAMINHO TERMINA EM BECO SEM SAÍDA. Foi o silêncio
    // aqui, mais o "encerrar" só saindo por push, mais o push barrado pelo
    // próprio gancho, que fechou o deadlock de 16/08/2026. Toda vez que
    // "conferir" BARRA, a saída termina com as opções concretas e copiáveis.
    //
    // Quando o que barrou é, na verdade, uma reivindicação com o MESMO "quem"
    // resolvido agora — sinal de que a identidade gravada no JSON e a
    // identidade resolvida nesta chamada não bateram por um detalhe de
    // formatação (espaço, caixa) — isto quase certamente é a PRÓPRIA sessão
    // sendo barrada pela PRÓPRIA reivindicação. Diz isso com todas as letras.
    // Só roda com identidade CONFIÁVEL (ver CONSERTO 2, rodada 3) — uma
    // identidade SUSPEITA não serve nem para este diagnóstico, porque pode
    // ser literalmente a identidade de OUTRA sessão.
    if (resolvida && resolvida.confiavel) {
      const normalizar = (s: string) => s.trim().toLowerCase();
      const provavelmenteEuMesmo = existentes.some(
        (r) => estaViva(r, new Date()) === "viva" && normalizar(r.quem) === normalizar(resolvida.quem) && r.quem !== resolvida.quem,
      );
      if (provavelmenteEuMesmo) {
        console.error(
          `   ⚠️  Uma das reivindicações acima tem "quem" quase igual ao seu ("${resolvida.quem}") — provavelmente é a ` +
            "SUA PRÓPRIA identidade gravada com uma diferença de formatação (espaço, caixa), não outra sessão. " +
            `Confira "${CAMINHO_IDENTIDADE}" e, se for o caso, regrave com:`,
        );
        console.error(`      ${linhaParaGravarIdentidade(resolvida.quem)}`);
      }
    }

    console.error("Para seguir, uma destas opções:");
    // CONSERTO 2 (16/08/2026) — quando NÃO HÁ identidade CONFIÁVEL — nem
    // resolvida (rodada 2), nem uma resolvida mas SUSPEITA DE HERANÇA
    // (rodada 3, ver acima) — o caso mais comum (esta MESMA sessão sendo
    // barrada por falta de identidade confiável) tem uma saída mais curta
    // que abrir uma reivindicação nova: "conferir --quem <id>" agora GRAVA a
    // identidade (ver CONSERTO 1, acima) e já reconfere na mesma chamada.
    // Por resolver o caso mais comum com menos digitação, ela entra em
    // PRIMEIRO lugar na lista — não depois de opções mais raras.
    if (!resolvida || !resolvida.confiavel) {
      console.error(`   - grave sua identidade e reconfira:  npm run reivindicar -- conferir --quem <seu-id>     (grava a identidade e reconfere)`);
    }
    console.error(`   - se o bloqueio é a SUA PRÓPRIA reivindicação sem identidade gravada:  ${linhaParaGravarIdentidade(quem)}`);
    console.error(`   - se a frente já terminou, encerre-a:  npm run reivindicar -- encerrar --responsabilidade <slug-da-frente-listada-acima>`);
    console.error(`   - se precisa seguir apesar da colisão, force com motivo:  npm run reivindicar -- abrir --quem ${quem} --frente "<...>" --responsabilidade <slug> --arquivos <a,b,c> --forcar --motivo "<por quê>"`);
    console.error(`   - para ver todas as reivindicações vivas e escolher:  npm run reivindicar -- listar`);
    process.exit(1);
  }

  console.log("✅ Sem colisão com reivindicações vivas de outras sessões.");
  process.exit(0);
}

// ─────────────────────────────────────────────────────────────────────────
// encerrar
// ─────────────────────────────────────────────────────────────────────────

function comandoEncerrar(argv: string[]): void {
  const branch = branchAlvo(argv);
  const responsabilidade = (pegarArg(argv, "responsabilidade") || "").trim();
  if (!responsabilidade) {
    console.error("Uso: npm run reivindicar -- encerrar --responsabilidade <slug>");
    process.exit(1);
  }
  const id = normalizarResponsabilidade(responsabilidade);

  console.log(`Buscando origin/${branch}…`);
  const busca = buscarRemoto(branch);
  if (!busca.ok) {
    console.error(`Não consegui alcançar o remoto (${busca.erro}). Nada foi encerrado.`);
    process.exit(1);
  }

  const existentes = lerReivindicacoesRemotas(branch);
  const alvo = existentes.find((r) => r.id === id && !r.encerradaEm);
  if (!alvo) {
    console.error(`Nenhuma reivindicação VIVA com responsabilidade "${responsabilidade}" (normalizada: "${id}") em origin/${branch}.`);
    process.exit(1);
  }

  const encerrada: Reivindicacao = { ...alvo, encerradaEm: new Date().toISOString() };
  mkdirSync(PASTA_REIVINDICACOES, { recursive: true });
  const nomeArquivo = nomeDoArquivo(id);
  const caminhoRelativo = join("reivindicacoes", nomeArquivo);
  writeFileSync(join(RAIZ, caminhoRelativo), `${JSON.stringify(encerrada, null, 2)}\n`, "utf8");

  try {
    commitarEEmpurrar(caminhoRelativo, `encerra: ${alvo.frente}`, branch, { quem: alvo.quem, responsabilidade: alvo.responsabilidade, arquivos: alvo.arquivos });
  } catch (e) {
    console.error(`🚫 ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }

  console.log(`✅ Encerrada: "${alvo.responsabilidade}" (era de ${alvo.quem}).`);
}

// ─────────────────────────────────────────────────────────────────────────
// listar
// ─────────────────────────────────────────────────────────────────────────

function comandoListar(argv: string[]): void {
  const branch = branchAlvo(argv);
  const agora = new Date();

  let existentes: Reivindicacao[];
  let origem: string;
  const busca = buscarRemoto(branch);
  if (busca.ok) {
    try {
      existentes = lerReivindicacoesRemotas(branch);
      origem = `origin/${branch}`;
    } catch (e) {
      console.warn(`⚠️  Remoto alcançável mas não li o registro (${e instanceof Error ? e.message : String(e)}). Mostrando o disco local.`);
      existentes = lerReivindicacoesDoDisco(PASTA_REIVINDICACOES);
      origem = "disco local (registro remoto não leu)";
    }
  } else {
    console.warn(`⚠️  Não alcancei o remoto (${busca.erro}). Mostrando o disco local — pode estar desatualizado.`);
    existentes = lerReivindicacoesDoDisco(PASTA_REIVINDICACOES);
    origem = "disco local (sem rede)";
  }

  if (existentes.length === 0) {
    console.log(`Nenhuma reivindicação em ${origem}.`);
    return;
  }

  console.log(`Reivindicações em ${origem}:\n`);
  for (const r of existentes.sort((a, b) => a.abertaEm.localeCompare(b.abertaEm))) {
    const estado = estaViva(r, agora);
    const rotulo = estado === "encerrada" ? "ENCERRADA" : estado === "velha" ? "VELHA (não bloqueia)" : "VIVA";
    console.log(`── [${rotulo}] ${r.responsabilidade}`);
    console.log(`   quem ......... ${r.quem}`);
    console.log(`   frente ....... ${r.frente}`);
    console.log(`   arquivos ..... ${r.arquivos.join(", ")}`);
    console.log(`   aberta em .... ${r.abertaEm}`);
    if (r.encerradaEm) console.log(`   encerrada em . ${r.encerradaEm}`);
    if (r.forcadaPor) console.log(`   FORÇADA por .. ${r.forcadaPor.quem}: "${r.forcadaPor.motivo}" (${r.forcadaPor.em})`);
    console.log("");
  }
}

// ─────────────────────────────────────────────────────────────────────────
// instalar-gancho
// ─────────────────────────────────────────────────────────────────────────

const CONTEUDO_DO_GANCHO = `#!/bin/sh
# Instalado por "npm run reivindicar -- instalar-gancho".
#
# Roda \`conferir\` antes de cada push: se o que você tocou pisa em frente
# reivindicada por outra sessão, o push é barrado AQUI — antes do
# "git pull --rebase", que é onde a colisão apareceria sem aviso nenhum.
#
# Sem rede, "conferir" avisa e deixa passar (a régua fica dentro dele, não
# aqui): portão que barra por falha de infraestrutura ensina todo mundo a usar
# --no-verify, e aí ele deixa de existir.
npx tsx "$(git rev-parse --show-toplevel)/scripts/reivindicar.mts" conferir
`;

/** Escreve o gancho de fato. Lança em vez de chamar `process.exit` — quem
 *  decide o código de saída é `comandoInstalarGancho`, que precisa de um
 *  ÚNICO ponto de decisão para respeitar `--silencioso` (ver o comentário
 *  grande logo abaixo, sobre por que esta chamada existe). */
function escreverGancho(silencioso: boolean): void {
  const commonDir = gitOuNulo(["rev-parse", "--git-common-dir"]);
  if (!commonDir) {
    throw new Error("Não consegui achar o git-common-dir. Rode isto de dentro do repositório.");
  }
  const pastaGanchos = resolve(RAIZ, commonDir, "hooks");
  mkdirSync(pastaGanchos, { recursive: true });
  const caminhoGancho = join(pastaGanchos, "pre-push");
  if (existsSync(caminhoGancho) && !silencioso) {
    console.log(`Já existe um gancho pre-push em ${caminhoGancho} — sobrescrevendo.`);
  }
  writeFileSync(caminhoGancho, CONTEUDO_DO_GANCHO, "utf8");
  chmodSync(caminhoGancho, 0o755);
  if (!silencioso) {
    console.log(`✅ Gancho pre-push instalado em ${caminhoGancho}.`);
    console.log("   Vale para este worktree e para os outros que compartilham este git-common-dir.");
  }
}

/**
 * ── POR QUE ESTE GANCHO SE AUTO-INSTALA (16/08/2026) ────────────────────────
 * Um gancho que só existe se alguém LEMBRAR de rodar
 * "npm run reivindicar -- instalar-gancho" na mão é um gancho que metade da
 * equipe não tem — e a trava de colisão do `conferir` só protege quem
 * instalou por conta própria. `package.json` chama este comando no script
 * "prepare", que o npm roda SOZINHO em todo "npm install"/"npm ci": o gancho
 * passa a existir pelo simples fato de alguém ter clonado o repo e instalado
 * as dependências — sem precisar de um segundo passo que ninguém documenta e
 * ninguém lembra de rodar.
 *
 * Duas regras não-negociáveis para ESTA chamada específica (a do "prepare"):
 *
 *   1. NUNCA pode derrubar o "npm install"/"npm ci". Um gancho opcional que
 *      falha (não é repositório git, permissão negada, git-common-dir
 *      sumido) não pode ser motivo para a instalação INTEIRA falhar — por
 *      isso "prepare" chama com "--silencioso": qualquer erro aqui sai 0, em
 *      silêncio, sem barrar nada. O pior resultado possível é "o gancho não
 *      ficou instalado", nunca "o npm install quebrou por causa de um gancho
 *      que ninguém pediu para ver".
 *   2. "--silencioso" também cala a saída de SUCESSO. "npm install" já é
 *      barulhento por natureza, e duas linhas de gancho no meio do log de
 *      toda instalação é ruído que ninguém pediu.
 *
 * Rodar na mão sem a flag ("npm run reivindicar -- instalar-gancho") continua
 * falhando alto e mostrando o erro de verdade — é o modo de quem está
 * depurando o próprio gancho, não o modo do npm install.
 */
function comandoInstalarGancho(argv: string[]): void {
  const silencioso = temFlag(argv, "silencioso");
  try {
    escreverGancho(silencioso);
  } catch (e) {
    if (silencioso) {
      // Ver a regra 1 acima: falhar aqui NUNCA pode derrubar "npm install"/"npm ci".
      process.exit(0);
    }
    console.error(`🚫 ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}

// ─────────────────────────────────────────────────────────────────────────

function main(): void {
  const [subcomando, ...resto] = process.argv.slice(2);

  switch (subcomando) {
    case "abrir":
      return comandoAbrir(resto);
    case "conferir":
      return comandoConferir(resto);
    case "encerrar":
      return comandoEncerrar(resto);
    case "listar":
      return comandoListar(resto);
    case "instalar-gancho":
      return comandoInstalarGancho(resto);
    default:
      console.error("Uso: npm run reivindicar -- <abrir|conferir|encerrar|listar|instalar-gancho> [opções]");
      process.exit(1);
  }
}

main();
