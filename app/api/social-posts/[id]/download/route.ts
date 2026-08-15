// GET /api/social-posts/[id]/download — a peça inteira, na ordem, num zip.
//
// ── Para que serve (14/08/2026) ─────────────────────────────────────────────
//
// O caminho automático está fechado esperando a Meta e o CEO publica à mão.
// Sem esta rota, postar um carrossel de 6 telas era abrir 6 vezes
// `/api/media/<id>` (que serve `inline`), salvar cada imagem com o nome que o
// navegador inventar e lembrar de cabeça a sequência. A ordem do carrossel não
// se conserta depois de publicado — por isso ela vem no NOME do arquivo.
//
// ── A REGRA DE DONO É A MESMA DE `app/api/media/[id]`, e é DERIVAÇÃO ─────────
//
// Nenhum caminho aqui compara um id que veio do pedido com um id que veio do
// banco. Quem pede prova quem é (sessão da casa ou token de portal), e o dono
// entra DENTRO do `where` — um id de post de outro cliente simplesmente não é
// encontrado. E a recusa é **404, nunca 403**: 403 confirmaria que aquele id
// existe, e isso já é informação demais.
//
// A posse é conferida DUAS vezes, de propósito: no post e, de novo, em cada
// arquivo. `SocialPost.mediaUrlsJson` é texto livre — alguém que consiga
// escrever ali o id de uma mídia de outro cliente transformaria esta rota num
// leitor de arquivo alheio se ela confiasse no post. O segundo `where` fecha
// isso, e é o mesmo filtro que a rota de mídia usa.
//
// ── O que esta rota NÃO faz ─────────────────────────────────────────────────
//
// Não escreve nada. Não muda estado da peça. Não fala com plataforma nenhuma —
// baixar não é publicar, e marcar como publicado é outro caminho (o PATCH).

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";
import { validatePortalAccess } from "@/lib/agency/persistence/portal-access-service";
import { tokenDoPortal } from "@/lib/agency/persistence/portal-cookie";
import { lerArquivo } from "@/lib/agency/media/armazenamento";
import {
  MAX_BYTES_DO_PACOTE, apelido, diaDoNome, extensaoDoMime, montarPacote,
  nomeDaTela, nomeDoPacote, telasDaPeca,
} from "@/lib/agency/esteira/pacote-da-peca";

export const dynamic = "force-dynamic";

/** O filtro de dono, já pronto para entrar no `where`. Um por credencial. */
type FiltroDeDono =
  | { tipo: "sessao"; workspaceId: string }
  | { tipo: "portal"; clientId: string | null; clientRequestId: string | null };

function naoEncontrado(): NextResponse {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

/** O `where` do dono para `SocialPost` e para `MediaAsset` — os dois modelos
 *  carregam os mesmos três campos de posse, então a régua é uma só. */
function condicaoDoDono(dono: FiltroDeDono): Record<string, unknown> {
  if (dono.tipo === "sessao") return { workspaceId: dono.workspaceId };
  const ou: Array<Record<string, unknown>> = [];
  if (dono.clientId) ou.push({ clientId: dono.clientId });
  if (dono.clientRequestId) ou.push({ clientRequestId: dono.clientRequestId });
  return { OR: ou };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params;
  const soListar = request.nextUrl.searchParams.get("lista") === "1";
  // A4: query (compatibilidade) ou cookie httpOnly da sessão de portal.
  const token = tokenDoPortal(request, request.nextUrl.searchParams.get("token")) ?? "";

  // ── Quem está pedindo ─────────────────────────────────────────────────────
  let dono: FiltroDeDono | null = null;
  if (token) {
    const v = await validatePortalAccess(token);
    if (v.valid && v.record) {
      dono = {
        tipo: "portal",
        clientId: v.record.clientId ?? null,
        clientRequestId: v.record.clientRequestId ?? null,
      };
      // Token válido que não aponta para dono nenhum não abre nada. Fail-closed:
      // um `OR: []` no Prisma não filtra — devolveria a peça de qualquer um.
      if (!v.record.clientId && !v.record.clientRequestId) dono = null;
    }
  } else {
    const session = await getSession();
    if (session) dono = { tipo: "sessao", workspaceId: session.workspaceId };
  }
  if (!dono) return naoEncontrado();

  const post = await prisma.socialPost
    .findFirst({
      where: { id, ...condicaoDoDono(dono) },
      select: {
        id: true, caption: true, format: true, mediaUrl: true, mediaUrlsJson: true,
        scheduledFor: true, pillar: true,
      },
    })
    .catch(() => null);
  if (!post) return naoEncontrado();

  const telas = telasDaPeca(post);
  if (telas.length === 0) {
    return NextResponse.json(
      { error: "Esta peça ainda não tem arte guardada — não há o que baixar." },
      { status: 409 },
    );
  }

  const nome = apelido(post.pillar ? `${post.pillar} ${post.caption}` : post.caption);
  const dia = diaDoNome(post.scheduledFor);

  // ── Os arquivos, com a posse conferida OUTRA VEZ ──────────────────────────
  const ids = telas.map((t) => t.mediaId).filter((x): x is string => !!x);
  const linhas = ids.length
    ? await prisma.mediaAsset
        .findMany({
          where: { id: { in: ids }, ...condicaoDoDono(dono) },
          select: { id: true, mimeType: true, sizeBytes: true, storagePath: true },
        })
        .catch(() => null)
    : [];
  // Banco fora do ar não vira permissão nem pacote pela metade.
  if (linhas === null) {
    return NextResponse.json({ error: "Não consegui ler os arquivos desta peça agora." }, { status: 503 });
  }
  const porId = new Map(linhas.map((l) => [l.id, l]));

  const catalogo = telas.map((t) => {
    const linha = t.mediaId ? porId.get(t.mediaId) : undefined;
    return {
      ordem: t.ordem,
      origem: t.origem,
      mediaId: t.mediaId,
      arquivo: linha,
      nome: nomeDaTela(t.ordem, nome, extensaoDoMime(linha?.mimeType)),
    };
  });
  const faltando = catalogo.filter((c) => !c.arquivo);

  // ── `?lista=1`: o mesmo pacote, descrito, sem gastar leitura de disco ─────
  // Existe para a tela mostrar EXATAMENTE os nomes que vão sair no zip. Sem
  // isto, a tela inventaria nomes por conta própria e as duas listas
  // divergiriam no primeiro formato novo.
  if (soListar) {
    return NextResponse.json({
      postId: post.id,
      pacote: nomeDoPacote(nome, dia),
      completo: faltando.length === 0,
      arquivos: catalogo.map((c) => ({
        ordem: c.ordem,
        nome: c.nome,
        url: c.mediaId ? `/api/media/${c.mediaId}` : c.origem,
        // Arte que não mora nesta casa (link de Drive/CDN colado no post) não
        // entra no zip — e dizer isso é melhor que entregar um carrossel com
        // buraco no meio.
        nossa: !!c.arquivo,
      })),
    });
  }

  if (faltando.length > 0) {
    const posicoes = faltando.map((f) => f.ordem).join(", ");
    return NextResponse.json(
      {
        error:
          `Não consigo montar o pacote: a(s) tela(s) ${posicoes} não estão guardadas nesta casa ` +
          `(link externo, arquivo apagado, ou arte de outro cliente). Baixar o carrossel incompleto ` +
          `seria publicar uma sequência com buraco no meio.`,
      },
      { status: 409 },
    );
  }

  const total = catalogo.reduce((s, c) => s + (c.arquivo?.sizeBytes ?? 0), 0);
  if (total > MAX_BYTES_DO_PACOTE) {
    return NextResponse.json(
      { error: "Esta peça é grande demais para um pacote único. Baixe as telas uma a uma." },
      { status: 413 },
    );
  }

  const arquivos: Array<{ nome: string; bytes: Buffer }> = [];
  for (const c of catalogo) {
    const bytes = await lerArquivo(c.arquivo!.storagePath);
    if (!bytes) {
      // O registro existe e o byte não. É estado real (volume trocado, restore
      // parcial) e precisa ser dito — igual à rota de mídia, que devolve 410.
      return NextResponse.json(
        { error: `A tela ${c.ordem} está registrada mas o arquivo não está no armazenamento.` },
        { status: 410 },
      );
    }
    arquivos.push({ nome: c.nome, bytes });
  }

  const zip = montarPacote(arquivos);
  return new NextResponse(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(zip.length),
      // O nome do pacote é `[a-z0-9-]` por construção (`apelido`): nada que veio
      // da legenda de um cliente entra cru num cabeçalho.
      "Content-Disposition": `attachment; filename="${nomeDoPacote(nome, dia)}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
