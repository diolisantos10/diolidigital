# Mutação da Onda 2 — o motor conversacional da Célula de Prospecção

> **Guarda sem mutação rodada já falhou seis vezes nesta casa em dois dias.**
> Cada trava desta onda foi AFROUXADA de propósito, o teste foi rodado, e só
> conta como trava a que ficou **VERMELHA** — e vermelha **pelo motivo certo**,
> não por um motivo qualquer. Depois de cada rodada o arquivo foi restaurado e o
> sha256 conferido: **`restaurado: true` nas 31**.

**31 mutações · 30 caíram · 1 continuou verde (investigada e refeita no ponto
certo, ver adiante).**

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
| `biblioteca/estado-aprovado` | modelo em rascunho, pausado ou aposentado NAO pode ser enviado | 🔴 caiu | × recusa modelo em estado "rascunho" · × recusa modelo em estado "pausado" · × recusa modelo em estado "aposentado" · × nenhum dos 22 modelos M01–M22 é entregável hoje —  |
| `biblioteca/placeholder-remanescente` | placeholder nao preenchido no texto final BLOQUEIA | 🔴 caiu | × bloqueia quando sobra placeholder não declarado no texto final · × bloqueia quando variável opcional fica sem valor e o placeholder sobra · × uma variável com valor hos |
| `anti-generico/variavel-generica` | variavel preenchida com frase generica BLOQUEIA | 🔴 caiu | × bloqueia variável preenchida com frase genérica de catálogo, nomeando a frase · × bloqueia a frase genérica mesmo com acento/caixa diferentes ou embutida em frase maior |
| `anti-generico/texto-identico` | texto identico a um ja enviado BLOQUEIA (impressao digital) | 🔴 caiu | × bloqueia texto IDÊNTICO a um já enviado, por impressão digital · × bloqueia mesmo com diferença só de acento, caixa e espaço (a impressão normaliza) |
| `anti-generico/texto-parecido` | texto so com o nome trocado BLOQUEIA (similaridade por trigrama) | 🔴 caiu | × bloqueia texto QUASE idêntico — só o nome do cliente foi trocado |
| `entrada-hostil/envelope` | texto do cliente sai delimitado e marcador forjado e neutralizado | 🔴 caiu | × 2) o texto sai DELIMITADO, e a tentativa de fechar o envelope na marra FALHA |
| `trava-de-conversa/reserva-atomica` | segundo agente na mesma conversa e BARRADO | 🔴 caiu | × bloqueia o segundo agente e nomeia o primeiro |
| `trava-de-conversa/mensagem-duplicada` | mensagem identica a ultima enviada BLOQUEIA | 🔴 caiu | × bloqueia texto idêntico à última enviada, mesmo com caixa/espaço diferentes · × libera quando uma conferência bloqueia |
| `trava-de-conversa/pergunta-repetida` | pergunta ja feita alem do limite BLOQUEIA | 🔴 caiu | × bloqueia depois de passar do LIMITE_DE_INSISTENCIA |
| `objecoes/sem-autorizacao` | concessao sem autorizacao registrada BLOQUEIA (fail closed) | ⚠️ **CONTINUOU VERDE** | (sem linha de falha capturada) |
| `objecoes/maquina-nao-se-aprova` | autorizacao com autor sistema/ia/agente ou sem referencia BLOQUEIA | 🔴 caiu | × CRITÉRIO 3 — autoautorização ("sistema") ⇒ BLOQUEADA · × CRITÉRIO 3 — autoautorização ("ia") ⇒ BLOQUEADA · × CRITÉRIO 3 — autoautorização ("agente") ⇒ BLOQUEADA · × CRI |
| `objecoes/piso-do-motor` | desconto autorizado ainda assim passa pelo piso do motor de precos | 🔴 caiu | × CRITÉRIO 4 — desconto autorizado mas ABAIXO do piso do motor ⇒ BLOQUEADO · × item fora da tabela ⇒ BLOQUEADO — sem piso conhecido não existe autorização |
| `objecoes/sem-autorizacao (no ponto certo)` | CRITERIO 5 do CEO: desconto/concessao sem autorizacao registrada e BLOQUEADO | 🔴 caiu | × CRITÉRIO 2 — desconto sem autorização registrada ⇒ BLOQUEADO (o padrão) · × autorização de OUTRA concessão não vale para esta ⇒ BLOQUEADO · × CRITÉRIO 3 — autoautorizaç |
| `compromisso/dono-humano` | CRITERIO 6: promessa com dono sistema/ia/agente/vazio e BLOQUEADA | 🔴 caiu | × dono AUSENTE (null) ⇒ BLOQUEIO · × dono "sistema" ⇒ BLOQUEIO · × dono "ia" ⇒ BLOQUEIO · × dono vazio (string em branco) ⇒ BLOQUEIO |
| `compromisso/prazo-futuro` | prazo no passado e BLOQUEADO | 🔴 caiu | × prazo NO PASSADO ⇒ BLOQUEIO |
| `compromisso/reconhece-a-data` | o defeito de 29/08: promessa de data em primeira pessoa e RECONHECIDA | 🔴 caiu | × reconhece as formas da ordem do CEO combinadas com verbo de entrega · × acha DUAS promessas quando o texto tem duas sentenças com compromisso · × compõe com o irmão de  |
| `compromisso/registra-antes-de-liberar` | CRITERIO 6: falha ao registrar ⇒ o texto NAO sai (o defeito de 29/08) | 🔴 caiu | × FALHA ao registrar ⇒ o texto NÃO sai · × DUAS promessas, a segunda falha ⇒ nada sai, mesmo a primeira tendo sido registrada |
| `motor/responde-antes-de-perguntar` | REGRA LITERAL DO CEO: a mensagem primeiro RESPONDE ao cliente e so depois pergunta | 🔴 caiu | × devolve enviar, com uma pergunta só, texto conforme e nada bloqueado · × o índice de `resposta` dentro de `texto` é menor que o índice de `pergunta` · × um sinal de inj |
| `motor/cliente-perguntou-e-nao-foi-respondido` | CRITERIO 2: pergunta direta do cliente sem resposta ⇒ BLOQUEADO | 🔴 caiu | × bloqueia em vez de ignorar o cliente e perguntar outra coisa · × libera quando a conversa não é encontrada depois de reservada |
| `motor/uma-pergunta-so` | CRITERIO 3 do CEO: duas perguntas na mesma mensagem ⇒ BLOQUEADO | 🔴 caiu | × bloqueia quando a RESPOSTA já contrabandeia uma segunda pergunta |
| `motor/guardiao-no-texto-final` | conteudo proibido pela plataforma no texto final ⇒ BLOQUEADO | 🔴 caiu | × MOCK DO CATÁLOGO — com uma objeção de teste cuja respostaAprovada viola o Guardião, a porta 1 BLOQUEIA de verdade · × bloqueia quando é a PERGUNTA, não a resposta, que  |
| `motor/anti-generico-no-caminho` | CRITERIO 6: texto repetido ou generico ⇒ BLOQUEADO tambem pelo motor | 🔴 caiu | × bloqueia um texto final IDÊNTICO a um já enviado para outro contato |
| `motor/compromisso-no-caminho` | CRITERIO 7: promessa de data sem compromisso registrado ⇒ BLOQUEADO no motor | 🔴 caiu | × bloqueia quando o texto promete data e não há dono/prazo para registrar |
| `motor/concessao-sem-autorizacao` | CRITERIO 5: objecao de preco sem autorizacao ⇒ ESCALA, nunca desconto | 🔴 caiu | × escala em vez de conceder desconto sozinha |
| `motor/modelo-aprovado` | CRITERIO 8: modelo em rascunho/pausado/aposentado nao e escolhido pelo motor | 🔴 caiu | × um modelo em rascunho não é escolhido — o motor escala, não improvisa texto |
| `motor/reserva-da-conversa` | a trava de conversa segura o segundo agente tambem no motor | 🔴 caiu | × libera quando a conversa está ocupada por outro agente (esperar) |
| `biblioteca/segundo-cinto-pendencia` | Ficha J: modelo com pendencia declarada nao preenche | 🔴 caiu | × bloqueia quando o modelo tem pendência declarada, mesmo estando aprovado |
| `biblioteca/textoBase-vazio-sem-justificativa` | textoBase vazio sem pendencia = campo obrigatorio faltando | 🔴 caiu | × bloqueia textoBase vazio sem pendencia explicando o motivo |
| `guardiao/me-segue-no-perfil` | Ficha I: direcionar o cliente para um perfil FORA da plataforma e barrado | 🔴 caiu | × BARRA a ação de direcionar o cliente para fora, mesmo sem o nome da rede sozinho disparando |
| `guardiao/meu-perfil-no` | Ficha I: 'meu perfil no ___' e barrado | 🔴 caiu | × BARRA a ação de direcionar o cliente para fora, mesmo sem o nome da rede sozinho disparando |
| `biblioteca/segundo-cinto-estado` | Ficha J: preencher() confere estado por conta propria, nao confia em quem chama | 🔴 caiu | × bloqueia quando chamado direto com modelo em estado "rascunho", mesmo com variáveis corretas · × bloqueia quando chamado direto com modelo em estado "pausado", mesmo co |
## Os três achados desta rodada — e é para isto que a mutação serve

### 1. Uma guarda que NÃO derrubou o teste, e era redundância
A primeira mutação de `objecoes/sem-autorizacao` afrouxou
`if (autorizacoes.length === 0)` e **a suíte continuou verde** — 53 testes
passando com a guarda desligada.

Não era trava decorativa: era **guarda redundante**. Com a lista vazia, o filtro
seguinte (`paraEstaConcessao.length === 0`) barra do mesmo jeito. O
comportamento que o CEO exigiu continuava protegido; o que a mutação provou é
que aquela linha específica não é a que segura. Foi refeita **no ponto certo** —
forjando uma autorização inteira dentro da função, que é o desenho do ataque
real ("a máquina se aprova"). Aí caiu, com os critérios 2 e 3 do CEO junto.

### 2. 🔴 O Guardião do MOTOR não era testado por ninguém
Rodada a mutação em `proxima-mensagem.ts`, oito das nove guardas caíram. Uma não:

```
FALHA motor/guardiao-no-texto-final — Tests 19 passed (19)
mutação:  if (!conformidade.ok)  →  if (false)
```

Dava para **desligar o Guardião dentro do motor** e a suíte inteira continuava
verde. E isso importa mais aqui do que em qualquer outra etapa: `preencher` já
valida o texto do MODELO, mas o motor **monta um texto novo** — `resposta` +
`pergunta` — e dois dos três pedaços nunca passaram por `validarTexto` antes:

```
318:  respostaBase = objecao.respostaAprovada;   ← nunca validada
404:  const pergunta = formatarPergunta(...)     ← nunca validada
```

A primeira tentativa de conserto **também falhou**, e falhou de um jeito que
merece registro: os testes novos injetaram a violação **pelo modelo**, então ela
morria na etapa `preencher_modelo` e a etapa `guardiao` nunca chegava a ver o
texto. Os testes provavam que a casa é segura — não provavam a linha apontada.
Só na terceira rodada, entrando pela porta da objeção e pela porta da pergunta,
a guarda caiu. **A distância entre "o conteúdo foi bloqueado" e "esta trava
bloqueou o conteúdo" é a distância entre sorte e mecanismo.**

### 3. O afrouxamento do Guardião compartilhado tinha um meio-termo aberto
`instagram`, `insta` e `linkedin` foram tirados da regra `dado_de_contato`
porque *"12 posts para Instagram"* é o produto central desta casa e disparava
falso positivo. Correto — mas trocou régua larga demais por estreita demais numa
tacada só. O laudo do `qualidade` achou o vão com frase concreta:

| frase | antes do conserto | agora |
|---|---|---|
| `"meu instagram é @diolidigital"` | barrada (pelo `@handle`) | barrada |
| `"me segue no insta"` | ❌ **passava** | 🔒 barrada |
| `"meu perfil no linkedin"` | ❌ **passava** | 🔒 barrada |
| `"12 posts para Instagram"` | passa (correto) | passa (correto) |

A régua nova barra **a ação de mandar o cliente para fora**, não o nome da
plataforma. As duas metades estão travadas por teste.

## O que esta rodada NÃO cobre — antes de confiar nela

- **A mutação prova que a trava reage; não prova que a régua está certa.** Que
  "até amanhã" é promessa e "preciso até amanhã" não é continua sendo julgamento
  humano, escrito em teste.
- **Três de sete entregas vieram com trava furada, e o portão pegou as três:**
  - `promessasDeData` **não reconhecia "até amanhã"** — `\b` em JavaScript é
    ASCII, e depois de "ã" seguido de espaço ou ponto não existe fronteira de
    palavra. A frase mais óbvia de promessa em português passava batido pela
    trava construída justamente para o defeito de 29/08.
  - `perguntas-por-servico.json` reescrevia com outras palavras perguntas que já
    existiam em `lib/agency/comercial/pergunta-repetida.ts` — 19 de 73 testes
    vermelhos. A mesma pergunta com dois textos é a mesma pergunta feita duas vezes.
  - o Guardião do motor, acima.
- **Nenhuma delas foi vista na leitura. Todas foram achadas pelo portão.** É a
  razão de o portão ser do PM e não do especialista: especialista que confere o
  próprio trabalho confere o que ele achou que escreveu.
- **Os 22 modelos M01–M22 têm `textoBase` VAZIO.** A biblioteca inteira está
  provada; o texto do CEO não chegou. Ver `docs/celula-prospeccao/laudo-onda-2.md`.
