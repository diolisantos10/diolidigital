import { AgencyShell } from "@/components/agency/layout/AgencyShell";
import { exigirAcessoInterno } from "@/lib/agency/organizacao/guarda";

// ⚠️ ESTE LAYOUT É A TRAVA DE `/agency/**` INTEIRO.
//
// Antes ele chamava `verifySession()`, que só perguntava "existe sessão?" —
// e mandava para o login quem não tivesse. Quem tivesse QUALQUER sessão
// entrava em qualquer página; o filtro por papel vivia no menu lateral, que é
// componente de cliente lendo um seletor que a própria pessoa troca.
//
// Agora o layout resolve o PERFIL no servidor e o entrega para a casca. Duas
// consequências que valem a mudança:
//   1. página interna nova nasce protegida — não existe lista para lembrar de
//      atualizar (guardrail 2: esquecer um portão nunca vira "aprovado");
//   2. o menu passa a filtrar pelo perfil da SESSÃO, não pelo do store.
//
// A permissão de cada rota individual é conferida na própria página, pelo
// `GuardaDeRota` — este layout garante que quem chegou aqui é da casa.
export default async function AgencyLayout({ children }: { children: React.ReactNode }) {
  const { session, perfil } = await exigirAcessoInterno();

  const userInfo = {
    name: session.name,
    role: session.role,
    workspaceId: session.workspaceId,
  };

  return (
    <AgencyShell userInfo={userInfo} perfil={perfil}>
      {children}
    </AgencyShell>
  );
}
