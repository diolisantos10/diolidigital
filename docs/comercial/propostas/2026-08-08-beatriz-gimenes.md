# Proposta — Beatriz Gimenes (lash designer)

> **Rascunho para o CEO revisar e enviar. NADA foi enviado.**
> Escrito em 08/08/2026. Nenhuma mensagem, e-mail ou DM saiu desta sessão.

| | |
|---|---|
| **Lead** | Beatriz Gimenes — lash designer |
| **Entrou pelo briefing público** | 11/07/2026 |
| **Parado há** | **28 dias** |
| **Canal de contato registrado** | **NENHUM, e nem pista** — ver "Como falar com ela" |
| **Estado no sistema** | `ClientRequestDb`, status `new` |

> 🔴 **Leia o §3 antes de enviar qualquer coisa.** Ela pediu **tráfego pago**, e
> esse é o único dos três leads cujo pedido esbarra no que a casa **não consegue
> entregar hoje**. Isso não é detalhe de execução — é o que a proposta promete
> ao cliente, e a decisão é do CEO.

---

## 1. A abertura — para copiar e colar

> Oi, Beatriz. Aqui é o Dioli, da Dioli Digital.
>
> Você preencheu o briefing no nosso site em 11 de julho e nunca teve resposta.
> A falha foi nossa: o formulário não pedia telefone nem e-mail, e a sua
> mensagem ficou parada sem que ninguém tivesse como te retornar. Já corrigimos,
> mas isso não devolve o mês que você esperou.
>
> Você pediu três coisas: social media, tráfego pago e identidade visual. Consigo
> te atender bem em duas delas hoje, e sobre a terceira prefiro te falar a
> verdade antes de te mandar preço, em vez de você descobrir depois de assinar.
>
> Se ainda fizer sentido conversar, é rápido. E se você já resolveu com outra
> pessoa, também quero saber.

> **Por que a abertura admite um limite:** ela pediu três coisas e a casa entrega
> bem duas. Vender as três e entregar duas custa o cliente no segundo mês —
> e nesse ramo, onde todo mundo se conhece, custa mais que o contrato.

---

## 2. O que a Dioli entendeu do negócio dela

**Só isto:**

- **Nome:** Beatriz Gimenes.
- **Profissão:** lash designer — extensão de cílios.
- **Pediu três frentes:** social media, tráfego pago e identidade visual.

**Fonte:** `docs/pendencias.md:69` e `docs/ENTREGA-DE-BASTAO.md:249`. **As duas
são resumo escrito pela casa, não as palavras dela.** Não achei transcrição,
`rawContext` nem fixture com o que a Beatriz digitou.

### O que NÃO se sabe, e não pode ser preenchido por inferência

- Se atende em estúdio próprio, em casa, ou alugando cabine.
- Se tem equipe ou trabalha sozinha. Isso muda o volume que ela consegue absorver.
- Ticket, público, cidade, bairro.
- **Se já tem logo e identidade**, ou está começando do zero.
- **Quanto ela pretende colocar de verba em anúncio** — e verba de mídia nunca
  entra na mensalidade.
- Volume de conteúdo desejado.

> **O registro vivo está em `ClientRequestDb`, no banco de produção — que esta
> sessão não alcança.** Vale abrir `/agency/leads` no admin antes de escrever a
> versão final.

---

## 3. 🔴 O tráfego pago — o que precisa subir para o CEO

**A casa hoje planeja tráfego pago. Ela não coloca anúncio no ar.**

Isto está medido e escrito em `docs/raio-x-trafego-pago.md`, auditoria pedida
pelo próprio CEO em 02/08/2026, contra o código e não contra a intenção:

> **"A resposta: 30%. (…) hoje a Dioli consegue fechar o contrato do padeiro,
> cobrar certo e entregar um plano bonito. Não consegue colocar um anúncio no
> ar."**

O que está vermelho na auditoria, elo por elo:

| Etapa | Estado |
|---|---|
| Conectar a conta de anúncios do cliente | 🔴 0% — o OAuth não pede `ads_management` nem `ads_read` |
| Criar o criativo | 🔴 15% — entrega a **descrição** da arte, não a imagem |
| Subir a campanha na Meta | 🔴 0% — não há uma linha de Marketing API |
| Rotina semanal do gestor | 🔴 0% — não existe |
| Ler o resultado da campanha | 🔴 0% — só se lê desempenho **orgânico** |

**E há o conflito que eu não resolvo sozinho:** o plano **Crescimento**
(R$ 2.590/mês), que é o degrau da tabela aprovada para quem quer anunciar, inclui
*"3 criativos de anúncio por mês"* e *"leitura quinzenal dos resultados e ajuste
de rota"*. Pelo raio-x, **essas duas linhas não têm como ser cumpridas hoje** —
o criativo sai como texto descritivo e não há leitura de métrica de campanha.

Somado a isso: **a conta de anúncios da própria agência está restrita desde
03/08** e o recurso foi negado (`docs/precos.md`; `docs/pendencias.md`). O
caminho limpo registrado é tráfego **manual, por gente, na conta do cliente** —
e **nunca criar conta nova para contornar**, que é violação literal e derruba o
portfólio inteiro.

### As três saídas — **escolha do CEO, não minha**

1. **Vender só o planejamento.** "Estrutura de campanha (setup)" — **R$ 1.900**,
   um projeto: objetivo, conjuntos, segmentação, verba e copy desenhados. Quem
   sobe e opera é ela ou alguém que ela contrate. É honesto e é o que existe.
2. **Vender o Crescimento assumindo operação manual** — alguém da casa opera na
   conta dela, à mão, sem automação. Custa hora humana que ninguém mediu
   (`docs/precos.md`: a hora humana do Presença para cima é **hipótese**).
3. **Não vender tráfego agora.** Fecha social + identidade, e o tráfego volta à
   mesa quando o elo estiver pronto.

**Minha recomendação, e o motivo:** a **1**. Ela recebe algo real e pago pelo que
vale, a casa não promete operação que não tem, e a porta fica aberta. Mas
**"o que o produto promete ao cliente" é decisão de dono do negócio** — está na
lista do que sobe. Não decidi por você.

---

## 4. O que a Dioli entrega

> **Tabela lida em 08/08/2026: `docs/precos.md` — "v1, 05/08/2026"**, repositório
> em `a35849e`, documento **intacto** (`md5 13239933dc2023889ea55ea8afcca6e8`).
>
> ⚠️ **RECONFERIDO ÀS 18h16**, depois de o outro agente alterar a tabela
> executável no meio desta sessão. `lib/agency/planos.ts` mudou
> (`de468204…` → `f3ce9548…`), mas **as cinco mensalidades, as cinco
> implantações e a peça excedente de R$ 180 continuam idênticas**: a alteração
> só acrescentou campos de volume (`pecasPorMes`, `storiesPorMes`,
> `roteirosDeReelsPorMes`…), sem tocar em preço. Volumes reconferidos contra a
> versão nova — Ritmo 8 · Presença 10 · Conteúdo 14 (+4 stories, +4 roteiros) ·
> Crescimento 18 (+3 criativos).
> **A tabela segue viva sob outro agente: conferir de novo antes de enviar.**

### Frente 1 — Identidade visual (projeto, com começo e fim)

Fora de todo plano por decisão do CEO: é projeto, não entrega mensal, e **pode
vir antes do plano**. Serviço de projeto pode ser a primeira compra.

⚠️ **Confirmar antes:** ela quer identidade do zero, ou já tem algo e quer
ajustar? Não está no registro.

### Frente 2 — Social media

Ela não declarou volume, então o degrau não está decidido. Os três candidatos:

- **Ritmo** — 8 peças/mês com arte e legenda, pauta do mês, calendário, 2 rodadas
  de ajuste. **Ela publica.**
- **Presença** — 10 peças, **nós publicamos**, ficha do Google mantida + 4 posts
  no Google/mês, gestão de avaliações, atendimento humano por WhatsApp.
- **Conteúdo** — 14 peças, 4 stories, 4 roteiros de reels, plano de medição,
  pesquisa de concorrência, reunião mensal, 3 rodadas de ajuste.

**Nenhum inclui vídeo** (gravação/edição/IA) — sempre à parte. **Nenhum inclui
tráfego pago nem verba de mídia**, exceto o Crescimento, com a ressalva do §3.

### Frente 3 — Tráfego pago

**Ver §3.** Não escreva esta frente na proposta antes de o CEO escolher entre as
três saídas.

---

## 5. O preço

Todos os valores saem da tabela citada acima. Nenhum foi estimado.

| Item | Preço |
|---|---|
| **Identidade visual** | **R$ 2.900** — projeto, em 3x |
| Plano **Ritmo** | R$ 297/mês + implantação R$ 390 · permanência 3 meses |
| Plano **Presença** | R$ 790/mês + implantação R$ 1.290 · permanência 3 meses |
| Plano **Conteúdo** | R$ 1.390/mês + implantação R$ 1.900 · permanência 6 meses |
| **Estrutura de campanha (setup)** — saída 1 do §3 | **R$ 1.900**, uma vez |
| Plano **Crescimento** — saída 2 do §3, **com a ressalva** | R$ 2.590/mês + implantação R$ 2.900 · permanência 6 meses |
| Criativo de anúncio avulso | R$ 320 (3/mês no Crescimento) |
| Peça além do contratado | R$ 180 |

**Verba de mídia:** sempre **fora** da mensalidade, paga por ela direto à
plataforma, na conta dela, no nome dela. **Zero promessa de faturamento ou de
retorno** — é regra da casa e vai escrita na proposta.

**Exemplo de montagem, se o CEO escolher a saída 1 e ela ficar no Presença:**
R$ 2.900 (identidade, 3x) + R$ 1.900 (setup de campanha) + R$ 790/mês + R$ 1.290
de implantação. **Não mande esta linha sem o CEO ter escolhido o degrau** — ela
nunca declarou volume.

> **Interno — NÃO vai na proposta.** Pisos (`docs/precos.md`): Ritmo R$ 229,
> Presença R$ 690, Conteúdo R$ 1.190, Crescimento R$ 2.190. Primeiro as moedas
> que não custam margem; só depois o preço. No piso, corta escopo, nunca margem.

---

## 6. O próximo passo

**Um só:** uma conversa de 20 minutos para responder três coisas — se ela já tem
logo, quanto de conteúdo por mês ela aguenta publicar, e quanto pretende colocar
em anúncio por mês. Com isso, o orçamento fecha em número.

Frase para o fim da mensagem:

> Consegue 20 minutos esta semana? São três perguntas e eu te mando o orçamento
> fechado no mesmo dia. Se preferir, me passa um WhatsApp que eu te ligo.

---

## 7. Como falar com ela

🔴 **NÃO HÁ COMO FALAR COM ELA. Esta proposta não tem caminho de entrega.**

- **Sem telefone, sem e-mail, sem Instagram.** O briefing público, à época, não
  pedia contato.
- **Sem pista tampouco.** Não há arroba, número nem domínio registrado para a
  Beatriz em nada que esta sessão alcança.

**O CEO precisa fornecer o caminho.** A máquina não vai deduzir contato — é regra
da casa, e contato inventado é pior que nenhum: desliga o alarme sem dar para
onde ligar.

⚠️ **Sem contato do CEO, esta proposta não sai. Fica pronta e parada.**

> 📌 Nota lateral, para quem for procurar: `app/agency/integrations/page.tsx:575`
> menciona *"existe o do Sushi Cazza e o da Beatriz"* falando de **conexões da
> agência**. **Não tratei isso como contato dela** — é referência a configuração
> de integração, não a um canal de fala, e deduzir seria exatamente o erro
> proibido. Se o CEO souber que ali há um perfil ligado a ela, **quem confirma é
> ele.**

---

## 8. O que falta antes de enviar

- [ ] 🔴 **CEO decide o que a proposta promete sobre tráfego pago** — saída 1, 2
      ou 3 do §3. **Esta é a decisão mais importante das três propostas.**
- [ ] 🔴 **CEO fornece o contato.** Sem isso, nada acontece.
- [ ] **Abrir `/agency/leads` no admin** e ler o dossiê dela direto do banco.
- [ ] **Reler `docs/precos.md`** e reconferir os números (outro agente estava
      alterando a tabela em 08/08).
- [ ] **Não afirmar nada sobre o estúdio, equipe ou público dela** — não está no
      registro.
- [ ] Degrau de social fica **em aberto** até ela declarar volume.
