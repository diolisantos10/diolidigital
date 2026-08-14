# Oficina — cerebro

> Registro de bancada. O que foi construído, o que foi conferido e **o que ficou
> aberto**. A vitrine é curada pelo Diretor/PM; aqui é onde o trabalho é anotado.

---

## 14/08/2026 — O cargo de DIRETOR virou agente endereçável (`.claude/agents/diretor.md`)

**Pedido:** ficha do Diretor Geral do Cérebro, por ordem do CEO — *"você já pode
construir o Diretor do Foocci e o da Dioli (…) quero você apenas delegando para
os Diretores"*. Escopo desta bancada: **só a Dioli Digital**.

### A pergunta que vinha antes de escrever o arquivo

*O cargo se sustenta como agente despachável, ou o arquivo fingiria um papel que a
arquitetura não tem?* **Sustenta**, e por um motivo que não é conveniência: a
doutrina 29 veda ao Diretor Geral *"despachar direto a especialista de um projeto
sem passar pelo Diretor daquele projeto"*. Sem o cargo endereçável, essa passagem
não existe — ou ela é pulada, ou o Diretor Geral vira operário da casa. O arquivo
**materializa uma proibição que já estava escrita**; não cria papel novo.

### As decisões que custam caro para desfazer

1. **Sem `Write` e sem `Edit`.** `tools: [Read, Grep, Glob, Bash, Agent]`.
   A doutrina 29 separa inspeção de produção pela ação sobre o arquivo — *"abrir
   e conferir é inspeção, obrigatória; editar é produção, vedada"*. Deixar as
   ferramentas de escrita seria repetir o defeito que esta casa já nomeou:
   **prompt é aviso, código é trava**. Precedente interno: `qualidade` e
   `experiencia` não escrevem por construção.
   **Honestidade sobre o limite:** `Bash` grava arquivo. A trava é boa, não é
   perfeita — igual à de `qualidade`, que também tem `Bash` e se declara "somente
   leitura". O arquivo diz isso com todas as letras e chama o desvio de violação
   declarada, em vez de fingir hermetismo. Trava perfeita depende do orquestrador
   (doutrina 29, "o que ainda NÃO existe").

2. **`Agent` entra.** Sem ela o Diretor não alcança o `pm`, e a camada
   CEO → Diretor → PM → especialistas volta a ser desenho. Precedente: `pm` já
   carrega `Agent`.

3. **`Bash` entra, e por um motivo nomeado:** a doutrina 24 manda não declarar
   ✅ o que só foi mergeado. A prova é `curl .../api/health` → campo `commit`
   (`app/api/health/route.ts`). Sem `Bash`, o Diretor é obrigado a acreditar no
   que lhe contam exatamente no ponto em que a doutrina manda desconfiar.

4. **O arquivo não se declara "o Diretor" — declara-se a constituição do CARGO.**
   O `CLAUDE.md` desta casa diz que a sessão principal é o Diretor e o
   interlocutor único do CEO. Escrever um segundo Diretor criaria contradição com
   um arquivo que eu fui proibido de tocar (e que, mesmo sem a proibição, não é
   meu). O texto resolve por enquadramento: quem carrega o arquivo exerce o cargo
   naquele turno, **um por vez**.

5. **Como o Diretor-agente fala com o CEO sem furar a hierarquia:** ele devolve o
   **quadro pronto** e quem detém o canal o encaminha **sem editar**. Não é
   invenção — é a nota de honestidade técnica da doutrina 18: *"encaminhar
   literalmente é mecânico e não viola a hierarquia; reescrever a ordem, sim."*

6. **A primeira versão tinha 337 linhas e foi reescrita para 247.** O maior agente
   da casa tem 153 (`meta.md`). Um arquivo cujo tema é *"regra no meio de prosa
   longa é lida na abertura e esquecida no meio"* não pode ser o mais longo da
   casa. O corte veio de **apontar em vez de copiar**: a doutrina 24 está no
   espelho (`docs/kit/24-o-quadro-do-ceo.md`) e virou ponteiro; a **29 não está**
   no espelho, e por isso é a única transcrita.

### O que eu recusei escrever, e por quê

A ficha mandava constar que **custo, margem, tarefa interna e o que os agentes
fazem por baixo NUNCA aparecem no portal**. Procurei a fonte: `docs/decisoes.md`,
`docs/QUEM-APROVA.md`, `docs/ESTADO-REAL-08-08.md`, `CLAUDE.md`, os agentes
`interface` e `experiencia`, e o código de `app/portal/`. **Não existe essa regra
escrita nesta casa.** Escrevê-la no arquivo do Diretor a transformaria em doutrina
por decreto de agente — que é exatamente o guardrail 3 ("agente nunca muda as
próprias regras") ao contrário. O arquivo declara a **lacuna** e manda levá-la ao
Diretor Geral. Ausência de informação não é informação.

### Conferido

- `.claude/agents/diretor.md` não contradiz `CLAUDE.md` em: hierarquia (§HIERARQUIA
  06/08), trava de plataforma (§03/08), regra de ouro do relato (§01/08), não se
  para no meio (§10/08), bordas do turno e exceções fechadas (§doutrina 29),
  fonte das regras de IA (kit, não este repositório).
- Alinhado com `docs/QUEM-APROVA.md` (aprovação é do cliente; nada de fila de
  aprovação apontando para o CEO) e com
  `lib/integrations/meta/trava-de-publicacao.ts` (fail-closed; a chave é do CEO).
- Nada mais foi tocado: nenhum outro agente, nenhum documento, nenhum código.

### Aberto

- A ambiguidade "sessão principal é o Diretor" × "Diretor é agente" só some com
  uma linha no `CLAUDE.md`, e essa edição **não é minha** — proposta subiu ao
  Diretor Geral no relatório.
- Falta a regra escrita do que o portal nunca exibe (ver acima).
- A trava perfeita de ferramenta depende do orquestrador, não de texto.
