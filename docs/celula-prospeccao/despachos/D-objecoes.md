# FICHA D — OBJEÇÕES: CLASSIFICAR, RESPONDER E **NÃO CEDER SOZINHO**

Leia antes: `docs/celula-prospeccao/despachos/COMUM.md`. Ele vale inteiro.

## OBJETIVO EM UMA FRASE
Classificar a objeção do cliente, entregar a resposta APROVADA para ela, e
travar por mecanismo que a IA conceda qualquer coisa comercial sem autorização
registrada.

## ARQUIVOS QUE SÃO SEUS (e só eles)
- `lib/agency/celula/mensagens/objecoes.ts` (novo)
- `docs/plataformas/99freelas/objecoes.json` (novo)
- `__tests__/celula/objecoes.test.ts` (novo)

## 1. AS ONZE OBJEÇÕES (a lista é do CEO e é o MÍNIMO)
`preco · prazo · confianca · portfolio · escopo · forma_de_pagamento ·
pedido_de_contato_externo · pedido_de_teste · comparacao_com_concorrente ·
silencio · indecisao`

Cada uma, no JSON (`objecoes.json`, formato no modelo de `policy.json`):
`id · comoOClienteFala[] (os sinais de texto) · respostaAprovada ·
dadosNecessarios[] · limiteDeNegociacao · quandoEscalarAoGerente`.

Duas delas têm resposta OBRIGATÓRIA e não negociável, porque são política de
plataforma e não gosto comercial:
- **`pedido_de_contato_externo`** — o cliente pedindo WhatsApp/e-mail/link.
  A resposta aprovada **nunca** entrega contato: os Termos proíbem antes da
  garantia de pagamento. Fonte: `docs/plataformas/99freelas/policy.json`,
  `proibicoes_de_conteudo.dado_de_contato`.
- **`pedido_de_teste`** — permuta e teste grátis são projetos não permitidos
  pela própria plataforma. Fonte: idem, `permuta_ou_teste_gratis`.
Escreva as duas respostas de forma que elas passem por `validarTexto` do
Guardião. Se a sua própria resposta aprovada for barrada pelo Guardião, ela
está errada — teste isso.

## 2. ⛔ A TRAVA DURA — ORDEM LITERAL DO CEO
*"A IA não concede desconto, não amplia escopo, não altera prazo, não oferece
garantia e não aceita condição comercial sem autorização registrada."*
**Isso é mecanismo com teste de mutação, não frase no prompt.**

```ts
export type Concessao = "desconto" | "ampliacao_de_escopo" | "alteracao_de_prazo"
                      | "garantia" | "condicao_comercial";

export interface AutorizacaoRegistrada {
  concessao: Concessao;
  autorizadaPor: string;   // quem autorizou — nunca "sistema", nunca vazio
  registradaEm: string;    // ISO
  referencia: string;      // o registro que sustenta (id/link interno)
  /** Só para desconto: o valor teto autorizado, em reais. */
  valorMaximoEmReais?: number | null;
}

export type VereditoDeConcessao =
  | { ok: true; autorizacao: AutorizacaoRegistrada }
  | { ok: false; motivo: string };

export function podeConceder(p: {
  concessao: Concessao;
  item?: string;
  valorProposto?: number;
  autorizacoes: readonly AutorizacaoRegistrada[];
}): VereditoDeConcessao;
```
Regras, cada uma com teste:
- Lista de autorizações **vazia ⇒ BLOQUEIO**. Este é o caminho normal e é o
  padrão. Fail closed.
- Autorização de OUTRA concessão não vale para esta ⇒ BLOQUEIO.
- Autorização com `autorizadaPor` vazio, `"sistema"`, `"ia"`, `"agente"` ou
  `"automatico"` ⇒ BLOQUEIO. Autorização que a máquina dá a si mesma não é
  autorização; é a máquina se aprovando.
- Autorização sem `referencia` ⇒ BLOQUEIO.
- **Desconto:** mesmo COM autorização, o valor tem de passar por `podeFechar`
  de `lib/agency/comercial/negociacao.ts`. **O piso é do motor de preços da
  casa, nunca desta ficha e nunca de constante nova.** Autorização não fura
  piso — ela só permite descer ATÉ ele.
- **Nenhum número de preço escrito neste arquivo nem no JSON.** Se o motor não
  souber responder, o caminho é EXCEÇÃO com motivo, jamais um número
  improvisado. Teste isso: motor sem resposta ⇒ `{ok:false}`, nunca um chute.

## 3. A CLASSIFICAÇÃO
```ts
export function classificarObjecao(texto: string): { id: string; confianca: "alta" | "baixa"; trecho: string } | null;
```
Determinística, por sinais do JSON — **sem IA**. É trava de dinheiro, e trava
que depende do modelo acertar não é trava. Não reconheceu ⇒ devolve `null`, e
`null` significa **escalar**, não improvisar. `silencio` não vem de texto: vem
de tempo sem resposta, por parâmetro.

## CRITÉRIO DE ACEITE
1. As 11 objeções existem no JSON com os 6 campos, e o `.ts` lê de lá.
2. Desconto sem autorização registrada ⇒ BLOQUEADO.
3. Autorização auto-concedida pela máquina ⇒ BLOQUEADA.
4. Desconto autorizado mas abaixo do piso do motor ⇒ BLOQUEADO.
5. Pedido de contato externo e pedido de teste têm resposta aprovada que passa
   pelo Guardião — teste rodando `validarTexto` nas respostas do JSON.
6. Objeção não reconhecida ⇒ escala, não improvisa.
7. As metades gêmeas: concessão com autorização válida, dentro do piso, **passa**.
