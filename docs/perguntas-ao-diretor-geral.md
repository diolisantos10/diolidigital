# Perguntas ao Diretor Geral do Cérebro

> O que o PM desta casa **não decide sozinho**. Cada item traz o que já foi
> decidido, o que ficou em aberto e por que a decisão não é daqui.
>
> Regra: decisão que serve a **mais de um projeto** não se escreve no
> `dioli-brain-kit` por conta própria. Propõe-se aqui e escala.

---

## 1. O `CLAUDE.md` desta casa ainda lista o elenco antigo

**Estado:** os cinco Essenciais entraram (07/08/2026), `experiencia` e
`seguranca` existem, `interface` e `plataforma` foram reduzidos ao papel certo.
**A tabela de especialistas do `CLAUDE.md` não foi atualizada.**

**Por que não atualizei:** `CLAUDE.md` é configuração de sessão, carregada em
toda conversa e acima da minha camada. Alterá-lo por despacho é o PM mudando as
próprias regras — exatamente o `agentsCanMutateBrain: false` que o kit veda.

**O que precisa acontecer:** o Diretor acrescenta ao `CLAUDE.md` (a) a linha do
`experiencia` e a do `seguranca` na tabela de especialistas, (b) a nota de que
`qualidade` e `experiencia` são somente leitura por construção, e (c) o ponteiro
para `23-constituicao-dos-essenciais.md`.

**Risco enquanto não acontecer:** o Diretor lê o `CLAUDE.md`, não vê
`experiencia` nem `seguranca` na lista, e nunca os despacha. Agente que existe e
ninguém chama é o mesmo que agente que não existe — com o agravante de aparecer
na Sala dos Agentes como se fosse time.

---

## 2. `pm` ficou como especialista de domínio. É isso mesmo?

A doutrina 21 desenha `CEO → Diretor Geral → Diretor do Projeto → especialistas`
e **não prevê uma camada de PM**. Esta casa tem uma, por ordem do CEO de
06/08/2026 (`CEO → Diretor → PM → especialistas`), criada no dia em que um pedido
ficou dois dias parado.

**O que decidi:** `pm` **não** é um Essencial (não está na lista dos cinco) e
**não** foi absorvido por nenhum. Ficou como agente de domínio, área "Direção".

**A pergunta que sobe:** o Diretor Geral quer que a camada de PM vire doutrina —
e portanto entre no kit — ou ela é uma particularidade desta casa? Hoje o
`dioli-brain-kit` e o `CLAUDE.md` desta casa descrevem hierarquias diferentes, e
**duas hierarquias competindo é o próprio defeito das "duas verdades"** que a
constituição corta na tabela de alterações do Conselho.

### ✅ FECHADA em 07/08/2026 — pelo CEO, com as palavras dele

> *"em relação a ter o PM ou não já está decidido — eram erros de comunicação,
> mas eu já havia decidido que todo projeto precisa de um PM. O kit está sendo
> corrigido."*

**O veredito, em uma frase: esta casa estava certa; o kit é que está
desatualizado.** A camada de PM É doutrina — `CEO → Diretor → PM →
especialistas` vale para todo projeto, não é particularidade da Dioli Digital.
Não havia duas verdades competindo: havia uma verdade e uma cópia velha.

**O que NÃO fazer, e é a parte que importa: não mexer no `dioli-brain-kit`.**
A correção é do próprio CEO, no repositório dele. Escrever lá por conta própria
produziria exatamente a divergência que a regra existe para impedir.

**O que continua valendo aqui, sem mudança:** `pm` segue como agente de domínio
na área "Direção" e **não** vira um sexto Essencial. Ser doutrina não é ser
Essencial — são duas listas diferentes, e confundi-las inflaria o elenco que
acabou de ser fechado em cinco.

---

## 3. Três dos quatro degraus que a constituição declara ausentes também faltam aqui

Conferido nesta casa em 07/08/2026, não presumido do Foocci:

| Degrau | Estado na Dioli Digital |
|---|---|
| Registro de auditoria imutável do que os agentes fazem | **não existe.** `AIRunLog` registra chamada de IA de produção, não despacho de especialista |
| Ambiente de teste sem dado real de pessoa | **não existe** — o `seguranca` nasce sem onde testar acesso |
| Métricas de uso acessíveis aos agentes | **parciais** |
| Humano nomeado por projeto, com prazo de resposta | **é o CEO, sem prazo** |

**Consequência concreta e já visível:** o teste dos 90 dias da constituição
("cada Essencial precisa ter feito pelo menos uma vez o gesto que o define")
**não é executável aqui**, porque nada registra despacho. A Sala dos Agentes
mostra isso como lacuna declarada, não como zero.

---

## 4. O achado do Foocci sobre custo por agente **NÃO se aplica a esta casa** — mas há um irmão dele

A doutrina 20 avisa que o registro de interação com IA costuma guardar custo por
conversa e não por agente, e que o conserto **só vale para frente**.

**Conferido aqui: esta casa já está adiante.** `AIRunLog` tem `agentId`,
`clientId`, `tokensEntrada`, `tokensSaida`, `custoEstimadoUsd` **nulável** e
`custoTabela` — acrescentados em 06/08/2026. E `lib/ai/precos.ts` já recusa
fallback silencioso: modelo desconhecido custa `null`, não o preço do `gpt-4o`.

**O irmão do problema, que existe:** a coluna está lá e **a maioria dos pontos
que chamam `generate()` não a preenche**. Medido em 07/08: 38 chamadas a
`generate()` no repositório, **cerca de 10** passando `agentId`. O gasto das
outras entra sem dono.

**A parte que é "só para frente" é esta**, e por isso decidi hoje, não no dia em
que a tela ficar pronta: a Sala **não reparte** o gasto sem dono entre os
agentes (repartir seria inventar quem gastou) e **não o esconde** — ele aparece
como lacuna declarada, com o número de chamadas.

**O que sobe:** fechar a cobertura é trabalho de passar `agentId` em ~28 pontos
de chamada, espalhados por `esteira` e `departamentos`. Precisa de dono e de
prazo, e é decisão de prioridade — não minha.

### ✅ FECHADO em 07/08/2026 — o CEO priorizou, e a cobertura fechou

O dono da medição de custo de IA **é o departamento financeiro** (decisão do CEO
no mesmo dia — ver `docs/decisoes.md`). A cobertura foi fechada junto com o
nascimento dele.

**O número medido de novo, não repetido:** contando chamadas a `generate({…})` e
não menções ao nome, eram **32 pontos, 10 com dono e 22 sem** — próximo do "~28"
estimado acima, e a diferença é que aquela contagem incluía comentários e
`import`. Hoje são **33 pontos e 33 com dono**.

**O que mudou de natureza, e é o ponto:** `agentId` **deixou de ser opcional na
assinatura de `generate()`**. Chamada nova sem dono não compila. Fechar 22
buracos sem isso seria fechar 22 buracos e deixar a porta aberta para o 23º —
foi esquecimento que produziu os 22, e esquecimento não se conserta pedindo
atenção. A segunda metade da trava é estática
(`__tests__/ai/todo-gasto-tem-dono.test.ts`), e existe porque o tipo não pega
`as never` nem string montada em runtime.

**O que NÃO foi feito, de propósito: o histórico não voltou.** O gasto anterior
a 07/08/2026 continua sendo uma amostra de tamanho desconhecido, e a tela do
financeiro diz isso com a data. Extrapolar para trás por regra de três seria
inventar o número mais perigoso da casa.

---

## 5. Segurança virou papel; a fila dele já nasce com quatro itens

Ao abrir a sala do `seguranca` levantei o que já estava registrado e sem dono:

1. **`publishPost` não consulta `MetaAtivoAutorizado`** — a trava de ativos não
   cobre publicação orgânica. Mexer exige parecer do `meta`.
2. 19 conexões de terceiros no banco sem autorização (o CEO decidiu **manter**
   em 06/08 — apagar destrói o token e não é reversível).
3. `social/generate` e `design/generate` aceitam `clientId` opcional.
4. Divergência de chave estrangeira em `ClientAiProvider`.

**Não toquei em nenhum.** O agente nasceu hoje; a primeira varredura dele
precisa de despacho, e o item 1 precisa da trava de plataforma antes.

---

> Aberto por: PM da Dioli Digital · 07/08/2026
