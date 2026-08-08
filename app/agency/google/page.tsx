"use client";

// /agency/google — AS FERRAMENTAS DO GOOGLE, CLIENTE POR CLIENTE.
//
// ── POR QUE ESTA TELA EXISTE (pedido do CEO, 08/08/2026) ────────────────────
//
//   "preciso da integração das ferramentas do Google nas páginas do admin
//    urgentemente."
//
// O que o admin mostrava do Google até hoje: `/agency/integrations`, rodando em
// `MOCK_INTEGRATIONS`, dizendo "Google Drive — planejado · OAuth Google não
// implementado" sobre uma feature que está EM PRODUÇÃO e foi provada com a
// Foocci nesta mesma semana. E dizendo nada sobre o Perfil de Empresa, que já
// responde avaliação sozinho a cada 5 minutos no despertador.
//
// ── AS DUAS PERGUNTAS QUE ELA RESPONDE ──────────────────────────────────────
//
//   "De quais clientes a agência tem material?" — em cima, porque é o que
//   decide se a peça sai com a foto do produto ou com foto genérica de IA.
//
//   "O que está esperando decisão de gente?" — logo abaixo, porque avaliação
//   negativa parada é o pior estado possível no perfil de um negócio local.
//
// ── A REGRA QUE MANDA AQUI ──────────────────────────────────────────────────
//
// **Nunca escrever zero quando a resposta é "não sei".** Toda contagem chega do
// servidor com estado (`medido` | `nao_medido`) e cada um tem palavra própria.
// E **nunca botão que não faz nada**: onde falta credencial ou falta parecer do
// especialista `google`, a tela diz o que falta e quem destrava — não mostra um
// botão que abre uma janela em branco.
//
// ── CELULAR PRIMEIRO ────────────────────────────────────────────────────────
// A lista de clientes é CARTÃO em qualquer largura. Não virou tabela nem em
// desktop: cada linha tem 6 números com estados diferentes e uma lista de
// papéis de tamanho variável — isso não é tabela, é ficha (DESIGN.md §6.3).

import { useCallback, useEffect, useState } from "react";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";

// ─── O contrato com o servidor (espelha lib/agency/google/retrato.ts) ────────

type Contagem =
  | { estado: "medido"; valor: number }
  | { estado: "nao_medido"; motivo: string };

interface Credencial { chave: string; presente: boolean; semEla: string }

interface Drive {
  conectado: boolean; status: string; conta: string;
  conectadoEm: string | null; ultimaLeitura: string | null;
  escolhidos: Contagem; declarados: Contagem; importados: Contagem; aguardandoCliente: Contagem;
  falhas: Array<{ nome: string; erro: string }>;
  papeis: Array<{ papel: string; rotulo: string; quantos: number }>;
}

interface Perfil {
  locais: Array<{
    id: string; titulo: string; locationName: string; status: string;
    respostaAutomaticaAutorizadaEm: string | null; ultimaLeituraDeAvaliacoes: string | null;
  }>;
  avaliacoesEsperandoDecisao: Contagem;
  avaliacoesRespondidas: Contagem;
  totalDeAvaliacoes: Contagem;
}

interface Linha { clientId: string; nome: string; drive: Drive; perfil: Perfil }

interface Resposta {
  credenciais: Credencial[];
  linhas: Linha[];
  daCasa: Perfil | null;
  indisponivel: string[];
}

// ─── Apresentação ───────────────────────────────────────────────────────────

/** "não medido" NUNCA vira "0". São afirmações diferentes sobre pessoas
 *  diferentes: zero fala do cliente, "não medido" fala de nós. */
function Numero({ c, destaque = false }: { c: Contagem; destaque?: boolean }) {
  if (c.estado === "nao_medido") {
    return (
      <span className="text-[13px] italic text-[var(--text-muted)]" title={c.motivo}>
        não medido
      </span>
    );
  }
  return (
    <span className={`tabular-nums text-[var(--text-primary)] ${destaque ? "text-[20px] font-semibold tracking-[-0.02em]" : "text-[15px] font-medium"}`}>
      {c.valor}
    </span>
  );
}

function Cartao({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-[10px] border border-[var(--border)] bg-[var(--bg-elevated)] shadow-[var(--shadow-sm)] ${className}`}>
      {children}
    </div>
  );
}

function TituloDeSecao({ children, apoio }: { children: React.ReactNode; apoio?: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-[15px] font-semibold text-[var(--text-primary)] tracking-[-0.01em]">{children}</h2>
      {apoio && <p className="text-[12px] text-[var(--text-muted)] mt-0.5 leading-relaxed">{apoio}</p>}
    </div>
  );
}

/** Palavra + cor, nunca cor sozinha (DESIGN.md §2.4). */
const PALAVRA_DO_STATUS: Record<string, { texto: string; classe: string }> = {
  connected:   { texto: "Conectado",                classe: "bg-[var(--success-bg)] text-[var(--success)]" },
  expired:     { texto: "Acesso expirou",           classe: "bg-[var(--warning-bg)] text-[var(--warning)]" },
  revoked:     { texto: "Cliente desconectou",      classe: "bg-[#FEE2E2] text-[var(--danger)]" },
  error:       { texto: "Erro na conexão",          classe: "bg-[#FEE2E2] text-[var(--danger)]" },
  sem_conexao: { texto: "Nunca conectou",           classe: "bg-[var(--accent)] text-[var(--text-muted)]" },
};

function Selo({ status }: { status: string }) {
  const s = PALAVRA_DO_STATUS[status] ?? { texto: status, classe: "bg-[var(--accent)] text-[var(--text-muted)]" };
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-[4px] ${s.classe}`}>{s.texto}</span>;
}

function data(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

// ─── A ficha de um cliente ──────────────────────────────────────────────────

function FichaDoCliente({ l }: { l: Linha }) {
  const { drive, perfil } = l;
  const semNada =
    !drive.conectado &&
    perfil.locais.length === 0;

  return (
    <Cartao className="p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <h3 className="text-[14px] font-semibold text-[var(--text-primary)] min-w-0 truncate">{l.nome}</h3>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Selo status={drive.status} />
          {perfil.locais.length > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-[4px] bg-[var(--accent-light)] text-[var(--navy)]">
              Perfil de Empresa
            </span>
          )}
        </div>
      </div>

      {semNada ? (
        // Estado vazio HONESTO: não é "0 arquivos", é "não há de onde tirar".
        <p className="text-[12px] text-[var(--text-muted)] mt-2.5 leading-relaxed">
          Nada do Google ligado neste cliente. A peça dele sai com imagem gerada por IA,
          sem logo real e sem foto do produto — o cliente precisa conectar o Drive no portal.
        </p>
      ) : (
        <>
          {/* ── Drive ────────────────────────────────────────────────────── */}
          {drive.conectado && (
            <div className="mt-3">
              <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">
                Google Drive {drive.conta ? `· ${drive.conta}` : ""}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <Numero c={drive.declarados} destaque />
                  <div className="text-[11px] text-[var(--text-muted)] mt-0.5">a agência usa</div>
                </div>
                <div>
                  <Numero c={drive.importados} />
                  <div className="text-[11px] text-[var(--text-muted)] mt-0.5">já baixados</div>
                </div>
                <div>
                  <Numero c={drive.aguardandoCliente} />
                  <div className="text-[11px] text-[var(--text-muted)] mt-0.5">sem papel declarado</div>
                </div>
                <div>
                  <Numero c={drive.escolhidos} />
                  <div className="text-[11px] text-[var(--text-muted)] mt-0.5">escolhidos no total</div>
                </div>
              </div>

              {drive.papeis.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {drive.papeis.map((p) => (
                    <span key={p.papel} className="text-[11px] bg-[var(--accent)] text-[var(--text-secondary)] px-1.5 py-0.5 rounded">
                      {p.rotulo} · {p.quantos}
                    </span>
                  ))}
                </div>
              )}

              {/* Escolher não é declarar. Sem esta frase o CEO leria "12
                  escolhidos" como "12 disponíveis", que é falso. */}
              {drive.aguardandoCliente.estado === "medido" && drive.aguardandoCliente.valor > 0 && (
                <p className="text-[11px] text-[var(--warning)] mt-2.5 leading-relaxed">
                  ⚠ {drive.aguardandoCliente.valor} arquivo(s) escolhido(s) e sem papel declarado.
                  A esteira <strong>não usa nenhum deles</strong> — só o cliente pode dizer o que são, no portal.
                </p>
              )}

              {drive.falhas.length > 0 && (
                <ul className="mt-2.5 space-y-1">
                  {drive.falhas.map((f) => (
                    <li key={f.nome} className="text-[11px] text-[var(--danger)] leading-relaxed">
                      ✗ {f.nome} — {f.erro}
                    </li>
                  ))}
                </ul>
              )}

              <p className="text-[11px] text-[var(--text-subtle)] mt-2.5">
                Conectado em {data(drive.conectadoEm)} · última leitura {data(drive.ultimaLeitura)}
              </p>
            </div>
          )}

          {/* ── Perfil de Empresa ────────────────────────────────────────── */}
          {perfil.locais.length > 0 && (
            <div className="mt-4 pt-3.5 border-t border-[var(--border)]">
              <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">
                Perfil de Empresa no Google
              </div>
              {perfil.locais.map((loc) => (
                <div key={loc.id} className="mb-2.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] text-[var(--text-primary)]">{loc.titulo}</span>
                    <Selo status={loc.status} />
                  </div>
                  <p className="text-[11px] text-[var(--text-subtle)] mt-0.5">
                    Avaliações lidas até {data(loc.ultimaLeituraDeAvaliacoes)}
                    {" · "}
                    {loc.respostaAutomaticaAutorizadaEm
                      ? `resposta automática autorizada em ${data(loc.respostaAutomaticaAutorizadaEm)}`
                      : "resposta automática DESLIGADA (sem consentimento registrado)"}
                  </p>
                </div>
              ))}
              <div className="grid grid-cols-3 gap-3 mt-2.5">
                <div>
                  <Numero c={perfil.avaliacoesEsperandoDecisao} destaque />
                  <div className="text-[11px] text-[var(--text-muted)] mt-0.5">esperando gente</div>
                </div>
                <div>
                  <Numero c={perfil.avaliacoesRespondidas} />
                  <div className="text-[11px] text-[var(--text-muted)] mt-0.5">respondidas</div>
                </div>
                <div>
                  <Numero c={perfil.totalDeAvaliacoes} />
                  <div className="text-[11px] text-[var(--text-muted)] mt-0.5">no total</div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </Cartao>
  );
}

// ─── A tela ─────────────────────────────────────────────────────────────────

export default function GooglePage() {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const r = await fetch("/api/agency/google", { cache: "no-store" });
      // 503 ainda traz corpo: parte do retrato é legítima e o resto vem como
      // "não medido". Descartar tudo esconderia o que a casa CONSEGUIU ler.
      if (r.status === 403) {
        setDados(null);
        setErro("Este painel é do Master e do Project Manager.");
        return;
      }
      const corpo = (await r.json()) as Resposta;
      setDados(corpo);
    } catch {
      setDados(null);
      setErro("Não consegui falar com o servidor. Nada aqui foi medido nesta tentativa — as contagens não são zero, são desconhecidas.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  const faltando = (dados?.credenciais ?? []).filter((c) => !c.presente);
  const comDrive = (dados?.linhas ?? []).filter((l) => l.drive.conectado);
  const comPerfil = (dados?.linhas ?? []).filter((l) => l.perfil.locais.length > 0);
  const esperando = (dados?.linhas ?? []).reduce(
    (n, l) => n + (l.perfil.avaliacoesEsperandoDecisao.estado === "medido" ? l.perfil.avaliacoesEsperandoDecisao.valor : 0),
    0,
  );

  return (
    <div className="pt-6 md:pt-0">
      <AgencyHeader
        eyebrow="Ferramentas do Google"
        title="Google no admin"
        subtitle="O que a agência enxerga da conta Google de cada cliente. Só leitura — nada é publicado a partir desta tela."
      />

      {carregando && (
        <p className="text-[13px] text-[var(--text-muted)]">Lendo o estado das conexões…</p>
      )}

      {erro && (
        <Cartao className="p-4 border-[var(--danger)] mb-6">
          <p className="text-[13px] text-[var(--danger)] leading-relaxed">{erro}</p>
        </Cartao>
      )}

      {dados && (
        <div className="space-y-8">
          {/* ── Leitura que falhou ─────────────────────────────────────────── */}
          {dados.indisponivel.length > 0 && (
            <Cartao className="p-4 border-[var(--danger)]">
              <TituloDeSecao apoio="Enquanto isto aparecer, os números marcados como “não medido” são desconhecidos — não são zero.">
                Não consegui ler parte do estado
              </TituloDeSecao>
              <ul className="space-y-1">
                {dados.indisponivel.map((m) => (
                  <li key={m} className="text-[12px] text-[var(--danger)] leading-relaxed">✗ {m}</li>
                ))}
              </ul>
            </Cartao>
          )}

          {/* ── Credenciais ────────────────────────────────────────────────── */}
          <section>
            <TituloDeSecao apoio="Projeto dioli-digital, credencial da AGÊNCIA. Nenhum valor é mostrado aqui — só se existe.">
              O que o Google exige para funcionar
            </TituloDeSecao>
            <Cartao className="p-4">
              <ul className="space-y-2.5">
                {dados.credenciais.map((c) => (
                  <li key={c.chave} className="flex items-start gap-2">
                    <span className={`text-[13px] shrink-0 leading-[1.35] ${c.presente ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>
                      {c.presente ? "✓" : "✗"}
                    </span>
                    <div className="min-w-0">
                      <div className="text-[12px] font-medium text-[var(--text-primary)] break-all">{c.chave}</div>
                      {!c.presente && (
                        <p className="text-[11px] text-[var(--danger)] leading-relaxed mt-0.5">
                          Sem ela: {c.semEla}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              {faltando.length === 0 && (
                <p className="text-[11px] text-[var(--text-muted)] mt-3 leading-relaxed">
                  As quatro presentes <strong>neste servidor</strong>. Isto não afirma nada sobre produção
                  se você estiver lendo em desenvolvimento.
                </p>
              )}
            </Cartao>
          </section>

          {/* ── O resumo ───────────────────────────────────────────────────── */}
          <section>
            <TituloDeSecao>Resumo</TituloDeSecao>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Cartao className="p-4">
                <div className="text-[20px] font-semibold tabular-nums text-[var(--text-primary)]">{comDrive.length}</div>
                <div className="text-[11px] text-[var(--text-muted)] mt-0.5">clientes com Drive ligado</div>
              </Cartao>
              <Cartao className="p-4">
                <div className="text-[20px] font-semibold tabular-nums text-[var(--text-primary)]">{comPerfil.length}</div>
                <div className="text-[11px] text-[var(--text-muted)] mt-0.5">com Perfil de Empresa</div>
              </Cartao>
              <Cartao className="p-4">
                <div className={`text-[20px] font-semibold tabular-nums ${esperando > 0 ? "text-[var(--danger)]" : "text-[var(--text-primary)]"}`}>{esperando}</div>
                <div className="text-[11px] text-[var(--text-muted)] mt-0.5">avaliações esperando gente</div>
              </Cartao>
              <Cartao className="p-4">
                <div className="text-[20px] font-semibold tabular-nums text-[var(--text-primary)]">{dados.linhas.length}</div>
                <div className="text-[11px] text-[var(--text-muted)] mt-0.5">clientes no total</div>
              </Cartao>
            </div>
          </section>

          {/* ── O que está travado, e por quê ─────────────────────────────── */}
          <section>
            <TituloDeSecao apoio="Escrever no Google exige parecer prévio do especialista da plataforma (regra do CEO, 03/08/2026). Enquanto não houver, esta tela é só leitura.">
              O que esta tela NÃO faz — e não é esquecimento
            </TituloDeSecao>
            <Cartao className="p-4">
              <ul className="space-y-2 text-[12px] text-[var(--text-secondary)] leading-relaxed">
                <li>
                  <strong className="text-[var(--text-primary)]">Responder avaliação daqui.</strong>{" "}
                  A resposta é pública, permanente, e notifica quem reclamou na hora.
                  Rascunho existe; o envio é decisão de gente.
                </li>
                <li>
                  <strong className="text-[var(--text-primary)]">Ligar a resposta automática.</strong>{" "}
                  A política da API do Perfil de Empresa proíbe resposta automatizada sem
                  consentimento prévio e específico. Sem consentimento registrado, nada sai sozinho —
                  e é assim que está hoje em todos os locais.
                </li>
                <li>
                  <strong className="text-[var(--text-primary)]">Publicar post no perfil.</strong>{" "}
                  O código existe e não tem chamador. Falta o parecer do especialista{" "}
                  <code className="text-[11px]">google</code>.
                </li>
                <li>
                  <strong className="text-[var(--text-primary)]">Google Ads e Analytics.</strong>{" "}
                  Não estão conectados e não é bug: Ads exige token de desenvolvedor aprovado
                  pelo Google, e Analytics exige escopo novo na tela de consentimento.
                  As duas dependem do CEO.
                </li>
              </ul>
            </Cartao>
          </section>

          {/* ── Cliente por cliente ────────────────────────────────────────── */}
          <section>
            <TituloDeSecao apoio="Ordenado por quem tem mais material declarado — quem não tem nada aparece no fim, mas aparece.">
              Cliente por cliente
            </TituloDeSecao>
            {dados.linhas.length === 0 ? (
              <Cartao className="p-6 text-center">
                <p className="text-[13px] text-[var(--text-muted)]">Nenhum cliente cadastrado neste workspace.</p>
              </Cartao>
            ) : (
              // `items-start` não é enfeite: sem ele o cartão curto ("nunca
              // conectou", 3 linhas) estica até a altura do cartão longo
              // (Drive + Perfil + avaliações, ~30 linhas) e vira um retângulo
              // branco vazio de meia tela. Medido a 1440px — DESIGN.md §6.
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-start">
                {[...dados.linhas]
                  .sort((a, b) => {
                    const va = a.drive.declarados.estado === "medido" ? a.drive.declarados.valor : -1;
                    const vb = b.drive.declarados.estado === "medido" ? b.drive.declarados.valor : -1;
                    return vb - va;
                  })
                  .map((l) => <FichaDoCliente key={l.clientId} l={l} />)}
              </div>
            )}
          </section>

          {/* ── A conta da própria Dioli ───────────────────────────────────── */}
          {dados.daCasa && (
            <section>
              <TituloDeSecao apoio="Conexão sem cliente é a conta da própria agência. Sem esta seção ela responderia avaliação no relógio sem aparecer em tela nenhuma.">
                O Perfil de Empresa da Dioli Digital
              </TituloDeSecao>
              <Cartao className="p-4">
                {dados.daCasa.locais.map((loc) => (
                  <div key={loc.id} className="flex items-center gap-2 flex-wrap mb-2">
                    <span className="text-[13px] text-[var(--text-primary)]">{loc.titulo}</span>
                    <Selo status={loc.status} />
                  </div>
                ))}
                <div className="grid grid-cols-3 gap-3 mt-2">
                  <div>
                    <Numero c={dados.daCasa.avaliacoesEsperandoDecisao} destaque />
                    <div className="text-[11px] text-[var(--text-muted)] mt-0.5">esperando gente</div>
                  </div>
                  <div>
                    <Numero c={dados.daCasa.avaliacoesRespondidas} />
                    <div className="text-[11px] text-[var(--text-muted)] mt-0.5">respondidas</div>
                  </div>
                  <div>
                    <Numero c={dados.daCasa.totalDeAvaliacoes} />
                    <div className="text-[11px] text-[var(--text-muted)] mt-0.5">no total</div>
                  </div>
                </div>
              </Cartao>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
