// placar.ts — o que o CEO abre e entende em dez segundos.
//
// ─── A REGRA DE REDAÇÃO ─────────────────────────────────────────────────────
//
// O CEO não lê código e não vai abrir um JSON. O placar é: veredito primeiro,
// depois o defeito em uma frase de negócio, depois A FALA EXATA que causou a
// falha. Sem a fala, o placar vira opinião — e opinião não conserta nada.
//
// Nada de jargão, nada de nome de função, nada de caminho de arquivo no corpo do
// placar (o rastro técnico vai para o JSON irmão, que é para quem conserta).

import type { Achado, Percurso } from "./verificacoes";
import type { Tropeco } from "./percurso";

const SINAL: Record<Achado["veredito"], string> = {
  passou: "✅ PASSOU",
  quebrou: "🚫 QUEBROU",
  "nao-coberto": "⚪ NÃO COBERTO",
};

export function placarEmTexto(
  achados: Achado[], p: Percurso, tropecos: Tropeco[], em = new Date(),
): string {
  const quebrou = achados.filter((a) => a.veredito === "quebrou");
  const passou = achados.filter((a) => a.veredito === "passou");
  const naoCoberto = achados.filter((a) => a.veredito === "nao-coberto");

  const l: string[] = [];
  l.push("# Cliente falso — placar da rodada");
  l.push("");
  l.push(`Rodada de ${em.toLocaleString("pt-BR")} · cliente fictício **${p.roteiro.nomeDoNegocioNaTela}**`);
  l.push("");
  l.push(
    quebrou.length === 0
      ? `## ✅ A casa atravessou. ${passou.length} verificações passaram.`
      : `## 🚫 A casa quebrou em ${quebrou.length} de ${achados.length} verificações.`,
  );
  l.push("");

  if (quebrou.length > 0) {
    l.push("### O que quebrou");
    l.push("");
    for (const a of quebrou) {
      l.push(`**${a.guarda}**`);
      if (a.detalhe) l.push(`- O que aconteceu: ${a.detalhe}`);
      if (a.falaExata) l.push(`- A fala exata: \`${umaLinha(a.falaExata)}\``);
      l.push("");
    }
  }

  if (naoCoberto.length > 0) {
    l.push("### O que esta rodada NÃO olhou");
    l.push("");
    l.push("Não é aprovação — é a lista do que ficou sem medir, e por quê.");
    l.push("");
    for (const a of naoCoberto) l.push(`- **${a.guarda}** — ${a.detalhe ?? "sem motivo declarado"}`);
    l.push("");
  }

  if (passou.length > 0) {
    l.push("### O que passou");
    l.push("");
    for (const a of passou) l.push(`- ${a.guarda}`);
    l.push("");
  }

  // ── AS FALAS BARRADAS, TODAS, COM A FORMA DE CADA UMA ───────────────────
  //
  // A primeira rodada ao vivo (24/08/2026) barrou 10 turnos e o placar mostrou
  // a forma de UM. Nove sobraram sem laudo — e "malformado ×9" sem a forma de
  // cada um é o mesmo beco que o laudo existe para abrir: dá o número, não dá a
  // causa. Duas amostras não fazem causa; uma, muito menos.
  if (p.turnosBarrados.length > 0) {
    l.push("### As falas que o guarda barrou, e a forma de cada uma");
    l.push("");
    l.push("O texto barrado NUNCA é gravado — o que aparece aqui é só a forma do pacote.");
    l.push("");
    for (const [forma, n] of contarFormas(p.turnosBarrados)) {
      l.push(`- **${n}×** — ${forma}`);
    }
    l.push("");
  }

  if (tropecos.length > 0) {
    l.push("### Etapas que não atravessaram");
    l.push("");
    for (const t of tropecos) l.push(`- **${t.etapa}**: ${t.erro}`);
    l.push("");
  }

  // ─── A CONVERSA INTEIRA, porque o CEO quer VER o cliente falso conversando ──
  l.push("### A conversa, como o cliente viu");
  l.push("");
  l.push(`> **A casa:** ${umaLinha(p.saudacao)}`);
  for (const t of p.turnos) {
    l.push("");
    l.push(`> **Cliente:** ${umaLinha(t.doCliente)}`);
    l.push(`> **A casa:** ${umaLinha(t.daCasa)}`);
  }
  l.push("");

  l.push("### O que a casa entendeu do cliente");
  l.push("");
  const s = p.escopoFinal;
  const d = p.roteiro.declarado;
  l.push(`| O que o cliente disse | O que a casa guardou |`);
  l.push(`|---|---|`);
  l.push(`| Negócio: ${p.roteiro.nomeDoNegocioNaFala} | ${s.businessName || "— vazio —"} |`);
  l.push(`| Volume: ${d.fraseDoVolume} (${d.postsPorSemana}/semana) | ${s.social?.postsPerWeek ?? "— vazio —"}/semana |`);
  l.push(`| Verba: ${d.fraseDaVerba} | ${s.budgetRange || "— vazio —"} |`);
  l.push(`| Público: famílias do bairro | ${s.targetAudience || "— vazio —"} |`);
  l.push("");
  const e = p.estimativaFinal;
  l.push(`**Orçamento calculado:** ${e.totalMin === 0 && e.totalMax === 0 ? "nenhum (R$ 0)" : `R$ ${e.totalMin}–${e.totalMax}/mês`}`
       + ` · confiança "${e.confidence}"${e.travadaPor ? ` · travado: ${e.travadaPor}` : ""}`);
  l.push("");
  l.push(`**Envio:** ${p.pedido ? `pedido \`${p.pedido.id}\` em "${p.pedido.status}"` : "não virou pedido"}`);
  l.push(`**Orçamento entregue ao cliente:** ${p.orcamentoEntregue ? "sim" : "não"}`);
  l.push(`**SDR de IA nesta rodada:** ${resumoDoSdr(p)}`);
  l.push(`**Mensagens barradas pela trava de saída:** ${p.saidasBloqueadas.length} `
       + `(nenhuma pessoa de verdade foi contatada)`);
  l.push("");

  return l.join("\n");
}

/**
 * O SDR de IA respondeu, e quantas vezes o guarda barrou — por rodada.
 *
 * Ordem do CEO, 23/08/2026, depois de o diário do piloto mostrar DOIS turnos
 * seguidos barrados por `malformado` sem que ninguém tivesse percebido: o
 * placar tem de dizer o número e o motivo, sempre. "Ao vivo (chave paga usada)"
 * — o texto que estava aqui — afirmava que a IA tinha entrado sem ter olhado
 * uma única resposta dela.
 */
function resumoDoSdr(p: Percurso): string {
  if (!p.sdrAoVivo) return "não — só o motor de regras";

  const total = p.respostasDoSdr.length;
  if (total === 0) return "a rodada diz ao vivo, mas nenhum turno chegou à rota do SDR";

  const respondidos = p.respostasDoSdr.filter((r) => r.respondeu).length;
  const conta = new Map<string, number>();
  for (const r of p.respostasDoSdr) {
    if (r.respondeu || !r.motivo) continue;
    conta.set(r.motivo, (conta.get(r.motivo) ?? 0) + 1);
  }
  const quedas = conta.size === 0
    ? "nenhuma queda para o motor de regras"
    : `quedas para o motor de regras: ${[...conta].map(([m, n]) => `${m} ×${n}`).join(", ")}`;
  return `ao vivo — ${respondidos} de ${total} turno(s) respondidos pelo modelo · ${quedas}`
       + ` · ${p.turnosBarrados.length} barrado(s) pelo guarda no diário`;
}

/**
 * Agrupa as linhas de turno barrado pela FORMA que o laudo registrou.
 *
 * O corpo gravado tem o feitio
 *   "[resposta barrada pelo guarda: MOTIVO — explicação — na forma: LAUDO — quem…]"
 * e é o pedaço "na forma:" que responde qual das três causas foi. Agrupar é o
 * que transforma nove linhas quase iguais numa frase que se lê: "9× o modelo
 * não abriu JSON nenhum" é uma causa; "3× de um jeito, 6× de outro" são duas.
 */
export function contarFormas(barrados: readonly string[]): [string, number][] {
  // chave normalizada → { rótulo REAL a exibir, quantos, quantas variações }
  const conta = new Map<string, { rotulo: string; n: number; variantes: Set<string> }>();
  for (const linha of barrados) {
    // Duas leituras simples e independentes valem mais que uma expressão
    // esperta: cada pedaço do corpo é opcional, e uma regex única que tenta
    // casar tudo de uma vez falha silenciosamente no dia em que um deles muda.
    const motivo = /barrada pelo guarda:\s*([^—\]]+?)\s*(?:—|\]|$)/.exec(linha)?.[1]?.trim();
    const forma = /—\s*na forma:\s*(.+?)\s*—\s*quem respondeu/.exec(linha)?.[1]?.trim();

    // ── POR QUE OS NÚMEROS SAEM DA CHAVE, MAS NÃO DO RÓTULO ────────────────
    // Agrupar: os números saem. Dez turnos da mesma causa com tamanhos
    // diferentes (201, 216, 242…) são UMA causa, não dez achados — foi o
    // conserto de 24/08 de manhã.
    //
    // Exibir: os números VOLTAM, e este foi o defeito da tarde do mesmo dia.
    // A versão anterior mostrava a própria chave normalizada, e o placar saiu
    // com "N degrau(s) da régua citado(s), N valor(es) fora dela" — apagando
    // exatamente a medição que o laudo existe para produzir. Normalizar é para
    // CONTAR; quem lê precisa do número de verdade. Por isso guarda-se um
    // exemplar real e conta-se pela chave.
    const semNumeros = forma?.replace(/\d+/g, "N");
    const chave = semNumeros
      ? `${motivo ?? "motivo não identificado"}: ${semNumeros}`
      : `${motivo ?? "motivo não identificado"} (sem laudo de forma — este guarda não julga formato)`;
    const rotulo = forma
      ? `${motivo ?? "motivo não identificado"}: ${forma}`
      : chave;

    const atual = conta.get(chave);
    if (atual) {
      atual.n += 1;
      atual.variantes.add(rotulo);
    } else {
      conta.set(chave, { rotulo, n: 1, variantes: new Set([rotulo]) });
    }
  }
  return [...conta.values()]
    .sort((a, b) => b.n - a.n)
    // Mais de um rótulo real sob a mesma causa = os números variam entre os
    // turnos. Diz isso em vez de escolher um e fingir que valia para todos.
    .map((v) => [v.variantes.size > 1 ? `${v.rotulo} (números variam entre os turnos)` : v.rotulo, v.n]);
}

function umaLinha(t: string): string {
  return t.replace(/\s*\n+\s*/g, " ⏎ ").replace(/\s{2,}/g, " ").trim();
}

/** Uma linha por rodada, para o laço. É o que se lê quando o laço roda solto. */
export function linhaDoLaco(n: number, achados: Achado[], p?: Percurso): string {
  const q = achados.filter((a) => a.veredito === "quebrou");
  // O SDR entra na linha do laço porque é ele que muda de rodada para rodada:
  // o modelo é não-determinístico, e uma queda numa rodada só do meio some do
  // placar final (que é sempre o da ÚLTIMA rodada). Sem isto, três rodadas
  // "verdes" podiam esconder uma queda para o motor de regras no caminho.
  const sdr = p?.sdrAoVivo
    ? ` · IA ${p.respostasDoSdr.filter((r) => r.respondeu).length}/${p.respostasDoSdr.length}`
      + `${p.turnosBarrados.length > 0 ? ` · ${p.turnosBarrados.length} barrado(s)` : ""}`
    : "";
  return q.length === 0
    ? `rodada ${n}: ✅ atravessou${sdr}`
    : `rodada ${n}: 🚫 quebrou em ${q.length} — ${q.map((a) => a.id).join(", ")}${sdr}`;
}

export { SINAL };
