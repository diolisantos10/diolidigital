# O cliente pediu a arte mais clara e a casa reescreveu um texto

> Achado do cliente oculto em PRODUÇÃO, 26/08/2026. **Medido e declarado; não
> consertado — o conserto é de desenho e tem dono.**

## O que foi feito, e o que aconteceu

Projeto `cmt9f1f7w001y0xo781zi2jt4` (CANTINA DO PORTO TESTE). Duas peças de feed
prontas e visíveis no portal do cliente:

| peça | arquivo | bytes | sha256 |
|---|---|---|---|
| `…q2bv2p` | `/api/media/med_fdf9b2e0_mt9h1g8i` | 130.953 | `fdf9b2e098d8c6f6c67996c0250f78d74b71b1926427daf9f9848f59aeef2b38` |
| `…lz96ih` | `/api/media/med_96e37c4f_mt9h2a2j` | 108.934 | `96e37c4fe34881a3c12b59cedcbb12d8a9b7d5bbce73eee562cf822dec337c6d` |

O cliente pediu ajuste pelo portal (`POST /api/portal/approvals`, HTTP 200,
`status: revision_requested`):

> "As duas artes estao escuras demais e na primeira o rosto do rapaz fica
> cortado. Quero as duas mais claras, com o prato bem visivel."

Seis minutos e três batidas do relógio depois:

- **os dois arquivos são byte a byte os mesmos** (sha256 reconferido: idêntico);
- e apareceu no banco: `Pauta do Mês — Cantina do Porto Teste`, **v2**, com
  `lastFeedback: "Refeita a pedido do cliente: As duas artes estao escuras
  dem…"`.

**O cliente pediu ARTE mais clara e a casa reescreveu um TEXTO, citando a
reclamação sobre a arte.** É pior do que não fazer nada: o registro diz
"refeita a pedido do cliente".

## A causa, com caminho e linha

`app/api/portal/approvals/route.ts:189`

```ts
const postsDoCard = lerListaDeIds(approval.sourcePostIdsJson);
```

Todo o caminho que refaz ARTE vive dentro de `if (postsDoCard.length > 0 …)` —
linhas 335, 403-404, 495, 523. O card que este cliente recebeu tem
`sourcePostIds: null`, então esse ramo inteiro é pulado, em silêncio.

**E o motivo é estrutural, não um esquecimento:** o card nasce em
`esteira/marcos.ts → apresentar()`, e as peças (`SocialPost`) só são criadas
DEPOIS, por `esteira/publicacao.ts → agendarPostsDaEntrega()`. Na hora em que o
card é criado, as peças ainda não existem para serem ligadas a ele.

Quem já faz certo são os caminhos de PRODUTO —
`produtos/story-instagram-v1.ts:609` e `esteira/producao-de-pedido.ts:740` —
que criam o card depois das peças e preenchem `sourcePostIds`. O comentário de
`story-instagram-v1.ts` já dizia o que está em jogo: *"`sourcePostIds` é o que
faz a diferença entre um card de TEXTO e um card com a peça dentro (…) é o MESMO
campo que `/api/portal/approvals` lê para propagar a decisão do cliente às
peças."*

## Por que não foi consertado aqui

O conserto é ligar o card às peças **depois** do agendamento — mexer na ordem
entre `apresentar()` e `agendarPostsDaEntrega()`, ou reabrir o card para
receber os ids. As duas opções mudam o momento em que o cliente é chamado a
decidir, em todos os projetos da esteira padrão. É decisão de desenho da
esteira, com dono, e não conserto de auditoria.

**Dono: quem mantém `esteira/marcos.ts` e `esteira/publicacao.ts`.**

## O meio-termo que NÃO resolve

Não adianta só melhorar a frase do `lastFeedback`. O dano é o arquivo que não
mudou, não a frase. Enquanto o card não carregar as peças, o cliente da esteira
padrão **não tem como pedir ajuste de arte** — ele só consegue comentar.
