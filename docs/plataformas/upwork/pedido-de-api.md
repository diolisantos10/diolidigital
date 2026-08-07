# Pedido de API key à Upwork — texto pronto para o CEO enviar

**Estado: NÃO ENVIADO.** Quem envia é o CEO. Nenhum agente desta casa mandou
nada.

**Por que a pressa, se a Upwork é prioridade 1 e ainda não há adaptador:**
porque o prazo é EXTERNO. A Upwork analisa a conta e o caso de uso, e isso leva
dias ou semanas. **Enquanto ninguém pede, o relógio não começa.** O pedido é
barato; a espera é o custo.

- **Onde:** Suporte da Upwork → solicitação de API key
  (a própria Upwork instrui: *"se você deseja automatizar parte do workflow,
  solicite uma API key"*).
- **Campo que a resposta preenche:** `docs/plataformas/upwork/policy.json →
  autorizacao_do_provedor` (`status`, `respondido_em`, `escopos_concedidos`,
  `evidencia`).

## ⚠️ A regra do texto: descrever o uso REAL, sem enfeite

A `01` do CEO é explícita sobre o que **não** dizer: nada de *scraper*, *bot de
propostas*, *auto-bid*, *envio em massa*. **Não porque sejam palavras feias —
porque não é o que a gente vai fazer.** Descrever errado o próprio uso é o jeito
mais rápido de ter o pedido negado, e um pedido negado por descrição errada
queima a chance de pedir de novo.

E o contrário também vale: **se a descrição honesta for negada, a resposta é
redesenhar o uso, nunca maquiar o pedido.**

---

## O texto

> **Assunto:** API access request — internal opportunity management system for
> our agency account
>
> Hello,
>
> We are a small Brazilian digital agency with an agency account on Upwork. We
> would like to request API access to integrate Upwork with our own internal
> systems.
>
> **What we want to build, in plain terms:** an internal system that helps us
> identify which job postings are actually relevant to the services we deliver,
> analyse how well each one fits our capabilities, and assist us in managing
> individualised proposals for the ones we decide to pursue.
>
> **How we intend to use it:**
>
> - Read job postings relevant to our categories, at a normal pace, to shortlist
>   opportunities instead of reviewing every posting manually.
> - Analyse the brief of each shortlisted job to assess fit against the services
>   we actually deliver, and to price it correctly.
> - Help our team prepare an individualised proposal for each opportunity we
>   choose to pursue — one proposal written for that specific job, never a
>   template reused across postings.
> - Keep track of the status of proposals we have submitted.
>
> **What we are explicitly not asking for, and will not do:** we are not looking
> to submit proposals in bulk, to apply to every posting we can reach, or to
> operate at a rate faster than a person would. Our intent is the opposite — to
> apply to *fewer* jobs, with better and more specific proposals. If, out of a
> hundred postings, only a dozen genuinely fit what we do, we want to submit
> twelve careful proposals rather than a hundred generic ones.
>
> We understand that spam of proposals or invitations remains prohibited
> regardless of API access, and we have no interest in that behaviour — it would
> damage our own reputation on the platform before anything else.
>
> Could you tell us:
>
> 1. whether our use case qualifies for API access;
> 2. which scopes would be granted for it;
> 3. whether submitting a proposal through the API (`VendorProposal`) is within
>    the permitted scope for an agency operating its own account, or whether
>    that step should remain a manual action by a member of our team.
>
> We are happy to provide any additional detail about the account or the system.
>
> Thank you,
> Dioli Digital

---

## O que fazer com a resposta

1. Arquivar em `docs/plataformas/upwork/fontes/resposta-<data>.md`.
2. Preencher `policy.json → autorizacao_do_provedor` com **status +
   respondido_em + escopos_concedidos + evidencia**. As metades valem juntas.
3. **Só então** as `capabilities` mudam de `MANUAL` para o que foi concedido —
   e **cada uma pelo escopo que a Upwork nomeou**, nunca em bloco. Escopo não
   concedido continua `MANUAL`.
4. Enquanto isso, **nenhum adaptador da Upwork é construído.** Prioridade 1 no
   roadmap não é prioridade 1 na fila de hoje.
