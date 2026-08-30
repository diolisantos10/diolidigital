# ONDA 2B — FICHA A · OS 22 TEXTOS LITERAIS DO CEO

## Objetivo em uma frase
Preencher o campo `textoBase` dos 22 modelos de `docs/plataformas/99freelas/mensagens.json`
com o texto LITERAL do CEO, transcrito caractere por caractere desta ficha.

## O que você NÃO pode fazer — leia antes de tudo
- **NÃO melhore, NÃO corrija, NÃO "adapte o tom", NÃO conserte gramática.**
  O texto abaixo é a fala oficial do CEO. Cada caractere, cada vírgula, cada
  acento e cada ponto final vai como está. Se você achar um erro, **não conserte**:
  escreva-o assim mesmo e cite o achado no seu relatório final.
- **NÃO aprove nenhum modelo.** Todos os 22 continuam `"estado": "rascunho"` e
  `"aprovador": null`. Aprovar é decisão do Gerente de Atendimento e SDR, por
  ordem do CEO. Aprovar por conta própria é tirar dele a decisão que a ordem lhe deu.
- **NÃO invente valor para campo nenhum.** Todo campo sobre o qual esta ficha não
  fala continua exatamente como está hoje no arquivo (`"preciso confirmar com o CEO"`).
- **NÃO toque em nenhum destes caminhos** (outra frente está escrevendo neles AGORA):
  `lib/agency/celula/ponte/`, `lib/agency/celula/excecoes/`, `lib/agency/celula/funil.ts`,
  `prisma/schema.prisma`.
- **NÃO toque em** `lib/agency/celula/mensagens/biblioteca.ts` nem em
  `__tests__/celula/biblioteca-de-mensagens.test.ts` — são de outro despacho desta
  mesma onda, rodando em paralelo. Colidir aí destrói trabalho em voo.

## Arquivos que são SEUS neste despacho (e só estes)
1. `docs/plataformas/99freelas/mensagens.json` — editar.
2. `__tests__/celula/os-22-textos-do-ceo.test.ts` — **criar**.

---

## A CONVENÇÃO DE VARIÁVEL — leia, porque muda o formato
O motor antigo usava `{{chave}}`. **O texto do CEO usa COLCHETES**: `[NOME]`,
`[ENTREGÁVEL]`, `[PRAZO, ESCOPO OU ORÇAMENTO]`. A ordem do CEO diz, com todas as
letras: *"Os colchetes são as variáveis"*. Portanto:

- `textoBase` guarda o colchete **literal**, como o CEO escreveu. Não converta para `{{}}`.
- O **nome da variável é o texto de dentro do colchete, exatamente como está** —
  maiúsculas, acentos, espaços e vírgulas inclusive. `[PRAZO, ESCOPO OU ORÇAMENTO]`
  vira a variável `PRAZO, ESCOPO OU ORÇAMENTO`.
- `variaveisObrigatorias` e `variaveisOpcionais` recebem esses nomes SEM os colchetes.
- Outro despacho (Ficha B) está ensinando `biblioteca.ts` a preencher colchete e a
  BLOQUEAR colchete que sobrar no texto final. Você **não** mexe nesse código.

---

## OS 22 TEXTOS — transcreva caractere por caractere

### M01 — ABORDAGEM INICIAL
- `nome`: `ABORDAGEM INICIAL`
- `condicaoDeEntrada`: `oportunidade qualificada, sem contato anterior`
- `textoBase`:
```
Olá, [NOME]. Li seu projeto sobre [ENTREGÁVEL] e entendi que você precisa [NECESSIDADE ESPECÍFICA]. Consigo atender essa demanda. Antes de definir o escopo e o prazo, preciso confirmar: [PERGUNTA ESPECÍFICA SOBRE O PROJETO]?
```
- `variaveisObrigatorias`: `["ENTREGÁVEL", "NECESSIDADE ESPECÍFICA", "PERGUNTA ESPECÍFICA SOBRE O PROJETO"]`
- `variaveisOpcionais`: `["NOME"]`
- Regra do CEO, textual: *"sem nome disponível, usar só 'Olá'"* e *"Nunca preencher
  [NECESSIDADE ESPECÍFICA] com frase genérica como 'um serviço de qualidade'"*.
  Grave-a no campo novo `regrasDoCeo` (lista de textos) e no campo novo
  `regrasDeAusencia` descrito na seção "OS DOIS CAMPOS NOVOS", abaixo.

### M02 — COMPLEMENTO DE ESCOPO
- `nome`: `COMPLEMENTO DE ESCOPO`
- `condicaoDeEntrada`: `respondeu, falta informação decisiva`
- `textoBase`:
```
Perfeito. Para eu montar a proposta corretamente, preciso confirmar mais um ponto: [INFORMAÇÃO PENDENTE]?
```
- obrigatórias: `["INFORMAÇÃO PENDENTE"]`
- `regrasDoCeo`: `["perguntar apenas o que realmente estiver ausente."]`

### M03 — CONFIRMAÇÃO DE ENTENDIMENTO
- `nome`: `CONFIRMAÇÃO DE ENTENDIMENTO`
- `condicaoDeEntrada`: `informações mínimas coletadas`
- `textoBase`:
```
Pelo que entendi, você precisa de [ENTREGÁVEIS], com [CARACTERÍSTICAS], para [OBJETIVO], dentro do prazo de [PRAZO]. [MATERIAIS] serão fornecidos por você. Está correto ou falta algum ponto importante?
```
- obrigatórias: `["ENTREGÁVEIS", "CARACTERÍSTICAS", "OBJETIVO", "PRAZO", "MATERIAIS"]`
- `regrasDoCeo`: `["não avançar se o cliente corrigir o entendimento."]`

### M04 — SOLICITAÇÃO DE ARQUIVOS
- `nome`: `SOLICITAÇÃO DE ARQUIVOS`
- `textoBase`:
```
Para concluir o escopo, pode anexar aqui na plataforma [LISTA OBJETIVA DE MATERIAIS]? Assim consigo verificar o que já está pronto e o que precisará ser desenvolvido.
```
- obrigatórias: `["LISTA OBJETIVA DE MATERIAIS"]`

### M05 — ARQUIVO RECEBIDO
- `nome`: `ARQUIVO RECEBIDO`
- `condicaoDeEntrada`: `baixado, verificado e associado ao projeto correto`
- `textoBase`:
```
Recebi [ARQUIVO OU CONJUNTO DE ARQUIVOS]. Vou analisar o material junto com o briefing e retorno por aqui com a próxima etapa.
```
- obrigatórias: `["ARQUIVO OU CONJUNTO DE ARQUIVOS"]`
- `regrasDoCeo`: `["não confirmar recebimento antes de verificar a integridade."]`

### M06 — ARQUIVO RECUSADO
- `nome`: `ARQUIVO RECUSADO`
- `textoBase`:
```
Não consegui abrir o arquivo [NOME]. A plataforma indicou [MOTIVO SEGURO E COMPREENSÍVEL]. Você consegue anexá-lo novamente em [FORMATO ACEITO]?
```
- obrigatórias: `["NOME", "MOTIVO SEGURO E COMPREENSÍVEL", "FORMATO ACEITO"]`
- ⚠️ Aqui `[NOME]` é o nome do ARQUIVO, não o da pessoa. Registre isso em
  `regrasDoCeo`: `["neste modelo [NOME] é o nome do arquivo, não o da pessoa."]`

### M07 — APRESENTAÇÃO DA PROPOSTA
- `nome`: `APRESENTAÇÃO DA PROPOSTA`
- `condicaoDeEntrada`: `briefing mínimo completo e preço validado`
- `textoBase`:
```
Com base no que alinhamos, a proposta contempla [ESCOPO RESUMIDO], com entrega em [PRAZO] e investimento de [VALOR], conforme as condições registradas na plataforma. Se estiver de acordo, podemos avançar para a contratação por aqui.
```
- obrigatórias: `["ESCOPO RESUMIDO", "PRAZO", "VALOR"]`
- `regrasDoCeo`: `["o valor vem do motor oficial de preços ou de decisão registrada."]`

### M08 — ORÇAMENTO ABAIXO DO NECESSÁRIO
- `nome`: `ORÇAMENTO ABAIXO DO NECESSÁRIO`
- `textoBase`:
```
Para entregar todo o escopo descrito, o investimento necessário é [VALOR]. Se precisar manter o orçamento de [ORÇAMENTO DO CLIENTE], consigo ajustar a proposta para [ESCOPO REDUZIDO]. Qual caminho atende melhor neste momento?
```
- obrigatórias: `["VALOR", "ORÇAMENTO DO CLIENTE", "ESCOPO REDUZIDO"]`
- `regrasDoCeo`: `["nunca reduzir preço silenciosamente sem reduzir escopo ou registrar autorização."]`

### M09 — PRAZO INVIÁVEL
- `nome`: `PRAZO INVIÁVEL`
- `textoBase`:
```
Para entregar o escopo completo com segurança, o prazo necessário é [PRAZO REALISTA]. Para atender até [DATA DO CLIENTE], consigo priorizar [ESCOPO POSSÍVEL]. Essa alternativa funciona para você?
```
- obrigatórias: `["PRAZO REALISTA", "DATA DO CLIENTE", "ESCOPO POSSÍVEL"]`

### M10 — CLIENTE PEDE CONTATO EXTERNO
- `nome`: `CLIENTE PEDE CONTATO EXTERNO`
- `textoBase`:
```
Para manter o histórico e a segurança desta negociação, vamos continuar por aqui nesta etapa. Consigo coletar todas as informações, apresentar a proposta e acompanhar o projeto pela própria plataforma.
```
- obrigatórias: `[]`
- `regrasDoCeo`: `["não repreender o cliente nem citar punições."]`

### M11 — CLIENTE ENVIA CONTATO ESPONTANEAMENTE
- `nome`: `CLIENTE ENVIA CONTATO ESPONTANEAMENTE`
- `textoBase`:
```
Obrigado. Nesta etapa, vou manter o briefing, a proposta e a contratação registrados por aqui para preservar o histórico do projeto.
```
- obrigatórias: `[]`
- `regrasDoCeo`: `["registrar o contato como fornecido espontaneamente, sem iniciar fluxo externo automático."]`

### M12 — CLIENTE PEDE LINK DE BRIEFING
- `nome`: `CLIENTE PEDE LINK DE BRIEFING`
- `textoBase`:
```
Consigo fazer o briefing por aqui. Vou organizar as perguntas de forma objetiva para não tomar muito do seu tempo.
```
- obrigatórias: `[]`

### M13 — TESTE NÃO REMUNERADO
- `nome`: `TESTE NÃO REMUNERADO`
- `textoBase`:
```
Consigo apresentar experiência, método e proposta, mas não realizamos produção completa não remunerada. Se for necessário validar uma etapa antes do projeto integral, posso estruturar uma entrega inicial remunerada e com escopo reduzido.
```
- obrigatórias: `[]`

### M14 — ACOMPANHAMENTO SEM RESPOSTA
- `nome`: `ACOMPANHAMENTO SEM RESPOSTA`
- `textoBase`:
```
Olá, [NOME]. Passando para confirmar se conseguiu analisar a proposta. Se houver alguma dúvida sobre escopo, prazo ou entrega, posso esclarecer por aqui.
```
- obrigatórias: `[]` · opcionais: `["NOME"]`
- `regrasDoCeo` (copie as sete linhas, literais):
  - `apenas UM acompanhamento automático por oportunidade, intervalo configurável.`
  - `NÃO enviar se: o cliente recusou`
  - `NÃO enviar se: o projeto encerrou`
  - `NÃO enviar se: outra pessoa foi contratada`
  - `NÃO enviar se: o cliente pediu para não receber`
  - `NÃO enviar se: já houve acompanhamento`
  - `NÃO enviar se: a plataforma bloqueou`
- Mesma `regrasDeAusencia` de M01 para `NOME`.
- ⚠️ A TRAVA que faz cumprir essas seis condições é de OUTRO despacho (Ficha C).
  Você só registra o dado. **Não implemente a trava aqui.**

### M15 — CONTRATAÇÃO CONFIRMADA
- `nome`: `CONTRATAÇÃO CONFIRMADA`
- `textoBase`:
```
Projeto confirmado. Vou iniciar com [PRIMEIRA ETAPA]. O próximo retorno será [MARCO OU ENTREGA] até [DATA]. Todas as atualizações serão registradas por aqui.
```
- obrigatórias: `["PRIMEIRA ETAPA", "MARCO OU ENTREGA", "DATA"]`
- `regrasDoCeo`: `["não iniciar produção com estado de pagamento desconhecido quando a plataforma exigir garantia."]`

### M16 — ATUALIZAÇÃO DE ANDAMENTO
- `nome`: `ATUALIZAÇÃO DE ANDAMENTO`
- `condicaoDeEntrada`: `marco real concluído`
- `textoBase`:
```
Atualização do projeto: [ETAPA] foi concluída. Agora estamos trabalhando em [PRÓXIMA ETAPA]. A previsão para o próximo envio permanece [DATA].
```
- obrigatórias: `["ETAPA", "PRÓXIMA ETAPA", "DATA"]`
- `regrasDoCeo`: `["não enviar atualização vazia como \"estamos trabalhando\"."]`

### M17 — ENTREGA PARA AVALIAÇÃO
- `nome`: `ENTREGA PARA AVALIAÇÃO`
- `condicaoDeEntrada`: `arquivo aprovado pela Qualidade e anexado ao cliente certo`
- `textoBase`:
```
Concluímos [ENTREGA]. O arquivo [NOME DO ARQUIVO] está anexado para sua avaliação. Por favor, confirme se está aprovado ou indique de forma objetiva os ajustes necessários.
```
- obrigatórias: `["ENTREGA", "NOME DO ARQUIVO"]`
- `regrasDoCeo`: `["só pode ser enviada depois da confirmação técnica do anexo."]`

### M18 — AJUSTE RECEBIDO
- `nome`: `AJUSTE RECEBIDO`
- `textoBase`:
```
Recebi o pedido de ajuste: [RESUMO OBJETIVO]. Vou aplicar as alterações dentro do escopo acordado e retornar até [PRAZO].
```
- obrigatórias: `["RESUMO OBJETIVO", "PRAZO"]`

### M19 — AJUSTE FORA DO ESCOPO
- `nome`: `AJUSTE FORA DO ESCOPO`
- `textoBase`:
```
O ajuste solicitado acrescenta [NOVA DEMANDA], que não estava incluída no escopo original. Posso preparar uma ampliação da proposta com prazo e valor correspondentes, ou manter a entrega dentro do escopo contratado. Qual opção você prefere?
```
- obrigatórias: `["NOVA DEMANDA"]`

### M20 — ENTREGA FINAL
- `nome`: `ENTREGA FINAL`
- `textoBase`:
```
A entrega final de [ENTREGÁVEL] foi concluída e o arquivo [NOME] está anexado. Obrigado pela confirmação. Vou manter todo o histórico e os materiais associados a este projeto.
```
- obrigatórias: `["ENTREGÁVEL", "NOME"]`
- `regrasDoCeo`: `["neste modelo [NOME] é o nome do arquivo, não o da pessoa."]`

### M21 — RECUSA EDUCADA
- `nome`: `RECUSA EDUCADA`
- `textoBase`:
```
Obrigado pelas informações. Neste momento, não conseguiremos assumir o projeto dentro das condições necessárias de [PRAZO, ESCOPO OU ORÇAMENTO]. Prefiro não confirmar uma entrega que não conseguiríamos cumprir com segurança.
```
- obrigatórias: `["PRAZO, ESCOPO OU ORÇAMENTO"]`

### M22 — CLIENTE NÃO SELECIONADO OU PROJETO ENCERRADO
- `nome`: `CLIENTE NÃO SELECIONADO OU PROJETO ENCERRADO`
- `textoBase`:
```
Obrigado pela conversa e pelas informações compartilhadas. Como o projeto foi encerrado, vou finalizar esta oportunidade por aqui. Desejo uma excelente execução.
```
- obrigatórias: `[]`

---

## OS DOIS CAMPOS NOVOS (e um campo de raiz)

### 1. `regrasDoCeo` — por modelo, lista de textos
Guarda as regras que o CEO escreveu sobre AQUELE modelo, literais. Quando a
ficha não cita regra para o modelo, use `[]`. **É registro, não mecanismo** —
não implemente nada a partir dele.

### 2. `regrasDeAusencia` — por modelo, lista de objetos
Só M01 e M14 têm. É a forma MECÂNICA da ordem *"sem nome disponível, usar só
'Olá'"*. Formato exato:
```json
"regrasDeAusencia": [
  {
    "variavel": "NOME",
    "de": "Olá, [NOME].",
    "para": "Olá.",
    "fonte": "ordem do CEO: sem nome disponível, usar só \"Olá\"."
  }
]
```
`de` e `para` são recortes LITERAIS. O motor (Ficha B) aplica a troca quando a
variável opcional vier ausente. Nos outros 20 modelos: `[]`.

### 3. `palavrasProibidasGlobais` — na RAIZ do JSON, ao lado de `modelos`
A lista de proibições do CEO tem duas naturezas, e misturá-las é mentir sobre o
que a casa verifica. Separe:

```json
"palavrasProibidasGlobais": ["copiei e colei", "somos os melhores", "garantimos resultado"],
"_proibicoes_do_ceo_sem_mecanismo": {
  "_leia_isto": "Estas proibições do CEO são CATEGORIAS, não texto literal — não dá para verificá-las por substring. Estão escritas aqui para não desaparecerem, e cada uma diz quem a verifica hoje, ou declara que NINGUÉM verifica.",
  "exageros": "preciso confirmar com o CEO — nenhum mecanismo conhecido",
  "pressão artificial": "preciso confirmar com o CEO — nenhum mecanismo conhecido",
  "urgência inventada": "preciso confirmar com o CEO — nenhum mecanismo conhecido",
  "promessa de resultado": "preciso confirmar com o CEO — nenhum mecanismo conhecido",
  "experiência não comprovada": "preciso confirmar com o CEO — nenhum mecanismo conhecido",
  "portfólio inexistente": "preciso confirmar com o CEO — nenhum mecanismo conhecido",
  "excesso de elogios": "preciso confirmar com o CEO — nenhum mecanismo conhecido",
  "texto longo sobre a Dioli": "preciso confirmar com o CEO — nenhum mecanismo conhecido",
  "múltiplas perguntas misturadas": "verificada por lib/agency/celula/mensagens/proxima-mensagem.ts (regra uma-pergunta-so)",
  "contato ou link externo": "verificada por lib/marketplaces/99freelas/conformidade.ts (o Guardião)"
}
```
Confira os dois "verificada por" abrindo os arquivos. Se não conferir, escreva
`"preciso confirmar com o CEO — nenhum mecanismo conhecido"` e diga isso no relatório.

Guarde também na raiz, sob `"_regras_editoriais_do_ceo"`, as duas listas literais:
as nove regras de "toda mensagem" e as cinco de "mensagem inicial", como listas
de texto. São registro.

---

## OS OUTROS CAMPOS DE CADA MODELO
- `estado`: `"rascunho"` — **os 22, sem exceção.**
- `aprovador`: `null` — **os 22.**
- `versao`: sobe para `"0.2.0"`; acrescente UMA entrada no `historico` com
  `versao: "0.2.0"`, `em: "2026-08-30T00:00:00.000Z"`, `autor` seu,
  `aprovador: null`, `oQueMudou: "Texto oficial do CEO transcrito literalmente (Onda 2B, ficha A). Estado continua rascunho — a aprovação é do Gerente de Atendimento e SDR."`.
- `pendencia`: a pendência de hoje diz "texto oficial do CEO não recebido" —
  **isso ficou falso, e registro falso é pior que registro ausente.** Reescreva:
  - Se TODOS os campos do modelo estiverem preenchidos com informação vinda do
    CEO → `null`.
  - Se ainda sobrar campo em `"preciso confirmar com o CEO"` (`finalidade`,
    `condicaoDeSaida`, `proximaAcao`, `etapaDoFunil`...) → a pendência passa a
    NOMEAR exatamente quais campos faltam. Ex.: `"faltam do CEO: condicaoDeSaida, proximaAcao. O texto oficial JÁ foi recebido e transcrito."`
- `versao` da raiz: `"0.2.0-rascunho"`. `atualizadoEm`: `"2026-08-30"`.
- O bloco `_leia_isto` da raiz hoje diz que os 22 slots estão vazios. **Reescreva-o**
  para dizer a verdade nova: texto recebido e transcrito, estado rascunho, quem aprova.

---

## O TESTE QUE VOCÊ ESCREVE — `__tests__/celula/os-22-textos-do-ceo.test.ts`
Ele é a prova de que o texto do CEO não vai ser "melhorado" por ninguém depois.

1. **Os 22 existem e nenhum tem `textoBase` vazio.**
2. **Transcrição fixada:** para cada um dos 22, o teste guarda o texto ESPERADO
   como literal dentro do próprio teste e compara com `toBe` — igualdade exata,
   nada de `toContain`. (Sim, é duplicação deliberada: é assim que o teste vira
   trava contra edição silenciosa do JSON.)
3. **Os 22 continuam INENVIÁVEIS:** para cada código de `M01` a `M22`,
   `modeloParaEnvio(codigo)` devolve `ok: false` e o motivo cita `"rascunho"`.
4. **Nenhum tem `aprovador`.**
5. **Toda variável entre colchetes do `textoBase` está declarada** em
   `variaveisObrigatorias` ou `variaveisOpcionais`, e vice-versa — os dois lados,
   não um. Extraia os colchetes com `/\[([^\[\]]+)\]/g`.
6. **A lista de proibições literais está na raiz** e tem as três strings.
7. **`regrasDeAusencia` de M01 e M14** existe, aponta para `NOME`, e o campo `de`
   dela **aparece literalmente** dentro do `textoBase` do modelo. (Regra de
   ausência cujo recorte não existe no texto é regra morta.)

Importe de `@/lib/agency/celula/mensagens/biblioteca` (`carregarBiblioteca`,
`modeloParaEnvio`) e de `@/docs/plataformas/99freelas/mensagens.json`.

## Critério de aceite
- `docs/plataformas/99freelas/mensagens.json` é JSON válido.
- Os 22 `textoBase` batem caractere a caractere com esta ficha.
- Os 22 em `rascunho`, `aprovador: null`.
- O teste novo existe e cobre os 7 itens.
- Nenhum arquivo fora dos dois listados em "Arquivos que são SEUS" foi tocado.

## O que devolver
Bullets curtos: o que ficou pronto · qualquer divergência que você achou entre o
texto do CEO e o que já existia · o que precisa de decisão. Se transcreveu algo
que lhe pareceu errado, **diga qual**.
