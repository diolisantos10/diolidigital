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
import type { Percurso, RespostaDoSdr, TurnoMedido, DesfechoDaAprovacao, DesfechoDoAceite, TentativaDeIntruso, EstadoDaEsteira } from "./verificacoes";

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
  /**
   * Base de um servidor Next de teste já de pé (`http://127.0.0.1:<porta>`).
   * Quando presente, a aprovação do escopo vai pela porta autenticada DE
   * VERDADE, por HTTP — o único jeito de exercitar `cookies()`. Ver
   * `servidor-de-teste.ts`.
   */
  baseUrlDoServidor?: string | null;
};

/** Etapa que não atravessou. Fica no percurso para o placar poder mostrar. */
export type Tropeco = { etapa: string; erro: string };

export type ResultadoDoPercurso = { percurso: Percurso; tropecos: Tropeco[] };

export async function rodarPercurso(opts: OpcoesDoPercurso = {}): Promise<ResultadoDoPercurso> {
  const roteiro = opts.roteiro ?? ROTEIRO_PADRAO;
  // ── A CASA EXISTE ANTES DO CLIENTE CHEGAR ────────────────────────────────
  // Uma agência tem workspace e tem gente. Criar isso ANTES da conversa (e não
  // no meio) mantém TODAS as rodadas idênticas — se nascesse na etapa 7, a
  // rodada 1 rodaria numa base sem workspace e as seguintes numa base com, e
  // duas rodadas que não são iguais não se comparam.
  const casa = await garantirACasa();
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

  // ─── ETAPA 7: A APROVAÇÃO DO ESCOPO — a porta que exige gente ────────────
  //
  // Este é o ponto em que a esteira PARA na vida real, e o piloto existe para
  // provar isso em vez de supor. `createProjectFromRequest` só é chamada de
  // `POST /api/brain/auto-scope/[id]/review`, que exige sessão de agência.
  //
  // Tentamos a ROTA REAL primeiro, com uma sessão de staff de verdade (JWT
  // assinado com a mesma chave do login). Se a rota não puder ser exercida em
  // processo, o percurso NÃO finge que aprovou: ele diz qual metade rodou.
  let aprovacao: DesfechoDaAprovacao = { tentou: false, viaRota: false, ok: false, motivo: "não houve pedido para aprovar", recusouQuemNaoEStaff: null, intrusos: [] };
  let esteira: EstadoDaEsteira = {
    projetoId: null, tarefas: 0, execucaoRodou: false, execucaoErro: null,
    execucaoStatus: null, direcaoAprovada: false, entregas: 0,
    direcaoPedida: false, direcaoViaPortal: false, direcaoMotivo: null,
    execucaoPendencias: null, execucaoTentativas: 0,
  };
  let aceite: DesfechoDoAceite = { tentou: false, viaPortal: false, nasceuSozinho: false, motivo: "não houve proposta para aceitar" };

  if (pedido) {
    // ─── ETAPA 6.5: O CLIENTE ACEITA — E O PROJETO NASCE SOZINHO ───────────
    // O caminho do cursograma: um único ponto de decisão depois do preço
    // ("cliente aceitou?") e o projeto nasce. Roda ANTES da rota de staff de
    // propósito: é o caminho NORMAL, e a rota de staff tem de continuar
    // funcionando por cima dele (idempotente), não no lugar dele.
    aceite = await aceitarAPropostaComoOCliente(pedido.id, tropecos);

    aprovacao = await aprovarOEscopo(pedido.id, casa, tropecos, opts.baseUrlDoServidor ?? null);

    if (aprovacao.ok) {
      // ─── ETAPA 8: O PROJETO NASCEU? E COM TAREFAS? ────────────────────────
      try {
        const proj = await prisma.project.findFirst({ where: { clientRequestId: pedido.id }, orderBy: { createdAt: "asc" } });
        if (proj) {
          esteira.projetoId = proj.id;
          esteira.tarefas = await prisma.task.count({ where: { projectId: proj.id } });
        }
      } catch (e) {
        tropecos.push({ etapa: "projeto", erro: e instanceof Error ? e.message : String(e) });
      }

      // ─── ETAPA 8.5: O PORTÃO DE DIREÇÃO, PELO CAMINHO DO CLIENTE ─────────
      // Ver `avalizarADirecaoComoOCliente`. Nada aqui escreve
      // `directionApprovedAt`: ou o cliente falso abre o portão do jeito que um
      // cliente abre, ou o portão fica fechado e a verificação diz isso.
      if (esteira.projetoId) {
        const aval = await avalizarADirecaoComoOCliente(pedido.id, esteira.projetoId, tropecos);
        esteira.direcaoPedida = aval.pedida;
        esteira.direcaoViaPortal = aval.viaPortal;
        esteira.direcaoMotivo = aval.motivo;
      }

      // ─── ETAPA 9: A EXECUÇÃO ANDA? (e "andar" é PRODUZIR) ─────────────────
      // Mesma função que o relógio chama. Se ela não anda aqui, não anda lá.
      if (esteira.projetoId) {
        try {
          const { runProjectExecution } = await import("@/lib/agency/execution/run-execution");
          await runProjectExecution(esteira.projetoId);
          esteira.execucaoRodou = true;
          // A PROVA de que algo andou não é "não estourou" — é o que sobrou no
          // banco. Lido DEPOIS da chamada, do mesmo lugar que o painel lê.
          const depois = await prisma.project.findUnique({
            where: { id: esteira.projetoId },
            select: { executionStatus: true, directionApprovedAt: true, executionError: true, executionAttempts: true },
          });
          esteira.execucaoStatus = depois?.executionStatus ?? null;
          esteira.direcaoAprovada = !!depois?.directionApprovedAt;
          esteira.execucaoPendencias = depois?.executionError ?? null;
          esteira.execucaoTentativas = depois?.executionAttempts ?? 0;
          esteira.entregas = await prisma.deliverable.count({ where: { projectId: esteira.projetoId } });
        } catch (e) {
          esteira.execucaoErro = e instanceof Error ? e.message : String(e);
          tropecos.push({ etapa: "execucao", erro: esteira.execucaoErro });
        }
      }
    }
  }

  // ─── ETAPA 10: A PARADA DECLARADA ────────────────────────────────────────
  // `publicarAgendados` NÃO é chamada nesta volta, de propósito. Publicar sai
  // no perfil do cliente, é público e desfazer não desfaz o print — exercitar
  // isso na mesma volta em que três travas acabaram de nascer seria trocar o
  // risco conhecido por um desconhecido. A verificação declara "não coberto";
  // ela NUNCA diz "passou". Instrumento que esconde o que não mediu mente.

  return {
    percurso: {
      roteiro,
      aprovacao,
      aceite,
      esteira,
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


/** Workspace + usuário de staff do ambiente descartável. Idempotente. */
async function garantirACasa(): Promise<{ workspaceId: string; userId: string; nome: string; email: string }> {
  const ws = (await prisma.agencyWorkspace.findFirst({ select: { id: true } }))
    ?? (await prisma.agencyWorkspace.create({ data: { name: "Dioli Prova [TESTE]", slug: "dioli-prova-teste" }, select: { id: true } }));

  const email = "staff.prova@cliente-falso.invalid";
  const nome = "Staff Prova [TESTE]";
  const user = (await prisma.user.findUnique({ where: { email }, select: { id: true } }))
    ?? (await prisma.user.create({
      // `passwordHash` inválido de propósito: esta conta NUNCA deve conseguir
      // logar por senha. Ela existe só para haver um `userId` real por trás da
      // sessão que a etapa 7 monta.
      data: { email, name: nome, passwordHash: "sem-login-nunca", role: "master", workspaceId: ws.id },
      select: { id: true },
    }));

  // ── UMA CONEXÃO DE WHATSAPP DE MENTIRA, PARA A TRAVA SER EXERCITADA ──────
  // Medido em 24/08/2026: a esteira mandava dois avisos ao cliente (MARCO 0 e
  // MARCO 1) e a trava de WhatsApp NUNCA era alcançada — `tentarWhatsApp`
  // desistia antes, em "nenhuma conexão de WhatsApp no workspace". O placar
  // dizia "2 mensagens barradas" e nenhuma delas era desta porta: proteção
  // presumida, não medida. Exatamente o defeito que esta bateria existe para
  // pegar, cometido por dentro dela.
  //
  // Com a conexão presente, o aviso percorre o caminho inteiro até bater na
  // trava. É seguro porque a trava de `sendWhatsAppMessage` vem ANTES de
  // `loadConnectionToken`: o token de mentira aqui nunca chega a ser lido, e
  // não existe caminho em que ele possa virar chamada de rede.
  const jaTem = await prisma.metaConnection.findFirst({ where: { workspaceId: ws.id, platform: "whatsapp" }, select: { id: true } });
  if (!jaTem) {
    await prisma.metaConnection.create({
      data: {
        workspaceId: ws.id,
        platform: "whatsapp",
        name: "WhatsApp Prova [TESTE]",
        externalId: "000000000000000",
        accessTokenEncrypted: "sem-token-nunca",
        status: "connected",
      },
    });
  }

  return { workspaceId: ws.id, userId: user.id, nome, email };
}

/**
 * Aprova o escopo — pela ROTA REAL se der, e dizendo a verdade se não der.
 *
 * A rota é autenticada, e `getSession()` lê o cookie por `next/headers`
 * (`cookies()`), que só existe dentro do servidor do Next. Chamada em processo,
 * ela pode simplesmente não ter contexto de requisição. Se isso acontecer, o
 * percurso NÃO desiste nem finge: ele chama a MESMA função que a rota chamaria
 * (`createProjectFromRequest`) e registra que **a camada de autenticação não
 * foi exercida**. As duas metades ficam distinguíveis no placar — que é a
 * diferença entre "a esteira anda" e "a esteira anda quando alguém a destranca".
 */
async function aprovarOEscopo(
  clientRequestId: string,
  casa: { workspaceId: string; userId: string; nome: string; email: string },
  tropecos: Tropeco[],
  baseUrlDoServidor: string | null,
): Promise<DesfechoDaAprovacao> {
  // ── CAMINHO A: UM SERVIDOR NEXT DE VERDADE, POR HTTP ────────────────────
  // É o único jeito de exercitar a autenticação. Ver `servidor-de-teste.ts`.
  if (baseUrlDoServidor) {
    const viaHttp = await aprovarPelaPortaDeVerdade(clientRequestId, casa, baseUrlDoServidor, tropecos);
    if (viaHttp) return viaHttp;
    // Servidor de pé mas a porta não respondeu como porta: cai para os
    // caminhos de sempre, e o motivo já foi anotado em `tropecos`.
  }

  // Tentativa 1: a rota de verdade, com sessão de staff de verdade.
  try {
    const { SignJWT } = await import("jose");
    const { getAuthSecret } = await import("@/lib/auth/secret");
    const { SESSION_COOKIE } = await import("@/lib/auth/session");
    const token = await new SignJWT({
      userId: casa.userId, email: casa.email, name: casa.nome, role: "master", workspaceId: casa.workspaceId,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(getAuthSecret());

    const { POST } = await import("@/app/api/brain/auto-scope/[id]/review/route");
    const req = new NextRequest(`http://cliente-falso.local/api/brain/auto-scope/${clientRequestId}/review`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: `${SESSION_COOKIE}=${token}` },
      body: JSON.stringify({ decisions: {} }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: clientRequestId }) });
    const corpo = (await res.json()) as { ok?: boolean; projectId?: string; error?: string };
    if (res.status < 400 && corpo.ok) {
      return { tentou: true, viaRota: true, ok: true, motivo: null, projetoId: corpo.projectId ?? null, recusouQuemNaoEStaff: null, intrusos: [] };
    }

    // ── 401/403 É LIMITAÇÃO DO INSTRUMENTO, NÃO RECUSA DA CASA ─────────────
    // Medido em 24/08/2026, na primeira rodada da esteira de baixo: a rota
    // devolveu 401. Não porque a casa recusou o pedido — porque `getSession()`
    // lê o cookie por `cookies()` do `next/headers`, que vem do contexto de
    // requisição do servidor Next e NÃO do `NextRequest` montado à mão. O
    // cookie que este percurso assina nunca chega lá.
    //
    // Contar isso como "a casa quebrou" seria acusar a casa da minha
    // incapacidade de autenticar — falso positivo, e o defeito mais caro que
    // um instrumento pode ter. Então cai para a tentativa 2 e DIZ que a camada
    // de autenticação não foi exercida.
    if (res.status === 401 || res.status === 403) {
      tropecos.push({
        etapa: "aprovacao-pela-rota",
        erro: `a rota devolveu ${res.status}: o cookie de sessão não chega a \`cookies()\` fora do servidor do Next`,
      });
    } else {
      // Qualquer OUTRA recusa é da casa, e vale como achado.
      return {
        tentou: true, viaRota: true, ok: false,
        motivo: `a rota de aprovação recusou (${res.status}): ${corpo.error ?? "sem motivo"}`,
        recusouQuemNaoEStaff: null, intrusos: [],
      };
    }
  } catch (e) {
    tropecos.push({ etapa: "aprovacao-pela-rota", erro: e instanceof Error ? e.message : String(e) });
  }

  // Tentativa 2: a mesma função que a rota chamaria — SEM a camada de auth.
  try {
    const { createProjectFromRequest } = await import("@/lib/agency/execution/create-project-from-request");
    const r = await createProjectFromRequest(clientRequestId, casa.nome);
    return r.ok
      ? { tentou: true, viaRota: false, ok: true, motivo: "a rota autenticada não rodou em processo; a função foi chamada direto — a camada de autenticação NÃO foi exercida", projetoId: r.projectId, recusouQuemNaoEStaff: null, intrusos: [] }
      : { tentou: true, viaRota: false, ok: false, motivo: `a criação do projeto falhou: ${r.error}`, recusouQuemNaoEStaff: null, intrusos: [] };
  } catch (e) {
    return { tentou: true, viaRota: false, ok: false, motivo: e instanceof Error ? e.message : String(e), recusouQuemNaoEStaff: null, intrusos: [] };
  }
}

/**
 * O PORTÃO DE DIREÇÃO, ABERTO PELO CAMINHO DE VERDADE.
 *
 * ── A condição, escrita antes do código (24/08/2026) ─────────────────────────
 * A execução parava em `run-execution.ts:221` — `if (!project.directionApprovedAt)`
 * —, e a saída fácil era gravar o campo no banco e ver a esteira andar. Isso
 * mediria um caminho que não existe: em produção ninguém escreve esse campo à
 * mão. Um verde assim é pior que o vermelho, porque some com a pergunta.
 *
 * Então o cliente falso avaliza a direção EXATAMENTE como um cliente avaliza:
 *
 *   1. MARCO 0 — `pedirDirecao(projectId)`: o gerente manda a direção e pede o
 *      aval. É aqui que o aviso ao cliente (WhatsApp/e-mail) é tentado — e onde
 *      as travas de saída recém-nascidas levam o primeiro exercício de verdade.
 *   2. A agência cunha o link do portal (`createPortalAccess`), que é ato DA
 *      AGÊNCIA, não do cliente — o mesmo que `/api/brain/portal-access` faz.
 *      Isto é preparo, não é o portão.
 *   3. O CLIENTE decide: `POST /api/portal/esteira` com
 *      `{ decisao: "aprovar_direcao" }` e o token. Esta rota é a porta pública
 *      do cliente, resolve o dono PELO TOKEN (nunca pelo corpo) e é a única
 *      coisa que chama `aprovarDirecao()` do lado de fora.
 *
 * A rota do portal roda em processo porque, ao contrário da rota de staff, ela
 * NÃO usa `cookies()` do `next/headers`: `tokenDoPortal` lê `request.cookies`
 * do `NextRequest` e aceita o token pelo corpo. A credencial que este percurso
 * apresenta é uma credencial de verdade, conferida por `validatePortalAccess`.
 *
 * Se qualquer degrau falhar, o portão fica FECHADO e o motivo sobe. Nenhum
 * atalho: `directionApprovedAt` nunca é escrito por este arquivo.
 */
async function avalizarADirecaoComoOCliente(
  clientRequestId: string,
  projectId: string,
  tropecos: Tropeco[],
): Promise<{ pedida: boolean; viaPortal: boolean; motivo: string | null }> {
  let pedida = false;

  // ── 1. MARCO 0: a agência pede o aval ────────────────────────────────────
  try {
    const { pedirDirecao } = await import("@/lib/agency/esteira/marcos");
    const r = await pedirDirecao(projectId);
    pedida = r.ok;
    if (!r.ok) {
      tropecos.push({ etapa: "direcao-pedido", erro: r.erro ?? "pedirDirecao recusou sem motivo" });
      return { pedida, viaPortal: false, motivo: `a direção nem chegou a ser pedida: ${r.erro ?? "sem motivo"}` };
    }
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    tropecos.push({ etapa: "direcao-pedido", erro });
    return { pedida: false, viaPortal: false, motivo: `pedirDirecao estourou: ${erro}` };
  }

  // ── 2. A agência cunha o acesso do portal (preparo, não é o portão) ──────
  let token: string;
  try {
    const { createPortalAccess } = await import("@/lib/agency/persistence/portal-access-service");
    const acesso = await createPortalAccess({
      clientRequestId,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    token = acesso.token;
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    tropecos.push({ etapa: "direcao-portal", erro });
    return { pedida, viaPortal: false, motivo: `não consegui cunhar o acesso do portal: ${erro}` };
  }

  // ── 3. O CLIENTE aprova, pela porta do cliente ───────────────────────────
  try {
    const { POST } = await import("@/app/api/portal/esteira/route");
    const req = new NextRequest("http://cliente-falso.local/api/portal/esteira", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, decisao: "aprovar_direcao" }),
    });
    const res = await POST(req);
    const corpo = (await res.json()) as { ok?: boolean; mensagem?: string; error?: string };
    if (res.status < 400 && corpo.ok) return { pedida, viaPortal: true, motivo: null };

    const motivo = `a porta do cliente recusou (${res.status}): ${corpo.error ?? corpo.mensagem ?? "sem motivo"}`;
    tropecos.push({ etapa: "direcao-portal", erro: motivo });
    return { pedida, viaPortal: false, motivo };
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    tropecos.push({ etapa: "direcao-portal", erro });
    return { pedida, viaPortal: false, motivo: `a porta do cliente estourou: ${erro}` };
  }
}


/**
 * A PORTA AUTENTICADA, BATIDA COMO UM NAVEGADOR BATE.
 *
 * ── Por que o caso INFELIZ vem antes do feliz ───────────────────────────────
 * Uma porta que deixa o staff entrar está metade medida: porta escancarada
 * também deixa o staff entrar, e passaria numa régua que só olha o caso feliz.
 * Então aqui as credenciais de intruso são tentadas PRIMEIRO, e o resultado
 * delas manda na régua — se qualquer uma entrar, a verificação reprova, por
 * mais verde que esteja o resto da rodada.
 *
 * As quatro formas de "não é staff", cada uma pegando uma trava diferente:
 *   • sem cookie          → `getSession()` não acha sessão nenhuma;
 *   • cookie ilegível     → a assinatura JWT não confere;
 *   • `role: "client"`    → assinatura boa, papel errado (`requireSession`);
 *   • staff COM `clientId`→ papel certo, mas é conta de cliente. É a trava
 *     própria da rota, e a mais fácil de alguém apagar sem perceber.
 *
 * Nenhuma delas cria projeto: são todas recusas esperadas. A do staff, sim —
 * e é ela que devolve o desfecho.
 *
 * Devolve `null` quando o servidor não se comportou como servidor (rede caiu,
 * resposta ilegível). Aí o percurso cai para os caminhos em processo e a régua
 * diz "não coberto" — nunca "passou".
 */
async function aprovarPelaPortaDeVerdade(
  clientRequestId: string,
  casa: { workspaceId: string; userId: string; nome: string; email: string },
  baseUrl: string,
  tropecos: Tropeco[],
): Promise<DesfechoDaAprovacao | null> {
  try {
    const { SignJWT } = await import("jose");
    const { getAuthSecret } = await import("@/lib/auth/secret");
    const { SESSION_COOKIE } = await import("@/lib/auth/session");

    const assinar = async (role: string, extra: Record<string, unknown> = {}): Promise<string> =>
      new SignJWT({ userId: casa.userId, email: casa.email, name: casa.nome, role, workspaceId: casa.workspaceId, ...extra })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(getAuthSecret());

    const url = `${baseUrl}/api/brain/auto-scope/${clientRequestId}/review`;
    const bater = async (cookie: string | null): Promise<{ status: number; corpo: { ok?: boolean; projectId?: string; error?: string } }> => {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
        body: JSON.stringify({ decisions: {} }),
        signal: AbortSignal.timeout(60_000),
      });
      let corpo: { ok?: boolean; projectId?: string; error?: string } = {};
      try { corpo = await res.json(); } catch { /* corpo vazio conta como sem motivo */ }
      return { status: res.status, corpo };
    };

    // ── 1. Os intrusos ────────────────────────────────────────────────────
    const formas: Array<{ quem: string; cookie: string | null }> = [
      { quem: "sem cookie", cookie: null },
      { quem: "cookie ilegível", cookie: `${SESSION_COOKIE}=nao-e-um-jwt` },
      { quem: 'role "client"', cookie: `${SESSION_COOKIE}=${await assinar("client")}` },
      { quem: "staff com clientId", cookie: `${SESSION_COOKIE}=${await assinar("master", { clientId: "cliente-qualquer" })}` },
    ];
    const intrusos: TentativaDeIntruso[] = [];
    for (const f of formas) {
      const r = await bater(f.cookie);
      // "Entrou" é 2xx com `ok` — a porta ter respondido 500 é outro problema,
      // e não vira falso alarme de invasão.
      const entrou = r.status < 400 && r.corpo.ok === true;
      intrusos.push({ quem: f.quem, status: r.status, entrou });
      if (entrou) {
        return {
          tentou: true, viaRota: true, ok: false,
          motivo: `a porta autenticada ADMITIU "${f.quem}" (${r.status})`,
          recusouQuemNaoEStaff: false, intrusos,
        };
      }
    }

    // ── 2. O staff de verdade ─────────────────────────────────────────────
    const staff = await bater(`${SESSION_COOKIE}=${await assinar("master")}`);
    if (staff.status < 400 && staff.corpo.ok) {
      return {
        tentou: true, viaRota: true, ok: true,
        motivo: null, projetoId: staff.corpo.projectId ?? null,
        recusouQuemNaoEStaff: true, intrusos,
      };
    }
    return {
      tentou: true, viaRota: true, ok: false,
      motivo: `a porta autenticada recusou o STAFF (${staff.status}): ${staff.corpo.error ?? "sem motivo"}`,
      recusouQuemNaoEStaff: true, intrusos,
    };
  } catch (e) {
    tropecos.push({ etapa: "porta-autenticada", erro: e instanceof Error ? e.message : String(e) });
    return null;
  }
}


/**
 * O CLIENTE ACEITA A PROPOSTA — E O PROJETO NASCE SEM NINGUÉM ABRIR O PAINEL.
 *
 * ── O que esta etapa mede (24/08/2026) ──────────────────────────────────────
 * O cursograma da agência tem UM ponto de decisão depois da precificação:
 * "cliente aceitou?". Até hoje nada movia um briefing para fora de
 * `proposal_pending` — a pergunta existia no desenho e o cliente não tinha onde
 * responder. Era a explicação dos zero clientes em produção.
 *
 * Aqui o cliente falso responde pela porta dele (`POST /api/portal/briefing/aceite`,
 * token de portal validado, dono derivado do token) e a casa faz o projeto
 * nascer sozinha. Nada nesta função cria Cliente ou Projeto: se o caminho
 * automático não funcionar, o projeto não aparece e a verificação diz isso.
 */
async function aceitarAPropostaComoOCliente(
  clientRequestId: string,
  tropecos: Tropeco[],
): Promise<DesfechoDoAceite> {
  let token: string;
  try {
    const { createPortalAccess } = await import("@/lib/agency/persistence/portal-access-service");
    const acesso = await createPortalAccess({
      clientRequestId,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    token = acesso.token;
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    tropecos.push({ etapa: "aceite", erro });
    return { tentou: true, viaPortal: false, nasceuSozinho: false, motivo: `não consegui cunhar o acesso do portal: ${erro}` };
  }

  try {
    const { POST } = await import("@/app/api/portal/briefing/aceite/route");
    const req = new NextRequest("http://cliente-falso.local/api/portal/briefing/aceite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, clientRequestId, decisao: "aceito" }),
    });
    const res = await POST(req);
    const corpo = (await res.json()) as { ok?: boolean; projetoCriado?: boolean; aguardandoPessoa?: boolean; error?: string };
    if (res.status >= 400 || !corpo.ok) {
      const motivo = `a porta do aceite recusou (${res.status}): ${corpo.error ?? "sem motivo"}`;
      tropecos.push({ etapa: "aceite", erro: motivo });
      return { tentou: true, viaPortal: false, nasceuSozinho: false, motivo };
    }

    // A PROVA não é a resposta da rota — é o projeto no banco. Rota que diz
    // "criado" sem linha no banco é o defeito que esta bateria persegue.
    const proj = await prisma.project.findFirst({ where: { clientRequestId }, select: { id: true } });
    if (!proj) {
      return {
        tentou: true, viaPortal: true, nasceuSozinho: false,
        motivo: corpo.aguardandoPessoa
          ? "o aceite foi registrado e o caminho automático PAROU: o briefing não é caso normal e espera uma pessoa"
          : "a porta do aceite respondeu OK e nenhum projeto apareceu no banco",
      };
    }
    return { tentou: true, viaPortal: true, nasceuSozinho: true, motivo: null };
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    tropecos.push({ etapa: "aceite", erro });
    return { tentou: true, viaPortal: false, nasceuSozinho: false, motivo: `a porta do aceite estourou: ${erro}` };
  }
}
