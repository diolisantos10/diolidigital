# Raio-X — Tráfego Pago no Facebook e Instagram

> Pedido pelo CEO em 02/08/2026: *"se o cliente bater na porta hoje, quanto da
> estrutura está pronta, de 0 a 100%?"*
>
> Auditado contra o código, não contra a intenção. O caso de teste é o do CEO:
> **um padeiro que não tem criativo, não sabe mexer em tecnologia, já tem
> Instagram e Facebook, e quer anunciar no bairro dele.**

## A resposta: **30%**

E os 70% que faltam **são o serviço**. O que existe hoje é a parte de *vender e
planejar* tráfego pago. O que não existe é a parte de *fazer* tráfego pago.

> Dito de outro jeito: hoje a Dioli consegue fechar o contrato do padeiro,
> cobrar certo e entregar um plano bonito. **Não consegue colocar um anúncio no
> ar.**

---

## A jornada do padeiro, elo por elo

| # | Etapa | Pronto | O que existe · o que falta |
|---|---|---|---|
| 1 | **Briefing** | 🟡 70% | O SDR captura verba mensal de anúncios. **Não captura região** — e o pedido do padeiro é literalmente "no meu bairro". Sem raio/cidade, a segmentação geográfica não tem de onde sair. |
| 2 | **Proposta e preço** | 🟢 95% | `computeEstimate` já precifica gestão de tráfego, separa verba de mídia do honorário e explica em linguagem de dono de negócio. Testado hoje em produção. |
| 3 | **Conectar a conta de anúncios do cliente** | 🔴 0% | O OAuth por cliente existe e guarda token cifrado — mas os escopos **não pedem `ads_management` nem `ads_read`**. Com token válido e tudo, a Meta recusa qualquer chamada de anúncio. |
| 4 | **Criar o criativo** | 🔴 15% | O especialista de criativo de tráfego entrega **a descrição da arte em texto** — ângulo, composição, texto sobre a imagem. Não entrega a imagem. Existe um gerador de imagem no repositório (`design-engine.ts`, gpt-image-1) e ele **não está ligado ao motor de produção**. Para o padeiro, que não tem nada, isso é fatal: a agência descreve o anúncio e ninguém o produz. |
| 5 | **Subir a campanha na Meta** | 🔴 0% | Não há uma linha de Marketing API. Zero ocorrências de conta de anúncio, campanha, conjunto, anúncio ou verba em `lib/integrations/meta/`. |
| 6 | **Rotina semanal do gestor** | 🔴 0% | Não existe rotina semanal nenhuma. O despertador só recupera produção travada. Não há "olhar a campanha, ver o que caiu, mexer no lance, pausar o anúncio ruim". |
| 7 | **Ler o resultado da campanha** | 🔴 0% | O `getInsights` que existe lê desempenho **orgânico** do perfil. Métrica de campanha — custo por resultado, alcance pago, frequência — não é lida de lugar nenhum. |
| 8 | **Relatório e devolutiva** | 🟡 25% | O Analytics entrega um **plano de medição** ("o que vamos medir"), não um relatório ("o que aconteceu"). O ciclo mensal existe e **abre** sozinho, mas `fecharCiclo` só é chamado por rota HTTP — ninguém fecha o mês automaticamente. |
| 9 | **Portal do cliente** | 🟢 85% | Funciona: o cliente vê as entregas, aprova, conversa. Testado em produção hoje. **Falta o painel de campanha** — números, gasto, resultado. |

---

## As três verdades incômodas

**1. O nome do departamento promete mais do que ele faz.**
"Tráfego Pago" hoje é um departamento de *planejamento* de tráfego pago. Ele
pensa a campanha e não toca nela. Vender como gestão de tráfego seria vender o
que a casa não tem — e o cliente descobre no primeiro relatório.

**2. O padeiro é o pior caso possível, e é o caso mais comum.**
Cliente que já tem criativo e agência anterior precisa "só" da API. O padeiro
precisa de **tudo**: criativo do zero, conta configurada, campanha montada,
otimização, e alguém que explique o resultado em português. É exatamente o
cliente que a Dioli quer atender, e é o que mais expõe os buracos.

**3. Não existe o trabalho contínuo — só o trabalho de entrada.**
Toda a esteira construída até hoje termina em "pacote entregue e aprovado".
Gestão de tráfego não termina: ela recomeça toda semana. **A agência sabe nascer
um projeto e não sabe tocar uma operação.** Esse é o buraco estrutural, e ele é
maior que a API da Meta.

---

## O que precisa existir, na ordem — e por que nessa ordem

| Ordem | O quê | Por quê antes do resto |
|---|---|---|
| 1 | **Escopos `ads_management` + `ads_read`** e submissão no App Review | São permissões avançadas: exigem justificativa e vídeo, e a **aprovação da Meta leva dias**. Começar por aqui faz a espera correr em paralelo com o desenvolvimento. |
| 2 | **Região no briefing** | Uma pergunta. Sem ela, nenhuma campanha local é possível — e é o pedido literal do cliente. |
| 3 | **Criativo virar imagem** | O gerador já existe e só não está ligado. É o maior ganho pelo menor esforço, e destrava o padeiro que "não tem nada". |
| 4 | **Camada de Marketing API** | Conta de anúncio, campanha, conjunto, anúncio, verba. É o bloco grande. |
| 5 | **Rotina semanal do gestor** | Ler métricas → decidir → agir → registrar. É o que transforma "montamos sua campanha" em "cuidamos da sua campanha". |
| 6 | **Relatório com número real + fechamento de ciclo automático** | Fecha o laço: o cliente vê o que o dinheiro dele fez. |

---

## O método deste raio-X

Aplicável aos outros serviços, e o CEO pediu que fosse:

1. Escolher **um cliente concreto e difícil** — não um cliente médio imaginário.
2. Percorrer a jornada dele **elo por elo**, do briefing ao resultado.
3. Em cada elo, perguntar *"isso existe em código ou só na intenção?"* e
   **conferir no repositório** — nunca no documento, que envelhece.
4. Pontuar cada elo, e o serviço pelo elo mais fraco que o cliente percebe.
5. Ordenar o conserto por **tempo de terceiro primeiro** (aprovação da Meta),
   depois por **maior ganho pelo menor esforço**.
