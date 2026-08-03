# Cartilha do Google — o que pode, o que não pode, o que suspende

> Biblioteca do especialista do Google da Dioli Digital. Escrita em 03/08/2026,
> no dia em que a Meta restringiu a conta de anúncios da agência por "automação
> fora das regras" — esta cartilha existe para o mesmo erro não se repetir no
> Google. Toda afirmação relevante cita o documento oficial capturado em
> `fontes/` (rode `node scripts/biblioteca/capturar.mjs google` para atualizar).
> A versão em inglês das políticas é a que vale juridicamente; as traduções
> pt-BR são informativas (aviso do próprio Google no topo de cada página).

---

## (a) O que SUSPENDE a conta — o equivalente do ban da Meta

**Suspensão por violação grave é imediata, sem aviso prévio, e permanente**
salvo contestação aprovada. Violações não-graves recorrentes seguem um sistema
de avisos: notificação com pelo menos 7 dias de antecedência; até 3 avisos, com
suspensões temporárias de 3 e 7 dias e, no terceiro, suspensão da conta
(fonte: fontes/ads-suspensao-de-conta.md).

As políticas cuja violação é considerada "grave" incluem: **fraude de sistema
(circumventing systems), práticas enganosas coordenadas, falsificação, software
mal-intencionado, práticas comerciais inaceitáveis**, farmácias não
autorizadas, sanções comerciais, conteúdo sexual explícito
(fonte: fontes/ads-suspensao-de-conta.md).

### Fraude de sistema (circumventing systems) — o nosso maior risco

É exatamente a categoria do ban que levamos na Meta. O Google proíbe
"publicidade, conteúdo ou destinos que tentem enganar ou burlar nossos
processos de revisão". Exemplos listados pelo próprio Google
(fonte: fontes/ads-contornar-sistemas.md):

- **Criar variações de anúncios, domínios ou conteúdo já reprovados** para
  passar de novo pela revisão;
- **Criar novas contas para voltar ao sistema após uma suspensão** — o "abre
  outra conta e tenta de novo" é, por si só, violação grave;
- **Abusar de recursos do produto para gerar mais tráfego** ou exibir conteúdo
  não conforme;
- **Enviar informações falsas aos programas de verificação**;
- **Cloaking**: mostrar ao Google um destino e aos usuários outro;
- **Uso indevido de várias contas** — anunciar o mesmo conteúdo reprovado em 2+
  contas, ou acumular violações espalhadas entre contas.

Práticas recomendadas do próprio documento que valem como regra da casa:
**"limite a criação de contas em massa — evite criar muitas contas em um curto
período"**, vincule cada conta a uma empresa real e a uma forma de pagamento
confiável, e **resolva suspensões antes de criar conta nova**
(fonte: fontes/ads-contornar-sistemas.md).

### Efeito em cadeia — igual à Meta

"As contas relacionadas à conta suspensa também podem ser suspensas. [...]
todas as novas contas que o anunciante tentar criar também serão suspensas."
Contas verificadas com os mesmos documentos caem juntas e voltam juntas
(fonte: fontes/ads-suspensao-de-conta.md). **Regra da casa: com uma conta
suspensa, NÃO se opera em conta relacionada (mesmo MCC, mesmo cartão, mesmo
CNPJ) até resolver.**

### Automação e ritmo

O Google detecta violação combinando IA com revisão humana e analisa "anúncios,
contas, sites, conteúdo, reclamações de usuários" e fontes externas
(fonte: fontes/ads-suspensao-de-conta.md). Na API, o limite técnico é medido em
QPS por conta (CID) e por token de desenvolvedor, e estouro devolve
`RESOURCE_TEMPORARILY_EXHAUSTED`; o próprio Google recomenda limitar tarefas
simultâneas, agrupar operações em lote e usar rate limiter/fila no lado do
cliente (fonte: fontes/ads-api-limites.md). **Rajada de escrita em conta fria —
o padrão que derrubou a conta na Meta — aqui alimenta tanto o limite técnico
quanto o sinal de abuso da rede** (fonte: fontes/ads-abuso-da-rede.md).

### Outras causas de suspensão (não-política)

Faturamento (estorno, abuso de código promocional, saldo não pago, pagamento
suspeito), atividade não autorizada na conta, restrição de idade da Conta
Google (fonte: fontes/ads-suspensao-de-conta.md).

---

## (b) O que REPROVA anúncio

### Deturpação (misrepresentation)

Proibido anúncio ou destino que "exclua informações relevantes [...] ou exiba
conteúdo enganoso sobre produtos, serviços ou empresas". Sub-categorias
(fonte: fontes/ads-deturpacao.md):

- **Práticas comerciais inaceitáveis** (VIOLAÇÃO GRAVE → suspensão imediata):
  dar a entender apoio de marca/governo que não existe, oferecer o que não se
  pode entregar (inclusive por falta de licença), passar-se por outra marca;
- **Declarações enganosas / não confiáveis**: promessa sem sustentação —
  inclui o superlativo sem prova ("o melhor", "nº 1") e claims de resultado
  (preço, emagrecimento, ganho financeiro) sem base verificável;
- **Práticas desonestas de preço**, ofertas indisponíveis (anunciar o que não
  está à venda pelo valor anunciado), clickbait, mídia manipulada.

### Requisitos de destino

O destino do anúncio precisa funcionar, ser útil e navegável; o anúncio precisa
refletir para onde o clique leva. Categorias de reprovação: destino que não
funciona, não rastreável (bloqueado por robots), inacessível, e **destination
mismatch** (URL final em domínio diferente do exibido). Violações desta
política dão aviso de pelo menos 7 dias antes de qualquer suspensão — reprovam
o anúncio primeiro (fonte: fontes/ads-requisitos-de-destino.md).

### Editorial

Anúncio precisa de "aparência profissional": sem palavras truncadas,
CAPSLOCK abusivo, pontuação/símbolos fora de padrão, número de telefone no
texto do anúncio. Reprovação editorial NÃO suspende conta
(fonte: fontes/ads-editorial.md; a isenção explícita está em
fontes/ads-contornar-sistemas.md: "as contas não são suspensas por reprovações
relacionadas a problemas editoriais").

### Conteúdo restrito

A visão geral das políticas lista as famílias: proibido (falsificação, produtos
perigosos, capacitação de conduta desonesta) e restrito — álcool, jogos de
azar, saúde, financeiro, adulto — que exigem certificação e/ou segmentação
limitada (fonte: fontes/ads-politicas-visao-geral.md). Saúde é o exemplo
capturado em detalhe: medicamentos, procedimentos e claims de saúde têm regras
por país e certificações próprias (fonte: fontes/ads-saude-e-medicamentos.md).
**Cliente de clínica, farmácia, suplemento ou bebida → parecer obrigatório
ANTES da proposta, não do anúncio.**

---

## (c) Perfil de Empresa — posts e respostas a avaliações

### Representação da empresa

Um perfil por empresa; nome/endereço/categorias como o negócio é reconhecido no
mundo real; promoções precisam de termos claros e "todas as garantias,
explícitas ou implícitas, precisam ser cumpridas". O Google "reserva o direito
de suspender o acesso [...] a Perfis de Empresas ou outros Serviços do Google"
por violação (fonte: fontes/business-profile-diretrizes.md).

### Posts

Valem as políticas de conteúdo proibido e restrito para texto, foto e vídeo; é
proibido solicitar informações pessoais/confidenciais em qualquer superfície do
perfil (fonte: fontes/business-profile-posts.md;
fontes/business-profile-diretrizes.md).

### Respostas a avaliações — o nosso caso de uso real (`lib/agency/esteira/avaliacoes.ts`)

O que o Google diz, e o que muda para o nosso robô:

1. **Responder em nome do cliente é permitido — com autorização dele.** "Para
   responder a essas avaliações em nome do cliente final, você precisa receber
   a autorização dele. Todas as respostas precisam seguir as Políticas de
   conteúdo proibido e restrito" (fonte: fontes/business-profile-api-politicas.md).
2. **⚠️ AUTOMATIZAR resposta sem consentimento específico é PROIBIDO pela
   política da API.** Texto literal: "você não pode automatizar ou acionar
   respostas de avaliações, perguntas e respostas, criações ou edições de
   fichas [...] **sem o consentimento prévio e específico do usuário**"
   (fonte: fontes/business-profile-api-politicas.md). Ou seja: o nosso fluxo de
   resposta automática a elogios só é conforme se o contrato/onboarding do
   cliente registrar consentimento explícito para respostas automáticas — não
   basta "gerenciamos seu perfil". **Isso precisa virar cláusula e registro no
   sistema antes de o robô rodar em cliente real.**
3. **Toda resposta passa por moderação do Google.** "O Google analisa suas
   respostas [...] geralmente até 10 minutos, mas às vezes até 30 dias"; a
   resposta é pública, sai em nome da empresa, e o autor da avaliação é
   notificado na hora (fonte: fontes/business-profile-responder-avaliacoes.md).
   Publicou errado, o cliente da avaliação já viu — apagar depois não desfaz.
4. **Empresa precisa estar verificada no Perfil antes de responder**
   (fonte: fontes/business-profile-responder-avaliacoes.md).
5. **Conteúdo da resposta**: sem dado pessoal, sem ataque, sem conteúdo fora do
   tema; avaliações e respostas precisam refletir experiência real — conteúdo
   falso ou incentivado é removido e pode suspender a Conta Google globalmente
   (fonte: fontes/avaliacoes-conteudo-proibido.md).
6. **Nunca incentivar/comprar avaliação, nem pedir revisão em troca de
   benefício** — manipulação de nota é violação
   (fonte: fontes/avaliacoes-conteudo-proibido.md).
7. **Transparência da agência**: mudanças feitas pela ferramenta na conta do
   cliente devem ser comunicadas a ele em até 48h com notificação própria; e o
   cliente que sair deve ser desvinculado em até 7 dias úteis
   (fonte: fontes/business-profile-api-politicas.md).

**Leitura do especialista:** o desenho atual do robô (4–5 estrelas responde
sozinho, 1–3 escala para humano, máx. 5 por rodada — ver
`lib/agency/esteira/avaliacoes.ts`) é compatível com o espírito das políticas,
MAS depende de dois pré-requisitos que hoje não existem: consentimento
específico registrado por cliente (item 2) e acesso aprovado à API (seção d).

---

## (d) Regras de API

### Business Profile API

- **Acesso não é automático**: exige Conta Google, perfil verificado, projeto
  no console, conta de organização e **solicitação de acesso à API** aprovada
  pelo Google (fonte: fontes/business-profile-api-prerequisitos.md). O 403 que
  `lib/integrations/google/client.ts` traduz como "o Google ainda não liberou o
  acesso" é exatamente isso.
- **Cada agência/cliente que usa a API programaticamente precisa do PRÓPRIO
  projeto** — é proibido dar acesso indireto ao seu projeto a terceiros
  (fonte: fontes/business-profile-api-politicas.md).
- **Cache de conteúdo da API: máximo 30 dias corridos**, armazenado com
  segurança, sem manipular/agregar (fonte: fontes/business-profile-api-politicas.md).
  Atenção ao nosso `googleReview` no banco: guardamos registro e resposta —
  conferir enquadramento quando o acesso for aprovado.
- **Endpoint GoogleLocations só para comerciantes com relação comercial** —
  usar para geração de leads revoga o acesso imediatamente
  (fonte: fontes/business-profile-api-politicas.md).
- Violação de política pode desativar o projeto **sem aviso prévio** em casos
  graves; o Google pode exigir conta de demonstração da ferramenta em 7 dias
  (fonte: fontes/business-profile-api-politicas.md).

### Google Ads API

- Uso restrito a "criar, gerenciar ou elaborar relatórios de campanhas"; o uso
  precisa corresponder ao que foi declarado na solicitação do token; mudou o
  uso → formulário de alteração (fonte: fontes/ads-api-politicas.md).
- **Token de desenvolvedor sem uso por 90 dias consecutivos pode ser
  desativado** (fonte: fontes/ads-api-politicas.md).
- **Níveis de acesso**: explorador → básico → padrão, cada upgrade com análise
  que "pode levar dias ou semanas"; RMF (recursos mínimos obrigatórios) só se
  aplica ao nível padrão, e não-conformidade pode gerar taxa
  (fonte: fontes/ads-api-niveis-de-acesso.md; fontes/ads-api-politicas.md).
- **Limites de taxa por QPS** (por CID e por token), erro
  `RESOURCE_TEMPORARILY_EXHAUSTED`; mitigação recomendada: lote, limitador de
  taxa, fila (fonte: fontes/ads-api-limites.md).
- OAuth: token de acesso do Google expira em ~1h e é renovado por refresh
  token (implementado em `lib/integrations/google/client.ts`); excesso de
  refresh também é limitado.

### Analytics

- **Proibido enviar ao Analytics qualquer dado que identifique uma pessoa**
  (nome, CPF/CNPJ, e-mail, identificador permanente de dispositivo), "mesmo em
  forma de hash". Upload de PII → **conta encerrada e dados perdidos**
  (fonte: fontes/analytics-uso-de-dados.md).
- Termos de Serviço BR: exigem política de privacidade no site do cliente e
  divulgação do uso de cookies/coleta
  (fonte: fontes/analytics-termos-de-servico.md).

---

## (e) Processo de recurso (contestação)

1. Na conta do Google Ads: notificação no topo → **"Entre em contato"** → abre
   o formulário de contestação (fonte: fontes/ads-suspensao-de-conta.md).
2. **Uma contestação por vez, por conta.** Enviar muitas para a mesma suspensão
   faz o Google suspender o processamento por 7 dias
   (fonte: fontes/ads-suspensao-de-conta.md).
3. Múltiplas contas suspensas → uma contestação por conta; contas suspensas por
   arrasto de documento de identidade voltam automaticamente quando a conta-mãe
   é restabelecida (fonte: fontes/ads-suspensao-de-conta.md).
4. **Escrever "de maneira honesta, clara e fundamentada"** — o Google só
   restabelece "em circunstâncias justificáveis, como no caso de um erro da
   nossa parte"; contestação genérica não passa
   (fonte: fontes/ads-suspensao-de-conta.md).
5. Pode ser exigida verificação de identidade do anunciante — **máximo 3
   tentativas** (fonte: fontes/ads-suspensao-de-conta.md).
6. Prazo: pelo menos 6 meses a partir da suspensão para contestar; conta
   suspensa fica somente-leitura (cancelar, pagar, contestar, segurança)
   (fonte: fontes/ads-suspensao-de-conta.md).
7. **Enquanto a contestação corre: não criar conta nova, não repetir a operação
   em conta relacionada** — isso é "fraude de sistema" e transforma um problema
   recuperável em ban permanente (fonte: fontes/ads-contornar-sistemas.md).
8. No Perfil de Empresa: resposta reprovada na moderação volta para ajuste
   (fonte: fontes/business-profile-responder-avaliacoes.md); violação de
   política da API notifica o e-mail da conta e pode ser refeita via formulário
   de acesso (fonte: fontes/business-profile-api-politicas.md).

---

## Lacunas da biblioteca

Declaradas, não escondidas:

- **Página-hub "Políticas do Google Analytics"** (support.google.com/analytics/
  answer/4597324): a captura veio com <1500 caracteres tanto em pt-BR quanto em
  EN — é uma página-índice curta, rejeitada pelo piso da ferramenta. Cobrimos o
  tema com a política de uso de dados enviados e os Termos de Serviço BR.
- **"Conteúdo proibido e restrito" das contribuições do Maps**
  (support.google.com/contributionpolicy/answer/7400114): a página usa seções
  recolhidas que a captura não expande (<1400 caracteres em pt-BR e EN). Ficou
  na biblioteca a política-mãe de UGC do Maps
  (fontes/avaliacoes-conteudo-proibido.md), que remete a ela. Antes de um
  parecer que dependa do detalhe (ex.: lista exata de conteúdo proibido em
  resposta), o especialista deve consultar a URL ao vivo via WebFetch.
- **Sub-política dedicada "Práticas comerciais inaceitáveis"**: coberta pelo
  resumo dentro de deturpação (fontes/ads-deturpacao.md); a página dedicada não
  foi capturada em separado.
- **Termos e Condições da Google Ads API** (página jurídica completa) e
  **RMF detalhado por recurso**: não capturados; só relevantes quando formos
  pedir upgrade de nível de acesso.
- Rate limits do Business Profile API (QPS específicos): não há página pública
  estável capturada; os limites aparecem no console do projeto quando o acesso
  é aprovado.
