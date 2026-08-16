/**
 * ── B2 · B3 · B6 — AS TRÊS REGRESSÕES DO CAMINHO DO ANEXO (16/08/2026) ──────
 *
 * B2. `handleFilesPicked` passou a chamar `runTurn` para TODO arquivo, e
 *     `runTurn` entrega a fala visível ao motor de regras. A fala visível do
 *     anexo é a bolha `📎 Enviei meu briefing: **brandbook.pdf**` — então o
 *     NOME DO ARQUIVO virava a resposta da pergunta pendente. Medido na tela:
 *
 *         Objetivos = 📎 Enviei meu briefing: **brandbook.pdf**
 *
 *     Com 5 arquivos, 5 perguntas do SDR consumidas por nome de arquivo, e
 *     isso sobe para o banco e para a proposta. A mesma linha é a regressão de
 *     custo: 5 anexos = 5 chamadas de IA, cada uma carregando o dossiê inteiro,
 *     em porta pública sem login.
 *
 * B3. A instrução de recuperação ("reconheça que o arquivo chegou, NÃO finja
 *     que leu") viajava só dentro do `sdrText` — isto é, PELA IA. Sem chave, a
 *     rota responde 200 com `ok:false`, o motor de regras assume, e o prospect
 *     ouve *"Vai querer stories também?"* depois de três arquivos ilegíveis.
 *     **A mensagem de falha nunca pode depender do sistema que falhou.**
 *
 * B6. `opacos = validos.filter(it => !(it.lido && texto))` engolia o arquivo
 *     AINDA SUBINDO (`lido === undefined`). Bastava digitar enquanto o PDF
 *     subia para o SDR ser informado de que não conseguiu ler um arquivo que
 *     chegaria dois segundos depois.
 *
 * ⚠️ Os três testes abaixo REPROVAM o código de ontem, não só o de amanhã: um
 * turno por arquivo, aviso que só existia dentro do `sdrText`, e dois estados
 * onde precisam existir três.
 */
import { describe, it, expect, vi } from "vitest";
import {
  processarLoteDeAnexos,
  dossieDosAnexos,
  avisoDeChegada,
  respostaSemIa,
  instrucaoDeAnexosParaOSdr,
} from "@/components/agency/briefing/PublicBriefingRoom";

type Enviar = Parameters<typeof processarLoteDeAnexos>[0]["enviar"];

function arquivo(nome: string): File {
  return { name: nome } as File;
}

function envioQueLe(texto: string): Enviar {
  return async (f: File) => ({
    fileName: f.name,
    fileType: "PDF",
    sizeBytes: 10,
    mimeType: "application/pdf",
    extractedText: texto,
  });
}

function bancada(over: Partial<Parameters<typeof processarLoteDeAnexos>[0]> = {}) {
  const avisadas: { role: string; text: string }[] = [];
  const turnos: { sdrText: string; reserva: string }[] = [];
  let n = 0;
  return {
    avisadas,
    turnos,
    dep: {
      files: [] as File[],
      novoId: () => `id${++n}`,
      enviar: envioQueLe("conteudo do briefing"),
      aoComecar: () => {},
      aoTerminar: () => {},
      avisar: (msgs: { role: string; text: string }[]) => avisadas.push(...msgs),
      turnoDeEvento: async (sdrText: string, reserva: string) => {
        turnos.push({ sdrText, reserva });
      },
      ...over,
    } as Parameters<typeof processarLoteDeAnexos>[0],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
describe("B2 · arquivo que chega é EVENTO, não fala do prospect", () => {
  it("🔑 CINCO arquivos custam UM turno de IA, não cinco", async () => {
    const b = bancada();
    b.dep.files = ["a.pdf", "b.pdf", "c.pdf", "d.pdf", "e.pdf"].map(arquivo);
    await processarLoteDeAnexos(b.dep);

    // O número que o `qualidade` mediu como regressão de custo: era 5.
    expect(b.turnos).toHaveLength(1);
  });

  it("🔑 o que vai ao SDR é EVENTO declarado, e manda RETOMAR a pergunta pendente", async () => {
    const b = bancada();
    b.dep.files = [arquivo("brandbook.pdf")];
    await processarLoteDeAnexos(b.dep);

    const enviado = b.turnos[0].sdrText;
    expect(enviado).toMatch(/EVENTO DO SISTEMA/);
    expect(enviado).toMatch(/não responde à sua pergunta pendente/i);
    expect(enviado).toMatch(/o nome do arquivo NÃO é a resposta dela/i);
  });

  it("🔑 a bolha do arquivo NÃO é fala do cliente — ela nasce como evento", async () => {
    const b = bancada();
    b.dep.files = [arquivo("brandbook.pdf")];
    await processarLoteDeAnexos(b.dep);

    // `role: "system"` é o que impede o motor de regras de casá-la com a
    // pergunta pendente — e é também o que a mantém fora do histórico enviado
    // ao modelo (`historicoParaOModelo` descarta `system`).
    expect(b.avisadas.every((m) => m.role === "system")).toBe(true);
    // E ela não se disfarça de resposta: o texto antigo era
    // "📎 Enviei meu briefing: **X.pdf**", em primeira pessoa.
    expect(b.avisadas.map((m) => m.text).join(" ")).not.toMatch(/Enviei meu briefing/);
  });

  it("nenhum arquivo aproveitável: nem turno de IA, nem silêncio", async () => {
    const b = bancada({ enviar: async () => null });
    b.dep.files = [arquivo("quebrado.pdf")];
    await processarLoteDeAnexos(b.dep);

    expect(b.turnos).toHaveLength(0);
    expect(b.avisadas).toHaveLength(1);
    expect(b.avisadas[0].text).toMatch(/NÃO chegou/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("B3 · o aviso não viaja pelo canal que caiu", () => {
  it("🔑 IA MORTA: a pessoa ainda assim fica sabendo que o arquivo não foi lido", async () => {
    const b = bancada({
      enviar: envioQueLe(""), // extração falhou — o caso comum sem chave
      turnoDeEvento: async () => {
        throw new Error("a chave de IA não existe neste ambiente");
      },
    });
    b.dep.files = [arquivo("brandbook.pdf")];

    // Não lança: o turno de IA é o extra, não o portador da notícia.
    await processarLoteDeAnexos(b.dep);

    const texto = b.avisadas.map((m) => m.text).join("\n");
    expect(texto).toMatch(/NÃO consegui ler o conteúdo/i);
    // E o aviso carrega o PRÓXIMO PASSO — aviso sem saída é só má notícia.
    expect(texto).toMatch(/enviar de novo/i);
    expect(texto).toMatch(/uma frase/i);
  });

  it("🔑 o aviso é pintado ANTES de qualquer chamada de IA", async () => {
    const ordem: string[] = [];
    const b = bancada({
      enviar: envioQueLe(""),
      avisar: () => ordem.push("aviso"),
      turnoDeEvento: async () => {
        ordem.push("ia");
      },
    });
    b.dep.files = [arquivo("x.pdf")];
    await processarLoteDeAnexos(b.dep);

    expect(ordem).toEqual(["aviso", "ia"]);
  });

  it("a resposta de reserva nunca afirma ter lido, e diz o que fazer", () => {
    const r = respostaSemIa([{ nome: "brandbook.pdf", lido: false }], []);
    expect(r).toMatch(/NÃO consegui ler/i);
    expect(r).not.toMatch(/li o (seu )?arquivo|conforme o documento/i);
    expect(r).toMatch(/em uma frase|enviar de novo/i);
  });

  it("os três avisos de chegada são textos DIFERENTES", () => {
    const lido = avisoDeChegada("a.pdf", "lido");
    const opaco = avisoDeChegada("a.pdf", "opaco");
    const falhou = avisoDeChegada("a.pdf", "falhou");
    expect(new Set([lido, opaco, falhou]).size).toBe(3);
    expect(lido).toMatch(/lido/);
    expect(opaco).toMatch(/NÃO consegui ler/);
    expect(falhou).toMatch(/NÃO chegou/);
  });

  it("a instrução ao SDR separa o que foi lido do que não foi", () => {
    const s = instrucaoDeAnexosParaOSdr([
      { nome: "lido.pdf", lido: true },
      { nome: "opaco.pdf", lido: false },
    ]);
    expect(s).toMatch(/Foi possível LER: lido\.pdf/);
    expect(s).toMatch(/NÃO foi possível ler: opaco\.pdf/);
    expect(s).toMatch(/NÃO finja que leu/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("B6 · três estados: lido · não pôde ser lido · ainda subindo", () => {
  type Item = Parameters<typeof dossieDosAnexos>[0][number];
  const item = (over: Partial<Item> & { fileName: string }): Item => {
    const { fileName, ...resto } = over;
    return {
      attachment: { fileName } as Item["attachment"],
      status: "done",
      texto: "",
      lido: false,
      ...resto,
    };
  };

  it("🔑 arquivo AINDA SUBINDO não é declarado como ilegível", () => {
    const d = dossieDosAnexos([item({ fileName: "BrandBook.pdf", status: "uploading" })]);

    // Era esta a saída real medida pelo auditor, e ela mandava o SDR pedir ao
    // cliente que contasse o conteúdo de um arquivo a caminho.
    expect(d).not.toMatch(/ARQUIVOS QUE VOCÊ NÃO CONSEGUIU LER: BrandBook\.pdf/);
    expect(d).toMatch(/AINDA ESTÃO CHEGANDO: BrandBook\.pdf/);
    expect(d).toMatch(/NÃO peça ao cliente para descrever o conteúdo/i);
  });

  it("os três estados convivem na mesma montagem, cada um no seu bloco", () => {
    const d = dossieDosAnexos([
      item({ fileName: "lido.pdf", lido: true, texto: "a régua de marca" }),
      item({ fileName: "opaco.pdf", status: "done", lido: false, texto: "" }),
      item({ fileName: "subindo.pdf", status: "uploading" }),
    ]);

    expect(d).toContain("a régua de marca");
    expect(d).toMatch(/NÃO CONSEGUIU LER: opaco\.pdf/);
    expect(d).toMatch(/AINDA ESTÃO CHEGANDO: subindo\.pdf/);
    // E nenhum arquivo aparece em dois blocos ao mesmo tempo.
    expect(d.match(/subindo\.pdf/g)).toHaveLength(1);
    expect(d.match(/opaco\.pdf/g)).toHaveLength(1);
  });

  it("o arquivo que subiu e não deu texto CONTINUA sendo declarado ilegível", () => {
    // A metade negativa: o terceiro estado não pode virar desculpa para o
    // segundo sumir.
    const d = dossieDosAnexos([item({ fileName: "opaco.pdf", status: "done" })]);
    expect(d).toMatch(/NÃO CONSEGUIU LER: opaco\.pdf/);
    expect(d).not.toMatch(/AINDA ESTÃO CHEGANDO/);
  });
});
