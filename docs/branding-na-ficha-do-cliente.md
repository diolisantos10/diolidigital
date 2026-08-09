# A aba de Marca na ficha do cliente

> Pedido do CEO em 09/08/2026, no mesmo dia em que aprovou o `branding` como
> sexto Essencial. Palavras dele:
>
> *"Em cada ficha do cliente precisa ter uma aba dedicada exclusivamente para
> Branding, com todos os campos preenchidos sobre branding avançado. Se não
> tiver, mandar um formulário super fácil e prático para o cliente responder."*

---

## Por que isto vem ANTES do agente

O agente de branding não inventa a marca — ele **faz valer** o que foi
declarado. Sem ficha preenchida ele não tem o que ler, e um portão sem régua ou
aprova tudo ou reprova por gosto. **Os dois modos são o mesmo defeito.**

É também a resposta prática à pergunta que foi ao Conselho — *"o que ele faz com
marca que ainda não tem regra nenhuma?"*. A resposta de produto é esta: **não
espera. Vai buscar.**

---

## As três partes, e nenhuma funciona sozinha

### 1. A aba existe e mostra o vazio como vazio

Uma aba **Marca**, na ficha do cliente, dos dois lados — painel da agência e
portal do cliente, a mesma verdade.

**A regra dura:** campo não preenchido aparece como **"não informado"**, nunca
como `0`, nunca como espaço em branco, nunca como um traço que se confunde com
"tudo certo". Um campo vazio desenhado igual a um campo preenchido é a tela
mentindo por omissão — o defeito central do raio-X de 08/08.

E a aba mostra, no topo, **quantos campos faltam** e **o que a falta impede**:
*"faltam 4 · sem eles a peça sai sem régua de marca."*

### 2. O que é "branding avançado" — os campos

> ⚠️ **Lista provisória.** O esquema definitivo é a **pergunta 1 do briefing ao
> Conselho** (kit, doutrina 26a): *qual é o esquema mínimo de uma marca.* Esta
> lista é o que a casa já sabe que falta, para não ficar parada esperando — e é
> substituída pelo que o Conselho devolver.

O que existe hoje no `BrandBrain` são **11 campos de texto**: nome, tagline, cor
primária, cor secundária, tipografia, tom, valores, público, posicionamento. É
**identidade declarada**. Falta tudo o que julga uma peça:

| Bloco | Campos | Por que muda uma decisão |
|---|---|---|
| **Proibições** | o que a marca **nunca** faz — em imagem, em palavra, em promessa | É o único bloco que permite **reprovar citando regra**. Sem ele, toda devolução vira gosto. |
| **Referência visual** | peças que a marca considera certas, e **peças que considera erradas** | O contra-exemplo ensina mais que o exemplo. Hoje não há onde guardar nenhum dos dois. |
| **Vocabulário** | como se escreve o nome · palavras que usa · palavras banidas | Nome escrito errado é o erro mais visível que existe, no ativo mais permanente do cliente. |
| **Prova** | números que pode afirmar, e a fonte de cada um | Fecha com o `qualidade`: sem fonte, a peça não pode afirmar. |
| **Limites de uso do logo** | fundo mínimo, o que não se faz com ele | O material chega em vetor e ninguém declara como usá-lo. |
| **Concorrente-referência** | com quem **não** quer ser confundida | Direção negativa é a mais fácil de o cliente responder e a mais útil na produção. |

### 3. Faltou campo → o formulário sai sozinho

**Não é uma tela que espera alguém lembrar de mandar.** Campo obrigatório vazio
por mais de X dias vira aviso, e o aviso usa a máquina que já existe
(`lib/agency/esteira/avisos.ts`), que **envia automático** e só cai na fila de
exceção quando não consegue.

**Como o formulário tem que ser, porque o cliente não é da área:**

- **link, sem instalar nada, sem criar conta** — abre no navegador do celular;
- **uma pergunta por tela**, em português de gente: não *"defina seu tom de
  voz"*, e sim *"como você NÃO quer soar? (formal demais, engraçadinho, apelão)"*;
- **pergunta fechada sempre que possível** — escolher é mais fácil que escrever,
  e responde mais gente;
- **"não sei" é resposta válida e visível.** Forçar a adivinhar é o que faz o
  cliente abandonar no meio ou responder qualquer coisa — e resposta qualquer é
  pior que campo vazio, porque vira regra falsa;
- **salva a cada resposta.** Ele responde 3 de 10 no ponto de ônibus e volta
  depois;
- **mostra o que já foi respondido**, para ele não recomeçar do zero.

---

## A trava que decide se isto vale alguma coisa

**O que for preenchido tem que CHEGAR a quem produz.** Hoje o cérebro de marca
guarda 11 campos e o produtor recebe **7 linhas** — a diferença é campo guardado
que ninguém lê, ou seja, decoração.

> **Critério de pronto desta obra:** um campo novo preenchido na aba precisa
> aparecer, no mesmo dia, dentro do que o produtor recebe. Se não aparece, a aba
> não está pronta — está bonita.

---

## Ordem de execução

1. **A aba, com os campos vazios declarados como vazios.** Sozinha já melhora:
   torna visível o que hoje é invisível.
2. **O produtor recebendo os campos novos.** Sem isso o resto é enfeite.
3. **O formulário automático** para o cliente preencher o que falta.
4. **O agente `branding` lendo tudo isso** — só depois, e com a constituição que
   o Conselho devolver.
