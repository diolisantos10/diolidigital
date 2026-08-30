# Mutação da Onda 2 — o motor conversacional da Célula de Prospecção

> **Guarda sem mutação rodada já falhou seis vezes nesta casa em dois dias.**
> Cada trava desta onda foi AFROUXADA de propósito, o teste foi rodado, e só
> conta como trava a que ficou **VERMELHA** — e vermelha **pelo motivo certo**,
> não por qualquer motivo. Depois de cada rodada o arquivo foi restaurado e o
> sha256 conferido: `restaurado: true` em todas.

**Como reproduzir**, sem depender de ninguém lembrar:
```sh
node scripts/mutacao-onda-2.mjs <lista.json> <resultado.json>
```
O script recusa a mutação se o alvo não aparecer **exatamente uma vez** no
arquivo (`ALVO_NAO_ENCONTRADO`) — `replace` sem `assert` não é conserto, é
esperança. E ele grava com todas as letras quando uma guarda afrouxada deixa o
teste VERDE, em vez de esconder: guarda que não derruba teste é decoração.

## O resultado

| mutação | a guarda que ela afrouxa | o teste ficou | os testes que caíram |
|---|---|---|---|
| `biblioteca/estado-aprovado` | modelo em rascunho, pausado ou aposentado NAO pode ser enviado | 🔴 caiu | × recusa modelo em estado "rascunho" · × recusa modelo em estado "pausado" · × recusa modelo em estado "aposentado" · × nenhum dos 22 modelos M01–M22 é entregável hoje — a casa não |
| `biblioteca/placeholder-remanescente` | placeholder nao preenchido no texto final BLOQUEIA | 🔴 caiu | × bloqueia quando sobra placeholder não declarado no texto final · × bloqueia quando variável opcional fica sem valor e o placeholder sobra · × uma variável com valor hostil ("{{ou |
| `anti-generico/variavel-generica` | variavel preenchida com frase generica BLOQUEIA | 🔴 caiu | × bloqueia variável preenchida com frase genérica de catálogo, nomeando a frase · × bloqueia a frase genérica mesmo com acento/caixa diferentes ou embutida em frase maior · × bloqu |
| `anti-generico/texto-identico` | texto identico a um ja enviado BLOQUEIA (impressao digital) | 🔴 caiu | × bloqueia texto IDÊNTICO a um já enviado, por impressão digital · × bloqueia mesmo com diferença só de acento, caixa e espaço (a impressão normaliza) |
| `anti-generico/texto-parecido` | texto so com o nome trocado BLOQUEIA (similaridade por trigrama) | 🔴 caiu | × bloqueia texto QUASE idêntico — só o nome do cliente foi trocado |
| `entrada-hostil/envelope` | texto do cliente sai delimitado e marcador forjado e neutralizado | 🔴 caiu | × 2) o texto sai DELIMITADO, e a tentativa de fechar o envelope na marra FALHA |
| `trava-de-conversa/reserva-atomica` | segundo agente na mesma conversa e BARRADO | 🔴 caiu | × bloqueia o segundo agente e nomeia o primeiro |
| `trava-de-conversa/mensagem-duplicada` | mensagem identica a ultima enviada BLOQUEIA | 🔴 caiu | × bloqueia texto idêntico à última enviada, mesmo com caixa/espaço diferentes · × libera quando uma conferência bloqueia |
| `trava-de-conversa/pergunta-repetida` | pergunta ja feita alem do limite BLOQUEIA | 🔴 caiu | × bloqueia depois de passar do LIMITE_DE_INSISTENCIA |
| `objecoes/sem-autorizacao` | concessao sem autorizacao registrada BLOQUEIA (fail closed) | ⚠️ **CONTINUOU VERDE** | (sem linha de falha capturada) |
| `objecoes/maquina-nao-se-aprova` | autorizacao com autor sistema/ia/agente ou sem referencia BLOQUEIA | 🔴 caiu | × CRITÉRIO 3 — autoautorização ("sistema") ⇒ BLOQUEADA · × CRITÉRIO 3 — autoautorização ("ia") ⇒ BLOQUEADA · × CRITÉRIO 3 — autoautorização ("agente") ⇒ BLOQUEADA · × CRITÉRIO 3 —  |
| `objecoes/piso-do-motor` | desconto autorizado ainda assim passa pelo piso do motor de precos | 🔴 caiu | × CRITÉRIO 4 — desconto autorizado mas ABAIXO do piso do motor ⇒ BLOQUEADO · × item fora da tabela ⇒ BLOQUEADO — sem piso conhecido não existe autorização |
| `objecoes/sem-autorizacao (no ponto certo)` | CRITERIO 5 do CEO: desconto/concessao sem autorizacao registrada e BLOQUEADO | 🔴 caiu | × CRITÉRIO 2 — desconto sem autorização registrada ⇒ BLOQUEADO (o padrão) · × autorização de OUTRA concessão não vale para esta ⇒ BLOQUEADO · × CRITÉRIO 3 — autoautorização ("siste |
| `compromisso/dono-humano` | CRITERIO 6: promessa com dono sistema/ia/agente/vazio e BLOQUEADA | 🔴 caiu | × dono AUSENTE (null) ⇒ BLOQUEIO · × dono "sistema" ⇒ BLOQUEIO · × dono "ia" ⇒ BLOQUEIO · × dono vazio (string em branco) ⇒ BLOQUEIO |
| `compromisso/prazo-futuro` | prazo no passado e BLOQUEADO | 🔴 caiu | × prazo NO PASSADO ⇒ BLOQUEIO |
| `compromisso/reconhece-a-data` | o defeito de 29/08: promessa de data em primeira pessoa e RECONHECIDA | 🔴 caiu | × reconhece as formas da ordem do CEO combinadas com verbo de entrega · × acha DUAS promessas quando o texto tem duas sentenças com compromisso · × compõe com o irmão de 27/08: ver |
| `compromisso/registra-antes-de-liberar` | CRITERIO 6: falha ao registrar ⇒ o texto NAO sai (o defeito de 29/08) | 🔴 caiu | × FALHA ao registrar ⇒ o texto NÃO sai · × DUAS promessas, a segunda falha ⇒ nada sai, mesmo a primeira tendo sido registrada |
## O achado da rodada: uma guarda que NÃO derrubou o teste

A primeira mutação de `objecoes/sem-autorizacao` afrouxou
`if (autorizacoes.length === 0)` e **a suíte continuou verde** — 53 testes
passando com a guarda desligada.

Não era trava decorativa: era **guarda redundante**. Com a lista de autorizações
vazia, o filtro seguinte (`paraEstaConcessao.length === 0`) barra do mesmo
jeito. O comportamento que o CEO exigiu continuava protegido; o que a mutação
provou é que aquela linha específica não é a que segura.

Foi refeita **no ponto certo** — forjando uma autorização inteira dentro da
função, que é o desenho do ataque real ("a máquina se aprova"). Aí caiu, com
os testes dos critérios 2 e 3 do CEO junto.

**Por que isto vai escrito, e não apagado:** uma tabela só com 🔴 é uma tabela
que ninguém acredita. A mutação que continuou verde é o único dado que prova
que o método está medindo alguma coisa.

## O que esta rodada NÃO cobre — e é preciso saber antes de confiar nela

- **A mutação prova que a trava reage; não prova que a régua está certa.** Que
  "até amanhã" é promessa e "preciso até amanhã" não é continua sendo julgamento
  humano, escrito em teste.
- **`__tests__/celula/trava-de-promessa.test.ts` só ficou verde depois de um
  conserto.** Na primeira entrega, `promessasDeData` **não reconhecia "até
  amanhã"** — `\b` em JavaScript é ASCII, e depois de "ã" seguido de espaço ou
  ponto não existe fronteira de palavra, então o padrão nunca casava. A frase
  mais óbvia de promessa em português passava batido pela trava construída
  justamente para o defeito de 29/08. Foi achado pelo portão, não pela leitura.
- **`__tests__/celula/perguntas-por-servico.test.ts` idem:** 19 de 73 testes
  vermelhos na primeira entrega, porque o JSON reescrevia com outras palavras
  perguntas que já existiam em `lib/agency/comercial/pergunta-repetida.ts`.
  A mesma pergunta com dois textos é a mesma pergunta feita duas vezes.
- **Duas entregas de seis vieram com trava furada.** Não é acidente: é a razão
  de o portão ser do PM e não do especialista. Especialista que confere o
  próprio trabalho confere o que ele achou que escreveu.
