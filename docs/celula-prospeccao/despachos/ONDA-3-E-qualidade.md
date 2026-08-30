# DESPACHO E — auditoria de conformidade da Onda 3 (agente: `qualidade`)

**Você NÃO ESCREVE. Só lê e lauda.** Quem duvida do trabalho não é quem o
conserta. Não edite nenhum arquivo; devolva o laudo na resposta.

**Leia:** `docs/celula-prospeccao/despachos/ONDA-3-COMUM.md` e as três fichas
`ONDA-3-A-arbitragens-do-funil.md`, `ONDA-3-B-ponte-de-arquivos.md`,
`ONDA-3-C-fila-de-excecoes.md`.

## A pergunta que você responde
**O que foi entregue é o que foi pedido?** Não "está bonito" — **bate com a
ficha, item por item?**

## O QUE AUDITAR

### 1. Ficha A × `lib/agency/celula/funil.ts` + `__tests__/celula/funil.test.ts`
- As 4 decisões entraram TODAS, com o porquê escrito NO ARQUIVO?
- `TOTAL_DECLARADO_PELO_CEO` sumiu de código e de teste?
- O histórico da contagem 22×23 foi **registrado**, ou foi **apagado**? (a ficha
  exigia registrar, não apagar)
- Algum teste antigo foi apagado ou afrouxado "por conveniência"? Compare com
  `git diff` do arquivo de teste. **Teste que mudou de veredicto sem comentário
  explicando o porquê é achado.**
- `aprovada` é mesmo a única origem de `ganha`? Confira derivando da tabela.

### 2. Ficha B × `lib/agency/celula/ponte/*` + `__tests__/celula/ponte-*`
- Os 11 obrigatórios existem em CÓDIGO ou só em COMENTÁRIO? (armazenamento
  privado, separação por cliente/projeto/oportunidade, versões sem sobrescrita,
  checksum, validação de tipo e tamanho, varredura, quarentena, links internos
  temporários, histórico de download e envio, retenção configurável, auditoria
  append-only). **Liste um por um: CÓDIGO · SÓ COMENTÁRIO · AUSENTE.**
- Os dois percursos da ficha (Dioli→cliente e cliente→Dioli) estão completos, ou
  há etapa da ordem do CEO que não virou função nenhuma?
- **Toda trava tem AS DUAS METADES?** (barra o caso plantado E não barra o caso
  limpo). Aponte qualquer trava com só uma metade.
- Os modelos do schema batem **campo por campo** com o CONTRATO do COMUM?

### 3. Ficha C × `lib/agency/celula/excecoes/*` + `__tests__/celula/excecoes-*`
- Os 14 casos, com os slugs EXATOS da ficha, sem 15º inventado e sem faltar um?
- As 5 coisas obrigatórias de cada exceção são mesmo obrigatórias, ou alguma tem
  default silencioso?
- A fila é ÚNICA, ou nasceu um segundo lugar onde exceção mora?
- `assumirExcecao`/`descartarExcecao` não estavam no critério de aceite e foram
  construídos assim mesmo. **Isso é escopo a mais.** Diga se são necessários ao
  ciclo de vida ou se são peso que ninguém pediu.

### 4. A pergunta cara — faça-a mesmo que a resposta seja incômoda
- Alguma das três entregas **descreve** uma proteção que o código não executa?
  (o defeito que a casa chama de "gate sem mecanismo": texto que diz o que um
  humano deveria conferir, no lugar de código que confere)
- Algum comentário afirma um fato que o código contradiz? Foi assim que a M10 da
  Onda 1 foi pega — um laudo descrevia um comportamento que o código mutado não
  produzia. **Confira afirmação contra código, não contra o relatório do autor.**
- Algum número, data, commit ou caminho de arquivo citado em comentário está
  errado? Confira `9dddc18` e `@@unique([workspaceId, impressaoDigital])` no
  `prisma/schema.prisma` de verdade.

## ENTREGA
Bullets curtos, conclusão primeiro. Separe: **conforme · divergente · ausente ·
não verificável**. Para cada divergência: arquivo, linha, o que a ficha pedia, o
que o código faz. **Não invente achado para parecer útil, e não deixe de apontar
um por educação.** Se não conseguiu verificar algo, escreva "não verificável" e
o porquê — foi assim que a Onda 1 tratou o 23º estado, e foi o certo.
