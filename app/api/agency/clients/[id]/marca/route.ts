// A FICHA DE MARCA de um cliente — leitura e escrita.
//
// GET  → os nove campos com o estado de cada um, as lacunas e as perguntas
//        prontas para mandar ao dono.
// PUT  → grava o que o dono respondeu.
//
// ── QUEM PODE ESCREVER AQUI ────────────────────────────────────────────────
//
// A identidade da marca é do DONO — nunca do agente e nunca da agência. Esta
// rota é a porta de dentro (o painel), usada por quem atende; a porta do
// cliente é o formulário do portal. As duas gravam no mesmo lugar e por isso a
// origem de cada resposta fica registrada: sem isso, daqui a três meses
// ninguém sabe se "não prometemos contratação" saiu da boca do cliente ou do
// palpite de quem preencheu a ficha por ele.
//
// ── A POSSE, QUE FALTAVA INTEIRA (16/08/2026) ──────────────────────────────
//
// `GET` e `PUT` pegavam o `id` da URL, conferiam só que existia uma sessão e
// iam direto para `lerFichaDeMarca(id)` e `gravarRespostaDeMarca({ clientId })`.
// A palavra `workspaceId` não aparecia uma vez no arquivo. Provado: sessão de
// `design_staff` do workspace A LEU e ESCREVEU a ficha de marca de um cliente do
// workspace B, 200 nas duas.
//
// Dói porque a ficha de marca é o que o **portão de entrega** consulta: quem
// escreve nela move o portão de publicação de qualquer cliente de qualquer
// inquilino. Não é leitura de dado — é a régua da entrega.
//
// O remédio já existia uma pasta abaixo (`do-brand-book/route.ts`) e agora é um
// módulo só, `esteira/posse-do-cliente.ts`: escopo dentro do `where`, e **404,
// nunca 403**.
//
// ── E A LARGURA ─────────────────────────────────────────────────────────────
//
// `exigirApiInterna("/agency/clients")` prende esta API à MESMA linha do
// inventário que a tela que ela serve. `/agency/clients` é `todos_internos`:
// nenhum papel da casa é achatado por isto. O que muda é que uma sessão do
// PORTAL deixa de alcançar a porta de DENTRO — e isso importa porque tudo que
// entra por aqui é gravado com `origem: "equipe"`. Um token de cliente
// escrevendo por esta porta carimbaria a própria resposta como se fosse a
// agência registrando o que ele disse: procedência falsificada, que é o defeito
// que a autoria existe para impedir. A porta do cliente é `/api/portal/marca`.

import { NextRequest, NextResponse } from "next/server";
import { exigirApiInterna } from "@/lib/agency/organizacao/guarda";
import { clienteOuNulo } from "@/lib/agency/esteira/posse-do-cliente";
import { lerFichaDeMarca, proximasPerguntas, CAMPOS_DA_MARCA, type CampoDaMarca } from "@/lib/agency/esteira/ficha-de-marca";
import { COLUNA, gravarRespostaDeMarca } from "@/lib/agency/esteira/escrita-da-ficha";

export const dynamic = "force-dynamic";

/** A negativa é a mesma para "não existe" e para "não é seu". De propósito. */
function naoEncontrado(): NextResponse {
  return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { acesso, erro } = await exigirApiInterna("/agency/clients");
  if (erro) return erro;

  const { id } = await ctx.params;
  if (!(await clienteOuNulo(id, acesso.session))) return naoEncontrado();

  const ficha = await lerFichaDeMarca(id);
  return NextResponse.json({
    ...ficha,
    // A conclusão primeiro, para a tela não ter de contar: quantos faltam e o
    // que a falta impede.
    resumo: {
      definidos: ficha.definidos,
      total: CAMPOS_DA_MARCA.length,
      faltam: ficha.lacunas.length,
      oQueAFaltaImpede: ficha.naoConstituida
        ? "sem isto a peça sai sem régua de marca, e o portão de entrega barra a publicação"
        : null,
      // O QUE exatamente falta, item por item. `definidos` conta campo; a porta
      // decide por outra régua (5 campos + 3 proibições + as duas referências).
      // A tela mostrava só o primeiro número, então dava para ver "8 de 9" com
      // a publicação barrada e nada explicando por quê.
      oQueFaltaParaPublicar: ficha.oQueFaltaParaPublicar,
    },
    proximasPerguntas: proximasPerguntas(ficha),
  });
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { acesso, erro } = await exigirApiInterna("/agency/clients");
  if (erro) return erro;

  const { id } = await ctx.params;
  // A posse é conferida ANTES de o corpo ser sequer lido: a escrita não pode
  // depender de nenhum caminho posterior lembrar de barrar.
  if (!(await clienteOuNulo(id, acesso.session))) return naoEncontrado();

  const corpo = (await req.json().catch(() => ({}))) as { campos?: Record<string, unknown> };
  const entrada = corpo.campos ?? {};

  const gravados: string[] = [];
  const ignorados: string[] = [];

  // Uma escrita por campo, pelo escritor único (`esteira/escrita-da-ficha.ts`).
  // Era um `upsert` só com o objeto montado aqui — e o envelope montado aqui
  // era a CÓPIA do envelope do portal, com a mesma linha fatal nas duas: a
  // metade que permite reprovar (`reprovadas`, `naoDizemos`) nascia vazia.
  // Escritor único é o que impede a próxima cópia de divergir de novo.
  for (const [campo, valor] of Object.entries(entrada)) {
    if (!COLUNA[campo as CampoDaMarca] && campo !== "proibicoes") {
      // Campo desconhecido não é gravado em silêncio: quem chamou precisa saber
      // que a resposta do cliente foi para o lixo.
      ignorados.push(campo);
      continue;
    }
    if (valor === null || valor === undefined || valor === "") continue;
    const r = await gravarRespostaDeMarca({
      clientId: id,
      campo: campo as CampoDaMarca,
      entrada: valor,
      // ── A AUTORIA, e por que ela não é detalhe ──────────────────────────
      // Esta é a porta de DENTRO: quem escreve aqui é a agência registrando o
      // que o cliente disse. `equipe` diz exatamente isso, e nunca deixa a
      // resposta preenchida pela casa se passar por resposta do dono — a
      // mesma regra do `reviewedBy` que já mordeu esta casa.
      origem: "equipe",
    });
    if (r.gravado) gravados.push(r.onde);
    // Resposta que não virou regra não some: quem preencheu precisa saber que
    // aquilo não vai barrar nada.
    else if (r.motivo) ignorados.push(`${campo} (${r.motivo})`);
  }

  if (gravados.length === 0) {
    return NextResponse.json({ error: "nada para gravar", ignorados }, { status: 400 });
  }

  const ficha = await lerFichaDeMarca(id);
  return NextResponse.json({ gravados, ignorados, ficha });
}
