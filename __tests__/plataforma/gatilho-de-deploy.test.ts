// Prova das DUAS metades do filtro de build: papelada NÃO dispara, código
// dispara. Fixa o incidente de 16/08/2026 — a produção 1h parada em
// `c52aff2` porque 7 dos 7 pushes na janela do congelamento eram commit de
// um único arquivo em `reivindicacoes/`, e cada um matava o build anterior.
//
// Os padrões vêm do `railway.json` DE VERDADE (não de uma cópia fixada
// aqui): se alguém reescrever o arquivo e a proteção sumir, é este teste que
// acusa — testar contra um fixture separado deixaria o `railway.json` real
// livre para divergir sem ninguém notar.

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { disparaBuild, lerPadroesDoRailway } from "@/lib/plataforma/gatilho-de-deploy";

const padroes = lerPadroesDoRailway();

function dispara(arquivo: string): boolean {
  return disparaBuild([arquivo], padroes);
}

describe("o railway.json real: os padrões continuam sãos", () => {
  it("começa por ** — senão as negações não funcionam (regra do Railway)", () => {
    expect(padroes[0]).toBe("**");
  });

  it("o bloco deploy existente continua lá — ninguém derrubou o healthcheck sem perceber", () => {
    const bruto = fs.readFileSync(path.join(process.cwd(), "railway.json"), "utf-8");
    const json = JSON.parse(bruto) as {
      deploy?: {
        healthcheckPath?: string;
        healthcheckTimeout?: number;
        restartPolicyType?: string;
        restartPolicyMaxRetries?: number;
        overlapSeconds?: number;
      };
    };
    expect(json.deploy?.healthcheckPath).toBe("/api/health");
    expect(json.deploy?.healthcheckTimeout).toBe(120);
    expect(json.deploy?.restartPolicyType).toBe("ON_FAILURE");
    expect(json.deploy?.restartPolicyMaxRetries).toBe(3);
    expect(json.deploy?.overlapSeconds).toBe(5);
  });
});

describe("barra o problema plantado: papelada NÃO dispara build", () => {
  it.each([
    "reivindicacoes/seguranca-csrf-rotas-de-escrita.json",
    "reivindicacoes/fila-irmao-fora-do-teto.json",
    "reivindicacoes/seguranca-csrf-varredura-da-casa.json",
    "reivindicacoes/plataforma-ci-concorrencia.json",
    "reivindicacoes/registro-dia-16-08-pm-a27b.json",
    "reivindicacoes/esteira-percurso-ponta-a-ponta.json",
    // 7 entregas, 6 arquivos distintos: `registro-dia-16-08-pm-a27b.json`
    // apareceu duas vezes (538ad53e criou a reivindicação, d3f6ceea encerrou).
  ])("os commits reais do congelamento, um arquivo cada: %s", (arquivo) => {
    expect(dispara(arquivo)).toBe(false);
  });

  it("docs/pendencias.md sozinho", () => {
    expect(dispara("docs/pendencias.md")).toBe(false);
  });

  it("docs/decisoes.md sozinho", () => {
    expect(dispara("docs/decisoes.md")).toBe(false);
  });

  it("docs/decisoes.md + reivindicacoes/x.json juntos", () => {
    expect(disparaBuild(["docs/decisoes.md", "reivindicacoes/x.json"], padroes)).toBe(false);
  });

  it.each(["CLAUDE.md", "README.md", "BACKLOG.md"])("%s na raiz", (arquivo) => {
    expect(dispara(arquivo)).toBe(false);
  });
});

describe("não inventa problema no caso limpo: código DISPARA build", () => {
  it.each([
    "app/api/health/route.ts",
    "lib/agency/question-engine.ts",
    "components/agency/briefing/PublicBriefingRoom.tsx",
    "package.json",
    "package-lock.json",
    "prisma/schema.prisma",
    ".github/workflows/ci.yml",
  ])("%s", (arquivo) => {
    expect(dispara(arquivo)).toBe(true);
  });

  it("misto: papelada junto de código TEM que subir — é o caso do push agrupado", () => {
    expect(disparaBuild(["reivindicacoes/x.json", "lib/agency/y.ts"], padroes)).toBe(true);
  });

  it("ficha de agente é lida pelo CI e por lib/agency — NÃO é papelada, mesmo terminando em .md", () => {
    expect(dispara("agentes/linha/product-technology/backend-engineer.md")).toBe(true);
  });

  it("fail-safe: diretório que ainda não existe dispara — prova que é denylist, não allowlist", () => {
    expect(dispara("diretorio-que-ainda-nao-existe/arquivo.ts")).toBe(true);
  });
});

describe("disparaBuild — casos de borda do próprio matcher", () => {
  it("lista vazia de arquivos nunca dispara — não há o que construir", () => {
    expect(disparaBuild([], padroes)).toBe(false);
  });
});
