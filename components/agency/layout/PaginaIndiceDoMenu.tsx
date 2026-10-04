// A PÁGINA-ÍNDICE de uma porta do menu (Entrada, Conversas, Gestão, Agência
// por dentro) — menu de 9 itens, CEO 03 e 04/10/2026. Mostra só as telas de
// dentro que ESTA pessoa pode abrir (mesma regra do menu e da URL direta).

import Link from "next/link";
import { notFound } from "next/navigation";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import { exigirAcessoInterno } from "@/lib/agency/organizacao/guarda";
import { podeAbrirRota } from "@/lib/agency/organizacao/paginas";
import { portaDoMenu } from "@/lib/agency/menu/menu-principal";

export default async function PaginaIndiceDoMenu({ href, subtitulo }: { href: string; subtitulo: string }) {
  const porta = portaDoMenu(href);
  if (!porta?.filhos) notFound();
  const { perfil } = await exigirAcessoInterno();
  const filhos = porta.filhos.filter((f) => podeAbrirRota(perfil, f.href));

  return (
    <>
      <AgencyHeader title={porta.rotulo} subtitle={subtitulo} />
      {filhos.length === 0 ? (
        <div className="rounded-[12px] border border-[var(--border)] bg-white px-6 py-10 text-center">
          <p className="text-[14px] font-medium text-[var(--text-primary)]">Nada aqui para o seu perfil</p>
          <p className="mt-1 text-[13px] text-[var(--text-muted)]">As telas desta área são de outra equipe.</p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {filhos.map((f) => (
            <li key={f.href}>
              <Link
                href={f.href}
                className="block h-full rounded-[12px] border border-[var(--border)] bg-white px-5 py-4 transition-colors hover:border-[var(--text-muted)]"
              >
                <span className="block text-[14px] font-semibold text-[var(--text-primary)]">{f.rotulo} →</span>
                <span className="mt-1 block text-[13px] leading-snug text-[var(--text-secondary)]">{f.descricao}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
