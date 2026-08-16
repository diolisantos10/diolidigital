// A metade que trava: "não consegui olhar" NUNCA pode sair como "em dia".
//
// Estes testes fixam o incidente de 16/08/2026: a produção 48 commits atrás
// da branch, servindo código de uma hora antes, enquanto `tsc` e os testes
// estavam verdes e ninguém conferia o deploy. Se alguém um dia "simplificar"
// o veredito para "não é PRODUCAO_FORA, então está tudo bem", é aqui que a
// simplificação bate.
//
// E fixam o incidente SEGUINTE, no mesmo dia: o PM leu "47 commits atrás" e
// relatou ao Diretor "ninguém disparou deploy" — quando havia um deploy
// BUILDING e três WAITING no Railway. "Atrasada e publicando" (esperar) e
// "atrasada e parada" (agir) são fatos opostos; achatar os dois num alarme
// só foi o erro do dia. Se alguém um dia voltar a tratar "atrasada" como um
// código só, é aqui que essa simplificação bate também.

import { describe, expect, it } from "vitest";
import { julgarDistancia, type CommitDaBranch, type EstadoDaFila } from "@/lib/plataforma/distancia-do-deploy";

/** Fila consultada com sucesso, N implantações em voo, sem status desconhecido. */
function filaConsultada(emVoo: number, statusMaisRecente: string | null): EstadoDaFila {
  return { consultei: true, emVoo, statusMaisRecente, statusDesconhecido: null, falha: null };
}

const filaParada = filaConsultada(0, "SUCCESS");
const filaNaoConsultada: EstadoDaFila = {
  consultei: false,
  emVoo: 0,
  statusMaisRecente: null,
  statusDesconhecido: null,
  falha: "RAILWAY_TOKEN não está no ambiente",
};

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
  it("sem informação sobre a fila, a distância sozinha vira ATRASADA_SEM_SABER — nunca um alarme que a fila poderia desmentir", () => {
    const v = julgarDistancia({
      producao: { noAr: true, commit: "0000001" },
      historico: historicoDoIncidente,
    });

    expect(v.codigo).toBe("ATRASADA_SEM_SABER");
    expect(v.medido).toBe(true);
    expect(v.commitsAtras).toBe(48);
    expect(v.gravidade).toBe("atencao");
    expect(v.faltando).toHaveLength(48);
    expect(v.resumo).toMatch(/48/);
    expect(v.resumo).toMatch(/conserta o funil que não avançava/);
    expect(v.resumo).toMatch(/corrige cotação 7x abaixo do pedido/);
    expect(v.resumo).toMatch(/e mais 43/);
    expect(v.acao).not.toBe("");
  });
});

// O incidente SEGUINTE, no mesmo dia: 47 commits atrás, mas com um deploy já
// subindo. Historico dedicado (em vez de reaproveitar `historicoDoIncidente`,
// que tem 48) para casar com o número exato que o PM leu errado.
const historicoDeHoje: CommitDaBranch[] = [
  ...Array.from({ length: 47 }, (_, i) => ({
    commitCurto: `b${String(47 - i).padStart(4, "0")}`,
    assunto: `commit ${47 - i}`,
  })),
  { commitCurto: "0000001", assunto: "commit que a produção está servindo" },
];

describe("o caso real de hoje: 47 commits atrás, mas o deploy já está subindo", () => {
  it("producao 47 commits atras COM deploy BUILDING e tres WAITING => ATRASADA_PUBLICANDO, gravidade atencao, acao de ESPERAR, e o resumo NAO soa como alarme de producao parada", () => {
    const v = julgarDistancia({
      producao: { noAr: true, commit: "0000001" },
      historico: historicoDeHoje,
      fila: filaConsultada(4, "BUILDING"), // 1 BUILDING + 3 WAITING
    });

    expect(v.codigo).toBe("ATRASADA_PUBLICANDO");
    expect(v.commitsAtras).toBe(47);
    expect(v.gravidade).toBe("atencao");
    expect(v.acao.toLowerCase()).toMatch(/esperar/);
    // O texto tem que deixar claro que a esteira está funcionando — não pode
    // soar como o mesmo alarme de uma produção parada, que foi exatamente a
    // leitura errada do PM hoje.
    expect(v.resumo).toMatch(/em andamento/);
    expect(v.resumo).not.toMatch(/nenhum deploy está em andamento/);
    expect(v.fila?.emVoo).toBe(4);
  });

  it("producao 47 atras e fila consultada, NADA em voo => ATRASADA_PARADA, grave, acao de agir agora", () => {
    const v = julgarDistancia({
      producao: { noAr: true, commit: "0000001" },
      historico: historicoDeHoje,
      fila: filaParada,
    });

    expect(v.codigo).toBe("ATRASADA_PARADA");
    expect(v.commitsAtras).toBe(47);
    expect(v.gravidade).toBe("grave");
    expect(v.acao.toLowerCase()).toMatch(/agora/);
  });

  it("producao 47 atras e fila NAO consultada (sem token) => ATRASADA_SEM_SABER, atencao, resumo diz que a fila nao foi olhada", () => {
    const v = julgarDistancia({
      producao: { noAr: true, commit: "0000001" },
      historico: historicoDeHoje,
      fila: filaNaoConsultada,
    });

    expect(v.codigo).toBe("ATRASADA_SEM_SABER");
    expect(v.commitsAtras).toBe(47);
    expect(v.gravidade).toBe("atencao");
    expect(v.resumo).toMatch(/não foi possível checar/);
  });

  it("status desconhecido do Railway não vira 'parado' silenciosamente", () => {
    const filaComStatusNovo: EstadoDaFila = {
      consultei: true,
      emVoo: 0,
      statusMaisRecente: "SOMETHING_NEW",
      statusDesconhecido: "SOMETHING_NEW",
      falha: null,
    };

    const v = julgarDistancia({
      producao: { noAr: true, commit: "0000001" },
      historico: historicoDeHoje,
      fila: filaComStatusNovo,
    });

    expect(v.codigo).toBe("ATRASADA_SEM_SABER");
    expect(v.codigo).not.toBe("ATRASADA_PARADA");
    expect(v.gravidade).toBe("atencao");
    expect(v.resumo).toMatch(/SOMETHING_NEW/);
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

describe("commit desconhecido se desdobra em dois fatos com ações diferentes", () => {
  it("historico veio PARCIAL (vimos a branch inteira) e commit ausente => COMMIT_FORA_DA_BRANCH", () => {
    const v = julgarDistancia({
      producao: { noAr: true, commit: "ffffff0" },
      historico: historicoDoIncidente,
      historicoBateuNoLimite: false,
    });

    expect(v.codigo).toBe("COMMIT_FORA_DA_BRANCH");
    expect(v.codigo).not.toBe("EM_DIA");
    expect(v.medido).toBe(false);
    expect(v.commitsAtras).toBeNull();
    expect(v.gravidade).toBe("atencao");
    expect(v.acao).toMatch(/branch/);
  });

  it("historico veio CHEIO (== limite) e commit ausente => COMMIT_ALEM_DO_LIMITE", () => {
    const v = julgarDistancia({
      producao: { noAr: true, commit: "ffffff0" },
      historico: historicoDoIncidente,
      historicoBateuNoLimite: true,
    });

    expect(v.codigo).toBe("COMMIT_ALEM_DO_LIMITE");
    expect(v.codigo).not.toBe("COMMIT_FORA_DA_BRANCH");
    expect(v.medido).toBe(false);
    expect(v.commitsAtras).toBeNull();
    expect(v.gravidade).toBe("atencao");
    expect(v.acao).toMatch(/limite/);
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

  it("a ressalva sobrevive em ATRASADA_SEM_SABER", () => {
    const v = julgarDistancia({
      producao: { noAr: true, commit: "0000001" },
      historico: historicoDoIncidente,
      ressalva: "git fetch falhou",
    });

    expect(v.codigo).toBe("ATRASADA_SEM_SABER");
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

  it("a ressalva sobrevive em COMMIT_FORA_DA_BRANCH", () => {
    const v = julgarDistancia({
      producao: { noAr: true, commit: "ffffff0" },
      historico: historicoDoIncidente,
      ressalva: "git fetch falhou",
    });

    expect(v.codigo).toBe("COMMIT_FORA_DA_BRANCH");
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

describe("a gravidade de ATRASADA depende do estado da fila, não da contagem de commits", () => {
  // Antes deste bloco, a gravidade vinha de um corte em 3 commits atrás —
  // exatamente o tipo de número que não distingue "atrasada e publicando" de
  // "atrasada e parada". Estes testes documentam a troca: 1 commit atrás
  // parado já é grave, e 47 atrás publicando continua sendo só atenção.
  const historicoCurto: CommitDaBranch[] = [
    { commitCurto: "c0004", assunto: "quarto commit" },
    { commitCurto: "c0003", assunto: "terceiro commit" },
    { commitCurto: "c0002", assunto: "segundo commit" },
    { commitCurto: "c0001", assunto: "primeiro commit" },
  ];

  it("1 commit atrás com a fila parada já é grave — o corte por contagem não existe mais", () => {
    const v = julgarDistancia({
      producao: { noAr: true, commit: "c0003" },
      historico: historicoCurto,
      fila: filaParada,
    });
    expect(v.commitsAtras).toBe(1);
    expect(v.codigo).toBe("ATRASADA_PARADA");
    expect(v.gravidade).toBe("grave");
  });

  it("3 commits atrás com um deploy em voo é só atenção — a fila manda, não a contagem", () => {
    const v = julgarDistancia({
      producao: { noAr: true, commit: "c0001" },
      historico: historicoCurto,
      fila: filaConsultada(1, "DEPLOYING"),
    });
    expect(v.commitsAtras).toBe(3);
    expect(v.codigo).toBe("ATRASADA_PUBLICANDO");
    expect(v.gravidade).toBe("atencao");
  });
});
