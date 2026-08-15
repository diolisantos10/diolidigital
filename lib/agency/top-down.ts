// top-down.ts — a decisão do CEO, dentro do sistema.
//
// O QUE ACONTECEU PARA ISTO EXISTIR (15/08/2026):
// O freio da publicação orgânica morava numa variável de ambiente
// (`PUBLICACAO_ORGANICA`). Funcionava, e estava no lugar errado por três
// motivos:
//
//   1. **Só o operador do Railway decide.** O CEO precisava pedir a alguém, ou
//      entrar num painel de infraestrutura para exercer uma autoridade que é
//      dele. Autoridade que depende de intermediário não é autoridade.
//   2. **A decisão não fica registrada.** Variável de ambiente não guarda quem
//      virou, quando, nem por quê. Amanhã ninguém sabe se aquilo foi decisão ou
//      descuido — e "o freio está solto desde quando?" vira arqueologia.
//   3. **Trocar exige redeploy.** Freio de emergência que demora um deploy para
//      ser puxado não é freio de emergência.
//
// Ordem literal do CEO: *"precisamos criar um botão para isso no sistema"*,
// *"chamado TOP DOWN"*.
//
// O QUE É UM TOP DOWN: uma decisão que **desce de cima e destrava**. Ela não
// inventa permissão nova nem apaga trava nenhuma — ela responde, dentro do
// sistema e com nome e data, a pergunta que a trava faz. A trava continua
// existindo e continua recusando por conta própria quando ninguém decidiu.
//
// ─── AS PROPRIEDADES, E NENHUMA É OPCIONAL ──────────────────────────────────
//
// • **FAIL-CLOSED.** Sem linha no banco = não decidido = BARRADO. Ausência de
//   decisão nunca vira permissão, e erro de leitura do banco também barra. Esta
//   é a propriedade que o desenho inteiro protege: um TOP DOWN que abre sozinho
//   quando o banco pisca é pior que não ter TOP DOWN.
// • **NOMINAL.** `motivo` e `decididoPor` são obrigatórios. Decisão sem dono e
//   sem porquê é exatamente o que a variável de ambiente já fazia — e é o que
//   esta mudança veio desfazer.
// • **REVERSÍVEL NA HORA.** Desligar é uma escrita, não um deploy.
// • **NÃO É AUTORIZAÇÃO DA PEÇA.** Soltar o freio devolve a decisão a quem ela
//   pertence — o cliente dono da peça, peça por peça. Ler TOP DOWN como "pode
//   publicar tudo" é o erro que o freio existe para impedir.
//
// A variável de ambiente continua sendo lida, e continua podendo liberar. Ela
// vira o caminho de emergência de quem tem o Railway e não tem a tela — não o
// caminho normal. Quem manda, quando os dois falam, é quem LIBERA: um freio de
// emergência que ignora o operador que já o soltou seria uma surpresa no pior
// momento possível.

import { prisma } from "@/lib/db/client";

/** As decisões que o CEO pode tomar pela tela. Uma chave por trava. */
export const DECISOES_TOP_DOWN = {
  publicacao_organica: {
    chave: "publicacao_organica",
    titulo: "Publicação orgânica",
    /** O que o CEO lê antes de decidir. Linguagem de negócio, não de código. */
    oQueLibera:
      "Solta o freio geral da publicação. Com ele puxado, nada sai — nem peça " +
      "que o cliente já aprovou.",
    oQueNaoLibera:
      "NÃO autoriza publicar sozinho. Cada peça continua saindo só com a " +
      "aprovação do cliente dono dela.",
    aviso:
      "As permissões da Meta estão em acesso PADRÃO, que só alcança conta da " +
      "própria casa. Publicar no perfil de um cliente exige App Review. " +
      "Soltar antes disso expõe o app da casa.",
  },
} as const;

export type ChaveTopDown = keyof typeof DECISOES_TOP_DOWN;

/** Onde a decisão mora: escopo global, uma linha por chave. */
const ESCOPO = "global";
const PREFIXO = "topdown:";

export type DecisaoTopDown = {
  chave: ChaveTopDown;
  ligada: boolean;
  motivo: string | null;
  decididoPor: string | null;
  em: Date | null;
};

/**
 * A decisão vale? Fail-closed em todos os caminhos: sem linha, erro de banco,
 * chave desconhecida — tudo devolve `false`.
 */
export async function topDownLigado(chave: ChaveTopDown): Promise<boolean> {
  try {
    const linha = await prisma.flagV2.findUnique({
      where: { chave_escopo: { chave: PREFIXO + chave, escopo: ESCOPO } },
    });
    return linha?.ligada === true;
  } catch {
    // Banco fora do ar não solta freio. Ver FAIL-CLOSED no cabeçalho.
    return false;
  }
}

/** O estado completo, para a tela mostrar quem decidiu e quando. */
export async function lerDecisao(chave: ChaveTopDown): Promise<DecisaoTopDown> {
  try {
    const linha = await prisma.flagV2.findUnique({
      where: { chave_escopo: { chave: PREFIXO + chave, escopo: ESCOPO } },
    });
    return {
      chave,
      ligada: linha?.ligada === true,
      motivo: linha?.motivo ?? null,
      decididoPor: linha?.decididoPor ?? null,
      em: linha?.em ?? null,
    };
  } catch {
    return { chave, ligada: false, motivo: null, decididoPor: null, em: null };
  }
}

/**
 * Registra a decisão. `motivo` e `decididoPor` são obrigatórios nos DOIS
 * sentidos — desligar também é decisão, e "por que foi puxado de volta?" é uma
 * pergunta que alguém vai fazer amanhã.
 */
export async function decidir(entrada: {
  chave: ChaveTopDown;
  ligada: boolean;
  motivo: string;
  decididoPor: string;
}): Promise<DecisaoTopDown> {
  const motivo = entrada.motivo.trim();
  const decididoPor = entrada.decididoPor.trim();
  if (!motivo) throw new Error("motivo é obrigatório — decisão sem porquê não se registra");
  if (!decididoPor) throw new Error("decididoPor é obrigatório");

  const linha = await prisma.flagV2.upsert({
    where:  { chave_escopo: { chave: PREFIXO + entrada.chave, escopo: ESCOPO } },
    create: { chave: PREFIXO + entrada.chave, escopo: ESCOPO, ligada: entrada.ligada, motivo, decididoPor },
    update: { ligada: entrada.ligada, motivo, decididoPor, em: new Date() },
  });

  return {
    chave: entrada.chave,
    ligada: linha.ligada,
    motivo: linha.motivo,
    decididoPor: linha.decididoPor,
    em: linha.em,
  };
}
