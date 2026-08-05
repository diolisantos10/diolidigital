"use client";

// /agency/inbox — A CAIXA DE ENTRADA DA AGÊNCIA.
//
// A tela que faltava. Até 05/08/2026 o cliente escrevia pelo portal e a
// mensagem caía num campo que ninguém consultava: `readByTeam` era gravado em
// 11 lugares do código e lido para contagem em ZERO. Aqui é onde a agência lê,
// responde e decide o que fazer com o que o cliente pede.
//
// O componente inteiro vive em `components/agency/portal/CaixaDeEntrada.tsx` —
// esta página é só a moldura, como as outras telas da agência.

import AgencyHeader from "@/components/agency/layout/AgencyHeader";
import CaixaDeEntrada from "@/components/agency/portal/CaixaDeEntrada";

export default function InboxPage() {
  return (
    <div>
      <AgencyHeader
        title="Caixa de entrada"
        eyebrow="Clientes"
        subtitle="Tudo que os clientes mandaram: conversas e pedidos de conteúdo. Não-lidas primeiro."
      />
      <CaixaDeEntrada />
    </div>
  );
}
