// O SEGUNDO CANAL DO AVISO — CONSTRUÍDO ATÉ A BORDA, DESLIGADO.
//
// A trava central, e ela tem de valer nas duas metades:
//   ⛔ desligado (o padrão) não abre socket, não chama o provedor, não devolve
//      `ok` — e DIZ por que está fechado;
//   ✅ ligado, com chave e com endereço, sai de verdade.
//
// Nenhum teste deste arquivo toca a rede: `sendEmail` é mockado. **Nenhum
// e-mail sai para endereço nenhum, nem de teste.**

import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

const email = vi.hoisted(() => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/email/send", () => email);

import {
  avisarPorEmail, emailLigado, porQueOEmailEstaFechado, corpoDoEmail,
} from "@/lib/agency/esteira/canal-de-email";

function ligarTudo() {
  process.env.AVISO_POR_EMAIL = "on";
  process.env.RESEND_API_KEY = "re_teste_nunca_usada";
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.AVISO_POR_EMAIL;
  delete process.env.RESEND_API_KEY;
  email.sendEmail.mockResolvedValue({ ok: true, id: "e1" });
});

// ── ⛔ A METADE QUE IMPORTA HOJE: ELE ESTÁ DESLIGADO ────────────────────────

describe("nasce desligado, e o silêncio nunca parece envio", () => {
  it("sem AVISO_POR_EMAIL, o canal está fechado", () => {
    expect(emailLigado()).toBe(false);
    expect(porQueOEmailEstaFechado()).toMatch(/DESLIGADO/);
  });

  it("desligado NÃO chama o provedor — nem com chave presente", async () => {
    process.env.RESEND_API_KEY = "re_teste";
    const r = await avisarPorEmail({ para: "cliente@exemplo.com", assunto: "x", texto: "y", link: null });
    expect(email.sendEmail, "abriu o provedor com o canal desligado").not.toHaveBeenCalled();
    expect(r.ok).toBe(false);
    expect(r.naoTentou).toBe(true);
  });

  it("só a string \"on\" liga — \"true\", \"1\" e \"sim\" NÃO ligam", async () => {
    // Interruptor que liga por engano é o que manda e-mail para cliente real
    // numa segunda-feira.
    for (const valor of ["true", "1", "sim", "yes", "ON ", ""]) {
      process.env.AVISO_POR_EMAIL = valor;
      if (valor.trim().toLowerCase() === "on") continue;
      expect(emailLigado(), `"${valor}" ligou o canal`).toBe(false);
    }
  });

  it("ligado SEM chave é FALHA declarada, não silêncio", async () => {
    process.env.AVISO_POR_EMAIL = "on";
    expect(porQueOEmailEstaFechado()).toMatch(/RESEND_API_KEY/);
    const r = await avisarPorEmail({ para: "c@e.com", assunto: "x", texto: "y", link: null });
    expect(email.sendEmail).not.toHaveBeenCalled();
    expect(r.naoTentou).toBe(true);
  });
});

// ── ✅ A METADE OPOSTA: LIGADO, ELE FUNCIONA ───────────────────────────────

describe("com os dois interruptores e um endereço, sai", () => {
  it("chama o provedor com o endereço do cliente", async () => {
    ligarTudo();
    const r = await avisarPorEmail({
      para: "cliente@exemplo.com", assunto: "Sua aprovação", texto: "Oi!", link: "https://x/portal/access/T",
    });
    expect(r.ok).toBe(true);
    expect(email.sendEmail.mock.calls[0]![0].to).toBe("cliente@exemplo.com");
    expect(email.sendEmail.mock.calls[0]![0].subject).toBe("Sua aprovação");
  });

  it("provedor que recusa NÃO vira ok — e o motivo dele é preservado", async () => {
    ligarTudo();
    email.sendEmail.mockResolvedValue({ ok: false, error: "resend_422: domain not verified" });
    const r = await avisarPorEmail({ para: "c@e.com", assunto: "x", texto: "y", link: null });
    expect(r.ok).toBe(false);
    expect(r.naoTentou, "recusa do provedor virou 'não tentei'").toBe(false);
    expect(r.motivo).toContain("domain not verified");
  });

  it("provedor que LANÇA não derruba o aviso que o originou", async () => {
    ligarTudo();
    email.sendEmail.mockRejectedValue(new Error("network down"));
    const r = await avisarPorEmail({ para: "c@e.com", assunto: "x", texto: "y", link: null });
    expect(r.ok).toBe(false);
  });
});

describe("endereço que não serve não vira tentativa", () => {
  it("cliente sem e-mail: não chama o provedor e diz o que falta", async () => {
    ligarTudo();
    const r = await avisarPorEmail({ para: null, assunto: "x", texto: "y", link: null });
    expect(email.sendEmail).not.toHaveBeenCalled();
    expect(r.motivo).toMatch(/não tem e-mail cadastrado/);
  });

  it("endereço malformado é recusado ANTES do provedor — bounce queima o domínio", async () => {
    ligarTudo();
    for (const ruim of ["semarroba", "a@b", "a@b.c", "@exemplo.com", "a b@exemplo.com"]) {
      const r = await avisarPorEmail({ para: ruim, assunto: "x", texto: "y", link: null });
      expect(r.naoTentou, `aceitou "${ruim}"`).toBe(true);
    }
    expect(email.sendEmail).not.toHaveBeenCalled();
  });
});

// ── O CORPO ────────────────────────────────────────────────────────────────

describe("o corpo do e-mail", () => {
  it("com link, o botão aponta para ele", () => {
    const html = corpoDoEmail({ texto: "Oi", link: "https://www.diolidigital.com.br/portal/access/T" });
    expect(html).toContain("https://www.diolidigital.com.br/portal/access/T");
    expect(html).toMatch(/Abrir o seu portal/);
  });

  it("SEM link, não existe botão apontando para lugar nenhum", () => {
    const html = corpoDoEmail({ texto: "Oi", link: null });
    expect(html).not.toContain("href=");
    expect(html).toMatch(/não está disponível/);
  });

  it("nome com marcação não vira HTML", () => {
    const html = corpoDoEmail({ texto: "Olá <script>alert(1)</script>", link: null });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

// ── A LIGAÇÃO COM O AVISO ──────────────────────────────────────────────────

describe("o e-mail é o SEGUNDO canal, nunca o segundo envio", () => {
  const AVISOS = fs.readFileSync(path.join(process.cwd(), "lib/agency/esteira/avisos.ts"), "utf8");
  const SRC = AVISOS.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("só é tentado quando o WhatsApp não saiu", () => {
    // Dois canais para o mesmo aviso é o cliente recebendo a mesma cobrança
    // duas vezes — assim é que uma agência ensina a ser silenciada.
    expect(SRC).toContain("if (!tentativa.ok)");
    const i = SRC.indexOf("if (!tentativa.ok)");
    expect(SRC.slice(i, i + 300)).toContain("avisarPorEmail");
  });

  it("o motivo gravado carrega as DUAS tentativas", () => {
    expect(SRC).toContain("e-mail:");
  });
});
