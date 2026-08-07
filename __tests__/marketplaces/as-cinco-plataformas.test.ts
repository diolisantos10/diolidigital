// AS CINCO LINHAS DO `platform_policies` — a pesquisa do CEO virou DADO.
//
// Origem: `docs/projetos/99freelas/02-PESQUISA-DO-CEO-plataformas.md`, em que o
// CEO foi aos termos e páginas oficiais das quatro outras plataformas em
// 07/08/2026.
//
// ── O QUE ESTE ARQUIVO PROTEGE, E POR QUÊ ──────────────────────────────────
// Uma matriz de permissões que mora em prosa não muda quando a regra muda —
// é o mesmo defeito do "31 checagens, 28 sem mecanismo" repetido em outra
// roupa. Aqui cada afirmação da pesquisa é um campo que o Compliance Gate lê,
// e este teste é o que impede a linha de nascer aberta por descuido.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { politicaDe, plataformasComPolitica } from "@/lib/marketplaces/politica";
import { vereditoDePolitica, portaoDeConformidade } from "@/lib/marketplaces/portao";

const RAIZ = resolve(__dirname, "../..");
const CINCO = ["99freelas", "fiverr", "freelancer", "upwork", "workana"];

describe("as cinco plataformas têm linha de política, e nenhuma nasce aberta", () => {
  it("as cinco estão registradas", () => {
    expect(plataformasComPolitica()).toEqual(CINCO);
  });

  it.each(CINCO)("%s: política ativa, versionada e datada", (p) => {
    const pol = politicaDe(p);
    expect(pol.ativa).toBe(true);
    expect(pol.versao).not.toBe("(nenhuma)");
    expect(pol.verificadaEm).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it.each(CINCO)("%s: NENHUMA autoriza envio automático hoje", (p) => {
    expect(politicaDe(p).autoSubmissaoPermitida).toBe(false);
    expect(vereditoDePolitica(p, "enviarProposta")).not.toBe("ALLOW");
  });

  it.each(CINCO)("%s: automação de navegador NÃO é permitida", (p) => {
    expect(politicaDe(p).cru.browser_automation_allowed).toBe(false);
  });

  it.each(CINCO)("%s: link e contato externo antes do contrato são proibidos", (p) => {
    expect(politicaDe(p).linkExternoPermitidoAntesDoContrato).toBe(false);
    expect(politicaDe(p).contatoExternoPermitidoAntesDoContrato).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("🎓 O CASO-ESCOLA: ter API NÃO é ter permissão", () => {
  it("Freelancer.com — os dois campos são INDEPENDENTES e ambos verdadeiros", () => {
    const f = politicaDe("freelancer");
    // A API existe, é grande, tem sandbox e SDK...
    expect(f.apiDisponivel).toBe(true);
    // ...e ainda assim exige autorização escrita, que inclui a própria API.
    expect(f.apiExigeAutorizacao).toBe(true);
    // Logo, o envio continua fora de ALLOW. É este par que impede um
    // "tem API ⇒ pode" de autorizar exatamente o que os termos proíbem.
    expect(vereditoDePolitica("freelancer", "enviarProposta")).not.toBe("ALLOW");
  });

  it("Upwork — proíbe automação E oferece caminho oficial: API existe, exige autorização", () => {
    const u = politicaDe("upwork");
    expect(u.apiDisponivel).toBe(true);
    expect(u.apiExigeAutorizacao).toBe(true);
    expect(u.prioridadeNoRoadmap).toBe(1);
  });

  it("Workana e Fiverr — não há API para este fluxo", () => {
    expect(politicaDe("workana").apiDisponivel).toBe(false);
    expect(politicaDe("fiverr").apiDisponivel).toBe(false);
  });

  it("campo `api_authorization_required` AUSENTE conta como `true`", () => {
    // A assimetria é deliberada: "não sei se precisa de autorização" tem de
    // significar "precisa". O default `false` aqui seria a porta aberta.
    const semCampo = politicaDe("nao-existe");
    expect(semCampo.apiExigeAutorizacao).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("a ordem de ataque do CEO está gravada como dado", () => {
  it("Upwork 1 · Freelancer 2 · 99Freelas 3 · Workana 4 · Fiverr 5", () => {
    const ordem = CINCO
      .map((p) => ({ p, n: politicaDe(p).prioridadeNoRoadmap }))
      .filter((x) => x.n !== null)
      .sort((a, b) => (a.n as number) - (b.n as number))
      .map((x) => x.p);
    expect(ordem).toEqual(["upwork", "freelancer", "99freelas", "workana", "fiverr"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("Workana e Fiverr — a DESCOBERTA é BLOCK, não HUMAN_GATE", () => {
  it.each(["workana", "fiverr"])("%s: varrer e ler são o comportamento proibido por escrito", (p) => {
    expect(vereditoDePolitica(p, "descobrir")).toBe("BLOCK");
    expect(vereditoDePolitica(p, "lerProjeto")).toBe("BLOCK");
    // A outra metade: o trabalho intelectual continua 100% automático.
    expect(vereditoDePolitica(p, "qualificar")).toBe("ALLOW");
  });

  it("no 99Freelas a descoberta pública é ALLOW — a diferença é o texto do contrato", () => {
    // Workana e Fiverr PROÍBEM crawling com todas as letras; o 99Freelas
    // silencia e ainda pede `/projects` no sitemap. Contratos diferentes,
    // vereditos diferentes — e isso mora no dado, não num `if`.
    expect(vereditoDePolitica("99freelas", "descobrir")).toBe("ALLOW");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("Fiverr — a janela de 72 h do Brief é prazo, não decoração", () => {
  it("está gravada em dado, com o motivo", () => {
    const f = politicaDe("fiverr");
    const brief = f.cru.entrada_por_brief as Record<string, unknown>;
    expect(brief.janela_de_resposta_horas).toBe(72);
    expect(String(brief.janela_motivo)).toMatch(/sil[êe]ncio/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("os dois pedidos formais de API existem, prontos para o CEO", () => {
  const pedidos = [
    ["upwork", "docs/plataformas/upwork/pedido-de-api.md"],
    ["freelancer", "docs/plataformas/freelancer/pedido-de-api.md"],
  ];

  it.each(pedidos)("%s: o texto do pedido está na biblioteca", (_p, caminho) => {
    const t = readFileSync(resolve(RAIZ, caminho), "utf8");
    expect(t.length).toBeGreaterThan(1500);
  });

  // ── POR QUE ESTE TESTE MUDOU EM 07/08/2026 ────────────────────────────────
  //
  // Ele exigia a frase "NÃO ENVIADO" no documento. Parecia zelo — era uma
  // armadilha: o pedido foi enviado no mesmo dia, o documento passou a dizer a
  // verdade, e o teste ficou VERMELHO por isso. Um teste que fica vermelho
  // quando o mundo anda para frente não protege nada; ensina a mexer no
  // documento para o teste calar.
  //
  // O que importa não é QUAL estado, é que o estado seja DECLARADO e com data
  // quando já saiu — porque o relógio dessas respostas é externo, e sem data
  // ninguém sabe quando cobrar nem há quanto tempo o HUMAN_GATE está travado.
  it.each(pedidos)("%s: o pedido declara seu estado, e com data se já saiu", (_p, caminho) => {
    const t = readFileSync(resolve(RAIZ, caminho), "utf8");
    const linha = t.split("\n").find((l) => l.includes("**Estado:"));
    expect(linha, "o documento tem que declarar o estado do pedido").toBeTruthy();

    const enviado = /ENVIAD[OA]/.test(linha!) && !/NÃO ENVIAD[OA]/.test(linha!);
    if (enviado) {
      // Enviado sem data é o mesmo que não saber se foi enviado.
      expect(linha, "pedido enviado tem que carregar a data").toMatch(/\d{2}\/\d{2}\/\d{4}/);
    } else {
      expect(linha).toMatch(/NÃO ENVIAD[OA]/);
    }
  });

  it.each(pedidos)("%s: o pedido NÃO usa as palavras que descrevem o que não vamos fazer", (_p, caminho) => {
    // Só a citação em bloco (o texto que o CEO vai enviar) é conferida: as
    // seções de instrução PRECISAM nomear as palavras proibidas para explicar
    // por que não se usa nenhuma delas.
    const t = readFileSync(resolve(RAIZ, caminho), "utf8");
    const citado = t.split("\n").filter((l) => l.startsWith(">")).join("\n");
    expect(citado.length).toBeGreaterThan(1000);
    for (const proibida of [/\bscraper\b/i, /auto-?bid/i, /\bbulk bidding\b/i, /mass\s+(?:apply|submission)/i]) {
      expect(citado, `"${proibida}" não pode aparecer no texto enviado`).not.toMatch(proibida);
    }
    // A outra metade: o texto descreve o uso REAL, com todas as letras.
    expect(citado).toMatch(/individualised/i);
    expect(citado).toMatch(/own account|our agency account/i);
  });

  it("o policy.json de cada um aponta para o pedido, e o status ainda é 'nao_perguntado'", () => {
    for (const p of ["upwork", "freelancer"]) {
      const a = politicaDe(p).cru.autorizacao_do_provedor as Record<string, unknown>;
      expect(a.status).toBe("nao_perguntado");
      expect(String(a.pedido)).toMatch(/pedido-de-api\.md$/);
      expect(a.evidencia).toBeNull();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("a procedência das quatro linhas novas está DECLARADA, não escondida", () => {
  it.each(["upwork", "freelancer", "workana", "fiverr"])("%s: diz que veio da pesquisa do CEO, e não de captura", (p) => {
    expect(politicaDe(p).cru.procedencia_das_fontes).toBe("PESQUISA_DO_CEO");
  });

  it("o 99Freelas é a única com biblioteca de fontes capturada", () => {
    expect(politicaDe("99freelas").cru.procedencia_das_fontes).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("o portão trata as cinco pelo mesmo caminho", () => {
  it.each(CINCO)("%s: enviar proposta nunca sai ALLOW pelo portão completo", (p) => {
    const d = portaoDeConformidade({
      plataforma: p, acao: "enviarProposta",
      texto: "Olá! Li o projeto e o ponto que mais muda o escopo é o número de peças. Trabalho por pacote fechado com duas rodadas de ajuste. Quantas peças existem hoje?",
      custoEmConexoesLidoDaTela: 1, conexoesGastasNoMes: 0,
    });
    expect(d.veredito).not.toBe("ALLOW");
  });
});
