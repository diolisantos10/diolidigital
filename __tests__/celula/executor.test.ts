// O EXECUTOR — e o teste que mais importa aqui não é nenhum dos vereditos:
// é a varredura que prova que este arquivo NÃO dirige navegador nenhum.
//
// A decisão 1 do CEO é Claude in Chrome, explicitamente NÃO OpenAI com
// Playwright. Um driver autenticado aqui seria executar o contrário da
// decisão 1 e chamar a decisão 2 de cumprida.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  planejarAcao,
  registrarExecucao,
  type AtestacaoDoPerfil,
  type PedidoDeExecucao,
} from "@/lib/agency/celula/executor";
import type { Credencial } from "@/lib/agency/celula/papeis";

const GERENTE: Credencial = {
  autoridade: "department_member",
  departamentos: ["client-service-sdr"],
  papelDeclaradoNaCelula: "gerente_de_atendimento",
};
const SDR: Credencial = {
  autoridade: "department_member",
  departamentos: ["client-service-sdr"],
  papelDeclaradoNaCelula: "sdr",
};

const ATESTADO: AtestacaoDoPerfil = {
  diretorioDoPerfil: "/var/lib/dioli/perfis/celula-99freelas",
  nenhumaOutraSessao: true,
  atestadoPor: "dioli",
  atestadoEm: new Date("2026-08-30T09:00:00Z"),
};

const AGORA = new Date("2026-08-30T12:00:00Z");
const RITMO_LIMPO = { ultimaAcaoEm: null, acoesNaUltimaHora: 0, acoesNoDia: 0 };

function pedido(over: Partial<PedidoDeExecucao> = {}): PedidoDeExecucao {
  return {
    acao: "ler_conversa",
    url: "https://www.99freelas.com.br/project/123",
    credencial: GERENTE,
    atestacao: ATESTADO,
    historicoDeRitmo: RITMO_LIMPO,
    agora: AGORA,
    env: {},
    ...over,
  };
}

describe("🔴 A GARANTIA DA DECISÃO 1 — este arquivo não dirige navegador", () => {
  const semComentarios = (t: string) =>
    t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
  const fonte = semComentarios(readFileSync("lib/agency/celula/executor.ts", "utf-8"));

  it("não importa Playwright, não abre Chromium, não faz login", () => {
    const PROIBIDOS = ["playwright", "chromium.launch", "launchPersistentContext", "newContext", "page.", "fetch("];
    const achados = PROIBIDOS.filter((p) => fonte.toLowerCase().includes(p.toLowerCase()));
    expect(achados, `executor não pode conter: ${achados.join(", ")}`).toEqual([]);
  });

  it("e a varredura sabe falhar — controle negativo", () => {
    expect(semComentarios('await chromium.launch();').includes("chromium.launch")).toBe(true);
    expect(semComentarios("// nunca usamos chromium.launch aqui\nconst x=1;").includes("chromium.launch")).toBe(false);
  });
});

describe("🔴 a atestação do perfil vem ANTES de tudo", () => {
  it("sem atestação, NADA é planejado — nem uma leitura", () => {
    const r = planejarAcao(pedido({ atestacao: null }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.regra).toBe("sem_atestacao_do_perfil");
  });

  it("atestação que ADMITE outra sessão bloqueia", () => {
    const r = planejarAcao(pedido({ atestacao: { ...ATESTADO, nenhumaOutraSessao: false } }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.regra).toBe("atestacao_malformada");
  });

  it("atestação sem autor ou sem data válida bloqueia", () => {
    expect(planejarAcao(pedido({ atestacao: { ...ATESTADO, atestadoPor: "  " } })).ok).toBe(false);
    expect(
      planejarAcao(pedido({ atestacao: { ...ATESTADO, atestadoEm: new Date("x") } as AtestacaoDoPerfil })).ok,
    ).toBe(false);
  });

  it("atestar o perfil PESSOAL do CEO não vale", () => {
    const r = planejarAcao(
      pedido({
        atestacao: { ...ATESTADO, diretorioDoPerfil: "/Users/dioli/Library/Application Support/Google/Chrome/Default" },
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.regra).toBe("perfil_nao_isolado");
  });
});

describe("a lista de permissão e o aceite humano", () => {
  it("destino fora da permissão é barrado — mesmo com tudo o mais em ordem", () => {
    const r = planejarAcao(pedido({ url: "https://mail.google.com/" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.regra).toBe("destino_fora_da_permissao");
  });

  it("ESCRITA exige aceite humano: o SDR não envia mensagem sozinho", () => {
    const r = planejarAcao(pedido({ acao: "enviar_mensagem", credencial: SDR }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.regra).toBe("sem_aceite_humano");
  });

  it("mas o SDR LÊ — leitura não é escrita, a metade gêmea", () => {
    expect(planejarAcao(pedido({ acao: "ler_conversa", credencial: SDR })).ok).toBe(true);
  });

  it("o gerente envia, e o plano leva os destinos permitidos junto", () => {
    const r = planejarAcao(pedido({ acao: "enviar_mensagem" }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.destinosPermitidos).toContain("www.99freelas.com.br");
      expect(r.evidenciaExigida).toContain("texto_enviado");
    }
  });

  it("ritmo de máquina barra o plano", () => {
    const r = planejarAcao(
      pedido({ historicoDeRitmo: { ultimaAcaoEm: new Date(AGORA.getTime() - 3000), acoesNaUltimaHora: 1, acoesNoDia: 1 } }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.regra).toBe("ritmo");
  });

  it("ação desconhecida é indisponível", () => {
    for (const a of ["logar", "ENVIAR_MENSAGEM", "", null, 3]) {
      expect(planejarAcao(pedido({ acao: a })).ok, JSON.stringify(a)).toBe(false);
    }
  });
});

describe("🔴 o registro confere o lado de LÁ — a trava de cá não basta", () => {
  const plano = planejarAcao(pedido({ acao: "enviar_mensagem" }));

  it("operador que esteve em destino divergente NÃO vira execução registrada", () => {
    const r = registrarExecucao(plano, {
      urlVisitada: "https://99freelas.com.br.evil.com/projeto",
      evidencias: { url_da_conversa: "x", texto_enviado: "y", carimbo_de_tempo: "z" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.regra).toBe("destino_divergente");
      expect(r.motivo).toMatch(/trava contornada/i);
    }
  });

  it("evidência faltando bloqueia — sem evidência, 'executei' é palavra", () => {
    const r = registrarExecucao(plano, {
      urlVisitada: "https://www.99freelas.com.br/project/123",
      evidencias: { url_da_conversa: "x" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.regra).toBe("evidencia_faltando");
  });

  it("relato completo e no destino certo é REGISTRADO — a metade gêmea", () => {
    const r = registrarExecucao(plano, {
      urlVisitada: "https://www.99freelas.com.br/project/123",
      evidencias: { url_da_conversa: "https://www.99freelas.com.br/project/123", texto_enviado: "Olá", carimbo_de_tempo: "2026-08-30T12:00:00Z" },
    });
    expect(r.ok).toBe(true);
  });

  it("não se registra execução de plano RECUSADO", () => {
    const recusado = planejarAcao(pedido({ atestacao: null }));
    const r = registrarExecucao(recusado, { urlVisitada: "https://www.99freelas.com.br/", evidencias: {} });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.regra).toBe("plano_invalido");
  });
});
