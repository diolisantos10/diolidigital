# Conexão nativa do cliente com a Meta — estado real e o que falta

> Pedido do CEO em 05/08/2026, marcado como **urgente**: o cliente precisa
> liberar acesso de parceiro às redes E à conta de anúncios DELE, num setup
> fácil para quem não entende de tecnologia. Campanha roda na conta do cliente,
> nunca na da agência.

## O que JÁ existe (e é mais do que parece)

A fundação está construída e no ar:

- **`/api/meta/connect-parceiro?token=…`** — o OAuth do cliente, aberto em popup
  pela aba **Conexões** do portal. A posse é derivada do token do portal, nunca
  de query ou corpo.
- **Escopos já pedidos**, incluindo os de anúncio: `ads_management`, `ads_read`,
  `pages_*`, `instagram_*`, `whatsapp_*`, `business_management`.
- **Descoberta e gravação** das páginas e contas de Instagram após o retorno.
- **`/api/meta/contas-de-anuncio`** — lista as contas de anúncio que o acesso
  alcança e as autoriza no app (o "0/100" das configurações avançadas).
- **Ritmo de chamada** (`ritmo.ts`) em toda chamada à Graph — a trava que veio
  depois da restrição de 03/08.

**Ou seja: o cliente já consegue conectar Facebook, Instagram e WhatsApp pelo
portal, em um clique.**

## O que falta — três coisas, e só uma delas é código nosso

### 1. A conta de anúncios não aparece no portal do cliente (código, ~1 dia)

`ConexoesDoCliente` só desenha Facebook, Instagram e WhatsApp. A rota de contas
de anúncio existe mas é **da agência**, não do portal. Sem isso, o cliente
autoriza tudo e a agência ainda precisa entrar em outro painel para amarrar a
conta — que é exatamente o passo manual que o CEO quer eliminar.

**O que fazer:** trazer a conta de anúncio para a mesma lista, com estado
próprio ("conectada", "falta autorizar", "sem permissão ainda") e um botão só.

### 2. O setup para quem não entende de tecnologia (código, ~1 dia)

Hoje a aba mostra uma lista. Para o dono de padaria, lista não é instrução.
O desenho certo é **três passos com estado visível**:

1. Entrar com o Facebook (o popup)
2. Escolher a página e o Instagram
3. Liberar a conta de anúncios

Com, em cada passo: o que aquilo permite, o que a agência **não** consegue fazer,
e como revogar. Quem não entende de tecnologia não trava por dificuldade — trava
por **medo de estar dando acesso demais**. A tela tem de responder isso antes de
ele perguntar.

### 3. App Review e verificação de negócio — semanas, e é AÇÃO DO CEO

`ads_management`, `ads_read`, `instagram_content_publish`,
`instagram_manage_insights`, `whatsapp_business_messaging` e
`business_management` são **permissões avançadas**. Sem App Review aprovado elas
só funcionam nas contas do próprio administrador do app.

**Consequência prática, sem meia palavra:** por mais bonito que fique o botão, o
cliente que não for administrador do nosso app **não consegue** liberar a conta
de anúncios dele até a Meta aprovar. É processo de terceiro, leva semanas, e
depende de verificação de negócio (CNPJ, domínio, documentos).

**Enquanto não sai**, o caminho legítimo é a lista de contas autorizadas do modo
de teste (`/api/meta/contas-de-anuncio`) — que já existe e cabe até 100 contas.
Não é escalável para sempre; é o que permite começar agora.

## A trava que vale aqui

Toda ação de **escrita** na Meta a partir deste fluxo — publicar, criar campanha,
mudar verba — continua exigindo parecer prévio do especialista `meta`. Vale
inclusive para conta de cliente conectada por este caminho: a restrição de
03/08 veio de operação em ritmo de máquina, não de token inválido.

## Ordem de obra

1. Conta de anúncio dentro da aba Conexões do portal (com os três estados).
2. Os três passos com explicação de permissão e caminho de revogação.
3. Parecer do `meta` sobre o pacote de escopos antes de qualquer escrita.
4. App Review + verificação de negócio — **entra na fila da Meta hoje, ou tudo
   acima é botão bonito que não conclui**.
