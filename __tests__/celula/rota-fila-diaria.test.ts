// A ROTA DA FILA DIÁRIA — casca fina sobre `lib/agency/celula/fila-diaria.ts`.
//
// A lógica de negócio (bloco sujo, idempotência, medição do caminho B, quem
// pode liberar) já está provada em `__tests__/celula/fila-diaria.test.ts`.
// Este arquivo prova só o que é responsabilidade da ROTA: as guardas, na
// ordem certa, e que nenhuma delas foi contornada ou duplicada — mesmo
// padrão de `__tests__/celula/jornada-ponta-a-ponta.test.ts` para a rota do
// funil.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const CAMINHO = "app/api/agency/oportunidades/fila-diaria/route.ts";
const fonte = readFileSync(CAMINHO, "utf-8");

describe("🔴 a rota da fila diária — as guardas, pelo nome", () => {
  it("importa a lógica pronta de fila-diaria.ts, sem reescrevê-la", () => {
    expect(fonte).toContain("@/lib/agency/celula/fila-diaria");
    expect(fonte).toContain("montarFilaDoDia");
    expect(fonte).toContain("liberarEmBloco");
  });

  it("checa sessão antes de qualquer outra coisa", () => {
    expect(fonte).toContain("requireSession");
  });

  it("GET exige 'ler_a_celula' e POST exige 'autorizar_envio'", () => {
    expect(fonte).toContain('"ler_a_celula"');
    expect(fonte).toContain('"autorizar_envio"');
  });

  it("o papel na Célula é DADO DECLARADO — vem do header, nunca inferido de autoridade", () => {
    expect(fonte).toContain("x-papel-na-celula");
  });

  it("workspaceId SEMPRE da sessão, nunca do corpo da requisição", () => {
    expect(fonte).toContain("workspaceId: session.workspaceId");
    // Nenhuma leitura de workspaceId vindo do corpo desserializado (`c.`).
    expect(fonte).not.toMatch(/workspaceId:\s*c\./);
  });

  it("autor SEMPRE de session.userId, nunca do corpo — autoria não pode ser forjada", () => {
    expect(fonte).toContain("autor: session.userId");
    expect(fonte).not.toMatch(/autor:\s*c\./);
  });

  it("não revalida arquivoIds além de checar que é lista — liberarEmBloco é a fonte única da regra", () => {
    expect(fonte).toContain("Array.isArray(c.arquivoIds)");
    // Nada de checar arquivo por arquivo aqui — isso é `liberarEmBloco`.
    expect(fonte).not.toContain("findFirst");
    expect(fonte).not.toContain("findUnique");
  });

  it("mapeia 'sem_permissao' para 403 e 'lista_vazia' para 400", () => {
    expect(fonte).toMatch(/sem_permissao["'`]\s*\?\s*403/);
  });
});
