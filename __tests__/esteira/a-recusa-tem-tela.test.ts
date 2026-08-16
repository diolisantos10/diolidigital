// A RECUSA TEM TELA. Recusa sem tela é recusa invisível — e recusa invisível
// parece defeito do produto.
//
// O caso: o CEO passou meia hora achando que o sistema estava quebrado. Ele
// não estava: sabia exatamente o motivo (a chave de execução apontava para um
// clientId apagado no reset) e não contou a ninguém. Nem tela, nem log.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { donoDaRecusa, idadeEmPortugues, linhaDeRecusa, registrarRecusaVisivel, PORTA_DA_ESTEIRA, AUTORIZACAO_DA_ESTEIRA } from "@/lib/agency/esteira-assistida/recusa-visivel";

const AGORA = new Date("2026-08-16T12:00:00Z");

describe("toda recusa carrega DONO e IDADE", () => {
  it("o dono nunca é vazio — 'todo mundo' é ninguém, e é assim que a fila para", () => {
    for (const f of [PORTA_DA_ESTEIRA, AUTORIZACAO_DA_ESTEIRA, "brand-architect", "funcao-inventada"]) {
      expect(donoDaRecusa(f).trim().length).toBeGreaterThan(0);
    }
  });

  it("função de verdade aponta para o DEPARTAMENTO dela, não para um id cru", () => {
    expect(donoDaRecusa("brand-architect")).not.toBe("brand-architect");
  });

  it("a idade sai em português, e a escala muda com o tempo", () => {
    expect(idadeEmPortugues(new Date("2026-08-16T11:50:00Z"), AGORA)).toBe("há 10 min");
    expect(idadeEmPortugues(new Date("2026-08-16T04:00:00Z"), AGORA)).toBe("há 8 h");
    expect(idadeEmPortugues(new Date("2026-08-11T12:00:00Z"), AGORA)).toBe("há 5 dias");
  });

  it("a linha da tela junta motivo, dono e idade numa coisa só", () => {
    const l = linhaDeRecusa(
      { id: "r1", funcaoId: AUTORIZACAO_DA_ESTEIRA, motivo: "A esteira está DESLIGADA para \"CityJobs\".", correlationId: "porta:req1", clienteId: "cli1", em: new Date("2026-08-16T04:00:00Z") },
      AGORA,
    );
    expect(l).toMatchObject({ dono: "Direção (quem liga a chave)", idade: "há 8 h", idadeHoras: 8 });
    expect(l.motivo).toContain("CityJobs");
  });
});

describe("🔑 gravar o motivo NUNCA pode derrubar quem já estava recusando", () => {
  it("banco indisponível vira aviso no console, e a recusa segue explicada", async () => {
    const r = await registrarRecusaVisivel(
      { async criar() { throw new Error("DB unavailable"); } },
      { funcaoId: PORTA_DA_ESTEIRA, motivo: "sem agência", correlationId: "c", em: AGORA },
    );
    // Se lançasse, um banco fora do ar transformaria uma recusa explicada de
    // volta numa recusa MUDA — que é o defeito inteiro desta frente.
    expect(r.gravada).toBe(false);
  });
});

describe("a sala do PM mostra o que está parado — e lê a fila de UM lugar só", () => {
  const pagina = fs.readFileSync(path.join(process.cwd(), "app/agency/pm-command/page.tsx"), "utf8");

  it("mostra recusa, bastão no chão, briefing na porta e o que pede decisão", () => {
    expect(pagina).toMatch(/Por que não andou/);
    expect(pagina).toMatch(/Bastões no chão/);
    expect(pagina).toMatch(/Parados na porta/);
    expect(pagina).toMatch(/Pedindo DECISÃO SUA/);
  });

  it("⛔ NÃO relê a fila da porta por conta própria — usa o leitor único", () => {
    expect(pagina).toContain("quemBateuNaPorta");
    // Duas verdades adjacentes sobre a mesma fila é o defeito nº 2 do
    // incidente do Drive. A tela pergunta ao leitor; não consulta a tabela.
    expect(pagina).not.toMatch(/clientRequestDb\.findMany\([\s\S]{0,200}status:\s*"new"/);
  });

  it("o leitor único DEIXOU DE SER ÓRFÃO — ele tinha teste e zero chamadores", () => {
    const chamadores = ["app", "lib", "components"].flatMap(function varrer(dir: string): string[] {
      const raiz = path.join(process.cwd(), dir);
      if (!fs.existsSync(raiz)) return [];
      const pilha = [raiz];
      const achados: string[] = [];
      while (pilha.length) {
        const atual = pilha.pop()!;
        for (const e of fs.readdirSync(atual, { withFileTypes: true })) {
          const p = path.join(atual, e.name);
          if (e.isDirectory()) pilha.push(p);
          else if (/\.tsx?$/.test(e.name) && !p.includes("quem-bateu-na-porta.ts")) {
            if (fs.readFileSync(p, "utf8").includes("quemBateuNaPorta")) achados.push(p);
          }
        }
      }
      return achados;
    });
    expect(chamadores.length).toBeGreaterThan(0);
  });
});
