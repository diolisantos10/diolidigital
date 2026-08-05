// ─── POST /api/agency/oportunidades/email ────────────────────────────────────
//
// A PORTA (b) do radar: o e-mail de alerta que a plataforma JÁ manda a cada
// projeto novo é ENCAMINHADO para cá, e o texto dele é lido.
//
// POR QUE ESTA PORTA EXISTE: é o único jeito de ficar sabendo do projeto NOVO em
// minutos sem robô nenhum dentro da plataforma. A plataforma já quer nos avisar
// — ela manda o e-mail. Encaminhar e-mail não é automação de conta, não viola
// termo de uso e não tem como virar conta banida. A porta (a), colar no painel,
// depende de alguém estar olhando; esta não.
//
// ── AUTENTICAÇÃO: SEGREDO DE CABEÇALHO, EM TEMPO CONSTANTE ───────────────────
// Não há sessão aqui — quem chama é um encaminhador de e-mail, não um navegador
// com cookie. A trava é `x-radar-secret` conferido com `segredoConfere`, que
// compara em tempo constante: `!==` sai no primeiro byte diferente e entrega o
// segredo byte a byte para quem souber medir tempo.
//
// ── SEM SEGREDO CONFIGURADO = PORTA FECHADA (503) ────────────────────────────
// Se `RADAR_EMAIL_SECRET` não estiver no ambiente, a rota responde 503 e NÃO
// grava nada. É a inversão do default que a casa exige: configuração faltando é
// porta FECHADA, nunca porta aberta. Uma rota de ingestão sem trava é um jeito
// de qualquer um encher o volume do Railway — o mesmo volume onde moram o SQLite
// e os 14 backups.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { segredoConfere } from "@/lib/security/crypto";
import { registrarOportunidade, detectarPlataforma, normalizarUrl } from "@/lib/agency/comercial/oportunidade";

/** Teto do corpo recebido, em bytes, antes de qualquer parsing. É a primeira
 *  tranca: não adianta validar tamanho depois de já ter carregado 50 MB. */
const CORPO_MAX_BYTES = 512 * 1024;

interface CorpoDeEmail {
  texto?: unknown;
  text?: unknown;
  body?: unknown;
  corpo?: unknown;
  html?: unknown;
  assunto?: unknown;
  subject?: unknown;
  url?: unknown;
  plataforma?: unknown;
  workspaceId?: unknown;
  workspace?: unknown;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1) A configuração. Antes de ler qualquer byte do corpo.
  const segredo = process.env.RADAR_EMAIL_SECRET?.trim();
  if (!segredo) {
    return NextResponse.json(
      {
        error:
          "Porta do radar por e-mail não configurada — defina RADAR_EMAIL_SECRET nas Variables do Railway (gere com: openssl rand -base64 32).",
      },
      { status: 503 },
    );
  }

  // 2) A trava. `segredoConfere` já devolve false para ausente/vazio: segredo
  //    faltando nunca vira porta aberta.
  if (!segredoConfere(request.headers.get("x-radar-secret"), segredo)) {
    // A mensagem NÃO diz se o segredo estava ausente ou errado, e o valor
    // recebido não vai para log nem para a resposta.
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 3) O tamanho, pelo cabeçalho, antes de materializar o corpo.
  const declarado = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declarado) && declarado > CORPO_MAX_BYTES) {
    return NextResponse.json({ error: "Corpo grande demais." }, { status: 413 });
  }

  const tipo = (request.headers.get("content-type") ?? "").toLowerCase();
  let campos: CorpoDeEmail = {};
  let textoCru = "";

  try {
    if (tipo.includes("application/json")) {
      campos = (await request.json()) as CorpoDeEmail;
    } else if (tipo.includes("multipart/form-data") || tipo.includes("application/x-www-form-urlencoded")) {
      // O formato dos serviços de "inbound parse" (SendGrid, Mailgun): campos
      // de formulário com `text`, `html`, `subject`.
      const form = await request.formData();
      campos = Object.fromEntries([...form.entries()].map(([k, v]) => [k, typeof v === "string" ? v : ""]));
    } else {
      // `text/plain` puro — o caso do encaminhador simples (Cloudflare Email
      // Worker, um script de mailbox).
      textoCru = await request.text();
    }
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const daChave = (...chaves: (keyof CorpoDeEmail)[]): string => {
    for (const c of chaves) {
      const v = campos[c];
      if (typeof v === "string" && v.trim()) return v;
    }
    return "";
  };

  const assunto = daChave("assunto", "subject");
  const corpoTexto = textoCru || daChave("texto", "text", "body", "corpo");
  // Só cai no HTML quando não veio versão em texto. Alerta de marketplace quase
  // sempre manda as duas partes.
  const corpo = corpoTexto || textoDeHtml(daChave("html"));

  // O assunto do alerta é o título do projeto na maioria das plataformas.
  // Prefixá-lo como rótulo faz `extrairDeTexto` achar o título certo em vez da
  // primeira linha do cabeçalho do e-mail.
  const texto = assunto ? `Assunto: ${assunto}\n${corpo}` : corpo;

  if (!texto.trim()) {
    return NextResponse.json({ error: "E-mail sem corpo de texto legível." }, { status: 400 });
  }

  // 4) O inquilino. Explícito sempre que possível.
  const workspaceId = await resolverWorkspace(
    request.headers.get("x-radar-workspace") ?? textoOuNulo(campos.workspaceId) ?? textoOuNulo(campos.workspace),
  );
  if (!workspaceId) {
    // NÃO cai no "primeiro workspace do banco". Esse atalho já existe em outro
    // ponto da casa e está na vitrine como bomba-relógio de multi-tenant:
    // entrega o dado de um cliente no workspace errado, em silêncio. Recusar é a
    // resposta honesta.
    return NextResponse.json(
      {
        error:
          "Workspace não resolvido — mande `x-radar-workspace` com o id ou o slug do workspace. (O atalho de cair no primeiro workspace não existe aqui de propósito.)",
      },
      { status: 400 },
    );
  }

  // ⚠️ DADO NÃO CONFIÁVEL A PARTIR DAQUI. Este texto foi escrito por um
  // desconhecido e chegou por e-mail — o canal mais fácil de forjar que existe.
  // Ele é lido por regex e por corte de string, e nada mais: não é instrução,
  // não é comando, não entra em prompt de IA sem delimitação explícita, e não
  // vai para log (anúncio traz contato de terceiro com frequência — PII que não
  // pedimos).
  const url = normalizarUrl(typeof campos.url === "string" ? campos.url : primeiroLink(texto));
  const plataforma =
    typeof campos.plataforma === "string" && campos.plataforma.trim()
      ? campos.plataforma
      : detectarPlataforma(texto, url);

  const resultado = await registrarOportunidade({
    workspaceId,
    porta: "email",
    texto,
    url,
    plataforma,
  });

  if ("ok" in resultado && resultado.ok === false) {
    return NextResponse.json({ error: resultado.detalhe, motivo: resultado.motivo }, { status: 400 });
  }

  // Resposta MÍNIMA de propósito: quem chama aqui é um robô de e-mail, não uma
  // tela. Devolver o conteúdo captado ecoaria para fora, sem sessão, um texto
  // que pode carregar contato de terceiro.
  return NextResponse.json(
    { ok: true, id: resultado.oportunidade.id, jaExistia: resultado.jaExistia },
    { status: resultado.jaExistia ? 200 : 201 },
  );
}

function textoOuNulo(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * Aceita id OU slug do workspace, e CONFIRMA que ele existe antes de gravar.
 * Sem confirmação, um `workspaceId` inventado no cabeçalho criaria linhas órfãs
 * que nenhuma tela mostra e ninguém percebe.
 */
async function resolverWorkspace(chave: string | null): Promise<string | null> {
  const valor = (chave ?? "").trim();
  if (!valor) return null;
  const ws = await prisma.agencyWorkspace.findFirst({
    where: { OR: [{ id: valor }, { slug: valor }] },
    select: { id: true },
  });
  return ws?.id ?? null;
}

/**
 * HTML → texto, o suficiente para a extração funcionar. Não é um parser de
 * HTML e não precisa ser: `<script>`/`<style>` fora, tags fora, entidades
 * básicas destrocadas. O resultado só é lido por regex — nunca renderizado —,
 * então não há caminho de XSS aqui.
 */
function textoDeHtml(html: string): string {
  if (!html) return "";
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** O primeiro link http(s) do corpo. É o candidato a link do anúncio quando o
 *  encaminhador não manda o campo `url` separado. */
function primeiroLink(texto: string): string | null {
  const m = /https?:\/\/[^\s<>"')]+/i.exec(texto);
  return m ? m[0] : null;
}
