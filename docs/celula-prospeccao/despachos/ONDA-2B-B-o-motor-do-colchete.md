# ONDA 2B — FICHA B · O MOTOR DO COLCHETE (e a trava que impede "[NOME]" chegar ao cliente)

## Objetivo em uma frase
Ensinar `lib/agency/celula/mensagens/biblioteca.ts` a preencher variáveis escritas
em **colchetes** (`[NOME]`), a **bloquear** qualquer colchete que sobre no texto
final, e a aplicar as **regras de ausência** e as **palavras proibidas globais** —
sem que nada disso afrouxe uma única trava que já existe.

## Por que este despacho existe
O texto oficial do CEO para os 22 modelos usa colchetes, não `{{chaves}}`. Ordem
literal dele: *"Os colchetes são as variáveis"*. Hoje `preencher()` só conhece
`{{chave}}` e só bloqueia `{{` remanescente. Se o texto entrar com colchetes e
nada mudar, **a mensagem sai para o cliente com um literal `[NOME]` dentro** — e
sai pelo caminho limpo, sem nenhum bloqueio. É um furo aberto, não uma melhoria.

## Arquivos que são SEUS neste despacho (e só estes)
1. `lib/agency/celula/mensagens/biblioteca.ts` — editar.
2. `lib/agency/celula/mensagens/tipos.ts` — editar (só para acrescentar campos).
3. `__tests__/celula/placeholder-de-colchete.test.ts` — **criar**.

## O que você NÃO pode fazer
- **NÃO toque em** `docs/plataformas/99freelas/mensagens.json` — outro despacho
  desta mesma onda está escrevendo nele AGORA.
- **NÃO toque em** `__tests__/celula/biblioteca-de-mensagens.test.ts`. Ele tem de
  continuar VERDE sem uma linha alterada — é assim que se prova que você não
  afrouxou nada. Se você achar que ele PRECISA mudar, **pare e relate**, não mude.
- **NÃO toque em**: `lib/agency/celula/ponte/`, `lib/agency/celula/excecoes/`,
  `lib/agency/celula/funil.ts`, `prisma/schema.prisma` — outra frente escreve neles agora.
- **NÃO remova o suporte a `{{chave}}`.** Os dois formatos convivem. Remover
  quebra `proxima-mensagem.ts` e a suíte inteira.
- **NÃO relaxe** nenhuma das guardas atuais: estado ≠ aprovado bloqueia; pendência
  declarada bloqueia; obrigatória ausente bloqueia; `{{` remanescente bloqueia;
  palavra proibida bloqueia; `validarTexto` (o Guardião) julga o texto final.

---

## O QUE CONSTRUIR — quatro coisas, nesta ordem

### 1. Placeholder de colchete
```ts
const PLACEHOLDER_COLCHETE = /\[([^\[\]]+)\]/g;
```
O nome da variável é o miolo **exatamente como está** — maiúsculas, acentos,
espaços e vírgulas. `[PRAZO, ESCOPO OU ORÇAMENTO]` → variável `PRAZO, ESCOPO OU
ORÇAMENTO`. Compare com `variaveisObrigatorias`/`variaveisOpcionais` após `trim()`
nos dois lados, e **sem** normalizar acento nem caixa: se o JSON escreveu
`ENTREGÁVEL`, a chave é `ENTREGÁVEL`.

**Uma passada só sobre o texto original**, pelo mesmo motivo que já está
comentado no arquivo para `{{}}`: texto de cliente é entrada hostil. Um valor de
variável que contenha literalmente `[OUTRA]` **não pode** ser reprocessado como
molde. Escreva um teste para isso.

### 2. A TRAVA: colchete que sobra BLOQUEIA
Depois da substituição, se o texto final ainda casar `/\[[^\[\]]*\]/`, devolva
`{ ok: false, motivo: ... }` citando o trecho — exatamente como a guarda de `{{`
faz hoje. **Esta é a trava principal deste despacho.** Ela é o que impede um
`[NOME]` literal de chegar ao cliente quando algo falha antes.

### 3. Regras de ausência (a ordem "sem nome, usar só Olá")
Campo novo, opcional, por modelo:
```ts
export interface RegraDeAusencia {
  variavel: string;   // "NOME"
  de: string;         // "Olá, [NOME]."   — recorte LITERAL do textoBase
  para: string;       // "Olá."
  fonte: string;      // de onde veio a regra
}
```
- Em `tipos.ts`: `regrasDeAusencia?: RegraDeAusencia[]`.
- Em `lerModelo`: validar a forma (os quatro campos, textos não vazios). Forma
  inválida → modelo inválido, com motivo. Ausente → `[]`, e isso é legítimo.
- Em `preencher`, **antes** da substituição: para cada regra cuja `variavel` está
  ausente/nula/vazia em `variaveis`, aplique `texto = texto.split(regra.de).join(regra.para)`
  no `textoBase`. Só isso — nada de heurística, nada de regex de saudação.
- **Guarda obrigatória:** se `regra.variavel` estiver em `variaveisObrigatorias`,
  a regra é **inválida** e bloqueia com motivo. Regra de ausência para variável
  obrigatória é uma contradição: ou a variável é obrigatória, ou ela pode faltar.
- **Guarda obrigatória:** se `regra.de` **não aparecer** no `textoBase`, bloqueie
  com motivo. Recorte que não existe no texto é regra morta que ninguém percebe.

### 4. Palavras proibidas GLOBAIS
A raiz do `mensagens.json` vai ganhar (outro despacho) o campo
`palavrasProibidasGlobais: string[]` — as três frases literais que o CEO proibiu.
- Em `carregarBiblioteca`: leia a lista da raiz (se ausente ou malformada, use `[]`
  e registre um `invalidos` de aviso? **NÃO** — use `[]` e siga; a raiz sem o campo
  não é modelo inválido) e **funda** essa lista com o `palavrasProibidas` de cada
  modelo, sem duplicar, ao montar `BibliotecaCarregada.modelos`.
- Assim `modeloParaEnvio` já devolve o modelo com a lista fundida e `preencher`
  não muda de assinatura. Uma fonte só, zero duplicação no JSON.
- A raiz malformada (`palavrasProibidasGlobais` que não é lista de texto) tem de
  ser **visível**, não silenciosa: acrescente um item em `invalidos` com
  `indice: -1` e motivo explícito, e siga com `[]`.

---

## O TESTE — `__tests__/celula/placeholder-de-colchete.test.ts`
Sem mock. Use a porta injetada (`bruto` opcional) e fixtures locais, como o
teste que já existe faz.

**Cada trava com as DUAS metades — barra o problema plantado E não inventa
problema no caso limpo.** Sem as duas, não conta.

1. Preenche `[NOME]` com valor → texto correto, sem colchete.
2. Variável de colchete com acento e espaço (`[NECESSIDADE ESPECÍFICA]`) é
   reconhecida e preenchida.
3. Variável com vírgula (`[PRAZO, ESCOPO OU ORÇAMENTO]`) é reconhecida.
4. **BLOQUEIA** quando sobra `[ALGO]` no texto final (obrigatória declarada mas
   não passada já é bloqueada antes; force o caso de colchete **não declarado**
   no `textoBase`).
5. **NÃO bloqueia** o caso limpo — texto sem nenhum colchete passa.
6. Valor hostil: variável cujo VALOR contém `[OUTRA]` literal **não** é
   reprocessado (segunda ordem) — e o resultado é bloqueado pela trava do item 4,
   não silenciosamente aceito. Prove qual dos dois aconteceu.
7. `{{chave}}` continua funcionando lado a lado com `[CHAVE]` no mesmo texto.
8. Regra de ausência: `NOME` ausente + regra `"Olá, [NOME]." → "Olá."` produz
   `"Olá. ..."` e **não** sobra colchete.
9. Regra de ausência: `NOME` PRESENTE → a regra NÃO é aplicada e o nome entra.
10. Regra de ausência cuja `de` não existe no `textoBase` → **BLOQUEIA**.
11. Regra de ausência para variável que está em `variaveisObrigatorias` → **BLOQUEIA**.
12. `palavrasProibidasGlobais` da raiz bloqueia o envio de um modelo que não tinha
    aquela palavra na lista própria — e o caso limpo passa.
13. `palavrasProibidasGlobais` malformada aparece em `invalidos`, e a biblioteca
    ainda carrega os modelos.
14. As guardas antigas continuam: estado `rascunho` bloqueia; pendência bloqueia;
    obrigatória ausente bloqueia. (Repita aqui, curto — é o cinto contra você
    mesmo ter afrouxado alguma.)

## Critério de aceite
- `__tests__/celula/biblioteca-de-mensagens.test.ts` continua verde **sem ter
  sido editado**.
- O teste novo cobre os 14 itens, cada trava com as duas metades.
- Nenhum `any`, nenhum `as` sobre objeto não validado — o arquivo é fail-closed
  campo a campo e assim continua.
- Comentário no topo de cada bloco novo dizendo **por que** ele existe (o furo do
  `[NOME]` literal chegando ao cliente), no estilo do arquivo.

## O que devolver
Bullets: o que ficou pronto · o que você bloqueou e como · qualquer coisa que
exija decisão. Se precisou mudar assinatura pública de função, **diga qual e por quê**.
