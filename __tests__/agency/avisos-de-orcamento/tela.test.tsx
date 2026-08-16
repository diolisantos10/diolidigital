// A TELA DOS AVISOS DE ORÇAMENTO PRESOS — os quatro estados, sem confundir
// "não consegui contar" com "não há nada".
//
// ── POR QUE ESTE TESTE EXISTE (16/08/2026) ───────────────────────────────────
//
// Três prospects ficaram 51, 29 e 28 dias sem aviso porque a rota que
// consertava isso só existia por `curl` — nenhuma tela consumia. E o defeito
// que mais custou nesta casa nunca foi falta de dado: foi confundir "a leitura
// falhou" com "não há nada" (a mesma fila da porta da frente ficou invisível
// por sete semanas por causa disso). Este arquivo testa exatamente a linha
// onde esse erro se repetiria aqui:
//
//   ⛔ `medido: false` NUNCA pode desenhar como "0 presos".
//   ⛔ `sem_canal` é fato, não falha — NUNCA ganha botão de reenviar.
//   ✅ fila vazia (0 pendentes de verdade) é o estado NORMAL da tela — sem
//      vermelho, sem "erro".
//
// Renderiza `AvisosDeOrcamentoView` DE VERDADE (`renderToStaticMarkup`), com
// cada estado passado por prop — mesmo modelo de
// `__tests__/agency/workspace-do-cliente/_fixture.tsx` (`ClientWorkspaceShell`):
// a tela busca o próprio dado only dentro do componente-casca
// (`AvisosDeOrcamentoPage`), que tem `useEffect` e por isso não é testável por
// render estático; a aparência inteira mora em `AvisosDeOrcamentoView`, que só
// recebe props.

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AvisosDeOrcamentoView,
  type Resposta,
  type EstadoReenvio,
  type EstadoReenvioLegados,
  type Dados,
} from "@/app/agency/avisos-de-orcamento/page";

const NOOP = () => {};

function view(r: Resposta, reenvio: EstadoReenvio = { fase: "idle" }, reenvioLegados: EstadoReenvioLegados = { fase: "idle" }) {
  return renderToStaticMarkup(
    <AvisosDeOrcamentoView
      r={r}
      reenvio={reenvio}
      reenvioLegados={reenvioLegados}
      aoRecarregar={NOOP}
      aoReenviarPendentes={NOOP}
      aoIniciarConfirmacaoLegados={NOOP}
      aoCancelarConfirmacaoLegados={NOOP}
      aoConfirmarReenvioLegados={NOOP}
    />,
  );
}

function texto(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
}

const DADOS_VAZIOS: Dados = {
  total: 0,
  pendentes: [],
  legados: { medido: true, total: 0, itens: [], ambiguidade: "ambiguidade de teste" },
  semCanal: { medido: true, total: 0, ambiguidade: "ambiguidade de teste" },
};

describe("⛔ medido: false NUNCA vira \"0 presos\"", () => {
  const html = view({ estado: "erro", motivo: "o banco não respondeu — esta lista NÃO é zero, é desconhecida" });
  const txt = texto(html);

  it("mostra a mensagem de erro, com o motivo exato devolvido pela rota", () => {
    expect(txt).toContain("Não consegui medir a fila");
    expect(txt).toContain("o banco não respondeu — esta lista NÃO é zero, é desconhecida");
  });

  it("NUNCA escreve \"0\" junto de \"preso\" — não existe frase de contagem no estado de erro", () => {
    expect(txt).not.toMatch(/0\s*presos?/i);
    // Nenhum dos quatro baldes (Falharam/Sem configuração/Sem e-mail/Legados)
    // pode aparecer: eles só existem quando há `dados`, e no estado de erro
    // `dados` é `null` por construção — não há como a tela inventar um "0".
    expect(txt).not.toContain("Falharam");
    expect(txt).not.toContain("Sem configuração");
  });

  it("tem `role=\"alert\"` — leitor de tela precisa saber que é uma falha", () => {
    expect(html).toContain('role="alert"');
  });

  it("oferece \"Tentar de novo\", nunca \"atualizar a página\"", () => {
    expect(txt).toContain("Tentar de novo");
    expect(txt).not.toMatch(/atualizar a p[aá]gina/i);
  });
});

describe("⛔ sem_canal é fato, não falha — nunca ganha botão de reenviar", () => {
  const dados: Dados = {
    ...DADOS_VAZIOS,
    semCanal: { medido: true, total: 3, ambiguidade: "avisoOrcamentoStatus = 'sem_canal' não é falha — é fato." },
  };
  const html = view({ estado: "ok", dados });
  const txt = texto(html);

  it("mostra a contagem de quem não deixou e-mail", () => {
    expect(txt).toContain("3 prospects");
    expect(txt).toContain("teve o orçamento entregue no portal sem deixar e-mail");
  });

  it("o bloco de sem_canal não contém NENHUM <button> — não há para onde reenviar", () => {
    const inicio = html.indexOf("sem deixar e-mail");
    expect(inicio).toBeGreaterThan(-1);
    // O bloco é um <div> único e fechado logo depois do parágrafo — pegamos
    // uma janela curta o suficiente para não vazar para o balde seguinte
    // (legados), que tem botão próprio e não pode contaminar esta checagem.
    const janela = html.slice(Math.max(0, inicio - 400), inicio + 100);
    expect(janela).not.toContain("<button");
  });

  it("o balde nunca é rotulado como falha nem OFERECE reenvio", () => {
    const inicio = txt.indexOf("teve o orçamento entregue no portal sem deixar e-mail");
    const trecho = txt.slice(Math.max(0, inicio - 60), inicio + 200).toLowerCase();

    // Nunca rotulado como falha: sem e-mail é FATO, não defeito de envio.
    expect(trecho).not.toContain("falhou");

    // Sobre "reenviar": a palavra CRUA não serve como asserção. O texto legítimo
    // deste bloco explica que ele **não tem botão de reenviar** — negar a ação
    // contém a palavra e é exatamente o comportamento certo. Testar a substring
    // reprovava a redação correta e aprovaria "Reenviar 3" se alguém trocasse o
    // verbo. O que importa é não OFERECER a ação: nada de convite imperativo.
    expect(trecho).not.toMatch(/reenviar\s+\d/); // "Reenviar 3 pendentes"
    expect(trecho).not.toMatch(/reenviar (agora|todos|estes|esses)/);

    // E a garantia de verdade é mecânica, não textual: o bloco não tem <button>
    // nenhum — provado no teste acima. Texto convence; ausência de botão impede.
    expect(trecho).toContain("não tem botão de reenviar");
  });
});

describe("✅ fila vazia é o estado NORMAL — sem vermelho, sem \"erro\"", () => {
  const html = view({ estado: "ok", dados: DADOS_VAZIOS });
  const txt = texto(html);

  it("mostra o EmptyState com uma frase honesta, não um alarme", () => {
    expect(txt).toContain("Nenhum aviso preso");
    expect(txt).not.toMatch(/erro/i);
  });

  it("não usa nenhum token de perigo (`--danger`) para desenhar a fila vazia", () => {
    // Com 0 pendentes, 0 sem_canal e 0 legados, NADA nesta tela deveria
    // acionar o vermelho — nem o selo do cabeçalho (só aparece com
    // `total > 0`), nem os baldes (só ficam "danger" quando o valor é > 0),
    // nem o EmptyState (que não usa a cor de perigo).
    expect(html).not.toContain("var(--danger)");
    expect(html).not.toContain("var(--danger-bg)");
  });

  it("o cabeçalho não mostra selo de \"presos\" quando o total é zero", () => {
    expect(txt).not.toMatch(/\d+\s*presos?,\s*esperando reenvio/);
  });
});

describe("estado com pendentes de verdade — os dois reenviáveis, distintos", () => {
  const dados: Dados = {
    total: 2,
    pendentes: [
      {
        id: "p1",
        negocio: "Sushi Cazza",
        status: "falhou",
        motivo: "Resend recusou: domínio não verificado",
        contatoEmail: "contato@sushicazza.example",
        desde: "2026-06-01T00:00:00.000Z",
        horasEsperando: 1224, // 51 dias
        tentativas: 2,
      },
      {
        id: "p2",
        negocio: null,
        status: "skipped",
        motivo: "RESEND_API_KEY ausente",
        contatoEmail: null,
        desde: null,
        horasEsperando: null,
        tentativas: 0,
      },
    ],
    legados: { medido: true, total: 0, itens: [], ambiguidade: "ambiguidade de teste" },
    semCanal: { medido: true, total: 0, ambiguidade: "ambiguidade de teste" },
  };
  const html = view({ estado: "ok", dados });
  const txt = texto(html);

  it("mostra o botão de reenviar com a contagem certa", () => {
    expect(txt).toContain("Reenviar 2 pendentes");
  });

  it("o item sem negócio usa a ausência declarada da casa, nunca um buraco", () => {
    expect(txt).toContain("Negócio não informado");
  });

  it("distingue os dois status visualmente (rótulos diferentes)", () => {
    expect(txt).toContain("Falhou o envio");
    expect(txt).toContain("Sem configuração");
  });

  it("converte 1224h em dias, não deixa hora crua para o item mais antigo", () => {
    expect(txt).toContain("há 51 dias");
  });
});

describe("legados — ação separada, nomeada, nunca uma caixinha", () => {
  const dados: Dados = {
    ...DADOS_VAZIOS,
    legados: {
      medido: true,
      total: 1,
      itens: [{ id: "l1", businessName: "Camila Pereira", contatoEmail: "camila@example.com" }],
      ambiguidade: "avisoOrcamentoStatus NULL não é 'falhou' — é 'não sabemos'.",
    },
  };

  it("estado idle: o botão nomeia o risco (\"talvez já tenham recebido\"), não é um checkbox", () => {
    const html = view({ estado: "ok", dados });
    expect(texto(html)).toContain("Reenviar também os legados — talvez já tenham recebido");
    // A ação é um <button> nomeado — nunca uma caixinha ao lado do botão
    // normal que alguém marca sem querer.
    expect(html).not.toMatch(/<input[^>]*type="checkbox"/);
  });

  it("estado confirmando: pede confirmação explícita antes de disparar", () => {
    const txt = texto(view({ estado: "ok", dados }, { fase: "idle" }, { fase: "confirmando" }));
    expect(txt).toContain("Tem certeza?");
    expect(txt).toContain("Sim, reenviar mesmo assim");
    expect(txt).toContain("Cancelar");
  });

  it("o resultado dos legados NUNCA é somado ao dos pendentes normais — dois blocos distintos", () => {
    const txt = texto(
      view(
        { estado: "ok", dados },
        { fase: "idle" },
        { fase: "feito", normal: { reenviados: 1, aindaFalhando: 0, falhas: [] }, legados: { reenviados: 2, aindaFalhando: 1, falhas: [] } },
      ),
    );
    expect(txt).toContain("Pendentes normais");
    expect(txt).toContain("Legados");
    // Os dois números aparecem separados — "1" do normal e "2"/"1" dos
    // legados nunca colapsam numa soma (ex.: "3").
    expect(txt).not.toMatch(/\b3\b\s*sa[ií]ram agora/);
  });
});
