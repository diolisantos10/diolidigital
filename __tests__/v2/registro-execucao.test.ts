// REGISTRO DE EXECUÇÃO — a determinação do CEO vira validação, não intenção.

import { describe, it, expect } from "vitest";
import { validarRegistro, type RegistroDeExecucao } from "@/lib/agency/execucao-v2/registro";

function base(extra: Partial<RegistroDeExecucao> = {}): RegistroDeExecucao {
  return {
    ator: "ia",
    modelo: "claude",
    versaoModelo: "sonnet-4-5",
    custoUsd: 0.12,
    funcaoId: "copywriter",
    departamentoId: "social-media",
    ferramentas: ["provider-registry"],
    correlationId: "c-1",
    inicio: new Date("2026-08-15T10:00:00Z"),
    ...extra,
  };
}

describe("validarRegistro — humano ou IA, com todas as letras", () => {
  it("registro de IA completo é válido — inclusive custo zero declarado", () => {
    expect(validarRegistro(base())).toEqual({ valido: true });
    expect(validarRegistro(base({ custoUsd: 0 }))).toEqual({ valido: true });
  });

  it("IA sem modelo, sem versão ou sem custo é recusada com o motivo", () => {
    expect(validarRegistro(base({ modelo: undefined })).valido).toBe(false);
    expect(validarRegistro(base({ versaoModelo: undefined })).valido).toBe(false);
    expect(validarRegistro(base({ custoUsd: undefined })).valido).toBe(false);
    expect(validarRegistro(base({ custoUsd: -1 })).valido).toBe(false);
  });

  it("humano exige usuarioId — 'alguém fez' não é registro", () => {
    expect(validarRegistro(base({ ator: "humano", usuarioId: undefined })).valido).toBe(false);
    expect(
      validarRegistro(base({ ator: "humano", usuarioId: "u1", modelo: undefined, versaoModelo: undefined, custoUsd: undefined })),
    ).toEqual({ valido: true });
  });

  it("sem função, departamento ou correlationId não entra", () => {
    expect(validarRegistro(base({ funcaoId: "" })).valido).toBe(false);
    expect(validarRegistro(base({ departamentoId: "" })).valido).toBe(false);
    expect(validarRegistro(base({ correlationId: "" })).valido).toBe(false);
  });

  it("fim antes do início é recusado", () => {
    expect(validarRegistro(base({ fim: new Date("2026-08-15T09:00:00Z") })).valido).toBe(false);
  });
});
