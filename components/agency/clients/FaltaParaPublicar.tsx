"use client";

// O painel "Falta para publicar" (CEO, 04/10/2026): o que impede ESTE cliente
// de publicar hoje, item por item, cada um com o botão que resolve. A regra
// mora no servidor (`lib/agency/esteira/falta-para-publicar.ts`); aqui só se
// desenha o que ele mediu.

import { useEffect, useState } from "react";

interface Item {
  chave: string;
  rotulo: string;
  pronto: boolean;
  detalhe: string;
  quemResolve: "equipe" | "ceo" | "control_room";
  acao: { rotulo: string; destino: string } | null;
}

const QUEM: Record<Item["quemResolve"], string> = {
  equipe: "Equipe, pela tela",
  ceo: "Diego (CEO)",
  control_room: "Control Room",
};

export default function FaltaParaPublicar({ clientId }: { clientId: string }) {
  const [itens, setItens] = useState<Item[] | null>(null);
  const [resumo, setResumo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [abrindo, setAbrindo] = useState(false);
  const [recadoDoPortal, setRecadoDoPortal] = useState<string | null>(null);

  // CONECTAR REDES (04/10/2026): o login nativo da Meta e do Google mora no
  // PORTAL do cliente, aba Integrações — é lá que o dono escolhe as contas
  // (regra de consentimento). Daqui abre-se o portal dele já nessa aba,
  // reaproveitando um link vigente ou gerando um.
  async function abrirConexoes() {
    setAbrindo(true);
    setRecadoDoPortal(null);
    // A janela abre NO CLIQUE (senão o navegador bloqueia como popup) e
    // recebe o endereço quando ele chegar.
    const janela = window.open("about:blank", "_blank");
    try {
      const lista = await fetch(`/api/brain/portal-access?clientId=${encodeURIComponent(clientId)}`, { cache: "no-store" });
      const links = lista.ok ? ((await lista.json()) as Array<{ url: string; expiresAt: string | null }>) : [];
      let url = links.find((l) => !l.expiresAt || new Date(l.expiresAt).getTime() > Date.now() + 60 * 60_000)?.url;
      if (!url) {
        const novo = await fetch("/api/brain/portal-access", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId }),
        });
        const j = (await novo.json().catch(() => ({}))) as { url?: string; error?: string };
        if (!novo.ok || !j.url) throw new Error(j.error ?? `erro ${novo.status}`);
        url = j.url;
      }
      const destino = `${url}?aba=integracoes`;
      if (janela) janela.location.href = destino;
      else window.location.href = destino;
    } catch (e) {
      janela?.close();
      setRecadoDoPortal(`Não consegui abrir as conexões deste cliente: ${e instanceof Error ? e.message : "falha"}.`);
    } finally {
      setAbrindo(false);
    }
  }

  useEffect(() => {
    fetch(`/api/agency/clients/${clientId}/falta-para-publicar`, { cache: "no-store" })
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as { itens?: Item[]; resumo?: string; error?: string };
        if (!r.ok) throw new Error(j.error ?? `erro ${r.status}`);
        setItens(j.itens ?? []);
        setResumo(j.resumo ?? "");
      })
      .catch(() => setErro("Não consegui medir o que falta para publicar."));
  }, [clientId]);

  return (
    <section id="falta-para-publicar" className="rounded-[12px] border border-[var(--border)] bg-white p-5">
      <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">Falta para publicar</h2>
      {erro ? (
        <p className="mt-2 text-[12px] text-[var(--warning)]">{erro}</p>
      ) : !itens ? (
        <p className="mt-2 text-[12px] text-[var(--text-muted)]">Medindo…</p>
      ) : (
        <>
          <p className="mt-1 text-[12px] text-[var(--text-secondary)]">{resumo}</p>
          <p className="mt-2 text-[12px] text-[var(--text-secondary)]">
            Instagram, Facebook e Drive se conectam por login, no portal do cliente: você entra com a sua conta e escolhe as contas da marca.{" "}
            <button type="button" onClick={() => void abrirConexoes()} disabled={abrindo} className="font-medium text-[var(--text-primary)] underline disabled:opacity-50">
              {abrindo ? "Abrindo…" : "Abrir conexões deste cliente"}
            </button>
          </p>
          {recadoDoPortal && <p role="status" className="mt-2 text-[12px] text-[var(--warning)]">{recadoDoPortal}</p>}
          <ul className="mt-3 space-y-2">
            {itens.map((i) => (
              <li
                key={i.chave}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] bg-[var(--bg)] px-3 py-2.5"
              >
                <span className="min-w-0 flex-1 basis-[240px]">
                  <span className="flex items-center gap-2 text-[13px] font-medium text-[var(--text-primary)]">
                    <span aria-hidden className={i.pronto ? "text-[var(--success)]" : "text-[var(--warning)]"}>
                      {i.pronto ? "✓" : "●"}
                    </span>
                    {i.rotulo}
                    <span className="sr-only">{i.pronto ? "pronto" : "falta"}</span>
                  </span>
                  <span className="mt-0.5 block text-[12px] text-[var(--text-secondary)]">{i.detalhe}</span>
                  {!i.pronto && <span className="block text-[11px] text-[var(--text-muted)]">Quem resolve: {QUEM[i.quemResolve]}</span>}
                </span>
                {!i.pronto && i.acao && i.acao.destino === "portal:integracoes" && (
                  <button
                    type="button"
                    onClick={() => void abrirConexoes()}
                    disabled={abrindo}
                    className="inline-flex h-11 w-full items-center justify-center rounded-[8px] bg-[var(--text-primary)] px-4 text-[13px] font-semibold text-white disabled:opacity-50 sm:w-auto"
                  >
                    <span className="font-semibold">{abrindo ? "Abrindo…" : i.acao.rotulo}</span>
                  </button>
                )}
                {!i.pronto && i.acao && i.acao.destino !== "portal:integracoes" && (
                  <a
                    href={i.acao.destino}
                    className="inline-flex h-11 w-full items-center justify-center rounded-[8px] bg-[var(--text-primary)] px-4 text-[13px] font-semibold text-white sm:w-auto"
                  >
                    {i.acao.rotulo}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
