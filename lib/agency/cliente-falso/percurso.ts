// percurso.ts — o cliente falso dirigindo a esteira REAL, do primeiro clique ao
// orçamento entregue.
//
// ─── O QUE É REAL AQUI, E É QUASE TUDO ──────────────────────────────────────
//
// Nada é imitado. Cada etapa chama o mesmo módulo que atende o cliente de
// verdade:
//
//   porta      → os validadores de `comercial/contato-do-lead`
//   sala abre  → `initProspectConvState` (o mesmo que `PublicBriefingRoom` usa)
//   conversa   → `processProspectMessage`, turno a turno
//   anexo      → `montarAvisoDeAnexo`
//   portão     → `canSubmitProposal` / `getSubmissionBlockReason`
//   envio      → `POST /api/brain/client-requests`, a rota pública de verdade
//   orçamento  → `entregarOrcamentosPendentes`, o mesmo que o relógio chama
//
// O único ponto que pode ser imitado é o SDR de IA — e quando ele é, o percurso
// DIZ (`sdrAoVivo: false`) e a verificação do guarda devolve "nao-coberto".
// Instrumento que esconde o que não mediu é instrumento que mente.
//
// ─── POR QUE ISTO NÃO SOBE SERVIDOR NEM NAVEGADOR ───────────────────────────
//
// Medido em 23/08/2026: a rota `POST /api/brain/client-requests` responde 201
// chamada em processo, com `NextRequest` montado à mão e um SQLite descartável.
// Playwright existe no projeto, mas exigiria servidor de pé, navegador baixado e
// um banco vivo — e o CEO pediu a PRIMEIRA RODADA HOJE. Um arranjo pequeno que
// roda hoje vale mais que um completo na semana que vem.
//
// O que fica de fora por essa escolha está escrito com todas as letras no
// cabeçalho de `scripts/cliente-falso.mts`, não escondido aqui.

import { NextRequest } from "next/server";
import { initProspectConvState, processProspectMessage, type ProspectConvState } from "../prospect-engine";
import { montarAvisoDeAnexo } from "../anexo-nao-e-resposta";
import { canSubmitProposal, getSubmissionBlockReason, buildHandoffSummary } from "../sdr-agent";
import { emailValido, whatsappValido } from "../comercial/contato-do-lead";
import { entregarOrcamentosPendentes } from "../esteira/orcamento-do-briefing";
import { PREFIXO_TURNO_BARRADO } from "../comercial/registro-da-conversa";
import { prisma } from "@/lib/db/client";
import { limparSaidasBloqueadas, saidasBloqueadas } from "./trava-de-saida";
import {
  ROTEIRO_PADRAO, ARQUIVO_DO_CLIENTE_FALSO, OFERTA_DE_DOCUMENTO,
  fatoQueResponde, type Roteiro,
} from "./roteiro";
import type { Percurso, RespostaDoSdr, TurnoMedido } from "./verificacoes";

/**
 * Quantas vezes o cliente falso responde antes de desistir.
 *
 * 24 é folgado de propósito: a entrevista completa da casa tem ~18 perguntas
 * (`question-engine.ts`) e um teto apertado esconderia "a casa pergunta demais"
 * atrás de "o teste acabou". Atingir o teto é ACHADO, não acidente.
 */
const TETO_DE_TURNOS = 24;

export type OpcoesDoPercurso = {
  roteiro?: Roteiro;
  /** Fio da conversa. Carimbado para o dado de teste ser reconhecível no banco. */
  fio?: string;
  /**
   * Chama a rota REAL do SDR (`app/api/sdr/chat`) a cada turno. Custa chave de
   * IA paga — por isso é opt-in explícito, nunca padrão. Ver o custo medido no
   * cabeçalho de `scripts/cliente-falso.mts`.
   */
  sdrAoVivo?: boolean;
};

/** Etapa que não atravessou. Fica no percurso para o placar poder mostrar. */
export type Tropeco = { etapa: string; erro: string };

export type ResultadoDoPercurso = { percurso: Percurso; tropecos: Tropeco[] };

export async function rodarPercurso(opts: OpcoesDoPercurso = {}): Promise<ResultadoDoPercurso> {
  const roteiro = opts.roteiro ?? ROTEIRO_PADRAO;
  const fio = opts.fio ?? `cliente-falso-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const tropecos: Tropeco[] = [];
  limparSaidasBloqueadas();

  // ─── ETAPA 1: A PORTA ────────────────────────────────────────────────────
  // O contato do cliente falso passa pelos MESMOS validadores da porta. Um
  // roteiro cujo contato a própria porta recusaria testaria um cliente que não
  // pode existir — e todo veredito daí para frente seria sobre nada.
  const c = roteiro.contatoDaPorta;
  if (!emailValido(c.email)) tropecos.push({ etapa: "porta", erro: `e-mail do roteiro reprovado pela porta: ${c.email}` });
  if (!whatsappValido(c.whatsapp)) tropecos.push({ etapa: "porta", erro: `WhatsApp do roteiro reprovado pela porta: ${c.whatsapp}` });

  // ─── ETAPA 2: A SALA ABRE ────────────────────────────────────────────────
  let estado: ProspectConvState = initProspectConvState(c);
  const saudacao = estado.conv.messages[0]?.text ?? "";

  // ─── ETAPA 3: OS TURNOS ──────────────────────────────────────────────────
  //
  // O laço para quando o portão abre — que é quando um cliente de verdade
  // pararia de responder e clicaria em enviar. `TETO_DE_TURNOS` é a corda de
  // segurança: uma casa que pergunta para sempre é um defeito, e o teto o
  // transforma em placar em vez de travar a rodada.
  const turnos: TurnoMedido[] = [];
  const respostasDoSdr: RespostaDoSdr[] = [];
  const fatosUsados = new Set<string>();
  let numero = 0;

  while (numero < TETO_DE_TURNOS) {
    numero++;
    const perguntaDaCasa = numero === 1
      ? saudacao
      : turnos[turnos.length - 1].daCasa;

    // O que o cliente diz neste turno, na ordem em que uma pessoa decidiria:
    //  1. abre se apresentando (ninguém pediu, é ele chegando);
    //  2. no turno combinado, OFERECE o documento por vontade própria;
    //  3. no turno seguinte, ANEXA;
    //  4. senão, responde a pergunta que recebeu;
    //  5. e se não souber do que se trata, diz que não entendeu.
    let texto: string;
    let intencao: string;
    let anexos: string[] | undefined;

    if (numero === 1) {
      texto = roteiro.aberturaEspontanea;
      intencao = "apresenta";
    } else if (numero === roteiro.turnoDaOfertaDeDocumento) {
      texto = OFERTA_DE_DOCUMENTO;
      intencao = "oferece_documento";
    } else if (numero === roteiro.turnoDoAnexo) {
      // O anexo NÃO é frase digitada: é o recado que a sala monta sozinha.
      // Passá-lo como texto qualquer reproduziria, DENTRO do teste, o defeito
      // de 16/08 que `anexo-nao-e-resposta.ts` existe para impedir.
      texto = montarAvisoDeAnexo(ARQUIVO_DO_CLIENTE_FALSO);
      intencao = "anexa_documento";
      anexos = [ARQUIVO_DO_CLIENTE_FALSO];
    } else {
      const fato = fatoQueResponde(perguntaDaCasa, roteiro, fatosUsados);
      if (fato) {
        fatosUsados.add(fato.id);
        texto = fato.responde;
        intencao = fato.intencao;
      } else {
        texto = roteiro.quandoNaoEntende;
        intencao = "nao_entendeu";
      }
    }

    if (opts.sdrAoVivo) {
      respostasDoSdr.push(await chamarSdrDeVerdade(numero, estado, texto, fio, tropecos));
    }

    estado = processProspectMessage(texto, estado, anexos);
    const daCasa = estado.conv.messages[estado.conv.messages.length - 1]?.text ?? "";
    turnos.push({ numero, doCliente: texto, daCasa, intencao, escopoDepois: estado.conv.scope });

    // Portão aberto = o cliente já pode enviar. Ele para de falar aqui.
    if (canSubmitProposal(estado.conv, estado.sdr)) break;

    // ── A CORDA CONTRA CONVERSA MORTA ───────────────────────────────────────
    // Se o cliente já disse "não entendi" duas vezes seguidas, a conversa
    // travou: seguir batendo até o teto só encheria o placar de ruído e
    // esconderia o achado. O placar registra o impasse, que é o fato.
    const doisSemEntender = turnos.length >= 2
      && turnos.slice(-2).every((t) => t.intencao === "nao_entendeu");
    if (doisSemEntender) break;
  }

  const conv = estado.conv;
  const portaoAbriu = canSubmitProposal(conv, estado.sdr);
  const bloqueioDoPortao = getSubmissionBlockReason(conv, estado.sdr);

  // ─── ETAPA 4: O ENVIO ────────────────────────────────────────────────────
  // A rota pública de verdade, com o MESMO corpo que `app/briefing/page.tsx`
  // monta. Copiar o formato aqui seria testar um formato paralelo; por isso os
  // nomes de campo abaixo espelham aquele arquivo, campo a campo.
  //
  // ⚠️ O envio acontece MESMO com o portão fechado, e é deliberado: a rota é
  // pública e um POST direto passa por cima de qualquer `disabled` de botão —
  // é o que o próprio comentário de `handleSubmitWithContact` diz. Parar aqui
  // esconderia o que a casa faz com um briefing incompleto, que é justamente o
  // caminho pelo qual o CEO ficou sem orçamento.
  let pedido: Percurso["pedido"] = null;
  try {
    const { POST } = await import("@/app/api/brain/client-requests/route");
    const req = new NextRequest("http://cliente-falso.local/api/brain/client-requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        businessName: roteiro.nomeDoNegocioNaTela,
        segment: conv.scope.segment ?? "",
        services: servicosDoEscopo(conv.scope),
        objectives: conv.scope.objectives ?? [],
        rawContext: conv.messages.map((m) => `${m.role}: ${m.text}`).join("\n"),
        source: "briefing",
        contato: { nome: c.nome, email: c.email, whatsapp: c.whatsapp },
        briefingJson: { transcript: conv.messages, scope: conv.scope, estimate: conv.estimate },
        sdrHandoffJson: buildHandoffSummary(conv, estado.sdr),
        attachmentsJson: [{ id: "anexo-falso-1", fileName: ARQUIVO_DO_CLIENTE_FALSO, fileType: "application/pdf", sizeBytes: 12345 }],
      }),
    });
    const res = await POST(req);
    const corpo = (await res.json()) as { id?: string; status?: string; businessName?: string; error?: string };
    if (res.status >= 400 || !corpo.id) {
      tropecos.push({ etapa: "envio", erro: `a rota devolveu ${res.status}: ${corpo.error ?? "sem id"}` });
    } else {
      pedido = { id: corpo.id, status: corpo.status ?? "?", businessName: corpo.businessName ?? "" };
    }
  } catch (e) {
    tropecos.push({ etapa: "envio", erro: e instanceof Error ? e.message : String(e) });
  }

  // ─── ETAPA 5: O ORÇAMENTO CHEGA ──────────────────────────────────────────
  // Mesma função que o despertador chama de 5 em 5 minutos. Se ela não entregar,
  // o cliente de verdade também não recebe.
  let orcamentoEntregue: string | null = null;
  if (pedido) {
    try {
      await entregarOrcamentosPendentes();
      const msg = await prisma.portalMessage.findFirst({
        where: { clientRequestId: pedido.id, authorRole: { not: "client" } },
        orderBy: { createdAt: "desc" },
        select: { body: true },
      });
      orcamentoEntregue = msg?.body ?? null;
      const atual = await prisma.clientRequestDb.findUnique({ where: { id: pedido.id }, select: { status: true } });
      if (atual) pedido = { ...pedido, status: atual.status };
    } catch (e) {
      tropecos.push({ etapa: "orcamento", erro: e instanceof Error ? e.message : String(e) });
    }
  }

  // ─── ETAPA 6: O GUARDA BARROU ALGUÉM? ────────────────────────────────────
  // Lido do REGISTRO, não deduzido da conversa: quando o guarda barra, o cliente
  // não vê diferença nenhuma — só o banco sabe. É por isso que o CEO nunca
  // percebeu; e é por isso que se lê aqui.
  const turnosBarrados: string[] = [];
  if (opts.sdrAoVivo) {
    try {
      const barrados = await prisma.portalMessage.findMany({
        where: { clientId: { contains: fio }, body: { contains: PREFIXO_TURNO_BARRADO } },
        select: { body: true },
      });
      turnosBarrados.push(...barrados.map((b) => b.body));
    } catch (e) {
      tropecos.push({ etapa: "guarda", erro: e instanceof Error ? e.message : String(e) });
    }
  }

  return {
    percurso: {
      roteiro,
      saudacao,
      turnos,
      escopoFinal: conv.scope,
      estimativaFinal: conv.estimate,
      portaoAbriu,
      bloqueioDoPortao,
      ultimaFalaDaCasa: turnos[turnos.length - 1]?.daCasa ?? saudacao,
      pedido,
      orcamentoEntregue,
      turnosBarrados,
      respostasDoSdr,
      sdrAoVivo: !!opts.sdrAoVivo,
      saidasBloqueadas: saidasBloqueadas(),
    },
    tropecos,
  };
}

/** Os serviços, no formato que a rota espera — derivado do escopo, nunca fixo. */
function servicosDoEscopo(s: Percurso["escopoFinal"]): string[] {
  const out: string[] = [];
  if (s.wantsSocialMedia) out.push("social_media");
  if (s.wantsPaidTraffic) out.push("paid_traffic");
  if (s.branding?.requested) out.push("branding");
  return out;
}

/**
 * Chama a rota REAL do SDR e DIZ O QUE ELA RESPONDEU.
 *
 * ─── POR QUE ESTA FUNÇÃO PASSOU A DEVOLVER ALGO (23/08/2026) ────────────────
 *
 * Ela fazia `await POST(req)` e jogava a resposta fora. Parecia inofensivo —
 * "quando a IA não responde, o cliente de verdade também segue pelo motor de
 * regras". A parte omitida é que, jogando a resposta fora, o INSTRUMENTO
 * também não sabia se a IA tinha respondido.
 *
 * O estrago disso é preciso e é grave: `/api/sdr/chat` devolve
 * `{ ok:false, reason:"not_configured" }` ANTES de qualquer escrita quando não
 * há chave. Nenhuma linha entra no diário, `turnosBarrados` fica vazio — e a
 * verificação do guarda, que lê exatamente esse vazio, devolvia **"passou"**.
 * Uma rodada marcada `--ao-vivo` SEM CHAVE NENHUMA fechava 10 de 10 em verde,
 * com a décima verificação afirmando sobre um SDR que nunca falou. O mesmo
 * vale para o teto de ritmo (429): a rota recusa antes do modelo, o percurso
 * segue no motor de regras e o placar não tinha como notar.
 *
 * Era o defeito nº 4 do CEO — "o plano B atende, ninguém percebe, e a tela
 * fica verde" — acontecendo DENTRO do instrumento que existe para pegá-lo.
 *
 * O conserto é o mínimo honesto: registrar, turno a turno, se o modelo
 * respondeu e, quando não respondeu, POR QUÊ. Quem julga isso é
 * `verificacoes.ts`; aqui só se mede.
 *
 * Falha aqui continua NUNCA derrubando o percurso: o cliente de verdade também
 * segue pelo motor de regras quando a IA cai. Reproduzir isso é o ponto — o
 * que não pode é reproduzir em silêncio.
 */
async function chamarSdrDeVerdade(
  numero: number, estado: ProspectConvState, texto: string, fio: string, tropecos: Tropeco[],
): Promise<RespostaDoSdr> {
  try {
    const { POST } = await import("@/app/api/sdr/chat/route");
    const req = new NextRequest("http://cliente-falso.local/api/sdr/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: estado.conv.messages.map((m) => ({ role: m.role, text: m.text })),
        currentMessage: texto,
        scope: estado.conv.scope,
        sessionId: fio,
      }),
    });
    const res = await POST(req);

    // O 429/503 do freio de ritmo não passa pelo corpo `{ok, reason}` da rota —
    // é `respostaDeRecusa`, com `{error}`. Lido pelo status, que é o único
    // campo que os dois formatos têm em comum.
    if (res.status === 429) return { turno: numero, respondeu: false, motivo: "teto_de_ritmo" };
    if (res.status === 503) return { turno: numero, respondeu: false, motivo: "contador_indisponivel" };

    const corpo = (await res.json()) as { ok?: boolean; reason?: string };
    if (corpo.ok === true) return { turno: numero, respondeu: true, motivo: null };
    return { turno: numero, respondeu: false, motivo: corpo.reason ?? `http_${res.status}` };
  } catch (e) {
    tropecos.push({ etapa: "sdr", erro: e instanceof Error ? e.message : String(e) });
    return { turno: numero, respondeu: false, motivo: "excecao_na_rota" };
  }
}
