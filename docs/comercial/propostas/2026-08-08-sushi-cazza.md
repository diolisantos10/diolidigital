# Proposta — Restaurante Sushi Cazza

> **Rascunho para o CEO revisar e enviar. NADA foi enviado.**
> Escrito em 08/08/2026. Nenhuma mensagem, e-mail ou DM saiu desta sessão.

| | |
|---|---|
| **Lead** | Restaurante Sushi Cazza |
| **Entrou pelo briefing público** | 18/06/2026 |
| **Parado há** | **51 dias** |
| **Canal de contato registrado** | **NENHUM** — ver "Como falar com ele" |
| **Estado no sistema** | `ClientRequestDb`, status `new` |

---

## 1. A abertura — para copiar e colar

**Versão para DM do Instagram** (é o único caminho que existe hoje):

> Oi! Aqui é o Dioli, da Dioli Digital.
>
> Você preencheu o briefing no nosso site em 18 de junho e nunca teve resposta.
> A falha foi nossa: o formulário não pedia telefone nem e-mail, e a sua
> mensagem ficou parada sem que ninguém tivesse como te retornar. Já foi
> corrigido, mas isso não conserta os seus 51 dias de espera.
>
> Reli o que você escreveu. Você pediu planejamento de conteúdo, direção visual
> e estratégia, falou em uns 12 posts por mês, e descreveu a paleta — preto,
> vermelho e dourado. Montei uma proposta em cima disso.
>
> Se ainda fizer sentido, te mando. E se você já resolveu com outra pessoa,
> também quero saber — sem problema nenhum.

**Versão para e-mail ou WhatsApp**, caso o CEO consiga o contato antes de
escrever: mesma abertura, trocando a primeira linha por
*"Oi, [nome]. Aqui é o Dioli, da Dioli Digital."*

> **Por que a abertura é curta:** ele esperou 51 dias. Parágrafo de desculpa
> longo transfere para ele o trabalho de administrar o nosso constrangimento.
> Uma frase reconhecendo, uma dizendo o que mudou, e segue para o que interessa.

---

## 2. O que a Dioli entendeu do negócio dele

Tudo abaixo é o que **ele escreveu**, não interpretação nossa. É o que prova que
alguém leu.

- **É restaurante** — segmento gastronomia.
- **Pediu, com estas palavras:** planejamento de conteúdo, direção visual e
  estratégia.
- **Objetivo declarado:** aumentar presença digital.
- **Ticket médio: R$ 180.**
- **Público: de 25 a 45 anos, mora na zona sul.**
- **Paleta da casa: preto, vermelho e dourado.**
- **Perfil citado no texto: `@sushicazzaoficial`.**
- **Volume e verba que ele mesmo sugeriu:** *"Queria uns 12 posts por mês, algo
  em torno de 1500 por mês."*

**Fonte:** `rawContext` / transcrição do briefing, reproduzida em
`__tests__/comercial/dossie-do-lead.test.ts:19-31` e
`__tests__/comercial/contato-do-lead.test.ts:30-37`. O registro vivo está em
`ClientRequestDb`, no banco de produção — **que esta sessão não alcança**.

### ⚠️ O que NÃO entra na proposta, e por quê

`docs/ENTREGA-DE-BASTAO.md:247` descreve o briefing dele como *"rodízio R$ 99,
paleta, público"*. **O rodízio de R$ 99 não está no briefing.** Ele aparece
apenas em scripts de ensaio interno — `scripts/prod-pilot-full.ts:160`,
`scripts/p0-clean-slate-rehearsal.ts:70` e `scripts/pilot-sushi-cazza.ts:98` —
que foram escritos pela casa para testar a esteira, não pelo cliente. O mesmo
vale para "crianças 6–10 R$ 49,90", horários e "branco" na paleta (o briefing diz
**dourado**, o script diz **branco**).

Escrever "sabemos que o seu rodízio é R$ 99" numa proposta seria afirmar sobre o
negócio dele algo que ele nunca nos disse — e num restaurante o preço do rodízio
muda. **Se estiver errado, queima a proposta inteira na primeira linha.**

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

Ele pediu **12 posts/mês**. A tabela tem degraus de 8, 10, 14 e 18 peças. Duas
combinações chegam ao que ele pediu:

### Opção A — **Presença + 2 peças excedentes** (dá exatamente 12 peças)

Do plano **Presença**:
- Pauta do mês: quantos posts, de que tipo, sobre o quê e em que ordem
- 10 peças por mês, com arte pronta e legenda
- **Nós publicamos** no Instagram e no Facebook
- Ficha do Google mantida + 4 posts no Google por mês
- Gestão de avaliações (elogio respondido; reclamação vira rascunho e chama gente)
- Atendimento humano por WhatsApp em horário comercial
- Painel de resultados e relatório mensal só com número medido
- 2 rodadas de ajuste por peça
- **+ 2 peças excedentes por mês**, para fechar as 12 que ele pediu

**Não inclui:** vídeo em qualquer forma · stories · tráfego pago e verba de mídia
· site e material impresso.

### Opção B — **Conteúdo** (14 peças, mais do que ele pediu)

Tudo do Presença, com 14 peças, mais 4 sequências de stories, 4 roteiros de
reels, plano de medição, pesquisa de concorrência por ciclo, reunião mensal e 3
rodadas de ajuste.

**Não inclui:** gravação e edição de vídeo (o roteiro está incluído; o vídeo
pronto é à parte) · tráfego pago e verba de mídia · site e impresso.

### Sobre "direção visual" — precisa confirmar antes de precificar

Ele já tem paleta definida (preto, vermelho e dourado), o que sugere que
"direção visual" significa **a arte dos posts seguir essa paleta** — e isso já
está dentro de qualquer um dos dois planos.

Se ele quis dizer **identidade visual nova** (logo, aplicações, manual), é outro
produto: projeto com começo e fim, fora de todo plano, **R$ 2.900, parcelável em
3x** (`docs/precos.md`, "Preço por serviço").

**Não decida isso por inferência.** É uma pergunta de uma linha na conversa.

---

## 4. O preço

Todos os valores saem da tabela citada acima. Nenhum foi estimado.

| | Opção A — Presença + 2 | Opção B — Conteúdo |
|---|---|---|
| Mensalidade | R$ 790 | R$ 1.390 |
| Peças excedentes | 2 × R$ 180 = R$ 360 | — |
| **Total mensal** | **R$ 1.150** | **R$ 1.390** |
| Implantação (uma vez) | R$ 1.290 | R$ 1.900 |
| Peças/mês | 12 | 14 |
| Permanência mínima | 3 meses | 6 meses |

**As duas cabem no "algo em torno de 1500 por mês" que ele escreveu.**

**Opcional, se "direção visual" for identidade nova:** Identidade visual
**R$ 2.900**, projeto à parte, em 3x.

> **Interno — NÃO vai na proposta.** Pisos de negociação (`docs/precos.md`):
> Presença R$ 690, Conteúdo R$ 1.190. A ordem das moedas de troca vale: primeiro
> o que não custa margem (prazo, pagamento à vista, menos rodadas, contrato mais
> longo, autorização de case); só depois o preço se mexe. No piso, corta-se
> escopo, nunca margem.

---

## 5. O próximo passo

**Um só:** uma conversa de 20 minutos, por telefone ou vídeo, para fechar duas
coisas — se "direção visual" é a arte dos posts ou identidade nova, e qual dos
dois planos ele quer começar.

Frase para o fim da mensagem:

> Consegue 20 minutos esta semana? Eu te mostro a pauta do primeiro mês e a gente
> decide o formato. Se preferir, me passa um WhatsApp que eu te ligo.

---

## 6. Como falar com ele

🟡 **Existe um caminho, e ele é frágil.**

- **Não há telefone nem e-mail registrados.** O briefing público, à época, não
  pedia contato. `lerContato` devolve `temComoFalar: false`.
- **O que existe é `@sushicazzaoficial`**, escrito por ele no meio da conversa.

⚠️ **Isso é PISTA, não contato confirmado** — é assim que o sistema classifica
(`lib/agency/comercial/contato-do-lead.ts`, campo `pistasDeContato`, rotulado
*"não é contato confirmado"*). Ninguém verificou que esse perfil é do
restaurante dele, nem que ele lê a DM.

**Antes de enviar, o CEO confere:** o perfil existe, é o restaurante certo, e a
DM está aberta. Se a DM estiver fechada, o caminho alternativo é o telefone
público do restaurante ou o site — **nenhum dos dois está registrado aqui**, e
buscar isso é trabalho do CEO, não da máquina.

---

## 7. O que falta antes de enviar

- [ ] **Reler `docs/precos.md`** e reconferir os quatro números da tabela acima
      (outro agente estava alterando a tabela em 08/08).
- [ ] **CEO decide:** Opção A (R$ 1.150, 12 peças) ou Opção B (R$ 1.390, 14
      peças) — ou manda as duas e deixa ele escolher.
- [ ] **CEO confirma** que `@sushicazzaoficial` é o perfil certo e está acessível.
- [ ] **Não afirmar nada sobre rodízio, preço de prato ou horário** — não está no
      briefing (ver §2).
- [ ] "Direção visual" fica como **pergunta**, não como item precificado, até ele
      responder.
