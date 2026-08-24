// Roda a conversa do SDR da Farol 27 contra a PRODUÇÃO, pela rota PÚBLICA
// /api/sdr/chat (sem credencial). Ana [TESTE], e-mail .invalid.
import { writeFileSync } from "node:fs";
const BASE = "https://www.diolidigital.com.br";
const MARCA = "[TESTE]";
const SESSION = "farol-27-teste-" + Date.now();

const FATOS = [
  [/nome do seu neg[óo]cio|nome da (sua )?empresa|qual (é|e) o nome/i, "O negócio se chama Farol 27 — Padaria & Café."],
  [/gest[ãa]o de redes sociais, tr[áa]fego pago|est[áa] precisando|buscando gest[ãa]o|o que a gente pode ajudar|maior desafio/i, "Queremos reposicionar a marca e lançar o Clube Farol 27, uma assinatura de café da manhã de R$ 149 por mês. Precisamos de identidade, conteúdo e anúncios."],
  [/principal objetivo|o que voc[êe] quer alcan[çc]ar/i, "Vender assinaturas do Clube Farol 27 e parar de depender só do balcão."],
  [/p[úu]blico-?alvo|cliente ideal/i, "Moradores e trabalhadores num raio de 3 km das lojas, 25 a 45 anos, e empresas da região que pedem café da manhã corporativo."],
  [/contrato mensal|campanha pontual/i, "Contrato mensal, mas com um projeto de lançamento de 8 semanas dentro."],
  [/quais canais|instagram, facebook, tiktok/i, "Instagram, TikTok e WhatsApp."],
  [/quantas postagens por semana|quantas vezes por semana|publicar no feed|ritmo/i, "3 posts por semana no feed."],
  [/stories/i, "Stories sim, uns 3 por semana."],
  [/reels ou v[íi]deos|quantos por m[êe]s/i, "Sim, 8 vídeos curtos por mês para o TikTok."],
  [/gravar e editar|produ[çc][ãa]o do v[íi]deo/i, "A gente grava na loja com celular; roteiro e edição queremos de vocês."],
  [/fotos|banco de imagens|material visual/i, "Temos fotos de loja e de produto, cardápios antigos, embalagens e prints das redes. Brand book a gente não tem."],
  [/textos \(copy\)|criar os textos|fornecer o conte[úu]do/i, "Os textos ficam com vocês — não temos tom de voz definido."],
  [/tr[áa]fego pago.*(quer|incluir)|an[úu]ncios no instagram, facebook ou google/i, "Sim, queremos anúncios."],
  [/an[úu]ncios seriam em qual plataforma|meta \(instagram\/facebook\)/i, "Meta e TikTok. A divisão entre os dois a gente não sabe fazer — quem decide é vocês."],
  [/verba mensal dispon[íi]vel para os an[úu]ncios|vai direto para o google/i, "R$ 30 mil para 60 dias, ou seja R$ 15 mil por mês de anúncios."],
  [/@ do seu instagram|hor[áa]rio e dias|bairros ou cidades/i, "Nosso Instagram é @farol27cafe. Abrimos todo dia das 6h30 às 20h. Atendemos a Grande São Paulo num raio de 3 km de cada loja, e sim, atendemos por WhatsApp — mas o número oficial ainda não está confirmado internamente."],
  [/onde est[ãa]o os clientes|cidade|raio/i, "Grande São Paulo, 3 km em volta de cada uma das 3 lojas."],
  [/identidade visual|j[áa] tem logo|logo\/identidade/i, "Temos um logo em PNG, mas não temos vetor confirmado nem manual de marca."],
  [/concorrentes ou refer[êe]ncias|inspira[çc][ãa]o/i, "Gostamos do jeito da Padaria Santa Tereza e do Coffee Lab."],
  [/faixa de or[çc]amento|or[çc]amento mensal voc[êe] tem em mente|investimento mensal para a gest/i, "Nosso orçamento é de R$ 8000 por mês para a gestão."],
  [/para quando voc[êe] quer come[çc]ar|prazo/i, "Queremos começar agora — o lançamento do Clube é em 8 semanas."],
  [/e-?mail|contato/i, "Meu e-mail é ana.farol@cliente-falso.invalid — sou a Ana, dona da Farol 27."],
];
const usados = new Set();
function responder(pergunta) {
  for (let i = 0; i < FATOS.length; i++) {
    if (usados.has(i)) continue;
    if (FATOS[i][0].test(pergunta)) { usados.add(i); return FATOS[i][1]; }
  }
  // Nada casou: em vez de travar a conversa com "não entendi", a Ana simulada
  // entrega o PRÓXIMO fato ainda não dito. O objetivo do case é levar todos os
  // fatos declarados ao escopo, não medir a compreensão de regex.
  for (let i = 0; i < FATOS.length; i++) {
    if (!usados.has(i)) { usados.add(i); return FATOS[i][1]; }
  }
  return "Acho que já te contei tudo. Pode fechar o briefing com isso?";
}

const messages = [];
let scope = {};
let atual = `Oi! Somos a Farol 27 Padaria & Café ${MARCA}, uma padaria e café na Grande São Paulo — 3 lojas e uma cozinha central, 6 anos de casa. Sou a Ana Farol ${MARCA}, dona.`;
const transcricao = [];

for (let turno = 1; turno <= 24; turno++) {
  const res = await fetch(`${BASE}/api/sdr/chat`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId: SESSION, messages, currentMessage: atual, scope }),
  });
  const j = await res.json().catch(() => null);
  transcricao.push({ turno, cliente: atual, http: res.status, casa: j?.reply ?? null, scope: j?.scope ?? null });
  console.log(`\n[${turno}] CLIENTE: ${atual}`);
  if (!j?.ok) { console.log(`[${turno}] ⛔ HTTP ${res.status} ${JSON.stringify(j)}`); break; }
  console.log(`[${turno}] CASA: ${j.reply}`);
  messages.push({ role: "user", text: atual }, { role: "assistant", text: j.reply });
  scope = { ...scope, ...(j.scope || {}) };
  atual = responder(j.reply);
}
writeFileSync(new URL("./transcricao.json", import.meta.url), JSON.stringify({ sessionId: SESSION, transcricao, scopeFinal: scope }, null, 2));
console.log("\n══ SCOPE FINAL ══\n" + JSON.stringify(scope, null, 2));
console.log("sessionId=" + SESSION);
