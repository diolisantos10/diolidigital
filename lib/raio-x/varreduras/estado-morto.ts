// PADRÃO 4 — Estado morto.
//
// O que pescou de verdade, nesta casa, e é a cicatriz do kit inteiro: o clique
// de aprovação gravava um estado que o relógio de publicação NUNCA lia. O
// cliente aprovava o mês inteiro e nada publicava — sem erro, sem aviso. O CEO ia
// aprovar seis peças na manhã seguinte e nenhuma publicaria.
//
// TRADUÇÃO PARA ESTE CÓDIGO: os estados desta casa são literais de string em
// campos `status` / `state` / `visibility` (`"draft"`, `"scheduled"`,
// `"approved"`, `"compartilhado"`…). O teste é brutalmente simples e por isso
// não erra: **existe alguém LENDO este literal?** Escrita é `data:` / `create(`
// / `update(`; leitura é `where`, `===`, `includes(`, `in: [`. Literal com
// escrita e ZERO leitura é estado morto — o dado grava e morre.

import { fontesDoProjeto, linhaDe, type Arquivo } from "../fonte";
import { cega, type Achado, type ResultadoDeVarredura } from "../tipos";

const NOME = "estado-morto";

const CAMPO_DE_ESTADO = /\b(status|state|visibility|estado|situacao|authorRole)\s*:\s*["'`]([a-z_][a-z0-9_-]{2,30})["'`]/gi;

/** Janela para trás, em caracteres. Escrita e leitura no Prisma ficam no mesmo
 *  objeto, a poucas linhas da palavra que as distingue. */
const JANELA = 260;

type Contagem = { escritas: number; leituras: number; onde: string; linha: number };

const MARCA_DE_LEITURA = /where\s*:|\bfindMany\(|\bfindFirst\(|\bfindUnique\(|\bcount\(|\bin\s*:\s*\[/g;
const MARCA_DE_ESCRITA = /data\s*:|\bcreate\(|\bupdate\(|\bupdateMany\(|\bupsert\(|\bcreateMany\(/g;

/** Vale a marca MAIS PRÓXIMA, não a primeira encontrada.
 *  `update({ where: { id }, data: { status: "approved" } })` tem as duas antes
 *  do literal — e a que manda é `data:`, que está colada nele. Priorizar por
 *  ordem de teste, e não por distância, classificaria toda escrita do Prisma
 *  como leitura: a varredura de estado morto nunca acharia nada. */
function classificar(contexto: string, linhaInteira: string): "leitura" | "escrita" | "indefinido" {
  const ultima = (re: RegExp): number => {
    re.lastIndex = 0;
    let fim = -1;
    let m: RegExpExecArray | null;
    while ((m = re.exec(contexto))) fim = m.index;
    return fim;
  };
  const leitura = ultima(MARCA_DE_LEITURA);
  const escrita = ultima(MARCA_DE_ESCRITA);
  if (escrita > leitura) return "escrita";
  if (leitura > -1) return "leitura";
  if (/===|!==|\.includes\(|\bfilter\(|\bsome\(|\bcase\s/.test(linhaInteira)) return "leitura";
  return "indefinido";
}

export function varrerEstadoMorto(entrada?: Arquivo[]): ResultadoDeVarredura {
  // `components` entra na leitura: a TELA é leitora legítima de estado
  // (`p.status === "triado"` num badge). Varrer só `app` e `lib` acusou de
  // mortos, na primeira rodada, dois estados que a interface lê o tempo todo.
  const fontes = (entrada ?? fontesDoProjeto(["app", "lib", "components"])).filter(
    (f) => !f.caminho.includes("__tests__")
  );
  if (fontes.length === 0) return cega(NOME, "estado-morto", "nenhum fonte lido — varredura não olhou nada");

  const mapa = new Map<string, Contagem>();

  // DUAS PASSADAS, e a ordem importa. Numa passada só, a leitura solta de um
  // estado só contava se o arquivo que ESCREVE tivesse sido lido antes — ou
  // seja, o veredito dependia da ordem alfabética dos arquivos. Foi assim que
  // `scope_ready` (lido em `app/agency/requests/page.tsx`, escrito em `lib/`)
  // apareceu como morto na primeira rodada.
  for (const { caminho, texto } of fontes) {
    CAMPO_DE_ESTADO.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = CAMPO_DE_ESTADO.exec(texto))) {
      const campo = m[1]!.toLowerCase();
      const valor = m[2]!;
      const chave = `${campo}=${valor}`;
      const contexto = texto.slice(Math.max(0, m.index - JANELA), m.index);
      const inicioLinha = texto.lastIndexOf("\n", m.index) + 1;
      let fimLinha = texto.indexOf("\n", m.index);
      if (fimLinha === -1) fimLinha = texto.length;
      const linhaInteira = texto.slice(inicioLinha, fimLinha);
      const tipo = classificar(contexto, linhaInteira);

      const atual = mapa.get(chave) ?? { escritas: 0, leituras: 0, onde: caminho, linha: linhaDe(texto, m.index) };
      if (tipo === "leitura") atual.leituras++;
      else if (tipo === "escrita") {
        if (atual.escritas === 0) {
          atual.onde = caminho;
          atual.linha = linhaDe(texto, m.index);
        }
        atual.escritas++;
      }
      mapa.set(chave, atual);
    }
  }

  // Passada 2 — leitura fora do formato `campo: "valor"`: comparação solta
  // (`post.status === "scheduled"`) e listas (`["approved","published"]`). Sem
  // isto a varredura chamaria de morto todo estado lido por comparação, que é
  // como metade desta casa lê estado.
  for (const { texto } of fontes) {
    const solto = /["'`]([a-z_][a-z0-9_-]{2,30})["'`]/g;
    let s: RegExpExecArray | null;
    while ((s = solto.exec(texto))) {
      const inicioLinha = texto.lastIndexOf("\n", s.index) + 1;
      let fimLinha = texto.indexOf("\n", s.index);
      if (fimLinha === -1) fimLinha = texto.length;
      const linhaInteira = texto.slice(inicioLinha, fimLinha);
      if (!/===|!==|\.includes\(|\bin\s*:\s*\[|\bfilter\(|\bsome\(|\bcase\s/.test(linhaInteira)) continue;
      for (const campo of ["status", "state", "visibility", "estado", "situacao", "authorrole"]) {
        const chave = `${campo}=${s[1]!}`;
        const atual = mapa.get(chave);
        if (atual) atual.leituras++;
      }
    }
  }

  const achados: Achado[] = [];
  for (const [chave, c] of [...mapa.entries()].sort()) {
    if (c.escritas === 0 || c.leituras > 0) continue;
    achados.push({
      padrao: "estado-morto",
      chave: `estado-morto:${chave}`,
      titulo: `Estado "${chave}" é gravado e ninguém lê`,
      evidencia: `${c.escritas} escrita(s), 0 leitura(s). Primeira em ${c.onde}:${c.linha}`,
      local: `${c.onde}:${c.linha}`,
      gravidade: "alto",
    });
  }

  return {
    varredura: NOME,
    padrao: "estado-morto",
    status: "rodou",
    achados,
    medidas: { estadosDistintos: mapa.size, estadosSemLeitor: achados.length },
  };
}
