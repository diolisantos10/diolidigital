// ── O CABEÇALHO DO PORTAL — a regra virou código ────────────────────────────
//
// Ordem do CEO (handoff do dashboard do cliente, 14/08/2026):
//
//   1. símbolo ou logomarca do cliente;
//   2. nome da marca AO LADO do símbolo;
//   3. ABAIXO, o nome da tela ("Visão Geral").
//
// E a proibição, com todas as letras: **nunca** "Visão Geral da Marca",
// "Visão Geral do Cliente", "Visão Geral da Foocci". Nenhuma preposição é
// acrescentada ao nome da marca, em lugar nenhum.
//
// Isto mora num módulo próprio, e não dentro do JSX, por um motivo só: regra
// que só existe no comentário de um componente volta a ser quebrada na próxima
// tela que alguém escrever. Aqui ela tem teste
// (`__tests__/portal/cabecalho-do-portal.test.ts`) e uma função que se recusa a
// montar o título proibido — guardrail 4 do CLAUDE.md: prompt é aviso, código é
// trava.

/** As três peças do cabeçalho, separadas. Nunca uma frase só. */
export interface CabecalhoDoPortal {
  /** O símbolo do cliente — a inicial da marca, derivada do cadastro. */
  simbolo: string;
  /** O nome da marca, exatamente como está no cadastro. Sem prefixo, sem sufixo. */
  marca: string;
  /** O nome da TELA. Nunca carrega o nome da marca dentro. */
  tela: string;
}

/**
 * A colagem proibida: nome de tela + preposição + qualquer coisa.
 * Casada no título da tela, não no nome da marca — "Visão Geral" é legítimo,
 * "Visão Geral da Foocci" não é.
 */
const COLAGEM_PROIBIDA = /\b(?:da|do|das|dos|de)\s+\S/i;

// O símbolo vem do MESMO lugar que o servidor usa para montar a vista — uma
// função só, para o cabeçalho da tela e o payload nunca discordarem sobre qual
// é a inicial da marca.
//
// Por que a inicial e não um arquivo de logo: o cadastro (`Client`) não tem
// campo de logomarca hoje. Um placeholder genérico ("🏢") apagaria a identidade
// do cliente da própria casa dele; a inicial da marca É a marca, em miniatura,
// e muda sozinha quando o cadastro muda. Quando o cadastro ganhar campo de
// logo, é aqui que ele entra — e a tela inteira acompanha.
export { simboloDaMarca } from "./vista-do-cliente";

import { simboloDaMarca } from "./vista-do-cliente";

/**
 * Monta o cabeçalho. **Recusa** o título colado — não corrige em silêncio,
 * porque silêncio deixa a mentira passar no próximo deploy.
 *
 * @throws se o nome da tela contiver a colagem proibida.
 */
export function cabecalhoDoPortal(nomeDoCliente: string, nomeDaTela: string): CabecalhoDoPortal {
  const tela = (nomeDaTela ?? "").trim();
  if (COLAGEM_PROIBIDA.test(tela)) {
    throw new Error(
      `Nome de tela inválido: "${tela}". O nome da tela não carrega o nome da marca `
      + `nem preposição — o cabeçalho é símbolo + marca, e a tela ABAIXO deles.`,
    );
  }
  return {
    simbolo: simboloDaMarca(nomeDoCliente),
    // O nome vem do cadastro, cru. Nenhuma preposição, nenhum "Portal da".
    marca: (nomeDoCliente ?? "").trim(),
    tela,
  };
}
