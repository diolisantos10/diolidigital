# Parecer do especialista do Google — Drive do cliente no portal

**Data:** 07/08/2026 · **Solicitante:** Diretor (ordem do CEO)
**Ação avaliada:** cada cliente conecta o Google Drive dele ao portal; a agência
lê de lá o material de marca (logo, fotos, manual, capturas de tela) e usa como
insumo de produção.

## Veredito

**PODE COM AJUSTE** — para a **leitura** desenhada abaixo (escopo `drive.file`
+ Google Picker, arquivo a arquivo, declarado pelo cliente).

**NÃO PODE** para: qualquer escrita no Drive do cliente; qualquer escopo amplo
(`drive`, `drive.readonly`, `drive.metadata*`); e qualquer leitura antes de o
app OAuth sair do status **"Teste"** — porque, nesse status, a conexão morre
sozinha em 7 dias e o cliente vai achar que é defeito nosso.

---

## 1. Escopo — qual é, e por que é este

O escopo pedido é **um só**:

```
https://www.googleapis.com/auth/drive.file
```

Descrição oficial, na cópia da biblioteca
(`fontes/drive-api-escopos.md`, capturado em 07/08/2026):

> "Criar novos arquivos do Drive ou modificar arquivos que você abre com um app
> ou que o usuário compartilha com um app ao usar a API Google Picker ou o
> seletor de arquivos do app."

E, na mesma fonte:

> "O escopo do OAuth `drive.file` permite que os usuários escolham quais
> arquivos querem compartilhar com seu app."
> "Verificação simples: como `drive.file` não é sensível, ele permite um
> processo de verificação mais simplificado."

**O preço do contrário**, na mesma fonte: `drive` ("Ver e gerenciar todos os
seus arquivos do Drive") e `drive.readonly` ("Ver e fazer o download de todos os
seus arquivos do Drive") estão listados como **escopos restritos**. Escopo
restrito exige verificação restrita do Google e — porque esta casa **guarda os
bytes** no próprio volume — avaliação de segurança de terceiros
(`fontes/oauth-verificacao-do-app.md`: "Apps requesting restricted scopes data
need to complete 're-verification' annually"; a avaliação de segurança é
requisito de quem armazena ou transmite dados de escopo restrito).

Conclusão: **escopo estreito, e não é negociável.** É também a regra da casa
desde o incidente de 06/08/2026 — *alcance nunca é autorização*.

## 2. Pasta e subpasta — a pergunta do CEO, respondida com fonte

**O que a documentação oficial diz:** nada. A página capturada
(`fontes/drive-api-escopos.md`) descreve `drive.file` como acesso **por
arquivo** — "arquivos que você abre com um app ou que o usuário compartilha com
um app" — e **não contém uma única frase** sobre o que acontece quando o usuário
escolhe uma **pasta**. Conferi também a visão geral do Picker
(`fontes/drive-picker-visao-geral.md`) e as referências do `DocsView`
(`setSelectFolderEnabled`: "Allows the user to select a folder in Google
Drive"; `setIncludeFolders`: "Show folders in the view items") — **nenhuma
delas diz que escolher uma pasta dá acesso ao conteúdo dela.**

**A única declaração de um funcionário do Google que encontrei** é da comunidade
oficial de Apps Script (Eric Koleda, 11/06/2019):

> "Unfortunately the drive.file scope doesn't give you access to files within a
> folder that was picked."
> (https://groups.google.com/g/google-apps-script-community/c/_W-NKbttfbo)

**Isto é uma lacuna declarada da biblioteca**, e está registrada como tal na
cartilha. Não existe página oficial atual que confirme *nem* que negue o
comportamento. **Regra da casa: a casa não aposta em comportamento não
documentado.** Portanto o desenho trata pasta como **não-material**, e o seletor
é configurado com `setSelectFolderEnabled(false)`.

**Na prática, para o CEO:**

- **Ele PODE manter as subpastas que quiser.** A organização do Drive dele não
  muda em nada — o seletor do Google navega por dentro das pastas e subpastas
  normalmente (`setIncludeFolders(true)`).
- **O que ele NÃO pode é entregar a pasta e ir embora.** Ele abre a pasta no
  seletor e marca os arquivos (dá para marcar vários de uma vez).
- **Arquivo novo colocado depois NÃO entra sozinho.** Subiu peça nova na pasta
  de referências? Precisa abrir o seletor e escolher — uma vez.
- **Não precisa de pasta plana.** Estrutura por cliente e por campanha continua
  valendo; ela só não substitui o clique de escolher.

**O preço da alternativa** (se ele quiser "aponta a pasta e esquece"):
`drive.readonly`, escopo **restrito** → verificação restrita do Google +
avaliação de segurança de terceiros + reverificação anual. Semanas a meses, com
auditoria. **Recomendação: não.** O custo é desproporcional para economizar
cliques numa escolha que acontece uma vez por lote de material.

## 3. Publicação do app OAuth — o que trava hoje

Fonte: `fontes/oauth2-tokens-e-expiracao.md` (capturado 07/08/2026), item de
expiração do refresh token:

> "Um projeto do Google Cloud Platform com uma tela de permissão OAuth
> configurada para um tipo de usuário externo e um status de publicação de
> 'Teste' recebe um token de atualização que expira em sete dias, a menos que os
> únicos escopos OAuth solicitados sejam um subconjunto de nome, endereço de
> e-mail e perfil do usuário."

Ou seja: **com o app em "Teste", o cliente conecta, funciona, e quebra sozinho
no 8º dia.**

A boa notícia está em `fontes/oauth-verificacao-do-app.md`:

> "If your app utilizes only non-sensitive scopes, it is not mandatory for your
> app to complete the app verification process. However, if you want your app to
> display an app name and logo on the OAuth consent screen, you will need to
> complete a lighter-weight verification process known as 'brand-verification'."

Como `drive.file` é **não sensível**, **não há processo de verificação
obrigatório**. O que falta é apenas **mudar o status de publicação de "Teste"
para "Em produção"** no console do Google Cloud.

**O que o CEO precisa clicar** (Google Cloud Console → APIs e Serviços → Tela de
permissão OAuth, no projeto que hospeda `GOOGLE_CLIENT_ID`):

1. **"PUBLICAR APP"** e confirmar. É o clique que acaba com a expiração de 7
   dias.
2. Conferir que a tela tem **nome do app, e-mail de suporte, logo, link do site
   e link da política de privacidade** — obrigatórios para a tela não assustar o
   cliente. (Logo e nome exigem a "brand verification", que é leve; sem ela o
   app funciona, só aparece como URL crua na tela de consentimento.)
3. Em **Credenciais**, incluir o URI de redirecionamento
   `https://www.diolidigital.com.br/api/google/drive/callback`.
4. Ativar **Google Drive API** e **Google Picker API** no projeto, e criar uma
   **chave de API de navegador** restrita ao domínio `diolidigital.com.br`
   (variável `GOOGLE_PICKER_API_KEY`) e anotar o **número do projeto**
   (`GOOGLE_PROJECT_NUMBER`).

**Enquanto isso não existir**, o portal diz a verdade: o botão de escolher
arquivos aparece indisponível com "avise a agência — não é problema da sua
conta", em vez de abrir uma janela em branco.

## 4. Escrita no Google — não há nenhuma

Este trabalho **não escreve nada** no Google. Nem no Drive, nem no perfil, nem
em anúncio. As únicas chamadas são `files.get` (metadado) e `files.get?alt=media`
(bytes), ambas GET. A cartilha continua valendo integralmente para as escritas
existentes (avaliações e posts do Meu Negócio), que seguem travadas pelo acesso
não aprovado à API do Business Profile.

## 5. Uso dos dados — o que a política exige

`fontes/politica-de-dados-do-usuario.md` (Google API Services User Data Policy)
impõe uso limitado e finalidade declarada. O desenho cumpre por construção:

- só chega ao servidor o arquivo que **o cliente escolheu** e **declarou**;
- os campos pedidos ao Google são lista fechada (`id,name,mimeType,size`) —
  nada de dono, compartilhamento ou histórico, que são dados de terceiros que
  nunca contrataram esta agência;
- o e-mail da conta é guardado **mascarado** (`jo***@gmail.com`), só para o
  cliente reconhecer qual conta ligou;
- os bytes ficam no volume da casa sob as mesmas regras de mídia já existentes;
- **nada disso vira verdade sobre o negócio.** Material do Drive é insumo: o
  piso de verdade (`lib/agency/execution/piso-de-verdade.ts`) continua sendo o
  único autorizador de afirmação.

## 6. Condições do PODE (todas implementadas)

1. Escopo **exclusivamente** `drive.file`, conferido na volta do OAuth e de novo
   a cada leitura (`escolha-de-material.ts` → `escopo_insuficiente`).
2. Sem `include_granted_scopes` no pedido de consentimento — para não arrastar
   `business.manage` (escrita) para dentro deste token.
3. Nada é usável sem **declaração explícita do cliente** sobre o que o arquivo é.
4. Recusa **antes da rede** (`baixarMaterial` consulta a trava antes de qualquer
   `fetch`; provado em `__tests__/integrations/drive-do-cliente.test.ts`).
5. Expiração tratada como caso normal, com frase em português que diz o que
   fazer ("o acesso ao seu Drive expirou — reconecte").
6. Pasta recusada com recado, não com erro.

## 7. Lacunas declaradas

- **Comportamento de pasta sob `drive.file`**: não documentado por nenhuma
  página oficial capturada. Tratado de forma conservadora (pasta = não-material).
  Reavaliar se o Google publicar página a respeito.
- **`ads-requisitos-de-destino`**: a recaptura de 07/08/2026 falhou por timeout;
  a cópia anterior (03/08) segue na biblioteca.
- **Quotas do Drive API por projeto**: aparecem no console quando o projeto está
  publicado; não há página pública estável para capturar.

---

*Fontes citadas, todas em `docs/plataformas/google/fontes/`, capturadas em
07/08/2026: `drive-api-escopos.md`, `drive-picker-visao-geral.md`,
`drive-api-baixar-arquivos.md`, `oauth2-tokens-e-expiracao.md`,
`oauth-verificacao-do-app.md`, `politica-de-dados-do-usuario.md`.*
