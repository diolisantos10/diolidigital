// PRODUTO & TECNOLOGIA — a superfície interna do 12º departamento.
//
// Implantação determinada pelo CEO (15/08/2026), depois do merge do PR #151.
// Server component, no padrão visual das outras salas da casa (AgencyHeader +
// cartões brancos com token de borda). Onze seções, na ordem pedida.
//
// Três regras que esta tela obedece por construção:
//
//  1. **Nada aqui liga agente nem publica.** As sete funções nascem
//     DESLIGADAS na ficha; a tela mostra o estado real de cada uma e diz o
//     que falta para ligar — ligar é decisão registrada do dono.
//  2. **Estado vazio explica o próprio vazio.** Seção muda é o leitor achando
//     que perdeu alguma coisa; aqui cada vazio diz por que está vazio.
//  3. **Design de produto ≠ Design de campanha.** A fronteira aparece escrita
//     na tela, e a trava está em `lib/agency/produto-tecnologia/permissoes.ts`.

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { perfilDaSessao } from "@/lib/agency/organizacao/guarda";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import { prisma } from "@/lib/db/client";
import { departamentoV2 } from "@/lib/agency/catalogo-v2/catalogo";
import { specDaFuncao } from "@/lib/agency/catalogo-v2/specs";
import { podeNaProdutoTecnologia } from "@/lib/agency/produto-tecnologia/permissoes";

export const dynamic = "force-dynamic";

const DEPARTAMENTO = "product-technology";

/** As sete funções, na ordem do fluxo — OS → UX → arquitetura → engenharia. */
const ORDEM_DO_FLUXO = [
  "technology-orchestrator",
  "product-designer",
  "software-architect",
  "design-system-engineer",
  "frontend-engineer",
  "backend-engineer",
  "fullstack-engineer",
] as const;

function Cartao({
  id,
  titulo,
  subtitulo,
  children,
}: {
  id: string;
  titulo: string;
  subtitulo?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="bg-white rounded-[12px] border border-[var(--border)] px-5 py-4 scroll-mt-24">
      <p className="text-[13px] font-medium text-[var(--text-primary)]">{titulo}</p>
      {subtitulo && <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">{subtitulo}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Vazio({ frase }: { frase: string }) {
  return <p className="text-[13px] text-[var(--text-muted)]">{frase}</p>;
}

function Etiqueta({ texto, tom }: { texto: string; tom: "desligado" | "ligado" | "atencao" }) {
  const cores = {
    desligado: { background: "#F3F4F6", color: "#4B5563" },
    ligado: { background: "#DCFCE7", color: "#166534" },
    atencao: { background: "#FEF3C7", color: "#92400E" },
  }[tom];
  return (
    <span className="shrink-0 rounded px-2 py-0.5 text-[11px] font-medium" style={cores}>
      {texto}
    </span>
  );
}

function Numero({ rotulo, valor, nota }: { rotulo: string; valor: number | string; nota?: string }) {
  return (
    <div className="rounded-[10px] border border-[var(--border)] px-4 py-3">
      <p className="text-[22px] font-semibold text-[var(--text-primary)]">{valor}</p>
      <p className="text-[12px] text-[var(--text-primary)]">{rotulo}</p>
      {nota && <p className="text-[11px] text-[var(--text-muted)]">{nota}</p>}
    </div>
  );
}

/** Ficha de uma função da linha, do jeito que o humano audita. */
function FichaDaFuncao({ funcaoId, execucoes }: { funcaoId: string; execucoes: number }) {
  const resultado = specDaFuncao(funcaoId);
  if (!resultado.ok) {
    return <Vazio frase={`Ficha de ${funcaoId} ilegível: ${resultado.motivo}`} />;
  }
  const s = resultado.spec;
  return (
    <div className="space-y-2 text-[13px]">
      <div className="flex items-start justify-between gap-3">
        <span className="text-[var(--text-primary)]">{s.metrica_sucesso}</span>
        <Etiqueta texto={s.ativa ? "LIGADA" : "DESLIGADA"} tom={s.ativa ? "ligado" : "desligado"} />
      </div>
      <dl className="grid gap-x-6 gap-y-1 text-[12px] text-[var(--text-muted)] sm:grid-cols-2">
        <div>
          <dt className="inline font-medium text-[var(--text-primary)]">Recebe de: </dt>
          <dd className="inline">{s.handoff.recebe_de}</dd>
        </div>
        <div>
          <dt className="inline font-medium text-[var(--text-primary)]">Entrega para: </dt>
          <dd className="inline">{s.handoff.entrega_para}</dd>
        </div>
        <div>
          <dt className="inline font-medium text-[var(--text-primary)]">Saída: </dt>
          <dd className="inline">{s.saida.esquema}</dd>
        </div>
        <div>
          <dt className="inline font-medium text-[var(--text-primary)]">SLA / timeout: </dt>
          <dd className="inline">
            {s.sla_horas}h · {s.timeout_min}min · {s.retentativas} retentativa(s)
          </dd>
        </div>
        <div>
          <dt className="inline font-medium text-[var(--text-primary)]">Teto por execução: </dt>
          <dd className="inline">US$ {s.teto_custo_usd_execucao.toFixed(2)} · autonomia {s.autonomia}</dd>
        </div>
        <div>
          <dt className="inline font-medium text-[var(--text-primary)]">Execuções registradas: </dt>
          <dd className="inline">{execucoes}</dd>
        </div>
      </dl>
      <p className="text-[12px] text-[var(--text-muted)]">
        <span className="font-medium text-[var(--text-primary)]">Sobe para humano quando:</span>{" "}
        {s.gatilhos_humanos.join("; ")}.
      </p>
      {!s.ativa && (
        <p className="text-[12px] text-[var(--text-muted)]">
          Para produzir, esta função precisa das <strong>duas chaves</strong>: a ficha marcada como ligada (decisão
          registrada do dono) e a flag <code>v2_execucao</code> no escopo do cliente. Hoje nenhuma das duas está virada
          para Produto &amp; Tecnologia.
        </p>
      )}
    </div>
  );
}

export default async function ProdutoTecnologiaPage() {
  const session = await getSession();
  if (!session) redirect("/auth/signin");
  const perfil = perfilDaSessao(session);

  // A porta: interno vê; cliente nunca chega aqui (e o guarda global já barra).
  if (!podeNaProdutoTecnologia(perfil, "ver").permitido) redirect("/agency/sem-permissao");

  const podeCoordenar = podeNaProdutoTecnologia(perfil, "coordenar_os").permitido;
  const podeEditarTecnico = podeNaProdutoTecnologia(perfil, "editar_tecnico").permitido;
  const podeAprovarQualidade = podeNaProdutoTecnologia(perfil, "aprovar_qualidade").permitido;
  const podeLiberarDeploy = podeNaProdutoTecnologia(perfil, "liberar_deploy").permitido;

  const departamento = departamentoV2(DEPARTAMENTO);

  const [ordensDeServico, handoffsDoDepto, execucoes, recusas, aprovacoesPendentes, batidas, outboxPendente, outboxMorto] =
    await Promise.all([
      prisma.handoffV2.findMany({
        where: { paraDepartamento: DEPARTAMENTO },
        orderBy: { criadoEm: "desc" },
        take: 25,
      }),
      prisma.handoffV2.findMany({
        where: { OR: [{ paraDepartamento: DEPARTAMENTO }, { deDepartamento: DEPARTAMENTO }] },
        orderBy: { criadoEm: "desc" },
        take: 40,
      }),
      prisma.execucaoV2.findMany({
        where: { departamentoId: DEPARTAMENTO },
        orderBy: { inicio: "desc" },
        take: 40,
      }),
      prisma.recusaV2.findMany({ orderBy: { em: "desc" }, take: 15 }),
      prisma.approvalRequest.count({ where: { status: "pending" } }),
      prisma.heartbeatDoRelogio.findMany(),
      prisma.outboxV2.count({ where: { status: "pending" } }),
      prisma.outboxV2.count({ where: { status: "dead" } }),
    ]);

  const porFuncao = new Map<string, number>();
  for (const e of execucoes) porFuncao.set(e.funcaoId, (porFuncao.get(e.funcaoId) ?? 0) + 1);

  const osAguardando = ordensDeServico.filter((h) => h.status === "aguardando_recebimento");
  const custoTotal = execucoes.reduce((soma, e) => soma + (e.custoUsd ?? 0), 0);

  // A frase antes de qualquer número — regra da casa.
  const leitura =
    ordensDeServico.length === 0
      ? "Departamento implantado e em repouso: as sete funções estão desligadas e nenhuma Ordem de Serviço chegou do PM ainda."
      : `${ordensDeServico.length} Ordem(ns) de Serviço recebida(s) do PM · ${osAguardando.length} aguardando aceite · ${execucoes.length} execução(ões) registrada(s).`;

  const secoes: Array<{ id: string; nome: string }> = [
    { id: "visao-geral", nome: "Visão Geral" },
    { id: "ordens-de-servico", nome: "Ordens de Serviço" },
    { id: "ux-ui", nome: "UX/UI e protótipos" },
    { id: "arquitetura", nome: "Arquitetura" },
    { id: "design-system", nome: "Design System" },
    { id: "frontend", nome: "Frontend" },
    { id: "backend", nome: "Backend" },
    { id: "fullstack", nome: "Full Stack" },
    { id: "qualidade", nome: "Qualidade e testes" },
    { id: "operacoes", nome: "Deploys e rollback" },
    { id: "auditoria", nome: "Handoffs e auditoria" },
  ];

  return (
    <div className="space-y-6">
      <AgencyHeader title="Produto & Tecnologia" subtitle={leitura} />

      {/* Índice: onze seções numa sala só, alcançáveis sem rolagem às cegas. */}
      <nav className="flex flex-wrap gap-2">
        {secoes.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-[12px] text-[var(--text-primary)] hover:bg-[var(--surface-hover,#F9FAFB)]"
          >
            {s.nome}
          </a>
        ))}
      </nav>

      {/* ─── 1. Visão Geral ─────────────────────────────────────────────── */}
      <Cartao
        id="visao-geral"
        titulo="Visão Geral"
        subtitulo="O 12º departamento da casa: transforma necessidade aprovada em interface, integração e sistema."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Numero rotulo="Funções no departamento" valor={departamento?.funcoes.length ?? 0} nota="todas desligadas por padrão" />
          <Numero rotulo="Ordens de Serviço recebidas" valor={ordensDeServico.length} nota={`${osAguardando.length} aguardando aceite`} />
          <Numero rotulo="Execuções registradas" valor={execucoes.length} nota={`US$ ${custoTotal.toFixed(4)} em IA`} />
          <Numero rotulo="Handoffs do departamento" valor={handoffsDoDepto.length} nota="entrada e saída" />
        </div>

        <div className="mt-4 space-y-3 text-[13px]">
          <p className="text-[var(--text-primary)]">
            <strong>O fluxo:</strong> Ordem de Serviço aprovada pelo Project Manager → Product Design (UX/UI) →
            Arquitetura de Software → Engenharia (frontend, backend ou full stack) → Qualidade → Operações.
          </p>
          <p className="text-[var(--text-muted)]">
            <strong className="text-[var(--text-primary)]">A fronteira que não se borra:</strong> este departamento faz{" "}
            <em>Design de Produto (UX/UI)</em> — fluxo, telas, estados, componentes e acessibilidade da plataforma. O{" "}
            <em>Design de campanha</em> (peças, criativos, artes de social e tráfego) continua sendo do departamento de
            Design, e Produto &amp; Tecnologia <strong>não</strong> escreve lá.
          </p>
        </div>

        <div className="mt-4 rounded-[10px] border border-[var(--border)] px-4 py-3">
          <p className="text-[12px] font-medium text-[var(--text-primary)]">O que você pode fazer aqui, pelo seu papel</p>
          <ul className="mt-1 space-y-0.5 text-[12px] text-[var(--text-muted)]">
            <li>Ver a superfície inteira: <strong>sim</strong> — toda a equipe interna consulta.</li>
            <li>Coordenar OS, escopo, prioridade e aceite: <strong>{podeCoordenar ? "sim" : "não (é do PM e da direção)"}</strong></li>
            <li>Escrever artefato técnico: <strong>{podeEditarTecnico ? "sim" : "não (é de Produto & Tecnologia)"}</strong></li>
            <li>Aprovar antes da publicação: <strong>{podeAprovarQualidade ? "sim" : "não (é da Qualidade)"}</strong></li>
            <li>Liberar deploy e ambiente: <strong>{podeLiberarDeploy ? "sim" : "não (é de Operações)"}</strong></li>
          </ul>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">
            A trava está no servidor (`lib/agency/produto-tecnologia/permissoes.ts`), não no que esta tela mostra ou
            esconde. Cliente não acessa ferramenta interna.
          </p>
        </div>
      </Cartao>

      {/* ─── 2. Ordens de Serviço ───────────────────────────────────────── */}
      <Cartao
        id="ordens-de-servico"
        titulo="Ordens de Serviço recebidas do Project Manager"
        subtitulo="A OS é o handoff do PM para cá — com escopo, critérios de aceite e responsável. Sem aceite, ela não sai da fila do PM."
      >
        {ordensDeServico.length === 0 ? (
          <Vazio frase="Nenhuma Ordem de Serviço recebida ainda. A OS nasce quando o PM passa o bastão para Produto & Tecnologia: enquanto isso, a fila legítima é o vazio — não há demanda represada." />
        ) : (
          <ul className="space-y-3 text-[13px]">
            {ordensDeServico.map((os) => (
              <li key={os.id} className="flex items-start justify-between gap-3 border-b border-[var(--border)] pb-2 last:border-0">
                <span>
                  <span className="font-medium text-[var(--text-primary)]">{os.entrada}</span>
                  <span className="block text-[12px] text-[var(--text-muted)]">
                    de {os.deDepartamento} · responsável na entrega: {os.responsavelEntrega} · versão {os.versaoArtefato}
                  </span>
                  <span className="block text-[12px] text-[var(--text-muted)]">Critérios de aceite: {os.criterios}</span>
                </span>
                <Etiqueta
                  texto={os.status === "aceito" ? "aceita" : "aguardando aceite"}
                  tom={os.status === "aceito" ? "ligado" : "atencao"}
                />
              </li>
            ))}
          </ul>
        )}
        {!podeCoordenar && (
          <p className="mt-3 text-[12px] text-[var(--text-muted)]">
            Você está em modo de consulta nesta seção: abrir OS, mudar escopo/prioridade e dar aceite é do Project
            Manager (e da direção).
          </p>
        )}
      </Cartao>

      {/* ─── 3 a 8. As funções, na ordem do fluxo ───────────────────────── */}
      <Cartao id="ux-ui" titulo="UX/UI e protótipos — Product Designer" subtitulo="Fluxo, telas, estados, conteúdo, responsividade e acessibilidade. Não é arte de campanha.">
        <FichaDaFuncao funcaoId="product-designer" execucoes={porFuncao.get("product-designer") ?? 0} />
      </Cartao>

      <Cartao id="arquitetura" titulo="Arquitetura e decisões técnicas — Software Architect" subtitulo="Dados, integração, segurança e a decisão registrada com o porquê.">
        <FichaDaFuncao funcaoId="software-architect" execucoes={porFuncao.get("software-architect") ?? 0} />
        <div className="mt-3 border-t border-[var(--border)] pt-3">
          <p className="text-[12px] font-medium text-[var(--text-primary)]">Orquestrador de Tecnologia</p>
          <div className="mt-2">
            <FichaDaFuncao funcaoId="technology-orchestrator" execucoes={porFuncao.get("technology-orchestrator") ?? 0} />
          </div>
        </div>
      </Cartao>

      <Cartao id="design-system" titulo="Design System — Design System Engineer" subtitulo="Componentes, tokens e acessibilidade: o vocabulário que impede cada tela de inventar o seu.">
        <FichaDaFuncao funcaoId="design-system-engineer" execucoes={porFuncao.get("design-system-engineer") ?? 0} />
      </Cartao>

      <Cartao id="frontend" titulo="Desenvolvimento Frontend" subtitulo="Interface implementada contra o Design System e os critérios de aceite da OS.">
        <FichaDaFuncao funcaoId="frontend-engineer" execucoes={porFuncao.get("frontend-engineer") ?? 0} />
      </Cartao>

      <Cartao id="backend" titulo="Desenvolvimento Backend" subtitulo="APIs, dados e regras — com permissão verificada no servidor, nunca só na tela.">
        <FichaDaFuncao funcaoId="backend-engineer" execucoes={porFuncao.get("backend-engineer") ?? 0} />
      </Cartao>

      <Cartao id="fullstack" titulo="Desenvolvimento Full Stack" subtitulo="Ponta a ponta quando a demanda é pequena o bastante para não valer a divisão.">
        <FichaDaFuncao funcaoId="fullstack-engineer" execucoes={porFuncao.get("fullstack-engineer") ?? 0} />
      </Cartao>

      {/* ─── 9. Qualidade ───────────────────────────────────────────────── */}
      <Cartao
        id="qualidade"
        titulo="Qualidade e testes"
        subtitulo="Qualidade aprova ANTES da publicação. Sem parecer registrado, não passa — esquecer o portão nunca significa aprovado."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Numero rotulo="Aprovações pendentes na casa" valor={aprovacoesPendentes} nota="decisões aguardando parecer" />
          <Numero rotulo="Recusas registradas pelo motor" valor={recusas.length} nota="cada 'não' fica auditado" />
        </div>
        <ul className="mt-3 space-y-1 text-[13px] text-[var(--text-muted)]">
          <li>• Toda alteração precisa de versão, testes e critérios de aceite.</li>
          <li>• Nenhuma mudança chega à produção sem Qualidade aprovada e Operações.</li>
          <li>• Merge com CI vermelho é ação proibida da ficha do departamento.</li>
        </ul>
        {!podeAprovarQualidade && (
          <p className="mt-3 text-[12px] text-[var(--text-muted)]">
            Você consulta esta seção; o parecer que libera a passagem é da Qualidade.
          </p>
        )}
      </Cartao>

      {/* ─── 10. Operações ──────────────────────────────────────────────── */}
      <Cartao
        id="operacoes"
        titulo="Deploys, observabilidade e rollback"
        subtitulo="Operações controla deploy e ambiente. A engenharia entrega; quem publica é Operações, depois da Qualidade."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Numero rotulo="Relógios batendo" valor={batidas.length} nota="prova de vida do agendador" />
          <Numero rotulo="Efeitos na fila" valor={outboxPendente} nota="aguardando processamento" />
          <Numero rotulo="Efeitos na fila morta" valor={outboxMorto} nota="exigem olhar humano" />
        </div>
        {batidas.length === 0 ? (
          <p className="mt-3 text-[13px] text-[var(--text-muted)]">
            Nenhuma batida de relógio registrada. Ausência de alerta não é ausência de problema: se o agendador não
            bate, o detector de ausências é quem conta — e ele vive no PM Command Center.
          </p>
        ) : (
          <ul className="mt-3 space-y-1 text-[12px] text-[var(--text-muted)]">
            {batidas.map((b) => (
              <li key={b.relogio}>
                <span className="font-medium text-[var(--text-primary)]">{b.relogio}</span> — última batida{" "}
                {b.ultimaBatida.toISOString().replace("T", " ").slice(0, 19)}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[12px] text-[var(--text-muted)]">
          <strong className="text-[var(--text-primary)]">Rollback:</strong> toda mudança estrutural desta casa é aditiva
          e reversível — desligar a flag devolve o comportamento anterior sem apagar dado. Nada nesta etapa foi ligado
          nem publicado.
        </p>
      </Cartao>

      {/* ─── 11. Histórico e auditoria ──────────────────────────────────── */}
      <Cartao
        id="auditoria"
        titulo="Histórico completo de handoffs e auditoria"
        subtitulo="Quem passou o bastão para quem, quem aceitou, quem executou, quanto custou e o que foi recusado."
      >
        <p className="text-[12px] font-medium text-[var(--text-primary)]">Handoffs</p>
        {handoffsDoDepto.length === 0 ? (
          <Vazio frase="Nenhum handoff com este departamento ainda — nem entrando (OS do PM) nem saindo (entrega para Qualidade e Operações)." />
        ) : (
          <ul className="mt-1 space-y-1 text-[12px]">
            {handoffsDoDepto.map((h) => (
              <li key={h.id} className="flex items-start justify-between gap-3">
                <span className="text-[var(--text-muted)]">
                  <span className="font-medium text-[var(--text-primary)]">
                    {h.deDepartamento} → {h.paraDepartamento}
                  </span>{" "}
                  · {h.versaoArtefato} · {h.criadoEm.toISOString().slice(0, 16).replace("T", " ")}
                </span>
                <Etiqueta texto={h.status === "aceito" ? "aceito" : "aguardando"} tom={h.status === "aceito" ? "ligado" : "atencao"} />
              </li>
            ))}
          </ul>
        )}

        <p className="mt-4 text-[12px] font-medium text-[var(--text-primary)]">Execuções (humano ou IA, com custo)</p>
        {execucoes.length === 0 ? (
          <Vazio frase="Nenhuma execução registrada neste departamento — coerente com as sete funções desligadas." />
        ) : (
          <ul className="mt-1 space-y-1 text-[12px] text-[var(--text-muted)]">
            {execucoes.map((e) => (
              <li key={e.id}>
                <span className="font-medium text-[var(--text-primary)]">{e.funcaoId}</span> · {e.ator}
                {e.modelo ? ` (${e.modelo})` : ""} · US$ {(e.custoUsd ?? 0).toFixed(4)} ·{" "}
                {e.inicio.toISOString().slice(0, 16).replace("T", " ")}
              </li>
            ))}
          </ul>
        )}

        <p className="mt-4 text-[12px] font-medium text-[var(--text-primary)]">Recusas do motor</p>
        {recusas.length === 0 ? (
          <Vazio frase="Nenhuma recusa registrada. Recusa sem rastro seria recusa invisível — por isso cada 'não' do motor é gravado com motivo." />
        ) : (
          <ul className="mt-1 space-y-1 text-[12px] text-[var(--text-muted)]">
            {recusas.map((r) => (
              <li key={r.id}>
                <span className="font-medium text-[var(--text-primary)]">{r.funcaoId}</span> — {r.motivo}
              </li>
            ))}
          </ul>
        )}
      </Cartao>

      <p className="text-[12px] text-[var(--text-muted)]">
        Departamento implantado em 15/08/2026 (PR #151). As sete funções permanecem desligadas: esta superfície mostra e
        audita, e não liga nada. Ligar é decisão registrada do dono, pela escada sombra → allowlist → wide.
      </p>
    </div>
  );
}
