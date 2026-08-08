// GET /api/admin/diagnostico-de-conexoes — O ACESSO ESTÁ VIVO, DE DENTRO DA PRODUÇÃO.
//
// ── POR QUE ESTA ROTA EXISTE (08/08/2026) ───────────────────────────────────
//
// O CEO abriu o portal do CityJobs e leu "Conectada · desde 03/08/2026" nos dois
// cartões, no mesmo dia em que lhe disseram que o acesso do CityJobs tinha
// vencido. Um dos dois estava errado e **ninguém tinha como saber qual**: a casa
// inteira sabia dizer o que estava GRAVADO e não tinha um só lugar que dissesse
// o que ainda FUNCIONA.
//
// O banco de produção mora num volume dentro do contêiner do Railway e ninguém
// o alcança de fora — o mesmo motivo que produziu `/api/admin/links-do-portal`.
// Uma rota resolve porque ela roda ONDE o banco e os tokens estão.
//
// ── AUTENTICAÇÃO: O MESMO SEGREDO DAS ROTAS DE CRON ─────────────────────────
//
// `Authorization: Bearer <CRON_SECRET>`, conferido por `segredoConfere`
// (tempo constante). **Segredo ausente do ambiente → PORTA FECHADA (503)**,
// nunca aberta: rota que se abre sozinha quando a variável some não tem trava.
//
// ── O QUE ELA NÃO FAZ ───────────────────────────────────────────────────────
//
//   • **Nenhuma escrita na Meta e nenhuma escrita no Google.** Todas as chamadas
//     são GET, e as da Meta passam por `graph.ts` — balde de ritmo e cota por
//     pontuação inclusos. A trava de plataforma de 03/08/2026 vale inteira.
//   • **Nenhum token sai daqui.** Nem cifrado, nem em dica, nem em amostra.
//   • **Não carimba nada por padrão.** Gravar o resultado do exame no banco
//     desta casa exige `?carimbar=1` explícito, pelo mesmo motivo que emitir
//     link de portal exige `?emitir=1`: GET é o verbo que todo mundo — proxy,
//     pré-carregador, histórico — trata como inofensivo.
//   • **Não varre a casa a cada F5.** Ela é chamada à mão. Rajada de GET é a
//     assinatura do que restringiu a conta de anúncios da agência em 03/08/2026.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { segredoConfere } from "@/lib/security/crypto";
import {
  exercitarAcesso,
  estadoDaConexao,
  lerMetaJson,
  carimbarAcessoVivo,
  carimbarAcessoRecusado,
  tokenGuardado,
  type FalhaDeAcesso,
} from "@/lib/integrations/meta/verificacao";
import { exercitarDrive } from "@/lib/integrations/google/verificacao-do-drive";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Teto duro de conexões examinadas numa chamada. Um diagnóstico que dispara 60
 *  GETs seguidos na Meta é o problema se disfarçando de conserto. */
const MAX_CONEXOES = 30;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "Rota administrativa não configurada — defina CRON_SECRET" },
      { status: 503 },
    );
  }

  const cabecalho = request.headers.get("authorization");
  const token = cabecalho?.startsWith("Bearer ") ? cabecalho.slice(7) : null;
  if (!segredoConfere(token, cronSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const pedidoDeCarimbo = (url.searchParams.get("carimbar") ?? "").toLowerCase();
  const carimbar = pedidoDeCarimbo === "1" || pedidoDeCarimbo === "true";
  // Filtro por cliente (id ou pedaço do nome). Sem ele, examina todos — e o
  // teto de MAX_CONEXOES continua valendo.
  const filtroDeCliente = (url.searchParams.get("cliente") ?? "").trim().toLowerCase();

  const clientes = await prisma.client
    .findMany({ select: { id: true, name: true } })
    .catch(() => null);
  if (clientes === null) {
    // Banco fora do ar NÃO vira lista vazia: lista vazia leria como "nenhum
    // cliente tem conexão", que é uma afirmação. Ausência de informação não é
    // informação.
    return NextResponse.json({ error: "não consegui ler os clientes" }, { status: 500 });
  }
  const nomePorId = new Map(clientes.map((c) => [c.id, c.name]));

  function interessa(clientId: string | null): boolean {
    if (!filtroDeCliente) return true;
    if (!clientId) return "agencia".includes(filtroDeCliente);
    const nome = (nomePorId.get(clientId) ?? "").toLowerCase();
    return clientId.toLowerCase() === filtroDeCliente || nome.includes(filtroDeCliente);
  }

  // ─── META ────────────────────────────────────────────────────────────────

  const linhas = await prisma.metaConnection
    .findMany({ orderBy: { connectedAt: "desc" } })
    .catch(() => null);
  if (linhas === null) {
    return NextResponse.json({ error: "não consegui ler as conexões da Meta" }, { status: 500 });
  }

  const alvos = linhas.filter((l) => interessa(l.clientId)).slice(0, MAX_CONEXOES);

  const meta: unknown[] = [];
  for (const linha of alvos) {
    const metaJson = lerMetaJson(linha.metaJson);
    const antes = estadoDaConexao({ status: linha.status, connectedAt: linha.connectedAt, metaJson });
    const base = {
      id: linha.id,
      cliente: linha.clientId ? (nomePorId.get(linha.clientId) ?? linha.clientId) : "a própria agência",
      clientId: linha.clientId,
      plataforma: linha.platform,
      nome: linha.name,
      externalId: linha.externalId,
      statusGravado: linha.status,
      registradaEm: linha.connectedAt.toISOString(),
      // O que a tela mostrava ANTES do exame — para quem lê o JSON ver a
      // distância entre o rótulo e o fato.
      estadoAntesDoExame: antes.estado,
    };

    const segredo = tokenGuardado(linha.accessTokenEncrypted);
    if (!segredo) {
      // Chave da casa não abre o token guardado. É um fato sobre NÓS, não sobre
      // o cliente — e por isso não vira "o token do cliente venceu".
      meta.push({
        ...base,
        exame: "nao_foi_possivel",
        motivo: "o token guardado não decifra com a chave desta casa (AUTH_SECRET trocado?) — nada foi perguntado à Meta",
      });
      continue;
    }

    const r = await exercitarAcesso({
      platform: linha.platform,
      externalId: linha.externalId,
      token: segredo,
    });

    if (r.ok) {
      const carimbou = carimbar ? await carimbarAcessoVivo(linha.id, r.prova ?? "") : false;
      meta.push({ ...base, exame: "vivo", prova: r.prova, amostra: r.amostra, carimbado: carimbou });
    } else {
      const f = r.falha as FalhaDeAcesso;
      const carimbou = carimbar ? await carimbarAcessoRecusado(linha.id, f) : false;
      meta.push({
        ...base,
        exame: f.codigo === null ? "nao_respondeu" : "recusado",
        // O código e a frase CRUS da Meta. Os códigos da Graph mentem sobre a
        // causa com frequência; quem interpreta precisa do original, não do
        // nosso resumo.
        metaDisse: { codigo: f.codigo, subcodigo: f.subcodigo, tipo: f.tipo, mensagem: f.mensagem },
        carimbado: carimbou,
      });
    }
  }

  // ─── CONTAS DE ANÚNCIO ───────────────────────────────────────────────────
  //
  // ⚠️ Elas NÃO viram `MetaConnection`. Uma conta de anúncios autorizada mora só
  // em `MetaAtivoAutorizado` — sem token próprio, porque quem fala com a
  // Marketing API é o token de USUÁRIO do cliente. Consequência prática, e o CEO
  // topou com ela hoje: ele salvou `act_1355986106660251` e **nenhum cartão do
  // portal fala dela**, porque o portal lista conexões. Salvar não é conectar.
  const autorizados = await prisma.metaAtivoAutorizado
    .findMany({ where: { tipo: "ad_account" } })
    .catch(() => null);

  const contas: unknown[] = [];
  if (autorizados === null) {
    contas.push({ indisponivel: true, motivo: "não consegui ler a lista de ativos autorizados" });
  } else {
    for (const a of autorizados.filter((x) => interessa(x.clientId))) {
      // O token que fala pela conta é o de usuário do DONO dela — derivado da
      // linha, nunca informado por quem chama.
      const credencial = linhas.find(
        (l) => l.platform === "user" && l.clientId === a.clientId && l.status === "connected",
      );
      const base = {
        cliente: a.clientId ? (nomePorId.get(a.clientId) ?? a.clientId) : "a própria agência",
        clientId: a.clientId,
        conta: a.externalId,
        nome: a.nome,
        autorizadaEm: a.autorizadoEm.toISOString(),
        autorizadaPor: a.autorizadoPor,
        viraConexaoNoPortal: false,
      };
      const segredo = credencial ? tokenGuardado(credencial.accessTokenEncrypted) : null;
      if (!segredo) {
        contas.push({ ...base, exame: "nao_foi_possivel", motivo: "não há token de usuário utilizável deste cliente para perguntar à Meta" });
        continue;
      }
      const r = await exercitarAcesso({ platform: "ad_account", externalId: a.externalId, token: segredo });
      if (r.ok) contas.push({ ...base, exame: "vivo", prova: r.prova, amostra: r.amostra });
      else {
        const f = r.falha as FalhaDeAcesso;
        contas.push({
          ...base,
          exame: f.codigo === null ? "nao_respondeu" : "recusado",
          metaDisse: { codigo: f.codigo, subcodigo: f.subcodigo, tipo: f.tipo, mensagem: f.mensagem },
        });
      }
    }
  }

  // ─── GOOGLE DRIVE ────────────────────────────────────────────────────────

  const drives = await prisma.googleDriveConnection.findMany({}).catch(() => null);
  const materiais = await prisma.driveMaterial
    .findMany({ select: { clientId: true, papelConfirmadoEm: true, mediaAssetId: true } })
    .catch(() => null);

  let drive: unknown;
  if (drives === null || materiais === null) {
    drive = { indisponivel: true, motivo: "não consegui ler as tabelas do Drive — nenhuma afirmação sobre material foi feita" };
  } else {
    const porCliente = new Map<string, { escolhidos: number; declarados: number; importados: number }>();
    for (const m of materiais) {
      const atual = porCliente.get(m.clientId) ?? { escolhidos: 0, declarados: 0, importados: 0 };
      atual.escolhidos++;
      if (m.papelConfirmadoEm) atual.declarados++;
      if (m.mediaAssetId) atual.importados++;
      porCliente.set(m.clientId, atual);
    }

    const linhasDoDrive: unknown[] = [];
    for (const c of drives.filter((d) => interessa(d.clientId))) {
      const r = await exercitarDrive(c.id);
      const contagem = porCliente.get(c.clientId) ?? { escolhidos: 0, declarados: 0, importados: 0 };
      linhasDoDrive.push({
        cliente: nomePorId.get(c.clientId) ?? c.clientId,
        clientId: c.clientId,
        statusGravado: c.status,
        conta: c.contaHint || "(não guardada)",
        registradaEm: c.connectedAt.toISOString(),
        exame: r.ok ? "vivo" : "recusado",
        prova: r.prova ?? null,
        googleDisse: r.ok ? null : { codigo: r.codigo ?? null, mensagem: r.mensagem ?? "" },
        // ⚠️ AS DUAS CONTAGENS LADO A LADO, DE PROPÓSITO. Se elas divergirem,
        // o cliente escolheu material no seletor do Google e a escolha NÃO
        // ficou gravada nesta casa — que é uma falha nossa, invisível para ele,
        // e o motivo de alguém achar que "já mandou o logo".
        escolhaPerdida:
          typeof r.alcancadosNoGoogle === "number" &&
          r.alcancadosNoGoogle > (porCliente.get(c.clientId)?.escolhidos ?? 0),
        // As DUAS perguntas, separadas: acesso vivo e material alcançado.
        material: {
          /** O que o GOOGLE diz que o app alcança. `null` = não contei. */
          alcancadosNoGoogle: r.alcancadosNoGoogle ?? null,
          escolhidos: contagem.escolhidos,
          declarados: contagem.declarados,
          importados: contagem.importados,
          // Declarar é o que torna o arquivo insumo. Escolhido e não declarado
          // existe no banco e a esteira não usa.
          aAgenciaAlcanca: contagem.importados,
        },
      });
    }

    drive = {
      conexoes: linhasDoDrive,
      totalDeMateriaisNaCasa: materiais.length,
      arquivosQueAAgenciaAlcanca: materiais.filter((m) => m.mediaAssetId).length,
    };
  }

  return NextResponse.json({
    ok: true,
    em: new Date().toISOString(),
    aviso: carimbar
      ? "CARIMBO LIGADO: o resultado do exame foi gravado no banco DESTA casa (metaJson/status). Nada foi escrito na Meta nem no Google."
      : "Leitura pura: nada foi gravado. Use ?carimbar=1 para o portal passar a mostrar este resultado.",
    conexoesExaminadas: alvos.length,
    conexoesNoBanco: linhas.length,
    meta,
    contasDeAnuncio: contas,
    drive,
  });
}
