# Hub do Cliente: arquitetura de UX interna e externa da agência

**Uma base de dados única com duas experiências separadas por visibilidade: internamente, fila de trabalho por departamento mais mural por cliente; externamente, um portal enxuto de ações, status e resultados, montado com blocos universais e especificado por humanos antes de qualquer geração por IA.**

> Este documento saiu de um conselho de IAs: a mesma pergunta foi feita a
> 5 modelos de empresas diferentes, cada um sem ver a resposta do outro,
> e depois um relator montou uma coisa só a partir das respostas. O que ficou
> em aberto está marcado como aberto — de propósito.

## 1. O que se quer

Olá boa noite tudo bem Eu tô com um novo projeto de criar uma agência digital na verdade ela já tá criada que vai oferecer milhares de serviços todos voltados ao digital então tudo que diz respeito a marketing digital tudo que diz respeito à criação de aplicativo criação de ambiente digitais sites Imagina aí o cardápio mais completo que uma agência digital pode construir hoje em dia oferecendo diversos tipos de serviços para diversos tipos de cliente que vai desde um restaurante até uma empresa de tecnologia Mas a gente não é tão voltado a desenvolvimento de software essas coisas no máximo que a gente faz é um aplicativo ou eu não vou fazer vão falar sistema mas acho que no máximo aplicativo nosso qualquer marca que tinha comunicação e enfim e aí eu tô tendo uma dificuldade gigantesca que uma das partes da nossa interface Então a gente tem a interface interna que é onde todos os funcionários e as residências artificiais operam cada um com seu departamento e a interface o dashboard do usuário Onde espelha exatamente o que tá sendo construído em cima do projeto dele porém só a parte que diz respeito a o que ele tem que fazer por exemplo aprovações é ver como tá a timeline do projeto deles status enfim e aqui que dá um nó Porque eu tô tentando criar com inteligência artificial e esse dashboard não saio ele sai incompleto ou não sai de forma adequada tem as coisas que o próprio cliente tem que integrar as integrações de todos os aplicativos de analirem de redes sociais e tudo que diz respeito a uma agência de marketing digital e tá muito nebuloso a gente pode sair confuso sim e o meu time não consegue acertar Então vem aqui pedir ajuda para você para criar um desenho de um interface tanto a interface do lado do cliente quanto a interface do lado do projeto desse cliente então só para ficar claro cada cliente tem um dashboard interno onde todas as áreas elas alimentam esse dashboard então cada área trabalha de forma independente mas o dashboard é como se fosse a casinha do cliente ali o mural dele onde todas as áreas interagem e deixam lá suas entregas então é o Hub ali do cliente tem coisas do lado da agência que é só dizer respeito e só tem que ser visto pelos internamente tem um lado que tem que ser olhado externamente eu não tô falando aqui de como que eu posso falar de a identidade visual já tá muito certinho não precisa mudar que eu falo mesmo é de e o ex o que eu tô falando aqui é sobre You X and que é use as Experience que tá muito abaixo do esperado E aí eu preciso de um desenho um projeto para que eu peça para as minhas para minha equipe construir o que abra a mente deles enfim eu preciso de ajuda em relação a isso e um desenho um projeto para para essa esse essa demanda que tá não tá não tá dando certo até agora

## 2. Decisões firmes

- **[3 de 3]** O dashboard do cliente não pode ser espelho do dashboard interno. Objetos de dados compartilhados, sim; mesma experiência, não. Cada item (tarefa, arquivo, entregável, mensagem, métrica) nasce com um campo obrigatório de visibilidade — interno, aguardando publicação, compartilhado com o cliente — e a filtragem é feita no backend, nunca escondendo campos na tela.
- **[3 de 3]** A raiz do problema não é visual nem de prompt: é arquitetural. Falta um modelo comum de objetos e um contrato explícito de visibilidade por persona. Enquanto isso não existir, cada departamento inventa a própria interpretação do dashboard e a IA continuará devolvendo telas incompletas, porque está sendo usada para resolver um problema de padronização de processo.
- **[2 de 3]** O catálogo de milhares de serviços não vira milhares de telas. Modele de 10 a 15 módulos reutilizáveis (estratégia, identidade, conteúdo, mídia paga, social, SEO, site, landing, aplicativo, automação, CRM, analytics, audiovisual, consultoria) e monte templates de projeto combinando módulos, etapas, entregáveis, aprovações e métricas. Essa única decisão derruba a maior parte da complexidade percebida.
- **[2 de 3]** Na camada de apresentação ao cliente, use um vocabulário fechado de blocos universais — Bloco de Aprovação, Bloco de Entrega, Bloco de Marco, Bloco de Métrica, Bloco de Pendência do cliente, Bloco de Decisão registrada. Qualquer serviço novo tem que ser expressável com esses blocos; se não for, a discussão é sobre criar um bloco novo para todos, não uma tela sob medida.
- **[2 de 3]** A casa do cliente se organiza em três macro-áreas: "O que depende de você", "Como está o projeto" e "Resultados". Dentro de "O que depende de você" ficam as pendências reais — aprovações, envio de arquivo, conexão de conta. A tela inicial abre com ações pendentes em primeiro lugar, próximos marcos, entregas recentes e alertas; gráfico decorativo não ocupa o topo.
- **[2 de 3]** No lado interno existem duas visões, e as duas são necessárias: a fila de trabalho por pessoa e por departamento (onde executores vivem o dia inteiro) e o mural por cliente, que consolida timeline, entregáveis, aprovações, comunicação, métricas, integrações e a área interna com notas, custos e margens. Obrigar designer e dev a operar pelo mural do cliente derruba a produtividade.
- **[2 de 3]** Integrações são duas coisas diferentes e devem ser tratadas separadamente. Conectar e monitorar contas (quem conectou, quais permissões, última sincronização, saúde, botão de reconectar) é função da plataforma e é tarefa recorrente do cliente. Renderizar analytics não é: no MVP, embede relatórios externos em vez de reconstruir dashboards nativos. Credenciais via OAuth ou cofre de segredos, jamais em tarefas, mensagens ou prompts.
- **[2 de 3]** MVP com seis capacidades: projetos e marcos, entregáveis versionados, aprovações, timeline, mensagens ancoradas no contexto e permissões de visibilidade. Integrações completas, analytics avançado, financeiro e automações vêm depois. Rode uma semana de modelagem de objetos e permissões, uma de fluxos, uma de protótipo navegável, e teste com cinco funcionários e cinco clientes antes de escrever código de produção.
- **[2 de 3]** A IA entra como acelerador de prototipação e de geração de variações depois que o fluxo estiver definido por um responsável humano de UX — não como autora da arquitetura de informação. As microdecisões que fazem o portal funcionar (hierarquia de ação, tom, antecipação de dúvida, exceções) não saem de descrição de negócio.
- **[1 de 3]** Especifique primeiro o modelo de dados, depois as telas. Objetos mínimos: Cliente, Usuário, Contrato, Projeto, Módulo de serviço, Marco, Tarefa, Entregável, Versão, Aprovação, Decisão, Mensagem, Arquivo, Métrica, Integração e Evento de auditoria. Esse é o documento que abre a cabeça da equipe — não um Figma bonito.
- **[1 de 3]** Três níveis de hierarquia no produto: Conta (contrato, usuários, integrações, visão geral), Projeto ("Novo site", "Campanha de lançamento") e Entregável (anúncio, landing page, relatório, vídeo). Departamentos, tarefas internas e agentes de IA ficam subordinados a essa estrutura, porque o cliente pensa em entregas e resultados, não no organograma da agência.
- **[1 de 3]** Aprovação é um objeto próprio, não uma tarefa nem uma mensagem. Cada aprovação mostra o que exatamente está sendo aprovado, versão, prazo, impacto da demora e três ações: Aprovar, Solicitar ajustes, Tenho uma dúvida. Ajuste exige comentário contextual, gera nova versão sem apagar a anterior e registra autor, data e decisão. Esse é o coração do portal — se só uma coisa funcionar bem, é esta.
- **[1 de 3]** Agentes de IA operam como executores identificáveis, com agente, instrução, fonte usada, resultado, responsável humano e estado (rascunho, revisão interna, pronto para o cliente, publicado, rejeitado). Nada gerado por IA chega ao cliente sem regra explícita de revisão humana.

## 3. Como saber que ficou pronto

- Um cliente novo, sem treinamento e sem ligar para o gerente, entende em menos de 30 segundos o estado do projeto e conclui uma aprovação sozinho.
- Cinco funcionários e cinco clientes reais passam pelo protótipo navegável; mede-se tempo para localizar a pendência, taxa de aprovação sem ajuda, erros de permissão, retrabalho e quantas mensagens foram precisas para entender uma entrega.
- Um serviço novo do catálogo é modelado usando apenas módulos e blocos existentes, sem abrir uma única tela nova.
- Teste de vazamento: com credencial de cliente, nenhum endpoint devolve nota interna, custo, margem, credencial ou dado de outro cliente — verificado no backend, não na tela.
- O contrato de visibilidade está escrito, publicado e cada objeto do modelo de dados tem seu campo de visibilidade preenchido por padrão.
- Cada bloco na tela do cliente responde a uma destas três perguntas: o que preciso fazer, em que pé está, o que estou ganhando. O que não responde a nenhuma é removido.
- Nenhum conteúdo gerado por IA chegou ao cliente sem passar por um estado de revisão registrado no histórico.

## 4. Restrições — o que não pode ser sacrificado

- Permissão é regra de backend. Nunca esconder informação apenas na camada visual.
- Nada gerado por IA é publicado ao cliente sem revisão humana registrada.
- A navegação do cliente não passa de seis itens de menu, e nenhum é adicionado sem remover outro.
- O cliente só é acionado quando a decisão realmente depende dele; microetapa interna não gera notificação externa.
- Credencial e token não trafegam em tarefa, mensagem, comentário ou prompt.
- A identidade visual atual não é redesenhada nesta frente de trabalho.
- Nenhuma linha de código de produção antes do protótipo navegável testado com usuários reais.

## 5. Em aberto — pergunte antes de assumir

- Comprar versus construir ficou sem resposta e nenhum conselheiro trouxe dado — foi levantado só como suposição. Antes das três semanas de modelagem, gaste dois dias testando se um portal de cliente pronto cobre o MVP de aprovações e timeline; se cobrir, boa parte deste parecer vira configuração e não desenvolvimento.
- O número 10 a 15 módulos é arbitrário e eu o reproduzi porque dá um alvo concreto à equipe. Ele deve sair do faturamento real dos últimos doze meses, não de uma lista bonita — provavelmente 80% da receita cabe em cinco módulos, e começar por esses cinco é mais honesto.
- Recomendei começar pelo modelo de dados a um time que já está frustrado por não ver tela pronta. Existe risco real de três semanas sem entregável visível matarem a iniciativa; se isso for provável no seu contexto, faça o protótipo navegável de duas telas — pendências e aprovação — em paralelo, como prova de vida.
- Endossei o teste dos 30 segundos sem que ninguém tenha definido como medi-lo. Sem um roteiro escrito de teste com cinco clientes, esse número vira frase de efeito que qualquer um declara cumprida.

## 6. Divergências que já foram resolvidas, e por quê

### Quantos blocos e itens de menu na casa do cliente

- **Ficou:** Três macro-áreas como espinha mental e no máximo seis itens de menu (Início, Projetos, Aprovações, Resultados, Arquivos, Conta — integrações moram dentro de Conta como checklist de configuração). Os cinco blocos de C viram o conteúdo da tela Início.
- **Critério:** O menu é dimensionado pelo tempo de permanência do usuário, não pela completude do sistema. Se o cliente entra por poucos minutos e para resolver pendência, nove portas competindo com a pendência aumentam o custo de encontrar a única coisa que importa. Os itens cortados não somem: são estados dentro de Projetos e Conta.

### Analytics e integrações: construir nativo ou embedar

- **Ficou:** Separar as duas funções: a plataforma constrói conectar/monitorar (conta conectada, permissões, saúde, reconexão), porque isso é pendência recorrente do cliente e sem isso a agência trava; a renderização de métricas começa embedada e só vira nativa quando ficar provado que o cliente olha e que o embed não atende.
- **Critério:** Uma coisa é o portal ser a fonte de verdade sobre o estado da conexão — informação que só existe ali. Outra é reimplementar visualização que ferramenta madura já entrega. Construir o primeiro é necessidade; construir o segundo antes de evidência de uso é o caminho mais curto para o monólito.

### Padronização brutal em blocos universais versus jornadas específicas por tipo de serviço

- **Ficou:** Vocabulário de blocos fechado e universal na camada de apresentação; variação permitida apenas na camada de template de projeto (quais módulos, etapas e marcos). Um projeto de aplicativo pode ter mais marcos e um bloco de ambiente de teste; não pode ter uma tela própria.
- **Critério:** As duas posições atacam camadas diferentes e por isso cabem juntas. O limite fica onde o custo aparece: variação em dado e configuração é barata e não quebra nada; variação em tela multiplica manutenção por número de serviços, e o catálogo é declaradamente enorme.

### Visão interna: mural por cliente ou fila por departamento

- **Ficou:** Duas portas de entrada no interno sobre os mesmos dados: fila pessoal/por departamento como tela padrão de quem executa, mural por cliente como tela padrão de quem coordena e como consolidação.
- **Critério:** Não há oposição real: são recortes distintos do mesmo objeto. O erro seria eleger um deles como obrigatório para todos os papéis, e o custo de manter os dois recortes é baixo justamente porque o modelo de dados é único.

### Papel da IA na construção da interface

- **Ficou:** Duas frentes distintas, ambas mantidas: na construção, IA só prototipa depois do fluxo definido por humano; na operação, agente de IA é executor rastreável com revisão humana antes de qualquer publicação externa.
- **Critério:** As três falam de coisas diferentes que estavam sendo confundidas na pergunta — IA que desenha o produto e IA que trabalha dentro dele. Separá-las explicitamente é parte da resposta, porque essa confusão é uma das causas do impasse atual.

## 7. Premissas assumidas — nenhuma foi verificada

- A identidade visual está resolvida; o problema é arquitetura de informação, fluxo, permissões e experiência de uso.
- A maioria dos serviços do catálogo pode ser representada por combinações de etapas, entregáveis, aprovações e métricas reutilizáveis.
- O cliente típico tem pouco tempo e pouco domínio técnico: entra para saber o que precisa aprovar e se está dando resultado, e sai em poucos minutos.
- A plataforma será usada por múltiplos clientes, funcionários, prestadores e agentes de IA com níveis de acesso distintos.
- Existe backend com dados de projeto estruturáveis; o que está mal definido é a camada de apresentação e a regra de visibilidade.
- Há disposição para alocar um responsável humano de UX por algumas semanas antes de retomar o desenvolvimento.

## 8. Riscos levantados

- Vazamento de dado interno — nota, custo, margem, avaliação do cliente, credencial, dado de outro cliente — por permissão implementada só na interface.
- Escopo infinito: a equipe refaz telas para sempre porque "milhares de serviços" nunca para de crescer, e o produto vira um ERP antes de resolver o fluxo básico.
- Fadiga de aprovação: notificar o cliente ou pedir acesso dele a cada microetapa faz o portal ser abandonado e a cobrança voltar para o WhatsApp.
- Reconstruir nativamente integrações de analytics e redes sociais e criar um monólito de manutenção cara antes de validar que alguém olha aqueles números.
- Departamentos resistirem ao modelo comum e criarem status, campos e processos próprios, refragmentando o Hub.
- Métricas sem meta, contexto ou ação recomendada: impressionam na demo e pioram a compreensão do cliente.
- Publicação automática por agentes de IA antes de existir regra de revisão, enviando conteúdo errado ou confidencial ao cliente.
- Continuar tentando resolver por prompt: mais semanas gastas, mesma tela incompleta, equipe desmoralizada.

## 9. Como usar este briefing

- Trate a seção **Decisões firmes** como requisito já acordado. Não precisa
  reabrir, mas diga se alguma for tecnicamente inviável.
- **Não resolva em silêncio** nada da seção *Em aberto*. Quatro modelos não
  fecharam esses pontos; escolher um lado sem avisar transforma dúvida em
  decisão sem que ninguém tenha decidido. Pergunte.
- O número entre colchetes é quantos conselheiros sustentaram a afirmação.
  `[1 de 4]` é ideia de um só: use como hipótese, não como consenso.
- **Não se declare pronto** sem passar pelo *Como saber que ficou pronto*. Se
  algum item de lá não for verificável no seu contexto, diga isso em vez de
  contorná-lo.
- As **restrições** valem mesmo quando cumprir o objetivo ficaria mais fácil
  sem elas. Atalho que cumpre a letra e inviabiliza o uso não conta como feito.
- As **premissas** não foram verificadas por ninguém. Se alguma for barata de
  checar antes de codar, checar primeiro sai mais barato que refazer depois.
- Este documento é o *quê* e o *porquê*. O *como* é seu — as decisões técnicas
  de implementação não foram tomadas aqui.

## 10. Procedência

- **Conselheiros que responderam:** 3 — GPT, Gemini, DeepSeek
- **Faltaram:** Perplexity (Respondeu fora do formato — afirmacoes: Too big: expected array to have <=12 items); Claude (Falhou — Streaming is required for operations that may take longer than 10 minutes. See https://github.com/anthropics/anthropic-sdk-typescript#long-requests for more details)
- Um conselheiro ausente é uma perspectiva que não entrou. Considere isso ao
  pesar o quanto este documento cobre.
- **Rodada de:** 03 de agosto de 2026
- **Tempo até todos responderem:** 47 s
- **Custo desta rodada:** US$ 0.2676
- **Distribuição das afirmações por conselheiro:** C 50% · D 33% · E 17%
