// PM COMMAND CENTER — portfólio, riscos, aprovações e recuperação, numa sala só.
//
// Marco 4 da V2 (arquitetura mestra: "PM Command Center: portfólio, riscos,
// comunicação, aprovações e recuperação"). Server component lendo a VERDADE
// CANÔNICA (estadoCanonico, BloqueioV2, OutboxV2, ReconciliacaoV2, ExecucaoV2)
// — as tabelas do Marco 2/3. Enquanto o backfill não roda em produção (isso é
// rollout do M7, por lotes), as seções explicam o próprio vazio: estado vazio
// mudo é o cliente — aqui, o PM — achando que não recebeu nada.
//
// Não há botão de escrita nesta primeira versão DE PROPÓSITO: "Retomar
// processo" é entrega do M6, com idempotência e trilha — botão antes do motor
// seria promessa que o código não cumpre.

import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import { prisma } from "@/lib/db/client";

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

  const [bloqueios, outboxPendentes, outboxMortos, reconciliacoes, transicoes, execucoesIa, execucoesHumanas, aprovacoesAguardando] =
    await Promise.all([
      prisma.bloqueioV2.findMany({ where: { resolvidoEm: null }, orderBy: { abertoEm: "asc" }, take: 20 }),
      prisma.outboxV2.count({ where: { status: "pending" } }),
      prisma.outboxV2.count({ where: { status: "dead" } }),
      prisma.reconciliacaoV2.findMany({ orderBy: { execucaoEm: "desc" }, take: 5 }),
      prisma.transicaoDeEstado.count(),
      prisma.execucaoV2.count({ where: { ator: "ia" } }),
      prisma.execucaoV2.count({ where: { ator: "humano" } }),
      prisma.approvalRequest.count({ where: { status: "pending" } }),
    ]);

  const agora = Date.now();
  const bloqueiosVencidos = bloqueios.filter((b) => b.slaAte && b.slaAte.getTime() < agora);

  // A frase antes de qualquer número — regra da casa.
  const leitura =
    bloqueios.length === 0 && aprovacoesAguardando === 0
      ? "Nada travado e nenhuma decisão de cliente pendente — a esteira está fluindo."
      : `${bloqueios.length} bloqueio(s) aberto(s)${bloqueiosVencidos.length > 0 ? ` (${bloqueiosVencidos.length} com SLA vencido)` : ""} · ${aprovacoesAguardando} decisão(ões) aguardando cliente.`;

  return (
    <div className="space-y-6">
      <AgencyHeader title="PM Command Center" subtitle={leitura} />

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
            Mensagem, publicação e webhook da V2 saem por fila com retentativa — nunca inline. O processador entra no M6.
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

        <Cartao titulo="Recuperação">
          <Vazio frase='O botão "Retomar processo" (idempotente, exclusivo de PM/Diretor) chega com o motor de recovery no Marco 6 — botão antes do motor seria promessa sem mecanismo.' />
        </Cartao>
      </div>
    </div>
  );
}
