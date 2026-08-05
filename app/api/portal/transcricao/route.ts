// POST /api/portal/transcricao — ditado por voz do CLIENTE, no portal.
//
// Autenticada pelo TOKEN DE PORTAL (cookie httpOnly ou campo do form), como o
// resto de /api/portal/*. Não usa sessão: quem chama aqui é o cliente, que
// nunca tem login.
//
// POR QUE NÃO REUSAR /api/sdr/transcribe: aquela rota é PÚBLICA de propósito
// (a página /briefing é aberta). Gastar chave de IA numa rota aberta já é um
// risco assumido lá; estendê-lo para o portal seria assumi-lo de novo sem
// necessidade — aqui existe credencial, então a credencial trava. O motor de
// transcrição é o MESMO (`lib/ai/transcricao.ts`), não há segunda via.
//
// PII: o áudio existe só dentro do ciclo da requisição — não é gravado em
// disco, em banco nem em log. O texto transcrito NUNCA é logado: é fala do
// cliente e pode conter nome, telefone e valor.
//
// CONTRATO: nunca lança e nunca devolve erro cru. Sempre
// `{ ok:true, texto }` ou `{ ok:false, motivo, mensagem }` — o cliente da tela
// já recebe a frase em português.

import { NextRequest, NextResponse } from "next/server";
import { rateLimited } from "@/lib/security/rate-limit";
import { resolveProviderKey } from "@/lib/ai/resolve-key";
import { validatePortalAccess } from "@/lib/agency/persistence/portal-access-service";
import { tokenDoPortal } from "@/lib/agency/persistence/portal-cookie";
import {
  transcreverAudio,
  falhaDeTranscricao,
  MAX_BYTES_DE_AUDIO,
  type ResultadoDeTranscricao,
} from "@/lib/ai/transcricao";

function resposta(r: ResultadoDeTranscricao, status = 200): NextResponse {
  return NextResponse.json(r, { status });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Teto de ritmo mesmo com credencial: um portal aberto num loop é dinheiro
  // saindo. 15/min por IP cobre o uso humano com folga.
  const limitado = rateLimited(request, "portal-transcricao", 15, 60_000);
  if (limitado) return resposta(falhaDeTranscricao("ritmo"), 429);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return resposta(falhaDeTranscricao("formato_invalido"), 400);
  }

  const tokenDoCorpo = form.get("token");
  const token = tokenDoPortal(request, typeof tokenDoCorpo === "string" ? tokenDoCorpo : null);
  if (!token) return resposta(falhaDeTranscricao("acesso_negado"), 403);

  const acesso = await validatePortalAccess(token);
  if (!acesso.valid) return resposta(falhaDeTranscricao("acesso_negado"), 403);

  const arquivo = form.get("file");
  if (!arquivo || !(arquivo instanceof Blob)) {
    return resposta(falhaDeTranscricao("formato_invalido"), 400);
  }
  if (arquivo.size > MAX_BYTES_DE_AUDIO) {
    return resposta(falhaDeTranscricao("audio_grande"), 413);
  }

  // A chave vem do cofre (Integrações) e só depois da env — nunca hardcoded.
  const chave = await resolveProviderKey("openai");
  if (!chave) return resposta(falhaDeTranscricao("sem_chave"));

  const r = await transcreverAudio({ apiKey: chave.apiKey, arquivo });
  return resposta(r);
}
