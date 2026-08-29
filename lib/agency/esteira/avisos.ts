// avisos.ts — a ponte entre "a esteira precisa de algo" e "o cliente ficou sabendo".
//
// O buraco que este arquivo fecha é o mais silencioso de todos: a esteira
// escrevia no portal, mas o portal só existe se o cliente abrir. Um pedido de
// material podia ficar semanas parado porque ninguém avisou que ele existia —
// o projeto travado, e a agência achando que a bola estava com o cliente.
//
// A REGRA DA CASA: o aviso nunca se perde.
//
// Há canal automático configurado? Sai sozinho, e o registro fica de
// comprovante. Não há? O aviso vira FILA para o time disparar à mão — com o
// texto e o link já redigidos, porque ninguém escreve bem às pressas e o
// cliente não deveria pagar por isso.
//
// Isso resolve uma restrição real, não teórica: fora da janela de 24 horas o
// WhatsApp da Meta só aceita template aprovado, e aprovação leva dias. Até lá o
// aviso sai pela mão de gente — mas sai, e o sistema sabe se saiu.
//
// Nunca lança. Um aviso que falha não pode derrubar a produção que o originou:
// perder o aviso é ruim, perder a entrega é pior.

import { prisma } from "@/lib/db/client";

// "recompra" entrou em 06/08/2026 com a régua de 30/60/90 dias
// (`esteira/recompra.ts`). Ela NÃO usa `avisarCliente` — escreve o
// `ClientNotice` direto, com id determinístico, porque a idempotência do toque
// tem de morar na chave primária. O tipo está aqui porque `filaDeAvisos` faz
// `l.kind as TipoDeAviso`: sem a entrada, a fila mentiria sobre o que ela lista.
export type TipoDeAviso = "direcao" | "material" | "entrega" | "ciclo" | "recompra" | "atraso" | "portal";
export type CanalDeAviso = "whatsapp" | "email" | "manual" | "nenhum";

export interface PedidoDeAviso {
  workspaceId: string;
  clientId: string;
  projectId?: string;
  tipo: TipoDeAviso;
  /** Já redigido para o cliente ler. Sem jargão interno. */
  texto: string;
}

export interface ResultadoDoAviso {
  registrado: boolean;
  enviadoAutomaticamente: boolean;
  canal: CanalDeAviso;
  motivo?: string;
}

/** O endereço do portal deste cliente — o link que resolve o aviso. */
function linkDoPortal(portalToken: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? "").replace(/\/+$/, "");
  return `${base}/portal/access/${portalToken}`;
}

/**
 * Tenta o WhatsApp pela conexão Meta do workspace.
 *
 * Devolve o motivo quando não dá — e o motivo importa: "sem conexão" é um
 * problema de configuração que alguém resolve em minutos; "fora da janela de
 * 24h" é uma regra da Meta que exige template aprovado. Tratar os dois como
 * "falhou" faria a equipe procurar no lugar errado.
 */
async function tentarWhatsApp(
  workspaceId: string,
  telefone: string | null,
  texto: string,
): Promise<{ ok: boolean; motivo?: string }> {
  if (!telefone?.trim()) return { ok: false, motivo: "cliente sem telefone cadastrado" };

  try {
    const conexao = await prisma.metaConnection.findFirst({
      where: { workspaceId, platform: "whatsapp" },
      select: { id: true },
    });
    if (!conexao) return { ok: false, motivo: "nenhuma conexão de WhatsApp no workspace" };

    // ── A PROVA VEM DO BANCO, NÃO DA BOA VONTADE (24/08/2026) ─────────────
    // Este aviso vai para o cliente da casa, cujo telefone ELE mesmo entregou.
    // Mas quem afirma isso é o resolvedor, lendo o registro — não este arquivo.
    // Se o número não bater com nenhum cliente e ninguém tiver escrito para a
    // marca, a prova volta "base sem comprovação" e a trava fecha aqui mesmo.
    const { provaParaTelefone } = await import("@/lib/agency/consentimento/quem-pode-receber");
    const numero = telefone.replace(/\D/g, "");
    const consentimento = await provaParaTelefone(workspaceId, numero);

    const { sendWhatsAppMessage } = await import("@/lib/integrations/meta");
    const r = await sendWhatsAppMessage(workspaceId, {
      connectionId: conexao.id,
      to: numero,
      text: texto,
      consentimento,
    });
    if (r.ok) return { ok: true };
    // Fora da janela de 24h a Meta recusa texto livre. É o caso mais comum, e
    // não é erro nosso — é limite da plataforma.
    return { ok: false, motivo: r.error ?? "o WhatsApp recusou o envio" };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message.slice(0, 140) : "falha no envio" };
  }
}

/**
 * Tenta o E-MAIL — o canal que este arquivo declarava e nunca teve.
 *
 * ── O BURACO, medido em 27/08/2026 ────────────────────────────────────────
 * `CanalDeAviso` já listava `"email"` desde sempre. **Nada, em lugar nenhum,
 * enviava um.** O tipo prometia um canal que não existia — a mesma família de
 * defeito que deixou o cliente 001 inconcedível: a coisa declarada, e a
 * fechadura ausente.
 *
 * A consequência estava no log de produção, repetida cliente a cliente:
 * `aviso parado por CADASTRO — o telefone do cliente não está cadastrado`.
 * Sem WhatsApp, o aviso virava fila manual e o cliente não ficava sabendo de
 * nada. **Coluna gravada não é cliente informado.**
 *
 * ── POR QUE DEPOIS DO WHATSAPP, E NÃO JUNTO ───────────────────────────────
 * Quem recebeu no WhatsApp já foi avisado; mandar e-mail também seria a casa
 * falando duas vezes do mesmo assunto — que é como um remetente vira ruído e
 * depois vira spam. O e-mail é a rede embaixo, não um segundo megafone.
 *
 * Nunca lança: o aviso é best-effort e não pode derrubar o marco que o gerou.
 */
async function tentarEmail(
  workspaceId: string,
  clientId: string,
  tipo: TipoDeAviso,
  texto: string,
  link: string | null,
  nomeDoCliente: string | null,
): Promise<{ ok: boolean; motivo?: string }> {
  try {
    const cliente = await prisma.client.findUnique({
      where: { id: clientId },
      select: { email: true, name: true },
    });
    const email = cliente?.email?.trim();
    if (!email) return { ok: false, motivo: "cliente sem e-mail cadastrado" };

    const { pecaProntaEmail, avisoDeAtrasoEmail, linkDoPortalEmail } = await import("@/lib/email/templates");
    const alvo = { businessName: nomeDoCliente ?? cliente?.name ?? undefined, portalLink: link ?? undefined };

    // ⚠️ O MOLDE ESCOLHE-SE PELO TIPO, e tipo sem molde NÃO improvisa um.
    // Cair num template genérico seria a casa mandando "aviso" sem dizer de
    // quê — e um e-mail que não sabe o que veio dizer não deveria sair.
    let montado: { subject: string; html: string } | null = null;
    if (tipo === "entrega") {
      // O aviso da publicação manual é DERIVADO do freio, nunca constante:
      // no dia em que a Meta liberar, ele some sozinho.
      const { avisoDeAgendamentoManual } = await import("@/lib/agency/esteira/aviso-de-agendamento-manual");
      const avisoManual = await avisoDeAgendamentoManual().catch(() => null);
      montado = pecaProntaEmail({ ...alvo, avisoDePublicacaoManual: avisoManual });
    } else if (tipo === "atraso") {
      montado = avisoDeAtrasoEmail(alvo);
    } else if (tipo === "portal") {
      // Devolve `null` sem link — e aí não há e-mail nenhum para mandar.
      montado = linkDoPortalEmail(alvo);
    }
    if (!montado) return { ok: false, motivo: `sem molde de e-mail para o aviso "${tipo}"` };

    const { sendEmail } = await import("@/lib/email/send");
    const { provaParaEmail } = await import("@/lib/agency/consentimento/quem-pode-receber");
    // ⚠️ `provaParaEmail` recebe WORKSPACE, não cliente. Passar o `clientId`
    // aqui (erro meu, pego antes de rodar) faria a busca procurar um Client cujo
    // workspaceId fosse o id do cliente — nunca encontraria, a prova voltaria
    // "base_importada_sem_comprovacao", e a trava de consentimento barraria
    // TODOS os e-mails em silêncio. O canal existiria e nunca entregaria nada.
    const consentimento = await provaParaEmail(workspaceId, email);

    const r = await sendEmail({ to: email, subject: montado.subject, html: montado.html, consentimento });
    if (r.ok) return { ok: true };
    return { ok: false, motivo: r.error ?? (r.skipped ? "envio pulado sem motivo declarado" : "a porta de e-mail recusou") };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message.slice(0, 140) : "falha no envio de e-mail" };
  }
}

/**
 * Avisa o cliente. Registra SEMPRE; envia quando dá.
 *
 * O texto que vai para a fila já inclui o link do portal, para quem for
 * disparar à mão só precisar copiar e colar.
 */
export async function avisarCliente(pedido: PedidoDeAviso): Promise<ResultadoDoAviso> {
  try {
    const cliente = await prisma.client.findUnique({
      where: { id: pedido.clientId },
      select: { phone: true, portalToken: true, name: true },
    });

    const link = cliente ? linkDoPortal(cliente.portalToken) : null;
    const textoCompleto = link ? `${pedido.texto}\n\n${link}` : pedido.texto;

    const tentativa = await tentarWhatsApp(pedido.workspaceId, cliente?.phone ?? null, textoCompleto);

    // ── A ESCADA DE CANAIS ────────────────────────────────────────────────
    // WhatsApp primeiro (é instantâneo e o cliente já está lá). Falhou? o
    // e-mail é a rede embaixo. Os dois falharam? o aviso vira fila manual —
    // que continua sendo melhor que silêncio, e é o que este arquivo sempre
    // prometeu: *o aviso nunca se perde*.
    //
    // O motivo de CADA canal é preservado e some no registro: "sem telefone" e
    // "sem e-mail" mandam procurar em lugares diferentes, e juntá-los num
    // "falhou" faria alguém caçar bug onde falta cadastro.
    const porEmail = tentativa.ok
      ? { ok: false as const, motivo: undefined }
      : await tentarEmail(pedido.workspaceId, pedido.clientId, pedido.tipo, textoCompleto, link, cliente?.name ?? null);

    const enviou = tentativa.ok || porEmail.ok;
    const canal: CanalDeAviso = tentativa.ok ? "whatsapp" : porEmail.ok ? "email" : "nenhum";
    const porQueNao = tentativa.ok
      ? null
      : [
          tentativa.motivo ? `whatsapp: ${tentativa.motivo}` : null,
          porEmail.motivo ? `e-mail: ${porEmail.motivo}` : null,
        ].filter(Boolean).join(" | ") || null;

    await prisma.clientNotice.create({
      data: {
        workspaceId: pedido.workspaceId,
        clientId: pedido.clientId,
        ...(pedido.projectId ? { projectId: pedido.projectId } : {}),
        kind: pedido.tipo,
        body: pedido.texto,
        link,
        status: enviou ? "enviado" : "pendente",
        channel: canal,
        ...(enviou ? { sentAt: new Date() } : { failReason: porQueNao }),
      },
    });

    return {
      registrado: true,
      enviadoAutomaticamente: enviou,
      canal,
      ...(porQueNao ? { motivo: porQueNao } : {}),
    };
  } catch (e) {
    console.warn("[esteira] não consegui registrar o aviso:", e instanceof Error ? e.message : e);
    return { registrado: false, enviadoAutomaticamente: false, canal: "nenhum", motivo: "falha ao registrar" };
  }
}

export interface AvisoNaFila {
  id: string;
  cliente: string;
  tipo: TipoDeAviso;
  /** Texto + link, pronto para copiar e colar. */
  textoParaEnviar: string;
  porQueNaoSaiuSozinho: string | null;
  esperandoDesde: Date;
}

/**
 * A fila de avisos que precisam de mão humana.
 *
 * É esta lista que impede o pior cenário — o projeto parado esperando um
 * cliente que nunca soube que precisava fazer algo.
 */
export async function filaDeAvisos(workspaceId: string, limite = 50): Promise<AvisoNaFila[]> {
  try {
    const linhas = await prisma.clientNotice.findMany({
      where: { workspaceId, status: "pendente" },
      orderBy: { createdAt: "asc" },
      take: Math.max(1, Math.min(limite, 200)),
      select: {
        id: true, kind: true, body: true, link: true, failReason: true, createdAt: true,
        client: { select: { name: true } },
      },
    });
    return linhas.map((l) => ({
      id: l.id,
      cliente: l.client?.name ?? "cliente",
      tipo: l.kind as TipoDeAviso,
      textoParaEnviar: l.link ? `${l.body}\n\n${l.link}` : l.body,
      porQueNaoSaiuSozinho: l.failReason,
      esperandoDesde: l.createdAt,
    }));
  } catch {
    return [];
  }
}

/**
 * Alguém do time disparou à mão. Registra quem e quando.
 *
 * POSSE: `id` chega do corpo de uma rota interna (`PATCH /api/avisos`), e
 * `ClientNotice` é dado de OUTRO inquilino em potencial. Sem `workspaceId` no
 * `where`, qualquer sessão master/PM desta casa marcava como "enviado" (ou
 * dispensava, abaixo) o aviso pendente de uma agência que não é a dela —
 * silenciando a fila de quem realmente precisava mandar aquele aviso. O
 * escopo vai no `where` do `updateMany`, nunca numa comparação depois: zero
 * linhas afetadas é a mesma resposta de "não existe", de propósito.
 */
export async function marcarComoEnviado(id: string, workspaceId: string, quem: string): Promise<boolean> {
  try {
    const { count } = await prisma.clientNotice.updateMany({
      where: { id, workspaceId },
      data: { status: "enviado", channel: "manual", sentAt: new Date(), sentBy: quem },
    });
    return count > 0;
  } catch {
    return false;
  }
}

/** O aviso não é mais necessário (o cliente já resolveu por outro caminho).
 *  Mesma posse de `marcarComoEnviado` — ver o comentário lá. */
export async function dispensar(id: string, workspaceId: string, quem: string): Promise<boolean> {
  try {
    const { count } = await prisma.clientNotice.updateMany({
      where: { id, workspaceId },
      data: { status: "dispensado", sentBy: quem },
    });
    return count > 0;
  } catch {
    return false;
  }
}
