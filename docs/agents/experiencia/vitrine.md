# Vitrine — experiencia

> Curada pelo PM. Qualquer agente lê; **só o PM escreve**.
> Toda entrada carrega proveniência. Se não couber em duas telas, não é vitrine.

> **Origem desta sala — 07/08/2026.** O papel de UX estava dentro do agente
> `interface`, que fazia forma e percurso ao mesmo tempo. A divisão em dois
> Essenciais é a doutrina 21 do `dioli-brain-kit`.
> **Nada foi apagado:** `docs/agents/interface/vitrine.md` e
> `docs/agents/interface/oficina.md` continuam intactos e são leitura útil sua —
> as entradas abaixo nasceram de incidentes registrados nesta casa.

---

## Os quatro defeitos desta casa que a nota de aparência NÃO pegou

Nenhum deles é feio. Todos chegaram ao CEO ou ao cliente pagante.

1. **Card de aprovação vazio** — título "Estratégia", subtítulo "Estratégia",
   três botões de decisão e **nenhuma linha de conteúdo**. O cliente era
   convidado a aprovar o que não podia ver. Num piloto 100% IA, aprovação às
   cegas é "sem gate = aprovado" com a culpa transferida para quem clicou.
2. **Duas verdades no mesmo cartão** — o Google Drive mostrava a faixa verde
   "conectado" e o texto "não conectado", ao mesmo tempo, porque a faixa vinha
   da *intenção* do popup e o texto vinha do banco.
3. **Saída que faltava** — o cartão de orçamento tinha duas decisões (aceitar /
   recusar) quando o cliente precisava de três. A devolutiva do CEO ficou **dois
   dias** sem destino porque **não havia botão para ela**.
4. **Título que era a transcrição crua do áudio** — *"para de óleo digital eu
   preciso de dois carrosseis…"*, ditado, sem pontuação, cortado ao meio.

— promovido em 2026-08-07 pelo PM · origem: `docs/pendencias.md`, bloco
"O PORTAL PEDIA APROVAÇÃO DE CARDS VAZIOS" (commit `02c7629`)

---

## Falha de LEITURA não pode virar FATO sobre o cliente

`.catch(() => null)`, posto para "não derrubar a página", converteu erro de
infraestrutura na afirmação *"você não conectou"*. Três desses em fila
produziram uma funcionalidade morta que se anunciava viva por um mês.

**A regra de percurso:** quando o sistema não consegue ler, a tela diz *"não
conseguimos verificar agora"* e dá o próximo passo. Nunca diz ao cliente o que
**ele** fez ou deixou de fazer. E a tela sempre nomeia o próximo passo — erro
que devolve a pessoa ao início é reprovação.

— promovido em 2026-08-07 pelo PM · origem: `docs/pendencias.md`, bloco
"o Drive do cliente NUNCA funcionou em produção" (commit `70d0275`)

---

## Estado vazio no portal é requisito, não acabamento

No portal do cliente, tela vazia é **o cliente achando que não recebeu nada**.
Estado vazio explica o que é aquilo e o que vem a seguir. Nunca tela em branco,
nunca zero onde a resposta é "não sei".

— promovido em 2026-08-07 pelo PM · origem: `docs/agents/interface/vitrine.md`,
entrada "Estado honesto vence preenchimento bonito" (`HANDOFF.md` §4.3, §5.1)

---

## Você não conserta. Você aponta.

Este agente roda **sem `Write` e sem `Edit`**, por construção (constituição dos
Essenciais, regra 3). O conserto de forma vai para `interface`; o de regra, para
o especialista do domínio; a decisão de eliminar tela ou passo, para o PM.

— promovido em 2026-08-07 pelo PM · origem: ordem do CEO de 07/08/2026 e
`dioli-brain-kit/docs/23-constituicao-dos-essenciais.md`
