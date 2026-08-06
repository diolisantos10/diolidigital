// A ESCADA DE EXPOSIÇÃO, na tela.
//
// Existe porque um degrau que ninguém consegue ver é o mesmo defeito das 31
// checagens: estado gravado que não muda decisão nenhuma. Aqui cada
// departamento mostra em que degrau está, por quê, e — quando não pode subir —
// QUANTO exatamente falta, em número. "Falta evidência" sem o número é ruído.
//
// Server component: lê direto do banco. Não há botão de subir aqui de
// propósito — subir é ação de escrita e passa pela rota (`/api/agency/escada`),
// que confere a evidência. Um botão que sobe sem conferir seria a escada com um
// atalho, e o atalho vira o caminho normal na primeira sexta-feira apertada.

import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import { estadoDaEscada } from "@/lib/agency/escada/registro";
import { ROTULO_DO_DEGRAU, JANELA_DE_EVIDENCIA_DIAS, rotuloDoDepartamento, type Degrau } from "@/lib/agency/escada/degraus";

export const dynamic = "force-dynamic";

const CORES: Record<Degrau, { fundo: string; texto: string; nome: string }> = {
  sombra:    { fundo: "#F1F1EF", texto: "#4B4B45", nome: "Sombra" },
  allowlist: { fundo: "#FEF3C7", texto: "#92400E", nome: "Liberado" },
  wide:      { fundo: "#DCFCE7", texto: "#166534", nome: "Aberto" },
};

export default async function EscadaPage() {
  const session = await getSession();
  if (!session) redirect("/auth/signin");

  const degraus = await estadoDaEscada(session.workspaceId);
  const emSombra = degraus.filter((d) => d.degrau === "sombra").length;

  return (
    <div className="space-y-6">
      <AgencyHeader
        title="Escada de exposição"
        subtitle={`${degraus.length} departamentos · ${emSombra} em sombra · janela de evidência: ${JANELA_DE_EVIDENCIA_DIAS} dias`}
      />

      <div className="bg-white rounded-[12px] border border-[var(--border)] px-5 py-4">
        <p className="text-[13px] text-[var(--text-primary)] font-medium">O que cada degrau significa</p>
        <ul className="mt-2 space-y-1 text-[13px] text-[var(--text-muted)]">
          {(Object.keys(CORES) as Degrau[]).map((d) => (
            <li key={d}>
              <span className="font-medium" style={{ color: CORES[d].texto }}>{CORES[d].nome}</span>
              {" — "}{ROTULO_DO_DEGRAU[d].split("— ")[1]}
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-3">
        {degraus.map((d) => {
          const cor = CORES[d.degrau];
          return (
            <div key={d.departmentId} className="bg-white rounded-[12px] border border-[var(--border)] px-5 py-4">
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className="text-[12px] font-semibold px-2.5 py-1 rounded-full"
                  style={{ background: cor.fundo, color: cor.texto }}
                >
                  {cor.nome}
                </span>
                <span className="text-[14px] font-semibold text-[var(--text-primary)]">{rotuloDoDepartamento(d.departmentId)}</span>
                {d.degrau === "allowlist" && (
                  <span className="text-[12px] text-[var(--text-muted)]">
                    {d.clientesLiberados.length} cliente(s) na lista
                  </span>
                )}
              </div>

              {d.motivo && (
                <p className="mt-2 text-[13px] text-[var(--text-muted)]">{d.motivo}</p>
              )}

              {/* O NÚMERO QUE FALTA — a razão de esta tela existir. */}
              {d.subida && (
                <div className="mt-3 border-t border-[var(--border)] pt-3">
                  {d.subida.pode ? (
                    <p className="text-[13px] font-medium text-[#166534]">
                      Tem a evidência para subir para <strong>{d.subida.alvo}</strong> —{" "}
                      {d.subida.contagem.aprovadas} entrega(s) aprovada(s),{" "}
                      {d.subida.contagem.clientesDistintos} cliente(s), em {JANELA_DE_EVIDENCIA_DIAS} dias.
                    </p>
                  ) : (
                    <>
                      <p className="text-[13px] text-[var(--text-primary)]">
                        Para subir para <strong>{d.subida.alvo}</strong>, falta:
                      </p>
                      <ul className="mt-1 space-y-0.5">
                        {d.subida.faltam.map((f, i) => (
                          <li key={i} className="text-[13px] text-[var(--text-muted)]">• {f}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              )}
              {!d.subida && (
                <p className="mt-3 border-t border-[var(--border)] pt-3 text-[13px] text-[var(--text-muted)]">
                  No topo da escada. Descer é imediato e não exige evidência nenhuma.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
