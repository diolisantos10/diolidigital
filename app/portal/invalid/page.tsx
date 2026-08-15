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
              background: "#FEF3C7", color: "#9B7B2D", fontSize: 24,
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
            Fale com a equipe Dioli e peça um link novo — leva um minuto.
          </p>
        </div>
      </main>
    </div>
  );
}
