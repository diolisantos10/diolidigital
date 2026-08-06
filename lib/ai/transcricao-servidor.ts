// transcricao-servidor.ts — QUEM transcreve o áudio, quando o navegador não
// consegue sozinho. SERVER-ONLY (lê chaves do cofre).
//
// POR QUE ESTE ARQUIVO NASCEU (06/08/2026)
//   Até hoje as duas rotas de ditado resolviam `resolveProviderKey("openai")` e
//   chamavam a OpenAI direto. Uma conta sem crédito derrubou o microfone do
//   portal, do briefing e do chat de uma vez — sem rota de fuga e sem ninguém
//   para assumir o trabalho. "Provedor substituível" só é verdade quando existe
//   um lugar que escolhe entre provedores; enquanto a escolha está grudada na
//   rota, o que existe é um fornecedor único com nome de camada.
//
// A CADEIA, E POR QUE ELA NÃO É "TENTE TUDO"
//   Só falha do FORNECEDOR passa para o próximo (sem saldo, chave recusada,
//   provedor fora do ar, tempo esgotado, rede, áudio recusado — este último
//   porque cada motor aceita um conjunto diferente de contêineres). Falha do
//   ÁUDIO (curto demais, grande demais, sem fala) NÃO passa: trocar de provedor
//   não faz o silêncio virar frase, e repetir o envio três vezes só multiplica
//   custo e espera do cliente.
//
// O QUE VOLTA QUANDO TODOS FALHAM: a falha do PRIMEIRO provedor com chave — o
// diagnóstico do fornecedor principal, que é onde o operador vai mexer. Nenhum
// provedor configurado devolve `sem_chave`, e a tela DIZ que o ditado por envio
// não existe — nunca finge que existe e culpa o áudio.
//
// PII: o áudio vive dentro da requisição e o texto nunca é logado. O que se
// registra é provedor + motivo.

import {
  transcreverAudio,
  falhaDeTranscricao,
  ehProvedorDeTranscricao,
  type ProvedorDeTranscricao,
  type ResultadoDeTranscricao,
  type MotivoDeFalhaDeTranscricao,
} from "@/lib/ai/transcricao";
import { resolveProviderKey, chaveDoAmbiente, type ResolvedKey } from "@/lib/ai/resolve-key";
import { chaveDeRotaPublica } from "@/lib/ai/chave-publica";

/**
 * De quem é a conta que paga esta transcrição.
 *  • `workspace` — há credencial (token do portal diz de quem é a conta);
 *  • `publico`  — não há credencial nenhuma (briefing aberto): quem resolve é
 *    `chaveDeRotaPublica`, que se recusa a gastar a chave de um inquilino
 *    escolhido por acaso.
 */
export type EscopoDeChave = { tipo: "workspace"; workspaceId: string } | { tipo: "publico" };

/** Ordem padrão. `TRANSCRICAO_PROVEDORES=groq,gemini` troca sem deploy de código. */
const ORDEM_PADRAO: ProvedorDeTranscricao[] = ["openai", "groq", "gemini"];

export function ordemDeProvedores(): ProvedorDeTranscricao[] {
  const bruto = process.env.TRANSCRICAO_PROVEDORES?.trim();
  if (!bruto) return ORDEM_PADRAO;
  const escolhidos = bruto
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(ehProvedorDeTranscricao);
  return escolhidos.length ? [...new Set(escolhidos)] : ORDEM_PADRAO;
}

/**
 * A chave de um provedor de transcrição, no escopo pedido.
 *
 * `groq` ainda não tem linha nas Integrações (o cofre lista os provedores de
 * RACIOCÍNIO); enquanto não tiver, ele vem só da env do deploy — que é do
 * deploy e de ninguém mais, então serve aos dois escopos sem risco de gastar a
 * conta de um inquilino no lugar de outro.
 */
async function chaveDe(
  provedor: ProvedorDeTranscricao,
  escopo: EscopoDeChave,
): Promise<ResolvedKey | null> {
  if (provedor === "groq") {
    const chave = process.env.GROQ_API_KEY?.trim();
    return chave ? { apiKey: chave, source: "env", model: null } : null;
  }
  if (escopo.tipo === "workspace") return resolveProviderKey(provedor, escopo.workspaceId);
  return chaveDeRotaPublica(provedor);
}

/** Quais motores existem DE VERDADE agora. Vazio = o caminho 2 não existe. */
export async function provedoresDeTranscricaoDisponiveis(
  escopo: EscopoDeChave,
): Promise<ProvedorDeTranscricao[]> {
  const encontrados: ProvedorDeTranscricao[] = [];
  for (const p of ordemDeProvedores()) {
    if (await chaveDe(p, escopo)) encontrados.push(p);
  }
  return encontrados;
}

export async function ditadoPorEnvioDisponivel(escopo: EscopoDeChave): Promise<boolean> {
  return (await provedoresDeTranscricaoDisponiveis(escopo)).length > 0;
}

/** Falha que pode ser do fornecedor — vale tentar o próximo da fila. */
const TROCA_DE_PROVEDOR: ReadonlySet<MotivoDeFalhaDeTranscricao> = new Set([
  "sem_saldo",
  "chave_recusada",
  "provedor_indisponivel",
  "tempo_esgotado",
  "rede",
  "audio_recusado",
  "ritmo",
]);

export interface TranscricaoDaCasa {
  resultado: ResultadoDeTranscricao;
  /** Quem entregou (ou quem falhou por último). `null` = ninguém configurado. */
  provedor: ProvedorDeTranscricao | null;
}

export async function transcreverPelaCasa(opts: {
  arquivo: Blob;
  escopo: EscopoDeChave;
  idioma?: string;
}): Promise<TranscricaoDaCasa> {
  let primeiraFalha: { resultado: ResultadoDeTranscricao; provedor: ProvedorDeTranscricao } | null = null;

  for (const provedor of ordemDeProvedores()) {
    const chave = await chaveDe(provedor, opts.escopo);
    if (!chave) continue;

    const resultado = await transcreverAudio({
      apiKey: chave.apiKey,
      arquivo: opts.arquivo,
      provedor,
      modelo: provedor === "gemini" ? (chave.model ?? undefined) : undefined,
      idioma: opts.idioma,
    });

    if (resultado.ok) return { resultado, provedor };

    if (!primeiraFalha) primeiraFalha = { resultado, provedor };
    if (!TROCA_DE_PROVEDOR.has(resultado.motivo)) return { resultado, provedor };
    console.error(`[transcricao] ${provedor} falhou (${resultado.motivo}) — tentando o próximo`);
  }

  if (primeiraFalha) return { resultado: primeiraFalha.resultado, provedor: primeiraFalha.provedor };
  return { resultado: falhaDeTranscricao("sem_chave"), provedor: null };
}
