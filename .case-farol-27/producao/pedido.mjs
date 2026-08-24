import { readFileSync, writeFileSync } from "node:fs";
const BASE = "https://www.diolidigital.com.br";
const t = JSON.parse(readFileSync(new URL("./transcricao.json", import.meta.url), "utf8"));
const scope = t.scopeFinal;
const M = "[TESTE]";
const conversa = t.transcricao.filter(x => x.casa).map(x => `CLIENTE: ${x.cliente}\nDIOLI: ${x.casa}`).join("\n\n");

const body = {
  businessName: `Farol 27 — Padaria & Café ${M}`,
  segment: "Alimentação · padaria e café · varejo e delivery",
  source: "case-farol-27-teste",
  services: ["branding", "social-media", "trafego-pago", "design", "estrategia"],
  objectives: scope.objectives ?? [],
  contato: { nome: `Ana Farol ${M}`, email: "ana.farol@cliente-falso.invalid", whatsapp: "" },
  rawContext:
`⚠️⚠️ CLIENTE FICTÍCIO DE TESTE ${M} — NÃO É CLIENTE REAL. NÃO FATURAR, NÃO CONTATAR. ⚠️⚠️
Case sintético Farol 27, autorizado pelo CEO em 24/08/2026 para auditar a esteira em produção.
Contato em domínio .invalid (RFC 2606) — não existe e nunca existirá. Sem telefone: o número
oficial de WhatsApp NÃO foi confirmado pelo cliente (evento obrigatório 1 do case).

── PERFIL DECLARADO PELO CLIENTE, NÃO AUDITADO ──
Padaria & café na Grande São Paulo, 3 lojas + cozinha central, 6 anos.
Faturamento R$ 420 mil/mês; ticket médio R$ 38; 65% presencial / 25% delivery / 10% encomendas
e corporativo. Instagram @farol27cafe com 18,4 mil seguidores, engajamento estimado <1%.
TikTok 780 seguidores. WhatsApp ~6 mil contatos SEM comprovação de consentimento.
Site antigo sem tracking confiável; informações divergentes nas páginas das lojas; sem dashboard.
TODOS ESSES NÚMEROS SÃO DECLARADOS PELO CLIENTE E NÃO FORAM AUDITADOS.

── PROJETO ──
Reposicionamento de marca + lançamento do Clube Farol 27 (assinatura de café da manhã,
R$ 149/mês). 8 semanas. Verba de mídia R$ 30 mil / 60 dias, divisão Meta+WhatsApp vs TikTok
NÃO definida pelo cliente — quem decide e justifica é o tráfego.

── TEM ──
Logo em PNG, fotos de loja e produto, cardápios antigos, embalagens, prints de redes.

── NÃO TEM (LACUNAS ABERTAS) ──
Brand book; vetor confirmado do logo; regras de aplicação; paleta documentada; tom de voz;
moodboard; personas; biblioteca de assets; histórico de versões; tracking validado;
comprovação de consentimento dos ~6 mil contatos de WhatsApp; número oficial de WhatsApp.

── PESSOAS ──
Ana ${M} — dona, decisora final, pouca familiaridade com tecnologia (Portal em Modo Básico).
Lucas ${M} — coordenador de marketing (Portal em Modo Avançado).

── A CONVERSA COMPLETA DO SDR (rodada AO VIVO em produção) ──
${conversa}`,
  briefingJson: { scope: { ...scope, prospectName: `Ana Farol ${M}`, prospectEmail: "ana.farol@cliente-falso.invalid" }, carimbo: `${M} CASE SINTÉTICO — cliente fictício` },
  sdrHandoffJson: { sessionId: t.sessionId, turnos: t.transcricao.length, carimbo: `${M} CASE SINTÉTICO` },
  attachmentsJson: [],
};

const res = await fetch(`${BASE}/api/brain/client-requests`, {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});
const txt = await res.text();
console.log("HTTP", res.status);
console.log(txt.slice(0, 3000));
writeFileSync(new URL("./pedido.json", import.meta.url), txt);
