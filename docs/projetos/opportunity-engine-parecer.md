# Dioli Opportunity Engine — parecer do Diretor

> Documento do CEO recebido em 05/08/2026 (v1.0, 55 páginas, feito com o
> ChatGPT). Ele pediu leitura, opinião e o projeto montado. Este arquivo é a
> opinião; o plano de obra está no fim.

## Veredito em uma linha

**Aprovo a tese e reprovo a ordem de construção.** A tese está certa e é a
melhor que apareceu nesta casa: em marketplace de freelancer o cliente **já tem
intenção declarada**, e a Dioli tem um ativo que quase ninguém tem — briefing e
orçamento inteligentes. Só que o documento manda construir seis módulos antes de
saber se o canal fecha negócio, e o número que decide tudo ainda não existe.

## O que o documento acerta, e acerta forte

- **Compliance como lógica de produto, não instrução.** É a mesma doutrina da
  casa ("trava, não aviso"), e no lugar certo: link, contato e pagamento por
  fora são o que derruba conta.
- **Conteúdo de plataforma tratado como dado não confiável** (prompt injection).
  A casa já tem esse padrão; aqui ele vem de fábrica.
- **Budget dimensiona escopo e não define preço.** Evita o leilão que destrói a
  margem — e é coerente com a tabela que acabamos de fechar.
- **Qualidade acima de volume**, com penalidades explícitas no score.
- **Humano aprova antes do envio.** Certo — e, nesta casa, obrigatório.

## Os cinco furos que eu não deixo passar

**1. A captura automática, do jeito que está escrita, é ilegal pelas próprias
regras que o documento defende.**
"O sistema acessa a listagem de projetos" em ambiente logado é automação de
navegação — que o próprio documento lista como não-objetivo ("não operar
autonomamente em ambientes logados"). A v1 tem de ser **importar/colar** a
oportunidade, à mão. O documento põe isso como P2; é **P0**. Sem essa inversão,
o projeto nasce violando a regra que ele mesmo escreveu.

**2. O número que decide o projeto inteiro não existe: a taxa de fechamento.**
No GetNinjas cada contato **custa moeda**, ou seja, dinheiro por lead. O
documento cria uma fórmula bonita (valor esperado ÷ custo do lead) alimentada
por uma probabilidade que ninguém mediu. Construir Platform Registry, Inbox,
Scoring, Compliance Engine, Proposal Studio, Approval Queue e CRM antes de saber
se 1 em 5 ou 1 em 50 fecha é construir sobre chute caro.

**3. Falta a trava de capacidade — e ela é a que quebra a casa.**
O documento trata "vender acima da capacidade" como risco 5, com mitigação em
P1. Está no lugar errado: vender dez projetos que não conseguimos entregar
destrói reputação **nos dois lados** (na plataforma e no cliente) e ainda nos
tira do ar por avaliação ruim. **Capacidade é portão de envio, não painel.**

**4. O motor de orçamento precisa ler a tabela que já existe.**
Fechamos a tabela de preços hoje (`docs/precos.md`). Se o Opportunity Engine
nascer com price book próprio, em duas semanas há dois preços da Dioli — e o
cliente sempre acha o menor. O price book é UM, e é aquele.

**5. O risco que o documento não vê: o nosso próprio piso de qualidade.**
Esta casa roda 100% IA e tem **28 de 31 checagens não executáveis**. Um agente
que escreve proposta comercial em nome da Dioli, dentro da plataforma de um
terceiro, com banimento e reputação em jogo, é exatamente o caso em que "sem
gate executável = reprovado" vale. Enquanto o piso não subir, **toda** mensagem
sai com humano no meio — sem exceção "para agilizar".

## A tese completa, dita pelo CEO em 05/08/2026

> "O agente — SDR, Google, o que for — aborda o cliente e a função dele é
> **puxar o cliente como isca para o nosso sistema**. E aqui ele vai estar na
> nossa interface."

Isso muda o eixo do projeto e vale escrever com todas as letras: **a isca não é
uma mensagem bem escrita, é a nossa interface.** O agente não fecha venda — ele
faz o cliente ATRAVESSAR a porta. Quem converte é o briefing inteligente, e
quem retém é o portal.

Três consequências que decorrem disso, e nenhuma é opcional:

1. **O gargalo do projeto passa a ser a página de briefing, não o agente.**
   Se 100 pessoas clicam e 8 concluem, nenhum agente melhor resolve. A obra
   mais rentável do Opportunity Engine é a taxa de conclusão do `/briefing` no
   CELULAR — que é de onde essa gente vem.

2. **Onde o link é proibido, a isca tem de ser reproduzida DENTRO da
   plataforma.** É a Rota B do documento, e ela deixa de ser alternativa: vira
   o caminho principal em 99Freelas, Workana e Upwork. O agente faz as perguntas
   do nosso briefing lá dentro, com as nossas palavras, e o cliente experimenta
   a inteligência sem sair do lugar.

3. **Todo mundo que entra carrega a origem.** Sem carimbar qual agente, qual
   plataforma e quanto custou o contato, em três meses ninguém sabe qual canal
   paga o próprio custo — e a decisão de escalar vira palpite.

**O agente do Google é o mesmo funil por outra porta:** negócio local com ficha
abandonada, sem foto, sem resposta a avaliação. A diferença é o regime jurídico
— marketplace tem regra de plataforma; abordagem fria tem LGPD e regra de spam.
Não é mais frouxo, é diferente. Entra como canal 2, com parecer do especialista
`google` antes da primeira abordagem.

## O que eu corto da primeira versão

Upwork, Freelancer.com, Fiverr, inglês, multi-moeda, navegação assistida,
aprendizado avançado, recomendação de upsell e biblioteca de cases. Nada disso
sobrevive a um piloto que ainda não sabe se o canal fecha.

## O plano que eu proponho — três fases, e a primeira não tem código

### Fase 0 — provar o canal à mão (7 dias, zero engenharia)
20 oportunidades no **GetNinjas** e 10 no **99Freelas**, trabalhadas por gente,
com o briefing inteligente que já existe como CTA. Registro em planilha: custo
do contato, resposta, briefing concluído, orçamento, fechamento, ticket.
**Portão:** só passa para a Fase 1 se o custo de aquisição ficar abaixo de 15%
do ticket médio e pelo menos 1 em 10 contatos virar orçamento. Se não passar, o
projeto morre aqui — e ter morrido em 7 dias é o melhor resultado possível.

### Fase 1 — o mínimo que tira o piloto da planilha (2 a 3 semanas)
Opportunity Inbox (importação manual), Platform Registry com as regras das duas
plataformas, scoring, **Compliance Engine**, **Capacity Gate** e Approval Queue.
Proposta gerada pelo motor que já existe, lendo `docs/precos.md`. CRM mínimo
reaproveitando `ClientRequestDb` — não nasce tabela nova para o que a esteira já
tem.

### Fase 2 — briefing assistido e recorrência (3 a 4 semanas)
Rota B do documento (99Freelas/Workana): briefing preenchido internamente,
perguntas dentro da plataforma, proposta na plataforma. Conversão de
oportunidade em projeto na esteira, com origem e custo de aquisição carimbados.

### Fase 3 — escala, só com dado
Internacional e Fiverr entram quando conversão, margem e compliance estiverem
provados por número, não por vontade.

## Decisões que só o CEO toma (o documento pede 18; estas 6 travam a Fase 0)

1. Orçamento de moedas do GetNinjas para o teste (teto em reais).
2. Piso de projeto: abaixo de quanto a Dioli não propõe.
3. Quantos projetos simultâneos a casa aguenta hoje.
4. Quem aprova proposta quando você não está.
5. Serviços liberados para venda no canal (proponho: os "entrega hoje" da
   tabela, sem vídeo e sem site).
6. O nome que vai na plataforma — Dioli Digital ou pessoa física.
