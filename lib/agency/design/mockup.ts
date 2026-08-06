// mockup.ts — A BIBLIOTECA DE MOCKUP. E a trava que impede o mockup de mentir.
//
// ─── Por que existe (CEO, 06/08/2026) ────────────────────────────────────────
//
// `docs/projetos/foocci/comparativo-06-08.md`: o produto do cliente aparece em
// **7 de 10** peças de referência e em **0 de 6** das nossas. A diferença não é
// talento nem gosto — é que a referência tem moldura de celular, card de painel,
// balão de conversa e quadro de números, e nós tínhamos "foto com frase".
// Sem esses blocos, a peça de um SaaS de restaurante é indistinguível da peça de
// qualquer software de restaurante do mundo.
//
// ─── E por que ela vem COM TRAVA, não só com HTML ────────────────────────────
//
// O mesmo comparativo registra o risco que NÃO se copia: nas peças de
// referência, as telas de app são **desenhadas**, e números como "1.248" e
// "+12% vs ontem" são **inventados**. Publicado no perfil de um cliente pagante,
// isso é promessa visual do que o produto entrega — e quem baixa e vê outra
// coisa sente. É a alucinação saindo pelo lado que o piso de verdade não olha:
// o piso confere TEXTO, e ninguém conferia PIXEL.
//
// A regra da casa, mecanizada aqui: **mockup sai de captura real ou sai
// rotulado como ilustração.** Não existe terceiro caminho, e a função se recusa
// a montar o bloco quando o chamador não escolhe um dos dois. Trava, não aviso.
//
// ─── Todo texto do mockup é texto CONFERIDO ──────────────────────────────────
//
// O balão de conversa e o card de painel carregam texto — e texto na peça é o
// que o renderizador confere contra o DOM (`renderizar.ts`). Se o mockup
// pintasse texto por fora dessa lista, ele seria um canal para colocar frase na
// arte sem passar por conferência nenhuma: exatamente o buraco que o motor de
// molde foi construído para fechar. Por isso `montarMockup` devolve o HTML **e**
// os `TextoDaPeca` juntos, e quem não juntar os dois não compila.

import { escaparHtml, type TextoDaPeca } from "./texto-da-peca";

// ── O que pode entrar num mockup ─────────────────────────────────────────────

/**
 * A procedência do bloco. Não tem default: quem monta um mockup DECLARA de onde
 * ele veio. Campo opcional com default viraria "captura real" por descuido.
 */
export type ProcedenciaDoMockup =
  /** Captura de tela REAL do produto do cliente, coletada no onboarding
   *  (`lib/agency/esteira/material-de-produto.ts`). */
  | "captura_real"
  /** Desenho nosso. Sai com selo visível de ilustração na própria peça — não
   *  numa legenda que ninguém lê, e não num campo de metadado. */
  | "ilustracao";

/** Um número que aparece na peça. `origem` é obrigatória e é o que separa
 *  "dado do cliente" de "número bonito". */
export interface NumeroDaCena {
  rotulo: string;
  valor: string;
  /** De onde saiu este número, em uma frase. Vazio = o bloco não é montado. */
  origem: string;
}

export interface MensagemDaConversa {
  /** "cliente" fala à esquerda; "marca" à direita, na cor da marca. */
  de: "cliente" | "marca";
  texto: string;
}

export type BlocoDeMockup =
  /** Moldura de celular com uma captura dentro. */
  | { tipo: "celular"; procedencia: ProcedenciaDoMockup; imagem: string | null; legenda?: string | null }
  /** Card de painel: linhas de rótulo → valor. */
  | { tipo: "painel"; procedencia: ProcedenciaDoMockup; titulo: string; linhas: NumeroDaCena[] }
  /** Balão de conversa (a assinatura do feed da Foocci). */
  | { tipo: "conversa"; procedencia: ProcedenciaDoMockup; mensagens: MensagemDaConversa[] }
  /** Quadro de números — a prova visual. */
  | { tipo: "numeros"; procedencia: ProcedenciaDoMockup; numeros: NumeroDaCena[] };

export type MotivoDeRecusaDeMockup =
  /** `captura_real` sem imagem: seria uma moldura vazia se passando por produto. */
  | "captura_declarada_sem_imagem"
  /** Número sem `origem` declarada. É o "1.248" que ninguém sabe de onde veio. */
  | "numero_sem_origem"
  /** Bloco sem conteúdo nenhum. */
  | "bloco_vazio";

export type ResultadoDoMockup =
  | { ok: true; html: string; textos: TextoDaPeca[] }
  | { ok: false; motivo: MotivoDeRecusaDeMockup; detalhe: string };

/** O selo que aparece NA PEÇA quando o bloco é desenho nosso. Curto porque
 *  precisa caber, e explícito porque precisa ser lido. */
export const SELO_DE_ILUSTRACAO = "ilustração";

// ── A conferência, antes de qualquer pixel ───────────────────────────────────

function conferirNumeros(numeros: NumeroDaCena[]): MotivoDeRecusaDeMockup | null {
  if (numeros.length === 0) return "bloco_vazio";
  for (const n of numeros) {
    if (!n.origem || n.origem.trim().length < 3) return "numero_sem_origem";
    if (!n.valor?.trim() || !n.rotulo?.trim()) return "bloco_vazio";
  }
  return null;
}

const DETALHE: Record<MotivoDeRecusaDeMockup, string> = {
  captura_declarada_sem_imagem:
    "O bloco foi declarado como captura real e não veio imagem. Moldura de celular vazia com o nome do cliente em cima é o produto sendo prometido sem existir na peça — ou entra a captura coletada no onboarding, ou o bloco sai como ilustração.",
  numero_sem_origem:
    "Um número da cena não declarou origem. Número na arte é afirmação de resultado: sem saber de onde saiu, ninguém consegue conferir, e o cliente não tem como saber que a agência inventou.",
  bloco_vazio:
    "O bloco não tem conteúdo. Mockup vazio ocupa o lugar do produto e não mostra produto nenhum.",
};

// ── Os quatro blocos ─────────────────────────────────────────────────────────

interface Paleta {
  primaria: string;
  secundaria: string;
  tinta: string;
}

function selo(procedencia: ProcedenciaDoMockup): { html: string; textos: TextoDaPeca[] } {
  if (procedencia === "captura_real") return { html: "", textos: [] };
  return {
    html: `<div class="mk-selo" data-papel="selo" data-texto-exato="${escaparHtml(SELO_DE_ILUSTRACAO)}">${escaparHtml(SELO_DE_ILUSTRACAO)}</div>`,
    textos: [{ papel: "selo", texto: SELO_DE_ILUSTRACAO }],
  };
}

function textoMk(papel: TextoDaPeca["papel"], texto: string, classe: string): { html: string; texto: TextoDaPeca } {
  const t = texto.trim();
  return {
    html: `<div class="${classe}" data-papel="${papel}" data-texto-exato="${escaparHtml(t)}">${escaparHtml(t)}</div>`,
    texto: { papel, texto: t },
  };
}

/**
 * Monta um bloco de mockup.
 *
 * NUNCA lança. Recusa com motivo — e a recusa é o comportamento correto: uma
 * peça sóbria sem mockup é infinitamente melhor que uma peça com um painel de
 * números inventados assinado pelo cliente.
 */
export function montarMockup(bloco: BlocoDeMockup, paleta: Paleta): ResultadoDoMockup {
  const s = selo(bloco.procedencia);
  const textos: TextoDaPeca[] = [...s.textos];

  switch (bloco.tipo) {
    case "celular": {
      if (bloco.procedencia === "captura_real" && !bloco.imagem) {
        return { ok: false, motivo: "captura_declarada_sem_imagem", detalhe: DETALHE.captura_declarada_sem_imagem };
      }
      const legenda = bloco.legenda?.trim()
        ? textoMk("apoio", bloco.legenda, "mk-legenda")
        : null;
      if (legenda) textos.push(legenda.texto);
      const tela = bloco.imagem
        ? `<div class="mk-tela" style="background-image:url('${escaparHtml(bloco.imagem)}')"></div>`
        : `<div class="mk-tela mk-tela-vazia"></div>`;
      return {
        ok: true,
        textos,
        html: `<div class="mk mk-celular">${s.html}<div class="mk-moldura"><div class="mk-notch"></div>${tela}</div>${legenda?.html ?? ""}</div>`,
      };
    }

    case "painel": {
      const erro = conferirNumeros(bloco.linhas);
      if (erro) return { ok: false, motivo: erro, detalhe: DETALHE[erro] };
      const titulo = textoMk("apoio", bloco.titulo, "mk-painel-titulo");
      textos.push(titulo.texto);
      const linhas = bloco.linhas.map((l) => {
        const rotulo = textoMk("apoio", l.rotulo, "mk-rotulo");
        const valor = textoMk("apoio", l.valor, "mk-valor");
        textos.push(rotulo.texto, valor.texto);
        return `<div class="mk-linha">${rotulo.html}${valor.html}</div>`;
      });
      return {
        ok: true,
        textos,
        html: `<div class="mk mk-painel">${s.html}${titulo.html}<div class="mk-linhas">${linhas.join("")}</div></div>`,
      };
    }

    case "conversa": {
      if (bloco.mensagens.length === 0 || bloco.mensagens.some((m) => !m.texto?.trim())) {
        return { ok: false, motivo: "bloco_vazio", detalhe: DETALHE.bloco_vazio };
      }
      const baloes = bloco.mensagens.map((m) => {
        const t = textoMk("apoio", m.texto, `mk-balao mk-balao-${m.de}`);
        textos.push(t.texto);
        return t.html;
      });
      return {
        ok: true,
        textos,
        html: `<div class="mk mk-conversa">${s.html}${baloes.join("")}</div>`,
      };
    }

    case "numeros": {
      const erro = conferirNumeros(bloco.numeros);
      if (erro) return { ok: false, motivo: erro, detalhe: DETALHE[erro] };
      const celulas = bloco.numeros.map((n) => {
        const valor = textoMk("apoio", n.valor, "mk-num-valor");
        const rotulo = textoMk("apoio", n.rotulo, "mk-num-rotulo");
        textos.push(valor.texto, rotulo.texto);
        return `<div class="mk-num">${valor.html}${rotulo.html}</div>`;
      });
      return {
        ok: true,
        textos,
        html: `<div class="mk mk-numeros">${s.html}${celulas.join("")}</div>`,
      };
    }
  }
}

/**
 * O CSS dos blocos. Sai daqui, uma vez, e não de cada peça — decidir sozinha 36
 * vezes foi o que produziu 36 telas iguais e, ao mesmo tempo, 36 layouts
 * ligeiramente diferentes. Nenhuma fonte de rede, nenhum `text-transform`
 * (as duas regras do `molde.ts`, que valem aqui igual).
 */
export function cssDoMockup(p: Paleta): string {
  return `
  .mk { position:relative; display:flex; flex-direction:column; gap:14px; }
  .mk-selo {
    position:absolute; top:-14px; right:0;
    font-size:18px; font-weight:700; letter-spacing:2px;
    background:${p.secundaria}; color:${p.tinta};
    border-radius:999px; padding:4px 14px; opacity:.95;
  }
  .mk-moldura {
    position:relative; width:300px; height:600px; border-radius:38px;
    border:10px solid ${p.tinta}; background:${p.primaria};
    overflow:hidden; box-shadow:0 24px 60px rgba(0,0,0,.35);
  }
  .mk-notch {
    position:absolute; top:0; left:50%; transform:translateX(-50%);
    width:110px; height:22px; background:${p.tinta};
    border-bottom-left-radius:14px; border-bottom-right-radius:14px; z-index:2;
  }
  .mk-tela { position:absolute; inset:0; background-size:cover; background-position:top center; }
  .mk-tela-vazia { background:${p.secundaria}; opacity:.35; }
  .mk-legenda { font-size:22px; opacity:.85; max-width:300px; }
  .mk-painel {
    background:${p.tinta}; color:${p.primaria};
    border-radius:22px; padding:26px 28px; gap:18px; min-width:460px;
    box-shadow:0 18px 48px rgba(0,0,0,.28);
  }
  .mk-painel-titulo { font-size:26px; font-weight:700; }
  .mk-linhas { display:flex; flex-direction:column; gap:12px; }
  .mk-linha { display:flex; align-items:baseline; justify-content:space-between; gap:20px; }
  .mk-rotulo { font-size:22px; opacity:.7; }
  .mk-valor { font-size:30px; font-weight:800; }
  .mk-conversa { gap:12px; align-items:flex-start; }
  .mk-balao {
    font-size:24px; line-height:1.3; padding:16px 20px; max-width:520px;
    border-radius:20px; word-break:break-word;
  }
  .mk-balao-cliente { background:${p.tinta}; color:${p.primaria}; border-bottom-left-radius:6px; align-self:flex-start; }
  .mk-balao-marca { background:${p.secundaria}; color:${p.tinta}; border-bottom-right-radius:6px; align-self:flex-end; }
  .mk-numeros { flex-direction:row; gap:34px; flex-wrap:wrap; }
  .mk-num { display:flex; flex-direction:column; gap:4px; }
  .mk-num-valor { font-size:64px; font-weight:800; letter-spacing:-2px; line-height:1; }
  .mk-num-rotulo { font-size:20px; opacity:.8; }
`;
}
