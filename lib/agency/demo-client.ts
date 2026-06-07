// ─── Demo Client ──────────────────────────────────────────────────────────────
// Fixed context for /portal-demo/sushi-cazza — no auth, no dynamic routing.
// Used ONLY by demo pages; does not affect the real client store.
// ─────────────────────────────────────────────────────────────────────────────

export const DEMO_CLIENT_ID = "demo-sushi-cazza";

export const DEMO_CLIENT = {
  id: DEMO_CLIENT_ID,
  name: "Sushi Cazza",
  industry: "Restaurante Japonês",
  status: "active" as const,
  createdAt: "2026-01-01",
};

export const SUSHI_CAZZA_EXAMPLE_TEXT =
  "Tenho um restaurante japonês chamado Sushi Cazza. Preciso de social media para Instagram e Facebook para ganhar novos clientes, fortalecer autoridade e vender mais. Tenho um Brand Book.";
