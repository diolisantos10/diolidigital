// DERIVAÇÃO DO ESTADO CANÔNICO — do fato legado, nunca de texto digitado.
//
// Marco 2 da V2. O mapa valor a valor do Marco 1
// (docs/arquitetura-operacional-v2/marco-1/MAPA-LEGADO-V2.md), transcrito
// como código puro. `null` significa "não sei derivar" — e não sei NÃO vira
// chute: na leitura dupla (M3), null conta como divergência a investigar,
// nunca como estado. É a regra da casa: ausência de informação não é
// informação.
//
// Cada função recebe o formato MÍNIMO da entidade legada (campos usados),
// para ser testável sem banco e não acoplar no Prisma.

export type EstadoCanonico = string;

export function derivarDeOportunidade(o: { status: string }): EstadoCanonico | null {
  switch (o.status) {
    case "nova": return "intake";
    case "qualificada": return "qualified";
    case "encerrada": return "closed";
    default: return null;
  }
}

export function derivarDeClientRequest(r: { status: string }): EstadoCanonico | null {
  switch (r.status) {
    case "new": return "intake";
    case "novo": return "intake";
    default: return null;
  }
}

export function derivarDeBriefing(b: { status: string; lacunasAbertas?: number }): EstadoCanonico | null {
  if (b.status === "pending_analysis") return "briefing_incomplete";
  if (b.status === "analyzed") {
    return (b.lacunasAbertas ?? 0) > 0 ? "briefing_incomplete" : "briefing_ready";
  }
  return null;
}

export function derivarDeSocialPost(p: { status: string }): EstadoCanonico | null {
  switch (p.status) {
    case "draft": return "production";
    case "scheduled": return "implementation";
    case "published": return "measurement";
    default: return null;
  }
}

export function derivarDeTask(t: { status: string; bloqueadaPorMaterial?: boolean }): EstadoCanonico | null {
  if (t.bloqueadaPorMaterial) return "blocked_materials";
  switch (t.status) {
    case "pending": return "production";
    case "in_progress": return "production";
    case "in_review": return "internal_review";
    case "done": return "internal_review"; // entregue internamente; quem leva ao cliente é o pacote
    default: return null;
  }
}

export function derivarDeApprovalRequest(a: { status: string }): EstadoCanonico | null {
  switch (a.status) {
    case "pending": return "client_approval";
    case "approved": return "implementation";
    case "request_revision": return "revision";
    case "rejected": return "revision"; // recusar/refazer: volta à produção via revisão, versões preservadas
    default: return null;
  }
}

export function derivarDeCycle(c: { status: string }): EstadoCanonico | null {
  switch (c.status) {
    case "aberto": return "measurement";
    case "fechado": return "cycle_closed";
    default: return null;
  }
}

export function derivarDeDeliverable(d: { status: string }): EstadoCanonico | null {
  switch (d.status) {
    case "draft": return "production";
    case "delivered": return "client_approval";
    default: return null;
  }
}
