// O LAÇO ESTÁ PENDURADO NO RELÓGIO QUE JÁ EXISTE — e nenhum relógio novo nasceu.
//
// Motor construído e mudo é o defeito que esta casa já viu duas vezes (o alarme
// da aprovação parada, o alarme da porta da frente). A rodada do Gerente Geral
// só é "o agente que não para" se alguma coisa a CHAMAR de tempos em tempos.
//
// Este teste é de FONTE de propósito: ele responde "quem chama?", que é
// exatamente a pergunta que nenhum teste de comportamento responde — a rodada
// passa nos testes dela estando desligada do mundo.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const raiz = process.cwd();
const ler = (p: string) => fs.readFileSync(path.join(raiz, p), "utf8");

describe("o laço que não para está ligado", () => {
  it("o cron da V2 chama a rodada do Gerente Geral a cada batida", () => {
    const cron = ler("app/api/cron/v2/route.ts");
    expect(cron).toContain('from "@/lib/agency/gerencia/rodada"');
    expect(cron).toContain("await rodadaDoGerenteGeral(agora)");
  });

  it("o DESPERTADOR — o relógio que roda de verdade — também chama a rodada", () => {
    // O achado de 25/08/2026: nenhum agendador chama `/api/cron/v2`. Quem bate
    // de 5 em 5 minutos com o app no ar é o despertador. Sem esta perna, o
    // laço estaria construído e mudo — o defeito que esta casa já viu duas
    // vezes (o alarme da aprovação parada, o alarme da porta da frente).
    const desp = ler("lib/agency/despertador.ts");
    expect(desp).toContain('@/lib/agency/gerencia/rodada');
    expect(desp).toContain("await rodadaDoGerenteGeral()");
  });

  it("o resultado da rodada volta na resposta do relógio — batida sem placar não se audita", () => {
    expect(ler("app/api/cron/v2/route.ts")).toContain("gerenteGeral");
  });

  it("o executor da fala com o cliente está registrado no processador do outbox", () => {
    const cron = ler("app/api/cron/v2/route.ts");
    expect(cron).toContain("mensagem_ao_cliente:");
    expect(cron).toContain("entregarAvisoAoCliente");
  });

  it("⛔ nenhum relógio NOVO foi criado — a ordem era pendurar no que existe", () => {
    const rotasDeCron = fs.readdirSync(path.join(raiz, "app/api/cron"), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    expect(rotasDeCron).toEqual([
      "caixa-de-entrada", "execute", "radar", "raio-x", "recompra", "training", "v2",
    ]);
    expect(fs.existsSync(path.join(raiz, "lib/agency/gerencia/despertador.ts"))).toBe(false);
  });
});
