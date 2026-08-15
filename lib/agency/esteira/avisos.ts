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
export type TipoDeAviso = "direcao" | "material" | "entrega" | "ciclo" | "recompra";
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

    const { sendWhatsAppMessage } = await import("@/lib/integrations/meta");
    const r = await sendWhatsAppMessage(workspaceId, {
      connectionId: conexao.id,
      to: telefone.replace(/\D/g, ""),
      text: texto,
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
 * Avisa o cliente. Registra SEMPRE; envia quando dá.
 *
 * O texto que vai para a fila já inclui o link do portal, para quem for
 * disparar à mão só precisar copiar e colar.
 */
export async function avisarCliente(pedido: PedidoDeAviso): Promise<ResultadoDoAviso> {
  try {
    const cliente = await prisma.client.findUnique({
      where: { id: pedido.clientId },
      select: { phone: true, portalToken: true },
    });

    const link = cliente ? linkDoPortal(cliente.portalToken) : null;
    const textoCompleto = link ? `${pedido.texto}\n\n${link}` : pedido.texto;

    const tentativa = await tentarWhatsApp(pedido.workspaceId, cliente?.phone ?? null, textoCompleto);

    await prisma.clientNotice.create({
      data: {
        workspaceId: pedido.workspaceId,
        clientId: pedido.clientId,
        ...(pedido.projectId ? { projectId: pedido.projectId } : {}),
        kind: pedido.tipo,
        body: pedido.texto,
        link,
        status: tentativa.ok ? "enviado" : "pendente",
        channel: tentativa.ok ? "whatsapp" : "nenhum",
        ...(tentativa.ok ? { sentAt: new Date() } : { failReason: tentativa.motivo ?? null }),
      },
    });

    return {
      registrado: true,
      enviadoAutomaticamente: tentativa.ok,
      canal: tentativa.ok ? "whatsapp" : "nenhum",
      ...(tentativa.motivo ? { motivo: tentativa.motivo } : {}),
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

/** Alguém do time disparou à mão. Registra quem e quando. */
export async function marcarComoEnviado(id: string, quem: string): Promise<boolean> {
  try {
    await prisma.clientNotice.update({
      where: { id },
      data: { status: "enviado", channel: "manual", sentAt: new Date(), sentBy: quem },
    });
    return true;
  } catch {
    return false;
  }
}

/** O aviso não é mais necessário (o cliente já resolveu por outro caminho). */
export async function dispensar(id: string, quem: string): Promise<boolean> {
  try {
    await prisma.clientNotice.update({
      where: { id },
      data: { status: "dispensado", sentBy: quem },
    });
    return true;
  } catch {
    return false;
  }
}
