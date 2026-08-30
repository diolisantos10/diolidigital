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
  it("a batida da V2 chama a rodada do Gerente Geral", () => {
    const batida = ler("lib/agency/v2-recovery/batida-da-v2.ts");
    expect(batida).toContain('from "@/lib/agency/gerencia/rodada"');
    expect(batida).toContain("await rodadaDoGerenteGeral(agora)");
  });

  it("⛔ O OUTBOX TEM CHAMADOR — a rota /api/cron/v2 não é a única perna", () => {
    // O achado de 25/08/2026, na segunda volta: `POST /api/cron/v2` NUNCA teve
    // chamador. O aviso de atraso que o Gerente Geral enfileira ficava
    // `pending` para sempre. Este teste é o que reprova se alguém tirar a perna
    // do despertador e deixar o outbox dependendo de um agendador que não
    // existe. Coluna gravada não é cliente informado.
    const desp = ler("lib/agency/despertador.ts");
    expect(desp).toContain("@/lib/agency/v2-recovery/batida-da-v2");
    expect(desp).toContain("await baterORelogioDaV2(");
    // E a rota continua existindo, delegando para a MESMA função — duas cópias
    // da batida divergiriam, e é assim que uma perna processa o outbox e a
    // outra não.
    const rota = ler("app/api/cron/v2/route.ts");
    expect(rota).toContain("baterORelogioDaV2");
    expect(rota).not.toContain("processarOutbox(");
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
    expect(ler("lib/agency/v2-recovery/batida-da-v2.ts")).toContain("gerenteGeral");
    expect(ler("app/api/cron/v2/route.ts")).toContain("return NextResponse.json(resultado)");
  });

  it("o executor da fala com o cliente está registrado no processador do outbox", () => {
    const batida = ler("lib/agency/v2-recovery/batida-da-v2.ts");
    expect(batida).toContain("mensagem_ao_cliente:");
    expect(batida).toContain("entregarAvisoAoCliente");
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
