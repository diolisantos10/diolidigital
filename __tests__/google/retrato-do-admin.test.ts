// O retrato do Google no admin — e as travas que o impedem de mentir.
//
// Cada trava aqui tem AS DUAS METADES: prova que barra o problema plantado E
// que não inventa problema no caso limpo. Uma varredura que reprova tudo é tão
// inútil quanto uma que aprova tudo — e a segunda metade é a que falta na
// maioria dos testes de checagem.

import { describe, it, expect } from "vitest";
import {
  retratoDeUmCliente,
  credenciaisDoGoogle,
  medido,
  naoMedido,
} from "@/lib/agency/google/retrato";
import fs from "node:fs";
import path from "node:path";

const CLIENTE = { id: "c1", name: "Foocci" };
const SEM_FALHA = { drive: null, perfil: null };

function material(over: Partial<Parameters<typeof retratoDeUmCliente>[2][number]> = {}) {
  return {
    clientId: "c1",
    papel: "logo" as string | null,
    papelConfirmadoEm: new Date("2026-08-07") as Date | null,
    mediaAssetId: "m1" as string | null,
    nome: "logo.png",
    erro: null as string | null,
    ...over,
  };
}

function conexaoDeDrive(status = "connected") {
  return {
    status,
    contaHint: "j***@gmail.com",
    connectedAt: new Date("2026-08-07T10:00:00Z"),
    updatedAt: new Date("2026-08-08T09:00:00Z"),
  };
}

// ─── A trava central: "não medido" nunca vira zero ──────────────────────────

describe("falha de leitura NÃO vira contagem zero", () => {
  it("metade 1 — com falha de leitura, toda contagem do Drive fica 'não medido'", () => {
    const r = retratoDeUmCliente(CLIENTE, conexaoDeDrive(), [], [], [], {
      drive: "banco fora do ar",
      perfil: null,
    });

    for (const c of [r.drive.escolhidos, r.drive.declarados, r.drive.importados, r.drive.aguardandoCliente]) {
      expect(c.estado).toBe("nao_medido");
      // O motivo viaja junto: "não medido" sem motivo é o mesmo silêncio com
      // outra roupa.
      if (c.estado === "nao_medido") expect(c.motivo).toContain("banco fora do ar");
    }
  });

  it("metade 2 — SEM falha e SEM material, a contagem é zero de verdade", () => {
    const r = retratoDeUmCliente(CLIENTE, conexaoDeDrive(), [], [], [], SEM_FALHA);
    expect(r.drive.escolhidos).toEqual(medido(0));
    expect(r.drive.declarados).toEqual(medido(0));
    // Zero é uma afirmação legítima quando a casa CONSEGUIU olhar. A trava não
    // pode transformar todo vazio em "não sei", senão a tela nunca diz nada.
    expect(r.drive.escolhidos.estado).toBe("medido");
  });

  it("a falha do PERFIL não contamina o Drive, e vice-versa", () => {
    const r = retratoDeUmCliente(CLIENTE, conexaoDeDrive(), [material()], [], [], {
      drive: null,
      perfil: "não consegui ler as avaliações",
    });
    expect(r.drive.declarados).toEqual(medido(1));
    expect(r.perfil.totalDeAvaliacoes.estado).toBe("nao_medido");
  });
});

// ─── Escolher não é declarar ────────────────────────────────────────────────

describe("escolhido e declarado são números DIFERENTES", () => {
  it("arquivo sem papel confirmado NÃO conta como material da agência", () => {
    const r = retratoDeUmCliente(
      CLIENTE,
      conexaoDeDrive(),
      [
        material(),
        material({ papel: null, papelConfirmadoEm: null, mediaAssetId: null, nome: "IMG_2831.jpg" }),
      ],
      [], [], SEM_FALHA,
    );
    expect(r.drive.escolhidos).toEqual(medido(2));
    // Se estes dois números pudessem ser iguais, a tela diria "2 disponíveis"
    // para uma esteira que só consegue usar 1 — e a peça sairia sem a foto.
    expect(r.drive.declarados).toEqual(medido(1));
    expect(r.drive.aguardandoCliente).toEqual(medido(1));
  });

  it("papel gravado SEM data de confirmação também não vale", () => {
    // `papelSugerido` é palpite da casa. Se ele vazasse para `papel` sem
    // `papelConfirmadoEm`, a sugestão viraria declaração do cliente.
    const r = retratoDeUmCliente(
      CLIENTE, conexaoDeDrive(),
      [material({ papel: "produto", papelConfirmadoEm: null })],
      [], [], SEM_FALHA,
    );
    expect(r.drive.declarados).toEqual(medido(0));
  });

  it("material de OUTRO cliente não entra na conta deste", () => {
    const r = retratoDeUmCliente(
      CLIENTE, conexaoDeDrive(),
      [material(), material({ clientId: "c2", nome: "outro.png" })],
      [], [], SEM_FALHA,
    );
    expect(r.drive.escolhidos).toEqual(medido(1));
  });
});

// ─── Resposta automática: o padrão é DESLIGADO ──────────────────────────────

describe("consentimento de resposta automática", () => {
  const local = (autoReplyConsentAt: Date | null) => ({
    id: "g1", title: "Padaria do João", locationName: "locations/1",
    status: "connected", autoReplyConsentAt, reviewsSyncedAt: new Date("2026-08-08"),
  });

  it("sem consentimento, a tela recebe null — e a tela escreve 'DESLIGADA'", () => {
    const r = retratoDeUmCliente(CLIENTE, null, [], [local(null)], [], SEM_FALHA);
    expect(r.perfil.locais[0]!.respostaAutomaticaAutorizadaEm).toBeNull();
  });

  it("com consentimento, a DATA sobe — não um booleano", () => {
    // Data e não `true`: "quem autorizou e quando" é o que a política do Google
    // exige provar, e um booleano perde exatamente isso.
    const quando = new Date("2026-08-01T12:00:00Z");
    const r = retratoDeUmCliente(CLIENTE, null, [], [local(quando)], [], SEM_FALHA);
    expect(r.perfil.locais[0]!.respostaAutomaticaAutorizadaEm).toBe(quando.toISOString());
  });
});

// ─── Credenciais: presença, nunca valor ─────────────────────────────────────

describe("credenciais do Google", () => {
  it("nenhum VALOR de credencial sai da função — só se existe", () => {
    const env = {
      GOOGLE_CLIENT_ID: "123.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "GOCSPX-segredo-de-verdade",
      GOOGLE_PICKER_API_KEY: "AIzaSy-chave",
      GOOGLE_PROJECT_NUMBER: "87784856270",
    } as unknown as NodeJS.ProcessEnv;

    const serializado = JSON.stringify(credenciaisDoGoogle(env));
    // Tela de admin que imprime o segredo é vazamento por screenshot.
    expect(serializado).not.toContain("GOCSPX-segredo-de-verdade");
    expect(serializado).not.toContain("AIzaSy-chave");
    expect(serializado).not.toContain("87784856270");
    expect(credenciaisDoGoogle(env).every((c) => c.presente)).toBe(true);
  });

  it("credencial ausente vem com a CONSEQUÊNCIA, não só com o nome", () => {
    const faltando = credenciaisDoGoogle({} as NodeJS.ProcessEnv);
    expect(faltando.every((c) => !c.presente)).toBe(true);
    // "GOOGLE_PICKER_API_KEY ausente" não diz nada a quem lê o painel. A frase
    // tem que dizer o que PARA de funcionar.
    for (const c of faltando) expect(c.semEla.length).toBeGreaterThan(20);
  });

  it("string vazia e espaço em branco contam como AUSENTE", () => {
    const env = { GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "   " } as unknown as NodeJS.ProcessEnv;
    const r = credenciaisDoGoogle(env);
    expect(r.find((c) => c.chave === "GOOGLE_CLIENT_ID")!.presente).toBe(false);
    expect(r.find((c) => c.chave === "GOOGLE_CLIENT_SECRET")!.presente).toBe(false);
  });
});

// ─── A trava de plataforma vale para o admin também ─────────────────────────

describe("a tela do Google no admin é SÓ LEITURA", () => {
  const raizDoRepo = path.resolve(__dirname, "..", "..");
  const rota = path.join(raizDoRepo, "app/api/agency/google/route.ts");
  const pagina = path.join(raizDoRepo, "app/agency/google/page.tsx");

  it("a rota não exporta POST, PUT, PATCH nem DELETE", () => {
    const fonte = fs.readFileSync(rota, "utf8");
    // Toda escrita que esta tela poderia querer é escrita NO GOOGLE, e a regra
    // de 03/08/2026 exige parecer prévio do especialista `google`. Não há
    // parecer para nenhuma delas. Um POST aqui seria a trava contornada pelo
    // próprio PM que deve fazê-la cumprir.
    for (const verbo of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(fonte).not.toMatch(new RegExp(`export\\s+(async\\s+)?function\\s+${verbo}\\b`));
    }
    expect(fonte).toMatch(/export\s+async\s+function\s+GET\b/);
  });

  it("a rota é fechada a master e project_manager NO SERVIDOR", () => {
    const fonte = fs.readFileSync(rota, "utf8");
    // Menu escondido é sugestão; rota fechada é trava.
    expect(fonte).toMatch(/requireSession\(\[\s*"master"\s*,\s*"project_manager"\s*\]\)/);
  });

  it("nem a rota nem a camada de leitura falam com o Google", () => {
    // Uma tela de admin que consulta a plataforma a cada render é rajada de GET
    // por F5 — a assinatura do que restringiu a conta da agência na Meta.
    for (const arquivo of [rota, path.join(raizDoRepo, "lib/agency/google/retrato.ts")]) {
      const fonte = fs.readFileSync(arquivo, "utf8");
      expect(fonte).not.toMatch(/googleapis\.com/);
      expect(fonte).not.toMatch(/\bfetch\s*\(/);
    }
  });

  it("a página não chama nenhum endpoint de escrita", () => {
    const fonte = fs.readFileSync(pagina, "utf8");
    expect(fonte).not.toMatch(/method:\s*["'](POST|PUT|PATCH|DELETE)["']/);
  });

  it("metade 2 — a varredura ENCONTRA os arquivos (não passa por vazio)", () => {
    // Uma varredura que quebra e acha zero fica verde para sempre. Este é o
    // caso limpo com dente.
    expect(fs.readFileSync(rota, "utf8").length).toBeGreaterThan(500);
    expect(fs.readFileSync(pagina, "utf8").length).toBeGreaterThan(2000);
  });
});

// ─── A tela não pode escrever zero na palavra ───────────────────────────────

describe("a tela distingue 'não medido' de zero na PALAVRA, não só no dado", () => {
  it("a página tem o texto 'não medido' e não formata nao_medido como número", () => {
    const fonte = fs.readFileSync(
      path.resolve(__dirname, "..", "..", "app/agency/google/page.tsx"),
      "utf8",
    );
    expect(fonte).toContain("não medido");
    // A guarda precisa vir ANTES do render do número, senão `c.valor` seria
    // `undefined` e a tela mostraria vazio — que o olho lê como zero.
    const posGuarda = fonte.indexOf('c.estado === "nao_medido"');
    const posValor = fonte.indexOf("{c.valor}");
    expect(posGuarda).toBeGreaterThan(-1);
    expect(posValor).toBeGreaterThan(posGuarda);
  });
});

describe("helpers de contagem", () => {
  it("medido e naoMedido produzem formas distinguíveis", () => {
    expect(medido(0)).toEqual({ estado: "medido", valor: 0 });
    expect(naoMedido("x")).toEqual({ estado: "nao_medido", motivo: "x" });
  });
});
