// A TELA DO CLIENTE NÃO PROMETE PRAZO — e agora isso é portão, não combinado.
//
// ─── O QUE ACONTECEU ─────────────────────────────────────────────────────────
//
// A confirmação do briefing público dizia, em texto fixo:
//
//     "Entramos em contato pelo canal informado em até 1 dia útil"
//
// O CEO, em 16/08/2026: *"não autorizei nada disso, não foi decisão minha, e um
// dia isso é coisa de um ano — inteligência artificial faz em minutos"*.
//
// Dois defeitos, e o segundo é o que este arquivo protege:
//
//   1. Ninguém decidiu o prazo. Ele foi digitado.
//   2. **Nada no código o garantia.** Sem relógio, sem alarme, sem quem ligue.
//      O registro de 08/08 mostra o preço: três interessados esperaram 51, 29 e
//      28 dias por um retorno que esta mesma frase prometia em 1 dia.
//
// ─── A REGRA QUE ESTE TESTE FAZ CUMPRIR ──────────────────────────────────────
//
// **Nunca se escreve prazo na cara do cliente sem que exista, no código, algo
// que garanta esse prazo.** Como não existe esse algo, não se escreve prazo.
//
// A tela diz o que está acontecendo AGORA, lido do servidor. Se travar, diz que
// travou. Silêncio e prazo falso são o mesmo defeito com roupas diferentes.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  lerEstadoDoBriefing,
  aindaMuda,
  CANVASES_POR_ORCAMENTO,
  MINUTOS_ATE_A_DEMORA_VIRAR_NOTICIA,
  type FatosDoBriefing,
} from "@/lib/agency/briefing/estado-do-briefing";

const RAIZ = process.cwd();

// ─── AS SUPERFÍCIES QUE O CLIENTE LÊ ────────────────────────────────────────
//
// Não é o repositório inteiro de propósito: prazo é palavra legítima dentro da
// agência ("prazo de entrega" num canvas de estratégia é um campo que a equipe
// preenche). O que não pode existir é prazo PROMETIDO a quem está do lado de
// fora. Estas são as superfícies onde o prospect e o cliente leem texto nosso.
const SUPERFICIES_DE_CLIENTE = [
  "app/briefing",
  "app/contato",
  "components/agency/briefing",
  "lib/agency/briefing",
  "lib/email/templates.ts",
  "app/api/portal/esteira/route.ts",
  "lib/agency/esteira/refacao.ts",
];

/**
 * As formas de prometer prazo. Cada uma foi vista de verdade neste repositório
 * ou é a variação óbvia da que foi.
 *
 * `em breve` entra na lista, e não é preciosismo: é a promessa de prazo sem
 * número — impossível de quebrar por definição e, por isso mesmo, impossível de
 * cumprir. Foram três ocorrências em 16/08, todas em mensagem para cliente.
 */
const PROMESSAS = [
  { nome: "prazo em dias úteis", re: /\b(\d+|um|uma|dois|duas|tr[êe]s)\s+dias?\s+[úu]t(il|eis)\b/i },
  // "hora" tem de vir escrita. A primeira versão aceitava o `h` sozinho e
  // reprovou `className="w-1 h-1"` — classe de Tailwind lida como promessa de
  // uma hora. Trava que acusa CSS é trava que alguém desliga na sexta; o atalho
  // "em até 24h" continua pego pela regra do "em até <n>", logo abaixo.
  { nome: "prazo em horas", re: /\b\d{1,3}\s*horas?\b/i },
  { nome: '"em até <n>"', re: /\bem\s+at[ée]\s+\d/i },
  { nome: '"em breve"', re: /\bem\s+breve\b/i },
  { nome: '"retorno/respondo rápido"', re: /\b(retorn|respond)\w*\s+(r[áa]pido|logo|j[áa])\b/i },
  { nome: '"prazo de entrega/retorno" prometido', re: /\bprazo\s+de\s+(entrega|retorno)\b/i },
];

function* arquivos(alvo: string): Generator<string> {
  const abs = path.join(RAIZ, alvo);
  const s = statSync(abs);
  if (s.isFile()) {
    yield abs;
    return;
  }
  for (const nome of readdirSync(abs)) {
    const p = path.join(abs, nome);
    if (/node_modules|\.next/.test(p)) continue;
    if (statSync(p).isDirectory()) yield* arquivos(path.relative(RAIZ, p));
    else if (/\.(ts|tsx)$/.test(p)) yield p;
  }
}

/**
 * Só linhas de TEXTO, nunca comentário.
 *
 * Este arquivo e os que ele varre EXPLICAM o defeito citando a frase original
 * ("Entramos em contato ... em até 1 dia útil"). Um varredor que lesse
 * comentário reprovaria a própria explicação do conserto — e a saída barata
 * seria apagar a explicação, que é a memória de por que a regra existe.
 */
function linhasDeTexto(conteudo: string): { n: number; texto: string }[] {
  const saida: { n: number; texto: string }[] = [];
  let emBloco = false;
  conteudo.split("\n").forEach((linha, i) => {
    const cru = linha.trim();
    if (emBloco) {
      if (cru.includes("*/")) emBloco = false;
      return;
    }
    // `{/*` é comentário de JSX e conta igual — a primeira versão só conhecia
    // `/*` e reprovou o próprio comentário que explica este conserto.
    if (cru.startsWith("/*") || cru.startsWith("{/*")) {
      if (!cru.includes("*/")) emBloco = true;
      return;
    }
    if (cru.startsWith("//") || cru.startsWith("*")) return;
    // Corta o comentário de fim de linha, mas só quando não está dentro de
    // aspas — senão uma URL "https://…" perderia metade.
    const semFim = linha.replace(/(^|[^:"'`])\/\/.*$/, "$1");
    saida.push({ n: i + 1, texto: semFim });
  });
  return saida;
}

interface Achado {
  arquivo: string;
  linha: number;
  promessa: string;
  trecho: string;
}

function varrerPromessas(alvos: string[]): Achado[] {
  const achados: Achado[] = [];
  for (const alvo of alvos) {
    for (const arquivo of arquivos(alvo)) {
      const rel = path.relative(RAIZ, arquivo).split(path.sep).join("/");
      for (const { n, texto } of linhasDeTexto(readFileSync(arquivo, "utf8"))) {
        for (const p of PROMESSAS) {
          if (p.re.test(texto)) {
            achados.push({ arquivo: rel, linha: n, promessa: p.nome, trecho: texto.trim().slice(0, 120) });
          }
        }
      }
    }
  }
  return achados;
}

describe("a tela do cliente não promete prazo", () => {
  // ── METADE 1: O PORTÃO REPROVA DE VERDADE ─────────────────────────────────
  describe("BARRA a promessa de prazo (a metade que protege)", () => {
    it("pega a frase EXATA que o CEO reprovou", () => {
      const linha = `const passo = "Entramos em contato pelo canal informado em até 1 dia útil";`;
      const pegou = PROMESSAS.filter((p) => p.re.test(linha));
      expect(pegou.length).toBeGreaterThan(0);
      expect(pegou.map((p) => p.nome)).toContain("prazo em dias úteis");
    });

    it("pega as variações que alguém escreveria no lugar", () => {
      const casos = [
        "Retornamos em até 24 horas.",
        "Respondemos em 2 dias úteis.",
        "Nossa equipe retorna em breve.",
        "Escreva pra gente e responderemos rápido.",
        "O prazo de entrega é de 3 dias.",
      ];
      for (const c of casos) {
        expect(
          PROMESSAS.some((p) => p.re.test(c)),
          `nenhuma regra pegou: "${c}"`,
        ).toBe(true);
      }
    });

    it("o varredor acha a promessa num arquivo de verdade, com linha", () => {
      // Prova que `varrerPromessas` funciona de ponta a ponta, e não só o regex:
      // é o próprio arquivo de teste, que cita a frase reprovada DENTRO de uma
      // string de código na metade 1 acima.
      const achados = varrerPromessas(["__tests__/briefing/a-tela-nao-promete-prazo.test.ts"]);
      expect(achados.length).toBeGreaterThan(0);
      expect(achados.every((a) => a.linha > 0)).toBe(true);
    });
  });

  // ── METADE 2: NÃO ACUSA O CASO LIMPO ──────────────────────────────────────
  describe("NÃO acusa onde não há promessa", () => {
    it("comentário que EXPLICA o defeito passa — é a memória da regra", () => {
      const conteudo = [
        `// Antes dizia "em até 1 dia útil" e ninguém garantia isso.`,
        `/* Prazo de entrega: era a promessa antiga. */`,
        `const t = "Recebemos seu briefing.";`,
      ].join("\n");
      const texto = linhasDeTexto(conteudo).map((l) => l.texto).join("\n");
      expect(PROMESSAS.some((p) => p.re.test(texto))).toBe(false);
    });

    it("frase de ESTADO passa — é exatamente o que entrou no lugar", () => {
      const boas = [
        "Recebemos seu briefing.",
        "Estamos montando seu orçamento.",
        "Já saíram 3 das 6 partes do escopo.",
        "Seu orçamento está pronto.",
        "Seu briefing chegou, mas o orçamento travou.",
        "Assim que ele existir, ele aparece aqui.",
      ];
      for (const b of boas) {
        const pegou = PROMESSAS.filter((p) => p.re.test(b));
        expect(pegou, `acusou "${b}" por ${pegou.map((p) => p.nome).join(", ")}`).toEqual([]);
      }
    });
  });

  // ── O PORTÃO ──────────────────────────────────────────────────────────────
  it("nenhuma superfície de cliente promete prazo", () => {
    const achados = varrerPromessas(SUPERFICIES_DE_CLIENTE).filter(
      // O próprio arquivo de teste cita as frases proibidas de propósito.
      (a) => !a.arquivo.startsWith("__tests__/"),
    );
    expect(
      achados,
      achados.length === 0
        ? ""
        : `\n\nPromessa de prazo em superfície de cliente — ${achados.length} ocorrência(s):\n\n` +
          achados.map((a) => `  ${a.arquivo}:${a.linha} → [${a.promessa}] ${a.trecho}`).join("\n") +
          `\n\nA regra: nunca se escreve prazo na cara do cliente sem que exista, no código,\n` +
          `algo que garanta esse prazo. Diga o ESTADO ("recebemos", "montando", "pronto"),\n` +
          `nunca quando. Ver lib/agency/briefing/estado-do-briefing.ts.\n`,
    ).toEqual([]);
  });

  it("a lista de superfícies existe de verdade — portão que não varre nada aprova tudo", () => {
    for (const s of SUPERFICIES_DE_CLIENTE) {
      expect(() => statSync(path.join(RAIZ, s)), `superfície sumiu: ${s}`).not.toThrow();
    }
    const varridos = SUPERFICIES_DE_CLIENTE.flatMap((s) => [...arquivos(s)]);
    expect(varridos.length).toBeGreaterThan(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// O ESTADO É REAL — e "real" quer dizer que ele muda quando o mundo muda.
// ─────────────────────────────────────────────────────────────────────────────

const BASE: FatosDoBriefing = {
  status: "new",
  criadoEm: new Date("2026-08-16T12:00:00Z"),
  agora: new Date("2026-08-16T12:00:10Z"),
  canvases: 0,
  falha: null,
};

describe("o estado da tela vem do mundo, não de um texto fixo", () => {
  it("recém-chegado, sem canvas → recebido", () => {
    const e = lerEstadoDoBriefing(BASE);
    expect(e.id).toBe("recebido");
    expect(aindaMuda(e.id)).toBe(true);
  });

  it("com canvas parcial → montando, e o NÚMERO é o real", () => {
    const e = lerEstadoDoBriefing({ ...BASE, canvases: 3 });
    expect(e.id).toBe("montando");
    // A frase carrega a contagem de verdade. Se fosse texto fixo, este teste
    // passaria com qualquer número — é ele que prova que a tela conta.
    expect(e.detalhe).toContain("3 das 6");
    const e5 = lerEstadoDoBriefing({ ...BASE, canvases: 5 });
    expect(e5.detalhe).toContain("5 das 6");
  });

  it("com os 6 canvases → pronto, e para de perguntar", () => {
    const e = lerEstadoDoBriefing({ ...BASE, canvases: CANVASES_POR_ORCAMENTO });
    expect(e.id).toBe("pronto");
    expect(aindaMuda(e.id)).toBe(false);
  });

  it("sem canal de contato → sem_contato, e NÃO finge que vai mandar proposta", () => {
    const e = lerEstadoDoBriefing({ ...BASE, status: "lead_incompleto" });
    expect(e.id).toBe("sem_contato");
    expect(e.chamaOWhatsApp).toBe(true);
    expect(e.detalhe).toMatch(/WhatsApp|e-mail/i);
  });

  it("falha registrada → travado, COM o motivo em português", () => {
    const e = lerEstadoDoBriefing({ ...BASE, falha: { motivo: "nosso banco de dados não respondeu" } });
    expect(e.id).toBe("travado");
    expect(e.detalhe).toContain("nosso banco de dados não respondeu");
    // "Não foi você" — a tela não deixa a pessoa achar que errou.
    expect(e.detalhe).toMatch(/não foi você/i);
    expect(e.chamaOWhatsApp).toBe(true);
  });

  it("parado tempo demais sem falha registrada → travado, e não 'montando' para sempre", () => {
    const tarde = new Date(BASE.criadoEm.getTime() + (MINUTOS_ATE_A_DEMORA_VIRAR_NOTICIA + 1) * 60_000);
    const e = lerEstadoDoBriefing({ ...BASE, agora: tarde });
    expect(e.id).toBe("travado");
    expect(e.chamaOWhatsApp).toBe(true);
  });

  it("demora COM progresso não vira travado — o motor está trabalhando", () => {
    // A metade que impede a trava de assustar quem está sendo bem atendido.
    const tarde = new Date(BASE.criadoEm.getTime() + (MINUTOS_ATE_A_DEMORA_VIRAR_NOTICIA + 1) * 60_000);
    const e = lerEstadoDoBriefing({ ...BASE, agora: tarde, canvases: 4 });
    expect(e.id).toBe("montando");
  });

  it("NENHUM estado promete prazo — a regra vale para as frases geradas também", () => {
    const casos: FatosDoBriefing[] = [
      BASE,
      { ...BASE, canvases: 3 },
      { ...BASE, canvases: 6 },
      { ...BASE, status: "lead_incompleto" },
      { ...BASE, falha: { motivo: "uma falha interna no motor de orçamento" } },
      { ...BASE, agora: new Date(BASE.criadoEm.getTime() + 10 * 60_000) },
    ];
    for (const c of casos) {
      const e = lerEstadoDoBriefing(c);
      const tudo = [e.titulo, e.detalhe, ...e.passos.map((p) => p.rotulo)].join(" ");
      const pegou = PROMESSAS.filter((p) => p.re.test(tudo));
      expect(pegou, `estado "${e.id}" promete prazo: ${pegou.map((p) => p.nome).join(", ")}`).toEqual([]);
    }
  });
});
