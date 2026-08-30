// portao-de-push.ts — A RÉGUA DO PUSH. Pura: sem git, sem disco, sem processo.
//
// ═══ POR QUE ELA NASCEU SEPARADA DA CASCA ════════════════════════════════════
//
// Ela nasceu JUNTO, dentro de `scripts/reivindicar.mts`, e o CI mostrou o preço
// na primeira rodada (26/08/2026): o teste da catraca chamava o script de
// verdade, no repositório de verdade, e **passou aqui e reprovou no CI**. No
// runner o checkout é raso — `origin/<branch de deploy>` não existe localmente,
// o portão cai no ramo fail-open (correto!) e não barra nada.
//
// A régua estava certa. O TESTE é que media o repositório em volta em vez de
// medir a régua. Régua que só é exercitável montando meia casa é régua que
// ninguém exercita — a mesma lição que `trava-de-fundo.ts`/`medir-fundo.ts` e
// `regua-da-peca-final.ts`/`medir-peca-final.ts` já pagaram nesta árvore.
//
// Aqui mora a DECISÃO. Quem fala com o git é a casca (`reivindicar.mts`).

/** O que o git manda pela entrada padrão do gancho, já recortado. */
export interface RefDePush {
  /** A branch REMOTA de destino, sem `refs/heads/`. */
  remota: string;
}

export interface PedidoDoPortao {
  refs: readonly RefDePush[];
  branchDeDeploy: string;
  /**
   * Os arquivos que este push levaria para a branch de deploy.
   *
   * `null` = **não foi possível comparar** (sem `origin/<branch>` local, que é
   * o caso normal num checkout raso de CI). Ausência de informação não é
   * informação: `null` NUNCA vira lista vazia, e lista vazia NUNCA vira `null`.
   */
  arquivosTocados: readonly string[] | null;
}

export type VereditoDoPortao =
  | { barrar: false; aviso?: string }
  | { barrar: true; foraDaReivindicacao: readonly string[] };

/**
 * A ÚNICA EXCEÇÃO, e ela não é conveniência.
 *
 * `reivindicacoes/` é a única fonte que duas sessões isoladas compartilham, e
 * o próprio `abrir`/`encerrar` publica lá com `git push origin HEAD:<deploy>`.
 * Barrá-la quebraria a trava de colisão da casa — trocaria uma catraca por
 * outra.
 */
export const PASTA_QUE_PASSA_DIRETO = "reivindicacoes/";

/**
 * Este push pisa na branch de deploy com algo que não é reivindicação?
 *
 * ⚠️ FAIL-OPEN quando não se pode comparar, e isso é regra desta casa, não
 * descuido: portão que barra por falta de informação ensina todo mundo a usar
 * `--no-verify`, e aí ele deixa de existir. O aviso sai; a barra, não.
 */
export function vereditoDoPortao(p: PedidoDoPortao): VereditoDoPortao {
  const vaiParaODeploy = p.refs.some((r) => r.remota === p.branchDeDeploy);
  if (!vaiParaODeploy) return { barrar: false };

  if (p.arquivosTocados === null) {
    return {
      barrar: false,
      aviso:
        `não consegui comparar com a branch de deploy (sem \`origin/${p.branchDeDeploy}\` local). ` +
        "Não barro por falta de informação — mas confira que este push é um merge de PR.",
    };
  }

  const foraDaReivindicacao = p.arquivosTocados.filter(
    (f) => !f.startsWith(PASTA_QUE_PASSA_DIRETO),
  );
  if (foraDaReivindicacao.length === 0) return { barrar: false };
  return { barrar: true, foraDaReivindicacao };
}

/** As refs, recortadas da entrada padrão que o git dá ao gancho.
 *  Formato de cada linha: `<local ref> <local sha> <remote ref> <remote sha>`. */
export function refsDaEntradaPadrao(bruto: string): RefDePush[] {
  // Ref de DELEÇÃO (`git push origin :branch`) tem o sha remoto zerado e a ref
  // local vazia — o git a manda como `(delete)`. Ela não leva arquivo nenhum,
  // então não é assunto deste portão; o filtro de `refs/` abaixo já a recorta.
  const refs: RefDePush[] = [];
  for (const linha of bruto.split("\n")) {
    const partes = linha.trim().split(/\s+/);
    if (partes.length < 4) continue;
    // A terceira coluna é uma REF, e ref começa com `refs/`. Contar colunas não
    // basta: qualquer frase de quatro palavras passaria e viraria uma branch
    // inventada. Régua que aceita lixo é régua que um dia barra o inocente —
    // ou, pior, deixa passar o culpado por medir a coluna errada.
    if (!partes[2]!.startsWith("refs/")) continue;
    // O git manda o NOME DO REMOTO como primeiro ARGUMENTO (`origin`), nunca a
    // branch: `git push origin HEAD:outra-branch` tem `origin` ali. Quem sabe o
    // destino real é esta terceira coluna. Ler o argumento seria uma catraca
    // que mede a coisa errada.
    const remota = partes[2]!.replace(/^refs\/heads\//, "");
    if (remota) refs.push({ remota });
  }
  return refs;
}
