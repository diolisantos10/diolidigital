// ── "CONECTADA" NÃO PODE SER O RÓTULO DE UM ACESSO NÃO TESTADO ──────────────
//
// O incidente (08/08/2026): o portal do CityJobs dizia "Conectada · desde
// 03/08/2026" para o Instagram @cityjobs.sp e a Página City Jobs SP, no mesmo
// dia em que o Diretor afirmou ao CEO que o acesso tinha vencido. A tela e a
// conversa não podiam estar certas as duas.
//
// Cada trava aqui tem AS DUAS METADES: prova que barra o problema plantado E
// que não inventa problema no caso limpo. Trava que só tem a primeira metade
// reprova tudo e é desligada na semana seguinte.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  estadoDaConexao,
  lerMetaJson,
  statusPeloCodigo,
  lerCodigoDaGraph,
  CHAVE_CONFIRMACAO,
  CHAVE_FALHA,
} from "@/lib/integrations/meta/verificacao";
import { retratoDaEscolha, FRASE_ZERO_MATERIAL } from "@/lib/integrations/google/escolha-de-material";

const RAIZ = join(__dirname, "..", "..");
const CONEXAO_VIVA = {
  status: "connected",
  escopos: "https://www.googleapis.com/auth/drive.file",
  tokenExpiresAt: new Date(Date.now() + 3600_000),
  temRefresh: true,
};

const ONTEM = new Date(Date.now() - 24 * 3600_000).toISOString();
const HOJE = new Date().toISOString();

describe("os três estados de um acesso", () => {
  it("linha recém-criada e nunca exercitada é NÃO VERIFICADA — nunca viva", () => {
    // É literalmente o caso do CityJobs: linha de 03/08, zero exames.
    const r = estadoDaConexao({
      status: "connected",
      connectedAt: new Date("2026-08-03T14:05:16.773Z"),
      metaJson: {},
    });
    expect(r.estado).toBe("nao_verificada");
    expect(r.confirmadoEm).toBeNull();
  });

  it("A METADE LIMPA: acesso exercitado com sucesso aparece VIVO, com a data do exame", () => {
    const r = estadoDaConexao({
      status: "connected",
      connectedAt: new Date("2026-08-03T14:05:16.773Z"),
      metaJson: { [CHAVE_CONFIRMACAO]: { em: HOJE, prova: "li o perfil @cityjobs.sp" } },
    });
    expect(r.estado).toBe("viva");
    expect(r.confirmadoEm).toBe(HOJE);
    // A data que vai à tela NÃO é a de criação da linha.
    expect(r.confirmadoEm).not.toBe(r.registradaEm);
  });

  it("acesso recusado aparece CAÍDO, com o código e a frase CRUS da Meta", () => {
    const r = estadoDaConexao({
      status: "connected", // a coluna ainda diz "connected" — e não manda
      connectedAt: new Date("2026-08-03T14:05:16.773Z"),
      metaJson: {
        [CHAVE_FALHA]: {
          em: HOJE,
          codigo: 190,
          subcodigo: 460,
          mensagem: "Error validating access token: Session has expired",
          tipo: "OAuthException",
        },
      },
    });
    expect(r.estado).toBe("caiu");
    expect(r.falha?.codigo).toBe(190);
    expect(r.falha?.mensagem).toContain("Session has expired");
  });

  it("recusa MAIS NOVA vence confirmação antiga — funcionar ontem não é funcionar hoje", () => {
    const r = estadoDaConexao({
      status: "connected",
      connectedAt: new Date("2026-08-03T00:00:00.000Z"),
      metaJson: {
        [CHAVE_CONFIRMACAO]: { em: ONTEM, prova: "li o perfil" },
        [CHAVE_FALHA]: { em: HOJE, codigo: 190, subcodigo: null, mensagem: "expired", tipo: "OAuthException" },
      },
    });
    expect(r.estado).toBe("caiu");
  });

  it("A METADE LIMPA da anterior: confirmação mais nova que a recusa volta a ser VIVA", () => {
    const r = estadoDaConexao({
      status: "connected",
      connectedAt: new Date("2026-08-03T00:00:00.000Z"),
      metaJson: {
        [CHAVE_FALHA]: { em: ONTEM, codigo: 190, subcodigo: null, mensagem: "expired", tipo: "OAuthException" },
        [CHAVE_CONFIRMACAO]: { em: HOJE, prova: "li o perfil" },
      },
    });
    expect(r.estado).toBe("viva");
  });

  it("status recusado sem motivo guardado DECLARA a ausência — não inventa uma causa", () => {
    const r = estadoDaConexao({ status: "expired", connectedAt: new Date(), metaJson: {} });
    expect(r.estado).toBe("caiu");
    expect(r.falha?.codigo).toBeNull();
    expect(r.falha?.mensagem).toMatch(/não guardou a resposta/i);
  });

  it("metaJson quebrado nunca vira 'viva' — na dúvida, não verificada", () => {
    expect(lerMetaJson("{isso não é json")).toEqual({});
    expect(lerMetaJson("[1,2,3]")).toEqual({});
    const r = estadoDaConexao({ status: "connected", connectedAt: new Date(), metaJson: lerMetaJson("nada") });
    expect(r.estado).toBe("nao_verificada");
  });
});

describe("o código da Graph decide a palavra — e a biblioteca capturada é a fonte", () => {
  it("190 e 102 são TOKEN — e só eles mandam o cliente reconectar", () => {
    // fontes/graph-api-tratamento-de-erros.md, capturado em 07/08/2026:
    // "isso indica que o status de login ou o token de acesso expirou, foi
    //  revogado ou é inválido. Obtenha um novo token de acesso."
    expect(statusPeloCodigo(190)).toBe("expired");
    expect(statusPeloCodigo(102)).toBe("expired");
    expect(lerCodigoDaGraph(190).quemResolve).toBe("cliente");
  });

  it("🔴 CÓDIGO 10 NÃO É TOKEN MORTO — e não pode mandar o cliente reconectar", () => {
    // Medido em produção em 08/08/2026 na Página "City Jobs SP":
    //   "(#10) This endpoint requires the 'pages_read_engagement' permission
    //    or the 'Page Public Content Access' feature."
    // A fonte capturada é explícita: código 10 = "Permissão de API negada. A
    // permissão não foi concedida ou foi removida." Isso é App Review do app
    // DA AGÊNCIA. Se a tela mandar reconectar, o cliente reconecta, o erro
    // volta igual, e ele conclui que o produto não funciona.
    const r = lerCodigoDaGraph(10);
    expect(r.quemResolve).toBe("agencia");
    expect(r.status).not.toBe("expired");
    expect(r.oQueFazer).not.toMatch(/reconecte a conta/i);
    expect(r.oQueFazer).toMatch(/reconectar não resolve/i);
    // 200 e 3 são a mesma família e seguem a mesma regra.
    for (const codigo of [3, 200, 299]) {
      expect(lerCodigoDaGraph(codigo).quemResolve).toBe("agencia");
    }
  });

  it("LIMITE DE TAXA não é culpa de ninguém e se resolve sozinho", () => {
    for (const codigo of [4, 17, 32, 613, 80004]) {
      const r = lerCodigoDaGraph(codigo);
      expect(r.quemResolve).toBe("ninguem_agora");
      expect(r.status).not.toBe("expired");
    }
  });

});

describe("a tela do cliente não pode voltar a escrever 'Conectada' sozinha", () => {
  const cartao = readFileSync(join(RAIZ, "components/portal/ConexoesDoCliente.tsx"), "utf8");

  it("o cartão não tem mais o rótulo 'Conectada' nem 'desde <data>'", () => {
    expect(cartao).not.toMatch(/label:\s*"Conectada"/);
    expect(cartao).not.toMatch(/·\s*desde\s*\{/);
  });

  it("os três estados existem por nome no cartão", () => {
    expect(cartao).toContain("nao_verificada");
    expect(cartao).toContain("caiu");
    expect(cartao).toContain("viva");
  });

  it("FAIL CLOSED: estado ausente cai em 'não verificada', nunca em viva", () => {
    // A régua está escrita no componente; aqui travamos a INTENÇÃO dela.
    expect(cartao).toMatch(/c\.estado\s*\?\?\s*\(c\.status === "connected" \? "nao_verificada"/);
  });

  it("toda data mostrada vem acompanhada do que ela significa", () => {
    // "funcionou pela última vez", "registrada em", "recusado em" — nunca uma
    // data solta, que foi como "desde 03/08" enganou.
    expect(cartao).toContain("funcionou pela última vez em");
    expect(cartao).toContain("registrada em");
    expect(cartao).toContain("o acesso foi recusado em");
  });

  it("🔴 o cartão não manda reconectar quando reconectar não resolve", () => {
    // Quem decide a frase é o SERVIDOR (`oQueFazer`). O componente não pode ter
    // um "Reconecte" incondicional no ramo de erro — foi o que quase mandou o
    // dono do CityJobs reconectar por um erro de App Review da agência.
    expect(cartao).toContain("c.oQueFazer");
    expect(cartao).toMatch(/quemResolve === "cliente"/);
    // E o fallback do lado "não é o cliente" existe e não pede reconexão.
    expect(cartao).toContain("não é problema da sua conta");
  });

  it("a rota do portal não fala com a Meta — tela de cliente não faz rajada de GET", () => {
    const rota = readFileSync(join(RAIZ, "app/api/portal/conexoes/route.ts"), "utf8");
    expect(rota).not.toContain("graphGet");
    expect(rota).not.toContain("graph.facebook.com");
    expect(rota).not.toMatch(/\bfetch\(/);
  });

  it("a rota do portal usa a MESMA função do diagnóstico — não uma segunda cópia da regra", () => {
    const rota = readFileSync(join(RAIZ, "app/api/portal/conexoes/route.ts"), "utf8");
    expect(rota).toContain("estadoDaConexao");
  });
});

describe("a rota de diagnóstico nasce fechada e não escreve na plataforma", () => {
  const rota = readFileSync(join(RAIZ, "app/api/admin/diagnostico-de-conexoes/route.ts"), "utf8");

  it("segredo ausente do ambiente = PORTA FECHADA (503), nunca aberta", () => {
    expect(rota).toMatch(/if \(!cronSecret\)[\s\S]{0,220}status: 503/);
  });

  it("segredo errado = 401, em comparação de tempo constante", () => {
    expect(rota).toContain("segredoConfere");
    expect(rota).toMatch(/status: 401/);
  });

  it("não exporta POST, PUT, PATCH nem DELETE — só leitura entra por esta porta", () => {
    for (const verbo of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(rota).not.toMatch(new RegExp(`export async function ${verbo}\\b`));
    }
    expect(rota).toMatch(/export async function GET\b/);
  });

  it("carimbar é ATO EXPLÍCITO: sem ?carimbar=1 nada é gravado", () => {
    expect(rota).toContain('searchParams.get("carimbar")');
    expect(rota).toMatch(/carimbar\s*\?\s*await carimbarAcessoVivo/);
  });

  it("nenhum token sai na resposta", () => {
    expect(rota).not.toContain("accessTokenEncrypted:");
    expect(rota).not.toContain("tokenHint");
  });
});

describe("nenhuma ESCRITA na Meta parte do exame", () => {
  const exame = readFileSync(join(RAIZ, "lib/integrations/meta/verificacao.ts"), "utf8");

  it("só graphGet — nem graphPost nem graphPostJson", () => {
    expect(exame).toContain("graphGet");
    expect(exame).not.toContain("graphPost");
  });

  it("não chama a Graph por fora de graph.ts (que é onde mora o freio de ritmo)", () => {
    expect(exame).not.toMatch(/\bfetch\(/);
    expect(exame).not.toContain("graph.facebook.com");
  });
});

describe("Drive: conectado sem arquivo é ZERO MATERIAL, e a tela diz isso", () => {
  it("conexão viva e nenhum arquivo escolhido: a frase diz a CONSEQUÊNCIA, não só o estado", () => {
    // O estado real de produção em 08/08/2026: CityJobs, Foocci e Dioli Digital
    // Studio, os três com Drive conectado e ZERO arquivo escolhido.
    const r = retratoDaEscolha(CONEXAO_VIVA, []);
    expect(r.utilizavel).toBe(false);
    expect(r.frase).toBe(FRASE_ZERO_MATERIAL);
    expect(r.frase).toMatch(/não alcança NENHUM arquivo/);
    // A frase antiga descrevia o estado e escondia a consequência.
    expect(r.frase).not.toBe("Conectado, mas nenhum arquivo escolhido ainda. Escolha o que a equipe pode usar.");
  });

  it("A METADE LIMPA: com material declarado, a frase volta a ser a boa", () => {
    const r = retratoDaEscolha(CONEXAO_VIVA, [
      { fileId: "1", nome: "logo.png", ehPasta: false, papel: "logo", papelConfirmadoEm: new Date() },
    ]);
    expect(r.utilizavel).toBe(true);
    expect(r.frase).not.toBe(FRASE_ZERO_MATERIAL);
    expect(r.frase).toMatch(/prontos para a equipe usar/);
  });

  it("o selo verde 'Ativo' não pode mais aparecer com zero material", () => {
    const cartao = readFileSync(join(RAIZ, "components/portal/DriveDoCliente.tsx"), "utf8");
    // A régua antiga era faltaDizerOQueE > 0 — que é ZERO quando nada foi
    // escolhido, e por isso o cartão ficava verde sobre o nada.
    expect(cartao).not.toContain("faltaDeclarar");
    expect(cartao).toContain("retrato.utilizavel");
    expect(cartao).toContain("Sem material");
  });

  it("o exame do Drive é só leitura e separa 'acesso vivo' de 'material alcançado'", () => {
    const exame = readFileSync(join(RAIZ, "lib/integrations/google/verificacao-do-drive.ts"), "utf8");
    expect(exame).not.toMatch(/method:\s*"(POST|PUT|PATCH|DELETE)"/);
    expect(exame).toContain("comTokenDoDrive");
  });
});
