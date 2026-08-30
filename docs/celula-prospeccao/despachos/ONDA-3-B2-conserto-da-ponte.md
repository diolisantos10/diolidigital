# DESPACHO B2 — conserto da ponte (agente: `plataforma`)

Você construiu a ponte no despacho B
(`docs/celula-prospeccao/despachos/ONDA-3-B-ponte-de-arquivos.md`). O portão do
PM passou (158 testes, `tsc` limpo), **mas a auditoria do `qualidade` reprovou a
ficha B** e a inspeção do PM achou um quinto problema. Quatro consertos, todos
seus. Nada aqui é opinião: cada item cita o que a SUA ficha pedia.

## SEUS ARQUIVOS — e só eles
`lib/agency/celula/ponte/*.ts` · `__tests__/celula/ponte-*.test.ts`

**NÃO toque:** `prisma/schema.prisma` (já está pronto e commitado — os campos de
que você precisa JÁ EXISTEM lá), `funil.ts`, `trilha.ts`,
`lib/agency/celula/excecoes/**`, `lib/agency/celula/mensagens/**`,
`lib/agency/media/armazenamento.ts`, nada de outra frente.
**NÃO rode `npm`/`npx`/`node`/`git`.** O PM roda o portão.

---

## 🔴 CONSERTO 1 — CARACTERE DE CONTROLE CRU NO CÓDIGO-FONTE (achado do PM)

`lib/agency/celula/ponte/quarentena.ts` contém, **como bytes crus**, dentro da
classe de caracteres da regex `CARACTERE_DE_CONTROLE_PERIGOSO_NO_NOME` e também
dentro de comentários:

- **2 NUL bytes** (o ponto de código zero), e
- os **caracteres de sobrescrita e isolamento de direção** (a faixa de
  sobrescrita bidirecional e a faixa de isolamento bidirecional do Unicode).

**E o comentário logo acima deles diz o contrário:** *"Escritos como escape `\u`
explícito, de propósito — caractere de controle cru dentro do código-fonte é o
mesmo risco que esta checagem existe para varrer."* O comentário está certo; o
código não obedece a ele. **Comentário que afirma um fato que o código contradiz
é o defeito mais caro desta casa** — foi assim que a M10 da Onda 1 quase passou.

Consequências reais, medidas pelo PM:

- `git diff` do arquivo sai como `Bin 8659 -> 8636 bytes`. **Ninguém consegue
  revisar o arquivo por diff** — e revisão por diff é a única que esta casa tem.
- Caractere de sobrescrita de direção em código-fonte reordena visualmente a
  linha em editor e em revisor de PR: o que se lê não é o que o compilador vê.
- A ferramenta de despacho do próprio PM **recusou** transportar o trecho, por
  conter caractere de controle. Isso é uma terceira confirmação independente.

**Conserte:** todo caractere de controle passa a ser **escape `\u` explícito**
(o escape do ponto de código, escrito com barra invertida e `u`), tanto no regex
quanto nos comentários. O arquivo tem que voltar a ser **texto legível**, sem um
único byte de controle cru. O comportamento do regex **não muda** — os testes
existentes continuam verdes exatamente como estão, e é assim que você prova que
o conserto é só de forma.

**Acrescente um teste** que lê o próprio arquivo-fonte e falha se ele contiver
byte de controle cru (padrão de varredura por regex de
`__tests__/celula/trilha-e-append-only.test.ts`). Sem gate = reprovado: sem
teste, o próximo editor reintroduz o problema e ninguém vê.

---

## 🔴 CONSERTO 2 — ARMAZENAMENTO PRIVADO: o byte nunca é gravado

Laudo do `qualidade`: `armazem.ts` recebe `bytes: Buffer`, calcula sha256 e
**nunca grava byte nenhum**. `grep` por `guardarArquivo|writeFile|node:fs` em
`lib/agency/celula/ponte/` devolve **zero**. Pior: `caminhoInterno` é aceito como
**string crua vinda de fora** — o oposto do que a sua ficha mandou reaproveitar
(*"caminho derivado do id, nunca do nome que o cliente enviou"*, que é o que mata
travessia de diretório por construção em `lib/agency/media/armazenamento.ts`).

"Armazenamento privado" era **obrigatório da sua ficha**, e não virou código nem
lacuna declarada.

**Conserte. Há duas saídas legítimas — escolha uma e ESCREVA QUAL:**

- **(a)** derivar `caminhoInterno` do id dentro do armazém (nunca aceitar de
  fora) **e** gravar o byte reaproveitando `lib/agency/media/armazenamento.ts`
  — sem editar aquele arquivo; ou
- **(b)** se a escrita do byte for grande demais para esta onda, **pelo menos**
  derive `caminhoInterno` do id (nunca de fora, nunca do nome enviado) e declare
  a escrita do byte como **LACUNA DECLARADA** em comentário, com todas as letras.

**O que NÃO é aceitável é o estado de hoje:** caminho vindo de fora, sem trava e
sem lacuna declarada. Se escolher (b), o teste tem que provar que um
`caminhoInterno` malicioso vindo de fora **não é usado**.

---

## 🔴 CONSERTO 3 — RETENÇÃO CONFIGURÁVEL: campo existe, ninguém escreve nele

`retencaoAteEm` está no schema e **nenhuma função a define ou a aceita**.
Retenção era obrigatório da sua ficha.

**Conserte:** o registro de arquivo aceita retenção (por parâmetro, com default
vindo de variável de ambiente ou de constante nomeada — **não número mágico no
meio do código**) e a grava. `null` significa **"sem prazo declarado"**, e isso é
diferente de "para sempre": escreva essa distinção no comentário, porque é
exatamente o tipo de silêncio que vira dado guardado para sempre por engano.
Quem EXECUTA o expurgo não existe nesta onda — isso é **lacuna declarada**, e
tem que estar escrito.

---

## 🔴 CONSERTO 4 — HISTÓRICO DE DOWNLOAD: o tipo de evento existe, nada o grava

`EventoDoArquivoDaCelula.tipo` documenta `"download"`; **nenhum `.create` grava
esse tipo** e não existe função de download na pasta. "Histórico de download e
envio" era obrigatório da sua ficha — o de envio existe, o de download não.

**Conserte:** uma função que registra o download pelo operador (append-only,
como as outras), gravando quem baixou, quando e qual arquivo. Ela **não lê byte
nem serve arquivo** — só registra o fato. Teste com as duas metades.

---

## CRITÉRIO DE ACEITE

1. `quarentena.ts` é texto legível, sem byte de controle cru, com teste que trava.
2. `caminhoInterno` **nunca** vem de fora — derivado do id, com teste.
3. Retenção aceita e gravada; expurgo declarado como lacuna.
4. Download registrado na trilha append-only, com as duas metades.
5. Os 158 testes que já passavam continuam passando — **não afrouxe nenhum**.
6. Todo obrigatório da ficha B que continuar sem código sai daqui com
   **"LACUNA DECLARADA"** escrito em comentário. Lacuna declarada é informação;
   lacuna omitida é o que o `qualidade` chamou de reprovação.

## ENTREGA

Bullets: o que consertou · qual saída escolheu no conserto 2 e por quê · o que
continua sendo lacuna, com todas as letras · o que pode falhar no `tsc`.
