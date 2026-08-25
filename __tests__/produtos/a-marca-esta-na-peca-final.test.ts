// A RÉGUA DA MARCA OLHA A PEÇA FINAL — medida no arquivo, não no molde.
//
// ═══════════════════════════════════════════════════════════════════════════
// O BURACO (Auditor, 4ª rodada, 25/08/2026)
// ═══════════════════════════════════════════════════════════════════════════
//
// O critério D pede com todas as letras: **"A régua da marca analisa a peça
// final."** Nenhuma régua desta casa fazia isso. O contrato de marca ia ao
// PRODUTOR (antes de produzir), o juiz auditava o TEXTO, e o portão de
// contraste media cores DECLARADAS antes de a imagem existir. Três réguas, e
// nenhuma abria o JPEG.
//
// ── POR QUE ESTE ARQUIVO RASTERIZA DE VERDADE ─────────────────────────────
//
// Porque é aqui que esta operação já errou três vezes: falsificar o fundo
// demais cria uma régua que só pode dar verde. Uma imagem sintética pintada à
// mão provaria que `sharp` sabe tirar média de pixel — não provaria que **o
// molde do cliente pinta a marca na peça**, que é a afirmação sob teste.
//
// Então o par principal é rasterizado pelo Chromium, com `montarHtmlDaPeca` de
// verdade e `moldeDoCliente` de verdade:
//
//   • peça montada com a marca do cliente  → a régua ACEITA;
//   • a MESMA peça montada com o molde NEUTRO da casa (o defeito real: o
//     cliente tem marca e a peça sai no cinza padrão) → a régua REPROVA.
//
// A segunda metade é a que faz dela uma régua. Sem ela, `ok: true` fixo
// passaria neste arquivo.

import { describe, it, expect } from "vitest";
import { renderizarHtml, renderizadorDisponivel } from "@/lib/agency/design/renderizar";
import { montarHtmlDaPeca, moldeDoCliente, FORMATOS } from "@/lib/agency/design/molde";
import {
  conferirMarcaNaPecaFinal, DISTANCIA_MAXIMA_DA_MARCA,
} from "@/lib/agency/produtos/regua-da-marca-na-peca";

const NAVEGADOR = await renderizadorDisponivel();
// "Não medi" não é "está certo": `it.skip` DIZ que não mediu, em vez de passar
// verde calado. É o padrão que a casa já usa em `a-zona-morta-tem-regua.test.ts`.
const prova = NAVEGADOR.disponivel ? it : it.skip;

/** A marca de um cliente de verdade desta corrente: o marrom da padaria. */
const MARCA_DA_PADARIA = {
  primaryColor: "#7A3B12",
  secondaryColor: "#E8C89A",
  typography: "serifada",
};

const STORY = FORMATOS.story;

async function pecaRasterizada(molde: ReturnType<typeof moldeDoCliente>): Promise<Buffer> {
  const html = montarHtmlDaPeca(
    {
      formato: "story",
      titulo: "O pão que descansa a noite toda",
      assinatura: "Padaria da Esquina",
      fundo: null,
    } as never,
    molde,
  );
  const r = await renderizarHtml({
    html, largura: STORY.largura, altura: STORY.altura,
    textosEsperados: [], zonaMortaTopo: 0, zonaMortaBase: 0,
  });
  if (!r.ok) throw new Error(`o Chromium não rasterizou a peça: ${r.motivo} — ${r.erro}`);
  return r.bytes;
}

describe("a marca do cliente é medida NOS PIXELS que saíram", () => {
  prova("peça montada com a marca do cliente: a régua ACEITA", async () => {
    const molde = moldeDoCliente(MARCA_DA_PADARIA);
    expect(molde.origem, "o molde é o do cliente, não o neutro").toBe("marca");

    const v = await conferirMarcaNaPecaFinal({
      bytes: await pecaRasterizada(molde),
      corDaMarca: molde.primaria,
      ondeEsta: "peça de prova",
    });

    expect(v.ok, `rodapé medido ${v.corMedidaNoRodape}, distância ${v.distancia}`).toBe(true);
    expect(v.distancia).toBeLessThanOrEqual(DISTANCIA_MAXIMA_DA_MARCA);
    // A frase carrega os NÚMEROS — conclusão sem número não é conferível.
    expect(v.motivo).toContain(v.corMedidaNoRodape);
    expect(v.motivo).toContain(molde.primaria);
  }, 180_000);

  prova("⚠️ MUTAÇÃO: a mesma peça no molde NEUTRO da casa é REPROVADA", async () => {
    // Este é o defeito real, não um caso de laboratório: o cliente TEM marca e
    // a peça sai no cinza padrão da casa porque o molde neutro entrou no lugar
    // do dele. Nenhuma das outras três réguas de marca vê isso — todas olham
    // para o que foi DECLARADO, e o que foi declarado continua certo.
    const neutro = moldeDoCliente(null);
    expect(neutro.origem).toBe("neutro");

    const v = await conferirMarcaNaPecaFinal({
      bytes: await pecaRasterizada(neutro),
      // Medida contra a marca que o cliente TEM — é essa a pergunta.
      corDaMarca: MARCA_DA_PADARIA.primaryColor,
      ondeEsta: "peça de prova",
    });

    expect(
      v.ok,
      `a peça saiu no molde neutro (${neutro.primaria}) e a régua a aceitou como se fosse a marca ` +
      `da padaria (${MARCA_DA_PADARIA.primaryColor}) — rodapé medido ${v.corMedidaNoRodape}, ` +
      `distância ${v.distancia}. Régua que só pode dar verde não é régua.`,
    ).toBe(false);
    expect(v.distancia).toBeGreaterThan(DISTANCIA_MAXIMA_DA_MARCA);
    // A frase de reprovação nomeia dono e próxima ação — é o que o contrato pede.
    expect(v.motivo).toMatch(/Dono:/);
    expect(v.motivo).toMatch(/Próxima ação:/);
  }, 180_000);
});

describe("controles — a régua sabe dizer que NÃO mediu", () => {
  it("cor de marca ilegível não vira aprovação", async () => {
    const v = await conferirMarcaNaPecaFinal({
      bytes: Buffer.from("não é uma imagem"),
      corDaMarca: "azulzinho",
      ondeEsta: "peça de prova",
    });
    expect(v.ok, "sem nada contra o que medir, não há aprovação").toBe(false);
    expect(v.motivo).toMatch(/hexadecimal/i);
  });

  it("arquivo que não abre não vira aprovação — ausência de medição não é aprovação", async () => {
    const v = await conferirMarcaNaPecaFinal({
      bytes: Buffer.from("isto não é um JPEG"),
      corDaMarca: "#7A3B12",
      ondeEsta: "peça de prova",
    });
    expect(v.ok).toBe(false);
    expect(v.motivo).toMatch(/Ausência de medição não é aprovação/i);
  });
});
