// falta-para-publicar.ts — O QUE FALTA, DE VERDADE, PARA ESTE CLIENTE PUBLICAR.
//
// ── POR QUE EXISTE (CEO, 04/10/2026) ─────────────────────────────────────────
// "Deixar claro na tela do cliente um painel 'Falta para publicar' com os
// itens reais, cada um com o botão que resolve." Os itens moravam espalhados
// — material numa tela, pacote noutra, conexão no portal, freio no Railway,
// IA no cofre — e quem queria saber "por que o Sushi Cazza não posta" tinha
// de juntar cinco leituras.
//
// Cada item é MEDIDO com a mesma função que a produção usa (nada de segunda
// régua): o logo e as fotos pelo que a peça enxerga, o pacote pelo leitor do
// pacote, o freio pelo portão da prontidão, a IA pelo cofre. O Instagram é o
// DECLARADO na conexão (escopo gravado); a medição ao vivo na Meta continua em
// `/api/meta/prontidao?meta=1` — é chamada de rede e não roda a cada tela.

import { prisma } from "@/lib/db/client";
import { materiaisDeMarca } from "@/lib/agency/esteira/material-do-drive";
import { lerPacote } from "@/lib/agency/esteira/pacote-da-marca";
import { materiaisParaReciclar, INTERVALO_PADRAO_DE_REPETICAO_DIAS } from "@/lib/agency/esteira/calendario-editorial";
import { portaoDoFreioDeEmergencia } from "@/lib/agency/esteira/prontidao-de-publicacao";
import { cofreLigado } from "@/lib/ai/cofre";

export type ChaveDoItem = "logo" | "fotos" | "pacote" | "cardapio" | "instagram" | "freio" | "ia";

export interface ItemQueFalta {
  chave: ChaveDoItem;
  rotulo: string;
  pronto: boolean;
  /** O que foi medido, em português simples. */
  detalhe: string;
  /** Quem resolve: a equipe pela tela, o CEO (credencial/trava), ou a Control Room. */
  quemResolve: "equipe" | "ceo" | "control_room";
  /** O botão que resolve: rótulo + destino (aba da página do cliente ou rota). */
  acao: { rotulo: string; destino: string } | null;
}

export interface FaltaParaPublicar {
  itens: ItemQueFalta[];
  faltam: number;
  /** Uma frase: o que impede de publicar hoje. */
  resumo: string;
}

const ESCOPO_DE_PUBLICAR = "instagram_content_publish";

function escopos(json: string | null | undefined): string[] {
  try {
    const v = JSON.parse(json || "[]") as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function faltaParaPublicar(workspaceId: string, clientId: string): Promise<FaltaParaPublicar> {
  const aba = (tab: string) => `/agency/clients/${clientId}?tab=${tab}`;
  const [cliente, materiais, conexoes] = await Promise.all([
    prisma.client.findFirst({ where: { id: clientId, workspaceId }, select: { pacoteJson: true } }),
    materiaisDeMarca(clientId).catch(() => []),
    prisma.metaConnection.findMany({
      where: { workspaceId, clientId, platform: "instagram" },
      select: { status: true, scopes: true },
    }).catch(() => []),
  ]);
  const pacoteLido = lerPacote(cliente?.pacoteJson);
  const intervalo = pacoteLido.ok ? (pacoteLido.pacote.intervaloDeRepeticaoDias ?? INTERVALO_PADRAO_DE_REPETICAO_DIAS) : INTERVALO_PADRAO_DE_REPETICAO_DIAS;
  // Fotos que a produção REALMENTE consegue usar hoje (sem logo, referência,
  // manual; e respeitando o intervalo de repetição) — a mesma função do gerador.
  const fotos = await materiaisParaReciclar(clientId, new Date(), intervalo).catch(() => []);

  const itens: ItemQueFalta[] = [];

  const temLogo = materiais.some((m) => m.papel === "logo");
  itens.push({
    chave: "logo", rotulo: "Logo", pronto: temLogo, quemResolve: "equipe",
    detalhe: temLogo ? "Logo enviado." : "Sem logo: a peça sai com o nome escrito em fonte comum.",
    acao: temLogo ? null : { rotulo: "Subir o logo", destino: `${aba("branding")}#material-de-marca` },
  });

  // Quantas fotos o mês pede para não repetir antes do intervalo: o que entra
  // em `intervalo` dias de peças com foto. Estimativa declarada, não promessa.
  let pedidas = 0;
  if (pacoteLido.ok) {
    const p = pacoteLido.pacote;
    const storiesPorDia = p.stories ? Math.max(0, p.stories.porDiaMax - p.stories.combosMinPorDia) : 0;
    const feedPorDia = p.postsPorSemana / 7;
    pedidas = Math.ceil((storiesPorDia + feedPorDia) * intervalo);
  }
  const fotosBastam = fotos.length > 0 && (pedidas === 0 || fotos.length >= pedidas);
  itens.push({
    chave: "fotos", rotulo: "Fotos de produto e de ambiente", pronto: fotosBastam, quemResolve: "equipe",
    detalhe:
      `${fotos.length} foto(s) utilizável(is) hoje` +
      (pedidas ? `; para não repetir a mesma foto em menos de ${intervalo} dias, o pacote pede cerca de ${pedidas}.` : "."),
    acao: fotosBastam ? null : { rotulo: "Subir fotos", destino: `${aba("branding")}#material-de-marca` },
  });

  itens.push({
    chave: "pacote", rotulo: "Pacote (quantidade, dias, horários)", pronto: pacoteLido.ok, quemResolve: "equipe",
    detalhe: pacoteLido.ok ? "Pacote definido." : pacoteLido.motivo,
    acao: pacoteLido.ok ? null : { rotulo: "Definir o pacote", destino: aba("social") },
  });

  const combos = pacoteLido.ok ? (pacoteLido.pacote.cardapio?.combos ?? []) : [];
  const comPreco = combos.filter((c) => c.preco.trim()).length;
  const cardapioPronto = combos.length > 0;
  itens.push({
    chave: "cardapio", rotulo: "Cardápio (combos e preços)", pronto: cardapioPronto, quemResolve: "equipe",
    detalhe: cardapioPronto
      ? `${combos.length} combo(s), ${comPreco} com preço.`
      : "Sem cardápio: o story de combo sai como \"um combo da casa\", sem nome e sem preço.",
    acao: cardapioPronto ? null : { rotulo: "Cadastrar combos", destino: aba("social") },
  });

  const viva = conexoes.find((c) => c.status === "connected");
  const publica = !!viva && escopos(viva.scopes).includes(ESCOPO_DE_PUBLICAR);
  itens.push({
    chave: "instagram", rotulo: "Instagram conectado com permissão de publicar", pronto: publica, quemResolve: "ceo",
    detalhe: !viva
      ? "Nenhum Instagram conectado a este cliente."
      : publica
        ? "Conectado, com a permissão de publicar declarada (a conferência ao vivo na Meta é na prontidão)."
        : "Conectado, mas SEM a permissão de publicar — precisa reconectar aceitando todas as permissões.",
    acao: publica ? null : { rotulo: viva ? "Reconectar o Instagram" : "Conectar o Instagram", destino: aba("social") },
  });

  const freio = portaoDoFreioDeEmergencia();
  itens.push({
    chave: "freio", rotulo: "Trava de publicação da casa", pronto: freio.estado === "passou", quemResolve: "ceo",
    detalhe: freio.estado === "passou" ? "Solta: nada é segurado pela casa." : "PUXADA: nada sai, nem peça aprovada.",
    acao: null,
  });

  const ia = cofreLigado();
  itens.push({
    chave: "ia", rotulo: "IA da Control Room", pronto: ia, quemResolve: "control_room",
    detalhe: ia
      ? "Ligada."
      : "Aguardando a IA da Control Room. Plano B no ar: stories de combo e de foto real saem sem IA, de modelo fixo.",
    acao: null,
  });

  const faltando = itens.filter((i) => !i.pronto);
  return {
    itens,
    faltam: faltando.length,
    resumo: faltando.length === 0 ? "Nada falta: pronto para publicar." : `Falta: ${faltando.map((i) => i.rotulo).join(" · ")}.`,
  };
}
