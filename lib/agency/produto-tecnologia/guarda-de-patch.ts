// A GUARDA DO PATCH — o que a engenharia produz não vira ação sozinho.
//
// ─── POR QUE ESTE ARQUIVO EXISTE ────────────────────────────────────────────
//
// A ficha do `backend-engineer` declara `"saida": {"formato": "git-patch"}`
// desde que o 12º departamento nasceu (15/08/2026). Durante um dia inteiro a
// caixa esteve desenhada e a seta não existia: o departamento sabia dizer o que
// entregaria e não havia NADA que convertesse aquilo em trabalho. Em 16/08 o
// CEO mandou consertar — "a agência precisa passar a consertar a si mesma".
//
// Dar mãos a um agente sem dar uma trava é o defeito, não o conserto. Guardrail
// 4 da companhia: prompt é aviso, código é trava. Este módulo é a trava. Ele lê
// o patch que saiu do agente e responde uma de três coisas: a proposta pode ser
// guardada para revisão, a decisão SOBE para gente, ou a saída é recusada.
//
// ─── O QUE ESTE MÓDULO NÃO FAZ, E É DE PROPÓSITO ────────────────────────────
//
// Ele NÃO aplica patch. Não escreve em disco, não chama git, não importa `fs`.
// Um módulo que julga e aplica é um módulo em que a aprovação e a execução moram
// no mesmo lugar — e aí a trava vale enquanto ninguém errar uma linha. A
// aplicação é peça separada, com gente no caminho, e ainda não existe.
//
// ─── AS TRÊS REGRAS QUE VALEM MAIS QUE AS OUTRAS ────────────────────────────
//
// 1. O agente NÃO edita a própria ficha (`agentes/linha/**`). A ficha é o
//    contrato que diz a autonomia dele, o teto de custo dele e o que o obriga a
//    escalar. Agente que reescreve o próprio contrato não tem contrato.
// 2. O agente NÃO desarma o guarda (este arquivo e `permissoes.ts`). Mesma
//    razão, um nível abaixo.
// 3. Migração destrutiva PARA. O banco do piloto é SQLite em volume do Railway
//    com dados VIVOS. Um `DROP COLUMN` aplicado por engano não tem desfazer.

/** O veredito. `escalado` não é "quase aceito": é decisão que sobe para gente. */
export type VereditoDoPatch = "aceito" | "escalado" | "recusado";

export interface AnaliseDoPatch {
  veredito: VereditoDoPatch;
  /** Por que, em uma frase, em português — vai para o diário e para o CEO. */
  motivo: string;
  /**
   * Gatilhos na GRAFIA EXATA das fichas (`gatilhos_humanos`). É assim que o
   * executor V2 reconhece o gatilho e escala em vez de executar — grafia
   * divergente aqui vira gatilho que ninguém casa, ou seja, trava decorativa.
   */
  gatilhos: string[];
  /** Arquivos tocados pelo patch, na ordem em que aparecem. */
  arquivos: string[];
  /** O que não impede a proposta, mas o revisor precisa ver antes de aplicar. */
  avisos: string[];
}

/** Grafia LITERAL dos `gatilhos_humanos` das sete fichas — não reescrever. */
export const GATILHOS_DAS_FICHAS = {
  migracaoDestrutiva: "migração destrutiva",
  seguranca: "risco de segurança ou privacidade",
  irreversivel: "qualquer ação irreversível, gasto ou risco legal",
} as const;

/**
 * Patch grande demais não é revisável, e proposta que ninguém revisa é a mesma
 * coisa que aplicação automática com etapa a mais. Os números são baixos de
 * propósito: a ordem do CEO foi peça pequena.
 */
const LIMITE_DE_ARQUIVOS = 25;
const LIMITE_DE_BYTES = 200_000;

/** Caminhos que o departamento não toca sem gente decidindo antes. */
const ZONAS_QUE_ESCALAM: Array<{ padrao: RegExp; motivo: string; gatilho: string }> = [
  {
    // Regra 1: o contrato do agente não é editável pelo agente.
    padrao: /^agentes\//,
    motivo: "o patch edita ficha de agente — autonomia, teto de custo e gatilho de escalada não se reescrevem por dentro",
    gatilho: GATILHOS_DAS_FICHAS.irreversivel,
  },
  {
    // Regra 2: o guarda não se desarma sozinho.
    padrao: /^lib\/agency\/produto-tecnologia\/(guarda-de-patch|permissoes)\.ts$/,
    motivo: "o patch mexe na própria trava (guarda ou permissões) — quem é vigiado não altera o vigia",
    gatilho: GATILHOS_DAS_FICHAS.seguranca,
  },
  {
    // "deploy direto" é `ferramenta_proibida` LITERAL nas sete fichas.
    padrao: /^(railway\.json|Dockerfile|next\.config\.[cm]?[jt]s|\.github\/workflows\/|scripts\/(start|deploy|portao|sentinela))/,
    motivo: "o patch mexe em deploy, build ou ambiente — publicar é de Operações, e nenhuma ficha permite deploy direto",
    gatilho: GATILHOS_DAS_FICHAS.irreversivel,
  },
  {
    padrao: /^prisma\//,
    motivo: "o patch mexe no banco — o piloto roda SQLite em volume do Railway com dados vivos",
    gatilho: GATILHOS_DAS_FICHAS.migracaoDestrutiva,
  },
];

/** Caminhos que nem escalam: são recusa seca. Segredo não passa por revisão. */
const ZONAS_RECUSADAS: Array<{ padrao: RegExp; motivo: string }> = [
  { padrao: /(^|\/)\.env/, motivo: "o patch toca arquivo de ambiente — segredo não entra em patch de agente" },
  { padrao: /\.(pem|key|p12|pfx)$/, motivo: "o patch carrega material de chave privada" },
  { padrao: /(^|\/)(id_rsa|id_ed25519|credentials|service-account.*\.json)$/, motivo: "o patch carrega credencial" },
];

/**
 * SQL que não tem desfazer. Só vale em linha ADICIONADA: um patch que REMOVE um
 * `DROP TABLE` está consertando o problema, não causando — casar a palavra sem
 * olhar o sinal transformaria o conserto em bloqueio.
 */
const SQL_SEM_VOLTA: RegExp[] = [
  /\bDROP\s+(TABLE|COLUMN|DATABASE|SCHEMA)\b/i,
  /\bTRUNCATE\s+(TABLE\s+)?\w/i,
  /\bDELETE\s+FROM\b/i,
  /\bALTER\s+TABLE\b[\s\S]{0,80}?\bDROP\b/i,
  /--accept-data-loss/,
  /\bmigrate\s+reset\b/,
  /\bdb\s+push\b[^\n]*--force-reset/,
];

/** Os arquivos do patch, lidos dos cabeçalhos `diff --git` e `+++ b/…`. */
export function arquivosDoPatch(patch: string): string[] {
  const achados: string[] = [];
  for (const linha of patch.split("\n")) {
    const porDiff = linha.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (porDiff) {
      achados.push(porDiff[2]!.trim());
      continue;
    }
    const porMais = linha.match(/^\+\+\+ b\/(.+)$/);
    if (porMais && porMais[1] !== "/dev/null") achados.push(porMais[1]!.trim());
  }
  return [...new Set(achados)];
}

/** Só as linhas que o patch ACRESCENTA (o `+++` de cabeçalho não conta). */
function linhasAdicionadas(patch: string): string[] {
  return patch
    .split("\n")
    .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
    .map((l) => l.slice(1));
}

/** Só as linhas que o patch REMOVE — é o que denuncia migração subtrativa. */
function linhasRemovidas(patch: string): string[] {
  return patch
    .split("\n")
    .filter((l) => l.startsWith("-") && !l.startsWith("---"))
    .map((l) => l.slice(1));
}

/**
 * Julga a saída `git-patch` de um engenheiro do departamento. Puro: mesma
 * entrada, mesmo veredito, sem tocar disco nem rede — dá para testar o "não"
 * sem precisar de repositório, que é a condição para o "não" ser confiável.
 */
export function analisarPatch(saida: string): AnaliseDoPatch {
  const gatilhos = new Set<string>();
  const avisos: string[] = [];
  const patch = saida ?? "";

  // 1. É patch mesmo? A ficha promete `git-patch`; texto que não é diff não é
  //    "um patch ruim", é uma saída que mentiu sobre o próprio formato.
  if (!/^diff --git /m.test(patch)) {
    return {
      veredito: "recusado",
      motivo: "a ficha exige git-patch e a saída não contém nenhum cabeçalho `diff --git` — saída fora do formato não vira proposta",
      gatilhos: [],
      arquivos: [],
      avisos: [],
    };
  }

  const arquivos = arquivosDoPatch(patch);
  if (arquivos.length === 0) {
    return {
      veredito: "recusado",
      motivo: "o patch não declara nenhum arquivo de destino legível — patch sem alvo não se revisa",
      gatilhos: [],
      arquivos: [],
      avisos: [],
    };
  }

  // 2. Segredo é recusa seca, antes de qualquer outra coisa.
  for (const arquivo of arquivos) {
    for (const zona of ZONAS_RECUSADAS) {
      if (zona.padrao.test(arquivo)) {
        return { veredito: "recusado", motivo: `${zona.motivo} (${arquivo})`, gatilhos: [], arquivos, avisos };
      }
    }
  }

  // 3. Tamanho: proposta que ninguém consegue revisar é aplicação automática
  //    com uma etapa a mais no meio.
  if (arquivos.length > LIMITE_DE_ARQUIVOS) {
    return {
      veredito: "escalado",
      motivo: `o patch toca ${arquivos.length} arquivos (limite ${LIMITE_DE_ARQUIVOS}) — mudança desse tamanho volta em pedaços revisáveis`,
      gatilhos: [GATILHOS_DAS_FICHAS.irreversivel],
      arquivos,
      avisos,
    };
  }
  if (patch.length > LIMITE_DE_BYTES) {
    return {
      veredito: "escalado",
      motivo: `o patch tem ${patch.length} bytes (limite ${LIMITE_DE_BYTES}) — mudança desse tamanho volta em pedaços revisáveis`,
      gatilhos: [GATILHOS_DAS_FICHAS.irreversivel],
      arquivos,
      avisos,
    };
  }

  // 4. SQL sem volta em linha adicionada.
  const adicionadas = linhasAdicionadas(patch);
  const perigosa = adicionadas.find((l) => SQL_SEM_VOLTA.some((r) => r.test(l)));
  if (perigosa) {
    return {
      veredito: "escalado",
      motivo: `o patch ACRESCENTA operação sem desfazer no banco: "${perigosa.trim().slice(0, 120)}"`,
      gatilhos: [GATILHOS_DAS_FICHAS.migracaoDestrutiva, GATILHOS_DAS_FICHAS.irreversivel],
      arquivos,
      avisos,
    };
  }

  // 5. Zonas que escalam por caminho.
  const motivos: string[] = [];
  for (const arquivo of arquivos) {
    for (const zona of ZONAS_QUE_ESCALAM) {
      if (!zona.padrao.test(arquivo)) continue;
      // Prisma aditivo é o que a ficha do backend PERMITE ("migração aditiva").
      // Só sobe quando o diff tira coisa do schema — retirada é o que não volta.
      if (zona.padrao.source.startsWith("^prisma") && linhasRemovidas(patch).every((l) => !l.trim() || l.trim().startsWith("//"))) {
        avisos.push(`mexe em ${arquivo} de forma aditiva — a ficha permite, o revisor confere`);
        continue;
      }
      motivos.push(`${zona.motivo} (${arquivo})`);
      gatilhos.add(zona.gatilho);
    }
  }
  if (motivos.length > 0) {
    return { veredito: "escalado", motivo: motivos.join(" · "), gatilhos: [...gatilhos], arquivos, avisos };
  }

  return {
    veredito: "aceito",
    motivo: `patch em ${arquivos.length} arquivo(s), sem zona travada e sem operação irreversível — vira PROPOSTA para revisão, não é aplicado`,
    gatilhos: [],
    arquivos,
    avisos,
  };
}
