# DESPACHO D3 — o relatório da mutação da Onda 3 (agente: `seguranca`)

Você escreveu o catálogo e o corredor (despacho D2). **O PM rodou.** Agora
escreva o laudo, no formato da Onda 1.

## O QUE JÁ ACONTECEU — os números são estes, e nenhum é de memória
- Rodado em 30/08/2026 pelo PM: `node scripts/mutacao-onda-3.mjs`.
- Resultado bruto: `docs/celula-prospeccao/mutacao-onda-3.json`.
- Linha de base conferida VERDE antes da primeira mutação: **178 testes**
  (os 12 arquivos de `ALVOS_DA_LINHA_DE_BASE` no topo do script).
- **Placar: 13 mutadas, 13 VERMELHO_COMO_ESPERADO, 0 seguiu verde, 0 alvo não
  encontrado. Restauração byte a byte conferida nas 13.**
- Portão do PM depois de tudo: **189 testes verdes** (os 12 da linha de base +
  `trilha-e-append-only` + `trilha-sobrevive-ao-reinicio`, que são da Onda 1) e
  `npx tsc --noEmit` limpo.

## SEU ARQUIVO — e só ele
`docs/celula-prospeccao/mutacao-onda-3.md`

**Não edite mais nada.** Não rode `npm`/`npx`/`node`/`git`.

## O MOLDE
`docs/celula-prospeccao/mutacao-onda-1.md`. Leia inteiro antes de escrever —
inclusive a seção §4 ("O que a mutação NÃO cobre"), que é a parte mais
importante daquele documento e tem que ter equivalente aqui.

Seções obrigatórias:
1. **Por que este documento existe** (guarda sem mutação é promessa escrita).
2. **Como a mutação foi rodada, e por que é confiável** — os 4 passos do
   corredor, a linha de base verde conferida antes, a restauração em `finally`
   com `sha256` antes × depois. **Cite o porquê de a linha de base não rodar a
   suíte inteira** (3 testes vermelhos de outra frente, no mesmo worktree).
3. **A tabela das 13 guardas** — `guarda | arquivo | afrouxado (de → para,
   resumido) | veredicto | testes que caíram`. **Todo número e toda linha de
   falha saem do JSON**, nunca de memória.
4. **O que a mutação NÃO cobre — leitura honesta.** É o bullet mais importante.
   Já sabemos o que entra aqui, e nada disto pode ser omitido:
   - a mutação prova que a guarda é observada por um teste; **não prova que a
     regra de negócio por trás dela esteja certa** (se um par errado estivesse
     na tabela desde o início, os testes concordariam com o erro);
   - **nenhuma rota HTTP e nenhuma tela existem nesta onda** — a ponte e a fila
     só são exercitadas por chamada direta de teste; a trava existe, a porta por
     onde alguém de fora a alcançaria não foi construída;
   - **o byte nunca é gravado em disco** — LACUNA DECLARADA do conserto B2:
     `caminhoInterno` é derivado com segurança, mas não há `writeFile`;
   - **ninguém executa o expurgo de retenção** — o campo é gravado, o expurgo
     não existe;
   - **a costura entre a ponte e a fila de exceções não existe**: a ponte devolve
     `PedidoDeExcecao` como DADO e ninguém o consome ainda;
   - **o gate de Qualidade não é verificado** por `aprovarParaEnvio`;
   - **não há antivírus real** — a varredura é estrutural (MIME, extensão,
     tamanho, marca de executável, nome), e isso é tudo o que ela é;
   - **atomicidade provada contra SQLite**, não contra o motor de produção;
   - as três lacunas de escopo que **você mesmo registrou** no despacho D2, e que
     não podem sumir agora que o placar deu 13/13:
     · M12 mutou **1 dos 4** padrões de `contemEnderecoInterno` (os outros três —
       id do arquivo, prefixo de diretório, link assinado — seguem sem mutação
       própria);
     · M20 mutou **1 dos 5** campos obrigatórios da exceção (`acaoRecomendada`);
     · M14 prova a não-sobrescrita de versão **por efeito da constraint
       `@@unique` do banco**, não por trava de aplicação isolada — se a
       constraint sumir, a mutação para de provar o que promete.
5. **O que o portão do PM achou, e que a mutação não teria achado sozinha** —
   escreva com todas as letras, porque é o achado mais útil do dia:
   - o `qualidade` (que **não escreve**, só lê) reprovou a ficha B: três
     obrigatórios do próprio despacho — armazenamento privado, retenção
     configurável e histórico de download — **não existiam nem em código nem em
     lacuna declarada**. Foram consertados no despacho B2 e **só então** ganharam
     mutação (M16 é filha desse conserto);
   - a inspeção do PM achou que `quarentena.ts` tinha **bytes de controle crus
     no código-fonte** (NUL e caracteres de sobrescrita de direção), dentro do
     regex e dos comentários — **enquanto o comentário logo acima afirmava que
     estavam escritos como escape `\u` "de propósito"**. Efeito medido: o `git
     diff` do arquivo saía como `Bin`, e **nenhum revisor conseguia ler o
     arquivo por diff**. Três confirmações independentes: o `git diff`, a
     varredura do PM, e a ferramenta de despacho, que **recusou transportar o
     trecho**. Consertado no B2, com teste que varre o próprio fonte
     (`ponte-quarentena-sem-byte-cru.test.ts`);
   - **a lição, e ela é a mesma da M10 da Onda 1:** um comentário pode afirmar um
     comportamento que o código não produz, e a mutação **não pega isso** — ela
     prova que a guarda barra, não que a prosa descreve a guarda. Quem pega é
     leitura humana (ou de um agente que só lê). É a divisão de papéis
     funcionando, e vale estar escrito.
   - o PM ajustou **uma asserção** em `ponte-caminho-interno-derivado.test.ts`:
     ela exigia `not.toContain("passwd")`, que não é propriedade de segurança
     nenhuma. Foi trocada por uma checagem **estritamente mais forte** — o
     formato inteiro do caminho (`/^celula\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/`),
     que é o que o próprio título do teste prometia. **Registre isso como o PM
     mexendo em teste no portão** — não esconda que a mão foi do PM.

## COMO ESCREVER
Português do Brasil, conclusão primeiro, sem adjetivo de propaganda. **Todo
número sai do JSON.** Se um número que você quer citar não estiver no JSON,
escreva "não medido" — a Onda 1 fez exatamente isso com o 23º estado, e foi o
certo. Um relatório de mutação que exagera o que provou é pior que nenhum.
