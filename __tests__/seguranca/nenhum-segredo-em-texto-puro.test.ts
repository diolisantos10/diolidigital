import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve, extname } from "node:path";

/**
 * ⛔ A CATRACA CONTRA A VOLTA DA SENHA NO CÓDIGO.
 *
 * 🔴 O QUE ACONTECEU (26/08/2026). `prisma/seed.ts` carregava a senha do
 * usuário MASTER em texto puro, e mais dez scripts repetiam a mesma string.
 * Quem clonasse o repositório tinha a credencial de dono da agência na mão,
 * escrita, sem precisar de nada além de saber ler.
 *
 * A senha saiu. Mas tirar uma vez não resolve: a senha voltou ao código todas
 * as vezes em que alguém precisou de um script "só para testar rápido", e o
 * comentário pedindo para não fazer isso não impediu nenhuma delas.
 *
 * 🔒 POR QUE ISTO É UM TESTE E NÃO UM AVISO. Prompt é aviso; código é trava.
 * Este arquivo LÊ os arquivos versionados e reprova a rodada se qualquer
 * senha, token, chave ou string de conexão em texto puro reaparecer. Não
 * confia em revisão, não confia em memória, e não pode ser satisfeito por
 * boa intenção.
 *
 * 🧪 A PROVA DE QUE ELE MIRA O ALVO CERTO. Devolva uma senha literal a
 * `prisma/seed.ts` (`await hash("qualquercoisa123", 12)`) e este teste fica
 * VERMELHO. Régua verde sobre o componente errado é pior que régua nenhuma.
 *
 * ⚠️ ESTE ARQUIVO NÃO CONTÉM NENHUM SEGREDO — nem como exemplo, nem como
 * padrão a procurar. Ele reconhece a FORMA de um segredo escrito, não um
 * segredo específico. Nunca cole aqui a senha que você quer proibir: isso
 * seria escrevê-la no repositório de novo, com a desculpa de estar testando.
 *
 * ── O QUE ESTA CATRACA **NÃO** PEGA ──────────────────────────────────────
 *
 * Ponto fraco declarado é dívida; silencioso é armadilha. Então, por escrito:
 *
 * 1. **Segredo em palavras, sem nenhum dígito.** `naoEhSegredo` absolve
 *    qualquer valor sem dígito, porque sem essa regra todo nome de cookie,
 *    rota e campo do banco vira alarme e o teste é desligado em uma semana.
 *    O preço é real: `portalToken: "dioli-digital-portal-token"` em
 *    `prisma/seed.ts` PASSA por aqui. Ele só nasce com `SEED_PILOTO=true`
 *    (ausente em produção) e é assunto do portal, não do seed — mas um token
 *    de acesso previsível é um token fraco, e fica registrado.
 * 2. **O histórico do git.** A varredura olha o estado ATUAL dos arquivos.
 *    Um segredo já commitado e depois removido continua no histórico e
 *    continua vazado — tirar do código não é o mesmo que rotacionar.
 * 3. **Segredo de fornecedor sem prefixo reconhecível.** A lista de prefixos
 *    cobre os que esta casa usa; um fornecedor novo entra sem ser visto até
 *    alguém acrescentá-lo em `PREFIXOS_DE_FORNECEDOR`.
 */

const RAIZ = resolve(__dirname, "..", "..");

/** Extensões onde um segredo escrito realmente causa dano. */
const EXTENSOES = new Set([
  ".ts", ".tsx", ".mts", ".cts",
  ".js", ".jsx", ".mjs", ".cjs",
  ".sh", ".json", ".yml", ".yaml", ".env", ".sql",
]);

/**
 * Diretórios e arquivos fora do alcance.
 *
 * A lista é CURTA de propósito: cada linha aqui é um lugar onde a catraca
 * deixa de girar, e uma isenção larga esvazia o teste em silêncio.
 */
const FORA_DO_ALCANCE = [
  "node_modules/",
  "lib/generated/",
  ".next/",
  "package-lock.json",
  // Este próprio arquivo: ele fala de segredos para reconhecê-los.
  "__tests__/seguranca/nenhum-segredo-em-texto-puro.test.ts",
];

/**
 * Chaves cujo VALOR literal é uma credencial.
 *
 * Casam com `password: "…"`, `senha = "…"`, `apiKey: '…'`, `SECRET="…"` —
 * em TS, JS, JSON e shell.
 */
const CHAVES_DE_SEGREDO = [
  "password", "passwd", "senha",
  "secret", "segredo",
  "apikey", "api_key",
  "token", "authtoken", "auth_token", "accesstoken", "access_token",
  "credential", "credencial",
  "privatekey", "private_key",
];

/**
 * Prefixos que identificam a credencial de um fornecedor mesmo sem chave
 * ao lado — um destes escrito em qualquer lugar já é vazamento.
 */
const PREFIXOS_DE_FORNECEDOR: Array<[string, RegExp]> = [
  ["OpenAI",        /\bsk-[A-Za-z0-9_-]{20,}/],
  ["Anthropic",     /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ["GitHub",        /\bgh[pousr]_[A-Za-z0-9]{30,}/],
  ["Google",        /\bAIza[A-Za-z0-9_-]{30,}/],
  ["Resend",        /\bre_[A-Za-z0-9]{20,}/],
  ["Mercado Pago",  /\bAPP_USR-[A-Za-z0-9-]{20,}/],
  ["Slack",         /\bxox[baprs]-[A-Za-z0-9-]{20,}/],
  ["Stripe",        /\b[rs]k_(live|test)_[A-Za-z0-9]{20,}/],
  ["chave privada", /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/],
];

/** String de conexão com senha embutida: `protocolo://usuario:senha@host`. */
const CONEXAO_COM_SENHA =
  /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp|libsql|https?):\/\/[^\s:'"`/]+:([^\s@'"`]{4,})@/g;

/** Token de banco na query string: `?authToken=…`. */
const TOKEN_NA_URL = /[?&]auth[_-]?token=([^\s&'"`)]{8,})/gi;

const chaves = CHAVES_DE_SEGREDO.join("|");
/** `chave` `:` ou `=` `"valor"` — aspas simples, duplas ou crase. */
const ATRIBUICAO = new RegExp(
  String.raw`(?<![A-Za-z0-9_])(${chaves})\s*[:=]\s*(['"\`])([^'"\`\n]*)\2`,
  "gi",
);

/**
 * Um valor literal que NÃO é segredo.
 *
 * Cada item aqui é uma forma que não carrega credencial nenhuma. Se um dia
 * algo real for absolvido por engano, o conserto é apertar esta função — não
 * apagar o teste.
 */
function naoEhSegredo(valor: string): boolean {
  const v = valor.trim();

  // Vazio, ou curto demais para ser credencial de verdade.
  if (v.length < 8) return true;

  // Interpolação / referência de variável — o valor não está aqui.
  if (v.includes("${") || v.includes("process.env") || /^\$[A-Za-z_]/.test(v)) return true;

  // Marcador de exemplo: <cole aqui>, …, seu-token, xxxx, TODO.
  if (/[<>…]/.test(v)) return true;
  if (/^(seu|sua|your|my|exemplo|example|placeholder|changeme|todo|null|undefined|true|false)\b/i.test(v)) return true;
  if (/^x{4,}$/i.test(v) || /^\*{4,}$/.test(v) || /^\.{3,}$/.test(v)) return true;

  // Nome de variável de ambiente, não o valor dela.
  if (/^[A-Z][A-Z0-9_]{5,}$/.test(v)) return true;

  // Hash bcrypt: é o RESULTADO de uma senha, não a senha. Guardar hash é o
  // comportamento correto — proibi-lo empurraria alguém a guardar o original.
  if (/^\$2[aby]\$\d{2}\$/.test(v)) return true;

  // Frase em português/inglês com espaços: mensagem de erro, rótulo de tela,
  // texto de placeholder de formulário. Senha não tem espaço nem acento.
  if (/\s/.test(v)) return true;

  // Caminho, seletor de CSS/DOM, rota, tipo MIME, nome de campo.
  if (/^[./#[]/.test(v) || v.includes("/") || v.startsWith("data-")) return true;

  // Identificador em kebab/snake/camel sem nenhum dígito: é nome, não segredo.
  // (`dioli-session`, `passwordHash`, `access_token`.) Um valor com letra E
  // dígito misturados continua suspeito — é a cara de uma senha.
  if (!/\d/.test(v)) return true;

  return false;
}

/** Arquivos VERSIONADOS — o que vaza é o que está no git, não o que está no disco. */
function arquivosVersionados(): string[] {
  const saida = execFileSync("git", ["ls-files", "-z"], {
    cwd: RAIZ,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return saida
    .split("\0")
    .filter(Boolean)
    .filter((p) => EXTENSOES.has(extname(p)))
    .filter((p) => !FORA_DO_ALCANCE.some((fora) => p.startsWith(fora) || p === fora));
}

type Achado = { arquivo: string; linha: number; motivo: string };

function varrer(): Achado[] {
  const achados: Achado[] = [];

  for (const relativo of arquivosVersionados()) {
    let conteudo: string;
    try {
      conteudo = readFileSync(join(RAIZ, relativo), "utf8");
    } catch {
      continue; // arquivo binário ou removido entre o ls-files e a leitura
    }
    if (conteudo.includes("\0")) continue;

    const linhas = conteudo.split("\n");
    linhas.forEach((linha, i) => {
      const numero = i + 1;

      // Uma linha pode dizer explicitamente que ali não há segredo. A marca
      // vale na PRÓPRIA linha ou na imediatamente acima — porque nem toda
      // linha comporta um comentário no fim sem quebrar a expressão.
      //
      // O alcance para aí de propósito: é isenção de LINHA, com justificativa
      // ao lado. Isenção de arquivo ou de pasta some da vista e esvazia a
      // catraca sem ninguém perceber.
      if (linha.includes("segredo-permitido")) return;
      if (i > 0 && linhas[i - 1].includes("segredo-permitido")) return;

      for (const [fornecedor, padrao] of PREFIXOS_DE_FORNECEDOR) {
        if (padrao.test(linha)) {
          achados.push({ arquivo: relativo, linha: numero, motivo: `credencial de ${fornecedor} escrita em texto puro` });
        }
      }

      for (const m of linha.matchAll(CONEXAO_COM_SENHA)) {
        if (!naoEhSegredo(m[1])) {
          achados.push({ arquivo: relativo, linha: numero, motivo: "string de conexão com senha embutida" });
        }
      }

      for (const m of linha.matchAll(TOKEN_NA_URL)) {
        if (!naoEhSegredo(m[1])) {
          achados.push({ arquivo: relativo, linha: numero, motivo: "token de banco na query string" });
        }
      }

      for (const m of linha.matchAll(ATRIBUICAO)) {
        const [, chave, , valor] = m;
        if (!naoEhSegredo(valor)) {
          achados.push({ arquivo: relativo, linha: numero, motivo: `\`${chave}\` recebe um literal` });
        }
      }
    });
  }

  return achados;
}

describe("nenhum segredo em texto puro no repositório", () => {
  it("não há senha, token, chave ou string de conexão escrita nos arquivos versionados", () => {
    const achados = varrer();

    // O relatório diz ARQUIVO, LINHA e MOTIVO — nunca o valor encontrado.
    // Um teste que imprime o segredo para provar que ele existe o publica no
    // log de CI, que é público e fica guardado.
    const relatorio = achados
      .map((a) => `  ${a.arquivo}:${a.linha} — ${a.motivo}`)
      .join("\n");

    expect(
      achados,
      achados.length === 0
        ? ""
        : `\n⛔ Segredo em texto puro no repositório (${achados.length}):\n${relatorio}\n\n` +
            `Tire o valor do código: leia de variável de ambiente e FALHE quando ela ` +
            `faltar — ausência de chave nunca vira porta aberta. Se a linha ` +
            `comprovadamente não carrega segredo, marque-a com o comentário ` +
            `"segredo-permitido" e diga por quê.\n`,
    ).toEqual([]);
  });

  it("o seed do master não aceita senha literal — só variável de ambiente", () => {
    const seed = readFileSync(join(RAIZ, "prisma", "seed.ts"), "utf8");

    // A régua alcança o código que responde ao cliente: é ESTE arquivo que
    // decide a senha com que o dono da agência entra.
    expect(seed).toMatch(/exigirSenha\(["']SEED_MASTER_PASSWORD["']\)/);
    expect(seed).toMatch(/exigirSenha\(["']SEED_STAFF_PASSWORD["']\)/);

    // `hash("literal", …)` é exatamente a forma que vazou. Nenhuma volta.
    expect(seed).not.toMatch(/hash\(\s*['"`][^'"`\n]+['"`]\s*,/);
  });

  it("o seed de produção falha fechado: sem a variável, não inventa senha", () => {
    const seedProd = readFileSync(join(RAIZ, "scripts", "seed-db.mjs"), "utf8");

    expect(seedProd).toMatch(/exigirSenha\(["']SEED_MASTER_PASSWORD["']\)/);
    expect(seedProd).toMatch(/exigirSenha\(["']SEED_STAFF_PASSWORD["']\)/);

    // Nem senha padrão, nem senha aleatória por boot: as duas fazem a base
    // nascer com uma credencial que ninguém controla.
    expect(seedProd).not.toMatch(/randomBytes/);
    expect(seedProd).not.toMatch(/hash\(\s*['"`][^'"`\n]+['"`]\s*,/);

    // E a função tem que PARAR de verdade, não apenas avisar.
    expect(seedProd).toMatch(/throw new Error/);
  });
});
