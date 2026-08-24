// A TRAVA DE CONSENTIMENTO — o dia em que a proteção era só uma frase.
//
// O case Farol 27 (24/08/2026) declarou ~6 mil contatos de WhatsApp sem
// comprovação de consentimento. Nada no código barrava usar aquela base: a
// proteção existia como texto em documento. Doutrina da casa: **prompt é aviso;
// código é trava.**
//
// Este arquivo reprova contra o código de ontem, em que a porta do WhatsApp
// aceitava qualquer número sem perguntar de onde ele veio.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("@/lib/db/client", () => ({ prisma: {} }));
vi.mock("@/lib/security/crypto", () => ({ encryptSecret: vi.fn(), decryptSecret: vi.fn() }));

import {
  avaliarConsentimento, comoDestravar,
  limparAbordagensBarradas, abordagensBarradas,
} from "@/lib/agency/consentimento/prova";
import { sendWhatsAppDirect } from "@/lib/integrations/meta/client";
import { acharCandidatosAPorta, NAO_MANDA_MENSAGEM_A_PESSOA } from "@/lib/agency/consentimento/portas-de-saida";

const RAIZ = process.cwd();

beforeEach(() => {
  limparAbordagensBarradas();
  delete process.env.CLIENTE_FALSO;
  // Se a porta chegar à rede, o teste explode: a recusa tem de vir ANTES.
  vi.stubGlobal("fetch", vi.fn(async () => {
    throw new Error("A PORTA CHAMOU A REDE: a trava não veio antes da credencial.");
  }));
});

describe("o juízo: quem pode receber", () => {
  it("base importada SEM comprovação não é utilizável para abordagem", () => {
    const v = avaliarConsentimento({ natureza: "abordagem", origem: "base_importada_sem_comprovacao" });
    expect(v.pode).toBe(false);
    expect(v.motivo).toBe("base_sem_comprovacao_de_consentimento");
  });

  it("não declarar nada é tratado como sem prova — falha FECHADA", () => {
    expect(avaliarConsentimento(undefined).pode).toBe(false);
    expect(avaliarConsentimento(null).pode).toBe(false);
  });

  it("RESPOSTA passa: quem escreveu para a marca pode ser respondido", () => {
    expect(avaliarConsentimento({ natureza: "resposta", mensagemRecebidaId: "wamid.1" }).pode).toBe(true);
  });

  it("mas 'é resposta' não é palavra: sem a mensagem recebida, é abordagem se dizendo resposta", () => {
    const v = avaliarConsentimento({ natureza: "resposta", mensagemRecebidaId: "  " });
    expect(v.pode).toBe(false);
    expect(v.motivo).toBe("resposta_sem_mensagem_recebida");
  });

  it("o contato que o próprio dono entregou passa — mas tem de apontar o registro", () => {
    expect(avaliarConsentimento({
      natureza: "abordagem", origem: "contato_entregue_pelo_proprio_dono",
      referencia: "Client#abc — telefone cadastrado pelo cliente",
    }).pode).toBe(true);
    expect(avaliarConsentimento({
      natureza: "abordagem", origem: "contato_entregue_pelo_proprio_dono",
    }).motivo).toBe("prova_sem_referencia");
  });

  it("base importada COM comprovação incompleta continua barrada, item a item", () => {
    const v = avaliarConsentimento({
      natureza: "abordagem", origem: "base_importada_com_comprovacao",
      referencia: "planilha-x.csv", coletadoEm: "2026-03-01",
    });
    expect(v.pode).toBe(false);
    expect(v.motivo).toBe("comprovacao_incompleta");
    expect(comoDestravar(v)).toMatch(/QUEM coletou/);
    expect(comoDestravar(v)).toMatch(/TEXTO que a pessoa aceitou/);
  });

  it("com a comprovação inteira, a base é utilizável — a trava não é um 'nunca'", () => {
    expect(avaliarConsentimento({
      natureza: "abordagem", origem: "base_importada_com_comprovacao",
      referencia: "form-optin.pdf", coletadoEm: "2026-03-01",
      responsavel: "Marina (gerente da loja)",
      textoDoAceite: "Aceito receber novidades da Farol 27 no WhatsApp",
    }).pode).toBe(true);
  });

  it("toda recusa vem com a instrução gêmea: o que falta, em português", () => {
    const v = avaliarConsentimento({ natureza: "abordagem", origem: "base_importada_sem_comprovacao" });
    expect(v.oQueFalta.length).toBeGreaterThan(3);
    expect(comoDestravar(v)).toMatch(/LGPD/);
    expect(comoDestravar(v)).toMatch(/bloqueio do número/);
  });
});

describe("a porta: o WhatsApp recusa a base sem prova", () => {
  it("não sai, não toca na rede, e o erro diz o que falta", async () => {
    const r = await sendWhatsAppDirect("phone-1", "token-de-producao", {
      connectionId: "c", to: "5511988887777", text: "Promoção de hoje!",
      consentimento: { natureza: "abordagem", origem: "base_importada_sem_comprovacao" },
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/^sem_consentimento:/);
    expect(r.error).toMatch(/comprovação de consentimento/i);
    expect(abordagensBarradas()).toHaveLength(1);
  });

  it("resposta a quem escreveu passa da trava (e só então tenta a rede)", async () => {
    const r = await sendWhatsAppDirect("phone-1", "token", {
      connectionId: "c", to: "5511988887777", text: "oi!",
      consentimento: { natureza: "resposta", mensagemRecebidaId: "wamid.1" },
    });
    // A rede é o dublê que explode: chegar nele prova que a trava LIBEROU.
    expect(r.ok).toBe(false);
    expect(r.error).not.toMatch(/sem_consentimento/);
    expect(abordagensBarradas()).toHaveLength(0);
  });
});

// ─── O TESTE DE CLASSE — DERIVADO, NÃO LISTADO ───────────────────────────────
//
// A primeira versão deste bloco carregava a lista das portas ESCRITA À MÃO — o
// mesmo defeito que esta passada exterminou em dois outros lugares (os campos da
// marca, importados em vez de copiados; `TIPOS_PUBLICAVEIS`, derivado em vez de
// digitado), sobrevivendo no mais caro dos três. A porta que ninguém listar é a
// porta por onde a mensagem sai sem consentimento.
//
// Agora a lista é VARRIDA do repositório por critério estrutural
// (`portas-de-saida.ts`): escreve na rede para fora + fala em destinatário.
// Quinta porta nova nasce coberta — ou o build quebra aqui.
describe("teste de classe: nenhuma saída para o mundo escapa da trava", () => {
  const candidatos = acharCandidatosAPorta(RAIZ);

  it("a varredura acha as portas que a casa JÁ conhece — critério que não vê o conhecido não veria o novo", () => {
    const nomes = candidatos.map((c) => c.arquivo);
    expect(nomes).toContain("lib/integrations/meta/client.ts");
    expect(nomes).toContain("lib/email/send.ts");
    expect(nomes).toContain("lib/integrations/google/client.ts");
  });

  it("todo candidato ou CHAMA a trava, ou tem motivo escrito para não mandar mensagem a pessoa", () => {
    const semResposta = candidatos.filter(
      (c) => !c.chamaATrava && !NAO_MANDA_MENSAGEM_A_PESSOA[c.arquivo],
    );
    expect(
      semResposta.map((c) => c.arquivo),
      "porta de saída nova sem checagem de consentimento e sem motivo declarado — " +
        "chame `avaliarConsentimento` ou declare em NAO_MANDA_MENSAGEM_A_PESSOA por que este módulo não fala com uma pessoa",
    ).toEqual([]);
  });

  it("as duas portas de mensagem chamam o juízo de verdade", () => {
    for (const porta of ["lib/integrations/meta/client.ts", "lib/email/send.ts"]) {
      const c = candidatos.find((x) => x.arquivo === porta);
      expect(c?.chamaATrava, `${porta} não chama avaliarConsentimento`).toBe(true);
    }
  });

  it("motivo de isenção é frase, não carimbo — e isenção que virou letra morta é apagada", () => {
    const achados = new Set(candidatos.map((c) => c.arquivo));
    for (const [arquivo, motivo] of Object.entries(NAO_MANDA_MENSAGEM_A_PESSOA)) {
      expect(motivo.length, `${arquivo}: motivo curto demais para ser um motivo`).toBeGreaterThan(60);
      expect(
        achados.has(arquivo),
        `${arquivo} está isento e não casa mais com o critério — apague a entrada em vez de deixá-la envelhecer`,
      ).toBe(true);
    }
  });

  it("a SEGUNDA rede: o input das portas declara `consentimento` como OBRIGATÓRIO (sem `?`)", () => {
    // A varredura lê módulo, não grafo de chamada. Esta é a rede com furo
    // diferente: quem escrever a porta nova esbarra no compilador.
    const tipos = readFileSync(join(RAIZ, "lib/integrations/meta/types.ts"), "utf8");
    expect(tipos).toMatch(/consentimento: ConsentimentoDeSaida;/);
    expect(tipos).not.toMatch(/consentimento\?:/);
    const email = readFileSync(join(RAIZ, "lib/email/send.ts"), "utf8");
    expect(email).toMatch(/consentimento: ConsentimentoDeSaida;/);
    expect(email).not.toMatch(/consentimento\?:/);
  });
});
