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
