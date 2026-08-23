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
  l.push(`**SDR de IA nesta rodada:** ${p.sdrAoVivo ? "ao vivo (chave paga usada)" : "não — só o motor de regras"}`);
  l.push(`**Mensagens barradas pela trava de saída:** ${p.saidasBloqueadas.length} `
       + `(nenhuma pessoa de verdade foi contatada)`);
  l.push("");

  return l.join("\n");
}

function umaLinha(t: string): string {
  return t.replace(/\s*\n+\s*/g, " ⏎ ").replace(/\s{2,}/g, " ").trim();
}

/** Uma linha por rodada, para o laço. É o que se lê quando o laço roda solto. */
export function linhaDoLaco(n: number, achados: Achado[]): string {
  const q = achados.filter((a) => a.veredito === "quebrou");
  return q.length === 0
    ? `rodada ${n}: ✅ atravessou`
    : `rodada ${n}: 🚫 quebrou em ${q.length} — ${q.map((a) => a.id).join(", ")}`;
}

export { SINAL };
