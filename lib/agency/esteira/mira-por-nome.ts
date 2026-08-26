// mira-por-nome.ts — O CLIENTE CHAMOU A PEÇA PELO NOME. E MANDOU NÃO MEXER NA OUTRA.
//
// ═══════════════════════════════════════════════════════════════════════════
// POR QUE ISTO EXISTE (cliente oculto, 7ª volta, 26/08/2026)
// ═══════════════════════════════════════════════════════════════════════════
//
// O pior achado da operação até aqui, medido por sha256 em produção
// (`docs/medicoes/o-ajuste-refez-a-peca-errada-26-08.md`). O cliente escreveu,
// palavra por palavra:
//
//   "Nas LEGENDAS PRONTAS: tirem qualquer menção a anúncio (…).
//    A pauta do mês está boa, não mexam nela."
//
// A casa refez a **Pauta do Mês** (v1→v2, 1.954→3.966 B) e não encostou nas
// **Legendas Prontas** (v1, `873510ae…`, byte a byte igual).
//
// A mira não estava ausente — estava **INVERTIDA**. E invertida é pior que
// ausente: ausente, o cliente repete o pedido e percebe; invertida, ele vê
// movimento, conclui que foi atendido, e a casa cobrou o ciclo para destruir a
// peça que ele tinha aprovado e deixar de pé o defeito que ele apontou.
//
// ── POR QUE A MIRA ANTIGA NÃO PODIA ACERTAR ────────────────────────────────
//
// A escada de mira de `refacao.ts` é inteira ESTRUTURAL: o FK do card, o
// `pedido:<id>`, o `SocialPost.deliverableId`, o departamento. Toda ela
// responde "que peça estava na mesa". **Nenhum degrau lê o que ele escreveu.**
// E `mira-da-peca.ts` só lê ORDINAL ("a terceira", "peça 3") sobre as imagens
// de um card — não sobre entregas com nome.
//
// Quando o que estava na mesa e o que ele apontou são peças diferentes, a
// escada estrutural acerta a mesa e erra o cliente. Este módulo é o degrau que
// faltava, e ele fica ACIMA de todos os outros por um motivo simples: as
// palavras dele são a INSTRUÇÃO; a estrutura é só a inferência de contexto.
//
// ── AS DUAS METADES, E A SEGUNDA IMPORTA MAIS ──────────────────────────────
//
// 1. **Apontada** — "nas Legendas Prontas: tirem X". Ele mandou mexer.
// 2. **Proibida** — "a pauta do mês está boa, não mexam nela". Ele mandou NÃO
//    mexer, e essa frase é uma trava, não uma dica.
//
// A segunda metade é a que segura o dano. Mesmo que TODA a escada estrutural
// aponte para a Pauta do Mês, a proibição escrita a tira do alvo. É a diferença
// entre "a casa não achou a peça certa" (caro) e "a casa destruiu a peça que o
// cliente pediu para preservar" (irrecuperável).
//
// ── O QUE ESTE MÓDULO NÃO FAZ, DE PROPÓSITO ────────────────────────────────
//
// Não interpreta, não chama modelo, não casa por assunto ou semelhança. Ele
// procura o NOME REAL da entrega, como ele está gravado no banco, dentro do
// texto do cliente — normalizado por acento e caixa, e nada além disso.
// "Legendas" sozinho não casa com "Legendas Prontas": nome parcial é palpite, e
// palpite é exatamente o que produziu a mira invertida.
//
// Ausência de nome NÃO é mira em nada: devolve listas vazias e quem chama segue
// pela escada estrutural, que é o comportamento de antes. Guardrail 1.

/** Normaliza para comparar sem acento, sem caixa e sem espaço repetido. */
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * AS PALAVRAS COM QUE UM CLIENTE PROTEGE UMA PEÇA.
 *
 * Duas famílias, e as duas foram escritas na mesma frase real de 26/08:
 *   • a ordem direta — "não mexam nela", "não toquem", "deixem como está";
 *   • o elogio que É ordem — "está boa", "está ótima", "pode manter".
 *
 * Elogio conta porque é assim que o cliente fala. "A pauta do mês está boa" no
 * meio de um pedido de ajuste não é observação: é o cliente separando o que ele
 * quer diferente do que ele quer preservado.
 */
const PROTEGE: RegExp[] = [
  /\bnao\s+(?:mex\w*|toqu\w*|alter\w*|mud\w*|refac\w*|refaz\w*|precisa\s+mex\w*)/,
  /\bdeix\w+\s+(?:ela|ele|elas|eles|essa|esse|isso|assim|como\s+(?:esta|estao|ta))/,
  /\b(?:esta|estao|ta|tao)\s+(?:boa|bom|boas|bons|otim\w+|perfeit\w+|show|de\s+boa|ok)\b/,
  /\bpod\w+\s+(?:manter|deixar)\b/,
  /\bmantenh\w+|\bmanter\s+(?:essa|esse|ela|ele|como)/,
];

/** Onde uma frase termina, para o cliente. Ponto, quebra de linha, ponto-e-vírgula. */
function frases(texto: string): string[] {
  return texto.split(/(?<=[.!?;])\s+|\n+/).map((f) => f.trim()).filter(Boolean);
}

export interface EntregaComNome {
  id: string;
  name: string;
}

export interface MiraPorNome {
  /** Ids das entregas que o cliente CHAMOU PELO NOME mandando mexer. */
  apontadas: string[];
  /** Ids das entregas que ele mandou NÃO tocar. Nunca podem virar alvo. */
  proibidas: string[];
  /** O trecho que prova cada decisão, por id — para o registro e para o cliente. */
  trechos: Record<string, string>;
}

/**
 * LÊ O TEXTO DO CLIENTE CONTRA OS NOMES REAIS DAS ENTREGAS.
 *
 * Regra do empate, e ela é conservadora de propósito: uma entrega citada em
 * duas frases, uma pedindo mudança e outra protegendo, sai **proibida**. Entre
 * "deixei de refazer o que ele queria" e "refiz o que ele mandou preservar", a
 * casa erra para o lado que o cliente consegue corrigir com uma frase.
 */
export function miraPorNomeDaEntrega(
  comentario: string | null | undefined,
  entregas: EntregaComNome[],
): MiraPorNome {
  const vazia: MiraPorNome = { apontadas: [], proibidas: [], trechos: {} };
  const t = normalizar(comentario ?? "");
  if (!t) return vazia;

  const pedacos = frases(t);
  const apontadas: string[] = [];
  const proibidas: string[] = [];
  const trechos: Record<string, string> = {};

  for (const e of entregas) {
    const nome = normalizar(e.name ?? "");
    // Nome muito curto casaria com qualquer coisa ("Ads", "Copy" dentro de
    // outra palavra). O limite de palavra nas duas pontas já protege, mas um
    // nome de uma letra não é nome.
    if (nome.length < 3) continue;

    // ── O NOME NO BANCO CARREGA O CLIENTE; O CLIENTE NÃO REPETE O PRÓPRIO NOME
    //
    // ⚠️ PEGO ANTES DE MEDIR, contra os nomes REAIS de produção. No banco a
    // entrega se chama **"Legendas Prontas — Cantina Oculta"**; o cliente
    // escreveu **"LEGENDAS PRONTAS"**. A regra do nome inteiro, sozinha, não
    // casaria — e a mira por nome nasceria sem alcançar o caso que ela existe
    // para consertar. Régua verde sobre o nome errado é pior que régua nenhuma.
    //
    // O separador é o travessão (ou hífen cercado de espaço) com que a casa
    // costura "<entrega> — <cliente>". A CABEÇA é o nome da entrega; a cauda é
    // o dono. Só a cabeça vira alternativa, e ela continua tendo de aparecer
    // INTEIRA no texto dele: "Legendas" sozinho segue não valendo.
    const cabeca = nome.split(/\s+[—–-]\s+/)[0]!.trim();
    const formas = [...new Set([nome, cabeca])].filter((f) => f.length >= 3);
    const alvo = new RegExp(
      formas.map((f) => `(?:^|[^a-z0-9])${f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[^a-z0-9])`).join("|"),
    );

    let citou = false;
    let protegeu = false;
    let prova = "";
    for (const f of pedacos) {
      if (!alvo.test(f)) continue;
      citou = true;
      if (!prova) prova = f;
      if (PROTEGE.some((re) => re.test(f))) {
        protegeu = true;
        prova = f; // a frase que protege é a prova que mais importa
      }
    }
    if (!citou) continue;

    trechos[e.id] = prova;
    if (protegeu) proibidas.push(e.id);
    else apontadas.push(e.id);
  }

  return { apontadas, proibidas, trechos };
}
