"use client";

// Fundir e apagar cliente, na linha da lista.
//
// POR QUE A CONFIRMAÇÃO MOSTRA O INVENTÁRIO, e não um "tem certeza?": ninguém
// decide sobre "tem certeza". Sobre "3 projetos, 12 mensagens do portal e 2
// aprovações vão junto", decide. O inventário vem do servidor — a tela não
// adivinha o que está pendurado.
//
// FUNDIR é o caminho da duplicata; APAGAR só serve para cadastro vazio, e o
// servidor recusa o resto (409). A tela não repete a regra por conta própria:
// ela mostra o motivo que o servidor devolveu. Regra escrita em dois lugares
// vira duas regras no primeiro dia de pressa.

import { useState } from "react";

type ClienteDaLista = { id: string; name: string };

type Inventario = {
  itens: { chave: string; rotulo: string; total: number }[];
  total: number;
  podeApagar: boolean;
};

type Modo = "apagar" | "fundir";

export function AcoesDoCliente({
  cliente,
  outros,
  aoConcluir,
}: {
  cliente: ClienteDaLista;
  /** Os demais clientes — candidatos a sobrevivente numa fusão. */
  outros: ClienteDaLista[];
  aoConcluir: () => void;
}) {
  const [modo, setModo]               = useState<Modo | null>(null);
  const [inventario, setInventario]   = useState<Inventario | null>(null);
  const [sobreviventeId, setSobrevivente] = useState("");
  const [erro, setErro]               = useState<string | null>(null);
  const [ocupado, setOcupado]         = useState(false);

  async function abrir(novoModo: Modo) {
    setModo(novoModo);
    setErro(null);
    setInventario(null);
    setSobrevivente("");
    try {
      const r = await fetch(`/api/clients/${cliente.id}/vinculos`);
      if (r.ok) setInventario(await r.json());
    } catch {
      // Inventário é o aviso, não o portão: o servidor recusa de qualquer jeito.
      // Falhar aqui não pode travar a tela.
    }
  }

  function fechar() {
    setModo(null);
    setErro(null);
    setOcupado(false);
  }

  async function confirmar() {
    setOcupado(true);
    setErro(null);
    try {
      const r =
        modo === "apagar"
          ? await fetch(`/api/clients/${cliente.id}`, { method: "DELETE" })
          : await fetch(`/api/clients/${cliente.id}/fundir`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sobreviventeId }),
            });

      const corpo = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErro(corpo?.error ?? "não foi possível concluir");
        setOcupado(false);
        return;
      }
      fechar();
      aoConcluir();
    } catch {
      setErro("não foi possível falar com o servidor");
      setOcupado(false);
    }
  }

  const resumo = inventario?.itens.map((i) => `${i.total} ${i.rotulo}`).join(", ");

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          onClick={() => abrir("fundir")}
          className="text-[12px] px-2.5 py-1 rounded-[6px] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors"
        >
          Fundir
        </button>
        <button
          onClick={() => abrir("apagar")}
          className="text-[12px] px-2.5 py-1 rounded-[6px] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-red-50 hover:text-red-700 hover:border-red-200 transition-colors"
        >
          Apagar
        </button>
      </div>

      {modo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-[12px] w-full max-w-[520px] p-6 shadow-lg">
            <h2 className="text-[16px] font-semibold text-[var(--text-primary)]">
              {modo === "apagar" ? `Apagar ${cliente.name}?` : `Fundir ${cliente.name} em outro cliente`}
            </h2>

            {/* O que está pendurado — a frase sobre a qual dá para decidir. */}
            <p className="mt-2 text-[13px] text-[var(--text-secondary)]">
              {inventario === null
                ? "Conferindo o que está pendurado neste cliente…"
                : inventario.total === 0
                  ? "Este cadastro está vazio — não há nada pendurado nele."
                  : `Está pendurado neste cadastro: ${resumo}.`}
            </p>

            {modo === "apagar" && inventario && !inventario.podeApagar && (
              <p className="mt-3 text-[13px] text-red-700 bg-red-50 border border-red-200 rounded-[8px] p-3">
                Apagar perderia esse trabalho. Use <strong>Fundir</strong>: o
                conteúdo vai para o cliente que fica e nada se perde.
              </p>
            )}

            {modo === "fundir" && (
              <div className="mt-4">
                <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">
                  Qual cliente fica? (este some, e tudo dele vai para o escolhido)
                </label>
                <select
                  value={sobreviventeId}
                  onChange={(e) => setSobrevivente(e.target.value)}
                  className="w-full border border-[var(--border)] rounded-[8px] px-3 py-2 text-[13px]"
                >
                  <option value="">Escolha o cliente que fica…</option>
                  {outros.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
                <p className="mt-2 text-[12px] text-[var(--text-muted)]">
                  O link de portal de <strong>{cliente.name}</strong> deixa de
                  funcionar. Quem estiver com ele precisa do link do cliente que fica.
                </p>
              </div>
            )}

            {erro && (
              <p className="mt-3 text-[13px] text-red-700 bg-red-50 border border-red-200 rounded-[8px] p-3">
                {erro}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={fechar}
                className="text-[13px] px-3.5 py-2 rounded-[8px] border border-[var(--border)] text-[var(--text-secondary)]"
              >
                Cancelar
              </button>
              <button
                onClick={confirmar}
                disabled={ocupado || (modo === "fundir" && !sobreviventeId)}
                className="text-[13px] px-3.5 py-2 rounded-[8px] bg-[var(--navy,#0f172a)] text-white disabled:opacity-40"
              >
                {ocupado ? "Trabalhando…" : modo === "apagar" ? "Apagar" : "Fundir"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
