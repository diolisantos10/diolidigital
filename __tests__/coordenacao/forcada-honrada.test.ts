// A saída de emergência que abre (28/08/2026) — `--forcar --motivo` de
// verdade HONRADO pelo mecanismo de colisão.
//
// ── O DEFEITO QUE ESTE ARQUIVO EXISTE PARA MATAR ───────────────────────────
// `forcadaPor` era gravado, validado e impresso — mas `conferirColisao` (o
// que o gancho pre-push chama) e `conferirRegistro` (o sentinela de
// `npm test`) NUNCA o consultavam. Quem forçava ficava preso dos dois lados:
// deixar a reivindicação aberta reprovava a suíte; tentar empurrar o commit
// era barrado pelo gancho. A saída de emergência não tinha saída.
//
// O conserto: `forcadaPor` ganha `contra` (os `quem` contra os quais a força
// foi exercida — nunca inventado, sempre igual ao `quemColidiu` que a própria
// colisão já calculou). Uma colisão só é HONRADA quando o lado que forçou
// nomeia, em `contra`, o lado contra o qual forçou. Força sem `contra`
// (legada) ou com `motivo` vazio NUNCA honra — a proteção não afrouxou para
// ninguém que não tenha, de fato, forçado nomeadamente contra o outro lado.
//
// Um teste por caminho descrito na ficha de despacho — cada um tem que
// falhar se o conserto for revertido.

import { describe, expect, it } from "vitest";
import {
  conferirColisao,
  conferirRegistro,
  normalizarResponsabilidade,
  validarReivindicacao,
  type Reivindicacao,
} from "@/lib/coordenacao/reivindicacoes";

const AGORA = new Date("2026-08-28T18:00:00Z");

/** Mesmo helper do arquivo irmão (`reivindicacoes.test.ts`) — campo a campo,
 *  sem `...spread` no final por causa de `Partial<T> | undefined`. */
function reivindicacao(
  parcial: Partial<Reivindicacao> & Pick<Reivindicacao, "quem" | "responsabilidade" | "arquivos">,
): Reivindicacao {
  return {
    id: parcial.id ?? normalizarResponsabilidade(parcial.responsabilidade),
    quem: parcial.quem,
    frente: parcial.frente ?? "(frente de teste)",
    responsabilidade: parcial.responsabilidade,
    arquivos: parcial.arquivos,
    abertaEm: parcial.abertaEm ?? AGORA.toISOString(),
    encerradaEm: parcial.encerradaEm ?? null,
    forcadaPor: parcial.forcadaPor,
  };
}

describe("1. colisão COMUM (sem força) — a proteção não afrouxou", () => {
  it("sentinela fica VERMELHO e conferirColisao.colide é verdadeiro", () => {
    const a = reivindicacao({
      quem: "ses-eu",
      frente: "minha frente",
      responsabilidade: "coordenacao/sentinela-vs-forcada",
      arquivos: ["lib/coordenacao/reivindicacoes.ts"],
    });
    const b = reivindicacao({
      quem: "ses-outra-sessao",
      frente: "outra frente",
      responsabilidade: "coordenacao/sentinela-vs-forcada-2",
      arquivos: ["lib/coordenacao/reivindicacoes.ts"],
    });

    const registro = conferirRegistro([a, b], AGORA);
    expect(registro.ok).toBe(false);
    expect(registro.problemas).toHaveLength(1);
    expect(registro.forcadas).toHaveLength(0);

    const colisao = conferirColisao(
      { quem: b.quem, responsabilidade: b.responsabilidade, arquivos: b.arquivos },
      [a],
      AGORA,
    );
    expect(colisao.colide).toBe(true);
    expect(colisao.forcadas).toHaveLength(0);
  });
});

describe("2. colisão FORÇADA com motivo e `contra` correto — sentinela VERDE, nomeada", () => {
  it("conferirRegistro: ok true, problemas vazio, forcadas nomeia quem/contra/motivo", () => {
    const a = reivindicacao({
      quem: "ses-eu",
      frente: "minha frente",
      responsabilidade: "coordenacao/sentinela-vs-forcada",
      arquivos: ["lib/coordenacao/reivindicacoes.ts"],
      forcadaPor: { quem: "ses-eu", motivo: "preciso seguir apesar da colisão", em: "2026-08-28T17:00:00Z", contra: ["ses-outra-sessao"] },
    });
    const b = reivindicacao({
      quem: "ses-outra-sessao",
      frente: "outra frente",
      responsabilidade: "coordenacao/sentinela-vs-forcada-2",
      arquivos: ["lib/coordenacao/reivindicacoes.ts"],
    });

    const registro = conferirRegistro([a, b], AGORA);
    expect(registro.ok).toBe(true);
    expect(registro.problemas).toHaveLength(0);
    expect(registro.forcadas).toHaveLength(1);
    expect(registro.forcadas[0]).toContain("ses-eu");
    expect(registro.forcadas[0]).toContain("ses-outra-sessao");
    expect(registro.forcadas[0]).toContain("preciso seguir apesar da colisão");
  });

  it("a mesma checagem funciona não importa a ORDEM do par (a, b) no laço", () => {
    const forcada = reivindicacao({
      quem: "ses-outra-sessao",
      responsabilidade: "coordenacao/sentinela-vs-forcada-2",
      arquivos: ["lib/coordenacao/reivindicacoes.ts"],
      forcadaPor: { quem: "ses-outra-sessao", motivo: "força pelo outro lado do par", em: "2026-08-28T17:00:00Z", contra: ["ses-eu"] },
    });
    const semForca = reivindicacao({
      quem: "ses-eu",
      responsabilidade: "coordenacao/sentinela-vs-forcada",
      arquivos: ["lib/coordenacao/reivindicacoes.ts"],
    });

    // `semForca` entra PRIMEIRO no array — "a" é quem não forçou, "b" é quem
    // forçou. Se a checagem só olhasse `a.forcadaPor`, isto voltaria a barrar.
    const registro = conferirRegistro([semForca, forcada], AGORA);
    expect(registro.ok).toBe(true);
    expect(registro.forcadas[0]).toContain("ses-outra-sessao");
    expect(registro.forcadas[0]).toContain("ses-eu");
  });
});

describe("3. o mesmo caminho no pre-push — conferirColisao com forcadasDoAutor", () => {
  it("colide false, e forcadas nomeia tudo", () => {
    const existente = reivindicacao({
      quem: "ses-outra-sessao",
      frente: "frente alheia",
      responsabilidade: "coordenacao/reivindicacoes-ts",
      arquivos: ["lib/coordenacao/reivindicacoes.ts"],
    });
    // A reivindicação da PRÓPRIA sessão, já gravada no registro remoto, com a
    // força documentada — é isso que `comandoConferir` monta como
    // `forcadasDoAutor` a partir de `existentes.filter(quem === quem)`.
    const minhaForcada = reivindicacao({
      quem: "ses-eu",
      responsabilidade: "coordenacao/minha-frente-forcada",
      arquivos: ["lib/coordenacao/portao-de-push.ts"],
      forcadaPor: { quem: "ses-eu", motivo: "preciso empurrar apesar da colisão", em: "2026-08-28T17:30:00Z", contra: ["ses-outra-sessao"] },
    });

    // A "nova" do gancho pre-push é uma proposta-isca (só arquivos, sem
    // `forcadaPor`) — exatamente o desenho de `comandoConferir`.
    const propostaIsca = {
      quem: "ses-eu",
      responsabilidade: "__conferir-apenas-arquivos__/000",
      arquivos: ["lib/coordenacao/reivindicacoes.ts"],
    };

    const resultado = conferirColisao(propostaIsca, [existente], AGORA, 24, [minhaForcada]);
    expect(resultado.colide).toBe(false);
    expect(resultado.motivos).toHaveLength(0);
    expect(resultado.quemColidiu).toHaveLength(0);
    expect(resultado.forcadas).toHaveLength(1);
    expect(resultado.forcadas[0]).toContain("ses-eu");
    expect(resultado.forcadas[0]).toContain("ses-outra-sessao");
    expect(resultado.forcadas[0]).toContain("preciso empurrar apesar da colisão");
  });

  it("assinatura antiga (sem forcadasDoAutor) continua igual — retrocompatível", () => {
    const existente = reivindicacao({
      quem: "ses-outra-sessao",
      responsabilidade: "coordenacao/reivindicacoes-ts",
      arquivos: ["lib/coordenacao/reivindicacoes.ts"],
    });
    const proposta = { quem: "ses-eu", responsabilidade: "qualquer/coisa", arquivos: ["lib/coordenacao/reivindicacoes.ts"] };

    const resultado = conferirColisao(proposta, [existente], AGORA);
    expect(resultado.colide).toBe(true);
    expect(resultado.forcadas).toHaveLength(0);
  });
});

describe("4. forçada com `contra` que NÃO inclui o outro lado — continua BLOQUEANDO", () => {
  it("conferirRegistro reprova, forcadas fica vazio", () => {
    const a = reivindicacao({
      quem: "ses-eu",
      responsabilidade: "coordenacao/sentinela-vs-forcada",
      arquivos: ["lib/coordenacao/reivindicacoes.ts"],
      forcadaPor: { quem: "ses-eu", motivo: "forcei contra alguém que não é este par", em: "2026-08-28T17:00:00Z", contra: ["ses-um-terceiro-qualquer"] },
    });
    const b = reivindicacao({
      quem: "ses-outra-sessao",
      responsabilidade: "coordenacao/sentinela-vs-forcada-2",
      arquivos: ["lib/coordenacao/reivindicacoes.ts"],
    });

    const registro = conferirRegistro([a, b], AGORA);
    expect(registro.ok).toBe(false);
    expect(registro.problemas).toHaveLength(1);
    expect(registro.forcadas).toHaveLength(0);
  });

  it("conferirColisao (pre-push) também continua colidindo", () => {
    const existente = reivindicacao({
      quem: "ses-outra-sessao",
      responsabilidade: "coordenacao/reivindicacoes-ts",
      arquivos: ["lib/coordenacao/reivindicacoes.ts"],
    });
    const minhaForcadaContraOutroAlvo = reivindicacao({
      quem: "ses-eu",
      responsabilidade: "coordenacao/minha-frente-forcada",
      arquivos: ["lib/coordenacao/portao-de-push.ts"],
      forcadaPor: { quem: "ses-eu", motivo: "forcei contra um terceiro", em: "2026-08-28T17:30:00Z", contra: ["ses-um-terceiro-qualquer"] },
    });
    const propostaIsca = { quem: "ses-eu", responsabilidade: "__conferir__/x", arquivos: ["lib/coordenacao/reivindicacoes.ts"] };

    const resultado = conferirColisao(propostaIsca, [existente], AGORA, 24, [minhaForcadaContraOutroAlvo]);
    expect(resultado.colide).toBe(true);
    expect(resultado.forcadas).toHaveLength(0);
  });
});

describe("5. forçada LEGADA (sem `contra`) — continua BLOQUEANDO", () => {
  it("conferirRegistro reprova o par mesmo com forcadaPor presente", () => {
    const a = reivindicacao({
      quem: "ses-eu",
      responsabilidade: "coordenacao/sentinela-vs-forcada",
      arquivos: ["lib/coordenacao/reivindicacoes.ts"],
      // Legada: `forcadaPor` sem `contra` — igual às 4 reivindicações reais
      // do registro de antes de 28/08/2026.
      forcadaPor: { quem: "ses-eu", motivo: "força de antes do campo contra existir", em: "2026-08-16T10:00:00Z" },
    });
    const b = reivindicacao({
      quem: "ses-outra-sessao",
      responsabilidade: "coordenacao/sentinela-vs-forcada-2",
      arquivos: ["lib/coordenacao/reivindicacoes.ts"],
    });

    const registro = conferirRegistro([a, b], AGORA);
    expect(registro.ok).toBe(false);
    expect(registro.forcadas).toHaveLength(0);
  });

  it("conferirColisao (pre-push) também continua colidindo com forcadasDoAutor legada", () => {
    const existente = reivindicacao({
      quem: "ses-outra-sessao",
      responsabilidade: "coordenacao/reivindicacoes-ts",
      arquivos: ["lib/coordenacao/reivindicacoes.ts"],
    });
    const minhaForcadaLegada = reivindicacao({
      quem: "ses-eu",
      responsabilidade: "coordenacao/minha-frente-forcada",
      arquivos: ["lib/coordenacao/portao-de-push.ts"],
      forcadaPor: { quem: "ses-eu", motivo: "força legada, sem alvo nomeado", em: "2026-08-16T10:00:00Z" },
    });
    const propostaIsca = { quem: "ses-eu", responsabilidade: "__conferir__/x", arquivos: ["lib/coordenacao/reivindicacoes.ts"] };

    const resultado = conferirColisao(propostaIsca, [existente], AGORA, 24, [minhaForcadaLegada]);
    expect(resultado.colide).toBe(true);
    expect(resultado.forcadas).toHaveLength(0);
  });
});

describe('6. `forcadaPor.motivo` vazio/só espaço — NÃO honra, continua bloqueando', () => {
  it("motivo string vazia", () => {
    const a = reivindicacao({
      quem: "ses-eu",
      responsabilidade: "coordenacao/sentinela-vs-forcada",
      arquivos: ["lib/coordenacao/reivindicacoes.ts"],
      forcadaPor: { quem: "ses-eu", motivo: "", em: "2026-08-28T17:00:00Z", contra: ["ses-outra-sessao"] },
    });
    const b = reivindicacao({
      quem: "ses-outra-sessao",
      responsabilidade: "coordenacao/sentinela-vs-forcada-2",
      arquivos: ["lib/coordenacao/reivindicacoes.ts"],
    });

    const registro = conferirRegistro([a, b], AGORA);
    expect(registro.ok).toBe(false);
    expect(registro.forcadas).toHaveLength(0);
  });

  it("motivo só com espaço", () => {
    const a = reivindicacao({
      quem: "ses-eu",
      responsabilidade: "coordenacao/sentinela-vs-forcada",
      arquivos: ["lib/coordenacao/reivindicacoes.ts"],
      forcadaPor: { quem: "ses-eu", motivo: "   ", em: "2026-08-28T17:00:00Z", contra: ["ses-outra-sessao"] },
    });
    const b = reivindicacao({
      quem: "ses-outra-sessao",
      responsabilidade: "coordenacao/sentinela-vs-forcada-2",
      arquivos: ["lib/coordenacao/reivindicacoes.ts"],
    });

    const registro = conferirRegistro([a, b], AGORA);
    expect(registro.ok).toBe(false);
    expect(registro.forcadas).toHaveLength(0);
  });
});

describe("7. validação: `forcadaPor.contra` presente mas não-array-de-string", () => {
  it("`contra` como string solta lança", () => {
    const bruto = {
      id: "x/y",
      quem: "ses-eu",
      frente: "(teste)",
      responsabilidade: "x/y",
      arquivos: ["a.ts"],
      abertaEm: AGORA.toISOString(),
      encerradaEm: null,
      forcadaPor: { quem: "ses-eu", motivo: "m", em: AGORA.toISOString(), contra: "ses-outra-sessao" },
    };

    expect(() => validarReivindicacao(bruto, "x-y.json")).toThrow(/contra/);
  });

  it("`contra` como lista com elemento não-string lança", () => {
    const bruto = {
      id: "x/y",
      quem: "ses-eu",
      frente: "(teste)",
      responsabilidade: "x/y",
      arquivos: ["a.ts"],
      abertaEm: AGORA.toISOString(),
      encerradaEm: null,
      forcadaPor: { quem: "ses-eu", motivo: "m", em: AGORA.toISOString(), contra: ["ses-outra-sessao", 42] },
    };

    expect(() => validarReivindicacao(bruto, "x-y.json")).toThrow(/contra/);
  });

  it("`contra` ausente continua válido (retrocompatibilidade com as 4 reivindicações legadas)", () => {
    const bruto = {
      id: "x/y",
      quem: "ses-eu",
      frente: "(teste)",
      responsabilidade: "x/y",
      arquivos: ["a.ts"],
      abertaEm: AGORA.toISOString(),
      encerradaEm: null,
      forcadaPor: { quem: "ses-eu", motivo: "m", em: AGORA.toISOString() },
    };

    const r = validarReivindicacao(bruto, "x-y.json");
    expect(r.forcadaPor?.contra).toBeUndefined();
  });

  it("`contra` presente e válido é preservado", () => {
    const bruto = {
      id: "x/y",
      quem: "ses-eu",
      frente: "(teste)",
      responsabilidade: "x/y",
      arquivos: ["a.ts"],
      abertaEm: AGORA.toISOString(),
      encerradaEm: null,
      forcadaPor: { quem: "ses-eu", motivo: "m", em: AGORA.toISOString(), contra: ["ses-outra-sessao", "ses-mais-uma"] },
    };

    const r = validarReivindicacao(bruto, "x-y.json");
    expect(r.forcadaPor?.contra).toEqual(["ses-outra-sessao", "ses-mais-uma"]);
  });
});
