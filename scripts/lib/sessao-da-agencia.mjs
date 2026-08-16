// UMA sessão de agência, reaproveitada entre execuções de script.
//
// 🔴 POR QUE ISTO EXISTE (16/08/2026). `/api/auth/signin` tem teto de **5
// tentativas por e-mail a cada 5 minutos** — defesa legítima contra força bruta
// dirigida ao `master@dioli.studio`, que aparece no log de boot. Só que toda
// ferramenta de captura desta casa loga do zero, e três capturas seguidas
// estouram o teto: a ferramenta então devolve `HTTP 429` e **nenhuma foto**,
// no meio de uma revisão visual. Quem estiver com pressa conclui que a tela
// quebrou.
//
// O cookie fica em disco (fora do git) e só se faz login novo quando ele deixa
// de valer. Não é otimização: é o que faz a ferramenta poder ser rodada de novo.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";

const CAMINHO = process.env.SESSAO_CACHE || `${process.cwd()}/.shots/sessao.json`;

/**
 * Devolve um `storageState` do Playwright com sessão de agência válida.
 * Reusa o cache quando ele ainda abre uma rota autenticada; senão, loga.
 */
export async function sessaoDaAgencia(browser, base, email, senha) {
  if (existsSync(CAMINHO)) {
    try {
      const salvo = JSON.parse(readFileSync(CAMINHO, "utf8"));
      const ctx = await browser.newContext({ storageState: salvo });
      // Conferir vale mais que confiar: cookie expirado devolveria foto da tela
      // de login com nome de tela de leads — a prova visual errada.
      const teste = await ctx.request.get(`${base}/api/agency/leads`);
      await ctx.close();
      if (teste.ok()) return salvo;
    } catch { /* cache ilegível é ausência de cache, não erro fatal */ }
  }

  const ctx = await browser.newContext();
  const login = await ctx.request.post(`${base}/api/auth/signin`, { data: { email, password: senha } });
  if (!login.ok()) {
    await ctx.close();
    throw new Error(
      login.status() === 429
        ? "HTTP 429: o teto de tentativas de login foi atingido. Espere 5 minutos — o cache de sessão evita que isto se repita."
        : `HTTP ${login.status()} no login. Rode o seed com SEED_MASTER_PASSWORD definido.`,
    );
  }
  const estado = await ctx.storageState();
  await ctx.close();

  mkdirSync(dirname(CAMINHO), { recursive: true });
  writeFileSync(CAMINHO, JSON.stringify(estado));
  return estado;
}
