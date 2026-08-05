// O EXECUTOR — junta as varreduras, grava a noite e compara com a anterior.
//
// Nada aqui julga nada. Julgamento é a segunda metade do protocolo: uma sessão
// do Diretor lê esta saída e escreve o relatório de negócio. Misturar as duas
// metades é o erro que o kit manda evitar — se a IA coletar, a comparação com
// ontem morre.

import { varrerTrabalhoInvisivel } from "./varreduras/trabalho-invisivel";
import { varrerIdSemDono } from "./varreduras/id-sem-dono";
import { varrerPromessaNaoCumprida } from "./varreduras/promessa-nao-cumprida";
import { varrerEstadoMorto } from "./varreduras/estado-morto";
import { varrerPortaAberta } from "./varreduras/porta-aberta";
import { comparar, type Comparacao } from "./comparar";
import { coletaAnterior, commitAtual, gravarColeta, hojeEmSaoPaulo } from "./registro";
import type { Coleta, ResultadoDeVarredura } from "./tipos";

/** A metade de código: os cinco padrões do kit traduzidos para este repositório. */
export function coletarCodigo(agora: Date = new Date()): Coleta {
  const varreduras: ResultadoDeVarredura[] = [];
  const rodar = (f: () => ResultadoDeVarredura, nome: string) => {
    try {
      varreduras.push(f());
    } catch (erro) {
      // Varredura que estourou volta CEGA, com o motivo. Nunca some em silêncio:
      // silêncio de varredura quebrada é indistinguível de sistema saudável.
      varreduras.push({
        varredura: nome,
        padrao: "trabalho-invisivel",
        status: "cega",
        motivo: `varredura estourou: ${(erro as Error).message}`,
        achados: [],
        medidas: {},
      });
    }
  };

  rodar(varrerTrabalhoInvisivel, "trabalho-invisivel");
  rodar(varrerIdSemDono, "id-sem-dono");
  rodar(varrerPromessaNaoCumprida, "promessa-nao-cumprida");
  rodar(varrerEstadoMorto, "estado-morto");
  rodar(varrerPortaAberta, "porta-aberta");

  return {
    data: hojeEmSaoPaulo(agora),
    em: agora.toISOString(),
    commit: commitAtual(),
    metade: "codigo",
    varreduras,
  };
}

export type Noite = { coleta: Coleta; comparacao: Comparacao; arquivo: string };

export function rodarMetadeDeCodigo(agora: Date = new Date()): Noite {
  const coleta = coletarCodigo(agora);
  const anterior = coletaAnterior("codigo", coleta.data);
  const arquivo = gravarColeta(coleta);
  return { coleta, comparacao: comparar(coleta, anterior), arquivo };
}

/** Guarda a metade de dados que veio da produção (a coleta roda lá, porque o
 *  banco é de lá) e compara com a anterior. */
export function guardarMetadeDeDados(coleta: Coleta): Noite {
  const anterior = coletaAnterior("dados", coleta.data);
  const arquivo = gravarColeta(coleta);
  return { coleta, comparacao: comparar(coleta, anterior), arquivo };
}

/** O resumo em texto — determinístico, para o Diretor LER e então escrever o
 *  relatório do CEO. Não é o relatório: é a evidência dele. */
export function resumir(n: Noite): string {
  const l: string[] = [];
  const { coleta: c, comparacao: k } = n;
  l.push(`RAIO-X ${c.metade.toUpperCase()} — ${c.data} (commit ${c.commit})`);
  if (k.cegas.length > 0) {
    l.push("");
    l.push("NÃO SEI (varredura cega — não é 'está tudo bem'):");
    for (const g of k.cegas) l.push(`  · ${g.varredura}: ${g.motivo}`);
  }
  const bloco = (titulo: string, itens: typeof k.novos) => {
    if (itens.length === 0) return;
    l.push("");
    l.push(`${titulo} (${itens.length}):`);
    for (const a of itens) l.push(`  [${a.gravidade}] ${a.titulo}\n      ${a.evidencia}`);
  };
  bloco("NOVOS desde a coleta anterior", k.novos);
  bloco("PERSISTENTES", k.persistentes);
  bloco("SUMIRAM (resolvidos)", k.resolvidos);
  bloco("SUMIRAM SEM QUEM OLHASSE (não conte como resolvido)", k.desconhecidos);
  const variacoes = Object.entries(k.variacoes).filter(([, v]) => v.delta !== 0);
  if (variacoes.length > 0) {
    l.push("");
    l.push("MEDIDAS QUE MUDARAM:");
    for (const [nome, v] of variacoes) l.push(`  · ${nome}: ${v.ontem} → ${v.hoje} (${v.delta > 0 ? "+" : ""}${v.delta})`);
  }
  if (!n.comparacao.novos.length && !n.comparacao.persistentes.length && !k.cegas.length) {
    l.push("");
    l.push("Nenhum achado, e nenhuma varredura cega.");
  }
  return l.join("\n");
}
