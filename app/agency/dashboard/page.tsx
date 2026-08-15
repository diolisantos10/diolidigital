import "./central.css";
import { CentralDeTrabalho } from "@/components/agency/central/CentralDeTrabalho";
import { exigirAcessoInterno } from "@/lib/agency/organizacao/guarda";

// ─── /agency/dashboard — a Central de Trabalho ───────────────────────────────
//
// O painel de operação detalhado que morava aqui NÃO foi apagado: ele está em
// `/agency/dashboard/operacao`, com a mesma funcionalidade, e continua no
// inventário de páginas. O contrato proíbe deletar tela nesta entrega — e ele
// tem razão: aquela página tem o motor de pontuação de ações, o Pulso e a Fila
// de avisos, que ninguém pediu para remover.
//
// A sessão é resolvida AQUI, no servidor. O componente recebe o perfil pronto e
// não tem como fabricar um para si — ele nem importa o store de papel.

export const dynamic = "force-dynamic";

export default async function CentralDeTrabalhoPage() {
  const { session, perfil } = await exigirAcessoInterno();

  return (
    <CentralDeTrabalho
      nomeDoUsuario={session.name}
      papelDaSessao={session.role}
      perfilDaSessao={perfil}
    />
  );
}
