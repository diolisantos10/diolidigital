# Ficha de departamento — Design e Produção Criativa (`design`)

> Blocos COMUNS às funções deste departamento (regra da casa: não se copia, se
> aponta). Cada função tem ficha própria nesta pasta apontando para cá. Fonte
> de verdade estrutural: `architecture.manifest.json` + `02-DEPARTAMENTOS-E-AGENTES.md`
> — o teste `fichas-da-linha.test.ts` reprova função de catálogo sem ficha.

## Bloco 1 — Missão do departamento

**Transformar estratégia e marca em peças visuais e audiovisuais.** Entrega ao próximo da esteira: arquivos versionados, formatos finais, fontes e vínculo com briefing/brand rules.

## Risco de referência

Alto — a peça chega ao cliente pagante (allowlist na escada). O risco individual de cada função está na ficha dela; o
dono de negócio (CEO) ajusta quando quiser.

## A hierarquia, para não restar dúvida

```
CEO → Diretor → Gerente Geral → **Gerente de Design e Produção Criativa** (`manager-design`) → funções desta pasta
```

Toda demanda deste departamento entra pelo **Gerente de Design e Produção Criativa**, que recebe do Gerente
Geral e distribui aqui dentro. Nenhuma função desta pasta recebe demanda
de fora nem fala com o cliente.

## Blocos comuns (4 a 14) — valem para toda função desta pasta

- **Base (4):** briefing e material do cliente vencem tudo; afirmação sem fonte
  não entra; biblioteca de plataforma capturada quando o domínio exige.
- **Método (5):** fluxo cognitivo de 12 passos do Brain; os passos 3 e 4 (o que
  sei · o que não sei) são obrigatórios e honestos.
- **Saída (6):** entregável rastreável, com `qualityGateResult` e trace — canvas
  sem rastro é inauditável.
- **Ferramentas (7):** contexto mínimo da tarefa; escrita externa só com parecer
  do especialista-trava; ação irreversível só com aprovação prevista no fluxo.
- **Memória (8):** dado de cliente NUNCA cruza clientes; PII fora de log e snapshot.
- **Atualização (9):** função nasce DESLIGADA no catálogo; ligar/expor é decisão
  registrada (escada). Ficha muda → catálogo/prompt reconferido na mesma sessão.
- **Avaliação (11):** golden set por função é lacuna declarada da casa; a régua
  vigente são os portões da Qualidade e os cenários do 07-CRITERIOS.
- **Governança (14):** registro humano/IA obrigatório em toda execução
  (ExecucaoV2 — ator, modelo, versão, custo, data, ferramentas).

## Bloco 15 — A RÉGUA DE QUALIDADE VISUAL

> Criado em 25/08/2026, por ordem do CEO, depois de ele reprovar peças e
> perguntar: *"tem ou não tem como melhorar a ficha desses designers?"*. Vale
> para toda função desta pasta e é **apontado, nunca copiado**.

### Por que este bloco precisou existir

O raio-x de 25/08 mediu as **catorze** métricas de sucesso deste departamento e
do de Qualidade. Elas medem formato de arquivo, kit completo, versão não
perdida, spec de plataforma, alegação sustentada, incidente evitado.

**Nenhuma delas mede se a peça é boa de olhar.**

E isso não foi descuido: o agente que confere marca tem escrito na própria ficha
que julga *"contra regra registrada, nunca gosto"*. A casa decidiu, por escrito,
não ter opinião sobre estética — e depois estranhou que a peça saísse feia.

Um agente só melhora naquilo em que ele **pode falhar**. Até aqui não existia,
em lugar nenhum da linha, uma forma de ele falhar em design.

Este bloco não pede bom gosto. Pede o que **se confere olhando a peça** — que é
a única forma de uma régua estética virar portão em vez de conselho.

### As oito travas (conferíveis, não opináveis)

| # | Trava | Como se confere |
|---|---|---|
| 1 | **No máximo duas famílias tipográficas**, e vindas da marca declarada | conta as famílias no molde; sem marca declarada a família é neutra — nunca "combina com o segmento" |
| 2 | **Uma mensagem por peça** | duas manchetes disputando o olho = nenhuma manchete |
| 3 | **Texto sobre foto só com contraste MEDIDO** | o valor sai de conta sobre o pixel do fundo, nunca do olho de quem fez |
| 4 | **Centralizar é escolha declarada**, não o que sobra | a composição vem nomeada na peça; "tudo no meio" por omissão é o cheiro nº 1 de template |
| 5 | **Fundo é foto, não desenho** | portão de pixel (`portao-do-fundo.ts`), medido no fundo CRU — na peça composta a diferença cai de 29× para 1,2× |
| 6 | **Manchete de feed: no máximo 8 palavras** | conta as palavras |
| 7 | **Zero efeito decorativo** | sombra dura, degradê de arco-íris, borda 3D, brilho, contorno em texto — lista fechada |
| 8 | **Imagem nunca esticada fora de proporção** | compara a proporção da fonte com a do quadro |

### A regra dura: o agente OLHA a própria peça

**Peça não vista não é entregue.** Antes do handoff a função renderiza o
resultado e o examina contra as oito travas acima, e o veredito de cada uma
entra no rastro da execução.

Não é firula. Hoje o agente escreve a peça e **nunca vê o que saiu** — é
desenhar de olhos fechados e mandar pelo correio. É a mudança mais barata deste
bloco e a que mais muda o resultado.

### A medida que vale, e por que é essa

`peças aprovadas de primeira` é fraca sozinha: sobe quando o porteiro afrouxa. A
que interessa é a outra —

> **quantas peças o CEO reprovou DEPOIS de a casa ter aprovado.**

Esse número não mede o designer: mede a **calibragem do porteiro**. Se ele sobe,
o conserto é na régua, não em quem executa. É o único jeito de a casa aprender o
gosto do dono em vez de discutir sobre ele.

Enquanto não houver peça medida, o valor é **"não medido", com o motivo escrito**
— nunca zero. Zero afirma "nenhuma reprovada", que é bem diferente de "ninguém
olhou".

### O que este bloco NÃO faz

Não liga função nenhuma, não altera `ativa` e não substitui os portões da
Qualidade. Ele é a **régua**; o portão que a aplica é decisão de ativação do
dono, registrada na escada — nunca efeito de deploy.

## Funções desta pasta

| Função | Nome | Risco proposto |
|---|---|---|
| `manager-design` | Gerente de Design e Produção Criativa | Médio |
| `creative-director` | Agente Diretor Criativo | Médio |
| `graphic-designer` | Agente Designer Gráfico | Alto |
| `motion-designer` | Agente Motion Designer | Médio |
| `video-editor` | Agente de Vídeo e Edição | Médio |
| `adaptation-and-resizing` | Agente de Adaptação e Desdobramento | Baixo |
| `creative-library` | Agente de Biblioteca Criativa | Baixo |
