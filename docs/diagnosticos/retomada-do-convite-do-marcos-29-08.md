# Retomada — a causa-raiz do convite do Marcos (Foocci)

> **Estado escrito no repositório em 29/08/2026, 22:4x UTC**, porque a sessão
> perdeu o agendamento (`send_later`) e as ferramentas do GitHub no meio do turno.
> **Quem pegar esta frente não precisa perguntar nada a ninguém: está tudo aqui.**

## A pergunta que ainda NÃO tem resposta

**Qual dos seis motivos recusou o convite de parceria do Marcos?**
E: **para qual dos dois cadastros da FOOCCI o link dele aponta?**

⚠️ **Não invente o conserto antes do motivo.** O conserto é diferente para cada
motivo. Esta é ordem do Diretor Geral, e continua valendo.

## Por que ela não foi respondida — o elo exato que falta

A régua que responde está **pronta, testada e provada** — mas mora no **PR #400**,
que **ainda não foi mergeado**. Enquanto ele não estiver em produção, não há como
perguntar ao banco.

Não há atalho, e vale registrar por quê: o banco é **SQLite num volume do
Railway**. Não tem porta de rede. A única leitura possível é por uma rota que
roda **dentro do container** — que é exatamente o que o PR entrega.

Medido e confirmado nesta sessão, direto no Railway:
- o conserto do PR #399 está no ar desde 29/08 14:49 (deploy `8925b9d5`, SUCCESS);
- filtro `CONVITE` no log desse deploy: **zero linhas**, com o `[despertador]`
  enchendo o log ao lado. É zero de verdade: **o Marcos não voltou ao site.**
- Esperar por ele não é plano. A resposta tem de sair do banco.

## Os três passos, na ordem

### 1. Mergear o PR #400
`claude/convite-foocci-causa-raiz` → `claude/dioli-agency-os-architecture-kk7kp`.
Conferido em 22:41: **sem conflito**, CI verde na rodada anterior (`305335d`).
**O merge é do CEO ou do Diretor Geral** — a sala não mergeia o próprio PR.

### 2. Ter a chave de leitura
`PILOTO_SECRET` **existe** em produção. O que a sala não consegue é **ler o valor**
(o Railway mostra o nome, nunca o segredo).

Duas saídas, qualquer uma serve:
- **o CEO roda o `curl`** com a chave que ele já tem; ou
- **trocar `PILOTO_SECRET` por um valor novo** no painel do Railway — projeto
  `b776c152-698e-4fa0-923f-ead2de6a24d0`, serviço `diolidigital`
  `e0c288cb-c10f-4100-8863-48de0bb43d65`. É rota **somente-leitura**, reversível,
  não encosta em cadastro nem em dinheiro. ⛔ **O valor nunca entra em chat, log
  ou commit** — lê-se no painel.

> ⚠️ **Provisionar `PILOTO_SECRET` como variável própria é pendência de segurança
> por si só.** Sem ela o código cai no `CRON_SECRET` — segredo que autoriza
> **ESCRITA** — trafegando em `?chave=`, que aparece em log de proxy/CDN. Está
> registrado desde 16/08; a seção nova só encareceu.

### 3. Medir e responder

    curl -sS "https://diolidigital.com.br/api/piloto/diagnostico?chave=$PILOTO_SECRET" | jq .parcerias

**Como ler a resposta:**
- `convites[]` traz, para **cada** convite do banco: `motivo` (um dos seis),
  `clientId`, `prefixo` (8 caracteres — **nunca o token inteiro**), `usos`,
  `ultimoUsoEm`, `expiraEm`, `revogadoEm`.
- `clientes_de_nome_colidente[]` traz os cadastros duplicados por nome, dizendo
  qual deles tem `temParceriaViva: true`.

**A hipótese principal, e como confirmá-la ou derrubá-la:**
um convite com `motivo: "parceria_nao_esta_viva"` cujo `clientId` esteja num grupo
colidente onde o **outro** cadastro tem `temParceriaViva: true` → **causa achada**,
e o conserto é **fundir os dois cadastros** (o caminho da fusão foi consertado
neste PR: antes ele abortava com 500 mudo).

Se o motivo for outro, o retrato já o nomeia — e aí o conserto é outro.

## O que se sabe do duplicado (de 28/08, não medido hoje)

O cadastro da FOOCCI nasceu **duas vezes**, com 7 segundos de diferença
(double-submit), em 27/08 21:22. Um carrega a parceria e um convite emitido; o
outro é lixo. Detalhe em `docs/diagnosticos/fusao-de-cliente-duplicado.md`.

⚠️ **A pista forte:** o link do Marcos foi cunhado **depois** de o duplicado ser
descoberto — então ele pode ter usado o **link anterior**, apontando para o outro
cadastro.

## Um buraco que apareceu procurando, e que ninguém tinha visto

**A casa não registra qual link foi entregue a quem.** `ConviteDeParceria` guarda
quem cunhou e uma observação livre, mas nada amarra um convite ao Marcos. Por isso
não dá para caçar "o token dele" — só listar todos e ver o estado de cada um.
Varrido o repositório: **nenhum token de produção** está versionado (bom), e
nenhum registro de entrega existe (ruim).

## O que NÃO fazer

- ⛔ Não mandar mensagem para pessoa real. Não gerar cobrança de verdade.
- ⛔ Não mexer no cadastro de produção da FOOCCI **sem necessidade** — e se mexer,
  dizer exatamente o quê.
- ⛔ Não escrever o conserto antes de ter o motivo medido.
