# O que a Dioli vende — a fonte única para quem vende

> **Decidido pelo CEO em 29/08/2026, em conversa direta.** Este documento é a
> FONTE. Quem vende — o robô do SDR, o agente `esteira`, a negociação, a
> proposta, o portal — **aponta para cá, não copia**. Regra copiada diverge:
> aprende-se algo, atualiza-se um lugar e esquecem-se os outros.
>
> Só o CEO altera este documento.

---

## 1. Tudo se vende avulso. Não existe "só plano".

**Palavras do CEO:** *"Se chegar um cliente que quer dois posts, a gente vende
dois posts. Se o cliente quiser um post por semana por quatro semanas, também a
gente entrega. Se o cliente quiser uma capa de Facebook, a gente entrega. Se
quiser um vídeo, a gente entrega."*

- **O avulso não é consolo de quem não pode pagar plano.** É produto de linha, e
  é uma das frentes de receita da casa.
- **Não prender o cliente a um formato.** Chegou pedindo qualquer coisa que a
  casa saiba produzir, vende-se aquilo.
- 🔴 **Buraco medido em 29/08:** o prompt do SDR
  (`lib/agency/comercial/prompt-do-sdr.ts`) menciona "balcao" **uma única vez**,
  e como faixa de orçamento — nunca como produto. Ele foi construído para
  qualificar **plano**. Quem chega pedindo dois posts cai numa conversa
  desenhada para vender mensalidade. **Isto precisa mudar.**

## 2. Os DOIS caminhos valem. Nenhum é o certo.

**Palavras do CEO:** *"Em ambos os caminhos está certo. Ambos os caminhos nós
atendemos."*

| Caminho | O que acontece | Estado hoje |
|---|---|---|
| **Avulso → plano** | comprou avulso, entra no mailing, recebe oferta de plano | ✅ existe (`lib/agency/esteira/recompra.ts`), roda por relógio |
| **Plano → avulso** | é assinante, recebe oferta de pacote adicional todo mês | 🔴 **NÃO EXISTE.** Procurado em 29/08: nada oferece avulso a quem já tem plano |

**O plano é FIDELIZAÇÃO**, não o único produto: *"os planos vão fazer com que a
gente fidelize esse cliente, esse cliente fica com a gente por muito tempo."*

## 3. Vídeo é EDIÇÃO. Nunca gravação.

**Palavras do CEO:** *"Produzir, editar um vídeo é pegar um material bruto mais
um briefing e editar. Isso é o que a gente vai fazer. Gravar o vídeo, que é o
videomaker, a gente não faz porque nossa agência é online."*

- **A Dioli faz:** material bruto **do cliente** + briefing → corte, legenda,
  trilha, peça pronta.
- **A Dioli NÃO faz:** gravar, filmar, ir a campo. **Nunca.** A agência é online.
- 🔴 **Buraco medido em 29/08:** o prompt do SDR pergunta ao cliente
  *"tem videomaker? tem bruto? **ou a Dioli produz?**"* (linha 60) e
  *"quem grava/edita o vídeo (cliente ou Dioli)"* (linha 158). **Ele está
  oferecendo gravação** — promessa que a casa não pode cumprir, e que contraria
  esta regra. **Isto precisa mudar.**
- ⚠️ **Hoje a casa não produz vídeo de forma nenhuma** — nem edição. A promessa
  foi retirada de todos os planos pelo próprio CEO em 25/08
  (`lib/agency/planos.ts`, `naoInclui`). **Vídeo entra no cardápio quando houver
  produtor, e nasce em SOMBRA.** Até lá, quem vende não promete vídeo.

## 4. Videomaker é carteira de indicação, não execução.

**Palavras do CEO:** *"Se tivermos um cliente muito grande e importante em
alguma cidade do Brasil e ele quiser um videomaker, a gente vai ter um pool de
indicações de videomakers em cada região, estado do Brasil, e aí a gente indica
essas pessoas, e vai construindo essa carteira de parceiros."*

- A casa **indica** o profissional; não executa e não se responsabiliza pela
  gravação.
- É **cadastro por região/estado**, construído ao longo do tempo.
- Não depende de engenharia para começar.

## 5. Vídeo é vendido POR FORA do plano, em pacote fechado.

**Palavras do CEO:** *"Vídeo é uma coisa que tem que ser fechada por fora. Então
tem que ser pacotes. Um vídeo custa tanto, três vídeos custa tanto, tantos
vídeos custam tanto. A negociação tem que ser diferenciada dos pacotes mensais,
porque é uma coisa muito relativa, subjetiva, não é tão prática como um post,
que um post é um post."*

- **Nunca dentro da mensalidade.** Pacote fechado por quantidade.
- **Negociação própria**, separada da régua dos planos.

## 6. Os marketplaces são canal de venda.

**Palavras do CEO:** *"A gente vai atacar todos os marketplaces, aquele site
99Freelas, que são mini projetos."*

- Já existe mapeamento em `docs/plataformas/` para **99Freelas, Workana,
  Fiverr, Freelancer e Upwork**.
- 🔴 **Buraco medido em 29/08:** os quatro itens avulsos da tabela têm
  `descontoAutorizadoPct: null` — **desconto autorizado é ZERO**. Em marketplace
  a disputa é por preço, e a casa não pode baixar um centavo. **O CEO precisa
  definir a margem de manobra, ou a casa perde toda disputa.**

## 7. O cardápio de hoje tem quatro pratos. Só.

Fonte: `lib/agency/financeiro/tabela-de-precos.ts`.

| Prato | Preço | Quem produz |
|---|---|---|
| Post (balcão) | R$ 79 | máquina |
| Carrossel (balcão) | R$ 129 | máquina |
| Post avulso | R$ 190 | máquina com direção |
| Carrossel avulso | R$ 290 | máquina com direção |

**A gramática está certa e serve para tudo:** *o que é* × *quem produz* (máquina
sozinha, ou máquina com direção). É por isso que o mesmo post custa R$ 79 ou
R$ 190. **Falta prato, não estrutura.**

Não estão no cardápio, e o CEO os nomeou como vendáveis: **capa de Facebook,
vídeo, pacote de N posts, stories**, e combinações.

⚠️ **Armadilha conhecida:** a tabela nasceu para mensalidade — o campo se chama
`pecasPorMes`. Foi essa incompatibilidade que fez o sistema anunciar um item de
compra única como *"R$ 190/mês"* (achado e consertado em 29/08). **Enquanto o
cardápio de avulsos morar numa tabela de mensalidade, esse erro volta.**

---

## Quem precisa apontar para cá

- `lib/agency/comercial/prompt-do-sdr.ts` — **os dois buracos acima estão nele.**
- `lib/agency/comercial/negociacao-da-proposta.ts` — a régua do que se oferece.
- `lib/agency/financeiro/tabela-de-precos.ts` — o cardápio.
- `.claude/agents/esteira.md` — o especialista do caminho comercial.

## Aberto, esperando o CEO

1. **Os pratos do cardápio** — nome e o que entrega, um a um.
2. **O preço de cada um**, ou a régua (quanto vale peça de máquina, quanto vale
   com direção) para a casa montar e ele aprovar.
3. **A margem de desconto em marketplace** — um percentual.

---

> Escrito à mão pelo Diretor em 29/08/2026, com **exceção `SEM_AGENTE`
> declarada**: a ferramenta de despacho estava desabilitada nesta sessão
> (`Error: No such tool available: Agent`). Nenhum código foi alterado — este
> documento **registra e aponta**, não conserta. Os dois buracos do prompt do
> SDR estão nomeados e **não foram tocados**: mexer no que se promete ao cliente
> espera a palavra do CEO.
