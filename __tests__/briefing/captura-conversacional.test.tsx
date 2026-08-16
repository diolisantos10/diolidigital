// PEDIR CONTATO CONVERSANDO — e sem reabrir o incidente do "só isso".
//
// ── AS DUAS METADES DESTE ARQUIVO ──────────────────────────────────────────
//
//  ✅ O pedido de contato acontece, é UMA PERGUNTA POR VEZ, e um canal basta.
//  ⛔ E ele NÃO volta para a descoberta: nenhuma frase de validação de formato,
//     nenhuma pergunta repetida em laço, nenhuma resposta recusada — que foi
//     exatamente o que travou o prospect antes de a casa saber o que ele queria.
//
// A trava da rota do SDR (`EMAIL_HALLUCINATION`) continua de pé e continua
// protegendo a DESCOBERTA. A distinção entre o pedido legítimo e a alucinação é
// ESTRUTURAL, não textual: o pedido legítimo mora noutra tela, noutro passo, e
// não passa por modelo nenhum. Há teste para isso no fim do arquivo.
//
// ⚠️ Nomes fictícios. Os leads reais desta casa não entram em fixture.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ESTADO_INICIAL,
  FRASE_SEM_CONTATO,
  contatoDaCaptura,
  lerResposta,
  perguntaDoTurno,
  temCanal,
  turnosDaCaptura,
  type EstadoDaCaptura,
} from "@/lib/agency/comercial/captura-conversacional";
import { CapturaDeContato } from "@/components/agency/briefing/PublicBriefingRoom";

const vazio = (): EstadoDaCaptura => ({ ...ESTADO_INICIAL });

describe("UMA PERGUNTA POR VEZ — a diferença entre conversa e formulário", () => {
  it("os turnos são separados e o WhatsApp vem antes do e-mail", () => {
    expect(turnosDaCaptura(false)).toEqual(["nome", "whatsapp", "email"]);
  });

  it("o nome NÃO é perguntado de novo quando o SDR já o capturou na descoberta", () => {
    expect(turnosDaCaptura(true)).toEqual(["whatsapp", "email"]);
  });

  it("🔑 UM CANAL BASTA — quem responde o primeiro turno já é alcançável", () => {
    const depoisDoZap = { ...vazio(), nome: "Marcos", whatsapp: "11977771234" };
    expect(temCanal(depoisDoZap)).toBe(true);
    expect(contatoDaCaptura(depoisDoZap)).toMatchObject({ whatsapp: "11977771234", email: "" });
  });

  it("com canal na mão, o turno do e-mail vira OFERTA, não cobrança", () => {
    const semNada = perguntaDoTurno("email", vazio());
    const comZap = perguntaDoTurno("email", { ...vazio(), whatsapp: "11977771234" });
    expect(comZap.opcional).toBe(true);
    expect(comZap.texto).toMatch(/se preferir|pular|quer receber/i);
    // E os dois textos são diferentes: repetir a mesma frase para quem já
    // respondeu é o que faz a pessoa sentir que ninguém estava ouvindo.
    expect(comZap.texto).not.toBe(semNada.texto);
  });

  it("a pergunta do WhatsApp DIZ POR QUÊ — pedido sem motivo parece cobrança de cadastro", () => {
    expect(perguntaDoTurno("whatsapp", vazio()).texto).toMatch(/responde|r[áa]pido/i);
  });
});

describe("⛔ O INCIDENTE DO 'SÓ ISSO' NÃO VOLTA — nenhuma resposta é recusada", () => {
  // As palavras exatas do incidente. Se qualquer uma reaparecer numa frase desta
  // captura, o defeito voltou com outra roupa.
  const PALAVRAS_DO_INCIDENTE = /n[ãa]o parece v[áa]lido|inv[áa]lido|formato|nome@dom[íi]nio|obrigat[óo]rio/i;

  it("'só isso' no turno do e-mail NÃO vira erro de formato", () => {
    const r = lerResposta("email", "só isso");
    expect(r.valor).toBeNull();
    expect(r.recado ?? "").not.toMatch(PALAVRAS_DO_INCIDENTE);
  });

  it("nenhum texto desta captura usa palavra de validação de formato", () => {
    const frases = [
      FRASE_SEM_CONTATO,
      ...(["nome", "whatsapp", "email"] as const).flatMap((c) => {
        const p1 = perguntaDoTurno(c, vazio());
        const p2 = perguntaDoTurno(c, { ...vazio(), whatsapp: "11977771234" });
        return [p1.texto, p1.acao, p1.placeholder, p2.texto, p2.acao];
      }),
      lerResposta("email", "só isso").recado ?? "",
      lerResposta("whatsapp", "1500").recado ?? "",
    ];
    for (const f of frases) expect(f).not.toMatch(PALAVRAS_DO_INCIDENTE);
  });

  it("resposta VAZIA é pular — resposta legítima, sem recado e sem drama", () => {
    expect(lerResposta("email", "   ")).toEqual({ valor: null, recado: null });
    expect(lerResposta("whatsapp", "")).toEqual({ valor: null, recado: null });
  });

  it("nome não é validado: 'Zé' passa — piso de tamanho recusaria gente de nome curto", () => {
    expect(lerResposta("nome", "Zé").valor).toBe("Zé");
    expect(lerResposta("nome", "Zé").recado).toBeNull();
  });

  it("o número que a casa aceita é normalizado; o que ela não aceita vira CONVITE, não recusa", () => {
    expect(lerResposta("whatsapp", "(11) 97777-1234").valor).toBe("11977771234");
    const curto = lerResposta("whatsapp", "1500"); // o preço que já virou telefone antes
    expect(curto.valor).toBeNull();
    expect(curto.recado).toMatch(/DDD|siga sem/i);
  });
});

describe("RECUSAR CONTINUA PERMITIDO — e a tela não promete o que não cumpre", () => {
  it("sem canal nenhum, `contatoDaCaptura` devolve null — o caminho do lead_incompleto", () => {
    expect(contatoDaCaptura(vazio())).toBeNull();
    expect(contatoDaCaptura({ ...vazio(), nome: "Marcos" })).toBeNull(); // nome sozinho não é contato
  });

  it("🔴 quem recusa lê UMA FRASE dizendo que nada será enviado e onde a coisa fica", () => {
    expect(FRASE_SEM_CONTATO).toMatch(/n[ãa]o temos como te enviar/i);
    expect(FRASE_SEM_CONTATO).toMatch(/guardado/i);
  });

  it("lixo nos dois campos não força contato: um e-mail quebrado não vira canal", () => {
    expect(contatoDaCaptura({ nome: "Marcos", email: "marcos@", whatsapp: "1500" })).toBeNull();
  });
});

describe("A TELA MONTA, e mostra UM campo — não três", () => {
  const html = renderToStaticMarkup(
    <CapturaDeContato nomeConhecido={null} onSubmit={() => {}} onSemContato={() => {}} loading={false} />,
  );

  it("um único input na tela — três campos empilhados é formulário, e era o que havia antes", () => {
    expect((html.match(/<input/g) ?? []).length).toBe(1);
  });

  it("a saída honesta e a frase continuam visíveis desde o primeiro turno", () => {
    expect(html).toContain("Prefiro não deixar contato agora");
    expect(html).toContain(FRASE_SEM_CONTATO.slice(0, 40));
  });

  it("⛔ NENHUM botão nasce apagado — não há nada a exigir, e seguir sem responder é caminho", () => {
    expect(html).not.toContain("disabled=\"\"");
  });

  it("com o nome já conhecido, a primeira pergunta é o WhatsApp — não o nome de novo", () => {
    const comNome = renderToStaticMarkup(
      <CapturaDeContato nomeConhecido="Marcos" onSubmit={() => {}} onSemContato={() => {}} loading={false} />,
    );
    expect(comNome).toMatch(/WhatsApp/);
    expect(comNome).not.toMatch(/como você se chama/i);
    // E ela chama a pessoa pelo nome: a conversa continua, não recomeça.
    expect(comNome).toContain("Marcos");
  });
});

describe("🔒 A TRAVA DA DESCOBERTA CONTINUA DE PÉ — e a distinção é ESTRUTURAL", () => {
  const rota = fs.readFileSync(path.join(process.cwd(), "app/api/sdr/chat/route.ts"), "utf8");
  const captura = fs.readFileSync(
    path.join(process.cwd(), "lib/agency/comercial/captura-conversacional.ts"),
    "utf8",
  );

  it("`EMAIL_HALLUCINATION` NÃO foi apagada da rota do SDR", () => {
    expect(rota).toContain("EMAIL_HALLUCINATION");
    expect(rota).toContain("email_hallucination");
  });

  it("a rota continua APAGANDO `prospectEmail` do que o modelo devolve", () => {
    expect(rota).toContain("delete scopePatch.prospectEmail");
  });

  it("🔑 O PEDIDO LEGÍTIMO NÃO PASSA PELA ROTA DO MODELO — é por isso que a trava pode ficar dura", () => {
    // A captura é rule-based: nenhuma rede, nenhum modelo, nenhum prompt. Se um
    // dia ela passar a falar com `/api/sdr/chat`, a trava passa a barrar o
    // pedido legítimo — e o conserto NÃO é afrouxar a trava, é amarrá-la ao
    // passo da conversa. Este teste é o alarme desse dia.
    expect(captura).not.toContain("fetch(");
    expect(captura).not.toContain("/api/sdr/chat");
    expect(captura).not.toMatch(/@\/lib\/ai\//);
  });

  it("as 4 asserções de `identity-capture.test.ts` continuam no repositório, intocadas", () => {
    const contrato = fs.readFileSync(
      path.join(process.cwd(), "__tests__/briefing/identity-capture.test.ts"),
      "utf8",
    );
    // O motor da descoberta continua sem pedir e sem guardar contato.
    expect(contrato).toContain("never asks for e-mail");
    expect(contrato).toContain("never stores an e-mail/phone from the conversation");
    expect(contrato).toContain("does not mistake a short non-email reply for an e-mail input");
  });
});
