# Roteiro do vídeo — App Review da Meta (envio mínimo: 3 permissões)

> Escrito em 15/08/2026 para o CEO gravar. **Um vídeo só** cobre as três
> permissões do envio mínimo: `pages_show_list`, `instagram_basic` e
> `instagram_content_publish`. O mesmo arquivo é anexado nas três telas.
>
> Regra da Meta que manda no roteiro (está escrita no próprio formulário):
> *"incorpore o fluxo de autorização do OAuth no screencast"*. Por isso o vídeo
> **começa desconectado** — o revisor precisa ver o login acontecendo.

## Antes de apertar REC

| # | O que | Por quê |
|---|---|---|
| 1 | **Desconectar a Meta** na tela de Integrações | O vídeo tem de mostrar o login acontecendo. Já conectado, não há o que filmar. |
| 2 | **Ter uma peça aprovada e agendada** no Planner, do cliente que será usado | "Publicar agora" só solta peça já agendada — é a trava, não um detalhe. |
| 3 | **Soltar o freio de publicação** (`PUBLICACAO_ORGANICA`) | Com o freio puxado, a publicação é recusada e o vídeo mostra erro. **Decisão do CEO.** |
| 4 | **Usar o Instagram da própria Dioli**, não o de um cliente | Com acesso padrão, publicar em conta própria é permitido; em conta de cliente ainda não é — e tentar foi o que causou a restrição de 03/08. |
| 5 | Fechar abas e notificações; deixar a tela limpa | Notificação pessoal no vídeo vai junto para a Meta. |

## A gravação, clique a clique

**Cena 1 — Entrar (10s).**
Abrir `https://www.diolidigital.com.br/auth/signin`, entrar com o usuário de
teste (o mesmo que será informado no formulário). Mostrar o painel abrindo.

**Cena 2 — O login do Facebook (60s). ← obrigatória**
Abrir `https://www.diolidigital.com.br/agency/integrations`, no cartão da Meta
clicar **Conectar**. Deixar o diálogo do Facebook aparecer **inteiro**: escolher
o negócio, ver a lista de permissões que o app pede, e confirmar. Não corte
essa parte — é o "fluxo de OAuth" que eles exigem ver.

**Cena 3 — A lista de Páginas (30s). → prova `pages_show_list`**
De volta ao sistema, mostrar a lista de Páginas que o usuário administra.
Passar o mouse devagar pelos nomes e **selecionar/autorizar** uma Página.
Isto é o consentimento: quem escolhe é o dono, de uma lista do que ele
realmente administra.

**Cena 4 — O perfil do Instagram (40s). → prova `instagram_basic`**
Abrir **Clientes** → o cliente → aba **Integrações**. Mostrar o nome de usuário
do Instagram, a foto do perfil e a grade de publicações recentes carregando.
Deixar a tela parada 3 segundos para o revisor ler.

**Cena 5 — A aprovação do cliente (30s).**
Abrir a peça que está aprovada e mostrar **que o cliente aprovou** — quem
aprovou e quando. É o argumento central do texto de justificativa: nada sai sem
aprovação, peça por peça. Mostrar isso vale mais que qualquer frase.

**Cena 6 — A publicação (40s). → prova `instagram_content_publish`**
Ir ao **Planner**, abrir a peça agendada, clicar em **Publicar agora**.
Esperar a confirmação de sucesso aparecer na tela.

**Cena 7 — A prova (20s).**
Abrir o Instagram (app ou navegador) e mostrar **o post no ar** no perfil.
Fecha o argumento: o que foi publicado no sistema apareceu na conta.

**Duração total: 3 a 4 minutos.** Sem narração e sem edição.

## Depois de gravar

1. Voltar em cada uma das três permissões (botão de editar na linha).
2. Arrastar o **mesmo arquivo** na caixa de gravação de tela.
3. Salvar as três.
4. Conferir que cada uma tem: texto colado, vídeo anexado, caixinha marcada e
   a chamada de teste de API com bolinha verde ("Concluída").
5. **Só então** enviar para análise.

## O que NÃO fazer no vídeo

- Não mostrar chaves, tokens, nem a tela de Configurações.
- Não publicar em perfil de cliente (ver item 4 acima).
- Não acelerar nem cortar o diálogo do Facebook.
- Não gravar com dado de cliente real visível se puder evitar.
