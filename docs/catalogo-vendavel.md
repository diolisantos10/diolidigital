# O catálogo vendável — o que a casa PODE vender hoje

> **Levantado do CÓDIGO em 16/08/2026, a pedido do CEO.** Ele pediu "os 24
> verdes" e não mandou a lista; ela não foi pedida a ele (3h da manhã, piloto em
> andamento). Então esta lista **não é a dele** — é o que o repositório consegue
> provar sozinho, para ele confirmar, corrigir ou riscar.
>
> ## 🔴 A REGRA QUE MANDOU NESTA LISTA
>
> **Verde é só o que foi PROVADO vendável pelo código.** Tudo que não deu para
> classificar está como **"não sei"**, nunca como verde. Verde otimista é o pior
> erro possível aqui: ele autoriza uma venda que a casa não entrega, e sem
> revisor humano ninguém pega antes do cliente.
>
> **O número honesto é 5, não 24.** Se os 24 existem, eles não estão provados no
> código — e a diferença entre os dois números é, ela mesma, o achado.

---

## ✅ VERDE — provado pelo código (5)

Critério, e ele é estreito: **preço declarado na fonte única** + **escopo
numerado que vai para contrato** + **exposição pública declarada** + **página de
venda que lê a fonte**.

| # | O quê | Preço | Piso | Onde o código prova |
|---|---|---|---|---|
| 1 | **Plano Pulso** | R$ 49/mês | ⚠️ **sem piso** | `lib/agency/planos.ts` · `/planos` |
| 2 | **Plano Ritmo** | R$ 297/mês | R$ 229 | `planos.ts` · `/planos` · `TABELA_DE_PISO` |
| 3 | **Plano Presença** | R$ 790/mês | R$ 690 | `planos.ts` · `/planos` · `TABELA_DE_PISO` |
| 4 | **Plano Conteúdo** | R$ 1.390/mês | R$ 1.190 | `planos.ts` · `/planos` · `TABELA_DE_PISO` |
| 5 | **Plano Crescimento** | R$ 2.590/mês | R$ 2.190 | `planos.ts` · `/planos` · `TABELA_DE_PISO` |

⚠️ **O Pulso é verde com uma ressalva que precisa ser dita:** ele é exibível e
contratável pelo site, mas **o SDR não consegue fechá-lo**, porque não existe
piso escrito. `podeFechar("pulso", 49)` devolve `false`. Não é bug introduzido
agora — é a lacuna ficando visível.

---

## 🔴 VERMELHO — precificado e proibido de vender (1)

| O quê | Preço | Por quê |
|---|---|---|
| **Plano Performance** | R$ 4.990/mês + mídia | Depende de operar Meta Ads todo dia dentro da conta do cliente, e a conta de anúncios da agência está **restrita desde 03/08/2026**. Além disso, escopo, implantação e piso nunca foram escritos. |

A trava é código: `exposicao: "interno"` em `planos.ts`, mais teste que reprova
qualquer superfície de cliente que importe `PLANOS` em vez de `PLANOS_PUBLICOS`.

---

## ❓ NÃO SEI — 15 itens na vitrine pública que o código não prova (nem desmente)

Estão em `lib/agency/self-serve-catalog.ts`, aparecem em `/vitrine`, têm preço e
botão de compra. **Não os marquei de verde**, e o motivo está escrito no
cabeçalho do próprio arquivo, por quem o escreveu:

> *"o pedido pago só vira `status: "in_progress"` no `ClientRequestDb`. **Nada
> aciona agente nem cria Deliverable** — é a quebra do pipeline registrada no
> `BACKLOG.md`. Enquanto isso não fechar, todo item de balcão vendido depende de
> alguém empurrar a produção à mão."*

**Vendável e entregável são duas perguntas, e só a primeira tem "sim" no código.**

| Item | Preço | Piso | Por que não é verde |
|---|---|---|---|
| Post para feed | R$ 79 | R$ 49 | entrega não automatizada |
| Carrossel até 5 telas | R$ 129 | R$ 79 | entrega não automatizada |
| 4 stories | R$ 99 | R$ 59 | entrega não automatizada |
| Legenda / copy avulsa | R$ 39 | R$ 29 | entrega não automatizada |
| Auditoria de perfil | R$ 149 | R$ 99 | entrega não automatizada |
| **Pacote mês — 8 peças** | R$ 297 | R$ 229 | 🔴 **é o plano Ritmo com outro nome** — ver achado 1 |
| Pack 4 Stories | R$ 150 | **nenhum** | sem piso: o SDR não pode negociar |
| Pack 8 Stories | R$ 270 | **nenhum** | sem piso |
| 4 Posts Feed | R$ 220 | **nenhum** | sem piso |
| 8 Posts Feed | R$ 400 | **nenhum** | sem piso |
| 1 Reel | R$ 350 | **nenhum** | sem piso · vídeo, que a tabela oficial manda orçar caso a caso |
| Pack 2 Reels | R$ 620 | **nenhum** | sem piso · idem |
| Banner Digital | R$ 120 | **nenhum** | sem piso |
| Identidade Básica | R$ 480 | **nenhum** | sem piso · marca é projeto, não item de vitrine |
| **Setup Meta Ads** | R$ 380 | **nenhum** | 🔴 **ver achado 2** |

E mais três, em `lib/agency/service-catalog.ts`, vendidos como faixa:

| Item | Faixa | Por que não é verde |
|---|---|---|
| Gestão de Tráfego Pago | R$ 500–1.200/mês | 🔴 ver achado 2 |
| Identidade Visual | R$ 1.200–2.500 | faixa, não preço; sem piso; não bate com `docs/precos.md` (R$ 2.900) |
| Rebranding Completo | R$ 2.000–4.000 | idem |

---

## 🔴 OS TRÊS ACHADOS QUE SAÍRAM DESTE LEVANTAMENTO

### 1. O plano Ritmo é vendido duas vezes, e a segunda é mais barata

`balcao-pacote-mes` ("Pacote mês — 8 peças", R$ 297) entrega **as mesmas 8 peças
por mês** do plano Ritmo, pelo **mesmo preço** — e **sem a implantação de R$ 390
e sem os 3 meses de permanência**, na vitrine pública.

Quem abrir as duas telas compra a segunda. A agência perde R$ 390 na entrada e o
compromisso de 3 meses, sem nunca ter decidido isso.

**A duplicata de NÚMERO foi eliminada** (os dois valores agora derivam de
`planos.ts`). **A sobreposição comercial não** — remover ou reposicionar uma
oferta é decisão de negócio. **Decisão do CEO.**

### 2. 🔴 Há oferta de Meta Ads à venda com a conta de anúncios restrita

Dois itens vendem exatamente o que a trava de 03/08/2026 diz que a casa não pode
entregar hoje:

- **`setup-meta-ads` — "Setup Meta Ads", R$ 380**, na vitrine **pública**;
- **"Gestão de Tráfego Pago", R$ 500–1.200/mês**, no catálogo de departamento.

É a confirmação da regra irmã que o despacho mandou conferir: **nada laranja,
vermelho ou horizonte é vendável — nem como bônus, beta ou cortesia.** O plano
Performance foi barrado por este exato motivo; **estes dois continuam à venda.**

**Não foram removidos, e isso é declarado:** tirar produto do ar é decisão do
CEO, e nenhuma escrita em Meta foi feita ou proposta aqui. Mas eles não podem
ficar verdes numa lista que o CEO vai usar para decidir.

### 3. Nove dos quinze itens da vitrine não têm piso

`pack-*`, `1-reel`, `banner-digital`, `identidade-basica`, `setup-meta-ads` não
têm `precoMinimo`. Como o portão de negociação é fail-closed, o SDR responde
"preciso confirmar" para todos eles. Isso está **certo** como comportamento e
**errado** como estado: são nove produtos anunciados que o comercial não sabe
negociar.

---

## O que este levantamento NÃO conseguiu classificar, e por quê

- **A escada de exposição por departamento** (`sombra` → `allowlist` → `wide`)
  mora no **banco** (`DepartmentLadder`), não no código. Daqui não dá para ler o
  degrau de produção de nenhum departamento — então **nenhum item ganhou verde
  por estar "liberado na escada"**.
- **As 62 funções da linha V2** nascem `ativaPorPadrao: false` e a execução exige
  flag ligada no banco. **Zero estão ativas por padrão.** Nenhuma foi contada.
- **`docs/precos.md`** lista ~20 serviços por preço (posicionamento R$ 3.900,
  plano de medição R$ 1.400, ficha do Google R$ 890…). **É documento, não
  código:** não há caminho de compra nem de entrega para nenhum deles no
  repositório. Por isso não entraram como verdes — entram na conversa com o CEO
  como "existe preço, falta produto".

---

*Levantado do código-fonte, não de memória. Se o CEO tiver a lista dos 24, a
divergência entre as duas é o mapa do que falta construir — ou do que está
sendo vendido sem existir.*
