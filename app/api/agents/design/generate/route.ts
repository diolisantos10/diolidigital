// Esta rota passou a falar com o MOTOR (`lib/ai/generate`), não com a Anthropic.
//
// Antes ela montava o `fetch` para `api.anthropic.com` na mão, com o provedor
// "claude" escrito no código. Três coisas se perdiam nisso, e nenhuma é
// cosmética:
//
//   1. A CONTA. Toda chamada daqui saía de graça no relatório: sem `AIRunLog`,
//      sem tokens, sem dono. "Quanto custou este cliente" respondia menos do que
//      a verdade, e a diferença crescia sozinha.
//   2. A ESCOLHA DE PROVEDOR POR CLIENTE (`ClientAiProvider`). O cliente fixado
//      no Gemini era atendido pelo Claude assim mesmo — a tela dizia uma coisa e
//      o servidor fazia outra.
//   3. A RESERVA. Claude fora do ar = rota fora do ar, com as outras chaves
//      conectadas paradas do lado.
// POST /api/agents/design/generate
// Calls Claude to generate enhanced visual briefs for each post/design request.
// Returns VisualBrief[] shape expected by the design-agent page.

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/api-guard";
import { generate } from "@/lib/ai/generate";
import { deveBloquearMutacaoCrossSite } from "@/lib/security/navegacao-cross-site";


interface ParsedPost {
  postId: number;
  title: string;
  format: string;
  contentObjective: string;
  keyCopy: string;
  cta: string;
  creativeDirection: string;
  imagePrompt: string;
  designNotes: string;
}

interface BrandBrain {
  visualStyle?: string;
  toneOfVoice?: string;
  brandRules?: string;
  thingsToAvoid?: string;
  targetAudience?: string;
  positioning?: string;
}

export async function POST(req: NextRequest) {
  // SEGURANÇA: exige sessão — antes, anônimo queimava a chave Claude da agência.
  const guard = await requireSession();
  if (guard.error) return guard.error;

  // FAIXA 1 do CSRF: gasta a chave de IA da agência a cada chamada.
  if (deveBloquearMutacaoCrossSite(req)) {
    return NextResponse.json({ error: "Origem não confiável para esta ação." }, { status: 403 });
  }

  // `clientId`/`projectId` são opcionais e usados SÓ para dar dono ao gasto.
  // Ver social/generate: se a tela não mandar, o custo entra sem cliente — e
  // isso está anotado em docs/pendencias.md, não preenchido por adivinhação.
  const body = await req.json() as {
    posts: ParsedPost[]; brandName: string; brandBrain?: BrandBrain;
    clientId?: string; projectId?: string;
  };
  const { posts, brandName, brandBrain } = body;

  if (!posts || posts.length === 0) {
    return NextResponse.json({ ok: false, error: "Nenhum post enviado" }, { status: 400 });
  }

  const brandCtx = brandBrain
    ? `Visual: ${brandBrain.visualStyle || "não definido"}. Tom: ${brandBrain.toneOfVoice || "não definido"}. Público: ${brandBrain.targetAudience || "não definido"}. Regras: ${brandBrain.brandRules || "não definido"}. Evitar: ${brandBrain.thingsToAvoid || "não definido"}.`
    : "Brand Brain não disponível — usar boas práticas gerais de design.";

  const postsJson = posts.map((p) => ({
    postId: p.postId,
    title: p.title,
    format: p.format,
    objective: p.contentObjective,
    keyCopy: p.keyCopy,
    cta: p.cta,
    creativeDirection: p.creativeDirection,
    imagePrompt: p.imagePrompt,
  }));

  const systemPrompt = `Você é o Design Agent da Dioli Agência Digital. Você cria visual briefs detalhados e prontos para o designer executar.
Você responde APENAS com JSON válido. Nenhum texto fora do JSON.
Todo conteúdo em PORTUGUÊS BRASILEIRO, exceto prompts de imagem que devem ser em INGLÊS.`;

  const userPrompt = `Crie visual briefs completos para cada post abaixo.

MARCA: ${brandName}
BRAND BRAIN: ${brandCtx}

POSTS:
${JSON.stringify(postsJson, null, 2)}

Responda com JSON no formato exato:

{
  "briefs": [
    {
      "postId": 1,
      "title": "título do post",
      "format": "formato (Carrossel/Reels/Feed único/Stories)",
      "visualConcept": "Parágrafo descritivo e criativo do conceito visual. Deve ser específico para a marca ${brandName} e o objetivo do post. Mínimo 3 frases.",
      "enhancedPrompt": "Detailed image generation prompt in English. Very specific: style, lighting, composition, colors, mood, technical specs. Include brand aesthetic. Production-ready quality. No watermarks.",
      "layoutStructure": [
        "Instrução detalhada para slide/frame 1",
        "Instrução detalhada para slide/frame 2",
        "Instrução detalhada para slide/frame 3 (se aplicável)"
      ],
      "designInstructions": {
        "typography": "especificações de tipografia: fontes, tamanhos, pesos, espaçamento",
        "spacing": "espaçamentos, margens, padding, grid",
        "composition": "proporção, regra dos terços, zona segura, alinhamentos",
        "visualHierarchy": "ordem de leitura: 1º o quê, 2º o quê, 3º o quê. Como guiar o olhar."
      },
      "styleConsistency": "Notas de consistência de marca: como este material deve se conectar com a identidade visual da ${brandName}. O que validar antes de aprovar."
    }
  ]
}

GERE um brief para cada post (postId ${posts.map((p) => p.postId).join(", ")}).
Adapte cada brief profundamente ao formato, objetivo e copy de cada post específico.`;

  const r = await generate({
    system: systemPrompt,
    user: userPrompt,
    maxTokens: 3000,
    workspaceId: guard.session.workspaceId,
    // `preferredProvider` é PREFERÊNCIA, não decreto: a fixação do cliente
    // vence, e as outras chaves entram de reserva se esta falhar.
    preferredProvider: "claude",
    // Sem estes, o gasto entra no relatório sem dono.
    clientId: typeof body.clientId === "string" ? body.clientId : null,
    projectId: typeof body.projectId === "string" ? body.projectId : null,
    departmentId: "design",
    agentId: "design",
  });

  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 503 });

  const briefs = (r.data as { briefs: unknown[] }).briefs;
  return NextResponse.json({ ok: true, briefs, model: r.model });
}
