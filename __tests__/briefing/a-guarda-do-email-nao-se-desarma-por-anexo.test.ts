/**
 * ═══════════════════════════════════════════════════════════════════════════
 * E1 · A GUARDA DO SERVIDOR ERA DESARMADA POR UM E-MAIL DENTRO DE UM PDF
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 16/08/2026, quarta passada de `qualidade`. `app/api/sdr/chat/route.ts:355`:
 *
 *     const msgHasAt = body.currentMessage.includes("@");
 *     if (!msgHasAt && EMAIL_HALLUCINATION.test(replyText)) { ...recusa }
 *
 * E `currentMessage` era montado no NAVEGADOR como `${texto}\n\n${dossiê}`, com
 * o dossiê carregando **o texto extraído dos arquivos**.
 *
 * ── A CONSEQUÊNCIA, MEDIDA ─────────────────────────────────────────────────
 * Qualquer documento com um endereço de e-mail dentro — brand book de
 * fornecedor, PDF com rodapé de contato — fazia `msgHasAt` virar `true`. E como
 * o dossiê é remontado a cada turno, a guarda ficava desligada **pelo resto da
 * conversa**. Remetente honesto, documento comum, guarda desarmada. Nenhuma
 * cerca precisou ser forjada — é exatamente a faixa de ataque que o C2 declarou
 * ser a que a cerca do navegador protege, e ela derrubava uma das travas de
 * servidor que o C2 citou como prova de contenção.
 *
 * ── A RÉGUA, ADOTADA COMO REGRA DA CASA ────────────────────────────────────
 * **Guarda cuja condição o cliente escreve não é guarda.** É irmã da doutrina do
 * teto: teto que mora no navegador não é teto.
 *
 * ── COMO ESTE ARQUIVO DISCRIMINA ───────────────────────────────────────────
 * A guarda de `2030ca6` está guardada em `__tests__/_fixtures/legado/` e é
 * **executada** com o mesmo adversário. Ela REPROVA; a de hoje PASSA. Sem as
 * duas metades isto seria guarda de regressão, não prova de conserto.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const limiteExcedido = vi.fn(async () => null);
const chaveDeRotaPublica = vi.fn(async () => ({ apiKey: "sk-teste" }));

vi.mock("@/lib/security/limite-no-banco", () => ({ limiteExcedido }));
vi.mock("@/lib/ai/chave-publica", () => ({ chaveDeRotaPublica }));

const { POST } = await import("@/app/api/sdr/chat/route");
const { dossieDosAnexos } = await import("@/components/agency/briefing/PublicBriefingRoom");
const {
  TETO_DA_MENSAGEM,
  TETO_DO_DIGITADO,
  TETO_DO_MATERIAL,
  montarMensagemDoTurno,
  separarMaterialColado,
} = await import("@/lib/security/teto-do-turno-publico");
const { guardaDoEmailComoEm2030ca6, montarMensagemComoEm2030ca6 } = await import(
  "@/__tests__/_fixtures/legado/guarda-do-email-antes-de-e1"
);

/** O documento honesto que desarma a guarda: um PDF com rodapé de contato. */
const PDF_COM_EMAIL =
  "MANUAL DE MARCA — Fornecedor Ltda.\nAzul petróleo #0A1F44.\n" +
  "Dúvidas sobre esta marca: contato@fornecedorltda.com.br\n";

/** O que a PESSOA digitou. Não tem arroba nenhuma. */
const FALA_DA_PESSOA = "Oi! Sou o Dioli, da Pizzaria Bella. Quero 12 posts por mês.";

/** A alucinação que a guarda existe para barrar. */
const RESPOSTA_ALUCINADA = "Perfeito! Só preciso confirmar: qual é o seu e-mail?";

function dossieComOPdf(): string {
  type Item = Parameters<typeof dossieDosAnexos>[0][number];
  return dossieDosAnexos(
    [{
      attachment: { fileName: "manual-do-fornecedor.pdf" } as Item["attachment"],
      status: "done",
      lido: true,
      texto: PDF_COM_EMAIL,
    }],
    "deadbeef",
  );
}

function modeloResponde(json: Record<string, unknown>) {
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({ content: [{ type: "text", text: JSON.stringify(json) }] }),
  })) as unknown as typeof fetch;
}

function requisicao(corpo: Record<string, unknown>) {
  return {
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => corpo,
  } as unknown as Parameters<typeof POST>[0];
}

/** O que a rota mandou ao modelo no último turno. */
function ultimaMensagemEnviada(): string {
  const chamada = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
  const enviado = JSON.parse((chamada[1] as { body: string }).body) as { messages: { content: string }[] };
  return enviado.messages[enviado.messages.length - 1].content;
}

beforeEach(() => {
  limiteExcedido.mockClear();
  chaveDeRotaPublica.mockClear();
});

// ─────────────────────────────────────────────────────────────────────────────
describe("⛔ E1 · o anexo não desarma a guarda do e-mail", () => {
  it("🔑 a guarda de 2030ca6 REPROVA — é ela que este conserto existe para matar", () => {
    // A metade que reprova o código de ontem, EXECUTANDO o código de ontem.
    const colado = montarMensagemComoEm2030ca6(FALA_DA_PESSOA, dossieComOPdf());
    // O dossiê tem a arroba do PDF; a pessoa não escreveu nenhuma.
    expect(FALA_DA_PESSOA.includes("@")).toBe(false);
    expect(colado.includes("@")).toBe(true);
    // E por isso a guarda de ontem DEIXA PASSAR a alucinação: `false` é "o turno
    // não foi recusado".
    expect(guardaDoEmailComoEm2030ca6(colado, RESPOSTA_ALUCINADA)).toBe(false);
    // Enquanto que, sem anexo nenhum, ela recusava. O anexo é a diferença.
    expect(guardaDoEmailComoEm2030ca6(FALA_DA_PESSOA, RESPOSTA_ALUCINADA)).toBe(true);
  });

  it("🔑 HOJE: anexo com e-mail dentro + mensagem digitada sem @ → a trava continua armada", async () => {
    modeloResponde({ reply: RESPOSTA_ALUCINADA, scope: {} });
    const res = await POST(
      requisicao({
        messages: [],
        currentMessage: FALA_DA_PESSOA,
        materialAnexado: dossieComOPdf(),
      }),
    );
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("email_hallucination");
  });

  it("🔑 e continua armada no turno SEGUINTE — o dossiê é remontado a cada turno", async () => {
    // O defeito não era de um turno: uma vez desarmada, a guarda ficava
    // desligada pelo resto da conversa, porque o dossiê volta em todo turno.
    modeloResponde({ reply: RESPOSTA_ALUCINADA, scope: {} });
    const res = await POST(
      requisicao({
        messages: [
          { role: "user", text: FALA_DA_PESSOA },
          { role: "assistant", text: "Que legal! Me conta o objetivo." },
        ],
        currentMessage: "Quero atrair quem mora perto.",
        materialAnexado: dossieComOPdf(),
      }),
    );
    expect((await res.json()).reason).toBe("email_hallucination");
  });

  it("🔑 turno de EVENTO (a pessoa não digitou nada): nome de arquivo com @ não desarma", async () => {
    // `contato@fornecedor.pdf` é nome de arquivo legítimo, e ele viaja na
    // instrução do evento. Se isso contasse como fala da pessoa, bastaria
    // renomear um arquivo para desligar a guarda.
    modeloResponde({ reply: RESPOSTA_ALUCINADA, scope: {} });
    const res = await POST(
      requisicao({
        messages: [],
        currentMessage: "",
        materialAnexado: "EVENTO DO SISTEMA: o cliente enviou contato@fornecedor.pdf.",
      }),
    );
    expect((await res.json()).reason).toBe("email_hallucination");
  });

  it("🔑 CLIENTE ANTIGO (tudo colado num campo só) também fica protegido", async () => {
    // Aba aberta, JavaScript em cache: ele ainda manda `${texto}\n\n${dossiê}`.
    // Conserto que só vale para quem recarregou a página é conserto pela metade.
    modeloResponde({ reply: RESPOSTA_ALUCINADA, scope: {} });
    const res = await POST(
      requisicao({
        messages: [],
        currentMessage: montarMensagemComoEm2030ca6(FALA_DA_PESSOA, dossieComOPdf()),
      }),
    );
    expect((await res.json()).reason).toBe("email_hallucination");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("✅ a metade que impede a trava de ser só um bloqueio", () => {
  it("quem DIGITA um e-mail continua desarmando a guarda — é a fala dela", async () => {
    // A guarda existe contra o modelo escorregar sozinho. Quando a PESSOA traz o
    // assunto, o turno tem de passar; senão a trava vira mordaça.
    modeloResponde({ reply: "Certo! Confirmando: seu e-mail é esse mesmo?", scope: {} });
    const res = await POST(
      requisicao({
        messages: [],
        currentMessage: "Pode mandar para dioli@pizzariabella.com.br",
        materialAnexado: dossieComOPdf(),
      }),
    );
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("o material continua CHEGANDO ao modelo — nada ficou inalcançável", async () => {
    modeloResponde({ reply: "Recebi seu manual, obrigada!", scope: {} });
    await POST(
      requisicao({
        messages: [],
        currentMessage: FALA_DA_PESSOA,
        materialAnexado: dossieComOPdf(),
      }),
    );
    const enviada = ultimaMensagemEnviada();
    expect(enviada).toContain("Pizzaria Bella");
    expect(enviada).toContain("Azul petróleo");
    expect(enviada).toContain("manual-do-fornecedor.pdf");
    // E na ordem certa: a fala da pessoa primeiro, o material depois.
    expect(enviada.indexOf("Pizzaria Bella")).toBeLessThan(enviada.indexOf("Azul petróleo"));
  });

  it("a separação do cliente antigo acha o bloco pelo prefixo do DONO DA CERCA", () => {
    const colado = montarMensagemComoEm2030ca6(FALA_DA_PESSOA, dossieComOPdf());
    const { digitado, material } = separarMaterialColado(colado);
    expect(digitado).toBe(FALA_DA_PESSOA);
    expect(material).toContain("Azul petróleo");
    expect(digitado).not.toContain("@");
  });

  it("sem material, a separação não inventa corte nenhum", () => {
    const { digitado, material } = separarMaterialColado(FALA_DA_PESSOA);
    expect(digitado).toBe(FALA_DA_PESSOA);
    expect(material).toBe("");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("⛔ os dois campos têm teto, e a SOMA também", () => {
  it("🔑 digitado e material são aparados cada um, e o total cabe no teto do turno", () => {
    const t = montarMensagemDoTurno({
      digitado: "x".repeat(5_000_000),
      material: "y".repeat(5_000_000),
    });
    expect(t.digitado.length).toBeLessThanOrEqual(TETO_DO_DIGITADO);
    expect(t.material.length).toBeLessThanOrEqual(TETO_DO_MATERIAL);
    expect(t.texto.length).toBeLessThanOrEqual(TETO_DA_MENSAGEM);
  });

  it("🔑 material gigante não come o espaço do briefing que a pessoa COLOU", () => {
    // Era este o efeito colateral do campo único: o dossiê de 16.000 disputava
    // os mesmos 32.000 com o briefing colado à mão.
    const briefingColado = "B".repeat(16_000);
    const t = montarMensagemDoTurno({ digitado: briefingColado, material: "M".repeat(500_000) });
    expect(t.digitado).toBe(briefingColado);
  });

  it("✅ o caso legítimo cheio passa INTEIRO pelos dois campos", () => {
    const t = montarMensagemDoTurno({ digitado: FALA_DA_PESSOA, material: dossieComOPdf() });
    expect(t.digitado).toBe(FALA_DA_PESSOA);
    expect(t.material).toContain("contato@fornecedorltda.com.br");
    expect(t.texto).toContain(FALA_DA_PESSOA);
  });
});
