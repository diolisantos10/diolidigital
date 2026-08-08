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

  const url = `${HOST_DRIVE}/files?pageSize=1&fields=${encodeURIComponent("files(id,name)")}&supportsAllDrives=true`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${t.token}` } }).catch(() => null);
  if (!res) {
    return { ok: false, codigo: null, mensagem: "o Google não respondeu à listagem de arquivos" };
  }
  const corpo = await res.text().catch(() => "");
  if (!res.ok) {
    return { ok: false, codigo: res.status, mensagem: corpo.slice(0, 400) };
  }

  let alcanca = 0;
  try {
    alcanca = ((JSON.parse(corpo) as { files?: unknown[] }).files ?? []).length;
  } catch {
    /* corpo estranho não derruba o diagnóstico: o 200 já provou o acesso */
  }

  return {
    ok: true,
    prova:
      alcanca > 0
        ? "o Google trocou o refresh token e devolveu arquivo ao alcance do app"
        : "o Google trocou o refresh token e respondeu à listagem; o app não alcança arquivo nenhum (nada foi escolhido no seletor)",
  };
}
