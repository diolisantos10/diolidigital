// A metade que trava: "não consegui olhar" NUNCA pode sair como "em dia".
//
// Estes testes fixam o incidente de 16/08/2026: a produção 48 commits atrás
// da branch, servindo código de uma hora antes, enquanto `tsc` e os testes
// estavam verdes e ninguém conferia o deploy. Se alguém um dia "simplificar"
// o veredito para "não é PRODUCAO_FORA, então está tudo bem", é aqui que a
// simplificação bate.

import { describe, expect, it } from "vitest";
import { julgarDistancia, type CommitDaBranch } from "@/lib/plataforma/distancia-do-deploy";

const historicoDoIncidente: CommitDaBranch[] = [
  { commitCurto: "aaa0048", assunto: "conserta o funil que não avançava" },
  { commitCurto: "aaa0047", assunto: "corrige cotação 7x abaixo do pedido" },
  { commitCurto: "aaa0046", assunto: "ajusta copy da landing" },
  { commitCurto: "aaa0045", assunto: "corrige typo no rodapé" },
  { commitCurto: "aaa0044", assunto: "atualiza dependência" },
  ...Array.from({ length: 43 }, (_, i) => ({
    commitCurto: `aaa${String(43 - i).padStart(4, "0")}`,
    assunto: `commit antigo ${43 - i}`,
  })),
  { commitCurto: "0000001", assunto: "commit que a produção está servindo" },
];

describe("o caso real: 48 commits atrás e ninguém notando", () => {
  it("acusa a distância exata, com gravidade grave e o resumo citando os assuntos", () => {
    const v = julgarDistancia({
      producao: { noAr: true, commit: "0000001" },
      historico: historicoDoIncidente,
    });

    expect(v.codigo).toBe("ATRASADA");
    expect(v.medido).toBe(true);
    expect(v.commitsAtras).toBe(48);
    expect(v.gravidade).toBe("grave");
    expect(v.faltando).toHaveLength(48);
    expect(v.resumo).toMatch(/48/);
    expect(v.resumo).toMatch(/conserta o funil que não avançava/);
    expect(v.resumo).toMatch(/corrige cotação 7x abaixo do pedido/);
    expect(v.resumo).toMatch(/e mais 43/);
    expect(v.acao).not.toBe("");
  });
});

describe("o caso limpo: produção no topo da branch", () => {
  it("não inventa problema quando a produção está em dia", () => {
    const v = julgarDistancia({
      producao: { noAr: true, commit: "aaa0048" },
      historico: historicoDoIncidente,
    });

    expect(v.codigo).toBe("EM_DIA");
    expect(v.medido).toBe(true);
    expect(v.commitsAtras).toBe(0);
    expect(v.faltando).toEqual([]);
    expect(v.gravidade).toBe("ok");
    expect(v.acao).toBe("");
  });
});

describe("falha ao olhar nunca vira em dia", () => {
  it("rede caiu / git falhou => NAO_CONSEGUI_OLHAR, nunca EM_DIA", () => {
    const v = julgarDistancia({
      producao: { noAr: true, commit: "aaa0048" },
      historico: historicoDoIncidente,
      falhaAoOlhar: "git fetch falhou: connection reset",
    });

    expect(v.codigo).toBe("NAO_CONSEGUI_OLHAR");
    expect(v.medido).toBe(false);
    expect(v.commitsAtras).toBeNull();
    expect(v.codigo).not.toBe("EM_DIA");
    expect(v.gravidade).toBe("atencao");
  });
});

describe("produção fora", () => {
  it("é PRODUCAO_FORA, grave, e não medido", () => {
    const v = julgarDistancia({
      producao: { noAr: false, commit: "aaa0048" },
      historico: historicoDoIncidente,
    });

    expect(v.codigo).toBe("PRODUCAO_FORA");
    expect(v.medido).toBe(false);
    expect(v.commitsAtras).toBeNull();
    expect(v.gravidade).toBe("grave");
  });
});

describe("produção sem versão", () => {
  it("é PRODUCAO_SEM_VERSAO, grave, e não medido", () => {
    const v = julgarDistancia({
      producao: { noAr: true, commit: null },
      historico: historicoDoIncidente,
    });

    expect(v.codigo).toBe("PRODUCAO_SEM_VERSAO");
    expect(v.medido).toBe(false);
    expect(v.commitsAtras).toBeNull();
    expect(v.gravidade).toBe("grave");
  });
});

describe("commit desconhecido", () => {
  it("commit em produção que não está no histórico é COMMIT_DESCONHECIDO, não EM_DIA nem ATRASADA", () => {
    const v = julgarDistancia({
      producao: { noAr: true, commit: "ffffff0" },
      historico: historicoDoIncidente,
    });

    expect(v.codigo).toBe("COMMIT_DESCONHECIDO");
    expect(v.medido).toBe(false);
    expect(v.commitsAtras).toBeNull();
    expect(v.gravidade).toBe("atencao");
  });
});

describe("comparação de commit por prefixo", () => {
  it("prefixo de 7 caracteres casa com hash de 40 no histórico", () => {
    const historicoComHashLongo: CommitDaBranch[] = [
      { commitCurto: "aaa004812345678901234567890123456789012", assunto: "topo com hash de 40" },
      { commitCurto: "0000001", assunto: "commit antigo" },
    ];

    const v = julgarDistancia({
      producao: { noAr: true, commit: "aaa0048" },
      historico: historicoComHashLongo,
    });

    expect(v.codigo).toBe("EM_DIA");
    expect(v.medido).toBe(true);
    expect(v.commitsAtras).toBe(0);
  });

  it("a comparação não diferencia maiúsculas de minúsculas", () => {
    const v = julgarDistancia({
      producao: { noAr: true, commit: "AAA0048" },
      historico: historicoDoIncidente,
    });

    expect(v.codigo).toBe("EM_DIA");
    expect(v.commitsAtras).toBe(0);
  });
});

describe("ressalva — medição parcial não pode se passar por sinal verde", () => {
  it("EM_DIA com ressalva chega ao veredito — não pode ser tratado como tudo certo", () => {
    const v = julgarDistancia({
      producao: { noAr: true, commit: "aaa0048" },
      historico: historicoDoIncidente,
      ressalva: "git fetch origin claude/dioli-agency-os-architecture-kk7kp falhou — histórico local pode estar desatualizado",
    });

    expect(v.codigo).toBe("EM_DIA");
    expect(v.medido).toBe(true);
    expect(v.ressalva).toBe(
      "git fetch origin claude/dioli-agency-os-architecture-kk7kp falhou — histórico local pode estar desatualizado",
    );
  });

  it("ausência de ressalva sai null, não undefined nem string vazia", () => {
    const v = julgarDistancia({
      producao: { noAr: true, commit: "aaa0048" },
      historico: historicoDoIncidente,
    });

    expect(v.ressalva).toBeNull();
  });

  it("a ressalva sobrevive em ATRASADA", () => {
    const v = julgarDistancia({
      producao: { noAr: true, commit: "0000001" },
      historico: historicoDoIncidente,
      ressalva: "git fetch falhou",
    });

    expect(v.codigo).toBe("ATRASADA");
    expect(v.ressalva).toBe("git fetch falhou");
  });

  it("a ressalva sobrevive em PRODUCAO_FORA", () => {
    const v = julgarDistancia({
      producao: { noAr: false, commit: "aaa0048" },
      historico: historicoDoIncidente,
      ressalva: "git fetch falhou",
    });

    expect(v.codigo).toBe("PRODUCAO_FORA");
    expect(v.ressalva).toBe("git fetch falhou");
  });

  it("a ressalva sobrevive em COMMIT_DESCONHECIDO", () => {
    const v = julgarDistancia({
      producao: { noAr: true, commit: "ffffff0" },
      historico: historicoDoIncidente,
      ressalva: "git fetch falhou",
    });

    expect(v.codigo).toBe("COMMIT_DESCONHECIDO");
    expect(v.ressalva).toBe("git fetch falhou");
  });

  it("a ressalva sobrevive mesmo quando falhaAoOlhar também está preenchida (NAO_CONSEGUI_OLHAR)", () => {
    const v = julgarDistancia({
      producao: { noAr: true, commit: "aaa0048" },
      historico: historicoDoIncidente,
      falhaAoOlhar: "git fetch falhou: connection reset",
      ressalva: "git fetch origin falhou — histórico local pode estar desatualizado",
    });

    expect(v.codigo).toBe("NAO_CONSEGUI_OLHAR");
    expect(v.ressalva).toBe("git fetch origin falhou — histórico local pode estar desatualizado");
  });
});

describe("o corte de gravidade em 3 commits atrás", () => {
  const historicoCurto: CommitDaBranch[] = [
    { commitCurto: "c0004", assunto: "quarto commit" },
    { commitCurto: "c0003", assunto: "terceiro commit" },
    { commitCurto: "c0002", assunto: "segundo commit" },
    { commitCurto: "c0001", assunto: "primeiro commit" },
  ];

  it("1 commit atrás é atenção", () => {
    const v = julgarDistancia({
      producao: { noAr: true, commit: "c0003" },
      historico: historicoCurto,
    });
    expect(v.commitsAtras).toBe(1);
    expect(v.gravidade).toBe("atencao");
  });

  it("2 commits atrás é atenção", () => {
    const v = julgarDistancia({
      producao: { noAr: true, commit: "c0002" },
      historico: historicoCurto,
    });
    expect(v.commitsAtras).toBe(2);
    expect(v.gravidade).toBe("atencao");
  });

  it("3 commits atrás já é grave — uma tarde de trabalho fora do ar", () => {
    const v = julgarDistancia({
      producao: { noAr: true, commit: "c0001" },
      historico: historicoCurto,
    });
    expect(v.commitsAtras).toBe(3);
    expect(v.gravidade).toBe("grave");
  });
});
