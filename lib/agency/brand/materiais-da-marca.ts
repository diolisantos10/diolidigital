// materiais-da-marca.ts — O QUE O BRAND HUB MOSTRA, E POR QUANTO TEMPO.
//
// ── O DEFEITO QUE ISTO FECHA (15/08/2026) ───────────────────────────────────
//
// O portal tinha envio de material desde 02/08 e classificação por caixa desde
// 10/08. O que ele NUNCA teve foi a lista do que já entrou: `EnvioDeMaterial`
// mostra os enviados a partir do estado do React, e **recarregar a página apaga
// a lista**. O arquivo continuava no disco; a prova de que ele chegou, não.
//
// Para quem está do outro lado isso é indistinguível de perder o arquivo. O
// cliente sobe o brand book, sai, volta, não vê nada — e manda de novo, ou
// desiste e cobra a equipe. É a mesma classe do "0 gravado devolvendo 200
// verde": a tela afirmando um estado que não é o do banco.
//
// ── DERIVAR, NÃO GUARDAR DE NOVO ────────────────────────────────────────────
//
// Nada aqui cria armazenamento novo. A lista sai de `DriveMaterial` (o papel de
// cada arquivo) cruzada com `MediaAsset` (os bytes) e com `BrainArtifact` (o
// estado da análise do brand book) — as três tabelas que já existem. Um quarto
// lugar para a mesma verdade seria a sexta porta que `docs/branding-na-ficha-
// do-cliente.md` mandou fechar.
//
// ── E A VERSÃO É DERIVADA DA ORDEM, NÃO DIGITADA ────────────────────────────
//
// "Substituir o brand book preserva o histórico" não exige coluna de versão:
// exige NÃO APAGAR. Cada envio é uma linha nova (`@@unique([clientId,
// mediaAssetId])` — arquivo novo, `MediaAsset` novo, linha nova), e a versão é a
// posição dele na ordem de chegada dentro da mesma categoria. Guardar o número
// numa coluna criaria a chance de ele divergir da ordem real — e aí a tela
// mentiria sobre qual é o vigente.

import { PAPEIS, papelValido, type Papel } from "@/lib/integrations/google/escolha-de-material";

/** O departamento sob o qual a extração do brand book é guardada em
 *  `BrainArtifact`. É a memória que já existe para "o que a casa concluiu sobre
 *  este cliente" — não uma tabela nova. */
export const DEPARTAMENTO_DO_BRAND_BOOK = "brand-book-extraido";

/**
 * Os estados visíveis de um material. Lista fechada, e a ordem é a do ciclo.
 *
 * Os cinco primeiros são os que o CEO pediu. `a_classificar` existe porque o
 * material vindo do seletor do Google pode chegar sem papel declarado, e um
 * arquivo nesse estado precisa aparecer dizendo o que falta — sumir seria o
 * silêncio de novo.
 */
export const ESTADOS = [
  "recebido",
  "analisando",
  "aguardando_revisao",
  "aplicado",
  "erro",
  "a_classificar",
] as const;

export type EstadoDoMaterial = (typeof ESTADOS)[number];

/** O que cada estado diz para quem não é da área. Nunca nome de campo. */
export const ROTULO_DO_ESTADO: Record<EstadoDoMaterial, string> = {
  recebido: "Recebido",
  analisando: "Analisando",
  aguardando_revisao: "Aguardando revisão",
  aplicado: "Aplicado na sua ficha",
  erro: "Deu problema",
  a_classificar: "Falta dizer o que é",
};

/** O tom da etiqueta na tela. Só três, para o cliente não decorar uma legenda. */
export const TOM_DO_ESTADO: Record<EstadoDoMaterial, "green" | "amber" | "cyan"> = {
  recebido: "cyan",
  analisando: "cyan",
  aguardando_revisao: "amber",
  aplicado: "green",
  erro: "amber",
  a_classificar: "amber",
};

/** Uma linha de `DriveMaterial`, pelo mínimo que esta leitura precisa. */
export interface LinhaDeMaterial {
  id: string;
  nome: string;
  mimeType: string;
  tamanhoBytes: number;
  papel: string | null;
  papelConfirmadoEm: Date | string | null;
  mediaAssetId: string | null;
  erro: string | null;
  escolhidoEm: Date | string;
}

/** O estado da análise de UM brand book, como está guardado em `BrainArtifact`. */
export interface AnaliseGuardada {
  /** `canvasId` do artefato = o id do `DriveMaterial` que ele analisa. */
  materialId: string;
  status: string;
  /** O recado de erro, quando houve. Em português. */
  erro?: string | null;
  /** O que a leitura NÃO conseguiu abrir de dentro do arquivo. Vazio = leu
   *  tudo. Isto NUNCA é opcional na prática: é o que impede "aguardando
   *  revisão" de ser lido como ✓ sobre um arquivo aberto pela metade. */
  naoLido?: string[] | null;
  atualizadoEm: Date | string;
}

export interface MaterialNaTela {
  id: string;
  nome: string;
  /** O papel declarado. Null só quando ninguém disse ainda. */
  papel: Papel | null;
  /** A categoria em português — o que o cliente leu na caixa onde soltou. */
  categoria: string;
  enviadoEm: string;
  tamanhoBytes: number;
  /** A posição na ordem de chegada dentro da categoria. 1 é o mais antigo. */
  versao: number;
  /** `true` só para o item mais recente da categoria. */
  vigente: boolean;
  estado: EstadoDoMaterial;
  /** O que o estado quer dizer, em uma frase, quando ele precisa de explicação. */
  detalhe: string | null;
  /** Onde baixar. Null enquanto os bytes não estiverem no disco da casa. */
  url: string | null;
}

/**
 * O prazo da análise. Passou disto sem terminar, o estado vira ERRO na leitura.
 *
 * Regra da casa (`material-do-drive.ts`, 15/08): **todo "falhou" tem prazo.**
 * Sem isto, um processo derrubado no meio deixaria o brand book do cliente
 * girando em "Analisando" para sempre — e "para sempre" é o estado que ninguém
 * investiga porque parece que está andando.
 */
export const PRAZO_DA_ANALISE_MS = 10 * 60_000;

export const RECADO_DA_ANALISE_TRAVADA =
  "A leitura do documento não terminou. Seu arquivo está guardado e a equipe vai tentar de novo — não precisa reenviar.";

/**
 * O que o CLIENTE lê quando a leitura automática falha.
 *
 * Fixo de propósito: o motivo real ("chave sem crédito", "timeout", "HTTP 502")
 * é recado de equipe. Repassá-lo ao dono do negócio manda ele resolver o que
 * não é dele e sugere que o arquivo se perdeu — as duas coisas erradas.
 *
 * A primeira frase é a que importa e vem primeiro: **o arquivo está guardado.**
 */
export const RECADO_DA_LEITURA_QUE_FALHOU =
  "Seu arquivo está guardado com a equipe. A leitura automática não funcionou desta vez — alguém da equipe vai olhar. Você não precisa reenviar.";

function emIso(v: Date | string): string {
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString();
}

/**
 * Monta a lista que a tela mostra.
 *
 * PURA: sem banco e sem rede, para que as duas metades que importam sejam
 * prováveis sem subir nada — que o brand book substituído continua na lista, e
 * que a análise travada vira erro em vez de "analisando" eterno.
 */
export function montarMateriaisDaMarca(
  linhas: LinhaDeMaterial[],
  analises: AnaliseGuardada[] = [],
  agora: Date = new Date(),
): MaterialNaTela[] {
  const porMaterial = new Map(analises.map((a) => [a.materialId, a]));

  // Ordem de chegada, do mais antigo para o mais novo: é ela que define a
  // versão. A tela inverte depois — quem chega vê o vigente primeiro.
  const cronologica = [...linhas].sort(
    (a, b) => new Date(a.escolhidoEm).getTime() - new Date(b.escolhidoEm).getTime(),
  );

  const contador = new Map<string, number>();
  const total = new Map<string, number>();
  for (const l of cronologica) {
    const chave = papelValido(l.papel) ?? "sem_papel";
    total.set(chave, (total.get(chave) ?? 0) + 1);
  }

  const saida: MaterialNaTela[] = [];
  for (const l of cronologica) {
    const papel = papelValido(l.papel);
    const chave = papel ?? "sem_papel";
    const versao = (contador.get(chave) ?? 0) + 1;
    contador.set(chave, versao);

    const { estado, detalhe } = estadoDoMaterial(l, porMaterial.get(l.id), agora);

    saida.push({
      id: l.id,
      nome: l.nome,
      papel,
      categoria: papel ? PAPEIS[papel].rotulo : "Ainda não classificado",
      enviadoEm: emIso(l.escolhidoEm),
      tamanhoBytes: l.tamanhoBytes,
      versao,
      vigente: versao === (total.get(chave) ?? 0),
      estado,
      detalhe,
      // O endereço dos bytes é o que já existe. Null enquanto não houver bytes:
      // link que abre em 404 é pior que link ausente, porque o cliente conclui
      // que o arquivo dele sumiu.
      url: l.mediaAssetId ? `/api/media/${l.mediaAssetId}` : null,
    });
  }

  // Mais novo primeiro. A versão vigente do brand book é a primeira coisa que
  // aparece; o histórico fica embaixo, sem sumir.
  return saida.reverse();
}

function estadoDoMaterial(
  l: LinhaDeMaterial,
  analise: AnaliseGuardada | undefined,
  agora: Date,
): { estado: EstadoDoMaterial; detalhe: string | null } {
  // Erro de importação vem primeiro: ele diz que os bytes NÃO chegaram, e
  // nenhum estado posterior faz sentido sem eles.
  if (!l.mediaAssetId && l.erro) return { estado: "erro", detalhe: l.erro };

  const papel = papelValido(l.papel);
  if (!papel || !l.papelConfirmadoEm) {
    return {
      estado: "a_classificar",
      detalhe: "A equipe ainda não sabe o que é este arquivo — ele não entra em peça nenhuma até alguém dizer.",
    };
  }

  if (!l.mediaAssetId) {
    return {
      estado: "erro",
      detalhe: "Você já disse o que é, mas o arquivo ainda não chegou até nós — a falha é nossa, estamos tentando de novo.",
    };
  }

  if (papel !== "manual_de_marca" || !analise) return { estado: "recebido", detalhe: null };

  switch (analise.status) {
    case "analisando": {
      // O PRAZO. Ver `PRAZO_DA_ANALISE_MS`.
      const parada = agora.getTime() - new Date(analise.atualizadoEm).getTime() > PRAZO_DA_ANALISE_MS;
      return parada
        ? { estado: "erro", detalhe: RECADO_DA_ANALISE_TRAVADA }
        : { estado: "analisando", detalhe: "Estamos lendo o documento para propor o que dá para preencher da sua ficha." };
    }
    case "aguardando_revisao": {
      // ── ARQUIVO ABERTO PELA METADE NÃO É DADO POR LIDO (15/08/2026) ──────
      // Ordem do CEO: o upload tem de ler qualquer arquivo na íntegra. Enquanto
      // não lê, a tela diz o que ficou de fora — em vez de um "pronto" que
      // esconde o degrau.
      const faltou = (analise.naoLido ?? []).filter(Boolean);
      const base = "Lemos o documento e separamos sugestões. Elas só entram na sua ficha depois que alguém conferir — nada foi sobrescrito.";
      return {
        estado: "aguardando_revisao",
        detalhe: faltou.length > 0 ? `${base} O que ainda não conseguimos tirar de dentro dele: ${faltou.join("; ")}.` : base,
      };
    }
    case "aplicado":
      return {
        estado: "aplicado",
        detalhe: "O que este documento trouxe já está na sua ficha de marca, com a origem registrada.",
      };
    case "erro":
      // ── O RECADO DO CLIENTE NÃO É O RECADO DA EQUIPE (15/08/2026) ────────
      //
      // Achado apertando o botão: com a chave de IA ausente, o motivo gravado é
      // "Nenhuma chave Claude conectada. Configure em Integrações." — e isso ia
      // parar na tela do CLIENTE, ao lado do brand book dele.
      //
      // São dois defeitos numa frase só. Ela manda o dono do negócio fazer uma
      // coisa que ele não tem como fazer (Integrações é tela da agência), e ela
      // deixa ele achar que o ARQUIVO deu problema — quando o arquivo está
      // guardado e inteiro; o que falhou foi a leitura automática.
      //
      // O motivo técnico não se perde: continua no `canvasJson` do artefato,
      // que é onde a equipe olha. O que muda é quem lê o quê.
      return { estado: "erro", detalhe: RECADO_DA_LEITURA_QUE_FALHOU };
    default:
      return { estado: "recebido", detalhe: null };
  }
}

// ── O QUE O BRAND BOOK NÃO FECHA, DITO NA TELA DO CLIENTE ───────────────────
//
// `proposta-do-brand-book.ts` já mede isto e diz por extenso: o PDF alcança
// **3 dos 9 campos** da ficha, e nenhum dos três tira a marca do dia zero. Essa
// frase existia só na tela da AGÊNCIA.
//
// Ela precisa existir aqui também, e antes do envio — não depois. Uma tela que
// deixa o cliente concluir "mandei o brand book, resolvi a marca" produz o
// mesmo desfecho que o CEO já viveu: aplicar e continuar vendo a ficha parada,
// sem entender por quê. Dizer antes custa uma frase; desfazer a expectativa
// custa a confiança na tela inteira.

export const O_QUE_O_BRAND_BOOK_ALCANCA =
  "O brand book adianta a parte visual: cores, tipografia, público e posicionamento — 3 dos 9 pontos da sua ficha de marca.";

export const O_QUE_O_BRAND_BOOK_NAO_FECHA =
  "Os outros 6 não existem em brand book nenhum, porque são decisão sua e não descrição da marca: como vocês falam e como nunca falariam, as palavras que não se usa, o que a marca nunca faz, o que não se promete e quem aprova. Esses continuam vindo da entrevista.";
