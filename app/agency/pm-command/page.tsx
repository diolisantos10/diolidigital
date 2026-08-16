// PM COMMAND CENTER — a sala de quem faz a agência trabalhar.
//
// ─── ELA FOI REDUZIDA DE 10 CARTÕES PARA 2 (16/08/2026) ────────────────────
//
// O `experiencia` percorreu esta tela com o app rodando e login real. O que
// achou não foi excesso de informação: foi REPETIÇÃO. "Sushi Cazza, 58 dias,
// sem contato" aparecia duas vezes na mesma tela, a 200px de distância, e uma
// terceira em `/agency/leads`. Um cartão listava quem estava parado; o cartão
// seguinte listava por que não andou — sobre as mesmas pessoas.
//
// E quatro cartões (Outbox, Saúde da migração, Quem tem a bola, Execuções
// registradas) diziam alguma variação de "isso passa a existir no M7". Estado
// vazio que explica encanamento não é informação para quem toca a agência — e
// o mesmo dado já é renderizado em `/agency/produto-tecnologia`.
//
// O efeito colateral que importa: o INTERRUPTOR era o 10º cartão, a ~1.500px
// de rolagem no celular. A ação mais importante da sala era a penúltima coisa
// da página. Agora são duas: a FILA e o INTERRUPTOR.
//
// ⚠️ TUDO AQUI É ESCOPADO PELA AGÊNCIA DA SESSÃO. Antes, `recusaV2`,
// `handoffV2`, `bloqueioV2`, `outboxV2` e `approvalRequest` eram lidos SEM
// filtro de workspace — e o motivo de uma recusa carrega o NOME DO NEGÓCIO do
// lead (achado G-5 do `seguranca`).

import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import Link from "next/link";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import { prisma } from "@/lib/db/client";
import LigarAEsteira from "@/components/agency/LigarAEsteira";
import { quemBateuNaPorta } from "@/lib/agency/comercial/quem-bateu-na-porta";
import { linhaDeRecusa } from "@/lib/agency/esteira-assistida/recusa-visivel";
import { cobrancasDeHandoff } from "@/lib/agency/esteira-assistida/vigilancia-de-handoff";
import { montarFilaDaSala, leituraDaSala } from "@/lib/agency/esteira-assistida/fila-da-sala";
import { FLAGS_V2 } from "@/lib/agency/flags-v2/flags";

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
  const ws = session.workspaceId;
  const agoraData = new Date();

  // `ExecucaoV2` guarda `clienteId` solto (sem relação), então o escopo da
  // agência vem dos ids dos clientes dela — não há atalho de join.
  const clientesDaCasa = await prisma.client.findMany({ where: { workspaceId: ws }, select: { id: true } });
  const idsDaCasa = clientesDaCasa.map((c) => c.id);

  const [leads, travados, recusasCruas, bastoesCrus, chaveDaAgencia, gastoDeIa] = await Promise.all([
    // O LEITOR ÚNICO da fila da porta — mesma lista de status de /agency/leads.
    quemBateuNaPorta(ws, agoraData),
    prisma.clientRequestDb.findMany({
      where: { workspaceId: ws, status: "precisa_decisao" },
      orderBy: { createdAt: "asc" },
      take: 25,
      select: { id: true, businessName: true, createdAt: true },
    }),
    prisma.recusaV2.findMany({ where: { workspaceId: ws }, orderBy: { em: "desc" }, take: 100 }),
    prisma.handoffV2.findMany({
      where: { workspaceId: ws, status: "aguardando_recebimento" },
      orderBy: { criadoEm: "asc" },
      take: 25,
    }),
    prisma.flagV2.findFirst({ where: { chave: FLAGS_V2.execucao, escopo: ws } }),
    // O QUANTO A ESTEIRA JÁ GASTOU. `ExecucaoV2` grava `custoUsd` em toda
    // linha e a tela mostrava "6 por IA · 0 humanas" — a contagem, nunca a
    // conta. Botão que autoriza gasto tem que dizer quanto.
    prisma.execucaoV2
      .aggregate({ _sum: { custoUsd: true }, _count: true, where: { clienteId: { in: idsDaCasa } } })
      .catch(() => null),
  ]);

  // Ausência de linha = DESLIGADA (fail-closed, como toda flag desta casa).
  const esteiraLigada = chaveDaAgencia?.ligada === true;
  const recusas = recusasCruas.map((r) => linhaDeRecusa(r, agoraData));
  const fila = montarFilaDaSala({ leads, travados, recusas, agora: agoraData });
  const bastoes = cobrancasDeHandoff(bastoesCrus, agoraData).filter((b) => b.atrasado);
  const gastoUsd = gastoDeIa?._sum?.custoUsd ?? 0;
  const execucoes = gastoDeIa?._count ?? 0;

  return (
    <div className="space-y-6">
      <AgencyHeader title="PM Command Center" subtitle={leituraDaSala(fila, esteiraLigada)} />

      <Cartao titulo="A fila — quem está esperando, há quanto tempo, e o que trava cada um">
        {fila.length === 0 ? (
          <Vazio frase="Ninguém na fila. Todo briefing que entra pela porta pública é levado à esteira pelo relógio, a cada passada — e o que não puder andar aparece aqui com o motivo." />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {fila.map((l) => (
              <li key={l.id} className="py-2 first:pt-0">
                <Link href={l.href} className="block hover:opacity-80">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="text-[14px] font-medium text-[var(--text-primary)]">{l.negocio}</span>
                    <span className="text-[12px] text-[var(--text-muted)]">
                      {l.espera}
                      {l.recusadoHa && ` · recusado ${l.recusadoHa}`}
                    </span>
                  </div>
                  {l.atributos.length > 0 && (
                    <p className="text-[12px]" style={{ color: l.urgente ? "#991B1B" : "var(--text-secondary)" }}>
                      {l.atributos.join(" · ")}
                    </p>
                  )}
                  {l.motivo && <p className="text-[12px] text-[var(--text-muted)]">{l.motivo}</p>}
                </Link>
              </li>
            ))}
          </ul>
        )}

        {bastoes.length > 0 && (
          <div className="mt-4 border-t border-[var(--border)] pt-3">
            <p className="text-[12px] font-medium text-[var(--text-primary)]">
              Bastões no chão — entregues e não aceitos (sem aceite, não saem da fila de quem entregou)
            </p>
            <ul className="mt-1 space-y-1 text-[12px] text-[var(--text-muted)]">
              {bastoes.map((b) => (
                <li key={b.handoffId}>
                  <span className="font-medium text-[var(--text-primary)]">{b.dono}</span> · {b.idade} — {b.motivo}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Cartao>

      <Cartao titulo="O interruptor da esteira (decisão registrada do dono)">
        <LigarAEsteira ligada={esteiraLigada} gastoUsd={gastoUsd} execucoes={execucoes} />
      </Cartao>

      <p className="text-[12px] text-[var(--text-muted)]">
        O encanamento da V2 (outbox, reconciliação, bloqueios canônicos, execuções função a função) mora em{" "}
        <Link href="/agency/produto-tecnologia" className="underline">
          Produto e Tecnologia
        </Link>
        . Esta sala responde uma pergunta só: quem está parado, e o que fazer com ele.
      </p>
    </div>
  );
}
