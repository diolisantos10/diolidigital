// A CATRACA CONTRA "ESTÁ PRONTO" SOBRE CÓDIGO QUE SÓ EXISTE NUM DISCO.
//
// 27/08/2026: catorze commits nunca empurrados, entre eles a porta da isenção de
// parceria — testada, provada por mutação e 404 na internet. `npm run distancia`
// dizia EM_DIA porque compara a produção com `origin/`, nunca com o HEAD local:
// produção == origin, veredito verde, defeito intacto.
//
// Régua verde sobre o componente errado é pior que régua nenhuma.

import { describe, it, expect, vi, beforeEach } from "vitest";

const execFileSync = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ execFileSync }));

import { trabalhoSoNoDisco } from "@/lib/plataforma/trabalho-so-no-disco";

beforeEach(() => vi.clearAllMocks());

describe("o que não saiu do disco não está entregue", () => {
  it("acusa os commits que NENHUM remoto tem, e diz quantos", () => {
    execFileSync.mockReturnValue(
      "9f93c1a\tA porta da isenção\n053393b\tOs três e-mails que faltavam\n",
    );

    const v = trabalhoSoNoDisco();
    expect(v.codigo).toBe("SO_NO_DISCO");
    expect(v.quantos).toBe(2);
    expect(v.commits[0]).toEqual({ commitCurto: "9f93c1a", assunto: "A porta da isenção" });
    // A ação tem de mandar empurrar — um alarme sem próxima ação vira ruído.
    expect(v.acao).toContain("PR");
  });

  it("a pergunta é a QUALQUER remoto, não ao branch de deploy", () => {
    // Este é o conserto inteiro em uma linha. Perguntar "o branch de deploy
    // tem?" devolveria alarme para todo trabalho em PR — e um alarme que soa
    // para quem já fez a coisa certa é o alarme que se aprende a ignorar.
    execFileSync.mockReturnValue("");
    trabalhoSoNoDisco();

    const args = execFileSync.mock.calls[0][1] as string[];
    expect(args).toContain("--remotes");

    // ⚠️ A ORDEM, não só a presença. Esta asserção existe porque a versão
    // anterior deste teste cobrava só `toContain` e passou VERDE sobre um
    // comando quebrado: `--not --remotes ... HEAD` fazia o git excluir o
    // próprio HEAD (o `--not` inverte tudo o que vem depois), e a catraca
    // devolvia "nada preso" com trabalho preso. Falso negativo numa catraca é
    // pior que catraca nenhuma — foi preciso rodar contra o repositório real
    // para descobrir. Régua que confere presença não confere semântica.
    expect(args.indexOf("HEAD")).toBeGreaterThan(-1);
    expect(args.indexOf("--not")).toBeGreaterThan(args.indexOf("HEAD"));
    expect(args.indexOf("--remotes")).toBeGreaterThan(args.indexOf("--not"));
  });

  it("tudo empurrado é verde de verdade, sem ação pendente", () => {
    execFileSync.mockReturnValue("");
    const v = trabalhoSoNoDisco();
    expect(v.codigo).toBe("TUDO_EMPURRADO");
    expect(v.quantos).toBe(0);
    expect(v.acao).toBe("");
  });

  it("git mudo NÃO vira sinal verde", () => {
    // Silêncio nunca pode virar verde: não conseguir olhar some com a própria
    // pergunta, e é assim que uma catraca vira enfeite.
    execFileSync.mockImplementation(() => { throw new Error("sem git"); });

    const v = trabalhoSoNoDisco();
    expect(v.codigo).toBe("NAO_CONSEGUI_OLHAR");
    expect(v.codigo).not.toBe("TUDO_EMPURRADO");
  });
});
