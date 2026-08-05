# Oficina — interface

> Registro de trabalho do especialista de interface. O que foi mexido, por quê,
> e o que ficou aberto. Quem promove para a vitrine é o Diretor.

---

## 2026-08-05 · madrugada de melhoria — os três blocos do raio-x

Território: `app/agency/**` (exceto `planner/`), `app/briefing/**`,
`app/vitrine/**`, `components/**` (exceto `components/agency/planner/`),
`app/globals.css`, `DESIGN.md`, mais os pontos de `app/portal/access/[token]`
nomeados no pedido. Três outras frentes trabalhavam em `app/api/**` e `lib/**`
ao mesmo tempo.

---

### BLOCO 1 — o que quebrava na mão de quem usa

#### 1. As quatro listas do painel eram cortadas, não roláveis

Tabela de 5 a 9 colunas dentro de um pai com `overflow-hidden`, e o `<main>` do
shell com `overflow-x-hidden`: as últimas colunas **sumiam e não havia gesto
que chegasse nelas**. Em Tarefas eram Prioridade, Status, Prazo, Origem e
**todas as ações**.

**A decisão foi cartão, não rolagem lateral** — e a justificativa é a segunda
metade do problema. `overflow-x-auto` conserta o *corte*; não conserta a
*tela*. Rolar 880px de tabela numa janela de 375px é navegação às cegas: o
cabeçalho sai de vista junto com o dado, então a coluna que você finalmente
alcançou não tem mais rótulo. É por isso que Linear e Attio viram lista no
celular, e é o que a Caixa de Entrada desta casa já fazia.

Padrão aplicado nas quatro (`tasks`, `projects`, `deliverables`, `clients`):
abaixo de `md`, `<ul>` de cartões — título 14px, contexto 12px, selos de estado
em linha, ações como botões reais de 32px; de `md` para cima, a tabela dentro de
`overflow-x-auto` com `min-w-[…]` explícito. Virou §6.3 do `DESIGN.md`.

Também consertado no caminho: a faixa de abas de Tarefas vazava a tela a 375px
(`overflow-x-auto scrollbar-none` + sangria casada com o padding do shell).

#### 2. Briefing público — a barra de conversão cobria o fim do conteúdo

O defeito da §6.1, na tela onde ele custa mais caro: exatamente no
"Sim, quero meu orçamento". A regra nasceu no portal, foi levada ao painel — e
o briefing ficou de fora por quatro dias.

Aplicado o trio que já existia (`.acao-shell` / `.acao-reserva` / `.acao-barra`)
com `useReservaDeBarra`, que **mede** a altura em vez de digitá-la.

**Prova, medida a 375px rolando até o fim com `behavior: "instant"`:**

| | altura da barra | reserva aplicada | linhas de conteúdo cruzadas |
|---|---|---|---|
| antes | 72px | *nenhuma* | **1 coberta por inteiro** |
| depois | 72px (medida) | **96px** | **0** |

E a §6.1 ganhou o que faltava: uma **tabela de varredura das superfícies, com
data**. Regra sem varredura das outras superfícies é regra pela metade — e
agora linha sem data é linha não conferida.

#### 3. Pipeline sangrava e era cortado

`-mx-8 px-8` contra um shell que é `px-4` no celular: 16px de vazamento e a
primeira coluna cortada. Virou `-mx-4 px-4 md:-mx-8 md:px-8`.

Achado no caminho, visível ao usuário: projeto sem prazo mostrava literalmente
**"NaNd"** no cartão. Agora mostra "Sem prazo".

#### 4. Ações que não existiam no toque

`opacity-0 group-hover:opacity-100` não é discrição no celular — é
funcionalidade ausente, porque `:hover` nunca dispara. Os botões de mover etapa
do Pipeline eram inalcançáveis por aparelho.

Nasceu `.acao-revelada` (`globals.css`): visível por padrão, escondida **apenas**
dentro de `@media (hover: hover) and (pointer: fine)`, revelada também por
`:focus-within`. O breakpoint não serve para isso — tablet de 768px é toque com
largura de desktop. Virou §6.4.

#### 5. Contraste — medido antes e depois, na página renderizada

Não foi estimativa: uma auditoria roda no DOM, lê a cor computada e o fundo
efetivo de cada elemento com texto próprio e calcula a razão WCAG.

**Tokens** (sobre `--bg` · `--card` · `--accent`, os três agora ≥ 4.5:1):

| Token | antes | depois |
|---|---|---|
| `--text-secondary` | 6.02:1 | **7.11:1** (`#4B5563`) |
| `--text-muted` | **2.85:1** (`#8B95A3`, 1.104 usos) | **5.32:1** (`#5E6875`) |
| `--text-subtle` | **1.73:1** (`#B8C0CA`, 113 usos) | **4.55:1** (`#6B7280`) |
| `--success` (sobre o tint) | 3.00:1 | **4.57:1** (`#15803D`) |
| `--warning` (tint) | 2.86:1 | **4.66:1** (`#A45A05`) |
| `--danger` (tint) | 4.41:1 | **5.91:1** (`#B91C1C`) |
| link do portal | 2.40:1 (`#12B5AC`) | **4.62:1** (`--teal-text` `#0F7E79`) |
| rótulos da sidebar | 1.91:1 (branco 22%) | **6.23:1** (branco 55%) |

**Reprovações AA por tela, medidas a 375px dentro do `<main>`:**

| Tela | antes | depois |
|---|---|---|
| `/agency/tasks` | 62 | **3** |
| `/agency/projects` | 6 | **0** |
| `/agency/clients` | 13 | **0** |
| `/agency/pipeline` | 23 | **0** |
| `/agency/dashboard` | 84 | **14** |
| `/agency/deliverables` | — | **0** |

As 17 que sobraram **não estão no meu território**: são hex "na mão" dentro de
`lib/` (ver I-20 no `DESIGN.md`). O token já está certo; falta a troca.

Um par de tokens novos: `--teal` (superfície) e `--teal-text` (texto/link). E
uma decisão que **não** tomei: o botão de fundo `--teal` com texto branco dá
2.55:1 — mudar preenchimento é identidade visual, e identidade é do CEO.

#### 6. O `DESIGN.md` discordava do `globals.css` em 7 de 12 tokens

`--bg`, `--bg-elevated`, os quatro de texto e `--border`. Quem lesse a "fonte
única de verdade visual" e digitasse o hex escrevia a cor errada. §2 conferida
linha a linha contra o CSS e corrigida, com aviso do que aconteceu.

---

### BLOCO 2 — confiança

#### 7. Cinco telas entregavam conteúdo de reserva como se fosse a IA

`pm-agent`, `ads-agent`, `design-agent`, `social-media-agent` e
`brand-hub-agent` caíam no gerador por regras com um `console.warn` — que
ninguém lê — e entregavam o texto com a mesma cara do resultado real. É o pior
defeito de confiança do produto: o CEO abre a tela na frente do cliente e
apresenta como raciocínio da IA uma tabela de regras.

Molde extraído do `operations-agent` (a única que já fazia certo) para
`components/agency/ui/AvisoModoAlternativo.tsx`, e as seis passaram a usá-lo —
com o motivo técnico como **detalhe**, nunca como manchete.

#### 8. Erro cru e em inglês na cara do usuário

Nasceu `components/agency/ui/mensagemDeErro.ts`: traduz falha técnica em frase
em português que diz **o que houve e o que fazer**, e separa o texto cru em
`detalhe`. Aplicado em `brain`, `settings`, `design-agent`
("Generation failed." → "Não conseguimos gerar a imagem…"), `whatsapp` e — o
mais grave — no portal, onde `Falha HTTP 500` chegava ao **cliente pagante**.

#### 9. Erro sem "tentar de novo"

O portão de erro do portal e o bloco "Não consegui carregar agora" pediam para o
cliente recarregar a página. Agora têm botão — e o de projetos tem também
"Falar com seu PM". Link expirado/revogado continua sem botão de repetir, de
propósito: ali não há o que tentar.

---

### BLOCO 3 — as duas rotas órfãs

`/agency/whatsapp` (caixa completa e funcional) e o Radar (serviço + cron + três
rotas de API) **não tinham um único link na interface**. Ambos entram no menu.

- **WhatsApp** estava em estado de uso, mas engolia falha de carga em silêncio —
  "sem conversas" e "API fora do ar" tinham a mesma cara. Ganhou os três estados
  e passou a usar o `AgencyHeader` da casa.
- **Radar** não tinha tela nenhuma: o robô varria o mercado, gravava tendências
  como `pending` à espera de um humano, e nenhum humano tinha por onde chegar
  nelas. É o quarto estado da §7.4 — trabalho feito que o destinatário não vê.
  Nasceu `/agency/radar`: fila de validação com "Colocar em vigor" / "Recusar",
  "Buscar agora", e os três estados obrigatórios.

---

### O que ficou aberto

1. **17 reprovações AA em `lib/`** — I-20 do `DESIGN.md`, com arquivo e linha.
2. **Fontes de 9px e 9.5px** fora da escala da §3 — I-21.
3. **Botão de fundo `--teal` com texto branco a 2.55:1** — precisa da decisão do
   CEO, porque mexe em identidade.
4. **Control Room e Orchestrator** continuam órfãos na navegação.
5. A suíte tinha **43 falhas** ao fim da madrugada, **todas** em
   `__tests__/{brain,esteira,media,radar}` e **todas** exercitando `lib/**` —
   trabalho em voo de outras frentes. Nenhum dos meus arquivos é importado por
   elas. Typecheck limpo.
