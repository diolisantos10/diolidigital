// ─── /agency/social/analista — ANALISTA DE SOCIAL (tela do CEO) ─────────────
//
// Onde o CEO (e a gestão) vê a semana de TODAS as marcas de uma vez: o que
// funcionou, o que não funcionou (com a evidência ao lado, nunca só a
// afirmação) e o ajuste que o motor propõe para a semana seguinte. Aplicar ou
// descartar é decisão do master — ver a proposta não é.
//
// Contrato consumido (rota ainda em construção em paralelo, ficha F2-motor):
//   GET  /api/social/analises                    → lista de todas as marcas
//   POST /api/social/analises/{id}/aplicar        → master
//   POST /api/social/analises/{id}/descartar      → master
//   POST /api/social/analises/rodar               → master, dispara fora do
//                                                    ciclo de segunda 8h
//
// ── A PORTA ──────────────────────────────────────────────────────────────────
// A rota está registrada em `lib/agency/organizacao/paginas.ts` com
// `acesso: "gestao"` — master, diretor e PM entram; os demais são barrados por
// `motivoDeBloqueio` (guardrail 2 da companhia: rota fechada por omissão para
// quem não é direção, aqui fechada por regra explícita de acesso).
//
// ── OS ESTADOS ────────────────────────────────────────────────────────────────
// carregando / vazio ("Ainda sem semana analisada…") / erro — os três vivem no
// componente cliente `AnalistaDeSocial`, que também decide se mostra os botões
// Aplicar/Descartar (só para `ehMaster`, resolvido aqui no servidor a partir da
// sessão — nunca do store do navegador).

import { redirect } from "next/navigation";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import { AnalistaDeSocial } from "@/components/agency/social/AnalistaDeSocial";
import { verifySession } from "@/lib/auth/dal";
import { perfilDaSessao, motivoDeBloqueio } from "@/lib/agency/organizacao/guarda";

export const dynamic = "force-dynamic";

const ROTA = "/agency/social/analista";

export default async function AnalistaDeSocialPage() {
  const session = await verifySession();
  const perfil = perfilDaSessao(session);
  if (motivoDeBloqueio(perfil, ROTA)) {
    redirect(`/agency/sem-permissao?de=${encodeURIComponent(ROTA)}`);
  }

  return (
    <>
      <AgencyHeader
        title="Analista de Social"
        eyebrow="Social Media"
        subtitle="A leitura da semana de cada marca — o que funcionou, o que não funcionou, e o ajuste proposto para a próxima."
      />
      <AnalistaDeSocial ehMaster={session.role === "master"} />
    </>
  );
}
