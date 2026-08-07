// escolha-de-foto.ts — QUANDO A FOTO REAL DO CLIENTE ENTRA NA PEÇA.
//
// ── O DEFEITO QUE ESTE ARQUIVO EXISTE PARA FECHAR (07/08/2026) ──────────────
//
// O cliente conectava o Google Drive, o material entrava na casa, e A PEÇA SAÍA
// IGUAL. Medido, não suposto: `fotosReaisDoCliente` não tinha UM chamador no
// app, e `montarArteComFotoDoCliente` só era chamada por teste. Toda peça
// continuava com fundo gerado por IA. Isso é promessa quebrada em silêncio — o
// CEO subiu os arquivos de três clientes acreditando que a peça mudaria.
//
// ── POR QUE NÃO É UM INTERRUPTOR ───────────────────────────────────────────
//
// "Use a foto do cliente quando houver" é a correção óbvia e é a errada. Ela
// põe a foto do balcão na tela de GANCHO, cujo trabalho é mostrar a DOR
// acontecendo. **Foto real que não tem nada a ver com o texto é pior que foto
// de IA**: ela parece verdade, ocupa o lugar do argumento e não argumenta.
//
// A trava do storyboard já reprova cena repetida porque uma tela sem função
// própria não merece imagem própria. Pela mesma razão, a foto escolhida tem de
// ter RAZÃO. Aqui existem exatamente duas, e as duas são derivadas do conteúdo:
//
//   1. **RAZÃO DE PAPEL** — o papel que a tela cumpre na história declara, em
//      `FUNCOES[papel].materiaisReais`, que classes de material real servem a
//      ele. A declaração é derivada do `imagemPrecisa` do próprio papel, não de
//      gosto. Papel sem classe admissível (gancho, tensão, capa, matéria,
//      fechamento) **nunca** recebe foto real.
//
//   2. **RAZÃO DE ASSUNTO** — o desempate. Com mais de um candidato da mesma
//      classe, exige-se lastro léxico entre o NOME DO ARQUIVO (a palavra que o
//      próprio cliente escreveu — o mesmo sinal que `casarMaterial` já trata
//      como o mais forte que a casa tem) e o texto daquela tela.
//
// ── A REGRA QUE MAIS IMPORTA É A DE NÃO ESCOLHER ───────────────────────────
//
// Empate, ou lastro zero entre vários candidatos, **NÃO escolhe**: gera por IA e
// DECLARA que havia material e por que nenhum entrou. É a lição de 04/08/2026,
// escrita com todas as letras em `scripts/backfill-carrossel-foocci.mjs`:
// **"sobra não é evidência de correspondência"**. Casar arquivo com peça por
// ordem ou por sobra foi o que montou carrossel com o logo e material bruto
// dentro. Um candidato só, do papel certo, é razão; três candidatos e um
// `[0]` é sorteio com cara de decisão.
//
// ── ESTE ARQUIVO É PURO ────────────────────────────────────────────────────
//
// Sem banco, rede, navegador ou IA. Entra a tela e o que o cliente tem, sai o
// veredito com o motivo. É pré-requisito de "sem gate = reprovado": regra que
// precisa de infraestrutura acaba desligada no dia em que a infraestrutura
// tosse, e aí a peça volta a escolher por sobra sem ninguém saber.

import { FUNCOES, assinaturaDaCena, type MaterialReal } from "./storyboard";

/** Uma foto real do cliente, já importada e já autorizada, candidata a virar
 *  a imagem de uma tela. */
export interface FotoCandidata {
  mediaAssetId: string;
  /** O papel que O CLIENTE declarou ao escolher o arquivo no Drive. */
  papel: MaterialReal;
  /** O nome do arquivo. É a PALAVRA DELE, e é o único lastro de assunto que a
   *  casa tem sem abrir a imagem — por isso é o desempate, e não a decisão. */
  nome: string;
  mimeType: string;
}

export type MotivoDeNaoUsar =
  /** A tela não declarou papel (ou o papel não existe no vocabulário). Sem
   *  papel não há razão, e inferir papel do texto é preencher por dedução. */
  | "papel_nao_declarado"
  /** O papel existe e declara que NENHUMA classe de material real serve a ele.
   *  Gancho, tensão, capa, matéria, fechamento. Não é falta de material. */
  | "papel_nao_admite_foto_real"
  /** O papel admite material real e o cliente não tem nenhum daquelas classes.
   *  É o caso que vira PERGUNTA ao cliente. */
  | "sem_material_da_classe"
  /** Tinha, e todas já entraram em outras telas desta mesma peça. Repetir seria
   *  a imagem repetida que a trava do storyboard reprova. */
  | "todas_ja_usadas"
  /** Havia mais de um candidato e NENHUMA razão para preferir um. Não se
   *  escolhe por sobra. */
  | "empate_sem_razao";

export type EscolhaDeFoto =
  | {
      usar: true;
      foto: FotoCandidata;
      /** Por que ESTA foto, em português. Vai para o registro da peça: escolha
       *  sem razão registrada é indistinguível de sorteio. */
      razao: string;
    }
  | {
      usar: false;
      motivo: MotivoDeNaoUsar;
      /** O que dizer a quem lê a peça. Vazio quando não há nada a declarar
       *  (papel que simplesmente não usa foto real — não é falta de nada). */
      explicacao: string;
      /** Quantos candidatos do papel certo existiam. É o número que transforma
       *  "não usou" em "não usou, e olha o que havia". */
      candidatos: number;
    };

/**
 * As palavras de conteúdo do NOME de um arquivo.
 *
 * Tira a extensão e o prefixo de papel que `nomeDeEntrada` carimba na entrada
 * (`foto-produto-...`). Sem tirar, TODO arquivo de produto compartilharia as
 * palavras "foto" e "produto" com qualquer cena que as mencionasse, e o lastro
 * viraria ruído com cara de evidência.
 */
export function palavrasDoNome(nome: string): string[] {
  const semExtensao = (nome ?? "").replace(/\.[a-z0-9]{1,5}$/i, "");
  const semPrefixo = semExtensao.replace(
    /^(logo|manual-de-marca|foto-produto|foto-equipe|foto-local|captura-de-tela|referencia|material)-/i,
    "",
  );
  // `IMG_2831` e `DSC00412` não são assunto — são o que a câmera escreveu. Um
  // nome assim devolve lista vazia, e lista vazia é lastro ZERO, que é a
  // resposta certa: o cliente não disse nada sobre aquele arquivo.
  return assinaturaDaCena(semPrefixo.replace(/[_-]/g, " "))
    .filter((p) => !/^(img|dsc|foto|imagem|image|photo|pic|whatsapp|screenshot|captura)$/.test(p))
    .filter((p) => !/^\d+$/.test(p));
}

/** Quantas palavras de conteúdo o nome do arquivo tem em comum com a cena.
 *  Contagem, não julgamento — e a contagem é o que pode ser conferida. */
export function lastroDeAssunto(nomeDoArquivo: string, cena: string): number {
  const doNome = new Set(palavrasDoNome(nomeDoArquivo));
  if (doNome.size === 0) return 0;
  const daCena = new Set(assinaturaDaCena(cena));
  let comuns = 0;
  for (const p of doNome) if (daCena.has(p)) comuns++;
  return comuns;
}

export interface PedidoDeEscolha {
  /** O id do papel em `FUNCOES`. `null` = a tela não declarou (ou é um post
   *  avulso, que não tem storyboard). */
  funcao: string | null | undefined;
  /** O texto DAQUELA tela — a cena, não a legenda do post inteiro. */
  cena: string;
  /** Tudo o que o cliente deu e a trava autorizou. */
  disponiveis: FotoCandidata[];
  /** O que já entrou em outra tela DESTA peça. Uma foto não se repete: imagem
   *  repetida é o defeito que o CEO apontou com o dedo. */
  jaUsadas?: ReadonlySet<string>;
}

/**
 * Decide se a foto real do cliente entra nesta tela — e qual.
 *
 * Nunca lança. Nunca escolhe sem razão. `usar: false` é uma resposta legítima e
 * frequente, e vem sempre com o motivo nomeado.
 */
export function escolherFotoReal(p: PedidoDeEscolha): EscolhaDeFoto {
  const jaUsadas = p.jaUsadas ?? new Set<string>();
  const id = (p.funcao ?? "").trim();
  const f = id ? FUNCOES[id] : undefined;

  if (!f) {
    return {
      usar: false,
      motivo: "papel_nao_declarado",
      // Sem declaração não há razão. Deduzir o papel das palavras da cena é
      // exatamente o que `lerTela` se recusa a fazer, e pela mesma razão.
      explicacao: "",
      candidatos: 0,
    };
  }

  if (f.materiaisReais.length === 0) {
    return {
      usar: false,
      motivo: "papel_nao_admite_foto_real",
      // NÃO é falta de material, e por isso não vira pedido ao cliente. Dizer
      // "falta foto" aqui mandaria o cliente procurar algo que não ajudaria.
      explicacao: "",
      candidatos: 0,
    };
  }

  // A ordem de `materiaisReais` é a preferência declarada pelo papel. A classe
  // mais forte que TEM candidato ganha — e o desempate só acontece dentro dela.
  for (const classe of f.materiaisReais) {
    const daClasse = p.disponiveis.filter((c) => c.papel === classe);
    if (daClasse.length === 0) continue;

    const livres = daClasse.filter((c) => !jaUsadas.has(c.mediaAssetId));
    if (livres.length === 0) {
      return {
        usar: false,
        motivo: "todas_ja_usadas",
        explicacao:
          `tela "${f.label}": o cliente tem ${daClasse.length} arquivo(s) de ${rotulo(classe)}, ` +
          `mas todos já entraram em outra tela desta peça. Repetir a mesma imagem reprova o carrossel inteiro — ` +
          `esta tela saiu com imagem gerada.`,
        candidatos: daClasse.length,
      };
    }

    // ── UM CANDIDATO SÓ: O PAPEL JÁ É A RAZÃO ──────────────────────────────
    if (livres.length === 1) {
      const foto = livres[0]!;
      return {
        usar: true,
        foto,
        razao:
          `papel "${f.label}" admite ${rotulo(classe)} e o cliente tem exatamente um: "${foto.nome}". ` +
          `Razão de papel, sem desempate necessário.`,
      };
    }

    // ── MAIS DE UM: SÓ ENTRA COM LASTRO DE ASSUNTO ─────────────────────────
    // Aqui mora a lição de 04/08/2026. Com três fotos de produto e nenhuma
    // razão, pegar a primeira é sorteio com cara de decisão.
    const pontuados = livres
      .map((c) => ({ c, lastro: lastroDeAssunto(c.nome, p.cena) }))
      .sort((a, b) => b.lastro - a.lastro);

    const melhor = pontuados[0]!;
    const segundo = pontuados[1]!;

    if (melhor.lastro === 0 || melhor.lastro === segundo.lastro) {
      return {
        usar: false,
        motivo: "empate_sem_razao",
        explicacao:
          `tela "${f.label}": o cliente tem ${livres.length} arquivos de ${rotulo(classe)} e ` +
          (melhor.lastro === 0
            ? `NENHUM deles diz, no nome, ter a ver com esta cena`
            : `${pontuados.filter((x) => x.lastro === melhor.lastro).length} empatam no assunto`) +
          `. Não escolhi por sobra — sobra não é evidência de correspondência. ` +
          `Esta tela saiu com imagem gerada; quem casa arquivo com tela é gente. Arquivos: ` +
          livres.map((c) => `"${c.nome}"`).join(", ") + ".",
        candidatos: livres.length,
      };
    }

    return {
      usar: true,
      foto: melhor.c,
      razao:
        `papel "${f.label}" admite ${rotulo(classe)}; entre ${livres.length} candidatos, ` +
        `"${melhor.c.nome}" foi o único com lastro de assunto nesta cena (${melhor.lastro} palavra(s) em comum).`,
    };
  }

  // O papel admite material real e o cliente não tem nenhum daquelas classes.
  // ESTE é o caso que vira pergunta ao cliente — e é o único que vira.
  return {
    usar: false,
    motivo: "sem_material_da_classe",
    explicacao:
      `tela "${f.label}": esta tela pede ${f.materiaisReais.map(rotulo).join(" ou ")} do cliente ` +
      `(${f.imagemPrecisa}) e não há nenhum arquivo desses na pasta dele. ` +
      `A imagem saiu GERADA, e a falta está declarada — nada foi inventado como se fosse material real.`,
    candidatos: 0,
  };
}

/**
 * O post AVULSO (feed, story) — que não tem storyboard e, portanto, não tem
 * papel declarado.
 *
 * ── POR QUE ESTA FUNÇÃO É MAIS ESTRITA, E NÃO MENOS ────────────────────────
 *
 * No carrossel existem DUAS razões: o papel da tela e o assunto. Aqui a
 * primeira não existe — um post avulso não declara que trabalho a imagem
 * cumpre. Deduzir o papel das palavras da legenda seria preencher por dedução,
 * que é justamente o que `lerTela` se recusa a fazer.
 *
 * Faltando uma razão, a que sobra tem de ser mais forte, não mais fraca. Então
 * aqui NÃO vale a regra do "candidato único" do carrossel: uma foto só, sem
 * nada que a ligue ao texto, entraria em qualquer post do cliente para sempre —
 * o interruptor global disfarçado de escolha.
 *
 * A régua: **exatamente uma** foto com lastro de assunto máximo e maior que
 * zero. Zero lastro, ou empate, gera por IA e declara o que havia.
 */
export function escolherFotoParaPostAvulso(p: {
  /** A legenda do post — o conteúdo já auditado. */
  legenda: string;
  disponiveis: FotoCandidata[];
}): EscolhaDeFoto {
  const livres = p.disponiveis;
  if (livres.length === 0) {
    return { usar: false, motivo: "sem_material_da_classe", explicacao: "", candidatos: 0 };
  }

  const pontuados = livres
    .map((c) => ({ c, lastro: lastroDeAssunto(c.nome, p.legenda) }))
    .sort((a, b) => b.lastro - a.lastro);

  const melhor = pontuados[0]!;
  const empatados = pontuados.filter((x) => x.lastro === melhor.lastro).length;

  if (melhor.lastro === 0 || empatados > 1) {
    return {
      usar: false,
      motivo: "empate_sem_razao",
      explicacao:
        `este post tem ${livres.length} foto(s) real(is) do cliente disponível(is) e NENHUMA entrou: ` +
        (melhor.lastro === 0
          ? `nada no nome dos arquivos os liga ao texto deste post`
          : `${empatados} arquivos empatam no assunto`) +
        `. Post avulso não declara o papel da imagem, então a única razão possível é o assunto — e sem ela ` +
        `a escolha seria por sobra. A imagem saiu gerada. Arquivos: ` +
        livres.map((c) => `"${c.nome}"`).join(", ") + ".",
      candidatos: livres.length,
    };
  }

  return {
    usar: true,
    foto: melhor.c,
    razao:
      `post avulso: entre ${livres.length} foto(s) do cliente, "${melhor.c.nome}" foi a única com lastro de ` +
      `assunto na legenda (${melhor.lastro} palavra(s) em comum).`,
  };
}

/** O nome da classe em português, para o registro que o CEO lê. */
export function rotulo(m: MaterialReal): string {
  const nomes: Record<MaterialReal, string> = {
    foto_produto: "foto de produto",
    foto_equipe: "foto de equipe",
    foto_local: "foto do local",
    captura_de_tela: "captura de tela",
  };
  return nomes[m];
}
