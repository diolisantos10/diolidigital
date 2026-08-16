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

import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
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

  const tentarPush = () => execFileSync("git", ["push", "origin", `HEAD:${branch}`], { cwd: RAIZ, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

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
// MEDIÇÃO REAL (16/08/2026): o gancho pre-push chama "conferir" SEM --quem,
// porque o gancho não sabe quem é a sessão. Sem saber "quem sou eu",
// "conferir" não tem como distinguir "isto é a MINHA PRÓPRIA reivindicação"
// de "isto é de outra sessão" — e passou a barrar pm-a27b5772 pela reivindicação
// que pm-a27b5772 MESMO tinha aberto, corretamente, antes de trabalhar. Uma
// trava que pune quem a obedeceu ensina a próxima pessoa a usar --no-verify,
// e a partir daí o portão para de proteger qualquer coisa.
//
// A saída: quando "abrir" grava uma reivindicação com sucesso, ele também
// grava a identidade em ".git/config" (`git config --local dioli.quem <id>`).
// Por quê ali, e não em algum arquivo do repositório:
//   • ".git/config" é LOCAL por natureza — nunca é versionado, nunca vai para
//     o remoto, nunca aparece em "git status". A identidade da sessão é um
//     fato sobre ESTA MÁQUINA/ESTE CHECKOUT, não sobre o código, e não tem
//     por que disputar merge com ninguém.
//   • worktrees de agente compartilham o "git-common-dir" (é de lá que
//     "instalar-gancho" já lê os hooks) — gravar a identidade ali faz ela
//     valer para a sessão inteira, mesmo que ela troque de worktree no meio
//     do trabalho, sem precisar de um arquivo extra para sincronizar.
// "conferir" resolve "quem" nesta ordem: (a) a flag --quem, se foi dada —
// quem digitou sabe melhor que qualquer cache; (b) "git config --get
// dioli.quem", gravado por um "abrir" anterior desta mesma sessão; (c) se
// nenhum dos dois existir, o comando NÃO FINGE que sabe quem é — inventar uma
// identidade aqui seria pior que admitir a lacuna, porque uma identidade
// errada faz a PRÓPRIA reivindicação da sessão parecer alheia (exatamente o
// bug medido acima). Em vez disso ele avisa, claramente, que a identidade é
// desconhecida e que reivindicações próprias não serão distinguidas — e
// segue conferindo mesmo assim, porque falhar fechado por falta de identidade
// bloquearia até quem nunca reivindicou nada.
// ─────────────────────────────────────────────────────────────────────────

/** Grava "quem sou eu" localmente após "abrir" ter sucesso. Falha aqui é
 *  conveniência perdida, não erro: a reivindicação em si já foi gravada e
 *  empurrada — um "git config" que não pegou (permissão, git-common-dir
 *  somente-leitura) não pode fazer o comando "abrir" reportar erro. */
function gravarIdentidadeLocal(quem: string): void {
  try {
    git(["config", "--local", "dioli.quem", quem]);
  } catch {
    // intencionalmente silencioso — ver o comentário da função.
  }
}

/** Lê a identidade gravada por um "abrir" anterior desta sessão. `git config
 *  --get` sai com código != 0 quando a chave não existe — por isso usamos
 *  `gitOuNulo`, que já trata "comando falhou" como "não sei", em vez de `git`,
 *  que lançaria. */
function lerIdentidadeLocal(): string | null {
  const v = gitOuNulo(["config", "--get", "dioli.quem"]);
  return v && v.trim() ? v.trim() : null;
}

/** A ordem de resolução descrita no bloco acima: flag > cache local > "não
 *  sei" (nunca um palpite). Devolve `null` no caso (c) de propósito — quem
 *  chama decide como avisar, esta função só recusa adivinhar. */
function resolverQuemParaConferir(argv: string[]): string | null {
  const daFlag = pegarArg(argv, "quem");
  if (daFlag) return daFlag;
  return lerIdentidadeLocal();
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

  // Só grava a identidade local DEPOIS do push ter dado certo — ver o bloco
  // "Identidade da sessão" acima. Reivindicação que não chegou ao remoto não
  // deve ensinar "conferir" a se reconhecer como dona de nada.
  gravarIdentidadeLocal(quem);

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
  const quemResolvido = resolverQuemParaConferir(argv);
  if (!quemResolvido) {
    console.warn(
      '⚠️  Identidade da sessão desconhecida (sem --quem e sem "git config dioli.quem" gravado por um "abrir" ' +
        "anterior). Reivindicações da PRÓPRIA sessão não serão distinguidas das de outras sessões — pode gerar " +
        'falso positivo. Rode "npm run reivindicar -- abrir" ao menos uma vez nesta sessão para gravar a identidade, ' +
        "ou repita com --quem <id>. Seguindo a conferência mesmo assim — falhar fechado por falta de identidade " +
        "bloquearia até quem nunca reivindicou nada.",
    );
  }
  const quem = quemResolvido ?? "(sessão sem --quem)";

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
