# Parecer `google` — CAMINHO C: conta de serviço lendo a pasta-raiz da agência

**Data:** 08/08/2026 · **Pedido por:** `pm`, a pedido do CEO — confirmar/corrigir o
parecer `2026-08-08-drive-da-agencia.md`, que foi escrito pelo `pm` porque o
despacho de subagente ainda não existia. Este parecer **é** o do especialista.

**Contexto:** app OAuth `dioli-digital` (`87784856270`) **publicado**, hoje com
três escopos concedidos: `openid email profile`, `drive.file`, `business.manage`.
Pasta-raiz `Dioli Digital - Material Agencia`
(`1aQl9eHyXCPQ4gX4AWfJe_sjdKVAXNjTK`), dona = `agenciadioli@gmail.com`, **Gmail
comum, não Workspace**. Nenhuma chamada de escrita foi feita. Nenhum escopo foi
acrescentado ao app durante esta análise. Todas as fontes abaixo foram
recapturadas ao vivo em 08/08/2026 (Playwright, hash gravado no cabeçalho de
cada arquivo) — não é memória de modelo.

---

## VEREDITO: 🛑 **NÃO PODE** como atalho barato — e a lacuna do parecer anterior está **FECHADA**, não aberta

O parecer de `pm` (08/08, Saída C) chamou isto de *"o item de melhor
custo/benefício da lista... uma pergunta ao Google, não semanas"*. **Isso está
errado, e a correção é o ponto central deste parecer:** a resposta já está
documentada, não precisa de pergunta nenhuma ao Google, e a resposta é **NÃO,
a isenção não cobre este caso**. O Caminho C custa **exatamente o mesmo preço
da Saída A** (`drive.readonly` direto): verificação de escopo restrito,
avaliação de segurança (CASA) porque a casa guarda os bytes, reverificação
anual. A única coisa que muda entre C e A é *quem* segura a credencial (conta
de serviço vs. OAuth do CEO) — não o preço de compliance.

**O que o Caminho C entrega de verdade, tecnicamente, é bom** (pergunta 1): a
melhor evidência disponível diz que sim, ele leria a pasta inteira e o que
entrar depois. **O problema nunca foi a técnica. É a verificação restrita —
que ninguém evita compartilhando em vez de pedir consentimento OAuth.**

---

## 1. Uma conta de serviço com a pasta compartilhada lista e lê o que já existe E o que entrar depois?

### Resposta: **provavelmente sim** — evidência combinada de duas fontes, nenhuma frase única junta os dois pontos, mas a combinação é sólida.

- `fontes/workspace-create-credentials.md` (capturada hoje) descreve exatamente
  este padrão, com uma **pasta** como exemplo explícito: *"Se o app precisar
  apenas ler ou gravar arquivos específicos (como uma planilha Google ou **uma
  pasta do Google Drive**), não será necessário atribuir funções
  administrativas ou configurar a delegação em todo o domínio. [...] É possível
  tratar o endereço de e-mail da conta de serviço como uma conta de usuário nas
  configurações de compartilhamento do documento sem privilégios de
  administrador necessários."* E mais adiante: *"Quando um app é autenticado
  como uma conta de serviço, ele tem acesso a **todos os recursos que a conta
  de serviço tem permissão para acessar**."*
- `fontes/drive-api-expansive-access.md` (capturada hoje, mesma página do
  parecer de ontem, sem mudança de conteúdo relevante): *"Todos os usuários com
  acesso a uma pasta também têm acesso a todos os itens dentro dela [...]. Esse
  comportamento de acesso existe no Meu Drive e nos drives compartilhados."* O
  documento fala em "usuários" de forma genérica — **não exclui nem menciona
  contas de serviço**, mas também **não distingue tipo de identidade** para
  este mecanismo. O modelo de permissão do Drive (quem está na lista de
  permissões de uma pasta) não tem um comportamento documentado separado para
  "grantee é humano" vs. "grantee é conta de serviço".
- **Por que isto é diferente do caso de 07/08 (Picker + `drive.file`), e por
  que aquele NÃO PODE não se repete aqui:** o achado de 07/08 era que o escopo
  `drive.file` mantém uma lista interna de "arquivos abertos com o app" que só
  é populada por criação do app ou por seleção no Picker — **compartilhar pela
  tela padrão do Drive não alimenta essa lista**, e isso vale tanto para humano
  quanto para conta de serviço, porque é uma propriedade do **escopo**, não do
  tipo de credencial. Só que o Caminho C **não usa `drive.file`** — usa
  `drive.readonly` (pergunta 2), que **não tem** essa restrição de "lista
  interna": ele segue a ACL real do arquivo, que é exatamente o que o
  `expansive access` descreve. É essa troca de escopo — não a troca de
  credencial — que faz a pasta compartilhada "funcionar" no Caminho C onde não
  funcionava no Picker.
- **Sem "pending access":** `fontes/workspace-create-credentials.md` diz que
  ao compartilhar com uma conta de serviço, "Desmarque Notificar pessoas (como
  as contas de serviço não têm caixas de entrada, elas não recebem o e-mail de
  convite, **mas a permissão ainda é concedida**)". Não há etapa de aceitação
  pendente do lado da conta de serviço — a permissão vale assim que o
  compartilhamento é salvo.
- `fontes/drive-api-cotas.md` (nova, ver pergunta 4) confirma de outro ângulo
  que o Google trata a conta de serviço como um usuário comum para fins de
  cota: *"As chamadas de API por uma conta de serviço são consideradas como
  uso de **uma única conta**."*

**Nenhuma fonte junta as duas frases numa só** ("conta de serviço + expansive
access = lê a árvore inteira"). É inferência de combinar duas fontes
independentes, e por isso não é certeza de 10 — mas é a leitura correta do
mecanismo, e é muito mais forte que "lacuna". Marco como **PODE, tecnicamente**
— o obstáculo real está na pergunta 2 e 3, não aqui.

---

## 2. Qual escopo, e ele é restrito? A conta de serviço muda alguma coisa por não ter tela de consentimento?

### Resposta: `drive.readonly`. É **RESTRITO**. E não, JWT/2LO **não isenta** — pelo contrário, a existência de uma isenção específica para conta de serviço **prova** que o padrão é exigir verificação também dela.

- Nenhum escopo não-sensível cobre leitura de conteúdo por ACL. A lista de
  `fontes/drive-api-escopos.md` só tem `drive.file` como não sensível — e
  `drive.file` já foi descartado na pergunta 1 pelo motivo técnico (não segue
  ACL de compartilhamento comum). Todos os outros escopos de leitura de
  conteúdo — `drive`, `drive.readonly`, `drive.metadata`,
  `drive.metadata.readonly` — estão na tabela **"Escopos restritos"**. Não
  existe um meio-termo não-sensível para este caso.
- `fontes/google-service-accounts.md` (capturada hoje) confirma o mecanismo:
  conta de serviço + JWT é "OAuth de duas pernas" (2LO), **sem consentimento de
  usuário** — *"o aplicativo chama as APIs do Google em nome da conta de
  serviço, evitando o envolvimento direto dos usuários"*. Isso é fato.
- Mas a pergunta que importa é se **ausência de tela de consentimento isenta
  de verificação de escopo restrito** — e a resposta está em
  `fontes/google-oauth2-escopos-restritos.md`, na própria seção de exceções:
  existe uma exceção nomeada **"Somente dados de propriedade do serviço"**
  (linha ~154): *"Se o app usa uma conta de serviço para acessar apenas os
  próprios dados e não acessa dados do usuário (vinculados a uma Conta do
  Google), não é necessário enviar para verificação."*
  **Uma isenção só existe para tirar algo de uma regra que, por padrão, se
  aplicaria.** Se contas de serviço fossem estruturalmente isentas de
  verificação de escopo restrito por não terem tela de consentimento, esta
  cláusula não precisaria existir. A cláusula prova o oposto do que o parecer
  de ontem presumiu: **conta de serviço com escopo restrito TAMBÉM precisa de
  verificação, por padrão** — a menos que se enquadre nesta exceção específica.
  (E a pergunta 3 mostra que não se enquadra.)
- Verificação de escopo restrito é uma configuração do **projeto/app inteiro**
  (a "página de acesso a dados do console do Cloud" —
  `fontes/google-oauth2-escopos-restritos.md`), não do fluxo de autorização.
  Adicionar `drive.readonly` ao projeto `dioli-digital` — mesmo que só a conta
  de serviço o use — declara o escopo no app e aciona o mesmo processo de
  verificação, avaliação de segurança (porque a casa guarda os bytes,
  `MAX_BYTES_DO_DRIVE` em `lib/integrations/google/drive.ts`) e reverificação
  anual que a Saída A do parecer de ontem já tinha precificado.

> ### ⚠️ CORREÇÃO (08/08/2026, auditoria do `pm`) — o mecanismo do bullet acima está SUPERESTIMADO; o veredito NÃO muda
>
> O `pm` levantou um contra-argumento tecnicamente correto e eu o testei ao
> vivo (WebFetch, 08/08/2026) contra seis fontes oficiais adicionais
> (`oauth2/production-readiness/restricted-scope-verification`,
> `support.google.com/cloud/answer/13463073`, `.../13464323`, `.../13463817`,
> `developers.google.com/workspace/guides/configure-oauth-consent`,
> `cloud.google.com/iam/docs/service-account-overview`). Resultado:
>
> 1. **O contra-argumento acerta um ponto real.** A própria biblioteca já capturada
>    (`fontes/workspace-create-credentials.md`, linhas 104–115) descreve o
>    caminho exato do Caminho C — compartilhar um arquivo/pasta diretamente com
>    o e-mail da conta de serviço — e **em nenhum passo manda declarar o escopo
>    na tela de permissão OAuth ou na página "Acesso a dados"**. O escopo entra
>    em código, no momento de pedir o token (`createScoped(...)`, no exemplo de
>    `fontes/google-service-accounts.md`). **Isso é diferente** do único
>    caminho onde a própria fonte liga explicitamente escopo de conta de
>    serviço à tela de consentimento: a **delegação em todo o domínio**
>    (`workspace-create-credentials.md`, linha 182: *"Esse é o mesmo conjunto
>    de escopos que você definiu ao configurar a tela de permissão OAuth"*) —
>    que nem é o mecanismo do Caminho C, e que, além disso, entra pelo **Admin
>    Console do Workspace** (Delegação em todo o domínio), não pela página
>    "Acesso a dados" do Cloud Console. **Não há fonte oficial que diga que uma
>    conta de serviço usada por compartilhamento direto (sem delegação em todo
>    o domínio) precisa ter seu escopo adicionado na página "Acesso a dados" do
>    projeto.** A frase "declara o escopo no app e aciona o mesmo processo de
>    verificação" acima **não tem citação que a sustente** para este caminho
>    específico — é a minha inferência de ontem generalizando a partir do texto
>    genérico "declare todos os escopos usados pelo app na página de acesso a
>    dados" (`google-oauth2-escopos-restritos.md`, linha 41), que não distingue
>    tipo de credencial. **Correção: rebaixo essa frase de fato para inferência
>    não confirmada.**
> 2. **Nenhuma fonte — nem as seis novas — diz explicitamente a que a
>    *aplicação/bloqueio técnico* da verificação se prende**: se o Google
>    tecnicamente barra a emissão de token 2LO/JWT para uma conta de serviço
>    pedindo escopo restrito não verificado, ou se o bloqueio só existe do lado
>    3LO (tela "app não verificado" que o usuário vê e precisa clicar para
>    continuar) e o 2LO simplesmente nunca passa por ali. Toda menção de
>    "verificação"/"Acesso a dados" nas fontes capturadas (inclusive as novas)
>    descreve o fluxo com tela de consentimento — nenhuma fala de token
>    2LO/JWT sendo recusado por falta de verificação. **Isto é LACUNA, não
>    fato** — ver seção de lacunas, item novo.
> 3. **Por que o veredito da seção 3 NÃO muda mesmo com a correção do item 1:**
>    a análise de "Somente dados de propriedade do serviço" na pergunta 3 não
>    depende do mecanismo de "onde o escopo é declarado" — depende do **texto
>    da isenção em si**, que exige as duas condições ("acessar apenas os
>    próprios dados" **e** "não acessar dados do usuário vinculados a uma Conta
>    do Google") e falha nas duas porque a pasta pertence a
>    `agenciadioli@gmail.com`. Essa parte da pergunta 3 é citação direta do
>    texto da isenção, não do argumento "a isenção existir prova a regra". A
>    frase "a existência de uma isenção prova que o padrão é exigir
>    verificação também dela" (linha ~113–118, abaixo) **é raciocínio, não
>    citação** — mantenho-a porque ainda é consistente com a frase geral de
>    `oauth-verificacao-do-app.md`/`google-oauth-verificacao-do-app.md`
>    ("If your app uses Google APIs to access Google users' data, it may be
>    subject to a verification process") combinada com a condição negativa da
>    própria isenção — mas **marco-a explicitamente como inferência**, não como
>    fato documentado isoladamente, para não repetir o erro que o `pm` apontou.
>
> **Conclusão da correção:** o preço "igual ao da Saída A" continua de pé, mas
> por um motivo mais estreito do que o parecer original disse: não é porque
> "adicionar o escopo ao projeto aciona verificação automaticamente
> independente do tipo de credencial" (isso é inferência não confirmada, agora
> marcada como tal) — é porque a isenção específica que livraria a conta de
> serviço de verificação **não se aplica a este dado** (pasta de uma Conta do
> Google real), e a Política de dados do usuário continua valendo
> independentemente de qual página do console tecnicamente bloqueia o quê. Se
> o Google não bloquear tecnicamente o token 2LO (lacuna aberta), o risco vira
> **conformidade/auditoria retroativa**, não 403 imediato — o que muda o *tipo*
> de risco (menos "trava técnica", mais "descumprimento de política sujeito a
> revogação/suspensão"), não o veredito.

---

## 3. A isenção de verificação vale aqui? (a pergunta que decide se o Caminho C é barato)

### Resposta: **NÃO. Nem uma, nem a outra. Isto fecha a lacuna — não é "não dá para afirmar".**

**"Somente dados de propriedade do serviço"** (`google-oauth2-escopos-restritos.md`,
~linha 154) exige duas coisas ao mesmo tempo — "acessar **apenas os próprios
dados**" **e** "**não** acessar dados do usuário (vinculados a uma Conta do
Google)". A pasta pertence a `agenciadioli@gmail.com`, que é, pela própria
definição do documento, **uma Conta do Google**. O material nela — mesmo sendo
material "da agência" e não "do cliente final" — é tecnicamente **dado de um
usuário do Google, compartilhado com a conta de serviço**, não um dado que a
conta de serviço possui por si mesma (como um bucket do Cloud Storage que ela
criou). As duas condições da isenção falham. **Não se aplica.**

**"Uso pessoal"** (`google-oauth2-escopos-restritos.md`, ~linha 141-145): *"Um
caso de uso é se você for o único usuário do app ou se ele for usado por
apenas alguns usuários, todos conhecidos pessoalmente por você [...] Um limite
de usuários restringe o número de Contas do Google que podem conceder acesso
ao seu app não verificado."* Este mecanismo é sobre **quantas Contas do Google
passam pela tela de "app não verificado" e clicam para continuar** — é um
limite de **consentimento OAuth de usuário**. Uma conta de serviço não passa
por essa tela; quem concede acesso à pasta é o dono do Drive pelo
compartilhamento comum, não por um fluxo de consentimento OAuth do app. Não há
"Conta do Google concedendo acesso ao app não verificado" neste caminho — o
mecanismo da isenção simplesmente **não tem onde se prender** no cenário de
conta de serviço. Além disso, mesmo que se tentasse aplicar ao app como um
todo, o app **já tem clientes reais fora do círculo pessoal do CEO** (o fluxo
`drive.file` de cliente, parecer de 07/08) — não se qualifica como "uso
pessoal" de qualquer forma.

**Pior caso, com todas as letras:** se a casa compartilhar a pasta com uma
conta de serviço e chamar `files.list`/`files.get` usando `drive.readonly` sem
passar pela verificação de escopo restrito, o app fica **fora de conformidade
com a Política de dados do usuário dos Serviços de API** — o mesmo risco
genérico descrito em `fontes/google-politica-de-dados-do-usuario.md` e, em
casos de fiscalização, o Google pode revogar acesso ao escopo ou desativar o
projeto. Não é o "ban" imediato do Ads, mas é a mesma família de risco: **usar
capacidade que a plataforma não autorizou para o que a casa está fazendo.**

---

## 4. Cotas da Drive API (lacuna fechada — nova fonte capturada)

Capturei `docs/plataformas/google/fontes/drive-api-cotas.md`
(`developers.google.com/workspace/drive/api/guides/limits`, hash gravado no
cabeçalho) e mais três fontes de apoio (`drive-api-changes.md`,
`google-service-accounts.md`, `workspace-create-credentials.md`,
`drive-api-expansive-access.md`) — todas adicionadas a `fontes.json` e
capturadas com Playwright, não resumidas por navegador de terceiros.

- **⚠️ Mudança de modelo em 01/05/2026**, relevante para a idade do projeto:
  *"Os projetos do Google Cloud que usaram essa API entre novembro de 2025 e
  abril de 2026 vão continuar com as cotas de uso definidas anteriormente. Os
  projetos do Cloud criados a partir de 1º de maio de 2026 estão sujeitos às
  novas cotas."* **LACUNA declarada:** a página não descreve o valor das cotas
  "antigas" — só as novas. Se o projeto `dioli-digital` já existia antes de
  01/05/2026 (verificável no console, não por esta biblioteca), a cota
  aplicável pode ser diferente da tabela abaixo.
- **Cotas do modelo novo** (projetos criados a partir de 01/05/2026):
  - **1.000.000 unidades de cota por minuto por projeto**;
  - **325.000 unidades de cota por minuto por usuário por projeto** — e "as
    chamadas de API por uma conta de serviço são consideradas como uso de uma
    única conta" (ou seja, a conta de serviço consome deste teto como se fosse
    um usuário só, mesmo que várias rotinas a compartilhem);
  - **400.000.000 unidades/dia por projeto** — limite de faturamento (uso
    abaixo disso não gera cobrança; cobrança começa "mais tarde em 2026");
  - **1 TB de egresso por dia por projeto**;
  - **Sem limite de número de solicitações por dia**, desde que dentro das
    cotas por minuto.
- **Custo por método** (unidades de cota): `files.get` (leitura) = **5**;
  `files.list` (listagem) = **100**; `files.download` = **200**;
  `files.update` (edição) = **50**; `files.generateIds`/outras = **5**.
  `changes.list` **não tem linha própria na tabela** — é análogo a uma
  listagem; tratar como **100** por chamada é a suposição conservadora, mas é
  suposição, não número capturado. **LACUNA declarada.**
- **`changes.watch`, `channels.stop`, `files.watch` contam na cota**;
  notificações entregues por push, não.
- Erro de estouro: **403 `User rate limit exceeded`** ou **429 `Rate limit
  exceeded`** — espera exponencial recomendada, `maximum_backoff` de 32–64s,
  mesmo algoritmo já usado nas outras APIs do Google descritas na cartilha.

**Cadência segura para `changes.list` com `pageToken` incremental:** mesmo no
pior caso de leitura (100 unidades/chamada, tratando como `files.list`), os
tetos de 325.000/min (por conta) e 1.000.000/min (por projeto) tornam a cota
irrelevante para uma rotina de poucos clientes rodando a cada 15 minutos —
**a regra de ritmo que já está na cartilha e no parecer de 07/08 (mínimo 15
min entre varreduras, backoff em 403/429, nada de chamada a partir de
renderização de tela) continua sendo o limite que importa**, não a cota
numérica. A cota documentada não é o risco aqui; o **padrão de rajada** (a
mesma assinatura que restringiu a Meta) é.

`changes.getStartPageToken()` dá o token inicial; `changes.list(pageToken)`
devolve `nextPageToken` (mais página) ou `newStartPageToken` (chegou ao fim,
guardar para a próxima rodada) — `fontes/drive-api-changes.md`.

---

## O QUE FICA COMO LACUNA

1. **Custo/valor exato de `changes.list` na tabela de cotas** — a página não
   lista o método explicitamente; tratamos como equivalente a `files.list`
   (100 unidades) por prudência, sem confirmação literal.
2. **Se o projeto `dioli-digital` é anterior ou posterior a 01/05/2026** — a
   biblioteca não tem essa data; decide se a tabela de cotas nova (capturada
   hoje) ou a antiga (não documentada nesta página) vale para nós. Verificável
   no Console do Cloud, não por captura de página pública.
3. **Nenhuma fonte junta explicitamente "conta de serviço" + "expansive
   access"** numa única frase — a resposta da pergunta 1 é a leitura correta
   de duas fontes combinadas, não uma citação direta. Continua sendo a melhor
   evidência disponível, não uma certeza documental de 10/10.
4. **O que muda no código** (`escolha-de-material.ts`, `drive.ts`) para
   suportar uma conexão de conta de serviço em vez de conexão por cliente —
   não foi desenhado neste parecer, que é só leitura/opinião. Se o CEO decidir
   seguir para a verificação restrita, o próximo parecer é sobre a
   implementação, não sobre a política.
5. **[NOVA, 08/08/2026, auditoria do `pm`] Se o Google tecnicamente barra a
   emissão de token 2LO/JWT para conta de serviço pedindo escopo restrito não
   verificado, ou se o bloqueio só existe do lado 3LO (tela de app não
   verificado, que uma conta de serviço nunca vê).** Testei seis fontes
   oficiais ao vivo (WebFetch 08/08/2026:
   `oauth2/production-readiness/restricted-scope-verification`,
   `support.google.com/cloud/answer/13463073`, `.../13464323`, `.../13463817`,
   `developers.google.com/workspace/guides/configure-oauth-consent`,
   `cloud.google.com/iam/docs/service-account-overview`) e **nenhuma** diz o
   que acontece tecnicamente quando um JWT 2LO pede um escopo restrito não
   verificado — todas descrevem o mecanismo de verificação em termos de tela
   de consentimento/"Acesso a dados" do Cloud Console, que é o fluxo 3LO.
   **Isto é raciocínio por ausência, não uma citação que feche a pergunta.**
   Também abro como lacuna, pela mesma auditoria: **nenhuma fonte confirma que
   a página "Acesso a dados" do Cloud Console aceita ou exige declarar escopo
   de conta de serviço usada por compartilhamento direto (sem delegação em
   todo o domínio)** — a evidência que existe (`workspace-create-credentials.md`,
   linhas 104–115) aponta para o **contrário**: o passo a passo do
   compartilhamento direto nunca toca a tela de consentimento OAuth; só a
   **delegação em todo o domínio** (mecanismo diferente, que o Caminho C não
   usa) liga escopo de conta de serviço a "a mesma tela de permissão OAuth" —
   e mesmo ali, quem recebe a lista de escopos é o **Admin Console do
   Workspace** (Controles de API), não a página "Acesso a dados" do Cloud
   Console. Isso **corrige** (não invalida) a frase original da pergunta 2 que
   dizia que adicionar `drive.readonly` ao projeto "declara o escopo no app e
   aciona o mesmo processo de verificação" — marcada agora como inferência
   superestimada, não fato citável. **O veredito da pergunta 3 não depende
   dessa frase e continua de pé** (ver caixa de correção na pergunta 2): a
   isenção "somente dados de propriedade do serviço" falha nas próprias duas
   condições, independente de qual página do console tecnicamente bloqueia o
   quê.

---

## Recomendação prática

**O Caminho C não é um atalho.** Ele resolve a pergunta 1 (mecanismo) mas não
resolve o preço (perguntas 2 e 3) — que é o mesmo da Saída A do parecer de
ontem. As opções reais continuam sendo as três já levantadas em
`2026-08-08-drive-da-agencia.md`, com uma correção: **remova a Saída C da
lista de "baratas"**. Sobra, como caminho sem custo de verificação, a
**Saída B** (a casa passa a CRIAR os arquivos via `drive.file`, upload pela
própria tela da Dioli) — que segue sem parecer de escrita, e é a única saída
que não custa semanas nem depende de decisão de compliance do Google.
