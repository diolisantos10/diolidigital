// A PORTA RECUSA O QUE NÃO NASCEU DO MOLDE — 27/08/2026.
//
// O teste irmão (`__tests__/marca/o-email-com-a-cara-da-casa.test.ts`) mede as
// DUAS mensagens que existem hoje. Este mede a PORTA: o que acontece com a
// terceira mensagem, a que ainda não foi escrita, se ela nascer fora do molde
// ou com um preço no corpo.
//
// A diferença importa. Régua sobre as mensagens de hoje é régua que passa a
// valer zero no dia em que alguém acrescenta um `sendEmail` novo — e foi
// exatamente assim que o nome errado da empresa sobreviveu em dois rodapés.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { sendEmail } from "@/lib/email/send";
import { motivoParaNaoEnviar } from "@/lib/email/trava-do-molde";
import { briefingConfirmationEmail, orcamentoProntoEmail } from "@/lib/email/templates";
import { NOME_APOSENTADO } from "@/lib/marca";

/** Consentimento válido — este teste é sobre o molde, não sobre a porta de
 *  consentimento, que tem régua própria. */
const CONSENTE = { natureza: "resposta", mensagemRecebidaId: "msg-1" } as const;

const BOM = orcamentoProntoEmail({
  prospectName: "NOME TESTE",
  businessName: "Padaria do Teste",
  portalLink: "https://www.diolidigital.com.br/portal/access/abc",
});

describe("motivoParaNaoEnviar", () => {
  it("deixa passar o e-mail que nasceu do molde", () => {
    expect(motivoParaNaoEnviar(BOM.html, BOM.subject)).toBeNull();
    const c = briefingConfirmationEmail({ prospectName: "NOME TESTE", businessName: "Padaria do Teste" });
    expect(motivoParaNaoEnviar(c.html, c.subject)).toBeNull();
  });

  it("recusa o e-mail escrito à mão, sem o cabeçalho da marca", () => {
    const motivo = motivoParaNaoEnviar("<p>Oi! Seu orçamento saiu.</p>", "Oi");
    expect(motivo).toMatch(/^fora_do_molde:/);
  });

  it("recusa o preço no corpo — o e-mail é convite, não proposta", () => {
    // Cada jeito de escrever dinheiro que o defeito original usou.
    for (const valor of ["R$ 1.800", "1.800 a 3.400", "990,00", "mil e duzentos reais"]) {
      const comPreco = BOM.html.replace(
        "está pronto.",
        `está pronto e fica em ${valor}.`,
      );
      expect(motivoParaNaoEnviar(comPreco, BOM.subject), valor).toMatch(/^valor_no_corpo:/);
    }
  });

  it("recusa o preço no ASSUNTO — a linha que o cliente lê antes de abrir", () => {
    expect(motivoParaNaoEnviar(BOM.html, "Seu orçamento: R$ 1.800")).toMatch(/^valor_no_assunto:/);
  });

  it("recusa o nome aposentado, venha de onde vier o texto", () => {
    const comNomeVelho = BOM.html.replace("</body>", `<p>${NOME_APOSENTADO}</p></body>`);
    expect(motivoParaNaoEnviar(comNomeVelho, BOM.subject)).toMatch(/^nome_aposentado:/);
  });

  it("NÃO confunde número de atributo com preço", () => {
    // Dentro dos atributos moram o telefone do `wa.me`, o `-512` do arquivo do
    // logo e os `padding:14px` do botão. Se a trava lesse o HTML cru, ela
    // reprovaria todo e-mail da casa — inclusive os dois que já estão certos.
    expect(BOM.html).toContain("wa.me/5511989400692");
    expect(motivoParaNaoEnviar(BOM.html, BOM.subject)).toBeNull();
  });
});

describe("a porta de saída obedece à trava", () => {
  const ambiente = { ...process.env };
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_chave_de_teste";
    process.env.RESEND_FROM = "Dioli Digital <contato@exemplo-de-teste.com>";
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "id-de-teste" }), { status: 200 }),
    ) as never;
  });
  afterEach(() => {
    process.env = { ...ambiente };
    vi.restoreAllMocks();
  });

  it("o e-mail do molde sai", async () => {
    const r = await sendEmail({ to: "quem.pediu@gmail.com", subject: BOM.subject, html: BOM.html, consentimento: CONSENTE });
    expect(r.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalled();
  });

  it("o e-mail com preço NÃO chega na Resend — a trava é código, não aviso", async () => {
    const comPreco = BOM.html.replace("está pronto.", "está pronto e fica em R$ 1.800.");
    const r = await sendEmail({ to: "quem.pediu@gmail.com", subject: BOM.subject, html: comPreco, consentimento: CONSENTE });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/^valor_no_corpo:/);
    // O que prova que é trava e não relatório: a chamada não aconteceu.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("o e-mail escrito à mão NÃO chega na Resend", async () => {
    const r = await sendEmail({ to: "quem.pediu@gmail.com", subject: "Oi", html: "<p>oi</p>", consentimento: CONSENTE });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/^(fora_do_molde|valor_no_corpo):/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("a trava roda ANTES do ambiente — sem chave nenhuma ela ainda recusa", async () => {
    // Trava que mora depois do `if (!apiKey)` vale por sorte de ambiente. Em
    // produção há chave; se a régua só valesse sem chave, ela valeria em toda
    // parte MENOS onde importa.
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM;
    const comPreco = BOM.html.replace("está pronto.", "está pronto e fica em R$ 1.800.");
    const r = await sendEmail({ to: "quem.pediu@gmail.com", subject: BOM.subject, html: comPreco, consentimento: CONSENTE });
    expect(r.error).toMatch(/^(fora_do_molde|valor_no_corpo):/);
  });
});
