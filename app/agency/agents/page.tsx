// A SALA DOS AGENTES — item próprio no menu do admin (doutrina 20 do kit).
//
// ⚠️ O QUE ESTAVA AQUI ANTES, E POR QUE SAIU
//
// Esta página rodava em `MOCK_AGENTS` (`lib/agency/mock-data.ts`): mostrava um
// time inventado como se fosse o elenco real, com estados "ativo" e "disponível"
// que nenhum dado sustentava. Era uma tela que MENTIA — e mentia exatamente
// sobre a pergunta que o CEO faz ("quem está sendo usado, quem não está").
//
// O mock continua no repositório porque outras telas ainda o consomem. Este uso
// acabou.

import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import SalaDosAgentes from "@/components/agency/SalaDosAgentes";
import { verifySession } from "@/lib/auth/dal";
import { montarSalaDosAgentes } from "@/lib/agency/sala-dos-agentes";

export const dynamic = "force-dynamic";

export default async function SalaDosAgentesPage() {
  const session = await verifySession();
  const dados = await montarSalaDosAgentes(session.workspaceId);

  return (
    <>
      <AgencyHeader
        title="Sala dos Agentes"
        subtitle="Quem trabalha neste projeto, o que cada um faz, e quem não está sendo usado."
      />
      <SalaDosAgentes dados={dados} />
    </>
  );
}
