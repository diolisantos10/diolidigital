// percurso-da-esteira.mts — a esteira inteira, ponta a ponta, contra o
// servidor local, com o caso REAL do CEO ("2 posts por dia", "R$ 500/mês").
//
// ─── O QUE ISTO É, E O QUE NÃO É ────────────────────────────────────────────
//
// Cada elo da esteira já foi provado SOZINHO hoje: o resgate do escopo
// cortado, a unidade do volume, o funil que não fechava, o nome do negócio
// nas duas portas, o aviso de orçamento, a verba respondida na cara. Ninguém
// percorreu a CORRENTE inteira. E o dia mostrou cinco vezes que o defeito
// mora na JUNTA, não na peça.
//
// Este script não conserta nada. Ele MEDE, registra cada transição de
// estado e, ao quebrar, ANOTA ONDE — `arquivo:linha` — e segue para a etapa
// seguinte que não dependa da que travou, para o mapa sair o mais completo
// possível numa rodada só.
//
// Sai sempre com código 0: quem julga é quem lê o mapa, não o shell.
//
// Uso:
//   npx tsx scripts/percurso-da-esteira.mts
//   BASE_URL=http://localhost:3002 npx tsx scripts/percurso-da-esteira.mts
//   MASTER_PASSWORD=xxxx npx tsx scripts/percurso-da-esteira.mts   # se já ressemeado

import { prisma } from "../lib/db/client";
import { frequenciaSemanal, volumeNaUnidade } from "../lib/agency/question-engine";
import { computeEstimate } from "../lib/agency/live-calculator";
import type { BriefingScope, LiveEstimate } from "../lib/agency/briefing-conversation";
import { entregarOrcamentosPendentes } from "../lib/agency/esteira/orcamento-do-briefing";

// ─── Config ──────────────────────────────────────────────────────────────────

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3002";
const MASTER_EMAIL = process.env.MASTER_EMAIL ?? "master@dioli.studio";
// Deliberadamente SEM default de senha. O seed gera senha aleatória por boot
// (ver `scripts/seed-db.mjs:44`) — chutar aqui só queimaria o teto de 5
// tentativas por e-mail em 5 minutos (`app/api/auth/signin/route.ts:25`) e
// travaria quem tenta de verdade depois. Só logamos se a env vier definida.
const MASTER_PASSWORD = process.env.MASTER_PASSWORD ?? process.env.SEED_MASTER_PASSWORD ?? "";

const CASO = {
  businessName: "Doces da Prova E2E",
  segment: "confeitaria",
  nomeContato: "Cliente de Prova E2E",
  email: "cliente.prova.e2e@example.test",
  whatsapp: "5511999998888", // 13 dígitos: 55 + DDD 11 + 999998888
  fraseDeVolume: "2 posts por dia",
  fraseDeVerba: "R$ 500 por mês",
  faixaDeVerba: "pacote" as const, // FAIXAS["pacote"].ate === 500 — bate com os R$500 do caso
};

const textoCru =
  `Somos a ${CASO.businessName}, uma confeitaria. ` +
  `Queremos ${CASO.fraseDeVolume} no Instagram — posts estáticos e stories. ` +
  `Nosso orçamento é de ${CASO.fraseDeVerba}. ` +
  `Contato: ${CASO.nomeContato}, ${CASO.email}, WhatsApp ${CASO.whatsapp}.`;

// ─── Registro do percurso ───────────────────────────────────────────────────

type Veredito = "✅ ATRAVESSOU" | "🚫 TRAVOU" | "⚠️ BLOQUEADO POR AMBIENTE" | "NÃO EXECUTADA";

interface Etapa {
  numero: number;
  nome: string;
  enviado: string;
  statusHttp: string;
  recebido: string;
  veredito: Veredito;
  ondeQuebrou?: string; // arquivo:linha
}

const mapa: Etapa[] = [];

function registrar(e: Etapa): void {
  mapa.push(e);
  console.log(`\n[${e.numero}] ${e.nome}`);
  console.log(`    enviado:  ${e.enviado}`);
  console.log(`    status:   ${e.statusHttp}`);
  console.log(`    voltou:   ${e.recebido}`);
  console.log(`    veredito: ${e.veredito}${e.ondeQuebrou ? ` — ${e.ondeQuebrou}` : ""}`);
}

function naoExecutada(numero: number, nome: string, dependiaDe: number): void {
  registrar({
    numero,
    nome,
    enviado: "(nada — etapa não chegou a rodar)",
    statusHttp: "—",
    recebido: `NÃO EXECUTADA (dependia da etapa ${dependiaDe})`,
    veredito: "NÃO EXECUTADA",
  });
}

function resumo(v: unknown, max = 400): string {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

// ─── Auth ────────────────────────────────────────────────────────────────────

let sessionCookie: string | null = null;

async function tentarLogin(): Promise<void> {
  if (!MASTER_PASSWORD) {
    console.log(
      "\n⚠️  Sem MASTER_PASSWORD/SEED_MASTER_PASSWORD no ambiente — login NÃO tentado " +
        "(a senha do seed é aleatória por boot; chutar queimaria o teto de tentativas). " +
        "Para exercitar as etapas com sessão, ressemeie com:\n" +
        "    SEED_MASTER_PASSWORD=<senha-escolhida> node scripts/seed-db.mjs\n" +
        "  e rode de novo com:\n" +
        "    MASTER_PASSWORD=<a-mesma-senha> npx tsx scripts/percurso-da-esteira.mts\n",
    );
    return;
  }
  try {
    const res = await fetch(`${BASE_URL}/api/auth/signin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: MASTER_EMAIL, password: MASTER_PASSWORD }),
    });
    const cookie = res.headers.get("set-cookie")?.split(";")[0] ?? "";
    if (res.ok && cookie.startsWith("dioli-session=")) {
      sessionCookie = cookie;
      console.log(`\n✅ Login ok como ${MASTER_EMAIL}.`);
    } else {
      console.log(`\n⚠️  Login falhou (HTTP ${res.status}) — etapas com sessão ficam BLOQUEADAS POR AMBIENTE.`);
    }
  } catch (e) {
    console.log(`\n⚠️  Login lançou: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function headersComSessao(): Record<string, string> {
  return { "Content-Type": "application/json", ...(sessionCookie ? { Cookie: sessionCookie } : {}) };
}

// ─── Espera curta com poll (para o auto-scope rodar em background) ─────────

async function esperar(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  console.log("═".repeat(78));
  console.log("PERCURSO DA ESTEIRA — caso real do CEO, ponta a ponta");
  console.log(`Servidor: ${BASE_URL}`);
  console.log(`Negócio de teste: ${CASO.businessName}`);
  console.log("═".repeat(78));

  await tentarLogin();

  // ═══════════════════════════════════════════════════════════════════════
  // 1 — A TELA EXISTE
  // ═══════════════════════════════════════════════════════════════════════
  try {
    const res = await fetch(`${BASE_URL}/briefing`);
    registrar({
      numero: 1,
      nome: "A tela /briefing existe",
      enviado: `GET ${BASE_URL}/briefing`,
      statusHttp: String(res.status),
      recebido: `content-type: ${res.headers.get("content-type") ?? "?"}`,
      veredito: res.status === 200 ? "✅ ATRAVESSOU" : "🚫 TRAVOU",
      ondeQuebrou: res.status === 200 ? undefined : "app/briefing/page.tsx",
    });
  } catch (e) {
    registrar({
      numero: 1,
      nome: "A tela /briefing existe",
      enviado: `GET ${BASE_URL}/briefing`,
      statusHttp: "erro de rede",
      recebido: e instanceof Error ? e.message : String(e),
      veredito: "🚫 TRAVOU",
      ondeQuebrou: "servidor local fora do ar na porta esperada",
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 2 — O SDR RESPONDE
  // ═══════════════════════════════════════════════════════════════════════
  try {
    const body = {
      messages: [],
      currentMessage: textoCru,
      sessionId: `percurso-esteira-${Date.now()}`,
    };
    const res = await fetch(`${BASE_URL}/api/sdr/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    const reason = (json as { reason?: string }).reason;
    const ok = (json as { ok?: boolean }).ok;

    if (ok === false && reason === "not_configured") {
      registrar({
        numero: 2,
        nome: "O SDR responde (POST /api/sdr/chat)",
        enviado: `POST /api/sdr/chat currentMessage="${textoCru.slice(0, 60)}…"`,
        statusHttp: String(res.status),
        recebido: resumo(json),
        veredito: "⚠️ BLOQUEADO POR AMBIENTE",
        ondeQuebrou:
          "sem chave de provedor de IA neste ambiente (medido, não é falha da esteira) — " +
          "lib/ai/chave-publica.ts (chaveDeRotaPublica), app/api/sdr/chat/route.ts:316-320",
      });
    } else if (res.status === 200 && ok === true) {
      registrar({
        numero: 2,
        nome: "O SDR responde (POST /api/sdr/chat)",
        enviado: `POST /api/sdr/chat currentMessage="${textoCru.slice(0, 60)}…"`,
        statusHttp: String(res.status),
        recebido: resumo(json),
        veredito: "✅ ATRAVESSOU",
      });
    } else {
      registrar({
        numero: 2,
        nome: "O SDR responde (POST /api/sdr/chat)",
        enviado: `POST /api/sdr/chat currentMessage="${textoCru.slice(0, 60)}…"`,
        statusHttp: String(res.status),
        recebido: resumo(json),
        veredito: "🚫 TRAVOU",
        ondeQuebrou: "app/api/sdr/chat/route.ts:311 (POST)",
      });
    }
  } catch (e) {
    registrar({
      numero: 2,
      nome: "O SDR responde (POST /api/sdr/chat)",
      enviado: "POST /api/sdr/chat",
      statusHttp: "erro de rede",
      recebido: e instanceof Error ? e.message : String(e),
      veredito: "🚫 TRAVOU",
      ondeQuebrou: "app/api/sdr/chat/route.ts",
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 3 — A CAPTURA DO VOLUME (a etapa mais importante)
  // ═══════════════════════════════════════════════════════════════════════
  let postsPerWeekMedido: number | undefined;
  try {
    postsPerWeekMedido = frequenciaSemanal(CASO.fraseDeVolume);
    const viaVolumeNaUnidade = volumeNaUnidade(CASO.fraseDeVolume, "semana");
    const esperado = 14;
    const bateu = postsPerWeekMedido === esperado && viaVolumeNaUnidade === esperado;

    registrar({
      numero: 3,
      nome: `A captura do volume: "${CASO.fraseDeVolume}" → posts/semana`,
      enviado: `frequenciaSemanal("${CASO.fraseDeVolume}")`,
      statusHttp: "n/a (função pura, sem HTTP)",
      recebido: `frequenciaSemanal = ${postsPerWeekMedido} · volumeNaUnidade(..., "semana") = ${viaVolumeNaUnidade} · esperado = ${esperado}`,
      veredito: bateu ? "✅ ATRAVESSOU" : "🚫 TRAVOU",
      ondeQuebrou: bateu
        ? undefined
        : `ACHADO DO DIA: "${CASO.fraseDeVolume}" chegou como ${postsPerWeekMedido} posts/semana, ` +
          `não ${esperado} — lib/agency/question-engine.ts:91 (volumeNaUnidade) / :108 (frequenciaSemanal)`,
    });

    if (!bateu) {
      console.log(
        `\n🔴🔴🔴 ACHADO DO DIA: "${CASO.fraseDeVolume}" deveria virar ${esperado}/semana e virou ${postsPerWeekMedido}. 🔴🔴🔴`,
      );
    }
  } catch (e) {
    registrar({
      numero: 3,
      nome: `A captura do volume: "${CASO.fraseDeVolume}" → posts/semana`,
      enviado: `frequenciaSemanal("${CASO.fraseDeVolume}")`,
      statusHttp: "n/a",
      recebido: e instanceof Error ? e.message : String(e),
      veredito: "🚫 TRAVOU",
      ondeQuebrou: "lib/agency/question-engine.ts (frequenciaSemanal / volumeNaUnidade) lançou",
    });
  }
  // Se a função quebrou de verdade, mesmo assim seguimos com o número
  // esperado (14) para não perder o resto do mapa — o achado já ficou
  // registrado acima, com todas as letras.
  const postsPerWeek = postsPerWeekMedido ?? 14;

  // Escopo completo do caso, para usar nas etapas seguintes (4, 5, 7, 9).
  const scopeCompleto: BriefingScope = {
    businessName: CASO.businessName,
    segment: CASO.segment,
    objectives: ["Aumentar pedidos", "Fortalecer presença no Instagram"],
    wantsSocialMedia: true,
    social: {
      platforms: ["Instagram"],
      postsPerWeek,
      storiesPerWeek: 7,
      reelsPerMonth: 4,
      needsCopy: true,
      hasPhotos: true,
    },
    budgetRange: CASO.faixaDeVerba,
  };
  const estimativa: LiveEstimate = computeEstimate(scopeCompleto);

  // ═══════════════════════════════════════════════════════════════════════
  // 4 — O PORTÃO DE CONTATO (as duas metades)
  // ═══════════════════════════════════════════════════════════════════════
  let leadSemContatoId: string | undefined;
  let leadComContatoId: string | undefined;
  let leadReaproveitamentoId: string | undefined;

  // 4a — SEM canal de contato
  try {
    const bodySemContato = {
      businessName: CASO.businessName,
      segment: CASO.segment,
      services: ["Social Media"],
      objectives: ["Aumentar pedidos"],
      rawContext: textoCru,
      source: "briefing",
      briefingJson: { scope: scopeCompleto },
    };
    const res = await fetch(`${BASE_URL}/api/brain/client-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodySemContato),
    });
    const json = (await res.json().catch(() => ({}))) as {
      id?: string; status?: string; contato?: { temComoFalar?: boolean; motivo?: string };
    };
    leadSemContatoId = json.id;
    const correto = res.status === 201 && json.status === "lead_incompleto" && json.contato?.temComoFalar === false;
    registrar({
      numero: 4,
      nome: "O portão de contato — SEM canal → lead_incompleto, sem runAutoScope",
      enviado: "POST /api/brain/client-requests (sem contato, sem prospectEmail/Phone)",
      statusHttp: String(res.status),
      recebido: resumo(json),
      veredito: correto ? "✅ ATRAVESSOU" : "🚫 TRAVOU",
      ondeQuebrou: correto ? undefined : "app/api/brain/client-requests/route.ts:224-299 (gate de contato)",
    });
  } catch (e) {
    registrar({
      numero: 4,
      nome: "O portão de contato — SEM canal → lead_incompleto",
      enviado: "POST /api/brain/client-requests (sem contato)",
      statusHttp: "erro de rede",
      recebido: e instanceof Error ? e.message : String(e),
      veredito: "🚫 TRAVOU",
      ondeQuebrou: "app/api/brain/client-requests/route.ts",
    });
  }

  // 4b — COM canal de contato
  try {
    const bodyComContato = {
      businessName: CASO.businessName,
      segment: CASO.segment,
      services: ["Social Media"],
      objectives: ["Aumentar pedidos", "Fortalecer presença no Instagram"],
      rawContext: textoCru,
      source: "briefing",
      contato: { nome: CASO.nomeContato, email: CASO.email, whatsapp: CASO.whatsapp },
      briefingJson: {
        scope: scopeCompleto,
        estimate: estimativa,
        transcript: [
          { role: "client", text: `Queremos ${CASO.fraseDeVolume} no Instagram.` },
          { role: "client", text: `Nosso orçamento é de ${CASO.fraseDeVerba}.` },
        ],
      },
    };
    const res = await fetch(`${BASE_URL}/api/brain/client-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyComContato),
    });
    const json = (await res.json().catch(() => ({}))) as {
      id?: string; status?: string; contato?: { temComoFalar?: boolean };
    };
    leadComContatoId = json.id;
    const correto = res.status === 201 && json.status === "new" && json.contato?.temComoFalar === true;
    registrar({
      numero: 4,
      nome: "O portão de contato — COM canal → status new",
      enviado: `POST /api/brain/client-requests (contato: email=${CASO.email}, whatsapp=${CASO.whatsapp})`,
      statusHttp: String(res.status),
      recebido: resumo(json),
      veredito: correto ? "✅ ATRAVESSOU" : "🚫 TRAVOU",
      ondeQuebrou: correto ? undefined : "app/api/brain/client-requests/route.ts:224-299 (gate de contato)",
    });

    // Um segundo lead com o MESMO contato — usado na etapa 8 para provar
    // reaproveitamento de Client em vez de cadastro duplicado.
    if (leadComContatoId) {
      const res2 = await fetch(`${BASE_URL}/api/brain/client-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...bodyComContato,
          rawContext: `${textoCru} (segundo pedido de teste — mesmo contato, prova de reaproveitamento)`,
        }),
      });
      const json2 = (await res2.json().catch(() => ({}))) as { id?: string };
      leadReaproveitamentoId = json2.id;
    }
  } catch (e) {
    registrar({
      numero: 4,
      nome: "O portão de contato — COM canal → status new",
      enviado: "POST /api/brain/client-requests (com contato)",
      statusHttp: "erro de rede",
      recebido: e instanceof Error ? e.message : String(e),
      veredito: "🚫 TRAVOU",
      ondeQuebrou: "app/api/brain/client-requests/route.ts",
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 5 — O PEDIDO GRAVADO (o que persistiu, depois do auto-scope de fundo)
  // ═══════════════════════════════════════════════════════════════════════
  if (!leadComContatoId) {
    naoExecutada(5, "O pedido gravado (persistência + auto-scope)", 4);
  } else if (!sessionCookie) {
    registrar({
      numero: 5,
      nome: "O pedido gravado (persistência + auto-scope)",
      enviado: `GET /api/brain/client-requests?id=${leadComContatoId}`,
      statusHttp: "não tentado",
      recebido: "sem sessão válida — ver instrução de login no topo do log",
      veredito: "⚠️ BLOQUEADO POR AMBIENTE",
      ondeQuebrou: "requireSession() sem cookie válido — senha do seed é aleatória por boot",
    });
  } else {
    // O auto-scope roda em background (fire-and-forget) logo após o 201.
    // Faz-se poll curto para dar tempo a ele terminar, sem forçar nada.
    let ultimo: Record<string, unknown> = {};
    let statusFinal = "";
    for (let tentativa = 0; tentativa < 8; tentativa++) {
      const res = await fetch(`${BASE_URL}/api/brain/client-requests?id=${leadComContatoId}`, {
        headers: headersComSessao(),
      });
      if (res.status !== 200) {
        ultimo = { httpStatus: res.status, body: await res.json().catch(() => ({})) };
        break;
      }
      ultimo = (await res.json()) as Record<string, unknown>;
      statusFinal = String(ultimo.status ?? "");
      if (statusFinal === "scope_ready" || statusFinal === "lead_incompleto") break;
      await esperar(500);
    }

    const businessNameOk = ultimo.businessName === CASO.businessName;
    const chaveGravada = typeof ultimo.chaveDoProspect === "string" && (ultimo.chaveDoProspect as string).length > 0;
    const briefingJson = ultimo.briefingJson as { scope?: { social?: { postsPerWeek?: number } } } | null;
    const volumeGravado = briefingJson?.scope?.social?.postsPerWeek;
    const correto = businessNameOk && volumeGravado === postsPerWeek;

    registrar({
      numero: 5,
      nome: "O pedido gravado (persistência + auto-scope)",
      enviado: `GET /api/brain/client-requests?id=${leadComContatoId} (poll até 8x/500ms)`,
      statusHttp: "200",
      recebido:
        `status=${statusFinal || ultimo.status} · businessName="${ultimo.businessName}" (é o NEGÓCIO? ${businessNameOk}) · ` +
        `chaveDoProspect=${ultimo.chaveDoProspect ?? "null"} (gravada? ${chaveGravada}) · ` +
        `scope.social.postsPerWeek=${volumeGravado} (esperado ${postsPerWeek})`,
      veredito: correto ? "✅ ATRAVESSOU" : "🚫 TRAVOU",
      ondeQuebrou: correto
        ? undefined
        : "lib/agency/persistence/client-request-service.ts (createClientRequest) ou lib/dioli-brain/run-auto-scope.ts",
    });

    if (!chaveGravada) {
      console.log(
        "\n⚠️  chaveDoProspect NÃO foi gravada — verificar lib/agency/comercial/chave-do-prospect.ts " +
          "e lib/agency/persistence/client-request-service.ts:136-143.",
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 6 — A FILA ENXERGA (GET /api/agency/leads)
  // ═══════════════════════════════════════════════════════════════════════
  try {
    const resSemSessao = await fetch(`${BASE_URL}/api/agency/leads`);
    if (!sessionCookie) {
      registrar({
        numero: 6,
        nome: "A fila enxerga (GET /api/agency/leads)",
        enviado: "GET /api/agency/leads (sem sessão)",
        statusHttp: String(resSemSessao.status),
        recebido: resumo(await resSemSessao.json().catch(() => ({}))),
        veredito: resSemSessao.status === 401 ? "⚠️ BLOQUEADO POR AMBIENTE" : "🚫 TRAVOU",
        ondeQuebrou:
          resSemSessao.status === 401
            ? "requireSession() — precisa de MASTER_PASSWORD/SEED_MASTER_PASSWORD para logar (ver topo do log)"
            : "app/api/agency/leads/route.ts:18 (GET deveria exigir sessão)",
      });
    } else {
      const res = await fetch(`${BASE_URL}/api/agency/leads`, { headers: headersComSessao() });
      const json = (await res.json().catch(() => ({}))) as unknown;
      const lista = Array.isArray((json as { leads?: unknown[] })?.leads)
        ? (json as { leads: unknown[] }).leads
        : Array.isArray(json)
          ? (json as unknown[])
          : [];
      registrar({
        numero: 6,
        nome: "A fila enxerga (GET /api/agency/leads)",
        enviado: "GET /api/agency/leads (com sessão)",
        statusHttp: String(res.status),
        recebido: `${res.status === 200 ? `${lista.length} item(ns) na fila` : resumo(json)}`,
        veredito: res.status === 200 ? "✅ ATRAVESSOU" : "🚫 TRAVOU",
        ondeQuebrou: res.status === 200 ? undefined : "app/api/agency/leads/route.ts",
      });
    }
  } catch (e) {
    registrar({
      numero: 6,
      nome: "A fila enxerga (GET /api/agency/leads)",
      enviado: "GET /api/agency/leads",
      statusHttp: "erro de rede",
      recebido: e instanceof Error ? e.message : String(e),
      veredito: "🚫 TRAVOU",
      ondeQuebrou: "app/api/agency/leads/route.ts",
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 7 — A ESTIMATIVA E A VERBA (função pura, mais confiável que raspar tela)
  // ═══════════════════════════════════════════════════════════════════════
  try {
    const postsPerMonth = postsPerWeek * 4;
    const refleteVolume = estimativa.items.some((i) => i.detail.includes(`${postsPerWeek} posts`));
    const confronto = estimativa.confrontoDeVerba;
    const nomeouADiferenca = !!confronto && confronto.diferenca > 0 && confronto.teto === 500;
    const correto = refleteVolume && nomeouADiferenca;

    registrar({
      numero: 7,
      nome: "A estimativa reflete o volume e nomeia a diferença contra a verba",
      enviado: `computeEstimate(scope) com social.postsPerWeek=${postsPerWeek} (${postsPerMonth}/mês) e budgetRange="${CASO.faixaDeVerba}" (teto R$500)`,
      statusHttp: "n/a (função pura)",
      recebido:
        `plano: ${estimativa.items[0]?.label ?? "nenhum"} — ${estimativa.items[0]?.detail ?? ""} · ` +
        `totalMin=R$${estimativa.totalMin} totalMax=R$${estimativa.totalMax} · ` +
        (confronto
          ? `confrontoDeVerba: teto=R$${confronto.teto}, diferença nomeada=R$${confronto.diferenca} ("${confronto.rotulo}")`
          : "confrontoDeVerba: AUSENTE"),
      veredito: correto ? "✅ ATRAVESSOU" : "🚫 TRAVOU",
      ondeQuebrou: correto
        ? undefined
        : "lib/agency/live-calculator.ts:337 (computeEstimate → confrontoDeVerba) ou lib/agency/comercial/verba-declarada.ts:115 (confrontoDeVerba)",
    });

    console.log(
      `\n    → Com "${CASO.fraseDeVolume}" (${postsPerWeek}/semana, ${postsPerMonth}/mês) o pacote cotado é ` +
        `${estimativa.items[0]?.label ?? "?"} (R$${estimativa.items[0]?.minPrice ?? "?"}–R$${estimativa.items[0]?.maxPrice ?? "?"}/mês), ` +
        `contra a verba declarada de R$500/mês.` +
        (confronto ? ` A casa NOMEIA a diferença: R$${confronto.diferenca} a mais.` : " A casa NÃO nomeou diferença nenhuma."),
    );
  } catch (e) {
    registrar({
      numero: 7,
      nome: "A estimativa reflete o volume e nomeia a diferença contra a verba",
      enviado: "computeEstimate(scope)",
      statusHttp: "n/a",
      recebido: e instanceof Error ? e.message : String(e),
      veredito: "🚫 TRAVOU",
      ondeQuebrou: "lib/agency/live-calculator.ts (computeEstimate) lançou",
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 9 — O ORÇAMENTO E O AVISO
  //
  // Executado ANTES da etapa 8 no relógio real (precisa do pedido em
  // new/lead_incompleto/scope_ready — `entregarOrcamentosPendentes` tira o
  // pedido desse estado e o joga em `proposal_pending`). O NÚMERO da etapa no
  // mapa final continua sendo 9, como a ficha pede; só a ORDEM DE EXECUÇÃO
  // interna é invertida, e fica registrado aqui o porquê.
  // ═══════════════════════════════════════════════════════════════════════
  if (!leadComContatoId) {
    naoExecutada(9, "O orçamento e o aviso (entregarOrcamentosPendentes)", 4);
  } else {
    try {
      // Dá um instante para o auto-scope da etapa 4b terminar (ele grava o
      // `estimate` dentro do próprio POST — não depende do auto-scope para
      // isso — mas o pedido pode ainda estar em `new` neste ponto, e
      // `entregarOrcamentosPendentes` também processa `new`. Nenhuma espera é
      // estritamente necessária; ainda assim, uma folga curta evita corrida
      // com a etapa 5 que também está lendo o mesmo registro).
      const resultado = await entregarOrcamentosPendentes();

      const linha = await prisma.clientRequestDb.findUnique({
        where: { id: leadComContatoId },
        select: {
          status: true,
          avisoOrcamentoStatus: true,
          avisoOrcamentoDetalhe: true,
          avisoOrcamentoTentativas: true,
        },
      });

      const entregouNoPortal = linha?.status === "proposal_pending";
      const avisoRegistrado = !!linha?.avisoOrcamentoStatus;

      registrar({
        numero: 9,
        nome: "O orçamento e o aviso — RESEND_API_KEY ausente neste ambiente",
        enviado: "entregarOrcamentosPendentes() — direto, sem HTTP, sem CRON_SECRET (roda contra TODOS os pedidos pendentes do banco local)",
        statusHttp: "n/a (função de esteira, chamada direto)",
        recebido:
          `rodada: entregues=${resultado.entregues} semOrcamento=${resultado.semOrcamento} avisados=${resultado.avisados} ` +
          `semCanal=${resultado.semCanal} avisosQueFalharam=${resultado.avisosQueFalharam.length} falhas=${resultado.falhas.length} · ` +
          `pedido do caso: status=${linha?.status} avisoOrcamentoStatus=${linha?.avisoOrcamentoStatus} ` +
          `avisoOrcamentoDetalhe="${linha?.avisoOrcamentoDetalhe}" tentativas=${linha?.avisoOrcamentoTentativas}`,
        veredito: entregouNoPortal && avisoRegistrado ? "✅ ATRAVESSOU" : "🚫 TRAVOU",
        ondeQuebrou:
          entregouNoPortal && avisoRegistrado
            ? undefined
            : "lib/agency/esteira/orcamento-do-briefing.ts:452 (entregarOrcamentosPendentes)",
      });

      console.log(
        `\n    → MODO DE FALHA DO AVISO POR E-MAIL (sem RESEND_API_KEY neste ambiente): ` +
          `${linha?.avisoOrcamentoStatus === "skipped" ? "SILENCIOSO para quem olha só a resposta HTTP (nada lança, nada quebra), " +
            "mas REGISTRADO como fato no banco (avisoOrcamentoStatus='skipped', avisoOrcamentoDetalhe='" +
            `${linha?.avisoOrcamentoDetalhe}'` +
            ") — não é o silêncio de 51 dias, é log estruturado que autoriza reenvio."
            : `status observado="${linha?.avisoOrcamentoStatus}" (verificar lib/agency/esteira/orcamento-do-briefing.ts:289, avisarPorEmail)`
          }`,
      );
      if (resultado.avisosQueFalharam.length > 0) {
        console.log("    → avisosQueFalharam (amostra):");
        resultado.avisosQueFalharam.slice(0, 5).forEach((l) => console.log(`      · ${l}`));
      }
    } catch (e) {
      registrar({
        numero: 9,
        nome: "O orçamento e o aviso",
        enviado: "entregarOrcamentosPendentes()",
        statusHttp: "n/a",
        recebido: e instanceof Error ? e.message : String(e),
        veredito: "🚫 TRAVOU",
        ondeQuebrou: "lib/agency/esteira/orcamento-do-briefing.ts (entregarOrcamentosPendentes) lançou",
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 8 — APROVAÇÃO → CADASTRO → PROJETO (única rota que muda estado)
  // ═══════════════════════════════════════════════════════════════════════
  const proposalPara = (sufixo: string) => ({
    name: `${CASO.businessName} — Social Media${sufixo}`,
    goal: `Cadência de ${postsPerWeek} posts/semana no Instagram, dentro do que a verba de R$500/mês permitir.`,
    stage: "onboarding",
    tasks: [
      { title: "Calendário editorial do mês", department: "social-media", priority: "high", estimatedDays: 3 },
      { title: "Produção das primeiras peças", department: "design", priority: "high", estimatedDays: 5 },
    ],
  });

  if (!leadComContatoId) {
    naoExecutada(8, "Aprovação → cadastro → projeto (POST /api/brain/orchestrate/apply)", 4);
  } else if (!sessionCookie) {
    registrar({
      numero: 8,
      nome: "Aprovação → cadastro → projeto (POST /api/brain/orchestrate/apply)",
      enviado: `POST /api/brain/orchestrate/apply {clientRequestId: ${leadComContatoId}, proposal: {...}}`,
      statusHttp: "não tentado",
      recebido: "sem sessão válida — ver instrução de login no topo do log",
      veredito: "⚠️ BLOQUEADO POR AMBIENTE",
      ondeQuebrou: "requireSession(['master','project_manager']) sem cookie válido",
    });
  } else {
    try {
      const res1 = await fetch(`${BASE_URL}/api/brain/orchestrate/apply`, {
        method: "POST",
        headers: headersComSessao(),
        body: JSON.stringify({ clientRequestId: leadComContatoId, proposal: proposalPara("") }),
      });
      const json1 = (await res1.json().catch(() => ({}))) as { ok?: boolean; projectId?: string; error?: string };

      let clientId1: string | null = null;
      let clientId2: string | null = null;
      let res2Status = "não tentado (leadReaproveitamentoId ausente)";
      let json2: { ok?: boolean; projectId?: string; error?: string } = {};

      if (res1.status === 201) {
        const linha1 = await prisma.clientRequestDb.findUnique({
          where: { id: leadComContatoId },
          select: { clientId: true },
        });
        clientId1 = linha1?.clientId ?? null;

        if (leadReaproveitamentoId) {
          const res2 = await fetch(`${BASE_URL}/api/brain/orchestrate/apply`, {
            method: "POST",
            headers: headersComSessao(),
            body: JSON.stringify({ clientRequestId: leadReaproveitamentoId, proposal: proposalPara(" (2)") }),
          });
          res2Status = String(res2.status);
          json2 = await res2.json().catch(() => ({}));
          if (res2.status === 201) {
            const linha2 = await prisma.clientRequestDb.findUnique({
              where: { id: leadReaproveitamentoId },
              select: { clientId: true },
            });
            clientId2 = linha2?.clientId ?? null;
          }
        }
      }

      const criouProjeto = res1.status === 201 && !!json1.projectId;
      const reaproveitou = !!clientId1 && !!clientId2 && clientId1 === clientId2;

      registrar({
        numero: 8,
        nome: "Aprovação → cadastro → projeto",
        enviado: `POST .../apply (lead 1) → ${leadComContatoId} · POST .../apply (lead 2, mesmo contato) → ${leadReaproveitamentoId ?? "n/a"}`,
        statusHttp: `lead1=${res1.status} · lead2=${res2Status}`,
        recebido:
          `lead1: projectId=${json1.projectId ?? json1.error} clientId=${clientId1} · ` +
          `lead2: projectId=${json2.projectId ?? json2.error} clientId=${clientId2} · ` +
          `reaproveitou Client? ${reaproveitou} (mesmo contato deveria dar o MESMO clientId)`,
        veredito: criouProjeto ? "✅ ATRAVESSOU" : "🚫 TRAVOU",
        ondeQuebrou: criouProjeto ? undefined : "app/api/brain/orchestrate/apply/route.ts:69 (POST)",
      });

      if (clientId1 && clientId2 && !reaproveitou) {
        console.log(
          `\n🔴 ACHADO: dois pedidos com o MESMO contato (${CASO.email} / ${CASO.whatsapp}) criaram DOIS Client ` +
            `diferentes (${clientId1} ≠ ${clientId2}) — lib/agency/execution/cliente-do-briefing.ts:157 (resolverOuCriarCliente).`,
        );
      } else if (reaproveitou) {
        console.log(`\n    → Reaproveitamento confirmado: os dois pedidos convergiram para o mesmo Client (${clientId1}).`);
      }
    } catch (e) {
      registrar({
        numero: 8,
        nome: "Aprovação → cadastro → projeto",
        enviado: "POST /api/brain/orchestrate/apply",
        statusHttp: "erro de rede",
        recebido: e instanceof Error ? e.message : String(e),
        veredito: "🚫 TRAVOU",
        ondeQuebrou: "app/api/brain/orchestrate/apply/route.ts",
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 10 — O PORTAL DO CLIENTE
  // ═══════════════════════════════════════════════════════════════════════
  if (!leadComContatoId) {
    naoExecutada(10, "O portal do cliente", 4);
  } else if (!sessionCookie) {
    registrar({
      numero: 10,
      nome: "O portal do cliente",
      enviado: `POST /api/brain/portal-access {clientRequestId: ${leadComContatoId}}`,
      statusHttp: "não tentado",
      recebido: "sem sessão válida — ver instrução de login no topo do log",
      veredito: "⚠️ BLOQUEADO POR AMBIENTE",
      ondeQuebrou: "requireSession() sem cookie válido",
    });
  } else {
    try {
      const tokenRes = await fetch(`${BASE_URL}/api/brain/portal-access`, {
        method: "POST",
        headers: headersComSessao(),
        body: JSON.stringify({ clientRequestId: leadComContatoId }),
      });
      const tokenJson = (await tokenRes.json().catch(() => ({}))) as { token?: string; url?: string };
      const token = tokenJson.token;

      if (!token) {
        registrar({
          numero: 10,
          nome: "O portal do cliente — o link existe?",
          enviado: `POST /api/brain/portal-access {clientRequestId: ${leadComContatoId}}`,
          statusHttp: String(tokenRes.status),
          recebido: resumo(tokenJson),
          veredito: "🚫 TRAVOU",
          ondeQuebrou: "app/api/brain/portal-access/route.ts",
        });
      } else {
        const dataRes = await fetch(`${BASE_URL}/api/brain/portal-data?token=${encodeURIComponent(token)}`);
        const dataJson = (await dataRes.json().catch(() => ({}))) as {
          businessName?: string; status?: string; pipeline?: unknown[]; approvals?: unknown[];
        };
        const pageRes = await fetch(`${BASE_URL}/portal/access/${encodeURIComponent(token)}`);

        const dadosOk = dataRes.status === 200 && dataJson.businessName === CASO.businessName;
        const paginaOk = pageRes.status === 200;

        registrar({
          numero: 10,
          nome: "O portal do cliente — o link existe, abre e mostra o quê",
          enviado:
            `POST /api/brain/portal-access → token · GET /api/brain/portal-data?token=... · GET /portal/access/[token]`,
          statusHttp: `token=${tokenRes.status} data=${dataRes.status} page=${pageRes.status}`,
          recebido:
            `businessName="${dataJson.businessName}" status="${dataJson.status}" ` +
            `pipeline=${Array.isArray(dataJson.pipeline) ? dataJson.pipeline.length : "?"} passos ` +
            `approvals=${Array.isArray(dataJson.approvals) ? dataJson.approvals.length : "?"} · página HTML: ${pageRes.status}`,
          veredito: dadosOk && paginaOk ? "✅ ATRAVESSOU" : "🚫 TRAVOU",
          ondeQuebrou:
            dadosOk && paginaOk
              ? undefined
              : "app/api/brain/portal-data/route.ts ou app/portal/access/[token]/page.tsx",
        });
      }
    } catch (e) {
      registrar({
        numero: 10,
        nome: "O portal do cliente",
        enviado: "POST /api/brain/portal-access + GET portal-data + GET /portal/access/[token]",
        statusHttp: "erro de rede",
        recebido: e instanceof Error ? e.message : String(e),
        veredito: "🚫 TRAVOU",
        ondeQuebrou: "app/api/brain/portal-access/route.ts ou app/api/brain/portal-data/route.ts",
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // O MAPA DA CORRENTE
  // ═══════════════════════════════════════════════════════════════════════
  mapa.sort((a, b) => a.numero - b.numero);

  console.log("\n" + "═".repeat(78));
  console.log("MAPA DA CORRENTE");
  console.log("═".repeat(78));
  for (const e of mapa) {
    console.log(`  ${String(e.numero).padStart(2, " ")}. ${e.veredito.padEnd(24)} ${e.nome}`);
  }

  const rompimentos = mapa.filter((e) => e.veredito === "🚫 TRAVOU" || e.veredito === "NÃO EXECUTADA");
  const bloqueios = mapa.filter((e) => e.veredito === "⚠️ BLOQUEADO POR AMBIENTE");

  console.log("\n" + "─".repeat(78));
  console.log("ONDE QUEBROU");
  console.log("─".repeat(78));
  if (rompimentos.length === 0 && bloqueios.length === 0) {
    console.log("  A corrente atravessou INTEIRA — nenhuma etapa travou ou ficou bloqueada.");
  } else {
    if (rompimentos.length > 0) {
      console.log("\n  Rompimentos reais (🚫 TRAVOU / NÃO EXECUTADA):");
      for (const e of rompimentos) {
        console.log(`    [${e.numero}] ${e.nome}`);
        console.log(`        ${e.ondeQuebrou ?? "(sem localização — ver 'recebido' acima)"}`);
      }
    }
    if (bloqueios.length > 0) {
      console.log("\n  Bloqueios de ambiente, não da esteira (⚠️ BLOQUEADO POR AMBIENTE):");
      for (const e of bloqueios) {
        console.log(`    [${e.numero}] ${e.nome} — ${e.ondeQuebrou}`);
      }
    }
  }
  console.log("\n" + "═".repeat(78));

  await prisma.$disconnect().catch(() => {});
  // Este script MEDE — não é portão de CI. Quem julga é o PM lendo o mapa.
  process.exit(0);
}

main().catch(async (e) => {
  console.error("\n🔴 Fatal (o script em si quebrou, fora do fluxo de etapas):", e);
  await prisma.$disconnect().catch(() => {});
  process.exit(0);
});
