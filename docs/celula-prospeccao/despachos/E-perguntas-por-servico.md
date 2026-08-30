# FICHA E — PERGUNTAS POR TIPO DE SERVIÇO, PROGRESSIVAS

Leia antes: `docs/celula-prospeccao/despachos/COMUM.md`. Ele vale inteiro.

## OBJETIVO EM UMA FRASE
Saber, para cada tipo de serviço do catálogo REAL da Dioli, o que precisa ser
perguntado — e entregar **uma decisão por vez**, nunca um questionário.

## ARQUIVOS QUE SÃO SEUS (e só eles)
- `lib/agency/celula/mensagens/perguntas-por-servico.ts` (novo)
- `docs/plataformas/99freelas/perguntas-por-servico.json` (novo)
- `__tests__/celula/perguntas-por-servico.test.ts` (novo)

## 1. LEIA O CATÁLOGO ANTES DE ESCREVER UMA LINHA
`lib/agency/catalogo-v2/catalogo.ts`, `capacidades.ts`, `specs.ts`,
`regras-da-ficha.ts` e `lib/agency/produtos/` (em especial
`briefing-minimo.ts` e `story-instagram-v1.ts`).
**Os tipos de serviço e os nomes que você usar têm de ser os do catálogo real.**
Inventar um serviço que a Dioli não vende é a casa prometendo o que não entrega.
Se o catálogo não cobrir um dos quatro pedidos do CEO (social media, site,
branding, vídeo), **escreva `"preciso confirmar com o CEO"` no campo** e diga
isso no relatório. Não preencha por inferência.

## 2. O DADO
`perguntas-por-servico.json` (formato no modelo de `policy.json`). Para cada
serviço: `servico · origemNoCatalogo (o caminho do arquivo de onde veio) ·
perguntas: [{ id, oQueColhe, comoSePergunta, obrigatoria, ordem,
dependeDe (id de outra pergunta ou null), porQuePrecisamosDisto }]`.

`origemNoCatalogo` não é decoração: é o que permite conferir depois se a
pergunta ainda corresponde ao que a casa vende.

Reaproveite os ids de `lib/agency/comercial/pergunta-repetida.ts`
(`O_QUE_A_PERGUNTA_DE_IA_COLHE`, `COMO_SE_PERGUNTA_AO_CLIENTE`) sempre que a
pergunta já existir lá. **Pergunta com dois ids em dois arquivos é a mesma
pergunta feita duas vezes** — que é exatamente o defeito que a trava de conversa
está lá para impedir.

## 3. ⛔ A TRAVA: UMA DECISÃO POR VEZ
Ordem do CEO: *"Não criar questionário enorme na primeira mensagem — perguntas
progressivas, uma decisão por vez."*

```ts
export function proximaPergunta(p: {
  servico: string;
  jaRespondidas: Readonly<Record<string, string>>;
  jaPerguntadas: readonly string[];
}): { id: string; comoSePergunta: string; porQue: string } | null;
```
- Devolve **UMA** ou `null` (nada mais a perguntar). **Nunca uma lista.**
  A assinatura é a trava: quem não pode devolver duas não devolve duas.
- Respeita `ordem` e `dependeDe` — não pergunta o dependente antes do requisito.
- Não repete o que já está em `jaRespondidas` nem em `jaPerguntadas`.
- Escreva também `perguntasEmAberto(...)` para uso INTERNO da casa (tela,
  diagnóstico), e deixe escrito no comentário que ela **não** alimenta mensagem
  ao cliente. Se ela alimentasse, a trava acima seria decorativa.

## CRITÉRIO DE ACEITE
1. Os quatro serviços do CEO estão cobertos, cada um com `origemNoCatalogo`
   apontando para arquivo que EXISTE — ou com `"preciso confirmar com o CEO"`.
2. `proximaPergunta` devolve uma ou nenhuma. Teste que prova que não há caminho
   por onde saiam duas.
3. Pergunta com dependência não sai antes do requisito.
4. Pergunta já respondida não volta.
5. Todas as respondidas ⇒ `null`, e `null` significa "pode avançar".
6. Nenhuma pergunta do JSON é barrada por `validarTexto` do Guardião — teste
   rodando o Guardião em cada `comoSePergunta`.
