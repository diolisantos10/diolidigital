// ─── Demo Client ──────────────────────────────────────────────────────────────
// Fixed context for the /portal-demo sandbox — no auth, no dynamic routing.
// Used ONLY by the demo pages; does not affect the real client store.
// The identity is intentionally generic — a demonstration shell, not a real
// client of the agency.
// ─────────────────────────────────────────────────────────────────────────────

export const DEMO_CLIENT_ID = "demo-client";

export const DEMO_CLIENT = {
  id: DEMO_CLIENT_ID,
  name: "Cliente Demonstração",
  industry: "Restaurante",
  status: "active" as const,
  createdAt: "2026-01-01",
};

export const DEMO_EXAMPLE_TEXT =
  "Tenho um restaurante e preciso de social media para Instagram e Facebook para ganhar novos clientes, fortalecer autoridade e vender mais. Tenho um Brand Book.";
