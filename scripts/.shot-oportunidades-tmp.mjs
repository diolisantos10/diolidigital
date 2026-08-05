// Login + screenshot /agency/oportunidades nos 3 tamanhos, com a API simulada.
// Uso: node shot-oportunidades.mjs <modo> <nome>   modo = real | cheio | erro | vazio
import { chromium } from "playwright";
import { mkdirSync, existsSync } from "node:fs";

const modo = process.argv[2] || "cheio";
const nome = process.argv[3] || `oportunidades-${modo}`;
const base = process.argv[4] || "http://localhost:3100";
const EMAIL = "master@dioli.studio";
const PASS = "dioli2025";
const outDir = "/tmp/claude-0/-home-user-diolidigital/f2f59102-0a34-5a6c-97a0-c5ae67c9dc76/scratchpad/shots";

const EXECS = [
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell",
];
const DEVICES = [
  { device: "mobile", width: 375, height: 812 },
  { device: "tablet", width: 768, height: 1024 },
  { device: "desktop", width: 1440, height: 900 },
];

const PROPOSTA = `Olá, Marina!

Li o projeto e o que você precisa é exatamente o que a gente faz todo mês para restaurantes: 12 posts, 8 stories e a gestão do tráfego, com a marca falando sempre do mesmo jeito.

Como eu tocaria isso:
1. Semana 1 — diagnóstico do perfil e do público (o que já funciona fica).
2. Semana 2 — calendário do mês aprovado por você antes de qualquer publicação.
3. A partir daí — publicação, monitoramento e um relatório simples toda sexta.

Investimento: R$ 2.400/mês, sem fidelidade. Consigo começar na segunda.

Se fizer sentido, me chama por aqui que eu te mando dois exemplos de resultado de clientes do mesmo setor.

— Dioli Digital`;

const TEXTO = `Preciso de uma agência para cuidar do Instagram do meu restaurante japonês em Moema.

Hoje somos eu e minha sócia postando quando dá tempo. Queremos: 3 posts por semana, stories diários e anúncios para atrair delivery no fim de semana.

Orçamento: até R$ 2.500 por mês. Prazo: começar ainda este mês.
Já temos fotos profissionais dos pratos.`;

const FIXTURES = [
  {
    id: "op-1", plataforma: "99freelas", titulo: "Gestão de Instagram e tráfego pago para restaurante japonês",
    nota: 86, servicoSugerido: "Social + Tráfego mensal", valorSugerido: 2400, orcamentoInformado: 2500,
    prazoInformado: "começar este mês", categoria: "Marketing digital",
    raciocinio: "Setor que já atendemos, orçamento dentro da nossa faixa e o cliente já tem material de foto.",
    descricao: TEXTO, propostaTexto: PROPOSTA, urlExterna: "https://www.99freelas.com.br/project/exemplo",
    status: "nova", createdAt: "2026-08-05T09:12:00.000Z",
  },
  {
    id: "op-2", plataforma: "workana", titulo: "Criação de identidade visual completa para clínica de estética",
    nota: 72, servicoSugerido: "Identidade visual", valorSugerido: 3800, orcamentoInformado: null,
    prazoInformado: "30 dias", categoria: "Design",
    raciocinio: "Escopo claro e prazo folgado, mas o anúncio não declarou orçamento.",
    descricao: "Precisamos de logo, paleta, tipografia e manual de marca para uma clínica nova em Curitiba. Já temos o nome e o posicionamento definidos.",
    propostaTexto: "Olá! Identidade visual completa em 30 dias...", urlExterna: null,
    status: "nova", createdAt: "2026-08-05T08:40:00.000Z",
  },
  {
    id: "op-3", plataforma: "upwork", titulo: "Edição de 40 vídeos curtos por mês para canal de finanças",
    nota: 54, servicoSugerido: "Vídeo — corte e legenda", valorSugerido: 1900, orcamentoInformado: 1500,
    prazoInformado: null, categoria: "Vídeo",
    raciocinio: "Volume alto para o preço proposto; só fecha se o cliente aceitar entregar o roteiro pronto.",
    descricao: "Canal de finanças com 3 lives por semana. Preciso de cortes verticais, legenda queimada e capa.",
    propostaTexto: null, urlExterna: "https://www.upwork.com/jobs/exemplo",
    status: "nova", createdAt: "2026-08-04T19:02:00.000Z",
  },
  {
    id: "op-4", plataforma: "freelancer", titulo: "Site institucional em WordPress com 5 páginas",
    nota: 31, servicoSugerido: null, valorSugerido: null, orcamentoInformado: 600,
    prazoInformado: "3 dias", categoria: null,
    raciocinio: "Prazo de 3 dias e orçamento de R$ 600 — abaixo do piso da agência para site.",
    descricao: "Site simples, 5 páginas, cliente fornece textos e imagens. Urgente.",
    propostaTexto: null, urlExterna: null,
    status: "nova", createdAt: "2026-08-04T15:20:00.000Z",
  },
  {
    id: "op-5", plataforma: "guru", titulo: "Campanha de lançamento para curso online de fotografia",
    nota: 78, servicoSugerido: "Lançamento — tráfego e criativos", valorSugerido: 5200, orcamentoInformado: 6000,
    prazoInformado: "45 dias", categoria: "Tráfego pago",
    raciocinio: "Ticket alto e escopo que a agência já rodou duas vezes este semestre.",
    descricao: "Lançamento de curso online, meta de 200 alunos. Preciso de criativos, copy e gestão de mídia.",
    propostaTexto: "Olá! Já rodamos dois lançamentos parecidos...", urlExterna: null,
    status: "enviada", createdAt: "2026-08-03T11:00:00.000Z",
  },
  {
    id: "op-6", plataforma: "peopleperhour", titulo: "Tradução de 200 páginas de manual técnico",
    nota: 12, servicoSugerido: null, valorSugerido: null, orcamentoInformado: null, prazoInformado: null,
    categoria: null, raciocinio: "Fora do que a agência entrega — não é marketing.",
    descricao: "Manual técnico de equipamento industrial, inglês para português.",
    propostaTexto: null, urlExterna: null, status: "recusada", createdAt: "2026-08-02T10:00:00.000Z",
  },
];

mkdirSync(outDir, { recursive: true });
let executablePath;
for (const e of EXECS) if (existsSync(e)) { executablePath = e; break; }

const browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
try {
  const login = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const lp = await login.newPage();
  await lp.goto(base + "/auth/signin", { waitUntil: "networkidle", timeout: 45000 });
  await lp.fill('input[name="email"]', EMAIL);
  await lp.fill('input[name="password"]', PASS);
  await Promise.all([
    lp.waitForNavigation({ waitUntil: "networkidle", timeout: 45000 }).catch(() => {}),
    lp.click('button[type="submit"]'),
  ]);
  await lp.waitForTimeout(1500);
  console.log("login ->", lp.url());
  for (const label of ["Entendi, começar", "Entendi", "Começar"]) {
    const btn = lp.getByRole("button", { name: label });
    if (await btn.count().catch(() => 0)) { await btn.first().click().catch(() => {}); break; }
  }
  await lp.waitForTimeout(500);
  const state = await login.storageState();
  await login.close();

  for (const { device, width, height } of DEVICES) {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, storageState: state });
    const page = await ctx.newPage();

    if (modo !== "real") {
      await page.route("**/api/agency/oportunidades**", async (route) => {
        if (modo === "erro") return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "boom" }) });
        if (modo === "vazio") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ oportunidades: [], total: 0 }) });
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ oportunidades: FIXTURES, total: FIXTURES.length }) });
      });
    }

    const resp = await page.goto(base + "/agency/oportunidades", { waitUntil: "networkidle", timeout: 45000 }).catch((e) => ({ err: e }));
    await page.waitForTimeout(900);

    if (modo === "cheio") {
      // Abre o primeiro cartão para o painel de duas colunas aparecer.
      const primeiro = page.locator("li button[aria-expanded]").first();
      if (await primeiro.count()) { await primeiro.click(); await page.waitForTimeout(400); }
    }

    const file = `${outDir}/${nome}-${device}.png`;
    await page.screenshot({ path: file, fullPage: true });
    console.log(`${device.padEnd(7)} ${width}x${height}  HTTP ${resp?.status?.() ?? resp?.err?.message ?? "?"}  -> ${file}`);
    await ctx.close();
  }
} finally {
  await browser.close();
}
