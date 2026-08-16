// A CHAVE DA CADEIA TÉCNICA — a rota e o adaptador que dão partida no motor.
//
// A peça anterior construiu a cadeia e a guarda de patch, e disse com todas as
// letras o que faltava: ninguém conseguia disparar nada. Esta peça é a chave.
//
// O teste guarda três coisas que uma rota de disparo tende a virar quando
// alguém tem pressa: porta dos fundos das travas, aplicador de patch, e piloto
// que se apresenta como produção.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  desembrulhar,
  faltaDeclarada,
  instrucaoDaFuncao,
} from "@/lib/agency/produto-tecnologia/adaptador-tecnico";
import { analisarPatch } from "@/lib/agency/produto-tecnologia/guarda-de-patch";
import { ORDEM_TECNICA } from "@/lib/agency/produto-tecnologia/cadeia-tecnica";
import { specDaFuncao, type SpecOperacional } from "@/lib/agency/catalogo-v2/specs";
import { donoDaChamada } from "@/lib/ai/donos";

const ROTA = fs.readFileSync(
  path.join(process.cwd(), "app/api/produto-tecnologia/cadeia/route.ts"),
  "utf8",
);

function spec(funcaoId: string): SpecOperacional {
  const r = specDaFuncao(funcaoId);
  if (!r.ok) throw new Error(r.motivo);
  return r.spec;
}

describe("a rota não é porta dos fundos das travas", () => {
  it("exige autenticação antes de tocar no banco", () => {
    const porta = ROTA.indexOf("const auth = await autenticar(request)");
    const banco = ROTA.indexOf("prisma.");
    expect(porta).toBeGreaterThan(-1);
    expect(banco).toBeGreaterThan(porta);
  });

  it("compara o segredo com timing-safe, não com `===`", () => {
    expect(ROTA).toContain("segredoConfere");
    expect(ROTA).not.toMatch(/cabecalho\s*===\s*`Bearer/);
  });

  it("roda em homologação e DIZ isso na resposta — piloto não se apresenta como pronto", () => {
    expect(ROTA).toContain('modo: "homologacao"');
    expect(ROTA).toContain("ativa: false");
  });

  it("não aplica patch: nada de `git apply`, `exec` ou escrita em disco", () => {
    // O ponto inteiro da guarda é que a proposta para em revisão. Uma linha de
    // `exec("git apply")` nesta rota desfaria a trava sem tocar na guarda.
    for (const proibido of ["git apply", "execSync", "spawn(", "writeFileSync", "node:fs"]) {
      expect(ROTA, proibido).not.toContain(proibido);
    }
    expect(ROTA).toContain("aplicado: false");
  });

  it("usa o perfil do departamento, não o da direção — a engenharia não vira atalho para o Social", () => {
    // `podeExecutarFuncao` liberaria TUDO para `director`. Com o perfil do
    // departamento, função de outra casa é negada pelo motor de permissão.
    expect(ROTA).toContain('autoridade: "department_member"');
    expect(ROTA).toContain('departamentos: ["product-technology"]');
    expect(ROTA).not.toContain('autoridade: "director"');
  });

  it("exige critério de aceite na entrada — sem ele a ficha recusa, e deve", () => {
    expect(ROTA).toContain("criteriosDeAceite");
    expect(ROTA).toMatch(/status: 400/);
  });
});

describe("o adaptador declara a falta em vez de fabricar substituto", () => {
  it("sem provedor, a saída do engenheiro NÃO passa na guarda — e é isso que se quer", () => {
    // Um "rascunho de patch" que não é diff seria um objeto que ninguém aplica
    // e ninguém revisa, com aparência de entrega. A falta declarada faz a
    // cadeia parar com o motivo verdadeiro.
    const falta = faltaDeclarada(spec("backend-engineer"), "nenhum provedor de IA configurado no ambiente");
    expect(analisarPatch(falta.saida).veredito).toBe("recusado");
    expect(falta.saida).toContain("entregue");
    expect(falta.custoUsd).toBe(0);
  });

  it("a falta ainda tem corpo suficiente para o executor registrar o passo", () => {
    // Saída curta demais o executor descarta e re-tenta — três vezes a mesma
    // falta seria ruído no rastro em vez de um motivo.
    expect(faltaDeclarada(spec("software-architect"), "provedor caiu").saida.length).toBeGreaterThan(20);
  });
});

describe("o patch sai do embrulho JSON inteiro", () => {
  const diff = "diff --git a/lib/x.ts b/lib/x.ts\n+++ b/lib/x.ts\n@@ -1 +1,2 @@\n+const y = 1;";

  it("ficha de patch devolve o diff cru, que é o que a guarda sabe ler", () => {
    expect(desembrulhar(spec("backend-engineer"), { patch: diff })).toBe(diff);
  });

  it("ficha de JSON devolve o JSON como veio", () => {
    const saida = desembrulhar(spec("software-architect"), { adr: "decisão" });
    expect(JSON.parse(saida)).toEqual({ adr: "decisão" });
  });

  it("modelo que desobedeceu não é maquiado — vira JSON e a guarda recusa", () => {
    const saida = desembrulhar(spec("backend-engineer"), { explicacao: "vou alterar o arquivo x" });
    expect(analisarPatch(saida).veredito).toBe("recusado");
  });
});

describe("a instrução carrega as amarras da própria ficha", () => {
  it("repete as ferramentas proibidas e os gatilhos de escalada, função por função", () => {
    for (const funcaoId of ORDEM_TECNICA) {
      const s = spec(funcaoId);
      const instrucao = instrucaoDaFuncao(s);
      for (const proibida of s.ferramentas_proibidas) {
        expect(instrucao, `${funcaoId} · ${proibida}`).toContain(proibida);
      }
      for (const gatilho of s.gatilhos_humanos) {
        expect(instrucao, `${funcaoId} · ${gatilho}`).toContain(gatilho);
      }
    }
  });

  it("avisa o engenheiro de que o patch não será aplicado sozinho", () => {
    expect(instrucaoDaFuncao(spec("backend-engineer"))).toContain("NÃO será aplicado automaticamente");
  });

  it("diz em toda função que não há cliente envolvido", () => {
    for (const funcaoId of ORDEM_TECNICA) {
      expect(instrucaoDaFuncao(spec(funcaoId)), funcaoId).toContain("Não há cliente envolvido");
    }
  });
});

describe("todo gasto da cadeia tem endereço", () => {
  it("as sete funções têm dono registrado, e a conta é da CASA", () => {
    // Gasto sem dono é fail-closed no adaptador (não chama IA). Aqui se cobra o
    // outro lado: que o dono exista e cobre o departamento certo — pendurar o
    // conserto do sistema num cliente faria o DRE dele pagar por isso.
    for (const funcaoId of ORDEM_TECNICA) {
      const dono = donoDaChamada(`pt-${funcaoId}`);
      expect(dono, funcaoId).not.toBeNull();
      expect(dono!.departmentId, funcaoId).toBe("product-technology");
    }
  });

  it("a chamada de IA da cadeia nunca leva clientId", () => {
    const fonte = fs.readFileSync(
      path.join(process.cwd(), "lib/agency/produto-tecnologia/adaptador-tecnico.ts"),
      "utf8",
    );
    expect(fonte).toContain("clientId: null");
    expect(fonte).not.toMatch(/clientId:\s*(opcoes|contexto)\./);
  });
});
