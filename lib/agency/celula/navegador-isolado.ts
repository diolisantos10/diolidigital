// ─── O PERFIL DE NAVEGADOR ISOLADO — decisão 2 do CEO, 30/08/2026 ──────────
//
//   "Perfil de navegador COMPLETAMENTE ISOLADO, alcançando somente o 99Freelas
//    e a área operacional necessária da Dioli. Esse perfil NÃO pode conter
//    Gmail, banco, redes sociais, dados pessoais nem qualquer outra sessão
//    do CEO."
//
// ── POR QUE ESTE ARQUIVO EXISTE, E POR QUE AGORA ──────────────────────────
// O `seguranca` BLOQUEOU a primeira sessão autenticada real com este parecer:
// o isolamento existia "só como parágrafo de especificação — não há uma linha
// de código". O risco que ele nomeou não é a plataforma banir a conta. É o
// agente, exposto a um briefing malicioso escrito por um desconhecido,
// alcançar o **e-mail e o banco do CEO** na mesma sessão de navegador.
//
// A decisão 2 destrava aquele bloqueio — e SÓ com esta peça existindo de
// verdade. Uma decisão que autoriza o que não foi construído não autoriza
// nada; autoriza um risco.
//
// ── A FORMA DA TRAVA: LISTA DE PERMISSÃO, NUNCA DE PROIBIÇÃO ──────────────
// A tentação é listar o proibido: gmail.com, o banco, as redes. Está errado,
// e o erro é matemático — a lista de tudo que existe na internet é infinita e
// a de proibições é sempre uma amostra. Bastaria o CEO ter sessão num serviço
// que ninguém lembrou de listar.
//
// Aqui é o inverso: **só o que está declarado passa; todo o resto é negado**,
// inclusive o que ninguém imaginou. `gmail.com` não precisa aparecer em lugar
// nenhum deste arquivo para estar barrado — e é exatamente por não aparecer
// que ele está barrado.
//
// ── O QUE ESTE ARQUIVO NÃO FAZ ────────────────────────────────────────────
// Não abre navegador, não faz login e não guarda credencial. Ele DECIDE e
// DESCREVE: diz se um destino é alcançável e devolve a configuração de perfil
// que quem abrir o Chrome tem de usar. Manter a decisão separada da execução é
// o que permite testá-la sem Chromium — e teste que precisa de navegador é
// teste que alguém desliga.

/**
 * Os destinos alcançáveis. Lista FECHADA, e curta de propósito: cada entrada
 * aqui é uma superfície a mais que um texto hostil pode tentar alcançar.
 *
 * `99freelas.com.br` — o canal de trabalho.
 * A área operacional da Dioli entra por `DIOLI_OPERACIONAL`, que é derivada
 * de variável de ambiente e NÃO tem default: sem ela configurada, o perfil
 * alcança só o 99Freelas. Fail closed também aqui.
 */
const DOMINIOS_DO_CANAL: readonly string[] = ["99freelas.com.br", "www.99freelas.com.br"];

/**
 * A área operacional da Dioli, quando declarada. `null` = não declarada, e
 * então não se alcança nada da Dioli — o que é o comportamento seguro, não uma
 * degradação.
 */
export function dioliOperacional(env: Record<string, string | undefined> = process.env): string | null {
  const bruto = (env.DIOLI_DOMINIO_OPERACIONAL ?? "").trim().toLowerCase();
  if (bruto === "") return null;
  // Só o host, e só se for um host plausível. Um valor com barra, espaço ou
  // esquema é configuração errada, e configuração errada não vira permissão.
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(bruto)) return null;
  return bruto;
}

export type VereditoDeDestino =
  | { alcancavel: true; host: string; porque: "canal" | "area_operacional_da_dioli" }
  | { alcancavel: false; motivo: string; regra: RegraDeDestino };

export type RegraDeDestino =
  | "url_ilegivel"
  | "esquema_nao_permitido"
  | "fora_da_lista_de_permissao";

/**
 * Extrai o host de forma defensiva. Devolve `null` para qualquer coisa que não
 * seja uma URL absoluta legível — não tenta "consertar" a entrada, porque
 * consertar entrada hostil é como a maioria dos contornos de allowlist começa.
 */
function hostDe(url: string): { host: string; esquema: string } | null {
  try {
    const u = new URL(url);
    return { host: u.hostname.toLowerCase(), esquema: u.protocol };
  } catch {
    return null;
  }
}

/**
 * A pergunta central: este perfil pode abrir esta URL?
 *
 * A comparação é por host EXATO ou por subdomínio legítimo (`.dominio`), nunca
 * por `includes`. `includes` é o defeito clássico: `99freelas.com.br.evil.com`
 * contém `99freelas.com.br` e passaria — e é assim que se rouba uma sessão.
 */
export function avaliarDestino(
  url: string,
  env: Record<string, string | undefined> = process.env,
): VereditoDeDestino {
  const partes = typeof url === "string" ? hostDe(url) : null;
  if (partes === null) {
    return {
      alcancavel: false,
      regra: "url_ilegivel",
      motivo: `URL ilegível: ${JSON.stringify(url)}. Entrada que não é URL absoluta não é "consertada" — é negada.`,
    };
  }

  // Só HTTPS. `file:` alcançaria o disco da máquina, e `http:` entregaria a
  // sessão a quem estiver no caminho.
  if (partes.esquema !== "https:") {
    return {
      alcancavel: false,
      regra: "esquema_nao_permitido",
      motivo: `esquema "${partes.esquema}" não é permitido — só https:. file: alcançaria o disco; http: entregaria a sessão.`,
    };
  }

  const operacional = dioliOperacional(env);
  const permitidos: { host: string; porque: "canal" | "area_operacional_da_dioli" }[] = [
    ...DOMINIOS_DO_CANAL.map((h) => ({ host: h, porque: "canal" as const })),
    ...(operacional ? [{ host: operacional, porque: "area_operacional_da_dioli" as const }] : []),
  ];

  for (const p of permitidos) {
    if (partes.host === p.host || partes.host.endsWith(`.${p.host}`)) {
      return { alcancavel: true, host: partes.host, porque: p.porque };
    }
  }

  return {
    alcancavel: false,
    regra: "fora_da_lista_de_permissao",
    motivo:
      `"${partes.host}" não está na lista de permissão deste perfil. ` +
      `A lista é de PERMISSÃO, não de proibição: o que não foi declarado é negado, ` +
      `inclusive o que ninguém imaginou. Gmail, banco e redes sociais estão barrados ` +
      `por NÃO aparecerem aqui — e é por não aparecerem que estão barrados.`,
  };
}

// ── A CONFIGURAÇÃO DO PERFIL ────────────────────────────────────────────────

export interface PerfilIsolado {
  /**
   * O diretório do perfil. Precisa ser DEDICADO — nunca o perfil padrão do
   * Chrome do CEO, que é onde moram Gmail, banco e redes.
   */
  diretorioDoPerfil: string;
  /** Os destinos que este perfil alcança, para quem for auditar. */
  alcanca: readonly string[];
  /**
   * `true` sempre. Existe como campo, e não como comentário, para que uma
   * configuração que tente nascer sem isolamento não seja representável.
   */
  isolado: true;
}

export type MontagemDoPerfil =
  | { ok: true; perfil: PerfilIsolado }
  | { ok: false; motivo: string };

/**
 * Monta a configuração do perfil isolado — e RECUSA os caminhos que seriam o
 * perfil pessoal do CEO.
 *
 * A checagem de caminho é grosseira de propósito e erra para o lado de recusar:
 * um diretório que PAREÇA perfil padrão de navegador é negado mesmo que fosse
 * legítimo. Recusar um caminho bom custa uma linha de configuração; aceitar um
 * ruim custa o e-mail e o banco do CEO.
 */
export function montarPerfilIsolado(
  diretorioDoPerfil: string,
  env: Record<string, string | undefined> = process.env,
): MontagemDoPerfil {
  const d = (diretorioDoPerfil ?? "").trim();
  if (d === "") {
    return { ok: false, motivo: "diretório do perfil vazio — sem diretório dedicado não há isolamento." };
  }

  const normalizado = d.toLowerCase().replace(/\\/g, "/");
  const SUSPEITOS = [
    "/library/application support/google/chrome",
    "/.config/google-chrome",
    "/.config/chromium",
    "/appdata/local/google/chrome/user data",
    "/library/application support/firefox",
    "/.mozilla",
    "/library/safari",
  ];
  for (const s of SUSPEITOS) {
    if (normalizado.includes(s)) {
      return {
        ok: false,
        motivo:
          `"${d}" parece ser o perfil padrão de um navegador do usuário. ` +
          `É lá que moram Gmail, banco e redes sociais — exatamente o que a ` +
          `decisão 2 do CEO manda NÃO estar neste perfil.`,
      };
    }
  }
  if (normalizado.endsWith("/default") || normalizado.endsWith("/profile 1")) {
    return { ok: false, motivo: `"${d}" tem nome de perfil padrão de navegador. Use um diretório dedicado à Célula.` };
  }

  const operacional = dioliOperacional(env);
  return {
    ok: true,
    perfil: {
      diretorioDoPerfil: d,
      alcanca: [...DOMINIOS_DO_CANAL, ...(operacional ? [operacional] : [])],
      isolado: true,
    },
  };
}
