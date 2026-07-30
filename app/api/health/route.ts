// GET /api/health
// Lightweight liveness probe for Railway's healthcheck. Intentionally does NO
// database, auth, or env work — it only proves the Node process is up and
// serving HTTP. Railway polls this during a deploy and only switches traffic to
// the new container once it responds 200, so the old container is drained
// gracefully instead of being flagged "crashed".
//
// Keep it dependency-free and always-200. A heavier readiness check (DB, etc.)
// would make transient DB hiccups look like crashes — the opposite of the goal.

// Além do "estou vivo", este endpoint responde QUAL VERSÃO está viva.
//
// Sem isso, conferir um deploy é adivinhação: a única prova de que o container
// novo subiu era achar alguma rota que só existisse no código novo — o que não
// funciona para uma mudança que não cria rota nenhuma, que é a maioria delas.
// O commit é público por natureza (é um identificador, não um segredo) e é o
// que transforma "acho que subiu" em "subiu isto aqui".

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    status: "ok",
    // Railway injeta estes no build. Fora do Railway ficam null, sem quebrar nada.
    commit: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    branch: process.env.RAILWAY_GIT_BRANCH ?? null,
    deployment: process.env.RAILWAY_DEPLOYMENT_ID ?? null,
  });
}
