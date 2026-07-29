"use client";

// FilaDeAvisos — o que o cliente ainda não sabe.
//
// Enquanto não houver canal automático configurado, é por aqui que o aviso sai.
// O desenho segue uma regra: **quem for disparar não deve precisar escrever
// nada**. O texto já vem pronto, com o link do portal, num botão de copiar.
// Aviso escrito às pressas por alguém apressado é pior que aviso nenhum — o
// cliente sente.
//
// Fila vazia é o estado normal e desejável. Por isso ela some da tela quando
// não há nada: painel cheio de caixa vazia treina o time a ignorar o painel.

import { useCallback, useEffect, useState } from "react";

interface Aviso {
  id: string;
  cliente: string;
  tipo: "direcao" | "material" | "entrega" | "ciclo";
  textoParaEnviar: string;
  porQueNaoSaiuSozinho: string | null;
  esperandoDesde: string;
}

const ROTULO_DO_TIPO: Record<Aviso["tipo"], string> = {
  direcao:  "Precisa aprovar a direção",
  material: "Precisa mandar material",
  entrega:  "Tem entrega para ver",
  ciclo:    "Novidade do acompanhamento",
};

function esperandoHa(desde: string): string {
  const ms = Date.now() - new Date(desde).getTime();
  const horas = Math.floor(ms / 3_600_000);
  if (horas < 1) return "agora há pouco";
  if (horas < 24) return `há ${horas}h`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? "há 1 dia" : `há ${dias} dias`;
}

export default function FilaDeAvisos() {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [copiado, setCopiado] = useState<string | null>(null);

  const buscar = useCallback(async () => {
    try {
      const r = await fetch("/api/avisos", { cache: "no-store" });
      const dados = await r.json();
      setAvisos(dados.avisos ?? []);
    } catch {
      setAvisos([]);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { void buscar(); }, [buscar]);

  async function copiar(a: Aviso) {
    try {
      await navigator.clipboard.writeText(a.textoParaEnviar);
      setCopiado(a.id);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      setCopiado(null);
    }
  }

  async function marcar(id: string, acao: "enviei" | "dispensar") {
    setAvisos((prev) => prev.filter((a) => a.id !== id));   // some na hora
    try {
      await fetch("/api/avisos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, acao }),
      });
    } catch {
      await buscar();   // deu errado: recarrega e o aviso volta
    }
  }

  // Fila vazia não ocupa espaço — caixa vazia treina o time a ignorar a tela.
  if (carregando || avisos.length === 0) return null;

  return (
    <section className="rounded-2xl border border-[#F5D9A3] bg-[#FEF6E7] p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-[#7A5310]">
          {avisos.length === 1 ? "1 cliente precisa ser avisado" : `${avisos.length} clientes precisam ser avisados`}
        </h2>
        <p className="text-[11px] text-[#9A7328]">o texto já está pronto — é copiar e mandar</p>
      </div>

      <ul className="mt-3.5 space-y-2.5">
        {avisos.map((a) => (
          <li key={a.id} className="rounded-xl border border-[#F0DCB4] bg-white/80 p-3.5">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-[14px] font-semibold text-[#1A1A1A]">{a.cliente}</span>
              <span className="text-[12px] text-[#6B6B65]">— {ROTULO_DO_TIPO[a.tipo]}</span>
              <span className="text-[11px] text-[#9B9B95]">esperando {esperandoHa(a.esperandoDesde)}</span>
            </div>

            {a.porQueNaoSaiuSozinho ? (
              <p className="mt-1 text-[11px] text-[#9A7328]">Não saiu sozinho: {a.porQueNaoSaiuSozinho}</p>
            ) : null}

            <pre className="mt-2.5 max-h-32 overflow-y-auto whitespace-pre-wrap rounded-lg bg-[#F7F7F6] px-3 py-2.5 font-sans text-[12px] leading-relaxed text-[#1A1A1A]">
              {a.textoParaEnviar}
            </pre>

            <div className="mt-2.5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void copiar(a)}
                className="rounded-lg bg-[#070A1F] px-3 py-1.5 text-[12px] font-medium text-white transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#070A1F] focus-visible:ring-offset-2"
              >
                {copiado === a.id ? "Copiado ✓" : "Copiar mensagem"}
              </button>
              <button
                type="button"
                onClick={() => void marcar(a.id, "enviei")}
                className="rounded-lg border border-[#D8D8D4] bg-white px-3 py-1.5 text-[12px] font-medium text-[#1A1A1A] transition hover:bg-[#F7F7F6] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#070A1F] focus-visible:ring-offset-2"
              >
                Já mandei
              </button>
              <button
                type="button"
                onClick={() => void marcar(a.id, "dispensar")}
                className="rounded-lg px-3 py-1.5 text-[12px] text-[#6B6B65] transition hover:text-[#1A1A1A] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#070A1F] focus-visible:ring-offset-2"
              >
                Não precisa
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
