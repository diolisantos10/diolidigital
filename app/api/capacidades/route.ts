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
import { medidorDeFundoDisponivel } from "@/lib/agency/design/medir-fundo";
import { resolveProviderKey } from "@/lib/ai/resolve-key";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const { error, session } = await requireSession();
  if (error) return error;

  const [temFfmpeg, chaveImagem, renderizador, medidor] = await Promise.all([
    ffmpegDisponivel().catch(() => false),
    resolveProviderKey("openai", session?.workspaceId).then((r) => !!r).catch(() => false),
    renderizadorDisponivel().catch(() => ({ disponivel: false, caminho: null })),
    medidorDeFundoDisponivel().catch(() => ({ disponivel: false, motivo: null })),
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
      // ── MEDIR PIXEL (15/08/2026) ──────────────────────────────────────────
      // Nasceu do mesmo defeito do `montar-molde`, sete dias depois: `sharp`
      // não estava em `dependencies` — chegava como dependência OPCIONAL do
      // `next`, que é justamente a que o npm tem permissão de não instalar.
      // Sem ela o portão do fundo, que é fail closed, reprova TODA peça com
      // fundo gerado, e reprova DEPOIS de a imagem ter sido paga.
      //
      // Esta linha existe para que a resposta seja medida de dentro do
      // contêiner, e não deduzida do package.json de quem pergunta.
      id: "medir-fundo",
      o_que_faz: "Medir o pixel do fundo gerado para barrar clipart e cor chapada antes de a peça sair",
      pronta: medidor.disponivel,
      sem_isso: "o portão do fundo não consegue medir e reprova TODA peça com fundo gerado — depois de a imagem já ter sido paga, três vezes por peça. A produção de arte para de graça na guarda de `produzirArtesPendentes`",
      depende_de:
        "`sharp` em `dependencies` (não como dependência opcional do next) + `node_modules/sharp/**/*` e `node_modules/@img/**/*` chegando ao contêiner por `next.config.ts → outputFileTracingIncludes`",
      por_que_nao: medidor.motivo,
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
