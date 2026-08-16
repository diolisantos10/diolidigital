// A tela do link que não abre.
//
// ── Por que ela passou a existir de verdade (15/08/2026) ────────────────────
// `app/portal/access/route.ts` já mandava para cá desde a correção A4 — e a
// rota NÃO EXISTIA: o cliente com link sem token caía num 404 do Next, em
// inglês, sem nada para fazer. Pior: o caminho do token INVÁLIDO nem vinha
// para cá, ia para `/portal/access/me`, onde o cookie manda — e quem tivesse
// o cookie de outro cliente naquele navegador entrava no portal alheio (F5).
//
// Agora todo link que não abre termina aqui. A tela não expõe portal nenhum,
// não diz se o token existiu, e dá o único caminho que resolve: pedir um link
// novo a quem pode emitir.

export const metadata = { title: "Link de acesso inválido — Dioli" };

export default function LinkInvalido() {
  return (
    <div className="cp-shell">
      <main
        className="cp-main"
        style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "70vh" }}
      >
        <div style={{ maxWidth: 460, textAlign: "center", padding: "0 20px" }}>
          <div
            aria-hidden
            style={{
              width: 52, height: 52, borderRadius: "50%", margin: "0 auto 18px",
              display: "flex", alignItems: "center", justifyContent: "center",
              // Tokens do DESIGN.md, não hex na mão.
              background: "var(--accent)", color: "var(--text-secondary)", fontSize: 24,
            }}
          >
            !
          </div>
          <h1 style={{ fontSize: 21, fontWeight: 600, marginBottom: 10 }}>
            Este link de acesso não está mais valendo
          </h1>
          <p style={{ fontSize: 14.5, lineHeight: 1.6, color: "var(--text-secondary)" }}>
            Ele pode ter expirado ou sido substituído por um mais novo. Por segurança, não
            abrimos nenhum portal com um link que não confere — inclusive para não mostrar a
            você a área de outra marca.
          </p>
          <p style={{ fontSize: 14.5, lineHeight: 1.6, color: "var(--text-secondary)", marginTop: 12 }}>
            Peça um link novo à equipe Dioli — leva um minuto.
          </p>

          {/* ⚠️ TELA DE ERRO SEM CAMINHO DE AÇÃO É BECO. A versão anterior
              mandava "fale com a equipe" sem dizer COMO — e quem chega aqui é
              justamente quem perdeu o único caminho que tinha. */}
          <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 20, flexWrap: "wrap" }}>
            {/* O número é o MESMO do resto do site (`app/page.tsx`,
                `app/contato`, `self-serve/order`) — não um inventado aqui. */}
            <a
              href="https://wa.me/5511989400692?text=Oi%2C%20meu%20link%20de%20acesso%20ao%20portal%20da%20Dioli%20n%C3%A3o%20est%C3%A1%20abrindo."
              target="_blank"
              rel="noopener noreferrer"
              style={{
                height: 40, padding: "0 18px", borderRadius: 999, display: "inline-flex",
                alignItems: "center", background: "var(--text-primary)", color: "#fff",
                fontSize: 13.5, fontWeight: 600, textDecoration: "none",
              }}
            >
              Pedir link novo no WhatsApp
            </a>
            <a
              // O e-mail é o MESMO das outras telas públicas (`/privacidade`,
              // `/exclusao-de-dados`) — inventar endereço de contato é entregar um
              // beco com cara de saída.
              href="mailto:agenciadioli@gmail.com?subject=Link%20de%20acesso%20ao%20portal"
              style={{
                height: 40, padding: "0 18px", borderRadius: 999, display: "inline-flex",
                alignItems: "center", background: "var(--accent)", color: "var(--text-primary)",
                fontSize: 13.5, fontWeight: 600, textDecoration: "none",
              }}
            >
              Pedir por e-mail
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
