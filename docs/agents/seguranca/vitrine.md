# Vitrine — seguranca

> Curada pelo PM. Qualquer agente lê; **só o PM escreve**.
> Toda entrada carrega proveniência. Se não couber em duas telas, não é vitrine.

> **Origem desta sala — 07/08/2026.** Segurança morava dentro do agente
> `plataforma`. A separação em Essencial próprio é a doutrina 21 do
> `dioli-brain-kit`.
> **Nada foi apagado:** `docs/agents/plataforma/vitrine.md` e
> `docs/agents/plataforma/oficina.md` continuam intactos e são leitura
> obrigatória sua antes de tocar em auth, banco ou deploy.

---

## Fail closed já é o padrão desta casa — e ele foi conquistado, não herdado

Três provas registradas, todas de 07/08/2026:

- **`GET /api/admin/links-do-portal`** — sem segredo devolve **401**, e a rota
  inexistente devolve 404. É essa diferença que separa "viva e fechada" de
  "não existe". Ela **não emite token por padrão** (`?emitir=1` é explícito) e
  **nunca revoga token vivo**.
- **Google Drive** — sem `GOOGLE_PICKER_API_KEY` o portal diz a verdade e some
  o botão, em vez de oferecer um botão quebrado.
- **99Freelas** — apagar a linha `plano_declarado_da_conta` devolve o sistema à
  cota mínima sozinho, e não à cota otimista.

**Quando você construir trava nova, o padrão é este.** E prove as duas metades:
que ela barra o caso plantado **e** que não inventa problema no caso limpo.

— promovido em 2026-08-07 pelo PM · origem: `docs/pendencias.md` (commit `70d0275`)

---

## 🔴 As portas abertas conhecidas nesta casa, em 07/08/2026

Herdadas com a sala. Nenhuma é sua descoberta — todas esperam dono.

1. **`publishPost` não consulta `MetaAtivoAutorizado`**
   (`lib/integrations/meta/client.ts`). A trava de ativos cobre leitura de ads,
   gravação de conexão e escrita de anúncio — **não cobre publicação orgânica**.
   Hoje o que segura os 6 posts da Foocci é a falta das artes, não uma trava.
   Com o backfill aplicado, a casa publicaria sozinha no `@foocci_`, contra a
   ordem "nada publica na Meta sozinho". **Mexer aqui exige parecer do `meta`.**
2. **19 conexões de terceiros no banco sem autorização.** Decisão do CEO em
   06/08: **mantidas**, porque apagar destrói o token e não é reversível. O
   sistema não lê nenhuma delas. A porta de entrada já foi fechada
   (`lib/integrations/meta/escolha-de-ativos.ts`).
3. **`social/generate` e `design/generate` aceitam `clientId` opcional.** Quando
   não vem, o custo entra na conta **sem dono**. Declarado, não preenchido por
   inferência.
4. **Divergência de chave estrangeira em `ClientAiProvider`** — `prisma migrate
   diff` propõe RECONSTRUIR a tabela. Adiado de propósito para janela calma.

— promovido em 2026-08-07 pelo PM · origem: `docs/pendencias.md`, blocos de
06 e 07/08/2026

---

## O padrão de defeito que mais custou aqui: a falha que vira afirmação

`.catch(() => null)` posto para "não derrubar a página" converte falha de
infraestrutura em **afirmação falsa sobre o cliente**. Três em fila mantiveram
uma funcionalidade morta se anunciando viva por um mês.

Cada um era defensável isoladamente. **Procure-os em fila, não em isolamento.**

— promovido em 2026-08-07 pelo PM · origem: `docs/pendencias.md`, bloco do
Google Drive (commit `70d0275`)

---

## Segredo: nunca imprima o valor. Em lugar nenhum.

Nem em log, nem em relatório, nem numa resposta ao PM. Nome da variável e
"presente / ausente" bastam para diagnosticar. **Credencial colada em conversa
conta como vazada** e precisa de rotação — foi assim no Foocci.

— promovido em 2026-08-07 pelo PM · origem:
`dioli-brain-kit/docs/23-constituicao-dos-essenciais.md`, SEGURANÇA §9
