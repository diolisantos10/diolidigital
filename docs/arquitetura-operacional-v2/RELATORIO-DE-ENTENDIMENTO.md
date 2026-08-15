# Relatório de Entendimento — Portão Zero

> Arquiteto desta leitura: o Agente de Fichas da Control Room, por ordem direta
> do CEO (15/08/2026). Li os 14 arquivos na ordem do `00-README.md`, o
> manifesto, o visual e o PDF original da esteira. **Nenhum código, banco,
> permissão ou interface foi alterado.** Este relatório é a entrega exigida
> pelo `08-PORTAO-ZERO-LEITURA.md`; a construção segue bloqueada até a frase
> do CEO.

---

## 1. O projeto, com as minhas palavras

Hoje a Dioli Digital funciona, mas é três coisas ao mesmo tempo: um catálogo de
departamentos no código (9), uma equipe de agentes de engenharia (14) e uma
esteira que anda sozinha desde 29/07. Cada pedaço tem regras próprias e nomes
que colidem. A V2 manda parar de empilhar estruturas e **reconstruir sobre um
esqueleto único**: um só catálogo (11 departamentos, ~61 funções executoras),
uma só máquina de estados (20 estados, do contato ao ciclo mensal), uma só
política de acesso (negar por padrão, verificada no servidor), com o Project
Manager como única voz com o cliente e a Qualidade como portão antes de
qualquer coisa chegar a quem paga. IA e pessoa ocupam as mesmas funções, com
as mesmas permissões — o sistema não pode saber nem se importar com quem
executa. E nada disso entra apagando o que existe: a migração é aditiva, por
compatibilidade, com rollback provado antes de desligar o legado.

## 2. O fluxo ponta a ponta, do contato ao ciclo mensal

1. **Contato e qualificação** (SDR): a demanda entra e só consome estrutura se
   houver aderência — sem aderência, encerra com registro.
2. **Briefing e diagnóstico** (SDR + Estratégia + Branding): o que falta não
   vira suposição — vira lacuna com dono e prazo, entrevista e pedido de
   material.
3. **Escopo e proposta** (Estratégia + Financeiro): entregáveis, prazo, preço e
   margem antes de existir projeto. Negociação circula aqui até o aceite.
4. **Direção** (PM): o cliente avaliza o caminho **antes da produção cara** — o
   portão de direção que o PDF explica: mudar o rumo antes custa uma conversa;
   depois, custa o mês.
5. **Produção coordenada** (departamentos contratados): especialistas executam
   na ordem, preservando dependências; o pacote interno é versionado.
6. **Portão de materiais**: faltou arquivo, informação ou credencial → bloqueio
   tipado que segura **só** o que depende dele, e o PM consolida a cobrança
   numa mensagem única.
7. **Qualidade**: audita briefing, marca, fatos, técnica e política. Reprovou,
   volta ao produtor com motivo. Auditor indisponível ≠ aprovado
   (`audit_pending`); exceção é do Diretor, auditada, com escopo e validade.
8. **Apresentação e decisão** (PM): o pacote inteiro, de uma vez, uma voz. O
   cliente aprova, pede ajuste, recusa/refaz ou cancela — e nada apaga versão.
9. **Implementação → Medição → Ciclo**: publica/ativa/entrega, mede com plano
   congelado na abertura ("relatório que nunca erra não mede nada"), fecha o
   ciclo e o aprendizado volta a Estratégia, Branding e Analytics para abrir o
   próximo. É a relação vitalícia: o cliente não termina, ele cicla.

## 3. O papel de cada um dos 11 departamentos

| # | Departamento | Em uma frase |
|---|---|---|
| 1 | Atendimento e SDR | Transforma contato em oportunidade qualificada e contexto confiável. |
| 2 | Project Management | Transforma demanda em projeto executável; orquestra tudo; fala com o cliente. |
| 3 | Estratégia | Decide caminho, público, oferta e KPIs antes de qualquer produção. |
| 4 | Branding | Constrói e protege a marca: regras aplicáveis, lacunas, score, evolução. |
| 5 | Social Media | Planeja, produz, distribui e aprende com a presença social. |
| 6 | Design e Produção Criativa | Materializa estratégia e marca em peças versionadas, com fonte. |
| 7 | Tráfego Pago e Performance | Opera mídia paga: plano, campanha, tracking, verba, otimização. |
| 8 | Analytics e Inteligência | Unifica dados e devolve decisão: diagnóstico, atribuição, alerta. |
| 9 | Qualidade e Compliance | Impede que erro, desalinhamento ou risco chegue ao cliente. |
| 10 | Financeiro e Administrativo | Protege preço, contrato, cobrança, custo e margem. |
| 11 | Operações, Sistemas e Segurança | Mantém integrações, credenciais, recovery, observabilidade e continuidade. |

## 4. Agentes e as fronteiras que não se misturam

Agente na V2 é **função executora** — capacidade, não página, não persona
solta. São ~61 funções distribuídas nos 11 departamentos, todas no catálogo
canônico mesmo que nem todas liguem na primeira versão. As fronteiras duras:

- **Estratégia decide o quê e por quê; PM decide ordem, dono e prazo.**
- **Branding define regra; Design aplica.** Quem define não materializa.
- **Social é orgânico; Tráfego é pago.** Distribuição não se mistura.
- **Analytics mede; não mexe em campanha** sem recomendação ou autorização prevista.
- **Qualidade valida; nunca reescreve em silêncio** o trabalho do especialista.
- **Operações recupera infraestrutura; não opina em conteúdo nem marca.**

## 5. O PM como única voz com o cliente

Por dentro, os agentes continuam autônomos: cada um sabe o que lhe falta e
abre pedido internamente. Por fora, **só o PM fala**: deduplica os pedidos,
consolida numa mensagem, o cliente responde uma vez, e a resposta é
distribuída às tarefas dependentes. A apresentação de entrega é igual: nada
"pinga" no portal — o PM apresenta o pacote completo. O motivo é de negócio,
não de tecnologia: cinco vozes pedindo coisas soltas fazem uma agência boa
parecer desorganizada. O histórico inteiro fica amarrado a cliente, projeto e
ciclo.

## 6. Cliente, projeto, campanha, tarefa, entrega e ciclo

- **Cliente** é carteira — a relação vitalícia. Possui tudo o que segue.
- **Projeto** é um compromisso com escopo, prazo e preço aceitos.
- **Campanha** é uma iniciativa dentro do projeto (ex.: mídia paga de
  lançamento) — pode atravessar ciclos.
- **Tarefa** é a unidade de trabalho de uma função executora, com dono, prazo
  e estado derivado de fatos.
- **Entrega** é o artefato versionado que o cliente decide (aprovar, ajustar,
  recusar/refazer, cancelar).
- **Ciclo** é o mês operacional: abre com plano congelado, entrega, mede,
  fecha e alimenta o próximo. É o que permite comparar agosto com julho.

## 7. Permissões e a visão transversal de clientes

Quatro camadas, sempre: navegação, componente, API/action e consulta/mutação
no servidor — **esconder botão não é controle de acesso**. Negar por padrão:
capacidade não declarada é capacidade negada. Toda a equipe interna **vê** o
overview de todos os clientes (ficha, briefing aprovado, momento da marca,
resultados, prazos, Brand Hub, status de integrações — nunca segredos); cada
departamento **edita só a própria área**; PM edita a operação; Master/Diretor
tudo (segredos reservados ao Master); o cliente só a própria organização.
Impersonação exige Master/Diretor + motivo + registro. Agente de IA recebe o
contexto mínimo da tarefa, não o banco inteiro.

## 8. Estados, bloqueios, aprovações e recuperação

Uma única máquina de 20 estados serve painel interno e portal — muda a
linguagem, nunca a verdade. Transição só acontece com: permissão + entrada
obrigatória + versão não mudou desde a leitura + chave de idempotência +
evento persistido + efeito externo em fila com retentativa. **Ninguém digita
status na mão: estado deriva de fato.** Bloqueio é tipado (9 motivos), com
dono, SLA, evidência e escalonamento — falha não desaparece, ocupa espaço na
tela de propósito. Recuperação: scheduler com heartbeat e alerta por
ausência, retentativa exponencial, dead-letter para falha repetida, botão
"Retomar" idempotente e exclusivo de PM/Diretor, detector de tarefa parada
por SLA, reprocessamento por `correlation_id`, outbox para todo efeito
externo, backup com restauração testada.

## 9. As nove respostas do Portão Zero (sem copiar frase de documento)

1. **Falta Brand Book?** Não se inventa marca: abre-se lacuna com dono e
   prazo, o Entrevistador de Marca e o pedido de material entram em ação, e o
   que depende da marca fica bloqueado (`missing_asset`) — só o que depende.
2. **Quem fala com o cliente?** Só o PM. Os agentes pedem por dentro; o PM
   junta, tira duplicata, manda uma mensagem; a resposta única abastece todas
   as tarefas que esperavam.
3. **Branding: quem edita, quem consulta?** Edita o departamento de Branding
   (e Master/Diretor). Todo o resto consulta as regras aprovadas no Brand Hub;
   o cliente responde entrevistas e envia materiais pelo portal.
4. **Qualidade reprovou?** O trabalho volta ao agente que o produziu, com o
   motivo escrito. Não vai ao cliente, não é reescrito por baixo dos panos, e
   a reprovação vira dado do ciclo.
5. **Ajuste × recusar/refazer × cancelar?** Ajuste preserva o trabalho e abre
   revisão comentada; recusar/refazer devolve por desalinhamento relevante com
   justificativa; cancelar encerra aquele escopo com ressalva e auditoria.
   Nenhum dos três apaga versões.
6. **Produção duplicada?** Chave de idempotência + versão do estado conferida
   na transição + fila com outbox: duas aprovações simultâneas da mesma
   direção produzem uma produção, não duas. Cenário obrigatório de teste.
7. **Tarefa parada?** O detector por estado+SLA acusa; o bloqueio tem dono e
   próxima ação; "Retomar processo" (PM/Diretor) reprocessa por
   `correlation_id` de forma idempotente — nunca duplicando na mão.
8. **Catálogos antigos sem perder dados?** Compatibilidade, não exclusão:
   catálogo canônico novo + adaptadores para slugs legados + backfill
   idempotente + leitura dupla comparando + feature flag + reconciliação — e
   o legado só morre depois de janela de estabilidade com aprovação do CEO.
9. **O ciclo devolve aprendizado?** O fechamento mensal entrega relatório
   contra o plano congelado; correção volta ao responsável; aprendizado volta
   a Analytics, Estratégia e Branding (evolução de marca inclusive), e o
   próximo ciclo abre já ajustado.

## 10. Conflitos com a estrutura atual (o que a V2 substitui ou tensiona)

| # | Conflito | Gravidade |
|---|---|---|
| C1 | **Dois catálogos de departamentos**: `BRAIN_DEPARTMENTS` tem 9 (com `financeiro`); a V2 tem 11 (`finance`, + `branding` e `operations` novos). Slug `financeiro`→`finance` muda; `project-management` e `quality` existem nos dois com desenhos diferentes. | Alta — é o coração da V2 (D-01) |
| C2 | **Obra × linha**: os 14 agentes de engenharia (`.claude/agents/`, fichados hoje) têm funções que a V2 põe DENTRO do catálogo operacional (segurança, qualidade, operações). Precisa de decisão: a obra continua como equipe de construção fora do catálogo, ou é absorvida? | Alta — define o que acontece com as 14 fichas em vigor |
| C3 | **A escada de exposição (sombra → allowlist → wide) não aparece na V2.** Hoje ela é a proteção central de quem chega ao cliente, com decisão do dono versionada em código. O rollout por lotes da V2 é parecido, mas não é a mesma coisa. | Alta — segurança de cliente |
| C4 | **As travas de plataforma** (parecer PODE/NÃO PODE de meta/google/tiktok) e a **trava de publicação fail-closed** + App Review não são citadas na V2. Se forem tratadas como "estrutura conflitante", a casa reabre o caminho do ban de 03/08. | Alta — não podem morrer na migração |
| C5 | **Estados atuais** (posts draft/scheduled/published; execution status; fases da esteira de 29/07) × 20 estados canônicos — exige mapa valor a valor e leitura dupla. | Média — trabalho previsto na V2 |
| C6 | **Autenticação atual** (checagem por handler, sem middleware; portal por token; `CHAVE_CEO`/`CHAVE_DIRETORES`) × RBAC de 4 camadas negar-por-padrão com `department_id`/`role_id`/`organization_id`. É construção grande, não ajuste. | Média-alta |
| C7 | **QUEM-APROVA.md** ("quem aprova é o cliente; CEO nunca é etapa") permanece válido e compatível — mas a **exceção auditada do Diretor** no portão de Qualidade é novidade que precisa entrar na doutrina escrita. | Baixa — registrar |
| C8 | **SQLite em volume persistente** × filas, outbox, DLQ e heartbeat da V2. Dá para construir sobre SQLite (tabelas de fila + processo único), mas o limite de escrita concorrente precisa ser dito antes do Marco 2. | Média — decisão técnica do Marco 1 |
| C9 | **As 9 fichas da linha (rascunho de hoje, não publicado)** descrevem o catálogo velho. Ficam **supersedidas** pela V2 — descarto e refaço contra os 11. As 14 fichas da obra continuam valendo. | Baixa — já contido |

## 11. Mapa preliminar legado → V2

| Legado | V2 | Nota |
|---|---|---|
| `client-service-sdr` | `client-service-sdr` | mesmo id; ganha CRM de oportunidades |
| `strategy` | `strategy` | mesmo id; ganha pesquisa e personas explícitas |
| `social-media` | `social-media` | mesmo id; ganha community/SAC, trends, publicação |
| `design` | `design` | mesmo id; ganha motion, vídeo, biblioteca |
| `paid-traffic` | `paid-traffic` | mesmo id; ganha tracking, guardião de verba |
| `analytics` | `analytics` | mesmo id; ganha atribuição, previsão |
| `project-management` | `project-management` | mesmo id; vira a voz única com o cliente |
| `quality` | `quality` | mesmo id; ganha compliance, fatos, approval gate |
| `financeiro` | `finance` | **slug muda** — adaptador obrigatório |
| — (não existe) | `branding` | novo; herda `BrandBrain` (11 campos) + os 9 campos que faltam (obra já mapeada pelo essencial `branding` da obra) |
| — (não existe) | `operations` | novo; absorve na linha o que hoje é função de obra (integrações, credenciais, scheduler, observabilidade, segurança, backup) |
| Escada sombra/allowlist/wide | rollout por lotes (M7) | **proposta: manter a escada como mecanismo do rollout** — ver dúvida Q1 |
| Fases da esteira de 29/07 | estados canônicos | mapa direto: a esteira atual é um subconjunto compatível (contato→briefing→proposta→direção→produção→qualidade→apresentação→implementação→ciclo já existem lá) |

**Uma observação a favor do projeto:** a esteira construída em 29/07 (PDF) já
implementou na prática vários princípios da V2 — portão de direção, uma voz,
bloqueio por material, ciclo mensal, mesma verdade nos dois lados. A V2 não
briga com a esteira; ela **generaliza e departamentaliza** o que a esteira já
provou. Isso reduz muito o risco da reconstrução.

## 12. Plano de construção, rollback e testes

Sigo o backlog como está — os 7 marcos estão bem desenhados e eu não mudaria a
ordem. O que cada um exige de mim e o gate de saída:

- **M1 Inventário** (leitura, zero mudança): varrer catálogos, estados, crons,
  filas, webhooks e permissões reais; entregar tabela de conflitos completa
  (a seção 10 é a preliminar) + mapa valor a valor + desenho de dados +
  decisão SQLite×fila documentada. *Gate: aprovação do CEO.*
- **M2 Núcleo canônico**: catálogo único importado do
  `architecture.manifest.json` (o manifesto vira teste: código diverge do
  manifesto → CI reprova), capabilities/RBAC no servidor, máquina de estados,
  contratos de handoff, audit log, idempotência, outbox, adaptadores de slug.
  *Gate: testes de unidade e autorização verdes.*
- **M3 Migração aditiva**: migrations sem exclusão, backfill idempotente,
  leitura dupla com relatório de divergência, feature flags, rollback
  demonstrado em teste. *Gate: reconciliação sem perda.*
- **M4 Operação interna**: Central de Trabalho, Clientes transversal, páginas
  departamentais, PM Command Center, visão Master/Diretor. *Gate: permissão
  provada em UI + API + servidor.*
- **M5 Portal**: resultados primeiro, 4 decisões do cliente, Brand Hub com
  entrevista e upload, integrações, chat com PM. *Gate: isolamento entre
  organizações provado por teste (URL/ID trocado = negado).*
- **M6 Automação e recovery**: heartbeat, filas, DLQ, detector de parados,
  retomar idempotente, dashboards. *Gate: testes de falha e retomada.*
- **M7 Piloto e rollout**: massa sintética → equipe interna → 1 piloto → 3
  perfis → lotes, **pela escada** (se Q1 for aprovada). *Gate final: os 15
  cenários e as metas de segurança do `07`, integralmente.*

**Rollback em cada etapa:** migração aditiva (nada apagado), escrita nova
atrás de flag (desligar a flag = voltar), leitura dupla até divergência zero,
e o legado congelado — não removido — até janela de estabilidade + palavra do
CEO. **Fichas:** cada função executora do catálogo nasce com ficha do template
mestre (Control Room, D-003) e o catálogo canônico carrega a referência da
ficha — é a junção da minha missão com a V2, e o custo é marginal porque o
manifesto já lista todos os agentes.

## 13. Dúvidas e decisões que dependem do CEO

1. **Q1 — A escada sobrevive?** Recomendo: sim — sombra/allowlist/wide vira o
   mecanismo do rollout do M7 e da exposição contínua. Se a resposta for não,
   preciso saber o que a substitui como proteção de "quem chega ao cliente".
2. **Q2 — Destino da obra.** Recomendo: os 14 agentes de engenharia continuam
   como equipe de construção (fora do catálogo operacional), e as funções de
   runtime de segurança/operações vivem no departamento `operations` da linha.
   Um constrói, o outro opera — as 14 fichas continuam valendo.
3. **Q3 — Travas de plataforma e publicação.** Recomendo declarar por escrito
   que pareceres meta/google/tiktok, a trava fail-closed de publicação e o
   bloqueio do App Review **não são estrutura conflitante** — entram na V2
   dentro de Qualidade/Operações.
4. **Q4 — Quem é "Diretoria" no organograma V2** — o Diretor da casa atual?
   E confirmo que a cadeia D-004 (CEO → Diretor Geral → Diretor → PM) segue
   por cima disso?
5. **Q5 — Humanos nas funções.** A V2 é híbrida por princípio, mas hoje não há
   nenhum humano operando função. Existe previsão de contratação, ou a V1 da
   V2 roda 100% IA como hoje?
6. **Q6 — Banco.** Autorizo estudar no M1 se filas/outbox ficam no SQLite
   atual ou se o Postgres entra? (Custo e migração são diferentes; não decido
   sozinho.)
7. **Q7 — Os 3 leads parados** (Sushi Cazza, Camila Pereira, Beatriz Gimenes)
   entram como massa do piloto do SDR na V2, ou são tratados antes, no modelo
   atual?

## 14. Riscos que eu acho que ainda não estão cobertos

- **O App Review da Meta continua sendo o bloqueio real de publicação** — e
  nenhum marco da V2 o resolve, porque é calendário e posse (CEO), não código.
  A V2 pode nascer inteira e a publicação continuar NÃO PODE.
- **Custo de IA de ~61 funções executoras**: a V2 não define teto de custo por
  tarefa/departamento. O template de ficha tem o campo; sugiro preenchê-lo
  como parte do M2 para o custo não ser descoberto na fatura.
- **Regressão de segurança na migração**: o risco número um da frase
  "substituir estruturas conflitantes" é levar junto uma trava que parecia
  conflito e era proteção (C3/C4). Minha proposta: lista explícita e aprovada
  de "o que NÃO se substitui" antes do M2.
- **Dados vivos durante a migração**: 14 posts em workspace, campanha Foocci
  pausada dentro da Meta, 3 leads reais parados — o inventário do M1 precisa
  listá-los nominalmente para o backfill não os tratar como lixo.
- **Golden set continua 0** — a V2 traz os 15 cenários de aceite do sistema,
  o que é ótimo, mas qualidade POR FUNÇÃO (recusa, escalada, adversarial)
  segue sem prova. As fichas + template cobrem isso; proponho golden set
  mínimo para as funções que falam com cliente ou gastam dinheiro.
- **O `mergeable_state` do PR está instável** — antes do M2, o pacote precisa
  ser rebaseado sobre a base atual para o catálogo não nascer de um snapshot
  velho.

## 15. Veredito de capacidade — a pergunta do CEO: "consegue construir isso?"

**Sim, consigo — e o desenho é construível como está.** Três qualificações
honestas:

1. **O que é meu:** todo o código dos marcos 1 a 7, as migrações, os testes
   dos 15 cenários, as fichas das funções, a documentação. A esteira de 29/07
   já provou os conceitos centrais em produção — a V2 é generalização, não
   invenção.
2. **O que é seu:** as aprovações de gate (M0 agora, M1 a M7 depois), as
   respostas Q1–Q7, o App Review e chaves (posse), e os clientes do piloto.
3. **O que eu não prometo:** prazo de calendário sem o inventário do M1
   (estimativa séria só depois dele — prometer antes seria chute), e qualquer
   coisa que dependa de aprovação de plataforma externa (Meta/Google/TikTok
   decidem no tempo deles).

**Aguardo a frase de liberação para iniciar o Marco 1:** _"Entendimento
aprovado. Pode iniciar o Marco 1."_ Qualquer outra resposta mantém a
implementação bloqueada, como manda o portão.
