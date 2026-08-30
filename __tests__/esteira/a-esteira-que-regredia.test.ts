// A ESTEIRA QUE REGREDIA — 8ª volta do cliente oculto, 26/08/2026.
//
// Duas mentiras da tela do cliente, medidas em produção no mesmo dia:
//
//   1. 08:49 → "Criando o seu material · 50%". 08:55 → "Montando seu
//      planejamento · 25%". Um reinício de contêiner pôs `executionStatus` em
//      `pending`, o ramo da produção deixou de casar, e a leitura escorregou
//      para o DESENHO — que vem depois na ordem dos testes e ANTES na trilha.
//      O cliente viu a barra andar para trás.
//
//   2. 27 minutos em `proposal_pending`, com a proposta escrita (6 artefatos) e
//      o texto do orçamento já no portal, e a tela dizendo "Conhecendo o seu
//      negócio · 0%". `proposal_pending` — o estado canônico depois da entrega
//      do orçamento — não estava na lista de status desta função, e a leitura
//      caía no último `return`, que é a sondagem.

import { describe, it, expect } from "vitest";
import { lerFase, pisoDaTrilha, posicaoNaTrilha, type RetratoDoProjeto } from "@/lib/agency/esteira/fases";

const VAZIO: RetratoDoProjeto = {
  propostaAceita: false,
  tarefas: { total: 0, entregues: 0, produzindo: 0, bloqueadas: 0 },
  entregaveis: { total: 0, emRevisao: 0, comRessalva: 0, aprovados: 0 },
  pedidosAbertos: 0,
};
const retrato = (o: Partial<RetratoDoProjeto>): RetratoDoProjeto => ({ ...VAZIO, ...o });

describe("andamento não anda para trás", () => {
  // O par exato medido em produção, com o MESMO projeto e a única diferença
  // sendo o que o reinício de contêiner mexeu.
  const produzindo = retrato({
    propostaAceita: true, direcaoAprovadaEm: "2026-08-26T08:40:00Z", execucao: "running",
    tarefas: { total: 4, entregues: 2, produzindo: 2, bloqueadas: 0 },
  });
  const depoisDoReinicio = retrato({
    propostaAceita: true, direcaoAprovadaEm: "2026-08-26T08:40:00Z", execucao: "pending",
    tarefas: { total: 4, entregues: 2, produzindo: 0, bloqueadas: 0 },
  });

  it("08:49 — produção rodando: 50%", () => {
    expect(lerFase(produzindo).progresso).toBe(50);
    expect(lerFase(produzindo).paraCliente.titulo).toBe("Criando o seu material");
  });

  it("08:55 — a produção parou e o número NÃO cai", () => {
    const depois = lerFase(depoisDoReinicio);
    expect(depois.progresso).toBeGreaterThanOrEqual(lerFase(produzindo).progresso);
    // E a frase também não regride: quem aprovou a direção não volta a ler
    // "Fechamos negócio! Agora estamos desenhando".
    expect(depois.paraCliente.titulo).toBe("Criando o seu material");
    expect(depois.fase).toBe("producao");
  });

  it("parada NÃO é 'andando' — o dono é o PM e a próxima ação está dita", () => {
    const depois = lerFase(depoisDoReinicio);
    expect(depois.semaforo).toBe("esperando");
    expect(depois.responsavel).toBe("pm");
    expect(depois.paraEquipe.proximoPasso.length).toBeGreaterThan(10);
  });
});

describe("o piso da trilha sai dos CARIMBOS, nunca das contagens", () => {
  it("sem carimbo nenhum o piso é zero — ausência não promove ninguém", () => {
    expect(pisoDaTrilha(VAZIO)).toBe(0);
  });

  it("cada carimbo irreversível levanta o piso", () => {
    expect(pisoDaTrilha(retrato({ propostaAceita: true }))).toBe(posicaoNaTrilha("desenho"));
    expect(pisoDaTrilha(retrato({ direcaoAprovadaEm: "2026-08-26" }))).toBe(posicaoNaTrilha("producao"));
    expect(pisoDaTrilha(retrato({ apresentadoEm: "2026-08-26" }))).toBe(posicaoNaTrilha("aprovacao_cliente"));
    expect(pisoDaTrilha(retrato({ aprovadoPeloClienteEm: "2026-08-26" }))).toBe(posicaoNaTrilha("implementacao"));
    expect(pisoDaTrilha(retrato({ cicloAberto: true }))).toBe(posicaoNaTrilha("ciclo"));
  });

  it("CONTAGEM NÃO LEVANTA PISO — é ela que oscila, e foi ela que fez a barra cair", () => {
    expect(pisoDaTrilha(retrato({ execucao: "running", tarefas: { total: 4, entregues: 1, produzindo: 3, bloqueadas: 0 } }))).toBe(0);
  });

  it("um pedido de material aberto não faz a barra cair depois da direção", () => {
    // Este é o caminho pelo qual `aguardando_cliente` (posição de produção)
    // devolve antes do portão de direção — o piso segura de qualquer forma.
    const f = lerFase(retrato({
      propostaAceita: true, direcaoAprovadaEm: "2026-08-26", pedidosAbertos: 2, pedidosCobrados: 2,
      tarefas: { total: 4, entregues: 0, produzindo: 0, bloqueadas: 2 },
    }));
    expect(f.progresso).toBeGreaterThanOrEqual(50);
  });
});

describe("proposta escrita não é 'conhecendo o seu negócio'", () => {
  it("proposal_pending é o estado canônico depois da entrega — e agora tem ramo", () => {
    const f = lerFase(retrato({ statusDaSolicitacao: "proposal_pending" }));
    expect(f.fase).toBe("orcamento");
    expect(f.progresso).toBeGreaterThan(0);
    expect(f.paraCliente.titulo).not.toBe("Conhecendo o seu negócio");
    // É a vez do cliente, e a tela diz o que se espera dele.
    expect(f.responsavel).toBe("cliente");
    expect(f.paraCliente.oQueEsperamosDeVoce.length).toBeGreaterThan(10);
  });

  it("quem ainda NÃO tem proposta continua na sondagem, com 0%", () => {
    const f = lerFase(retrato({ statusDaSolicitacao: "new" }));
    expect(f.fase).toBe("sondagem");
    expect(f.progresso).toBe(0);
  });
});
