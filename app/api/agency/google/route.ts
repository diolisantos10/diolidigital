// GET /api/agency/google — O QUE A AGÊNCIA ENXERGA DO GOOGLE. SÓ LEITURA.
//
// ── QUEM VÊ ─────────────────────────────────────────────────────────────────
// `master` e `project_manager`, e ninguém mais. A tela mostra a conta Google de
// cada cliente e a fila de avaliações negativas dele — não é informação de
// staff de departamento. Fechado AQUI, na rota, e não só no menu: menu
// escondido é sugestão, rota fechada é trava.
//
// ── POR QUE NÃO EXISTE POST NESTE ARQUIVO ───────────────────────────────────
//
// Porque toda escrita que esta tela poderia querer — autorizar resposta
// automática a avaliação, publicar post no Perfil de Empresa, responder uma
// avaliação escalada — é ESCRITA NO GOOGLE, e a regra de 03/08/2026 é literal:
// nenhuma delas acontece sem parecer prévio do especialista `google`
// (PODE / NÃO PODE / PODE COM AJUSTE, citando `docs/plataformas/google/`).
// Não há parecer para nenhuma delas — a pasta `pareceres/` só tem o do Drive.
//
// Então a tela MOSTRA o interruptor e diz que ele está desligado e por quê. Um
// POST aqui seria a trava contornada pelo próprio PM que deve fazê-la cumprir.
//
// ── E POR QUE ELA NÃO CHAMA O GOOGLE ────────────────────────────────────────
// Nenhuma chamada à API do Google sai daqui. Uma tela de admin que consulta a
// plataforma a cada render é rajada de GET por F5 — a assinatura exata do que
// restringiu a conta de anúncios da agência na Meta em 03/08. Quem fala com o
// Google é o despertador, no ritmo dele; esta rota lê o banco.

import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api-guard";
import { retratoDoGoogle } from "@/lib/agency/google/retrato";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const { session, error } = await requireSession(["master", "project_manager"]);
  if (error) return error;

  const retrato = await retratoDoGoogle(session!.workspaceId);

  // Falha de LEITURA não vira 200 com contagem zero. Zero é uma afirmação sobre
  // o cliente ("ele não conectou nada"); "não consegui olhar" é uma afirmação
  // sobre nós — e em 07/08 confundir as duas fez o portal dizer "Drive não
  // conectado" para quem tinha acabado de conectar.
  const status = retrato.indisponivel.length > 0 ? 503 : 200;
  return NextResponse.json(retrato, { status });
}
