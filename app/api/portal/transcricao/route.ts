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
import { prisma } from "@/lib/db/client";
import { rateLimited } from "@/lib/security/rate-limit";
import { resolvePortalClient } from "@/lib/agency/persistence/portal-access-service";
import { tokenDoPortal } from "@/lib/agency/persistence/portal-cookie";
import {
  falhaDeTranscricao,
  MAX_BYTES_DE_AUDIO,
  type ResultadoDeTranscricao,
} from "@/lib/ai/transcricao";
import { transcreverPelaCasa, ditadoPorEnvioDisponivel } from "@/lib/ai/transcricao-servidor";

function resposta(r: ResultadoDeTranscricao, status = 200): NextResponse {
  return NextResponse.json(r, { status });
}

/**
 * GET — "este caminho existe?" Nada mais.
 *
 * A tela pergunta ANTES de mostrar o botão de gravar, e só quando o navegador
 * não tem reconhecimento nativo. Sem isto, o cliente aperta o microfone, fala
 * meio minuto e só então descobre que não havia provedor nenhum configurado —
 * a tela teria fingido um caminho que não existe. Devolve um booleano e mais
 * nada: nome de provedor é assunto da agência, não do cliente.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = tokenDoPortal(request, request.nextUrl.searchParams.get("token"));
  if (!token) return NextResponse.json({ ok: false, disponivel: false }, { status: 403 });
  const dono = await resolvePortalClient(token);
  if (!dono) return NextResponse.json({ ok: false, disponivel: false }, { status: 403 });

  const disponivel = await ditadoPorEnvioDisponivel({
    tipo: "workspace",
    workspaceId: dono.workspaceId,
  });
  return NextResponse.json({ ok: true, disponivel });
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

  // O token não diz só "pode entrar" — diz DE QUEM É a conta que vai pagar.
  // `resolvePortalClient` valida (inexistente/revogado/vencido) e devolve o
  // cliente e o WORKSPACE dele. Sem o workspace, `resolveProviderKey` cai num
  // `findFirst` global e a fala de um cliente é transcrita na chave de outra
  // agência. Latente com um workspace só; estrutural no segundo.
  const dono = await resolvePortalClient(token);
  if (!dono) return resposta(falhaDeTranscricao("acesso_negado"), 403);

  const arquivo = form.get("file");
  if (!arquivo || !(arquivo instanceof Blob)) {
    return resposta(falhaDeTranscricao("formato_invalido"), 400);
  }
  if (arquivo.size > MAX_BYTES_DE_AUDIO) {
    return resposta(falhaDeTranscricao("audio_grande"), 413);
  }

  // A chave vem do cofre (Integrações) do WORKSPACE do token, e só depois da
  // env — nunca hardcoded, nunca "a primeira que existir no banco". Qual
  // PROVEDOR paga deixou de ser decisão desta rota em 06/08/2026: a casa tenta
  // os configurados em cadeia (`transcreverPelaCasa`), então uma conta sem saldo
  // deixa de derrubar o microfone do cliente enquanto houver outra configurada.
  const { resultado: r, provedor } = await transcreverPelaCasa({
    arquivo,
    escopo: { tipo: "workspace", workspaceId: dono.workspaceId },
  });

  // A frase que o cliente lê em `chave_recusada`/`sem_saldo` diz "já fomos
  // avisados". Ou isso é verdade, ou é a casa mentindo para o cliente em nome
  // próprio — então o aviso EXISTE. São os dois únicos motivos que viram
  // registro: os outros são do mundo (rede, ritmo, áudio ruim) e encheriam a
  // linha do tempo de nada.
  //
  // `sem_saldo` entrou em 06/08/2026 pelo motivo mais simples do mundo: foi ele
  // que aconteceu, e ele passava calado — o cliente lia a frase e ninguém na
  // agência ficava sabendo.
  //
  // O que fica registrado é o MOTIVO e o PROVEDOR, nunca o áudio e nunca o texto.
  if (!r.ok && (r.motivo === "chave_recusada" || r.motivo === "sem_saldo")) {
    const causa =
      r.motivo === "sem_saldo"
        ? "está SEM CRÉDITO (a chave é válida; o conserto é pagar)"
        : "RECUSOU a chave (inválida, revogada ou sem permissão de áudio)";
    await prisma.activityEvent
      .create({
        data: {
          workspaceId: dono.workspaceId,
          clientId: dono.clientId,
          type: "transcricao_chave_recusada",
          message:
            `O provedor de transcrição (${provedor ?? "desconhecido"}) ${causa}. ` +
            "O ditado por ENVIO está fora do ar para este cliente — conferir em Integrações. " +
            "Quem estiver num navegador com reconhecimento nativo (iPhone/Safari, Chrome) continua ditando normalmente.",
        },
      })
      .catch(() => {
        /* best-effort: o registro não pode derrubar a resposta ao cliente */
      });
  }

  return resposta(r);
}
