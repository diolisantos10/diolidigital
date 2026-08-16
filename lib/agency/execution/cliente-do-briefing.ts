// O CLIENTE QUE NASCE (OU NÃO NASCE DE NOVO) DE UM BRIEFING APROVADO.
//
// ── A PERGUNTA DO CEO, 16/08/2026 ───────────────────────────────────────────
//
//   "se entrar um cliente com o mesmo e-mail e fizer cinco briefings um atrás
//    do outro, o que acontece com o sistema?"
//
// **Aqui era o maior estrago.** A entrada aguentava — cinco briefings viravam
// cinco linhas, feio mas recuperável. A APROVAÇÃO é que multiplicava cadastro:
//
//   • `execution/create-project-from-request.ts:34` é idempotente por
//     SOLICITAÇÃO (`findFirst({ where: { clientRequestId } })`) — reaprovar a
//     mesma ficha não duplica nada, e isso está certo;
//   • mas a linha seguinte fazia `prisma.client.create` **sempre** que
//     `req.clientId` estava nulo, sem olhar se aquele contato já era cliente.
//     Aprovar cinco briefings do mesmo e-mail = **cinco `Client` homônimos**,
//     cinco `portalToken`, cinco históricos, cinco cérebros de marca separados.
//
// A prova de que não é hipótese: a **Camila Pereira** está duplicada em produção
// desde 08/08/2026 por este caminho exato, e a fusão dela ainda espera decisão do
// CEO. A única saída, até aqui, era o merge manual em
// `app/api/clients/[id]/fundir/route.ts` — conserto depois do estrago.
//
// ── 🔴 O DEFEITO QUE FAZ A CORREÇÃO INGÊNUA NÃO FUNCIONAR ───────────────────
//
// Acrescentar "procure um `Client` com este e-mail" **não bastava**, e é o
// detalhe que faria este PR parecer pronto sem estar:
//
//   `prisma.client.create({ data: { workspaceId, name, industry } })`
//
// O `Client` nascido de briefing **nunca teve `email` nem `phone` gravados**. A
// busca por e-mail jamais casaria, porque não havia e-mail em ficha nenhuma. Por
// isso este arquivo faz as DUAS metades: procura pelo contato **e persiste o
// contato** em quem nasce. Sem a segunda, a primeira é decoração.
//
// (O balcão — `lib/agency/balcao/producao.ts:95` — já fazia o certo desde
// sempre: normaliza o e-mail, procura, e só cria se não achar. Este arquivo
// alinha a aprovação ao balcão em vez de inventar um terceiro critério.)
//
// ── ⚠️ O QUE ESTE ARQUIVO DELIBERADAMENTE NÃO FAZ ───────────────────────────
//
// **Não impede um segundo projeto, e isso é ordem do Diretor (16/08/2026).**
// Um cliente PODE legitimamente contratar um segundo trabalho — outra campanha,
// outro produto, outra marca. O objetivo é não duplicar **CADASTRO**, nunca
// impedir **PEDIDO**. Ver o comentário de `IDEMPOTENCIA_E_POR_SOLICITACAO`
// abaixo, onde essa distinção vira código.
//
// **Não funde `Client` que já existe duplicado.** Fundir dois cadastros é
// afirmação de negócio (qual ficha fica com o histórico?), e continua sendo do
// CEO, pelo merge manual. Este arquivo impede duplicata NOVA; não limpa a velha.
//
// **Não casa por NOME.** Dois "Camila Pereira" podem ser duas pessoas, e juntar
// cadastro por homonímia entregaria o portal de um cliente a outro — dano pior e
// irreversível, contra uma duplicata que é chata e reversível. Só contato
// declarado vira identidade. Ver `chave-do-prospect.ts`.

import { prisma } from "@/lib/db/client";
import { lerContato } from "@/lib/agency/comercial/contato-do-lead";
import {
  normalizarEmailParaChave,
  normalizarTelefoneParaChave,
} from "@/lib/agency/comercial/chave-do-prospect";

/**
 * ⚠️ **A IDEMPOTÊNCIA CONTINUA SENDO POR SOLICITAÇÃO, NÃO POR CLIENTE** — e
 * mexer nisso seria transformar a correção numa prisão.
 *
 * `createProjectFromRequest` pergunta "já existe projeto **para esta ficha**?".
 * Se um dia alguém trocar essa pergunta por "já existe projeto **para este
 * cliente**?", o segundo pedido legítimo do mesmo cliente — a segunda campanha,
 * o segundo produto — passaria a devolver silenciosamente o projeto ANTIGO, e o
 * trabalho novo que ele contratou simplesmente não existiria. O cliente teria
 * pago por um projeto que o sistema se recusou a criar, sem nenhum erro na tela.
 *
 * Duplicar CADASTRO é o defeito. Duplicar PEDIDO é o negócio funcionando.
 * São coisas opostas e a única coisa que as separa é esta linha de raciocínio.
 */
export const IDEMPOTENCIA_E_POR_SOLICITACAO = true as const;

export type ClienteResolvido = {
  clientId: string;
  /** `true` quando reaproveitamos ficha existente em vez de criar homônimo. */
  reaproveitado: boolean;
  /** Por que reaproveitou (ou por que criou). Vai para log e auditoria. */
  motivo: string;
};

/** Teto da varredura de segurança. Ver `procurarPorContato`. */
const TETO_DA_VARREDURA = 1000;

/**
 * Procura um `Client` deste workspace cujo contato bata com o do briefing.
 *
 * Duas passadas, nesta ordem, e a segunda existe por um motivo específico:
 *
 *   1. **Ponto indexado** (`workspaceId` + `email` normalizado) — é o padrão do
 *      balcão, e casa com tudo que nasce daqui para a frente, porque este arquivo
 *      grava o e-mail já normalizado.
 *
 *   2. **Varredura limitada** comparando em memória. O SQLite não tem
 *      `mode: "insensitive"` no Prisma, então a passada 1 **não acha** ficha
 *      legada gravada como `Joao@Email.com`, nem telefone legado gravado como
 *      `(11) 99999-8888` — e são exatamente as fichas de piloto que já estão no
 *      volume do Railway. Sem esta segunda passada, a correção funcionaria só
 *      para clientes novos e deixaria os atuais duplicando em silêncio.
 *
 * O teto é declarado: com a carteira desta agência (dezenas de clientes) a
 * varredura é irrelevante. Quando a carteira crescer, o caminho é promover uma
 * coluna de e-mail já normalizado e apagar a passada 2 — não aumentar o teto.
 */
async function procurarPorContato(
  workspaceId: string,
  emailNormalizado: string | null,
  telefoneNormalizado: string | null,
): Promise<{ id: string; por: "email" | "telefone" } | null> {
  if (!emailNormalizado && !telefoneNormalizado) return null;

  // ── 1. O caminho rápido, igual ao do balcão ────────────────────────────────
  if (emailNormalizado) {
    const exato = await prisma.client.findFirst({
      where: { workspaceId, email: emailNormalizado },
      select: { id: true },
      orderBy: { createdAt: "asc" }, // a ficha mais antiga vence: é a que tem histórico
    });
    if (exato) return { id: exato.id, por: "email" };
  }

  // ── 2. A rede para o dado legado (caixa alta, telefone formatado) ──────────
  const candidatos = await prisma.client.findMany({
    where: { workspaceId },
    select: { id: true, email: true, phone: true },
    orderBy: { createdAt: "asc" },
    take: TETO_DA_VARREDURA,
  });

  if (emailNormalizado) {
    const porEmail = candidatos.find((c) => normalizarEmailParaChave(c.email) === emailNormalizado);
    if (porEmail) return { id: porEmail.id, por: "email" };
  }
  if (telefoneNormalizado) {
    const porTelefone = candidatos.find(
      (c) => normalizarTelefoneParaChave(c.phone) === telefoneNormalizado,
    );
    if (porTelefone) return { id: porTelefone.id, por: "telefone" };
  }
  return null;
}

/**
 * Devolve o `Client` desta solicitação — reaproveitando o existente quando o
 * contato bate, criando um novo (COM o contato gravado) quando não bate.
 *
 * Nunca apaga, nunca funde, nunca sobrescreve o contato de uma ficha existente:
 * uma correção de dedup que reescreve o cadastro do cliente antigo com o que
 * veio num briefing novo trocaria dado confirmado por dado recém-digitado.
 */
export async function resolverOuCriarCliente(entrada: {
  workspaceId: string;
  /** Já ligada a um cliente? Então a decisão já foi tomada — respeitamos. */
  clientIdExistente?: string | null;
  businessName: string;
  segment?: string | null;
  briefingJson?: unknown;
  sdrHandoffJson?: unknown;
}): Promise<ClienteResolvido> {
  if (entrada.clientIdExistente) {
    return {
      clientId: entrada.clientIdExistente,
      reaproveitado: true,
      motivo: "a solicitação já apontava para um cliente",
    };
  }

  const contato = lerContato({
    briefingJson: entrada.briefingJson,
    sdrHandoffJson: entrada.sdrHandoffJson,
  });
  const email = normalizarEmailParaChave(contato.email);
  const telefone = normalizarTelefoneParaChave(contato.whatsapp);

  const achado = await procurarPorContato(entrada.workspaceId, email, telefone);
  if (achado) {
    return {
      clientId: achado.id,
      reaproveitado: true,
      motivo: `contato bate com cliente já cadastrado (por ${achado.por})`,
    };
  }

  // ⚠️ `email` e `phone` GRAVADOS, e normalizados. Era a ausência disto que
  // fazia toda busca por contato falhar — ver o cabeçalho do arquivo.
  //
  // Guardar normalizado (minúsculas / só dígitos) é escolha: é o formato que a
  // busca usa, e gravar cru obrigaria toda leitura futura a normalizar de novo,
  // que é como se criam dois critérios divergentes. O que o cliente digitou
  // continua inteiro dentro do `briefingJson` — nada se perde.
  const criado = await prisma.client.create({
    data: {
      workspaceId: entrada.workspaceId,
      name: entrada.businessName,
      industry: entrada.segment || null,
      email: email,
      phone: telefone,
    },
    select: { id: true },
  });

  return {
    clientId: criado.id,
    reaproveitado: false,
    motivo: email || telefone
      ? "nenhum cliente com este contato — ficha nova"
      // Lead sem canal declarado não tem chave nenhuma, e adivinhar identidade
      // por nome é o que esta casa proíbe. Ficha nova é o certo aqui.
      : "briefing sem contato declarado — ficha nova, sem chave de dedup",
  };
}

/**
 * Registra na linha do tempo que uma ficha foi reaproveitada.
 *
 * Existe para que o reaproveitamento seja **visível**, não mágico: sem isto, o
 * CEO abriria o segundo projeto e veria o cliente antigo sem entender de onde
 * ele veio — e "o sistema decidiu sozinho e não contou" é o modo de falhar que
 * esta casa mais paga. Best-effort: falha de auditoria não pode impedir o
 * projeto de nascer.
 */
export async function registrarReaproveitamento(entrada: {
  workspaceId: string;
  clientId: string;
  clientRequestId: string;
  motivo: string;
}): Promise<void> {
  await prisma.activityEvent
    .create({
      data: {
        workspaceId: entrada.workspaceId,
        clientId: entrada.clientId,
        type: "cliente_reaproveitado",
        message:
          `Solicitação ${entrada.clientRequestId} foi ligada a um cliente que já existia ` +
          `(${entrada.motivo}) — nenhum cadastro novo foi criado. O briefing continua inteiro.`,
      },
    })
    .catch((e) => console.error("[cliente-do-briefing] não consegui registrar o reaproveitamento:", e));
}
