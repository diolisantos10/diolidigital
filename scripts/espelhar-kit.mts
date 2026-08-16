/**
 * O robô de espelho do kit — copia doutrina de `dioli-brain-kit` para
 * `docs/kit/`, e diz a verdade quando não consegue.
 *
 *     tsx scripts/espelhar-kit.mts espelhar --kit <caminho-local-do-kit-clonado>
 *     tsx scripts/espelhar-kit.mts carimbo [--falhou "<mensagem>"]
 *
 * ── POR QUE ISTO EXISTE (16/08/2026) ────────────────────────────────────────
 * `docs/kit/ESPELHO.json` carimbava 09/08/2026 sem nada na pasta que
 * denunciasse os sete dias de atraso. O `CLAUDE.md` já admitia em prosa que as
 * doutrinas 25 a 29 não estavam espelhadas — inclusive a 29, que rege a
 * camada de delegação que esta casa cumpre todo dia — mas a prosa não se
 * atualiza sozinha e ninguém olha `docs/kit/` esperando encontrar um aviso.
 *
 * ── DUAS RESPONSABILIDADES, DUAS PESSOAS DIFERENTES ─────────────────────────
 * Este script NÃO clona o kit e NÃO lida com credencial — quem clona é o
 * workflow (`.github/workflows/kit-espelho.yml`), com o segredo
 * `KIT_REPO_TOKEN`. Medido nesta sessão:
 *
 *   $ git ls-remote https://github.com/diolisantos10/dioli-brain-kit HEAD
 *   fatal: could not read Username for 'https://github.com': terminal prompts disabled
 *   (exit 128)
 *
 * O kit é repositório separado e privado; o `GITHUB_TOKEN` padrão que o
 * GitHub Actions injeta só alcança o próprio repositório. Sem um segredo
 * próprio, o robô nasce esperando por ele — isso é o achado, não um contorno
 * a inventar.
 *
 * ── MODO "espelhar" — descobre, não decora uma lista ────────────────────────
 * A lista de arquivos NÃO está hardcoded aqui: o script lê o diretório
 * `docs/` do kit já clonado (mais `CLAUDE.md` da raiz e `templates/README.md`)
 * no momento em que roda. É assim que a doutrina 25-29 — ou a 30, quando
 * nascer — entra sozinha na próxima rodada com credencial, sem precisar
 * lembrar de atualizar um manifesto aqui.
 *
 * ── MODO "carimbo" — o único que não precisa do kit ─────────────────────────
 * Regenera SÓ `docs/kit/LEIA-PRIMEIRO.md`, a partir do `ESPELHO.json` que já
 * existe em disco. É assim que o aviso nasce gerado, e `docs/kit/` continua
 * sendo pasta gerada — nunca escrita à mão.
 *
 * ── O ROBÔ GRAVA MESMO QUANDO FALHA ─────────────────────────────────────────
 * `ultimaTentativaEm`, `ultimoErro` e `estado` são atualizados nos dois
 * caminhos, sucesso e falha. Falhar e não deixar marca é o mesmo defeito do
 * espelho de hoje: parece certo, não está, nada denuncia. O último espelho
 * BOM conhecido (`arquivos`, `espelhadoEm`, `kitCommit`) nunca é apagado por
 * uma falha de rede — só a tentativa registra que algo deu errado.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PASTA_KIT = join(RAIZ, "docs", "kit");
const CAMINHO_ESPELHO_JSON = join(PASTA_KIT, "ESPELHO.json");
const CAMINHO_LEIA_PRIMEIRO = join(PASTA_KIT, "LEIA-PRIMEIRO.md");

const REPOSITORIO_DO_KIT = "diolisantos10/dioli-brain-kit";

type EstadoDoEspelho = "em-dia" | "falhou" | "nunca-rodou";

interface ArquivoEspelhado {
  origem: string;
  sha256: string;
}

interface EspelhoJson {
  origem: string;
  kitCommit: string;
  espelhadoEm: string;
  /** Quando o robô rodou por último — MESMO QUE TENHA FALHADO. */
  ultimaTentativaEm: string | null;
  /** `null` quando a última tentativa deu certo; a mensagem quando não deu. */
  ultimoErro: string | null;
  estado: EstadoDoEspelho;
  arquivos: Record<string, ArquivoEspelhado>;
}

interface ItemDoManifesto {
  /** Nome do arquivo dentro de `docs/kit/`. */
  nomeNoEspelho: string;
  /** Caminho relativo à raiz do repositório do kit. */
  origemNoKit: string;
}

/** Estado honesto para quando `ESPELHO.json` ainda não existe: NENHUMA data é
 *  inventada — tudo fica `null`/vazio e o `estado` diz "nunca-rodou". */
function espelhoVazio(): EspelhoJson {
  return {
    origem: REPOSITORIO_DO_KIT,
    kitCommit: "",
    espelhadoEm: "",
    ultimaTentativaEm: null,
    ultimoErro: null,
    estado: "nunca-rodou",
    arquivos: {},
  };
}

function lerEspelhoJson(): EspelhoJson {
  if (!existsSync(CAMINHO_ESPELHO_JSON)) return espelhoVazio();
  const bruto = JSON.parse(readFileSync(CAMINHO_ESPELHO_JSON, "utf8")) as Partial<EspelhoJson>;
  // Mescla com o vazio para nunca quebrar se um campo novo ainda não existir
  // num ESPELHO.json antigo — o robô não pode cair por causa do seu próprio
  // histórico.
  return { ...espelhoVazio(), ...bruto };
}

function gravarEspelhoJson(json: EspelhoJson): void {
  writeFileSync(CAMINHO_ESPELHO_JSON, `${JSON.stringify(json, null, 2)}\n`);
}

/** Descobre o que espelhar olhando o kit JÁ CLONADO — não uma lista fixa
 *  escrita aqui. Ver o comentário do topo do arquivo: é o que faz a doutrina
 *  nova entrar sozinha na próxima rodada com credencial. */
function coletarManifestoDoKit(kitPath: string): ItemDoManifesto[] {
  const itens: ItemDoManifesto[] = [];

  const claudeMd = join(kitPath, "CLAUDE.md");
  if (existsSync(claudeMd)) itens.push({ nomeNoEspelho: "CLAUDE.md", origemNoKit: "CLAUDE.md" });

  const pastaDocs = join(kitPath, "docs");
  if (existsSync(pastaDocs)) {
    for (const nome of readdirSync(pastaDocs).sort()) {
      if (!nome.endsWith(".md")) continue;
      itens.push({ nomeNoEspelho: nome, origemNoKit: `docs/${nome}` });
    }
  }

  const templatesReadme = join(kitPath, "templates", "README.md");
  if (existsSync(templatesReadme)) {
    itens.push({ nomeNoEspelho: "templates-README.md", origemNoKit: "templates/README.md" });
  }

  return itens;
}

/** O cabeçalho + bloco de aviso reproduzem, caractere por caractere na
 *  estrutura, o contrato já em vigor em `docs/kit/24-o-quadro-do-ceo.md` —
 *  não é redesenho, é continuação do formato existente. */
function montarConteudoEspelhado(origemNoKit: string, kitCommitCurto: string, kitCommitCompleto: string, corpo: string): { conteudo: string; sha256DoCorpo: string } {
  const sha256DoCorpo = createHash("sha256").update(corpo, "utf8").digest("hex");

  const cabecalho = `<!-- ESPELHO-DO-KIT
origem: ${origemNoKit}
kit-commit: ${kitCommitCompleto}
sha256-do-corpo: ${sha256DoCorpo}
-->

> ⚠️ **ESPELHO GERADO — NÃO EDITE ESTE ARQUIVO.**
>
> Ele é uma cópia automática de \`${REPOSITORIO_DO_KIT}\` → \`${origemNoKit}\`,
> no commit \`${kitCommitCurto}\`.
>
> **Editar aqui não muda a doutrina** — muda só este repositório, e a próxima
> geração do espelho apaga a sua edição sem avisar. Para mudar a regra,
> edite **no kit**; quem escreve lá é o CEO / Diretor Geral do Cérebro.
>
> Um Diretor de projeto **propõe** mudança de doutrina; promover é ato do
> Diretor Geral, com aval do CEO. Isso é o guardrail 3 aplicado à doutrina:
> agente nunca muda as próprias regras.

---

`;

  return { conteudo: cabecalho + corpo, sha256DoCorpo };
}

function diasParado(espelhadoEm: string): number | null {
  if (!espelhadoEm) return null;
  const ms = Date.now() - new Date(espelhadoEm).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function formatarResultadoDaTentativa(json: EspelhoJson): string {
  if (!json.ultimaTentativaEm) return "nunca rodou.";
  if (json.estado === "falhou") return `**FALHOU** em ${json.ultimaTentativaEm} — ${json.ultimoErro ?? "(sem mensagem registrada)"}`;
  return `deu certo em ${json.ultimaTentativaEm}.`;
}

/** Monta `docs/kit/LEIA-PRIMEIRO.md` inteiramente a partir do `ESPELHO.json`
 *  em memória — nenhum dado aqui é digitado à mão, o que é o ponto: o aviso
 *  nasce gerado, não escrito. */
function montarLeiaPrimeiro(json: EspelhoJson): string {
  const dias = diasParado(json.espelhadoEm);
  const kitCommitCurto = json.kitCommit ? json.kitCommit.slice(0, 7) : "(nenhum)";

  const linhaIdade = json.espelhadoEm
    ? `**Carimbado em \`${json.espelhadoEm}\`** (kit \`${kitCommitCurto}\`) — **parado há ${dias} dia(s).**`
    : "**Nunca foi carimbado com sucesso.** Não existe cópia válida de doutrina nesta pasta ainda.";

  return `<!-- GERADO POR scripts/espelhar-kit.mts (modo "carimbo") — NÃO EDITE À MÃO.
     A próxima rodada do robô sobrescreve qualquer edição manual. -->

# LEIA PRIMEIRO — esta pasta é espelho, não é a fonte

> ⚠️ **\`docs/kit/\` é uma CÓPIA AUTOMÁTICA** de \`${REPOSITORIO_DO_KIT}\`,
> gerada por \`scripts/espelhar-kit.mts\`. **Editar qualquer arquivo aqui não
> muda a doutrina** — muda só este repositório, e a próxima geração apaga a
> edição sem avisar. Para mudar a regra, edite **no kit**; quem escreve lá é
> o CEO / Diretor Geral do Cérebro.

## Estado do espelho, agora

- ${linhaIdade}
- **Estado:** \`${json.estado}\`
- **Última tentativa do robô:** ${formatarResultadoDaTentativa(json)}

## A frase que mais importa

**Doutrina ausente aqui NÃO significa doutrina inexistente.** Este espelho pode
estar atrás do kit — medido em 16/08/2026, **estava**: as doutrinas 25, 26,
26a, 27, 28 e 29 não estavam nesta pasta, inclusive a 29, que rege a camada de
delegação que esta casa cumpre todo dia. Se a data acima estiver velha, o
mesmo risco vale hoje.

## Como conferir a idade sem confiar em memória ou em prosa

\`\`\`
npm run kit:carimbo
\`\`\`

Isso regenera este arquivo a partir de \`docs/kit/ESPELHO.json\` — a data acima
nunca é digitada à mão, e por isso não pode divergir do carimbo por esquecimento.

## O que NÃO fazer

Editar um \`.md\` de doutrina aqui dentro. Isso muda a leitura desta cópia, não
a regra — e some sozinho na próxima rodada do robô. Para mudar a doutrina de
verdade, a mudança entra no kit.
`;
}

function gerarCarimbo(jsonForcado?: EspelhoJson): void {
  const json = jsonForcado ?? lerEspelhoJson();
  writeFileSync(CAMINHO_LEIA_PRIMEIRO, montarLeiaPrimeiro(json));
}

async function espelhar(kitPathArg: string | undefined): Promise<void> {
  const agora = new Date().toISOString();
  const anterior = lerEspelhoJson();
  const kitPath = kitPathArg ?? process.env.KIT_LOCAL_PATH;

  try {
    if (!kitPath) {
      throw new Error(
        "Nenhum caminho do kit informado (--kit <caminho> ou KIT_LOCAL_PATH). " +
          "Este script não clona o kit — quem clona é o workflow, com o segredo KIT_REPO_TOKEN.",
      );
    }
    if (!existsSync(kitPath)) {
      throw new Error(`Caminho do kit não existe neste ambiente: ${kitPath}`);
    }

    const kitCommitCompleto = execFileSync("git", ["rev-parse", "HEAD"], { cwd: kitPath, encoding: "utf8" }).trim();
    const kitCommitCurto = kitCommitCompleto.slice(0, 7);

    const manifesto = coletarManifestoDoKit(kitPath);
    if (manifesto.length === 0) {
      throw new Error(`Nenhum arquivo .md encontrado sob ${kitPath}/docs — o caminho do kit parece errado.`);
    }

    const arquivos: Record<string, ArquivoEspelhado> = {};
    for (const item of manifesto) {
      const corpo = readFileSync(join(kitPath, item.origemNoKit), "utf8");
      const { conteudo, sha256DoCorpo } = montarConteudoEspelhado(item.origemNoKit, kitCommitCurto, kitCommitCompleto, corpo);
      writeFileSync(join(PASTA_KIT, item.nomeNoEspelho), conteudo);
      arquivos[item.nomeNoEspelho] = { origem: item.origemNoKit, sha256: sha256DoCorpo };
    }

    const novo: EspelhoJson = {
      origem: REPOSITORIO_DO_KIT,
      kitCommit: kitCommitCompleto,
      espelhadoEm: agora,
      ultimaTentativaEm: agora,
      ultimoErro: null,
      estado: "em-dia",
      arquivos,
    };
    gravarEspelhoJson(novo);
    gerarCarimbo(novo);
    console.log(`[espelhar-kit] espelhados ${manifesto.length} arquivo(s) do kit ${kitCommitCurto}.`);
  } catch (erro) {
    // O ÚLTIMO ESPELHO BOM NUNCA É APAGADO POR UMA FALHA: só os campos de
    // tentativa mudam. É o que impede uma falha de rede de esconder a última
    // cópia válida atrás de um `espelhadoEm` zerado.
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    const registroFalho: EspelhoJson = {
      ...anterior,
      ultimaTentativaEm: agora,
      ultimoErro: mensagem,
      estado: "falhou",
    };
    gravarEspelhoJson(registroFalho);
    gerarCarimbo(registroFalho);
    console.error(`[espelhar-kit] FALHOU: ${mensagem}`);
    process.exitCode = 1;
  }
}

function carimbo(falhouMensagem: string | undefined): void {
  let json = lerEspelhoJson();
  if (falhouMensagem) {
    json = { ...json, ultimaTentativaEm: new Date().toISOString(), ultimoErro: falhouMensagem, estado: "falhou" };
    gravarEspelhoJson(json);
  }
  gerarCarimbo(json);
  console.log("[espelhar-kit] docs/kit/LEIA-PRIMEIRO.md regenerado a partir de ESPELHO.json.");
}

function pegarValorDaFlag(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main(): Promise<void> {
  const [modo, ...resto] = process.argv.slice(2);

  switch (modo) {
    case "espelhar":
      await espelhar(pegarValorDaFlag(resto, "--kit"));
      return;
    case "carimbo":
      carimbo(pegarValorDaFlag(resto, "--falhou"));
      return;
    default:
      console.error('Uso: tsx scripts/espelhar-kit.mts espelhar --kit "<caminho-local-do-kit-clonado>"');
      console.error('     tsx scripts/espelhar-kit.mts carimbo [--falhou "<mensagem>"]');
      process.exitCode = 1;
  }
}

void main();
