// A chave de IA que uma rota PÚBLICA pode gastar.
//
// O briefing (`/briefing`) e o SDR são abertos de propósito: quem preenche não
// tem login, não tem token e não sabe o workspace. Só que a conversa custa
// dinheiro — e `resolveProviderKey(provider)` SEM workspace cai num `findFirst`
// global: "a primeira chave que existir no banco". Numa base com duas agências,
// qualquer pessoa com um laço de requisições gasta a chave de uma delas,
// escolhida por ordem de inserção. É o mesmo defeito que
// `app/api/portal/transcricao/route.ts` documenta como corrigido — lá existe
// credencial (o token diz de quem é a conta); aqui não existe credencial
// nenhuma, então a única resolução honesta é a do servidor.
//
// O PRECEDENTE QUE ESTA CASA JÁ TINHA: `client-request-service.
// resolverWorkspacePublico` já resolve exatamente esta pergunta para a
// solicitação criada pelo formulário público — um workspace, é aquele; dois ou
// mais, ninguém adivinha. Seguimos o precedente com a MESMA função, para que
// briefing e chave nunca respondam coisas diferentes sobre o mesmo prospect.
//
// A diferença de destino entre os dois:
//   • a solicitação, sem workspace, NASCE ÓRFÃ (perder o briefing do prospect
//     seria pior que o nulo — a rota de admin adota depois);
//   • a chave, sem workspace, NÃO É GASTA. Dinheiro não tem adoção posterior.
// Base com um workspace (o caso de hoje): comportamento idêntico ao anterior.
// Base sem workspace nenhum: cai na env, que é do deploy e de ninguém mais.

import { chaveDoAmbiente, resolveProviderKey, type AiProvider, type ResolvedKey } from "@/lib/ai/resolve-key";
import { resolverWorkspacePublico } from "@/lib/agency/persistence/client-request-service";
import { workspaceUnico } from "@/lib/auth/posse-de-workspace";

export async function chaveDeRotaPublica(provider: AiProvider): Promise<ResolvedKey | null> {
  const workspaceId = await resolverWorkspacePublico();
  if (workspaceId) return resolveProviderKey(provider, workspaceId);

  const { ambiguo } = await workspaceUnico();
  if (ambiguo) {
    console.warn(
      `[chave-publica] mais de um workspace na base — rota pública não gasta a chave de "${provider}" ` +
      `de um inquilino escolhido por acaso. Resolva o workspace no formulário (link/subdomínio) para religar.`,
    );
    return null;
  }
  // Sem workspace nenhum na base: só a env, NUNCA o cofre. Passar por
  // `resolveProviderKey` aqui reabriria o `findFirst` global pela porta dos
  // fundos — é exatamente o caminho que esta função existe para fechar.
  return chaveDoAmbiente(provider);
}
