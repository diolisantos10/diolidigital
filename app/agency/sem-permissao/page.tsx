import Link from "next/link";
import { exigirAcessoInterno } from "@/lib/agency/organizacao/guarda";
import { resolverPagina } from "@/lib/agency/organizacao/paginas";
import { getDepartamento } from "@/lib/agency/organizacao/departamentos";
import { AGENCY_ROLE_OPTIONS } from "@/lib/agency/roles";

// ── O ESTADO "SEM PERMISSÃO" ─────────────────────────────────────────────────
//
// Barrar sem explicar produz o mesmo efeito de estar quebrado. Esta tela diz
// três coisas, nessa ordem: qual porta você bateu, por que ela é de outro
// departamento, e para onde ir agora. Nada de "acesso negado" seco.
//
// Ela NÃO revela o que existe do outro lado — nome da página é o suficiente
// para orientar; conteúdo seria vazamento por texto.

export const dynamic = "force-dynamic";

export default async function SemPermissaoPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string }>;
}) {
  const { perfil, session } = await exigirAcessoInterno();
  const { de } = await searchParams;
  const destino = typeof de === "string" && de.startsWith("/agency/") ? de : null;
  const pagina = destino ? resolverPagina(destino) : null;

  const dono =
    pagina && pagina.dono !== "casa" ? getDepartamento(pagina.dono) : null;
  const meus = perfil.departamentos.map((d) => getDepartamento(d).nome);
  const papel = AGENCY_ROLE_OPTIONS.find((r) => r.id === session.role)?.label ?? session.role;

  return (
    <div className="max-w-[620px] mx-auto py-16">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8">
        <div
          className="w-12 h-12 rounded-xl grid place-items-center mb-5"
          style={{ background: "var(--warning-bg)", color: "var(--warning)" }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
            <rect x="4" y="10" width="16" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
            <path d="M8 10V7.5a4 4 0 0 1 8 0V10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
        </div>

        <h1 className="text-[24px] leading-tight font-semibold text-[var(--text-primary)]">
          {pagina ? `"${pagina.titulo}" é a mesa de outro departamento` : "Esta área é de outro departamento"}
        </h1>

        <p className="mt-3 text-[15px] leading-relaxed text-[var(--text-secondary)]">
          {dono ? (
            <>
              Quem opera esta tela é <strong className="text-[var(--text-primary)]">{dono.nome}</strong>.
              Seu acesso hoje é de <strong className="text-[var(--text-primary)]">{papel}</strong>
              {meus.length > 0 ? <> — você edita {meus.join(" e ")}</> : null}.
            </>
          ) : (
            <>
              Seu acesso hoje é de <strong className="text-[var(--text-primary)]">{papel}</strong> e esta
              tela é da direção da agência.
            </>
          )}
        </p>

        <p className="mt-4 text-[15px] leading-relaxed text-[var(--text-secondary)]">
          O <strong className="text-[var(--text-primary)]">resultado</strong> deste trabalho continua
          aberto para você: a página de cada cliente mostra o panorama de todas as áreas, e Entregas
          mostra o que saiu. O que fica com o dono é a produção, não a leitura.
        </p>

        <div className="mt-7 flex flex-wrap gap-2.5">
          <Link
            href="/agency/dashboard"
            className="h-10 px-4 inline-flex items-center rounded-xl text-[14px] font-semibold text-white"
            style={{ background: "var(--navy)" }}
          >
            Voltar para a Central de Trabalho
          </Link>
          <Link
            href="/agency/clients"
            className="h-10 px-4 inline-flex items-center rounded-xl text-[14px] font-semibold border border-[var(--border)] text-[var(--text-primary)] bg-[var(--card)]"
          >
            Ver clientes
          </Link>
        </div>

        {destino ? (
          <p className="mt-6 text-[13px] text-[var(--text-muted)]">
            Endereço solicitado: <code className="font-mono">{destino}</code>
          </p>
        ) : null}
      </div>
    </div>
  );
}
