"use client";

// ─── Ativos de Marca — dados REAIS por cliente (03/10/2026) ───────────────────
//
// Esta tela lia dados de exemplo e a lista de clientes guardada no navegador:
// todo cliente de verdade aparecia vazio, com aviso em inglês e sem botão para
// criar nada. Achado do test drive de Branding.
//
// Agora: clientes do BANCO (`useDbClients`) e, para o escolhido, o mesmo
// componente da página do cliente (`MaterialDeMarca`) — lista o que a peça
// consegue usar (logo, manual, fotos) e deixa subir material ali mesmo. Uma
// implementação, não duas.

import { useState } from "react";
import Link from "next/link";
import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import MaterialDeMarca from "@/components/agency/clients/MaterialDeMarca";
import { useDbClients } from "@/lib/hooks/useDbClients";

export default function BrandAssetsPage() {
  const { clients, loading } = useDbClients();
  const [clientId, setClientId] = useState("");
  const escolhido = clients.find((c) => c.id === clientId) ?? null;

  return (
    <>
      <AgencyHeader
        title="Ativos de Marca"
        subtitle="Logo, manual da marca e fotos de cada cliente — o que as peças conseguem usar de verdade"
      />

      <label className="mb-6 flex max-w-[420px] flex-col gap-1.5">
        <span className="text-[12px] font-medium text-[var(--text-secondary)]">Cliente</span>
        <select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          disabled={loading}
          className="h-11 rounded-[8px] border border-[var(--border)] bg-white px-3 text-[13px] text-[var(--text-primary)]"
        >
          <option value="">{loading ? "Carregando clientes…" : "Escolha um cliente…"}</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </label>

      {!loading && clients.length === 0 ? (
        <div className="rounded-[12px] border border-[var(--border)] bg-white px-8 py-16 text-center">
          <p className="text-[14px] font-medium text-[var(--text-primary)]">Nenhum cliente cadastrado</p>
          <p className="mt-1.5 text-[13px] text-[var(--text-muted)]">
            Cadastre um cliente em <Link href="/agency/clients" className="underline">Clientes</Link> para subir o material da marca dele.
          </p>
        </div>
      ) : !escolhido ? (
        <div className="rounded-[12px] border border-[var(--border)] bg-white px-8 py-16 text-center">
          <p className="text-[14px] font-medium text-[var(--text-primary)]">Escolha um cliente acima</p>
          <p className="mt-1.5 text-[13px] text-[var(--text-muted)]">
            Você vê o logo, o manual e as fotos dele — e pode subir o que faltar aqui mesmo.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* `key` por cliente: trocar de cliente recomeça a tela do zero — a
              mensagem do envio de um cliente não fica na tela do outro. */}
          <MaterialDeMarca key={escolhido.id} clientId={escolhido.id} />
          <p className="text-[12px] text-[var(--text-muted)]">
            A ficha completa da marca (cores, voz, regras) fica na{" "}
            <Link href={`/agency/clients/${escolhido.id}`} className="underline">página do cliente</Link>.
          </p>
        </div>
      )}
    </>
  );
}
