// O LEAD QUE CONTOU TUDO E SUMIU (08/08/2026).
//
// Medido em produção: Sushi Cazza parado há 51 dias, Camila Pereira há 29,
// Beatriz Gimenes há 28. Os três com a conversa inteira gravada — paleta,
// ticket, público-alvo — e **nenhum com nome de contato, e-mail ou telefone**.
// O briefing público coletava a conversa e nunca perguntava para onde ligar.
//
// Este arquivo trava as DUAS METADES, que é o que a casa exige de toda trava:
//   • COM contato → o briefing fecha e vira proposta;
//   • SEM contato → não vira proposta, **e o que a pessoa contou não some**.
//
// E trava a terceira coisa, que é a que a lei da casa proíbe: **contato não se
// deduz**. O `@sushicazzaoficial` que está escrito no briefing do Sushi Cazza é
// pista para o CEO, nunca contato — porque contato inventado desliga o alarme
// sem dar para onde ligar, que é pior que o silêncio de hoje.

import { describe, it, expect } from "vitest";
import {
  lerContato,
  montarContato,
  pistasDeContato,
  emailValido,
  whatsappValido,
  whatsappComoSeLe,
  MOTIVO_SEM_CONTATO,
} from "@/lib/agency/comercial/contato-do-lead";

// A conversa real, na forma em que ela chega ao `rawContext`: o negócio inteiro
// descrito, um arroba de Instagram no meio, números por toda parte — e nenhuma
// declaração de contato.
const CONVERSA_SUSHI_CAZZA = `
[Prospect] Restaurante Sushi Cazza
[Dioli] Legal! Me conta o que você precisa.
[Prospect] Preciso de planejamento de conteúdo, direção visual e estratégia.
[Prospect] Nosso ticket médio é R$ 180,00 e o público é de 25 a 45 anos.
[Prospect] A paleta é preto, vermelho e dourado. Nosso perfil é o @sushicazzaoficial.
[Prospect] Queria uns 12 posts por mês, algo em torno de 1500 por mês.
`;

describe("contato do lead — a metade que RECONHECE", () => {
  it("lê o formato canônico gravado pelo gate novo", () => {
    const c = lerContato({
      briefingJson: {
        contato: { nome: "Pedro", email: "pedro@sushicazza.com.br", whatsapp: "(11) 98940-0692" },
      },
    });
    expect(c.temComoFalar).toBe(true);
    expect(c.nome).toBe("Pedro");
    expect(c.email).toBe("pedro@sushicazza.com.br");
    expect(c.whatsapp).toBe("11989400692"); // só dígitos: formatação é da tela
    expect(c.motivo).toBeNull();
  });

  it("lê o formato LEGADO (`briefingJson.scope.prospect*`) — as fichas antigas não podem virar lead incompleto por mudança de formato", () => {
    const c = lerContato({
      briefingJson: { scope: { prospectName: "Camila", prospectEmail: "camila@clinic.com.br" } },
    });
    expect(c.temComoFalar).toBe(true);
    expect(c.nome).toBe("Camila");
    expect(c.email).toBe("camila@clinic.com.br");
  });

  it("UM canal basta — WhatsApp sozinho, sem e-mail, fecha", () => {
    const c = lerContato({ briefingJson: { contato: { nome: "Beatriz", whatsapp: "11987654321" } } });
    expect(c.temComoFalar).toBe(true);
    expect(c.canais).toEqual([{ tipo: "whatsapp", valor: "11987654321" }]);
  });

  it("o WhatsApp vem antes do e-mail — é por onde o cliente brasileiro responde", () => {
    const c = lerContato({
      briefingJson: { contato: { whatsapp: "11987654321", email: "a@b.com.br" } },
    });
    expect(c.canais[0].tipo).toBe("whatsapp");
  });

  it("blob de briefing ilegível é ausência de informação, não contato vazio silencioso", () => {
    const c = lerContato({ briefingJson: "{ isto não é json" });
    expect(c.temComoFalar).toBe(false);
    expect(c.motivo).toBe(MOTIVO_SEM_CONTATO);
  });
});

describe("contato do lead — a metade que RECUSA", () => {
  it("as TRÊS de produção: briefing completo, contato nenhum", () => {
    const c = lerContato({
      briefingJson: { scope: { businessName: "Restaurante Sushi Cazza", segment: "gastronomia" } },
    });
    expect(c.temComoFalar).toBe(false);
    expect(c.email).toBeNull();
    expect(c.whatsapp).toBeNull();
    expect(c.motivo).toBe(MOTIVO_SEM_CONTATO);
  });

  it("NOME SOZINHO NÃO É CONTATO — era exatamente assim que o desperdício se chamava", () => {
    const c = lerContato({ briefingJson: { contato: { nome: "Pedro" } } });
    expect(c.nome).toBe("Pedro");
    expect(c.temComoFalar).toBe(false);
  });

  it("e-mail malformado não conta como canal", () => {
    expect(emailValido("pedro@")).toBe(false);
    expect(emailValido("pedro@dominio")).toBe(false);
    expect(lerContato({ briefingJson: { contato: { email: "pedro@" } } }).temComoFalar).toBe(false);
  });

  it("número curto demais não vira telefone — R$ 1.500 e '12 posts' aparecem em TODO briefing", () => {
    expect(whatsappValido("1500")).toBe(false);
    expect(whatsappValido("12")).toBe(false);
    expect(whatsappValido("989400692")).toBe(false); // celular sem DDD
    expect(whatsappValido("11989400692")).toBe(true);
    expect(whatsappValido("5511989400692")).toBe(true);
  });

  it("🔴 NÃO DEDUZ CONTATO DA CONVERSA — nem arroba, nem número, nem e-mail solto no texto", () => {
    const c = lerContato({
      // O `rawContext` sequer é um campo que `lerContato` aceita. Mesmo passando
      // tudo que existe no registro, o veredito é o mesmo.
      briefingJson: { scope: { businessName: "Sushi Cazza" }, transcript: CONVERSA_SUSHI_CAZZA },
      sdrHandoffJson: { resumo: CONVERSA_SUSHI_CAZZA },
    });
    expect(c.temComoFalar).toBe(false);
    expect(c.whatsapp).toBeNull();
    expect(c.email).toBeNull();
  });
});

describe("pistas — o caminho real que NÃO vira contato", () => {
  it("acha o @sushicazzaoficial que o CEO viu no texto", () => {
    const p = pistasDeContato(CONVERSA_SUSHI_CAZZA);
    expect(p).toContainEqual({ tipo: "instagram", valor: "@sushicazzaoficial" });
  });

  it("🔴 a pista NUNCA faz `temComoFalar` virar verdadeiro — quem aborda é o CEO, não a máquina", () => {
    const pistas = pistasDeContato(CONVERSA_SUSHI_CAZZA);
    expect(pistas.length).toBeGreaterThan(0);
    const c = lerContato({ briefingJson: { scope: { businessName: "Sushi Cazza" } } });
    expect(c.temComoFalar).toBe(false);
  });

  it("tem teto: pista é ponta de investigação, não dump de tudo que parece número", () => {
    const ruido = Array.from({ length: 40 }, (_, i) => `@perfil_numero_${i}`).join(" ");
    expect(pistasDeContato(ruido).length).toBeLessThanOrEqual(8);
  });

  it("texto sem nada não inventa pista — a metade limpa", () => {
    expect(pistasDeContato("quero mais posts por semana")).toEqual([]);
    expect(pistasDeContato(null)).toEqual([]);
  });
});

describe("montarContato — o que o gate grava", () => {
  it("devolve NULO quando não há canal: `{email:null,whatsapp:null}` faria a leitura futura não distinguir 'recusou' de 'nunca perguntamos'", () => {
    expect(montarContato({ nome: "Pedro" })).toBeNull();
    expect(montarContato({ nome: "Pedro", email: "pedro@", whatsapp: "12" })).toBeNull();
  });

  it("grava normalizado quando há canal", () => {
    const c = montarContato({ nome: " Pedro ", whatsapp: "+55 (11) 98940-0692", email: "" });
    expect(c).not.toBeNull();
    expect(c!.nome).toBe("Pedro");
    expect(c!.whatsapp).toBe("5511989400692");
    expect(c!.email).toBeNull();
    expect(typeof c!.informadoEm).toBe("string");
  });
});

// ── O TELEFONE COMO SE LÊ — 16/08/2026 ────────────────────────────────────
//
// `/agency/leads` mostrava `11987654321` numa linha só. A tela existe para uma
// pessoa DISCAR esse número, e onze dígitos colados são onze dígitos contados
// com o dedo. As duas metades desta trava:
//
//   ✅ formata o que TEM forma de telefone brasileiro;
//   ⛔ e **não encosta** no que não tem — porque contato adulterado na exibição
//      é pior que contato feio: ninguém confere o que a tela já arrumou.
describe("whatsappComoSeLe — formatar é de EXIBIÇÃO, e recusa é a regra principal", () => {
  it("celular de 11 dígitos vira (DD) 9NNNN-NNNN", () => {
    expect(whatsappComoSeLe("11987654321")).toBe("(11) 98765-4321");
  });

  it("fixo de 10 dígitos vira (DD) NNNN-NNNN", () => {
    expect(whatsappComoSeLe("1133334444")).toBe("(11) 3333-4444");
  });

  it("⛔ com o 55 na frente NÃO é reformatado — sai como está gravado", () => {
    // 13 dígitos. Cortar o 55 para "caber" no molde de 11 produziria um número
    // diferente do que o cliente escreveu, na tela onde alguém vai ligar.
    expect(whatsappComoSeLe("5511989400692")).toBe("5511989400692");
  });

  it("⛔ o que não tem forma de telefone sai INTACTO, nunca remendado", () => {
    for (const cru of ["12", "", "não informado", "+1 202 555 0143", "119876543219999"]) {
      expect(whatsappComoSeLe(cru)).toBe(cru);
    }
  });

  it("não perde nem inventa dígito: os dígitos de saída são os de entrada", () => {
    for (const cru of ["11987654321", "1133334444", "5511989400692", "12"]) {
      expect(whatsappComoSeLe(cru).replace(/\D/g, "")).toBe(cru.replace(/\D/g, ""));
    }
  });
});
