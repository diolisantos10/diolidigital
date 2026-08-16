// A FICHA CHEGA NO AGENTE — trava do dispositivo, não promessa dele.
//
// Ordem do CEO, 16/08/2026: *"você precisa fazer o prompt chegar em todos assim
// que sobe a atualização"*.
//
// O defeito que isto fecha: a mesma regra morava em dois lugares — a ficha do
// cargo e o prompt que o agente veste — e a ponte entre os dois era a mão de
// quem editou. Mão erra em silêncio: foi assim que 83 fichas ganharam a régua e
// 14 crachás ficaram para trás, e o CEO teve de perguntar se todo mundo estava
// com a cartela nova.
//
// Agora a ficha delimita o trecho, o código lê em runtime e injeta. Este teste
// prova as DUAS metades: que o caminho existe (a ficha chega) e que ele acusa o
// caso plantado (ficha sem marcador não vira sucesso silencioso).

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  MARCADOR_INICIO,
  MARCADOR_FIM,
  regrasDaFicha,
  blocoDeRegrasParaPrompt,
  trechoEntreMarcadores,
} from "@/lib/agency/catalogo-v2/regras-da-ficha";

const ROTA_DO_SDR = fs.readFileSync(
  path.join(process.cwd(), "app/api/sdr/chat/route.ts"),
  "utf8",
);
// A MONTAGEM DO PROMPT (que inclui `blocoDeRegrasParaPrompt`) saiu da rota e
// foi para este módulo (despacho `esteira`, 16/08 — segunda rodada): rota do
// Next só admite os exports que o framework reconhece, e `sistemaDoSdr` não
// está nessa lista — passava no `tsc`/`vitest` e quebrava o `npm run build`.
// A ASSERÇÃO MUDOU DE ARQUIVO, NÃO DE REGRA: a intenção continua a mesma —
// "se alguém voltar a mandar SYSTEM_PROMPT cru, a ficha para de chegar" —,
// só que agora medida no módulo onde a montagem de fato acontece.
const PROMPT_DO_SDR = fs.readFileSync(
  path.join(process.cwd(), "lib/agency/comercial/prompt-do-sdr.ts"),
  "utf8",
);
const ADAPTADOR = fs.readFileSync(
  path.join(process.cwd(), "lib/agency/esteira-assistida/adaptador-de-ia.ts"),
  "utf8",
);

describe("a ficha chega no agente — o caminho existe", () => {
  it("a ficha do SDR delimita as regras do cargo, e elas são lidas", () => {
    const r = regrasDaFicha("conversational-sdr");
    expect(r.ok, r.ok ? "" : r.motivo).toBe(true);
    if (!r.ok) return;
    // As regras que hoje seguram o comportamento do agente vivo têm de estar lá.
    expect(r.texto).toContain("Nome próprio vindo de voz é sempre incerto");
    expect(r.texto).toContain("Oferta de material interrompe o roteiro");
    expect(r.texto).toContain("A saída é sempre um pacote completo e bem formado");
    expect(r.texto).toContain("Nome da pessoa não é nome do negócio");
  });

  it("o bloco montado diz de onde veio e declara que a ficha manda", () => {
    const bloco = blocoDeRegrasParaPrompt("conversational-sdr");
    expect(bloco).toContain("REGRAS DA SUA FICHA DE CARGO (conversational-sdr)");
    expect(bloco).toContain("ninguém copiou à mão");
    expect(bloco).toContain("ESTAS REGRAS VALEM");
  });

  it("a rota do SDR monta o system A PARTIR da ficha, não de texto fixo só", () => {
    // Se alguém voltar a mandar SYSTEM_PROMPT cru, a ficha para de chegar — e
    // para em silêncio, que é o defeito que este dispositivo existe para fechar.
    //
    // A checagem de `blocoDeRegrasParaPrompt` mudou de ARQUIVO (rota →
    // `lib/agency/comercial/prompt-do-sdr.ts`), não de regra: a rota continua
    // obrigada a chamar `sistemaDoSdr()` — que é quem, no módulo novo, soma o
    // bloco da ficha ao prompt base — e continua proibida de voltar a mandar
    // `SYSTEM_PROMPT` cru.
    expect(PROMPT_DO_SDR).toContain("blocoDeRegrasParaPrompt");
    expect(ROTA_DO_SDR).toContain("system: sistemaDoSdr()");
    expect(ROTA_DO_SDR).not.toContain("system: SYSTEM_PROMPT,");
  });

  it("o executor V2 injeta a ficha para TODAS as funções da linha, não só o SDR", () => {
    expect(ADAPTADOR).toContain("blocoDeRegrasParaPrompt(spec.funcao)");
  });
});

describe("a ficha chega no agente — e a trava acusa o caso plantado", () => {
  it("função fora do catálogo devolve recusa NOMEADA, não texto vazio", () => {
    const r = regrasDaFicha("cargo-que-nao-existe");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toContain("não existe no catálogo canônico");
  });

  it("ficha sem marcador, marcador invertido e bloco vazio não viram sucesso", () => {
    expect(trechoEntreMarcadores("# Ficha sem marcador nenhum\n")).toBeNull();
    expect(trechoEntreMarcadores(`${MARCADOR_FIM}\nregras\n${MARCADOR_INICIO}\n`)).toBeNull();
    expect(trechoEntreMarcadores(`${MARCADOR_INICIO}\n   \n${MARCADOR_FIM}`)).toBeNull();
  });

  it("e não acusa o caso limpo — a metade que falta na maioria das travas", () => {
    const limpo = `# Ficha\n${MARCADOR_INICIO}\n**1. Uma regra de verdade.**\n${MARCADOR_FIM}\n## Resto`;
    expect(trechoEntreMarcadores(limpo)).toBe("**1. Uma regra de verdade.**");
  });

  it("função com ficha mas SEM o bloco devolve motivo que ensina o conserto", () => {
    // Hoje só o SDR delimita; as outras 80 fichas ainda não. O motivo tem de
    // dizer o que fazer, senão vira ruído de log que ninguém age.
    const r = regrasDaFicha("brand-architect");
    if (r.ok) return; // se alguém já delimitou essa também, ótimo
    expect(r.motivo).toContain("não delimita as regras do cargo");
    expect(r.motivo).toContain(MARCADOR_INICIO);
  });
});
