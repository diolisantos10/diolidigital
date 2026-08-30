# FICHA J — `preencher` confia em quem chama (risco de desenho apontado no laudo)

O `qualidade` confirmou que o fail-closed dos 22 modelos vazios **está fechado
hoje**, por dois mecanismos. Mas registrou um risco de desenho, e ele é barato
de fechar agora e caro de descobrir depois:

> `preencher(modelo, variaveis)` (`biblioteca.ts`) **NÃO confere `estado`.**
> Hoje o único chamador é `proxima-mensagem.ts`, que só chega lá depois de
> `modeloParaEnvio` ter aprovado. Se uma onda futura chamar `preencher` direto
> com um modelo montado à mão, a barreira de estado **desaparece em silêncio**.

Barreira que depende de o próximo programador lembrar da ordem das chamadas não
é barreira. E "hoje só tem um chamador" é a frase que precede o segundo chamador.

## O QUE FAZER
- `preencher` confere `estado === "aprovado"` **por conta própria** e devolve
  `{ok:false, motivo}` quando não for — o mesmo motivo por extenso que
  `modeloParaEnvio` já dá. Conferir duas vezes é barato; confiar uma vez é caro.
- Confere também `pendencia`: modelo com pendência declarada não preenche.
- **Não remova a conferência de `modeloParaEnvio`.** Dois cintos, não um cinto
  mudado de lugar.
- Testes: `preencher` chamado direto com modelo em `rascunho`, `pausado`,
  `aposentado` e com `pendencia` ⇒ bloqueia nos quatro. **Metade gêmea:** modelo
  aprovado e sem pendência continua preenchendo normalmente, e **os 261 testes
  que já existem continuam passando** — se o seu conserto quebrar teste alheio,
  ele está errado.

## CONFERÊNCIA QUE VOCÊ FAZ ANTES DE ENTREGAR
Com a nova conferência trocada por `if (false)`, os quatro testes novos têm de
ficar vermelhos. Se algum ficaria verde, ele não está testando o que você acha.

## ARQUIVOS QUE SÃO SEUS (e só eles)
- `lib/agency/celula/mensagens/biblioteca.ts`
- `__tests__/celula/biblioteca-de-mensagens.test.ts`
Você não roda npm/npx/node/git — o PM roda o portão e a mutação.
