// retrato.ts — O QUE A AGÊNCIA ENXERGA DO GOOGLE, CLIENTE POR CLIENTE.
//
// ── POR QUE ESTE ARQUIVO EXISTE (pedido do CEO, 08/08/2026) ─────────────────
//
//   "preciso da integração das ferramentas do Google nas páginas do admin
//    urgentemente."
//
// O material do Drive do cliente já entra na peça desde 07/08 e o Perfil de
// Empresa já responde avaliação sozinho no despertador a cada 5 min — e o
// ADMIN não mostrava nada disso em lugar nenhum. `/agency/integrations` roda em
// `MOCK_INTEGRATIONS`: mostra "Google Drive — planejado, OAuth não
// implementado" para uma feature que está em produção e já foi provada com a
// Foocci. Painel que descreve errado o que a casa faz é pior do que painel
// vazio: ele responde a pergunta do CEO com um número inventado.
//
// ── AS TRÊS RESPOSTAS QUE ESTE ARQUIVO DÁ, E A QUARTA QUE ELE SE RECUSA A DAR ─
//
//   1. Quem CONECTOU o Drive, com que conta, e desde quando.
//   2. O que a agência ENXERGA de fato — arquivo escolhido só vira insumo
//      depois que o CLIENTE diz o que ele é (`papelConfirmadoEm`). Escolhido e
//      não declarado é material que NÃO existe para a esteira, e a tela precisa
//      dizer isso com essa palavra.
//   3. Perfil de Empresa: qual local está ligado, quantas avaliações esperam
//      decisão de gente, e se a resposta automática está autorizada.
//
//   4. O que ele NÃO responde: "está tudo bem". Toda leitura que falha vira
//      `indisponivel` com motivo nomeado, nunca uma contagem zero. A lição de
//      07/08 é literal aqui — três `.catch(() => null)` em fila transformaram
//      falha de infraestrutura na afirmação "o cliente não conectou", e o CEO
//      viu "conectado" e "não conectado" no mesmo cartão.
//
// ── O QUE ESTE ARQUIVO NÃO FAZ, POR CONSTRUÇÃO ──────────────────────────────
//
// **Nenhuma escrita no Google sai daqui, e nenhuma chamada ao Google também.**
// Ele lê o BANCO. Ligar uma varredura ao vivo do Google numa tela de admin é
// rajada de GET por render — a assinatura exata do que restringiu a conta de
// anúncios da agência na Meta em 03/08. Quem fala com o Google é o despertador,
// no ritmo dele.

import { prisma } from "@/lib/db/client";
import { PAPEIS, type Papel } from "@/lib/integrations/google/escolha-de-material";

// ─── Os estados honestos ────────────────────────────────────────────────────

/**
 * Uma contagem tem DOIS estados, nunca um só.
 *
 * `nao_medido` e `0` não compartilham pixel — é a mesma regra do `Dinheiro` do
 * financeiro (07/08). Zero é uma afirmação sobre o cliente; "não consegui
 * olhar" é uma afirmação sobre nós.
 */
export type Contagem =
  | { estado: "medido"; valor: number }
  | { estado: "nao_medido"; motivo: string };

export const naoMedido = (motivo: string): Contagem => ({ estado: "nao_medido", motivo });
export const medido = (valor: number): Contagem => ({ estado: "medido", valor });

/** As credenciais que o Google exige, e o que cada falta impede. */
export interface CredencialDoGoogle {
  chave: string;
  presente: boolean;
  /** O que PARA de funcionar sem ela. Em português, sem jargão. */
  semEla: string;
}

export interface DriveDoCliente {
  conectado: boolean;
  /** connected | expired | revoked | error | sem_conexao */
  status: string;
  /** "j***@gmail.com" — só o suficiente para o CEO reconhecer a conta. */
  conta: string;
  conectadoEm: string | null;
  /** A última vez que a casa mexeu nesta conexão (renovação de token inclusive). */
  ultimaLeitura: string | null;
  /** Escolhidos no seletor do Google. Escolher NÃO é declarar. */
  escolhidos: Contagem;
  /** Com papel declarado PELO CLIENTE. É o único número que vira insumo. */
  declarados: Contagem;
  /** Já baixados para o volume da casa e disponíveis para a peça. */
  importados: Contagem;
  /** Escolhidos e SEM papel — o cliente precisa voltar ao portal. */
  aguardandoCliente: Contagem;
  /** Falhas de importação, com a frase que o Google devolveu. */
  falhas: Array<{ nome: string; erro: string }>;
  /** Quais papéis a casa já tem, para saber o que falta produzir peça boa. */
  papeis: Array<{ papel: string; rotulo: string; quantos: number }>;
}

export interface PerfilDeEmpresaDoCliente {
  /** Um local por conexão — avaliações e posts são POR LOCAL. */
  locais: Array<{
    id: string;
    titulo: string;
    locationName: string;
    status: string;
    /** Nulo = a resposta automática NÃO está autorizada e nada sai sozinho. */
    respostaAutomaticaAutorizadaEm: string | null;
    ultimaLeituraDeAvaliacoes: string | null;
  }>;
  avaliacoesEsperandoDecisao: Contagem;
  avaliacoesRespondidas: Contagem;
  totalDeAvaliacoes: Contagem;
}

export interface LinhaDoRetrato {
  clientId: string;
  nome: string;
  drive: DriveDoCliente;
  perfil: PerfilDeEmpresaDoCliente;
}

export interface RetratoDoGoogle {
  credenciais: CredencialDoGoogle[];
  /**
   * A conexão do Perfil de Empresa que NÃO tem cliente (`clientId: null`) é a
   * conta da própria Dioli. Ela existe no schema e ficaria invisível numa tela
   * que só lista clientes.
   */
  linhas: LinhaDoRetrato[];
  daCasa: PerfilDeEmpresaDoCliente | null;
  /** Falhas de LEITURA do banco. Se houver qualquer uma, a tela não afirma nada. */
  indisponivel: string[];
}

// ─── As credenciais ─────────────────────────────────────────────────────────

/**
 * O que existe no ambiente. **Nenhum valor é devolvido** — só o fato de estar
 * presente. Uma tela de admin que imprime `GOOGLE_CLIENT_SECRET` é vazamento
 * por screenshot.
 */
export function credenciaisDoGoogle(env: NodeJS.ProcessEnv = process.env): CredencialDoGoogle[] {
  const tem = (k: string) => !!env[k]?.trim();
  return [
    {
      chave: "GOOGLE_CLIENT_ID",
      presente: tem("GOOGLE_CLIENT_ID"),
      semEla: "nenhum cliente consegue conectar Drive nem Perfil de Empresa",
    },
    {
      chave: "GOOGLE_CLIENT_SECRET",
      presente: tem("GOOGLE_CLIENT_SECRET"),
      semEla: "a conexão até começa, mas o Google recusa a troca do código — quebra no meio",
    },
    {
      chave: "GOOGLE_PICKER_API_KEY",
      presente: tem("GOOGLE_PICKER_API_KEY"),
      semEla: "o cliente conecta o Drive e não consegue ESCOLHER arquivo nenhum",
    },
    {
      chave: "GOOGLE_PROJECT_NUMBER",
      presente: tem("GOOGLE_PROJECT_NUMBER"),
      semEla: "o seletor do Google abre em branco — mesma consequência da chave acima",
    },
  ];
}

// ─── O retrato ──────────────────────────────────────────────────────────────

interface MaterialLido {
  clientId: string;
  papel: string | null;
  papelConfirmadoEm: Date | null;
  mediaAssetId: string | null;
  nome: string;
  erro: string | null;
}

/** Monta o retrato de UM cliente a partir do que já foi lido do banco. */
export function retratoDeUmCliente(
  cliente: { id: string; name: string },
  conexaoDoDrive: {
    status: string; contaHint: string; connectedAt: Date; updatedAt: Date;
  } | null,
  materiais: MaterialLido[],
  locais: Array<{
    id: string; title: string; locationName: string; status: string;
    autoReplyConsentAt: Date | null; reviewsSyncedAt: Date | null;
  }>,
  avaliacoes: Array<{ status: string }>,
  falhouAoLer: { drive: string | null; perfil: string | null },
): LinhaDoRetrato {
  const meus = materiais.filter((m) => m.clientId === cliente.id);
  const declarados = meus.filter((m) => !!m.papelConfirmadoEm && !!m.papel);

  const porPapel = new Map<string, number>();
  for (const m of declarados) porPapel.set(m.papel!, (porPapel.get(m.papel!) ?? 0) + 1);

  const falhaDrive = falhouAoLer.drive;
  const falhaPerfil = falhouAoLer.perfil;

  const drive: DriveDoCliente = {
    conectado: !!conexaoDoDrive && conexaoDoDrive.status !== "revoked",
    status: conexaoDoDrive?.status ?? "sem_conexao",
    conta: conexaoDoDrive?.contaHint ?? "",
    conectadoEm: conexaoDoDrive?.connectedAt.toISOString() ?? null,
    ultimaLeitura: conexaoDoDrive?.updatedAt.toISOString() ?? null,
    escolhidos: falhaDrive ? naoMedido(falhaDrive) : medido(meus.length),
    declarados: falhaDrive ? naoMedido(falhaDrive) : medido(declarados.length),
    importados: falhaDrive ? naoMedido(falhaDrive) : medido(meus.filter((m) => !!m.mediaAssetId).length),
    aguardandoCliente: falhaDrive ? naoMedido(falhaDrive) : medido(meus.filter((m) => !m.papelConfirmadoEm && !m.papel).length),
    falhas: meus.filter((m) => !!m.erro).map((m) => ({ nome: m.nome, erro: m.erro! })),
    papeis: [...porPapel.entries()].map(([papel, quantos]) => ({
      papel,
      rotulo: PAPEIS[papel as Papel]?.rotulo ?? papel,
      quantos,
    })).sort((a, b) => b.quantos - a.quantos),
  };

  const perfil: PerfilDeEmpresaDoCliente = {
    locais: locais.map((l) => ({
      id: l.id,
      titulo: l.title || l.locationName,
      locationName: l.locationName,
      status: l.status,
      respostaAutomaticaAutorizadaEm: l.autoReplyConsentAt?.toISOString() ?? null,
      ultimaLeituraDeAvaliacoes: l.reviewsSyncedAt?.toISOString() ?? null,
    })),
    avaliacoesEsperandoDecisao: falhaPerfil ? naoMedido(falhaPerfil) : medido(avaliacoes.filter((a) => a.status === "escalada").length),
    avaliacoesRespondidas: falhaPerfil ? naoMedido(falhaPerfil) : medido(avaliacoes.filter((a) => a.status === "respondida").length),
    totalDeAvaliacoes: falhaPerfil ? naoMedido(falhaPerfil) : medido(avaliacoes.length),
  };

  return { clientId: cliente.id, nome: cliente.name, drive, perfil };
}

/**
 * O retrato inteiro. Uma consulta por tabela, nunca uma por cliente — N+1 numa
 * tela de admin com 40 clientes é o que faz o painel demorar 8 s e o CEO achar
 * que travou.
 */
export async function retratoDoGoogle(workspaceId: string): Promise<RetratoDoGoogle> {
  const indisponivel: string[] = [];

  const clientes = await prisma.client
    .findMany({ where: { workspaceId }, select: { id: true, name: true }, orderBy: { name: "asc" } })
    .catch((e) => {
      indisponivel.push(`não consegui ler a lista de clientes: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    });

  let falhaDrive: string | null = null;
  const conexoesDoDrive = await prisma.googleDriveConnection
    .findMany({ where: { workspaceId } })
    .catch((e) => {
      falhaDrive = `não consegui ler as conexões de Drive: ${e instanceof Error ? e.message : String(e)}`;
      indisponivel.push(falhaDrive);
      return [] as Awaited<ReturnType<typeof prisma.googleDriveConnection.findMany>>;
    });

  const materiais = await prisma.driveMaterial
    .findMany({ where: { workspaceId }, orderBy: { escolhidoEm: "desc" } })
    .catch((e) => {
      falhaDrive = `não consegui ler o material do Drive: ${e instanceof Error ? e.message : String(e)}`;
      indisponivel.push(falhaDrive);
      return [] as Awaited<ReturnType<typeof prisma.driveMaterial.findMany>>;
    });

  let falhaPerfil: string | null = null;
  const conexoesDoPerfil = await prisma.googleConnection
    .findMany({ where: { workspaceId } })
    .catch((e) => {
      falhaPerfil = `não consegui ler o Perfil de Empresa: ${e instanceof Error ? e.message : String(e)}`;
      indisponivel.push(falhaPerfil);
      return [] as Awaited<ReturnType<typeof prisma.googleConnection.findMany>>;
    });

  const avaliacoes = await prisma.googleReview
    .findMany({ where: { workspaceId }, select: { clientId: true, status: true } })
    .catch((e) => {
      falhaPerfil = `não consegui ler as avaliações: ${e instanceof Error ? e.message : String(e)}`;
      indisponivel.push(falhaPerfil);
      return [] as Array<{ clientId: string | null; status: string }>;
    });

  const drivePorCliente = new Map(conexoesDoDrive.map((c) => [c.clientId, c]));
  const materiaisLidos: MaterialLido[] = materiais.map((m) => ({
    clientId: m.clientId, papel: m.papel, papelConfirmadoEm: m.papelConfirmadoEm,
    mediaAssetId: m.mediaAssetId, nome: m.nome, erro: m.erro,
  }));

  const linhas = (clientes ?? []).map((c) =>
    retratoDeUmCliente(
      c,
      drivePorCliente.get(c.id) ?? null,
      materiaisLidos,
      conexoesDoPerfil.filter((p) => p.clientId === c.id),
      avaliacoes.filter((a) => a.clientId === c.id),
      { drive: falhaDrive, perfil: falhaPerfil },
    ),
  );

  // A conta da própria Dioli: `clientId` nulo. Sem esta linha ela existiria no
  // banco, responderia avaliação no relógio e não apareceria em tela nenhuma.
  const daCasaLocais = conexoesDoPerfil.filter((p) => !p.clientId);
  const daCasaAvaliacoes = avaliacoes.filter((a) => !a.clientId);
  const daCasa: PerfilDeEmpresaDoCliente | null = daCasaLocais.length
    ? retratoDeUmCliente(
        { id: "__dioli__", name: "Dioli Digital" },
        null, [], daCasaLocais, daCasaAvaliacoes, { drive: falhaDrive, perfil: falhaPerfil },
      ).perfil
    : null;

  return { credenciais: credenciaisDoGoogle(), linhas, daCasa, indisponivel };
}
