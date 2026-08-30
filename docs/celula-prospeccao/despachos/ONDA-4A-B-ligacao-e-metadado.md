# ONDA 4A · FICHA B — A LIGAÇÃO DE VARIÁVEIS E O METADADO DOS 22 MODELOS

**Agente:** `esteira` · **Despachado pelo:** PM · **Arbitragens do:** Diretor Geral, 30/08/2026

## Objetivo em uma frase
`[NOME]` significa **pessoa** em M01/M14 e **arquivo** em M06/M20 — a mesma
marcação, dois significados. Hoje nada declara qual é qual, e nada impede o
motor de escrever o nome do cliente onde deveria ir o nome do arquivo. Além
disso, 22 modelos carregam `"preciso confirmar com o CEO"` em campos que o CEO
**já respondeu na ordem dele**. Esta ficha resolve as duas coisas — **sem tocar
uma letra do texto do CEO**.

## A ARBITRAGEM DO DIRETOR, LITERAL — leia antes de escrever
> *"O `textoBase` fica literal, intocado. O que muda é a **ligação da
> variável**, que é declarada POR MODELO: em M01/M14 `[NOME]` liga em
> `nomeDoCliente`; em M06/M20 liga em `nomeDoArquivo`. Isso não altera a fala
> do CEO — declara o que ela significa em cada modelo. **Ligação ausente ou
> ambígua BLOQUEIA.**"*

E:
> *"Preencha o derivável. O que restar genuinamente indefinido **continua
> pendente e continua bloqueando** — não invente para destravar."*

## ARQUIVOS QUE SÃO SEUS (ninguém mais escreve neles nesta onda)
- EDITA `docs/plataformas/99freelas/mensagens.json`
- EDITA `lib/agency/celula/mensagens/tipos.ts`
- EDITA `lib/agency/celula/mensagens/biblioteca.ts`
- NOVO `__tests__/celula/ligacao-de-variaveis.test.ts`
- NOVO `__tests__/celula/metadado-dos-22.test.ts`
- EDITA `__tests__/celula/biblioteca-de-mensagens.test.ts` e
  `__tests__/celula/os-22-textos-do-ceo.test.ts` **só se a trava nova os
  quebrar** — e nunca relaxando a trava para o teste passar.

## PROIBIDO TOCAR
`lib/agency/celula/ponte/`, `lib/agency/celula/excecoes/`,
`lib/agency/celula/funil.ts` (**importe à vontade; NÃO edite**),
`prisma/schema.prisma`, `lib/agency/celula/mensagens/proxima-mensagem.ts`,
`lib/agency/celula/mensagens/acompanhamento.ts`,
`docs/plataformas/99freelas/regras-editoriais.json` (é de outra ficha desta onda).

🔴 **Nunca altere um `textoBase`.** Nem gramática, nem acento, nem espaço. É a
fala do CEO, transcrita caractere a caractere de propósito.

---

## 1. A LIGAÇÃO DE VARIÁVEIS — o mecanismo

### 1.1 O campo novo, em `tipos.ts`
```ts
/** Para cada variável do modelo, em QUE campo do estado ela se liga. */
ligacaoDeVariaveis: Record<string, AlvoDeLigacao>;
```
`AlvoDeLigacao` é **conjunto FECHADO**, com leitura fail-closed na forma exata
de `estadoDeclarado()` em `lib/agency/celula/funil.ts` (`alvoDeLigacaoDeclarado`).
Alvo fora do conjunto — typo, valor de migração, `null` — **não vira default,
vira bloqueio nomeado**.

O conjunto sai das variáveis que os 22 modelos realmente usam. Comece por
`nomeDoCliente` e `nomeDoArquivo` (o caso que o Diretor arbitrou) e derive o
resto do dado: `entregavel`, `prazo`, `valor`, `escopoResumido`,
`informacaoPendente`, `objetivo`, `materiais`, etc. **Um alvo por conceito, não
um alvo por modelo** — se dois modelos pedem a mesma coisa, é o mesmo alvo.

Onde o alvo for genuinamente desconhecido, use o valor declarado
`"preciso_confirmar_com_o_ceo"`, que **é membro do conjunto e BLOQUEIA o envio**.
Isso é o oposto de inventar: é declarar a ausência de forma que ela pare a
mensagem. (`CLAUDE.md`: *ausência de informação não é informação*.)

### 1.2 A trava, em `biblioteca.ts`
Três checagens, cada uma com motivo em português, no padrão que o arquivo já usa
(`LeituraDoModelo`, nunca `false` mudo):
1. **Cobertura:** toda variável citada em `variaveisObrigatorias` ∪
   `variaveisOpcionais` ∪ **os colchetes que aparecem no `textoBase`** tem
   ligação declarada. Falta uma → recusa, nomeando qual.
2. **Alvo válido:** todo alvo é membro do conjunto fechado. Fora → recusa.
3. **Envio bloqueado:** `modeloParaEnvio` recusa quando qualquer alvo é
   `"preciso_confirmar_com_o_ceo"`. Recusa com o nome da variável.

⚠️ Aplique a checagem também a quem monta um `ModeloDeMensagem` **na mão** (os
testes fazem isso) — é o mesmo "segundo cinto" que o arquivo já tem para
`estado`/`pendencia`. Trava que só roda no caminho do JSON não é trava.

### 1.3 O dado, em `mensagens.json`
`ligacaoDeVariaveis` em cada um dos 22. As quatro ligações que o Diretor
arbitrou são ordem, não sugestão:
| Modelo | `[NOME]` liga em |
|---|---|
| M01 (ABORDAGEM INICIAL) | `nomeDoCliente` |
| M14 (ACOMPANHAMENTO SEM RESPOSTA) | `nomeDoCliente` |
| M06 (ARQUIVO RECUSADO) | `nomeDoArquivo` |
| M20 (ENTREGA FINAL) | `nomeDoArquivo` |

**Confira cada uma abrindo o `textoBase`** antes de gravar. Se o texto de um
desses quatro contradisser a arbitragem, **não "corrija" nada**: grave o que o
Diretor mandou e **escreva a contradição no relatório**. M17 também tem
`"NOME DO ARQUIVO"` — nome diferente, mesmo conceito: mesmo alvo.

---

## 2. O METADADO DOS 22 — preencher o derivável, marcar o resto

Hoje **todos os 22** têm `etapaDoFunil`, `condicaoDeSaida` e `proximaAcao` em
`"preciso confirmar com o CEO"`, e boa parte disso o CEO **já deu**.

### 2.1 `etapaDoFunil` vira ligação ao funil real, não texto livre
O funil de 22 estados já existe em `lib/agency/celula/funil.ts` (`ESTADOS`).
Hoje `etapaDoFunil` é `string` livre — **passe a validá-la com
`estadoDeclarado()`**: valor que não seja EXATAMENTE um dos 22 estados
bloqueia o modelo. Ligar cada modelo ao estado correspondente é o pedido
literal do Diretor.

**Importe `funil.ts`. Não edite `funil.ts`.**

Ponto de partida (condições de entrada que o CEO já escreveu — confira cada
uma no JSON antes de mapear, e **justifique cada escolha no relatório**):
| Modelo | Condição de entrada (do CEO) |
|---|---|
| M01 | oportunidade qualificada, sem contato anterior |
| M02 | respondeu, falta informação decisiva |
| M03 | informações mínimas coletadas |
| M05 | arquivo baixado, verificado e associado ao projeto correto |
| M07 | briefing mínimo completo e preço validado |
| M16 | marco real concluído |
| M17 | arquivo aprovado pela Qualidade e anexado ao cliente certo |

Os outros 15 têm `condicaoDeEntrada = "preciso confirmar com o CEO"`. **Alguns
ainda assim têm etapa derivável do NOME e da finalidade do modelo** — M08
(orçamento abaixo) e M09 (prazo inviável) são conversa de negociação; M15
(contratação confirmada) é o instante da contratação; M22 (cliente não
selecionado) é o fim da linha. **Derive só o que o dado sustenta**, e diga
**de onde** derivou. O que não sustentar fica `"preciso confirmar com o CEO"`
e **continua bloqueando**.

### 2.2 `condicaoDeSaida` e `proximaAcao`
Mesma régua: preencha o que a ordem do CEO sustenta, marque o resto. Aqui a
tentação de inventar é maior — **resista**. É melhor devolver 12 pendências
honestas que 22 campos preenchidos por inferência: sem revisão humana, um campo
inventado vira entregável.

### 2.3 Atualize a `pendencia` de cada modelo
A `pendencia` hoje lista campos que você vai preencher. Reescreva-a para conter
**exatamente** o que ainda falta — nem mais, nem menos. Pendência que cita
campo já resolvido ensina a casa a ignorar pendência.

### 2.4 Os dois blocos do topo do JSON viram PONTEIRO
`_proibicoes_do_ceo_sem_mecanismo` e `_regras_editoriais_do_ceo` hoje guardam a
lista das 8 categorias e um `"preciso confirmar com o CEO"`. **A fonte dessas
duas coisas passa a ser `docs/plataformas/99freelas/regras-editoriais.json`**,
criado por outra ficha desta mesma onda (agente `cerebro`).

Substitua os dois blocos por um ponteiro de uma linha para aquele arquivo.
**Regra não se copia, se aponta** — duas listas das mesmas 8 categorias em dois
arquivos divergem no primeiro mês. **Não crie o arquivo apontado; não é seu.**

---

## 3. CRITÉRIO DE ACEITE (o PM vai conferir um a um)
1. Nenhum `textoBase` alterado — nem um byte. (Prove: `os-22-textos-do-ceo.test.ts` verde.)
2. `ligacaoDeVariaveis` nos 22, com alvo de conjunto fechado.
3. Variável sem ligação → **bloqueia**, com motivo nomeando a variável.
4. Alvo fora do conjunto (typo) → **bloqueia**, não vira default.
5. Alvo `"preciso_confirmar_com_o_ceo"` → `modeloParaEnvio` **recusa**.
6. As 4 ligações de `[NOME]` conforme a arbitragem do Diretor.
7. `etapaDoFunil` validada contra os 22 estados de `funil.ts`; estado inválido bloqueia.
8. Metadado derivável preenchido **com justificativa**; o resto pendente e bloqueando.
9. `funil.ts`, `excecoes/`, `ponte/` intocados.

## FORMATO DA ENTREGA (bullets curtos — o destino é o CEO)
- o que ficou pronto · o que quebrou · o que exige decisão do Diretor
- **a lista CURTA do que sobrou genuinamente indefinido** — modelo, campo, e
  por que não dá para derivar. É esta lista que o Diretor pediu de volta.
- **o mapa modelo → estado do funil**, com a justificativa de cada um
- **qualquer contradição** entre a arbitragem do Diretor e o `textoBase` real
- **os alvos de mutação** que você recomenda: arquivo, linha, afrouxamento e o
  teste que DEVE ficar vermelho. (O PM roda a mutação; você entrega o catálogo.)

## Não faça
- Não rode `npm`, `npx`, `node` nem `git` — o portão e o commit são do PM.
- Não escreva relatório em `.md` novo: devolva no texto da resposta.
- Não toque em arquivo fora da sua lista.
