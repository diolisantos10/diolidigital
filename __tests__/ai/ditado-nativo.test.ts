// O MICROFONE QUE NÃO CUSTA NADA — reconhecimento nativo do navegador.
//
// Pergunta do CEO em 06/08/2026: "não tem como usar algum microfone sem usar
// OpenAI?". Tem. Este arquivo prova as DUAS METADES da resposta:
//   • navegador COM suporte fala e vira texto SEM tocar em rota paga nenhuma
//     (`fetch` não é chamado uma única vez);
//   • navegador SEM suporte (ou nativo que morreu no meio) é DETECTADO, e a
//     tela cai para o envio — em vez de oferecer um botão que não faz nada.
//
// Por que isto é teste e não confiança: o motivo histórico de a casa ter
// desistido do nativo foi "corta sozinho no silêncio". O religamento que
// conserta isso é invisível a olho nu e some no primeiro refactor.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  suportaDitadoNativo,
  iniciarDitadoNativo,
  classificarFalhaNativa,
  assinarDitadoNativo,
  rebaixarDitadoNativo,
  _restaurarDitadoNativo,
} from "@/lib/ai/ditado-nativo";

// ─── Um reconhecedor de mentira, com os mesmos botões do de verdade ──────────
class ReconhecedorFalso {
  static ultimo: ReconhecedorFalso | null = null;
  static inicios = 0;

  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 0;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  parado = false;

  constructor() {
    ReconhecedorFalso.ultimo = this;
  }
  start() { ReconhecedorFalso.inicios++; }
  stop() { this.parado = true; this.onend?.(); }
  abort() { this.parado = true; }

  /** Simula o navegador entregando um trecho. */
  dizer(texto: string, isFinal: boolean) {
    this.onresult?.({
      resultIndex: 0,
      results: { length: 1, 0: { isFinal, length: 1, 0: { transcript: texto } } },
    });
  }
  falhar(erro: string) { this.onerror?.({ error: erro }); }
  /** O corte por silêncio do Safari/Chrome: acaba sozinho, sem ninguém pedir. */
  cortarPorSilencio() { this.onend?.(); }
}

function comNavegador(opts: { webkit?: boolean; padrao?: boolean; seguro?: boolean } = {}) {
  const w: Record<string, unknown> = { isSecureContext: opts.seguro ?? true };
  if (opts.webkit) w.webkitSpeechRecognition = ReconhecedorFalso;
  if (opts.padrao) w.SpeechRecognition = ReconhecedorFalso;
  vi.stubGlobal("window", w);
}

beforeEach(() => {
  _restaurarDitadoNativo();
  ReconhecedorFalso.ultimo = null;
  ReconhecedorFalso.inicios = 0;
});
afterEach(() => {
  vi.unstubAllGlobals();
  _restaurarDitadoNativo();
});

describe("suporte é DETECTADO, nunca presumido", () => {
  it("sem navegador (servidor) não há ditado nativo", () => {
    expect(suportaDitadoNativo()).toBe(false);
  });

  it("navegador sem SpeechRecognition não tem nativo — e a sessão não abre", () => {
    comNavegador({});
    expect(suportaDitadoNativo()).toBe(false);
    const sessao = iniciarDitadoNativo({ onFinal: () => {}, onFim: () => {}, onFalha: () => {} });
    expect(sessao).toBeNull();
  });

  // O CASO DO DONO: no iPhone o nome da API é `webkitSpeechRecognition`. Se a
  // detecção olhasse só o nome padrão, o microfone estaria morto exatamente no
  // aparelho de quem pediu a funcionalidade.
  it("Safari/iPhone: só `webkitSpeechRecognition` já é suporte", () => {
    comNavegador({ webkit: true });
    expect(suportaDitadoNativo()).toBe(true);
  });

  it("contexto inseguro (http) não conta — o navegador nem pediria o microfone", () => {
    comNavegador({ padrao: true, seguro: false });
    expect(suportaDitadoNativo()).toBe(false);
  });
});

describe("a metade que economiza: falar vira texto SEM chamar rota paga", () => {
  it("o trecho FECHADO vai para o campo e nenhum fetch acontece", () => {
    const fetchFalso = vi.fn();
    vi.stubGlobal("fetch", fetchFalso);
    comNavegador({ padrao: true });

    const finais: string[] = [];
    const parciais: string[] = [];
    const sessao = iniciarDitadoNativo({
      onFinal: (t) => finais.push(t),
      onParcial: (t) => parciais.push(t),
      onFim: () => {},
      onFalha: () => {},
    });
    expect(sessao).not.toBeNull();

    ReconhecedorFalso.ultimo!.dizer("quero mudar a cor do post", true);

    expect(finais).toEqual(["quero mudar a cor do post"]);
    // A AFIRMAÇÃO QUE VALE DINHEIRO: o áudio não passou pelo nosso servidor.
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("o parcial é eco de tela, não conteúdo do campo", () => {
    comNavegador({ padrao: true });
    const finais: string[] = [];
    const parciais: string[] = [];
    iniciarDitadoNativo({
      onFinal: (t) => finais.push(t),
      onParcial: (t) => parciais.push(t),
      onFim: () => {},
      onFalha: () => {},
    });
    ReconhecedorFalso.ultimo!.dizer("quero mud", false);
    expect(parciais).toEqual(["quero mud"]);
    expect(finais).toEqual([]);
  });

  it("pede português do Brasil e escuta contínua — senão corta na primeira pausa", () => {
    comNavegador({ padrao: true });
    iniciarDitadoNativo({ onFinal: () => {}, onFim: () => {}, onFalha: () => {} });
    expect(ReconhecedorFalso.ultimo!.lang).toBe("pt-BR");
    expect(ReconhecedorFalso.ultimo!.continuous).toBe(true);
    expect(ReconhecedorFalso.ultimo!.interimResults).toBe(true);
  });
});

// O motivo histórico de a casa ter abandonado o nativo em 05/08/2026: "corta
// sozinho no silêncio". O dono fala, pensa dois segundos, e o microfone morreu.
describe("corte por silêncio religa — o dono pode pensar no meio da frase", () => {
  it("fim inesperado reabre a sessão", () => {
    comNavegador({ padrao: true });
    let fim = 0;
    iniciarDitadoNativo({ onFinal: () => {}, onFim: () => { fim++; }, onFalha: () => {} });
    expect(ReconhecedorFalso.inicios).toBe(1);

    ReconhecedorFalso.ultimo!.cortarPorSilencio();

    expect(ReconhecedorFalso.inicios).toBe(2); // religou
    expect(fim).toBe(0);                        // e a tela continua "ouvindo"
  });

  it("A OUTRA METADE: quando o usuário manda parar, acaba mesmo", () => {
    comNavegador({ padrao: true });
    let fim = 0;
    const sessao = iniciarDitadoNativo({ onFinal: () => {}, onFim: () => { fim++; }, onFalha: () => {} });
    sessao!.parar();
    expect(fim).toBe(1);
    expect(ReconhecedorFalso.inicios).toBe(1); // não religou
  });

  // ─── 06/08/2026 · o nativo que EXISTE e não funciona ───────────────────────
  // No iPhone todo navegador é WebKit, e um WebKit embarcado (Chrome, Edge,
  // Firefox do iOS) pode expor o construtor sem ter o serviço por trás: start()
  // passa, onend chega na hora, nenhum onerror dispara. Sem esta trava, o
  // religamento vira LOOP — 40 partidas, botão vermelho aceso e nem uma palavra
  // no campo, no aparelho do dono.
  it("abre e fecha sem NUNCA reconhecer nada: rebaixa em vez de religar para sempre", () => {
    comNavegador({ webkit: true });
    let fim = 0;
    iniciarDitadoNativo({ onFinal: () => {}, onFim: () => { fim++; }, onFalha: () => {} });

    ReconhecedorFalso.ultimo!.cortarPorSilencio();
    ReconhecedorFalso.ultimo!.cortarPorSilencio();
    ReconhecedorFalso.ultimo!.cortarPorSilencio();

    expect(ReconhecedorFalso.inicios).toBeLessThanOrEqual(3); // desistiu cedo
    expect(fim).toBe(1);                                      // a tela sai de "ouvindo"
    expect(suportaDitadoNativo()).toBe(false);                // e cai para o envio
  });

  it("quem JÁ reconheceu alguma coisa continua religando — silêncio no meio da frase é normal", () => {
    comNavegador({ padrao: true });
    iniciarDitadoNativo({ onFinal: () => {}, onFim: () => {}, onFalha: () => {} });

    ReconhecedorFalso.ultimo!.dizer("preciso trocar", false);
    for (let i = 0; i < 5; i++) ReconhecedorFalso.ultimo!.cortarPorSilencio();

    expect(ReconhecedorFalso.inicios).toBe(6);
    expect(suportaDitadoNativo()).toBe(true);
  });
});

describe("cada falha vira a SUA frase — e só a técnica rebaixa o caminho", () => {
  it("permissão negada é escolha do usuário: vira frase e NÃO troca de caminho", () => {
    comNavegador({ padrao: true });
    const motivos: string[] = [];
    iniciarDitadoNativo({ onFinal: () => {}, onFim: () => {}, onFalha: (m) => motivos.push(m) });
    ReconhecedorFalso.ultimo!.falhar("not-allowed");

    expect(motivos).toEqual(["sem_permissao"]);
    // Trocar para o envio não muda a resposta do sistema operacional.
    expect(suportaDitadoNativo()).toBe(true);
  });

  it("falha de REDE rebaixa: o nativo do Chrome depende de um serviço remoto", () => {
    comNavegador({ padrao: true });
    const motivos: string[] = [];
    const avisos = vi.fn();
    const cancelar = assinarDitadoNativo(avisos);

    iniciarDitadoNativo({ onFinal: () => {}, onFim: () => {}, onFalha: (m) => motivos.push(m) });
    ReconhecedorFalso.ultimo!.falhar("network");

    expect(motivos).toEqual(["rede"]);
    expect(suportaDitadoNativo()).toBe(false); // a tela cai para o envio
    expect(avisos).toHaveBeenCalled();          // e é avisada, não descobre por acaso
    cancelar();
  });

  it("o ditado do sistema desligado (iOS) rebaixa — aí o envio RESOLVE", () => {
    expect(classificarFalhaNativa("service-not-allowed")).toMatchObject({
      motivo: "sem_permissao",
      rebaixa: true,
    });
  });

  it("parada do usuário não é erro nenhum", () => {
    expect(classificarFalhaNativa("aborted").silencioso).toBe(true);
  });

  it("silêncio vira 'sem_texto' e não derruba o caminho nativo", () => {
    expect(classificarFalhaNativa("no-speech")).toMatchObject({ motivo: "sem_texto", rebaixa: false });
  });

  it("rebaixado, o nativo não abre mais sessão — nada de botão que não faz nada", () => {
    comNavegador({ padrao: true });
    rebaixarDitadoNativo();
    expect(iniciarDitadoNativo({ onFinal: () => {}, onFim: () => {}, onFalha: () => {} })).toBeNull();
  });
});

// ─── A trava nas TELAS ───────────────────────────────────────────────────────
// As duas superfícies com microfone (portal e briefing público) têm que tentar
// o nativo ANTES de gravar e enviar. Sem esta trava, um refactor bem
// intencionado inverte a ordem e a casa volta a pagar por minuto — e a voltar a
// depender de saldo — sem ninguém perceber, porque na tela fica tudo igual.
describe("as telas do microfone tentam o nativo primeiro", () => {
  // A ordem que importa não é a do ARQUIVO — é a de dentro da função que
  // DECIDE. Comparar posições no arquivo inteiro dá falso vermelho (o comentário
  // do topo cita a rota) e falso verde (a função de envio costuma vir antes).
  const TELAS = [
    {
      nome: "portal · BotaoDeDitado",
      caminho: "components/portal/Ditado.tsx",
      decisao: "const acionar = useCallback(",
      envio: "gravar()",
    },
    {
      nome: "briefing público · useSpeechToText",
      caminho: "lib/hooks/useSpeechToText.ts",
      decisao: "const startListening = useCallback(",
      envio: "gravarEEnviar()",
    },
  ];

  it.each(TELAS)("$nome importa o caminho nativo e o consulta antes de enviar", ({ caminho, decisao, envio }) => {
    const fonte = readFileSync(caminho, "utf8");
    expect(fonte).toContain("@/lib/ai/ditado-nativo");

    const inicio = fonte.indexOf(decisao);
    expect(inicio).toBeGreaterThan(-1);
    const corpo = fonte.slice(inicio);

    const perguntou = corpo.indexOf("if (suportaDitadoNativo())");
    const enviou = corpo.indexOf(envio);
    expect(perguntou).toBeGreaterThan(-1);
    expect(enviou).toBeGreaterThan(-1);
    expect(perguntou).toBeLessThan(enviou);
  });

  it("o instantâneo de servidor continua `false` — foi ele que fechou a hidratação", () => {
    const fonte = readFileSync("components/portal/Ditado.tsx", "utf8");
    expect(fonte).toContain("useSyncExternalStore");
    expect(fonte).toContain("() => false");
  });
});
