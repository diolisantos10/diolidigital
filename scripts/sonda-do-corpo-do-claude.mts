// SONDA — qual forma de conversa a API do Claude RECUSA, medido contra a API.
//
// ── Por que existe (24/08/2026) ─────────────────────────────────────────────
// Um `Claude HTTP 400` apareceu em produção no departamento do SDR, e as
// rodadas ao vivo da bateria vinham 16/16 limpas. Deduzir a causa a partir do
// código é adivinhar; a Anthropic DIZ o que recusou, e este script pergunta.
//
// Cada candidato abaixo é uma forma de conversa que a PRODUÇÃO consegue montar
// e a bateria nunca montou. O corpo é construído por `corpoDoClaude`, a mesma
// função que a produção usa — nunca uma cópia.
//
// ⚠️ SEGREDO: a chave vem do ambiente e NUNCA é impressa. O que sai daqui é o
// status e a mensagem de erro da API, que não contém credencial.
// ⚠️ CUSTO: `max_tokens` mínimo. Requisição recusada não gera token de saída;
// o candidato que passa gasta alguns tokens e nada mais.

import { corpoDoClaude } from "../lib/ai/generate.ts";

const chave = process.env.ANTHROPIC_API_KEY;
if (!chave) {
  console.error("sem ANTHROPIC_API_KEY no ambiente — a sonda não tem o que perguntar");
  process.exit(1);
}

const MODELO = "claude-sonnet-4-6";
type Turno = { role: "user" | "assistant"; content: string };

/** Os candidatos. Cada um nasce de um caminho REAL da produção. */
const CANDIDATOS: Array<{ nome: string; historico: Turno[]; user: string; cache: boolean }> = [
  {
    nome: "A. conversa normal, alternada (o que a bateria mede)",
    historico: [{ role: "assistant", content: "Olá! Qual é o nome do seu negócio?" }, { role: "user", content: "Cantina da Prova" }],
    user: "Quero gestão de redes sociais.", cache: true,
  },
  {
    nome: "B. histórico começando por ASSISTANT (a saudação da tela)",
    historico: [{ role: "assistant", content: "Olá! Qual é o nome do seu negócio?" }],
    user: "Cantina da Prova", cache: true,
  },
  {
    nome: "C. DOIS turnos de user seguidos (turno barrado não gera resposta)",
    historico: [{ role: "assistant", content: "Olá!" }, { role: "user", content: "Cantina da Prova" }, { role: "user", content: "Alô?" }],
    user: "Ainda estou aqui.", cache: true,
  },
  {
    nome: "D. turno com texto VAZIO no histórico",
    historico: [{ role: "assistant", content: "Olá!" }, { role: "user", content: "" }],
    user: "Cantina da Prova", cache: true,
  },
  {
    nome: "E. turno só com espaços em branco",
    historico: [{ role: "assistant", content: "Olá!" }, { role: "user", content: "   \n  " }],
    user: "Cantina da Prova", cache: true,
  },
  {
    nome: "F. fala da vez VAZIA (o visitante aperta enviar sem escrever)",
    historico: [{ role: "assistant", content: "Olá!" }, { role: "user", content: "Cantina da Prova" }],
    user: "", cache: true,
  },
  {
    nome: "G. system MUITO curto com cache_control (abaixo do mínimo cacheável)",
    historico: [{ role: "assistant", content: "Olá!" }, { role: "user", content: "Cantina" }],
    user: "oi", cache: true,
  },
];

const SISTEMA_LONGO = "Você é um SDR de uma agência de marketing brasileira. ".repeat(80);

for (const c of CANDIDATOS) {
  const sistema = c.nome.startsWith("G.") ? "Você é um SDR." : SISTEMA_LONGO;
  const corpo = corpoDoClaude(
    MODELO,
    { system: sistema, user: c.user, historico: c.historico },
    16,
    c.cache,
  );
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": chave, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(corpo),
    });
    if (res.ok) {
      console.log(`✅ ${c.nome} → ${res.status} ACEITO`);
    } else {
      const t = (await res.text()).slice(0, 300).replace(/\s+/g, " ").trim();
      console.log(`🚫 ${c.nome} → ${res.status}`);
      console.log(`   a API disse: ${t}`);
    }
  } catch (e) {
    console.log(`⚠️  ${c.nome} → falha de rede: ${e instanceof Error ? e.message : String(e)}`);
  }
}
