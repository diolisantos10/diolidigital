// Captura ANTES/DEPOIS da aba Aprovações do portal, nas três larguras.
//
// Por que renderiza o COMPONENTE e não a rota: esta máquina não tem banco, e a
// aba só existe depois de um token de portal válido. O que se está conferindo
// aqui é a TELA (o carimbo aparece? cabe a 375px? o selo continua na linha?), e
// para isso a fixture é suficiente — desde que ela reproduza exatamente os
// cinco cards que o CEO tinha na frente em 15/08/2026, que é o que ela faz.
//
// A medida que importa vem junto: `scrollWidth > clientWidth` é o único juiz de
// "cabe no celular". Carimbo é texto longo; ele é justamente o tipo de coisa
// que estoura a linha e ninguém percebe olhando no monitor.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { readFileSync } from "node:fs";

import { AprovacoesDoCliente } from "../components/portal/AprovacoesDoCliente";

// O "ANTES" é opcional e não vive no repositório — é a versão do componente de
// antes do carimbo, tirada do próprio git na hora de comparar:
//
//   git show <commit>:components/portal/AprovacoesDoCliente.tsx \
//     > components/portal/_AntesDoCarimbo.tsx
//
// Versionar uma cópia congelada de um componente é dívida garantida: ela nunca
// mais é atualizada e o próximo a ler acha que existem duas telas de aprovação.
const AprovacoesAntes = await import("../components/portal/_AntesDoCarimbo")
  .then((m) => m.AprovacoesDoCliente)
  .catch(() => null);

const SAIDA = process.env.SAIDA ?? "/tmp/claude-0/-home-user-FOOCCI/b9c343fc-6047-5924-8ea8-b9312faba7f6/scratchpad/shots-carimbo";
const LARGURAS: Array<[number, number]> = [[375, 812], [768, 1024], [1280, 900]];

mkdirSync(SAIDA, { recursive: true });

// ── A tela do CEO, reproduzida card a card ──────────────────────────────────
const base = {
  version: null as number | null,
  questionOpen: false,
  expiresAt: null as string | null,
  pecas: [] as never[],
  comments: [] as never[],
};

const APROVACOES = [
  {
    ...base,
    id: "a1",
    department: "Social Media",
    status: "pending",
    createdAt: "2026-08-03T13:20:00.000Z",
    updatedAt: "2026-08-03T13:20:00.000Z",
    reviewedAt: null,
    reviewNote: "PRECISO CONFIRMAR: qual é o padrão das referências enviadas?",
  },
  {
    ...base,
    id: "a2",
    department: "Analytics",
    status: "pending",
    createdAt: "2026-07-29T11:05:00.000Z",
    updatedAt: "2026-08-11T09:40:00.000Z",
    reviewedAt: null,
    reviewNote: null,
    semConteudo: true,
  },
  {
    ...base,
    id: "a3",
    department: "Estratégia",
    status: "pending",
    createdAt: "2026-07-29T11:05:00.000Z",
    updatedAt: "2026-08-14T18:12:00.000Z",
    reviewedAt: null,
    reviewNote: null,
    semConteudo: true,
  },
  {
    ...base,
    id: "a4",
    department: "Social Media",
    status: "approved",
    createdAt: "2026-08-12T10:00:00.000Z",
    updatedAt: "2026-08-15T00:47:00.000Z",
    reviewedAt: "2026-08-15T00:47:00.000Z",
    reviewNote: "Peças do calendário",
    pecas: [{ id: "p1" }, { id: "p2" }],
  },
  {
    ...base,
    id: "a5",
    department: "Social Media",
    status: "approved",
    createdAt: "2026-08-10T10:00:00.000Z",
    updatedAt: "2026-08-15T00:30:00.000Z",
    reviewedAt: "2026-08-15T00:30:00.000Z",
    reviewNote: "PRECISO CONFIRMAR: as fotos do time podem ser usadas?",
  },
  // O caso da AUSÊNCIA — o registro que o banco não carimbou. Ele existe na
  // captura de propósito: é a prova visual de que a tela diz "sem registro de
  // quando" em vez de escrever uma data plausível.
  {
    ...base,
    id: "a6",
    department: "Design",
    status: "pending",
    createdAt: null,
    updatedAt: null,
    reviewedAt: null,
    reviewNote: "Ajuste do banner da home",
  },
];

const DECISAO = {
  titulo: "1 entrega está pronta para você",
  descricao:
    "Nesta aprovação vão: Social Media. Ainda em produção, e fora desta aprovação: Analytics, Estratégia. "
    + "Aprovar libera a publicação do calendário. Você pode decidir item por item nas linhas acima, ou aprovar de uma vez.",
  rotulo: "Aprovar esta entrega",
  itens: ["Social Media"],
  emProducao: ["Analytics", "Estratégia"],
  naFilaDesde: "2026-08-03T13:20:00.000Z",
  decidir: async () => true,
};

function marcacao(Componente: typeof AprovacoesDoCliente, comCarimbo: boolean): string {
  return renderToStaticMarkup(
    createElement(Componente, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      aprovacoes: APROVACOES as any,
      decisaoDaEsteira: (comCarimbo ? DECISAO : { ...DECISAO, naFilaDesde: undefined }) as never,
      token: "",
      abertaId: null,
      onAbrir: () => {},
      enviando: false,
      erro: null,
      onDecidir: async () => true,
    }),
  );
}

const css = (
  await postcss([tailwind()]).process(readFileSync("app/globals.css", "utf8"), {
    from: "app/globals.css",
  })
).css;

function pagina(corpo: string): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>${css}</style>
<style>body{background:var(--bg);margin:0;font-size:14px}main{padding:16px;max-width:900px;margin:0 auto}</style>
</head><body><main>${corpo}</main></body></html>`;
}

const arquivos: Record<string, string> = { depois: `${SAIDA}/depois.html` };
writeFileSync(arquivos.depois, pagina(marcacao(AprovacoesDoCliente, true)));
if (AprovacoesAntes) {
  arquivos.antes = `${SAIDA}/antes.html`;
  writeFileSync(arquivos.antes, pagina(marcacao(AprovacoesAntes as never, false)));
}

const navegador = await chromium.launch();
const problemas: string[] = [];

for (const [rotulo, arquivo] of Object.entries(arquivos)) {
  for (const [w, h] of LARGURAS) {
    const ctx = await navegador.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    const pag = await ctx.newPage();
    await pag.goto(`file://${arquivo}`, { waitUntil: "load" });
    const m = await pag.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
      body: document.body.scrollWidth,
    }));
    if (m.scroll > m.client + 1 || m.body > m.client + 1) {
      problemas.push(`${rotulo} · ${w}px → rolagem lateral: ${Math.max(m.scroll, m.body)} > ${m.client}`);
    }
    await pag.screenshot({ path: `${SAIDA}/${rotulo}-${w}.png`, fullPage: true });
    await ctx.close();
  }
}

await navegador.close();

if (problemas.length) {
  console.log("ROLAGEM LATERAL:");
  for (const p of problemas) console.log("  " + p);
  process.exitCode = 1;
} else {
  console.log(`OK — 6 capturas em ${SAIDA}, nenhuma com rolagem lateral.`);
}
