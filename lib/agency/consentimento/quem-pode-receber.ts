// quem-pode-receber.ts — O RESOLVEDOR DA PROVA.
//
// `prova.ts` JULGA. Este arquivo PROCURA: dado um destino (telefone ou e-mail),
// ele varre os registros da casa atrás de algo que autorize falar com aquela
// pessoa — e devolve a prova pronta, apontando o registro conferível.
//
// ─── POR QUE ISTO FECHA A PORTA DA BASE IMPORTADA ────────────────────────────
//
// Um número da base de 6 mil contatos do Farol 27 não bate com NADA daqui: não
// escreveu para a marca, não digitou o próprio número em briefing nenhum, não
// é cliente cadastrado. O resolvedor volta `base_importada_sem_comprovacao` —
// que é o veredito honesto para "este número apareceu numa planilha" — e a
// trava fecha.
//
// Fail-closed por construção: LEITURA QUE FALHA NÃO LIBERA. Um banco fora do ar
// devolve "não achei prova", nunca "pode".

import { prisma } from "@/lib/db/client";
import type { ConsentimentoDeSaida } from "./prova";

/** Só dígitos dos dois lados: o mesmo número chega ora "+55 11 99999-8888",
 *  ora "5511999998888". Comparar as formas cruas perde metade. */
function digitos(v: string): string {
  return (v ?? "").replace(/\D/g, "");
}

/** Os últimos 8 dígitos — o que sobra do número quando se tira país, DDD e o
 *  nono dígito que o Brasil ora tem, ora não. É a comparação que reconhece o
 *  mesmo telefone escrito de quatro jeitos sem casar telefones diferentes. */
function chaveDeTelefone(v: string): string {
  const d = digitos(v);
  return d.length >= 8 ? d.slice(-8) : d;
}

/**
 * Existe consentimento para falar com este TELEFONE? Devolve a prova pronta.
 *
 * Ordem das buscas = ordem de força da prova:
 *   1. a pessoa escreveu para a marca → RESPOSTA (a mais forte, e a mais barata);
 *   2. o dono do contato entregou o número à casa → abordagem autorizada;
 *   3. nada → base sem comprovação, e a porta fecha.
 */
export async function provaParaTelefone(
  workspaceId: string,
  telefone: string,
): Promise<ConsentimentoDeSaida> {
  const semProva: ConsentimentoDeSaida = {
    natureza: "abordagem",
    origem: "base_importada_sem_comprovacao",
  };
  const chave = chaveDeTelefone(telefone);
  if (!chave) return semProva;

  // 1) RESPOSTA — a mensagem recebida é a prova, e ela já está gravada.
  // ⚠️ TUDO AQUI É DEFENSIVO. Uma leitura que EXPLODE não pode virar exceção no
  // caminho de envio: quem chama já trata falha como "não deu", e uma exceção
  // subindo daqui seria a trava derrubando a esteira em vez de fechar a porta.
  // Exceção = sem prova = porta fechada.
  const recebida = await Promise.resolve()
    .then(() => prisma.whatsAppMessage.findFirst({
    where: { workspaceId, direction: "in", contactWaId: { endsWith: chave } },
    orderBy: { timestamp: "desc" },
    select: { id: true },
  })).catch(() => null);
  if (recebida) return { natureza: "resposta", mensagemRecebidaId: recebida.id };

  // 2) O DONO ENTREGOU O NÚMERO. Cliente cadastrado com este telefone digitou-o
  //    (ou ditou-o) para a casa. É abordagem, mas é abordagem autorizada.
  // Comparar telefone por sufixo dentro do SQL não é confiável com número
  // formatado à mão; a lista de clientes de um workspace é pequena e a
  // conferência sai local.
  const clientes = await Promise.resolve()
    .then(() => prisma.client.findMany({
      where: { workspaceId, phone: { not: null } },
      select: { id: true, name: true, phone: true },
      take: 500,
    }))
    .catch(() => [] as Array<{ id: string; name: string; phone: string | null }>);
  const cliente = clientes.find((c) => chaveDeTelefone(c.phone ?? "") === chave) ?? null;
  if (cliente) {
    return {
      natureza: "abordagem",
      origem: "contato_entregue_pelo_proprio_dono",
      referencia: `Client#${cliente.id} (${cliente.name}) — telefone cadastrado pelo próprio cliente`,
    };
  }

  return semProva;
}

/**
 * O mesmo, para E-MAIL. Aqui não existe "mensagem recebida" gravada: a prova
 * possível é o registro em que a própria pessoa digitou o endereço — o briefing
 * que ela enviou, ou o cadastro de cliente.
 */
export async function provaParaEmail(
  workspaceId: string | null,
  email: string,
): Promise<ConsentimentoDeSaida> {
  const alvo = (email ?? "").trim().toLowerCase();
  const semProva: ConsentimentoDeSaida = {
    natureza: "abordagem",
    origem: "base_importada_sem_comprovacao",
  };
  if (!alvo) return semProva;

  const cliente = await Promise.resolve()
    .then(() => prisma.client.findFirst({
      where: { ...(workspaceId ? { workspaceId } : {}), email: alvo },
      select: { id: true, name: true },
    }))
    .catch(() => null);
  if (cliente) {
    return {
      natureza: "abordagem",
      origem: "contato_entregue_pelo_proprio_dono",
      referencia: `Client#${cliente.id} (${cliente.name}) — e-mail cadastrado pelo próprio cliente`,
    };
  }
  return semProva;
}

/**
 * A prova de quem acabou de escrever para a casa PELO FORMULÁRIO — o briefing
 * público. Não precisa de banco: quem digitou o próprio e-mail no formulário e
 * apertou enviar está pedindo o retorno, e o registro do pedido é a referência.
 *
 * Esta é a fronteira exata com a base importada, e é ela que impede a trava de
 * virar censura: **a pessoa que bateu na porta pode ser respondida.**
 */
export function provaDoProprioBriefing(clientRequestId: string): ConsentimentoDeSaida {
  return {
    natureza: "abordagem",
    origem: "contato_entregue_pelo_proprio_dono",
    referencia: `ClientRequestDb#${clientRequestId} — contato digitado pelo próprio dono no briefing`,
  };
}
