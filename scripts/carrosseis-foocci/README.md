# Os 6 sistemas visuais dos carrosséis da Foocci

> Versionado em 06/08/2026 porque a V3 **não** foi. A V3 ficou fora do
> repositório, e a rodada seguinte teve de reconstruir a copy lendo os pixels
> dos PNGs em produção, letra por letra. **Arte entregue sem fonte versionada é
> arte que a próxima rodada refaz do zero.**

## O que aconteceu aqui

O CEO devolveu as 36 telas duas vezes com a mesma frase: *"todos os criativos
muito parecidos. TODOS!"*. Ele estava certo, e a causa era de código:
`lib/agency/design/molde.ts` tinha **uma composição só** — foto, degradê preto,
bloco de texto embaixo. Trocar o texto 36 vezes não produz seis peças; produz um
carimbo usado 36 vezes.

**A medida que prova, porque variedade não pode ser opinião contra opinião:** o
desvio de luminância das 36 telas era **2,2**. As telas do feed real dele vão de
2 a 252. Depois: **113,3**, com 15 telas claras onde antes havia zero.

## Os arquivos

| Arquivo | O que é |
|---|---|
| `copy.mjs` | A copy **aprovada pelo CEO**, travada. Ninguém edita. |
| `sistemas.mjs` | Os 6 sistemas visuais — dossiê, recorte, faixa, aparelho, editorial, monograma. |
| `render.mjs` | O renderizador **e o portão de letra**. |

## O portão de letra

`render.mjs` compara o texto no DOM, caractere a caractere, com `copy.mjs`, e
**reprova a peça** se divergir. Existe por um motivo específico: o CEO escreveu
*"O conteúdo está 100% APROVADO"*. Numa rodada em que só a arte muda, uma vírgula
alterada é regressão silenciosa — e a ressalva legal (*"Simulação sobre a faixa
de 15,2% a 26,5%…"*) é a linha em que um caractere a menos vira problema
jurídico do cliente, não detalhe estético.

## Limitações declaradas

- O wordmark é **texto em Outfit**, não o arquivo oficial do logo da Foocci — o
  asset não foi encontrado. Era assim na V3 também; continua sendo aproximação.
- `SocialPost.scenesJson` está vazio: o banco guarda a legenda, não o texto das
  telas. Enquanto isso não mudar, a próxima rodada depende **deste** arquivo.
