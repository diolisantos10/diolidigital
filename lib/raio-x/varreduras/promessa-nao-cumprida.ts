// PADRÃO 3 — Promessa que o código não cumpre.
//
// O que pescou de verdade, nesta casa: um relatório afirmando "qualidade
// verificada" com as verificações escritas como `true` fixo no código. E o P0
// declarado da casa: a maioria das checagens de `quality-gates.ts` é
// `autoCheckable: false` — texto descrevendo o que um humano deveria conferir,
// numa operação que decidiu rodar 100% IA e não tem humano nenhum conferindo.
// (O número corrente sai de `retratoDosPortoes()`; escrito à mão em comentário
// ele envelhece errado, que foi o que aconteceu com o "28 de 31" daqui.)
//
// TRADUÇÃO PARA ESTE CÓDIGO, duas frentes:
//   a) CARIMBO CONSTANTE: campo com cara de veredito (`verificado`, `aprovado`,
//      `semAlucinacao`, `passed`, `isValid`…) recebendo literal `true`/`false`.
//      O valor de um veredito tem que VIR de uma verificação que rodou.
//   b) A MEDIDA DO P0: quantas checagens do registro de qualidade não são
//      executáveis. É número, entra na comparação com ontem, e é ele que mostra
//      se o P0 está andando ou parado — que é exatamente o que some quando
//      "estamos trabalhando nisso" vira resposta de todo mês.

import { retratoDosPortoes } from "@/lib/dioli-brain/quality-gates";
import { fontesDoProjeto, linhaDe, trecho, type Arquivo } from "../fonte";
import { cega, type Achado, type ResultadoDeVarredura } from "../tipos";

const NOME = "promessa-nao-cumprida";

/** Nomes que prometem um veredito. Lista fechada de propósito: sem ela a
 *  varredura vira "procure booleano", que acha 4.000 coisas e informa zero. */
const CARIMBO =
  /\b(verificad\w*|verified|aprovad\w*|approved|semAlucinacao|hasHallucination|passed|passou|isValid|valido|checagemOk|auditad\w*|conferid\w*|seguro|compliant)\s*[:=]\s*(true|false)\b/g;

/** O literal só é problema quando NÃO veio de uma checagem. Estas exceções são
 *  as formas legítimas: default de schema, valor de teste, tipo. */
const LEGITIMO = /@default|\.mock|expect\(|describe\(|it\(|type\s|interface\s|\?\s*true\s*:|as const/;

/** COMENTÁRIO NÃO É CÓDIGO. A primeira rodada acusou `// const hasHallucination
 *  = false;` — uma linha que o `quality-engine.ts` mantém justamente para
 *  CONTAR a história do bug que já foi consertado. Acusar a cicatriz de ser a
 *  ferida é a forma mais rápida de o CEO parar de ler o relatório. */
function ehComentario(linha: string): boolean {
  const t = linha.trimStart();
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*");
}

// ─── CALIBRAÇÃO DE 15/08/2026 — a varredura estava acusando A TRAVA de ser o
//     defeito. `carimbosConstantes` saltou de 0 para 22 sem que nada tivesse
//     piorado: o que mudou foi o CÓDIGO ganhar uniões discriminadas, e a
//     varredura não conhecer a forma. Três distinções entraram. ──────────────

/** 1. DECLARAÇÃO DE TIPO NÃO É CÓDIGO — pelo mesmo motivo que comentário não é.
 *
 *  `type ParecerDeAprovacao = | { aprovada: true; … } | { aprovada: false;
 *  motivo: string }` descreve o FORMATO das duas respostas possíveis. Não
 *  carimba nada: é a assinatura que obriga quem recusa a escrever o motivo.
 *  Acusá-la é acusar a documentação do contrato de ser a quebra dele.
 *
 *  São DUAS marcas sintáticas, porque uma só não cobre as duas formas que a
 *  casa escreve:
 *
 *    1. dentro de um tipo as propriedades são separadas por `;`, e num objeto
 *       de verdade por `,` ou pelo `}` — pega `{ aprovada: false; motivo: … }`;
 *    2. o membro de união com uma propriedade só (`| { valido: true }`) não tem
 *       `;` nenhum, e é reconhecido pelo `|` que abre o membro.
 *
 *  Vale só para a forma `nome: valor` — `verificado = true;` é atribuição e
 *  continua valendo como carimbo, senão o `;` viraria porta de saída para o
 *  defeito real. E o `|` do membro de união é distinguido do `||` de código
 *  (`a || { verificado: true }` continua sendo achado). */
function ehDeclaracaoDeTipo(texto: string, separador: string, indice: number, fimDoLiteral: number): boolean {
  if (separador !== ":") return false;
  if (/^\s*;/.test(texto.slice(fimDoLiteral))) return true;
  const abre = inicioDoObjeto(texto, indice);
  if (abre === -1) return false;
  return /(^|[^|&])[|&]\s*\(?\s*$/.test(texto.slice(Math.max(0, abre - 40), abre));
}

/** 2. RECUSA NÃO É PROMESSA — e o padrão 3 se chama "promessa que o código não
 *  cumpre", não "booleano fixo".
 *
 *  `{ aprovada: false, motivo: "…" }` não promete coisa alguma ao cliente: ele
 *  NEGA. O dano do padrão é o selo que afirma o que ninguém verificou —
 *  `semAlucinacao: true` sem checagem, `verificado: true` de enfeite. Um `false`
 *  literal, no pior caso, é excesso de rigor; e excesso de rigor não chega ao
 *  cliente como mentira.
 *
 *  A polaridade importa porque nem todo nome é positivo: em `hasHallucination`
 *  a afirmação boa é `false` — foi essa linha, aliás, o incidente que criou o
 *  padrão. A lista abaixo é a das negativas; todo o resto afirma com `true`. */
const NOMES_DE_POLARIDADE_INVERTIDA = /^(hasHallucination)$/;

function ehAfirmacao(nome: string, literal: string): boolean {
  const bom = NOMES_DE_POLARIDADE_INVERTIDA.test(nome) ? "false" : "true";
  return literal === bom;
}

/** 3. UNIÃO DISCRIMINADA: o veredito devolvido no FIM de um caminho que provou.
 *
 *  `validarRegistro` só chega em `return { valido: true }` depois de oito
 *  guardas que devolvem `{ valido: false, motivo: … }`. `aprovacaoDaPeca` só
 *  devolve `aprovada: true` depois de provar que quem aprovou foi o cliente no
 *  portal — que é **a trava que o CEO mandou criar em 14/08/2026**. Chamar isso
 *  de "veredito gravado como literal" é apontar a arma para a defesa.
 *
 *  A diferença entre as duas coisas, e ela é verificável sem parser:
 *
 *  | | carimbo (defeito) | união discriminada (trava) |
 *  |---|---|---|
 *  | a afirmação está em | atribuição, objeto de resposta | `return` |
 *  | o mesmo campo recusa? | **nunca** — só existe o `true` | sim, com motivo |
 *
 *  As DUAS condições são exigidas, e é a conjunção que impede o afrouxamento:
 *  um `semAlucinacao: true` colado num objeto de resposta continua sendo achado
 *  mesmo num arquivo cheio de recusas, porque não é `return`; e um arquivo que
 *  só sabe dizer "sim" continua sendo achado mesmo que o `true` esteja num
 *  `return`, porque nunca existiu caminho de "não". Fingir a trava passa a
 *  custar escrever a trava. */
const MOTIVO_DA_RECUSA = /\b(motivo|motivos|razao|reason|erro|error|mensagem)\b/;

/** Quantos caminhos de "não", COM motivo escrito, este arquivo tem para este
 *  campo. Zero = o arquivo só sabe dizer sim, e aí o sim é carimbo. */
function recusasComMotivo(texto: string, nome: string): number {
  const ruim = NOMES_DE_POLARIDADE_INVERTIDA.test(nome) ? "true" : "false";
  const re = new RegExp(`\\b${nome}\\s*:\\s*${ruim}\\b`, "g");
  let n = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto))) {
    const fim = m.index + m[0].length;
    if (ehComentario(trecho(texto, m.index, 200))) continue;
    // A recusa declarada num TIPO (`| { aprovada: false; motivo: string }`)
    // descreve o contrato; a recusa em código é que prova que o "não" existe.
    if (/^\s*;/.test(texto.slice(fim))) continue;
    // O motivo costuma vir na linha SEGUINTE, dentro do mesmo objeto — por isso
    // a janela é o texto adiante, não a linha.
    if (MOTIVO_DA_RECUSA.test(texto.slice(m.index, fim + 300))) n++;
  }
  return n;
}

/** O `{` do objeto que contém este ponto — andando para trás e contando chaves. */
function inicioDoObjeto(texto: string, indice: number): number {
  let nivel = 0;
  for (let i = indice; i >= 0; i--) {
    const c = texto[i];
    if (c === "}") nivel++;
    else if (c === "{") {
      if (nivel === 0) return i;
      nivel--;
    }
  }
  return -1;
}

/** A afirmação é o valor DEVOLVIDO por uma função? `return {` na linha de cima
 *  conta — o objeto de resposta quase nunca cabe numa linha só, e olhar apenas
 *  a linha do campo faria a distinção depender de formatação. */
function ehValorDeRetorno(texto: string, indice: number): boolean {
  const abre = inicioDoObjeto(texto, indice);
  if (abre === -1) return false;
  return /\breturn\s*$/.test(texto.slice(Math.max(0, abre - 40), abre));
}

/** O retrato dos portões é injetável só para o teste poder plantar um número.
 *  O padrão é a FUNÇÃO do registro — nunca uma contagem de texto. Ver o bloco
 *  "UM NÚMERO SÓ" mais abaixo. */
export type RetratoDosPortoes = ReturnType<typeof retratoDosPortoes>;

export function varrerPromessaNaoCumprida(
  entrada?: Arquivo[],
  retrato: () => RetratoDosPortoes = retratoDosPortoes,
): ResultadoDeVarredura {
  const fontes = (entrada ?? fontesDoProjeto(["app", "lib", "components"])).filter(
    (f) => !f.caminho.includes("__tests__")
  );
  if (fontes.length === 0) return cega(NOME, "promessa-nao-cumprida", "nenhum fonte lido — varredura não olhou nada");

  const achados: Achado[] = [];
  let declaracoesDeTipo = 0;
  let recusas = 0;
  let unioesDiscriminadas = 0;

  for (const { caminho, texto } of fontes) {
    CARIMBO.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = CARIMBO.exec(texto))) {
      const nome = m[1]!;
      const literal = m[2]!;
      const separador = texto.slice(m.index, m.index + m[0].length).includes("=") ? "=" : ":";
      const linhaInteira = trecho(texto, m.index, 200);
      if (ehComentario(linhaInteira) || LEGITIMO.test(linhaInteira)) continue;

      // 1. Contrato escrito não é promessa quebrada.
      if (ehDeclaracaoDeTipo(texto, separador, m.index, m.index + m[0].length)) {
        declaracoesDeTipo++;
        continue;
      }
      // 2. Recusar não promete nada. O padrão persegue o "sim" sem lastro.
      if (!ehAfirmacao(nome, literal)) {
        recusas++;
        continue;
      }
      // 3. O "sim" DEVOLVIDO no fim de um caminho que tem "não" com motivo é a
      //    trava funcionando — não o defeito que a trava evita.
      if (ehValorDeRetorno(texto, m.index) && recusasComMotivo(texto, nome) > 0) {
        unioesDiscriminadas++;
        continue;
      }

      const linha = linhaDe(texto, m.index);
      achados.push({
        padrao: "promessa-nao-cumprida",
        chave: `carimbo-fixo:${caminho}:${nome}`,
        titulo: `Veredito "${nome}" gravado como literal ${literal}`,
        evidencia: `${caminho}:${linha} · ${linhaInteira}`,
        local: `${caminho}:${linha}`,
        gravidade: "alto",
      });
    }
  }

  // ─── UM NÚMERO SÓ, COM UM DONO SÓ ──────────────────────────────────────────
  //
  // A medida do P0 vinha de CONTAR `autoCheckable:` no texto do arquivo, e o
  // texto mentia: a contagem pegava as duas linhas da união discriminada que
  // DECLARA o tipo do portão (`autoCheckable: true` / `false` em `types`) e mais
  // duas de comentário. O raio-x imprimia "27 de 37" enquanto
  // `retratoDosPortoes()` — o registro — dizia 25 de 33.
  //
  // Dois números para a mesma pergunta é como a prosa desta casa ficou defasada
  // por meses, e o CLAUDE.md manda não repetir o número em lugar nenhum
  // justamente por isso. Agora o raio-x LÊ A FUNÇÃO. Se o registro mudar, o
  // relatório muda no mesmo instante; e ninguém mais tem de escolher em quem
  // acreditar. (De quebra, a contagem de texto tinha o mesmo defeito de leitura
  // que produzia os 22 falsos positivos aí em cima — a mesma união discriminada,
  // a mesma cegueira.)
  const p = retrato();
  const medidas: Record<string, number> = {
    carimbosConstantes: achados.length,
    // O que a calibração descartou fica CONTADO, nunca escondido: se estes
    // números explodirem, a calibração passou a engolir defeito.
    declaracoesDeTipoIgnoradas: declaracoesDeTipo,
    recusasIgnoradas: recusas,
    vereditosEmUniaoDiscriminada: unioesDiscriminadas,
    checagensDeQualidade: p.total,
    checagensNaoExecutaveis: p.comLacuna,
    checagensBloqueantesSemMecanismo: p.bloqueantesSemMecanismo,
  };
  if (p.comLacuna > 0) {
    achados.push({
      padrao: "promessa-nao-cumprida",
      chave: "p0-checagens-nao-executaveis",
      titulo: "Checagens de qualidade que nenhum código roda",
      evidencia:
        `${p.comLacuna} de ${p.total} checagens declaram lacuna, não mecanismo — descrevem o que alguém ` +
        `deveria conferir, numa operação sem revisão humana. ${p.bloqueantesSemMecanismo} delas são BLOQUEANTES. ` +
        `Número lido de retratoDosPortoes(), o registro, não contado no texto`,
      local: "lib/dioli-brain/quality-gates.ts",
      gravidade: "alto",
    });
  }

  return { varredura: NOME, padrao: "promessa-nao-cumprida", status: "rodou", achados, medidas };
}
