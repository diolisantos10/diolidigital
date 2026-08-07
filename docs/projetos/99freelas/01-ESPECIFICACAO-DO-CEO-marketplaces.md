# DIOLI OPPORTUNITY ENGINE
## PROTOCOLO DE INTEGRAÇÃO — MARKETPLACES ADICIONAIS
### Workana • Upwork • Freelancer.com • Fiverr

**Versão:** 1.0  
**Data-base:** Agosto de 2026

---

# 1. OBJETIVO

Este documento define exclusivamente como integrar quatro marketplaces adicionais ao Dioli Opportunity Engine:

1. Upwork
2. Freelancer.com
3. Workana
4. Fiverr

O protocolo do 99Freelas já existe separadamente e NÃO deve ser reconstruído neste documento.

O objetivo é conectar essas plataformas ao mesmo núcleo de inteligência comercial existente:

```text
Marketplace
      ↓
Marketplace Adapter
      ↓
Opportunity Engine Core
      ↓
Qualification Agent
      ↓
Pricing Engine
      ↓
Proposal Agent
      ↓
Compliance Engine
      ↓
Submission / Human Gate
      ↓
CRM
```

Cada plataforma terá um adaptador independente.

NÃO criar lógica específica de marketplace dentro do core.

---

# 2. PRINCÍPIO ARQUITETURAL

O Opportunity Engine deve possuir um núcleo agnóstico de plataforma.

O núcleo NÃO precisa saber se uma oportunidade veio do:

```text
99Freelas
Upwork
Workana
Freelancer
Fiverr
```

O núcleo recebe sempre uma oportunidade normalizada.

Exemplo:

```typescript
interface Opportunity {
  id: string;
  platform: Marketplace;
  externalProjectId: string;
  externalUrl?: string;

  title: string;
  description: string;

  client?: ClientData;

  category?: string;
  skills?: string[];

  budget?: Budget;
  deadline?: string;

  publishedAt?: Date;
  capturedAt: Date;

  metadata: Record<string, unknown>;
}
```

---

# 3. MARKETPLACE ADAPTER

Criar uma interface padrão:

```typescript
interface MarketplaceAdapter {

  platform: Marketplace;

  capabilities(): PlatformCapabilities;

  authenticate(): Promise<AuthStatus>;

  discoverOpportunities(): Promise<Opportunity[]>;

  getOpportunity(
    externalProjectId: string
  ): Promise<Opportunity>;

  getConversation(
    opportunityId: string
  ): Promise<Conversation>;

  prepareSubmission(
    proposal: Proposal
  ): Promise<SubmissionPreview>;

  submitProposal(
    proposal: Proposal
  ): Promise<SubmissionResult>;

  syncMessages(): Promise<Message[]>;

  sendMessage(
    conversationId: string,
    message: string
  ): Promise<MessageResult>;

  syncStatuses(): Promise<StatusUpdate[]>;
}
```

Nem toda plataforma implementará todas as operações automaticamente.

A tabela `PlatformCapabilities` determinará isso.

---

# 4. PLATFORM CAPABILITIES

Criar:

```typescript
interface PlatformCapabilities {

  discovery: CapabilityMode;

  projectRead: CapabilityMode;

  proposalSubmission: CapabilityMode;

  messaging: CapabilityMode;

  statusSync: CapabilityMode;

  externalLinksAllowed: boolean;

  browserAutomationAllowed: boolean;

  officialApiAvailable: boolean;

  humanGateRequired: boolean;
}
```

Valores:

```typescript
type CapabilityMode =
  | "API"
  | "AUTHORIZED_BROWSER"
  | "ASSISTED"
  | "INBOUND"
  | "MANUAL"
  | "DISABLED";
```

---

# 5. MATRIZ INICIAL

Configuração inicial recomendada:

```text
UPWORK
Discovery:             API
Project Read:          API
Proposal Submission:   API / HUMAN_GATE conforme permissão
Messaging:             API conforme permissão
Status Sync:           API
Browser Automation:    NÃO
External Links:        NÃO no pré-contrato


FREELANCER.COM
Discovery:             API após autorização
Project Read:          API após autorização
Proposal Submission:   API apenas se autorizado
Messaging:             API apenas se autorizado
Status Sync:           API
Browser Automation:    NÃO sem autorização expressa
External Links:        NÃO


WORKANA
Discovery:             ASSISTED
Project Read:          ASSISTED
Proposal Submission:   MANUAL
Messaging:             MANUAL
Status Sync:           ASSISTED
Browser Automation:    NÃO
External Links:        NÃO


FIVERR
Discovery:             INBOUND
Project Read:          ASSISTED
Proposal Submission:   MANUAL
Messaging:             MANUAL
Status Sync:           ASSISTED
Browser Automation:    NÃO
External Links:        NÃO
```

---

# 6. REGRA FUNDAMENTAL

Não utilizar:

```text
Playwright
Selenium
Puppeteer
Computer Use
browser bots
scrapers
session cookies
RPA
auto refresh
DOM crawling
```

em plataformas que não autorizem expressamente esse tipo de acesso.

A existência do OpenAI Computer Use NÃO concede autorização para automatizar uma plataforma de terceiros.

Compliance da plataforma sempre prevalece sobre capacidade tecnológica.

---

# 7. ADAPTER 01 — UPWORK

## Prioridade

```text
PRIORITY = P0
```

É a integração adicional de maior prioridade.

Motivo técnico:

A Upwork possui infraestrutura oficial para desenvolvedores e API própria.

Portanto:

```text
UPWORK = API FIRST
```

e NÃO:

```text
UPWORK = PLAYWRIGHT FIRST
```

---

# 8. AUTENTICAÇÃO UPWORK

Não utilizar senha da conta.

Não utilizar cookies exportados.

Não utilizar sessão do navegador.

Implementar OAuth 2.0 oficial.

Fluxo:

```text
Admin
  ↓
Connect Upwork
  ↓
OAuth Authorization
  ↓
Upwork
  ↓
Authorization Code
  ↓
Backend
  ↓
Access Token
  ↓
Refresh Token
  ↓
Encrypted Token Storage
```

Criar:

```text
marketplace_connections
```

Exemplo:

```json
{
  "platform": "upwork",
  "connection_type": "oauth2",
  "status": "CONNECTED",
  "account_type": "agency",
  "scopes": [],
  "access_token_encrypted": "...",
  "refresh_token_encrypted": "...",
  "expires_at": "..."
}
```

Nunca fornecer tokens ao modelo OpenAI.

---

# 9. API KEY UPWORK

Antes da implementação produtiva:

Solicitar oficialmente uma API Key à Upwork.

Informar no pedido que:

```text
A integração será utilizada internamente pela agência
para organizar busca de oportunidades, análise,
qualificação e gestão das candidaturas da própria conta.
```

Não afirmar que será:

```text
scraper
bot de propostas
auto-bid system
mass proposal sender
```

Descrever exatamente o uso real.

A aprovação e os scopes concedidos pela Upwork serão a autoridade final sobre quais funções poderão ser automatizadas.

---

# 10. DISCOVERY UPWORK

Usar exclusivamente a API oficial.

Não fazer scraping do marketplace.

O adapter deve utilizar os recursos oficiais de busca de Job Postings disponíveis na API.

Fluxo:

```text
Upwork API
    ↓
Job Search
    ↓
Normalize
    ↓
Deduplicate
    ↓
Opportunity Engine
```

Filtros internos:

```text
marketing
social media
branding
graphic design
web design
landing pages
WordPress
Shopify
paid media
Google Ads
Meta Ads
SEO
CRM
automation
AI automation
content
copywriting
digital strategy
```

Os termos reais utilizados na API devem vir da taxonomia disponibilizada pela própria Upwork.

---

# 11. NORMALIZAÇÃO UPWORK

Converter:

```text
Upwork Job Posting
```

para:

```text
Opportunity
```

Guardar adicionalmente:

```json
{
  "platform_metadata": {
    "experience_level": "...",
    "client_rating": "...",
    "client_total_spend": "...",
    "payment_verified": true,
    "proposals_count": 12,
    "hourly_or_fixed": "fixed",
    "skills": [],
    "connects_required": null
  }
}
```

Nunca deixar o core depender diretamente dos nomes dos campos da Upwork.

---

# 12. QUALIFICAÇÃO UPWORK

Depois da normalização:

```text
Opportunity
    ↓
Qualification Agent
    ↓
Score
    ↓
Pricing Engine
    ↓
Proposal Agent
```

Critérios específicos adicionais:

```text
client payment verified
client rating
client historical spend
number of proposals
project age
experience level
budget
country
agency compatibility
recurring potential
```

---

# 13. PROPOSTAS UPWORK

A API da Upwork possui recursos relacionados a propostas.

Entretanto:

NÃO assumir automaticamente que a API Key concedida à agência permitirá qualquer tipo de submissão.

Implementar capability detection:

```typescript
if (
  upworkConnection.permissions
    .includes("proposal_submission")
) {
    submissionMode = "API";
} else {
    submissionMode = "HUMAN_GATE";
}
```

---

# 14. HUMAN GATE UPWORK

Caso envio não esteja disponível na autorização da API:

O sistema fará:

```text
DISCOVER
↓
ANALYZE
↓
QUALIFY
↓
PRICE
↓
WRITE PROPOSAL
↓
READY_FOR_SUBMISSION
```

e então:

```text
HUMAN_GATE
```

A interface deverá mostrar:

```text
Título
Cliente
Score
Budget
Preço recomendado
Prazo
Cover Letter
Screening Questions
```

O operador conclui a candidatura diretamente na Upwork.

---

# 15. COMUNICAÇÃO UPWORK

Antes de contrato:

Toda comunicação deve permanecer na Upwork.

Portanto:

```text
external_briefing_link = FALSE
external_whatsapp = FALSE
external_email = FALSE
external_calendar = FALSE
```

Não mandar o cliente para:

```text
site da agência
WhatsApp
briefing externo
formulário externo
Calendly
Instagram
```

antes do momento permitido pelas regras da plataforma.

---

# 16. STATUS UPWORK

Sincronizar quando permitido pela API:

```text
PROPOSAL_SENT
VIEWED
INTERVIEW
OFFER_RECEIVED
HIRED
DECLINED
WITHDRAWN
JOB_CLOSED
```

Mapear para os status internos do Opportunity Engine.

---

# 17. ADAPTER 02 — FREELANCER.COM

## Prioridade

```text
PRIORITY = P1
```

A Freelancer.com possui API oficial.

Porém existe uma restrição crítica:

O uso de robots, scrapers ou outros meios automatizados — inclusive acesso automatizado à API — requer autorização expressa da Freelancer.com.

Portanto:

```text
FIRST STEP = OBTAIN PERMISSION
```

---

# 18. ESTADO INICIAL FREELANCER.COM

Antes da autorização:

```typescript
capabilities = {
  discovery: "MANUAL",
  projectRead: "MANUAL",
  proposalSubmission: "DISABLED",
  messaging: "DISABLED",
  statusSync: "MANUAL",
  officialApiAvailable: true,
  browserAutomationAllowed: false,
  humanGateRequired: true
}
```

---

# 19. SOLICITAR AUTORIZAÇÃO

Criar tarefa de implementação:

```text
FREELANCER_API_PERMISSION_REQUEST
```

Solicitar formalmente autorização para:

```text
buscar projetos
consultar detalhes
analisar projetos
gerenciar bids
consultar bids
acompanhar projetos
gerenciar mensagens
sincronizar status
```

Descrever que a integração será utilizada exclusivamente pela própria agência.

Guardar a autorização:

```text
platform_authorizations
```

Exemplo:

```json
{
  "platform": "freelancer",
  "authorization_type": "API_AUTOMATION",
  "status": "APPROVED",
  "approved_at": "...",
  "evidence": "...",
  "allowed_operations": []
}
```

---

# 20. API FREELANCER.COM

Depois da autorização:

Implementar exclusivamente através da API oficial.

Não misturar:

```text
API
+
browser cookies
+
scraping
```

Não utilizar requests diretamente contra páginas HTML da plataforma.

Fluxo:

```text
Freelancer API
       ↓
Freelancer Adapter
       ↓
Normalized Opportunity
       ↓
Opportunity Engine
```

---

# 21. AUTENTICAÇÃO FREELANCER.COM

Utilizar o mecanismo oficial exigido pela API.

Nunca armazenar:

```text
username/password
browser cookies
session dump
```

como método de automação.

Tokens:

```text
encrypted at rest
never included in prompts
never logged
never exposed to frontend
```

---

# 22. DISCOVERY FREELANCER.COM

Depois da autorização:

```text
API Project Search
      ↓
filters
      ↓
normalize
      ↓
deduplicate
      ↓
qualification
```

Buscar categorias compatíveis com:

```text
Digital Marketing
Social Media Marketing
Facebook Marketing
Instagram Marketing
Google Ads
Graphic Design
Branding
Website Design
WordPress
Shopify
SEO
Content Writing
Copywriting
Automation
AI
CRM
Marketing Strategy
```

---

# 23. BID ENGINE FREELANCER.COM

No Freelancer.com:

```text
Proposal = Bid
```

O adapter deverá traduzir internamente:

```text
Proposal
→ Freelancer Bid
```

Input:

```json
{
  "project_id": "...",
  "amount": 0,
  "delivery_period": 0,
  "description": "..."
}
```

Os campos reais devem seguir a documentação da API oficial vigente.

---

# 24. SUBMISSION FREELANCER.COM

Antes do envio:

```text
Qualification passed
Pricing passed
Compliance passed
Daily limit passed
Duplicate check passed
Platform authorization passed
```

Somente então:

```text
submitBid()
```

Se a autorização não contemplar criação de bids:

```text
HUMAN_GATE
```

Nunca contornar a restrição utilizando navegador automatizado.

---

# 25. COMUNICAÇÃO FREELANCER.COM

Manter comunicação e negociação dentro da plataforma.

Configuração:

```json
{
  "external_contact_allowed": false,
  "external_payment_allowed": false,
  "external_briefing_link_allowed": false
}
```

Não utilizar o briefing externo como CTA inicial.

---

# 26. STATUS FREELANCER.COM

Mapear:

```text
BID_SENT
PROJECT_AWARDED
PROJECT_ACCEPTED
PROJECT_REJECTED
PROJECT_CLOSED
CLIENT_MESSAGE
NEGOTIATING
WON
LOST
```

---

# 27. ADAPTER 03 — WORKANA

## Prioridade

```text
PRIORITY = P1
```

A Workana é especialmente importante para América Latina.

Entretanto:

Não construir browser bot para ela.

Os termos restringem:

```text
automated access
scripts
data extraction
scraping
indexing
data mining
robots
spiders
```

Portanto:

```text
WORKANA_MODE = ASSISTED
```

até existir autorização expressa da Workana.

---

# 28. NÃO FAZER NA WORKANA

Não implementar:

```text
Playwright scanner
Computer Use scanner
Selenium
auto-refresh
HTML scraper
DOM crawler
automatic proposal submission
automatic messaging
cookie-based automation
```

---

# 29. WORKANA ASSISTED ADAPTER

A Workana continuará integrada ao Opportunity Engine.

Mas a origem da oportunidade será assistida.

Possíveis entradas permitidas:

```text
notificação recebida por e-mail
link inserido pelo operador
texto do projeto fornecido pelo operador
dados exportados oficialmente pela plataforma, se houver
integração oficialmente disponibilizada no futuro
```

---

# 30. EMAIL INGESTION WORKANA

Se a conta receber notificações de projetos por e-mail:

```text
Workana
   ↓
Email Notification
   ↓
Agency Inbox
   ↓
Email Ingestion
   ↓
Opportunity Parser
   ↓
Opportunity Engine
```

O sistema pode processar a mensagem pertencente à própria agência.

Extrair:

```text
project title
summary
category
project URL
notification date
```

Se a mensagem não contiver briefing suficiente:

```text
status = NEEDS_PROJECT_DETAILS
```

---

# 31. ANÁLISE WORKANA

Uma vez que os detalhes sejam fornecidos:

```text
Opportunity
    ↓
Qualification Agent
    ↓
Pricing Engine
    ↓
Proposal Agent
```

O Opportunity Engine continua funcionando normalmente.

Somente a camada de acesso à Workana permanece assistida.

---

# 32. PROPOSAL STUDIO WORKANA

Gerar:

```text
proposal text
suggested price
delivery time
questions
milestones
revision policy
```

Guardar como:

```text
READY_FOR_MANUAL_SUBMISSION
```

O usuário abre Workana e envia.

---

# 33. COMUNICAÇÃO WORKANA

A Workana exige que proposta, comunicação e negociação permaneçam dentro da plataforma.

Configuração:

```json
{
  "external_links_allowed": false,
  "external_contacts_allowed": false,
  "external_payments_allowed": false
}
```

Não inserir:

```text
site
WhatsApp
telefone
e-mail
Instagram
LinkedIn
Behance direto
briefing externo
```

na proposta.

---

# 34. FUTURA AUTOMAÇÃO WORKANA

Criar feature flag:

```text
WORKANA_AUTOMATION_AUTHORIZED=false
```

Caso a Workana futuramente:

```text
publique API oficial adequada
OU
conceda autorização expressa
```

alterar para:

```text
WORKANA_AUTOMATION_AUTHORIZED=true
```

Somente então implementar automação.

Nenhuma alteração no Opportunity Engine Core será necessária.

Apenas o Adapter muda.

---

# 35. ADAPTER 04 — FIVERR

## Prioridade

```text
PRIORITY = P2
```

O Fiverr possui um modelo comercial diferente.

Ele NÃO deve ser tratado como:

```text
99Freelas
Workana
Upwork
Freelancer
```

No Fiverr a estratégia principal é:

```text
INBOUND MARKETPLACE
```

---

# 36. MODELO FIVERR

O cliente pode:

```text
buscar serviços
encontrar Gig
enviar mensagem
pedir orçamento
enviar briefing
```

E o Fiverr também distribui determinados Briefs para freelancers compatíveis.

Portanto:

```text
Fiverr
   ↓
Gig / Profile
   ↓
Client Discovery
   ↓
Brief / Message / Quote Request
   ↓
Agency
```

Não existe necessidade de criar um crawler procurando projetos abertos como no 99Freelas.

---

# 37. FIVERR BRIEFS

Quando o Fiverr selecionar a agência/freelancer para um Brief:

```text
Fiverr Brief
      ↓
notification
      ↓
Opportunity Engine
```

O Brief deve ser transformado em:

```text
Opportunity
```

Dados:

```text
brief
budget
timeline
service
client
matching information
expiration
```

Briefs possuem janela limitada para resposta.

Guardar:

```text
expires_at
```

como prioridade operacional.

---

# 38. AUTOMAÇÃO FIVERR

Não implementar:

```text
Playwright
Selenium
Computer Use
crawler
scraper
automatic messaging
automatic offer sending
browser bot
```

Os termos do Fiverr proíbem software de automação não autorizado e scraping.

Portanto:

```text
FIVERR_MODE = INBOUND_ASSISTED
```

---

# 39. FIVERR EMAIL / NOTIFICATION INGESTION

Arquitetura:

```text
Fiverr
   ↓
Email Notification
   ↓
Agency Inbox
   ↓
Notification Parser
   ↓
Opportunity Engine
```

Tipos:

```text
NEW_BRIEF
NEW_MESSAGE
QUOTE_REQUEST
ORDER_REQUEST
ORDER_CREATED
CLIENT_RESPONSE
```

---

# 40. QUALIFICAÇÃO FIVERR

Brief recebido:

```text
Brief
 ↓
Qualification Agent
 ↓
Score
 ↓
Pricing Engine
 ↓
Offer Generator
```

Resultado:

```text
RESPOND
DECLINE
ASK_QUESTION
```

---

# 41. OFFER STUDIO FIVERR

O agente deve preparar:

```text
introduction
scope
price
delivery time
milestones
subscription option
questions
```

conforme os recursos disponíveis naquele Brief.

Salvar:

```text
READY_FOR_MANUAL_OFFER
```

---

# 42. FIVERR NÃO É PROSPECÇÃO ATIVA

O sistema não deverá procurar clientes no Fiverr para enviar mensagens não solicitadas.

O objetivo é:

```text
maximizar matching
+
responder rápido
+
responder melhor
+
converter Briefs
+
converter mensagens
```

Portanto o principal trabalho técnico da integração Fiverr é:

```text
Opportunity Intake
+
Fast Qualification
+
AI Offer Creation
+
Response SLA
```

---

# 43. OTIMIZAÇÃO DE PERFIL FIVERR

Separar da automação operacional.

Criar módulo:

```text
Fiverr Profile Intelligence
```

Responsável por recomendar:

```text
Gig titles
keywords
categories
pricing
packages
descriptions
FAQs
portfolio selection
service positioning
```

O objetivo é aumentar a probabilidade de a Dioli receber Briefs relevantes.

Esse módulo NÃO modifica automaticamente o Fiverr.

Ele recomenda alterações.

---

# 44. COMUNICAÇÃO FIVERR

Manter:

```text
brief
quote
conversation
order
payment
```

dentro do Fiverr.

Não utilizar mensagens para retirar tráfego da plataforma.

---

# 45. NORMALIZAÇÃO MULTIPLATAFORMA

Todos os adapters devem produzir o mesmo formato:

```json
{
  "platform": "upwork",
  "external_project_id": "...",
  "title": "...",
  "description": "...",
  "client": {},
  "budget": {},
  "deadline": "...",
  "skills": [],
  "published_at": "...",
  "metadata": {}
}
```

Depois disso:

Nenhuma regra comercial deverá depender diretamente da plataforma, exceto quando necessária.

---

# 46. PLATFORM POLICY ENGINE

Criar tabela:

```text
platform_policies
```

Campos:

```text
platform
integration_mode

browser_automation_allowed
api_available
api_authorization_required

external_links_allowed_pre_contract
external_contact_allowed_pre_contract
external_payment_allowed

auto_submission_allowed
auto_messaging_allowed

policy_verified_at
policy_version
notes
```

---

# 47. CONFIGURAÇÃO INICIAL

```json
[
  {
    "platform": "upwork",
    "integration_mode": "API",
    "browser_automation_allowed": false,
    "api_available": true,
    "api_authorization_required": true,
    "human_gate_required": true
  },
  {
    "platform": "freelancer",
    "integration_mode": "API_PENDING_PERMISSION",
    "browser_automation_allowed": false,
    "api_available": true,
    "api_authorization_required": true,
    "human_gate_required": true
  },
  {
    "platform": "workana",
    "integration_mode": "ASSISTED",
    "browser_automation_allowed": false,
    "api_available": false,
    "human_gate_required": true
  },
  {
    "platform": "fiverr",
    "integration_mode": "INBOUND_ASSISTED",
    "browser_automation_allowed": false,
    "human_gate_required": true
  }
]
```

---

# 48. POLICY VERSIONING

As regras das plataformas mudam.

Nunca codificar policy diretamente no prompt.

Implementar:

```text
Platform Policy Registry
```

Cada policy:

```json
{
  "platform": "upwork",
  "version": "2026-08",
  "verified_at": "2026-08-07",
  "active": true
}
```

Quando houver mudança:

```text
old policy → inactive
new policy → active
```

---

# 49. COMPLIANCE GATE

Antes de qualquer ação externa:

```text
Opportunity
    ↓
Proposal
    ↓
Platform Policy
    ↓
Compliance Gate
```

Resposta:

```typescript
type ComplianceDecision =
  | "ALLOW"
  | "HUMAN_GATE"
  | "BLOCK";
```

---

# 50. EXEMPLO

Upwork:

```text
API authorization exists
+
operation allowed
=
ALLOW
```

Workana:

```text
automatic submission requested
+
automation unauthorized
=
BLOCK
```

Fiverr:

```text
agent generated offer
+
manual submission
=
HUMAN_GATE
```

Freelancer:

```text
API permission pending
=
BLOCK AUTOMATION
```

---

# 51. NÃO CONFUNDIR HUMAN GATE COM FALHA

Human Gate é parte da arquitetura.

O objetivo do sistema continua sendo automatizar:

```text
captura quando permitido
normalização
qualificação
score
precificação
redação
priorização
CRM
follow-up intelligence
```

mesmo quando o clique final pertence ao usuário.

---

# 52. DATABASE

Adicionar:

```text
marketplace_connections
platform_policies
platform_authorizations
marketplace_events
marketplace_messages
```

---

# 53. MARKETPLACE_CONNECTIONS

```text
id
platform
account_id
account_type
connection_type
status
permissions
token_reference
connected_at
last_sync_at
error
```

Nunca salvar token diretamente em tabela de aplicação sem criptografia/cofre.

---

# 54. MARKETPLACE_EVENTS

Exemplo:

```json
{
  "platform": "fiverr",
  "type": "NEW_BRIEF",
  "external_id": "...",
  "received_at": "...",
  "processed": false
}
```

---

# 55. IDENTIDADE ÚNICA

Criar:

```text
UNIQUE(platform, external_project_id)
```

para impedir duplicidades.

---

# 56. ORQUESTRADOR

Fluxo:

```text
Marketplace Event
        ↓
Adapter
        ↓
Normalize
        ↓
Deduplicate
        ↓
Qualification
        ↓
Pricing
        ↓
Proposal
        ↓
Policy Engine
        ↓
ALLOW / HUMAN_GATE / BLOCK
        ↓
CRM
```

---

# 57. OPENAI

A OpenAI continuará responsável por:

```text
understanding
classification
qualification
semantic extraction
proposal writing
conversation analysis
risk detection
matching
```

A OpenAI NÃO será responsável por decidir se uma plataforma autoriza automação.

Isso pertence ao:

```text
Platform Policy Engine
```

---

# 58. PRIORIDADE DE IMPLEMENTAÇÃO

Implementar nesta ordem:

## 1 — Upwork

```text
OAuth
API Key
Job Search
Normalization
Qualification
Proposal Generator
API capability mapping
Status Sync
```

## 2 — Freelancer.com

```text
Permission Request
API Auth
Project Search
Normalization
Bid Integration
Status Sync
```

## 3 — Workana

```text
Email Intake
Manual Project Intake
Normalization
Proposal Studio
Human Gate
```

## 4 — Fiverr

```text
Brief Notification Intake
Message Notification Intake
Opportunity Parser
Qualification
Offer Studio
Human Gate
```

---

# 59. FEATURE FLAGS

Criar:

```text
UPWORK_ENABLED
UPWORK_API_ENABLED
UPWORK_AUTO_SUBMISSION_ENABLED

FREELANCER_ENABLED
FREELANCER_API_AUTHORIZED
FREELANCER_AUTO_BID_ENABLED

WORKANA_ENABLED
WORKANA_AUTOMATION_AUTHORIZED

FIVERR_ENABLED
FIVERR_AUTOMATION_AUTHORIZED
```

Default:

```text
UPWORK_ENABLED=true

FREELANCER_ENABLED=true

WORKANA_ENABLED=true
WORKANA_AUTOMATION_AUTHORIZED=false

FIVERR_ENABLED=true
FIVERR_AUTOMATION_AUTHORIZED=false
```

---

# 60. FAIL CLOSED

Regra extremamente importante:

Quando houver dúvida sobre autorização:

```text
DO NOT EXECUTE
```

Nunca:

```text
"provavelmente pode"
```

O sistema deve operar em:

```text
FAIL CLOSED
```

Exemplo:

```typescript
if (!policy.canAutomate(operation)) {
    return HUMAN_GATE;
}
```

---

# 61. NÃO IMPLEMENTAR WORKAROUNDS

Não criar soluções para contornar limitações como:

```text
mouse movement randomization
human-like delay para esconder bot
proxy rotation
CAPTCHA bypass
browser fingerprint spoofing
session cookie extraction
hidden scraping
anti-detection browser
```

Se a plataforma não autorizar automação:

```text
use HUMAN_GATE
```

---

# 62. META FINAL

A arquitetura final deverá possuir:

```text
99Freelas Adapter
Upwork Adapter
Freelancer Adapter
Workana Adapter
Fiverr Adapter
        ↓
Unified Opportunity Engine
```

Cada Adapter sabe:

```text
como receber oportunidade
como ler oportunidade
como enviar proposta
como sincronizar mensagens
como sincronizar status
o que pode automatizar
o que precisa de humano
```

O Opportunity Engine não conhece esses detalhes.

---

# 63. RESULTADO ESPERADO

O Dashboard poderá mostrar:

```text
TODAS AS OPORTUNIDADES

99Freelas       12
Upwork           8
Freelancer       6
Workana          5
Fiverr Briefs    3

TOTAL           34
```

Mesmo que os mecanismos de captura sejam diferentes.

O usuário verá uma única Opportunity Inbox.

---

# 64. PRINCÍPIO FINAL

Não estamos construindo quatro novos agentes.

Estamos construindo:

```text
UM Opportunity Engine
+
QUATRO Marketplace Adapters
```

A inteligência:

```text
OpenAI
```

permanece compartilhada.

O que muda entre plataformas é:

```text
autenticação
entrada
capabilities
API
submission
communication
compliance
```

Essa separação é obrigatória para que o sistema seja escalável e para que novas plataformas possam ser adicionadas futuramente sem reconstruir o agente comercial.