// ─── Brand Book Analyzer — a porta HTTP da agência ───────────────────────────
//
// O trabalho de verdade mora em `lib/agency/brand/analise-do-brand-book.ts`.
// Aqui ficou só o que é DESTA porta: quem pode entrar.
//
// ── POR QUE O MOTOR SAIU DAQUI (15/08/2026) ─────────────────────────────────
//
// A primeira linha deste handler é `if (!session || session.clientId) → 403` —
// certo, e é para continuar assim: esta porta é da equipe.
//
// Só que o CLIENTE passou a mandar o brand book pelo portal, onde não existe
// sessão. Com o motor preso dentro desta rota, sobravam duas saídas ruins: ou o
// PDF do cliente chegava e ninguém o lia, ou se abria esta rota para o token de
// portal — e um token de cliente passaria a gastar a chave de IA da agência.
//
// Uma implementação, dois chamadores. A decisão de quem pode fica em cada porta.
//
// Formatos: PDF (documento nativo), PNG/JPG/WEBP (visão), SVG (XML), DOCX e
// PPTX (texto extraído do zip). O que ele extrai é TEXTO — paleta, tipografia,
// tom, público. Nenhum byte de logo sai de dentro do PDF.

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  analisarBrandBook,
  MAX_BYTES_DO_BRAND_BOOK,
} from "@/lib/ai/leitura-de-marca";

import type { BrandExtraction } from "@/lib/types/brand-extraction";
export type { BrandExtraction };

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session || session.clientId) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  let formData: FormData;
  try { formData = await request.formData(); }
  catch { return NextResponse.json({ ok: false, error: "Falha ao ler o upload." }, { status: 400 }); }

  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ ok: false, error: "Nenhum arquivo enviado." }, { status: 400 });
  if (file.size > MAX_BYTES_DO_BRAND_BOOK) {
    return NextResponse.json({ ok: false, error: `Arquivo muito grande — máximo 20 MB. Seu arquivo: ${(file.size / 1024 / 1024).toFixed(1)} MB` }, { status: 400 });
  }

  const r = await analisarBrandBook({
    bytes: Buffer.from(await file.arrayBuffer()),
    mimeType: file.type,
    fileName: file.name,
    // A chave é a do workspace de quem está logado. O custo da leitura é do
    // inquilino dono do arquivo — nunca de uma chave global.
    workspaceId: session.workspaceId,
  });

  if (!r.ok) return NextResponse.json({ ok: false, error: r.erro }, { status: r.status });

  return NextResponse.json({
    ok: true,
    extraction: r.extraction,
    fileName: file.name,
    fileType: r.tipoDoArquivo,
  });
}
