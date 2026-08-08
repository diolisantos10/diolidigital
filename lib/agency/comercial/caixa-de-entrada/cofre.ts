// ─── O COFRE DA CAIXA DE ENTRADA DA AGÊNCIA ──────────────────────────────────
//
// Guarda a credencial que a rotina usa para LER a caixa do Gmail da agência, e
// responde "está configurada?" sem nunca devolver o segredo.
//
// ── O QUE ESTA CREDENCIAL É, COM TODAS AS LETRAS ─────────────────────────────
// Uma **senha de aplicativo** do Google dá acesso de leitura à CAIXA INTEIRA —
// todo e-mail que a agência já recebeu e todo que vier. O código lê só o que vem
// do remetente configurado, mas ISSO É ESCOLHA DO CÓDIGO, NÃO LIMITE DA CHAVE.
// Alcance nunca é autorização, e a tela diz isso ao CEO antes de ele colar.
//
// ── AS TRÊS TRAVAS DESTE ARQUIVO ─────────────────────────────────────────────
//   1. A senha entra CIFRADA (AES-256-GCM, `encryptSecret`) e sai só para quem
//      vai abrir a conexão. Nenhuma leitura desta casa a devolve para uma tela,
//      para uma resposta HTTP ou para um log.
//   2. O SERVIDOR É CONSTANTE. `imap.gmail.com:993`, fixo neste arquivo, nunca
//      vindo de formulário. Host configurável transformaria a tela de
//      configuração numa forma de mandar a senha da agência para a máquina de
//      quem pedir.
//   3. SEM CREDENCIAL = PORTA FECHADA. `credencialDaCaixa` devolve o motivo, e
//      a rotina não roda. Nunca "tenta e falha calada".
//
// ── AS DUAS ORIGENS DA CREDENCIAL, E A ORDEM ENTRE ELAS ─────────────────────
// **Ambiente primeiro, cofre depois** — a mesma precedência de
// `resolverWebhookVerifyToken` (`lib/integrations/meta/config.ts`): quem tem a
// infraestrutura manda mais que quem tem o painel. `RADAR_GMAIL_USER` +
// `RADAR_GMAIL_APP_PASSWORD` nas Variables do Railway vencem o que estiver
// guardado no banco.
//
// A tela de colar continua valendo e não é decoração: é por ela que o CEO troca
// a senha sem abrir o Railway, e é ela que guarda os AJUSTES (quais remetentes
// entram, se marca como lida) — que não são segredo e que ele vai precisar
// mexer, porque o remetente exato do 99Freelas ainda não foi confirmado contra
// um alerta real.
//
// ⚠️ Os ajustes seguem a ordem INVERSA da senha: o painel manda neles. Senha é
// infraestrutura; filtro de remetente é operação.

import { prisma } from "@/lib/db/client";
import { decryptSecret, encryptSecret } from "@/lib/security/crypto";

/** A chave desta integração dentro de `DbIntegrationConfig`. */
export const CAIXA_INTEGRATION_ID = "radar-gmail-imap";

/** ⚠️ CONSTANTES, e a constância é a trava. Ver o item 2 do cabeçalho. */
export const HOST_IMAP = "imap.gmail.com";
export const PORTA_IMAP = 993;
export const PASTA = "INBOX";

/**
 * O filtro de remetente padrão.
 *
 * ⚠️ **NÃO ESTÁ CONFIRMADO CONTRA UM ALERTA REAL.** Ninguém desta sessão viu um
 * e-mail do 99Freelas: a porta 993 não sai desta máquina e não há caixa
 * conectada. O que se sabe com certeza é o DOMÍNIO da plataforma — por isso o
 * padrão é o domínio, e não um endereço inventado como
 * `naoresponda@99freelas.com.br`, que teria cara de fato confirmado e faria a
 * rotina ler zero mensagem para sempre, em silêncio.
 *
 * O valor é CONFIGURÁVEL na tela justamente por isso, e o passo a passo do CEO
 * (`docs/plataformas/99freelas/gmail-senha-de-app.md`) manda conferir o
 * remetente num alerta de verdade antes de confiar no número.
 */
export const REMETENTES_PADRAO = ["@99freelas.com.br"];

/** Quantos dias para trás a varredura olha. Janela, e não "tudo": a caixa da
 *  agência tem anos de e-mail, e reler o arquivo inteiro a cada 5 minutos é uma
 *  varredura que o Gmail trata como abuso — a mesma família de gesto que
 *  restringiu a conta da Meta em 03/08. */
export const JANELA_DIAS = 7;

/** Teto de mensagens examinadas por rodada. Cinco minutos depois vem outra. */
export const MAX_POR_RODADA = 25;

/** De onde veio a senha que está em uso. Vai para a tela: "configurado" sem
 *  dizer ONDE manda o CEO procurar no lugar errado quando quiser trocar. */
export type OrigemDaCredencial = "ambiente" | "cofre";

export interface CredencialDaCaixa {
  workspaceId: string;
  origem: OrigemDaCredencial;
  /** O endereço da caixa ("radar@diolidigital.com.br"). Não é segredo. */
  usuario: string;
  /** A senha de app, EM CLARO. Só existe dentro do processo, nunca sai daqui. */
  senha: string;
  host: string;
  porta: number;
  /** Os remetentes aceitos, minúsculos. Pode ser domínio (`@99freelas.com.br`)
   *  ou endereço completo. */
  remetentes: string[];
  /** A rotina marca a mensagem como lida depois de processá-la? */
  marcarComoLido: boolean;
}

export type ResultadoDaCredencial =
  | { ok: true; credencial: CredencialDaCaixa }
  | { ok: false; motivo: string };

/**
 * O que a TELA pode ver. Nenhum campo aqui carrega segredo — nem pedaço dele:
 * ver `dicaDeSenhaDeApp` para por que a dica aqui é uma máscara e não um trecho.
 */
export interface EstadoDaCaixa {
  configurada: boolean;
  origem: OrigemDaCredencial | null;
  usuario: string | null;
  dicaDaSenha: string | null;
  host: string;
  porta: number;
  pasta: string;
  remetentes: string[];
  marcarComoLido: boolean;
  janelaDias: number;
  configuradaEm: string | null;
  ultimoTeste: { status: string; em: string | null; mensagem: string | null };
  /** Por que a porta está fechada, quando está. A tela mostra isto. */
  motivo: string | null;
}

const MOTIVO_SEM_CONFIG =
  "Nenhuma senha de aplicativo foi encontrada — nem em RADAR_GMAIL_USER/RADAR_GMAIL_APP_PASSWORD no Railway, nem guardada nesta tela. " +
  "Enquanto não houver, a rotina não conecta e nenhuma oportunidade entra por esta porta.";

function lerLista(cru: string | null | undefined): string[] {
  return (cru ?? "")
    .split(/[,\n;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Os remetentes que valem. A ordem é PAINEL → AMBIENTE → padrão, o inverso da
 * senha, e de propósito: o remetente exato do 99Freelas **não foi confirmado**
 * (ver `REMETENTES_PADRAO`), então quem descobrir o valor certo olhando um
 * alerta de verdade tem que conseguir corrigi-lo sem redeploy.
 */
function remetentesQueValem(doPainel: string | null | undefined): string[] {
  const painel = lerLista(doPainel);
  if (painel.length) return painel;
  const ambiente = lerLista(process.env.RADAR_GMAIL_REMETENTES);
  if (ambiente.length) return ambiente;
  return [...REMETENTES_PADRAO];
}

/**
 * A senha vinda do AMBIENTE. Vence o cofre.
 *
 * Devolve `null` quando qualquer uma das duas variáveis falta — meia
 * configuração não é configuração, e um `RADAR_GMAIL_USER` sozinho não pode
 * fazer a casa achar que está ligada.
 */
function credencialDoAmbiente(): { usuario: string; senha: string } | null {
  const usuario = process.env.RADAR_GMAIL_USER?.trim().toLowerCase();
  const senha = normalizarSenhaDeApp(process.env.RADAR_GMAIL_APP_PASSWORD ?? "");
  if (!usuario || !senha) return null;
  return { usuario, senha };
}

/**
 * QUAL WORKSPACE recebe as oportunidades quando a senha vem do ambiente.
 *
 * A variável do Railway é GLOBAL e a oportunidade é de ALGUÉM. Com um único
 * workspace na base a resposta é óbvia; com dois, não é — e o atalho de "cai no
 * primeiro" está proibido nesta casa desde que virou bomba-relógio de
 * multi-tenant (é o mesmo `NÃO` que a rota `/oportunidades/email` já declara).
 * Então: `RADAR_GMAIL_WORKSPACE` (id ou slug) resolve, e sem ele a porta fica
 * FECHADA com o motivo escrito.
 */
export async function workspaceDoAmbiente(): Promise<{ ok: true; workspaceId: string } | { ok: false; motivo: string }> {
  const declarado = process.env.RADAR_GMAIL_WORKSPACE?.trim();
  if (declarado) {
    const ws = await prisma.agencyWorkspace
      .findFirst({ where: { OR: [{ id: declarado }, { slug: declarado }] }, select: { id: true } })
      .catch(() => null);
    if (ws) return { ok: true, workspaceId: ws.id };
    return {
      ok: false,
      motivo: `RADAR_GMAIL_WORKSPACE aponta para "${declarado}", e não existe workspace com esse id nem com esse slug.`,
    };
  }
  const todos = await prisma.agencyWorkspace.findMany({ take: 2, select: { id: true } }).catch(() => null);
  if (!todos) return { ok: false, motivo: "Não consegui listar os workspaces para saber de quem é a caixa." };
  if (todos.length === 1) return { ok: true, workspaceId: todos[0]!.id };
  if (todos.length === 0) return { ok: false, motivo: "Não há nenhum workspace nesta base." };
  return {
    ok: false,
    motivo:
      "Há mais de um workspace nesta base e a credencial do ambiente é global — defina RADAR_GMAIL_WORKSPACE " +
      "com o id ou o slug de quem recebe as oportunidades. (Cair no primeiro workspace é proibido nesta casa: " +
      "entrega o dado de um cliente no inquilino errado, em silêncio.)",
  };
}

/**
 * A credencial para ABRIR a conexão. É a única função que devolve a senha.
 *
 * Devolve `{ ok:false, motivo }` — e não `null` — porque "não há credencial" e
 * "a credencial não abre" são fatos diferentes e a tela precisa dos dois
 * separados. Colapsá-los faria a rotina falhar calada, que é exatamente o que
 * esta frente foi proibida de fazer.
 */
export async function credencialDaCaixa(workspaceId: string): Promise<ResultadoDaCredencial> {
  let linha;
  try {
    linha = await prisma.dbIntegrationConfig.findUnique({
      where: { workspaceId_integrationId: { workspaceId, integrationId: CAIXA_INTEGRATION_ID } },
    });
  } catch (e) {
    // Falha de LEITURA do banco não vira "não está configurado": isso seria
    // transformar um problema nosso num fato sobre a configuração do CEO.
    return { ok: false, motivo: `Não consegui ler a configuração da caixa: ${msg(e)}` };
  }

  // ── AMBIENTE PRIMEIRO ─────────────────────────────────────────────────────
  const doAmbiente = credencialDoAmbiente();
  if (doAmbiente) {
    return {
      ok: true,
      credencial: {
        workspaceId,
        origem: "ambiente",
        usuario: doAmbiente.usuario,
        senha: doAmbiente.senha,
        host: HOST_IMAP,
        porta: PORTA_IMAP,
        remetentes: remetentesQueValem(linha?.folder),
        marcarComoLido: marcaQueVale(linha?.configWorkspace),
      },
    };
  }

  if (!linha || !linha.configured || !linha.apiKeyEncrypted) {
    return { ok: false, motivo: MOTIVO_SEM_CONFIG };
  }
  const usuario = (linha.accountId ?? "").trim();
  if (!usuario) {
    return { ok: false, motivo: "A configuração existe mas não tem o endereço da caixa. Reconfigure na tela." };
  }
  const senha = decryptSecret(linha.apiKeyEncrypted);
  if (!senha) {
    // Chave de cifragem trocada, valor adulterado, coluna truncada. Qualquer um
    // dos três: a senha existe e não abre. Dizer "não configurada" mandaria o
    // CEO reconfigurar sem saber por quê — o que talvez seja a resposta certa,
    // mas ele decide isso sabendo.
    return {
      ok: false,
      motivo:
        "A senha guardada não pôde ser decifrada (a chave de credenciais mudou, ou o valor foi corrompido). Apague e cole a senha de novo.",
    };
  }

  return {
    ok: true,
    credencial: {
      workspaceId,
      origem: "cofre",
      usuario,
      senha,
      host: HOST_IMAP,
      porta: PORTA_IMAP,
      remetentes: remetentesQueValem(linha.folder),
      marcarComoLido: marcaQueVale(linha.configWorkspace),
    },
  };
}

function marcaQueVale(doPainel: string | null | undefined): boolean {
  const v = (doPainel ?? "").trim();
  if (v === "marcar-como-lido") return true;
  if (v === "nao-tocar") return false;
  return (process.env.RADAR_GMAIL_MARCAR_LIDO ?? "").trim().toLowerCase() === "sim";
}

/** O retrato para a tela. NUNCA devolve a senha. */
export async function estadoDaCaixa(workspaceId: string): Promise<EstadoDaCaixa> {
  let linha;
  let erroDeLeitura: string | null = null;
  try {
    linha = await prisma.dbIntegrationConfig.findUnique({
      where: { workspaceId_integrationId: { workspaceId, integrationId: CAIXA_INTEGRATION_ID } },
    });
  } catch (e) {
    erroDeLeitura = `Não consegui ler a configuração da caixa: ${msg(e)}`;
  }

  const doAmbiente = credencialDoAmbiente();
  const doCofre = !!linha?.configured && !!linha.apiKeyEncrypted;
  const origem: OrigemDaCredencial | null = doAmbiente ? "ambiente" : doCofre ? "cofre" : null;

  return {
    configurada: origem !== null,
    origem,
    usuario: doAmbiente ? doAmbiente.usuario : (linha?.accountId ?? null),
    // A dica da senha do AMBIENTE é derivada na hora, e é uma MÁSCARA: nenhum
    // caractere da senha aparece. Ver `dicaDeSenhaDeApp`.
    dicaDaSenha: doAmbiente ? dicaDeSenhaDeApp(doAmbiente.senha) : (linha?.apiKeyHint ?? null),
    host: HOST_IMAP,
    porta: PORTA_IMAP,
    pasta: PASTA,
    remetentes: remetentesQueValem(linha?.folder),
    marcarComoLido: marcaQueVale(linha?.configWorkspace),
    janelaDias: JANELA_DIAS,
    configuradaEm: doAmbiente ? null : (linha?.lastConfiguredAt?.toISOString() ?? null),
    ultimoTeste: {
      status: linha?.lastTestStatus ?? "not_run",
      em: linha?.lastTestAt?.toISOString() ?? null,
      mensagem: linha?.lastTestMessage ?? null,
    },
    // Erro de leitura do banco APARECE mesmo quando o ambiente salvou o dia:
    // a rotina vai funcionar, mas os ajustes da tela não estão sendo lidos, e
    // esconder isso faria o filtro de remetente parecer aplicado sem estar.
    motivo: erroDeLeitura ?? (origem === null ? MOTIVO_SEM_CONFIG : null),
  };
}

export type FalhaAoGuardar = { ok: false; erro: string };
export type SucessoAoGuardar = { ok: true; dica: string };

/**
 * A FORMA DA SENHA DE APLICATIVO — e por que ela é conferida.
 *
 * O Google mostra a senha de app como quatro grupos de quatro letras
 * minúsculas ("abcd efgh ijkl mnop"). Duas consequências práticas:
 *
 *   • **Os espaços têm que cair.** O CEO vai colar exatamente o que a tela do
 *     Google mostrou, com espaços, e o IMAP recusaria — dando "senha errada"
 *     para uma senha certa. Isso não é preciosismo: é a diferença entre ligar em
 *     um minuto e passar a tarde achando que o Google negou.
 *   • **A senha da CONTA é recusada aqui.** Ela não tem essa forma. Aceitar
 *     qualquer string faria a tela virar um jeito de guardar a senha principal
 *     do Google da agência num banco de dados — uma credencial que abre Drive,
 *     Ads, Perfil de Empresa e tudo mais, e que não se revoga isoladamente.
 */
export function normalizarSenhaDeApp(bruta: string): string {
  return (bruta ?? "").replace(/\s+/g, "");
}

/**
 * A DICA da senha, para a tela dizer "tem uma guardada" sem entregar pedaço dela.
 *
 * ── POR QUE **NÃO** `keyHint()` AQUI ────────────────────────────────────────
 * `keyHint` foi feito para chave de API — `sk-ant-…a1b2` — onde mostrar 7 de 100
 * caracteres aleatórios não ajuda ninguém. **Uma senha de aplicativo tem 16
 * caracteres de um alfabeto de 26.** Mostrar 7 deles derruba o espaço de busca
 * de 26^16 para 26^9: continua grande, mas é entregar 44% do segredo numa tela
 * de admin — e tela de admin vaza por screenshot, que é exatamente o motivo de
 * a casa já ter um teste que reprova painel imprimindo `GOOGLE_CLIENT_SECRET`.
 *
 * O que a tela precisa saber é "existe uma senha guardada?". É isso que ela diz.
 */
export function dicaDeSenhaDeApp(senha: string): string {
  const n = normalizarSenhaDeApp(senha).length;
  return n ? `•••• •••• •••• •••• (${n} caracteres)` : "";
}

const FORMA_DA_SENHA_DE_APP = /^[a-z]{16}$/;

export async function guardarCredencial(p: {
  workspaceId: string;
  usuario: string;
  senha: string;
  remetentes?: string[] | null;
  marcarComoLido?: boolean;
}): Promise<SucessoAoGuardar | FalhaAoGuardar> {
  const usuario = (p.usuario ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(usuario)) {
    return { ok: false, erro: "Endereço da caixa inválido — é o e-mail que recebe os alertas." };
  }
  const senha = normalizarSenhaDeApp(p.senha ?? "");
  if (!senha) return { ok: false, erro: "Cole a senha de aplicativo." };
  if (!FORMA_DA_SENHA_DE_APP.test(senha)) {
    return {
      ok: false,
      erro:
        "Isso não tem a forma de uma senha de aplicativo do Google (16 letras minúsculas, mostradas em 4 grupos de 4). " +
        "Se você colou a senha da sua CONTA, ela não entra aqui de propósito: senha de conta não se revoga sozinha e abre tudo. " +
        "Gere uma em myaccount.google.com/apppasswords.",
    };
  }

  const remetentes = (p.remetentes ?? [])
    .map((r) => r.trim().toLowerCase())
    .filter(Boolean);
  const lista = remetentes.length ? remetentes : [...REMETENTES_PADRAO];

  try {
    await prisma.dbIntegrationConfig.upsert({
      where: { workspaceId_integrationId: { workspaceId: p.workspaceId, integrationId: CAIXA_INTEGRATION_ID } },
      create: {
        workspaceId: p.workspaceId,
        integrationId: CAIXA_INTEGRATION_ID,
        configured: true,
        accountId: usuario,
        apiKeyEncrypted: encryptSecret(senha),
        apiKeyHint: dicaDeSenhaDeApp(senha),
        folder: lista.join(","),
        configWorkspace: p.marcarComoLido ? "marcar-como-lido" : "nao-tocar",
        lastTestStatus: "not_run",
        lastTestMessage: null,
        lastConfiguredAt: new Date(),
      },
      update: {
        configured: true,
        accountId: usuario,
        apiKeyEncrypted: encryptSecret(senha),
        apiKeyHint: dicaDeSenhaDeApp(senha),
        folder: lista.join(","),
        configWorkspace: p.marcarComoLido ? "marcar-como-lido" : "nao-tocar",
        // A senha mudou: o teste anterior não vale mais. Deixá-lo verde aqui
        // faria a tela afirmar "conectado" sobre uma credencial nunca provada.
        lastTestStatus: "not_run",
        lastTestAt: null,
        lastTestMessage: null,
        lastConfiguredAt: new Date(),
      },
    });
  } catch (e) {
    return { ok: false, erro: `Não consegui guardar: ${msg(e)}` };
  }
  return { ok: true, dica: dicaDeSenhaDeApp(senha) };
}

/**
 * Apaga a credencial desta casa.
 *
 * ⚠️ Isto NÃO revoga nada no Google. A senha de app continua válida até o CEO
 * apagá-la em `myaccount.google.com/apppasswords` — e é isso que corta de
 * verdade. A tela repete esta frase ao lado do botão; quem apaga aqui e não lá
 * fica achando que revogou.
 *
 * ⚠️⚠️ E isto TAMBÉM NÃO FECHA A PORTA quando a senha vem do ambiente: apagar a
 * linha do banco não apaga `RADAR_GMAIL_APP_PASSWORD` do Railway, e o ambiente
 * vence o cofre. `credencialDoAmbienteAtiva()` existe para a rota dizer isso na
 * cara de quem clicou, em vez de devolver "apagado" sobre uma porta que
 * continua aberta.
 */
export function credencialDoAmbienteAtiva(): boolean {
  return credencialDoAmbiente() !== null;
}

export async function apagarCredencial(workspaceId: string): Promise<void> {
  await prisma.dbIntegrationConfig.updateMany({
    where: { workspaceId, integrationId: CAIXA_INTEGRATION_ID },
    data: {
      configured: false,
      apiKeyEncrypted: null,
      apiKeyHint: null,
      accountId: null,
      lastTestStatus: "not_run",
      lastTestAt: null,
      lastTestMessage: "Credencial apagada nesta casa. Revogue também em myaccount.google.com/apppasswords.",
    },
  });
}

/** Grava o resultado do teste de conexão para a tela poder mostrá-lo depois. */
export async function registrarTeste(workspaceId: string, ok: boolean, mensagem: string): Promise<void> {
  await prisma.dbIntegrationConfig
    .updateMany({
      where: { workspaceId, integrationId: CAIXA_INTEGRATION_ID },
      // A mensagem é cortada: ela vem de uma biblioteca de terceiro e vai para
      // uma tela. Texto de erro sem teto já encheu coluna de banco nesta casa.
      data: { lastTestStatus: ok ? "ok" : "falhou", lastTestAt: new Date(), lastTestMessage: mensagem.slice(0, 400) },
    })
    .catch(() => {
      /* o teste vale mesmo que a anotação dele falhe */
    });
}

/**
 * Em quem o relógio mexe. Duas fontes, e as duas contam:
 *   • quem guardou credencial pela tela;
 *   • o alvo da credencial do AMBIENTE, quando ela existe.
 *
 * Devolve também os `impedidos`: o caso em que há credencial de ambiente e a
 * casa NÃO SABE de quem é a caixa (mais de um workspace, sem
 * `RADAR_GMAIL_WORKSPACE`). Isso não pode virar lista vazia em silêncio — seria
 * uma porta configurada que não lê nada e não avisa ninguém, que é exatamente o
 * defeito que esta frente existe para não repetir.
 */
export async function workspacesComCaixa(): Promise<{ alvos: string[]; impedidos: string[] }> {
  const alvos = new Set<string>();
  const impedidos: string[] = [];

  try {
    const linhas = await prisma.dbIntegrationConfig.findMany({
      where: { integrationId: CAIXA_INTEGRATION_ID, configured: true, apiKeyEncrypted: { not: null } },
      select: { workspaceId: true },
    });
    for (const l of linhas) alvos.add(l.workspaceId);
  } catch (e) {
    impedidos.push(`Não consegui listar as caixas configuradas na tela: ${msg(e)}`);
  }

  if (credencialDoAmbiente()) {
    const alvo = await workspaceDoAmbiente();
    if (alvo.ok) alvos.add(alvo.workspaceId);
    else impedidos.push(alvo.motivo);
  }

  return { alvos: [...alvos], impedidos };
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e ?? "erro");
}
