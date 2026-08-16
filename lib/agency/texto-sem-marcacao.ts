// ─── NENHUM ASTERISCO CHEGA AO CLIENTE ────────────────────────────────────────
//
// POR QUE ESTE ARQUIVO EXISTE — 16/08/2026, piloto ao vivo do CEO em /briefing.
//
// O balão de chat tem conversor de markdown (`MsgText`): ele transforma `**x**`
// em negrito. O painel de escopo à direita NÃO tem — ele imprime o valor do
// campo como string pura. Resultado no print do CEO, na tela de conversão da
// agência: `Orçamento: Enviei meu briefing: **CityJobs_Brand_Book_v1.pdf**`.
//
// O asterisco não vinha só do recado de anexo. Todo campo de escopo pode chegar
// com marcação: quem preenche é o SDR (um modelo), e modelo escreve markdown por
// hábito. Consertar só a origem do dia deixaria a próxima em pé.
//
// Por isso a limpeza mora na BORDA de renderização, não na origem: qualquer
// valor que passe pelo painel sai sem marcação, venha de onde vier.

/**
 * Devolve o texto sem a marcação de markdown que o cliente nunca pode ver.
 * Remove a marcação preservando a palavra: `**Plano Pro**` vira `Plano Pro`.
 */
export function semMarcacao(texto: string): string {
  return texto
    .replace(/\*\*([^*]+)\*\*/g, "$1")   // negrito
    .replace(/(^|\s)\*([^*\n]+)\*/g, "$1$2") // itálico
    .replace(/(^|\s)__([^_\n]+)__/g, "$1$2") // negrito alternativo
    .replace(/`([^`\n]+)`/g, "$1")        // código
    // Sobras: asterisco solto que não fechou par não pode ficar na tela.
    .replace(/\*/g, "")
    .trim();
}
