# FICHA H — LAUDO DE QUALIDADE DA ONDA 2 (somente leitura)

Você **não escreve código**. Você emite laudo. Se algo tiver de ser consertado,
diga O QUE e ONDE — o PM despacha o conserto para quem tem a mão.
**Não edite nenhum arquivo além do seu laudo.**

## O QUE FOI CONSTRUÍDO E VOCÊ VAI AUDITAR
`lib/agency/celula/mensagens/`: `tipos.ts`, `biblioteca.ts`, `anti-generico.ts`,
`entrada-hostil.ts`, `trava-de-conversa.ts`, `objecoes.ts`,
`perguntas-por-servico.ts`, `compromisso.ts`, `proxima-mensagem.ts`.
Dados: `docs/plataformas/99freelas/mensagens.json`, `frases-genericas.json`,
`objecoes.json`, `perguntas-por-servico.json`.
Testes: `__tests__/celula/*.test.ts` (os oito da Onda 2 — **ignore
`funil.test.ts`, `trilha-*.test.ts` e tudo em `excecoes/`, são de outra frente**).
Mutação já rodada: `docs/celula-prospeccao/mutacao-onda-2.md`.

Estado do portão hoje: `tsc` limpo no escopo desta onda, **261 testes verdes**.

## OS OITO CRITÉRIOS DE ACEITE DO CEO — confira UM A UM, com evidência
1. `tsc` limpo, testes verdes, mutação com cada guarda caindo pelo motivo certo.
2. Mensagem idêntica a uma já enviada é BLOQUEADA.
3. Variável genérica é BLOQUEADA.
4. Duas perguntas na mesma mensagem é BLOQUEADO.
5. Desconto sem autorização registrada é BLOQUEADO.
6. Promessa de data sem compromisso registrado é BLOQUEADA.
7. Instrução maliciosa dentro do texto do cliente NÃO move nenhuma regra.
8. Modelo em `rascunho`/`pausado`/`aposentado` não pode ser enviado.

Para cada um: **CUMPRE / NÃO CUMPRE / CUMPRE COM RESSALVA**, e o arquivo +
linha + nome do teste que sustenta. Critério cuja prova você não achou é
**NÃO CUMPRE** — "provavelmente está coberto" não é evidência.

## AS PERGUNTAS QUE SÓ VOCÊ VAI FAZER
- **Onde uma trava barra o CASO LIMPO?** Toda proibição precisa da metade gêmea.
  Trava que barra conversa legítima é desligada na primeira sexta-feira apertada
  — e aí não protege nada. Aponte cada guarda que não tem o teste do caso limpo.
- **Onde há verdade escrita em DOIS lugares?** Especialmente preço, texto de
  pergunta e frase proibida. Verdade em dois lugares já está errada num deles.
- **Onde um `motivo` de bloqueio não diz o que fazer a seguir?** Bloqueio mudo
  vira ticket. Toda proibição precisa da instrução gêmea.
- **Onde um caminho de falha devolve `null`, `false` ou lança sem motivo?**
- **Onde a régua está LARGA DEMAIS** e vai barrar cliente de verdade?
  (olhe com atenção `promessasDeData` e `verificarContradicao`.)
- **Onde `estado`/`etapa` de erro está escrito à mão em vez de vir de um tipo?**

## ⚠️ DOIS PONTOS QUE EU JÁ SEI E QUERO A SUA LEITURA INDEPENDENTE
1. **`lib/marketplaces/99freelas/conformidade.ts` foi ALTERADO nesta onda.** O
   `seguranca` **removeu** `instagram`, `insta` e `linkedin` da regra
   `dado_de_contato`, com o argumento de que "12 posts para Instagram" é o
   produto central desta casa e a palavra nua disparava falso positivo. Ele
   também acrescentou a flexão "pago/paga por fora". **Isto AFROUXA um guardião
   compartilhado que a esteira de propostas já usava.** As 152 asserções de
   `__tests__/marketplaces` continuam verdes. Sua pergunta: **existe alguma
   frase realista que hoje PASSA e antes era barrada, e que violaria os Termos?**
   Teste na cabeça: "meu instagram é @diolidigital", "me segue no insta",
   "meu perfil no linkedin". Diga se o afrouxamento é seguro ou se abriu porta.
2. **`docs/plataformas/99freelas/mensagens.json` tem os 22 modelos M01–M22 em
   `rascunho`, com `textoBase` VAZIO.** O texto literal do CEO nunca chegou ao
   repositório; escrever um texto nosso seria a casa inventando a fala que vai
   ao cliente. Sua pergunta: **o fail-closed está mesmo fechado?** Existe algum
   caminho — no motor, na biblioteca, em qualquer lugar — por onde um modelo em
   rascunho ou de `textoBase` vazio chegue a um texto enviável?

## COMO ENTREGAR
Escreva **um único arquivo**: `docs/celula-prospeccao/laudo-onda-2.md`.
Conclusão primeiro, em bullets. Separe: **o que está pronto · o que tem furo ·
o que exige decisão do CEO**. Furo entra como bullet próprio, com todas as
letras — nunca na entrelinha. Não escreva mais nenhum arquivo.
