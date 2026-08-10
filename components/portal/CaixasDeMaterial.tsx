"use client";

// AS CAIXAS PRÉ-CLASSIFICADAS — a caixa onde o cliente solta JÁ diz o que é.
//
// ── O desenho é do CEO, 09/08/2026 ─────────────────────────────────────────
//
//   > "Uma página onde a gente já classifica o que cada pasta é. Essa pasta você
//   >  vai pôr as fotos, essa as logos e coisas de marca, essa os vídeos. Bem
//   >  mastigado, bem prontinho pro cliente, porque eu sempre penso no cliente
//   >  que não entende muito."
//
// E é melhor do que o que estava planejado. O fluxo antigo é: o cliente sobe os
// arquivos e DEPOIS declara o papel de cada um, num campo de escolha. O desenho
// dele **tira um passo em vez de acelerar um passo** — a caixa é a declaração.
//
// ── A CAIXA "NÃO SEI O QUE É" É OBRIGATÓRIA ────────────────────────────────
//
// Cliente leigo diante de seis caixas faz uma de duas coisas: escolhe errado, ou
// desiste e não manda nada. A caixa "não sei" resolve as duas — ele manda, e a
// triagem é da agência.
//
// E ela é honesta com ele: melhor *"a gente organiza"* do que o sistema chutar e
// a foto errada sair numa peça entregue. É o guardrail 1 aplicado à tela:
// **nunca forçar alguém a adivinhar.**

import { useRef, useState } from "react";
import { PAPEIS, type Papel } from "@/lib/integrations/google/escolha-de-material";

/** O papel nulo da triagem. Não é um `Papel` — de propósito: ele não pode ser
 *  gravado como se fosse uma declaração do cliente. */
export const NAO_SEI = "nao_sei" as const;

export type DestinoDaCaixa = Papel | typeof NAO_SEI;

interface Caixa {
  destino: DestinoDaCaixa;
  icone: string;
  titulo: string;
  /** A frase que o cliente lê. Em português de gente, não em nome de campo. */
  ajuda: string;
}

/** As caixas, na ordem em que um dono de negócio pensa nelas: primeiro a marca,
 *  depois o que ele vende, depois onde ele está, depois quem ele é. */
export const CAIXAS: Caixa[] = [
  { destino: "logo", icone: "🎨", titulo: "Marca", ajuda: "Seu logo, e o manual da marca se você tiver. Serve PNG, SVG ou PDF." },
  { destino: "foto_produto", icone: "📸", titulo: "Fotos do produto", ajuda: "O que você vende. Prato, peça, serviço." },
  { destino: "foto_local", icone: "🏠", titulo: "Fotos do lugar", ajuda: "Fachada, salão, ambiente." },
  { destino: "foto_equipe", icone: "👥", titulo: "Fotos da equipe", ajuda: "Você, sócios, time." },
  { destino: "referencia", icone: "💡", titulo: "Referências", ajuda: "Posts que você gostou, de qualquer marca. Serve pra gente entender seu gosto." },
  { destino: NAO_SEI, icone: "❓", titulo: "Não sei o que é", ajuda: "Joga aqui. A gente organiza." },
];

export interface ArquivoNaCaixa {
  arquivo: File;
  destino: DestinoDaCaixa;
}

/**
 * As caixas. Chama `onSoltar` com o destino já decidido pela caixa — quem usa
 * este componente não precisa perguntar mais nada ao cliente.
 */
export function CaixasDeMaterial({ onSoltar }: { onSoltar: (itens: ArquivoNaCaixa[]) => void }) {
  const [sobre, setSobre] = useState<DestinoDaCaixa | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  function receber(destino: DestinoDaCaixa, lista: FileList | null) {
    if (!lista || lista.length === 0) return;
    onSoltar(Array.from(lista).map((arquivo) => ({ arquivo, destino })));
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {CAIXAS.map((c) => {
        const ativa = sobre === c.destino;
        // A caixa da triagem é visualmente diferente das outras: ela não é uma
        // categoria a mais, é a saída para quem não sabe. Igualá-la às demais
        // faria o cliente escolher entre sete categorias em vez de seis.
        const daTriagem = c.destino === NAO_SEI;
        return (
          <div
            key={c.destino}
            onDragOver={(e) => { e.preventDefault(); setSobre(c.destino); }}
            onDragLeave={() => setSobre(null)}
            onDrop={(e) => { e.preventDefault(); setSobre(null); receber(c.destino, e.dataTransfer.files); }}
            onClick={() => inputs.current[c.destino]?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputs.current[c.destino]?.click(); }}
            aria-label={`${c.titulo}: ${c.ajuda}`}
            className={[
              "cursor-pointer rounded-[12px] border-2 border-dashed p-4 transition-colors",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text-primary)]",
              ativa ? "border-[var(--text-primary)] bg-[var(--bg)]" : "border-[var(--border)]",
              daTriagem ? "bg-[var(--bg)]" : "bg-white",
            ].join(" ")}
          >
            <div className="flex items-start gap-2.5">
              <span aria-hidden="true" className="text-[18px] leading-none">{c.icone}</span>
              <div className="min-w-0">
                <p className="text-[13.5px] font-semibold text-[var(--text-primary)]">{c.titulo}</p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--text-secondary)]">{c.ajuda}</p>
              </div>
            </div>
            <input
              ref={(el) => { inputs.current[c.destino] = el; }}
              type="file"
              multiple
              className="hidden"
              accept="image/*,video/*,application/pdf,.docx,.pptx,.txt,.csv"
              onChange={(e) => { receber(c.destino, e.target.files); e.target.value = ""; }}
            />
          </div>
        );
      })}
    </div>
  );
}

/** O rótulo do destino, para a fila mostrar o que a caixa já decidiu. A triagem
 *  tem rótulo próprio porque ela NÃO é um papel — é a ausência declarada dele. */
export function rotuloDoDestino(destino: DestinoDaCaixa): string {
  if (destino === NAO_SEI) return "A agência vai organizar";
  return PAPEIS[destino]?.rotulo ?? destino;
}
