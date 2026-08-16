// A agência zerada CONTINUA zerada.
//
// O CEO zerou a agência para recomeçar do SDR e, minutos depois, viu clientes
// em Projetos, Tarefas, Entregas e Aprovações. O banco estava vazio de verdade
// — o reset funcionou. Eram duas cópias vivas fora do alcance dele:
//
//   1. O SEED. Rodava a cada deploy e recriava o cliente "Dioli Digital", o
//      projeto "Lançamento Dioli Agência" e DOZE entregas.
//   2. O NAVEGADOR. O store guardava clientes, projetos, tarefas e entregas no
//      localStorage; as telas caem nele quando a busca ao banco falha, e ele
//      devolvia o retrato de antes — a cada F5, para sempre.
//
// Nenhum botão de "zerar" no servidor alcançaria qualquer uma das duas. Este
// teste existe para que elas não voltem: é fácil, daqui a um mês, alguém
// "melhorar o cache" guardando cliente de novo, ou reativar o piloto no seed
// para testar uma tela.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ler = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("o seed não inventa cliente em produção", () => {
  const SEED = ler("prisma/seed.ts");

  it("o piloto está atrás de uma trava explícita", () => {
    expect(SEED).toContain('process.env.SEED_PILOTO === "true"');
  });

  it("a criação do cliente-piloto está DENTRO da trava", () => {
    const guarda = SEED.indexOf('process.env.SEED_PILOTO === "true"');
    const cliente = SEED.indexOf("prisma.client.upsert");
    expect(guarda).toBeGreaterThan(-1);
    expect(cliente).toBeGreaterThan(guarda);
  });

  it("workspace e equipe continuam fora da trava — sem eles ninguém entra", () => {
    const guarda = SEED.indexOf('process.env.SEED_PILOTO === "true"');
    expect(SEED.indexOf("agencyWorkspace.upsert")).toBeLessThan(guarda);
    // O master é criado antes da trava: zerar a agência não pode tirar o
    // login do CEO.
    expect(SEED.indexOf("master@dioli.studio")).toBeLessThan(guarda);
  });

  it("ausência da variável significa NÃO, como toda trava desta casa", () => {
    // Nada de `!== "false"` nem de valor padrão ligado: fail-closed.
    expect(SEED).not.toMatch(/SEED_PILOTO\s*!==\s*"false"/);
  });
});

describe("o navegador não guarda dado de cliente", () => {
  const STORE = ler("store/agency-store.ts");
  const guardado = STORE.slice(STORE.indexOf("partialize"), STORE.indexOf("version: 3"));

  // Tudo que descreve cliente ou trabalho vem do banco, sempre. Guardar no
  // navegador cria uma segunda verdade que nenhum reset do servidor alcança.
  const PROIBIDOS = [
    "clients",
    "projects",
    "tasks",
    "deliverables",
    "briefings",
    "clientRequests",
    "strategyRooms",
    "brandUpdates",
    "materialRequests",
    "activity",
    "aiRunLogs",
  ];

  for (const campo of PROIBIDOS) {
    it(`não guarda "${campo}" no navegador`, () => {
      expect(guardado).not.toMatch(new RegExp(`\\b${campo}:\\s*s\\.${campo}`));
    });
  }

  it("guarda o que é preferência de quem usa", () => {
    expect(guardado).toMatch(/locale:\s*s\.locale/);
    expect(guardado).toMatch(/currentRole:\s*s\.currentRole/);
  });

  it("sobe a versão e descarta o que já estava salvo", () => {
    // Sem isto, quem já tem a aba aberta continuaria vendo o retrato de ontem:
    // o Zustand mistura o guardado antigo com o novo em vez de descartá-lo.
    expect(STORE).toMatch(/version:\s*3/);
    expect(STORE).toContain("migrate:");
  });
});
