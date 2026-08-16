import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { diagnosticar, retratoDoLote } from "@/lib/agency/comercial/diagnostico-do-negocio";
import { lerNegocio } from "@/lib/agency/comercial/negocio-do-lead";

// ─────────────────────────────────────────────────────────────────────────────
// POR QUE ESTE TESTE EXISTE
//
// 16/08/2026. Dois consertos fecharam as portas que gravavam a coluna
// `businessName` errada — o e-mail do prospect (`74810b75`) e o nome da pessoa
// (a porta pública). **Os dois impedem a sujeira nova e não limpam a velha.**
// No banco local sobraram cinco linhas com `businessName = "Dioli"`.
//
// Saneamento de dado de cliente é a operação mais perigosa desta casa: é
// escrita, é irreversível e ninguém confere depois. Por isso a regra de decisão
// mora num módulo puro, testado sem banco, e o que se prova aqui são as QUATRO
// travas — cada uma existe porque a alternativa já destruiu dado em alguma casa:
//
//   1. relata antes de escrever   (a simulação é o padrão, não uma opção)
//   2. NUNCA inventa nome         (recupera do próprio registro, ou declara ausência)
//   3. é idempotente              (rodar duas vezes não muda mais nada)
//   4. não toca no que está certo (a dúvida NÃO autoriza escrita)
// ─────────────────────────────────────────────────────────────────────────────

/** Uma linha como o banco a entrega: o dado certo existe no escopo do briefing. */
const comNegocioNoEscopo = {
  id: "1",
  businessName: "Dioli Santos",
  briefingJson: JSON.stringify({
    scope: { businessName: "Clínica Bela Face", prospectName: "Dioli Santos" },
  }),
};

/** O caso mais comum e mais difícil: é a pessoa, e não há negócio em lugar nenhum. */
const soAPessoa = {
  id: "2",
  businessName: "Dioli",
  briefingJson: JSON.stringify({ scope: { prospectName: "Dioli" } }),
};

describe("trava 1 — nunca inventa o nome do negócio", () => {
  it("recupera o nome do PRÓPRIO registro quando ele existe", () => {
    // Isto não é dedução: o nome estava guardado noutro campo da mesma linha,
    // escrito pela mesma conversa. Recuperar é ler; inventar é escrever.
    const d = diagnosticar(comNegocioNoEscopo);
    expect(d.desfecho).toBe("recuperar");
    expect(d.novo).toBe("Clínica Bela Face");
  });

  it("sem negócio em lugar nenhum, declara a ausência em vez de chutar", () => {
    // Aqui um script comum inventaria "Negócio de Dioli", o título do pedido ou
    // o segmento. Um chute fica com cara de dado conferido, e o defeito deixa
    // de ser rastreável — é pior que a sujeira que veio limpar.
    const d = diagnosticar(soAPessoa);
    expect(d.desfecho).toBe("declarar");
    expect(d.novo).toBe("");
    // E o que fica é exatamente o que a casa já sabe ler.
    expect(lerNegocio(d.novo)).toBeNull();
  });

  it("o valor novo NUNCA é texto criado pela ferramenta", () => {
    // A prova geral: todo destino ou é `""`, ou é uma string que já existia no
    // registro de origem. Nada sai do nada.
    for (const linha of [comNegocioNoEscopo, soAPessoa]) {
      const d = diagnosticar(linha);
      if (d.novo === null || d.novo === "") continue;
      expect(JSON.stringify(linha.briefingJson)).toContain(d.novo);
    }
  });

  it("e-mail e telefone no campo do negócio também viram ausência declarada", () => {
    // O bug irmão (`74810b75`): o e-mail do prospect gravado como nome.
    const email = diagnosticar({ id: "3", businessName: "dioli@gmail.com", briefingJson: null });
    expect(email.desfecho).toBe("declarar");
    expect(email.motivo).toMatch(/e-mail/);

    const fone = diagnosticar({ id: "4", businessName: "11989400692", briefingJson: null });
    expect(fone.desfecho).toBe("declarar");
  });
});

describe("trava 2 — não toca no que está certo, e a dúvida não autoriza escrita", () => {
  it("nome de negócio de verdade fica intacto", () => {
    const d = diagnosticar({
      id: "5",
      businessName: "Sushi Cazza",
      briefingJson: JSON.stringify({ scope: { prospectName: "Camila Pereira" } }),
    });
    expect(d.desfecho).toBe("nao_tocar");
    expect(d.novo).toBeNull();
  });

  it("nome estranho que NÃO se prova errado fica intacto", () => {
    // "Casa da Vó" não parece pessoa, e-mail nem telefone, e o escopo não o
    // contradiz. Na ausência de prova, o certo é deixar quieto: uma linha suja
    // que sobrevive custa uma tela feia; uma linha limpa apagada por engano
    // custa o nome do cliente, sem de onde restaurar.
    const d = diagnosticar({ id: "6", businessName: "Casa da Vó", briefingJson: null });
    expect(d.desfecho).toBe("nao_tocar");
  });

  it("não sobrescreve correção feita à mão", () => {
    // A coluna tem um nome plausível e o escopo tem OUTRO. Trocar seria escrever
    // por cima de uma decisão humana que este código não enxerga.
    const d = diagnosticar({
      id: "7",
      businessName: "Bela Face Estética",
      briefingJson: JSON.stringify({ scope: { businessName: "bela face", prospectName: "Dioli" } }),
    });
    expect(d.desfecho).toBe("nao_tocar");
  });

  it("enxerga o mesmo nome escrito de outro jeito — acento, caixa, espaço duplo", () => {
    // Sem isso, metade da sujeira passa batida e a ferramenta dá falsa sensação
    // de banco limpo.
    const d = diagnosticar({
      id: "8",
      businessName: "DIOLI  SANTOS",
      briefingJson: JSON.stringify({ scope: { prospectName: "Diolí Santos" } }),
    });
    expect(d.desfecho).toBe("declarar");
  });
});

describe("trava 3 — idempotente: a segunda passada não encontra nada", () => {
  it("aplicar o resultado e diagnosticar de novo não produz mudança", () => {
    const lote = [comNegocioNoEscopo, soAPessoa, { id: "9", businessName: "Sushi Cazza", briefingJson: null }];

    const primeira = retratoDoLote(lote);
    expect(primeira.mudancas.length).toBe(2);

    // Simula a escrita: cada linha recebe o valor que a ferramenta decidiu.
    const depois = lote.map((l) => {
      const d = diagnosticar(l);
      return d.desfecho === "nao_tocar" ? l : { ...l, businessName: d.novo as string };
    });

    const segunda = retratoDoLote(depois);
    expect(segunda.mudancas.length).toBe(0);
    expect(segunda.naoTocar).toBe(lote.length);
  });

  it("linha que já é a ausência declarada nunca entra na fila de correção", () => {
    // Sem esta guarda a ferramenta rodaria para sempre sem terminar, reescrevendo
    // `""` por `""` e relatando trabalho que não existe.
    for (const vazio of ["", "   "]) {
      const d = diagnosticar({ id: "10", businessName: vazio, briefingJson: null });
      expect(d.desfecho).toBe("nao_tocar");
      expect(d.motivo).toMatch(/ausência declarada/);
    }
  });
});

describe("trava 4 — a ferramenta relata antes de escrever", () => {
  const ARQUIVO = readFileSync(join(process.cwd(), "scripts/nome-do-negocio.mts"), "utf8");

  /** O CÓDIGO, sem os comentários. O cabeçalho do script explica de propósito o
   *  que ele NÃO faz ("nenhum `updateMany`", "não decide o que é sujeira"), e
   *  uma busca ingênua reprovaria justamente a explicação que torna a regra
   *  legível. Já aconteceu hoje noutro teste desta mesma leva. */
  const SCRIPT = ARQUIVO
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");

  it("a simulação é o padrão: sem flag, não escreve", () => {
    // Script de saneamento que escreve por default é o modo clássico de perder
    // dado de cliente — alguém roda "só para ver" e descobre depois.
    expect(SCRIPT).toMatch(/const APLICAR = process\.argv\.includes\("--aplicar"\)/);
    expect(SCRIPT).toMatch(/if \(!APLICAR\)/);
  });

  it("escrever exige DUAS confirmações independentes", () => {
    // Uma flag sozinha é a distância de um histórico de shell.
    expect(SCRIPT).toContain("EU_SEI_O_QUE_ESTOU_FAZENDO");
    expect(SCRIPT).toMatch(/if \(!CONFIRMADO\)/);
  });

  it("escreve linha a linha pelo id — nunca updateMany", () => {
    // Filtro errado num `updateMany` atinge a tabela inteira. É assim que se
    // perde um banco.
    expect(SCRIPT).toContain("prisma.clientRequestDb.update({ where: { id: m.id }");
    expect(SCRIPT).not.toContain("updateMany");
  });

  it("diz em voz alta QUAL banco está lendo antes de qualquer coisa", () => {
    // Metade dos acidentes de saneamento é alguém achando que está no local.
    expect(SCRIPT).toMatch(/banco REMOTO/);
  });

  it("a regra de decisão não mora no script — mora no módulo testado", () => {
    expect(SCRIPT).toContain("diagnostico-do-negocio");
    // O script não pode ter opinião própria sobre o que é sujeira: se tiver,
    // ela não está sob teste.
    expect(SCRIPT).not.toMatch(/prospectName/);
  });
});
