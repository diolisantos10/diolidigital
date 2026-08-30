// O ANDAMENTO É MONOTÔNICO — a régua que faltava (Fase 1, custo zero).
//
// ═══ O QUE ESTE ARQUIVO FECHA ════════════════════════════════════════════════
//
// `a-esteira-que-regredia.test.ts` prova UM par de estados: o par exato medido
// em produção às 08:49/08:55 (50% → 25%). Isso prova que AQUELE defeito foi
// consertado. Não prova a PROPRIEDADE — que para QUALQUER caminho que um
// projeto percorra, o número que o cliente vê nunca anda para trás.
//
// A diferença não é acadêmica: o defeito de 08:55 nasceu de um par que ninguém
// tinha imaginado (reinício de contêiner zerando `produzindo`). O próximo vai
// nascer de outro par que ninguém imaginou. Régua de par não pega par novo;
// régua de propriedade pega — e esta pegou um na primeira execução (abaixo).
//
// ─── OS DOIS EIXOS, E POR QUE A SEPARAÇÃO É O TESTE INTEIRO ─────────────────
//
// IRREVERSÍVEL — só liga, nunca desliga. São FATOS:
//   • os carimbos (direção aprovada não desaprova, apresentação não
//     desapresenta, produção concluída não desconclui);
//   • as LINHAS que nasceram no banco: tarefa concluída não desconclui,
//     entregável gravado não é apagado.
//
// VOLÁTIL — oscila, e tem todo o direito de oscilar:
//   • `execucao` (um reinício de contêiner a põe em `pending`);
//   • `tarefas.produzindo` e `tarefas.bloqueadas` (foi o zeramento de
//     `produzindo` que fez a barra cair em 26/08);
//   • a repartição dos entregáveis entre revisão/ressalva/aprovado;
//   • os pedidos de material abertos e o status da solicitação.
//
// O invariante: se os fatos de B contêm os fatos de A, então o PIOR caso de B
// é pelo menos o MELHOR caso de A. Ou seja: nada que oscile pode desfazer o
// que um fato já mostrou ao cliente.
//
// ─── O DEFEITO QUE ESTA RÉGUA ACHOU (26/08/2026, Fase 1) ────────────────────
//
// O piso da 10ª volta cobria os carimbos e PARAVA neles. O degrau
// `revisao_interna` (63%) não saía de carimbo nenhum: saía de CONTAGEM
// (`tarefas.entregues === tarefas.total`, ou `entregaveis.total > 0 &&
// execucao === "done"`). Medido aqui:
//
//     antes:  63%  revisao_interna  "Conferindo tudo antes de te mostrar"
//     depois: 50%  producao         "Criando o seu material"
//
// pelo MESMO reinício de contêiner que produziu o defeito original — o que
// oscilou foi `execucao: "done" → "pending"`. Conserto: `producaoConcluidaEm`,
// um carimbo que já estava gravado no banco (`executionFinishedAt` com
// `executionError` vazio) e que ninguém estava lendo.
//
// ─── COMO SE PROVA POR MUTAÇÃO ──────────────────────────────────────────────
//
// Em `lib/agency/esteira/fases.ts`:
//   (a) apague a linha `if (preenchido(r.producaoConcluidaEm)) nao_abaixo_de(
//       "revisao_interna");` → este arquivo fica VERMELHO (63% → 50%);
//   (b) troque `Math.max(posicaoNaTrilha(fase), piso)` por
//       `posicaoNaTrilha(fase)` (o piso inteiro desligado) → VERMELHO.
// As duas mutações foram exercitadas.

import { describe, it, expect } from "vitest";
import { lerFase, type RetratoDoProjeto } from "@/lib/agency/esteira/fases";

const VAZIO: RetratoDoProjeto = {
  propostaAceita: false,
  tarefas: { total: 0, entregues: 0, produzindo: 0, bloqueadas: 0 },
  entregaveis: { total: 0, emRevisao: 0, comRessalva: 0, aprovados: 0 },
  pedidosAbertos: 0,
};

/** OS FATOS. Na ordem em que a vida os produz; só ligam. */
const FATOS: { nome: string; aplicar: (r: RetratoDoProjeto) => RetratoDoProjeto }[] = [
  { nome: "propostaAceita", aplicar: (r) => ({ ...r, propostaAceita: true }) },
  { nome: "pagamentoConfirmado", aplicar: (r) => ({ ...r, pagamentoConfirmado: true }) },
  { nome: "tarefas nasceram", aplicar: (r) => ({ ...r, tarefas: { ...r.tarefas, total: 4 } }) },
  { nome: "direcaoAprovadaEm", aplicar: (r) => ({ ...r, direcaoAprovadaEm: "2026-08-26T08:40:00Z" }) },
  { nome: "tarefas concluídas", aplicar: (r) => ({ ...r, tarefas: { ...r.tarefas, total: 4, entregues: 4 } }) },
  { nome: "entregáveis gravados", aplicar: (r) => ({ ...r, entregaveis: { ...r.entregaveis, total: 4, emRevisao: 4 } }) },
  // O carimbo que esta régua descobriu faltando.
  { nome: "producaoConcluidaEm", aplicar: (r) => ({ ...r, producaoConcluidaEm: "2026-08-26T08:55:00Z" }) },
  { nome: "apresentadoEm", aplicar: (r) => ({ ...r, apresentadoEm: "2026-08-26T09:10:00Z" }) },
  { nome: "aprovadoPeloClienteEm", aplicar: (r) => ({ ...r, aprovadoPeloClienteEm: "2026-08-26T10:00:00Z" }) },
  { nome: "postsPublicados", aplicar: (r) => ({ ...r, postsPublicados: 3, redesConectadas: true }) },
  { nome: "cicloAberto", aplicar: (r) => ({ ...r, cicloAberto: true }) },
];

/**
 * O QUE OSCILA. Nunca reduz `total` nem `entregues` — isso são fatos.
 *
 * ⚠️ `exigeProducaoLiberada` não é conveniência de teste: é a TRAVA DA CASA
 * escrita como pré-condição. A produção só dispara depois do portão de direção
 * (`precisaAprovarDirecao`, e o portão da arte que confere pagamento), e não
 * há passada de execução sem tarefa. Um estado `execucao: "running"` num
 * projeto sem tarefa e sem direção aprovada não é um caminho que a casa
 * percorre — testá-lo seria cobrar monotonicidade de um estado impossível, que
 * é como uma régua vira mentira em vez de trava.
 */
const OSCILACOES: {
  nome: string;
  exigeProducaoLiberada?: boolean;
  /** Pedido de material nasce do DESENHO, que só existe depois do aceite. */
  exigeProposta?: boolean;
  aplicar: (r: RetratoDoProjeto) => RetratoDoProjeto;
}[] = [
  { nome: "rodando", exigeProducaoLiberada: true, aplicar: (r) => ({ ...r, execucao: "running", tarefas: { ...r.tarefas, produzindo: 3, bloqueadas: 0 } }) },
  { nome: "reinício do contêiner", aplicar: (r) => ({ ...r, execucao: "pending", tarefas: { ...r.tarefas, produzindo: 0, bloqueadas: 0 } }) },
  { nome: "esteira idle", aplicar: (r) => ({ ...r, execucao: "idle", tarefas: { ...r.tarefas, produzindo: 0, bloqueadas: 0 } }) },
  { nome: "passada concluída", exigeProducaoLiberada: true, aplicar: (r) => ({ ...r, execucao: "done", tarefas: { ...r.tarefas, produzindo: 0, bloqueadas: 0 } }) },
  { nome: "passada falhou", exigeProducaoLiberada: true, aplicar: (r) => ({ ...r, execucao: "failed", tarefas: { ...r.tarefas, produzindo: 0, bloqueadas: 2 } }) },
  { nome: "pedido de material cobrado", exigeProposta: true, aplicar: (r) => ({ ...r, execucao: "pending", pedidosAbertos: 3, pedidosCobrados: 3, tarefas: { ...r.tarefas, produzindo: 0, bloqueadas: 3 } }) },
  { nome: "pedido aberto e nunca cobrado", exigeProposta: true, aplicar: (r) => ({ ...r, execucao: "pending", pedidosAbertos: 5, pedidosCobrados: 0, tarefas: { ...r.tarefas, produzindo: 0, bloqueadas: 0 } }) },
  { nome: "entregáveis com ressalva", exigeProducaoLiberada: true, aplicar: (r) => ({ ...r, execucao: "done", entregaveis: r.entregaveis.total > 0 ? { ...r.entregaveis, emRevisao: 0, comRessalva: 4, aprovados: 0 } : r.entregaveis }) },
  { nome: "entregáveis aprovados por dentro", exigeProducaoLiberada: true, aplicar: (r) => ({ ...r, execucao: "done", entregaveis: r.entregaveis.total > 0 ? { ...r.entregaveis, emRevisao: 0, comRessalva: 0, aprovados: 4, decisoesDisponiveis: 4 } : r.entregaveis }) },
];

const STATUS = ["new", "qualified", "proposal_pending", "accepted", "in_progress", null];

function extremos(base: RetratoDoProjeto, rotulo: string) {
  let min = Infinity, max = -Infinity, pior = "";
  const producaoLiberada = base.tarefas.total > 0 && Boolean(base.direcaoAprovadaEm);
  for (const osc of OSCILACOES) {
    if (osc.exigeProducaoLiberada && !producaoLiberada) continue;
    if (osc.exigeProposta && !base.propostaAceita) continue;
    for (const st of STATUS) {
      const r = { ...osc.aplicar(base), statusDaSolicitacao: st };
      const p = lerFase(r).progresso;
      expect(p, `progresso fora de 0–100 em [${rotulo}] · ${osc.nome}`).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(100);
      if (p < min) { min = p; pior = `${osc.nome} · status=${String(st)}`; }
      if (p > max) max = p;
    }
  }
  return { min, max, pior };
}

describe("o andamento nunca anda para trás — a PROPRIEDADE, não o par", () => {
  it("a trajetória real — os fatos na ordem em que a vida os produz — é estritamente monotônica", () => {
    // Um projeto não tem `apresentadoEm` sem ter `propostaAceita`. A trajetória
    // real é o PREFIXO da lista de fatos, e é sobre ela que vale a régua mais
    // dura: o PIOR caso de um passo é pelo menos o MELHOR caso do passo
    // anterior. Nada que oscile desfaz o que um fato já mostrou ao cliente.
    const passos: { rotulo: string; min: number; max: number; pior: string }[] = [];
    let base = VAZIO;
    passos.push({ rotulo: "nada ainda", ...extremos(base, "nada ainda") });
    for (const f of FATOS) {
      base = f.aplicar(base);
      passos.push({ rotulo: f.nome, ...extremos(base, f.nome) });
    }
    for (let j = 1; j < passos.length; j++) {
      for (let i = 0; i < j; i++) {
        expect(
          passos[j].min,
          `REGRESSÃO na trajetória: depois de [${passos[i].rotulo}] o cliente já via ` +
            `${passos[i].max}%, e depois de [${passos[j].rotulo}] a barra cai para ` +
            `${passos[j].min}% (${passos[j].pior})`,
        ).toBeGreaterThanOrEqual(passos[i].max);
      }
    }
    expect(passos[passos.length - 1].min).toBe(100);
  });

  it("e a varredura larga: TODAS as 2.048 combinações de fatos, com o piso subindo junto", () => {
    // A trilha acima é a ordem canônica. Esta varredura não supõe ordem
    // nenhuma: percorre o reticulado inteiro de fatos (2^11) e cobra que o
    // PISO GARANTIDO — o pior caso de cada combinação — nunca desça quando
    // fatos são acrescentados. É a régua que sobra quando não se sabe em que
    // ordem a vida vai acontecer.
    const n = FATOS.length;
    const porMascara = new Map<number, { min: number; max: number; pior: string; nomes: string }>();
    for (let mascara = 0; mascara < 1 << n; mascara++) {
      let base = VAZIO;
      const nomes: string[] = [];
      for (let i = 0; i < n; i++) {
        if (mascara & (1 << i)) { base = FATOS[i].aplicar(base); nomes.push(FATOS[i].nome); }
      }
      porMascara.set(mascara, { ...extremos(base, nomes.join("+")), nomes: nomes.join("+") });
    }
    for (const [b, dadosB] of porMascara) {
      for (const [a, dadosA] of porMascara) {
        if (a === b || (a & b) !== a) continue;
        expect(
          dadosB.min,
          `O PISO DESCEU: [${dadosA.nomes || "nada"}] garante ${dadosA.min}% e ` +
            `[${dadosB.nomes}] — que a CONTÉM — garante só ${dadosB.min}% (${dadosB.pior})`,
        ).toBeGreaterThanOrEqual(dadosA.min);
      }
    }
  });

  it("o par exato de 26/08 que esta régua descobriu: 63% não vira 50% num reinício", () => {
    const base: RetratoDoProjeto = {
      ...VAZIO, propostaAceita: true, direcaoAprovadaEm: "2026-08-26T08:40:00Z",
      producaoConcluidaEm: "2026-08-26T08:55:00Z",
      tarefas: { total: 4, entregues: 4, produzindo: 0, bloqueadas: 0 },
      entregaveis: { total: 4, emRevisao: 4, comRessalva: 0, aprovados: 0 },
    };
    const antes = lerFase({ ...base, execucao: "done" });
    const depois = lerFase({
      ...base, execucao: "pending",
      tarefas: { total: 4, entregues: 2, produzindo: 0, bloqueadas: 0 },
      entregaveis: { total: 4, emRevisao: 0, comRessalva: 0, aprovados: 0 },
    });
    expect(antes.progresso).toBe(63);
    expect(depois.progresso, "a barra caiu de 63% no reinício do contêiner")
      .toBeGreaterThanOrEqual(antes.progresso);
  });

  it("a jornada completa, com o contêiner reiniciando entre cada fato, só sobe", () => {
    let r = VAZIO;
    let piso = 0;
    const trilha: string[] = [];
    for (const f of FATOS) {
      r = f.aplicar(r);
      const e = extremos(r, f.nome);
      trilha.push(`${f.nome} ${e.min}–${e.max}%`);
      expect(e.min, `andou para trás: ${trilha.join(" → ")}`).toBeGreaterThanOrEqual(piso);
      piso = e.max;
    }
    expect(lerFase(r).progresso).toBe(100);
  });

  it("o TEXTO também não regride depois da direção aprovada", () => {
    const comDirecao: RetratoDoProjeto = {
      ...VAZIO, propostaAceita: true, direcaoAprovadaEm: "2026-08-26T08:40:00Z",
      tarefas: { total: 4, entregues: 0, produzindo: 0, bloqueadas: 0 },
    };
    for (const osc of OSCILACOES) {
      const f = lerFase(osc.aplicar(comDirecao));
      expect(f.paraCliente.titulo, `'${osc.nome}' devolveu o cliente ao planejamento`)
        .not.toBe("Montando seu planejamento");
      expect(f.paraCliente.titulo).not.toBe("Conhecendo o seu negócio");
    }
  });
});
