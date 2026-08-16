// A CHAVE DO PROSPECT — as duas metades (16/08/2026).
//
// Pergunta literal do CEO: *"se entrar um cliente com o mesmo e-mail e fizer
// cinco briefings um atrás do outro, o que acontece com o sistema?"*
//
// Este arquivo prova a parte PURA da resposta: quem é reconhecido como a mesma
// pessoa, e — tão importante quanto — **quem NÃO é**. Uma dedup que só prova que
// junta o que é igual é meia trava: a metade cara é provar que ela não inventa
// parentesco entre dois prospects diferentes, porque juntar dois clientes que
// não são o mesmo entrega o portal de um para o outro.

import { describe, it, expect } from "vitest";
import {
  normalizarEmailParaChave,
  normalizarTelefoneParaChave,
  chavesDoContato,
  chaveCanonicaDoContato,
  chaveDaSolicitacao,
  agruparPorProspect,
} from "@/lib/agency/comercial/chave-do-prospect";
import { lerContato } from "@/lib/agency/comercial/contato-do-lead";

/** Um briefing como ele chega pelo formulário público, no formato canônico. */
function briefing(contato: { nome?: string; email?: string; whatsapp?: string }) {
  return { briefingJson: { contato: { informadoEm: "2026-08-16T10:00:00.000Z", ...contato } } };
}

describe("normalização — o que o CEO pediu com todas as letras", () => {
  it("`  Joao@Email.com ` casa com `joao@email.com`", () => {
    expect(normalizarEmailParaChave("  Joao@Email.com ")).toBe("joao@email.com");
    expect(normalizarEmailParaChave("joao@email.com")).toBe("joao@email.com");
    expect(normalizarEmailParaChave("  Joao@Email.com ")).toBe(normalizarEmailParaChave("joao@email.com"));
  });

  it("`(11) 99999-8888` casa com `11999998888`", () => {
    expect(normalizarTelefoneParaChave("(11) 99999-8888")).toBe("11999998888");
    expect(normalizarTelefoneParaChave("11999998888")).toBe("11999998888");
    expect(normalizarTelefoneParaChave("(11) 99999-8888")).toBe(normalizarTelefoneParaChave("11999998888"));
  });

  it("aceita as outras formas que o cliente brasileiro realmente digita", () => {
    const esperado = "5511999998888";
    for (const forma of ["+55 (11) 99999-8888", "55 11 99999 8888", "+55 11 99999-8888"]) {
      expect(normalizarTelefoneParaChave(forma)).toBe(esperado);
    }
  });

  it("vazio e nulo NÃO viram chave — string vazia agruparia todo mundo num balde só", () => {
    expect(normalizarEmailParaChave("")).toBeNull();
    expect(normalizarEmailParaChave("   ")).toBeNull();
    expect(normalizarEmailParaChave(null)).toBeNull();
    expect(normalizarTelefoneParaChave("")).toBeNull();
    // O caso que mais assusta: texto sem um dígito sequer não pode virar
    // `whatsapp:` de chave vazia.
    expect(normalizarTelefoneParaChave("não quero informar")).toBeNull();
  });
});

describe("a chave canônica", () => {
  it("prefere e-mail ao WhatsApp — chave é sobre durar, canal é sobre alcançar", () => {
    const c = lerContato(briefing({ email: "Joao@Email.com", whatsapp: "(11) 99999-8888" }));
    expect(chaveCanonicaDoContato(c)).toBe("email:joao@email.com");
    // Mas as DUAS continuam disponíveis para o agrupamento.
    expect(chavesDoContato(c)).toEqual(["email:joao@email.com", "whatsapp:11999998888"]);
  });

  it("cai para o WhatsApp quando não há e-mail", () => {
    expect(chaveDaSolicitacao(briefing({ whatsapp: "(11) 99999-8888" }))).toBe("whatsapp:11999998888");
  });

  it("o prefixo separa os espaços de identidade — telefone nunca colide com e-mail", () => {
    const chaves = chavesDoContato(lerContato(briefing({ whatsapp: "11999998888" })));
    expect(chaves[0]!.startsWith("whatsapp:")).toBe(true);
  });

  it("🔴 SEM CANAL NÃO HÁ CHAVE — e é a metade que impede a inferência", () => {
    // O lead do Sushi Cazza: briefing inteiro, arroba de Instagram no texto,
    // zero canal declarado. Ele NÃO pode ganhar chave, porque chave por
    // dedução juntaria dois anônimos que não têm nada a ver um com o outro.
    expect(chaveDaSolicitacao({ briefingJson: { scope: { businessName: "Sushi Cazza" } } })).toBeNull();
    expect(chaveDaSolicitacao(null)).toBeNull();
    expect(chaveDaSolicitacao({})).toBeNull();
  });

  it("🔴 NOME DE NEGÓCIO NUNCA VIRA CHAVE — dois homônimos podem ser duas pessoas", () => {
    const so_nome = { briefingJson: { contato: { nome: "Camila Pereira", informadoEm: "x" } } };
    expect(chaveDaSolicitacao(so_nome)).toBeNull();
  });
});

// ── O AGRUPAMENTO: a pergunta do CEO, encenada ──────────────────────────────

const T0 = new Date("2026-08-16T09:00:00.000Z");
const min = (n: number) => new Date(T0.getTime() + n * 60_000);

describe("cinco briefings do mesmo e-mail, um atrás do outro", () => {
  const cinco = [1, 2, 3, 4, 5].map((n) => ({
    id: `req-${n}`,
    createdAt: min(n),
    ...briefing({ nome: "João", email: "joao@email.com" }),
  }));

  it("os cinco são reconhecidos como UM prospect só", () => {
    const g = agruparPorProspect(cinco);
    expect(g.size).toBe(5);
    for (const n of [1, 2, 3, 4, 5]) expect(g.get(`req-${n}`)!.vezes).toBe(5);
  });

  it("cada um sabe que posição ocupa, e o primeiro é o mais antigo", () => {
    const g = agruparPorProspect(cinco);
    expect(g.get("req-1")!.ordem).toBe(1);
    expect(g.get("req-5")!.ordem).toBe(5);
    expect(g.get("req-3")!.primeiroEm).toEqual(min(1));
  });

  it("🔴 NENHUM SOME: os cinco continuam listados, e cada um aponta os outros quatro", () => {
    const g = agruparPorProspect(cinco);
    // Cinco linhas entraram, cinco linhas saíram. Nada foi fundido nem engolido.
    expect([...g.keys()].sort()).toEqual(["req-1", "req-2", "req-3", "req-4", "req-5"]);
    expect(g.get("req-2")!.irmaos.sort()).toEqual(["req-1", "req-3", "req-4", "req-5"]);
  });

  it("a ordem de chegada embaralhada na entrada não muda o resultado", () => {
    const g = agruparPorProspect([...cinco].reverse());
    expect(g.get("req-1")!.ordem).toBe(1);
    expect(g.get("req-5")!.ordem).toBe(5);
  });
});

describe("o agrupamento não inventa parentesco — a metade cara", () => {
  it("⛔ dois e-mails diferentes NÃO viram o mesmo prospect", () => {
    const g = agruparPorProspect([
      { id: "a", createdAt: min(1), ...briefing({ email: "joao@email.com" }) },
      { id: "b", createdAt: min(2), ...briefing({ email: "maria@email.com" }) },
    ]);
    // Grupo de um só não é repetição: a tela não carimba nada.
    expect(g.get("a")!.vezes).toBe(1);
    expect(g.get("b")!.vezes).toBe(1);
    expect(g.get("a")!.irmaos).toEqual([]);
  });

  it("⛔ DOIS LEADS SEM CONTATO NÃO SÃO AGRUPADOS — nem entre si, nem com ninguém", () => {
    // É a trava contra a inferência. Sem canal declarado não há identidade, e
    // juntar dois anônimos porque ambos são anônimos seria o pior erro possível.
    const g = agruparPorProspect([
      { id: "anon-1", createdAt: min(1), briefingJson: { scope: { businessName: "Sushi Cazza" } } },
      { id: "anon-2", createdAt: min(2), briefingJson: { scope: { businessName: "Sushi Cazza" } } },
    ]);
    expect(g.has("anon-1")).toBe(false);
    expect(g.has("anon-2")).toBe(false);
  });

  it("⛔ mesmo NOME DE NEGÓCIO com contatos diferentes continua sendo duas pessoas", () => {
    const g = agruparPorProspect([
      { id: "c1", createdAt: min(1), ...briefing({ nome: "Camila Pereira", email: "camila.p@email.com" }) },
      { id: "c2", createdAt: min(2), ...briefing({ nome: "Camila Pereira", email: "camila.pereira@outro.com" }) },
    ]);
    expect(g.get("c1")!.vezes).toBe(1);
    expect(g.get("c2")!.vezes).toBe(1);
  });

  it("fila vazia não quebra e não inventa grupo", () => {
    expect(agruparPorProspect([]).size).toBe(0);
  });
});

describe("o caso que só a interseção resolve", () => {
  it("só-WhatsApp + só-e-mail + os-dois viram UM prospect, pela ponte", () => {
    // Três briefings da mesma pessoa: no 1º ela deu só o zap, no 2º só o
    // e-mail, e no 3º os dois. Só o terceiro revela que os dois primeiros eram
    // a mesma pessoa — e o agrupamento tem que voltar atrás e fundir os grupos.
    const g = agruparPorProspect([
      { id: "so-zap",   createdAt: min(1), ...briefing({ whatsapp: "(11) 99999-8888" }) },
      { id: "so-email", createdAt: min(2), ...briefing({ email: "Joao@Email.com" }) },
      { id: "ponte",    createdAt: min(3), ...briefing({ email: "joao@email.com", whatsapp: "11999998888" }) },
    ]);
    expect(g.get("so-zap")!.vezes).toBe(3);
    expect(g.get("so-email")!.vezes).toBe(3);
    expect(g.get("ponte")!.vezes).toBe(3);
    expect(g.get("ponte")!.ordem).toBe(3);
    expect(g.get("so-zap")!.irmaos.sort()).toEqual(["ponte", "so-email"]);
  });

  it("⛔ sem a ponte, os dois continuam separados — a fusão exige evidência", () => {
    const g = agruparPorProspect([
      { id: "so-zap",   createdAt: min(1), ...briefing({ whatsapp: "(11) 99999-8888" }) },
      { id: "so-email", createdAt: min(2), ...briefing({ email: "Joao@Email.com" }) },
    ]);
    expect(g.get("so-zap")!.vezes).toBe(1);
    expect(g.get("so-email")!.vezes).toBe(1);
  });

  it("a normalização vale DENTRO do agrupamento, não só na função solta", () => {
    const g = agruparPorProspect([
      { id: "cru",  createdAt: min(1), ...briefing({ email: "  Joao@Email.com " }) },
      { id: "limpo", createdAt: min(2), ...briefing({ email: "joao@email.com" }) },
    ]);
    expect(g.get("cru")!.vezes).toBe(2);
  });
});
