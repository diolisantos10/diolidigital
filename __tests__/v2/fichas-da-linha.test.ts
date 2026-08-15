// FICHA PARA TODA FUNÇÃO — o "finalizei" do CEO como teste, não como promessa.
//
// Missão do Agente de Fichas (Control Room, D-003 simplificada): todo cargo
// que opera num produto tem descrição de cargo. Este teste amarra a missão ao
// catálogo: função nova no manifesto SEM ficha reprova a rodada — a ficha
// nasce junto com o cargo, nunca depois.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { DEPARTAMENTOS_V2, FUNCOES_V2 } from "@/lib/agency/catalogo-v2/catalogo";

const RAIZ = path.join(process.cwd(), "agentes/linha");

describe("fichas da linha — cobertura total do catálogo", () => {
  it("TODA função do catálogo (62) tem ficha em agentes/linha/<dep>/<funcao>.md", () => {
    const semFicha: string[] = [];
    for (const f of FUNCOES_V2) {
      const caminho = path.join(RAIZ, f.departamentoId, `${f.id}.md`);
      if (!fs.existsSync(caminho)) semFicha.push(`${f.departamentoId}/${f.id}`);
    }
    expect(semFicha, `funções sem descrição de cargo: ${semFicha.join(", ")}`).toEqual([]);
  });

  it("TODO departamento (11) tem a ficha de blocos comuns (_departamento.md)", () => {
    for (const d of DEPARTAMENTOS_V2) {
      expect(
        fs.existsSync(path.join(RAIZ, d.id, "_departamento.md")),
        `departamento ${d.id} sem ficha de blocos comuns`,
      ).toBe(true);
    }
  });

  it("não existe ficha órfã — arquivo sem função correspondente no catálogo", () => {
    const idsDoCatalogo = new Set(FUNCOES_V2.map((f) => `${f.departamentoId}/${f.id}`));
    const orfas: string[] = [];
    for (const dep of fs.readdirSync(RAIZ)) {
      const depDir = path.join(RAIZ, dep);
      if (!fs.statSync(depDir).isDirectory()) continue;
      for (const arquivo of fs.readdirSync(depDir)) {
        if (arquivo === "_departamento.md" || !arquivo.endsWith(".md")) continue;
        const id = `${dep}/${arquivo.replace(/\.md$/, "")}`;
        if (!idsDoCatalogo.has(id)) orfas.push(id);
      }
    }
    expect(orfas, `fichas órfãs (catálogo mudou?): ${orfas.join(", ")}`).toEqual([]);
  });

  it("toda ficha de função tem o essencial: missão, entregável, recusa e registro humano/IA", () => {
    for (const f of FUNCOES_V2) {
      const conteudo = fs.readFileSync(path.join(RAIZ, f.departamentoId, `${f.id}.md`), "utf8");
      for (const obrigatorio of ["Missão", "Entregável concreto", "O que recusa", "Escalada", "ExecucaoV2"]) {
        expect(conteudo, `${f.id} sem campo "${obrigatorio}"`).toContain(obrigatorio);
      }
    }
  });
});
