# Claude in Chrome × perfil isolado — a contradição, resolvida

> **Para o Diretor Geral, 30/08/2026.** Ele mandou: *"escolha (a) ou (b), com a
> sua recomendação, não como pergunta em aberto."*
>
> **RESPOSTA: (a). Não há colisão entre a decisão 1 e a decisão 2.** A colisão
> era um erro meu de redação na RETOMADA, e ele merece ser nomeado antes de
> qualquer coisa.

## 1. O erro que criou a contradição — e era meu

Minha RETOMADA dizia:

> *"Ligar [o executor] exige `launchPersistentContext` (hoje o contexto é
> efêmero)."*

**Isso confunde o REQUISITO com uma IMPLEMENTAÇÃO dele.** O requisito da
decisão 2 é *perfil de navegador completamente isolado*. `launchPersistentContext`
é o jeito do **Playwright** de conseguir um perfil persistente. Não é o único.

O Chrome tem perfis nomeados próprios, e um perfil do Chrome é um diretório
separado, com cookies, sessões e extensões próprias. **Isolamento por perfil do
Chrome e isolamento por Playwright são dois caminhos para a mesma coisa** — e
escrever o requisito com o nome de um deles fez a decisão 1 parecer incompatível
com a decisão 2 quando não é.

Escrevi o nome da ferramenta onde devia ter escrito a propriedade. É o mesmo
defeito das três frases falsas do `esteira.md`: **descrever a solução em vez de
descrever o que precisa ser verdade**.

## 2. O que é MEDIDO e o que é SUPOSTO

Separado com todas as letras, porque a parte que mais importa aqui é a que eu
**não** consigo medir.

### MEDIDO (nesta sessão, com comando rodado)

| Fato | Como foi medido |
|---|---|
| Playwright está instalado | `package.json:58` → `"playwright": "^1.61.1"` |
| `navegador.ts` abre Chromium de verdade | `navegador.ts:207` → `chromium.launch` |
| O contexto dele é **efêmero** | `navegador.ts:213` → `newContext`, não persistente |
| Login é BLOCK na política | `policy.json` → `capabilities.messaging: "MANUAL"`, e o portão barra `login` |
| Descoberta na área pública é autorizada | `policy.json` → `capabilities.discovery: "AUTHORIZED_BROWSER"`, com `/projects` fora do `Disallow` no `robots.txt` |
| Este contêiner tem saída de rede | `curl https://www.99freelas.com.br/projects` → HTTP 200 |

### SUPOSTO (não medido, e não mediível daqui)

🔴 **Nada sobre o Claude in Chrome foi medido por esta casa.** Não há uma linha
de código dele no repositório, ele não está instalado neste contêiner, e não
existe forma de exercitá-lo a partir daqui.

Portanto, tudo abaixo é **SUPOSTO** e precisa de confirmação de quem tiver o
produto na mão:

- que ele opera dentro do perfil do Chrome em que está instalado;
- que um perfil dedicado do Chrome, sem outras contas conectadas, é suficiente
  para satisfazer "não pode conter Gmail, banco, redes sociais nem dados
  pessoais";
- que ele respeita, ou pode ser instruído a respeitar, uma lista de destinos.

**Não escrevi nenhuma dessas três como fato em lugar nenhum do código.**

## 3. Por que (a), e não (b)

O requisito da decisão 2 — *perfil isolado, alcançando somente o 99Freelas e a
área operacional da Dioli* — **não menciona ferramenta nenhuma**. Ele descreve
uma propriedade do ambiente:

1. um diretório de perfil dedicado, que não é o perfil pessoal do CEO;
2. nenhuma outra sessão autenticada dentro dele;
3. destinos limitados a uma lista de permissão.

**As três são alcançáveis com um perfil dedicado do Chrome**, que é justamente
onde o Claude in Chrome operaria. Nada nas três exige Playwright.

E a peça que a casa construiu para isso — `lib/agency/celula/navegador-isolado.ts`
— **já é agnóstica de ferramenta de propósito**: ela decide e descreve, não abre
navegador nenhum. `avaliarDestino` responde "pode ir a esta URL?" e
`montarPerfilIsolado` recusa diretórios que pareçam perfil pessoal. Nenhuma
dessas duas funções importa Playwright, e é por isso que elas servem aos dois
caminhos.

## 4. A consequência ARQUITETURAL que ninguém tinha nomeado

Esta é a parte que muda o trabalho, e ela não estava escrita em lugar nenhum:

> **Com Claude in Chrome, "executor" NÃO PODE significar "nosso código que
> dirige o navegador".**

O Claude in Chrome é operado **de dentro do navegador**, sob supervisão de quem
está na frente dele. Nosso processo Node não o inicia, não o chama e não recebe
retorno dele. **Não existe `executor.launch()` nesse mundo, e nunca vai existir.**

Então o item "executor ligado ao navegador isolado" tem outra forma, e é esta:

| Nosso código faz | Nosso código NÃO faz |
|---|---|
| decide **o que** deve ser feito e **onde** (plano de ação) | abrir o navegador |
| impõe a lista de permissão de destinos | clicar, digitar, anexar |
| impõe o limitador de ritmo | fazer login |
| **registra** o que foi executado, com evidência | resolver CAPTCHA |
| abre exceção quando algo sai do previsto | contornar proteção |

Construir um driver Playwright autenticado seria **executar o contrário da
decisão 1 e chamar a decisão 2 de cumprida** — exatamente o que o Diretor Geral
proibiu.

## 5. O que NÃO é contradição, e convém não confundir

O Playwright que já existe em `navegador.ts` continua legítimo, e não colide com
a decisão 1, por um motivo simples: **ele não opera a conta**. Ele lê a área
**pública** (`/projects`), sem login, que é o único ponto em que a plataforma dá
sinal positivo. São dois papéis distintos:

- **área pública, sem sessão** → Playwright, como já está;
- **sessão autenticada do titular** → Claude in Chrome, supervisionado.

Colapsar os dois é que seria erro.

## 6. Recomendação ao Diretor Geral

**Seguir por (a)**, com três condições — e a terceira não é técnica:

1. **O executor nasce como plano + registro**, na forma da tabela acima. Sem
   driver autenticado, em nenhuma ferramenta.
2. **A lista de permissão viaja no plano.** O operador recebe os destinos
   permitidos junto da ordem, e o registro guarda onde ele de fato esteve — a
   trava não adianta se ficar só do lado de cá.
3. 🔴 **Antes da primeira sessão autenticada real, alguém precisa ATESTAR, na
   máquina do CEO, que o perfil dedicado não tem nenhuma outra sessão.** Isso
   não é verificável por código nosso, e por isso o código **exige a atestação
   declarada** e recusa operar sem ela. Uma trava que depende de um fato que
   ninguém conferiu é uma trava suposta — e esta casa já tem seis dessas.

**O que sobe para o CEO:** nada como pergunta. Só o registro de que a decisão 1
implica um executor supervisionado por construção, e que o modo automático,
mesmo depois de homologado, **não vira código que dirige o navegador sozinho** —
ele vira código que prepara e registra, com uma pessoa no comando do Chrome.
Se ele quiser automação sem pessoa na frente, aí sim as duas decisões colidem, e
a colisão é dele para resolver, não minha.
