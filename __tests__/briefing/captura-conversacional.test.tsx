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
  capturaTerminou,
  contatoDaCaptura,
  ehUltimoTurno,
  iniciarCaptura,
  lerResposta,
  mostrarFraseSemContato,
  perguntaDoTurno,
  proximoCampo,
  pularTurno,
  recusar,
  responderTurno,
  temCanal,
  type EstadoDaCaptura,
} from "@/lib/agency/comercial/captura-conversacional";
import { CapturaDeContato } from "@/components/agency/briefing/PublicBriefingRoom";

const vazio = (): EstadoDaCaptura => ({ ...ESTADO_INICIAL });

describe("🔴 O DEFEITO DE 16/08 — 'ela deu o número e o sistema diz que ela não deu'", () => {
  // Reproduzido pelo `experiencia` no navegador, a 375px, com o POST observado.
  // A pessoa digitava o WhatsApp; o turno seguinte dizia "é só pular" e não
  // tinha botão de pular; ela clicava em "Prefiro não deixar contato agora" —
  // o único controle parecido — e o POST saía com `contato: null`. Os 51 dias
  // do Sushi Cazza produzidos pelo conserto dos 51 dias.

  it("⛔ A ELIMINAÇÃO: com WhatsApp na mão, NÃO EXISTE turno depois — nada a destruir", () => {
    const c = responderTurno(iniciarCaptura("Marcos"), "11 97777-1234");
    expect(c.campo).toBeNull();
    expect(capturaTerminou(c)).toBe(true);
    expect(contatoDaCaptura(c.estado)).toMatchObject({ whatsapp: "11977771234" });
  });

  it("⛔ o mesmo pelo e-mail: canal dado encerra a captura", () => {
    const c = responderTurno(pularTurno(iniciarCaptura("Marcos")), "marcos@trigodeouro.com.br");
    expect(c.campo).toBeNull();
    expect(contatoDaCaptura(c.estado)).toMatchObject({ email: "marcos@trigodeouro.com.br" });
  });

  it("🔴 A BLINDAGEM DA CLASSE — recusar NUNCA devolve `null` para quem já deu canal", () => {
    // Mesmo forçando um estado que a tela de hoje não produz (canal gravado E
    // um turno ainda em cartaz), recusar não pode apagar o contato. É a classe
    // do defeito, não o caso: um turno novo depois do canal ressuscitaria o bug.
    const forcada = {
      ...iniciarCaptura("Marcos"),
      estado: { nome: "Marcos", whatsapp: "11977771234", email: "" },
      campo: "email" as const,
    };
    const saida = recusar(forcada);
    expect(saida.acao).toBe("enviar_com_contato");
    if (saida.acao === "enviar_com_contato") {
      expect(saida.contato.whatsapp).toBe("11977771234");
    }
  });

  it("sem canal nenhum, recusar continua sendo o caminho do `lead_incompleto`", () => {
    expect(recusar(iniciarCaptura("Marcos")).acao).toBe("enviar_sem_contato");
  });

  it("🔴 SEGUNDA RESPOSTA ILEGÍVEL NÃO AVANÇA EM SILÊNCIO — e não descarta o que foi digitado", () => {
    let c = iniciarCaptura("Marcos");
    c = responderTurno(c, "1500");        // ilegível: recado
    expect(c.campo).toBe("whatsapp");
    expect(c.recado).toBeTruthy();
    c = responderTurno(c, "meu zap");     // ilegível de novo: continua no turno
    expect(c.campo).toBe("whatsapp");     // ANTES: avançava e jogava fora o texto
    expect(c.recado).toBeTruthy();
    // E a saída explícita continua funcionando — não é beco sem saída.
    expect(pularTurno(c).campo).toBe("email");
  });

  it("🔴 DUAS VERDADES NA MESMA TELA: a frase 'sem WhatsApp nem e-mail' some para quem já deu", () => {
    expect(mostrarFraseSemContato(vazio())).toBe(true);
    expect(mostrarFraseSemContato({ ...vazio(), whatsapp: "11977771234" })).toBe(false);
  });
});

describe("UMA PERGUNTA POR VEZ — a diferença entre conversa e formulário", () => {
  it("a ordem: nome, depois WhatsApp, depois e-mail", () => {
    expect(proximoCampo(vazio(), [], false)).toBe("nome");
    expect(proximoCampo(vazio(), ["nome"], false)).toBe("whatsapp");
    expect(proximoCampo(vazio(), ["nome", "whatsapp"], false)).toBe("email");
    expect(proximoCampo(vazio(), ["nome", "whatsapp", "email"], false)).toBeNull();
  });

  it("o nome NÃO é perguntado de novo quando o SDR já o capturou na descoberta", () => {
    expect(iniciarCaptura("Marcos").campo).toBe("whatsapp");
    expect(iniciarCaptura(null).campo).toBe("nome");
  });

  it("🔑 UM CANAL BASTA — quem responde o primeiro turno já é alcançável", () => {
    const depoisDoZap = { ...vazio(), nome: "Marcos", whatsapp: "11977771234" };
    expect(temCanal(depoisDoZap)).toBe(true);
    expect(contatoDaCaptura(depoisDoZap)).toMatchObject({ whatsapp: "11977771234", email: "" });
  });

  it("o texto do turno de e-mail não promete mais um 'pular' que não existia", () => {
    // A frase antiga ("se preferir só o WhatsApp, é só pular") aparecia numa
    // tela sem botão de pular. Ela morreu junto com o turno que a exibia.
    expect(perguntaDoTurno("email", vazio()).texto).not.toMatch(/é só pular/i);
  });

  it("🟠 O RÓTULO DIZ O QUE O CLIQUE FAZ — turno de canal ENVIA, e o botão avisa", () => {
    expect(perguntaDoTurno("nome", vazio()).acao).toMatch(/continuar/i);
    expect(perguntaDoTurno("whatsapp", vazio()).acao).toMatch(/receber minha proposta/i);
    expect(perguntaDoTurno("email", vazio()).acao).toMatch(/receber minha proposta/i);
  });

  it("a pergunta do WhatsApp DIZ POR QUÊ — pedido sem motivo parece cobrança de cadastro", () => {
    expect(perguntaDoTurno("whatsapp", vazio()).texto).toMatch(/responde|r[áa]pido/i);
  });

  it("`ehUltimoTurno` sabe quando o botão fecha o briefing", () => {
    const noZap = iniciarCaptura("Marcos");
    expect(ehUltimoTurno(noZap)).toBe(false);       // pular o zap ainda leva ao e-mail
    expect(ehUltimoTurno(pularTurno(noZap))).toBe(true); // o e-mail é o fim da linha
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
        const p = perguntaDoTurno(c, vazio());
        return [p.texto, p.acao, p.placeholder];
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
    // 🟠 E que o clique é IRREVERSÍVEL: envia agora e a tela troca. "Prefiro
    // não deixar contato agora" soava como adiamento — não há "agora".
    expect(FRASE_SEM_CONTATO).toMatch(/enviado agora/i);
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
    expect(html).toContain("Enviar sem deixar contato");
    expect(html).toContain(FRASE_SEM_CONTATO.slice(0, 40));
  });

  it("🔴 A SAÍDA DO TURNO APARECE — foi a falta dela que produziu o defeito de 16/08", () => {
    // Primeiro turno (nome): há "Pular" na tela, não só o botão primário.
    expect(html).toContain("Pular");
  });

  it("🟠 o botão do Google diz que ENVIA, não que 'continua'", () => {
    const fonte = fs.readFileSync(
      path.join(process.cwd(), "components/agency/briefing/PublicBriefingRoom.tsx"),
      "utf8",
    );
    expect(fonte).toContain("Enviar com minha conta Google");
    expect(fonte).not.toContain("Continuar com Google");
    // E a mensagem de erro não aponta mais para um formulário que não existe.
    expect(fonte).not.toContain("Use o formulário abaixo");
  });

  it("🟠 POPUP BLOQUEADO NÃO É CLIQUE MORTO — Safari/iOS é onde nosso cliente está", () => {
    const fonte = fs.readFileSync(
      path.join(process.cwd(), "components/agency/briefing/PublicBriefingRoom.tsx"),
      "utf8",
    );
    // O componente responde por si, sem depender do `onFallback` de quem o usa
    // (que na sala do briefing chegava como `() => {}` — botão que não fazia nada).
    expect(fonte).toContain("setPopupBloqueado(true)");
    expect(fonte).toContain("bloqueou a janela do Google");
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
