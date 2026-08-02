// GET /api/capacidades — o que esta instância CONSEGUE fazer de verdade.
//
// Existe porque a agência passou a depender de coisas que não são código: um
// binário no runtime (ffmpeg), uma chave de imagem, um domínio público para a
// Meta alcançar a mídia. Cada uma delas some silenciosamente — o app sobe, os
// testes passam, e a falha só aparece quando um cliente pagante não recebe a
// peça dele.
//
// O `/api/health` responde "estou vivo". Este responde "e consigo trabalhar".
//
// Separado do health de propósito: o healthcheck do Railway precisa ser leve e
// sempre-200; este aqui roda um processo e consulta o banco, e um problema aqui
// NÃO deve derrubar o deploy — deve aparecer no painel.
//
// Exige sessão: a lista de capacidades diz quais integrações existem e quais
// faltam, e isso é mapa de superfície de ataque para quem estiver de fora.

import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api-guard";
import { ffmpegDisponivel } from "@/lib/agency/media/video";
import { resolveProviderKey } from "@/lib/ai/resolve-key";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const { error, session } = await requireSession();
  if (error) return error;

  const [temFfmpeg, chaveImagem] = await Promise.all([
    ffmpegDisponivel().catch(() => false),
    resolveProviderKey("openai", session?.workspaceId).then((r) => !!r).catch(() => false),
  ]);

  const dominioPublico = Boolean(
    process.env.PUBLIC_BASE_URL?.trim() || process.env.RAILWAY_PUBLIC_DOMAIN?.trim(),
  );
  const podeAssinarLink = Boolean(process.env.AUTH_SECRET?.trim() || process.env.JWT_SECRET?.trim());

  const capacidades = [
    {
      id: "editar-video",
      o_que_faz: "Transformar o vídeo bruto do cliente em reel",
      pronta: temFfmpeg,
      sem_isso: "reel não é produzido — o material do cliente fica parado no armazenamento",
      depende_de: "ffmpeg no runtime (nixpacks.toml)",
    },
    {
      id: "gerar-arte",
      o_que_faz: "Produzir a arte do post e o símbolo do logo",
      pronta: chaveImagem,
      sem_isso: "post fica sem imagem e NÃO vai ao ar — o Instagram exige mídia",
      depende_de: "chave OpenAI com acesso a modelo de imagem",
    },
    {
      id: "meta-buscar-midia",
      o_que_faz: "A Meta buscar a mídia nos servidores dela para publicar",
      pronta: dominioPublico && podeAssinarLink,
      sem_isso: "nada publica e nenhum anúncio tem criativo",
      depende_de: "PUBLIC_BASE_URL (ou domínio do Railway) + AUTH_SECRET",
    },
  ];

  const faltando = capacidades.filter((c) => !c.pronta);
  return NextResponse.json({
    // O número que importa no painel: quantas coisas a agência NÃO consegue
    // fazer agora, mesmo estando no ar.
    tudoPronto: faltando.length === 0,
    faltando: faltando.length,
    capacidades,
  });
}
