// verificacao-do-drive.ts — O DRIVE ESTÁ VIVO, OU SÓ TEM LINHA NO BANCO?
//
// Mesma pergunta do `lib/integrations/meta/verificacao.ts`, do outro lado da
// casa, e pelo mesmo incidente: em 07/08/2026 o cartão do Drive se anunciou
// "conectado" sobre duas tabelas que não existiam em produção. Em 08/08/2026 o
// CEO disse ter reconectado o Drive da Dioli e mandado o logo da Foocci por ali.
//
// ─── DUAS PERGUNTAS DIFERENTES, E CONFUNDI-LAS É O DEFEITO ──────────────────
//
//   1. **O acesso está vivo?**  → o refresh token ainda é trocado por um access
//      token pelo Google.
//   2. **A agência alcança material?** → quantos arquivos o cliente ESCOLHEU e
//      quantos ele DECLAROU o que são.
//
// A resposta da 1 pode ser "sim" e a da 2 ser **zero**. Esse é justamente o
// estado de produção hoje — e é por isso que a tela não pode dizer só
// "Conectado": conectado sem arquivo escolhido é **zero material**, e a esteira
// continua entregando peça com foto genérica.
//
// SÓ LEITURA. Nada é escrito no Drive de ninguém — nem um byte.

import { comTokenDoDrive } from "./drive";
export { FRASE_ZERO_MATERIAL } from "./escolha-de-material";

const HOST_DRIVE = "https://www.googleapis.com/drive/v3";

export interface ExercicioDoDrive {
  ok: boolean;
  /** O que provou que está vivo, em português. */
  prova?: string;
  /** O status HTTP que o Google devolveu, quando recusou. */
  codigo?: number | null;
  /** A frase crua do Google, sem tradução nossa por cima. */
  mensagem?: string;
  /**
   * Quantos arquivos o app ALCANÇA no Drive do cliente, contados no Google.
   *
   * ⚠️ Este número é a metade que faltava, e ele achou um furo em 08/08/2026: o
   * Drive da Foocci devolveu arquivo ao alcance do app enquanto a tabela
   * `DriveMaterial` desta casa tinha **zero linhas** para o cliente. Ou seja, o
   * CEO escolheu material no seletor do Google e a escolha **não ficou** — o que
   * explica ele acreditar que já tinha mandado o logo.
   *
   * `null` = não contei. Nunca 0 por falha de leitura: zero é uma afirmação
   * sobre o cliente, "não contei" é uma afirmação sobre nós.
   */
  alcancadosNoGoogle?: number | null;
  /** true quando o Google diz que há mais páginas — o número é um PISO. */
  haMais?: boolean;
  /**
   * Os arquivos alcançados, quando o chamador precisa deles pelo nome.
   *
   * Existe para a RECONCILIAÇÃO: o Google concedeu, a casa não guardou, e sem a
   * lista não há como trazer o arquivo para dentro. `undefined` = não listei.
   */
  arquivos?: Array<{ id: string; nome: string; mimeType: string; tamanhoBytes: number }>;
}

/**
 * Exercita o acesso ao Drive de UMA conexão.
 *
 * A troca do refresh token já É o exercício: `comTokenDoDrive` fala com
 * `oauth2.googleapis.com` de verdade, e é lá que o app em status "Teste" morre
 * no 8º dia (`fontes/oauth2-tokens-e-expiracao.md`). Depois dela vem um
 * `files.list` de UMA linha — com escopo `drive.file` ele enxerga apenas o que
 * o cliente abriu para o app, então lista vazia é resposta legítima, não falha.
 */
export async function exercitarDrive(connectionId: string): Promise<ExercicioDoDrive> {
  const t = await comTokenDoDrive(connectionId).catch(() => null);
  if (!t) {
    return {
      ok: false,
      codigo: null,
      mensagem:
        "o Google não trocou o refresh token por um acesso novo — a autorização venceu, foi revogada, ou o app OAuth está em status \"Teste\" (refresh token de 7 dias)",
    };
  }

  // 100 por página: um teto que responde "quantos" sem virar varredura. Página
  // única, sem seguir `nextPageToken` — o número vira um PISO declarado.
  const url = `${HOST_DRIVE}/files?pageSize=100&fields=${encodeURIComponent("nextPageToken,files(id,name,mimeType,size)")}&supportsAllDrives=true`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${t.token}` } }).catch(() => null);
  if (!res) {
    return { ok: false, codigo: null, mensagem: "o Google não respondeu à listagem de arquivos", alcancadosNoGoogle: null };
  }
  const corpo = await res.text().catch(() => "");
  if (!res.ok) {
    return { ok: false, codigo: res.status, mensagem: corpo.slice(0, 400), alcancadosNoGoogle: null };
  }

  // `null`, não `0`: corpo que não parseia é falha de LEITURA nossa, e falha de
  // leitura não pode virar o fato "o cliente não tem arquivo nenhum". É a lição
  // dos três `.catch(() => null)` de 07/08.
  let alcanca: number | null = null;
  let haMais = false;
  let arquivos: ExercicioDoDrive["arquivos"];
  try {
    const j = JSON.parse(corpo) as {
      files?: Array<{ id?: string; name?: string; mimeType?: string; size?: string }>;
      nextPageToken?: string;
    };
    const lista = j.files ?? [];
    alcanca = lista.length;
    haMais = !!j.nextPageToken;
    arquivos = lista
      .filter((f) => typeof f.id === "string" && f.id.length > 0)
      .map((f) => ({
        id: f.id as string,
        nome: f.name ?? "",
        mimeType: f.mimeType ?? "",
        tamanhoBytes: Number(f.size ?? 0) || 0,
      }));
  } catch {
    /* o 200 já provou o acesso; a CONTAGEM é que fica declarada como não feita */
  }

  return {
    ok: true,
    alcancadosNoGoogle: alcanca,
    haMais,
    arquivos,
    prova:
      alcanca === null
        ? "o Google trocou o refresh token e respondeu à listagem, mas não consegui contar os arquivos"
        : alcanca > 0
          ? `o Google trocou o refresh token e o app alcança ${alcanca}${haMais ? "+" : ""} arquivo(s) neste Drive`
          : "o Google trocou o refresh token e respondeu à listagem; o app não alcança arquivo nenhum (nada foi escolhido no seletor)",
  };
}
