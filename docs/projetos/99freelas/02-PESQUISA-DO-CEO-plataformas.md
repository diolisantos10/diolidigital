# Pesquisa do CEO — o que cada plataforma permite de automacao

> Trazido pelo CEO em 07/08/2026, extraido integro do arquivo Plataformas.docx.
> Fonte primaria da frente de marketplaces: e daqui que sai a ordem de ataque
> e o que cada adaptador tem direito de fazer. Nao editar — leitura, nao versao.


Sim. Fui aos termos e páginas oficiais atuais das quatro plataformas e a diferença entre elas é bem grande.
Resumo executivo
Plataforma
Robô no navegador
API oficial
IA analisar/escrever
Envio 100% automático
Minha classificação
Upwork
❌ Sem autorização
✅ Sim
✅ Sim
🟡 Só dentro do uso/API aprovado
Melhor candidata
Freelancer.com
❌ Sem autorização expressa
✅ Sim
✅ Sim
🟡 Possível via API autorizada
Muito promissora
Workana
❌ Termos proíbem crawling/scraping automatizado
Não encontrei API pública de marketplace
✅ Sim, fora da plataforma
🔴 Não recomendo
Assistida
Fiverr
❌ Proibição explícita de bots/automação não autorizada
Não há API pública tradicional para esse fluxo
✅ Sim, fora da plataforma
🔴 Não
Inbound assistida
A grande conclusão é: Upwork e Freelancer.com são as duas onde vale investir para tentar chegar a uma operação realmente automatizada. Workana e Fiverr devem ficar com IA preparando tudo e humano realizando a ação na plataforma.

1. Upwork — 🟢 melhor cenário
A Upwork é extremamente clara.
Ela considera bot/automação qualquer script, programa, extensão ou serviço que:
envie requisições automaticamente;
colete dados;
execute ações mais rápido ou frequentemente que um humano;
monitore vagas;
faça auto-refresh;
use RPA/macros;
interaja com páginas da Upwork.
E diz explicitamente que automação não autorizada pode gerar aviso, restrição temporária ou bloqueio permanente da conta. (Suporte Upwork)
Mas existe um caminho oficial
A própria Upwork diz:
Se você deseja automatizar parte do workflow, solicite uma API key.
Eles analisam:
a conta;
o caso de uso;
quais permissões serão concedidas.
A API pode ser solicitada inclusive por freelancers e proprietários de agência para integrar a Upwork aos seus sistemas internos. (Suporte Upwork)
Isso é praticamente o nosso caso.
A API é bem completa
A documentação mostra recursos para:
jobs;
pesquisas;
freelancers/agências;
propostas;
mensagens;
contratos;
equipes.
Existem inclusive objetos específicos de VendorProposal, que é a candidatura enviada pelo freelancer, e permissões relacionadas a propostas. (HYPERLINK "https://www.upwork.com/developer/documentation/graphql/api/docs/index.html?utm_source=chatgpt.com" \o "API Documentation"Upwork)
Então tecnicamente nossa arquitetura poderia ficar:
Upwork API
↓
novas vagas
↓
OpenAI analisa
↓
score
↓
precificação
↓
OpenAI escreve proposta
↓
API / fluxo autorizado Upwork
↓
proposta
Porém existe uma ressalva enorme
Mesmo com API Key, a Upwork diz explicitamente que algumas práticas continuam proibidas, incluindo:
spam de propostas ou convites.
(Suporte Upwork)
Portanto, não podemos criar:
100 vagas
→ 100 candidaturas automáticas
Mas podemos propor à Upwork algo como:
100 vagas encontradas
↓
OpenAI qualifica
↓
12 realmente compatíveis
↓
12 propostas individualizadas
Isso é muito mais defensável.
Minha decisão
Prioridade máxima.
O próximo passo da agência deveria ser solicitar uma API Key descrevendo especificamente:
Sistema interno da própria agência para identificar oportunidades relevantes, analisar aderência e auxiliar na gestão de candidaturas individualizadas.
Depois descobrimos exatamente quais scopes a Upwork autorizará.

2. Freelancer.com — 🟢/🟡 muito interessante
Aqui existe uma peculiaridade.
O Freelancer.com possui uma API oficial enorme, com sandbox e SDKs, e literalmente promove:
automação dos processos de negócio em escala.
(Freelancer API)
A documentação oficial da API diz que aplicações podem integrar os serviços da Freelancer.com e concede uma licença limitada para utilização da API desde que os termos sejam cumpridos. (Freelancer)
Então parece fantástico.
Porém os Termos Gerais dizem:
Você não pode utilizar:
robot;
spider;
scraper;
qualquer meio automatizado;
para acessar o site — e eles deixam explícito:
inclusive acesso à API —
sem autorização expressa por escrito.
(Freelancer)
Isso é importantíssimo.
Como interpretar isso
Não significa que a API seja proibida.
Significa que:
o acesso automatizado precisa estar dentro da autorização/licença da Freelancer.com.
E eles possuem justamente uma API oficial para isso.
Então:
❌ Ruim
Playwright
↓
login
↓
scraping
↓
auto-bid
✅ Caminho correto
Freelancer API
↓
autorização oficial
↓
projetos
↓
OpenAI
↓
qualificação
↓
bid
A própria política de privacidade também reconhece aplicações de terceiros conectadas à conta via API e diz que, conforme as permissões concedidas, elas podem realizar ações em nome do usuário. (Freelancer)
Minha decisão
Eu colocaria Freelancer.com como segunda prioridade depois da Upwork.
Mas antes de ativar auto-bid:
Obter/API authorization claramente associada ao nosso aplicativo e, idealmente, confirmar com eles que o uso inclui gerenciamento automatizado de bids da própria conta.

3. Workana — 🔴 automação de captura é expressamente problemática
Aqui mudou bastante minha avaliação depois de ler os termos completos.
A Workana diz explicitamente que o usuário não pode:
utilizar robô, spider, processos manuais ou automáticos ou dispositivos para mineração de dados, crawling, scraping ou indexação do site.
(HYPERLINK "https://help.workana.com/hc/pt/articles/360041499974-TERMOS-E-CONDI%25C3%2587%25C3%2595ES-DE-USO-DA-WORKANA?utm_source=chatgpt.com" \o "TERMOS E CONDIÇÕES DE USO DA WORKANA – Portugués"Workana Help)
Ou seja, um agente fazendo:
entra na Workana
↓
varre 500 projetos
↓
extrai títulos
↓
abre projetos
↓
coleta briefings
é exatamente o tipo de comportamento coberto pela proibição.
Também há proibição expressa de spam
Eles dizem:
publicar repetidamente a mesma mensagem ou mensagens similares — spam — é estritamente proibido.
(HYPERLINK "https://help.workana.com/hc/pt/articles/360041499974-TERMOS-E-CONDI%25C3%2587%25C3%2595ES-DE-USO-DA-WORKANA?utm_source=chatgpt.com" \o "TERMOS E CONDIÇÕES DE USO DA WORKANA – Portugués"Workana Help)
E links externos?
Muito rígido também.
A Workana proíbe:
telefone;
WhatsApp;
e-mail;
LinkedIn;
redes sociais;
links externos;
links diretos do Behance;
durante o relacionamento protegido pela plataforma. (HYPERLINK "https://help.workana.com/hc/pt/articles/360040841214-Pol%C3%ADticas-da-Workana?utm_source=chatgpt.com" \o "Políticas da Workana – Portugués"Workana Help)
Portanto nosso link do briefing também não entra.

O envio automático em si é proibido?
Aqui existe uma nuance.
Os termos que encontrei proíbem explicitamente:
robô/processos automáticos para mineração, crawling, scraping e indexação.
Não encontrei uma frase dizendo literalmente:
“É proibido software preencher e clicar em Enviar Proposta.”
Então eu não diria que existe uma proibição textual específica do clique automático.
Mas existe um problema:
Para o robô descobrir os projetos, ler a página e decidir onde enviar, ele já precisaria realizar uma atividade automatizada que os termos restringem.
Além disso, não encontrei uma API pública oficial da Workana para o marketplace. As páginas “API” que aparecem são páginas para contratar freelancers especialistas em APIs, não uma API da Workana. (WORKANA)
Minha decisão
Workana:
❌ scanner automático
❌ scraping
❌ Computer Use navegando autonomamente
❌ link briefing
✅ IA analisa projeto fornecido ao sistema
✅ IA precifica
✅ IA escreve proposta
✅ humano cola/envia
Ou pedir autorização formal à Workana.

4. Fiverr — 🔴 a mais explícita contra bots
Aqui não existe muita zona cinzenta.
Os Termos atuais da Fiverr dizem expressamente que o usuário não pode usar:
software de automação (bots), hacks, mods ou software de terceiros não autorizado projetado para modificar o site.
E também:
robot, spider, crawler ou qualquer processo/dispositivo automático para acessar, minerar, realizar scraping, monitorar, recuperar, extrair ou coletar conteúdo/dados do site.
(Fiverr.com)
Essa é uma proibição muito mais explícita que a do 99Freelas.
Portanto:
Não faria
OpenAI Computer Use
+
Playwright
+
Fiverr
para operar autonomamente a conta.
O risco contratual é claro.

Mas Fiverr é diferente comercialmente
No Fiverr você não precisa ficar caçando projetos como no 99Freelas.
A plataforma possui Briefs.
O cliente publica uma necessidade e o algoritmo Fiverr seleciona alguns freelancers compatíveis. Você recebe:
aviso no Fiverr;
e-mail;
notificação;
brief;
orçamento;
necessidade;
prazo.
Depois pode:
criar oferta;
recusar;
fazer pergunta.
(HYPERLINK "https://help.fiverr.com/hc/en-us/articles/4415608857745-Personalized-offers-Briefs-for-freelancers?utm_source=chatgpt.com" \o "Personalized offers (Briefs) for freelancers – Fiverr Help Center"Fiverr Ajuda)
E cada Brief normalmente fica disponível para resposta durante 72 horas. (HYPERLINK "https://help.fiverr.com/hc/en-us/articles/4415608857745-Personalized-offers-Briefs-for-freelancers?utm_source=chatgpt.com" \o "Personalized offers (Briefs) for freelancers – Fiverr Help Center"Fiverr Ajuda)
Então podemos automatizar fora do Fiverr:
E-mail do Fiverr
↓
nosso sistema
↓
OpenAI
↓
analisa brief
↓
score
↓
precifica
↓
escreve oferta
↓
notificação Diego
↓
Diego entra e envia
Isso praticamente elimina o trabalho intelectual.
O único trabalho manual fica sendo abrir e clicar.

Então eu redesenharia nosso projeto assim
🟢 Automação oficial como objetivo
Upwork
Tentar:
API oficial
+
OpenAI
+
automação máxima
Freelancer.com
Tentar:
API oficial
+
autorização
+
OpenAI
+
automação máxima

🟠 Automação assistida
99Freelas
Hoje:
Agente acha
Agente analisa
Agente escreve
Agente precifica
Humano envia
Enquanto buscamos autorização formal.

🔴 Human Gate obrigatório
Workana
Entrada manual/e-mail
↓
IA faz todo trabalho intelectual
↓
humano envia
Fiverr
Brief/e-mail
↓
IA faz todo trabalho intelectual
↓
humano envia

Minha ordem de ataque agora
Eu mudaria inclusive a prioridade do nosso roadmap:
Prioridade
Plataforma
Potencial de automação
Mercado
1
Upwork
⭐⭐⭐⭐⭐
⭐⭐⭐⭐⭐
2
Freelancer.com
⭐⭐⭐⭐
⭐⭐⭐⭐
3
99Freelas
⭐⭐⭐
⭐⭐⭐⭐ Brasil
4
Workana
⭐⭐
⭐⭐⭐⭐ LATAM
5
Fiverr
⭐
⭐⭐⭐⭐ inbound
E existe uma oportunidade bem interessante aqui: não precisamos abandonar o conceito de “100% automático”.
Podemos fazer o Opportunity Engine ser 100% automático internamente, e apenas colocar um HUMAN_GATE onde a plataforma exigir:
CAPTURA
↓
ANÁLISE
↓
SCORE
↓
PREÇO
↓
PROPOSTA
↓
COMPLIANCE
↓
┌────────────────────┐
│ Plataforma permite?│
└─────────┬──────────┘
          ↓
     SIM       NÃO
      ↓         ↓
  AUTO SEND   DIEGO CLICA
Isso significa que, mesmo na Workana/Fiverr, você pode abrir o painel de manhã e ter:
7 propostas prontas — Revisar e enviar
em vez de ficar horas procurando trabalho.
E eu faria duas solicitações formais imediatamente: uma para Upwork API e outra para Freelancer.com API/automation authorization. Essas duas podem mudar completamente a escala desse projeto.
