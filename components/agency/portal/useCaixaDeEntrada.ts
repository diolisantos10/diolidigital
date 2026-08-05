"use client";

// useCaixaDeEntrada — o número que o menu da agência precisa mostrar.
//
// Existe porque `readByTeam` era escrito em 11 lugares e lido para contagem em
// ZERO: não havia badge, lista nem caixa de entrada. Mensagem do cliente
// gravava e morria.
//
// Uma chamada a cada 30s. Barato de propósito: é um contador, não uma tela.
// Falha de rede NÃO zera o badge — badge que pisca zero por causa de wi-fi
// ruim ensina o time a ignorar o badge.

import { useEffect, useState } from "react";

export interface ResumoDaCaixa {
  /** Mensagens do cliente que a equipe ainda não leu. */
  naoLidas: number;
  /** Pedidos de conteúdo abertos pelo cliente e ainda não triados. */
  pedidosNovos: number;
  /** O que vai no badge: as duas coisas somadas. */
  total: number;
}

const VAZIO: ResumoDaCaixa = { naoLidas: 0, pedidosNovos: 0, total: 0 };

export function useCaixaDeEntrada(intervaloMs = 30_000): ResumoDaCaixa {
  const [resumo, setResumo] = useState<ResumoDaCaixa>(VAZIO);

  useEffect(() => {
    let vivo = true;
    async function ler() {
      try {
        const res = await fetch("/api/messages?resumo=1", { cache: "no-store" });
        if (!res.ok || !vivo) return;
        const j = (await res.json()) as Partial<ResumoDaCaixa>;
        if (!vivo) return;
        setResumo({
          naoLidas: j.naoLidas ?? 0,
          pedidosNovos: j.pedidosNovos ?? 0,
          total: j.total ?? (j.naoLidas ?? 0) + (j.pedidosNovos ?? 0),
        });
      } catch {
        /* mantém o último número conhecido */
      }
    }
    void ler();
    const t = setInterval(ler, intervaloMs);
    return () => { vivo = false; clearInterval(t); };
  }, [intervaloMs]);

  return resumo;
}
