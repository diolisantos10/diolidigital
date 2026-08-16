// A ROTA DO AVISO DE ORÇAMENTO QUE FALHOU — visibilidade e reenvio, sem porta
// dos fundos.
//
// Mesmo padrão de `__tests__/agency/produto-tecnologia/a-chave-da-cadeia.test.ts`:
// a rota lê sessão/cookie via `next/headers`, o que é frágil de invocar direto
// num teste de unidade — então este teste guarda a rota pela FONTE, como a
// casa já faz para as outras rotas protegidas por segredo de operação.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROTA = fs.readFileSync(
  path.join(process.cwd(), "app/api/agency/avisos-de-orcamento/route.ts"),
  "utf8",
);

describe("a rota não abre sem autenticação", () => {
  it("GET e POST chamam `autenticar` antes de tocar no banco ou disparar o reenvio", () => {
    const declaraGet = ROTA.indexOf("export async function GET");
    const declaraPost = ROTA.indexOf("export async function POST");
    expect(declaraGet).toBeGreaterThan(-1);
    expect(declaraPost).toBeGreaterThan(-1);

    const corpoGet = ROTA.slice(declaraGet, declaraPost);
    const corpoPost = ROTA.slice(declaraPost);
    for (const corpo of [corpoGet, corpoPost]) {
      const autenticacao = corpo.indexOf("await autenticar(request)");
      const trabalho = Math.min(
        ...["prisma.", "reenviarAvisosQueFalharam("]
          .map((s) => corpo.indexOf(s))
          .filter((i) => i !== -1),
      );
      expect(autenticacao).toBeGreaterThan(-1);
      expect(trabalho).toBeGreaterThan(autenticacao);
    }
  });

  it("compara o segredo com timing-safe, não com `===`", () => {
    expect(ROTA).toContain("segredoConfere");
    expect(ROTA).not.toMatch(/cabecalho\s*===\s*`Bearer/);
  });

  it("sem segredo configurado, o caminho por token nem abre — nunca vira porta aberta", () => {
    // `segredo &&` é o que impede `segredoConfere(null, undefined)` de decidir
    // sozinho: sem PILOTO_SECRET/CRON_SECRET configurados, só sobra a sessão.
    expect(ROTA).toMatch(/if\s*\(segredo\s*&&\s*segredoConfere/);
  });
});

describe("a visibilidade e o reenvio miram a MESMA lista", () => {
  it("o GET busca exatamente os dois estados que o reenvio busca — falhou e skipped, nunca avisado", () => {
    expect(ROTA).toMatch(/avisoOrcamentoStatus IN \('falhou', 'skipped'\)/);
    expect(ROTA).not.toMatch(/'avisado'/);
    // `sem_canal` PASSA a aparecer na rota (16/08/2026, tela): a rota agora
    // também CONTA esse balde para a tela mostrar como contexto. O que a
    // rota nunca pode fazer é misturá-lo na consulta que alimenta
    // `pendentes`/o reenvio — por isso a trava é sobre o `IN (...)`, não
    // sobre a string inteira.
    expect(ROTA).not.toMatch(/IN\s*\([^)]*'sem_canal'[^)]*\)/);
    expect(ROTA).toMatch(/avisoOrcamentoStatus = 'sem_canal'/);
  });

  it("o POST reenvia através da função da esteira — não existe um segundo caminho de envio aqui", () => {
    expect(ROTA).toContain("reenviarAvisosQueFalharam");
    // Nenhuma rota deveria montar e-mail por conta própria.
    expect(ROTA).not.toContain("sendEmail(");
  });

  it("falha de leitura NÃO vira lista vazia — mesma lei do /api/agency/leads", () => {
    expect(ROTA).toContain("medido: false");
    expect(ROTA).toContain("esta lista NÃO é zero, é desconhecida");
  });
});

describe("o balde dos legados — visível no GET, opt-in explícito no POST", () => {
  it("o GET conta e lista os legados (avisoOrcamentoStatus NULL) SEPARADO dos que falharam, com a ambiguidade escrita na resposta", () => {
    expect(ROTA).toContain("contarAvisosLegados");
    expect(ROTA).toMatch(/legados/);
    // A ambiguidade não é opcional: quem lê a rota precisa ver, na própria
    // resposta, que este balde é "não sabemos" — não "falhou".
    expect(ROTA).toMatch(/não é 'falhou' — é 'não sabemos'/);
  });

  it("o POST só reenvia os legados com o campo explícito `incluirLegados: true` — nunca por padrão", () => {
    expect(ROTA).toContain("reenviarAvisosLegados");
    expect(ROTA).toContain("incluirLegados");
    // O reenvio normal (`reenviarAvisosQueFalharam`) roda incondicionalmente;
    // o de legados só entra dentro de um `if` que testa o campo do corpo.
    const chamaLegado = ROTA.indexOf("await reenviarAvisosLegados(auth.escopo)");
    const ifIncluirLegados = ROTA.lastIndexOf("if (incluirLegados)", chamaLegado);
    expect(chamaLegado).toBeGreaterThan(-1);
    expect(ifIncluirLegados).toBeGreaterThan(-1);
    expect(ifIncluirLegados).toBeLessThan(chamaLegado);
  });

  it("corpo ausente ou malformado vira `incluirLegados = false`, nunca lança e nunca liga o opt-in", () => {
    expect(ROTA).toMatch(/\.catch\(\(\)\s*=>\s*\(\{\}\)/);
    expect(ROTA).toMatch(/corpo\?\.incluirLegados === true/);
  });
});

describe("a fronteira do workspace — 16/08/2026, devolução do `seguranca`", () => {
  it("`autenticar` devolve um `escopo`: sessão vira workspaceId da sessão, segredo vira `casaInteira` DECLARADO", () => {
    expect(ROTA).toMatch(/escopo:\s*\{\s*casaInteira:\s*true\s*\}/);
    expect(ROTA).toMatch(/escopo:\s*\{\s*workspaceId:\s*session\.workspaceId\s*\}/);
  });

  it("as três chamadas da esteira recebem `auth.escopo` — nenhuma roda sem escopo declarado", () => {
    expect(ROTA).toContain("reenviarAvisosQueFalharam(auth.escopo)");
    expect(ROTA).toContain("contarAvisosLegados(auth.escopo)");
    expect(ROTA).toContain("reenviarAvisosLegados(auth.escopo)");
  });

  it("o GET reaplica a fronteira de posse em memória — não confia só no WHERE", () => {
    expect(ROTA).toContain("apenasDoWorkspace(linhasCruas, auth.escopo.workspaceId)");
  });

  it("o SQL do GET filtra por workspace quando não é `casaInteira`", () => {
    expect(ROTA).toMatch(/workspaceId = \? OR workspaceId IS NULL/);
  });
});
