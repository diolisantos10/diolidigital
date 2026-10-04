// AS PERGUNTAS AO CLIENTE NO PORTAL — só o FATO que a agência não deduz.
//
// GET  → { perguntas, abertas }: só as que seguem abertas na ficha única.
// POST → { fato, resposta }: grava na ficha única e a pergunta some.
//
// A regra de "o que está aberto" NÃO mora aqui: é `perguntasAoCliente`, a mesma
// que a equipe vê no painel. Esta rota só lê, grava e devolve.
//
// O `clientId` vem do TOKEN, nunca do corpo nem da query — um cliente não
// responde pela ficha de outro. Mesmo padrão de `app/api/portal/marca`.
//
// Resposta nova ACRESCENTA (canais, produtos) ou preenche (endereço, horário);
// nunca apaga o que a agência ou o cliente já tinham registrado.

import { NextRequest, NextResponse } from "next/server";
import { validatePortalAccess } from "@/lib/agency/persistence/portal-access-service";
import { tokenDoPortal } from "@/lib/agency/persistence/portal-cookie";
import { lerFichaUnica, gravarFichaUnica, type FichaUnica } from "@/lib/agency/esteira/ficha-unica";
import { perguntasAoCliente, mesclarProdutos, type FatoDoCliente } from "@/lib/agency/esteira/perguntas-ao-cliente";

export const dynamic = "force-dynamic";

const FATOS: readonly FatoDoCliente[] = ["cardapio", "precos", "endereco", "horario", "arroba"];
const LIMITE = 2000;

async function clienteDoToken(request: NextRequest): Promise<string | null> {
  const token = tokenDoPortal(request, request.nextUrl.searchParams.get("token"));
  if (!token) return null;
  const acesso = await validatePortalAccess(token).catch(() => null);
  if (!acesso?.valid || !acesso.record) return null;
  return acesso.record.clientId ?? null;
}

/** Junta o novo ao que já existia, uma linha por item, sem apagar nada. */
function acrescentar(atual: string | undefined, novo: string): string {
  const base = (atual ?? "").replace(/\s+$/, "");
  return base ? `${base}\n${novo}` : novo;
}

async function abertasDe(clientId: string) {
  const ficha = await lerFichaUnica(clientId);
  return perguntasAoCliente(ficha).filter((p) => !p.respondida);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const clientId = await clienteDoToken(request);
  if (!clientId) return NextResponse.json({ error: "token inválido" }, { status: 401 });

  const abertas = await abertasDe(clientId);
  return NextResponse.json({
    perguntas: abertas.map((p) => ({ fato: p.fato, rotulo: p.rotulo, pergunta: p.pergunta })),
    abertas: abertas.length,
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const clientId = await clienteDoToken(request);
  if (!clientId) return NextResponse.json({ error: "token inválido" }, { status: 401 });

  const corpo = (await request.json().catch(() => ({}))) as { fato?: unknown; resposta?: unknown };
  const fato = corpo.fato as FatoDoCliente;
  if (typeof corpo.fato !== "string" || !FATOS.includes(fato)) {
    return NextResponse.json({ error: "pergunta desconhecida" }, { status: 400 });
  }
  const resposta = typeof corpo.resposta === "string" ? corpo.resposta.trim() : "";
  if (!resposta) return NextResponse.json({ error: "escreva a resposta" }, { status: 400 });
  if (resposta.length > LIMITE) {
    return NextResponse.json({ error: `resposta longa demais (máximo ${LIMITE} caracteres)` }, { status: 400 });
  }

  const atual = await lerFichaUnica(clientId);
  const entrada: FichaUnica = {};
  if (fato === "endereco") entrada.endereco = resposta;
  else if (fato === "horario") entrada.horario = resposta;
  else if (fato === "arroba") {
    // Só o nome, sem @ nem link: vira "@nome", senão a pergunta nunca fecharia.
    const solto = /^[a-z0-9._]{2,}$/i.test(resposta) ? `@${resposta}` : resposta;
    entrada.canais = acrescentar(atual.canais, solto);
  } else {
    // cardápio e preços: uma linha por item, no formato "nome — descrição — preço".
    entrada.produtos = mesclarProdutos(atual.produtos, resposta);
  }

  const gravada = await gravarFichaUnica(clientId, entrada);
  const abertas = perguntasAoCliente(gravada).filter((p) => !p.respondida).length;
  return NextResponse.json({ gravado: true, abertas });
}
