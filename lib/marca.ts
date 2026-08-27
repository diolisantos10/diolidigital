// marca.ts — QUEM É ESTA EMPRESA. Uma fonte só, e é esta.
//
// ─── A ORDEM QUE CRIOU ISTO (27/08/2026) ────────────────────────────────────
//
// O primeiro e-mail real da casa chegou à caixa do CEO e vinha assinado
// **"DIOLI STUDIO"**. Palavras dele:
//
//   *"Esqueceram né, eu gosto de Dioli Studio, mas a nossa empresa é Dioli
//   Digital. (…) A gente é Dioli Digital."*
//
// O nome não estava errado em UM lugar: estava escrito à mão em seis, cada um
// com a sua grafia e a sua época — dois rodapés de e-mail, duas saudações do
// SDR, um cabeçalho de tela e uma constante de remetente. **Verdade escrita em
// dois lugares já está errada em um deles**, e este foi o dia em que a conta
// chegou: a agência se apresentou ao próprio dono com o nome errado.
//
// A partir daqui NINGUÉM digita o nome da empresa. Quem precisa dele importa
// daqui. O teste `__tests__/marca/uma-fonte-so.test.ts` fica vermelho se o nome
// velho voltar a aparecer em código que fala com o cliente.
//
// ⚠️ O QUE **NÃO** É COBERTO, e fica declarado em vez de maquiado:
//   • `lib/agency/mock-data.ts` — dados de DEMONSTRAÇÃO, onde "Dioli Studio" é
//     o nome de um cliente fictício de exemplo. Não chega a cliente nenhum.
//   • `RESEND_FROM`, que decide o nome no campo "De:" da caixa de entrada, é
//     variável de ambiente do Railway — **código nenhum pode consertá-la**.
//     Ela é do CEO.

import { WHATSAPP_DA_DIOLI } from "@/lib/agency/comercial/link-do-whatsapp";

/** O nome da empresa. Um só, e é este. */
export const NOME_DA_EMPRESA = "Dioli Digital";

/** O nome que a casa NÃO usa mais. Existe para o teste poder caçá-lo — nomear
 *  o que se recusa vale mais que apagar. */
export const NOME_APOSENTADO = "Dioli Studio";

/** O endereço público da casa. Toda URL absoluta de e-mail nasce daqui. */
export const SITE_DA_EMPRESA = "https://www.diolidigital.com.br";

// ── O WHATSAPP ──────────────────────────────────────────────────────────────
//
// Os dois formatos existem porque servem a coisas diferentes, e trocá-los
// quebra o link: `wa.me` exige **só dígitos, com o código do país**; o humano
// lê `(11) 98940-0692`. Manter os dois derivados de uma constante só impede o
// clássico "consertaram o texto e esqueceram o href".

/**
 * Só dígitos, com país. É o que o `wa.me` aceita.
 *
 * ⛔ **NÃO É DIGITADO AQUI.** Ele vem de
 * `lib/agency/comercial/link-do-whatsapp.ts`, que já era a fonte única do
 * número para a tela de briefing e para a home — e onde está escrito que o
 * mesmo número chegou a viver em OITO arquivos ao mesmo tempo. Reescrevê-lo
 * aqui teria criado o nono: o e-mail é a única superfície da casa que ninguém
 * consegue corrigir depois de enviada, e um número desatualizado num botão de
 * WhatsApp é um cliente que fala com o vazio.
 *
 * A dependência aponta para o comercial porque é lá que o número nasce; a
 * marca só o veste. Se um dia o comercial passar a depender da marca, esta é a
 * seta que precisa ser invertida — e não duplicada.
 */
export const WHATSAPP_DIGITOS: string = WHATSAPP_DA_DIOLI;

/** Como uma pessoa lê o número. */
export const WHATSAPP_LEGIVEL = "(11) 98940-0692";

/** O link do botão. Derivado — nunca digitado. */
export const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_DIGITOS}`;

/**
 * O convite do botão de WhatsApp, na voz que o CEO pediu:
 *
 *   *"'qualquer coisa entra em contato com o nosso WhatsApp, o número' — eu
 *   acho uma coisa muito pobre, tem que ser um link com um botão: 'WhatsApp —
 *   qualquer dúvida estamos à disposição'. Uma coisa mais sofisticada."*
 */
export const WHATSAPP_CONVITE = "WhatsApp — qualquer dúvida, estamos à disposição";

// ── O LOGO ──────────────────────────────────────────────────────────────────
//
// ⚠️ URL ABSOLUTA E PÚBLICA, e as duas palavras são obrigatórias.
//
// Caminho relativo (`/brand/...`) não existe dentro de um cliente de e-mail: o
// Gmail não sabe de que servidor a imagem viria. E o arquivo tem de servir SEM
// sessão — um logo atrás de `/api/media` ou de cookie apareceria quebrado para
// todo mundo que não estivesse logado na agência, que é justamente 100% dos
// destinatários.
//
// Medido em 27/08/2026: `GET https://www.diolidigital.com.br/brand/dioli-logo-h-white-512.png`
// responde `200 image/png`, sem cookie nenhum. Os arquivos vivem em
// `public/brand/` e são versionados no repositório — não é arte inventada nem
// logo de terceiro.
//
// A versão BRANCA porque ela assenta sobre a barra navy do cabeçalho.
export const LOGO_BRANCO_URL = `${SITE_DA_EMPRESA}/brand/dioli-logo-h-white-512.png`;

/**
 * ⛔ O `alt` NÃO É ACESSIBILIDADE DECORATIVA — é o plano A.
 *
 * Gmail e Outlook bloqueiam imagem por padrão em remetente novo. Se o `alt`
 * fosse "logo" ou vazio, o cabeçalho do e-mail chegaria **anônimo**: uma caixa
 * cinza onde deveria estar o nome de quem escreveu. Com o nome ali, o e-mail
 * com imagens bloqueadas ainda diz de quem é — que é o requisito real.
 */
export const LOGO_ALT = NOME_DA_EMPRESA;

/**
 * O TAMANHO DECLARADO DO LOGO NO E-MAIL — e por que ele não é chute.
 *
 * Cliente de e-mail EXIGE `width` e `height` no `<img>`: sem eles, o layout
 * pula quando a imagem carrega, e quem bloqueia imagem vê a linha do `alt`
 * colapsar contra a borda. Só que declarar um tamanho que não bate com a
 * proporção do arquivo **estica o logo** — e logo esticado é o oposto de "cara
 * de empresa grande".
 *
 * Foi o que estava acontecendo: 150 × 34 (proporção 4,41) sobre um arquivo de
 * 512 × 130 (proporção 3,94). O logo chegava achatado em toda caixa de entrada.
 *
 * 150 × 38 é a proporção do arquivo real, arredondada ao pixel inteiro.
 * `__tests__/marca/uma-fonte-so.test.ts` lê o cabeçalho do PNG e reprova se os
 * dois deixarem de bater — inclusive se alguém trocar a arte por outra.
 */
export const LOGO_LARGURA = 150;
export const LOGO_ALTURA = 38;

// ── AS CORES ────────────────────────────────────────────────────────────────
//
// Amostradas do Brand Book v1 (`docs/brand/`), pelos mesmos valores que
// `app/globals.css` usa no produto. Ficam repetidas aqui — e SÓ aqui — porque
// e-mail não lê CSS externo nem variável de tema: cada cor tem de ir escrita
// dentro do atributo `style`, inline, no HTML enviado.
export const CORES = {
  /** #070A1F — o navy da marca. Cabeçalho e botões. */
  navy: "#070A1F",
  /** #9AF5F0 — a menta oficial. Tempero, não prato: fios e acentos finos. */
  menta: "#9AF5F0",
  /** #1F2937 — grafite. O texto que se lê. */
  grafite: "#1F2937",
  /** #F7F8FA — o off-white oficial. O fundo atrás do cartão. */
  fundo: "#F7F8FA",
  /** Branco do cartão. */
  cartao: "#FFFFFF",
  /** Cinza de apoio para rótulos e rodapé — passa AA sobre branco. */
  apoio: "#5B6675",
  /** A linha fina que separa blocos. */
  linha: "#E4E8EF",
} as const;
