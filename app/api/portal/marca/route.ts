// O FORMULÁRIO DE MARCA — a porta do CLIENTE.
//
// GET  → as perguntas que faltam, no máximo cinco por rodada.
// POST → grava o que ele respondeu.
//
// ── Por que é uma rota do PORTAL, e não do painel ──────────────────────────
//
// A identidade da marca é do dono. A rota do painel (`/api/agency/clients/[id]/
// marca`) existe para quem atende registrar o que o cliente **disse**; esta é
// para o cliente **dizer**. As duas gravam no mesmo lugar, e a diferença
// importa: resposta que veio daqui veio dele.
//
// ── AS REGRAS DA TELA, e por que são regras e não estilo ───────────────────
//
//   • **Uma pergunta por vez, fechada quando dá.** Escolher é mais fácil que
//     escrever, e responde mais gente.
//   • **"Não sei" é resposta válida.** Forçar a adivinhar faz o cliente
//     abandonar no meio ou responder qualquer coisa — e resposta qualquer é
//     PIOR que campo vazio, porque vira regra falsa que a peça vai obedecer
//     para sempre.
//   • **Salva a cada resposta.** Ele responde três no ponto de ônibus e volta
//     depois.
//   • **Cinco por rodada.** Questionário longo é questionário abandonado.
//   • **Campo de par pede as DUAS metades.** "Um post que é a sua cara" e "um
//     que não era" chegam juntos, porque é o segundo que permite reprovar peça.
//     Até 15/08/2026 esta rota gravava `reprovadas: []` fixo, e por isso
//     NENHUM cliente conseguia publicar. Ver `esteira/escrita-da-ficha.ts`.

import { NextRequest, NextResponse } from "next/server";
import { escopoDoToken } from "@/lib/agency/persistence/portal-access-service";
import { tokenDoPortal } from "@/lib/agency/persistence/portal-cookie";
import { lerFichaDeMarca, proximasPerguntas, type CampoDaMarca, type CampoNaFicha } from "@/lib/agency/esteira/ficha-de-marca";
import { gravarRespostaDeMarca, respondivelPeloCliente } from "@/lib/agency/esteira/escrita-da-ficha";

export const dynamic = "force-dynamic";

/** O que "não sei" grava: NADA. O campo continua em lacuna, e é isso mesmo.
 *  Gravar "não sei" como valor transformaria uma pergunta aberta numa resposta
 *  — e a próxima peça obedeceria a ela. */
const NAO_SEI = "__nao_sei__";

async function clienteDoToken(request: NextRequest): Promise<string | null> {
  const token = tokenDoPortal(request, request.nextUrl.searchParams.get("token"));
  if (!token) return null;
  // 🔴 RODADA 3: o dono saía do registro do token. Agora sai do ESCOPO
  // CONGELADO — e `ponteiro_andou` fecha aqui como fecha nas outras.
  const escopo = await escopoDoToken(token).catch(() => null);
  return escopo?.ok ? escopo.clientId : null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const clientId = await clienteDoToken(request);
  if (!clientId) return NextResponse.json({ error: "token inválido" }, { status: 401 });

  const ficha = await lerFichaDeMarca(clientId);
  const perguntas = proximasPerguntas(ficha).filter((c) => respondivelPeloCliente(c.campo));

  return NextResponse.json({
    // Conclusão primeiro, para a tela não ter de calcular: onde ele está.
    progresso: { respondidas: ficha.definidos, total: ficha.campos.length },
    // O que ainda trava a publicação — a régua da PORTA, não a contagem de
    // campos. As duas divergem por natureza, e mostrar só a contagem é como o
    // cliente via a barra andar com nada saindo.
    faltaParaPublicar: ficha.oQueFaltaParaPublicar,
    // Vazio = acabou. A tela mostra "terminou", não uma lista vazia.
    perguntas: perguntas.map(paraATela),
  });
}

/** A pergunta como a tela precisa dela — com as METADES quando o campo é par.
 *  Sem isto a tela desenha um campo de texto só, e a segunda metade (a que
 *  permite reprovar) não tem por onde entrar. */
function paraATela(c: CampoNaFicha) {
  return {
    campo: c.campo,
    pergunta: c.pergunta,
    rotulo: c.rotulo,
    metades: c.metadesQueFaltam,
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const clientId = await clienteDoToken(request);
  if (!clientId) return NextResponse.json({ error: "token inválido" }, { status: 401 });

  // `resposta` é a forma antiga (texto único) e continua valendo. `metades` é a
  // forma nova: o campo de par chega com as DUAS partes, porque é a segunda
  // delas que permite reprovar peça — e ela nascia vazia por literal.
  const corpo = (await request.json().catch(() => ({}))) as {
    campo?: string;
    resposta?: string;
    metades?: Record<string, string>;
  };
  const campo = corpo.campo as CampoDaMarca | undefined;
  const resposta = (corpo.resposta ?? "").trim();
  const metades = corpo.metades ?? null;

  if (!campo || !respondivelPeloCliente(campo)) {
    return NextResponse.json({ error: "campo desconhecido" }, { status: 400 });
  }

  const temMetade = !!metades && Object.values(metades).some((v) => (v ?? "").trim());

  // "Não sei" é resposta válida e NÃO grava nada. O campo segue em lacuna, que
  // é a verdade — e a próxima rodada não pergunta de novo na frente das outras.
  if ((!resposta || resposta === NAO_SEI) && !temMetade) {
    const ficha = await lerFichaDeMarca(clientId);
    return NextResponse.json({
      gravado: false,
      motivo: "sem resposta — o campo continua em aberto, e tudo bem",
      progresso: { respondidas: ficha.definidos, total: ficha.campos.length },
    });
  }

  const r = await gravarRespostaDeMarca({
    clientId,
    campo,
    entrada: temMetade ? metades : resposta,
    // Veio DAQUI, então veio dele. É a diferença entre esta rota e a do painel,
    // e ela fica registrada na proibição — sem isso, daqui a três meses ninguém
    // sabe se a regra saiu da boca do cliente ou do palpite de quem preencheu.
    origem: "marca",
  });

  const ficha = await lerFichaDeMarca(clientId);
  return NextResponse.json({
    gravado: r.gravado,
    ...(r.gravado ? {} : { motivo: r.motivo }),
    progresso: { respondidas: ficha.definidos, total: ficha.campos.length },
    proximas: proximasPerguntas(ficha).filter((c) => respondivelPeloCliente(c.campo)).map(paraATela),
  });
}
