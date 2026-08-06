# O padrão de arte da casa — comparativo de 06/08/2026

> **Decisão do CEO, 06/08/2026:** *"da próxima vez, para todos os clientes, eu
> quero algo no mínimo nesse nível."* O nível é o das 10 peças que ele trouxe,
> feitas fora da agência. Este documento registra a comparação e o que muda.

Ele aprovou os 6 carrosséis no portal — e disse com todas as letras **por que**:
*"não aprovei porque está bom, mas porque a gente está sem tempo."* Aprovação por
prazo não é aprovação por qualidade, e registrar a diferença é o que impede a
casa de comemorar o número errado.

## O placar, em uma frase

**O produto aparece nas peças de referência. Não aparece nas nossas.**

Em 7 das 10 peças trazidas existe uma tela do Foocci: o painel de clientes, os
toggles de automação, a mensagem de WhatsApp com cupom, o status do pedido. Nas
nossas 6, o Foocci só existe como palavra escrita — foto de restaurante, frase,
logo no canto. **Qualquer software de restaurante poderia assinar as nossas peças
sem trocar uma vírgula.** Esse é o defeito, e ele não é de estilo.

| Critério | Referência | Nossas |
|---|---|---|
| Produto na peça | 7 de 10 | **0 de 6** |
| Estrutura da informação | cards com ícone, listas, mini-painel com número | manchete + linha de apoio |
| Marca no mundo físico | avental, sacola e caixa com o monograma | wordmark no canto |
| Assinatura fixa de rodapé | sim, constante | não existe |
| Prova visual (número na cena) | quadro-negro com pedidos do dia | nenhuma |

## Onde a agência é melhor — e não é pouco

- **A copy é mais forte e mais específica.** *"Entre 15,2% e 26,5% de cada
  pedido"* é verificável. A da referência é abstrata — *"mais recorrência, menos
  oportunidade perdida"* cabe em qualquer produto de qualquer setor.
- **Contenção editorial.** Várias peças de referência estão densas: quatro cards,
  um mockup, um rodapé e uma manchete competindo pelo mesmo olho.
- **Tipografia e legibilidade** estão no mesmo patamar.

## O risco que a referência carrega, e que NÃO se copia

As telas de app são **mockups desenhados, não capturas do produto**. Números como
*"1.248"* e *"+12% vs ontem"* são inventados. Publicado no perfil de um cliente
pagante, isso é promessa visual do que o produto entrega — e se a tela real for
diferente, quem baixa sente.

> **Copia-se a linguagem, não o costume de inventar a tela.** Mockup de produto
> nesta casa sai de captura real ou sai rotulado como ilustração.

## O que muda — três coisas que hoje não existem

1. **A esteira não coleta o produto do cliente.** Não há etapa que peça captura de
   tela, embalagem, uniforme, app. **Sem material, o design nunca põe o produto na
   peça — não é falta de talento, é falta de insumo.** Vira etapa obrigatória de
   onboarding, e material ausente vira pergunta ao cliente, nunca invenção.
2. **Não existe biblioteca de mockup.** Moldura de celular, card de painel, balão
   de conversa, quadro de números. É o que separa "foto com frase" de "peça de
   produto".
3. **A assinatura de marca não é token.** Rodapé fixo, monograma, lockup. Hoje
   cada peça decide sozinha, e decidir sozinha 36 vezes foi o que produziu as 36
   telas iguais.

## A trava, porque padrão sem mecanismo é torcida

Duas checagens novas entram no projeto do P0
(`docs/projetos/p0-portoes/00-projeto.md`), as duas de classe (c):

- **`design_dispersao_minima`** — já prevista, nascida da devolutiva de 06/08.
- **`design_produto_presente`** — para cliente que tem produto digital, peça sem
  o produto visível não passa. Fail-closed: cliente sem material de produto
  cadastrado **bloqueia a peça e abre pedido de material**, em vez de entregar
  foto genérica com frase.

Ambas nascem em SOMBRA, como manda a escada: registram e não barram, até haver
evidência — inclusive a taxa de falso positivo, que é a metade que todo detector
esquece.
