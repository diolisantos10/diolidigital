import { describe, it, expect, beforeEach, vi } from "vitest";

const generate = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai/generate", () => ({ generate }));

import {
  auditDeliverable, revisionStatusDoVeredito, escolherArbitro,
  foiAprovadaPelaQualidade, ficouSemArbitro, AUDIT_TIMEOUT_MS,
} from "@/lib/agency/execution/quality-auditor";
import { TODOS_OS_ESPECIALISTAS } from "@/lib/agency/execution/especialistas";

// `tipoDaEntrega` passou a ser OBRIGATÓRIO em 24/08/2026: sem saber se julga um
// post ou um plano, o juiz inventa a régua — foi o que reprovou o
// "Posicionamento" por ele ser um documento de estratégia. Ver a trava em
// `auditDeliverable`.
const base = { deptLabel: "Social Media", title: "Pacote", content: "conteúdo da entrega", brandContext: "marca X", workspaceId: "ws1", tipoDaEntrega: "social" };

beforeEach(() => vi.clearAllMocks());

// ── TRÊS ESTADOS ────────────────────────────────────────────────────────────
// O bug consertado em 04/08/2026: `pass` significava três coisas diferentes —
// "olhei e aprovei", "a IA caiu" e "a IA respondeu lixo". As duas últimas viravam
// `quality_ok` no banco e a peça ia ao cliente como se um árbitro tivesse dito
// sim. Cada teste abaixo existe para que uma dessas confusões não volte.
describe("quality-auditor — três estados: aprovado · reprovado · nao_auditado", () => {
  it("entrega boa → aprovado", async () => {
    generate.mockResolvedValue({ ok: true, data: { verdict: "pass", issues: [], note: "no tom, sem problemas" } });
    const v = await auditDeliverable(base);
    expect(v.verdict).toBe("aprovado");
    expect(v.note).toMatch(/tom/);
    expect(revisionStatusDoVeredito(v.verdict)).toBe("quality_ok");
  });

  it("entrega com problema → reprovado + issues (é o que bloqueia)", async () => {
    generate.mockResolvedValue({ ok: true, data: { verdict: "flag", issues: ["promete resultado garantido", "inventa preço"], note: "revisar" } });
    const v = await auditDeliverable(base);
    expect(v.verdict).toBe("reprovado");
    expect(v.issues.length).toBe(2);
    expect(revisionStatusDoVeredito(v.verdict)).toBe("quality_flag");
  });

  it("IA da auditoria indisponível → nao_auditado (NUNCA aprovado)", async () => {
    generate.mockResolvedValue({ ok: false });
    const v = await auditDeliverable(base);
    expect(v.verdict).toBe("nao_auditado");
    expect(v.motivo).toBe("ia_indisponivel");
    expect(foiAprovadaPelaQualidade(v.verdict)).toBe(false);
    expect(revisionStatusDoVeredito(v.verdict)).toBe("quality_nao_auditado");
    expect(v.note).toMatch(/NÃO AUDITADA/);
  });

  it("erro inesperado → nao_auditado, não aprovado", async () => {
    generate.mockRejectedValue(new Error("boom"));
    const v = await auditDeliverable(base);
    expect(v.verdict).toBe("nao_auditado");
    expect(v.motivo).toBe("erro");
    expect(foiAprovadaPelaQualidade(v.verdict)).toBe(false);
  });

  it("timeout do provedor → nao_auditado (a produção não fica pendurada)", async () => {
    vi.useFakeTimers();
    generate.mockImplementation(() => new Promise(() => { /* nunca resolve */ }));
    const p = auditDeliverable(base);
    await vi.advanceTimersByTimeAsync(AUDIT_TIMEOUT_MS + 10);
    const v = await p;
    vi.useRealTimers();
    expect(v.verdict).toBe("nao_auditado");
    expect(v.motivo).toBe("timeout");
    expect(ficouSemArbitro(v.verdict)).toBe(true);
  });

  it("resposta ilegível do juiz NÃO é aprovação — era o `? :` que virava pass", async () => {
    for (const lixo of [{}, { verdict: null }, { verdict: "talvez" }, { verdict: 7 }]) {
      generate.mockResolvedValue({ ok: true, data: lixo });
      const v = await auditDeliverable(base);
      expect(v.verdict).toBe("nao_auditado");
      expect(v.motivo).toBe("resposta_invalida");
    }
  });

  it("nenhum veredito além de 'aprovado' conta como aprovado", () => {
    expect(foiAprovadaPelaQualidade("aprovado")).toBe(true);
    expect(foiAprovadaPelaQualidade("reprovado")).toBe(false);
    expect(foiAprovadaPelaQualidade("nao_auditado")).toBe(false);
    // Os três estados têm três `revisionStatus` distintos — se dois colidirem,
    // um deles está sendo lido como o outro em alguma tela.
    const status = (["aprovado", "reprovado", "nao_auditado"] as const).map(revisionStatusDoVeredito);
    expect(new Set(status).size).toBe(3);
  });
});

// O critério do CEO (04/08/2026): "os nossos carrosséis têm a ver com os que
// eles fizeram lá?". Só pontua quando existe FEED contra o que medir — punir a
// peça por uma conexão que o cliente não fez seria inventar critério, e
// perguntar "conversa com o feed?" sobre uma conta sem nenhum post é pedir uma
// resposta que só pode ser inventada.
//
// O estado vem do BOOLEANO da SinteseDoFeed. Antes vinha de farejar a substring
// "FEED REAL DO CLIENTE" no contexto — e a conta conectada com ZERO posts
// produz essa substring sem a marca "feed não lido", então o juiz era
// perguntado sobre nada.
describe("o critério do feed real na auditoria", () => {
  const CTX_COM_FEED = "Negócio: X\nFEED REAL DO CLIENTE (Instagram, 24 posts lidos em 2026-08-04):\n- Tom das legendas: próximo";
  beforeEach(() => generate.mockResolvedValue({ ok: true, data: { verdict: "pass", issues: [], note: "ok" } }));

  it("feed lido COM posts → a Qualidade pergunta se a peça CONVERSA com ele", async () => {
    await auditDeliverable({ ...base, brandContext: CTX_COM_FEED, feed: { lida: true, posts: 24 } });
    const user = generate.mock.calls[0]![0].user as string;
    expect(user).toMatch(/\(6\).*CONVERSA com o FEED REAL/);
  });

  it("feed não lido → o critério NÃO pontua e a auditoria é avisada para não punir", async () => {
    await auditDeliverable({
      ...base,
      brandContext: "Negócio: X\nFEED REAL DO CLIENTE (Instagram): feed não lido: sem conexão. PROIBIDO inferir.",
      feed: { lida: false, posts: 0 },
    });
    const user = generate.mock.calls[0]![0].user as string;
    expect(user).not.toMatch(/\(6\)/);
    expect(user).toMatch(/NÃO penalize/);
  });

  it("conta conectada e SEM nenhum post → não existe feed contra o que medir: critério fora, aviso próprio", async () => {
    await auditDeliverable({
      ...base,
      // Este contexto contém "FEED REAL DO CLIENTE" e NÃO contém "feed não
      // lido" — era exatamente o caso que enganava o farejador de substring.
      brandContext: "Negócio: X\nFEED REAL DO CLIENTE (Instagram, lido em 2026-08-04): a conta está conectada e NÃO tem nenhum post publicado.",
      feed: { lida: true, posts: 0 },
    });
    const user = generate.mock.calls[0]![0].user as string;
    expect(user).not.toMatch(/\(6\)/);
    expect(user).toMatch(/NÃO tem nenhum post publicado/);
    expect(user).toMatch(/NÃO penalize/);
  });

  it("chamador que não leu feed nenhum (fluxos antigos) → prompt igual ao de sempre", async () => {
    await auditDeliverable(base);
    const user = generate.mock.calls[0]![0].user as string;
    expect(user).not.toMatch(/\(6\)/);
    expect(user).not.toMatch(/penalize/);
  });

  it("o critério NÃO depende do texto do contexto: contexto sem o rótulo, mas feed lido → critério entra", async () => {
    await auditDeliverable({ ...base, brandContext: "marca X", feed: { lida: true, posts: 12 } });
    const user = generate.mock.calls[0]![0].user as string;
    expect(user).toMatch(/\(6\)/);
  });
});

// ── O JUIZ NÃO PODE SER O AUTOR ─────────────────────────────────────────────
// O gate `quality_audit_impartial` DECLARA que a auditoria roda num modelo
// diferente do que gerou a peça. Até 05/08/2026 o código garantia o contrário:
// 11 dos 14 especialistas são "claude" e o auditor fixava
// `preferredProvider: "claude"`. Estes testes existem para que a declaração e o
// código não voltem a se contradizer.
describe("a auditoria é IMPARCIAL — o juiz nunca é o autor", () => {
  it("autor claude → o árbitro pedido NÃO é claude", async () => {
    generate.mockResolvedValue({ ok: true, provider: "openai", data: { verdict: "pass", issues: [], note: "ok" } });
    await auditDeliverable({ ...base, provedorDoAutor: "claude" });
    expect(generate.mock.calls[0]![0].preferredProvider).not.toBe("claude");
  });

  it("autor openai → o árbitro pedido NÃO é openai", async () => {
    generate.mockResolvedValue({ ok: true, provider: "claude", data: { verdict: "pass", issues: [], note: "ok" } });
    await auditDeliverable({ ...base, provedorDoAutor: "openai" });
    expect(generate.mock.calls[0]![0].preferredProvider).not.toBe("openai");
  });

  it("autor não informado é tratado como claude — a suposição conservadora desta casa", async () => {
    generate.mockResolvedValue({ ok: true, provider: "openai", data: { verdict: "pass", issues: [], note: "ok" } });
    await auditDeliverable(base);
    expect(generate.mock.calls[0]![0].preferredProvider).not.toBe("claude");
  });

  it("nenhum especialista da casa pode ser julgado por si mesmo", () => {
    for (const e of TODOS_OS_ESPECIALISTAS) {
      expect(escolherArbitro(e.provedor ?? "claude")).not.toBe(e.provedor ?? "claude");
    }
  });

  it("caiu de volta no MESMO modelo (chave única) → aprovação vira nao_auditado, não aprovação", async () => {
    // `preferredProvider` é preferência, não trava: sem a chave do árbitro,
    // `generate` volta para a fila e o autor se auto-aprova em silêncio.
    generate.mockResolvedValue({ ok: true, provider: "claude", data: { verdict: "pass", issues: [], note: "ok" } });
    const v = await auditDeliverable({ ...base, provedorDoAutor: "claude" });
    expect(v.verdict).toBe("nao_auditado");
    expect(v.motivo).toBe("juiz_nao_imparcial");
    expect(foiAprovadaPelaQualidade(v.verdict)).toBe(false);
    expect(revisionStatusDoVeredito(v.verdict)).toBe("quality_nao_auditado");
  });

  it("caiu de volta no MESMO modelo, mas REPROVOU → a reprovação continua valendo", async () => {
    // Assimetria deliberada: um problema apontado pelo próprio modelo é um
    // problema. Jogar a reprovação fora seria trocar um freio real por pureza.
    generate.mockResolvedValue({ ok: true, provider: "claude", data: { verdict: "flag", issues: ["inventa preço"], note: "revisar" } });
    const v = await auditDeliverable({ ...base, provedorDoAutor: "claude" });
    expect(v.verdict).toBe("reprovado");
    expect(v.issues).toContain("inventa preço");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// A RÉGUA DETERMINÍSTICA RODA ANTES DA IA (13/08/2026)
// ═══════════════════════════════════════════════════════════════════════════
//
// ── POR QUE ESTE BLOCO EXISTE, e como ele foi descoberto ────────────────────
//
// A régua (`regua-do-texto.ts`) nasceu com 81 testes próprios, todos verdes. Aí
// desliguei a chamada dela DENTRO deste juiz — `if (false && reguaSeAplicaA…)` —
// e rodei a suíte inteira: **593 testes, nenhum falhou.**
//
// Ou seja: a trava estava construída, testada, e nada provava que ela RODAVA.
// É a definição de portão decorativo, e é a doença que este repositório já
// nomeou ("mecanismo construído e sem chamador é a doença desta casa",
// `docs/projetos/cityjobs-registro-07-08.md`). Os testes abaixo são o que
// impede a régua de virar mais uma.
//
// Cada um confere as DUAS metades: que a régua barra, e que ela não passou a
// barrar tudo.
describe("a régua de texto roda ANTES do juiz de IA", () => {
  it("frase medida em produção é reprovada SEM consultar modelo nenhum", async () => {
    // "Tem centenas de vagas esperando" foi ao calendário de um cliente real em
    // 07/08 com `quality_ok` carimbado por este juiz.
    const v = await auditDeliverable({
      ...base,
      content: "Tem centenas de vagas esperando por você.",
      tipoDaEntrega: "social",
    });
    expect(v.verdict).toBe("reprovado");
    // A METADE QUE IMPORTA: nenhuma chamada de IA. Reprovação determinística
    // não custa uma chamada e não pode ser convencida por um modelo bem-humorado.
    expect(generate).not.toHaveBeenCalled();
  });

  it("o TÍTULO também é conferido — é o primeiro campo que o cliente lê", async () => {
    const v = await auditDeliverable({
      ...base,
      title: "A solução inovadora que sua empresa procura",
      content: "Texto absolutamente normal sobre o horário de atendimento.",
      tipoDaEntrega: "social",
    });
    expect(v.verdict).toBe("reprovado");
    expect(generate).not.toHaveBeenCalled();
  });

  it("a recusa carrega a evidência: qual trecho e qual regra", async () => {
    const v = await auditDeliverable({
      ...base,
      content: "Somos a melhor agência da região.",
      tipoDaEntrega: "social",
    });
    expect(v.issues.length).toBeGreaterThan(0);
    expect(v.issues.join(" ")).toMatch(/superlativo/i);
    // E diz que a recusa é de CÓDIGO — senão o time discute com o juiz uma
    // decisão que nenhum juiz tomou.
    expect(v.note).toMatch(/determinística|sem IA/i);
  });

  it("reprovada pela régua BLOQUEIA — é `quality_flag` no banco", async () => {
    const v = await auditDeliverable({
      ...base, content: "Clientes satisfeitos aprovam.", tipoDaEntrega: "social",
    });
    expect(revisionStatusDoVeredito(v.verdict)).toBe("quality_flag");
    expect(foiAprovadaPelaQualidade(v.verdict)).toBe(false);
  });

  it("peça limpa PASSA pela régua e vai para o juiz de IA — a trava não barra tudo", async () => {
    generate.mockResolvedValue({ ok: true, provider: "openai", data: { verdict: "pass", issues: [], note: "boa" } });
    const v = await auditDeliverable({
      ...base,
      title: "Pão de fermentação natural",
      content: "A massa descansa doze horas antes de ir ao forno, e é isso que dá o sabor.",
      tipoDaEntrega: "social",
    });
    expect(v.verdict).toBe("aprovado");
    // A opinião da IA continua existindo — ela julga em cima do que passou.
    expect(generate).toHaveBeenCalled();
  });

  it("documento interno não passa pela régua — a análise legítima não é reprovada", async () => {
    // O especialista de concorrência tem por trabalho escrever como o
    // concorrente se posiciona, e essa frase casa com o padrão de superlativo
    // pela forma. Reprovar a análise correta ensinaria o time a desligar o freio.
    generate.mockResolvedValue({ ok: true, provider: "openai", data: { verdict: "pass", issues: [], note: "ok" } });
    const v = await auditDeliverable({
      ...base,
      content: "A Padaria X se posiciona como a melhor da região e deixa a brecha do atendimento noturno.",
      tipoDaEntrega: "strategy",
    });
    expect(v.verdict).toBe("aprovado");
    expect(generate).toHaveBeenCalled();
  });

  it("tipo AUSENTE não isenta — ausência de informação não é informação", async () => {
    const v = await auditDeliverable({ ...base, content: "Clientes satisfeitos aprovam." });
    expect(v.verdict).toBe("reprovado");
    expect(generate).not.toHaveBeenCalled();
  });
});


// ── O JUIZ NÃO JULGA O QUE NÃO SABE O QUE É ─────────────────────────────────
//
// Medido no piloto de 24/08/2026: a Qualidade reprovou o "Posicionamento" (tipo
// `strategy`) com o parecer "a auditoria exige a entrega REAL (peças prontas),
// não documentação de planejamento". Reprovou um plano por ser um plano — porque
// o prompt nunca dizia que tipo de artefato estava na mesa, e o juiz preencheu a
// lacuna sozinho.
describe("sem saber O QUE julga, o juiz não julga", () => {
  it("tipo ausente → nao_auditado, e NENHUMA chamada de IA é feita", async () => {
    // `nao_auditado` nunca é aprovação: segura a apresentação, como deve.
    const v = await auditDeliverable({ ...base, tipoDaEntrega: null });
    expect(v.verdict).toBe("nao_auditado");
    expect(v.motivo).toBe("tipo_nao_declarado");
    expect(generate).not.toHaveBeenCalled();
  });

  it("tipo em branco também não passa — string vazia não é declaração", async () => {
    const v = await auditDeliverable({ ...base, tipoDaEntrega: "   " });
    expect(v.verdict).toBe("nao_auditado");
    expect(v.motivo).toBe("tipo_nao_declarado");
  });

  it("documento interno é julgado COMO PLANO, e o prompt diz isso", async () => {
    generate.mockResolvedValue({ ok: true, data: { verdict: "pass", issues: [], note: "ok" } });
    await auditDeliverable({ ...base, tipoDaEntrega: "strategy" });
    const prompt = generate.mock.calls[0]![0].user as string;
    expect(prompt).toMatch(/DOCUMENTO DE TRABALHO INTERNO/);
    // A frase que impede exatamente a reprovação medida no piloto.
    expect(prompt).toMatch(/NÃO reprove por não ser 'entrega final'/);
  });

  it("peça de comunicação continua sendo julgada como peça pronta", async () => {
    generate.mockResolvedValue({ ok: true, data: { verdict: "pass", issues: [], note: "ok" } });
    await auditDeliverable({ ...base, tipoDaEntrega: "social" });
    const prompt = generate.mock.calls[0]![0].user as string;
    expect(prompt).toMatch(/PEÇA DE COMUNICAÇÃO/);
    expect(prompt).toMatch(/pode ser publicada como está/);
  });

  it("a pauta do mês é PLANO, não peça — e continua na régua de texto", async () => {
    // Medido ao vivo: a pauta era do tipo `social`, a Qualidade a julgava como
    // post e a reprovava com "pode-se publicar COMO ESTÁ? Não — é um blueprint".
    // Estava certa sobre o artefato e errada sobre o que lhe disseram que ele era.
    generate.mockResolvedValue({ ok: true, data: { verdict: "pass", issues: [], note: "ok" } });
    await auditDeliverable({ ...base, tipoDaEntrega: "plano-de-conteudo" });
    const prompt = generate.mock.calls[0]![0].user as string;
    expect(prompt).toMatch(/DOCUMENTO DE TRABALHO INTERNO/);
  });

  it("plano de conteúdo NÃO é isento da régua determinística de texto", async () => {
    // A trava contra a economia errada: juntar as duas listas isentaria a pauta
    // da régua de texto sem ninguém ter pedido. O cliente LÊ o calendário dele.
    const { reguaSeAplicaA } = await import("@/lib/agency/execution/regua-do-texto");
    expect(reguaSeAplicaA("plano-de-conteudo")).toBe(true);
    expect(reguaSeAplicaA("strategy")).toBe(false);
  });

  it("INFORMAR não é AFROUXAR: os critérios de invenção continuam nos dois casos", async () => {
    // Se algum dia alguém "simplificar" o prompt do documento interno tirando os
    // critérios, isto fica vermelho. Nenhum critério sai — só a régua errada.
    generate.mockResolvedValue({ ok: true, data: { verdict: "pass", issues: [], note: "ok" } });
    for (const tipo of ["strategy", "social"]) {
      generate.mockClear();
      await auditDeliverable({ ...base, tipoDaEntrega: tipo });
      const prompt = generate.mock.calls[0]![0].user as string;
      expect(prompt, `tipo ${tipo} perdeu o critério de invenção`).toMatch(/inventa n[úu]mero\/pre[çc]o\/dado/);
      expect(prompt, `tipo ${tipo} perdeu o critério de promessa falsa`).toMatch(/promessa falsa/);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DEPOIS DA SEPARAÇÃO, A RÉGUA AINDA MORDE
// ═══════════════════════════════════════════════════════════════════════════
//
// Em 24/08/2026 o contexto do juiz foi separado do contexto do autor: os FATOS
// vão para os dois, as REGRAS DE REDAÇÃO só para quem escreve. O motivo está em
// `fatosDaVerdade` — o juiz lia instruções do autor e cobrava OMISSÃO de fato,
// reprovando peças que ele mesmo chamava de publicáveis.
//
// Separação é onde uma régua morre sem ninguém notar. Estes testes exigem que
// ela continue pegando o que sempre pegou, nos DOIS tipos de entrega.
describe("a régua continua mordendo depois de o juiz parar de ler o manual do autor", () => {
  const flagrar = (note: string, issues: string[]) =>
    generate.mockResolvedValue({ ok: true, data: { verdict: "flag", issues, note } });

  for (const tipo of ["social", "strategy"]) {
    it(`INVENÇÃO continua reprovando — tipo "${tipo}"`, async () => {
      flagrar("inventou telefone que ninguém informou", ["telefone (11) 3333-4444 não foi informado pelo cliente"]);
      const v = await auditDeliverable({ ...base, tipoDaEntrega: tipo });
      expect(v.verdict).toBe("reprovado");
      expect(v.issues.join(" ")).toMatch(/telefone/);
    });

    it(`PROMESSA FALSA continua reprovando — tipo "${tipo}"`, async () => {
      flagrar("promete resultado que ninguém pode garantir", ["'dobre seu faturamento em 30 dias' é garantia irreal"]);
      const v = await auditDeliverable({ ...base, tipoDaEntrega: tipo });
      expect(v.verdict).toBe("reprovado");
      expect(v.issues.join(" ")).toMatch(/garantia irreal/);
    });

    it(`o juiz recebe os CRITÉRIOS de julgamento — tipo "${tipo}"`, async () => {
      generate.mockResolvedValue({ ok: true, data: { verdict: "pass", issues: [], note: "ok" } });
      await auditDeliverable({ ...base, tipoDaEntrega: tipo });
      const prompt = generate.mock.calls[0]![0].user as string;
      expect(prompt).toMatch(/promessa falsa/);
      expect(prompt).toMatch(/inventa n[úu]mero\/pre[çc]o\/dado/);
    });
  }
});
