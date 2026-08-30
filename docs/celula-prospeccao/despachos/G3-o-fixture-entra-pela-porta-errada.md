# FICHA G3 — o Guardião do motor É alcançável; o seu fixture entra pela porta errada

Boa notícia primeiro: **o conteúdo proibido FOI bloqueado nos seus quatro casos
novos.** A casa não vazou telefone, link nem referência à comissão. O que
falhou foi a asserção da **etapa**:

```
× 1. bloqueia telefone + 'zap' no texto final
  AssertionError: expected 'preencher_modelo' to be 'guardiao'
```

Você injetou a violação **pelo modelo** (`bibliotecaBruta`). Só que
`biblioteca.preencher` já roda `validarTexto` por dentro — então a violação
morre na etapa 6, e a etapa 10 nunca chega a ver o texto. Os quatro testes
provam que a casa é segura; **não provam a linha que a mutação apontou.**

## AS DUAS PORTAS QUE DE VERDADE CHEGAM NA ETAPA 10 — e é por elas que se entra
Lendo `proxima-mensagem.ts`, `respostaBase` tem duas origens:
```
318:  respostaBase = objecao.respostaAprovada;   ← NUNCA passou por validarTexto
369:  respostaBase = preenchido.texto;           ← já validado por preencher()
```
E existe uma terceira, que ninguém olhou:
```
404:  const pergunta = ... formatarPergunta(candidataAPergunta.comoSePergunta)
```
**A PERGUNTA também nunca passa por `validarTexto` antes de ser concatenada.**

Ou seja, o Guardião da etapa 10 é a **única** defesa para dois dos três pedaços
do texto final. Isso não é linha morta: é a última linha, e ela é reachable.

## O QUE FAZER — troque a porta de entrada dos fixtures
1. **Pela resposta de objeção** (a porta principal): injete um catálogo de
   objeções de teste cuja `respostaAprovada` contenha o telefone e o "zap".
   Se o motor não aceitar catálogo injetado, use um `textoDoCliente` que
   classifique numa objeção real e componha o caso pela porta que existir —
   **e se não existir porta nenhuma, diga isso com todas as letras no relatório
   em vez de forçar**: seria um achado (catálogo não injetável = não testável).
2. **Pela pergunta:** um `obterProximaPergunta` injetado que devolva um
   `comoSePergunta` violando (ex.: pedindo e-mail). Esse caso é especialmente
   importante — hoje NADA valida a pergunta antes da concatenação.
3. **O CRITÉRIO 7 do CEO** (cliente hostil + resposta que obedeceu) deve entrar
   por uma dessas duas portas, não pelo modelo. É o teste mais importante da
   onda e ele precisa cair na etapa `guardiao`.
4. **Mantenha os quatro testes atuais**, só corrija a asserção de etapa para a
   que realmente acontece (`preencher_modelo`) e **renomeie-os** para dizer o
   que provam: que a violação vinda do MODELO morre antes. Dois cintos são
   melhores que um; o que não pode é chamar o primeiro de segundo.
5. **A metade gêmea:** objeção com resposta limpa e pergunta limpa ⇒ `enviar`.

## A CONFERÊNCIA QUE VOCÊ MESMO FAZ ANTES DE ENTREGAR
Com `if (!conformidade.ok)` trocado por `if (false)`, os testes novos das portas
1 e 2 **têm de ficar vermelhos**. Se ficariam verdes, você entrou pela porta
errada de novo.

## ARQUIVOS QUE SÃO SEUS (e só eles)
- `__tests__/celula/proxima-mensagem.test.ts`
- `lib/agency/celula/mensagens/proxima-mensagem.ts` — **só se descobrir que a
  pergunta precisa passar pelo Guardião antes da concatenação e isso hoje não
  acontece.** Se for o caso, conserte e diga.
Você não roda npm/npx/node/git — o PM roda o portão e a mutação de novo.
