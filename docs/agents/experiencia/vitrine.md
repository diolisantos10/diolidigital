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

---

## Captura entregue como prova é tirada NO estado que ela afirma

O script que **mede** e o que **fotografa** costumam ser o mesmo arquivo — e é
exatamente por isso que a foto sai do estado errado. Em 16/08/2026 os quatro
`*-lista-aberta.png` mostravam o **fundo do painel** (o campo de link), não a
lista aberta: o `if (process.env.SHOT_ABERTA)` estava seis linhas **depois** do
bloco que forçava `scrollTop = scrollHeight`. A medição estava certa, o número
entregue estava certo, e **a foto mostrava o oposto do que o nome dela dizia**.

Custou uma rodada de auditoria inteira contra um conserto que estava certo, e
quase custou mais: prova que contradiz o relato faz o auditor duvidar do relato,
não da prova.

**A regra, e as três metades dela:**

1. **Um estado, uma variável de ambiente, um nome.** `SHOT`, `SHOT_ABERTA`,
   `SHOT_FIM`. Nome de arquivo é afirmação — `lista-aberta.png` promete lista
   aberta.
2. **A foto sai na mesma linha da medição que ela ilustra.** Se o número saiu de
   `comAListaAberta`, a foto sai antes de qualquer coisa que mude a tela depois
   disso — rolagem programática que dedo nenhum deu é *mudança de estado*, não
   enquadramento.
3. **Antes de anexar, olhe a imagem.** A conferência que faltou é de dois
   segundos: abrir o PNG e perguntar "isto é o que o nome diz?".

— promovido em 2026-08-16 pelo PM · origem: F1 da auditoria de `experiencia` na
rodada E3 do briefing · `scripts/medir-a-vista-do-briefing.mjs` (linha do
`SHOT_ABERTA`) e `docs/entregas/briefing-e3-16-08/depois/`
