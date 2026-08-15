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
// aprovado. Estes testes travam as três coisas no fonte, porque a suíte desta
// casa roda em `environment: "node"` e não renderiza React: o que dá para
// afirmar aqui é a ESTRUTURA, e ela é exatamente o que regride sozinha num
// ajuste distraído.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const raiz = process.cwd();
const componente = readFileSync(join(raiz, "components/portal/AprovacoesDoCliente.tsx"), "utf8");
const pagina = readFileSync(join(raiz, "app/portal/access/[token]/page.tsx"), "utf8");

/** O corpo do componente que desenha a decisão em massa. */
const emMassa = componente.slice(
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
    // O gesto de abrir a confirmação existe...
    expect(emMassa).toContain("setConfirmando(true)");
    // ...e o único `decidir()` do componente está no ramo já confirmado.
    const posConfirmar = emMassa.indexOf("setConfirmando(true)");
    const posDecidir = emMassa.indexOf("decisao.decidir()");
    expect(posDecidir).toBeGreaterThan(posConfirmar);
  });

  it("dá para voltar atrás — a confirmação tem saída", () => {
    expect(emMassa).toContain("setConfirmando(false)");
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
