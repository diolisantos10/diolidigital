"use client";

// LeadNaPorta — nome, e-mail e telefone ANTES da conversa.
//
// ORDEM DO CEO, 16/08/2026: *"resolve isso de uma vez. Quando entra na página
// de briefing, implementa um formulário de lead simples: nome, e-mail e
// telefone, pronto."*
//
// POR QUE ELE MANDOU ISSO, e por que é a decisão certa:
// Ele fez o briefing do CityJobs às 01:12 e esperou a noite inteira por um
// orçamento que nunca chegou. Passamos horas atrás da causa, e todo caminho
// ia dar no mesmo lugar: **a casa não sabia como falar com ele**. O SDR havia
// parado de pedir e-mail; a porta de entrada classifica quem chega sem contato
// como `lead_incompleto`; e nesse estado o pedido sai da vista de todo mundo.
//
// Perguntar contato no MEIO da conversa é frágil: depende de o modelo lembrar,
// de o cliente responder, e de a resposta ser lida como contato. Perguntar na
// PORTA é uma coisa só, acontece sempre, e não depende de ninguém lembrar.
//
// ─── AS DUAS REGRAS ─────────────────────────────────────────────────────────
//
// 1. **Nome é obrigatório, e pelo menos UM canal** — e-mail ou WhatsApp. Um
//    canal basta: exigir os dois enche o formulário e derruba conversão sem
//    aumentar a capacidade de responder.
// 2. **Dá para pular.** Cliente que não quer deixar contato entra assim mesmo,
//    e a tela diz — sem drama e sem letra miúda — que a resposta só vai chegar
//    pelo portal. Barrar a entrada perderia o briefing inteiro, que é pior que
//    não ter o telefone.

import { useState } from "react";

export type ContatoDaPorta = { nome: string; email: string; whatsapp: string } | null;

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** Brasileiro com DDD: 10 ou 11 dígitos depois de tirar o enfeite. */
const digitos = (v: string) => v.replace(/\D+/g, "");
const whatsappOk = (v: string) => {
  const d = digitos(v);
  return d.length >= 10 && d.length <= 13;
};

export function LeadNaPorta({ aoEntrar }: { aoEntrar: (contato: ContatoDaPorta) => void }) {
  const [nome, setNome]         = useState("");
  const [email, setEmail]       = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [erro, setErro]         = useState<string | null>(null);

  const temCanal = EMAIL_OK.test(email.trim()) || whatsappOk(whatsapp);
  const pronto   = nome.trim().length >= 2 && temCanal;

  function entrar() {
    if (!nome.trim()) { setErro("Como podemos te chamar?"); return; }
    if (!temCanal)    { setErro("Deixe um e-mail ou um WhatsApp — é por onde a proposta chega."); return; }
    aoEntrar({ nome: nome.trim(), email: email.trim(), whatsapp: whatsapp.trim() });
  }

  return (
    <div className="max-w-[440px] mx-auto py-10 px-4">
      <h1 className="text-[22px] font-semibold text-[var(--text-primary)]">
        Vamos entender seu projeto
      </h1>
      <p className="mt-2 text-[14px] text-[var(--text-secondary)] leading-relaxed">
        Antes de começar, como a gente te encontra depois? É por aqui que a sua
        proposta chega.
      </p>

      <div className="mt-6 flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-[var(--text-secondary)]">Seu nome</span>
          <input
            value={nome}
            onChange={(e) => { setNome(e.target.value); setErro(null); }}
            placeholder="Como podemos te chamar?"
            className="h-11 px-3 rounded-[8px] border border-[var(--border)] text-[14px]"
            autoComplete="name"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-[var(--text-secondary)]">E-mail</span>
          <input
            value={email}
            onChange={(e) => { setEmail(e.target.value); setErro(null); }}
            placeholder="voce@empresa.com.br"
            type="email"
            inputMode="email"
            className="h-11 px-3 rounded-[8px] border border-[var(--border)] text-[14px]"
            autoComplete="email"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-[var(--text-secondary)]">WhatsApp</span>
          <input
            value={whatsapp}
            onChange={(e) => { setWhatsapp(e.target.value); setErro(null); }}
            placeholder="(11) 90000-0000"
            type="tel"
            inputMode="tel"
            className="h-11 px-3 rounded-[8px] border border-[var(--border)] text-[14px]"
            autoComplete="tel"
          />
        </label>

        <p className="text-[12px] text-[var(--text-muted)]">
          Um dos dois já basta. O WhatsApp costuma ser mais rápido.
        </p>

        {erro && (
          <p className="text-[13px] text-red-700 bg-red-50 border border-red-200 rounded-[8px] p-3">
            {erro}
          </p>
        )}

        <button
          onClick={entrar}
          disabled={!pronto}
          className="h-11 rounded-[8px] bg-[var(--text-primary)] text-white text-[14px] font-medium disabled:opacity-40"
        >
          Começar o briefing
        </button>

        {/* Pular continua existindo: perder o briefing inteiro por causa do
            telefone é pior que não ter o telefone. Mas a consequência é dita
            na hora, não descoberta depois. */}
        <button
          onClick={() => aoEntrar(null)}
          className="h-9 text-[13px] text-[var(--text-muted)] underline underline-offset-2"
        >
          Prefiro não deixar contato agora
        </button>
        <p className="text-[11px] text-[var(--text-subtle)] -mt-1">
          Sem contato, a resposta só aparece aqui no portal — não temos como te avisar.
        </p>
      </div>
    </div>
  );
}
