// O QUADRO DE HIERARQUIA — trava, não boa intenção.
//
// Ordem do CEO (16/08/2026): "os quadros de hierarquia precisam todos serem
// atualizados". Prompt é aviso; código é trava. Este teste reprova ficha que
// não desenha a cadeia depois da reforma da camada de gerência — e reprova
// também o quadro que aponta para o gerente ERRADO, que é o defeito perigoso
// (o quadro certo no departamento errado manda demanda para a porta errada).
//
// As duas metades da trava: barra o caso plantado (ficha sem quadro, quadro
// com gerente de outro departamento) e não acusa o caso limpo.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import manifesto from "@/docs/arquitetura-operacional-v2/architecture.manifest.json";
import { DEPARTAMENTOS_V2, FUNCOES_V2 } from "@/lib/agency/catalogo-v2/catalogo";

const RAIZ = path.join(process.cwd(), "agentes/linha");
const TITULO = "## A hierarquia, para não restar dúvida";

/** O gerente de cada departamento é, por construção, o PRIMEIRO agente do manifesto. */
const GERENTE_DO_DEPARTAMENTO = new Map<string, string>(
  manifesto.departments.map((d) => [d.id, d.agents[0]!]),
);

function ler(depId: string, arquivo: string): string {
  return fs.readFileSync(path.join(RAIZ, depId, arquivo), "utf8");
}

function quadroDe(texto: string): string | null {
  const i = texto.indexOf(TITULO);
  if (i < 0) return null;
  const resto = texto.slice(i + TITULO.length);
  const fim = resto.indexOf("\n## ");
  return fim < 0 ? resto : resto.slice(0, fim);
}

describe("quadro de hierarquia — toda ficha declara de quem recebe e para quem devolve", () => {
  it("todo departamento tem gerente declarado no manifesto, e ele é o primeiro da lista", () => {
    expect(GERENTE_DO_DEPARTAMENTO.size).toBe(12);
    for (const [dep, gerente] of GERENTE_DO_DEPARTAMENTO) {
      const ehGerente = gerente.startsWith("manager-") || gerente === "gerente-geral";
      expect(ehGerente, `${dep}: o primeiro agente do manifesto não é gerente ("${gerente}")`).toBe(true);
    }
  });

  it("toda função da linha tem quadro, e o quadro nomeia o gerente DO PRÓPRIO departamento", () => {
    for (const f of FUNCOES_V2) {
      const quadro = quadroDe(ler(f.departamentoId, `${f.id}.md`));
      expect(quadro, `${f.id}: ficha sem quadro de hierarquia`).not.toBeNull();
      const gerente = GERENTE_DO_DEPARTAMENTO.get(f.departamentoId)!;
      if (f.id === gerente) {
        // o gerente aparece como o próprio degrau
        expect(quadro!, `${f.id}: o gerente não se reconhece no quadro`).toContain("este cargo");
        expect(quadro!, `${f.id}: o gerente não declara de quem recebe`).toContain("Gerente Geral");
      } else {
        expect(quadro!, `${f.id}: quadro não nomeia o gerente do departamento`).toContain(gerente);
      }
      expect(quadro!, `${f.id}: quadro sem o topo da cadeia`).toContain("CEO → Diretor");
    }
  });

  it("nenhum quadro nomeia gerente de OUTRO departamento — porta errada é pior que porta ausente", () => {
    const todosOsGerentes = new Set(GERENTE_DO_DEPARTAMENTO.values());
    for (const f of FUNCOES_V2) {
      const quadro = quadroDe(ler(f.departamentoId, `${f.id}.md`))!;
      const meu = GERENTE_DO_DEPARTAMENTO.get(f.departamentoId)!;
      for (const outro of todosOsGerentes) {
        if (outro === meu || outro === "gerente-geral") continue; // o Gerente Geral é o degrau de todos
        expect(quadro.includes(outro), `${f.id}: quadro cita "${outro}", que é de outro departamento`).toBe(false);
      }
    }
  });

  it("todo _departamento.md também carrega o quadro do seu gerente", () => {
    for (const d of DEPARTAMENTOS_V2) {
      const quadro = quadroDe(ler(d.id, "_departamento.md"));
      expect(quadro, `${d.id}: _departamento.md sem quadro de hierarquia`).not.toBeNull();
      expect(quadro!, `${d.id}: quadro não nomeia o gerente`).toContain(GERENTE_DO_DEPARTAMENTO.get(d.id)!);
    }
  });

  it("a trava acusa o caso plantado: ficha sem quadro e quadro de outro departamento", () => {
    expect(quadroDe("# Ficha sem hierarquia nenhuma\n\n## Especificação\n")).toBeNull();
    const forjado = `${TITULO}\n\nCEO → Diretor → Gerente Geral → \`manager-financeiro\` → este cargo\n\n## Fim\n`;
    expect(quadroDe(forjado)).toContain("manager-financeiro");
    expect(quadroDe(forjado)).not.toContain("manager-branding");
  });
});
