// ─── A TERCEIRA PORTA DO RADAR: A CAIXA DA AGÊNCIA LIDA POR IMAP ─────────────
//
// Toda trava aqui tem as DUAS METADES: prova que barra o problema plantado E
// prova que não inventa problema no caso limpo. Trava que só tem a primeira
// metade é desligada por quem não sabe o que ela protege.
//
// ── O QUE ESTE ARQUIVO NÃO CONSEGUE PROVAR, E ESTÁ DECLARADO ────────────────
// **Que o cliente IMAP fala com o Gmail de verdade.** A porta 993 não sai deste
// ambiente (a saída de rede só passa por HTTPS via proxy), então o protocolo é
// exercitado contra uma caixa de mentira. É por isso que existe
// `POST /api/agency/oportunidades/caixa/testar`: a prova de conexão roda EM
// PRODUÇÃO, onde a rotina roda, e não aqui. O que este arquivo prova é tudo o
// que vem DEPOIS de a mensagem chegar — que é onde moram a idempotência, o
// filtro de remetente e a qualificação.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const db = vi.hoisted(() => ({
  dbIntegrationConfig: { findUnique: vi.fn(), findMany: vi.fn(), upsert: vi.fn(), updateMany: vi.fn() },
  emailDoRadar: { findUnique: vi.fn(), create: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() },
  oportunidade: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  agencyWorkspace: { findFirst: vi.fn(), findMany: vi.fn() },
}));
const qualificarEGravar = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ prisma: db }));
// A QUALIFICAÇÃO é espionada, não reimplementada: o que se prova aqui é que a
// varredura chama A MESMA função da porta de colar. `oportunidade.ts` NÃO é
// mockado — extração e dedup rodam de verdade, contra o banco de mentira.
vi.mock("@/lib/agency/comercial/pipeline", () => ({ qualificarEGravar, lerOportunidade: vi.fn() }));

import {
  chaveDaMensagem,
  contarAlertasNaCaixa,
  remetenteConfere,
  varrerCaixa,
} from "@/lib/agency/comercial/caixa-de-entrada/varredura";
import {
  dicaDeSenhaDeApp,
  estadoDaCaixa,
  guardarCredencial,
  normalizarSenhaDeApp,
  workspacesComCaixa,
} from "@/lib/agency/comercial/caixa-de-entrada/cofre";
import { daMensagemDoServidor, type LeitorDeCaixa, type MensagemDaCaixa } from "@/lib/agency/comercial/caixa-de-entrada/leitor";
import { decodificarPalavras, enderecoDe, textoDaMensagem } from "@/lib/agency/comercial/caixa-de-entrada/mime";
import { encryptSecret } from "@/lib/security/crypto";

const WS = "ws-dioli";
const RAIZ = resolve(__dirname, "../..");
const fonte = (p: string) => readFileSync(resolve(RAIZ, p), "utf8");

// ── A caixa de mentira ───────────────────────────────────────────────────────

function caixaCom(mensagens: MensagemDaCaixa[]) {
  const leitor: LeitorDeCaixa & { marcadas: number[]; buscas: number; fechou: number } = {
    marcadas: [],
    buscas: 0,
    fechou: 0,
    testar: async () => ({ ok: true, mensagem: "ok" }),
    contar: async () => ({ total: mensagens.length, porRemetente: {} }),
    buscar: async () => {
      leitor.buscas++;
      return mensagens;
    },
    marcarComoLido: async (uids) => {
      leitor.marcadas.push(...uids);
    },
    fechar: async () => {
      leitor.fechou++;
    },
  };
  return leitor;
}

function alerta(over: Partial<MensagemDaCaixa> = {}): MensagemDaCaixa {
  return {
    uid: 101,
    mensagemId: "<alerta-1@99freelas.com.br>",
    remetente: "naoresponda@99freelas.com.br",
    assunto: "Novo projeto: gestão de tráfego para e-commerce",
    data: new Date("2026-08-08T10:00:00Z"),
    texto:
      "Um novo projeto compatível com seu perfil foi publicado.\n" +
      "Descrição: preciso de gestão de tráfego pago no Meta Ads para um e-commerce de moda.\n" +
      "Orçamento: R$ 2.500\nPrazo: 30 dias\n" +
      "https://www.99freelas.com.br/project/12345-gestao-de-trafego",
    ...over,
  };
}

/** A credencial no cofre, cifrada como a casa cifra de verdade. */
function credencialNoCofre(over: Record<string, unknown> = {}) {
  return {
    workspaceId: WS,
    integrationId: "radar-gmail-imap",
    configured: true,
    accountId: "agenciadioli@gmail.com",
    apiKeyEncrypted: encryptSecret("abcdefghijklmnop"),
    apiKeyHint: "abc…mnop",
    folder: "@99freelas.com.br",
    configWorkspace: "nao-tocar",
    lastTestStatus: "not_run",
    lastTestAt: null,
    lastTestMessage: null,
    lastConfiguredAt: new Date(),
    ...over,
  };
}

const AMBIENTE = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  // A credencial de ambiente vence o cofre — e ela NÃO pode vazar de um teste
  // para o outro, senão metade das provas de "porta fechada" ficariam verdes
  // por engano.
  delete process.env.RADAR_GMAIL_USER;
  delete process.env.RADAR_GMAIL_APP_PASSWORD;
  delete process.env.RADAR_GMAIL_WORKSPACE;
  delete process.env.RADAR_GMAIL_REMETENTES;
  delete process.env.RADAR_GMAIL_MARCAR_LIDO;

  db.dbIntegrationConfig.findUnique.mockResolvedValue(credencialNoCofre());
  db.dbIntegrationConfig.findMany.mockResolvedValue([{ workspaceId: WS }]);
  db.dbIntegrationConfig.upsert.mockResolvedValue({});
  db.dbIntegrationConfig.updateMany.mockResolvedValue({});
  db.emailDoRadar.findUnique.mockResolvedValue(null);
  db.emailDoRadar.create.mockResolvedValue({});
  db.oportunidade.findUnique.mockResolvedValue(null);
  db.oportunidade.findFirst.mockResolvedValue(null);
  db.oportunidade.findMany.mockResolvedValue([]);
  db.oportunidade.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "op-1",
    ...data,
  }));
  db.oportunidade.update.mockResolvedValue({});
  db.agencyWorkspace.findFirst.mockResolvedValue({ id: WS });
  db.agencyWorkspace.findMany.mockResolvedValue([{ id: WS }]);
  qualificarEGravar.mockResolvedValue({ gravou: true, motivo: "Qualificada e aprovada pelo Compliance Validator." });
});

afterEach(() => {
  process.env = { ...AMBIENTE };
});

// ═══════════════════════════════════════════════════════════════════════════
// METADE 1 — COM CREDENCIAL E UM ALERTA NA CAIXA
// ═══════════════════════════════════════════════════════════════════════════

describe("com credencial e um alerta na caixa: vira oportunidade QUALIFICADA, uma vez só", () => {
  it("o alerta vira oportunidade e passa pela MESMA qualificação da porta de colar", async () => {
    const caixa = caixaCom([alerta()]);
    const r = await varrerCaixa(WS, { fabricaDeLeitor: () => caixa });

    expect(r.rodou).toBe(true);
    expect(r.novas).toBe(1);
    expect(db.oportunidade.create).toHaveBeenCalledTimes(1);

    // A qualificação NÃO é opcional: sem ela a oportunidade nasce sem nota, e a
    // fila ordena por nota — ela iria para o rodapé e ninguém a pegaria. Foi
    // exatamente o que aconteceu com a porta do encaminhamento por meses.
    expect(qualificarEGravar).toHaveBeenCalledTimes(1);
    expect(qualificarEGravar.mock.calls[0]![0]).toMatchObject({ id: "op-1", workspaceId: WS });
    expect(r.qualificadas).toBe(1);
  });

  it("a extração é a MESMA — orçamento, prazo e plataforma saem sem IA nenhuma", async () => {
    const caixa = caixaCom([alerta()]);
    await varrerCaixa(WS, { fabricaDeLeitor: () => caixa });

    const gravado = db.oportunidade.create.mock.calls[0]![0].data;
    expect(gravado.plataforma, "a plataforma sai do REMETENTE, não do corpo").toBe("99freelas");
    expect(gravado.orcamentoInformado).toBe(2500);
    expect(gravado.prazoInformado).toContain("30 dias");
    expect(gravado.titulo).toContain("gestão de tráfego");
    expect(gravado.urlExterna).toContain("99freelas.com.br/project/12345");
  });

  it("a mensagem fica no livro DEPOIS da oportunidade, com o resultado e o motivo", async () => {
    const caixa = caixaCom([alerta()]);
    await varrerCaixa(WS, { fabricaDeLeitor: () => caixa });

    const linha = db.emailDoRadar.create.mock.calls[0]![0].data;
    expect(linha.mensagemId).toBe("<alerta-1@99freelas.com.br>");
    expect(linha.resultado).toBe("oportunidade");
    expect(linha.oportunidadeId).toBe("op-1");
    expect(linha.motivo, "mensagem sem motivo é mensagem perdida").toBeTruthy();

    // A ORDEM é o mecanismo da idempotência: um processo que morra entre as
    // duas relê a mensagem e é barrado pela impressão digital. A ordem inversa
    // PERDERIA a oportunidade em silêncio.
    const ordemOportunidade = db.oportunidade.create.mock.invocationCallOrder[0]!;
    const ordemLivro = db.emailDoRadar.create.mock.invocationCallOrder[0]!;
    expect(ordemOportunidade).toBeLessThan(ordemLivro);
  });

  it("RELER a mesma mensagem NÃO cria a segunda oportunidade — camada 1, o Message-ID", async () => {
    // A segunda rodada acha a mensagem no livro.
    db.emailDoRadar.findUnique.mockResolvedValue({ id: "e1" });
    const caixa = caixaCom([alerta()]);
    const r = await varrerCaixa(WS, { fabricaDeLeitor: () => caixa });

    expect(r.jaConhecidas).toBe(1);
    expect(r.novas).toBe(0);
    expect(db.oportunidade.create).not.toHaveBeenCalled();
    // E não gasta IA de novo. Reprocessar a cada 5 minutos seria dinheiro
    // queimado além de linha duplicada.
    expect(qualificarEGravar).not.toHaveBeenCalled();
  });

  it("mensagem NOVA cujo texto já existe NÃO duplica — camada 2, a impressão digital", async () => {
    // Message-ID diferente (reenvio da plataforma, ou o mesmo projeto por outra
    // porta), texto igual: a dedup de dentro pega.
    db.oportunidade.findUnique.mockResolvedValue({ id: "op-ja", titulo: "x", plataforma: "99freelas" });
    const caixa = caixaCom([alerta({ mensagemId: "<outro@99freelas.com.br>" })]);
    const r = await varrerCaixa(WS, { fabricaDeLeitor: () => caixa });

    expect(r.duplicadas).toBe(1);
    expect(r.novas).toBe(0);
    expect(db.oportunidade.create).not.toHaveBeenCalled();
    expect(db.emailDoRadar.create.mock.calls[0]![0].data.resultado).toBe("duplicada");
  });

  it("mensagem SEM Message-ID ganha chave própria — e duas delas não colidem", () => {
    const a = chaveDaMensagem(alerta({ mensagemId: null }));
    const b = chaveDaMensagem(alerta({ mensagemId: null, assunto: "Outro projeto", texto: "outro corpo aqui" }));
    expect(a).toMatch(/^sem-message-id:/);
    expect(a, "chave vazia engoliria todos os alertas sem Message-ID").not.toBe("");
    expect(a).not.toBe(b);
    // Estável: a mesma mensagem produz a mesma chave em outra rodada.
    expect(chaveDaMensagem(alerta({ mensagemId: null }))).toBe(a);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// METADE 2 — SEM CREDENCIAL, OU COM CREDENCIAL RECUSADA
// ═══════════════════════════════════════════════════════════════════════════

describe("sem credencial, ou com credencial recusada: NADA é gravado e a tela diz o que falta", () => {
  it("sem credencial a rotina nem tenta conectar, e o motivo é dito", async () => {
    db.dbIntegrationConfig.findUnique.mockResolvedValue(null);
    let abriuLeitor = false;
    const r = await varrerCaixa(WS, {
      fabricaDeLeitor: () => {
        abriuLeitor = true;
        return caixaCom([alerta()]);
      },
    });

    expect(r.rodou).toBe(false);
    expect(abriuLeitor, "sem credencial não se abre socket nenhum").toBe(false);
    expect(r.motivo).toMatch(/senha de aplicativo/i);
    expect(db.oportunidade.create).not.toHaveBeenCalled();
    expect(db.emailDoRadar.create).not.toHaveBeenCalled();
  });

  it("credencial recusada pelo servidor: nada é gravado e nenhuma oportunidade fantasma aparece", async () => {
    const caixa = caixaCom([alerta()]);
    caixa.buscar = async () => {
      throw new Error("Invalid credentials (Failure)");
    };
    const r = await varrerCaixa(WS, { fabricaDeLeitor: () => caixa });

    expect(r.rodou).toBe(false);
    expect(r.motivo).toContain("Invalid credentials");
    expect(r.novas).toBe(0);
    expect(db.oportunidade.create).not.toHaveBeenCalled();
    expect(db.emailDoRadar.create).not.toHaveBeenCalled();
    expect(caixa.fechou, "o socket é fechado mesmo quando a busca quebra").toBeGreaterThan(0);
  });

  it("senha guardada que não decifra vira motivo próprio, nunca 'não configurada'", async () => {
    db.dbIntegrationConfig.findUnique.mockResolvedValue(credencialNoCofre({ apiKeyEncrypted: "lixo:nao:abre" }));
    const r = await varrerCaixa(WS, { fabricaDeLeitor: () => caixaCom([alerta()]) });
    expect(r.rodou).toBe(false);
    expect(r.motivo).toMatch(/decifrada/i);
  });

  it("a contagem de volume NÃO devolve zero quando falha — zero mataria o canal por engano", async () => {
    const caixa = caixaCom([]);
    caixa.contar = async () => {
      throw new Error("sem rede");
    };
    const r = await contarAlertasNaCaixa(WS, { fabricaDeLeitor: () => caixa });
    expect(r.ok).toBe(false);
    expect(r.total, "'não consegui contar' e 'não há nenhum' são fatos opostos").toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// O FILTRO DE REMETENTE — a trava que o servidor NÃO faz por nós
// ═══════════════════════════════════════════════════════════════════════════

describe("o filtro de remetente é conferido AQUI, contra o endereço, não contra o cabeçalho", () => {
  it("BARRA quem só põe o domínio no NOME DE EXIBIÇÃO", async () => {
    // O `SEARCH FROM` do IMAP casa por substring no cabeçalho inteiro — este
    // e-mail PASSA pela busca do servidor. Se não houvesse conferência aqui, a
    // porta de entrada de oportunidade aceitaria texto de qualquer um do mundo.
    const caixa = caixaCom([
      alerta({ remetente: "atacante@dominio-qualquer.com", mensagemId: "<forjado@x.com>" }),
    ]);
    const r = await varrerCaixa(WS, { fabricaDeLeitor: () => caixa });

    expect(r.ignoradas).toBe(1);
    expect(r.novas).toBe(0);
    expect(db.oportunidade.create).not.toHaveBeenCalled();
    expect(db.emailDoRadar.create.mock.calls[0]![0].data.resultado).toBe("ignorada");
  });

  it("e NÃO barra o caso limpo — domínio, subdomínio e endereço exato passam", () => {
    expect(remetenteConfere("naoresponda@99freelas.com.br", ["@99freelas.com.br"])).toBe(true);
    expect(remetenteConfere("bot@mail.99freelas.com.br", ["@99freelas.com.br"])).toBe(true);
    expect(remetenteConfere("naoresponda@99freelas.com.br", ["naoresponda@99freelas.com.br"])).toBe(true);
  });

  it("não confunde domínio parecido nem sufixo colado", () => {
    expect(remetenteConfere("x@nao99freelas.com.br", ["@99freelas.com.br"])).toBe(false);
    expect(remetenteConfere("x@99freelas.com.br.evil.com", ["@99freelas.com.br"])).toBe(false);
    expect(remetenteConfere("", ["@99freelas.com.br"])).toBe(false);
    expect(remetenteConfere("outro@99freelas.com.br", ["naoresponda@99freelas.com.br"])).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// A CAIXA NÃO É TOCADA
// ═══════════════════════════════════════════════════════════════════════════

describe("a rotina não apaga, não move e só marca como lido quando mandam", () => {
  it("por padrão NÃO marca nada — a caixa fica como estava", async () => {
    const caixa = caixaCom([alerta()]);
    await varrerCaixa(WS, { fabricaDeLeitor: () => caixa });
    expect(caixa.marcadas).toEqual([]);
  });

  it("marca quando o CEO liga na tela, e só o que processou", async () => {
    db.dbIntegrationConfig.findUnique.mockResolvedValue(credencialNoCofre({ configWorkspace: "marcar-como-lido" }));
    const caixa = caixaCom([alerta()]);
    await varrerCaixa(WS, { fabricaDeLeitor: () => caixa });
    expect(caixa.marcadas).toEqual([101]);
  });

  it("não existe apagar, mover, copiar nem enviar em NENHUM arquivo desta frente", () => {
    const proibidos = ["messageDelete", "messageMove", "messageCopy", "\\Deleted", "append("];
    for (const arquivo of [
      "lib/agency/comercial/caixa-de-entrada/leitor.ts",
      "lib/agency/comercial/caixa-de-entrada/varredura.ts",
    ]) {
      const src = fonte(arquivo);
      for (const p of proibidos) {
        expect(src, `${arquivo} não pode conter ${p} — o alerta original é a prova de que a oportunidade existiu`)
          .not.toContain(p);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// O SEGREDO
// ═══════════════════════════════════════════════════════════════════════════

describe("a senha de aplicativo não vaza por tela, por log nem por resposta", () => {
  it("o log do protocolo IMAP está DESLIGADO — ele imprime o comando LOGIN", () => {
    const src = fonte("lib/agency/comercial/caixa-de-entrada/leitor.ts");
    expect(src, "o logger padrão do imapflow derrama a senha no console do Railway").toContain("logger: false");
  });

  it("o estado que vai para a tela não carrega a senha, só a dica", async () => {
    const e = await estadoDaCaixa(WS);
    const serializado = JSON.stringify(e);
    expect(serializado).not.toContain("abcdefghijklmnop");
    expect(e.dicaDaSenha).toBeTruthy();
    expect(e.configurada).toBe(true);
  });

  it("a rota de configuração não devolve o campo cifrado nem a senha", () => {
    const src = fonte("app/api/agency/oportunidades/caixa/route.ts");
    expect(src).not.toContain("apiKeyEncrypted:");
    expect(src).not.toMatch(/senha:\s*(cred|linha|estado)/);
  });

  it("a DICA é uma máscara, não um pedaço da senha", () => {
    const d = dicaDeSenhaDeApp("abcd efgh ijkl mnop");
    // `keyHint` entregaria "abc…mnop" — 7 de 16 caracteres de um alfabeto de 26.
    // Numa chave de API isso é irrelevante; numa senha de app é 44% do segredo
    // numa tela que vaza por screenshot.
    for (const pedaco of ["abcd", "mnop", "abc", "nop"]) expect(d).not.toContain(pedaco);
    expect(d, "a tela ainda precisa saber que existe uma guardada").toContain("16");
    expect(dicaDeSenhaDeApp("")).toBe("");
  });

  it("o que fica GRAVADO como dica também é máscara", async () => {
    await guardarCredencial({ workspaceId: WS, usuario: "agenciadioli@gmail.com", senha: "abcdefghijklmnop" });
    const criado = db.dbIntegrationConfig.upsert.mock.calls[0]![0].create;
    expect(criado.apiKeyHint).not.toContain("abc");
    expect(criado.apiKeyEncrypted, "a senha vai cifrada, nunca em claro").not.toContain("abcdefghijklmnop");
  });

  it("o teste de conexão tem TETO — cada clique é uma tentativa de login na conta da agência", () => {
    const src = fonte("app/api/agency/oportunidades/caixa/testar/route.ts");
    // Sem teto, um botão em looping com a senha errada faz o Google bloquear a
    // caixa da agência. Não é defesa contra atacante: a rota já exige `master`.
    expect(src).toContain("limiteExcedido");
    expect(src).toContain('session.role !== "master"');
  });

  it("o host é CONSTANTE — não vem de formulário", () => {
    const src = fonte("lib/agency/comercial/caixa-de-entrada/cofre.ts");
    expect(src).toContain('export const HOST_IMAP = "imap.gmail.com"');
    const rota = fonte("app/api/agency/oportunidades/caixa/route.ts");
    expect(rota, "host configurável vira um jeito de mandar a senha da agência para a máquina de quem pedir")
      .not.toMatch(/corpo\.host|body\.host/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// O QUE ENTRA NO COFRE
// ═══════════════════════════════════════════════════════════════════════════

describe("o cofre recusa a senha da conta e aceita a senha de app como o Google a mostra", () => {
  it("os espaços do 'abcd efgh ijkl mnop' caem — é como o Google a exibe", async () => {
    expect(normalizarSenhaDeApp("abcd efgh ijkl mnop")).toBe("abcdefghijklmnop");
    const r = await guardarCredencial({
      workspaceId: WS,
      usuario: "agenciadioli@gmail.com",
      senha: "abcd efgh ijkl mnop",
    });
    expect(r.ok, "recusar a senha certa por causa de espaço é a pior falha desta tela").toBe(true);
    expect(db.dbIntegrationConfig.upsert).toHaveBeenCalledTimes(1);
  });

  it("a senha da CONTA é recusada, com o motivo escrito", async () => {
    const r = await guardarCredencial({ workspaceId: WS, usuario: "agenciadioli@gmail.com", senha: "MinhaSenha123!" });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.erro).toMatch(/senha de aplicativo/i);
    expect(db.dbIntegrationConfig.upsert, "nada é guardado quando a forma não bate").not.toHaveBeenCalled();
  });

  it("guardar de novo derruba o resultado do teste anterior", async () => {
    await guardarCredencial({ workspaceId: WS, usuario: "agenciadioli@gmail.com", senha: "abcdefghijklmnop" });
    const update = db.dbIntegrationConfig.upsert.mock.calls[0]![0].update;
    expect(update.lastTestStatus, "'conectado' sobre uma credencial nunca provada é mentira na tela").toBe("not_run");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AMBIENTE PRIMEIRO, COFRE DEPOIS
// ═══════════════════════════════════════════════════════════════════════════

describe("a precedência é ambiente → cofre, como no resto da casa", () => {
  it("com RADAR_GMAIL_* no ambiente, é ela que vale — mesmo sem linha no banco", async () => {
    db.dbIntegrationConfig.findUnique.mockResolvedValue(null);
    db.dbIntegrationConfig.findMany.mockResolvedValue([]);
    process.env.RADAR_GMAIL_USER = "agenciadioli@gmail.com";
    process.env.RADAR_GMAIL_APP_PASSWORD = "abcd efgh ijkl mnop";

    const e = await estadoDaCaixa(WS);
    expect(e.configurada).toBe(true);
    expect(e.origem).toBe("ambiente");
    expect(e.motivo).toBeNull();

    const alvos = await workspacesComCaixa();
    expect(alvos.alvos, "com um único workspace, a caixa do ambiente é dele").toEqual([WS]);
    expect(alvos.impedidos).toEqual([]);
  });

  it("meia configuração NÃO é configuração", async () => {
    db.dbIntegrationConfig.findUnique.mockResolvedValue(null);
    process.env.RADAR_GMAIL_USER = "agenciadioli@gmail.com";
    const e = await estadoDaCaixa(WS);
    expect(e.configurada).toBe(false);
  });

  it("com dois workspaces e sem RADAR_GMAIL_WORKSPACE, a porta fica FECHADA e diz por quê", async () => {
    db.dbIntegrationConfig.findMany.mockResolvedValue([]);
    db.agencyWorkspace.findMany.mockResolvedValue([{ id: "ws-a" }, { id: "ws-b" }]);
    process.env.RADAR_GMAIL_USER = "agenciadioli@gmail.com";
    process.env.RADAR_GMAIL_APP_PASSWORD = "abcdefghijklmnop";

    const r = await workspacesComCaixa();
    expect(r.alvos, "cair no primeiro workspace entrega o dado do cliente no inquilino errado").toEqual([]);
    expect(r.impedidos).toHaveLength(1);
    expect(r.impedidos[0]).toMatch(/RADAR_GMAIL_WORKSPACE/);
  });

  it("os AJUSTES seguem a ordem inversa: o painel manda no filtro de remetente", async () => {
    process.env.RADAR_GMAIL_USER = "agenciadioli@gmail.com";
    process.env.RADAR_GMAIL_APP_PASSWORD = "abcdefghijklmnop";
    process.env.RADAR_GMAIL_REMETENTES = "@do-ambiente.com";
    db.dbIntegrationConfig.findUnique.mockResolvedValue(credencialNoCofre({ folder: "alertas@99freelas.com.br" }));

    const e = await estadoDaCaixa(WS);
    // O remetente exato não foi confirmado contra alerta real: quem descobrir o
    // valor certo tem que poder corrigi-lo sem redeploy.
    expect(e.remetentes).toEqual(["alertas@99freelas.com.br"]);
    expect(e.origem).toBe("ambiente");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// A LEITURA DA MENSAGEM CRUA — a parte que dá para provar sem rede
// ═══════════════════════════════════════════════════════════════════════════

const MULTIPART = [
  "From: 99Freelas <naoresponda@99freelas.com.br>",
  "Subject: =?UTF-8?Q?Novo_projeto:_gest=C3=A3o_de_tr=C3=A1fego?=",
  "Message-ID: <abc123@99freelas.com.br>",
  'Content-Type: multipart/alternative; boundary="LIMITE"',
  "",
  "Este trecho é o preâmbulo e não é parte nenhuma.",
  "--LIMITE",
  "Content-Type: text/plain; charset=UTF-8",
  "Content-Transfer-Encoding: quoted-printable",
  "",
  "Or=C3=A7amento: R$ 2.500 para gest=C3=A3o de tr=C3=A1=",
  "fego.",
  "--LIMITE",
  "Content-Type: text/html; charset=UTF-8",
  "",
  "<html><body><p>Or&ccedil;amento</p></body></html>",
  "--LIMITE--",
].join("\r\n");

describe("a mensagem crua vira texto legível — e é isso que a extração recebe", () => {
  it("prefere text/plain, desfaz quoted-printable e emenda a linha quebrada", () => {
    const { texto, html } = textoDaMensagem(MULTIPART);
    expect(html).toBe(false);
    expect(texto).toContain("Orçamento: R$ 2.500");
    // A quebra suave (`=` no fim da linha) não é quebra de verdade: quem não a
    // desfizer parte a palavra "tráfego" em duas e a extração perde o sentido.
    expect(texto).toContain("tráfego");
    expect(texto, "o preâmbulo não é parte da mensagem").not.toContain("preâmbulo");
  });

  it("cai no HTML quando não existe parte de texto — recusar seria perder a oportunidade pelo formato", () => {
    const soHtml = [
      "Content-Type: text/html; charset=UTF-8",
      "",
      "<p>Projeto novo</p><p>Or&ccedil;amento: R$ 900</p>",
    ].join("\r\n");
    const { texto, html } = textoDaMensagem(soHtml);
    expect(html).toBe(true);
    expect(texto).toContain("Projeto novo");
    expect(texto).toContain("R$ 900");
    expect(texto).not.toContain("<p>");
  });

  it("base64 e latin-1 também abrem", () => {
    const b64 = [
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from("Orçamento: R$ 1.200", "utf8").toString("base64"),
    ].join("\r\n");
    expect(textoDaMensagem(b64).texto).toContain("Orçamento: R$ 1.200");

    const latin = [
      "Content-Type: text/plain; charset=ISO-8859-1",
      "",
      Buffer.from("Orçamento", "latin1").toString("binary"),
    ].join("\r\n");
    expect(textoDaMensagem(latin).texto).toContain("Orçamento");
  });

  it("o assunto codificado é desembrulhado — é ele que vira o título do projeto", () => {
    expect(decodificarPalavras("=?UTF-8?Q?Novo_projeto:_gest=C3=A3o_de_tr=C3=A1fego?=")).toBe(
      "Novo projeto: gestão de tráfego",
    );
    expect(decodificarPalavras("=?UTF-8?B?" + Buffer.from("Projeto", "utf8").toString("base64") + "?=")).toBe("Projeto");
    // O caso limpo: texto sem codificação volta idêntico.
    expect(decodificarPalavras("Novo projeto de design")).toBe("Novo projeto de design");
  });

  it("o remetente sai do ENVELOPE, nunca do corpo — o corpo é escrito por um desconhecido", () => {
    expect(enderecoDe("99Freelas <naoresponda@99freelas.com.br>")).toBe("naoresponda@99freelas.com.br");
    expect(enderecoDe("NAORESPONDA@99Freelas.com.BR")).toBe("naoresponda@99freelas.com.br");
    expect(enderecoDe(null)).toBe("");

    const m = daMensagemDoServidor({
      uid: 7,
      envelope: {
        messageId: "<x@y>",
        subject: "Assunto",
        from: [{ address: "NaoResponda@99Freelas.com.br", name: "99Freelas" }],
      },
      source: Buffer.from(MULTIPART, "binary"),
    });
    expect(m.remetente).toBe("naoresponda@99freelas.com.br");
    expect(m.texto).toContain("Orçamento");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// NÃO EXISTE UM SEGUNDO CAMINHO DE QUALIFICAÇÃO
// ═══════════════════════════════════════════════════════════════════════════

describe("a porta nova usa as MESMAS funções — nenhuma regra foi copiada", () => {
  it("a varredura importa `qualificarEGravar` e `registrarOportunidade`, e não reimplementa nada", () => {
    const src = fonte("lib/agency/comercial/caixa-de-entrada/varredura.ts");
    expect(src).toContain('from "@/lib/agency/comercial/pipeline"');
    expect(src).toContain("qualificarEGravar");
    expect(src).toContain("registrarOportunidade");
    // Os sinais de uma segunda cópia da regra: chamar a IA por conta própria ou
    // montar o Compliance Validator aqui. Duas cópias da mesma regra é o defeito
    // que quebrou o portal em 07/08.
    expect(src).not.toContain("@/lib/ai/generate");
    expect(src).not.toContain("validarConformidade");
    expect(src).not.toContain("prisma.oportunidade.create");
  });

  it("a porta antiga do encaminhamento CONTINUA existindo — o IMAP é adição, não troca", () => {
    const rota = fonte("app/api/agency/oportunidades/email/route.ts");
    expect(rota).toContain("RADAR_EMAIL_SECRET");
    expect(rota).toContain("qualificarEGravar");
  });
});
