# A régua de atuação — o quanto cada cargo faz, e o quanto distribui

> Decisão do CEO, 15/08/2026. Pergunta dele, nas palavras dele: *"de zero a cem
> por cento, quanto que o seu cargo é operacional ou estratégico? Se o cargo é
> mais estratégico, você delega mais. Se é mais operacional, você faz mais."*
>
> Este documento existe porque uma régua que só o autor entende não é régua.

---

## O número

Toda ficha da linha declara `indice_operacional`, de **0 a 100**:

- **0** = cargo puramente estratégico. Pensa, decide, distribui. Não põe a mão.
- **100** = cargo puramente operacional. Põe a mão o tempo todo.

Quanto **menor** o número, mais o cargo **distribui**.
Quanto **maior**, mais ele **faz**.

## O que a régua NÃO é

**Ela não é uma trava.** Nenhum cargo está proibido de executar por causa dela.

Isso foi decidido de propósito, e a razão é do CEO: *"se os outros agentes derem
ruim, aí só sobrar o Diretor, ele não vai executar? Ele vai executar sim."*
Uma trava aqui quebraria exatamente no momento em que a casa mais precisa de
alguém — que é quando falta gente.

Travas nesta casa existem para o que causa dano irreversível: publicar, gastar,
falar com cliente, apagar. Quem faz o quê é **orientação**, não portão.

## O que a régua É

**Um padrão de comportamento, e um termômetro.**

Como padrão: define por onde o cargo começa. Um cargo de 30% recebe uma demanda
e a primeira reação dele é quebrar em partes e passar adiante. Um cargo de 90%
recebe a mesma demanda e a primeira reação é produzir.

Como termômetro: **a exceção é livre, mas deixa rastro.** Quando um cargo de
índice baixo executa em vez de distribuir, isso é registrado com o motivo. Um
registro isolado é a casa funcionando — alguém cobriu uma falta. Vários
registros na mesma semana não são indisciplina: são a prova de que **falta gente
naquele ponto da esteira**. A régua transforma um incômodo difuso ("o Diretor
está sobrecarregado") num dado que se olha.

## As cinco faixas

| Faixa | O que significa | Cargos típicos |
|---|---|---|
| **0–25** | **Dirige.** Define rumo, distribui, cobra. Executar é suprir falta. | Diretor |
| **26–45** | **Coordena.** Quebra o trabalho, passa a quem faz, acompanha o aceite. | PM, orquestradores de departamento e de qualidade |
| **46–60** | **Decide e faz.** Produz a parte que exige o julgamento dele; distribui o resto. | Estrategista, arquiteto de software, diretor de criação, planejador de mídia |
| **61–80** | **Faz e interpreta.** Produção na maior parte do tempo; sobe o que exige decisão. | Analistas, planejadores, auditores, product designer |
| **81–100** | **Faz.** Produz o entregável com as próprias mãos. Sobe dúvida e bloqueio, não trabalho. | Copywriter, designer, editor, engenheiro, publicação |

## Como cada agente recebe essa informação

Não adianta o número existir no arquivo se quem trabalha não o vê. Ele chega em
dois lugares, sempre com a frase junto — nunca o número sozinho:

1. **Na ficha**, em português, logo acima da especificação: *"Régua de atuação:
   30% operacional. Este cargo COORDENA…"*.
2. **No próprio prompt do agente**, montado a partir da ficha em tempo de
   execução. O agente lê a régua dele antes de decidir o que fazer com a
   demanda.

## A outra régua: autonomia (A, B, C)

Esta escala já existia em todas as fichas desde 15/08, mas **nunca tinha sido
escrita em lugar nenhum** — falha de quem a aplicou. Fica documentada aqui.

A autonomia responde a uma pergunta diferente da régua de atuação. A régua diz
*quanto o cargo faz*; a autonomia diz *quanto ele pode concluir sozinho*.

| Grau | O que pode | Quem tem hoje |
|---|---|---|
| **A** | Conclui e entrega sem aval de ninguém. Reservado a quem **só lê e analisa** — não produz nada que chegue ao cliente, então não há o que aprovar. | 8 cargos: insights, previsões e alertas, atribuição de funil, observabilidade, radar de tendências, auditoria de marca, análise de performance de criativo, lucratividade por cliente |
| **B** | Produz e entrega para a etapa seguinte da esteira, que confere. | 29 cargos |
| **C** | Produz, mas o resultado só avança com aval — do departamento seguinte, da Qualidade ou do cliente. | 32 cargos |

Não existe grau D nesta casa. "Executa e só escala exceção" é exatamente o
desenho que a arquitetura veta hoje.

## Quem muda esta régua

O CEO — ou um Diretor a mando dele. Quem altera o índice de uma ficha recompila
o crachá na mesma sessão, como manda o dispositivo de 15/08/2026. O CI cobra
que **toda** ficha declare o seu índice: função sem régua reprova a rodada.
