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
import { renderizadorDisponivel } from "@/lib/agency/design/renderizar";
import { resolveProviderKey } from "@/lib/ai/resolve-key";
import { estadoDoCanalDeEmail } from "@/lib/email/estado-do-canal";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const { error, session } = await requireSession();
  if (error) return error;

  const [temFfmpeg, chaveImagem, renderizador] = await Promise.all([
    ffmpegDisponivel().catch(() => false),
    resolveProviderKey("openai", session?.workspaceId).then((r) => !!r).catch(() => false),
    renderizadorDisponivel().catch(() => ({ disponivel: false, caminho: null })),
  ]);

  const dominioPublico = Boolean(
    process.env.PUBLIC_BASE_URL?.trim() || process.env.RAILWAY_PUBLIC_DOMAIN?.trim(),
  );
  const podeAssinarLink = Boolean(process.env.AUTH_SECRET?.trim() || process.env.JWT_SECRET?.trim());
  const canalDeEmail = estadoDoCanalDeEmail();

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
      // ── O MOLDE DE MARCA, E POR QUE ELE PRECISA APARECER AQUI ─────────────
      // Achado montando o CityJobs (07/08/2026): em produção o `import`
      // de `playwright` FALHA — a biblioteca está em `devDependencies`, e o
      // build de produção não a instala. Consequência: `montarPeca` nunca roda,
      // e TODA peça sai como a foto crua da IA — sem título, sem a cor da
      // marca, sem o selo e sem a assinatura de rodapé.
      //
      // Ou seja: o motor inteiro de 05–06/08 ("o modelo faz FOTO, o código faz
      // LAYOUT") estava desligado em produção, e a única testemunha era o
      // `lastError` DENTRO de cada post — um campo que, nas palavras do próprio
      // `publicacao.ts`, "para ver é preciso já suspeitar e ir procurar".
      //
      // `renderizadorDisponivel()` já existia com este propósito escrito no
      // docstring e não tinha chamador. Agora tem: a peça continua saindo (foto
      // sem texto é degradação declarada, não erro), mas a agência PASSA A
      // SABER que está entregando sem a identidade do cliente.
      id: "montar-molde",
      o_que_faz: "Aplicar o molde de marca na peça: título, cor, selo e assinatura de rodapé",
      pronta: renderizador.disponivel,
      sem_isso: "a peça sai como a foto crua da IA — sem texto, sem a cor da marca e sem assinatura. Ela é entregue assim mesmo, e o cliente recebe uma imagem genérica assinada por ninguém",
      // 08/08/2026: esta linha dizia "playwright em dependencies (hoje está em
      // devDependencies)". Ele saiu de `devDependencies` em 07/08 e a frase
      // ficou — mandando três agentes procurarem um problema já resolvido. O
      // texto agora nomeia as DUAS metades reais, e a segunda é a que custou
      // dias: o pacote precisa CHEGAR inteiro ao contêiner, e o rastreador do
      // `output: "standalone"` não copia `browsers.json` sozinho.
      depende_de:
        "binário do Chromium no runtime (`railpack.json → deploy.aptPackages`) + o pacote `playwright` chegando INTEIRO ao contêiner (`next.config.ts → outputFileTracingIncludes`, senão falta `playwright-core/browsers.json`)",
      onde_achei_o_navegador: renderizador.caminho,
    },
    {
      // ── 16/08/2026 — O SILÊNCIO DO E-MAIL VIRA ACHADO ─────────────────────
      // No piloto, `/api/brain/client-requests` registrou "confirmation e-mail
      // skipped — RESEND_API_KEY not set" e nada mais aconteceu. Um cliente real
      // mandaria briefing + PDFs e ficaria sem sinal nenhum.
      //
      // A chave é do CEO e não é assunto de código. O que ERA assunto de código
      // é o estado morar só num log rotativo: aqui ele passa a ser uma linha
      // deste registro, que é onde a casa pergunta "e consigo trabalhar?".
      id: "avisar-cliente-por-email",
      o_que_faz: "Confirmar por e-mail que o briefing do cliente chegou, e avisá-lo dos próximos passos",
      pronta: canalDeEmail.ligado,
      sem_isso:
        "quem manda briefing pelo site não recebe confirmação por e-mail. O briefing NÃO se perde (ele é " +
        "gravado e confirmado na conversa do portal), mas o cliente fica sem sinal na caixa dele",
      depende_de: canalDeEmail.oQueConfigurar,
      resumo: canalDeEmail.resumo,
      remetente_compartilhado: canalDeEmail.remetenteCompartilhado,
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
