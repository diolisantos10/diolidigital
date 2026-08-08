// O MATERIAL DE MARCA DE UM CLIENTE, pelo lado da agência.
//
// GET  ?clientId=… → o que a casa REALMENTE consegue pôr numa peça daquele
//                    cliente, mais os arquivos que chegaram e não viraram
//                    material (os órfãos).
// GET  ?censo=1    → o censo dos ÓRFÃOS do workspace inteiro. É a resposta à
//                    pergunta "quantos arquivos o portal recebeu e a peça nunca
//                    viu?" — medida, nunca estimada.
//
// ── POR QUE ESTA ROTA EXISTE ────────────────────────────────────────────────
//
// Até 08/08/2026 o portal recebia arquivo desde 02/08 e NADA disso chegava numa
// peça: `materiaisDeMarca()` só enxergava o que vinha do Picker do Google. Os
// arquivos ficaram no volume, invisíveis. Esta rota é o que permite CONTÁ-LOS
// antes de decidir o que fazer com eles — e a decisão é do CEO, não da máquina:
// papel não declarado NÃO se adivinha.
//
// Ela é SOMENTE LEITURA. Não migra nada, não carimba nada, não apaga nada.
// A recuperação dos órfãos é ato deliberado com papel declarado por gente, pelo
// mesmo POST /api/media que todo mundo usa.

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api-guard";
import { prisma } from "@/lib/db/client";
import { segredoConfere } from "@/lib/security/crypto";
import { materiaisDeMarca } from "@/lib/agency/esteira/material-do-drive";
import { sugerirPapel, PAPEIS } from "@/lib/integrations/google/escolha-de-material";

export const dynamic = "force-dynamic";

/**
 * Os arquivos que o cliente mandou e que NÃO são material de marca.
 *
 * "Órfão" aqui quer dizer exatamente: `MediaAsset` de entrada (`kind: "inbound"`)
 * sem nenhuma linha de material apontando para ele. Foi recebido, foi guardado,
 * a equipe foi avisada — e a peça nunca o viu.
 */
async function orfaos(workspaceId: string, clientId?: string) {
  const assets = await prisma.mediaAsset.findMany({
    where: { workspaceId, kind: "inbound", ...(clientId ? { clientId } : {}) },
    select: {
      id: true, fileName: true, mimeType: true, sizeBytes: true,
      clientId: true, uploadedBy: true, createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const jaSaoMaterial = new Set(
    (await prisma.driveMaterial.findMany({
      where: { workspaceId, mediaAssetId: { not: null } },
      select: { mediaAssetId: true },
    })).map((m) => m.mediaAssetId!),
  );

  return assets
    .filter((a) => !jaSaoMaterial.has(a.id))
    .map((a) => {
      // O PALPITE VAI JUNTO, MARCADO COMO PALPITE. Ele serve para a tela já vir
      // preenchida e para o operador triar rápido — nunca para a casa decidir
      // sozinha. `null` quando o nome não diz nada, que é a resposta honesta
      // para "IMG_2831.jpg".
      const p = sugerirPapel(a.fileName, a.mimeType);
      return {
        mediaAssetId: a.id,
        nome: a.fileName,
        mimeType: a.mimeType,
        tamanhoBytes: a.sizeBytes,
        clientId: a.clientId,
        enviadoPor: a.uploadedBy,
        recebidoEm: a.createdAt,
        // ⚠️ PALPITE, não declaração. Quem confirma é gente.
        papelSugerido: p,
        rotuloSugerido: p ? PAPEIS[p].rotulo : null,
        semDono: a.clientId == null,
      };
    });
}

/**
 * A SEGUNDA PORTA DO CENSO: `Authorization: Bearer <CRON_SECRET>`.
 *
 * Mesmo padrão (e mesmo motivo) de `/api/admin/diagnostico-de-conexoes`: o banco
 * de produção mora num volume dentro do contêiner e ninguém o alcança de fora.
 * Contar os órfãos exigiria abrir um navegador e fazer login — e a pergunta
 * "quantos arquivos a peça nunca viu?" tem que ser respondível com um comando.
 *
 * **Segredo ausente do ambiente → NÃO abre.** Devolve `null`, e quem chama cai
 * na exigência de sessão. Rota que se abre sozinha quando a variável some não
 * tem trava nenhuma.
 *
 * Vale SÓ para o censo (leitura agregada, sem PII além do nome de arquivo) e SÓ
 * para GET. Nenhuma escrita passa por aqui.
 */
function segredoDeCronConfere(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const cabecalho = request.headers.get("authorization");
  const token = cabecalho?.startsWith("Bearer ") ? cabecalho.slice(7) : null;
  return segredoConfere(token, cronSecret);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const pediuCenso = url.searchParams.get("censo") === "1";

  // O censo aceita as DUAS portas; o resto exige sessão da agência.
  let workspaceId: string;
  if (pediuCenso && segredoDeCronConfere(request)) {
    const ws = await prisma.agencyWorkspace.findFirst({ select: { id: true } });
    if (!ws) return NextResponse.json({ error: "nenhum workspace" }, { status: 404 });
    workspaceId = ws.id;
  } else {
    const { session, error } = await requireSession(["master", "project_manager"]);
    if (error) return error;
    workspaceId = session.workspaceId;
  }

  const clientId = url.searchParams.get("clientId")?.trim() || "";

  // ── O CENSO DOS ÓRFÃOS ────────────────────────────────────────────────────
  if (pediuCenso) {
    const lista = await orfaos(workspaceId);
    const clientes = await prisma.client.findMany({
      where: { workspaceId }, select: { id: true, name: true },
    });
    const nome = new Map(clientes.map((c) => [c.id, c.name]));

    const porCliente: Record<string, { nome: string; total: number }> = {};
    let semDono = 0;
    let comPalpite = 0;
    for (const o of lista) {
      if (!o.clientId) { semDono++; continue; }
      const k = o.clientId;
      porCliente[k] ??= { nome: nome.get(k) ?? "(cliente removido)", total: 0 };
      porCliente[k].total++;
      if (o.papelSugerido) comPalpite++;
    }

    return NextResponse.json({
      censo: {
        totalOrfaos: lista.length,
        // Sem cliente dono não há peça em que entrar. Estes NÃO são
        // recuperáveis sem alguém dizer de quem são.
        semDono,
        // Onde o nome do arquivo sugere um papel. NÃO é "recuperável
        // automaticamente": é só onde a triagem humana vai ser rápida.
        comPalpiteDePapel: comPalpite,
        semPalpiteDePapel: lista.length - semDono - comPalpite,
        porCliente,
      },
      // A lista inteira, para o CEO decidir arquivo por arquivo.
      orfaos: lista,
      aviso:
        "Nada aqui foi migrado. Papel não declarado não se adivinha: cada arquivo precisa de alguém dizendo o que é antes de entrar numa peça.",
    });
  }

  if (!clientId) {
    return NextResponse.json({ error: "informe clientId ou censo=1" }, { status: 400 });
  }

  const cliente = await prisma.client.findFirst({
    where: { id: clientId, workspaceId }, select: { id: true, name: true },
  });
  if (!cliente) return NextResponse.json({ error: "Cliente inválido" }, { status: 404 });

  // O que a peça REALMENTE enxerga — a mesma função que `artes.ts` e `logo.ts`
  // chamam. Duas leituras adjacentes divergem; esta tela lê a de verdade.
  const usaveis = await materiaisDeMarca(clientId);
  const naoUsados = await orfaos(workspaceId, clientId);

  return NextResponse.json({
    cliente,
    // Quando isto vem vazio, a peça sai sem logo e sem foto real. É esse o
    // número que interessa.
    materiais: usaveis,
    temLogo: usaveis.some((m) => m.papel === "logo"),
    orfaos: naoUsados,
  });
}
