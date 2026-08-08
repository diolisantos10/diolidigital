# Proposta — Camila Pereira (Beauty Clinic)

> **Rascunho para o CEO revisar e enviar. NADA foi enviado.**
> Escrito em 08/08/2026. Nenhuma mensagem, e-mail ou DM saiu desta sessão.

| | |
|---|---|
| **Lead** | Camila Pereira — registrada como "Beauty Clinic" |
| **Entrou pelo briefing público** | 10/07/2026 |
| **Parado há** | **29 dias** |
| **Canal de contato registrado** | **NENHUM, e nem pista** — ver "Como falar com ela" |
| **Estado no sistema** | `ClientRequestDb`, status `new` · **ficha de cliente duplicada** |

> 🔴 **Aviso de honestidade, no topo, de propósito:** **não encontrei o texto do
> briefing dela.** O que a casa tem escrito sobre a Camila são duas linhas de
> resumo, escritas pela própria Dioli, não por ela. Esta proposta é
> deliberadamente mais curta e mais vaga que a do Sushi Cazza — porque o material
> é menor. Encher de detalhe inventado é exatamente o erro que a casa proíbe.

---

## 1. A abertura — para copiar e colar

> Oi, Camila. Aqui é o Dioli, da Dioli Digital.
>
> Você preencheu o briefing no nosso site em 10 de julho e nunca teve resposta.
> A falha foi nossa: o formulário não pedia telefone nem e-mail, e a sua
> mensagem ficou parada sem que ninguém tivesse como te retornar. Já corrigimos,
> mas isso não devolve o mês que você esperou.
>
> Do que você escreveu, o que ficou mais claro foi que você quer conteúdo em
> vídeo, e bastante. Prefiro ser direto sobre isso antes de te mandar qualquer
> número: vídeo é a única coisa que não entra em pacote fechado aqui, e o motivo
> é o custo real de produção. Ele é cobrado à parte, sempre — inclusive para
> quem já é cliente.
>
> Se ainda fizer sentido conversar, eu te mostro como isso fica montado. E se
> você já resolveu com outra pessoa, também quero saber.

> **Por que a abertura já entrega a má notícia:** o pedido central dela é
> justamente o item que a tabela mantém fora de todo plano. Descobrir isso na
> terceira mensagem, depois de ver um preço de plano, parece isca. Dito na
> primeira, é franqueza.

---

## 2. O que a Dioli entendeu do negócio dela

**Só isto, e é pouco:**

- **Nome:** Camila Pereira.
- **Registrada como "Beauty Clinic"** — clínica ou estúdio de estética.
- **Pediu:** social media.
- **Quer muito conteúdo em vídeo.** É o único traço forte do registro.

**Fonte:** `docs/pendencias.md:68` e `docs/ENTREGA-DE-BASTAO.md:248`. **Atenção:
as duas são resumo escrito pela casa, não as palavras dela.** Não achei
transcrição, `rawContext` nem fixture com o que a Camila digitou — diferente do
Sushi Cazza, cuja conversa está reproduzida em dois arquivos de teste.

### O que NÃO se sabe, e não pode ser preenchido por inferência

- Que serviços a clínica presta. "Beauty Clinic" não diz se é estética facial,
  corporal, capilar, unhas ou depilação — **e não dá para adivinhar.**
- Ticket médio, público, região, concorrência.
- Se ela **grava os próprios vídeos** ou quer que a agência produza. Esta é a
  pergunta que muda o preço em mais de 3x (ver §4).
- Volume: quantos posts, quantos vídeos por mês.

> **O registro vivo está em `ClientRequestDb`, no banco de produção — que esta
> sessão não alcança.** Se o texto do briefing dela existir, está lá. Vale
> abrir `/agency/leads` no admin antes de escrever a versão final: a tela monta o
> dossiê a partir do banco e pode ter o que aqui falta.

---

## 3. O que a Dioli entrega

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

### A regra que governa o caso dela

**Vídeo não entra em plano nenhum.** É decisão do CEO, registrada em
`docs/precos.md`: o roteiro está incluído (é texto), mas a gravação, a edição e
o vídeo gerado por IA são compra separada, **sempre**. Diluir o item de maior
custo real da casa dentro da mensalidade põe a tabela inteira no prejuízo.

Então a montagem para ela tem **duas partes**, e isso precisa ficar explícito na
proposta:

### Parte 1 — o plano de social

O degrau que faz mais sentido para quem quer vídeo é **Conteúdo**, porque é
onde os **roteiros de reels** entram:

- Tudo do Presença, com **14 peças por mês** (arte pronta e legenda)
- **4 sequências de stories por mês**
- **4 roteiros de reels por mês** — cena a cena, prontos para gravar
- Nós publicamos no Instagram e no Facebook
- Ficha do Google mantida + 4 posts no Google/mês + gestão de avaliações
- Atendimento humano por WhatsApp em horário comercial
- Plano de medição, pesquisa de concorrência por ciclo, reunião mensal
- 3 rodadas de ajuste por peça

**Não inclui:** a gravação e a edição do vídeo · tráfego pago e verba de mídia ·
site e impresso.

⚠️ **`Conteúdo` é sugestão, não escolha fechada.** Ela não declarou volume. Se o
volume dela for menor, **Ritmo** (8 peças, ela publica) ou **Presença** (10
peças, nós publicamos) são degraus válidos — mas nenhum dos dois inclui roteiro
de reel.

### Parte 2 — o vídeo, à parte

Dois produtos diferentes, e **ela precisa dizer qual**:

- **Ela grava, a Dioli edita** — "Edição do vídeo do cliente (60s)".
- **A Dioli gera por IA** — "Vídeo gerado por IA (15s)", sem ela aparecer nem
  gravar nada.

---

## 4. O preço

### O que tem preço na tabela

| Item | Preço |
|---|---|
| Plano **Conteúdo** | **R$ 1.390/mês** + implantação **R$ 1.900** (permanência 6 meses) |
| Plano **Presença** (alternativa menor) | R$ 790/mês + implantação R$ 1.290 (permanência 3 meses) |
| Plano **Ritmo** (alternativa menor ainda) | R$ 297/mês + implantação R$ 390 (permanência 3 meses) |
| **Edição do vídeo do cliente (60s)** | **R$ 350** cada · **pacote de 4: R$ 1.200** |
| **Vídeo gerado por IA (15s)** | **R$ 690** cada · **pacote de 4: R$ 2.400** |
| Roteiro de reel avulso | R$ 290 (4/mês já inclusos a partir do Conteúdo) |
| Sequência de stories (3 telas) | R$ 190 (inclusa a partir do Conteúdo) |
| Peça além do contratado | R$ 180 |

### 🔴 O total mensal é **"a definir"** — e isso não é enrolação

**Ela não declarou quantos vídeos por mês nem de que tipo.** A diferença entre
os dois produtos de vídeo é grande o bastante para que estimar seja mentir:

- 4 vídeos/mês **editados** (ela grava): R$ 1.200
- 4 vídeos/mês **gerados por IA**: R$ 2.400

O mesmo "4 vídeos por mês" custa **o dobro** conforme a resposta de uma
pergunta que ninguém fez a ela. **Somar um número ao plano agora seria
inventar.** Os preços unitários vão na proposta; o total sai depois da conversa.

> **Interno — NÃO vai na proposta.** Pisos de negociação (`docs/precos.md`):
> Ritmo R$ 229, Presença R$ 690, Conteúdo R$ 1.190. Primeiro as moedas que não
> custam margem (prazo, à vista, menos rodadas, contrato longo, autorização de
> case); só depois o preço. No piso, corta escopo, nunca margem.

---

## 5. O próximo passo

**Um só:** uma conversa de 20 minutos para responder três perguntas — o que a
clínica faz, quantos vídeos por mês ela quer, e se ela grava ou quer que a gente
produza. Com as três respondidas, o orçamento fecha em número.

Frase para o fim da mensagem:

> Consegue 20 minutos esta semana? São três perguntas e eu te mando o orçamento
> fechado no mesmo dia. Se preferir, me passa um WhatsApp que eu te ligo.

---

## 6. Como falar com ela

🔴 **NÃO HÁ COMO FALAR COM ELA. Esta proposta não tem caminho de entrega.**

- **Sem telefone, sem e-mail, sem Instagram.** O briefing público, à época, não
  pedia contato.
- **Sem pista tampouco.** Diferente do Sushi Cazza — que ao menos escreveu
  `@sushicazzaoficial` no meio da conversa — não há arroba, número nem domínio
  registrado para a Camila em nada que esta sessão alcança.

**O CEO precisa fornecer o caminho.** Se ele a conhece de outro lugar — indicação,
agenda, um perfil que ele reconheça — o contato vem dele. **A máquina não vai
deduzir**, e é regra da casa: contato inventado desliga o alarme sem dar para
onde ligar, o que é pior que o silêncio de hoje.

⚠️ **Sem contato do CEO, esta proposta não sai. Fica pronta e parada.**

---

## 7. O que falta antes de enviar

- [ ] 🔴 **CEO fornece o contato.** Sem isso, nada acontece.
- [ ] 🔴 **CEO decide qual das duas fichas de cliente é a boa** — `cmqyb0bpo…` ou
      `cmrt7aecz…`. Existem duas "Camila Pereira" no sistema e **ninguém fundiu**,
      porque afirmar que duas fichas são o mesmo negócio é decisão de negócio, e
      a ficha escolhida define para onde vai o histórico
      (`docs/pendencias.md`, item 4 de 08/08).
- [ ] **Abrir `/agency/leads` no admin** e ler o dossiê dela direto do banco — o
      texto do briefing pode estar lá, e esta proposta melhora muito com ele.
- [ ] **Reler `docs/precos.md`** e reconferir os preços de vídeo (outro agente
      estava alterando a tabela em 08/08).
- [ ] **Não afirmar o que a clínica faz.** "Beauty Clinic" não diz o serviço.
- [ ] Total mensal fica como **"a definir"** até ela responder volume e tipo de
      vídeo.
