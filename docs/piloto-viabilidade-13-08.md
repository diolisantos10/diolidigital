# Teste de viabilidade da camada de delegação — Dioli Digital

> **Ordem do projeto, primeiras 48 horas, item 1:** *"Rodar hoje o teste de
> viabilidade no orquestrador… se isso não for possível, a recomendação central
> do parecer não é executável… **registre esse resultado antes de qualquer outra
> coisa**."*
>
> Rodado em 13/08/2026 pelo Diretor. Este documento é o resultado, escrito antes
> de qualquer outro trabalho da Fase 0, como o projeto exige.

---

## O resultado, em uma linha

**O PM da Dioli existe em disco e é inalcançável em execução.** O despacho a ele
não foi recusado por política — falhou por endereço inexistente.

```
Agent type 'pm' not found. Available agents: agencia, canais, cerebro,
claude, claude-code-guide, crm, experiencia, Explore, garcom,
general-purpose, interface, manual, meta, operacao, Plan, qualidade,
seguranca, statusline-setup
```

---

## A medição

| | |
|---|---|
| **Agentes que esta sessão carrega** | os 12 de `FOOCCI/.claude/agents/` + os embutidos |
| **Agentes que a Dioli tem em disco** | 13, em `/workspace/diolidigital/.claude/agents/` |
| **Presentes nos dois** | `cerebro`, `experiencia`, `interface`, `meta`, `qualidade`, `seguranca` |
| **Só na Dioli, e portanto inacessíveis** | **`pm`**, `esteira`, `branding`, `departamentos`, `google`, `plataforma`, `tiktok` |

`pm.md` tem 114 linhas, descrição completa e `tools: [Read, Grep, Glob, Write,
Edit, Bash, Agent]` — inclusive a ferramenta de despachar. **Não é rascunho. Está
pronto e nunca foi carregado.**

O roster que uma sessão enxerga vem do diretório de trabalho. Esta sessão abre em
`/home/user/FOOCCI`; portanto, ao trabalhar na Dioli, o Diretor opera com o
**roster do outro projeto**.

---

## O que isto corrige no diagnóstico de 13/08

O diagnóstico que subiu ao conselho dizia:

> *"A camada de PM, que é obrigatória por ordem do CEO, foi pulada em 100% dos
> casos."*

**O número está certo e a causa estava incompleta.** Havia duas, e só uma era
minha:

1. **Minha:** despachei direto ao especialista o dia inteiro, sem procurar o PM.
   Isso é escolha e permanece contra mim.
2. **Do ambiente, e esta eu não sabia:** o PM da Dioli **não é endereçável** a
   partir de onde o trabalho acontece. Nos despachos de hoje que envolveram a
   Dioli, cumprir a camada era **impossível**, não caro.

Registro isto sem usá-lo como desculpa: eu deveria ter tentado uma vez e
descoberto isto em 06/08, quando a ordem foi dada. Um mecanismo obrigatório que
nunca foi exercitado nem uma vez é um mecanismo cuja existência ninguém conferiu.

---

## O que isto muda no projeto

**A Fase 1 tem um pré-requisito que o cronograma não previu.** Ela planeja
*"remover o roster do contexto do Diretor, deixando o PM como único destino"*.
Hoje o PM **não é destino nenhum**. Tirar o roster antes de o PM existir em
execução deixaria o Diretor sem nenhum caminho.

**Ordem corrigida, e é barata:** tornar o PM alcançável **antes** de qualquer
trava. Sem isso, a Fase 1 entrega um Diretor sem martelo e sem endereço — que não
é delegação, é paralisia.

**E a premissa nº 3 do briefing fica refutada como estava escrita:**

> *"Cada projeto tem um Diretor e ao menos um PM formalmente definidos."*

Verdadeiro em disco. **Falso em execução.** É exatamente a classe de premissa que
o próprio briefing manda checar antes de codar, porque checar sai mais barato que
refazer.

---

## O que ficou provado, e é boa notícia

**Restringir ferramenta por papel funciona, e já está em produção nesta casa.**
`qualidade` e `experiencia` rodam sem ferramenta de escrita, por declaração no
próprio arquivo do agente. A trava central do parecer — tirar o martelo — é
**tecnicamente viável** para subagente.

**O que NÃO consegui testar: tirar o martelo do próprio Diretor.** As ferramentas
da sessão principal não vêm de `.claude/agents/`; vêm do ambiente. Não tenho como
me auto-restringir, e não deveria ter — uma trava que o travado pode remover não
é trava. **Isso é configuração do CEO, fora do meu alcance.** `NÃO VERIFICADO` se
o ambiente permite.

---

## Os dois rosters que estavam sendo somados

O projeto mede *"cobertura de roster = agentes distintos acionados ÷ agentes
disponíveis"*. Existem **dois conjuntos diferentes** com esse nome:

| Conjunto | Onde | Quantos | Quem aciona |
|---|---|---|---|
| Agentes de desenvolvimento | `.claude/agents/*.md` | 13 na Dioli | o Diretor / o PM |
| Especialistas do produto | `lib/agency/execution/especialistas.ts` | ~22 | a esteira, em execução |

**Somar os dois produz denominador falso.** O Diretor não aciona especialista de
produto — quem o faz é o motor da esteira, quando produz peça de cliente. Medir a
delegação do Diretor contra 35 nomes diria "cobertura de 6%" para um Diretor que
usou metade do que ele pode usar.

**Decisão pendente para o CEO:** qual é o denominador. Minha recomendação: **os
13 agentes de desenvolvimento**, porque são os únicos que o Diretor pode
endereçar. Os especialistas de produto pertencem a outra medição — a qualidade da
peça —, que já tem raio-X próprio.

---

## O que eu recomendo fazer antes da Fase 1

1. **Tornar o PM alcançável.** É pré-requisito, não etapa.
2. **Fixar o denominador** da cobertura de roster (decisão do CEO).
3. **Só então** remover ferramentas e roster do Diretor.

— registrado pelo Diretor em 13/08/2026, antes de qualquer outro trabalho da
Fase 0, como o projeto determina.
