// A RÉGUA (pura) DE `prisma/schema.prisma` vs. `lib/generated/prisma/models/**`
// — as duas fontes da mesma verdade, e elas JÁ DIVERGIRAM EM SILÊNCIO
// (16/08/2026).
//
// ── O INCIDENTE ──────────────────────────────────────────────────────────
//
// `avisoOrcamentoStatus` existia no schema e na migration
// `20260816130000_aviso_de_orcamento_que_falha`, e tinha ZERO ocorrências no
// cliente Prisma gerado — alguém rodou `prisma generate` depois de uma
// migration e não depois da outra. O acesso de produção àqueles campos é
// por SQL cru (`lib/agency/esteira/orcamento-do-briefing.ts`), que não passa
// pelo tipo — então a função de produção funcionava, e só quebraria em
// runtime no dia em que ALGUÉM usasse o cliente tipado para os mesmos
// campos. Peça verde, junta rompida.
//
// Este módulo é a metade PURA da trava: recebe texto, devolve o veredito.
// Quem lê os arquivos reais do repositório é o teste
// (`__tests__/plataforma/cliente-gerado.test.ts`) — aqui dentro não há I/O,
// e é isso que torna a régua testável por mutação sem tocar em disco.
//
// ── 🔴 O QUE ESTA RÉGUA NÃO PEGA — leia antes de confiar nela ──────────────
//
// Ela cobre EXATAMENTE o caso que mordeu hoje: um CAMPO ESCALAR NOVO no
// schema, ausente no cliente gerado. Fora isso, ela é cega para:
//
//   • MUDANÇA DE TIPO de um campo que já existe dos dois lados (schema muda
//     `String` para `Int`, o cliente ainda tem o nome antigo do jeito
//     antigo) — o nome do campo continua "presente" nos dois textos, e é só
//     o nome que esta régua compara.
//   • ENUMS — um campo cujo tipo é um enum é tratado como campo escalar
//     comum (nem sabe que é um enum). Se um valor do enum for removido, ou
//     o enum inteiro for renomeado, esta régua não percebe.
//   • ÍNDICES (`@@index`, `@@unique`, `@@map` e demais atributos de bloco)
//     — são deliberadamente ignorados na leitura do schema; nada aqui
//     verifica se eles têm efeito no cliente gerado.
//   • REMOÇÃO de um campo do schema que CONTINUA sobrando no cliente gerado
//     — código morto do lado do cliente não é acusado. Só a AUSÊNCIA no
//     cliente é (schema → cliente, nunca o caminho inverso).
//   • RELAÇÕES — um campo cujo tipo é outro `model` é excluído de propósito
//     (relação não vira campo escalar simples no tipo gerado; incluí-la
//     geraria falso positivo). Uma relação quebrada entre schema e cliente
//     não é pega por esta régua.
//   • FORMATO DE EMISSÃO do gerador — a busca no texto do cliente assume que
//     todo campo aparece em pelo menos uma linha própria como
//     `nomeDoCampo:` ou `nomeDoCampo?:` (é como o Prisma 7 emite hoje). Um
//     gerador que mudasse radicalmente esse formato furaria a régua sem
//     avisar.
//
// Trava que se acredita mais completa do que é vale menos que trava
// nenhuma — por isso esta lista fica em cima do arquivo, não numa nota de
// rodapé.

// Nota sobre tipos: um campo cujo tipo NÃO é `String`/`Int`/`Float`/
// `Boolean`/`DateTime`/`Json`/`Bytes`/`BigInt`/`Decimal` e também não é o
// nome de outro `model` deste schema é, hoje, quase sempre um ENUM — e esta
// régua o trata como campo escalar comum (ver limitação de ENUMS no topo do
// arquivo). Não há lista de tipos nativos aqui porque a única decisão que
// esta função precisa tomar é "o tipo é outro model?" — o resto é irrelevante
// para achar CAMPO AUSENTE.

function ehLinhaDeComentario(linha: string): boolean {
  const semEspacos = linha.trim();
  // Cobre `//` e `///` (doc comment) — as duas grafias usadas no schema.
  return semEspacos.startsWith("//");
}

function ehLinhaDeAtributoDeBloco(linha: string): boolean {
  return linha.trim().startsWith("@@");
}

/** Delta de profundidade de chaves de UMA linha — usado para achar o fim de cada `model { ... }`. */
function deltaDeChaves(linha: string): number {
  let delta = 0;
  for (const caractere of linha) {
    if (caractere === "{") delta += 1;
    else if (caractere === "}") delta -= 1;
  }
  return delta;
}

/** Os nomes de todo `model X { ... }` declarado no texto do schema — usados para reconhecer campos de relação. */
function nomesDosModelos(textoDoSchema: string): Set<string> {
  const nomes = new Set<string>();
  for (const encontro of textoDoSchema.matchAll(/^\s*model\s+(\w+)\s*\{/gm)) {
    nomes.add(encontro[1]!);
  }
  return nomes;
}

/**
 * Para cada `model X { ... }` do texto do schema, os nomes dos campos
 * ESCALARES declarados — nunca os de relação, nunca atributos de bloco,
 * nunca comentário.
 *
 * Função pura: só olha para o texto que recebe. Isso é o que permite provar
 * a trava por mutação (plantar um campo a mais no texto em memória) sem
 * tocar em disco.
 */
export function camposDoSchema(textoDoSchema: string): Map<string, string[]> {
  const modelos = nomesDosModelos(textoDoSchema);
  const resultado = new Map<string, string[]>();

  let modeloAtual: string | null = null;
  let profundidade = 0;

  for (const linha of textoDoSchema.split("\n")) {
    if (modeloAtual === null) {
      const abertura = linha.match(/^\s*model\s+(\w+)\s*\{/);
      if (abertura) {
        modeloAtual = abertura[1]!;
        resultado.set(modeloAtual, []);
        profundidade = deltaDeChaves(linha);
      }
      continue;
    }

    // Dentro de um model: comentário e atributo de bloco nunca são campo, e
    // nunca contam para achar o fim do bloco (o schema real desta casa só
    // usa chaves balanceadas dentro de comentário — ex.: `` `{ platform,
    // externalId }` `` — então ignorá-los por completo é seguro E é o que a
    // ficha pediu).
    if (ehLinhaDeComentario(linha)) {
      continue;
    }

    if (ehLinhaDeAtributoDeBloco(linha)) {
      profundidade += deltaDeChaves(linha);
      if (profundidade <= 0) modeloAtual = null;
      continue;
    }

    const semEspacos = linha.trim();
    if (semEspacos !== "}" && semEspacos !== "") {
      // Uma linha de campo é `nome  Tipo[opcional/lista]  @atributos-inline`.
      // Suficiente capturar nome + tipo base; sufixo (`?`, `[]`) não importa
      // aqui — só precisamos saber se o TIPO é outro model (relação).
      const campo = linha.match(/^\s*(\w+)\s+(\w+)/);
      if (campo) {
        const [, nomeDoCampo, tipoBase] = campo;
        const ehRelacao = modelos.has(tipoBase!);
        if (!ehRelacao) {
          resultado.get(modeloAtual)!.push(nomeDoCampo!);
        }
      }
    }

    profundidade += deltaDeChaves(linha);
    if (profundidade <= 0) {
      modeloAtual = null;
    }
  }

  return resultado;
}

/**
 * Dos campos de UM model do schema, quais NÃO aparecem no texto do arquivo
 * de cliente gerado correspondente (`lib/generated/prisma/models/<Model>.ts`).
 *
 * Busca, para cada campo, uma linha própria começando por `nomeDoCampo:` ou
 * `nomeDoCampo?:` — é assim que o Prisma 7 emite toda propriedade de tipo
 * (`Min/MaxAggregateOutputType`, `WhereInput`, `CreateInput`, `Select`, e por
 * aí vai). Um campo que só existe em UM desses tipos já basta para não ser
 * acusado — o objetivo é pegar AUSÊNCIA TOTAL, o sintoma exato do incidente
 * de hoje, não uma cobertura completa de todas as variantes de tipo.
 *
 * Pura: recebe os dois textos, nunca abre arquivo.
 */
export function camposAusentesNoCliente(
  camposDoModelo: string[],
  textoDoModeloGerado: string,
): string[] {
  return camposDoModelo.filter((nomeDoCampo) => {
    const escapado = nomeDoCampo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const apareceComoPropriedade = new RegExp(`^\\s*${escapado}\\??:\\s`, "m");
    return !apareceComoPropriedade.test(textoDoModeloGerado);
  });
}
