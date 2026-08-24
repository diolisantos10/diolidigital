// case-farol-27.mts — o case sintético FAROL 27, rodado NA MÁQUINA.
//
// Regra do case: onde a casa tem caminho de produção, é a casa que produz.
// Onde não tem, este script NÃO finge — ele registra "sem caminho de produção"
// e diz o que faltou. A lista do que faltou é o produto deste teste.
//
//   npx tsx scripts/case-farol-27.mts            # rodada offline, custo R$ 0
//   npx tsx scripts/case-farol-27.mts --limpar   # apaga o ambiente
//
// Banco próprio, descartável, em `.case-farol-27/farol.db`. Nunca produção.

import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

process.env.CLIENTE_FALSO = "1"; // trava de saída: nenhum e-mail/WhatsApp sai

const RAIZ = resolve(import.meta.dirname, "..");
const PASTA = resolve(RAIZ, ".case-farol-27");
const BANCO = resolve(PASTA, "farol.db");

if (process.argv.includes("--limpar")) {
  rmSync(PASTA, { recursive: true, force: true });
  console.log("🧹 ambiente do case apagado.");
  process.exit(0);
}

const herdado = process.env.DATABASE_URL;
if (herdado && !herdado.includes(".case-farol-27")) {
  console.error(`⛔ DATABASE_URL aponta para fora do ambiente do case (${herdado}).`);
  process.exit(2);
}
process.env.DATABASE_URL = `file:${BANCO}`;
mkdirSync(PASTA, { recursive: true });
if (!existsSync(BANCO)) {
  console.log("📦 criando o banco descartável do case…");
  execFileSync("npx", ["prisma", "db", "push", "--accept-data-loss"], {
    cwd: RAIZ, stdio: "inherit", env: { ...process.env, DATABASE_URL: `file:${BANCO}` },
  });
}

// ─── O DIÁRIO DE BORDO ──────────────────────────────────────────────────────
type Veredito = "maquina" | "a-mao" | "nao-tratado";
type Linha = { o: string; veredito: Veredito; prova: string };
const diario: Linha[] = [];
const reg = (o: string, veredito: Veredito, prova: string) => {
  diario.push({ o, veredito, prova });
  const icone = veredito === "maquina" ? "🤖" : veredito === "a-mao" ? "✋" : "⛔";
  console.log(`${icone} ${o} — ${prova}`);
};

const { rodarPercurso } = await import("../lib/agency/cliente-falso/percurso.ts");
const { conferir } = await import("../lib/agency/cliente-falso/verificacoes.ts");
const { placarEmTexto } = await import("../lib/agency/cliente-falso/placar.ts");
const { ROTEIRO_FAROL, DECLARADO_NAO_AUDITADO, LACUNAS_DO_CLIENTE, NAO_AUDITADO } =
  await import("../lib/agency/case-farol-27/roteiro-farol.ts");
const { prisma } = await import("../lib/db/client.ts");

console.log("\n════ FAROL 27 — percurso na máquina ════\n");
const { percurso, tropecos } = await rodarPercurso({ roteiro: ROTEIRO_FAROL, fio: "case-farol-27" });
const achados = conferir(percurso);

const pedidoId = percurso.pedido?.id ?? null;
const projetoId = percurso.esteira.projetoId ?? null;
reg("SDR / Atendimento — conversa e captura de escopo", "maquina",
  `${percurso.turnos.length} turnos, pedido ${pedidoId ?? "NÃO CRIADO"}`);
reg("Escopo automático + proposta", percurso.pedido ? "maquina" : "nao-tratado",
  `estimativa R$ ${percurso.estimativaFinal.totalMin}–${percurso.estimativaFinal.totalMax}, confiança "${percurso.estimativaFinal.confidence}"`);
reg("Project Management — projeto e tarefas", projetoId ? "maquina" : "nao-tratado",
  `projeto ${projetoId ?? "—"}, ${percurso.esteira.tarefas} tarefas`);
reg("Execução / produção de peças", percurso.esteira.entregas > 0 ? "maquina" : "nao-tratado",
  `status "${percurso.esteira.execucaoStatus}", ${percurso.esteira.entregas} entregas, pendências: ${percurso.esteira.execucaoPendencias ?? "—"}`);


// ════════════════════════════════════════════════════════════════════════════
// PARTE 2 — A FICHA, AS ENTREGAS E OS 8 EVENTOS
// ════════════════════════════════════════════════════════════════════════════
if (!pedidoId || !projetoId) { console.error("⛔ sem pedido/projeto — o resto do case não tem onde acontecer."); process.exit(1); }

const req = await prisma.clientRequestDb.findUnique({ where: { id: pedidoId }, select: { clientId: true, workspaceId: true } });
const clienteId = req!.clientId!;
const wsId = req!.workspaceId;
console.log(`\n── cliente ${clienteId} · workspace ${wsId} ──\n`);

const CARIMBO = "⚠️ CASE SINTÉTICO — cliente fictício, nada real foi tocado.";
const SEM_IA = "⚠️ Produzido À MÃO no case: a casa não tinha chave de IA conectada e a esteira devolveu \"Nenhuma IA conectada\". Sem chave, este texto NÃO teria existido.";
const ND = "declarado pelo cliente, NÃO AUDITADO";

// ─── A FICHA DO CLIENTE ─────────────────────────────────────────────────────
// Máquina: a ficha NASCEU sozinha do briefing (`resolverOuCriarCliente`).
// À mão: os campos que a esteira não coleta (site, segmento fino).
await prisma.client.update({
  where: { id: clienteId },
  data: {
    industry: "Alimentação · padaria e café · varejo e delivery",
    website: "https://farol27.example.invalid",
    // phone fica NULO de propósito: o número oficial de WhatsApp NÃO foi
    // confirmado pelo cliente (EVENTO 1). Inventar número é o defeito.
  },
});
reg("Ficha do cliente criada a partir do briefing", "maquina", `Client ${clienteId} nasceu de resolverOuCriarCliente`);
reg("Campos de ficha que a esteira não coleta (site, segmento fino)", "a-mao", "prisma.client.update — não há tela nem etapa que colha isso do cliente");

// ─── BRAND HUB / BRAND BOOK V1 (com lacunas marcadas) ───────────────────────
const lacunas = LACUNAS_DO_CLIENTE.map((l) => `- ${l} — LACUNA ABERTA`).join("\n");
await prisma.brandBrain.upsert({
  where: { clientId: clienteId },
  create: {
    clientId: clienteId,
    brandName: "Farol 27 — Padaria & Café",
    tagline: "O primeiro sinal do dia.",
    primaryColor: "#1F3A5F", secondaryColor: "#E8A33D",
    typography: "LACUNA — nenhuma fonte documentada pelo cliente",
    tone: "Acolhedor, direto, de bairro. Sem gíria de marketing. Nunca promete preço nem prazo que a operação não confirmou.",
    values: JSON.stringify(["vizinhança", "pão feito no dia", "constância", "honestidade de preço"]),
    targetAudience: `Moradores e trabalhadores em 3 km de cada loja (25–45); empresas da região (café da manhã corporativo). Base: ${ND}.`,
    positioning: "A padaria de bairro que virou ponto de encontro da manhã — e agora entrega essa manhã por assinatura (Clube Farol 27, R$ 149/mês).",
    purposeAndPromise: "Começar o dia de quem passa por aqui. Promessa: pão do dia, sempre, no mesmo horário.",
    promiseLimits: `NÃO prometer: entrega em X minutos, desconto permanente, nem qualquer número de faturamento — todos os números do cliente são ${ND}.`,
  },
  update: {},
});
reg("Brand Hub / BrandBrain preenchido", "a-mao",
  `BrandBrain do cliente ${clienteId} — a esteira TEM o modelo e a tela, mas quem escreve o conteúdo é a IA, e não havia chave`);

// ─── AS ENTREGAS (Deliverables) ─────────────────────────────────────────────
type Entrega = { nome: string; tipo: string; corpo: string; dono: string };
const entregas: Entrega[] = [
  { nome: "Diagnóstico e briefing consolidado", tipo: "strategy", dono: "strategy-posicionamento", corpo:
`# Diagnóstico — Farol 27
${CARIMBO}

## Números do cliente (${ND})
- Faturamento: R$ ${DECLARADO_NAO_AUDITADO.faturamentoMensalBRL.toLocaleString("pt-BR")}/mês
- Ticket médio: R$ ${DECLARADO_NAO_AUDITADO.ticketMedioBRL}
- Mix: ${DECLARADO_NAO_AUDITADO.mixPresencialPct}% presencial · ${DECLARADO_NAO_AUDITADO.mixDeliveryPct}% delivery · ${DECLARADO_NAO_AUDITADO.mixEncomendasPct}% encomendas/corporativo
- Instagram: ${DECLARADO_NAO_AUDITADO.instagramSeguidores.toLocaleString("pt-BR")} seguidores, engajamento ${DECLARADO_NAO_AUDITADO.instagramEngajamentoPct}
- TikTok: ${DECLARADO_NAO_AUDITADO.tiktokSeguidores} seguidores
- WhatsApp: ~${DECLARADO_NAO_AUDITADO.whatsappContatos.toLocaleString("pt-BR")} contatos

**Nenhum destes números foi auditado.** Site antigo sem tracking confiável, páginas de loja divergentes, nenhum dashboard consolidado. Toda leitura de resultado deste ciclo começa com esta ressalva.

## Lacunas do cliente
${lacunas}` },

  { nome: "Escopo e proposta comercial (fictícia)", tipo: "proposal", dono: "financeiro-plano", corpo:
`# Proposta — Farol 27 · reposicionamento + lançamento do Clube
${CARIMBO}

**Honorários** (fee de agência): R$ 8.000/mês × 2 meses = R$ 16.000.
**Verba de mídia** (do cliente, paga direto à plataforma, NÃO é receita da agência): R$ 30.000 / 60 dias.

> Honorário e mídia ficam em linhas separadas de propósito: misturá-los é como
> a agência se vende como maior do que é e como o cliente perde o controle do
> próprio gasto.

⚠️ Divergência medida no case: a esteira calculou sozinha **R$ 500–1.200/mês**
para este escopo (confiança "high") contra a verba declarada de R$ 8.000. A
calculadora não cobre reposicionamento de marca nem lançamento de produto —
ela precifica volume de post. Ver "Falhas encontradas".` },

  { nome: "Posicionamento, públicos e tom de voz", tipo: "strategy", dono: "strategy-posicionamento", corpo:
`# Posicionamento — Farol 27
${CARIMBO} ${SEM_IA}

**Posicionamento:** a padaria de bairro que virou o ponto de encontro da manhã.
**Públicos:** (1) vizinhança 25–45 em 3 km; (2) trabalhador de passagem 6h30–9h; (3) empresa da região (café da manhã corporativo).
**Tom de voz:** acolhedor, direto, de bairro. Nunca gíria de marketing, nunca número não auditado.
**Não dizemos:** "o melhor pão de SP", prazo de entrega, desconto permanente.` },

  { nome: "Brand Book V1 (com lacunas)", tipo: "branding", dono: "design-criativo-social", corpo:
`# Brand Book V1 — Farol 27
${CARIMBO} ${SEM_IA}

## O que existe
Logo em PNG · fotos de loja e produto · cardápios antigos · embalagens · prints de redes.

## O que NÃO existe — lacunas abertas, não preenchidas por suposição
${lacunas}

## Provisório desta V1 (premissa conservadora, registrada)
Paleta de trabalho #1F3A5F / #E8A33D derivada por leitura das fotos de embalagem.
**Não é paleta oficial** — vira oficial só quando o cliente confirmar o vetor.` },

  { nome: "Campanha de lançamento — Clube Farol 27", tipo: "campaign", dono: "strategy-concorrencia", corpo:
`# Clube Farol 27 — lançamento
${CARIMBO} ${SEM_IA}

Oferta: assinatura de café da manhã, R$ 149/mês. Duração: 8 semanas.
Fases: (1) provocação 2 sem · (2) abertura de lista 2 sem · (3) venda 3 sem · (4) prova social 1 sem.
CTA: **direct do Instagram** — e NÃO WhatsApp, porque o número oficial não foi confirmado (evento 1).` },

  { nome: "Calendário editorial 30 dias", tipo: "social", dono: "social-copy", corpo:
`# Calendário 30 dias — 12 feed · 12 stories · 8 roteiros curtos
${CARIMBO} ${SEM_IA}
As 32 peças estão no calendário do portal, uma linha por peça.` },

  { nome: "Landing page do Clube (responsiva, com formulário)", tipo: "web", dono: "design-criativo-trafego", corpo:
`# Landing — Clube Farol 27
${CARIMBO} ${SEM_IA}

Blocos: herói · o que vem na caixa · preço R$ 149/mês · perguntas · formulário (nome, e-mail, loja preferida) · CTA.
**Formulário e CTA são SIMULADOS.** Nenhum endpoint real, nenhum dado coletado.
CTA de WhatsApp: **provisório para o direct** — pendência do número oficial aberta.` },

  { nome: "Plano de mídia — Meta+WhatsApp e TikTok, consolidado", tipo: "traffic", dono: "traffic-segmentacao", corpo:
`# Plano de mídia — R$ 30.000 / 60 dias
${CARIMBO} ${SEM_IA}

O cliente NÃO definiu a divisão. Decidida pelas células, com justificativa:

| Célula | Verba | % | Por quê |
|---|---|---|---|
| Meta + WhatsApp | R$ 21.000 | 70% | é onde a base declarada existe (18,4 mil seguidores, ${ND}) e onde a conversão de assinatura pode ser medida |
| TikTok | R$ 9.000 | 30% | 780 seguidores (${ND}) — verba de aprendizado, não de escala; teto diário baixo até haver leitura |

Teto diário: Meta R$ 350/dia · TikTok R$ 150/dia.
⚠️ Nenhuma conta conectada, nenhuma campanha criada, R$ 0,00 movimentado.` },

  { nome: "Plano de mensuração, dicionário de métricas e funil", tipo: "analytics", dono: "a5", corpo:
`# Mensuração — Farol 27
${CARIMBO} ${SEM_IA}

Funil: impressão → clique → visita à landing → lead do formulário → assinatura paga.
Dicionário: "lead" = envio do formulário com e-mail válido; "assinatura" = cobrança confirmada — hoje **não mensurável**, não há integração de pagamento.
⚠️ Linha de base: **não existe**. Site antigo sem tracking confiável (${ND}). O ciclo 1 não tem "antes" para comparar, e nenhum número deste ciclo pode ser apresentado como evolução.` },

  { nome: "Relatório do ciclo e próximo ciclo", tipo: "report", dono: "analytics-otimizacao", corpo:
`# Relatório — ciclo 1 (fictício)
${CARIMBO} ${SEM_IA}

Não há resultado de mídia: **nada foi veiculado**. O que este ciclo produziu é
material e método, não desempenho.
Evento de tracking perdido (evento 7) → **o dado do ciclo é declaradamente
incompleto e não deve ser lido como confiável.**
Próximo ciclo: (1) confirmar vetor e número de WhatsApp; (2) instalar e VALIDAR
tracking antes de gastar; (3) consentimento dos 6 mil contatos antes de qualquer
disparo — sem isso, disparo é ilegal, não é tática.` },
];

const idsEntrega: Record<string, string> = {};
for (const e of entregas) {
  const d = await prisma.deliverable.create({
    data: { projectId: projetoId, name: e.nome, type: e.tipo, status: "review", visibility: "compartilhado", content: e.corpo, ownerAgentId: e.dono },
  });
  idsEntrega[e.nome] = d.id;
}
reg("Entregas gravadas no projeto", "a-mao", `${entregas.length} Deliverables criados à mão — a esteira falhou por falta de chave de IA. ids: ${Object.values(idsEntrega).join(", ")}`);

// ─── O CALENDÁRIO: 12 feed + 12 stories + 8 roteiros ────────────────────────
const pilares = ["pão do dia", "clube", "bastidor da cozinha central", "gente do bairro"];
const posts: { id: string; format: string; caption: string }[] = [];
async function criarPeca(format: string, i: number, caption: string, networks: string[], extra: Record<string, unknown> = {}) {
  const p = await prisma.socialPost.create({
    data: {
      workspaceId: wsId, clientId: clienteId, clientRequestId: pedidoId!,
      caption, networks: JSON.stringify(networks), format,
      pillar: pilares[i % pilares.length], visibility: "compartilhado", status: "draft",
      ...extra,
    },
  });
  posts.push({ id: p.id, format, caption });
  return p.id;
}
for (let i = 1; i <= 12; i++) await criarPeca("feed", i, `[FEED ${i}/12] Farol 27 — ${pilares[i % pilares.length]}. Clube Farol 27: seu café da manhã por R$ 149/mês. Chama no direct. ${SEM_IA}`, ["instagram"]);
for (let i = 1; i <= 12; i++) await criarPeca("story", i, `[STORY ${i}/12] Farol 27 — ${pilares[i % pilares.length]}. Arrasta pra cima? Não: chama no direct (WhatsApp pendente). ${SEM_IA}`, ["instagram"]);
for (let i = 1; i <= 8; i++) await criarPeca("video", i, `[ROTEIRO CURTO ${i}/8] TikTok — ${pilares[i % pilares.length]}. Gancho 0-3s, corpo 3-15s, CTA 15-20s. ${SEM_IA}`, ["tiktok"]);
reg("Calendário editorial de 30 dias (12 feed + 12 stories + 8 roteiros)", "a-mao",
  `${posts.length} SocialPost criados à mão. A esteira TEM o caminho (run-execution → extrairPecas), mas ele exige IA e não havia chave.`);
reg("Key visual e artes das peças", "nao-tratado",
  "geração de imagem exige chave de IA (lib/ai/generate.ts → \"Nenhuma IA conectada\"); nenhuma arte foi produzida — mediaUrl vazio em todas as 32 peças");

// ════ OS 8 EVENTOS ══════════════════════════════════════════════════════════
console.log("\n════ os 8 eventos ════\n");
const { createApprovalRequest, updateApprovalStatus, addApprovalComment } = await import("../lib/agency/persistence/approval-service.ts");
const { DECISAO_PARA_STATUS, DECISOES_QUE_EXIGEM_COMENTARIO, DECISAO_PARA_ESTADO_CANONICO } = await import("../lib/agency/portal/decisoes-do-portal.ts");
const eventos: { n: number; titulo: string; veredito: Veredito; prova: string }[] = [];
const ev = (n: number, titulo: string, veredito: Veredito, prova: string) => {
  eventos.push({ n, titulo, veredito, prova });
  const i = veredito === "maquina" ? "🤖" : veredito === "a-mao" ? "✋" : "⛔";
  console.log(`${i} EVENTO ${n} — ${titulo}: ${prova}`);
};

// EVENTO 1 — WhatsApp ausente
const mr = await prisma.materialRequest.create({
  data: { projectId: projetoId, type: "credencial", description:
    "Número OFICIAL de WhatsApp para o CTA das peças e da landing. O cliente disse que atende por WhatsApp mas NÃO confirmou o número. Enquanto não vier, o CTA fica no direct do Instagram. NADA foi inventado.",
    status: "pending", requestedByLabel: "Design/Produção" },
});
const telefoneDaFicha = (await prisma.client.findUnique({ where: { id: clienteId }, select: { phone: true } }))!.phone;
const pecasSemNumero = posts.filter((p) => /\d{8,}/.test(p.caption)).length;
ev(1, "WhatsApp ausente", "maquina",
  `a casa NÃO tem como inventar número: \`semPii\` (lib/dioli-brain/client-snapshot.ts:84) apaga sequências de 8+ dígitos antes de o texto chegar ao modelo, e o question-engine não pede o número. Confirmado no banco: ${pecasSemNumero} peça(s) com número em ${posts.length}. ⚠️ Ressalva medida: Client.phone ficou "${telefoneDaFicha}" — é o WhatsApp DE CONTATO que a Ana deu na porta, gravado pela ficha; NÃO é o número oficial de atendimento para CTA, e a casa não distingue os dois. Isso é uma falha: um dia alguém vai publicar o telefone pessoal da dona como CTA da loja. Pendência aberta pela MÁQUINA: MaterialRequest ${mr.id}. CTA provisório = direct.`);

// EVENTO 2 — conflito de logo
const bu1 = await prisma.brandUpdate.create({ data: { clientId: clienteId, field: "logo", suggestedValue: "logo-farol27-v1.png (fundo branco, tipografia serifada)", source: "cliente:Ana", status: "pending", note: "versão 1 — enviada pela Ana", fileName: "logo-farol27-v1.png" } }).catch((e) => ({ id: `ERRO: ${String(e).slice(0, 120)}` }));
const bu2 = await prisma.brandUpdate.create({ data: { clientId: clienteId, field: "logo", suggestedValue: "logo-farol27-v2.png (fundo escuro, tipografia geométrica)", source: "cliente:Lucas", status: "pending", note: "versão 2 — DIVERGE da v1; consolidação SUSPENSA até o cliente decidir", fileName: "logo-farol27-v2.png" } }).catch((e) => ({ id: `ERRO: ${String(e).slice(0, 120)}` }));
const bloqueioLogo = await prisma.materialRequest.create({
  data: { projectId: projetoId, type: "marca", description:
    "CONFLITO DE LOGO — chegaram DUAS versões divergentes (v1 Ana, v2 Lucas). A consolidação da marca está SUSPENSA até o cliente decidir qual é a oficial. As duas ficam preservadas no histórico; nenhuma foi descartada.",
    status: "pending", requestedByLabel: "Branding" },
});
await prisma.activityEvent.create({ data: { workspaceId: wsId, clientId: clienteId, type: "conflito_de_marca", message: `Branding SUSPENDEU a consolidação: duas versões de logo divergentes (${bu1.id} e ${bu2.id}). Decisão simulada do cliente: v1 é a oficial; v2 PRESERVADA no histórico, não apagada.` } });
ev(2, "Conflito de logo", "a-mao",
  `os registros existem (BrandUpdate ${bu1.id} / ${bu2.id}, MaterialRequest ${bloqueioLogo.id}), mas NÃO há detector de divergência nem trava que suspenda a consolidação sozinha: quem comparou as duas versões e suspendeu fui eu. Falta na casa: um comparador de ativos de marca e um estado "consolidação suspensa".`);

// EVENTO 8 — handoff sem aceite (roda antes porque é o que trava o Design)
const { criarHandoff, aceitarHandoff } = await import("../lib/agency/handoff-v2/handoff.ts");
const { armazemDeHandoffsNoBanco } = await import("../lib/agency/handoff-v2/armazem-prisma.ts");
const armazem = armazemDeHandoffsNoBanco(prisma as never);
const h = await criarHandoff({
  deDepartamento: "branding", paraDepartamento: "design",
  responsavelEntrega: "branding:especialista-identidade",
  entrada: "Brand Book V1 com lacunas marcadas + paleta provisória",
  saida: "Key visual do Clube Farol 27 e grid das 12 peças de feed",
  versaoArtefato: "brandbook-v1",
  criterios: "usar só a paleta provisória; nenhum número não auditado na arte; CTA no direct (WhatsApp pendente)",
  bloqueios: ["missing_asset"],
  correlationId: `farol27-${projetoId}`,
}, armazem, () => new Date());
const linhaH = h.ok ? await armazem.buscar(h.id) : null;
ev(8, "Handoff sem aceite", h.ok ? "maquina" : "nao-tratado",
  h.ok ? `HandoffV2 ${h.id} nasceu em "${linhaH?.status}" — a MÁQUINA segura o bastão na fila da Branding até o Design aceitar. Nenhum aceite foi dado: a tarefa continua em aguardando_recebimento, exatamente como o evento pede.`
       : `criarHandoff recusou: ${(h as { motivo: string }).motivo}`);
const aceiteIndevido = h.ok ? await aceitarHandoff(h.id, "social:pauteiro", ["social-media"], armazem, () => new Date()) : null;
if (aceiteIndevido) console.log(`   ↳ trava conferida: quem não escreve no destino não aceita — ${JSON.stringify(aceiteIndevido)}`);

// EVENTO 3 — peça de TikTok desalinhada, Lucas recusa/refaz
const { reprovarPeca, historicoDaPeca } = await import("../lib/agency/esteira/reprovacao.ts");
const pecaRuim = posts.find((p) => p.format === "video")!;
await prisma.socialPost.update({ where: { id: pecaRuim.id }, data: { caption: "[ROTEIRO CURTO 1/8] TikTok — CHEGA DE PADARIA SEM VERGONHA! Só nós fazemos pão de verdade nessa cidade. Corre antes que acabe, otário. (visual: neon roxo, tipografia agressiva)" } });
const rep = await reprovarPeca({ postId: pecaRuim.id, motivo: "Linguagem agressiva e ofensiva, e visual neon incompatível com a marca de bairro. Não usar 'otário' nem atacar concorrente. Refazer no tom acolhedor do brand book.", quemReprovou: "Lucas (coordenador de marketing do cliente)" });
const hist = await historicoDaPeca(pecaRuim.id);
ev(3, "Peça desalinhada — Recusar/refazer", rep.ok ? "maquina" : "nao-tratado",
  rep.ok ? `reprovarPeca() aceitou: peça ${pecaRuim.id}, volta ${rep.volta}, escalado=${rep.escalado}, proibições novas gravadas=${JSON.stringify(rep.proibicoesNovas ?? [])}. A MÁQUINA exigiu motivo (mín. ${12} chars) e autor, gravou ActivityEvent e devolveu a peça ao responsável. Histórico: ${hist.length} registro(s).`
         : `reprovarPeca recusou: ${rep.motivo}`);

// EVENTO 4 — Ana aprova o conceito de Meta Ads mas pede troca de UM título
const apMeta = await createApprovalRequest({
  clientRequestId: pedidoId, clientId: clienteId, department: "paid-traffic",
  requestedBy: "internal", clientVisible: true,
} as never).catch((e) => ({ id: `ERRO: ${String(e).slice(0, 140)}` }));
const antesDoAjuste = await prisma.deliverable.findUnique({ where: { id: idsEntrega["Plano de mídia — Meta+WhatsApp e TikTok, consolidado"] }, select: { content: true } });
const { refazerPorPedidoDoCliente } = await import("../lib/agency/esteira/refacao.ts");
const refacao = await refazerPorPedidoDoCliente({
  clientRequestId: pedidoId, clientId: clienteId, department: "paid-traffic",
  comentario: "Aprovo o conceito. Só troca o título do anúncio 2: em vez de 'O melhor pão de São Paulo', usar 'O pão do dia, todo dia'. O resto fica como está.",
});
const depoisDoAjuste = await prisma.deliverable.findUnique({ where: { id: idsEntrega["Plano de mídia — Meta+WhatsApp e TikTok, consolidado"] }, select: { content: true } });
ev(4, "Ajuste simples — Pedir ajustes", "maquina",
  `refazerPorPedidoDoCliente() rodou: refeitas=${JSON.stringify(refacao.refeitas)}, versõesNovas=${JSON.stringify(refacao.versoesNovas)}, escalado=${refacao.escalado}, motivo=${refacao.motivo ?? "—"}. A proibição do termo virou regra do cliente pela MÁQUINA. O resto do plano ficou intacto (conteúdo mudou? ${antesDoAjuste?.content !== depoisDoAjuste?.content}). ⚠️ A refação em si NÃO pôde reescrever o texto: exige IA e não há chave — a máquina escalou em vez de fingir.`);

// EVENTO 5 — cancelamento de UMA entrega corporativa
const corporativa = await prisma.deliverable.create({
  data: { projectId: projetoId, name: "Kit café da manhã corporativo — peça de venda B2B", type: "sales", status: "review", visibility: "compartilhado", content: `${CARIMBO}\nPeça B2B para empresas da região.`, ownerAgentId: "case-farol-27" },
});
const apCorp = await createApprovalRequest({ clientRequestId: pedidoId, clientId: clienteId, department: "design", requestedBy: "internal", clientVisible: true } as never).catch((e) => ({ id: `ERRO: ${String(e)}` }));
let cancelou: unknown = null;
if (!String(apCorp.id).startsWith("ERRO")) {
  const exigeComentario = DECISOES_QUE_EXIGEM_COMENTARIO.has("cancel");
  await addApprovalComment({ approvalRequestId: apCorp.id, authorName: "Ana (proprietária)", authorRole: "client", kind: "comment", body: "Vamos cancelar só a peça corporativa: a cozinha central não dá conta do B2B agora. O resto do pacote segue.", isClientVisible: true } as never).catch(() => null);
  cancelou = await updateApprovalStatus(apCorp.id, DECISAO_PARA_STATUS["cancel"], "Ana (proprietária)", "cancelada por decisão do cliente: cozinha central sem capacidade para B2B neste ciclo").catch((e) => String(e));
  await prisma.deliverable.update({ where: { id: corporativa.id }, data: { status: "cancelled", estadoCanonico: DECISAO_PARA_ESTADO_CANONICO["cancel"], clientFeedback: "cancelada por decisão do cliente — a versão fica preservada no histórico" } });
  console.log(`   ↳ cancel exige comentário pela regra da casa? ${exigeComentario}`);
}
const sobreviveram = await prisma.deliverable.count({ where: { projectId: projetoId, status: { not: "cancelled" } } });
ev(5, "Cancelamento de UMA entrega", "maquina",
  `a casa TEM a decisão canônica "cancel" (DECISAO_PARA_STATUS/DECISOES_QUE_EXIGEM_COMENTARIO) e ela exige justificativa. Aprovação ${apCorp.id} → cancelled; Deliverable ${corporativa.id} → cancelled com feedback. Nada foi apagado: ${sobreviveram} entregas seguem vivas no mesmo projeto.`);

// EVENTO 6 — risco de verba (teto do TikTok)
const { conferirOrcamento } = await import("../lib/integrations/meta/ads.ts");
const tentativa = conferirOrcamento({ orcamentoDiarioBRL: 900, tetoAprovadoBRL: 150 });
await prisma.activityEvent.create({ data: { workspaceId: wsId, clientId: clienteId, type: "verba_bloqueada", message: `TikTok: tentativa de R$ 900/dia contra teto aprovado de R$ 150/dia. BLOQUEADO antes de qualquer gasto. Escalado ao gerente de tráfego. Motivo do guardião: ${tentativa.erro}` } });
ev(6, "Risco de verba — teto estourado", "a-mao",
  `o guardião existe e FUNCIONA — conferirOrcamento({900, teto 150}) devolveu ok=${tentativa.ok}, erro="${tentativa.erro}" ANTES de qualquer chamada de rede. MAS ele é da Meta (lib/integrations/meta/ads.ts): **não existe módulo de TikTok** em lib/integrations (só google e meta). Para o TikTok o teto foi conferido reusando o guardião da Meta, à mão. Falta: guardião de verba do TikTok.`);

// EVENTO 7 — falha de tracking
const perdido = await prisma.activityEvent.create({ data: { workspaceId: wsId, clientId: clienteId, type: "tracking_falhou", message: "Evento 'lead_formulario_clube' NÃO foi registrado entre 12h e 18h — GTM simulado sem container publicado. Tentativa de recuperação: reprocessar pelo log do servidor → IMPOSSÍVEL, não há log de servidor da landing simulada. O número de leads do dia fica DECLARADAMENTE INCOMPLETO e não pode ser apresentado como confiável." } });
await prisma.deliverable.update({ where: { id: idsEntrega["Plano de mensuração, dicionário de métricas e funil"] }, data: { content: (await prisma.deliverable.findUnique({ where: { id: idsEntrega["Plano de mensuração, dicionário de métricas e funil"] }, select: { content: true } }))!.content + `\n\n## ⚠️ FALHA DE TRACKING REGISTRADA\nEvento \`lead_formulario_clube\` perdido (12h–18h). Recuperação tentada e IMPOSSÍVEL. **O dado deste ciclo é incompleto e não deve ser lido como confiável.**` } });
ev(7, "Falha de tracking", "a-mao",
  `NÃO existe monitor de integridade de evento nesta casa: nada compara eventos esperados × recebidos, nada alerta. Procurado em lib/agency/medicao (só leitura-da-conta.ts, que lê a Meta) e em lib/integrations (sem GA4/GTM). Detectei, alertei (ActivityEvent ${perdido.id}), tentei recuperar e marquei o dado como não confiável — tudo à mão. Falta: dicionário de eventos esperados + reconciliação + alerta.`);

// ─── OS 12 DEPARTAMENTOS ────────────────────────────────────────────────────
console.log("\n════ os 12 departamentos ════\n");
const { DEPARTAMENTOS_V2 } = await import("../lib/agency/catalogo-v2/catalogo.ts");
console.log("catálogo canônico:", DEPARTAMENTOS_V2.map((d) => d.id).join(", "));

// ─── O ACESSO DO CEO ────────────────────────────────────────────────────────
const bcrypt = await import("bcryptjs");
const senha = "farol27";
const emailCeo = "ceo@case-farol-27.local";
await prisma.user.upsert({
  where: { email: emailCeo },
  create: { email: emailCeo, name: "CEO (case Farol 27)", passwordHash: await bcrypt.default.hash(senha, 10), role: "master", workspaceId: wsId },
  update: { passwordHash: await bcrypt.default.hash(senha, 10), role: "master", workspaceId: wsId },
});
const portal = await prisma.portalAccess.findFirst({ where: { clientRequestId: pedidoId, revokedAt: null }, select: { token: true } })
  ?? await prisma.portalAccess.create({ data: { clientRequestId: pedidoId, clientId: clienteId }, select: { token: true } });

const resumo = {
  clienteId, projetoId, pedidoId, wsId,
  paginaDoCliente: `/agency/clients/${clienteId}`,
  portalDoCliente: `/portal/access/${portal.token}`,
  login: { email: emailCeo, senha },
  entregas: await prisma.deliverable.count({ where: { projectId: projetoId } }),
  pecas: await prisma.socialPost.count({ where: { clientId: clienteId } }),
  aprovacoes: await prisma.approvalRequest.count({ where: { clientRequestId: pedidoId } }),
  pendencias: await prisma.materialRequest.count({ where: { projectId: projetoId } }),
  eventos, diario,
};
writeFileSync(resolve(PASTA, "placar.md"), placarEmTexto(achados, percurso, tropecos));
writeFileSync(resolve(PASTA, "percurso.json"), JSON.stringify({ percurso, achados, tropecos }, null, 2));
writeFileSync(resolve(PASTA, "resumo.json"), JSON.stringify(resumo, null, 2));
console.log("\n════ RESUMO ════");
console.log(JSON.stringify(resumo, null, 2).slice(0, 2000));
await prisma.$disconnect();
