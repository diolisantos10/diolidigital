// registro-de-publicacao.ts — MARCAR "PUBLICADO" SEM MENTIR.
//
// ── O defeito que isto fecha (14/08/2026) ────────────────────────────────────
//
// `PATCH /api/social-posts/<id>` já aceitava `{"status":"published"}`, e isso
// tira a peça do relógio (`publicarAgendados` só olha "scheduled"). Só que:
//
//   • não aceitava `externalPostId` — e é ele que o relatório mensal usa para
//     pedir métrica à Meta (`MetricaDePost.externalPostId`). Peça marcada como
//     publicada sem esse id EXISTE para o calendário e NÃO EXISTE para a
//     medição: um post fantasma dentro do nosso próprio relatório;
//   • não aceitava `publishedAt` nem `permalink` — a peça ficava "no ar" sem
//     hora e sem endereço;
//   • não registrava AUTOR. É o mesmo defeito da aprovação sem autor, que virou
//     regra da casa hoje (`aprovacao-da-peca.ts`): `reviewedBy` só vale quando
//     diz QUEM. Publicação registrada à mão por ninguém não é registro, é
//     carimbo.
//
// ── O que este módulo é ──────────────────────────────────────────────────────
//
// A régua, pura e testável. Não escreve no banco, não conhece HTTP e — de
// propósito e sob teste — **não fala com plataforma nenhuma**. Marcar como
// publicado é escrita no NOSSO banco sobre um post que um humano já publicou
// com as próprias mãos; se este caminho chamasse a Meta, ele publicaria de novo.

/** Quem publicou: o relógio da casa. */
export const AUTOR_DA_ESTEIRA = "esteira";

/** Quem publicou: alguém da casa, à mão. Mesma gramática de `reviewedBy`
 *  (`equipe:<email>`) — e ela é a que a trava de aprovação já sabe ler. */
export function autorDaEquipe(email: string | null | undefined): string {
  const limpo = (email ?? "").trim();
  return limpo ? `equipe:${limpo}` : "equipe:desconhecido";
}

/** Quanto o futuro é tolerado numa data de publicação. Relógio de cliente
 *  adiantado é comum; publicação marcada para semana que vem é mentira. */
export const FOLGA_DE_RELOGIO_MS = 5 * 60_000;

/** O id da publicação na plataforma. Ids do Instagram são numéricos longos;
 *  aceitamos um alfabeto um pouco maior para não brigar com outra rede, e
 *  fechamos tudo que não seja identificador (espaço, aspas, barra, URL). */
const ID_EXTERNO = /^[A-Za-z0-9_.:-]{1,64}$/;

export interface EstadoDaPeca {
  status: string;
  externalPostId: string | null;
}

export interface RegistroLido {
  /** Frase para o operador. Quando existe, NADA é gravado. */
  erro?: string;
  /** O que entra no `update`. Só as chaves que o corpo pediu. */
  dados: {
    externalPostId?: string | null;
    permalink?: string | null;
    publishedAt?: Date | null;
    publishedBy?: string;
  };
  /** Esta escrita É o ato de marcar publicado (transição), e não uma correção
   *  de peça que já estava publicada. */
  marcandoPublicado: boolean;
}

/**
 * Lê os três campos da publicação manual e diz se eles podem ser gravados.
 *
 * `statusPedido` é o status que o PATCH gravaria (ou `null` quando o corpo não
 * mexe no status). Ele entra aqui porque a exigência do `externalPostId` não é
 * sobre o campo — é sobre o ESTADO: só quem declara "isto está no ar" precisa
 * dizer onde.
 */
export function lerRegistroDePublicacao(entrada: {
  body: Record<string, unknown>;
  statusPedido: string | null;
  atual: EstadoDaPeca;
  autor: string;
  agora?: Date;
}): RegistroLido {
  const { body, atual, autor } = entrada;
  const agora = entrada.agora ?? new Date();
  const dados: RegistroLido["dados"] = {};
  const statusFinal = entrada.statusPedido ?? atual.status;
  const marcandoPublicado = statusFinal === "published" && atual.status !== "published";
  const vazio = (): RegistroLido => ({ dados: {}, marcandoPublicado });

  // ── O id da publicação na plataforma ────────────────────────────────────
  if ("externalPostId" in body) {
    const v = body.externalPostId;
    if (v === null || (typeof v === "string" && !v.trim())) {
      dados.externalPostId = null;
    } else if (typeof v === "string" && ID_EXTERNO.test(v.trim())) {
      dados.externalPostId = v.trim();
    } else {
      return {
        ...vazio(),
        erro:
          "O ID da publicação não parece um ID: use o número que a plataforma dá ao post " +
          "(só letras, números, ponto, hífen ou sublinhado). Se você tem o link, cole no campo de link.",
      };
    }
  }

  // ── O endereço público do post ──────────────────────────────────────────
  if ("permalink" in body) {
    const v = body.permalink;
    if (v === null || (typeof v === "string" && !v.trim())) {
      dados.permalink = null;
    } else if (typeof v === "string") {
      const bruto = v.trim();
      let url: URL | null = null;
      try { url = new URL(bruto); } catch { url = null; }
      // Só `https:`. Um `javascript:` gravado aqui vira o `href` de um link que
      // a equipe clica na ficha da peça — o link do post é dado de fora e não
      // pode carregar esquema executável.
      if (!url || url.protocol !== "https:" || bruto.length > 500) {
        return { ...vazio(), erro: "O link da publicação precisa ser um endereço https:// completo." };
      }
      dados.permalink = bruto;
    } else {
      return { ...vazio(), erro: "O link da publicação precisa ser um endereço https:// completo." };
    }
  }

  // ── A hora em que foi ao ar ─────────────────────────────────────────────
  if ("publishedAt" in body) {
    const v = body.publishedAt;
    if (v === null || (typeof v === "string" && !v.trim())) {
      dados.publishedAt = null;
    } else if (typeof v === "string") {
      const d = new Date(v);
      if (isNaN(d.getTime())) {
        return { ...vazio(), erro: "A data da publicação não é uma data válida." };
      }
      if (d.getTime() > agora.getTime() + FOLGA_DE_RELOGIO_MS) {
        return {
          ...vazio(),
          erro: "A data da publicação está no futuro. Isto registra o que JÁ foi ao ar — para o que ainda vai, use a data programada.",
        };
      }
      dados.publishedAt = d;
    } else {
      return { ...vazio(), erro: "A data da publicação não é uma data válida." };
    }
  }

  // ── O PORTÃO DO POST FANTASMA ───────────────────────────────────────────
  // Sem `externalPostId` a peça sai do relógio e some da medição ao mesmo
  // tempo: o calendário diz "publicado", o relatório mensal não a enxerga, e
  // ninguém percebe porque os dois números nunca são olhados juntos.
  const idFinal = "externalPostId" in dados ? dados.externalPostId : atual.externalPostId;
  if (marcandoPublicado && !idFinal) {
    return {
      ...vazio(),
      erro:
        "Para marcar como publicada, informe o ID da publicação. É ele que o relatório mensal usa " +
        "para pedir as métricas à plataforma — sem ele a peça sai do calendário e nunca aparece na medição.",
    };
  }
  // E não se apaga o id de uma peça que continua publicada: seria criar o
  // fantasma por outro caminho, o da correção.
  if (!marcandoPublicado && statusFinal === "published" && "externalPostId" in dados && !idFinal) {
    return {
      ...vazio(),
      erro: "Não dá para apagar o ID de uma peça que continua publicada — sem ele a medição perde o post.",
    };
  }

  if (marcandoPublicado) {
    // Publicação sem hora é registro pela metade. Quem não informou quis dizer
    // "agora"; quem informou `null` de propósito está apagando o dado enquanto
    // declara que está no ar, e isso é recusado.
    if ("publishedAt" in dados && dados.publishedAt === null) {
      return { ...vazio(), erro: "Uma peça publicada precisa da hora em que foi ao ar." };
    }
    if (!("publishedAt" in dados)) dados.publishedAt = agora;
  }

  // O AUTOR. Quem mexeu no registro de publicação assina — marcando ou
  // corrigindo. Registro sem autor é o defeito que a aprovação já teve.
  if (marcandoPublicado || "externalPostId" in dados || "permalink" in dados || "publishedAt" in dados) {
    dados.publishedBy = autor;
  }

  return { dados, marcandoPublicado };
}
