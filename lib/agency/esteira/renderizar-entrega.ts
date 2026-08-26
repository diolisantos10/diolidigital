// COMO A ENTREGA VIRA TEXTO — uma fonte só.
//
// ── O defeito que este arquivo existe para não deixar voltar ────────────────
//
// A mesma função existia em TRÊS cópias: `run-execution.ts:77`
// (`deliverableMarkdown`), `refacao.ts:482` e `pacote-travado.ts:258`
// (`renderizar`). As duas últimas se declaravam, em comentário, "mesmo formato
// de texto que o motor usa" — e **não eram**: faltava a linha
// `["cenas", "Cenas"]` nas duas.
//
// A corrente inteira, porque nenhuma peça sozinha estava errada:
//
//   1. o cliente pede ajuste num CARROSSEL de 5 telas;
//   2. `refacao.ts` refaz e renderiza SEM o campo `Cenas`;
//   3. `extrairPecas` (`publicacao.ts`) lê o texto e acha `cenas = []`;
//   4. `publicacao.ts:1046` rebaixa: "carrossel sem telas suficientes não é
//      carrossel — vira feed";
//   5. o cliente comprou carrossel de 5 telas e recebe UMA imagem.
//
// Ninguém fica vermelho em passo nenhum. Cada peça tem o seu teste e todos
// passam; a corrente é que arrebenta, na junta — o mesmo padrão da ficha de
// marca, que na mesma noite fechou a publicação inteira por duas cópias
// divergentes do mesmo `envelopar`.
//
// **Por isso a lista mora aqui, e só aqui.** Comentário dizendo "igual ao
// motor" não é mecanismo; import é.

/**
 * Os campos do item, na ordem em que o cliente lê, com o rótulo que o leitor
 * de peças procura.
 *
 * `cenas` é o campo LOAD-BEARING desta lista: é ele que faz um carrossel
 * continuar carrossel depois de refeito. Sair daqui não é perder um detalhe de
 * formatação — é rebaixar a peça que o cliente comprou.
 */
export const CAMPOS_DA_ENTREGA = [
  ["format", "Formato"],
  // ⚠️ `pillar` É LOAD-BEARING TAMBÉM, e por um motivo diferente de `cenas`:
  // ele não desce a qualidade da peça, ele DESLIGA UM PORTÃO.
  //
  // `extrairPecas` procura "- Pilar: ..." desde 07/08/2026, quando o bloqueio
  // de pilar nasceu — três peças tinham saído com salário inventado no pixel.
  // Nenhum emissor escrevia a linha. Resultado: `post.pillar` era SEMPRE null
  // na esteira automática, `conferirPilar(null)` devolvia LIBERADO, e o
  // bloqueio nunca disparou fora do Planner. Portão que existe, tem teste e
  // aprova por omissão é pior que portão nenhum.
  //
  // ── POR QUE ESTA LINHA QUASE SE PERDEU NO MERGE (15/08/2026) ─────────────
  // Dois agentes consertaram o mesmo arquivo na mesma noite, sem se ver: um
  // acrescentou `["pillar","Pilar"]` à lista local de `run-execution.ts`; o
  // outro apagou a lista local inteira e trouxe esta fonte única. O merge
  // automático escolheria a fonte única — a mudança estruturalmente certa — e
  // levaria o conserto do pilar junto, em silêncio, sem conflito visível e com
  // a suíte verde. É a MESMA junta que este arquivo existe para proteger,
  // desta vez entre dois consertos em vez de entre duas cópias.
  ["pillar", "Pilar"],
  ["caption", "Legenda"],
  ["cenas", "Cenas"],
  ["visual", "Visual"],
  ["direction", "Direção"],
  ["palette", "Paleta"],
  ["cta", "CTA"],
  ["audience", "Público"],
  ["note", "Obs"],
  // ── OS QUATRO CAMPOS DA BASE DE MARCA (24/08/2026) ───────────────────────
  // Entraram com o especialista de branding. São aditivos: item que não os
  // traz renderiza exatamente como antes.
  //
  // `estado` e `falta` são LOAD-BEARING pelo mesmo motivo que `cenas`: é por
  // eles que `colher-marca.ts` lê, do texto entregue, o que a marca DECIDIU e
  // o que continua em aberto. Sem a linha "Estado", uma lacuna declarada pelo
  // especialista chegaria ao `BrandBrain` indistinguível de uma decisão — e
  // ausência de informação viraria informação, que é a regra mais antiga da
  // casa sendo quebrada na junta entre dois arquivos certos.
  ["campo", "Campo"],
  ["estado", "Estado"],
  ["conteudo", "Conteúdo"],
  ["fonte", "Fonte"],
  ["falta", "Falta"],
] as const;

/**
 * O JSON que os caminhos de CONSERTO pedem ao modelo.
 *
 * Mora ao lado da lista de campos de propósito: consertar o renderizador sem
 * consertar o pedido não resolveria nada. Os dois prompts de refação pediam um
 * esquema **sem `cenas`** — então, mesmo com o renderizador certo, o modelo
 * devolvia o item sem telas e o carrossel virava feed do mesmo jeito.
 *
 * Um lugar para os dois lados da mesma conversa: o que se pede e o que se lê.
 */
export const ESQUEMA_DA_ENTREGA =
  'Responda JSON: {"title":"...","summary":"1 frase","items":[{"headline":"...","note":"...",' +
  '"format":"feed|carrossel|story|reel","pillar":"o pilar editorial da peça",' +
  '"caption":"...","cenas":"1) [papel] tela · 2) [papel] tela · ...","visual":"...",' +
  '"direction":"...","audience":"...","cta":"..."}]}' +
  ' — "format" e "pillar" são OBRIGATÓRIOS em TODO item.';

/**
 * ⚠️ `format` E `pillar` NO ESQUEMA — O MESMO DEFEITO DE `cenas`, DE NOVO
 * (26/08/2026, medido em produção).
 *
 * A lista de campos acima diz, em dois comentários longos, que os dois são
 * LOAD-BEARING: `format` decide como a arte é gerada e onde a peça é
 * publicada; `pillar` é o que DESLIGA o bloqueio de conteúdo quando falta.
 * `contratoDasLegendas` cobra os dois, item por item, e reprova quem não os
 * traz.
 *
 * E o esquema que os caminhos de conserto pediam ao modelo **não citava
 * nenhum dos dois.** A casa exigia na saída o que nunca pediu na entrada.
 *
 * Medido na refação: o cliente pedia ajuste, o modelo devolvia os itens sem
 * `format` e sem `pillar`, o contrato barrava (certo), e o pedido dele morria
 * em `fora_do_contrato`. **O portão estava certo; quem não cumpria o contrato
 * era o gerador.** Afrouxar o portão teria trocado um pedido barrado por uma
 * peça sem pilar dentro do calendário do cliente — que é o defeito de 07/08
 * (salário inventado no pixel) de volta.
 *
 * É literalmente a lição que o cabeçalho deste arquivo já escrevia sobre
 * `cenas`, na mesma constante, e que foi reescrita em vez de lida: **um lugar
 * para os dois lados da mesma conversa — o que se pede e o que se lê.**
 */

/**
 * Quantos itens um markdown de entrega tem — a leitura INVERSA de
 * `renderizarEntrega`, e por isso mora ao lado dela.
 *
 * Serve a um pedido só, e ele é de dinheiro: a refação precisa dizer ao modelo
 * quantos itens devolver. O caso comum medido é o cliente pedir "muda só o
 * gancho do primeiro" e o modelo devolver UM item — os outros somem, e o
 * cliente recebe um terço do que comprou. O contrato de saída pega isso e
 * barra (certo), mas barrar é o segundo melhor desfecho: o melhor é o modelo
 * saber o número antes de escrever.
 *
 * Conta o cabeçalho que `renderizarEntrega` emite (`**1. …**`) — nunca uma
 * heurística de prosa. Texto sem nenhum cabeçalho devolve 0, e quem chama
 * decide o que fazer com "não sei", que nunca é um palpite de quantidade.
 */
export function quantosItens(markdown: string | null | undefined): number {
  if (!markdown) return 0;
  return (markdown.match(/^\*\*\d+\.\s/gm) ?? []).length;
}

/**
 * O JSON do especialista vira o markdown que o cliente lê.
 *
 * O MESMO texto nos três caminhos (produção, refação a pedido do cliente e
 * destravamento do pacote reprovado): o cliente não pode receber duas
 * aparências diferentes da mesma peça só porque uma foi refeita — e, mais
 * grave, a peça não pode mudar de FORMATO por causa de qual caminho a
 * reescreveu.
 */
export function renderizarEntrega(data: Record<string, unknown>): string {
  const items = Array.isArray(data.items) ? data.items : [];
  const linhas: string[] = [];
  if (typeof data.summary === "string") linhas.push(data.summary, "");
  items.forEach((raw, i) => {
    const it = raw as Record<string, unknown>;
    const head = (it.headline ?? it.angle ?? it.direction ?? `Item ${i + 1}`) as string;
    linhas.push(`**${i + 1}. ${head}**`);
    for (const [k, label] of CAMPOS_DA_ENTREGA) {
      if (typeof it[k] === "string" && (it[k] as string).trim()) linhas.push(`- ${label}: ${it[k]}`);
    }
    linhas.push("");
  });
  return linhas.join("\n").trim();
}
