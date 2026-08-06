// O NÚMERO DO P0 DA CASA, DERIVADO DO CÓDIGO.
//
// O P0 é citado em prosa em pelo menos cinco lugares (CLAUDE.md,
// docs/pendencias.md, docs/agents/qualidade/vitrine.md, docs/onboarding-pm.md,
// o cabeçalho de lib/agency/execution/piso-de-verdade.ts). Número escrito à mão
// em documento não é derivado do código e envelhece errado — e uma lista P0 com
// item fantasma nasce mentindo, exatamente como o gate que ela denuncia.
//
// Este teste é a fonte: se alguém tornar uma checagem executável (que é o
// objetivo) ou acrescentar uma nova, ele quebra e força a atualização da prosa
// junto. É a única forma de o número parar de ser folclore.
//
// ── ATUALIZADO NA ONDA 0 (06/08/2026) ────────────────────────────────────────
// Eram 31 checagens e "3 executáveis". Os dois números estavam errados, e por
// motivos opostos:
//   • faltava `projections_anchored`, que existia SÓ na segunda lista
//     (`quality-canvas.ts`) e rodava — 31 viraram 32 ao fundir os registros;
//   • as "3 executáveis" não executavam nada (`getBlockingChecks` não tinha
//     chamador), e ao mesmo tempo havia checagem CONSTRUÍDA declarada como não
//     executável (`quality_audit_impartial`). A flag mentia nas duas direções.
// O número honesto agora não é a flag: é `mecanismo` com caminho de arquivo que
// este teste confere que EXISTE.

import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  ALL_QUALITY_GATES,
  GLOBAL_QUALITY_GATE,
  getQualityGateForDepartment,
  getBlockingChecks,
  retratoDosPortoes,
  idCanonicoDePortao,
} from "@/lib/dioli-brain/quality-gates";
import { GLOBAL_AUDIT_CHECKS } from "@/lib/dioli-brain/quality-canvas";

const TODAS = Object.values(ALL_QUALITY_GATES).flat();
const RAIZ = resolve(__dirname, "../..");

describe("o número do P0 — conferido em 06/08/2026, depois da Onda 0", () => {
  it("são 32 checagens declaradas, 7 com mecanismo, 25 com lacuna declarada", () => {
    const r = retratoDosPortoes();
    expect(r.total).toBe(32);
    expect(r.comMecanismo).toBe(7);
    expect(r.comLacuna).toBe(25);
    expect(r.comMecanismo + r.comLacuna).toBe(r.total);
  });

  it("as 7 com mecanismo são estas — nomeadas, para ninguém contar de memória", () => {
    expect(TODAS.filter((c) => c.autoCheckable).map((c) => c.id).sort()).toEqual([
      "approval_verified",
      "evidence_path",
      "no_hallucination",
      "pm_deadline",
      "pm_task_owner",
      "projections_anchored",
      "quality_audit_impartial",
    ]);
  });

  it("nenhum id repetido — repetição inflaria a contagem sem inflar a proteção", () => {
    const ids = TODAS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("as 4 bloqueantes globais sem mecanismo seguem descobertas — é o P0 aberto", () => {
    // Enquanto este teste passar, o P0 está aberto: marca, briefing, valor ao
    // cliente e riscos são exatamente as falhas que chegam no cliente.
    const bloqueantesDescobertas = GLOBAL_QUALITY_GATE.filter((c) => c.blocking && !c.autoCheckable);
    expect(bloqueantesDescobertas.map((c) => c.id)).toEqual([
      "respects_brand",
      "matches_briefing",
      "client_value_clear",
      "risk_checked",
    ]);
  });

  it("todo departamento carrega as 8 globais + as suas", () => {
    for (const [dept, proprias] of Object.entries(ALL_QUALITY_GATES)) {
      if (dept === "global") continue;
      expect(getQualityGateForDepartment(dept).length, dept).toBe(GLOBAL_QUALITY_GATE.length + proprias.length);
    }
    expect(GLOBAL_QUALITY_GATE.length).toBe(8);
  });

  it("getBlockingChecks devolve só bloqueante — e agora tem para quem devolver", () => {
    const b = getBlockingChecks("project-management");
    expect(b.every((c) => c.blocking)).toBe(true);
    expect(b.map((c) => c.id)).toContain("pm_task_owner");
    expect(b.map((c) => c.id)).toContain("pm_deadline");
  });
});

describe("Onda 0 — não existe mais um segundo registro", () => {
  it("o avaliador que roda usa EXATAMENTE as globais do registro, na mesma ordem", () => {
    // Era aqui que os dois documentos divergiam. Se alguém recriar a segunda
    // lista à mão, este teste é o que quebra.
    expect(GLOBAL_AUDIT_CHECKS.map((c) => c.id)).toEqual(GLOBAL_QUALITY_GATE.map((c) => c.id));
    expect(GLOBAL_AUDIT_CHECKS.map((c) => c.blocking)).toEqual(GLOBAL_QUALITY_GATE.map((c) => c.blocking));
  });

  it("os ids antigos ainda são legíveis — relatório gravado antes de 06/08 não vira órfão", () => {
    expect(idCanonicoDePortao("clear_client_value")).toBe("client_value_clear");
    expect(idCanonicoDePortao("approval_need_checked")).toBe("approval_verified");
    expect(idCanonicoDePortao("evidence_path_defined")).toBe("evidence_path");
    // E o id canônico passa direto, sem tradução — a tabela não pode virar
    // caminho obrigatório para quem já está certo.
    expect(idCanonicoDePortao("no_hallucination")).toBe("no_hallucination");
  });
});

describe("a declaração não pode envelhecer", () => {
  it("toda checagem declara mecanismo OU lacuna — nunca nenhum, nunca os dois", () => {
    for (const c of TODAS) {
      const temMecanismo = "mecanismo" in c && !!c.mecanismo;
      const temLacuna = "lacuna" in c && !!c.lacuna;
      expect(temMecanismo || temLacuna, `${c.id} não declarou nada`).toBe(true);
      expect(temMecanismo && temLacuna, `${c.id} declarou os dois`).toBe(false);
      expect(temMecanismo, `${c.id}: autoCheckable e mecanismo têm que concordar`).toBe(c.autoCheckable);
    }
  });

  it("o arquivo de todo mecanismo EXISTE no repositório", () => {
    // A metade que impede a decadência: metadado apontando para arquivo
    // inexistente é a flag `autoCheckable: true` sem runner com outra roupa.
    for (const c of TODAS) {
      if (!c.autoCheckable) continue;
      expect(existsSync(resolve(RAIZ, c.mecanismo.onde)), `${c.id} → ${c.mecanismo.onde}`).toBe(true);
    }
  });

  it("toda lacuna tem motivo, dono e prazo — 'depois' sem dono é para sempre", () => {
    for (const c of TODAS) {
      if (c.autoCheckable) continue;
      expect(c.lacuna.motivo.length, c.id).toBeGreaterThan(20);
      expect(c.lacuna.dono.length, c.id).toBeGreaterThan(2);
      expect(c.lacuna.prazo, c.id).toMatch(/Onda \d/);
    }
  });
});
