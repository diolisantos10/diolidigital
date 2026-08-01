// Casca das páginas legais (privacidade, termos, exclusão de dados).
//
// Existe para que as três sejam a MESMA página com conteúdo diferente. Três
// cópias do cabeçalho é o começo de três documentos que divergem — e num
// documento legal divergência não é feiura, é risco.

import Link from "next/link";
import { DioliLogo } from "@/components/brand/DioliLogo";

export function PaginaLegal({
  titulo,
  resumo,
  atualizadoEm,
  children,
}: {
  titulo: string;
  resumo: string;
  atualizadoEm: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mesh-cool flex min-h-screen flex-col bg-[var(--bg)]">
      <header className="border-b border-[var(--border)] bg-[var(--bg)]/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-5 md:px-8">
          <Link href="/" aria-label="Voltar para a home">
            <DioliLogo variant="full" tone="dark" markSize={32} />
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-12 md:py-16">
        <p className="text-[12.5px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
          Documento legal
        </p>
        <h1 className="mt-2 text-[30px] font-bold leading-tight tracking-[-0.025em] text-[var(--navy)] md:text-[38px]">
          {titulo}
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-[var(--text-secondary)]">{resumo}</p>
        <p className="mt-2 text-[13px] text-[var(--text-muted)]">Última atualização: {atualizadoEm}</p>

        <div className="legal mt-10 space-y-7 text-[15px] leading-relaxed text-[var(--text-secondary)]">
          {children}
        </div>

        <div className="mt-14 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
          <h2 className="text-[15px] font-semibold text-[var(--navy)]">Fale com a gente</h2>
          <p className="mt-2 text-[14px] text-[var(--text-secondary)]">
            Dúvidas sobre este documento ou sobre os seus dados? Escreva para{" "}
            <a className="font-medium text-[var(--navy)] underline" href="mailto:agenciadioli@gmail.com">
              agenciadioli@gmail.com
            </a>{" "}
            ou pela <Link className="font-medium text-[var(--navy)] underline" href="/contato">página de contato</Link>.
            Respondemos em até 15 dias, como manda a LGPD.
          </p>
        </div>

        <nav className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-[var(--text-muted)]">
          <Link className="underline hover:text-[var(--navy)]" href="/privacidade">Política de Privacidade</Link>
          <Link className="underline hover:text-[var(--navy)]" href="/termos">Termos de Serviço</Link>
          <Link className="underline hover:text-[var(--navy)]" href="/exclusao-de-dados">Exclusão de dados</Link>
        </nav>
      </main>
    </div>
  );
}

/** Uma seção do documento. Título curto, texto direto — quem lê isto está com
 *  pressa ou com problema, e nos dois casos rodeio atrapalha. */
export function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-[var(--navy)]">{titulo}</h2>
      <div className="mt-2 space-y-3">{children}</div>
    </section>
  );
}
