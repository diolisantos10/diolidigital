# Hub do Cliente: projeto de UX interna e externa da agência

**Objetivo:** Ao fim do projeto existe um contrato de visibilidade escrito, um modelo de objetos publicado, uma biblioteca de blocos universais e um protótipo navegável testado com 5 funcionários e 5 clientes reais, aprovado como especificação única para a construção do Hub.

> Projeto derivado de um parecer de conselho de IAs. As decisões vêm de lá;
> o cronograma, as fases e os recursos foram escritos aqui. O que o conselho
> deixou em aberto virou decisão pendente — não foi fechado por ninguém.

## Pedido original

Olá boa noite tudo bem Eu tô com um novo projeto de criar uma agência digital na verdade ela já tá criada que vai oferecer milhares de serviços todos voltados ao digital então tudo que diz respeito a marketing digital tudo que diz respeito à criação de aplicativo criação de ambiente digitais sites Imagina aí o cardápio mais completo que uma agência digital pode construir hoje em dia oferecendo diversos tipos de serviços para diversos tipos de cliente que vai desde um restaurante até uma empresa de tecnologia Mas a gente não é tão voltado a desenvolvimento de software essas coisas no máximo que a gente faz é um aplicativo ou eu não vou fazer vão falar sistema mas acho que no máximo aplicativo nosso qualquer marca que tinha comunicação e enfim e aí eu tô tendo uma dificuldade gigantesca que uma das partes da nossa interface Então a gente tem a interface interna que é onde todos os funcionários e as residências artificiais operam cada um com seu departamento e a interface o dashboard do usuário Onde espelha exatamente o que tá sendo construído em cima do projeto dele porém só a parte que diz respeito a o que ele tem que fazer por exemplo aprovações é ver como tá a timeline do projeto deles status enfim e aqui que dá um nó Porque eu tô tentando criar com inteligência artificial e esse dashboard não saio ele sai incompleto ou não sai de forma adequada tem as coisas que o próprio cliente tem que integrar as integrações de todos os aplicativos de analirem de redes sociais e tudo que diz respeito a uma agência de marketing digital e tá muito nebuloso a gente pode sair confuso sim e o meu time não consegue acertar Então vem aqui pedir ajuda para você para criar um desenho de um interface tanto a interface do lado do cliente quanto a interface do lado do projeto desse cliente então só para ficar claro cada cliente tem um dashboard interno onde todas as áreas elas alimentam esse dashboard então cada área trabalha de forma independente mas o dashboard é como se fosse a casinha do cliente ali o mural dele onde todas as áreas interagem e deixam lá suas entregas então é o Hub ali do cliente tem coisas do lado da agência que é só dizer respeito e só tem que ser visto pelos internamente tem um lado que tem que ser olhado externamente eu não tô falando aqui de como que eu posso falar de a identidade visual já tá muito certinho não precisa mudar que eu falo mesmo é de e o ex o que eu tô falando aqui é sobre You X and que é use as Experience que tá muito abaixo do esperado E aí eu preciso de um desenho um projeto para que eu peça para as minhas para minha equipe construir o que abra a mente deles enfim eu preciso de ajuda em relação a isso e um desenho um projeto para para essa esse essa demanda que tá não tá não tá dando certo até agora

## Escopo — o que este projeto inclui

- Modelo de dados comum (Cliente, Usuário, Contrato, Projeto, Módulo, Marco, Tarefa, Entregável, Versão, Aprovação, Decisão, Mensagem, Arquivo, Métrica, Integração, Evento de auditoria) com campo de visibilidade obrigatório em cada objeto
- Contrato de visibilidade por persona, escrito e publicado, aplicável no backend
- Consolidação do catálogo em módulos de serviço reutilizáveis e templates de projeto compostos por módulos, etapas, entregáveis, aprovações e métricas
- Vocabulário fechado de blocos universais da camada do cliente (Aprovação, Entrega, Marco, Métrica, Pendência do cliente, Decisão registrada)
- Arquitetura de informação do portal do cliente com três macro-áreas e no máximo seis itens de menu
- Arquitetura de informação do interno com duas portas: fila por pessoa/departamento e mural por cliente
- Fluxo detalhado do objeto Aprovação (Aprovar, Solicitar ajustes, Tenho uma dúvida, versionamento, registro de autor/data/decisão)
- Fluxo de conectar e monitorar integrações como checklist dentro de Conta
- Regra de estados e revisão humana para saída de agentes de IA
- Protótipo navegável clicável do portal do cliente e das duas visões internas
- Roteiro escrito de teste de usabilidade e rodada com 5 funcionários e 5 clientes reais
- Prova de conceito de dois dias sobre comprar versus construir
- Especificação de handoff para a equipe de desenvolvimento

## Fora de escopo — não faça

- Redesenho da identidade visual (cores, tipografia, logo) — está fora desta frente por decisão firme
- Código de produção do Hub: nenhuma linha antes do protótipo testado
- Dashboards nativos de analytics — no MVP a renderização de métricas é embedada de ferramenta externa
- Módulo financeiro para o cliente (custos, margens, faturamento) na camada externa
- Automações avançadas e orquestração de agentes de IA além do estado de revisão
- Integrações completas com todas as plataformas: nesta frente só o fluxo de conectar/monitorar e a lista de contas suportadas
- Sistema de gestão interna de RH, ponto ou folha
- Migração de dados históricos de projetos antigos

## Fases

### Fase 1. Fase 0 — Prova de vida e teste de comprar versus construir

**Quando:** Semana 1, dia 1 (04/08/2026) → Semana 1, dia 5 (08/08/2026)

**Objetivo:** Decidir com dado se um portal de cliente pronto cobre o MVP e dar à equipe frustrada um sinal visível de progresso em poucos dias, antes de qualquer semana de modelagem.

| O quê | Quem | Como | Onde | Entrega | Esforço |
| --- | --- | --- | --- | --- | --- |
| Listar os requisitos mínimos do MVP em uma folha só | dono do projeto | Extrair do parecer as seis capacidades (projetos e marcos, entregáveis versionados, aprovações, timeline, mensagens ancoradas, permissões de visibilidade) e transformar em checklist de sim/não para avaliação de ferramentas | Documento compartilhado do projeto, pasta 'Hub do Cliente/00-Decisões' | Checklist de 6 capacidades com critérios de aceite por linha | 3h |
| Testar de 3 a 5 portais de cliente prontos contra o checklist | responsável de UX | Abrir trial de cada ferramenta e tentar executar um caso real: criar projeto, subir entregável versionado, pedir aprovação, esconder nota interna do cliente | Trials das ferramentas candidatas + planilha comparativa | Planilha comparativa preenchida com evidência (print por capacidade) e nota por ferramenta | 2 dias |
| Testar o limite de permissão de cada candidata | dev backend sênior | Criar usuário cliente de teste e verificar se campos internos (nota, custo, margem) ficam fora da API/exportação, não só da tela | Ambiente de trial de cada ferramenta | Relato de 1 página por ferramenta dizendo se a permissão é de backend ou de tela | 1 dia |
| Extrair a lista real de serviços vendidos nos últimos 12 meses | dono do projeto | Puxar notas fiscais, contratos e propostas fechadas de ago/2025 a jul/2026 e ordenar por receita | Financeiro / sistema de faturamento | Planilha de serviços vendidos com receita por serviço e receita acumulada em percentual | 1 dia |
| Prototipar em baixa fidelidade as duas telas de prova de vida | responsável de UX | Desenhar em Figma, sem código, apenas Pendências e detalhe de Aprovação, usando a identidade visual já existente | Figma, arquivo 'Hub Cliente — prova de vida' | Duas telas estáticas navegáveis entre si, apresentadas à equipe | 1,5 dia |

**Entregáveis:**
- Checklist do MVP com 6 capacidades
- Planilha comparativa comprar x construir com evidências e teste de permissão
- Planilha de receita por serviço dos últimos 12 meses
- Duas telas de prova de vida (Pendências e Aprovação) em Figma

**Só está pronta quando:**
- A planilha comparativa tem, para cada ferramenta avaliada, um sim/não com print por cada uma das 6 capacidades — nenhuma linha em branco
- Existe um relato escrito dizendo, por ferramenta, se a filtragem de dado interno acontece no backend ou apenas na tela
- A planilha de receita mostra qual percentual de faturamento está concentrado nos 5 serviços mais vendidos
- As duas telas de prova de vida foram apresentadas à equipe em reunião e estão salvas em Figma com link compartilhado

### Fase 2. Fase 1 — Modelo de dados, visibilidade e módulos

**Quando:** Semana 2, dia 1 (10/08/2026) → Semana 2, dia 5 (14/08/2026) — depende da fase 1

**Objetivo:** Criar o documento que abre a cabeça da equipe: os objetos, o campo de visibilidade de cada um e os módulos reutilizáveis que substituem 'milhares de serviços'.

| O quê | Quem | Como | Onde | Entrega | Esforço |
| --- | --- | --- | --- | --- | --- |
| Especificar os 16 objetos do modelo comum | responsável de UX (com revisão do dev backend sênior) | Uma página por objeto: nome, campos, relações, ciclo de estados e dono do dado; nada de diagrama sem definição de campo | Documento 'Modelo de Objetos v1' na pasta do projeto | Documento com 16 fichas de objeto e diagrama de relações | 3 dias |
| Escrever o contrato de visibilidade | dev backend sênior | Tabela objeto x persona (cliente, executor, coordenador, prestador, agente de IA) com os três estados: interno, aguardando publicação, compartilhado com o cliente, e o valor padrão de cada objeto | Documento 'Contrato de Visibilidade v1', publicado no wiki interno | Tabela completa, sem célula vazia, com padrão definido por objeto | 2 dias |
| Agrupar o catálogo em módulos de serviço a partir da receita real | dono do projeto | Pegar a planilha de receita da Fase 0, agrupar serviços que compartilham etapas/entregáveis/aprovações e marcar quais módulos cobrem 80% da receita | Planilha 'Módulos de Serviço', aba por módulo | Lista de módulos derivada de receita, com os módulos prioritários marcados | 1,5 dia |
| Definir os estados dos agentes de IA como executores | responsável de UX | Descrever no modelo de objetos o objeto Tarefa/Entregável com campos agente, instrução, fonte usada, responsável humano e estado (rascunho, revisão interna, pronto para o cliente, publicado, rejeitado) | Documento 'Modelo de Objetos v1', seção Execução por IA | Seção escrita com máquina de estados e regra de quem pode mover cada transição | 半 — 4h |
| Rodar workshop de validação do modelo com os departamentos | dono do projeto | Sessão de 2h por bloco de departamentos: cada área tenta descrever um projeto real usando só os objetos e módulos definidos e aponta o que não cabe | Sala de reunião / call gravada | Ata com lista de lacunas apontadas e decisão de aceitar ou recusar cada uma | 1 dia |

**Entregáveis:**
- Documento 'Modelo de Objetos v1' com 16 fichas e diagrama
- Documento 'Contrato de Visibilidade v1' publicado
- Planilha 'Módulos de Serviço' derivada da receita real
- Máquina de estados de execução por agentes de IA
- Ata do workshop com lacunas e decisões

**Só está pronta quando:**
- Cada um dos 16 objetos tem ficha com campos, relações e campo de visibilidade com valor padrão preenchido
- O contrato de visibilidade está publicado no wiki interno em link acessível a toda a equipe
- Cada módulo da planilha aponta para pelo menos um serviço realmente faturado nos últimos 12 meses
- Existe ata registrando que ao menos um projeto real de cada departamento foi descrito usando apenas objetos e módulos existentes, com as exceções listadas nominalmente
- A máquina de estados da IA prevê explicitamente que nenhum estado leva a 'publicado' sem passar por 'revisão interna'

### Fase 3. Fase 2 — Fluxos, blocos universais e arquitetura de informação

**Quando:** Semana 3, dia 1 (17/08/2026) → Semana 3, dia 5 (21/08/2026) — depende da fase 2

**Objetivo:** Transformar o modelo em experiência: definir os blocos da camada do cliente, o fluxo de aprovação, o menu de seis itens e as duas portas do interno.

| O quê | Quem | Como | Onde | Entrega | Esforço |
| --- | --- | --- | --- | --- | --- |
| Especificar os 6 blocos universais | responsável de UX | Uma ficha por bloco: dado de origem, estados possíveis, ações disponíveis e a qual das três perguntas do cliente ele responde (o que faço / em que pé está / o que ganho) | Documento 'Biblioteca de Blocos v1' | 6 fichas de bloco com regra de uso e regra de exclusão | 2 dias |
| Detalhar o fluxo do objeto Aprovação ponta a ponta | responsável de UX | Fluxograma com os três caminhos (Aprovar, Solicitar ajustes, Tenho uma dúvida), obrigatoriedade de comentário no ajuste, geração de nova versão preservando a anterior e registro de autor/data/decisão | Documento 'Fluxo de Aprovação v1' + fluxograma no Figma | Fluxograma e texto cobrindo os casos de exceção (prazo vencido, aprovador ausente, aprovação parcial) | 1,5 dia |
| Fechar o mapa de navegação do cliente | responsável de UX | Definir Início, Projetos, Aprovações, Resultados, Arquivos, Conta e listar, item por item, o que fica como estado interno dentro de Projetos e Conta | Documento 'AI do Portal do Cliente' | Mapa de navegação com 6 itens e tabela do que foi absorvido em cada um | 1 dia |
| Definir as duas visões internas sobre os mesmos dados | responsável de UX | Especificar a fila por pessoa/departamento (filtros, ordenação, ações em lote) e o mural por cliente (timeline, entregáveis, aprovações, comunicação, métricas, integrações, área interna com notas e custos), indicando a tela padrão de cada papel | Documento 'AI do Interno' | Dois mapas de tela com papel padrão associado | 1,5 dia |
| Escrever a política de acionamento do cliente | dono do projeto | Listar quais eventos geram notificação externa e declarar que microetapas internas não geram; definir agrupamento de pendências em um resumo | Documento 'Política de Notificação ao Cliente' | Lista fechada de eventos notificáveis, com o restante marcado como silencioso | 4h |
| Especificar o checklist de integrações dentro de Conta | dev backend sênior | Para cada conta suportada: quem conectou, permissões concedidas, última sincronização, saúde e botão de reconectar; declarar OAuth/cofre de segredos como único caminho de credencial | Documento 'Integrações — conectar e monitorar' | Especificação do checklist com estados de conexão e regra de credencial | 1 dia |
| Escrever o roteiro do teste de usabilidade | responsável de UX | Definir as tarefas que o participante executa, o cronômetro do teste de 30 segundos (o que conta como 'entendeu o estado'), as perguntas e a planilha de coleta | Documento 'Roteiro de Teste v1' + planilha de coleta | Roteiro com tarefas, script de fala, definição operacional das 5 métricas e planilha vazia pronta | 1 dia |

**Entregáveis:**
- Biblioteca de Blocos v1 com 6 fichas
- Fluxo de Aprovação v1 com fluxograma e exceções
- Mapa de navegação do cliente com 6 itens
- Mapas das duas visões internas com papel padrão
- Política de Notificação ao Cliente
- Especificação do checklist de integrações
- Roteiro de teste de usabilidade e planilha de coleta

**Só está pronta quando:**
- Cada uma das 6 fichas de bloco declara a qual das três perguntas do cliente responde
- O fluxo de aprovação mostra que 'Solicitar ajustes' exige comentário e cria nova versão sem apagar a anterior
- O mapa de navegação do cliente tem exatamente 6 itens e cada item removido em relação a versões anteriores aparece como estado dentro de Projetos ou Conta
- A política de notificação lista nominalmente os eventos que acionam o cliente e marca todos os demais como silenciosos
- A especificação de integrações declara OAuth ou cofre de segredos como único meio de credencial e não prevê renderização nativa de analytics
- O roteiro de teste define em escrito como se cronometra e o que conta como sucesso no teste de 30 segundos

### Fase 4. Fase 3 — Protótipo navegável

**Quando:** Semana 4, dia 1 (24/08/2026) → Semana 5, dia 5 (04/09/2026) — depende da fase 3

**Objetivo:** Existir uma versão clicável, sem código de produção, do portal do cliente e das duas visões internas, montada só com os blocos e módulos definidos.

| O quê | Quem | Como | Onde | Entrega | Esforço |
| --- | --- | --- | --- | --- | --- |
| Montar os componentes dos 6 blocos em Figma | designer de produto | Criar componentes reutilizáveis com variantes de estado, aplicando a identidade visual atual sem alterá-la | Figma, biblioteca 'Blocos Hub' | Biblioteca de componentes publicada no Figma com variantes por estado | 4 dias |
| Montar as telas do portal do cliente | designer de produto | Início (pendências no topo, próximos marcos, entregas recentes, alertas), Projetos, Aprovações, Resultados com métrica embedada simulada, Arquivos e Conta com checklist de integrações — só com componentes da biblioteca | Figma, arquivo 'Portal do Cliente v1' | 6 telas mais os estados de detalhe, ligadas por protótipo clicável | 4 dias |
| Montar as telas internas | designer de produto | Fila por pessoa/departamento e mural por cliente, incluindo a área interna com nota, custo e margem visivelmente marcada como interna | Figma, arquivo 'Interno v1' | 2 telas principais mais estados, com marcação visual de visibilidade | 3 dias |
| Usar IA para gerar variações de microcópia e de arranjo dos blocos | responsável de UX | Depois de o fluxo estar fechado, pedir à IA variações de texto de pendência, de rótulo de botão de aprovação e de ordenação de blocos, e escolher manualmente | Ferramenta de IA da agência + arquivo Figma | Tabela de variações com a opção escolhida marcada e justificada em uma linha | 1 dia |
| Modelar um serviço novo do catálogo usando o protótipo | dono do projeto | Escolher um serviço que não foi usado como referência, montar seu template combinando módulos, etapas, entregáveis e aprovações e verificar se alguma tela nova foi necessária | Planilha de templates + arquivo Figma | Ficha do template do serviço novo com declaração de zero telas novas ou lista das que faltaram | 4h |
| Preparar o ambiente de teste com dados verossímeis | designer de produto | Popular o protótipo com nomes, projetos e entregáveis realistas de dois clientes fictícios, incluindo uma nota interna e um custo que não podem aparecer no lado cliente | Figma + planilha de dados de teste | Protótipo populado e roteiro de navegação para o facilitador | 1 dia |

**Entregáveis:**
- Biblioteca de componentes 'Blocos Hub' publicada
- Protótipo clicável do portal do cliente (6 telas + estados)
- Protótipo clicável das duas visões internas
- Tabela de variações de microcópia geradas por IA com escolha registrada
- Ficha do template de um serviço novo modelado sem tela nova
- Protótipo populado com dados de teste

**Só está pronta quando:**
- Todas as telas do portal do cliente são compostas exclusivamente por componentes da biblioteca 'Blocos Hub' — nenhuma tela sob medida
- A tela Início abre com a lista de ações pendentes acima de qualquer gráfico
- É possível, no protótipo, percorrer Aprovar, Solicitar ajustes e Tenho uma dúvida até o registro da decisão e ver a versão anterior preservada
- O serviço novo escolhido foi modelado com módulos e blocos existentes e a ficha declara zero telas novas (ou lista exatamente o que faltou)
- O protótipo interno mostra nota e custo em área explicitamente marcada como interna, ausente do protótipo do cliente
- Nenhuma linha de código de produção foi escrita até aqui — confirmado em revisão de repositório pelo dono do projeto

### Fase 5. Fase 4 — Teste com usuários reais e handoff

**Quando:** Semana 6, dia 1 (07/09/2026) → Semana 7, dia 5 (18/09/2026) — depende da fase 4

**Objetivo:** Provar com pessoas de fora do time que o portal se entende sozinho, corrigir o que falhar e entregar a especificação que a equipe vai construir.

| O quê | Quem | Como | Onde | Entrega | Esforço |
| --- | --- | --- | --- | --- | --- |
| Recrutar 5 clientes reais e 5 funcionários | dono do projeto | Convite direto por telefone a clientes ativos de perfis diferentes (ex.: restaurante, tecnologia, varejo) e escalonamento de 5 funcionários de departamentos distintos, com agenda de 45 minutos cada | Telefone / agenda compartilhada | Agenda fechada com 10 sessões marcadas e confirmadas | 1,5 dia |
| Rodar as 10 sessões de teste moderado | responsável de UX | Seguir o roteiro da Fase 2, cronometrando tempo até localizar a pendência e concluir aprovação sem ajuda, gravando tela e voz com consentimento | Call gravada ou presencial com protótipo em tela | 10 gravações e planilha de coleta preenchida com as 5 métricas por participante | 4 dias |
| Rodar o teste de vazamento no backend existente | dev backend sênior | Com credencial de usuário cliente de teste, chamar os endpoints atuais e as exportações e verificar retorno de nota interna, custo, margem, credencial e dado de outro cliente | Ambiente de staging + coleção de requisições | Relatório de teste de vazamento com lista de endpoints testados e resultado por endpoint | 2 dias |
| Consolidar achados e corrigir o protótipo | responsável de UX | Priorizar por frequência e gravidade, ajustar apenas o que impedir a conclusão autônoma da aprovação ou o entendimento do estado, sem criar telas novas | Figma + documento 'Achados e Correções' | Protótipo v2 e documento listando cada achado, decisão e status | 3 dias |
| Aplicar o filtro dos três blocos | responsável de UX | Percorrer bloco por bloco da tela do cliente perguntando a qual das três perguntas responde e remover o que não responder a nenhuma | Documento 'Achados e Correções', seção Remoções | Lista de blocos removidos com o motivo em uma linha cada | 4h |
| Montar o pacote de handoff para desenvolvimento | responsável de UX | Reunir modelo de objetos, contrato de visibilidade, biblioteca de blocos, fluxos, protótipo v2, política de notificação e critérios de aceite em um único índice navegável | Pasta 'Hub do Cliente/Handoff' + wiki interno | Índice de handoff com links funcionando para todos os artefatos | 1,5 dia |
| Apresentar o pacote à equipe e colher aceite formal | dono do projeto | Sessão de 2h de walkthrough com dev, design e coordenação, terminando com registro de aceite de cada responsável | Reunião gravada + ata assinada digitalmente | Ata de aceite com nome de cada responsável | 半 — 4h |

**Entregáveis:**
- Planilha de coleta preenchida com 10 participantes e 5 métricas
- Relatório de teste de vazamento por endpoint
- Protótipo v2 corrigido
- Documento 'Achados e Correções' com lista de remoções
- Pacote de handoff indexado
- Ata de aceite da equipe

**Só está pronta quando:**
- Ao menos 4 dos 5 clientes concluíram uma aprovação sozinhos, sem ajuda do facilitador e sem contato com gerente, registrado na planilha
- O tempo até identificar o estado do projeto está cronometrado por participante na planilha, com a mediana declarada
- O relatório de vazamento mostra, endpoint por endpoint, que credencial de cliente não retorna nota interna, custo, margem, credencial ou dado de outro cliente — ou lista as falhas com responsável e prazo de correção
- Cada bloco presente na tela do cliente no protótipo v2 tem, no documento, a pergunta que responde; os que não tinham foram removidos e estão na lista de remoções
- O menu do cliente no protótipo v2 continua com no máximo 6 itens
- O índice de handoff abre e todos os links levam a artefatos existentes, verificado por um dev que não participou da montagem
- Existe ata com aceite nominal de dev, design e coordenação

## Cronograma e marcos

| Marco | Quando | Como se sabe que chegou |
| --- | --- | --- |
| Decisão comprar versus construir tomada com dado | 08/08/2026 | Planilha comparativa preenchida com evidência e despacho escrito do dono do projeto escolhendo o caminho |
| Prova de vida entregue à equipe | 08/08/2026 | Duas telas (Pendências e Aprovação) apresentadas em reunião, link do Figma no canal do projeto |
| Modelo de dados e contrato de visibilidade publicados | 14/08/2026 | Dois documentos no wiki interno, com campo de visibilidade preenchido nos 16 objetos |
| Fluxos, blocos e navegação fechados | 21/08/2026 | Biblioteca de Blocos v1, Fluxo de Aprovação v1 e mapa de 6 itens de menu aprovados pelo dono do projeto |
| Protótipo navegável pronto e populado | 04/09/2026 | Link do protótipo clicável cobrindo portal do cliente e as duas visões internas, com dados de teste |
| 10 sessões de teste concluídas | 11/09/2026 | Planilha de coleta com 10 linhas preenchidas e 10 gravações arquivadas |
| Pacote de handoff aceito pela equipe | 18/09/2026 | Ata de aceite nominal e índice de handoff com links funcionando |

## Caminho crítico — onde o atraso custa a data final

- Fase 0 — se a decisão comprar versus construir não sair até 08/08, a Fase 1 pode estar modelando algo que seria configuração, e todo o resto empurra
- Fase 1 — modelo de objetos e contrato de visibilidade são insumo direto dos blocos e dos fluxos; sem eles a Fase 2 não começa e o protótipo não existe
- Fase 2 — a biblioteca de blocos e o fluxo de aprovação são o que o designer monta na Fase 3; atraso aqui atrasa protótipo e teste na mesma proporção
- Fase 3 — sem protótipo populado não há o que testar, e a restrição proíbe código antes do teste, então o projeto inteiro fica parado
- Fase 4 — o recrutamento de 5 clientes reais depende de agenda de terceiros; sessão não realizada empurra a data de handoff e o início do desenvolvimento

## Métricas de sucesso — como saber se valeu a pena

| Indicador | Hoje | Alvo | Como medir | Quando |
| --- | --- | --- | --- | --- |
| Taxa de aprovação concluída sem ajuda por clientes reais no protótipo | a levantar na Fase 4 (hoje as aprovações acontecem por WhatsApp, sem medição) | pelo menos 4 de 5 clientes no teste de setembro/2026 | Planilha de coleta do teste de usabilidade, coluna 'concluiu sem intervenção' | Uma vez na Fase 4 e novamente 30 dias após o Hub entrar em uso real |
| Tempo até o cliente declarar o estado do projeto (teste dos 30 segundos) | a levantar na Fase 4 | mediana abaixo de 30 segundos, conforme definição operacional escrita na Fase 2 | Cronômetro na sessão moderada, registrado por participante na planilha de coleta | Fase 4 e a cada rodada de teste subsequente |
| Serviços novos do catálogo modelados sem abrir tela nova | 0 hoje — não existe biblioteca de blocos | 100% dos serviços testados até o handoff (mínimo 1 na Fase 3, mais 3 nos 60 dias seguintes) | Ficha de template por serviço, campo 'telas novas necessárias' | A cada novo serviço adicionado ao catálogo |
| Endpoints que devolvem dado interno a credencial de cliente | a levantar na Fase 4 pelo relatório de vazamento | zero antes de qualquer liberação a cliente real | Relatório de teste de vazamento executado no backend/staging | Fase 4 e a cada release depois |
| Percentual da receita dos últimos 12 meses coberta pelos módulos priorizados | a levantar na Fase 0 (planilha de faturamento) | módulos priorizados cobrindo pelo menos 80% da receita | Planilha 'Módulos de Serviço' cruzada com faturamento | Fase 1 e revisão trimestral |
| Mensagens trocadas para o cliente entender uma entrega | a levantar na Fase 4 (contagem nas sessões e amostra de conversas atuais) | redução em relação à linha de base medida, aferida 60 dias após uso real | Contagem de mensagens por entrega no teste e depois no histórico do Hub | Fase 4 e 60 dias após entrada em uso |
| Conteúdo gerado por IA publicado ao cliente sem estado de revisão registrado | a levantar (hoje não há registro de estado) | zero | Consulta ao histórico de eventos de auditoria do objeto Entregável | Semanalmente após o Hub entrar em uso |

## Recursos necessários

| Item | Para quê | Como obter | Custo |
| --- | --- | --- | --- |
| Responsável humano de UX dedicado (arquitetura de informação e fluxos) | Escrever modelo, blocos, fluxos e conduzir os testes — o parecer proíbe que a IA seja autora da arquitetura | Alocar pessoa interna em dedicação integral por 7 semanas ou contratar freelancer sênior | a levantar (interno: custo de oportunidade de 7 semanas; externo: ordem de dezenas de milhares de reais) |
| Designer de produto | Montar biblioteca de componentes e protótipo navegável em Figma | Alocar do time interno de design por 3 semanas | a levantar (alocação interna) |
| Dev backend sênior | Revisar modelo de dados, escrever contrato de visibilidade e rodar teste de vazamento | Alocar meio período por 4 semanas dentro do time | a levantar (alocação interna) |
| Licença Figma com protótipo compartilhável | Biblioteca de componentes e protótipo clicável para teste | Assinar ou usar plano existente da agência | ordem de centenas de reais/mês |
| Trials de portais de cliente prontos | Testar comprar versus construir na Fase 0 | Cadastro gratuito nos trials das candidatas | R$ 0 a algumas centenas de reais |
| 5 clientes reais dispostos a 45 minutos de teste | Validar o protótipo com quem realmente usa | Convite direto do dono do projeto, com contrapartida simbólica se necessário | a levantar (eventual cortesia/desconto) |
| Planilha de faturamento dos últimos 12 meses | Derivar os módulos de serviço de dado real, não de lista bonita | Pedir ao financeiro/contabilidade | R$ 0 |
| Ambiente de staging com credencial de cliente de teste | Rodar o teste de vazamento no backend | Provisionar com o dev backend sênior no ambiente atual | a levantar |
| Ferramenta de gravação de sessão | Registrar as 10 sessões de teste para revisão posterior | Usar gravação da ferramenta de call já contratada | R$ 0 a centenas de reais |

**Orçamento total estimado:** a levantar — o único item potencialmente relevante é a contratação (ou alocação) do responsável de UX; ferramentas e trials somam ordem de centenas a poucos milhares de reais

## Decisões pendentes — travam o plano

- **Comprar um portal de cliente pronto ou construir do zero**
  - quem decide: dono do projeto, com base na planilha comparativa e no teste de permissão da Fase 0
  - até: 08/08/2026 — trava a Fase 1, que pode virar configuração em vez de modelagem
  - se atrasar: A equipe pode passar semanas especificando desenvolvimento que uma ferramenta já entregaria, ou o contrário: escolher ferramenta que não suporta permissão de backend e refazer tudo depois
- **Quantos e quais módulos de serviço entram (o número 10–15 do parecer é arbitrário e deve sair do faturamento real)**
  - quem decide: dono do projeto junto ao responsável comercial/financeiro
  - até: até 12/08/2026, dentro da Fase 1 — trava a planilha de módulos e, com ela, os templates de projeto
  - se atrasar: Blocos e templates são desenhados para um catálogo imaginário; a Fase 2 fica sem base e o teste de 'serviço novo sem tela nova' perde sentido
- **Rodar ou não o protótipo de duas telas em paralelo à modelagem como prova de vida contínua (risco de três semanas sem entregável visível)**
  - quem decide: dono do projeto, ouvindo o responsável de UX sobre o custo de dividir atenção
  - até: até 10/08/2026, início da Fase 1
  - se atrasar: Se o time desmotivar no meio da Fase 1, a iniciativa perde patrocínio interno e volta ao ciclo de tentar resolver por prompt
- **Definição operacional do teste dos 30 segundos: o que exatamente o cliente precisa dizer para contar como 'entendeu o estado'**
  - quem decide: responsável de UX, homologado pelo dono do projeto
  - até: até 21/08/2026, fim da Fase 2 — trava o roteiro de teste e, por consequência, a Fase 4
  - se atrasar: O critério de pronto vira frase de efeito declarada cumprida sem evidência, e o teste com 10 pessoas perde valor comparativo
- **Quem é o responsável humano de UX: alocação interna ou contratação externa**
  - quem decide: dono do projeto
  - até: até 07/08/2026 — a Fase 1 não começa sem essa pessoa nomeada
  - se atrasar: Todo o cronograma desliza dia a dia, porque as Fases 1 a 4 têm o UX como responsável majoritário

## Riscos do plano

- **Três semanas sem tela pronta desmotivam um time já frustrado e a iniciativa morre**
  - sinal de alerta: Perguntas repetidas do tipo 'quando vamos ver a tela?' e queda de presença nos workshops da Fase 1
  - mitigação: A Fase 0 já entrega duas telas de prova de vida em 5 dias e cada fase termina com artefato visível apresentado em reunião
  - plano B: Antecipar parte da Fase 3 (componentes dos blocos de Aprovação e Pendência) para rodar em paralelo com a Fase 1, mantendo o fluxo travado até a Fase 2 aprovar
- **Vazamento de dado interno por permissão implementada só na interface**
  - sinal de alerta: Especificação de tela que diz 'ocultar campo para cliente' sem regra correspondente no contrato de visibilidade
  - mitigação: Contrato de visibilidade escrito na Fase 1 e teste de vazamento por endpoint na Fase 4 como critério de aceite
  - plano B: Bloquear qualquer liberação a cliente real até o relatório de vazamento fechar em zero, com correções priorizadas antes de qualquer feature nova
- **Escopo infinito: a equipe passa a desenhar tela por serviço e o produto vira ERP**
  - sinal de alerta: Pedido de 'uma tela específica para o serviço X' aparecendo em reunião ou no Figma
  - mitigação: Vocabulário fechado de blocos e regra de que serviço novo é template, não tela; teste de modelagem de serviço novo como critério de aceite da Fase 3
  - plano B: Levar todo pedido de tela nova ao dono do projeto como proposta de bloco novo para todos, com decisão registrada e prazo
- **Fadiga de aprovação: cliente notificado a cada microetapa abandona o portal e volta ao WhatsApp**
  - sinal de alerta: Lista de eventos notificáveis crescendo além do definido, ou cliente reclamando de excesso de aviso no teste
  - mitigação: Política de Notificação com lista fechada de eventos externos na Fase 2 e agrupamento de pendências em resumo
  - plano B: Reduzir a lista a aprovações e bloqueios de projeto apenas, e medir novamente a taxa de retorno ao portal
- **Departamentos recusam o modelo comum e recriam status e campos próprios**
  - sinal de alerta: Área mantendo planilha paralela ou pedindo campo exclusivo no workshop da Fase 1
  - mitigação: Workshop de validação com cada departamento descrevendo projeto real no modelo, e ata registrando as exceções aceitas ou recusadas
  - plano B: Dono do projeto decide como instância final e o campo exclusivo só entra se for útil a pelo menos dois departamentos
- **Os 5 clientes reais não aparecem ou desmarcam, empurrando o handoff**
  - sinal de alerta: Menos de 5 confirmações até 04/09/2026
  - mitigação: Recrutar 8 convidados para garantir 5 sessões, com agenda confirmada por telefone na semana anterior
  - plano B: Rodar com 3 clientes reais e complementar com 2 pessoas leigas fora da agência, declarando a limitação na planilha de coleta
- **Métricas embedadas sem meta e sem contexto impressionam na demo e confundem o cliente**
  - sinal de alerta: Bloco de Métrica no protótipo sem meta, período de comparação nem ação recomendada
  - mitigação: Ficha do Bloco de Métrica exige meta, comparação e frase de ação; blocos que não responderem à pergunta 'o que estou ganhando' são removidos na Fase 4
  - plano B: Remover a área Resultados do MVP e manter apenas link para o relatório externo até haver meta definida por módulo

## Comece por aqui — primeiras 48 horas

1. Nomear por escrito, no canal do projeto, quem é o responsável humano de UX e quem é o dev backend sênior da frente — com nome, não com área
2. Pedir ao financeiro a planilha de serviços faturados de ago/2025 a jul/2026, ordenada por receita, com prazo de entrega em 48h
3. Criar a pasta 'Hub do Cliente' com as subpastas 00-Decisões, 01-Modelo, 02-Fluxos, 03-Protótipo, 04-Testes e Handoff, e colar nela o parecer como documento de referência
4. Escrever o checklist das 6 capacidades do MVP em uma página e abrir os trials de 3 a 5 portais de cliente prontos ainda hoje
5. Marcar na agenda, para 08/08/2026, a reunião de decisão comprar-versus-construir e a apresentação das duas telas de prova de vida
6. Convidar por telefone 8 clientes ativos de perfis diferentes para o teste da semana de 07/09/2026, garantindo margem para desmarcações

## Como usar este projeto

- As **decisões pendentes** travam as fases que dependem delas. Resolva-as
  com quem tem autoridade antes de começar a fase, ou registre por escrito
  que seguiu sem resolver e por quê.
- **Só está pronta quando** é critério de aceite, não sugestão. Fase sem o
  critério cumprido não é fase entregue.
- Estimativas são grosseiras de propósito. Corrija-as com o que aprender na
  fase 1 antes de prometer prazo a alguém.

_Projeto gerado em 03 de agosto de 2026._
