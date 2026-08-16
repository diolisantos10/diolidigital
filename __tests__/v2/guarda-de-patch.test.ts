// A GUARDA DO PATCH — o teste do "não".
//
// POR QUE ELE EXISTE: em 16/08/2026 o CEO mandou dar mãos ao 12º departamento
// ("a agência precisa passar a consertar a si mesma"). Mão sem trava é o
// defeito, não o conserto — e trava que ninguém testou é trava cuja existência
// ninguém conferiu. Este arquivo prova cada recusa com um patch de verdade.
//
// Cada caso abaixo é um jeito conhecido de um patch causar dano que não volta:
// apagar coluna do banco vivo do piloto, mexer em deploy, reescrever a própria
// ficha (e com ela a própria autonomia), desarmar o guarda, vazar segredo.

import { describe, it, expect } from "vitest";
import { analisarPatch, arquivosDoPatch, GATILHOS_DAS_FICHAS } from "@/lib/agency/produto-tecnologia/guarda-de-patch";

/** Monta um patch mínimo porém realista — cabeçalho, hunk e linhas. */
function patchDe(arquivo: string, adiciona: string[] = ["const x = 1;"], remove: string[] = []): string {
  return [
    `diff --git a/${arquivo} b/${arquivo}`,
    `index 1111111..2222222 100644`,
    `--- a/${arquivo}`,
    `+++ b/${arquivo}`,
    `@@ -1,3 +1,4 @@`,
    ` contexto inalterado`,
    ...remove.map((l) => `-${l}`),
    ...adiciona.map((l) => `+${l}`),
  ].join("\n");
}

describe("a guarda do patch aceita o que é revisável", () => {
  it("aceita um patch comum e diz com todas as letras que NÃO aplicou", () => {
    const analise = analisarPatch(patchDe("lib/agency/pulso.ts"));
    expect(analise.veredito).toBe("aceito");
    expect(analise.arquivos).toEqual(["lib/agency/pulso.ts"]);
    expect(analise.motivo).toContain("não é aplicado");
  });

  it("lê o arquivo de destino tanto do `diff --git` quanto do `+++ b/`", () => {
    expect(arquivosDoPatch(patchDe("app/page.tsx"))).toEqual(["app/page.tsx"]);
  });

  it("deixa passar mudança ADITIVA no schema, que é o que a ficha do backend permite", () => {
    const analise = analisarPatch(patchDe("prisma/schema.prisma", ["  apelido String?"]));
    expect(analise.veredito).toBe("aceito");
    // Passa, mas não passa calado: o revisor precisa saber que mexeu no banco.
    expect(analise.avisos.join(" ")).toContain("aditiva");
  });
});

describe("a guarda do patch para o que não tem desfazer", () => {
  it("escala quando o patch ACRESCENTA um DROP COLUMN — o piloto roda em banco vivo", () => {
    const analise = analisarPatch(
      patchDe("prisma/migrations/20260816_x/migration.sql", ["ALTER TABLE Client DROP COLUMN email;"]),
    );
    expect(analise.veredito).toBe("escalado");
    expect(analise.gatilhos).toContain(GATILHOS_DAS_FICHAS.migracaoDestrutiva);
  });

  it("NÃO escala quando o patch REMOVE um DROP — quem tira a bomba está consertando", () => {
    // O caso que uma busca ingênua por palavra erraria: casar "DROP" sem olhar
    // o sinal transformaria o conserto em bloqueio, e a trava perderia crédito.
    const analise = analisarPatch(
      patchDe("scripts/limpeza.sql", ["-- limpeza removida"], ["TRUNCATE TABLE Client;"]),
    );
    expect(analise.veredito).toBe("aceito");
  });

  it("escala quando o schema PERDE linhas — retirada é o que não volta", () => {
    const analise = analisarPatch(patchDe("prisma/schema.prisma", [], ["  email String?"]));
    expect(analise.veredito).toBe("escalado");
    expect(analise.gatilhos).toContain(GATILHOS_DAS_FICHAS.migracaoDestrutiva);
  });

  it("escala quando o patch mexe em deploy — nenhuma das sete fichas permite publicar", () => {
    for (const arquivo of ["railway.json", "Dockerfile", ".github/workflows/ci.yml", "scripts/start.sh"]) {
      expect(analisarPatch(patchDe(arquivo)).veredito, arquivo).toBe("escalado");
    }
  });
});

describe("a guarda do patch impede o agente de mexer nas próprias amarras", () => {
  it("escala quando o patch edita ficha de agente — contrato não se reescreve por dentro", () => {
    const analise = analisarPatch(
      patchDe("agentes/linha/product-technology/backend-engineer.md", ['  "autonomia": "C",']),
    );
    expect(analise.veredito).toBe("escalado");
    expect(analise.motivo).toContain("ficha de agente");
  });

  it("escala quando o patch mexe na guarda ou nas permissões — o vigiado não altera o vigia", () => {
    for (const arquivo of [
      "lib/agency/produto-tecnologia/guarda-de-patch.ts",
      "lib/agency/produto-tecnologia/permissoes.ts",
    ]) {
      const analise = analisarPatch(patchDe(arquivo));
      expect(analise.veredito, arquivo).toBe("escalado");
      expect(analise.gatilhos, arquivo).toContain(GATILHOS_DAS_FICHAS.seguranca);
    }
  });
});

describe("a guarda do patch recusa em vez de escalar quando é segredo", () => {
  it("recusa arquivo de ambiente e material de chave — isso não sobe para revisão, isso não existe", () => {
    for (const arquivo of [".env", ".env.production", "certs/servidor.pem", "credentials"]) {
      expect(analisarPatch(patchDe(arquivo)).veredito, arquivo).toBe("recusado");
    }
  });
});

describe("a guarda do patch recusa saída que mentiu sobre o formato", () => {
  it("recusa texto que não é diff, mesmo bem escrito", () => {
    const analise = analisarPatch("Vou alterar o arquivo lib/x.ts para corrigir o bug do briefing.");
    expect(analise.veredito).toBe("recusado");
    expect(analise.motivo).toContain("git-patch");
  });

  it("recusa string vazia", () => {
    expect(analisarPatch("").veredito).toBe("recusado");
  });

  it("escala patch grande demais — proposta que ninguém revisa é aplicação automática disfarçada", () => {
    const gigante = Array.from({ length: 30 }, (_, i) => patchDe(`lib/arquivo-${i}.ts`)).join("\n");
    const analise = analisarPatch(gigante);
    expect(analise.veredito).toBe("escalado");
    expect(analise.motivo).toContain("pedaços revisáveis");
  });
});
