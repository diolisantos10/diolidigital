"use client";

// EsteiraDoProjeto — a faixa de status ligada ao projeto real, para a equipe.
//
// Busca o estado, mostra a leitura pronta e oferece SÓ a ação que faz sentido
// naquela etapa. Botão que não serve para nada agora é ruído — e ruído é o que
// faz gente experiente parar de olhar o painel.

import { useCallback, useEffect, useState } from "react";
import FaixaDaEsteira from "./FaixaDaEsteira";

interface StatusResposta {
  ok: boolean;
  leitura: {
    fase: string;
    semaforo: "andando" | "esperando" | "travado" | "concluido";
    responsavel: string;
    progresso: number;
    paraEquipe: { titulo: string; agora: string; proximoPasso: string };
  };
  responsavelLegivel: string;
  trilha: { curto: string; estado: "feito" | "atual" | "futuro" }[];
  pendencias: { descricao: string; agente: string | null }[];
  numeros: { entregaveis: { comRessalva: number } };
}

export default function EsteiraDoProjeto({ projectId }: { projectId: string }) {
  const [status, setStatus] = useState<StatusResposta | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [agindo, setAgindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const buscar = useCallback(async () => {
    try {
      const r = await fetch(`/api/projects/${projectId}/esteira`, { cache: "no-store" });
      if (!r.ok) throw new Error("não consegui ler o estado do projeto");
      setStatus(await r.json());
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "erro ao ler o projeto");
    } finally {
      setCarregando(false);
    }
  }, [projectId]);

  useEffect(() => { void buscar(); }, [buscar]);

  async function registrarMarco(marco: string, extras: Record<string, unknown> = {}) {
    setAgindo(true);
    setErro(null);
    try {
      const r = await fetch(`/api/projects/${projectId}/esteira`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marco, ...extras }),
      });
      const dados = await r.json();
      // Um "não" do servidor é informação, não falha: ele diz o que falta.
      if (!r.ok) setErro(dados.erro ?? dados.error ?? "não deu para seguir");
      if (dados.status) setStatus({ ok: true, ...dados.status });
      else await buscar();
    } catch {
      setErro("não consegui falar com o servidor");
    } finally {
      setAgindo(false);
    }
  }

  if (carregando) {
    return (
      <section aria-busy className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-6">
        <div className="h-3 w-32 animate-pulse rounded-full bg-[var(--border)]" />
        <div className="mt-3 h-6 w-2/3 animate-pulse rounded-lg bg-[var(--border)]" />
        <div className="mt-2 h-4 w-full max-w-md animate-pulse rounded-lg bg-[var(--border)]" />
      </section>
    );
  }

  if (!status?.ok) {
    return (
      <section className="rounded-2xl border border-[#F5B5B5] bg-[#FEECEC] p-5">
        <p className="text-[13px] text-[#8C1F1F]">
          {erro ?? "Não consegui ler o estado deste projeto."}{" "}
          <button type="button" onClick={() => void buscar()} className="underline underline-offset-2">
            Tentar de novo
          </button>
        </p>
      </section>
    );
  }

  const { leitura, trilha, pendencias, responsavelLegivel, numeros } = status;

  // A ação certa para a etapa certa — nada além disso.
  const acoes: { rotulo: string; onClick: () => void; primaria?: boolean; carregando?: boolean }[] = [];

  if (leitura.fase === "direcao") {
    acoes.push({
      rotulo: "Cliente aprovou a direção — começar a produzir",
      primaria: true, carregando: agindo,
      onClick: () => void registrarMarco("aprovar_direcao"),
    });
  }

  if (leitura.fase === "producao" && leitura.semaforo === "travado") {
    acoes.push({
      rotulo: "Rodar a produção de novo",
      primaria: true, carregando: agindo,
      onClick: () => void registrarMarco("produzir"),
    });
  }

  if (leitura.fase === "aguardando_cliente") {
    acoes.push({
      rotulo: "Cobrar o material do cliente",
      carregando: agindo,
      onClick: () => void registrarMarco("produzir"),
    });
  }

  if (leitura.fase === "revisao_interna") {
    const temRessalva = numeros.entregaveis.comRessalva > 0;
    acoes.push({
      rotulo: temRessalva ? "Apresentar mesmo com a ressalva" : "Apresentar tudo ao cliente",
      primaria: !temRessalva, carregando: agindo,
      onClick: () => void registrarMarco("apresentar", temRessalva ? { mesmoComRessalva: true } : {}),
    });
    if (temRessalva) {
      acoes.push({
        rotulo: "Refazer o que a Qualidade apontou",
        carregando: agindo,
        onClick: () => void registrarMarco("produzir"),
      });
    }
  }

  if (leitura.fase === "aprovacao_cliente") {
    acoes.push({
      rotulo: "Cliente aprovou — colocar no ar",
      primaria: true, carregando: agindo,
      onClick: () => void registrarMarco("aprovar_pacote"),
    });
  }

  return (
    <div className="space-y-2">
      <FaixaDaEsteira
        publico="equipe"
        titulo={leitura.paraEquipe.titulo}
        agora={leitura.paraEquipe.agora}
        destaque={leitura.paraEquipe.proximoPasso}
        responsavel={responsavelLegivel}
        semaforo={leitura.semaforo}
        progresso={leitura.progresso}
        trilha={trilha.map((t) => ({ etapa: t.curto, estado: t.estado }))}
        pendencias={pendencias.map((p) => (p.agente ? `${p.descricao} (${p.agente})` : p.descricao))}
        acoes={acoes}
      />
      {erro ? <p className="px-1 text-[12px] text-[#8C1F1F]">{erro}</p> : null}
    </div>
  );
}
