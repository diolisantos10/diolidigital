// A CONFIRMAÇÃO DO BRIEFING NA CAIXA DA EQUIPE — o gravador.
//
// ── Por que ele saiu de dentro do `route.ts` (16/08/2026, terceira passada) ──
//
// O portão que cobria esta frente mockava o prisma inteiro e provava só o
// LEITOR (`GET /api/messages` consulta por `clientRequestId`). `qualidade`
// mediu a consequência: **trocar a âncora daqui de `clientRequestId` para
// `clientId` deixava o teste verde e sumia com a mensagem da caixa.**
//
// Para o portão alcançar o GRAVADOR ele precisa importá-lo, e arquivo de rota do
// App Router não pode exportar função que não seja verbo HTTP. Por isso a função
// mora aqui. O portão é
// `__tests__/comercial/a-confirmacao-chega-na-caixa-da-equipe.test.ts`.

/**
 * A confirmação que NÃO depende de e-mail: uma mensagem da equipe na conversa
 * do portal daquela solicitação, dizendo o que chegou.
 *
 * Best-effort de propósito: falhar aqui **não pode** derrubar o 201. Perder a
 * confirmação é ruim; perder o briefing inteiro por causa dela seria pior — é o
 * mesmo raciocínio de `falarComOCliente` em `lib/agency/esteira/marcos.ts`, e o
 * `authorName` é o mesmo para a conversa não trocar de voz no meio.
 *
 * O texto NÃO promete retorno quando não há canal de contato: quem sobe sem
 * WhatsApp nem e-mail não pode ler "entramos em contato" — foi essa promessa
 * vazia que produziu os 51 dias do Sushi Cazza.
 */
// Exportada para o PORTÃO DO GRAVADOR (16/08/2026, terceira passada).
// O portão anterior provava só o LEITOR (`GET /api/messages`) com o prisma
// inteiro mockado: trocar a âncora daqui de `clientRequestId` para `clientId`
// deixava o teste verde e sumia com a confirmação da caixa da equipe. Ver
// `__tests__/comercial/a-confirmacao-chega-na-caixa-da-equipe.test.ts`.
export async function registrarConfirmacaoNoPortal(input: {
  clientRequestId: string;
  services: string[];
  anexos: number;
  temComoFalar: boolean;
}): Promise<void> {
  // ⚠️ O NOME DO NEGÓCIO NÃO ENTRA NESTA FRASE, e é escolha declarada
  // (reprovação de `qualidade`, 16/08/2026). O campo `businessName` desta rota
  // chega do briefing como `data.prospectName ?? data.title`: quando o prospect
  // só disse o nome dele, a frase virava **"Recebemos o briefing do João."** —
  // tratando a pessoa como se fosse o negócio. E o artigo ("do"/"da") é outro
  // palpite errado na primeira frase que a agência escreve para o cliente.
  // A caixa de entrada da equipe já mostra o nome do negócio na própria linha da
  // conversa; repeti-lo aqui só cria uma chance de errar.
  const linhas = [
    "Recebemos seu briefing. Está tudo aqui com a gente. ✅",
    "",
    "O que chegou:",
    `• A conversa completa do briefing`,
    ...(input.services.length > 0 ? [`• Serviços pedidos: ${input.services.join(", ")}`] : []),
    ...(input.anexos > 0
      ? [`• ${input.anexos} arquivo(s) anexado(s)`]
      : ["• Nenhum arquivo anexado (se quiser mandar algo, é só responder por aqui)"]),
    "",
    input.temComoFalar
      ? "Vamos montar sua proposta e retornar pelo canal que você informou. Qualquer coisa, responda por aqui mesmo."
      : "Para preparar a proposta precisamos de um WhatsApp ou e-mail seu — sem isso não temos como te enviar nada. Pode deixar aqui na conversa.",
  ];

  const { prisma } = await import("@/lib/db/client");
  await prisma.portalMessage.create({
    data: {
      clientRequestId: input.clientRequestId,
      authorRole: "team",
      authorName: "Gerente de projeto",
      body: linhas.join("\n"),
      // `readByTeam: true` porque a equipe não precisa "ler" a própria mensagem;
      // marcá-la como não lida inflaria o badge da caixa de entrada com o eco
      // do próprio sistema e treinaria a equipe a ignorar o badge.
      readByTeam: true,
    },
  });
}
