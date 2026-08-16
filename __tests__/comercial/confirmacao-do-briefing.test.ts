// O CLIENTE MANDOU O BRIEFING — ELE SABE QUE CHEGOU?
//
// ── O incidente (16/08/2026, piloto do CEO) ─────────────────────────────────
//
//   [client-requests] confirmation e-mail skipped — RESEND_API_KEY not set
//
// **A chave ausente não é o defeito.** A chave é do CEO. O defeito é que o
// sistema engolia o aviso: um cliente real mandaria briefing + PDFs e ficaria
// sem nenhum sinal de que chegou, e a equipe não tinha onde ver que o canal
// estava desligado. Silêncio não pode ser o caminho padrão.
//
// Este portão prova as duas metades de cada conserto:
//   1. a falta da chave vira ACHADO VISÍVEL — e não some quando a chave existe;
//   2. a frase para o CEO cita as DUAS variáveis E a verificação de domínio,
//      porque configurar só a chave produz o mesmo silêncio (docs/decisoes.md,
//      07/08/2026: nenhum domínio da agência está verificado no Resend).

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  estadoDoCanalDeEmail,
  O_QUE_O_CEO_PRECISA_CONFIGURAR,
  VARIAVEIS_DO_CANAL,
} from "@/lib/email/estado-do-canal";
import { runSystemDoctor } from "@/lib/agency/system-doctor";

const VAZIO = {
  clients: [], projects: [], deliverables: [], materialRequests: [],
  strategyRooms: [], persisted: false,
} as never;

function checagemDoEmail(canalDeEmail?: { ligado: boolean; resumo: string; comoResolver: string }) {
  const r = runSystemDoctor({ ...(VAZIO as object), canalDeEmail } as never);
  const c = r.checks.find((x) => x.id === "aviso-por-email-ao-cliente");
  expect(c, "a checagem do canal de e-mail sumiu do System Doctor").toBeDefined();
  return c!;
}

describe("o estado do canal de e-mail é legível", () => {
  // ── METADE 1: ACUSA O CANAL DESLIGADO ───────────────────────────────────
  describe("ACUSA quando está desligado", () => {
    it("sem RESEND_API_KEY: desligado, e o resumo diz isso em português", () => {
      const e = estadoDoCanalDeEmail({});
      expect(e.ligado).toBe(false);
      expect(e.resumo.toLowerCase()).toContain("desligado");
    });

    it("com chave e SEM remetente próprio: continua desligado na prática", () => {
      // A armadilha inteira: `sendEmail` cai em onboarding@resend.dev, que só
      // entrega para o dono da conta. "Tem chave" NÃO é "o cliente recebe".
      const e = estadoDoCanalDeEmail({ RESEND_API_KEY: "re_qualquer" });
      expect(e.ligado).toBe(false);
      expect(e.remetenteCompartilhado).toBe(true);
    });

    it("o Doctor mostra FALHA, com a instrução do que configurar", () => {
      const c = checagemDoEmail({ ligado: false, resumo: "estão DESLIGADOS", comoResolver: O_QUE_O_CEO_PRECISA_CONFIGURAR });
      expect(c.status).toBe("fail");
      expect(c.action).toBe(O_QUE_O_CEO_PRECISA_CONFIGURAR);
    });

    it("NÃO CONFERIDO não vira 'está tudo bem'", () => {
      // O modo de falhar mais caro seria o indefinido cair em `pass`: o CEO
      // olharia um verde que não mediu nada.
      const c = checagemDoEmail(undefined);
      expect(c.status).not.toBe("pass");
      expect(c.explanation.toLowerCase()).toContain("não quer dizer que está tudo certo");
    });
  });

  // ── METADE 2: NÃO INVENTA PROBLEMA NO CASO LIMPO ────────────────────────
  describe("NÃO acusa quando está tudo configurado", () => {
    it("com chave e remetente próprio: ligado", () => {
      const e = estadoDoCanalDeEmail({
        RESEND_API_KEY: "re_qualquer",
        RESEND_FROM: "Dioli Digital <contato@dominio.com.br>",
      });
      expect(e.ligado).toBe(true);
      expect(e.remetenteCompartilhado).toBe(false);
    });

    it("o Doctor mostra PASS e não pede ação", () => {
      const c = checagemDoEmail({ ligado: true, resumo: "ligados", comoResolver: "" });
      expect(c.status).toBe("pass");
      expect(c.action).toBe("Nenhuma ação necessária.");
    });

    it("mesmo LIGADO, o diagnóstico não afirma o que não mediu (o DNS)", () => {
      const e = estadoDoCanalDeEmail({ RESEND_API_KEY: "re_x", RESEND_FROM: "A <a@b.com>" });
      expect(e.oQueConfigurar.toLowerCase()).toContain("verificado");
    });
  });
});

describe("a frase para o CEO", () => {
  it("cita as duas variáveis, pelo nome exato que o código lê", () => {
    for (const v of VARIAVEIS_DO_CANAL) {
      expect(O_QUE_O_CEO_PRECISA_CONFIGURAR).toContain(v);
    }
    const enviador = readFileSync(path.join(process.cwd(), "lib/email/send.ts"), "utf8");
    for (const v of VARIAVEIS_DO_CANAL) {
      expect(enviador, `${v} não é lida por lib/email/send.ts`).toContain(v);
    }
  });

  it("carrega a restrição do domínio verificado — senão ele configura e continua sem funcionar", () => {
    const f = O_QUE_O_CEO_PRECISA_CONFIGURAR.toLowerCase();
    expect(f).toContain("verificado");
    expect(f).toContain("domínio");
    expect(f).toMatch(/dkim|dns/);
    // E diz a consequência, não só a condição.
    expect(f).toContain("dono da conta");
  });

  it("NÃO contém valor de segredo nenhum", () => {
    expect(O_QUE_O_CEO_PRECISA_CONFIGURAR).not.toMatch(/re_[a-z0-9]{8,}/i);
  });
});

describe("a confirmação no portal não depende de e-mail", () => {
  const rota = readFileSync(
    path.join(process.cwd(), "app/api/brain/client-requests/route.ts"),
    "utf8",
  );

  it("grava PortalMessage na âncora do PROSPECT (clientRequestId)", () => {
    // `clientId` não existe no instante do briefing — quem manda briefing ainda
    // não tem ficha de cliente. `clientRequestId` é a âncora que existe.
    expect(rota).toContain("prisma.portalMessage.create");
    expect(rota).toContain("clientRequestId: input.clientRequestId");
    expect(rota).toContain('authorRole: "team"');
  });

  it("acontece TAMBÉM para quem sobe sem contato — é quem mais precisa", () => {
    // Se estivesse dentro do `if (contato.temComoFalar)`, o caminho sem contato
    // continuaria produzindo silêncio absoluto: sem e-mail (por definição) e sem
    // mensagem. A chamada tem de estar ANTES do if.
    const iConfirmacao = rota.indexOf("registrarConfirmacaoNoPortal({");
    const iIf = rota.indexOf("if (contato.temComoFalar) {");
    expect(iConfirmacao).toBeGreaterThan(-1);
    expect(iIf).toBeGreaterThan(-1);
    expect(iConfirmacao).toBeLessThan(iIf);
  });

  it("NÃO promete retorno a quem não deixou canal de contato", () => {
    // A promessa vazia é o defeito de 08/08 (51 dias do Sushi Cazza) voltando
    // por outra porta.
    expect(rota).toContain("input.temComoFalar");
    expect(rota).toMatch(/precisamos de um WhatsApp ou e-mail/);
  });

  it("é best-effort: não pode derrubar o 201 do briefing", () => {
    const trecho = rota.slice(rota.indexOf("registrarConfirmacaoNoPortal({"));
    expect(trecho.slice(0, 600)).toContain(".catch(");
  });
});
