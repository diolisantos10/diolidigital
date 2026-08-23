// ─── ANEXO NÃO É RESPOSTA ─────────────────────────────────────────────────────
//
// POR QUE ESTE ARQUIVO EXISTE — 16/08/2026, piloto ao vivo do CEO em /briefing.
//
// O cliente anexou dois PDFs no meio da conversa. A tela escreve um recado no
// lugar dele ("Enviei meu briefing: X") só para o anexo aparecer no fio, e esse
// recado seguia pelo MESMO caminho de uma frase digitada: virava a resposta da
// pergunta que estava aberta naquele instante. O painel de escopo, ao vivo, na
// frente do CEO, exibiu:
//
//     Objetivos:  Enviei meu briefing: CityJobs_Resumo_Executivo_v1.pdf, ...
//     Orçamento:  Enviei meu briefing: CityJobs_Brand_Book_v1.pdf
//
// O campo Orçamento é literal: `budget_range.parse` guarda a frase INTEIRA
// (`{ budgetRange: answer.trim() }`), então o nome do PDF ocupou o campo sozinho
// e apagou a pergunta da fila — o SDR nunca mais perguntou o orçamento, e o que
// desce para o dossiê e para a proposta é um nome de arquivo.
//
// A regra que nasceu daí é de uma linha: **anexar arquivo não responde pergunta
// nenhuma.** Anexo é anexo; resposta é resposta. O conteúdo do documento entra
// no escopo pelo caminho certo — o texto extraído vai para o SDR ler (`sdrText`
// em `runTurn`), que devolve um patch de escopo. O recado visível é moldura, não
// conteúdo, e não pode encostar em campo nenhum.
//
// Trava, não aviso: o reconhecimento mora AQUI e é aplicado dentro dos motores
// (`processProspectMessage`, `processClientMessage`), não em quem chama. Quem
// escrever a próxima tela de upload herda a proteção sem saber que ela existe —
// que é a única forma de proteção que sobrevive a uma tela nova.

/** O texto que o cliente vê no fio quando anexa um arquivo. */
export function montarAvisoDeAnexo(fileName: string): string {
  // Sem `**` de propósito: este recado é lido pelo painel de escopo além do
  // balão de chat, e lá não existe conversor de markdown — o asterisco chegava
  // cru na tela do cliente. Ver `semMarcacao` em `texto-sem-marcacao.ts`.
  return `📎 Enviei meu briefing: ${fileName}`;
}

// Aceita as duas formas do recado: a atual e a de antes de 16/08/2026, que
// trazia o nome do arquivo entre `**`. Conversa já gravada em banco continua
// sendo reconhecida — senão o defeito voltaria a aparecer em todo transcript
// antigo que for reprocessado.
const AVISO_DE_ANEXO = /^\s*📎\s*Enviei meu briefing:/i;

/**
 * Diz se a mensagem é o recado automático de anexo — e portanto NÃO é uma
 * resposta do cliente a coisa alguma.
 */
export function ehAvisoDeAnexo(text: string): boolean {
  return AVISO_DE_ANEXO.test(text);
}

// ─── OFERECER DOCUMENTO TAMBÉM NÃO É RESPOSTA ─────────────────────────────────
//
// 23/08/2026, primeira rodada do cliente falso. À pergunta "quem é o seu
// público-alvo?" o cliente respondeu:
//
//     "Posso te mandar nosso briefing em PDF, ajuda?"
//
// e a casa gravou essa frase INTEIRA no campo `targetAudience` do pedido. O
// público-alvo do cliente, no pedido que desce para a proposta, passou a ser uma
// pergunta que ele fez.
//
// É o mesmo defeito de 16/08 entrando pela porta de antes: lá o recado do anexo
// virava resposta, aqui é a OFERTA do anexo. O arquivo nem chegou e o campo já
// estava envenenado — e campo envenenado não avisa ninguém: ele desce calado
// para o dossiê, para a proposta e para a boca do vendedor.
//
// Quem oferece material está falando SOBRE a conversa, não respondendo a
// pergunta da vez. A pergunta continua aberta e o cliente merece ouvir "pode
// mandar" antes de ouvir a pergunta de novo.
//
// ⚠️ O RECONHECIMENTO É ESTREITO DE PROPÓSITO. Exige as duas coisas juntas — um
// verbo de mandar E uma coisa que se manda. Um guarda largo aqui custaria caro
// na direção contrária: ele engoliria respostas de verdade ("temos material
// visual pronto") e a casa repetiria a pergunta para sempre. Barrar resposta boa
// é tão caro quanto gravar frase que não é resposta.
const VERBO_DE_OFERTA =
  // O verbo entra no infinitivo E no subjuntivo: ninguém escreve "quer que eu
  // MANDAR o briefing" — escreve "quer que eu MANDE". Só o infinitivo deixava
  // metade das ofertas reais passarem direto para dentro do campo aberto.
  /\b(posso|poderia|quer\s+que\s+eu|quiser\s+eu|d[áa]\s+pra\s+eu|consigo|vou)\b[^.?!]{0,24}\b(mand(?:ar|e)|envi(?:ar|e)|pass(?:ar|e)|compartilh(?:ar|e)|anex(?:ar|e)|sub(?:ir|a)|encaminh(?:ar|e))\b/i;

const COISA_QUE_SE_MANDA =
  /\b(pdf|briefing|brief|documento|doc|arquivo|apresenta[çc][ãa]o|deck|planilha|portf[óo]lio|manual\s+de\s+marca|brand\s?book|contrato|proposta)\b/i;

/**
 * Diz se a mensagem é uma OFERTA de material — e portanto não responde nada.
 *
 * Separada de `ehAvisoDeAnexo` porque as duas pedem respostas diferentes da
 * casa: à oferta se responde "pode mandar"; ao arquivo que chegou se responde
 * "recebi". Dizer "recebi" para quem só ofereceu é mentir sobre um arquivo que
 * não existe.
 */
export function ehOfertaDeDocumento(text: string): boolean {
  if (ehAvisoDeAnexo(text)) return false;
  return VERBO_DE_OFERTA.test(text) && COISA_QUE_SE_MANDA.test(text);
}

/** A mensagem não responde pergunta nenhuma — anexo que chegou ou oferta. */
export function naoEResposta(text: string): boolean {
  return ehAvisoDeAnexo(text) || ehOfertaDeDocumento(text);
}

// ─── E A CASA TEM DE ACUSAR O RECEBIMENTO ────────────────────────────────────
//
// Na mesma rodada de 23/08, depois de o cliente ANEXAR o briefing, a casa
// repetiu a pergunta anterior palavra por palavra — sem uma sílaba sobre o
// arquivo que tinha acabado de chegar:
//
//     cliente: 📎 Enviei meu briefing: briefing-cantina-da-prova.pdf
//     a casa:  Você imagina esse trabalho como um contrato mensal (…)?   ← idêntica
//
// Proteger o escopo do recado de anexo (a trava de 16/08) resolveu METADE do
// problema: o campo parou de ser envenenado, mas a conversa passou a ignorar o
// arquivo. Para quem está do outro lado, mandar um documento e receber de volta
// a mesma frase é a prova de que ninguém está lendo — e é assim que se perde um
// lead que já tinha feito o trabalho de reunir o material.
//
// O texto mora AQUI, e não em cada motor, porque as duas salas (prospect e
// briefing V2) têm de dizer a mesma coisa. Duas cabeças respondendo à mesma
// pergunta discordam — lição que esta casa já pagou três vezes no mesmo dia.

/** O nome do arquivo dentro do recado automático. `null` quando não dá para ler. */
export function nomeDoArquivoNoAviso(text: string): string | null {
  const m = text.match(/^\s*📎\s*Enviei meu briefing:\s*\*{0,2}(.+?)\*{0,2}\s*$/i);
  const nome = m?.[1]?.trim();
  return nome ? nome : null;
}

/**
 * O que a casa fala ANTES de retomar a pergunta, quando a mensagem não era
 * resposta. `null` quando a mensagem é resposta de verdade — aí não há nada a
 * acusar e a pergunta segue normal.
 */
export function recadoDeRecebimento(text: string, nomesDeArquivo?: string[]): string | null {
  if (ehAvisoDeAnexo(text)) {
    const nome = nomesDeArquivo?.[0] ?? nomeDoArquivoNoAviso(text);
    return nome
      ? `Recebi o **${nome}** — obrigado. Vou considerar o que está nele no seu escopo.`
      : "Recebi o arquivo — obrigado. Vou considerar o que está nele no seu escopo.";
  }
  if (ehOfertaDeDocumento(text)) {
    return "Pode mandar sim, ajuda muito — é só usar o clipe (📎) aqui embaixo para anexar.";
  }
  return null;
}

/**
 * A ponte entre o recado e a pergunta que ficou aberta.
 *
 * Existe para que a pergunta repetida NÃO chegue como repetição: quem lê
 * entende que a casa ouviu, e só então volta ao ponto. É o que separa "ninguém
 * me escutou" de "ok, ele anotou e continuou".
 */
export const RETOMADA_DA_PERGUNTA = "Voltando ao que eu tinha te perguntado:";
