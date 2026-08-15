"use client";

// ═══════════════════════════════════════════════════════════════════════════
//  FICHA DO CLIENTE — ação do cabeçalho, não aba.
//
//  Ela é consulta que se faz DE DENTRO de qualquer aba, sem perder o lugar onde
//  se estava. Virar aba a colocaria em concorrência com as doze áreas de
//  trabalho, e ninguém procura cadastro numa trilha de abas de operação.
//
//  Onde não existe fonte de dado, o campo mostra "— não informado" e o card
//  mostra o motivo — nunca o exemplo de uma maquete passando por dado de um
//  cliente real.
// ═══════════════════════════════════════════════════════════════════════════

import { Pill, Head, EmptyBlock, Acao } from "./primitives";
import type { ClientSheetData } from "@/lib/agency/clients/workspace/ficha";
import type { PermissoesDoWorkspace } from "@/lib/agency/clients/workspace/permissoes";

function Dl({ rows }: { rows: { term: string; value: string | null }[] }) {
  return (
    <dl>
      {rows.map((r) => (
        <div key={r.term}>
          <dt>{r.term}</dt>
          <dd className={r.value === null ? "noData" : ""}>{r.value ?? "— não informado"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ClientSheet({
  close,
  clientName,
  initial,
  data,
  perms,
}: {
  close: () => void;
  clientName: string;
  initial: string;
  data: ClientSheetData;
  perms: PermissoesDoWorkspace;
}) {
  const b = data.briefing;
  const podeEditar = perms.escrita.overview;

  return (
    <div className="modalBackdrop" role="dialog" aria-modal="true" aria-label="Ficha do cliente">
      <section className="clientSheet">
        <header>
          <div className="agentMini">{initial}</div>
          <div>
            <small>FICHA TÉCNICA DO CLIENTE</small>
            <h2>{clientName} · Client Profile</h2>
          </div>
          <Pill>CADASTRO ATIVO</Pill>
          <button onClick={close} aria-label="Fechar ficha do cliente" type="button">
            ×
          </button>
        </header>

        <div className="sheetMeta">
          <span>
            <small>RESPONSÁVEL DO CLIENTE</small>
            <b className={data.responsible.name === null ? "noData" : ""}>{data.responsible.name ?? "—"}</b>
            <em>{data.responsible.role ?? "sem responsável cadastrado"}</em>
          </span>
          <span>
            <small>ORIGEM COMERCIAL</small>
            <b className={data.origin.label === null ? "noData" : ""}>{data.origin.label ?? "—"}</b>
            <em>{data.origin.note ?? "sem registro de intake"}</em>
          </span>
          <span>
            <small>AGENTE RESPONSÁVEL</small>
            <b>{data.agent.label}</b>
            <em>{data.agent.note}</em>
          </span>
          <span>
            <small>RELACIONAMENTO</small>
            <b>{data.relationship.label}</b>
            <em>{data.relationship.note ?? "—"}</em>
          </span>
        </div>

        <div className="sheetGrid">
          <article>
            <Head over="EMPRESA" title="Informações cadastrais" />
            <Dl rows={data.company} />
          </article>

          <article>
            <Head over="CONTATO PRINCIPAL" title="Responsável do lado do cliente" />
            <Dl rows={data.contact} />
            <p className="moduleLead">
              Cargo, autonomia, decisor e aprovadores ainda não têm campo próprio no cadastro. Nada
              disso é deduzido de quem responde as mensagens — quem fala não é necessariamente quem
              decide, e confundir os dois é como uma aprovação vira discussão depois.
            </p>
          </article>

          <article className="briefingCard">
            <Head over="INTAKE DO AGENTE SDR" title="Briefing original" />
            {b.summary === null ? (
              <EmptyBlock
                title="Nenhum briefing do SDR registrado"
                hint="A entrevista de sondagem do Agente SDR ainda não foi feita para este cliente. Enquanto ela não existir, nada é preenchido aqui por dedução."
              />
            ) : (
              <>
                <p>{b.summary}</p>
                <div>
                  <span>
                    <small>DOR CENTRAL</small>
                    <b className={b.pain === null ? "noData" : ""}>{b.pain ?? "— não perguntado"}</b>
                  </span>
                  <span>
                    <small>OBJETIVO</small>
                    <b className={b.goal === null ? "noData" : ""}>{b.goal ?? "— não perguntado"}</b>
                  </span>
                  <span>
                    <small>PÚBLICO</small>
                    <b className={b.audience === null ? "noData" : ""}>{b.audience ?? "— não perguntado"}</b>
                  </span>
                </div>
              </>
            )}
          </article>

          <article>
            <Head over="GOVERNANÇA" title="Regras do relacionamento" />
            <Dl rows={data.governance} />
          </article>
        </div>

        <footer>
          <span>
            {data.lastReview
              ? `Última movimentação: ${data.lastReview} · histórico preservado`
              : "Sem movimentação registrada"}
          </span>
          <button onClick={close} type="button">Fechar</button>
          {podeEditar ? (
            <Acao className="primary" onClick={close}>Editar pelo cabeçalho</Acao>
          ) : (
            <Acao
              className="primary"
              indisponivel={perms.motivo.overview ?? "Sem permissão para alterar o cadastro deste cliente."}
            >
              Editar ficha
            </Acao>
          )}
        </footer>
      </section>
    </div>
  );
}
