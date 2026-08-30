// ═══ A JORNADA PONTA A PONTA — o critério de conclusão da V1 ═══════════════
//
// O CEO escreveu, e é literal:
//
//   "A V1 só está concluída quando uma jornada homologada provar:
//    PROJETO ENCONTRADO → QUALIFICAÇÃO → ABORDAGEM SEGURA → RESPOSTA →
//    BRIEFING INTERNO → PROPOSTA → CONTRATAÇÃO REPRESENTADA → ARQUIVO RECEBIDO
//    → PRODUÇÃO REPRESENTADA → ARQUIVO ENTREGUE → AUDITORIA COMPLETA."
//
// E também: "Não é necessário contratar cliente real. A homologação pode usar
// dados controlados e operação supervisionada, sem spam e sem pagamento real."
//
// ── O QUE ESTE ARQUIVO FAZ DE DIFERENTE DO SIMULADOR ──────────────────────
// O simulador (`simulador.test.ts`) percorre as DECISÕES em memória. Aqui a
// jornada atravessa o BANCO DE VERDADE: funil e trilha gravados, trava de
// conversa disputada, arquivo do cliente registrado com checksum e quarentena,
// arquivo da casa aprovado e enviado, e o executor planejando e registrando com
// evidência. É a diferença entre "o cérebro decide certo" e "as peças se
// encaixam quando ligadas".
//
// ⚠️ O QUE ELE CONTINUA NÃO PROVANDO, e está aqui para ninguém ler errado:
// que a casa opera o 99Freelas. Não há navegador, login nem rede. O executor é
// plano + registro por construção (decisão 1 do CEO), então "arquivo entregue"
// significa **aprovado, endereçado ao cliente certo e registrado**, não
// "anexado no site". Chamar isto de operação seria descrever intenção como
// entrega.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "@/lib/generated/prisma/client";

const estado = vi.hoisted(() => ({ prisma: null as unknown as PrismaClient }));
vi.mock("@/lib/db/client", () => ({
  get prisma() {
    return estado.prisma;
  },
}));

let pasta = "";
let arquivo = "";

/**
 * Sobe o esquema REAL, pelas migrations da casa — não por um DDL escrito à mão
 * neste arquivo.
 *
 * A diferença importa: um DDL colado aqui envelheceria em silêncio e a jornada
 * passaria a rodar contra um esquema que não é o de produção. Rodando
 * `migrate deploy`, esta prova também vira uma prova de que as migrations
 * aplicam do zero.
 */
function subirEsquema(dbPath: string) {
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
    stdio: "pipe",
  });
}

beforeEach(async () => {
  pasta = await mkdtemp(path.join(tmpdir(), "jornada-"));
  arquivo = path.join(pasta, "j.db");
  subirEsquema(arquivo);
  estado.prisma = new PrismaClient({ adapter: new PrismaLibSql({ url: `file:${arquivo}` }) });
}, 120_000);

afterEach(async () => {
  await estado.prisma?.$disconnect().catch(() => {});
  await rm(pasta, { recursive: true, force: true });
});

const W = "ws-jornada";
const OP = "op-jornada-1";
const AGORA = new Date("2026-08-30T12:00:00Z");

const GERENTE = {
  autoridade: "department_member" as const,
  departamentos: ["client-service-sdr" as const],
  papelDeclaradoNaCelula: "gerente_de_atendimento",
};

describe("═══ A JORNADA PONTA A PONTA, com dados controlados e banco real ═══", () => {
  it("percorre as 11 etapas do CEO e deixa auditoria completa", async () => {
    const { avancarFunil, estadoDoFunil, trilhaDoFunil } = await import("@/lib/agency/celula/trilha");
    const { portaDaConversaNoBanco, gravarEstadoDaConversa } = await import(
      "@/lib/agency/celula/mensagens/porta-da-conversa-no-banco"
    );
    const { registrarArquivoDoCliente, registrarArquivoParaCliente, aprovarParaEnvio, enviarAoCliente } =
      await import("@/lib/agency/celula/ponte/armazem");
    const { avaliarServico } = await import("@/lib/agency/celula/catalogo-ofertavel");
    const { avaliarSaidaDoCanal } = await import("@/lib/agency/celula/saida-do-canal");
    const { planejarAcao, registrarExecucao } = await import("@/lib/agency/celula/executor");
    const { podeNaCelula } = await import("@/lib/agency/celula/papeis");

    const avancar = async (para: string, justificativa: string) => {
      const r = await avancarFunil({
        workspaceId: W,
        oportunidadeId: OP,
        para,
        autor: "sdr-99freelas",
        origem: "agente",
        justificativa,
      });
      expect(r.ok, `falhou ao ir para ${para}: ${r.ok ? "" : r.motivo}`).toBe(true);
      return r;
    };

    // ── 1. PROJETO ENCONTRADO ────────────────────────────────────────────
    expect(await estadoDoFunil(OP)).toBe("encontrada");

    // ── 2. QUALIFICAÇÃO ──────────────────────────────────────────────────
    await avancar("qualificada", "nota 82 — social media para negócio local, orçamento declarado");

    // ── 3. ABORDAGEM SEGURA ──────────────────────────────────────────────
    // Segura = o Guardião barra o que não pode sair, e a abordagem espera o
    // aceite humano do modo supervisionado.
    const contatoAntesDaGarantia = avaliarSaidaDoCanal({
      escopo: "dado_de_contato",
      garantia: "nao_confirmada",
      consentimento: null,
    });
    expect(contatoAntesDaGarantia.pode, "contato antes da garantia tem de ser barrado").toBe(false);

    await avancar("abordagem_preparada", "M01 preenchido com elemento verdadeiro do anúncio");
    await avancar("aguardando_autorizacao", "modo supervisionado: o envio espera o gerente");
    expect(podeNaCelula(GERENTE, "autorizar_envio").pode).toBe(true);
    await avancar("abordada", "gerente autorizou; mensagem enviada dentro do 99Freelas");

    // ── 4. RESPOSTA ──────────────────────────────────────────────────────
    const porta = portaDaConversaNoBanco(estado.prisma, () => AGORA);
    const conversaId = `conv-${OP}`;
    expect(
      await porta.reservar({
        conversaId,
        agente: "sdr-99freelas",
        expiraEm: new Date(AGORA.getTime() + 300_000).toISOString(),
      }),
      "o SDR precisa conseguir a trava da conversa",
    ).toBe(true);
    // ...e ninguém mais responde ao mesmo tempo.
    expect(
      await porta.reservar({
        conversaId,
        agente: "outro-agente",
        expiraEm: new Date(AGORA.getTime() + 300_000).toISOString(),
      }),
    ).toBe(false);

    await avancar("respondeu", "cliente respondeu no chat da plataforma");

    // ── 5. BRIEFING INTERNO ──────────────────────────────────────────────
    await avancar("briefing_em_coleta", "M02: faltam formato e identidade visual");
    await gravarEstadoDaConversa(
      {
        workspaceId: W,
        estado: {
          conversaId,
          ultimaRecebida: { em: AGORA.toISOString(), texto: "preciso de 12 posts, tenho o logo" },
          ultimaEnviada: null,
          agenteResponsavel: "sdr-99freelas",
          etapa: "briefing_em_coleta",
          perguntasJaFeitas: ["quantidade", "formato", "identidade_visual"],
          respostasRecebidas: { quantidade: "12", formato: "feed e story", identidade_visual: "logo em png" },
          arquivos: [],
          proximaAcao: "confirmar prazo",
          modelosJaUsados: ["M01", "M02"],
        },
      },
      estado.prisma,
    );
    await avancar("briefing_completo", "necessidade, entregáveis, quantidade, formato e prazo confirmados");

    // ── 6. PROPOSTA ──────────────────────────────────────────────────────
    // Só entra na proposta o que a casa comprovadamente produz (decisão 5).
    expect(avaliarServico("social-media-pecas", { modoAutomatico: true }).ofertavel).toBe(true);
    expect(avaliarServico("site-institucional", { modoAutomatico: true }).ofertavel).toBe(false);

    await avancar("proposta_preparada", "escopo 12 peças; preço do motor oficial");
    await avancar("proposta_enviada", "M07 enviado dentro do 99Freelas");
    await avancar("negociacao", "cliente pediu ajuste de prazo");

    // ── 7. CONTRATAÇÃO REPRESENTADA ──────────────────────────────────────
    await avancar("contratada", "cliente aceitou na plataforma; contratação representada");

    // Nem aqui pagamento sai do 99Freelas.
    expect(avaliarSaidaDoCanal({ escopo: "pagamento", garantia: "confirmada", consentimento: null }).pode).toBe(false);

    // ── 8. ARQUIVO RECEBIDO ──────────────────────────────────────────────
    const doCliente = await registrarArquivoDoCliente({
      workspaceId: W,
      oportunidadeId: OP,
      linhagemId: "logo-do-cliente",
      nomeOriginal: "logo.png",
      extensaoDeclarada: "png",
      mimeType: "image/png",
      bytes: Buffer.from("\x89PNG\r\n\x1a\n conteudo controlado do teste"),
      destinatarioDeclarado: OP,
      autor: "operador",
    });
    expect(doCliente.ok, `arquivo do cliente recusado: ${doCliente.ok ? "" : JSON.stringify(doCliente)}`).toBe(true);

    // ── 9. PRODUÇÃO REPRESENTADA ─────────────────────────────────────────
    await avancar("em_producao", "peças em produção pelo departamento de Design");

    const daCasa = await registrarArquivoParaCliente({
      workspaceId: W,
      oportunidadeId: OP,
      // A ponte EXIGE âncora de cliente e projeto para a entrega. Descobri isso
      // aqui: sem elas ela recusa com "clienteId/projetoId (ausente)" e abre
      // exceção. É fail-closed correto — arquivo sem âncora não prova para quem
      // vai, e "provar para quem vai" é a trava nº 14 do CEO.
      clienteId: "cli-jornada",
      projetoId: "proj-jornada",
      linhagemId: "entrega-post-01",
      nomeOriginal: "post-01.jpg",
      // `extensao`, e NÃO `extensaoDeclarada` como no caminho do cliente. A
      // assimetria é deliberada e vale registrar: a extensão que o CLIENTE
      // manda é *declarada* — entrada não confiável, que a ponte valida — e a
      // da casa é conhecida. Nomes iguais nos dois lados apagariam essa
      // diferença justamente onde ela protege.
      extensao: "jpg",
      mimeType: "image/jpeg",
      bytes: Buffer.from("\xff\xd8\xff conteudo controlado do teste"),
      destinatarioDeclarado: OP,
      autor: "design",
    });
    expect(daCasa.ok, `arquivo da casa recusado: ${daCasa.ok ? "" : JSON.stringify(daCasa)}`).toBe(true);
    if (!daCasa.ok) return;
    const idDaEntrega = daCasa.arquivoId;

    // ── 10. ARQUIVO ENTREGUE ─────────────────────────────────────────────
    // A Qualidade aprova a versão ANTES de a ponte disponibilizar.
    const aprovado = await aprovarParaEnvio({
      workspaceId: W,
      arquivoId: idDaEntrega,
      autor: "qualidade",
    });
    expect(aprovado.ok, "a Qualidade precisa aprovar antes do envio").toBe(true);

    // 🔴 A trava nº 14 do CEO, DENTRO da jornada: destinatário divergente.
    const paraOutroCliente = await enviarAoCliente({
      workspaceId: W,
      arquivoId: idDaEntrega,
      destinoPretendido: {
        oportunidadeId: "op-de-OUTRO-cliente",
        clienteId: "cli-de-OUTRO",
        projetoId: "proj-de-OUTRO",
        destinatarioDeclarado: "op-de-OUTRO-cliente",
      },
      autor: "operador",
    });
    expect(paraOutroCliente.ok, "arquivo do cliente A NÃO pode ir ao cliente B").toBe(false);

    // ...e para o cliente certo, vai.
    const enviado = await enviarAoCliente({
      workspaceId: W,
      arquivoId: idDaEntrega,
      destinoPretendido: {
        oportunidadeId: OP,
        clienteId: "cli-jornada",
        projetoId: "proj-jornada",
        destinatarioDeclarado: OP,
      },
      autor: "operador",
    });
    expect(enviado.ok, `envio ao cliente certo falhou: ${JSON.stringify(enviado)}`).toBe(true);

    // O executor: plano com atestação, e registro com evidência.
    const plano = planejarAcao({
      acao: "anexar_arquivo",
      url: `https://www.99freelas.com.br/project/${OP}`,
      credencial: GERENTE,
      atestacao: {
        diretorioDoPerfil: "/var/lib/dioli/perfis/celula-99freelas",
        nenhumaOutraSessao: true,
        atestadoPor: "dioli",
        atestadoEm: new Date("2026-08-30T09:00:00Z"),
      },
      historicoDeRitmo: { ultimaAcaoEm: null, acoesNaUltimaHora: 0, acoesNoDia: 0 },
      agora: AGORA,
      env: {},
    });
    expect(plano.ok, `plano recusado: ${plano.ok ? "" : plano.motivo}`).toBe(true);

    const registro = registrarExecucao(plano, {
      urlVisitada: `https://www.99freelas.com.br/project/${OP}`,
      evidencias: {
        url_da_conversa: `https://www.99freelas.com.br/project/${OP}`,
        nome_do_arquivo: "post-01.jpg",
        tamanho_em_bytes: 31,
        checksum: "sha256-controlado",
        carimbo_de_tempo: AGORA.toISOString(),
      },
    });
    expect(registro.ok, "a execução precisa ser registrada com evidência").toBe(true);

    await avancar("entrega_enviada", "peça aprovada pela Qualidade e endereçada ao cliente certo");
    await avancar("aprovada", "cliente aprovou a entrega");
    await avancar("ganha", "projeto concluído dentro da plataforma");

    // ── 11. AUDITORIA COMPLETA ───────────────────────────────────────────
    expect(await estadoDoFunil(OP)).toBe("ganha");

    const trilha = await trilhaDoFunil(OP);
    expect(trilha.length, "toda transição tem de estar na trilha").toBe(15);

    for (const t of trilha) {
      expect(t.autor, "transição sem autor").toBeTruthy();
      expect(t.justificativa.length, "transição sem justificativa").toBeGreaterThan(0);
      expect(t.origem, "transição sem origem").toBeTruthy();
      expect(t.estadoAnterior, "transição sem estado anterior").toBeTruthy();
    }

    // A trilha conta a história inteira, na ordem.
    expect(trilha.map((t) => t.estadoNovo)).toEqual([
      "qualificada",
      "abordagem_preparada",
      "aguardando_autorizacao",
      "abordada",
      "respondeu",
      "briefing_em_coleta",
      "briefing_completo",
      "proposta_preparada",
      "proposta_enviada",
      "negociacao",
      "contratada",
      "em_producao",
      "entrega_enviada",
      "aprovada",
      "ganha",
    ]);

    // O histórico da conversa sobreviveu, e os arquivos estão registrados.
    const conversa = await porta.ler(conversaId);
    expect(conversa!.perguntasJaFeitas).toContain("identidade_visual");
    expect(await estado.prisma.arquivoDaCelula.count({ where: { workspaceId: W } })).toBe(2);
    const eventos = await estado.prisma.eventoDoArquivoDaCelula.count();
    expect(eventos, "a ponte precisa deixar rastro de cada passo do arquivo").toBeGreaterThan(0);
  }, 180_000);
});

describe("🔴 a rota do funil — o item 'nada em app/ importa a Célula'", () => {
  it("existe rota de API que importa o funil e a trilha da Célula", () => {
    const fonte = readFileSync("app/api/agency/oportunidades/[id]/funil/route.ts", "utf-8");
    expect(fonte).toContain("@/lib/agency/celula/trilha");
    expect(fonte).toContain("@/lib/agency/celula/papeis");
    // As três guardas, na ordem: sessão, posse, papel.
    expect(fonte).toContain("requireSession");
    expect(fonte).toContain("workspaceId");
    expect(fonte).toContain("podeNaCelula");
  });

  it("o autor da trilha vem da SESSÃO, nunca do corpo da requisição", () => {
    const fonte = readFileSync("app/api/agency/oportunidades/[id]/funil/route.ts", "utf-8");
    expect(fonte).toContain("autor: session.userId");
    expect(fonte).not.toContain("autor: c.autor");
  });
});
