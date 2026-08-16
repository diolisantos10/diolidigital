// Este arquivo faz um push disparar (ou não) um novo build no Railway.
//
// ── O CASO QUE ISTO CONSERTA ────────────────────────────────────────────────
// Em 16/08/2026 a produção ficou 1 HORA parada no commit `c52aff2`
// (18:32Z → 19:31Z+). Na janela do congelamento, 7 DE 7 entregas criadas
// foram disparadas por commit de UM ÚNICO ARQUIVO dentro de `reivindicacoes/`
// — a trava de coordenação criada no MESMO DIA. Build leva ~7min; chegava
// push a cada ~1,5min. Cada um matava o build anterior antes de terminar.
// Nenhum desses sete commits mudava uma linha do aplicativo que roda.
//
// A trava de reivindicação está certa — é o que impede duas frentes de
// pisarem no mesmo arquivo sem se ver (ver `scripts/reivindicar.mts`). O que
// estava errado era o GATILHO: qualquer push, papelada inclusive, acordava o
// Railway. A trava ficou; o gatilho é que aprendeu a diferença entre "mudou
// código" e "mudou registro de coordenação".
//
// ── POR QUE O FILTRO VIVE NO `railway.json` (build.watchPatterns) ──────────
// É um recurso nativo do Railway, documentado em
// docs.railway.com/guides/build-configuration → "Configure watch paths":
// padrões no estilo `.gitignore`, com negação. Preferido a filtrar no CI
// porque o CI SEMPRE roda (não deve afrouxar) — quem decide se vira BUILD é
// só o Railway, e só ele tem essa alavanca.
//
// ── POR QUE DENYLIST, E NUNCA ALLOWLIST ─────────────────────────────────────
// O padrão começa em `**` (tudo dispara build) e depois EXCLUI a papelada
// conhecida (`reivindicacoes/**`, `docs/**`, `*.md` da raiz). O caminho
// inverso — listar só `app/**`, `lib/**`, ... — pareceria mais "limpo", mas
// tem um defeito silencioso: um diretório de CÓDIGO criado amanhã (um novo
// `services/**`, por exemplo) deixaria de subir para produção e NINGUÉM
// perceberia, porque nenhum erro aparece — o deploy simplesmente não
// acontece. Silêncio é exatamente a doença que esta casa pagou caro para
// curar (ver `lib/plataforma/distancia-do-deploy.ts`, os 48 commits perdidos
// de silêncio). Denylist erra para o lado seguro: código desconhecido SEMPRE
// dispara build; só o que já está identificado como papelada fica de fora.
//
// ── ESTE MÓDULO NÃO DUPLICA OS PADRÕES ──────────────────────────────────────
// `lerPadroesDoRailway()` lê `railway.json` DO DISCO. O `railway.json` é a
// ÚNICA fonte da verdade sobre o que dispara build — uma cópia dos padrões
// aqui em código divergiria do arquivo real na primeira edição que alguém
// fizesse só num lugar.

import fs from "node:fs";
import path from "node:path";

// ── POR QUE ISTO É UM MATCHER À MÃO, E NÃO `picomatch` ──────────────────────
// `picomatch` existe em `node_modules` (v2.3.1), mas só como dependência
// TRANSITIVA de outra ferramenta — não está em `package.json` desta casa, e
// não traz `.d.ts` próprio. Importá-lo aqui prenderia este gatilho de
// produção a um pacote que pode sumir do lockfile numa atualização não
// relacionada, e o `tsc --noEmit` reclamaria de tipo implícito `any`
// (`strict: true`). O conjunto de padrões que este arquivo precisa entender
// é pequeno e conhecido (`**`, `!`, `/` de âncora, `*` dentro de um
// segmento) — um conversor glob→regex de ~20 linhas é mais legível e não
// depende de nada que não esteja declarado.

type PadraoNormalizado = {
  /** true = padrão começa com "!": quando ele casa, DESLIGA o disparo. */
  negativo: boolean;
  /** O padrão sem o "!" e sem a "/" de âncora inicial. */
  alvo: string;
};

/**
 * Lê `build.watchPatterns` direto do `railway.json` no disco. Não há
 * fallback silencioso: se o arquivo não existir, não tiver o bloco `build`
 * ou a lista vier vazia, isto é uma falha de configuração — mascará-la como
 * "então dispara sempre" ou "então nunca dispara" seria decidir por trás do
 * operador, exatamente o tipo de silêncio que este módulo existe para evitar.
 */
export function lerPadroesDoRailway(caminhoDoRepo: string = process.cwd()): string[] {
  const caminho = path.join(caminhoDoRepo, "railway.json");
  let bruto: string;
  try {
    bruto = fs.readFileSync(caminho, "utf-8");
  } catch {
    throw new Error(`Não consegui ler ${caminho}. Sem ele não há como saber o que dispara build.`);
  }
  const json = JSON.parse(bruto) as { build?: { watchPatterns?: string[] | null } };
  const padroes = json.build?.watchPatterns;
  if (!padroes || padroes.length === 0) {
    throw new Error(
      "railway.json não define build.watchPatterns (ou a lista está vazia). Sem padrão, não dá para julgar o que dispara build — configure antes de confiar neste gatilho.",
    );
  }
  return padroes;
}

function normalizar(padraoBruto: string): PadraoNormalizado {
  let p = padraoBruto;
  let negativo = false;
  if (p.startsWith("!")) {
    negativo = true;
    p = p.slice(1);
  }
  if (p.startsWith("/")) {
    p = p.slice(1);
  }
  return { negativo, alvo: p };
}

function normalizarCaminho(arquivo: string): string {
  return arquivo.startsWith("/") ? arquivo.slice(1) : arquivo;
}

const ESPECIAIS_DE_REGEX = /[.+^${}()|[\]\\]/g;

/**
 * Converte um padrão estilo `.gitignore` (sem o `!` e sem a `/` de âncora —
 * já removidos por `normalizar`) numa `RegExp` que casa o caminho inteiro.
 *
 *   - `**`  → qualquer sequência de caracteres, inclusive vazia e inclusive
 *             com `/` — cruza diretórios. Cobre tanto "tudo" (padrão `**`
 *             sozinho) quanto "qualquer coisa dentro de" (`reivindicacoes/**`).
 *   - `*`   → qualquer sequência DENTRO de um segmento (não cruza `/`) — é o
 *             que faz `*.md` bater só com `.md` da raiz, nunca aninhado.
 *   - resto → literal, com os caracteres especiais de regex escapados.
 *
 * Deliberadamente NÃO trata ponto inicial como caso especial: arquivo
 * escondido (`.github/workflows/ci.yml`) precisa casar com `**` do mesmo
 * jeito que qualquer outro — é código lido pelo CI, não papelada.
 */
function paraRegex(padrao: string): RegExp {
  let corpo = "";
  let i = 0;
  while (i < padrao.length) {
    const c = padrao[i];
    if (c === "*") {
      if (padrao[i + 1] === "*") {
        corpo += ".*";
        i += 2;
      } else {
        corpo += "[^/]*";
        i += 1;
      }
    } else {
      corpo += (c ?? "").replace(ESPECIAIS_DE_REGEX, "\\$&");
      i += 1;
    }
  }
  return new RegExp(`^${corpo}$`);
}

/**
 * Um arquivo dispara build? Implementa a regra do Railway (idêntica ao
 * `.gitignore`): os padrões são avaliados NA ORDEM, e o ÚLTIMO que casar
 * vence — um padrão iniciado por "!" desliga o disparo quando casa por
 * último; qualquer outro liga.
 */
function arquivoDispara(arquivo: string, padroes: PadraoNormalizado[]): boolean {
  const caminho = normalizarCaminho(arquivo);
  let dispara = false;
  for (const padrao of padroes) {
    if (paraRegex(padrao.alvo).test(caminho)) {
      dispara = !padrao.negativo;
    }
  }
  return dispara;
}

/**
 * O veredito de um push inteiro: dispara build se AO MENOS UM arquivo
 * alterado disparar. É por isso que um push misto (papelada + código) sobe —
 * é exatamente o caso do push agrupado, e barrá-lo seria trocar "produção
 * parada por churn" por "produção parada por atraso de verdade".
 *
 * Lista vazia de arquivos não dispara nada — não há o que construir.
 */
export function disparaBuild(arquivos: string[], padroes: string[]): boolean {
  if (arquivos.length === 0) return false;
  const normalizados = padroes.map(normalizar);
  return arquivos.some((arquivo) => arquivoDispara(arquivo, normalizados));
}
