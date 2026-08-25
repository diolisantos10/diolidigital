// O BOTÃO QUE APROVAVA SEM MOSTRAR (CEO, 15/08/2026)
//
// O CEO entrou no portal da CityJobs para VER os criativos. A primeira coisa da
// aba Aprovações era um card com "Aprovar as entregas prontas". Ele apertou —
// e aprovou o pacote inteiro sem ter aberto uma peça. Pediu para cancelar.
//
// Duas coisas estavam erradas, e nenhuma delas é estética:
//
//   1. **O atalho estava na frente da coisa.** O card em massa vinha ANTES da
//      lista item a item, que é onde a arte aparece e onde se abre a peça. Quem
//      chega procurando o trabalho encontrava primeiro o botão que dispensa
//      olhar o trabalho.
//   2. **Um clique só decidia tudo**, e o botão não nomeava o que decidia.
//
// O conserto é mínimo de propósito — não é redesenho: inverter a ordem, exigir
// confirmação explícita, e a confirmação NOMEIA item por item o que vai ser
// aprovado.
//
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ A DOUTRINA QUE ESTAVA ESCRITA AQUI ERA FALSA (Auditor, 25/08/2026)
// ═══════════════════════════════════════════════════════════════════════════
//
// Este cabeçalho dizia, para justificar a leitura de fonte:
//
//   "a suíte desta casa roda em `environment: node` e não renderiza React"
//
// A primeira metade continua verdadeira; a segunda deixou de ser. Esta suíte
// RENDERIZA React há tempos (`react-dom/server` roda em node sem navegador —
// ver `vitest.config.ts` e os testes do workspace do cliente). A frase descrevia
// o comportamento antigo e servia de licença para uma régua fraca — e doutrina
// que descreve o comportamento antigo é pior que doutrina nenhuma, porque
// parece uma razão.
//
// O critério E do contrato — "nenhuma decisão em massa inclui peça invisível" —
// é sobre O QUE O CLIENTE VÊ. `readFileSync` + `toContain` não alcança isso.
// Então a régua principal deste arquivo passou a ser o HTML RENDERIZADO do
// componente real. As afirmações sobre a fonte continuam abaixo, rebaixadas ao
// que elas de fato são: guarda de ORDEM e de FIAÇÃO (o que a página passa para
// o componente), coisas que não viram pixel e por isso não têm outra régua.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ConfirmacaoEmMassa,
  AprovacoesDoCliente,
  type AprovacaoDoPortal,
} from "@/components/portal/AprovacoesDoCliente";

const raiz = process.cwd();
const componente = readFileSync(join(raiz, "components/portal/AprovacoesDoCliente.tsx"), "utf8");
const pagina = readFileSync(join(raiz, "app/portal/access/[token]/page.tsx"), "utf8");

/** O corpo dos DOIS componentes da decisão em massa — o atalho e a
 *  confirmação (extraída em 25/08/2026 para poder ser RENDERIZADA no teste;
 *  ver o bloco do fim deste arquivo). */
const emMassa = componente.slice(
  componente.indexOf("export function ConfirmacaoEmMassa("),
  componente.indexOf("export function AprovacoesDoCliente("),
);
/** Só o atalho — o botão que abre a confirmação. */
const atalho = componente.slice(
  componente.indexOf("function DecisaoEmMassa("),
  componente.indexOf("export function AprovacoesDoCliente("),
);

describe("a lista item a item vem ANTES do atalho em massa", () => {
  it("no bloco 'Aguardando você', as linhas são renderizadas antes do card de decisão", () => {
    const bloco = componente.slice(componente.indexOf("Aguardando você ("));
    const listaItemAItem = bloco.indexOf("{pendentes.map(linha)}");
    const cardEmMassa = bloco.indexOf("<DecisaoEmMassa");
    expect(listaItemAItem).toBeGreaterThan(-1);
    expect(cardEmMassa).toBeGreaterThan(-1);
    // A arte mora nas linhas. O atalho não pode estar mais acessível do que a
    // coisa que ele decide.
    expect(listaItemAItem).toBeLessThan(cardEmMassa);
  });
});

describe("o botão em massa não decide num clique", () => {
  it("o primeiro botão abre a CONFIRMAÇÃO — ele não chama `decidir`", () => {
    // O atalho abre a confirmação...
    expect(atalho).toContain("setConfirmando(true)");
    // ...e NÃO decide: o único `decisao.decidir()` mora na confirmação, que só
    // existe depois do primeiro clique.
    expect(atalho.slice(atalho.indexOf("function DecisaoEmMassa("))).not.toContain("decisao.decidir()");
    expect(emMassa).toContain("decisao.decidir()");
  });

  it("dá para voltar atrás — a confirmação tem saída", () => {
    expect(emMassa).toContain("onCancelar");
    expect(emMassa).toContain("Não, quero ver as peças");
  });

  it("a confirmação NOMEIA o que vai ser aprovado, item por item", () => {
    // "Tem certeza?" sozinho é a mesma decisão às cegas com um clique a mais.
    expect(emMassa).toContain("decisao.itens.map");
  });

  it("e diz o que fica DE FORA da aprovação", () => {
    expect(emMassa).toContain("decisao.emProducao");
    expect(emMassa).toMatch(/ainda em produção/i);
  });

  it("a confirmação aponta o caminho de quem só queria ver — que era o caso", () => {
    expect(emMassa).toMatch(/só para ver as peças/i);
  });
});

describe("o que o botão nomeia vem do servidor, não de um número solto", () => {
  it("a interface EXIGE a lista de itens", () => {
    const contrato = componente.slice(
      componente.indexOf("export interface DecisaoDaEsteira"),
      componente.indexOf("function DecisaoEmMassa("),
    );
    // Obrigatório (sem `?`): um botão que decide em massa sem saber o que
    // decide é o defeito de 15/08 esperando para voltar.
    expect(contrato).toMatch(/\n {2}itens: string\[\];/);
  });

  it("a página passa a MESMA lista que o servidor mediu (`pacote.prontas`)", () => {
    expect(pagina).toContain("itens: pacoteDaEsteira.prontas");
    expect(pagina).toContain("emProducao: pacoteDaEsteira.emProducao");
  });

  it("o texto do card manda decidir nas linhas ACIMA — a ordem da tela e a frase não podem divergir", () => {
    expect(pagina).toContain("decidir item por item nas linhas acima");
    expect(pagina).not.toContain("decidir item por item nas linhas abaixo");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// A RÉGUA QUE FALTAVA: O QUE O CLIENTE LÊ NA TELA
// ═══════════════════════════════════════════════════════════════════════════
//
// Tudo acima é fonte. Daqui para baixo o componente MONTA, com props reais, e o
// que se afirma é o HTML que sai dele.

const PRONTA = "Story de lançamento — 4 peças";
const INVISIVEL = "Relatório de Analytics";

function texto(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

describe("a confirmação em massa NÃO inclui peça invisível — no HTML", () => {
  const html = renderToStaticMarkup(
    <ConfirmacaoEmMassa
      decisao={{
        titulo: "Aprovar as entregas prontas",
        descricao: "As peças abaixo estão prontas.",
        rotulo: "Aprovar as entregas prontas",
        itens: [PRONTA],
        emProducao: [INVISIVEL],
        decidir: async () => true,
      }}
      enviando={false}
      onCancelar={() => {}}
    />,
  );

  it("a peça que o cliente PODE ver é nomeada no que vai ser aprovado", () => {
    expect(texto(html)).toContain(PRONTA);
  });

  it("a peça INVISÍVEL não está na lista do que vai ser aprovado", () => {
    // A lista do que entra é o `<ul>`; o que fica de fora vem depois dele.
    const lista = html.slice(html.indexOf("<ul"), html.indexOf("</ul>"));
    expect(lista).toContain(PRONTA);
    expect(
      lista,
      "peça sem corpo dentro do <ul> = o cliente assinando o que não pode ver",
    ).not.toContain(INVISIVEL);
  });

  it("e o cliente LÊ que ela ficou de fora, nomeada — silêncio não informa", () => {
    expect(texto(html)).toMatch(/Fora desta aprovação \(ainda em produção\)/i);
    expect(texto(html)).toContain(INVISIVEL);
  });

  it("CONTROLE: com a peça invisível dentro de `itens`, ela APARECE no <ul>", () => {
    // Sem este controle, o teste acima passaria mesmo num componente que nunca
    // renderiza nada — uma régua que só pode dar verde.
    const mutado = renderToStaticMarkup(
      <ConfirmacaoEmMassa
        decisao={{
          titulo: "t", descricao: "d", rotulo: "r",
          itens: [PRONTA, INVISIVEL],
          decidir: async () => true,
        }}
        enviando={false}
        onCancelar={() => {}}
      />,
    );
    const lista = mutado.slice(mutado.indexOf("<ul"), mutado.indexOf("</ul>"));
    expect(lista).toContain(INVISIVEL);
  });
});

describe("na LISTA, a peça sem corpo não recebe botão de decisão — no HTML", () => {
  function card(id: string, semConteudo: boolean): AprovacaoDoPortal {
    return {
      id, department: semConteudo ? INVISIVEL : PRONTA,
      status: "pending", reviewedAt: null,
      reviewNote: semConteudo ? null : `${PRONTA}\n\nquatro stories prontos.`,
      version: 1, questionOpen: false, expiresAt: null,
      pecas: [], semConteudo, comments: [],
    };
  }

  const html = renderToStaticMarkup(
    <AprovacoesDoCliente
      aprovacoes={[card("ap_ok", false), card("ap_vazio", true)]}
      token="tok"
      abertaId={null}
      onAbrir={() => {}}
      enviando={false}
      erro={null}
      onDecidir={async () => true}
    />,
  );

  it("a peça sem corpo sai de 'Aguardando você' e vai para 'Em produção na Dioli'", () => {
    const t = texto(html);
    const aguardando = t.indexOf("Aguardando você");
    const emProducao = t.search(/Em produção na Dioli/i);
    expect(aguardando).toBeGreaterThanOrEqual(0);
    expect(emProducao, "o card vazio continua VISÍVEL — esconder seria fingir que não existe")
      .toBeGreaterThan(aguardando);
    // E ele está do lado de baixo, não no bloco que pede decisão.
    expect(t.slice(aguardando, emProducao)).not.toContain(INVISIVEL);
    expect(t.slice(emProducao)).toContain(INVISIVEL);
  });

  it("a contagem de 'Aguardando você' não conta a peça invisível", () => {
    expect(texto(html)).toContain("Aguardando você (1)");
  });
});
