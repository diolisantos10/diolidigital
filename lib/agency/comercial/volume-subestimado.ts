// VOLUME SUBESTIMADO — o que já está gravado com menos do que o cliente pediu.
//
// ─── O DANO (16/08/2026) ─────────────────────────────────────────────────────
//
// Até hoje o motor de perguntas lia o NÚMERO da resposta e ignorava a UNIDADE:
// "2 posts por dia" virava `postsPerWeek: 2`. Sete vezes menos do que a pessoa
// pediu, num campo que define **quanto ela paga e quanto recebe**.
//
// O conserto impede a sujeira nova. **Não desfaz a que está no banco** — e aqui
// a sujeira velha não é cosmética como um nome de negócio errado: se um pedido
// virou proposta, a casa COTOU MENOS do que devia; se virou contrato, a casa
// DEVE ENTREGA que não sabe que deve.
//
// ─── A ÚNICA FONTE ADMISSÍVEL: O QUE A PESSOA ESCREVEU ───────────────────────
//
// A pergunta que decide tudo é: dá para distinguir "a pessoa realmente pediu 2
// por semana" de "a pessoa disse 2 por dia e virou 2"?
//
// **Dá — e só — quando a conversa está gravada.** O briefing guarda o
// `transcript`, e nele está a frase original. Não é dedução: é leitura do que a
// pessoa escreveu, comparada com o que ficou no escopo.
//
// Sem transcript, **não é recuperável do dado**, e este módulo diz isso com
// todas as letras em vez de estimar. Inventar o volume de um cliente é
// exatamente o pecado que esta casa proíbe — e num campo que vira preço, o
// palpite não é ruído: é fatura errada.

import { volumeNaUnidade } from "../question-engine";

export type Veredito =
  /** A frase original diz outra unidade, e o escopo guardou o número cru. */
  | "subestimado"
  /** O que está gravado bate com o que a pessoa escreveu. */
  | "confere"
  /** Não há transcript, ou nele não há frase de volume. NÃO é "está certo". */
  | "nao_recuperavel";

export interface PedidoGravado {
  id: string;
  /** `briefingJson` já parseado, ou a string crua do banco. */
  briefingJson?: unknown;
}

export interface Diagnostico {
  id: string;
  veredito: Veredito;
  /** O que está no banco hoje. */
  gravado: number | null;
  /** O que a frase da pessoa diz. Só existe em `subestimado`. */
  correto: number | null;
  /** A frase dela, palavra por palavra — a prova, para caber no relatório. */
  frase: string | null;
  motivo: string;
}

function json(v: unknown): Record<string, unknown> | null {
  const o = typeof v === "string" ? (() => { try { return JSON.parse(v); } catch { return null; } })() : v;
  return o && typeof o === "object" ? (o as Record<string, unknown>) : null;
}

/** As falas do cliente, na ordem. O que o SDR disse não conta: o volume é do
 *  cliente, e a fala da casa repete o número JÁ ERRADO — lê-la seria confirmar
 *  o defeito com ele mesmo. */
function falasDoCliente(briefingJson: unknown): string[] {
  const b = json(briefingJson);
  const t = b?.transcript;
  if (!Array.isArray(t)) return [];
  return t
    .filter((m) => (m as { role?: string })?.role === "client")
    .map((m) => String((m as { text?: string }).text ?? ""))
    .filter(Boolean);
}

/** Frase que fala de volume de POSTS declarando unidade diferente de semana. */
const FALA_DE_POSTS = /\bposts?\b|\bpostagens?\b|\bpublica[çc][õo]es?\b/i;
/** Frase que declara QUALQUER unidade — inclusive "por semana".
 *
 *  ⚠️ Incluir "semana" não é detalhe: sem ela, quem escreveu "3 posts por
 *  semana" (o caso CERTO, e o mais comum) caía em `nao_recuperavel`, e a casa
 *  não conseguia dizer que aquele pedido estava correto. Pior: numa conversa em
 *  que a pessoa se corrigiu — "2 por dia… na verdade 3 por semana" — a correção
 *  dela era ignorada e o pedido era marcado como subestimado. A ferramenta
 *  proporia mudar para 14 um pedido que a pessoa acabara de dizer que era 3.
 *  Achado pelo teste da "última palavra", antes de qualquer linha ir ao banco. */
const TEM_UNIDADE = /\b(por|ao|todo|na|cada|a\s*cada)\s*(dia|semana|m[êe]s)\b|\bdi[áa]ri[ao]s?\b|\bdiariamente\b|\bsemana(l|is)\b|\bmensa(l|is)\b|\bquinzena(l|is)?\b/i;

/**
 * O veredito de UM pedido. Função pura: não lê banco, não escreve, não decide se
 * a correção será aplicada.
 */
export function diagnosticar(pedido: PedidoGravado): Diagnostico {
  const b = json(pedido.briefingJson);
  const scope = json(b?.scope);
  const social = json(scope?.social);
  const gravadoRaw = social?.postsPerWeek ?? scope?.postsPerWeek;
  const gravado = typeof gravadoRaw === "number" ? gravadoRaw : null;

  const base = { id: pedido.id, gravado, correto: null, frase: null };

  const falas = falasDoCliente(b);
  if (falas.length === 0) {
    return {
      ...base,
      veredito: "nao_recuperavel",
      motivo: "sem transcript gravado — não é recuperável do dado, e isso NÃO significa que está certo",
    };
  }

  // A última frase do cliente que fala de posts COM unidade explícita. A última,
  // e não a primeira: quem corrige a si mesmo ("na verdade, 3 por semana") tem a
  // última palavra, como teria numa conversa com gente.
  const candidata = [...falas].reverse().find((f) => FALA_DE_POSTS.test(f) && TEM_UNIDADE.test(f));
  if (!candidata) {
    return {
      ...base,
      veredito: "nao_recuperavel",
      motivo: "nenhuma frase do cliente declara unidade de volume — não dá para afirmar erro nem acerto",
    };
  }

  const correto = volumeNaUnidade(candidata, "semana");
  if (correto === undefined || gravado === null) {
    return { ...base, frase: candidata, veredito: "nao_recuperavel", motivo: "frase com unidade, mas sem número utilizável" };
  }

  if (correto === gravado) {
    return { ...base, frase: candidata, veredito: "confere", motivo: "o gravado bate com o que a pessoa escreveu" };
  }

  return {
    id: pedido.id,
    veredito: "subestimado",
    gravado,
    correto,
    frase: candidata,
    motivo: `a pessoa escreveu "${candidata.trim().slice(0, 60)}" — são ${correto}/semana, e o banco guarda ${gravado}`,
  };
}

export interface Retrato {
  total: number;
  subestimados: number;
  conferem: number;
  naoRecuperaveis: number;
  /** Só os que mudariam. Vazio é resultado, não erro. */
  mudancas: Diagnostico[];
}

export function retratoDoLote(pedidos: PedidoGravado[]): Retrato {
  const d = pedidos.map(diagnosticar);
  return {
    total: d.length,
    subestimados: d.filter((x) => x.veredito === "subestimado").length,
    conferem: d.filter((x) => x.veredito === "confere").length,
    naoRecuperaveis: d.filter((x) => x.veredito === "nao_recuperavel").length,
    mudancas: d.filter((x) => x.veredito === "subestimado"),
  };
}
