// pilares-bloqueados.ts — o BLOQUEIO DE PILAR vira mecanismo.
//
// ── Por que este arquivo existe ─────────────────────────────────────────────
// Em 07/08/2026, na produção do CityJobs (`docs/projetos/cityjobs-registro-07-08.md`),
// **3 de 6 peças foram para o lixo** porque o gerador de imagem desenhou anúncio
// de emprego FALSO dentro dos pixels — com salário, cargo e marca inventados:
//
//   • pilar "salário aberto", 1ª arte  → prancheta com "VAGA $3,500"
//   • pilar "salário aberto", 2ª arte  → tela com "R$6.000"
//   • pilar "candidatura rápida"       → "Assistents Administrativo · R$ 2000
//                                         per wes", sob a marca inventada "AlcTiete"
//
// Numa plataforma de vagas o dano tem nome: pessoa desempregada indo atrás de
// uma vaga que não existe, com um salário que ninguém ofereceu.
//
// O registro daquele dia fechou com a frase *"o pilar 'vagas por setor' e o
// pilar 'salário aberto' ficam BLOQUEADOS até existir conferência de pixel"*.
// **E era só isso: uma frase num `.md`.** Nenhuma linha de código barrava nada.
// Pela lei da casa — *sem gate = reprovado* — o bloqueio já estava reprovado:
// ele voltaria a passar no dia em que alguém esquecesse do documento, e ninguém
// saberia, porque a peça sai bonita.
//
// ── Por que o PISO DE VERDADE não resolvia ──────────────────────────────────
// `conferirPisoDeVerdade` já barra `valor_inventado` — e não ajudou uma vez
// sequer aqui. Ele lê TEXTO; o "$3,500" estava em PIXEL. E `montarPrompt`
// (`artes.ts:864`) proíbe letra, número, placa e etiqueta com todas as letras —
// **o modelo ignorou**. É a regra da casa demonstrada ao vivo: prompt é
// sugestão, não trava. A trava é não pedir a peça.
//
// ── Como este bloqueio se levanta (e por que NÃO é apagando este arquivo) ───
// A causa raiz é que a foto gerada por IA não passa por conferência de PIXEL.
// Enquanto `conferenciaDePixelDisponivel()` devolver `false`, o bloqueio vale.
// Quem construir a conferência troca a implementação daquela função e o
// bloqueio cai sozinho — por mecanismo, não por alguém lembrar de vir aqui.
//
// ── O que este arquivo NÃO faz ──────────────────────────────────────────────
// Não olha a imagem, não chama IA e não fala com o cliente. Ele responde uma
// pergunta só, em código, sem rede: *este pilar pode entrar em produção hoje?*

/** De onde veio a decisão de bloquear. Sem procedência, uma trava que incomoda
 *  é desligada por quem não sabe o que ela protege. */
export type OrigemDoBloqueio =
  /** Escrito em `docs/projetos/cityjobs-registro-07-08.md` como decisão. */
  | "decisao-escrita"
  /** Peça produzida, conferida e REPROVADA em produção — evidência, não teoria. */
  | "evidencia-de-producao";

export interface PilarBloqueado {
  chave: string;
  /** O que casa com o NOME DO PILAR. Deliberadamente estreito: ver o bloco
   *  "a régua" abaixo. */
  padrao: RegExp;
  origem: OrigemDoBloqueio;
  desde: string;
  /** A frase que vai para o `ActivityEvent` e para quem for auditar. */
  motivo: string;
}

/**
 * ── A RÉGUA: casa contra o NOME DO PILAR, nunca contra a legenda ────────────
 *
 * A tentação era barrar qualquer peça que mencionasse dinheiro. Seria errado
 * duas vezes:
 *
 *   1. **Sobra:** numa plataforma de vagas quase toda legenda toca emprego. Um
 *      filtro largo apagaria o calendário inteiro do cliente — e trava que
 *      dispara onde não há risco ensina a equipe a ignorá-la (a lição do piso
 *      de plataforma do 99Freelas, 08/08).
 *   2. **Falta:** o dano não estava na legenda. As legendas estavam corretas.
 *      Estava no que o modelo DESENHOU quando o TEMA da peça era aquele. O
 *      preditor do estrago é o pilar, e é ele que se confere.
 *
 * Cada padrão abaixo casa com uma FAMÍLIA de nomes (acento, caixa e variação de
 * redação), não com uma string literal — renomear "salário aberto" para
 * "Salario Aberto ✨" não pode destravar nada.
 */
export const PILARES_BLOQUEADOS: readonly PilarBloqueado[] = [
  {
    chave: "salario-aberto",
    padrao: /\b(salari|remunerac|faixa salarial|piso salarial|quanto paga|quanto ganha)/,
    origem: "decisao-escrita",
    desde: "2026-08-07",
    motivo:
      "Pilar de salário: duas artes seguidas saíram com salário INVENTADO nos pixels " +
      '("VAGA $3,500" e "R$6.000"). Numa plataforma de vagas isso manda gente desempregada ' +
      "atrás de uma vaga que não existe.",
  },
  {
    chave: "vagas-por-setor",
    padrao: /\bvagas?\b[^.]{0,20}\bsetor/,
    origem: "decisao-escrita",
    desde: "2026-08-07",
    motivo:
      "Pilar de listagem de vagas: o modelo desenha o quadro de vagas com cargo e valor " +
      "fabricados. Bloqueado preventivamente junto com o pilar de salário.",
  },
  {
    chave: "candidatura-rapida",
    padrao: /\b(candidatura|candidat[ae]|se candidat|inscric|inscriç)/,
    origem: "evidencia-de-producao",
    desde: "2026-08-08",
    motivo:
      "Pilar de candidatura: a arte saiu com um anúncio de emprego falso completo " +
      '("Assistents Administrativo · R$ 2000 per wes") sob uma marca inventada. ' +
      "Foi REPROVADO em produção em 07/08 e não constava da decisão escrita — " +
      "entra aqui pela evidência, e está declarado como tal.",
  },
] as const;

/**
 * A CONDIÇÃO QUE LEVANTA O BLOQUEIO — e ela é uma capacidade, não uma opinião.
 *
 * Hoje: **não existe conferência de pixel na foto gerada por IA.** O molde
 * (`lib/agency/design/molde.ts`) compõe texto auditado POR CIMA da foto; ele não
 * apaga o que o modelo desenhou DENTRO dela. O `$3,500` estava no terço do meio,
 * fora da faixa do scrim: sobreviveria ao molde ligado. O cabeçalho de
 * `lib/agency/design/mockup.ts:19` já nomeia o buraco — *"o piso confere TEXTO,
 * e ninguém conferia PIXEL"* — e resolveu apenas o mockup montado por nós.
 *
 * Quando a conferência existir, quem a construir troca o corpo desta função. Não
 * há variável de ambiente, não há `{ forcar: true }` e não há exceção por
 * cliente — os três são o jeito conhecido de uma trava virar decoração.
 */
export function conferenciaDePixelDisponivel(): boolean {
  return false;
}

export interface VereditoDoPilar {
  bloqueado: boolean;
  chave: string | null;
  motivo: string | null;
}

const LIBERADO: VereditoDoPilar = { bloqueado: false, chave: null, motivo: null };

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Onde a peça está nascendo — e é isso que decide se pilar ausente reprova. */
export interface ComoConferirOPilar {
  /**
   * A peça vem da ESTEIRA AUTOMÁTICA (um `Deliverable` produzido por
   * especialista)? Então o pilar é obrigatório, e a ausência dele REPROVA.
   *
   * ── POR QUE ESTE PARÂMETRO EXISTE (15/08/2026) ──────────────────────────
   *
   * Este arquivo dizia, com todas as letras, que pilar ausente é LIBERADO — e
   * declarava isso como escolha consciente. A escolha estava certa para o post
   * que um humano digita no Planner (lá o campo é opcional e há gente olhando).
   * Ela estava ERRADA para a esteira, e a diferença ninguém tinha medido:
   *
   *   • o prompt do especialista de copy NÃO pedia o campo `pillar`;
   *   • `deliverableMarkdown` (`run-execution.ts`) NÃO emitia a linha "Pilar";
   *   • `extrairPecas` (`publicacao.ts`) a procurava e nunca a achava.
   *
   * Logo `post.pillar` era **sempre null** na esteira automática, e o bloqueio
   * de "salário aberto" — criado em 07/08 depois de três peças saírem com
   * salário FALSO em pixel — **nunca disparou** ali. O portão existia, tinha
   * teste, e aprovava por omissão. Isso é pior que não ter portão: cria
   * confiança falsa.
   *
   * A origem foi consertada (prompt + markdown + contrato de saída). Este
   * parâmetro é a outra metade: com a origem emitindo o pilar, ausência não
   * quer mais dizer "esta casa não usa pilar" — quer dizer "alguma coisa se
   * perdeu no caminho", e isso não pode virar liberação.
   */
  exigido?: boolean;
}

/**
 * Este pilar pode virar peça hoje?
 *
 * `exigido: false` (o padrão) mantém o comportamento histórico: pilar ausente
 * é LIBERADO, porque o post que um humano digita no Planner pode legitimamente
 * não ter pilar, e reprová-lo pararia a agência para proteger um cliente. Quem
 * protege esse caso continua sendo o piso de verdade.
 *
 * `exigido: true` fecha o fail-open onde o pilar É emitido — a esteira
 * automática. Ver `ComoConferirOPilar.exigido`.
 */
export function conferirPilar(
  pilar: string | null | undefined,
  como: ComoConferirOPilar = {},
): VereditoDoPilar {
  if (conferenciaDePixelDisponivel()) return LIBERADO;
  if (!pilar || !pilar.trim()) {
    if (!como.exigido) return LIBERADO;
    return {
      bloqueado: true,
      chave: "pilar-ausente",
      motivo:
        "esta peça veio da esteira automática SEM pilar de conteúdo. O pilar é o que o bloqueio confere antes de a " +
        "peça virar imagem paga — sem ele, a trava que barra 'salário aberto', 'vagas por setor' e 'candidatura " +
        "rápida' simplesmente não roda, e a peça passaria por não ter sido conferida. Sem portão = reprovado. " +
        "Conserto: o especialista precisa devolver o campo \"pillar\" (o prompt o exige e o contrato de saída o " +
        "confere desde 15/08/2026) — reproduza a entrega e ela volta a entrar no calendário.",
    };
  }

  const alvo = normalizar(pilar);
  for (const regra of PILARES_BLOQUEADOS) {
    if (regra.padrao.test(alvo)) {
      return {
        bloqueado: true,
        chave: regra.chave,
        motivo: `${regra.motivo} (bloqueio "${regra.chave}", ${regra.origem}, desde ${regra.desde}; ` +
          "cai sozinho quando houver conferência de pixel na imagem gerada)",
      };
    }
  }
  return LIBERADO;
}

/** A frase curta que vai para `SocialPost.lastError` — o campo é lido por gente. */
export function motivoCurto(v: VereditoDoPilar): string {
  return v.motivo ? `pilar bloqueado — ${v.motivo}` : "pilar bloqueado";
}
