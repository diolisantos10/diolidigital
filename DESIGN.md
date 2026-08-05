# 🎨 DESIGN.md — Manual de Design do Dioli Agency OS

> **Fonte única de verdade visual do projeto.** Todo trabalho de interface (tela nova
> ou alteração) **deve** seguir este documento. Se algo aqui estiver desatualizado,
> atualize este arquivo **junto** com a mudança de código.

Sistema de design: **HUMANTECH** — "Estratégia humana. Execução inteligente."
Sensação-alvo: sóbrio, tecnológico, premium, com um toque de calor (off-white quente,
não branco frio) e uma assinatura visual em **cyan**.

---

## 1. Fundamentos da marca

> **Bíblia da identidade:** o [`Brand Book Dioli Digital v1`](docs/brand/Dioli_Digital_Brand_Book_v1.pdf)
> é a fonte oficial da marca. Este `DESIGN.md` traduz o brand book para o código. Em caso
> de conflito, **o brand book vence** — e este arquivo deve ser atualizado junto.

Marca pública: **Dioli Digital** — *estúdio digital com IA*.
Rota visual: **HUMANTECH** — "Estratégia humana. Execução inteligente."

### Paleta oficial (brand book)

| Papel | Cor | Hex | Uso |
|---|---|---|---|
| **Navy** | ⬛ | `#070A1F` | Ação primária, sidebar, títulos fortes, fundos escuros |
| **Cyan** (mint) | 🟦 | `#9AF5F0` | Assinatura visual — item ativo, destaques, foco (parcimônia) |
| **Graphite** | ⬛ | `#1F2937` | Texto primário |
| **Off-white** | ⬜ | `#F7F8FA` | Fundo principal (nunca branco puro no fundo) |
| **White** | ⬜ | `#FFFFFF` | Cartões |

### Família de azuis (amostrada do brand book — além dos swatches)

| Token | Hex | Uso |
|---|---|---|
| `--cyan-bright` | `#2AE3F5` | Esfera / gradiente do eclipse |
| `--azure` | `#1FB7E7` | Acento em **títulos display** (só texto grande — baixo contraste) |
| `--electric` | `#0057FF` | Azul elétrico — ponto de órbita, acento raríssimo |

**Regra de ouro do cyan:** é *tempero*, não *prato principal*. Botão primário é **navy**,
não cyan. Brand book manda **evitar cyan em excesso** e **evitar fundo sempre escuro**
(misturar claro e escuro com equilíbrio).

### Símbolo e assinatura visual
- **Logo** (`components/brand/DioliLogo.tsx`): dois círculos (eclipse) — anel grande +
  disco menor + micro-satélite. **Monocromático** (navy no claro, branco no escuro). O
  cyan **não** entra no logo.
- **Órbita/eclipse** (`components/brand/OrbitMotif.tsx`): elipses tracejadas + esfera cyan
  luminosa. Assinatura decorativa das telas de marca.

### Tipografia oficial
- **Sora** — títulos e destaques · **Inter** — textos e parágrafos.

### Tom de voz
Claro, acolhedor, estratégico, inteligente, prático, dedicado. *"A Dioli deve parecer
sofisticada porque é clara, não porque é difícil de entender."* Evitar jargão técnico.

---

## 2. Tokens de design

Todos os tokens vivem em [`app/globals.css`](app/globals.css) como CSS variables no `:root`.
**Sempre** use o token — nunca digite o hex "na mão" no componente.

### 2.1 Superfícies
| Token | Valor | Uso |
|---|---|---|
| `--bg` | `#F5F5F3` | Fundo da página |
| `--bg-elevated` | `#FAFAF8` | Cards/painéis levemente elevados |
| `--card` | `#FFFFFF` | Cartões |
| `--sidebar` | `#070A1F` | Fundo da sidebar (navy) |

### 2.2 Texto
| Token | Valor | Uso |
|---|---|---|
| `--text-primary` | `#1A1A1A` | Texto principal |
| `--text-secondary` | `#6B6B65` | Texto de apoio |
| `--text-muted` | `#9B9B95` | Texto secundário/legendas |
| `--text-subtle` | `#C0C0BC` | Placeholders, texto muito discreto |

### 2.3 Bordas
| Token | Valor | Uso |
|---|---|---|
| `--border` | `#E5E5E2` | Borda padrão |
| `--border-strong` | `#C8C8C4` | Borda em hover/ênfase |

### 2.4 Cores semânticas (estados)
| Token | Texto | Fundo | Significado |
|---|---|---|---|
| `--success` / `--success-bg` | `#16A34A` | `#DCFCE7` | Sucesso, aprovado, concluído |
| `--warning` / `--warning-bg` | `#D97706` | `#FEF3C7` | Atenção, em revisão, pendente |
| `--danger` / `--danger-bg` | `#DC2626` | `#FEF2F2` | Erro, bloqueado, destrutivo |
| `--info` / `--info-bg` | `#2563EB` | `#EFF6FF` | Informação, em andamento |
| `--accent-light` | — | `#E6FBFA` | Tint de cyan para destaques suaves |

> ⚠️ **Cor nunca é o único sinal de estado.** Todo status por cor deve ter também
> um texto ou ícone (acessibilidade para daltônicos). Veja §7.

### 2.5 Sombras (elevação)
`--shadow-xs` · `--shadow-sm` · `--shadow-md` · `--shadow-lg` · `--shadow-xl`
(de sutil a proeminente). Cartões usam `--shadow-sm`; modais usam algo próximo de `--shadow-xl`.

### 2.6 Raio de borda
Escala: **6px → 7px → 8px** (botões sm/md/lg), **12px** (cartões), **14px** (modais).
Token base do shadcn: `--radius: 0.5rem` (8px). Utilitários: `rounded-md`, `rounded-lg`, etc.

### 2.7 Movimento
| Token | Valor |
|---|---|
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` |
| `--duration` | `140ms` |

Transições curtas e discretas. Respeite `prefers-reduced-motion`.

---

## 3. Tipografia

| Papel | Fonte | Uso |
|---|---|---|
| **Display** | **Sora** (`--font-display`) | `h1`–`h4`, `.font-display`. Pesos 500–800. `letter-spacing: -0.02em`. |
| **Corpo** | **Inter** (`--font-sans`) | Todo texto de interface. Pesos 400–700. |
| **Mono** | SF Mono / Fira Code (`--font-mono`) | Números tabulares, código, dados (`.mono-num`). |

**Tamanho base:** `14px` no `body`, `line-height: 1.5`.

### Escala de tipografia recomendada (padronizar — ver inconsistência I-5)
Use apenas estes degraus, via utilitários do Tailwind quando possível:

| Nome | px | Uso |
|---|---|---|
| `xs` | 12px | Legendas, metadados |
| `sm` | 13px | Texto de apoio, tabelas densas |
| `base` | 14px | Corpo padrão |
| `md` | 16px | Ênfase, inputs (evita zoom no iOS) |
| `lg` | 18px | Subtítulos |
| `xl` | 22px | Títulos de seção |
| `2xl` | 26px+ | Títulos de página / hero |

> ❌ **Não** invente tamanhos fracionários (`text-[11.5px]`, `text-[9.5px]`). Fique na escala.
> ✅ **Mínimo de 12px** para qualquer texto legível (evite 9–11px como texto corrido).

---

## 4. Componentes

O projeto tem **duas camadas** de componentes. A direção daqui pra frente é usar o
**shadcn/ui como base** e alinhar/migrar os componentes antigos.

### 4.1 shadcn/ui (base oficial — `components/ui/`)
- Instalado com **Base UI** (primitivas acessíveis: foco, teclado, ESC prontos).
- Os tokens semânticos do shadcn (`--primary`, `--secondary`, `--muted`, `--destructive`,
  `--ring`, `--sidebar-*`…) já estão **mapeados para a marca** no `globals.css`.
  Ex.: `--primary` = navy, `--ring` = navy, item ativo da sidebar = cyan.
- Adicionar um componente novo: `npx shadcn@latest add <nome>` (ex.: `dialog`, `input`,
  `select`, `dropdown-menu`, `tooltip`). Ele já sai no estilo da marca.
- **Prefira o shadcn** para primitivas com acessibilidade difícil de fazer à mão:
  diálogos, menus, tooltips, popovers, comboboxes.

### 4.2 Componentes próprios (`components/agency/ui/`) — legado a alinhar
| Componente | Situação |
|---|---|
| `Button` | Variantes `primary/secondary/ghost/danger/cyan`, tamanhos `sm/md/lg`. **Migrar** para o `Button` do shadcn ou realinhar tokens. |
| `Badge` | Mapa de status (pipeline, tarefas, entregáveis). Bom, mas usa hex direto — deve usar tokens. |
| `Modal` | Simples; **sem foco preso/ESC**. Preferir o `Dialog` do shadcn. |
| `EmptyState` | Ótimo — **usar sempre** para lista vazia (hoje é subutilizado). |

### 4.3 Regras de componente
- **Nunca** recrie um `<button>`/`<input>`/modal "na mão" se já existe um componente. Reuse.
- Todo botão só de ícone precisa de `aria-label`.
- **Contador de excedente é um caminho, nunca um rótulo.** "+2 mais", "e outros 5",
  "…" — se existe conteúdo além do que a caixa mostra, o contador é `<button>` e
  abre a lista completa. No Planner, `+N mais` era uma `<div>` inerte: da quarta
  peça do dia em diante o trabalho ficava sem nenhum caminho pela tela.
- Todo `<input>/<textarea>/<select>` precisa de `<label>` associado (`htmlFor`/`id`) ou `aria-label`.
- Elemento clicável precisa ser `<button>`/`<a>` (não `<div onClick>`); se for `<div>`,
  precisa de `role`, `tabIndex={0}` e handler de teclado (Enter/Espaço).

---

## 5. Referências visuais (norte estético)

Aprovadas pelo dono do projeto. Cada uma serve de referência para uma parte do produto.

| Referência | O que copiar | Onde aplicar |
|---|---|---|
| **Linear** | Densidade elegante, velocidade, foco em teclado, tipografia impecável, hierarquia clara em telas cheias de dados. | Painel interno da agência (dashboard, pipeline, tarefas, agentes) |
| **Attio** | CRM moderno: muitos dados organizados e sofisticados, com toques quentes e humanos. | Clientes, CRM, brain, listas densas |
| **Stripe** | Clareza, confiança, conversão, textos que vendem, hierarquia generosa. | Vitrine, portal do cliente, briefing público, onboarding |
| **Vercel** | Minimalismo técnico, muito espaço em branco, geometria precisa, sobriedade. | Telas de configuração, integrações, estados vazios/técnicos |

**Como usar:** ao desenhar qualquer tela, pergunte "como o Linear/Stripe faria isso?"
e busque o mesmo nível de acabamento — espaçamento generoso, hierarquia óbvia,
nada de ruído visual.

---

## 6. Layout e espaçamento

- **Grid de 4px:** espaçamentos em múltiplos de 4 (`gap-2`=8px, `gap-4`=16px, `p-6`=24px…).
- **Largura de leitura:** texto corrido não passa de ~65 caracteres por linha.
- **Espaçe com `flex`/`grid` + `gap`**, não com margens soltas.
- Conteúdo largo (tabelas, código) rola dentro do próprio container (`overflow-x-auto`) —
  a página nunca rola horizontalmente.

### 6.0 Célula estreita não recebe cartão com texto — recebe resumo tocável

Grade de 7 colunas (calendário) dentro do painel: a 768px sobram ~77px por
coluna. Um chip com miniatura + rótulo ali não trunca a legenda, ele **apaga** a
legenda — o resultado é uma tela cheia de retângulos coloridos sem informação
nenhuma, que é exatamente a sensação de "produto pobre".

A saída não é encolher a fonte (a escala da §3 tem piso de 12px): é **trocar a
densidade pela navegação**. Abaixo de `lg`, cada dia vira um resumo tocável
(miniaturas empilhadas + um ponto por estado + contagem) e o conteúdo completo
mora a um toque, num painel do dia. Chip com texto só onde a célula comporta —
`lg` para cima. No celular, a vista padrão é a **lista**, não a grade.

### 6.1 Elemento fixo obriga espaço reservado — e quem reserva é o layout

Todo elemento `fixed` sobre uma área rolável (botão flutuante, barra de ação
colada embaixo, toast persistente) **não empurra nada**: ele cobre o fim do
conteúdo. A regra:

1. **O layout reserva o espaço, não o componente.** Quem sabe que o elemento
   fixo existe é o container da tela. Padding remendado componente a componente
   sempre esquece um — foi assim que o botão "Fale com seu PM" cobriu o eixo de
   datas do gráfico de alcance, a legenda da peça e o rodapé do portal (375px).
2. **A conta é altura + deslocamento + respiro + `env(safe-area-inset-bottom)`.**
   No iPhone, o traço de home come ~34px que nenhuma medida em `px` prevê.
3. **O próprio elemento fixo também se ancora acima da safe-area**, a partir das
   mesmas variáveis — para as duas medidas nunca saírem de sincronia.

4. **A regra vale em TODA superfície, não só onde ela nasceu.** Ela foi escrita
   por causa do portal e, no mesmo dia, o painel da agência ainda tinha o defeito
   — porque ninguém foi conferir lá. Regra nova sem varredura das outras
   superfícies é regra pela metade.

Referências de implementação em `app/globals.css`: `.portal-shell`
(`--fab-inset` · `--fab-altura` · `--fab-respiro` · `--fab-safe`), aplicada em
`app/portal/layout.tsx`; `.agency-shell` (`--barra-altura` · `--barra-safe` ·
`--barra-respiro`), aplicada em `components/agency/layout/AgencyShell.tsx`; e o
trio `.acao-shell` / `.acao-reserva` / `.acao-barra` para barra de ação no rodapé.

**Como provar:** rolar até o fim e medir o retângulo — o elemento fixo não pode
cruzar nenhum elemento de conteúdo. Screenshot de página inteira **não** prova
isso: ele desenha o elemento fixo numa posição só. E rolagem tem que ser
instantânea (`behavior: "instant"`), porque o `scroll-behavior: smooth` do
`globals.css` faz a medição acontecer antes de a página chegar ao destino.

### 6.2 No topo de uma área rolável, elemento fixo é BARRA — nunca botão solto

Reservar padding protege a rolagem **zero**. Do primeiro pixel rolado em diante,
todo elemento fixo no topo passa por cima do conteúdo — e aí o que decide se
aquilo parece cabeçalho ou defeito é a **forma** do elemento:

- **Botão solto** (32×32 opaco, `top-3.5 left-4`) cobre um *pedaço* da linha.
  Sobra meia palavra: "Reconciliar telas dos carrosséis" lido como
  **"econciliar telas dos carrosséis"**. Medido a 375px: **138 recortes em 124
  linhas de texto, em 7 telas** do painel da agência.
- **Barra de largura total, opaca**, cobre a linha inteira. O olho lê
  "cabeçalho" — é o comportamento de Linear, Attio e Vercel no celular.

Portanto: no topo, barra de largura total com altura **reservada pelo layout** e
`env(safe-area-inset-top)` incluída. Botão flutuante solto só é aceitável **fora
da coluna de conteúdo** (canto inferior, sobre a margem) e ainda assim com o fim
do conteúdo reservado pela §6.1.

**Duas medidas, não uma impressão:**

| Métrica | O que é | Meta |
|---|---|---|
| **Recorte parcial** | linha de conteúdo cruzada por um fixo opaco que **não** cobre a largura visível dela | **0** |
| **Nunca limpo** | conteúdo sem nenhuma posição de rolagem em que esteja visível **e** livre do fixo | **0** |

Compare só a parte **visível** da linha: dentro de um container com `overflow-x`
o elemento continua além da borda da tela, e sem esse recorte uma barra de
largura total aparece como falso positivo.

**Altura de barra não se digita, se mede.** A altura depende do conteúdo (no
celular a barra de ação quebra em duas linhas; uma mensagem de erro acrescenta
uma terceira). Constante escrita à mão fica certa hoje e errada na primeira frase
nova. Use `useReservaDeBarra`
(`components/agency/layout/useReservaDeBarra.ts`), que escreve a altura real na
variável que o layout usa para reservar.

---

## 7. Estados obrigatórios

> **Toda tela que carrega ou depende de dados DEVE tratar os 3 estados abaixo.**
> Nada de tela que quebra, fica em branco ou "pula" quando não há dados.

### 7.1 Carregando (loading)
- Mostrar **skeleton** (esqueleto cinza no formato do conteúdo) ou spinner com rótulo.
- Estados de progresso longos precisam de `role="status"` + `aria-live="polite"`.
- Nunca deixe a tela em branco enquanto busca dados.

### 7.2 Lista vazia (empty state)
- Usar o componente `EmptyState` (`components/agency/ui/EmptyState.tsx`).
- Precisa de: ícone + título claro + descrição curta + **ação** ("Criar o primeiro…").
- Empty state explica *por que* está vazio e *o que fazer* — não é só "Nenhum item".

### 7.3 Erro
- Mensagem clara do que deu errado **e como resolver** (sem jargão, sem "Ops!").
- Botão de **tentar de novo** quando fizer sentido.
- Bloco de erro com `role="alert"` para leitores de tela.
- **IA em modo alternativo:** se uma geração por IA falhar e cair em conteúdo de
  fallback/regras, **avise o usuário** com um banner ("gerado em modo alternativo") —
  nunca faça passar por resultado real da IA.

### 7.4 O quarto estado: trabalho que existe e o destinatário não vê

Carregando, vazio e erro são os três clássicos. Numa ferramenta que produz para
**outra pessoa** existe um quarto, e ele é o mais caro porque é **silencioso**:
o item foi criado, salvo e agendado — e o destinatário não o enxerga.

No Planner, post criado para cliente direto nascia com visibilidade "interno"
(a API derivava do vínculo com a solicitação, que cliente direto não tem). A
agência programava o mês inteiro, ninguém via erro, e o cliente pagante abria o
portal vazio. **Estado vazio no portal do cliente não é detalhe de UI — é o
cliente achando que não recebeu nada.**

A regra, em três camadas — as três, não uma:

1. **Campo.** Quem decide quem vê é a interface, explicitamente. Derivar
   visibilidade de um efeito colateral é criar um estado que ninguém consegue
   corrigir pela tela.
2. **Sinal no item.** O item que o destinatário não vê tem marca própria na
   lista (no Planner: contorno tracejado no chip + "Só a equipe vê" na linha).
3. **Agregado + conserto.** No topo da tela, quantos itens estão nesse estado e
   **um botão que resolve** — não só o diagnóstico.

E a trava: fail-closed no servidor. "Compartilhado" sem destinatário nunca é
gravado; a API recusa com motivo em português em vez de gravar uma promessa que
ninguém recebe.

---

## 8. Acessibilidade (mínimos)

- Foco sempre visível (`:focus-visible` com contorno — já no `globals.css`).
- Navegação 100% por teclado (Tab, Enter, Esc).
- Contraste de texto AA (≥ 4.5:1). Atenção a texto cinza sobre navy.
- Landmarks semânticos: `<header>`, `<nav>`, `<main>`, `<aside>`.
- Imagens com `alt` descritivo; ícones decorativos com `aria-hidden`.

---

## 9. ⚠️ Inconsistências encontradas (dívida a corrigir)

Levantamento de auditoria (Julho/2026). Prioridade: **P0** crítico → **P3** baixo.

### P0 — Fundação
- **I-1 · Tokens existem mas quase não são usados.** ~6.800 cores hex "na mão"
  espalhadas em ~72 de 79 arquivos, repetindo valores que já têm token
  (`#9B9B95` 1.001×, `#070A1F` 590×…). **Ação:** migrar hex → tokens/utilitários.
  *(Agora existe a ponte `@theme` do shadcn no `globals.css` — usar `bg-primary`,
  `text-muted-foreground`, `border-border` etc. em vez de hex.)*
- **I-2 · Dark mode.** Não existia. **Base criada** com a instalação do shadcn
  (tokens `.dark` navy/cyan). Falta: ligar o toggle e revisar telas no escuro.

### P1 — Componentes e acessibilidade
- **I-3 · Primitivas ignoradas.** 356 `<button>` inline vs. 8 arquivos usando o `Button`;
  13 modais "na mão" vs. 4 usando `Modal`. `EmptyState` quase não é usado.
  **Ação:** rotear tudo pelos componentes compartilhados / shadcn.
- **I-4 · Inputs sem `<label>` associado.** 147 inputs, só 2 com `htmlFor`.
  Botões só-de-ícone sem `aria-label` (~28). **Ação:** associar labels e rótulos.
- **I-6 · Transparência da IA inconsistente.** Várias páginas caem em conteúdo mock
  silenciosamente (só `console.warn`); `pm-agent` tem UI de erro que nunca dispara.
  **Ação:** banner padrão de "modo alternativo".
- **I-7 · Grids sem breakpoint responsivo.** `grid-cols-4/5` fixos no dashboard,
  control-room, orchestrator e `BriefingRoomV2` estouram no celular.
  **Ação:** `grid-cols-1 md:grid-cols-...`.
- **I-8 · Rotas órfãs na navegação.** Control Room e Orchestrator não aparecem na sidebar.
- **I-9 · Drawer mobile sem acessibilidade.** Sem foco preso, sem ESC;
  links continuam no tab-order quando fechado. *(Parcial: o botão da barra do
  painel já tem `aria-expanded` + `aria-controls` desde 05/08/2026.)*

### P2 — Consistência
- **I-5 · Sem escala de tipografia.** 24 tamanhos de fonte diferentes (incl. `11.5px`,
  `9.5px`). **Ação:** adotar a escala da §3.
- **I-10 · Deriva de tokens.** Fundo de página usa `#F7F7F6` em vários lugares, mas o
  token `--bg` é `#F5F5F3`; insets de card variam entre `#FAFAF9/#FAFAFA/#F7F7F6`.
- **I-11 · Botão primário com cores diferentes por tela.** `#070A1F` na vitrine,
  `#1A1A1A` no briefing/portal, `#12B5AC` no chat. Padronizar em `--primary`.
- **I-12 · `<div onClick>` sem teclado** em headers expansíveis (cards Social/Analytics)
  e backdrops de modal.
- **I-13 · Largura da coluna de formulário varia** entre departamentos (360px vs 380px).
- **I-14 · Progresso de loading "falso"** (setTimeout) desacoplado da chamada real, sem `aria-live`.

### P3 — Conversão / polimento
- **I-15 · Vitrine sem prova social** (depoimentos, logos, portfólio) e sem CTA primário no hero.
- **I-16 · Briefing esconde o preço** atrás do login (estimativa nunca é mostrada antes do gate).
  → *maior alavanca de conversão: mostrar a faixa de preço antes de pedir e-mail.*
- **I-17 · ✅ Resolvida (04/08/2026).** O portal agora lê métricas REAIS da Meta
  (`ResultadosDoCliente` + `/api/portal/metricas`), com os 3 estados de conexão
  (sem rede / reconectar / medição parcial) e sem comparação inventada. A ficha do
  cliente na agência tem o espelho (`RedesDoCliente` + `/api/meta/insights`).
- **I-18 · Validações fracas** (e-mail com `includes("@")`), sem erro por campo.
- **I-19 · Página de sucesso** sem número de pedido/referência.

---

## 10. Fluxo de trabalho de design (resumo)

1. Ler este `DESIGN.md` antes de mexer em qualquer tela.
2. Usar tokens e componentes compartilhados (nunca hex/markup "na mão").
3. Tratar os 3 estados obrigatórios (§7).
4. Verificar em **3 tamanhos** (375px / tablet / desktop) com screenshot do Playwright.
5. Auto-avaliar (hierarquia, tipografia, espaçamento, consistência) — só apresentar com nota **8+**.

_(Regras 4 e 5 estão fixadas no `CLAUDE.md`.)_

---

_Última atualização: 2026-08-05 · mantenha este arquivo vivo._
