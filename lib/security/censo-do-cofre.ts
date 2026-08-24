// O CENSO DO COFRE — quantos segredos ainda dependem da chave FRACA.
// SERVER-ONLY. **Somente leitura.** Nenhum verbo de escrita, nenhuma chamada a
// IA, nenhum valor de segredo devolvido — nunca.
//
// ── POR QUE ESTE ARQUIVO EXISTE (15/08/2026) ────────────────────────────────
//
// `lib/security/crypto.ts` ganhou, em 06/08, duas funções escritas com um
// propósito declarado — *"para o painel poder dizer a verdade"* e *"a resposta
// honesta para o painel: quantos segredos ainda dependem da chave fraca"*.
//
//   • `estadoDaChaveDeCredenciais()`
//   • `cifradoComChaveLegada()`
//
// **O painel nunca foi construído. As duas ficaram com ZERO chamadores por nove
// dias**, e o resultado é que ninguém conseguia responder aquela pergunta — nem
// com acesso total à produção. Instrumento escrito e não plugado não é meia
// proteção: é nenhuma, com a aparência de uma. É a mesma família do defeito que
// esta casa já pagou três vezes (a ponte existe dos dois lados e falta o meio).
//
// ── A PERGUNTA QUE ELE RESPONDE, E POR QUE ELA VALE DINHEIRO ────────────────
//
// `CREDENTIALS_SECRET` está definida em produção desde 15/08 e defini-la foi
// seguro (leitura com duas chaves). Mas a migração para a chave forte acontece
// **no ritmo de cada segredo reescrito**: um token que ninguém regravar continua
// cifrado com a chave LEGADA, que é derivada do `DATABASE_URL` — e o `start.sh`
// monta essa `DATABASE_URL` do caminho do volume, produzindo `file:/data/dioli.db`,
// uma string ADIVINHÁVEL. Os backups ficam NO MESMO volume.
//
// Sem contagem, "a migração acontece sozinha" é uma frase de esperança. Com
// contagem, é um número que cai — ou não cai, e aí se sabe.
//
// ── O QUE ELE NÃO FAZ, POR CONSTRUÇÃO ───────────────────────────────────────
//
//   • **Não devolve o valor de nenhum segredo.** Nem cifrado, nem decifrado, nem
//     em dica. `cifradoComChaveLegada` devolve booleano; nada mais atravessa.
//   • **Não re-cifra nada.** A varredura de re-cifragem reescreve dado de
//     produção e é decisão do CEO, não de um deploy. Deliberadamente ausente.
//   • **Não escreve, não apaga, não carimba.** Há teste que lê este arquivo e
//     reprova qualquer verbo de escrita do Prisma dentro dele.
//   • **Não conta nome de cliente, workspace nem id.** O censo é agregado: o
//     retrato é "quantos", nunca "de quem".

import { prisma } from "@/lib/db/client";
import { cifradoComChaveLegada, decryptSecret, estadoDaChaveDeCredenciais } from "@/lib/security/crypto";
import { META_INTEGRATION_ID } from "@/lib/integrations/meta/config";
import { CAIXA_INTEGRATION_ID } from "@/lib/agency/comercial/caixa-de-entrada/cofre";
import { PROVIDER_INTEGRATION_ID } from "@/lib/ai/resolve-key";

/** Os tipos de segredo que esta casa guarda cifrados. A lista é FECHADA e
 *  espelha as quatro tabelas com coluna `*Encrypted` no schema. Coluna nova
 *  cifrada sem entrada aqui é segredo fora do censo — e o teste
 *  `censo-do-cofre.test.ts` lê o schema e reprova exatamente isso. */
export type TipoDeSegredo =
  | "chave_de_ia"
  | "app_secret_meta"
  | "senha_de_email"
  | "outra_integracao"
  | "token_de_cliente_meta"
  | "token_google"
  | "token_drive";

export interface BaldeDoCofre {
  tipo: TipoDeSegredo;
  /** Em linguagem de operador — é isto que sobe ao CEO, não o nome da coluna. */
  rotulo: string;
  /** De onde saiu, para quem for auditar não precisar adivinhar. */
  origem: string;
  /** Quantos textos cifrados existem neste balde. */
  total: number;
  /** Destes, quantos SÓ abrem com a chave legada (a fraca). */
  presosNaChaveLegada: number;
  /**
   * Destes, quantos **NENHUMA** chave abre.
   *
   * Não é o mesmo fato que os outros dois e nunca pode dividir número com eles:
   * "preso na chave fraca" é um segredo que funciona e está mal protegido;
   * "ilegível" é um segredo PERDIDO — a conexão da Meta daquele cliente parou de
   * funcionar e o produto vai chamar isso de "sem conexão" (ver a correção em
   * `lib/integrations/meta/connections.ts`, 15/08/2026). Um número maior que
   * zero aqui é incidente, não relatório.
   */
  ilegiveis: number;
}

export interface CensoDoCofre {
  em: string;
  /** `forte: true` quando `CREDENTIALS_SECRET` está definida. */
  chave: ReturnType<typeof estadoDaChaveDeCredenciais>;
  /**
   * SEM chave nova configurada a pergunta não faz sentido: **tudo** está na
   * chave legada e `cifradoComChaveLegada` devolve `false` por definição.
   * Responder "0 presos" nesse mundo seria a pior mentira que este arquivo
   * poderia contar — a que tranquiliza. Então o censo se declara inaplicável.
   */
  aplicavel: boolean;
  baldes: BaldeDoCofre[];
  totalDeSegredos: number;
  totalPresosNaChaveLegada: number;
  /** Segredos que NENHUMA chave abre. Maior que zero = incidente aberto. */
  totalIlegiveis: number;
  /**
   * Preenchido quando o banco não respondeu. Falha de leitura NÃO vira zero:
   * "não consegui contar" e "não há segredo preso" são fatos opostos, e o
   * segundo desligaria o alarme sem consertar nada. Mesma gramática de
   * `raio-x/por-cliente.ts` e do DRE.
   */
  cego?: string;
  /** O que fazer com o número. Texto, não ação — esta rota não age. */
  proximoPasso: string;
}

const IDS_DE_IA = new Set(Object.values(PROVIDER_INTEGRATION_ID));

/** O rótulo de um `DbIntegrationConfig`, pelo `integrationId` (que não é
 *  segredo). Desconhecido cai em `outra_integracao` — nunca em "chave de IA":
 *  classificar por engano infla o balde errado e some com o certo. */
function tipoDaIntegracao(integrationId: string): TipoDeSegredo {
  if (IDS_DE_IA.has(integrationId)) return "chave_de_ia";
  if (integrationId === META_INTEGRATION_ID) return "app_secret_meta";
  if (integrationId === CAIXA_INTEGRATION_ID) return "senha_de_email";
  return "outra_integracao";
}

const ROTULO: Record<TipoDeSegredo, string> = {
  chave_de_ia: "Chave de IA (a conta que paga a geração)",
  app_secret_meta: "App Secret da Meta (assina o webhook)",
  senha_de_email: "Senha de app do Gmail da agência (Radar)",
  outra_integracao: "Outra integração com chave guardada",
  token_de_cliente_meta: "Token de cliente na Meta (publica em nome dele)",
  token_google: "Token do Google (conta da agência)",
  token_drive: "Token do Google Drive (material do cliente)",
};

const ORIGEM: Record<TipoDeSegredo, string> = {
  chave_de_ia: "DbIntegrationConfig.apiKeyEncrypted",
  app_secret_meta: "DbIntegrationConfig.apiKeyEncrypted",
  senha_de_email: "DbIntegrationConfig.apiKeyEncrypted",
  outra_integracao: "DbIntegrationConfig.apiKeyEncrypted",
  token_de_cliente_meta: "MetaConnection.accessTokenEncrypted",
  token_google: "GoogleConnection.accessTokenEncrypted + refreshTokenEncrypted",
  token_drive: "GoogleDriveConnection.accessTokenEncrypted + refreshTokenEncrypted",
};

/** Acumulador mudo: recebe textos cifrados e devolve dois números. O texto
 *  cifrado entra, e NADA além dos dois números sai. */
class Contador {
  private mapa = new Map<TipoDeSegredo, { total: number; presos: number; ilegiveis: number }>();

  somar(tipo: TipoDeSegredo, cifrado: string | null | undefined): void {
    if (!cifrado) return; // coluna nula não é segredo — é ausência.
    const atual = this.mapa.get(tipo) ?? { total: 0, presos: 0, ilegiveis: 0 };
    atual.total += 1;
    // A ordem importa: `cifradoComChaveLegada` devolve `false` tanto para "abre
    // com a chave nova" quanto para "não abre com nenhuma". Perguntar primeiro
    // se abre é o que separa os dois — sem isso, um segredo PERDIDO seria
    // contado como "migrado", que é a leitura mais tranquilizadora possível de
    // um incidente.
    if (decryptSecret(cifrado) === null) atual.ilegiveis += 1;
    else if (cifradoComChaveLegada(cifrado)) atual.presos += 1;
    this.mapa.set(tipo, atual);
  }

  /** Garante que um tipo apareça com zero em vez de sumir. Balde que some da
   *  lista é lido como "não existe esse tipo de segredo", e não é a mesma
   *  afirmação que "existem zero". */
  registrar(tipo: TipoDeSegredo): void {
    if (!this.mapa.has(tipo)) this.mapa.set(tipo, { total: 0, presos: 0, ilegiveis: 0 });
  }

  baldes(): BaldeDoCofre[] {
    return [...this.mapa.entries()]
      .map(([tipo, n]) => ({
        tipo,
        rotulo: ROTULO[tipo],
        origem: ORIGEM[tipo],
        total: n.total,
        presosNaChaveLegada: n.presos,
        ilegiveis: n.ilegiveis,
      }))
      .sort(
        (a, b) =>
          b.ilegiveis - a.ilegiveis ||
          b.presosNaChaveLegada - a.presosNaChaveLegada ||
          b.total - a.total,
      );
  }
}

/**
 * Conta os segredos do cofre e quantos ainda dependem da chave fraca.
 *
 * Lê as colunas cifradas de quatro tabelas. Isso é aceitável porque o volume é
 * de dezenas de linhas — uma integração por provedor, uma conexão por cliente.
 * Se um dia virarem milhares, isto vira contagem paginada; não vira estimativa.
 */
export async function censoDoCofre(agora: Date = new Date()): Promise<CensoDoCofre> {
  const chave = estadoDaChaveDeCredenciais();
  const base = { em: agora.toISOString(), chave };

  if (!chave.forte) {
    return {
      ...base,
      aplicavel: false,
      baldes: [],
      totalDeSegredos: 0,
      totalPresosNaChaveLegada: 0,
      totalIlegiveis: 0,
      proximoPasso:
        "CREDENTIALS_SECRET não está definida neste processo — TODOS os segredos estão na chave fraca, " +
        "e a contagem por balde não distingue nada. Definir a variável é seguro (leitura com duas chaves). " +
        "Contar só faz sentido depois disso.",
    };
  }

  const c = new Contador();
  (["chave_de_ia", "app_secret_meta", "senha_de_email", "outra_integracao",
    "token_de_cliente_meta", "token_google", "token_drive"] as TipoDeSegredo[])
    .forEach((t) => c.registrar(t));

  try {
    const integracoes = await prisma.dbIntegrationConfig.findMany({
      where: { apiKeyEncrypted: { not: null } },
      select: { integrationId: true, apiKeyEncrypted: true },
    });
    for (const linha of integracoes) {
      c.somar(tipoDaIntegracao(linha.integrationId), linha.apiKeyEncrypted);
    }

    const meta = await prisma.metaConnection.findMany({ select: { accessTokenEncrypted: true } });
    for (const linha of meta) c.somar("token_de_cliente_meta", linha.accessTokenEncrypted);

    const google = await prisma.googleConnection.findMany({
      select: { accessTokenEncrypted: true, refreshTokenEncrypted: true },
    });
    for (const linha of google) {
      c.somar("token_google", linha.accessTokenEncrypted);
      c.somar("token_google", linha.refreshTokenEncrypted);
    }

    const drive = await prisma.googleDriveConnection.findMany({
      select: { accessTokenEncrypted: true, refreshTokenEncrypted: true },
    });
    for (const linha of drive) {
      c.somar("token_drive", linha.accessTokenEncrypted);
      c.somar("token_drive", linha.refreshTokenEncrypted);
    }
  } catch (erro) {
    return {
      ...base,
      aplicavel: true,
      baldes: [],
      totalDeSegredos: 0,
      totalPresosNaChaveLegada: 0,
      totalIlegiveis: 0,
      cego: erro instanceof Error ? erro.message : String(erro),
      proximoPasso: "O banco não respondeu. Isto NÃO é 'zero presos' — é 'não consegui contar'. Repita.",
    };
  }

  const baldes = c.baldes();
  const totalDeSegredos = baldes.reduce((s, b) => s + b.total, 0);
  const totalPresosNaChaveLegada = baldes.reduce((s, b) => s + b.presosNaChaveLegada, 0);
  const totalIlegiveis = baldes.reduce((s, b) => s + b.ilegiveis, 0);

  // A ordem das frases é a ordem da urgência: segredo PERDIDO vem antes de
  // segredo mal protegido. Enterrar o incidente depois do relatório é o que a
  // regra de ouro do relato proíbe com todas as letras.
  const frases: string[] = [];
  if (totalIlegiveis > 0) {
    frases.push(
      `🔴 INCIDENTE: ${totalIlegiveis} segredo(s) que NENHUMA chave abre. Isto não é "mal protegido", é PERDIDO — ` +
        "a integração correspondente parou de funcionar e o produto a mostra como 'sem conexão'. " +
        "Antes de mandar cliente reconectar, descubra por que o cofre deixou de abrir.",
    );
  }
  frases.push(
    totalPresosNaChaveLegada === 0
      ? "Nenhum segredo depende mais da chave fraca. A re-cifragem em massa deixou de ser necessária."
      : `${totalPresosNaChaveLegada} de ${totalDeSegredos} segredo(s) só abrem com a chave LEGADA — ` +
        "derivada do DATABASE_URL, que o start.sh monta do caminho do volume (file:/data/dioli.db, adivinhável), " +
        "com os backups no MESMO volume. Cada um migra sozinho quando for reescrito. " +
        "A re-cifragem em massa NÃO existe e é decisão do CEO: ela reescreve dado de produção.",
  );

  return {
    ...base,
    aplicavel: true,
    baldes,
    totalDeSegredos,
    totalPresosNaChaveLegada,
    totalIlegiveis,
    proximoPasso: frases.join(" "),
  };
}
