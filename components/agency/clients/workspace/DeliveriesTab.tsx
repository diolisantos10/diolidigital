"use client";

// ═══════════════════════════════════════════════════════════════════════════
//  10. ENTREGAS — o que a agência produziu, e o que o cliente mandou.
//
//  ── A SEPARAÇÃO QUE O CONTRATO EXIGE, E POR QUE ELA NÃO É DE RÓTULO ─────
//  "Diferenciar claramente material enviado pelo cliente de entrega produzida
//  pela agência." A diferença é de DONO e de EFEITO:
//
//   · Material do cliente (`MediaAsset.kind = "inbound"`) é INSUMO. Ele
//     destrava produção travada por falta de arquivo e NUNCA passa por
//     aprovação — ninguém aprova o próprio logo que enviou.
//   · Entrega (`Deliverable`) é PRODUTO. Tem versão, passa pelo gate e volta
//     com decisão.
//
//  Por isso são DUAS LISTAS, em dois submódulos, com contadores próprios — não
//  uma lista com um selo. Uma lista só, ordenada por data, produz "aprovar o
//  arquivo que o próprio cliente mandou" — e alguém aprova.
//
//  ── "ENTREGUE" NÃO É "PRONTO" ───────────────────────────────────────────
//  `Deliverable.visibility` nasce "interno" de propósito. Só "compartilhado"
//  significa que o cliente viu. A tela separa as duas colunas porque a agência
//  que confunde "terminamos" com "entregamos" cobra por algo que o cliente
//  ainda não recebeu.
// ═══════════════════════════════════════════════════════════════════════════

import { useMemo, useState } from "react";
import { Pill, Head, TabTitle, Kpis, EmptyBlock, Acao, SubNav } from "./primitives";
import { escritaDaAba, type PropsDaAba } from "./props-da-aba";

const SUB = ["Entregas da agência", "Material do cliente", "Por projeto", "Por departamento"] as const;

export function DeliveriesTab({ view, perms, setTab }: PropsDaAba) {
  const [sub, setSub] = useState<string>(SUB[0]);
  const [busca, setBusca] = useState("");
  const { pode, motivo } = escritaDaAba(perms, "deliveries");

  const entregas = view.deliverables;
  const materiais = view.clientMaterials;

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return entregas;
    return entregas.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        (d.projectName ?? "").toLowerCase().includes(q) ||
        (d.department ?? "").toLowerCase().includes(q),
    );
  }, [entregas, busca]);

  const porProjeto = useMemo(() => {
    const m = new Map<string, typeof entregas>();
    for (const d of entregas) {
      const k = d.projectName ?? "Sem projeto";
      m.set(k, [...(m.get(k) ?? []), d]);
    }
    return [...m.entries()];
  }, [entregas]);

  const porDepartamento = useMemo(() => {
    const m = new Map<string, typeof entregas>();
    for (const d of entregas) {
      const k = d.department ?? "Departamento não registrado";
      m.set(k, [...(m.get(k) ?? []), d]);
    }
    return [...m.entries()];
  }, [entregas]);

  const linha = (d: (typeof entregas)[number]) => (
    <div className="deliveryRow" key={d.id}>
      <i className={d.shared ? "done" : "medium"} />
      <span>
        <b>{d.title}</b>
        <small>
          {d.projectName ?? "sem projeto"} · {d.department ?? "departamento não registrado"}
        </small>
      </span>
      <Pill>{d.statusLabel}</Pill>
      <strong>
        v{d.version}
        {d.versionCount > 1 && <em>{d.versionCount} versões</em>}
      </strong>
      <Pill t={d.shared ? "ok" : ""}>{d.shared ? "Apresentada" : "Ainda interna"}</Pill>
      <time className={d.when === null ? "noData" : ""}>{d.when ?? "—"}</time>
      {d.hasContent ? (
        <Acao href={`/agency/deliverables?deliverable=${d.id}`} ariaLabel={`Abrir ${d.title}`}>
          Abrir →
        </Acao>
      ) : (
        <Acao indisponivel="Esta entrega não tem corpo nem versão gravada — não há arquivo para abrir. É registro de entrega, não a entrega.">
          Abrir
        </Acao>
      )}
    </div>
  );

  return (
    <section className="workspaceTab deliveriesTab">
      <TabTitle
        status={entregas.length ? `${entregas.length} ENTREGA${entregas.length > 1 ? "S" : ""}` : "NENHUMA ENTREGA"}
        title="Client Delivery Center"
        desc="O que a agência produziu para este cliente, com versão, status e histórico — separado do que o cliente enviou."
      >
        <Acao onClick={() => setTab("approvals")}>Ver aprovações</Acao>
        {pode ? (
          <Acao className="primary" href="/agency/deliverables">Central de entregas</Acao>
        ) : (
          <Acao className="primary" indisponivel={motivo!}>Central de entregas</Acao>
        )}
      </TabTitle>

      <Kpis items={view.areaMetrics.deliveries} className="deliveryKpis" />

      <SubNav
        itens={SUB}
        atual={sub}
        onEscolher={setSub}
        contadores={{ "Entregas da agência": entregas.length, "Material do cliente": materiais.length }}
      />

      {sub === "Entregas da agência" && (
        <article className="card inbox">
          <Head over="PRODUZIDO PELA AGÊNCIA" title="Entregas do cliente" />
          <div className="deliveryFilters">
            <label className="srOnly" htmlFor="buscaEntrega">Buscar entrega</label>
            <input
              id="buscaEntrega"
              type="search"
              placeholder="Buscar por nome, projeto ou departamento"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
            <span>
              {filtradas.length} de {entregas.length}
            </span>
          </div>
          {entregas.length === 0 ? (
            <EmptyBlock
              title="Nenhuma entrega registrada"
              hint="Entregas pertencem ao cliente e atravessam os projetos. Assim que a primeira for concluída, ela aparece aqui — e no portal do cliente somente quando alguém decidir apresentá-la."
              action="Ver projetos"
              onAction={() => setTab("projects")}
            />
          ) : filtradas.length === 0 ? (
            <EmptyBlock title={`Nada encontrado para “${busca}”`} hint="Limpe a busca para ver a lista inteira." />
          ) : (
            filtradas.map(linha)
          )}
        </article>
      )}

      {sub === "Material do cliente" && (
        <article className="card inbox">
          <Head over="ENVIADO PELO CLIENTE" title="Material que ELE mandou" />
          <p className="moduleLead">
            Insumo, não entrega. Nada desta lista passa por aprovação — ninguém aprova o arquivo que
            o próprio cliente enviou. Ela existe separada para que essas duas coisas nunca se
            misturem numa fila só.
          </p>
          {materiais.length === 0 ? (
            <EmptyBlock
              title="O cliente ainda não enviou nada"
              hint="Arquivos enviados pelo portal do cliente aparecem aqui — logo, foto de produto, tabela de preços. Enquanto não houver nenhum, a produção que depender de material fica travada e o motivo é este."
            />
          ) : (
            materiais.map((m) => (
              <div className="deliveryRow material" key={m.id}>
                <i className="c0" />
                <span>
                  <b>{m.fileName}</b>
                  <small>{m.mimeType}</small>
                </span>
                <Pill>Material do cliente</Pill>
                <strong className={m.size === null ? "noData" : ""}>{m.size ?? "—"}</strong>
                <Pill>Enviado por {m.uploadedBy}</Pill>
                <time className={m.when === null ? "noData" : ""}>{m.when ?? "—"}</time>
                <Acao href={`/api/media/${m.id}`} ariaLabel={`Baixar ${m.fileName}`}>
                  Baixar →
                </Acao>
              </div>
            ))
          )}
        </article>
      )}

      {sub === "Por projeto" && (
        <div className="deliveryGroups">
          {porProjeto.length === 0 ? (
            <article className="card">
              <EmptyBlock title="Nenhuma entrega para agrupar" hint="Sem entrega não há agrupamento por projeto." />
            </article>
          ) : (
            porProjeto.map(([nome, itens]) => (
              <article className="card inbox" key={nome}>
                <Head over="PROJETO" title={`${nome} · ${itens.length}`} />
                {itens.map(linha)}
              </article>
            ))
          )}
        </div>
      )}

      {sub === "Por departamento" && (
        <div className="deliveryGroups">
          {porDepartamento.length === 0 ? (
            <article className="card">
              <EmptyBlock title="Nenhuma entrega para agrupar" hint="Sem entrega não há agrupamento por departamento." />
            </article>
          ) : (
            porDepartamento.map(([nome, itens]) => (
              <article className="card inbox" key={nome}>
                <Head over="DEPARTAMENTO" title={`${nome} · ${itens.length}`} />
                {itens.map(linha)}
              </article>
            ))
          )}
        </div>
      )}
    </section>
  );
}
