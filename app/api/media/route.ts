// POST /api/media — o cliente (ou a agência) manda um arquivo.
//
// Aceita dois portadores de identidade, e a diferença importa:
//   • `token` do portal → é o CLIENTE enviando. O dono do arquivo é derivado do
//     token, nunca do corpo da requisição. Cliente não escolhe de quem é o
//     arquivo que ele manda.
//   • sessão da agência → é a equipe enviando em nome de um cliente.
//
// Sem um dos dois, 401. Não existe upload anônimo: arquivo sem dono é arquivo
// que ninguém consegue apagar quando o cliente pedir exclusão de dados.
//
// ── 05/08/2026: o upload deixou de ser um beco ───────────────────────────────
// Duas coisas erradas moravam aqui e as duas atingiam o MESMO cliente — o
// criado direto, sem `ClientRequestDb` (o caso Foocci):
//
//  1. O workspace saía de `agencyWorkspace.findFirst()` quando o token não
//     tinha solicitação. Ou seja: o arquivo do cliente era arquivado num
//     workspace ARBITRÁRIO — o primeiro do banco. `resolvePortalClient` já
//     devolvia cliente E workspace derivados do token e não era usado.
//  2. O arquivo virava `MediaAsset` e parava ali: não tocava `MaterialRequest`,
//     não retomava produção, não avisava ninguém — enquanto a tela dizia ao
//     cliente "A equipe já foi avisada". Produção travada por falta de logo
//     continuava travada depois de o logo chegar.
//
// O que a rota faz agora, nessa ordem: deriva o dono do token (workspace
// incluído), guarda o arquivo, e SÓ ENTÃO chama a esteira. A chamada é
// best-effort e nunca transforma um upload bem-sucedido em erro: o arquivo do
// cliente já está salvo, e mandá-lo enviar de novo seria mentira.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";
import { validatePortalAccess, resolvePortalClient } from "@/lib/agency/persistence/portal-access-service";
import { tokenDoPortal } from "@/lib/agency/persistence/portal-cookie";
import { guardarArquivo, MAX_BYTES_POR_ARQUIVO } from "@/lib/agency/media/armazenamento";
import { rateLimited } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Upload é caro (disco + banda). Cap por IP para um envio em massa não
  // encher o volume — que é o mesmo do banco.
  const limited = rateLimited(request, "media-upload", 20, 60_000);
  if (limited) return limited as NextResponse;

  let form: FormData;
  try { form = await request.formData(); } catch {
    return NextResponse.json({ error: "Envio inválido" }, { status: 400 });
  }

  const arquivo = form.get("file");
  if (!arquivo || !(arquivo instanceof Blob)) {
    return NextResponse.json({ error: "Nenhum arquivo recebido" }, { status: 400 });
  }
  if (arquivo.size > MAX_BYTES_POR_ARQUIVO) {
    const mb = Math.round(MAX_BYTES_POR_ARQUIVO / 1024 / 1024);
    return NextResponse.json({ error: `Arquivo maior que ${mb} MB` }, { status: 413 });
  }

  // A4: campo do form (compatibilidade) ou cookie httpOnly da sessão de portal.
  const token = tokenDoPortal(
    request,
    typeof form.get("token") === "string" ? String(form.get("token")) : "",
  ) ?? "";

  // ── Quem está enviando, e de quem é o arquivo ──────────────────────────────
  let workspaceId: string | null = null;
  let clientRequestId: string | null = null;
  let clientId: string | null = null;
  let uploadedBy = "cliente";

  if (token) {
    const v = await validatePortalAccess(token);
    if (!v.valid || !v.record) return NextResponse.json({ error: "Acesso inválido ou expirado" }, { status: 401 });
    const acesso = v.record;
    // O DONO VEM DO TOKEN. Se viesse do corpo, um cliente poderia anexar um
    // arquivo à pasta de outro só mudando um campo.
    clientRequestId = acesso.clientRequestId ?? null;
    clientId = acesso.clientId ?? null;
    const req = clientRequestId
      ? await prisma.clientRequestDb.findUnique({ where: { id: clientRequestId }, select: { workspaceId: true } })
      : null;
    workspaceId = req?.workspaceId ?? null;
    if (!workspaceId || !clientId) {
      // O DONO COMPLETO vem do token, sempre. Antes, a falta do workspace caía
      // em `agencyWorkspace.findFirst()` — o primeiro workspace do banco, que
      // no caso do cliente direto (sem solicitação) é um workspace qualquer.
      // Arquivo do cliente arquivado na casa errada não é detalhe: é o dado
      // dele fora da fronteira do inquilino a que ele pertence.
      const dono = await resolvePortalClient(token);
      workspaceId = workspaceId ?? dono?.workspaceId ?? null;
      clientId = clientId ?? dono?.clientId ?? null;
    }
  } else {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    workspaceId = session.workspaceId;
    uploadedBy = "equipe";
    // Aqui o corpo PODE dizer de quem é: quem manda está autenticado como
    // equipe da agência e tem direito de anexar em nome do cliente —
    // DO PRÓPRIO WORKSPACE. "Autenticado" não é "dono de qualquer id": sem esta
    // conferência, a equipe do workspace A anexa um arquivo na pasta de um
    // cliente do workspace B só digitando o id dele, e o arquivo aparece no
    // portal do outro inquilino.
    const cr = form.get("clientRequestId");
    const cl = form.get("clientId");
    if (typeof cr === "string" && cr) {
      const pedido = await prisma.clientRequestDb.findFirst({
        where: { id: cr, workspaceId: session.workspaceId }, select: { id: true },
      });
      if (!pedido) return NextResponse.json({ error: "Solicitação inválida" }, { status: 400 });
      clientRequestId = cr;
    }
    if (typeof cl === "string" && cl) {
      const cliente = await prisma.client.findFirst({
        where: { id: cl, workspaceId: session.workspaceId }, select: { id: true },
      });
      if (!cliente) return NextResponse.json({ error: "Cliente inválido" }, { status: 400 });
      clientId = cl;
    }
  }

  if (!workspaceId) return NextResponse.json({ error: "Workspace não resolvido" }, { status: 409 });

  const bytes = Buffer.from(await arquivo.arrayBuffer());
  const nome = (arquivo as File).name || "arquivo";
  const mime = arquivo.type || "application/octet-stream";

  const r = await guardarArquivo({
    bytes, fileName: nome, mimeType: mime,
    workspaceId, clientRequestId, clientId,
    kind: "inbound", uploadedBy,
  });

  if (!r.ok) {
    // O motivo vai em linguagem de gente: quem está do outro lado é a dona do
    // salão, não um desenvolvedor lendo código de erro.
    return NextResponse.json({ error: r.motivo, codigo: r.erro }, { status: 400 });
  }

  // ── O ARQUIVO VIRA MATERIAL DE MARCA — o meio da ponte (08/08/2026) ───────
  //
  // Até hoje esta rota guardava os bytes, fechava o pedido de material e parava
  // aí. `materiaisDeMarca()` — a ÚNICA porta de material para dentro de uma peça
  // — nunca via nada disso, porque só lia o que veio do Picker do Google.
  // Resultado: o CEO arrastava o logo, o sistema dizia "recebido", e a peça saía
  // com o nome do cliente escrito em fonte comum, com o arquivo no disco.
  //
  // O papel vem do formulário, DECLARADO por quem enviou — cliente ou operador.
  // Sem papel não há material: o arquivo fica guardado e o pedido fecha, mas ele
  // não entra em peça nenhuma. A casa não adivinha o que é "IMG_2831.jpg".
  //
  // Vale para as DUAS portas (portal e admin da agência): uma só implementação,
  // porque duas cópias da mesma regra divergem — é o defeito nº 2 do incidente
  // do Drive.
  const papelBruto = form.get("papel");
  let materialDeMarca: { registrado: boolean; papel?: string; motivo?: string } | null = null;

  // ── A CAIXA "NÃO SEI O QUE É" (10/08/2026) ────────────────────────────────
  //
  // Desenho do CEO: o portal passou a ter caixas pré-classificadas, e uma delas
  // é a triagem — para o cliente que não sabe em qual categoria o arquivo cai.
  //
  // Sem esta porta, o arquivo dele chegaria SEM papel e ficaria guardado em
  // silêncio: nem registrado como material, nem visível para ninguém. O silêncio
  // é justamente o que a caixa veio evitar — ele mandou o arquivo, e alguém
  // precisa saber que ele está esperando classificação.
  //
  // A triagem NÃO grava papel. Papel é declaração, e "não sei" é a ausência
  // declarada dela — inventar um aqui faria a peça obedecer a um chute do
  // sistema, que é pior do que o arquivo esperar.
  const pediuTriagem = form.get("triagem") === "1";
  if (pediuTriagem && !(typeof papelBruto === "string" && papelBruto.trim())) {
    materialDeMarca = {
      registrado: false,
      motivo: "Recebemos. Você disse que não sabia o que era, então a nossa equipe vai classificar.",
    };
    await prisma.activityEvent.create({
      data: {
        workspaceId,
        clientId,
        type: "material_para_triagem",
        message: `Arquivo recebido sem classificação (o cliente escolheu "não sei o que é"): ${nome}`,
      },
    }).catch(() => { /* best-effort: o registro não pode derrubar o envio */ });
  }

  if (typeof papelBruto === "string" && papelBruto.trim()) {
    const { registrarMaterialEnviado } = await import("@/lib/agency/esteira/material-do-drive");
    const reg = await registrarMaterialEnviado({
      workspaceId,
      clientId,
      mediaAssetId: r.arquivo.id,
      fileName: nome,
      mimeType: mime,
      tamanhoBytes: r.arquivo.sizeBytes,
      papel: papelBruto.trim(),
    });
    materialDeMarca = reg.ok
      ? { registrado: true, papel: reg.papel }
      : { registrado: false, motivo: reg.erro };

    // ── O BRAND BOOK É LIDO — DEPOIS DE GUARDADO, NUNCA ANTES ──────────────
    //
    // A ordem é a garantia: os bytes já estão no disco e a linha de material já
    // existe quando esta leitura começa. Uma falha do modelo, um timeout ou uma
    // chave sem crédito custam a ANÁLISE, nunca o arquivo do cliente.
    //
    // E não bloqueia a resposta: ler um PDF leva até 90 segundos, e o cliente
    // não pode ficar com a tela girando por causa disso. O estado fica visível
    // ("analisando") desde o primeiro instante, gravado ANTES de a chamada sair
    // — e tem prazo, para nunca virar um estado eterno.
    //
    // O que a leitura produz é SUGESTÃO. Ela não toca a ficha de marca: quem
    // aplica é `POST /api/agency/clients/[id]/marca/do-brand-book`, com revisão
    // humana e com a trava que impede sobrescrever o que o dono já respondeu.
    if (reg.ok && reg.papel === "manual_de_marca" && clientId) {
      const { lerBrandBookRecebido } = await import("@/lib/agency/brand/brand-book-recebido");
      const dono = { workspaceId, clientId, materialId: reg.driveMaterialId ?? "" };
      if (dono.materialId) {
        void lerBrandBookRecebido({
          ...dono,
          arquivo: nome,
          bytes,
          mimeType: mime,
        }).catch((e) => console.error("[media] leitura do brand book falhou", e));
      }
    }
  }

  // ── O ARQUIVO DESTRAVA A ESTEIRA ──────────────────────────────────────────
  // Só no caminho do CLIENTE: quando é a equipe quem sobe (sessão), ela tem a
  // tela de materiais para marcar o pedido certo, e adivinhar por ela seria pior.
  // Best-effort de propósito — ver o cabeçalho.
  let material: Awaited<ReturnType<typeof import("@/lib/agency/esteira/materiais").materialEnviadoPeloCliente>> | null = null;
  if (uploadedBy === "cliente") {
    try {
      const { materialEnviadoPeloCliente } = await import("@/lib/agency/esteira/materiais");
      material = await materialEnviadoPeloCliente({
        workspaceId,
        clientId,
        clientRequestId,
        arquivo: { fileName: nome, mimeType: mime },
        assetId: r.arquivo.id,
      });
      // O arquivo passa a morar NO PROJETO que o pediu. Sem este carimbo ele
      // fica só na pasta do cliente, e quem produz não sabe que ele existe.
      if (material.projectId) {
        await prisma.mediaAsset.update({
          where: { id: r.arquivo.id },
          data: { projectId: material.projectId },
        }).catch(() => { /* best-effort */ });
      }
    } catch (e) {
      console.error("[media] envio do cliente não chegou à esteira", e);
    }
  }

  return NextResponse.json({
    ok: true,
    arquivo: r.arquivo,
    // A verdade sobre o material: entrou na peça ou não, e por quê. A tela
    // precisa poder dizer "o time já pode usar isto" — ou pedir o que falta —
    // sem prometer nada que a casa não fez.
    ...(materialDeMarca ? { materialDeMarca } : {}),
    // A verdade do que aconteceu depois do upload, para a tela poder falar sem
    // prometer: a equipe foi avisada? destravou? ainda falta alguma coisa?
    ...(material
      ? {
          material: {
            equipeAvisada: material.equipeAvisada,
            aindaFaltam: material.aindaFaltam,
            producaoRetomada: material.producaoRetomada,
            atendeuPedido: material.materialRequestId != null,
          },
        }
      : {}),
  }, { status: 201 });
}
