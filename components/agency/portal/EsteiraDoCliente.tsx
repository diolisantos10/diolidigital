"use client";

// EsteiraDoCliente — a mesma verdade da esteira, do lado do cliente.
//
// O cliente pode ser leigo em marketing e nunca ter visto este sistema. Ao abrir
// o portal ele precisa entender, em cinco segundos e sem ninguém explicar:
// em que pé está o trabalho dele, e se a bola está com ele ou com a agência.
//
// Duas travas de linguagem, e as duas importam:
//
//   • Nada de jargão interno. Ele não sabe o que é "entregável", "canvas" ou
//     "departamento" — nem precisa saber. Isso é garantido por teste, não por
//     boa vontade de quem escreve a próxima frase.
//
//   • Só pedimos algo quando é REALMENTE a vez dele. Portal que vive cobrando
//     é portal que o cliente para de abrir.
//
// As duas decisões que ele pode tomar aqui — aprovar a direção e aprovar o
// pacote — são as que fazem a esteira andar do lado de cá. O resto é leitura.

import { useCallback, useEffect, useState } from "react";
import FaixaDaEsteira from "../FaixaDaEsteira";

interface EstadoDoCliente {
  ok: boolean;
  temProjeto: boolean;
  projeto?: string;
  etapa?: string;
  titulo?: string;
  agora: string;
  oQueEsperamosDeVoce?: string;
  aBolaEstaComVoce?: boolean;
  progresso?: number;
  trilha?: { etapa: string; estado: "feito" | "atual" | "futuro" }[];
  pendencias?: string[];
  ciclo?: { referencia: string; resumo: string | null } | null;
}

export default function EsteiraDoCliente({
  token,
  aoIrParaAprovacoes,
}: {
  token: string;
  /**
   * ── UM ÚNICO LUGAR PARA DECIDIR (CEO, 07/08/2026) ────────────────────────
   * Quando informado, a esteira PARA de decidir: "Aprovar e começar" e
   * "Aprovar tudo" viram um caminho para Aprovações, que é onde toda decisão
   * do cliente mora.
   *
   * Por que isto era um problema real: este componente renderiza no Início E
   * em Projetos. O mesmo botão "Aprovar tudo" existia nas duas telas, e em
   * nenhuma delas chamada "Aprovações" — três lugares para a mesma decisão.
   * O cliente clicava numa, voltava na outra, via o botão de novo e não sabia
   * se já tinha decidido.
   */
  aoIrParaAprovacoes?: () => void;
}) {
  const [estado, setEstado] = useState<EstadoDoCliente | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [decidindo, setDecidindo] = useState(false);
  const [recado, setRecado] = useState<string | null>(null);

  const buscar = useCallback(async () => {
    try {
      // A4: token vazio = modo cookie — o httpOnly autentica sozinho.
      const r = await fetch(token ? `/api/portal/esteira?token=${encodeURIComponent(token)}` : "/api/portal/esteira", { cache: "no-store" });
      setEstado(await r.json());
    } catch {
      setEstado(null);
    } finally {
      setCarregando(false);
    }
  }, [token]);

  useEffect(() => { void buscar(); }, [buscar]);

  async function decidir(decisao: "aprovar_direcao" | "aprovar_pacote") {
    setDecidindo(true);
    try {
      const r = await fetch("/api/portal/esteira", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(token ? { token, decisao } : { decisao }),
      });
      const dados = await r.json();
      setRecado(dados.mensagem ?? null);
      await buscar();
    } catch {
      setRecado("Não consegui registrar agora. Pode tentar de novo?");
    } finally {
      setDecidindo(false);
    }
  }

  if (carregando) {
    return (
      <section aria-busy className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-6">
        <div className="h-6 w-2/3 animate-pulse rounded-lg bg-[var(--border)]" />
        <div className="mt-2 h-4 w-full max-w-md animate-pulse rounded-lg bg-[var(--border)]" />
      </section>
    );
  }

  if (!estado?.ok) {
    return (
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-6">
        <h2 className="text-[18px] font-semibold text-[var(--text-primary)]">Não consegui carregar agora</h2>
        <p className="mt-1 text-[14px] text-[var(--text-secondary)]">
          Tente atualizar a página. Se continuar assim, fale com a gente pela conversa aqui do portal.
        </p>
      </section>
    );
  }

  if (!estado.temProjeto) {
    return (
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-6">
        <h2 className="text-[20px] font-semibold text-[var(--text-primary)]">{estado.titulo ?? "Estamos organizando tudo"}</h2>
        <p className="mt-1.5 max-w-[60ch] text-[14px] text-[var(--text-secondary)]">{estado.agora}</p>
      </section>
    );
  }

  const acoes: { rotulo: string; onClick: () => void; primaria?: boolean; carregando?: boolean }[] = [];
  const etapa = estado.etapa ?? "";

  const pedeDirecao = etapa.toLowerCase().includes("confirme o caminho");
  const pedePacote  = etapa.toLowerCase().includes("tudo pronto");

  if (aoIrParaAprovacoes) {
    // Modo CAMINHO: a esteira anuncia a decisão e leva até ela. Nunca decide.
    if (pedeDirecao || pedePacote) {
      acoes.push({ rotulo: "Ver e decidir em Aprovações", primaria: true, onClick: aoIrParaAprovacoes });
    }
  } else {
    if (pedeDirecao) {
      acoes.push({
        rotulo: "Aprovar e começar",
        primaria: true, carregando: decidindo,
        onClick: () => void decidir("aprovar_direcao"),
      });
    }
    if (pedePacote) {
      acoes.push({
        rotulo: "Aprovar tudo",
        primaria: true, carregando: decidindo,
        onClick: () => void decidir("aprovar_pacote"),
      });
    }
  }

  return (
    <div className="space-y-2">
      <FaixaDaEsteira
        publico="cliente"
        titulo={estado.etapa ?? "Seu projeto"}
        agora={estado.agora}
        {...(estado.oQueEsperamosDeVoce ? { destaque: estado.oQueEsperamosDeVoce } : {})}
        responsavel={estado.aBolaEstaComVoce ? "Você" : "Nosso time"}
        semaforo={estado.aBolaEstaComVoce ? "esperando" : "andando"}
        progresso={estado.progresso ?? 0}
        trilha={estado.trilha ?? []}
        pendencias={estado.pendencias ?? []}
        acoes={acoes}
      />

      {estado.ciclo ? (
        <p className="px-1 text-[12px] text-[var(--text-secondary)]">
          Acompanhamento de {estado.ciclo.referencia}
          {estado.ciclo.resumo ? ` — ${estado.ciclo.resumo}` : ""}
        </p>
      ) : null}

      {recado ? (
        <p role="status" className="rounded-xl border border-[#A3E5BE] bg-[#DCFCE7] px-3.5 py-2.5 text-[13px] text-[#14532D]">
          {recado}
        </p>
      ) : null}
    </div>
  );
}
