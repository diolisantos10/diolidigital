# A porta do e-mail — passo a passo para o CEO

**O que isto resolve:** o 99Freelas **já manda um e-mail** a cada projeto novo
que combina com o seu perfil. Encaminhando esse e-mail para um endereço nosso, a
oportunidade entra na fila do Radar **em minutos**, com nota, preço e proposta
prontas — sem ninguém estar olhando a tela.

> ### Por que esta é a porta mais barata que existe
>
> Ela **não toca o 99Freelas**. Não há login, não há robô lendo página, não há
> rajada de requisição. Encaminhar e-mail é o que qualquer pessoa faz com a
> própria caixa: não viola termo de uso, não aciona anti-bot e **não tem como
> virar conta banida**. A outra porta (colar no painel) depende de alguém estar
> olhando; esta, não.

---

## O que mudou em 08/08/2026 — e por que isto agora vale a pena

Até esta data a porta **ingeria e não qualificava**. Só o "colar no painel"
chamava a IA. O efeito não era "fica para depois": a fila do Radar ordena pela
nota, e no banco a nota ausente conta como a **menor de todas** — a oportunidade
que chegava por e-mail nascia no rodapé da lista, sem nota, e **ninguém a
pegava**.

Agora as duas portas passam pela mesma máquina: nota, serviço, piso de preço e
**Compliance Validator**. Proposta que viola a regra da plataforma **não fica
copiável**, e a tela diz o que reprovou.

---

## ⚠️ ANTES DE TUDO: o segredo precisa existir em produção

A rota é fechada por um segredo de cabeçalho. **Sem `RADAR_EMAIL_SECRET`
configurado, ela responde 503 e não grava nada** — configuração faltando é porta
FECHADA, nunca porta aberta.

## ✅ CONFIRMADO EM 08/08/2026: o segredo EXISTE em produção

Medido, não deduzido. A porta respondeu **401 Unauthorized** a uma chamada sem a
chave — ou seja, ela está armada e recusou quem não a tem. Se o segredo não
existisse, a resposta teria sido **503**.

> ⚠️ **Só `https://www.diolidigital.com.br` responde.** O domínio sem `www`
> (`https://diolidigital.com.br`) **não devolveu nada** na mesma medição. Use o
> endereço com `www` em toda configuração abaixo — apontar o encaminhador para o
> domínio sem `www` produz uma porta que nunca recebe nada e **não avisa
> ninguém**. Fazer o domínio raiz responder é conserto de DNS, e é outra frente.

**O comando que refaz a medição a qualquer momento** (não grava nada):

```sh
curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST https://www.diolidigital.com.br/api/agency/oportunidades/email \
  -H "Content-Type: text/plain" --data "teste"
```

| Resposta | O que significa | O que fazer |
|---|---|---|
| **401** | O segredo EXISTE. A porta está armada e recusou quem não tem a chave. | Nada. Siga para o passo 1. |
| **503** | O segredo **não existe**. A porta está fechada. | Criar a variável (abaixo) e reimplantar. |

**Se der 503**, no Railway → *Variables* do serviço:

```sh
# gere um valor novo, não reaproveite senha de nada
openssl rand -base64 32
```

- Nome: `RADAR_EMAIL_SECRET`
- Valor: o que o comando acima imprimiu

---

## Os três dados que o encaminhador precisa mandar

| O quê | Valor |
|---|---|
| **Endereço (URL)** | `https://www.diolidigital.com.br/api/agency/oportunidades/email` — **com `www`**, ver o aviso acima |
| **Cabeçalho da chave** | `x-radar-secret: <o valor de RADAR_EMAIL_SECRET>` |
| **Cabeçalho do inquilino** | `x-radar-workspace: <id ou slug do workspace da Dioli>` |

> **Os dois cabeçalhos são obrigatórios**, e o segundo por um motivo que vale
> dizer: **não existe atalho de "cai no primeiro workspace do banco"**. Esse
> atalho entrega o dado de um cliente no lugar errado, em silêncio. Sem o
> workspace, a rota **recusa** — e recusar é a resposta honesta.

O corpo pode chegar em três formatos, e os três funcionam: JSON
(`{"assunto":…,"texto":…}`), formulário de *inbound parse* (SendGrid, Mailgun) ou
texto puro.

---

## Passo 1 — a regra no Gmail do CEO

O Gmail encaminha **para um endereço de e-mail**, não para uma URL. Então o
caminho tem duas metades: o Gmail manda para um endereço, e um serviço traduz
aquele e-mail em chamada HTTP.

1. Gmail → **Ver todas as configurações** → **Encaminhamento e POP/IMAP** →
   **Adicionar um endereço de encaminhamento** → o endereço do serviço (passo 2).
   O Gmail manda um código de confirmação para esse endereço; confirme.
2. Gmail → **Filtros e endereços bloqueados** → **Criar novo filtro**:
   - **De:** `no-reply@99freelas.com.br` *(confirme o remetente exato num alerta
     que já esteja na caixa — se ele for outro, use o que estiver lá; um filtro
     apontando para o remetente errado não encaminha nada e não avisa)*
   - marque **Encaminhá-lo para**: o endereço do passo 2
   - marque **Nunca enviar para Spam**
   - **Não marque "Excluir"**: o alerta original fica na caixa, e ele é a prova
     de que a oportunidade existiu.
3. **Criar filtro.**

> **Confira depois de criar:** encaminhe **um** alerta à mão e abra
> `/agency/oportunidades`. Se ele não aparecer em um minuto, o problema está na
> regra ou no segredo — e é melhor descobrir agora do que daqui a duas semanas
> com a fila vazia parecendo "mercado fraco".

## Passo 2 — o serviço que traduz e-mail em chamada

Qualquer um serve. Em todos, a configuração é a mesma: **URL + os dois
cabeçalhos** da tabela acima.

| Opção | Custo | Observação |
|---|---|---|
| **Cloudflare Email Routing + Email Worker** | grátis | exige um domínio no Cloudflare. É a mais barata e a que menos depende de terceiro. |
| **Mailgun Routes** (`store()` + `forward()`) | plano grátis | manda `multipart/form-data` com `subject`, `text`, `html` — a rota já lê os três. |
| **SendGrid Inbound Parse** | grátis | mesmo formato do Mailgun. |
| **Zapier / Make** | pago acima de pouco volume | o mais rápido de montar, o mais caro de manter. |

---

## O que esta porta NÃO faz — declarado

- **Não busca projeto na plataforma.** Só lê o que o 99Freelas já mandou por
  e-mail. Busca automática toca a plataforma e depende de autorização que o CEO
  ainda não deu.
- **Não envia nada.** O envio continua sendo o clique do CEO, dentro do site
  deles.
- **Não desconta conexão sozinha.** A conexão só é baixada quando alguém marca a
  oportunidade como enviada **e informa quantas conexões a plataforma cobrou** —
  número que só existe na tela do 99Freelas.
- **Roda a qualificação em linha**, então o encaminhador espera alguns segundos a
  mais por e-mail. É escolha declarada: fila assíncrona é frente própria, e
  "grava agora, qualifica algum dia" é o mesmo que não qualificar.
