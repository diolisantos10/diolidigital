// CONEXÕES PARA RENOVAR — no Início, só quando há (bloco D, 04/10/2026).
// Componente de SERVIDOR: lê do banco na hora; sem nada a renovar, não ocupa
// espaço. O botão leva à página do cliente, onde está o link do portal — a
// reconexão é login nativo do dono da conta, nunca token colado.

import Link from "next/link";
import { conexoesARenovar } from "@/lib/integrations/conexoes-a-renovar";

export async function ConexoesARenovar({ workspaceId }: { workspaceId: string }) {
  const lista = await conexoesARenovar(workspaceId).catch(() => []);
  if (lista.length === 0) return null;
  return (
    <section
      aria-label="Conexões para renovar"
      style={{ marginBottom: 16 }}
      className="rounded-[12px] border border-[var(--warning)] bg-[var(--warning-bg)] p-4"
    >
      <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">
        Conexões para renovar ({lista.length})
      </h2>
      <ul className="mt-2 space-y-2">
        {lista.map((c, i) => (
          <li key={`${c.clientId}-${c.rede}-${i}`} className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] bg-white px-3 py-2.5">
            <span className="min-w-0 flex-1 basis-[220px]">
              <span className="block text-[13px] font-medium text-[var(--text-primary)]">
                {c.cliente} · {c.rede}
              </span>
              <span className="block text-[12px] text-[var(--text-secondary)]">{c.frase}</span>
            </span>
            {c.clientId && (
              <Link
                href={`/agency/clients/${c.clientId}?tab=integrations`}
                className="h-11 px-4 inline-flex items-center rounded-[8px] border border-[var(--border)] text-[13px] font-medium text-[var(--text-primary)]"
              >
                Abrir cliente
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
