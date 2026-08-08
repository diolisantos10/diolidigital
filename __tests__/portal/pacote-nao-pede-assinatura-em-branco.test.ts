// ── O CARD DO PACOTE NÃO PEDE ASSINATURA EM BRANCO ──────────────────────────
//
// 08/08/2026. O CEO abriu o portal do CityJobs e mandou print: o card do topo
// dizia "O pacote inteiro está pronto para você — terminamos e organizamos
// tudo", com o botão "Aprovar tudo". Logo abaixo, as TRÊS entregas (Analytics,
// Social Media, Estratégia) diziam "material ainda não subiu", em "Em produção
// na Dioli".
//
// As duas não podem ser verdade. Clicar em "Aprovar tudo" aprovaria NADA, às
// cegas — e `aprovarPacote` abre o ciclo e chama `aprovarCalendario`, que é o
// único consentimento de publicação desta casa.
//
// É o mesmo defeito consertado em 07/08 no card individual, um nível acima.
//
// ── AS DUAS METADES, EM TODA TRAVA ──────────────────────────────────────────
//
// Trava que só prova que BARRA é trava que ninguém sabe se atrapalha. Cada
// regra aqui é provada nos dois sentidos: que ela pega o caso plantado, E que
// ela deixa o caso limpo passar inteiro. Uma trava que dispara onde não há
// risco é desligada por quem não sabe o que ela protege.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { lerFase, type RetratoDoProjeto } from "@/lib/agency/esteira/fases";

const raiz = process.cwd();
const ler = (p: string) => readFileSync(join(raiz, p), "utf8");

/** Um retrato de projeto APRESENTADO — o estado exato do CityJobs no print. */
function apresentado(decisoesDisponiveis?: number): RetratoDoProjeto {
  return {
    propostaAceita: true,
    apresentadoEm: new Date("2026-08-07T00:33:22Z"),
    execucao: "done",
    tarefas: { total: 3, entregues: 3, produzindo: 0, bloqueadas: 0 },
    entregaveis: { total: 3, emRevisao: 0, comRessalva: 0, aprovados: 0 },
    pedidosAbertos: 0,
    redesConectadas: true,
    ...(decisoesDisponiveis === undefined ? {} : { decisoesDisponiveis }),
  };
}

describe("a etapa que o cliente lê para de dizer 'tudo pronto' sobre o nada", () => {
  it("BARRA: apresentado com ZERO entregas decidíveis não anuncia pacote pronto", () => {
    const leitura = lerFase(apresentado(0));

    // O texto do CEO, palavra por palavra, não pode voltar.
    expect(leitura.paraCliente.titulo.toLowerCase()).not.toContain("tudo pronto");
    expect(leitura.paraCliente.agora.toLowerCase()).not.toContain("terminamos e organizamos");

    // E a bola NÃO é do cliente: ele não pode ser cobrado por uma decisão que
    // não tem como tomar. É daqui que sai `aBolaEstaComVoce` no portal.
    expect(leitura.responsavel).not.toBe("cliente");
    expect(leitura.paraCliente.oQueEsperamosDeVoce).toBe("");
  });

  it("NÃO BARRA: apresentado com entrega decidível continua pedindo a decisão", () => {
    const leitura = lerFase(apresentado(1));
    expect(leitura.paraCliente.titulo).toContain("Tudo pronto");
    expect(leitura.responsavel).toBe("cliente");
    expect(leitura.paraCliente.oQueEsperamosDeVoce).not.toBe("");
    expect(leitura.semaforo).toBe("esperando");
  });

  it("NÃO BARRA: quem ainda não mede nada continua lendo a fase antiga", () => {
    // `undefined` é "ninguém mediu", e ausência de informação não é informação.
    // Tratar `undefined` como zero esconderia o pacote legítimo de todo
    // chamador que ainda não passa o número — inclusive retrato montado à mão.
    const leitura = lerFase(apresentado(undefined));
    expect(leitura.paraCliente.titulo).toContain("Tudo pronto");
    expect(leitura.responsavel).toBe("cliente");
  });

  it("o pacote pronto NÃO some quando o projeto já andou além dele", () => {
    // Anti-regressão: a guarda nova mora DENTRO do ramo de `apresentadoEm`.
    // Se ela tivesse subido para cima dos ramos de ciclo/implementação, um
    // projeto em operação com zero aprovações pendentes (o estado NORMAL de
    // quem já aprovou) cairia em "ainda estamos produzindo".
    const emOperacao = { ...apresentado(0), aprovadoPeloClienteEm: new Date(), postsPublicados: 4 };
    expect(lerFase(emOperacao).fase).toBe("implementacao");
    expect(lerFase({ ...emOperacao, cicloAberto: true }).fase).toBe("ciclo");
  });
});

describe("o servidor recusa aprovar um pacote sem corpo — trava, não aviso", () => {
  const marcos = ler("lib/agency/esteira/marcos.ts");

  it("BARRA: `aprovarPacote` consulta o retrato e sai ANTES da primeira escrita", () => {
    const corpo = marcos.slice(marcos.indexOf("export async function aprovarPacote"));
    const guarda = corpo.indexOf("pacote.pedeAprovacao");
    const primeiraEscrita = corpo.indexOf("prisma.project.update");
    expect(guarda).toBeGreaterThan(-1);
    expect(primeiraEscrita).toBeGreaterThan(-1);
    // A ordem é a trava: recusar DEPOIS de carimbar `clientApprovedAt` deixaria
    // o projeto aprovado e a função devolvendo erro.
    expect(guarda).toBeLessThan(primeiraEscrita);
  });

  it("BARRA: 'aprovar tudo' nunca carimba aprovação sem corpo no pacote MISTO", () => {
    const corpo = marcos.slice(marcos.indexOf("export async function aprovarPacote"));
    // O `updateMany` que carimba `approved` tem de casar por ID da lista de
    // prontas. `status: "pending"` sozinho aprovava a entrega que o cliente
    // nunca viu, junto com as que ele viu.
    const trecho = corpo.slice(corpo.indexOf("approvalRequest.updateMany"), corpo.indexOf("approvalRequest.updateMany") + 400);
    expect(trecho).toContain("idsProntos");
    expect(trecho).not.toMatch(/where:\s*\{\s*clientRequestId[^}]*status:\s*"pending"\s*\}/);
  });

  it("a trava não tem porta dos fundos: sem env, sem `forcar`, sem exceção por cliente", () => {
    const corpo = marcos.slice(
      marcos.indexOf("export async function aprovarPacote"),
      marcos.indexOf("export async function aprovarPacote") + 3000,
    );
    expect(corpo).not.toMatch(/process\.env/);
    expect(corpo).not.toMatch(/forcar/i);
  });
});

describe("quando pede, o card LISTA o que está dentro", () => {
  const pagina = ler("app/portal/access/[token]/page.tsx");
  const esteiraTsx = ler("components/agency/portal/EsteiraDoCliente.tsx");

  it("BARRA: a frase que mentia para o CEO não existe mais no código", () => {
    expect(pagina).not.toContain("O pacote inteiro está pronto para você");
    expect(pagina).not.toContain("Terminamos e organizamos tudo.");
  });

  it("o card nomeia as entregas que entram na aprovação", () => {
    expect(pagina).toContain("pacoteDaEsteira.prontas.join(");
    expect(pagina).toContain("Nesta aprovação vão:");
  });

  it("o card separa o que NÃO entra na aprovação", () => {
    expect(pagina).toContain("pacoteDaEsteira.emProducao");
    expect(esteiraTsx).toContain("pacote.emProducao");
  });

  it("BARRA: o botão parou de ser derivado do TEXTO da etapa", () => {
    // `etapa.includes("tudo pronto")` casa botão com redação. A frase muda por
    // motivo de estilo e o comportamento muda junto, sem ninguém perceber.
    expect(pagina).not.toContain('etapaEsteira.includes("tudo pronto")');
    // Só o CÓDIGO conta: o comentário deste arquivo cita a linha antiga de
    // propósito, para quem for mexer saber o que não pode voltar.
    expect(esteiraTsx).not.toMatch(/const\s+pedePacote\s*=\s*etapa/);
    expect(esteiraTsx).toMatch(/const\s+pedePacote\s*=\s*pacote\?\.pedeAprovacao/);
  });

  it("fail closed nas DUAS telas: pacote ausente não produz botão", () => {
    expect(esteiraTsx).toContain("pacote?.pedeAprovacao ?? false");
    expect(pagina).toContain("esteira?.pacote ?? null");
  });

  it("NÃO CONSERTA O RODAPÉ: o texto honesto de baixo fica como está", () => {
    // Ordem explícita do CEO — o de baixo já era honesto, o topo é que mentia.
    // Consertar os dois esconderia qual dos dois estava errado.
    expect(ler("components/portal/AprovacoesDoCliente.tsx")).toContain("semConteudo");
  });
});

describe("a regra de 'este card tem corpo' tem UMA implementação", () => {
  it("o portal-data IMPORTA a regra em vez de manter a própria cópia", () => {
    const portalData = ler("app/api/brain/portal-data/route.ts");
    expect(portalData).toContain('from "@/lib/agency/esteira/pacote"');
    expect(portalData).toContain("cardTemCorpo(ap, deliverableContentFor, pecas)");
    // A conta escrita à mão morreu. Duas fontes de verdade adjacentes é o
    // defeito nº 2 do incidente do Drive, e o mapa entrega→departamento já
    // quebrou este portal assim em 07/08, divergindo em 11 dos 14 casos.
    expect(portalData).not.toContain("!corpo?.trim() && pecas.length === 0");
  });

  it("falha de leitura NÃO vira 'pacote pronto'", () => {
    const pacote = ler("lib/agency/esteira/pacote.ts");
    // Todo caminho de erro devolve o pacote vazio, e pacote vazio não pede
    // aprovação. É a direção segura: o pior que acontece é o cliente não ver um
    // botão; o contrário é ele assinar às cegas.
    expect(pacote).toContain("PACOTE_VAZIO");
    expect(pacote).toContain("pedeAprovacao: prontas.length > 0");
    expect(pacote).toMatch(/const PACOTE_VAZIO[^\n]*pedeAprovacao: false/);
  });
});
