"use client";

// PulsoDaAgencia — "a casa trabalhou esta noite?", na primeira linha do painel.
//
// ── Por que esta faixa NÃO some quando está tudo bem ─────────────────────────
// É a exceção deliberada à regra da `FilaDeAvisos` (caixa vazia treina o time a
// ignorar a tela). Aqui o silêncio é justamente o que precisa ser desmentido:
// um relógio parado e uma noite tranquila produzem o MESMO painel vazio, e foi
// essa indistinção que deixou a agência rodar sem testemunha até 06/08/2026.
// A faixa verde não é decoração — ela é a prova, com hora, de que o relógio
// bateu. Sem ela, "não vi nada de errado" continua significando duas coisas.

import { useCallback, useEffect, useState } from "react";

interface Falha { perna: string; erro: string; vezes: number; ultimaEm: string }

interface Pulso {
  haMinutos: number | null;
  ok: boolean;
  batidas: number;
  falhas24h: Falha[];
  moveu24h: Record<string, number>;
  frase: string;
}

const ROTULO: Record<string, string> = {
  pedidos: "pedido(s) do cliente",
  mesesVirados: "mês(es) virado(s)",
  retomados: "produção(ões) retomada(s)",
  destravadas: "entrega(s) refeita(s)",
  artes: "arte(s)",
  publicados: "post(s) publicado(s)",
  campanhasFreadas: "campanha(s) freada(s)",
  avaliacoes: "avaliação(ões)",
  avisos: "aviso(s)",
};

export default function PulsoDaAgencia() {
  const [pulso, setPulso] = useState<Pulso | null>(null);
  const [erro, setErro] = useState(false);

  const buscar = useCallback(async () => {
    try {
      const r = await fetch("/api/pulso", { cache: "no-store" });
      if (!r.ok) throw new Error("falhou");
      setPulso(await r.json());
      setErro(false);
    } catch {
      setErro(true);
    }
  }, []);

  useEffect(() => {
    void buscar();
    // O relógio bate a cada 5 min; a tela reconfere a cada 2. Deixar a página
    // aberta e ver o número congelar é, por si só, o alarme.
    const t = setInterval(() => void buscar(), 120_000);
    return () => clearInterval(t);
  }, [buscar]);

  if (erro) {
    return (
      <Faixa cor="#DC2626" fundo="#FEE2E2">
        🔴 Não consegui ler o pulso da agência — não sei se ela trabalhou.
      </Faixa>
    );
  }
  if (!pulso) return null;

  const moveu = Object.entries(pulso.moveu24h).filter(([, v]) => v > 0);
  const total = moveu.reduce((a, [, v]) => a + v, 0);
  const bom = pulso.ok && pulso.falhas24h.length === 0;

  return (
    <Faixa
      cor={bom ? "#16A34A" : pulso.ok ? "#B45309" : "#DC2626"}
      fundo={bom ? "#F0FDF4" : pulso.ok ? "var(--warning-bg)" : "#FEE2E2"}
    >
      <div className="flex flex-col gap-1">
        <span className="font-semibold">{pulso.frase}</span>
        <span className="text-[11.5px] opacity-90">
          Últimas 24 h: {pulso.batidas} batida(s) ·{" "}
          {total === 0
            ? "a esteira não tinha trabalho pendente — nada foi produzido"
            : moveu.map(([k, v]) => `${v} ${ROTULO[k] ?? k}`).join(" · ")}
        </span>
        {pulso.falhas24h.length > 0 && (
          <ul className="mt-1 flex flex-col gap-0.5">
            {pulso.falhas24h.slice(0, 5).map((f) => (
              <li key={`${f.perna}-${f.erro}`} className="text-[11.5px] font-medium">
                🔴 {f.perna} ({f.vezes}×): {f.erro}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Faixa>
  );
}

function Faixa({ cor, fundo, children }: { cor: string; fundo: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-[12px] border px-4 py-3 text-[12.5px]"
      style={{ background: fundo, borderColor: cor, color: cor }}
    >
      {children}
    </div>
  );
}
