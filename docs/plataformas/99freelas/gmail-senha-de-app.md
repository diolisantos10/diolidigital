# Ligar a leitura da caixa da agência — passo a passo

**Para quê:** a casa lê sozinha o Gmail da agência e transforma cada alerta do
99Freelas em oportunidade qualificada, sem ninguém encaminhar nada.

**Estado:** `RADAR_GMAIL_USER` e `RADAR_GMAIL_APP_PASSWORD` já estão nas
Variables do Railway. Os passos 1–4 abaixo são para **trocar** a senha ou ligar
uma caixa diferente pela tela.

---

## Os 4 passos

1. **Verificação em duas etapas** — `myaccount.google.com/security` → ativar.
   Sem ela o Google **não cria** senha de aplicativo. Não há como pular.
2. **`myaccount.google.com/apppasswords`**
3. **Criar a senha com o nome `Radar Dioli`.**
4. **Colar em `/agency/oportunidades` → "Caixa de entrada da agência".**
   Os espaços podem vir junto. Depois: **"Testar conexão"**.

---

## Conferir antes de confiar no número

O endereço exato de onde o 99Freelas manda os alertas **não foi confirmado por
ninguém**. O filtro padrão é o domínio inteiro — `@99freelas.com.br`.

- Abra um alerta de verdade na caixa.
- Veja o remetente.
- Se quiser apertar o filtro, troque no campo **"Remetentes que entram"**.

Enquanto o filtro estiver largo, ele **não perde alerta** — no máximo deixa
entrar outro e-mail daquele mesmo domínio, e esse vira uma linha "ignorada" no
histórico se não tiver conteúdo de projeto.

---

## O que você está entregando

A senha de aplicativo dá **leitura da caixa inteira** — todo e-mail que ela já
recebeu e todo que vier, não só os alertas do 99Freelas.

O código lê **apenas** as mensagens do remetente configurado. Isso é escolha do
código, **não limite da chave**.

## O que a rotina faz com a caixa

| Faz | Não faz |
|---|---|
| Lê a INBOX dos últimos 7 dias, a cada 5 min | Apagar |
| Marca como lida **se você ligar isso na tela** (padrão: desligado) | Mover, arquivar |
| | Responder, enviar |

O alerta original é a prova de que a oportunidade existiu.

## Revogar

| Onde | O que acontece |
|---|---|
| Botão **"Apagar credencial"** na tela | Tira a senha desta casa |
| `myaccount.google.com/apppasswords` | **É o que corta de verdade** |
| Variável no Railway | Enquanto `RADAR_GMAIL_APP_PASSWORD` existir lá, ela **vence** a tela — apagar na tela não fecha a porta |

## Se o teste disser que não conectou

| Mensagem | Causa mais provável |
|---|---|
| autenticação recusada | duas etapas desativada · senha revogada · senha de outra conta |
| tempo esgotado na porta 993 | a rede daquele ambiente bloqueia IMAP |
| não está configurada | nem variável no Railway, nem senha na tela |
