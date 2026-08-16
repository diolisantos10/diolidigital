// PM COMMAND CENTER — portfólio, riscos, aprovações e recuperação, numa sala só.
//
// Marco 4 da V2 (arquitetura mestra: "PM Command Center: portfólio, riscos,
// comunicação, aprovações e recuperação"). Server component lendo a VERDADE
// CANÔNICA (estadoCanonico, BloqueioV2, OutboxV2, ReconciliacaoV2, ExecucaoV2)
// — as tabelas do Marco 2/3. Enquanto o backfill não roda em produção (isso é
// rollout do M7, por lotes), as seções explicam o próprio vazio: estado vazio
// mudo é o cliente — aqui, o PM — achando que não recebeu nada.
//
// A única escrita desta sala é "Retomar processo" (M6): idempotente, exclusiva
// de PM/Diretor, registrada como execução humana — o botão chegou JUNTO com o
// motor, nunca antes dele.

import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import { prisma } from "@/lib/db/client";
import RetomarProcesso from "@/components/agency/RetomarProcesso";
import { linhaDeRecusa, idadeEmPortugues } from "@/lib/agency/esteira-assistida/recusa-visivel";
import { cobrancasDeHandoff } from "@/lib/agency/esteira-assistida/vigilancia-de-handoff";
import { quemBateuNaPorta } from "@/lib/agency/comercial/quem-bateu-na-porta";
import { FLAGS_V2 } from "@/lib/agency/flags-v2/flags";
import LigarAEsteira from "@/components/agency/LigarAEsteira";

export const dynamic = "force-dynamic";

function Cartao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-[12px] border border-[var(--border)] px-5 py-4">
      <p className="text-[13px] font-medium text-[var(--text-primary)]">{titulo}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Vazio({ frase }: { frase: string }) {
  return <p className="text-[13px] text-[var(--text-muted)]">{frase}</p>;
}

export default async function PmCommandPage() {
  const session = await getSession();
  if (!session) redirect("/auth/signin");

  const [bloqueios, outboxPendentes, outboxMortos, reconciliacoes, transicoes, execucoesIa, execucoesHumanas, aprovacoesAguardando, recusasCruas, handoffsSemAceite, paradosNaPorta, esperandoDecisao, chaveDaAgencia] =
    await Promise.all([
      prisma.bloqueioV2.findMany({ where: { resolvidoEm: null }, orderBy: { abertoEm: "asc" }, take: 20 }),
      prisma.outboxV2.count({ where: { status: "pending" } }),
      prisma.outboxV2.count({ where: { status: "dead" } }),
      prisma.reconciliacaoV2.findMany({ orderBy: { execucaoEm: "desc" }, take: 5 }),
      prisma.transicaoDeEstado.count(),
      prisma.execucaoV2.count({ where: { ator: "ia" } }),
      prisma.execucaoV2.count({ where: { ator: "humano" } }),
      prisma.approvalRequest.count({ where: { status: "pending" } }),
      // ── AS TRÊS LEITURAS NOVAS (16/08/2026) ────────────────────────────
      // O CEO passou meia hora achando que era defeito quando o sistema sabia
      // o motivo e não dizia. Recusa, bastão no chão e briefing parado na
      // porta são as três formas de "parado em silêncio" desta casa.
      prisma.recusaV2.findMany({ orderBy: { em: "desc" }, take: 25 }),
      prisma.handoffV2.findMany({ where: { status: "aguardando_recebimento" }, orderBy: { criadoEm: "asc" }, take: 25 }),
      // ⚠️ NÃO se relê a fila da porta aqui. `quemBateuNaPorta` é o leitor
      // único dela — e até 16/08/2026 ele existia no repositório com teste e
      // ZERO chamadores: a casa tinha a função de enxergar quem entrou e não
      // a chamava de lugar nenhum. Uma segunda consulta a `ClientRequestDb`
      // nesta tela criaria duas verdades adjacentes sobre a mesma fila, que é
      // o defeito nº 2 do incidente do Drive.
      quemBateuNaPorta(session.workspaceId, new Date()),
      prisma.clientRequestDb.findMany({
        where: { status: "precisa_decisao" },
        orderBy: { createdAt: "asc" },
        take: 15,
        select: { id: true, businessName: true, createdAt: true },
      }),
      prisma.flagV2.findFirst({ where: { chave: FLAGS_V2.execucao, escopo: session.workspaceId } }),
    ]);

  const agora = Date.now();
  const agoraData = new Date(agora);
  const bloqueiosVencidos = bloqueios.filter((b) => b.slaAte && b.slaAte.getTime() < agora);

  // Ausência de linha = DESLIGADA (fail-closed, como toda flag desta casa).
  const esteiraLigada = chaveDaAgencia?.ligada === true;
  const recusas = recusasCruas.map((r) => linhaDeRecusa(r, agoraData));
  const bastoes = cobrancasDeHandoff(handoffsSemAceite, agoraData);
  const bastoesAtrasados = bastoes.filter((b) => b.atrasado);

  // A frase antes de qualquer número — regra da casa. E o que está PARADO vem
  // antes do que está fluindo: era o parado que não aparecia em lugar nenhum.
  const parado = paradosNaPorta.length + esperandoDecisao.length + bastoesAtrasados.length;
  const leitura =
    // A esteira desligada EXPLICA a fila inteira — e vem antes de qualquer
    // número, porque sem ela os números parecem defeito e são consequência.
    !esteiraLigada && paradosNaPorta.length > 0
      ? `A esteira automática está DESLIGADA para esta agência: ${paradosNaPorta.length} briefing(s) esperam na porta e não vão andar sozinhos. Ligue no interruptor abaixo.`
    : parado === 0 && bloqueios.length === 0 && aprovacoesAguardando === 0
      ? "Nada travado, nenhum briefing parado na porta e nenhuma decisão pendente — a esteira está fluindo."
      : `${paradosNaPorta.length} briefing(s) esperando na porta · ${esperandoDecisao.length} pedindo decisão sua · ` +
        `${bastoesAtrasados.length} handoff(s) sem aceite fora do prazo · ${bloqueios.length} bloqueio(s)` +
        `${bloqueiosVencidos.length > 0 ? ` (${bloqueiosVencidos.length} com SLA vencido)` : ""} · ` +
        `${aprovacoesAguardando} decisão(ões) aguardando cliente.`;

  return (
    <div className="space-y-6">
      <AgencyHeader title="PM Command Center" subtitle={leitura} />

      {/* ─── O QUE ESTÁ PARADO, ANTES DE TUDO ────────────────────────────
          Estas três seções nasceram do incidente de 16/08/2026: o briefing do
          CityJobs entrou pela porta pública, virou linha no banco e parou. A
          casa SABIA o motivo (a chave de execução apontava para um clientId
          apagado no reset) e não disse a ninguém. Recusa sem tela é recusa
          invisível — e recusa invisível parece defeito do produto. */}
      <div className="grid gap-4">
        <Cartao titulo="Parados na porta — briefings que entraram e ainda não andaram">
          {paradosNaPorta.length === 0 ? (
            <Vazio frase="Ninguém esperando na porta. Todo briefing que entra é levado para a esteira pelo relógio, a cada passada." />
          ) : (
            <ul className="space-y-1 text-[13px]">
              {paradosNaPorta.map((s) => (
                <li key={s.id} className="flex items-start justify-between gap-3">
                  <span>
                    <span className="font-medium text-[var(--text-primary)]">{s.negocio}</span>
                    {!s.temComoFalar && (
                      <span className="block text-[12px]" style={{ color: "#991B1B" }}>
                        Sem contato — {s.porQueNaoDaParaFalar}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-[var(--text-muted)]">
                    esperando {s.diasEsperando} dia(s)
                    {s.desleixo && (
                      <span className="ml-2 rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: "#FEE2E2", color: "#991B1B" }}>
                        passou do prazo
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Cartao>

        <Cartao titulo="Pedindo DECISÃO SUA — a esteira parou e não fica muda">
          {esperandoDecisao.length === 0 ? (
            <Vazio frase="Nenhuma solicitação travada esperando decisão. Quando a cadeia para no meio, ela aparece aqui com o motivo — nunca volta para o limbo." />
          ) : (
            <ul className="space-y-1 text-[13px]">
              {esperandoDecisao.map((s) => (
                <li key={s.id} className="flex items-start justify-between gap-3">
                  <span className="font-medium text-[var(--text-primary)]">{s.businessName}</span>
                  <span className="shrink-0 rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: "#FEF3C7", color: "#92400E" }}>
                    parado {idadeEmPortugues(s.createdAt, agoraData)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Cartao>

        <Cartao titulo="Por que não andou — toda recusa do motor, com motivo, dono e idade">
          {recusas.length === 0 ? (
            <Vazio frase="Nenhuma recusa registrada. Cada 'não' do motor grava o motivo em português: sem allowlist, sem ficha, sem material, sem entrada obrigatória." />
          ) : (
            <ul className="space-y-2 text-[13px]">
              {recusas.map((r) => (
                <li key={r.id}>
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-medium text-[var(--text-primary)]">{r.dono}</span>
                    <span className="shrink-0 text-[12px] text-[var(--text-muted)]">{r.idade}</span>
                  </div>
                  <p className="text-[var(--text-muted)]">{r.motivo}</p>
                </li>
              ))}
            </ul>
          )}
        </Cartao>

        <Cartao titulo="Bastões no chão — handoff entregue e não aceito (sem aceite, não sai da fila anterior)">
          {bastoes.length === 0 ? (
            <Vazio frase="Nenhum handoff aguardando recebimento. Todo handoff carrega dono e prazo; estourado o prazo, o relógio cobra quem devia receber." />
          ) : (
            <ul className="space-y-1 text-[13px]">
              {bastoes.map((b) => (
                <li key={b.handoffId} className="flex items-start justify-between gap-3">
                  <span>
                    <span className="font-medium text-[var(--text-primary)]">{b.dono}</span>
                    <span className="block text-[var(--text-muted)]">{b.motivo}</span>
                  </span>
                  {b.atrasado && (
                    <span className="shrink-0 rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: b.sobeAoCeo ? "#FEE2E2" : "#FEF3C7", color: b.sobeAoCeo ? "#991B1B" : "#92400E" }}>
                      {b.sobeAoCeo ? "sobe ao CEO" : "atrasado"}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Cartao titulo="Quem tem a bola — bloqueios abertos (o que trava aparece, não se esconde)">
          {bloqueios.length === 0 ? (
            <Vazio frase="Nenhum bloqueio canônico aberto. Bloqueios passam a nascer aqui quando a escrita V2 for ligada por flag (rollout do M7)." />
          ) : (
            <ul className="space-y-2 text-[13px]">
              {bloqueios.map((b) => (
                <li key={b.id} className="flex items-start justify-between gap-3">
                  <span>
                    <span className="font-medium text-[var(--text-primary)]">{b.tipo}</span>
                    <span className="text-[var(--text-muted)]"> · {b.entidadeTipo} · dono: {b.donoFuncaoId}</span>
                    <span className="block text-[var(--text-muted)]">{b.acaoRecomendada}</span>
                  </span>
                  {b.slaAte && b.slaAte.getTime() < agora && (
                    <span className="shrink-0 rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: "#FEE2E2", color: "#991B1B" }}>
                      SLA vencido
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Cartao>

        <Cartao titulo="Decisões aguardando o cliente">
          {aprovacoesAguardando === 0 ? (
            <Vazio frase="Nenhum card de aprovação pendente no portal." />
          ) : (
            <p className="text-[13px] text-[var(--text-primary)]">
              <span className="text-[20px] font-semibold">{aprovacoesAguardando}</span> entrega(s) esperando decisão —
              a bola está com o cliente, e a esteira anda sozinha quando ele decidir.
            </p>
          )}
        </Cartao>

        <Cartao titulo="Efeitos externos (outbox canônico)">
          <p className="text-[13px] text-[var(--text-primary)]">
            {outboxPendentes} pendente(s) · {outboxMortos} na fila morta
            {outboxMortos > 0 && (
              <span className="ml-2 rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: "#FEE2E2", color: "#991B1B" }}>
                exige olho humano
              </span>
            )}
          </p>
          <p className="mt-1 text-[12px] text-[var(--text-muted)]">
            Mensagem, publicação e webhook da V2 saem por fila com retentativa — nunca inline. O relógio da V2 (/api/cron/v2) processa a cada batida.
          </p>
        </Cartao>

        <Cartao titulo="Saúde da migração (leitura dupla)">
          {reconciliacoes.length === 0 ? (
            <Vazio frase="Nenhuma reconciliação rodada ainda neste ambiente. O ensaio geral roda na suíte; em produção, a leitura dupla liga por flag no rollout." />
          ) : (
            <ul className="space-y-1 text-[13px]">
              {reconciliacoes.map((r) => (
                <li key={r.id}>
                  <span className="font-medium">{r.entidadeTipo}</span>
                  <span className="text-[var(--text-muted)]"> · {r.total} conferidas · {r.divergentes} divergentes · </span>
                  <span className="font-medium" style={{ color: r.veredito === "promovivel" ? "#166534" : "#92400E" }}>{r.veredito}</span>
                </li>
              ))}
            </ul>
          )}
        </Cartao>

        <Cartao titulo="Execuções registradas — humano × IA (determinação do CEO)">
          <p className="text-[13px] text-[var(--text-primary)]">
            <span className="font-semibold">{execucoesIa}</span> por IA · <span className="font-semibold">{execucoesHumanas}</span> humanas · {transicoes} transições auditadas
          </p>
          <p className="mt-1 text-[12px] text-[var(--text-muted)]">
            Toda execução V2 grava ator, modelo, versão, custo, data e ferramentas. Sem registro válido, não entra.
          </p>
        </Cartao>

        <Cartao titulo="O interruptor da esteira (decisão registrada do dono)">
          <LigarAEsteira ligada={esteiraLigada} />
        </Cartao>

        <Cartao titulo="Recuperação — retomar processo (PM/Diretor)">
          <RetomarProcesso />
        </Cartao>
      </div>
    </div>
  );
}
