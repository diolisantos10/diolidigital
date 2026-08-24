// servidor-de-teste.ts — um Next de verdade, só para a porta AUTENTICADA.
//
// ─── POR QUE ISTO PRECISA EXISTIR ───────────────────────────────────────────
//
// A bateria inteira roda em processo: monta um `NextRequest` à mão e chama o
// handler da rota direto. Isso cobre quase tudo — e NÃO cobre autenticação.
// `requireSession()` → `getSession()` → `cookies()` do `next/headers`, que lê o
// contexto de requisição do servidor Next (AsyncLocalStorage). Um `NextRequest`
// construído fora do servidor não tem esse contexto: o cookie assinado nunca
// chega lá, e a rota devolve 401 para TODO mundo.
//
// Isso deixava a régua `porta-autenticada` permanentemente em "não coberto".
// A saída errada seria afrouxar a rota, ou fingir a sessão. A saída certa é
// subir o servidor de verdade e bater nele por HTTP — a mesma porta, do mesmo
// jeito que um navegador bate.
//
// ─── AS TRÊS TRAVAS DESTE SERVIDOR ──────────────────────────────────────────
//
// 1. **Só loopback.** `-H 127.0.0.1`. Medido em 24/08/2026 com `/proc/net/tcp`:
//    `0100007F:0F9F` — 127.0.0.1:3999, e nada em `00000000:*`. Servidor de
//    teste que abre porta para a rede é um risco novo trocado por uma medição,
//    e a ordem era parar e avisar se isso acontecesse. Se algum dia alguém
//    passar outro host aqui, `HOST_UNICO` recusa antes de subir.
//
// 2. **Banco descartável.** `DATABASE_URL` aponta para o mesmo SQLite da
//    rodada. O servidor NUNCA vê banco de produção.
//
// 3. **`CLIENTE_FALSO=1` herdado.** As travas de saída valem dentro do
//    servidor também. Sem isso, a rota de aprovação — que chama `pedirDirecao`
//    e portanto avisa o cliente — falaria de dentro de um processo sem cadeado.
//
// ⚠️ O que este servidor NÃO resolve: os bloqueios de saída que acontecem
// DENTRO dele ficam na memória DELE, e não entram no `saidasBloqueadas` da
// rodada. O placar diz isso em voz alta em vez de somar o que não viu.

import { spawn, type ChildProcess } from "child_process";
import { createServer } from "net";

/** O único host que este servidor aceita. Não é configurável de propósito. */
const HOST_UNICO = "127.0.0.1";

export type ServidorDeTeste = {
  baseUrl: string;
  /** Derruba o servidor. Idempotente. */
  parar: () => Promise<void>;
};

/** Uma porta livre, pedida ao sistema — nunca um número chutado. */
async function portaLivre(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once("error", reject);
    s.listen(0, HOST_UNICO, () => {
      const addr = s.address();
      if (typeof addr === "object" && addr) {
        const p = addr.port;
        s.close(() => resolve(p));
      } else {
        s.close(() => reject(new Error("não consegui descobrir uma porta livre")));
      }
    });
  });
}

async function esperarDePe(baseUrl: string, limiteMs: number): Promise<boolean> {
  const fim = Date.now() + limiteMs;
  while (Date.now() < fim) {
    try {
      const r = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(2_000) });
      if (r.ok) return true;
    } catch {
      // ainda subindo
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

/**
 * Sobe um Next de teste contra o banco descartável. Devolve `null` — nunca
 * estoura — quando não dá para subir: o percurso continua sem a porta
 * autenticada e a régua diz "não coberto" com o motivo. Bateria que morre
 * porque um extra não subiu mede menos que a bateria que segue e declara.
 */
export async function subirServidorDeTeste(opts: {
  databaseUrl: string;
  limiteMs?: number;
}): Promise<{ servidor: ServidorDeTeste | null; motivo: string | null }> {
  let porta: number;
  try {
    porta = await portaLivre();
  } catch (e) {
    return { servidor: null, motivo: `não consegui uma porta livre: ${e instanceof Error ? e.message : String(e)}` };
  }

  const baseUrl = `http://${HOST_UNICO}:${porta}`;
  let filho: ChildProcess;
  try {
    filho = spawn(
      "npx",
      ["next", "dev", "-H", HOST_UNICO, "-p", String(porta)],
      {
        // ── `detached` NÃO É DETALHE: É O QUE FAZ `parar()` PARAR ──────────
        // Medido em 24/08/2026: sem isto, `filho.kill()` mandava SIGTERM para
        // o `npx`, que morria sozinho e deixava o `next dev` órfão — ainda de
        // pé e ainda escutando (`/proc/net/tcp` mostrava `0100007F:810B` viva
        // depois de "servidor de teste derrubado"). Um teste que promete
        // fechar a porta e não fecha é pior que um teste que nunca a abriu.
        //
        // Com `detached`, o filho vira líder do próprio grupo de processos e
        // `process.kill(-pid)` derruba o grupo inteiro — npx, next e os
        // trabalhadores do Turbopack.
        detached: true,
        env: {
          ...process.env,
          DATABASE_URL: opts.databaseUrl,
          // Trava 3: o cadeado de saída vale DENTRO do servidor também.
          CLIENTE_FALSO: "1",
          // O despertador liga sozinho no boot (`despertador.ts:805`) e ficaria
          // mexendo no banco a cada 5 min por trás da medição — trabalho de
          // fundo que nenhuma régua desta bateria está olhando. `off` é a
          // chave que o próprio módulo lê; não é uma inventada aqui.
          DESPERTADOR: "off",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  } catch (e) {
    return { servidor: null, motivo: `não consegui subir o Next: ${e instanceof Error ? e.message : String(e)}` };
  }

  // ── O QUE O SERVIDOR DISSE ANTES DE MORRER ──────────────────────────────
  // A primeira versão canalizava stdout/stderr e nunca os lia. Quando o Next
  // morria, o motivo era "morreu com código 1" — e o porquê ficava dentro de um
  // cano que ninguém abriu. Diagnóstico que não chega a quem lê o placar é
  // diagnóstico que não existe.
  const ultimasFalas: string[] = [];
  const guardar = (b: Buffer): void => {
    for (const linha of b.toString().split("\n")) {
      const t = linha.trim();
      if (t) ultimasFalas.push(t);
    }
    while (ultimasFalas.length > 12) ultimasFalas.shift();
  };
  filho.stdout?.on("data", guardar);
  filho.stderr?.on("data", guardar);

  let morreu: string | null = null;
  filho.once("exit", (code) => {
    morreu = `o servidor de teste morreu com código ${code}`
      + (ultimasFalas.length ? `: ${ultimasFalas.join(" ⏎ ").slice(0, 400)}` : " (sem dizer nada)");
  });

  /** Derruba o GRUPO — não só o `npx`. Ver o bloco `detached` acima. */
  const matarGrupo = (sinal: NodeJS.Signals): void => {
    try {
      if (filho.pid) process.kill(-filho.pid, sinal);
    } catch {
      // Grupo já morreu, ou a plataforma não deixa. Tenta o filho direto.
      try { filho.kill(sinal); } catch { /* nada mais a fazer */ }
    }
  };


  const dePe = await esperarDePe(baseUrl, opts.limiteMs ?? 90_000);
  if (!dePe) {
    matarGrupo("SIGKILL");
    return { servidor: null, motivo: morreu ?? "o servidor de teste não respondeu a /api/health a tempo" };
  }

  const parar = async (): Promise<void> => {
    if (filho.exitCode !== null || filho.signalCode !== null) return;
    matarGrupo("SIGTERM");
    await new Promise<void>((resolve) => {
      const prazo = setTimeout(() => { matarGrupo("SIGKILL"); resolve(); }, 5_000);
      filho.once("exit", () => { clearTimeout(prazo); resolve(); });
    });
  };

  return { servidor: { baseUrl, parar }, motivo: null };
}
