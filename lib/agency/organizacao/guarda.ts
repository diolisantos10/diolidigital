// ─── A TERCEIRA CAMADA ───────────────────────────────────────────────────────
//
// Menu filtrado não é proteção. É arrumação.
//
// Este arquivo é a camada que decide de verdade: ela roda no SERVIDOR, lê o
// papel do JWT (nunca do corpo da requisição, nunca do store do navegador) e
// responde a mesma pergunta que o menu respondeu — com a diferença de que
// digitar a URL na barra de endereço ou chamar a API com `curl` passa por aqui
// do mesmo jeito.
//
// ── Por que isto precisou existir ───────────────────────────────────────────
//
// O acesso do painel era decidido por `isNavAllowed(currentRole, href)` dentro
// do `AgencySidebar` — um componente de cliente lendo `currentRole` do store
// do Zustand, que qualquer pessoa troca no seletor "Visualizar como". Ou seja:
// o filtro era cosmético em duas frentes ao mesmo tempo. Um membro de Social
// escolhia "Master" no seletor e o menu inteiro aparecia; e mesmo sem trocar,
// `/agency/settings` respondia 200 para quem digitasse.
//
// ── A regra de ouro deste arquivo ───────────────────────────────────────────
//
//   O perfil vem de `getSession()`. Ponto.
//
// Nenhuma função aqui aceita papel, autoridade ou departamento vindo de
// parâmetro de URL, corpo de requisição ou cabeçalho. Se um dia alguém
// precisar disso "só para testar", a resposta é: escreva o teste chamando as
// funções puras de `paginas.ts` e `autoridade.ts`, que existem justamente
// para isso.
// ─────────────────────────────────────────────────────────────────────────────

import "server-only";

import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { getSession, type SessionPayload } from "@/lib/auth/session";
import { perfilDoPapel } from "@/lib/agency/roles";
import type { DepartamentoId } from "./departamentos";
import {
  eInterno,
  pode,
  podeAdministrar,
  type Capacidade,
  type PerfilOrganizacional,
} from "./autoridade";
import { podeAbrirRota } from "./paginas";

/** O par sessão + perfil. Todo guarda devolve isto quando libera. */
export interface AcessoInterno {
  session: SessionPayload;
  perfil: PerfilOrganizacional;
}

/**
 * O perfil de uma sessão. Sessão nula = cliente/anônimo, e o perfil reflete
 * isso com `client` — nunca com um perfil vazio de autoridade indefinida, que
 * seria a porta para `undefined` cair em algum `if` invertido.
 */
export function perfilDaSessao(session: SessionPayload | null): PerfilOrganizacional {
  if (!session) return { autoridade: "client", departamentos: [] };
  return perfilDoPapel(session.role);
}

// ─── Guarda de PÁGINA (Server Component) ─────────────────────────────────────

/**
 * Exige sessão interna válida para qualquer rota de `/agency/**`.
 *
 * Chamada no layout do subdiretório, o que a torna a trava de TODAS as páginas
 * internas de uma vez — inclusive as que ainda não existem. Página nova nasce
 * protegida sem que ninguém precise lembrar.
 */
export async function exigirAcessoInterno(): Promise<AcessoInterno> {
  const session = await getSession();
  if (!session) redirect("/auth/signin");
  const perfil = perfilDaSessao(session);
  // Cliente no território interno: de volta ao portal, sem meio-termo.
  if (!eInterno(perfil.autoridade)) redirect("/");
  return { session, perfil };
}

/**
 * Exige que a rota seja alcançável por este perfil.
 *
 * Devolve `null` quando libera e a razão quando barra — a página decide se
 * renderiza o estado "sem permissão" (que é o certo: explicar) ou redireciona.
 * Barrar com tela em branco ensina a pessoa a achar que o sistema quebrou.
 */
export function motivoDeBloqueio(perfil: PerfilOrganizacional, href: string): string | null {
  if (!eInterno(perfil.autoridade)) return "Esta área é interna da agência.";
  if (podeAbrirRota(perfil, href)) return null;
  return "Esta é a mesa de trabalho de outro departamento. Você consulta o resultado dela na página do cliente e em Entregas.";
}

// ─── Guarda de API ───────────────────────────────────────────────────────────

export type ResultadoDeGuarda =
  | { acesso: AcessoInterno; erro: null }
  | { acesso: null; erro: NextResponse };

function negar(status: number, mensagem: string): NextResponse {
  return NextResponse.json({ error: mensagem }, { status });
}

/**
 * A porta de toda rota de API interna.
 *
 * `rota` é a página de `/agency/**` a que a API serve — a permissão da API e a
 * da tela ficam presas à MESMA linha do inventário. Duas regras separadas para
 * a mesma coisa é como a tela some do menu e a API continua servindo o dado.
 */
export async function exigirApiInterna(rota?: string): Promise<ResultadoDeGuarda> {
  const session = await getSession();
  if (!session) return { acesso: null, erro: negar(401, "Não autenticado.") };
  const perfil = perfilDaSessao(session);
  if (!eInterno(perfil.autoridade)) {
    return { acesso: null, erro: negar(403, "Esta área é interna da agência.") };
  }
  if (rota && !podeAbrirRota(perfil, rota)) {
    return { acesso: null, erro: negar(403, "Sem permissão para esta área.") };
  }
  return { acesso: { session, perfil }, erro: null };
}

/**
 * Exige uma capacidade num departamento. É o portão da ESCRITA.
 *
 * Ler é largo; alterar, aprovar, publicar, excluir e configurar são estreitos —
 * e é aqui que o estreito é imposto, não no botão desabilitado.
 */
export async function exigirCapacidade(
  cap: Capacidade,
  dept: DepartamentoId,
  rota?: string,
): Promise<ResultadoDeGuarda> {
  const guarda = await exigirApiInterna(rota);
  if (guarda.erro) return guarda;
  const { perfil } = guarda.acesso;
  if (!pode(perfil, cap, dept)) {
    return {
      acesso: null,
      erro: negar(403, `Ação "${cap}" pertence ao departamento responsável por esta área.`),
    };
  }
  return guarda;
}

/** Exige direção. É o portão de chave de IA, backup, reset e integração. */
export async function exigirAdministracao(rota?: string): Promise<ResultadoDeGuarda> {
  const guarda = await exigirApiInterna(rota);
  if (guarda.erro) return guarda;
  if (!podeAdministrar(guarda.acesso.perfil)) {
    return { acesso: null, erro: negar(403, "Ação restrita à direção da agência.") };
  }
  return guarda;
}
