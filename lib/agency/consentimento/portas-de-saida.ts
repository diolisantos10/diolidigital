// portas-de-saida.ts — AS PORTAS SÃO DESCOBERTAS, NÃO LISTADAS.
//
// ─── POR QUE ESTE ARQUIVO EXISTE (24/08/2026) ────────────────────────────────
//
// A primeira versão da trava de consentimento foi conferida por um teste que
// carregava a lista das portas ESCRITA À MÃO. Era o mesmo defeito que a casa
// tinha acabado de exterminar em dois outros lugares na mesma passada — a
// lista de campos da marca copiada em vez de importada, e `TIPOS_PUBLICAVEIS`
// digitado em vez de derivado — sobrevivendo no terceiro. E no mais caro dos
// três: **a porta que ninguém listar é a porta por onde a mensagem sai sem
// consentimento.**
//
// Já havia precedente do estrago. O cabeçalho de `lib/email/send.ts` afirmava,
// com a palavra "medido", ser a ÚNICA porta de saída da casa. Três portas
// nasceram depois e ninguém releu a frase: elas ficaram sem cadeado nenhum até
// serem descobertas por acaso.
//
// A pergunta certa não é "estas portas chamam a trava?". É **"existe alguma
// saída para o mundo que não passe pela trava?"** — e essa só se responde
// varrendo.
//
// ─── O CRITÉRIO ESTRUTURAL ───────────────────────────────────────────────────
//
// Um módulo é CANDIDATO A PORTA quando as duas coisas valem no código dele
// (comentários não contam — senão todo arquivo que MENCIONA a trava viraria
// candidato):
//
//   1. ele escreve na rede para fora: usa um dos transportes da casa
//      (`graphPost*`, o cliente do Graph da Meta) OU chama `fetch` tendo um
//      host externo literal no arquivo;
//   2. ele fala em DESTINATÁRIO: `to:`, `destino`, `phoneNumberId`,
//      `contactWaId`, `whatsapp`, `email`.
//
// Candidato tem de resolver a sua situação de uma das duas formas: chamando
// `avaliarConsentimento`, ou entrando em `NAO_MANDA_MENSAGEM_A_PESSOA` com o
// motivo escrito. **Não há terceira opção, e é isso que faz a quinta porta
// nascer coberta:** um módulo novo que case com o critério e não faça nenhuma
// das duas coisas quebra o build.
//
// ─── O QUE ESTE CRITÉRIO NÃO PEGA — declarado, não maquiado ──────────────────
//
// Ele lê MÓDULO, não grafo de chamada. Uma porta que não nomeie o destinatário
// com nenhuma das palavras acima, e que use um transporte que ainda não existe,
// passaria despercebida. É por isso que ela **não é a única rede**: o campo
// `consentimento` é OBRIGATÓRIO no input das portas, então quem escreve a porta
// nova esbarra no compilador antes de esbarrar neste arquivo. Duas redes com
// furos diferentes; a aposta é que a mesma porta não escape das duas.

import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

/** Transportes da casa que falam com terceiros. */
const TRANSPORTE = /\bgraph(Post|PostJson|Get|Patch|Delete)\s*[<(]/;
const CHAMA_FETCH = /\bfetch\s*\(/;
const HOST_EXTERNO = /["'`]https:\/\/[a-z0-9.-]+/i;
/** O módulo fala em destinatário de mensagem? */
const CONTATO = /\bto:|\bdestino\b|destinatario|phoneNumberId|contactWaId|\bwhatsapp\b|\bemail\b/i;

/** As pastas varridas. Tudo que roda no servidor e pode falar com o mundo. */
const RAIZES = ["lib", "app"];

/**
 * OS CANDIDATOS QUE **NÃO** MANDAM MENSAGEM A UMA PESSOA.
 *
 * Cada um com o motivo escrito, porque isenção sem motivo é a lista à mão
 * voltando pela porta dos fundos. O teste confere que todo nome daqui ainda
 * casa com o critério: entrada que virou letra morta é apagada, não esquecida.
 */
export const NAO_MANDA_MENSAGEM_A_PESSOA: Record<string, string> = {
  "app/api/auth/google/callback/route.ts":
    "Troca de código por token no OAuth do Google. O 'email' aqui é o perfil de quem está LOGANDO na agência; nada é enviado a ninguém.",
  "app/api/google/drive/callback/route.ts":
    "Mesmo caso: retorno do OAuth do Drive. Guarda credencial, não fala com contato nenhum.",
  "app/api/brain/briefing-extract/route.ts":
    "Manda o TEXTO do briefing para a IA extrair campos (o e-mail citado é um campo extraído, não um destinatário). Não há envio a pessoa.",
  "app/api/self-serve/order/route.ts":
    "Cria a cobrança no provedor de pagamento. O e-mail vai como dado do pagador para o gateway — não é mensagem para o pagador.",
  "app/api/self-serve/assinatura/route.ts":
    "Mesmo caso da rota irmã, para a cobrança MENSAL: cria o `preapproval` no Mercado Pago e o `payer_email` vai como dado do pagador, para o gateway saber a quem cobrar. Nenhuma mensagem sai desta casa — quem eventualmente escreve ao cliente é o provedor, sobre a cobrança que ele mesmo autorizou.",
  "app/contato/ContatoForm.tsx":
    "O formulário de contato do site: o visitante escreve PARA a Dioli, e o destino é a caixa da própria casa. É mensagem ENTRANDO, e quem a envia é a pessoa, por vontade dela. Foi a varredura que encontrou esta — nenhuma lista à mão a tinha.",
  "app/api/agency/diagnostico-de-email/route.ts":
    "Sonda de LEITURA da configuração de e-mail: chama `GET https://api.resend.com/domains` para saber se a chave é aceita e devolver a mensagem real do provedor. Nenhuma mensagem sai — não há corpo, não há destinatário, e o método é GET. Existe justamente porque a casa não conseguia distinguir 'chave cadastrada' de 'chave válida' de 'remetente autorizado' sem MANDAR um e-mail para descobrir, que é o teste que não se pode fazer.",
  "lib/ai/visao.ts":
    "Manda imagem para o provedor de visão computacional. Destinatário é uma API, não uma pessoa.",
  "lib/integrations/meta/ads.ts":
    "API de anúncios: lê e escreve campanhas na conta do cliente. Anúncio é mídia paga com regra própria (a da plataforma) — não é mensagem direta a um contato.",
  "lib/integrations/google/client.ts":
    "Publica no perfil do Google do cliente e responde AVALIAÇÃO PÚBLICA — que é resposta a quem escreveu na vitrine da marca, e resposta não é abordagem. Não há base de contatos aqui; o destino é um id de conexão, e o cadeado que falta a esta porta está declarado em `CADEADOS_POR_CANAL` (`trava-de-saida.ts`), não escondido aqui.",
};

export interface CandidatoAPorta {
  /** Caminho relativo à raiz do repositório, com "/" sempre. */
  arquivo: string;
  /** O módulo chama o juízo de consentimento? */
  chamaATrava: boolean;
}

function* arquivosTs(dir: string): Generator<string> {
  let entradas;
  try { entradas = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entradas) {
    const caminho = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "generated" || e.name === ".next") continue;
      yield* arquivosTs(caminho);
      continue;
    }
    if (e.isFile() && (e.name.endsWith(".ts") || e.name.endsWith(".tsx"))) yield caminho;
  }
}

/** O código sem as linhas que são só comentário. Um arquivo que EXPLICA a
 *  trava não pode virar candidato por falar dela. */
function semComentarios(fonte: string): string {
  return fonte.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
}

/**
 * Varre o repositório e devolve TODO módulo que case com o critério de porta.
 *
 * `raiz` é a raiz do repositório (em teste, `process.cwd()`).
 */
export function acharCandidatosAPorta(raiz: string): CandidatoAPorta[] {
  const achados: CandidatoAPorta[] = [];
  for (const pasta of RAIZES) {
    for (const caminho of arquivosTs(join(raiz, pasta))) {
      const rel = relative(raiz, caminho).split(sep).join("/");
      if (rel.includes("__tests__")) continue;
      const fonte = readFileSync(caminho, "utf8");
      const codigo = semComentarios(fonte);
      const escreveNaRede = TRANSPORTE.test(codigo) || (CHAMA_FETCH.test(codigo) && HOST_EXTERNO.test(codigo));
      if (!escreveNaRede || !CONTATO.test(codigo)) continue;
      achados.push({ arquivo: rel, chamaATrava: /avaliarConsentimento\s*\(/.test(codigo) });
    }
  }
  return achados.sort((a, b) => a.arquivo.localeCompare(b.arquivo));
}
