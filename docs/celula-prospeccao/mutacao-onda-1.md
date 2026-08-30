# Mutação da Onda 1 — funil da célula de prospecção

> Laudo do especialista `seguranca`. Fonte de todo número aqui:
> `docs/celula-prospeccao/mutacao-onda-1.json` (rodado em 30/08/2026,
> `scripts/mutacao-onda-1.mjs`). Nenhum número deste documento é de memória.

## 1. Por que este documento existe

Guarda sem mutação rodada é promessa escrita — e promessa escrita já falhou
nesta casa **seis vezes em dois dias**. Um teste que só confirma que o código
está *como foi escrito* não prova que ele **barra** alguma coisa; só a
mutação — afrouxar a guarda de propósito e checar que a suíte reage — prova
isso. É trava, não aviso.

## 2. Como a mutação foi rodada, e por que é confiável

`scripts/mutacao-onda-1.mjs` afrouxa **um trecho por vez**, em
`lib/agency/celula/funil.ts` ou `lib/agency/celula/trilha.ts`:

1. Lê o arquivo, confere no disco que o trecho `de` existe antes de mexer.
2. Aplica o `replace` e **confere no disco** que o texto `para` entrou —
   `replace` sem `assert` não é conserto, é esperança, e o script trata isso
   como erro fatal (`throw`) se a substituição não pegar.
3. Roda os três arquivos de teste alvo (`funil.test.ts`,
   `trilha-sobrevive-ao-reinicio.test.ts`, `trilha-e-append-only.test.ts`)
   via `vitest run`.
4. **Restaura o arquivo original em `finally`** — inclusive se o passo 3
   estourar — e confere **byte a byte** que o arquivo voltou ao estado
   anterior antes de seguir para a próxima guarda.

A **linha de base** (40 testes) é checada verde **antes da primeira
mutação**, e o script aborta se ela já estiver vermelha: mutação sobre suíte
vermelha não prova nada, só confirma que já estava quebrado.

## 3. As 10 guardas mutadas

| Guarda | Arquivo | Afrouxado (de → para) | Veredicto | Testes que caíram |
|---|---|---|---|---|
| **M1** · tabela de pares (par não listado é rejeitado) | `funil.ts` | `CONJUNTO_DE_PARES.has(...)` → `return true` (tabela desligada) | ✅ VERMELHO | `rejeita um par que não está na tabela (pular etapas)` · `rejeita transição invertida (voltar sem passar por retomar/exceção)` · `é possível sair de excecao_operacional para um estado de trabalho` · `rejeita par não permitido, citando os dois estados pelo nome no motivo` · `transição inválida (par não permitido) não grava NADA — nem linha, nem trilha` |
| **M2** · leitura fail-closed de estado (nunca `as Estado`) | `funil.ts` | checagem contra `CONJUNTO_DE_ESTADOS` → `(valor as Estado) ?? null` (cast cego) | ✅ VERMELHO | `rejeita grafia errada, espaço nas pontas, maiúscula, null, número e objeto` · `devolve 'encontrada' para undefined, null, lixo e string vazia` · `rejeita estado de origem desconhecido` · `rejeita estado de destino desconhecido` |
| **M3** · fail closed do estado ausente (sem linha = `'encontrada'`) | `funil.ts` | `?? ESTADO_INICIAL` → `?? "contratada"` (ausência vira "pode avançar") | ✅ VERMELHO | `devolve 'encontrada' para undefined, null, lixo e string vazia` · `avancarFunil grava a transição via .create, e ela é lida de volta` · `3 transições gravadas continuam lá... depois do 'deploy'` · `o ESTADO também sobrevive ao reinício (prova nº 8 do CEO)` · `transição sem justificativa não grava NADA` · `duas transições válidas em sequência: o estadoAnterior da 2ª é o estadoNovo da 1ª` · `oportunidade nunca tocada lê 'encontrada'` |
| **M4** · justificativa obrigatória (é trava, não campo opcional) | `funil.ts` | `valor.trim().length >= 3` → `return true` (sem justificativa passa) | ✅ VERMELHO | `rejeita transição sem justificativa (undefined)` · `rejeita justificativa só de espaços em branco` · `rejeita justificativa com menos de 3 caracteres úteis` · `transição sem justificativa não grava NADA` |
| **M5** · origem fechada nas 4 (sem default silencioso) | `funil.ts` | checagem contra `CONJUNTO_DE_ORIGENS` → `return "sistema"` (default silencioso) | ✅ VERMELHO | `aceita as 4 origens` · `rejeita origem fora das 4, sem cair silenciosamente em 'sistema'` · `rejeita origem fora das 4, sem default silencioso para 'sistema'` |
| **M6** · autor identificado obrigatório | `funil.ts` | `valor.trim().length > 0` → `return true` (autor anônimo passa) | ✅ VERMELHO | `rejeita autor ausente / vazio / não-string` |
| **M7** · rejeição NÃO grava nada (nem linha, nem trilha) | `trilha.ts` | `if (!veredicto.ok) return {...}` → grava `transicaoDoFunil.create` **antes** de respeitar o veredicto | ✅ VERMELHO | `transição inválida (par não permitido) não grava NADA — nem linha, nem trilha` · `transição sem justificativa não grava NADA` |
| **M8** · trilha é append-only (nenhum update/delete/upsert) | `trilha.ts` | insere `transicaoDoFunil.updateMany({...justificativa: "reescrita"})` antes da escrita da linha | ✅ VERMELHO | `não existe .update / .updateMany / .delete / .deleteMany / .upsert sobre transicaoDoFunil` · `3 transições gravadas continuam lá... depois do 'deploy'` |
| **M9** · persistência: o estado vem do BANCO, não da memória | `trilha.ts` | `estadoAtualOuInicial(linha?.estado)` → `estadoAtualOuInicial(undefined)` (ignora o banco) | ✅ VERMELHO | `o ESTADO também sobrevive ao reinício (prova nº 8 do CEO)` |
| **M10** · leitura de origem do banco não é cast cego | `trilha.ts` | `origemDeclarada(linha.origem)` → `linha.origem as OrigemDaTransicao` (cast cego puro, sem `??` — origem ilegível vaza como se fosse válida) | ✅ VERMELHO | `metade negativa: linha com origem='xpto' (corrupção simulada) volta com origem null — não 'sistema', não some` |

**Placar: 10 mutadas, 10 VERMELHO, 0 SEGUIU_VERDE.** Todas as 10 caíram citando
o teste esperado pelo script (`espera` no JSON bate com a lista de `falhas`)
— é essa coincidência entre "o que se esperava quebrar" e "o que quebrou" que
prova que a guarda caiu pelo motivo certo, e não por efeito colateral.

**Como a M10 nasceu — e por que isso importa mais que o resultado dela.** M10
não veio de um teste que já existia esperando ser mutado. Ela existe porque a
inspeção do PM, no mesmo dia da rodada original, achou um cast cego
(`linha.origem as OrigemDaTransicao`) em `trilha.ts` que as 9 primeiras
guardas nunca cobriram — a leitura de origem vinda do banco simplesmente não
tinha mutação nenhuma provando que ela era fail-closed. O `plataforma`
consertou o cast (a leitura passou a usar `origemDeclarada`, devolvendo
`null` para origem ilegível em vez de inventar `'sistema'`), e só depois
disso a M10 foi escrita para provar que o conserto pega. Isto é o portão
funcionando como deveria: achou uma guarda que o especialista tinha deixado
sem prova, e o conserto não foi aceito como pronto até ter mutação própria —
conserto sem mutação rodada é a mesma promessa escrita que a mutação existe
para não aceitar.

**A lição da M10, e é o achado mais útil do dia.** A primeira versão deste
laudo descreveu o trecho mutado como
`(linha.origem as OrigemDaTransicao) ?? "sistema"` — um cast cego somado a um
default silencioso. O `qualidade` conferiu contra o script e achou a
imprecisão: o operador `??` só dispara para `null`/`undefined`, nunca para
uma string inválida como `'xpto'`; a mutação de fato aplicada era o cast
cego puro, sem `??`. A guarda estava provada — o teste exige que `origem`
corrompida vire `null`, e o cast fazia `'xpto'` vazar como se fosse origem
legítima — mas a prosa descrevia um comportamento que o código mutado não
produzia. **Uma mutação pode ficar vermelha pelo motivo certo e ainda assim
ser descrita errado; quem lê o relatório sem reler o script herda a
descrição, não o comportamento.** Foi o `qualidade` — que não escreve, só lê
— quem pegou isso. É a divisão de papéis funcionando, e vale estar escrito.

## 4. O que a mutação NÃO cobre — leitura honesta

Este é o bullet mais importante do documento.

- **A mutação prova que a guarda existe e é observada por um teste; não prova
  que a TABELA de transições esteja desenhada certo do ponto de vista do
  negócio.** Se um par errado estivesse na tabela `PARES_POR_ORIGEM` desde o
  início (ex.: permitir `contratada → excecao_operacional → ganha` sem
  decisão humana, ou uma saída indevida de `excecao_operacional`), os testes
  concordariam com esse erro — eles verificam que o código respeita a tabela
  escrita, não que a tabela escrita é a correta.
- **Não há rota HTTP nem tela nesta onda.** Nada disto está exercitado por um
  chamador real — só por chamada direta de teste a `avancarFunil` /
  `avaliarTransicao`. Confirmado por grep: nenhum arquivo fora de
  `__tests__/` e do próprio `lib/agency/celula/` importa `celula/funil` ou
  `celula/trilha`. A trava existe; a porta por onde alguém de fora a
  alcançaria ainda não foi construída.
- **A atomicidade é provada contra SQLite.** `avancarFunil` roda dentro de
  `prisma.$transaction`, e os testes que provam "trilha sem linha, ou linha
  sem trilha, é impossível" rodam contra o SQLite local (`dev.db`/teste). O
  banco de produção desta casa pode não ser SQLite — isto é **lacuna**, não
  cobertura: comportamento de transação (isolamento, deadlock, retry) varia
  por motor, e nada aqui foi testado contra o motor de produção.
- **A divergência 22 × 23 estados continua aberta e não resolvida por
  código.** `funil.ts` declara `TOTAL_DECLARADO_PELO_CEO = 23` e implementa
  22 estados nomeados, de propósito, até o CEO confirmar qual é o 23º estado
  ou validar que são 22. A mutação não toca nisso — ela prova que os 22
  existentes são bem guardados, não que a lista está completa. **Registrado
  como "não verificável", com todas as letras:** o `qualidade` leu a lista
  inteira de 22 estados e **não conseguiu** apontar qual seria o 23º, e se
  recusou a inventar um. Isto é informação, não silêncio — a lacuna segue
  aberta, e nenhum código aqui a fecha.
- **A mutação cobre o que o script decidiu mutar, não uma varredura
  exaustiva.** 10 guardas nomeadas, escolhidas por quem escreveu o script (a
  décima entrou no mesmo dia, depois que a inspeção do PM achou uma leitura
  sem prova — ver §3). Uma décima primeira guarda não declarada aqui — se
  existir — não tem prova nenhuma, nem a favor nem contra.

### Três perguntas ao CEO — lacunas de desenho, não defeitos

O `qualidade` levantou três buracos de **desenho** na tabela de transições
que a mutação, por construção, não pega: se um par errado estivesse na
tabela desde o início, os testes concordariam com ele — eles verificam que o
código respeita a tabela escrita, não que a tabela escrita é a correta.
Nenhuma das três é um defeito hoje; são **decisões pendentes do CEO**,
porque a especificação ainda não respondeu a elas.

1. **`perdida` é terminal, e não há `perdida → retomar`.** Uma oportunidade
   marcada `perdida` que volta a responder **não tem caminho legal de volta
   ao funil** — só nascendo uma oportunidade nova, ou alguém editando o
   banco por fora, que é exatamente o que a trilha auditável existe para
   impedir. O comentário de `funil.ts` descreve `retomar` como reengajamento
   **antes** de `perdida`, não depois. Precisa de decisão: existe caminho de
   volta, ou `perdida` é ponto sem retorno por desenho?
2. **`contratada` só sai para `em_producao`.** Contrato assinado e depois
   cancelado só chega a `perdida` em três saltos
   (`contratada → excecao_operacional → negociacao → perdida`), passando por
   estados que não descrevem o que aconteceu. Precisa de decisão: deve
   existir uma saída direta que registre "contrato cancelado" pelo que
   é, em vez de emprestar estados de outro significado?
3. **`aprovada → ganha` é a única entrada em `ganha`.** Pode ser deliberado
   — nunca fechar sem aprovação formal registrada —, mas precisa de
   confirmação: é essa a regra de negócio pretendida, ou falta outro caminho
   legítimo até `ganha`?

## 5. Como repetir

```
node scripts/mutacao-onda-1.mjs
```

Sai `0` só se as 10 guardas ficarem vermelhas; sai `2` se qualquer uma
sobreviver (`SEGUIU_VERDE`) ou se o trecho-alvo não for encontrado no
arquivo (`ALVO_NAO_ENCONTRADO`). Aborta antes de mutar qualquer coisa se a
linha de base já estiver vermelha.

---

## Laudo de segurança — texto de terceiro é dado, nunca ordem

**Pergunta da ficha:** "Texto de cliente/anúncio é DADO, nunca ordem." Vale
para `lib/agency/celula/funil.ts` e `lib/agency/celula/trilha.ts`?

### `textoBruto` entra nestes módulos, direta ou indiretamente?

**Não.** Conferido por leitura de código e por grep:

- `funil.ts` declara com todas as letras, no cabeçalho (linhas 49–56): *"Não
  lê `textoBruto` de oportunidade nem de anúncio... Este módulo julga só os
  cinco campos estruturados de uma transição (`de`, `para`, `autor`,
  `origem`, `justificativa`)."*
- `trilha.ts` reforça a mesma nota (linhas 26–29): *"Este módulo não importa
  nada de `lib/marketplaces`. Texto de terceiro (anúncio, cliente) é dado não
  confiável — nunca ordem para o sistema."*
- `grep -rn "textoBruto" lib/agency/celula/` só encontra as **duas menções em
  comentário** citadas acima — nenhum import, nenhuma leitura de campo.
- `trilha.ts` importa só de `@/lib/db/client` e `@/lib/agency/celula/funil`
  (linhas 31–38); `funil.ts` não importa nada de `lib/marketplaces` nem de
  qualquer módulo que carregue `Oportunidade.textoBruto`. Não há cadeia de
  import por onde o texto do anúncio alcance estes dois arquivos hoje.

### `justificativa` pode ser preenchida com texto de anúncio/cliente sem barreira?

**Furo em potencial, tamanho pequeno hoje, porque a superfície não existe
ainda — mas o desenho da função permite, e é isso que importa registrar.**

- `avancarFunil` (`trilha.ts`, linha 109 em diante) recebe
  `entrada.justificativa: unknown` e só valida **forma** — `funil.ts` linha
  227–229: `typeof valor === "string" && valor.trim().length >= 3`. Não há
  checagem de **origem** do valor: qualquer string com 3+ caracteres úteis
  passa, venha ela de um humano digitando "cliente confirmou por telefone" ou
  de uma rotina que copia `textoBruto` do anúncio para dentro do campo
  `justificativa` da chamada.
- **É furo, sim, do tipo "a trava certa está no lugar errado".** O campo
  `justificativa` é obrigatório e **vira registro de auditoria permanente**
  (a trilha é append-only — `trilha.ts`, linhas 12–20). Se algum caminho
  futuro popular `justificativa` com texto de terceiro sem passar por
  validação/sanitização própria, a trilha — que existe para provar "quem
  decidiu o quê e por quê" — passaria a conter texto que um desconhecido na
  internet escreveu, não uma decisão humana ou de agente.
- **Tamanho do furo hoje: zero superfície, risco de desenho.** Não há
  nenhum chamador de `avancarFunil` fora de teste (confirmado por grep: os
  únicos hits de `avancarFunil` fora de `trilha.ts` são comentários gerados
  pelo Prisma). Ninguém, hoje, alimenta `justificativa` com texto de anúncio.
  O risco é que a guarda de "só forma, não origem" fica esperando o primeiro
  caminho de escrita real decidir, sozinho, se filtra a origem do texto —
  e nada em `funil.ts`/`trilha.ts` o obriga a filtrar.
- **O que fecharia (sem escrever o conserto):** a validação de
  `justificativa` precisaria diferenciar "texto vindo de decisão humana/de
  agente sobre a transição" de "texto copiado de fonte externa não
  confiável" — por exemplo, marcando a origem do texto (assim como `origem`
  já marca quem decidiu) e recusando `justificativa` cujo conteúdo derive
  diretamente de `textoBruto` sem reformulação por um agente/humano
  responsável, no mesmo espírito da nota que já existe no cabeçalho dos dois
  arquivos. É trabalho para o especialista que construir a próxima rota que
  chama `avancarFunil`, não conserto deste laudo.

### `origem: 'cliente'` — disparável por alguém de fora?

- `ORIGENS = ["agente", "gerente", "cliente", "sistema"]` (`funil.ts`, linha
  197) tem `cliente` como valor **legítimo** no conjunto fechado.
- **Resposta esperada e confirmada: ainda não há superfície.** Não existe
  rota HTTP nem chamador real de `avancarFunil` nesta onda (mesmo grep do
  item 4 do Entregável 1: zero import de `celula/funil`/`celula/trilha` fora
  de `__tests__/` e do próprio módulo). Ninguém de fora consegue, hoje,
  disparar uma transição com `origem: 'cliente'` — nem com qualquer outra
  origem.
- **Declarado como dívida da onda que criar a rota:** quando uma rota HTTP
  vier a chamar `avancarFunil`, ela precisa decidir **quem tem permissão de
  declarar `origem: 'cliente'`** — hoje a função aceita qualquer uma das 4
  origens de qualquer chamador, sem checagem de que o chamador de fato
  representa aquele papel (nada impede, no desenho atual, uma chamada
  interna se autodeclarar `origem: 'cliente'` sem ser o cliente). Isso é
  **identificador de posse não verificado por design de função**, e vira
  achado real no dia em que existir rota — não hoje, porque hoje não há
  chamador.
- **Nota acrescentada em 30/08, depois da M10:** a leitura de `origem` que
  vem do banco (`trilha.ts`) agora é fail-closed — origem ilegível/corrompida
  volta como `null`, nunca mais como `'sistema'` por default silencioso
  (guarda M10, §3). Isso muda o tipo de `RegistroDeTransicao.origem` para
  `OrigemDaTransicao | null`, e empurra a obrigação para a frente: **quem
  consumir esse campo numa tela precisa mostrar a lacuna** — "origem
  desconhecida" ou equivalente — **e não pode escondê-la atrás de um rótulo
  genérico** como "Sistema" só porque `null` é inconveniente de exibir. Não
  há tela nesta onda (achado já registrado acima), então isto é **dívida
  declarada para quem construir a próxima**, não conserto deste laudo.

### Veredicto do laudo

Nenhum furo ativo hoje — porque não há superfície de entrada. Três pontos
ficam registrados como **dívida a fechar antes de qualquer rota/tela
nascer**: (1) `justificativa` valida forma, não origem do texto; (2)
`origem` é um conjunto fechado de 4 valores, mas nada verifica que o
chamador tem o direito de declarar o valor que está declarando; (3) desde a
M10, `origem` lida do banco pode vir `null` (origem ilegível), e quem
construir a tela precisa mostrar essa lacuna em vez de escondê-la atrás de
um rótulo genérico. Nenhum dos três é conserto desta sessão — só relatado,
como pedido.
