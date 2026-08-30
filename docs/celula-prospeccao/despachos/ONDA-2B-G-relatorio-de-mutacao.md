# ONDA 2B — FICHA G · O RELATÓRIO DE MUTAÇÃO

## Objetivo em uma frase
Escrever `docs/celula-prospeccao/mutacao-onda-2b.md` — a LEITURA humana do dado
cru que já está em `docs/celula-prospeccao/mutacao-onda-2b.json`.

## Arquivos que são SEUS (e só estes)
1. `docs/celula-prospeccao/mutacao-onda-2b.md` — **criar**.

**Não escreva em mais nada.** Não edite código, não edite teste, não edite o
`.json` (ele é gerado por script e diz isso). Não rode npm/npx/node/git.

## O dado, já medido por mim (o PM) — não invente número
- Rodado com `node scripts/mutacao-onda-2.mjs docs/celula-prospeccao/mutacao-onda-2b-lista.json docs/celula-prospeccao/mutacao-onda-2b.json`
- **19 mutações · 19 caíram · 0 continuaram verdes · `restaurado: true` nas 19.**
- Suíte no fim: **806 testes verdes** em `__tests__/celula` + `__tests__/marketplaces`
  (a linha de base antes desta onda era 438 na célula e 151/152 em marketplaces,
  com 1 vermelho).
- `npx tsc --noEmit`: limpo.

## O ACHADO DESTA RODADA — e é o coração do relatório
A **primeira** rodada deu **18 caíram, 1 continuou VERDE**:
`m14/politica-fail-closed` — afrouxar o fallback de `maximo_por_oportunidade`
de `: 1` para `: Infinity` (ou seja: política ausente passaria a significar
**acompanhamentos ilimitados**) **não derrubou nenhum teste**.

Duas causas somadas, e as duas merecem estar escritas:
1. O `policy.json` real **tem** o campo, então o ramo do fallback nunca era
   exercitado pelos testes que usam `"99freelas"`.
2. O único teste com plataforma sem política **não isolava** o fallback: sem
   política, o intervalo também vira `Infinity` e o bloqueio de tempo dispara
   antes. **Um bloqueio escondia o outro** — o teste passava por um motivo que
   não era o que ele achava que provava.

Conserto (ficha F, despachada na mesma sessão): `configuracaoDeAcompanhamento`
virou exportada e injetável, `podeAcompanhar` ganhou um 4º parâmetro opcional
para o bloco de política, e entraram 15 testes isolando cada fallback um a um,
mais o teste de ponta em que o intervalo já passou e só o teto pode bloquear.
Na segunda rodada, **as 19 caíram**.

> A lição, e é a razão de a mutação existir: **suíte verde não prova guarda
> viva.** Aqui foi uma guarda de fail-closed que valia "um acompanhamento" contra
> "acompanhamentos ilimitados", e ela estava desprotegida sob 38 testes verdes.

## O formato
Espelhe `docs/celula-prospeccao/mutacao-onda-2.md`, que já existe — leia-o antes
de escrever. Ele traz: abertura explicando o que é mutação e por que só conta a
que fica vermelha **pelo motivo certo**; o comando para reproduzir; uma tabela
`mutação | a guarda que ela afrouxa | o teste ficou | os testes que caíram`; e
depois as seções de achado.

Monte a tabela **a partir do `.json`**, linha por linha, sem reescrever os textos
de `guarda` e `porqueCaiu`. As 19 entram, nenhuma fica de fora.

## As seções que o relatório precisa ter, além da tabela
1. **O que esta onda travou**, em uma linha cada: os 22 textos literais do CEO
   continuam inenviáveis; o colchete `[NOME]` não chega ao cliente; as seis
   condições do M14; a fronteira de palavra acentuada.
2. **O achado da guarda decorativa**, contado como está acima.
3. **O que a mutação NÃO cobre desta onda** — e isto não pode faltar: a entrada
   de `acompanhamentosJaEnviados` **não existe** (o chat do 99Freelas está atrás
   de login, que é BLOCK nesta rodada), então a trava do M14 decide certo sobre
   um dado que hoje ninguém alimenta sozinho. Mecanismo existe, entrada não.
   Está escrito no topo de `lib/agency/celula/mensagens/acompanhamento.ts`.

Português do Brasil, conclusão primeiro, sem adjetivo de autoelogio. Quando um
número não foi medido, escreva "não medido" — nunca estime.
