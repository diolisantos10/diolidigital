// O CAMINHO AUTOMÁTICO — o briefing aceito vira Cliente + Projeto sem ninguém
// abrir o painel.
//
// ═══ POR QUE ISTO EXISTE (24/08/2026) ════════════════════════════════════════
//
// O raio-X da casa mediu a contradição: a Dioli se define como agência que roda
// sozinha, e NENHUM briefing virava cliente sem alguém entrar no painel e
// aprovar o escopo. É a explicação dos ZERO clientes em produção. O cursograma
// do CEO tem um único ponto de decisão depois da precificação — "cliente
// aceitou?" — e vai direto para o projeto nascer; a Arquitetura Operacional V2
// abre dizendo que "o sistema não pode depender de o executor ser IA ou humano".
//
// Medido no mesmo dia, e é o buraco exato: **nada nesta casa movia um briefing
// para fora de `proposal_pending`.** O orçamento era entregue, o pedido ficava
// ali, e a única porta adiante exigia sessão de staff. O cursograma tinha uma
// pergunta que o cliente não tinha como responder.
//
// ═══ A AUTORIZAÇÃO ═══════════════════════════════════════════════════════════
//
// Mesma exigência de `escada/decisoes-do-dono.ts`: decisão sem procedência é
// memória de alguém, e memória não é registro. Data, quem, e a FALA literal.
export const AUTORIZACAO = {
  em: "2026-08-24",
  quem: "CEO (Dioli), por escrito, registrado em `docs/decisoes.md` da Control Room",
  fala:
    "A criação de cliente e projeto passe a ter caminho automático, mantendo a rota " +
    "autenticada de staff intacta e o aceite do cliente como condição.",
} as const;
//
// ═══ O MOLDE, E POR QUE NÃO SE INVENTOU UM SEGUNDO ═══════════════════════════
//
// É o da escada: a decisão do dono é CÓDIGO VERSIONADO que o relógio aplica
// sozinho, idempotente, sem sessão para conseguir e sem segredo para carregar.
// Consequência prática, igual à de lá: **deploy = a esteira anda.**
//
// ═══ O QUE ESTE CAMINHO NÃO FAZ ══════════════════════════════════════════════
//
//   • **Não substitui a rota de staff.** Ela continua existindo, continua
//     recusando intruso, e continua sendo o caminho de quem quer decidir na mão.
//     O automático se SOMA a ela. Há teste que reprova esta casa se a rota de
//     staff afrouxar "porque agora tem o automático".
//   • **Não dispensa o aceite do cliente.** Sem aceite, nada nasce. É a condição
//     do cursograma e a condição da autorização.
//   • **Não toca no aval de direção nem na aprovação da peça.** Os dois
//     continuam sendo do cliente — são o produto, não burocracia.
//   • **Não toca em portão de qualidade.** Piso de verdade e contrato de saída
//     seguem inteiros.
//   • **Não cobre o excepcional.** Ver `avaliarCasoNormal`.

import { prisma } from "@/lib/db/client";
import { PLANOS } from "@/lib/agency/planos";
import { lerEscopoDeConteudo } from "@/lib/agency/execution/escopo-do-cliente";
import { separarValoresInformados } from "@/lib/agency/execution/piso-de-verdade";
import { estimativaEntregue, type EstimativaGuardada } from "@/lib/agency/esteira/orcamento-do-briefing";

/** O menor degrau da tabela do site — o piso comercial da casa. */
export const PISO_DA_TABELA = Math.min(...PLANOS.map((p) => p.preco));

export type Veredito =
  | { normal: true }
  | { normal: false; motivo: string };

function lerJson(v: string | null | undefined): Record<string, unknown> {
  if (!v) return {};
  try {
    const o = JSON.parse(v) as unknown;
    return o && typeof o === "object" && !Array.isArray(o) ? (o as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function lista(v: string | null | undefined): string[] {
  try {
    const o = JSON.parse(v ?? "[]") as unknown;
    return Array.isArray(o) ? o.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
  } catch {
    return [];
  }
}


/**
 * ═══ O CASO NORMAL, DEFINIDO EM FATO — NUNCA EM PALPITE ═════════════════════
 *
 * A regra de parada é requisito, não observação: **o automático cobre só o caso
 * normal**, e tudo que foge dele para e espera gente, com o motivo registrado.
 * Automatizar o excepcional é trocar um funil parado por um cliente mal servido
 * em escala.
 *
 * As cinco perguntas abaixo são todas conferidas contra DADO que a casa já tem.
 * Nenhuma delas é julgamento de valor, e nenhuma inventa política comercial:
 * a tabela é a do site (`planos.ts`, decisão do CEO de 05/08), o volume sai do
 * leitor determinístico que o contrato de saída já usa, e o contato sai da
 * chave que a caixa de entrada já grava.
 *
 * Na dúvida, a resposta é SEMPRE "não é normal": um projeto que nasce errado
 * custa mais que um briefing que espera um dia.
 */
/**
 * ═══ O PREÇO QUE O CLIENTE ACEITOU ══════════════════════════════════════════
 *
 * A quarta pergunta ("quanto ele paga") existe porque projeto que nasce sem
 * saber o que foi vendido cobra errado de alguém. Ela era respondida lendo
 * PROSA — e prosa é a fonte mais fraca que existe para isso.
 *
 * Medido em 24/08/2026 no case Farol 27: o leitor devolveu `[5000, 30]`. O
 * 5000 é o RÓTULO da faixa (`budgetRange: "acima de R$ 5.000"`), a etiqueta da
 * régua e não um valor que alguém disse; o 30 é *"R$ 30 mil"* — a verba de
 * MÍDIA de 60 dias — lido como trinta reais. Nenhum dos dois é o honorário
 * mensal da agência, que é o número que esta pergunta quer.
 *
 * Quando a casa ENTREGOU um orçamento (`briefingJson.estimate`, o mesmo número
 * escrito na proposta que o cliente abriu) e o cliente ACEITOU aquela proposta,
 * a pergunta está respondida — e respondida pela fonte mais forte possível:
 * o cliente concordando, por escrito, com um número que a casa derivou. Isso
 * não afrouxa a régua, aperta: passa a valer um acordo em vez de um palpite
 * sobre texto.
 *
 * ⚠️ **Falha fechada.** Sem estimativa gravada, ou com estimativa travada/zerada,
 * esta função devolve `null` e a régua antiga — a da prosa — volta a decidir
 * inteira. "Não recusou" nunca vira "aceitou", e "não achei o número" nunca
 * vira "o número está bom".
 */
export function precoAceito(briefingJson: string | null): number | null {
  if (!briefingJson) return null;
  try {
    const corpo = JSON.parse(briefingJson) as {
      estimate?: { totalMin?: unknown; totalMax?: unknown; travadaPor?: unknown };
    };
    const e = corpo?.estimate;
    if (!e || typeof e !== "object") return null;
    // Mesma trava do CityJobs que `estimativaDe` aplica na entrega: número que
    // a casa se recusou a sustentar não vira preço aqui tampouco.
    if (typeof e.travadaPor === "string" && e.travadaPor.trim()) return null;
    const min = typeof e.totalMin === "number" ? e.totalMin : NaN;
    const max = typeof e.totalMax === "number" ? e.totalMax : NaN;
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    // O PISO da faixa, não o teto: é o menor compromisso que o aceite garante,
    // e errar para baixo aqui só torna a conferência do piso mais exigente.
    const piso = Math.min(min, max);
    return piso > 0 ? piso : null;
  } catch {
    return null;
  }
}

export function avaliarCasoNormal(req: {
  services: string;
  briefingJson: string | null;
  rawContext: string;
  chaveDoProspect: string | null;
}): Veredito {
  // 1. QUEM É. Sem canal de contato, o projeto nasce sem para quem falar — e a
  //    esteira inteira é feita de falar com o cliente.
  if (!req.chaveDoProspect) {
    return { normal: false, motivo: "lead incompleto: o briefing chegou sem e-mail nem WhatsApp, e a esteira precisa falar com o cliente" };
  }

  // 2. O QUE ELE PEDIU. Serviço vazio não é pedido: é formulário em branco.
  const servicos = lista(req.services);
  if (servicos.length === 0) {
    return { normal: false, motivo: "briefing incompleto: nenhum serviço declarado" };
  }

  // ── O ESCOPO MORA EM `briefingJson.scope` ────────────────────────────────
  // Medido em 24/08/2026: a primeira versão desta função lia `briefingJson` no
  // nível de cima e achava um TRANSCRIPT da conversa. O escopo estruturado —
  // que é o que a produção inteira lê (`run-execution.ts:329`) — mora um nível
  // abaixo. Ler o nível errado fazia TODO briefing parecer incompleto, e o
  // caminho automático nunca teria disparado para ninguém.
  const briefing = lerJson(req.briefingJson);
  const scope = lerJson(JSON.stringify(briefing.scope ?? {}));

  // 3. QUANTO ELE COMPROU. É o número que o contrato de saída vai cobrar do
  //    especialista. Ilegível aqui significa que a casa não sabe o que vendeu —
  //    e produzir sem saber é como o cliente recebe menos do que pagou em
  //    silêncio. O leitor é o MESMO que a produção usa; não há segunda régua.
  const escopo = lerEscopoDeConteudo({
    servicos,
    escopo: JSON.stringify(scope),
    contextoBruto: req.rawContext ?? "",
  });
  if (escopo.pecasPorMes === null) {
    return { normal: false, motivo: "briefing incompleto: o volume comprado não é legível, e sem ele a casa não sabe o que vendeu" };
  }

  // 4. QUANTO ELE PAGA. A tabela do site é a única viva (decisão do Diretor
  //    Geral, 24/08/2026 — duas tabelas vivas cobram errado de alguém).
  //
  //    ⚠️ Verba ILEGÍVEL e verba BAIXA são casos diferentes, e os dois param.
  //    Faixa ("entre 400 e 480") cai aqui de propósito: quem decide dentro de
  //    uma faixa é gente, não um `Math.min`.
  //
  //    ⚠️ QUEM LÊ A VERBA É O LEITOR DA CASA, não um segundo escrito aqui.
  //    `separarValoresInformados` é o mesmo que o piso de verdade usa, e ele já
  //    sabe a distinção que custou caro a esta casa: PREÇO (o que o cliente
  //    cobra dos clientes dele) não é VERBA (o que ele paga à agência). Um
  //    leitor próprio aqui seria a segunda régua que envelhece sozinha — o
  //    defeito que este mesmo dia já produziu duas vezes.
  //
  //    ⚠️ E há UMA fonte que dispensa a leitura de prosa, porque é mais forte
  //    que ela: o preço que o cliente ACEITOU. Ver `precoAceito`. Esta função
  //    só é chamada depois do aceite (`nascerDoAceite` exige `status`
  //    "accepted"), então a estimativa gravada aqui é exatamente o número que
  //    estava na proposta que ele abriu e aprovou.
  const aceito = precoAceito(req.briefingJson);
  if (aceito !== null) {
    if (aceito < PISO_DA_TABELA) {
      return {
        normal: false,
        motivo: `verba fora da tabela: o valor aceito (R$ ${aceito}) está abaixo do menor plano do site (R$ ${PISO_DA_TABELA}) — quem decide atender fora da tabela é gente`,
      };
    }
    return { normal: true };
  }

  const { verbas } = separarValoresInformados(scope, req.rawContext ?? "");
  if (verbas.length === 0) {
    return { normal: false, motivo: "verba fora do padrão: o briefing não traz um valor mensal legível" };
  }
  // Faixa ("entre R$ 400 e R$ 480") chega aqui como dois valores diferentes.
  // Quem decide dentro de uma faixa é gente, não um `Math.min`.
  const distintos = [...new Set(verbas)];
  if (distintos.length > 1) {
    return {
      normal: false,
      motivo: `verba fora do padrão: o briefing traz mais de um valor (${distintos.join(", ")}) e faixa não decide sozinha`,
    };
  }
  const verba = distintos[0]!;
  if (verba < PISO_DA_TABELA) {
    return {
      normal: false,
      motivo: `verba fora da tabela: R$ ${verba} está abaixo do menor plano do site (R$ ${PISO_DA_TABELA}) — quem decide atender fora da tabela é gente`,
    };
  }

  return { normal: true };
}

/** O status que marca o aceite do cliente. Já é reconhecido como aceite pelo
 *  retrato da esteira (`STATUS_ACEITE`) — não é vocabulário novo. */
export const STATUS_ACEITO = "accepted";

/**
 * OS ESTADOS EM QUE A PROPOSTA ESTÁ NA MESA — a porta de decisão aberta.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POR QUE ESTA LISTA SAIU DE DENTRO DA ROTA DE LEITURA (6ª rodada)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ela morava em `app/api/portal/briefing/proposta/route.ts`, que é quem LÊ. E
 * o cabeçalho daquela rota já dizia, com todas as letras: *"`decidivel` é
 * FATO, não convite. Pedido já decidido devolve o que valeu — e a tela não
 * desenha botão nenhum."*
 *
 * A intenção estava escrita. A trava, não. Medido em produção pelo cliente
 * oculto:
 *
 *   POST aceite {recusado} → 200, status vira `rejected`
 *   GET  proposta          → `decidivel: false`, `jaRecusado: true`
 *   POST aceite {aceito}   → **200, e o projeto NASCE**
 *
 * A rota de leitura dizia ao cliente que não havia mais o que decidir, e a de
 * escrita decidia assim mesmo. É "prompt é aviso; código é trava" na forma
 * mais limpa: o aviso estava do lado que lê, e o lado que age não o conhecia.
 *
 * E a direção perigosa é a OUTRA: aceitar e depois recusar marcava a
 * solicitação como `rejected` com o projeto já criado — possivelmente pago,
 * possivelmente produzindo. Um clique derrubaria no papel um projeto que
 * continua andando de verdade, sem ninguém ficar vermelho.
 *
 * Agora a lista é UMA, e quem lê e quem escreve leem a mesma. Mudar de ideia
 * continua possível — pela conversa, com gente do outro lado, que é onde uma
 * reversão de contrato pertence.
 */
export const ESPERANDO_DECISAO_DA_PROPOSTA: readonly string[] = [
  "proposal_pending", "proposal", "negotiation",
];

/**
 * ═══ METADE B: O PREÇO CONGELA NO INSTANTE DO ACEITE (29/08/2026, ordem C1) ═
 *
 * `briefingJson.estimate` é o preço AGORA — muda a cada rodada de
 * `negotiateProposal`. Esta função grava o preço NAQUELE DIA: o número que
 * estava em `briefingJson.estimate` no exato instante em que `status` vira
 * `STATUS_ACEITO`, numa coluna que NENHUMA renegociação posterior toca.
 *
 * ── POR QUE AQUI, E NÃO NA ROTA ────────────────────────────────────────────
 * `STATUS_ACEITO` só é escrito por UM caminho no código inteiro (varredura por
 * grep, 29/08/2026): `app/api/portal/briefing/aceite/route.ts`. Colocar o
 * congelamento DENTRO da função que escreve o status — em vez de deixar a
 * rota lembrar de chamar as duas coisas separadamente — é o que garante que
 * nenhum aceite futuro nasça sem o registro: não há como escrever
 * `STATUS_ACEITO` sem passar por aqui.
 *
 * ── ATÔMICO E IDEMPOTENTE, NUM `UPDATE` SÓ ─────────────────────────────────
 * `COALESCE(precoAceitoJson, ?)` significa "grava só se ainda não tinha
 * nada" — a mesma regra de "escreve uma vez" que `avisoOrcamentoStatus` já
 * usa neste arquivo-irmão (`orcamento-do-briefing.ts`). Chamar esta função
 * duas vezes para o mesmo pedido (rota chamada de novo, corrida entre duas
 * abas) não apaga o preço que já tinha sido congelado da primeira vez — e
 * como o `status` só é lido como `!== STATUS_ACEITO` antes de chamar isto
 * (ver a rota), na prática ela roda uma vez por pedido.
 *
 * Sem estimativa entregue (`estimativaEntregue` devolve `null`): grava o
 * status normalmente e NÃO inventa preço — as duas colunas ficam `NULL`,
 * exatamente como o resto da casa trata ausência de número.
 *
 * ── REGRESSÃO MEDIDA (ficha C1d, 29/08/2026) — POR QUE NÃO É MAIS SQL CRU ────
 * A versão anterior usava `$executeRawUnsafe` com `COALESCE` porque as duas
 * colunas eram "novas" e o cliente Prisma gerado, versionado de propósito,
 * não tinha sido regenerado nesta árvore. Medido nesta rodada: o gerado **já
 * tem** `precoAceitoJson`/`precoAceitoEm` (`lib/generated/prisma/models/
 * ClientRequestDb.ts`) — a premissa que justificava o SQL cru não vale mais.
 * SQL cru fora do Prisma normal quebrou os testes que montam um Prisma falso
 * (o fake não tem `$executeRawUnsafe`, e nunca precisou ter), e mais: um
 * detalhe de implementação (a string SQL) teria de vazar para mocks de
 * arquivos que não têm nada a ver com preço — a dívida que a ficha pediu para
 * não espalhar.
 *
 * `updateMany` com a condição no `where` é UMA instrução só, exatamente como
 * o `UPDATE` cru era — a atomicidade não depende de SQL cru, depende de ser
 * um único comando.
 *
 * ── A SEMÂNTICA DO COALESCE, TRADUZIDA LITERALMENTE ──────────────────────────
 * `COALESCE(precoAceitoJson, ?)` só reescrevia a coluna quando ela ainda
 * estava `NULL`. `where: { id, precoAceitoJson: null }` é a MESMA condição,
 * só que expressa no filtro em vez de dentro do valor: a chamada só toca a
 * linha se a coluna ainda não tiver sido congelada. Chamar de novo com a
 * coluna já preenchida bate 0 linhas — não sobrescreve nada. Prova ao vivo:
 * `__tests__/portal/o-preco-negociado-e-uma-fonte-so.test.ts`, bloco 5, chama
 * `marcarAceite` duas vezes contra SQLite de verdade e confere que a segunda
 * chamada não muda o preço congelado pela primeira.
 *
 * ── O STATUS CONTINUA NO MESMO ATO — E O RISCO DE VIRAR DOIS ATOS ───────────
 * `status` entra no MESMO `data` do MESMO `updateMany`: não há uma escrita de
 * status separada de uma escrita de preço, então não existe a janela "status
 * gravado sem preço congelado" que duas instruções abririam.
 *
 * O que isso muda de comportamento, e por que é seguro: `status` só é escrito
 * quando a condição do `where` bate — ou seja, só quando a coluna de preço
 * ainda está `NULL`. No SQL cru, `status` era escrito em TODA chamada,
 * independente da coluna de preço. A diferença só importa numa segunda
 * chamada tardia: o único chamador desta função
 * (`app/api/portal/briefing/aceite/route.ts`) só chama quando
 * `solicitacao.status !== STATUS_ACEITO` — ou seja, na prática `marcarAceite`
 * roda no máximo uma vez por pedido pelo caminho normal, e nesse caminho a
 * condição do `where` SEMPRE bate na primeira (e única) chamada, porque a
 * coluna começa `NULL`. Uma segunda chamada só existe hoje em teste direto
 * (bloco 5, acima) e nela o objetivo é justamente confirmar que nada é
 * sobrescrito — incluindo o `status`, que já estava correto.
 *
 * O único cenário em que isto teria efeito observável é um aceite SEM
 * estimativa (`precoNoAceite` nulo): a coluna de preço fica `NULL` mesmo
 * depois do aceite, então uma chamada futura (hipotética, hoje sem chamador)
 * ainda bateria a condição e re-escreveria `status` (para o mesmo valor —
 * sem efeito) e tentaria congelar o preço se um número aparecesse depois.
 * Isso é ESTRITAMENTE MAIS PERMISSIVO que o SQL cru anterior nesse caso
 * (que também deixava a porta aberta para o mesmo backfill, via COALESCE) —
 * não fecha uma porta que já estava aberta.
 */
export async function marcarAceite(clientRequestId: string, briefingJsonAtual: string | null): Promise<void> {
  const precoNoAceite = estimativaEntregue(briefingJsonAtual);
  await prisma.clientRequestDb.updateMany({
    where: { id: clientRequestId, precoAceitoJson: null },
    data: {
      status: STATUS_ACEITO,
      precoAceitoJson: precoNoAceite ? JSON.stringify(precoNoAceite) : null,
      precoAceitoEm: precoNoAceite ? new Date() : null,
    },
  });
}

/**
 * O preço que ficou registrado quando o cliente aceitou — ou `null` quando o
 * pedido nunca foi aceito com número entregue. É a leitura irmã de
 * `marcarAceite`: nenhum outro lugar do código lê ou escreve estas colunas.
 */
export async function precoCongeladoNoAceite(
  clientRequestId: string,
): Promise<{ estimativa: EstimativaGuardada; congeladoEm: string | null } | null> {
  const linhas = await prisma.$queryRawUnsafe<{ precoAceitoJson: string | null; precoAceitoEm: string | null }[]>(
    `SELECT precoAceitoJson, precoAceitoEm FROM ClientRequestDb WHERE id = ?`,
    clientRequestId,
  );
  const linha = linhas[0];
  if (!linha?.precoAceitoJson) return null;
  try {
    return { estimativa: JSON.parse(linha.precoAceitoJson) as EstimativaGuardada, congeladoEm: linha.precoAceitoEm };
  } catch {
    return null;
  }
}

/**
 * O registro do que o caminho automático fez ou recusou a fazer.
 *
 * `ActivityEvent` exige workspace. Solicitação sem workspace não tem onde ser
 * registrada — e nesse caso o motivo ainda volta no retorno da função, que é
 * quem decide. O registro é a memória; o retorno é a verdade.
 */
async function registrar(
  req: { workspaceId: string | null; clientId: string | null },
  type: string,
  message: string,
): Promise<void> {
  if (!req.workspaceId) return;
  await prisma.activityEvent.create({
    data: {
      workspaceId: req.workspaceId,
      ...(req.clientId ? { clientId: req.clientId } : {}),
      type,
      message: message.slice(0, 900),
    },
  }).catch(() => { /* best-effort: o registro não pode derrubar a esteira */ });
}

export type ResultadoDoNascimento =
  | { ok: true; projectId: string; jaExistia: boolean }
  | { ok: false; motivo: string; esperaGente: boolean };

/**
 * O BRIEFING ACEITO VIRA CLIENTE + PROJETO.
 *
 * Idempotente por `clientRequestId`, como a rota de staff: chamada duas vezes
 * devolve o mesmo projeto em vez de criar um segundo. Isso importa mais aqui do
 * que lá — o relógio chama isto a cada rodada.
 *
 * A porta de criação é a MESMA de sempre (`createProjectFromRequest`). Não há
 * cópia: duas portas com comportamentos diferentes é como nasce sistema
 * imprevisível, e esta casa já pagou por isso uma vez (07/08/2026, quando a
 * rota de staff tinha uma cópia incompleta que não semeava a marca).
 */
export async function nascerDoAceite(
  clientRequestId: string,
  quem = "caminho automático",
): Promise<ResultadoDoNascimento> {
  const req = await prisma.clientRequestDb.findUnique({ where: { id: clientRequestId } });
  if (!req) return { ok: false, motivo: "solicitação não encontrada", esperaGente: false };

  // ── IDEMPOTÊNCIA ANTES DE TUDO ─────────────────────────────────────────────
  const jaTem = await prisma.project.findFirst({
    where: { clientRequestId }, orderBy: { createdAt: "asc" }, select: { id: true },
  });
  if (jaTem) return { ok: true, projectId: jaTem.id, jaExistia: true };

  // ── O ACEITE É CONDIÇÃO ────────────────────────────────────────────────────
  // Sem ele nada nasce. É a condição do cursograma e a da autorização escrita.
  if (req.status !== STATUS_ACEITO) {
    return { ok: false, motivo: `o cliente ainda não aceitou (status "${req.status}")`, esperaGente: false };
  }

  // ── A REGRA DE PARADA ──────────────────────────────────────────────────────
  const veredito = avaliarCasoNormal(req);
  if (!veredito.normal) {
    // Para e ESPERA GENTE, com o motivo registrado. Parar em silêncio seria
    // trocar o funil parado por um funil parado que ninguém enxerga.
    await registrar(req, "caminho_automatico_parou",
      `${req.businessName}: ${veredito.motivo}. Aguardando decisão de uma pessoa.`);
    return { ok: false, motivo: veredito.motivo, esperaGente: true };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // A RESERVA: O BANCO É QUE DECIDE QUEM CRIA (cliente oculto, 6ª rodada)
  // ═══════════════════════════════════════════════════════════════════════
  //
  // MEDIDO EM PRODUÇÃO: **dois projetos para a MESMA solicitação**, criados
  // com 9 segundos de diferença — `cmt9l4803004s0xmnk0907s0m` e
  // `cmt9l4eu0005e0xmngtcm4w3o`, ambos de `cmt9jxkhn003e0xmnpfqq3qbx`. O
  // cliente abriu o portal e viu o projeto dele duas vezes, com dois nomes
  // diferentes.
  //
  // A idempotência lá em cima EXISTE e não bastou, porque ela é
  // check-then-act e a janela entre o check e o act é enorme:
  // `createProjectFromRequest` chama IA para desenhar o plano e demora
  // segundos. Dois chamadores — a rota do aceite (o clique do cliente) e o
  // relógio, que varre `accepted` — passaram os dois pelo `findFirst`, os dois
  // acharam vazio, e os dois criaram.
  //
  // Ler para decidir não trava nada: entre a leitura e a escrita cabe outro
  // processo inteiro. Quem tem de decidir é o BANCO, numa escrita só.
  //
  // `updateMany` com o status na cláusula `where` é essa escrita: ela é
  // atômica, e devolve `count: 1` para EXATAMENTE UM chamador. Quem levar o 1
  // cria; quem levar 0 perdeu a corrida e volta apontando para o projeto do
  // vencedor — que é a resposta certa, não um erro.
  //
  // `in_progress` não é status novo: é o mesmo que `createProjectFromRequest`
  // já gravava — só que no FIM, depois da janela. Aqui ele vira a reserva, que
  // é o papel que ele sempre teve sem ninguém ter dito.
  const reserva = await prisma.clientRequestDb.updateMany({
    where: { id: clientRequestId, status: STATUS_ACEITO },
    data: { status: "in_progress" },
  });
  if (reserva.count === 0) {
    // Alguém já está criando (ou acabou de criar). Espera-se dele o projeto —
    // e se ele ainda não gravou, o relógio da próxima passada encontra.
    const doVencedor = await prisma.project.findFirst({
      where: { clientRequestId }, orderBy: { createdAt: "asc" }, select: { id: true },
    });
    return doVencedor
      ? { ok: true, projectId: doVencedor.id, jaExistia: true }
      : { ok: false, motivo: "outro processo já está criando este projeto", esperaGente: false };
  }

  const { createProjectFromRequest } = await import("@/lib/agency/execution/create-project-from-request");
  const criacao = await createProjectFromRequest(clientRequestId, quem);
  if (!criacao.ok) {
    // A criação morreu com a reserva na mão: devolve o status para que a
    // próxima passada do relógio possa tentar de novo. Reserva que não se
    // devolve é um pedido preso para sempre — trocaria o projeto duplicado
    // por um projeto que nunca nasce, que é pior e mais silencioso.
    await prisma.clientRequestDb
      .updateMany({ where: { id: clientRequestId, status: "in_progress" }, data: { status: STATUS_ACEITO } })
      .catch(() => undefined);
  }
  if (!criacao.ok) return { ok: false, motivo: criacao.error ?? "a criação do projeto falhou", esperaGente: false };

  // A esteira anda: nasce o projeto, o cliente já recebe a direção para avalizar.
  // Exatamente o que a rota de staff faz — e best-effort pelo mesmo motivo:
  // perder o aviso é ruim, perder o projeto é pior.
  const { pedirDirecao } = await import("@/lib/agency/esteira/marcos");
  await pedirDirecao(criacao.projectId).catch(() => undefined);

  await registrar(req, "caminho_automatico_criou",
    `${req.businessName}: aceite do cliente virou projeto sem passar pelo painel.`);

  return { ok: true, projectId: criacao.projectId, jaExistia: false };
}

/**
 * O QUE O RELÓGIO CHAMA A CADA RODADA.
 *
 * Varre os briefings ACEITOS que ainda não viraram projeto e tenta fazer cada um
 * nascer. É a metade que torna o caminho independente do navegador: se o aceite
 * do cliente chegou e a criação morreu no meio, a próxima rodada retoma.
 *
 * Nunca estoura: uma solicitação problemática não pode impedir as outras de
 * andarem, e o relógio inteiro não pode cair por causa de uma linha torta.
 */
export async function aplicarCaminhoAutomatico(limite = 20): Promise<{
  criados: number; pararam: number; jaExistiam: number;
}> {
  let criados = 0, pararam = 0, jaExistiam = 0;
  try {
    const aceitos = await prisma.clientRequestDb.findMany({
      where: { status: STATUS_ACEITO },
      orderBy: { updatedAt: "asc" },
      take: Math.max(1, Math.min(limite, 100)),
      select: { id: true },
    });
    for (const { id } of aceitos) {
      const r = await nascerDoAceite(id).catch(() => null);
      if (!r) continue;
      if (r.ok) { if (r.jaExistia) jaExistiam++; else criados++; }
      else if (r.esperaGente) pararam++;
    }
  } catch {
    // Banco fora do ar: a próxima rodada tenta de novo. Nada aqui é urgente ao
    // ponto de justificar derrubar o relógio.
  }
  return { criados, pararam, jaExistiam };
}
