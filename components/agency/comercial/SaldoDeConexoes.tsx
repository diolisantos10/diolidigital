"use client";

// ─── O SALDO DE CONEXÕES DO MÊS ──────────────────────────────────────────────
//
// A pergunta que este bloco responde é anterior a todas as outras da tela:
// **"quantas me restam antes de eu decidir onde gastar?"**
//
// Até 08/08/2026 ela não tinha resposta em tela nenhuma. O contador existia
// (`ConexaoGasta`, com migration), a cota existia (`policy.json`), e ninguém
// via nem um nem outro — então o operador decidia onde gastar sem saber quanto
// tinha. Cota é MENSAL, conexão gasta NÃO VOLTA e o que sobra NÃO ACUMULA no
// mês seguinte: as três coisas juntas fazem do saldo um dado de decisão, não um
// indicador de rodapé.
//
// ── OS TRÊS ESTADOS, E O DO MEIO É O QUE IMPORTA ────────────────────────────
//   • medido        — o número é o que esta casa registrou.
//   • NÃO CONFIÁVEL — a leitura do contador FALHOU e o número mostrado é o pior
//                     caso (mês esgotado), não o real. Fica em vermelho e diz
//                     isso com todas as letras.
//   • plano não declarado — a cota cai para 10 (Free) por fail closed, e a tela
//                     explica que não é o limite real, é o único afirmável.
//
// "Não sei quanto gastei" e "gastei tudo" produzem o MESMO número e são fatos
// opostos. Escondê-los no mesmo pixel é a lição dos três `.catch(() => null)` de
// 07/08 aplicada a cota.
//
// ⚠️ ESTE NÚMERO NÃO VEM DO 99FREELAS. Nenhum login foi feito, nenhuma leitura
// autenticada acontece. É o que a casa registrou — e a tela diz isso.

import { useCallback, useEffect, useState } from "react";

interface Saldo {
  plataforma: string;
  competencia: string;
  cota: number;
  cotaDoPlano: number;
  bonusDeMedalha: number;
  plano: string;
  planoFoiDeclarado: boolean;
  gastas: number;
  restantes: number;
  confiavel: boolean;
  motivoDaCota: string;
  motivoDoContador: string;
}

const ROTULO_DA_PLATAFORMA: Record<string, string> = { "99freelas": "99Freelas" };

export default function SaldoDeConexoes({ versao }: { versao: number }) {
  const [saldos, setSaldos] = useState<Saldo[] | null>(null);
  const [falhou, setFalhou] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch("/api/agency/oportunidades/conexoes", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as { saldos?: unknown };
      setSaldos(Array.isArray(j.saldos) ? (j.saldos as Saldo[]) : []);
      setFalhou(false);
    } catch {
      // Falha de LEITURA não vira "0 gastas, tudo disponível". Vira o aviso
      // abaixo — que é uma afirmação sobre NÓS, não sobre a cota.
      setSaldos(null);
      setFalhou(true);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar, versao]);

  if (falhou) {
    return (
      <section
        role="alert"
        className="mb-4 rounded-[12px] border border-[#FCA5A5] bg-[var(--danger-bg)] px-4 py-3"
      >
        <p className="text-[13px] text-[var(--danger)]">
          Não consegui ler o saldo de conexões do mês. <strong>Isto não quer dizer que há saldo</strong> —
          quer dizer que não sei. Confira na tela do 99Freelas antes de enviar.
        </p>
      </section>
    );
  }

  if (!saldos || saldos.length === 0) return null;

  return (
    <section className="mb-4 grid gap-2">
      {saldos.map((s) => {
        const acabando = s.confiavel && s.restantes <= Math.max(3, Math.round(s.cota * 0.1));
        return (
          <div
            key={s.plataforma}
            className={`rounded-[12px] border px-4 py-3 ${
              !s.confiavel
                ? "border-[#FCA5A5] bg-[var(--danger-bg)]"
                : acabando
                  ? "border-[#FDE68A] bg-[var(--warning-bg)]"
                  : "border-[var(--border)] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
            }`}
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                Conexões · {ROTULO_DA_PLATAFORMA[s.plataforma] ?? s.plataforma} · {s.competencia}
              </span>
              {!s.confiavel ? (
                <span className="text-[13px] font-semibold text-[var(--danger)]">
                  saldo não medido
                </span>
              ) : (
                <span className="text-[15px] font-semibold text-[var(--text-primary)]">
                  <span className="mono-num">{s.restantes}</span> de{" "}
                  <span className="mono-num">{s.cota}</span> restantes
                </span>
              )}
              {s.confiavel && (
                <span className="text-[12px] text-[var(--text-muted)]">
                  <span className="mono-num">{s.gastas}</span> gasta(s) no mês
                </span>
              )}
            </div>

            {/* Barra só quando o número é confiável. Barra sobre um número que é
                o pior caso desenharia um fato que não existe. */}
            {s.confiavel && (
              <div className="mt-2 h-1.5 w-full rounded-full bg-[var(--accent)] overflow-hidden">
                <div
                  className={`h-full rounded-full ${acabando ? "bg-[var(--warning)]" : "bg-[var(--navy)]"}`}
                  style={{ width: `${Math.min(100, Math.round((s.gastas / Math.max(1, s.cota)) * 100))}%` }}
                />
              </div>
            )}

            <p className="text-[12px] text-[var(--text-muted)] mt-2 leading-relaxed max-w-[76ch]">
              {!s.confiavel ? s.motivoDoContador : s.motivoDaCota}
            </p>

            {!s.planoFoiDeclarado && s.confiavel && (
              <p className="text-[12px] text-[var(--warning)] mt-1 leading-relaxed max-w-[76ch]">
                Ninguém declarou o plano da conta, então a casa opera no piso (Free, 10/mês). Não é o
                limite real — é o único que dá para afirmar sem inventar.
              </p>
            )}

            <p className="text-[12px] text-[var(--text-subtle)] mt-1 leading-relaxed max-w-[76ch]">
              Este é o saldo que <strong>esta casa registrou</strong>, não o que o 99Freelas mostra.
              Nenhum login é feito. Ao enviar, o número que manda é o da tela deles.
            </p>
          </div>
        );
      })}
    </section>
  );
}
