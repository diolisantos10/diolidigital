// ─── O EXECUTOR — plano de ação, atestação e registro. Não um driver. ─────
//
// Item obrigatório do CEO: "executor ligado ao navegador isolado".
//
// ── POR QUE ESTE ARQUIVO NÃO ABRE NAVEGADOR NENHUM ────────────────────────
// A decisão 1 do CEO é **Claude in Chrome**, explicitamente NÃO OpenAI com
// Playwright. E o Claude in Chrome é operado DE DENTRO do navegador, por quem
// está na frente dele — nosso processo Node não o inicia, não o chama e não
// recebe retorno dele.
//
// Logo, `executor.launch()` não existe nesse mundo e nunca vai existir.
// Construir um driver Playwright autenticado aqui seria **executar o contrário
// da decisão 1 e chamar a decisão 2 de cumprida**. O raciocínio inteiro está em
// `docs/celula-prospeccao/decisao-1-vs-decisao-2.md`.
//
// O que este arquivo faz: DECIDE o que deve ser feito e onde, IMPÕE a lista de
// permissão e o ritmo, EXIGE a atestação do perfil, e REGISTRA o que voltou.
//
// ── A TRAVA QUE VALE MAIS QUE TODAS AS OUTRAS AQUI ────────────────────────
// 🔴 Nenhum plano nasce sem ATESTAÇÃO de que o perfil dedicado está limpo.
// Isso não é verificável pelo nosso código — o perfil está na máquina do CEO —
// e é justamente por isso que a atestação é um DADO obrigatório, com autor e
// data, e não uma suposição. Uma trava que depende de um fato que ninguém
// conferiu é uma trava suposta, e esta casa já tem seis dessas.

import { avaliarDestino, montarPerfilIsolado } from "@/lib/agency/celula/navegador-isolado";
import { avaliarRitmo, type ConfiguracaoDeRitmo, type HistoricoDeRitmo } from "@/lib/agency/celula/ritmo";
import { podeNaCelula, type Credencial } from "@/lib/agency/celula/papeis";

/** O que se pode mandar o operador fazer. Conjunto FECHADO, e curto: cada
 *  entrada é uma capacidade a mais que um texto hostil pode tentar alcançar. */
export type AcaoNoCanal =
  | "abrir_projeto"
  | "ler_conversa"
  | "enviar_mensagem"
  | "anexar_arquivo"
  | "baixar_arquivo";

const ACOES: readonly string[] = [
  "abrir_projeto",
  "ler_conversa",
  "enviar_mensagem",
  "anexar_arquivo",
  "baixar_arquivo",
];

/** As que MEXEM na plataforma. Exigem o aceite humano do supervisionado. */
const ACOES_DE_ESCRITA: readonly AcaoNoCanal[] = ["enviar_mensagem", "anexar_arquivo"];

/**
 * A atestação de que o perfil está limpo. Feita por gente, na máquina do CEO.
 *
 * As quatro provas existem contra os quatro jeitos de ela ser falsificada por
 * omissão: sem autor não se audita; sem data vale para sempre; sem o diretório
 * conferido ela fala de outro perfil; e `nenhumaOutraSessao: false` é o caso em
 * que a pessoa olhou e ACHOU sessão — que tem de bloquear, não ser ignorado.
 */
export interface AtestacaoDoPerfil {
  diretorioDoPerfil: string;
  /** A pessoa confirmou, olhando, que não há Gmail, banco, rede social nem
   *  qualquer outra sessão nesse perfil. */
  nenhumaOutraSessao: boolean;
  atestadoPor: string;
  atestadoEm: Date;
}

export interface PedidoDeExecucao {
  acao: unknown;
  url: unknown;
  /** Quem está pedindo. É por ela que passa o aceite do supervisionado. */
  credencial: Credencial;
  atestacao?: AtestacaoDoPerfil | null;
  historicoDeRitmo: HistoricoDeRitmo;
  agora?: Date;
  configuracaoDeRitmo?: ConfiguracaoDeRitmo | null;
  env?: Record<string, string | undefined>;
}

export type RegraDoExecutor =
  | "acao_desconhecida"
  | "sem_atestacao_do_perfil"
  | "atestacao_malformada"
  | "perfil_nao_isolado"
  | "destino_fora_da_permissao"
  | "sem_aceite_humano"
  | "ritmo";

export type PlanoDeAcao =
  | {
      ok: true;
      acao: AcaoNoCanal;
      url: string;
      /** Os destinos que o operador pode alcançar. Viaja COM o plano: a trava
       *  não adianta se ficar só do lado de cá. */
      destinosPermitidos: readonly string[];
      /** O que o operador tem de devolver como prova. */
      evidenciaExigida: readonly string[];
    }
  | { ok: false; motivo: string; regra: RegraDoExecutor };

/**
 * Monta o plano — ou recusa, dizendo qual trava respondeu.
 *
 * A ordem das checagens é deliberada: a ATESTAÇÃO vem primeiro, antes até do
 * destino. Sem perfil atestado, não importa para onde se quer ir — o risco não
 * é o destino errado, é o agente estar num navegador que tem o e-mail e o banco
 * do CEO dentro.
 */
export function planejarAcao(p: PedidoDeExecucao): PlanoDeAcao {
  if (typeof p.acao !== "string" || !ACOES.includes(p.acao)) {
    return {
      ok: false,
      regra: "acao_desconhecida",
      motivo: `ação desconhecida: ${JSON.stringify(p.acao)}. Conjunto fechado: ${ACOES.join(", ")}.`,
    };
  }
  const acao = p.acao as AcaoNoCanal;

  // 1. A ATESTAÇÃO — antes de tudo.
  const at = p.atestacao;
  if (at === null || at === undefined) {
    return {
      ok: false,
      regra: "sem_atestacao_do_perfil",
      motivo:
        "não há atestação de que o perfil dedicado está limpo. O perfil vive na máquina do CEO " +
        "e não é verificável por este código — por isso é DADO obrigatório, não suposição.",
    };
  }
  if (at.nenhumaOutraSessao !== true) {
    return {
      ok: false,
      regra: "atestacao_malformada",
      motivo:
        "a atestação diz que HÁ outra sessão no perfil (ou não afirma que não há). " +
        "Decisão 2 do CEO: o perfil não pode conter Gmail, banco, redes sociais nem dados pessoais.",
    };
  }
  if (typeof at.atestadoPor !== "string" || at.atestadoPor.trim() === "") {
    return { ok: false, regra: "atestacao_malformada", motivo: "atestação sem autor — registro que ninguém assinou não se audita." };
  }
  if (!(at.atestadoEm instanceof Date) || Number.isNaN(at.atestadoEm.getTime())) {
    return { ok: false, regra: "atestacao_malformada", motivo: "atestação sem data válida — sem data ela valeria para sempre." };
  }

  // 2. O perfil atestado precisa ser um perfil DEDICADO, não o pessoal.
  const perfil = montarPerfilIsolado(at.diretorioDoPerfil, p.env);
  if (!perfil.ok) {
    return { ok: false, regra: "perfil_nao_isolado", motivo: perfil.motivo };
  }

  // 3. O destino, contra a lista de PERMISSÃO.
  const destino = avaliarDestino(typeof p.url === "string" ? p.url : "", p.env);
  if (!destino.alcancavel) {
    return { ok: false, regra: "destino_fora_da_permissao", motivo: destino.motivo };
  }

  // 4. Escrita exige o aceite humano do modo supervisionado. A conta começa
  //    obrigatoriamente em supervisionado, por ordem do CEO, e o automático
  //    está proibido nesta fase.
  if (ACOES_DE_ESCRITA.includes(acao)) {
    const aceite = podeNaCelula(p.credencial, "autorizar_envio");
    if (!aceite.pode) {
      return {
        ok: false,
        regra: "sem_aceite_humano",
        motivo: `"${acao}" mexe na plataforma e exige aceite humano: ${aceite.motivo}`,
      };
    }
  }

  // 5. O ritmo.
  const ritmo = avaliarRitmo(p.historicoDeRitmo, p.agora ?? new Date(), p.configuracaoDeRitmo);
  if (!ritmo.pode) {
    return { ok: false, regra: "ritmo", motivo: ritmo.motivo };
  }

  return {
    ok: true,
    acao,
    url: destino.host === "" ? String(p.url) : String(p.url),
    destinosPermitidos: perfil.perfil.alcanca,
    evidenciaExigida: evidenciaDe(acao),
  };
}

/** O que o operador tem de trazer de volta. Sem isto, "executei" é palavra. */
function evidenciaDe(acao: AcaoNoCanal): readonly string[] {
  switch (acao) {
    case "enviar_mensagem":
      return ["url_da_conversa", "texto_enviado", "carimbo_de_tempo"];
    case "anexar_arquivo":
      return ["url_da_conversa", "nome_do_arquivo", "tamanho_em_bytes", "checksum", "carimbo_de_tempo"];
    case "baixar_arquivo":
      return ["url_de_origem", "nome_do_arquivo", "tamanho_em_bytes", "checksum", "carimbo_de_tempo"];
    default:
      return ["url_visitada", "carimbo_de_tempo"];
  }
}

// ── O REGISTRO DO QUE VOLTOU ────────────────────────────────────────────────

export interface RelatoDoOperador {
  /** Onde o operador REALMENTE esteve. Comparado com a permissão: a trava do
   *  lado de cá não vale nada se ninguém conferir o lado de lá. */
  urlVisitada: unknown;
  evidencias: Readonly<Record<string, unknown>>;
}

export type RegistroDaExecucao =
  | { ok: true; acao: AcaoNoCanal; urlVisitada: string; evidencias: Readonly<Record<string, unknown>> }
  | { ok: false; motivo: string; regra: "destino_divergente" | "evidencia_faltando" | "plano_invalido" };

/**
 * Confere o relato contra o plano. **Não é formalidade.**
 *
 * Se o operador diz que esteve num destino fora da permissão, isso não é um
 * detalhe de log: é o sinal de que a trava foi contornada, e tem de virar
 * recusa registrada — não um registro alegre de "executado".
 */
export function registrarExecucao(plano: PlanoDeAcao, relato: RelatoDoOperador): RegistroDaExecucao {
  if (!plano.ok) {
    return { ok: false, regra: "plano_invalido", motivo: "não se registra execução de um plano que foi recusado." };
  }

  const url = typeof relato?.urlVisitada === "string" ? relato.urlVisitada : "";
  const permitido = plano.destinosPermitidos.some((h) => {
    try {
      const host = new URL(url).hostname.toLowerCase();
      return host === h || host.endsWith(`.${h}`);
    } catch {
      return false;
    }
  });
  if (!permitido) {
    return {
      ok: false,
      regra: "destino_divergente",
      motivo:
        `o operador relatou ter visitado ${JSON.stringify(relato?.urlVisitada)}, que não está nos ` +
        `destinos permitidos (${plano.destinosPermitidos.join(", ")}). Isto não é detalhe de log: ` +
        `é sinal de trava contornada.`,
    };
  }

  const faltando = plano.evidenciaExigida.filter(
    (e) => relato?.evidencias?.[e] === undefined || relato.evidencias[e] === null || relato.evidencias[e] === "",
  );
  if (faltando.length > 0) {
    return {
      ok: false,
      regra: "evidencia_faltando",
      motivo: `faltou evidência: ${faltando.join(", ")}. Sem evidência, "executei" é palavra.`,
    };
  }

  return { ok: true, acao: plano.acao, urlVisitada: url, evidencias: relato.evidencias };
}
